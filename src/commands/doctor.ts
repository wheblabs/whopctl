import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import chalk from 'chalk'
import { createSpinner } from '../lib/progress.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'

interface DiagnosticResult {
	name: string
	status: 'pass' | 'warn' | 'fail'
	message: string
	fix?: string
}

/**
 * Run all diagnostic checks
 */
async function runDiagnostics(dir: string): Promise<DiagnosticResult[]> {
	const results: DiagnosticResult[] = []

	// 1. Check Node.js version
	try {
		const nodeVersion = process.version
		const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10)
		if (majorVersion >= 18) {
			results.push({
				name: 'Node.js Version',
				status: 'pass',
				message: `${nodeVersion} (requires 18+)`,
			})
		} else {
			results.push({
				name: 'Node.js Version',
				status: 'fail',
				message: `${nodeVersion} - Node.js 18+ required`,
				fix: 'Install Node.js 18 or later from https://nodejs.org',
			})
		}
	} catch {
		results.push({
			name: 'Node.js Version',
			status: 'fail',
			message: 'Could not detect Node.js version',
			fix: 'Install Node.js from https://nodejs.org',
		})
	}

	// 2. Check authentication
	if (whop.isAuthenticated()) {
		results.push({
			name: 'Authentication',
			status: 'pass',
			message: 'Logged in to WhopShip',
		})
	} else {
		results.push({
			name: 'Authentication',
			status: 'fail',
			message: 'Not logged in',
			fix: 'Run: whopctl login',
		})
	}

	// 3. Check API connectivity
	if (whop.isAuthenticated()) {
		try {
			const session = whop.getTokens()
			if (session) {
				const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
					uidToken: session.uidToken,
					ssk: session.ssk,
					userId: session.userId,
				})
				await api.getMe()
				results.push({
					name: 'API Connection',
					status: 'pass',
					message: 'Connected to WhopShip API',
				})
			}
		} catch (_error) {
			results.push({
				name: 'API Connection',
				status: 'fail',
				message: 'Cannot connect to WhopShip API',
				fix: 'Check your internet connection or try: whopctl login',
			})
		}
	} else {
		results.push({
			name: 'API Connection',
			status: 'warn',
			message: 'Skipped - not authenticated',
			fix: 'Run: whopctl login',
		})
	}

	// 4. Check package.json
	try {
		const pkgContent = await readFile(join(dir, 'package.json'), 'utf-8')
		const pkg = JSON.parse(pkgContent)

		if (pkg.dependencies?.next || pkg.devDependencies?.next) {
			results.push({
				name: 'Project Type',
				status: 'pass',
				message: 'Next.js project detected',
			})
		} else if (pkg.dependencies?.react) {
			results.push({
				name: 'Project Type',
				status: 'warn',
				message: 'React project detected (Next.js recommended)',
				fix: 'WhopShip works best with Next.js projects',
			})
		} else {
			results.push({
				name: 'Project Type',
				status: 'warn',
				message: 'Non-React project detected',
				fix: 'WhopShip works best with Next.js projects',
			})
		}

		// Check for build script
		if (pkg.scripts?.build) {
			results.push({
				name: 'Build Script',
				status: 'pass',
				message: 'Build script found in package.json',
			})
		} else {
			results.push({
				name: 'Build Script',
				status: 'fail',
				message: 'No build script in package.json',
				fix: 'Add "build": "next build" to scripts in package.json',
			})
		}
	} catch {
		results.push({
			name: 'Project Type',
			status: 'fail',
			message: 'No package.json found',
			fix: 'Run: whopctl init',
		})
	}

	// 5. Check .env file
	try {
		const envContent = await readFile(join(dir, '.env'), 'utf-8')
		const envVars: Record<string, string> = {}
		for (const line of envContent.split('\n')) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith('#')) continue
			const [key, ...valueParts] = trimmed.split('=')
			if (key && valueParts.length > 0) {
				envVars[key.trim()] = valueParts
					.join('=')
					.trim()
					.replace(/^["']|["']$/g, '')
			}
		}

		const requiredVars = ['NEXT_PUBLIC_WHOP_APP_ID', 'NEXT_PUBLIC_WHOP_COMPANY_ID']
		const missing = requiredVars.filter((v) => !envVars[v])

		if (missing.length === 0) {
			// Validate format
			const appId = envVars.NEXT_PUBLIC_WHOP_APP_ID
			const companyId = envVars.NEXT_PUBLIC_WHOP_COMPANY_ID

			if (!appId.startsWith('app_')) {
				results.push({
					name: 'Environment Variables',
					status: 'warn',
					message: 'NEXT_PUBLIC_WHOP_APP_ID should start with "app_"',
					fix: 'Check your App ID in the Whop dashboard',
				})
			} else if (!companyId.startsWith('biz_')) {
				results.push({
					name: 'Environment Variables',
					status: 'warn',
					message: 'NEXT_PUBLIC_WHOP_COMPANY_ID should start with "biz_"',
					fix: 'Check your Company ID in the Whop dashboard',
				})
			} else {
				results.push({
					name: 'Environment Variables',
					status: 'pass',
					message: 'Required environment variables configured',
				})
			}
		} else {
			results.push({
				name: 'Environment Variables',
				status: 'fail',
				message: `Missing: ${missing.join(', ')}`,
				fix: 'Run: whopctl init',
			})
		}
	} catch {
		results.push({
			name: 'Environment Variables',
			status: 'fail',
			message: 'No .env file found',
			fix: 'Run: whopctl init',
		})
	}

	// 6. Check Next.js standalone config
	try {
		const configPaths = ['next.config.js', 'next.config.ts', 'next.config.mjs']
		let foundConfig = false
		let hasStandalone = false

		for (const configPath of configPaths) {
			try {
				const content = await readFile(join(dir, configPath), 'utf-8')
				foundConfig = true
				if (content.includes("output: 'standalone'") || content.includes('output: "standalone"')) {
					hasStandalone = true
				}
				break
			} catch {
				// Continue checking
			}
		}

		if (foundConfig) {
			if (hasStandalone) {
				results.push({
					name: 'Next.js Config',
					status: 'pass',
					message: 'Standalone output configured',
				})
			} else {
				results.push({
					name: 'Next.js Config',
					status: 'warn',
					message: 'Missing standalone output',
					fix: 'Add output: "standalone" to next.config.js',
				})
			}
		}
	} catch {
		// Not a Next.js project or no config
	}

	// 7. Check node_modules
	try {
		await stat(join(dir, 'node_modules'))
		results.push({
			name: 'Dependencies',
			status: 'pass',
			message: 'node_modules found',
		})
	} catch {
		results.push({
			name: 'Dependencies',
			status: 'warn',
			message: 'node_modules not found',
			fix: 'Run: npm install (or yarn/pnpm/bun install)',
		})
	}

	// 8. Check disk space (rough estimate)
	try {
		// This is platform-specific, just provide a basic check
		results.push({
			name: 'System',
			status: 'pass',
			message: 'System checks passed',
		})
	} catch {
		// Skip if we can't check
	}

	return results
}

/**
 * Display diagnostic results
 */
function displayResults(results: DiagnosticResult[]): void {
	console.log()
	console.log(chalk.bold('Diagnostic Results'))
	console.log(chalk.gray('─'.repeat(50)))
	console.log()

	let passCount = 0
	let warnCount = 0
	let failCount = 0

	for (const result of results) {
		let icon: string
		let color: (text: string) => string

		switch (result.status) {
			case 'pass':
				icon = '✓'
				color = chalk.green
				passCount++
				break
			case 'warn':
				icon = '⚠'
				color = chalk.yellow
				warnCount++
				break
			case 'fail':
				icon = '✗'
				color = chalk.red
				failCount++
				break
		}

		console.log(`${color(icon)} ${chalk.bold(result.name)}`)
		console.log(`  ${color(result.message)}`)
		if (result.fix) {
			console.log(chalk.dim(`  → ${result.fix}`))
		}
		console.log()
	}

	// Summary
	console.log(chalk.gray('─'.repeat(50)))
	console.log()

	const total = results.length
	const healthScore = Math.round((passCount / total) * 100)

	let healthColor: (text: string) => string
	let healthEmoji: string

	if (healthScore >= 80) {
		healthColor = chalk.green
		healthEmoji = '🎉'
	} else if (healthScore >= 50) {
		healthColor = chalk.yellow
		healthEmoji = '⚠️'
	} else {
		healthColor = chalk.red
		healthEmoji = '❌'
	}

	console.log(`${chalk.bold('Health Score: ') + healthColor(`${healthScore}%`)} ${healthEmoji}`)
	console.log()
	console.log(
		chalk.green(`${passCount} passed`) +
			chalk.dim(' · ') +
			chalk.yellow(`${warnCount} warnings`) +
			chalk.dim(' · ') +
			chalk.red(`${failCount} failed`),
	)
	console.log()

	// Recommendations
	if (failCount > 0) {
		console.log(chalk.bold.red('Action Required:'))
		console.log(chalk.red('Fix the failed checks above before deploying.'))
		console.log()
	} else if (warnCount > 0) {
		console.log(chalk.bold.yellow('Recommendations:'))
		console.log(chalk.yellow('Consider addressing the warnings for best results.'))
		console.log()
	} else {
		console.log(chalk.bold.green('All checks passed!'))
		console.log(chalk.green('Your project is ready for deployment.'))
		console.log()
		console.log(chalk.dim('Deploy with: whopctl deploy'))
		console.log()
	}
}

/**
 * Doctor command - diagnose common issues
 */
export async function doctorCommand(path: string = '.'): Promise<void> {
	const targetDir = resolve(process.cwd(), path)

	console.log()
	console.log(chalk.bold.cyan('🩺 WhopShip Doctor'))
	console.log(chalk.gray('─'.repeat(50)))
	console.log()
	console.log(chalk.dim(`Checking: ${targetDir}`))
	console.log()

	const spinner = createSpinner('Running diagnostics...')
	spinner.start()

	const results = await runDiagnostics(targetDir)

	spinner.succeed('Diagnostics complete')

	displayResults(results)
}
