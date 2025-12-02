import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import chalk from 'chalk'
import { printError, printInfo, printSuccess, printWarning } from '../lib/output.ts'
import { createSpinner } from '../lib/progress.ts'
import { promptUser } from '../lib/repl-prompt.ts'
import { sessionPath, whop } from '../lib/whop.ts'

interface ProjectInfo {
	hasPackageJson: boolean
	hasEnvFile: boolean
	hasNextConfig: boolean
	projectType: 'nextjs' | 'react' | 'node' | 'empty' | 'unknown'
	packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'
	appId?: string
	companyId?: string
	missingEnvVars: string[]
}

/**
 * Detect project information from the current directory
 */
async function detectProject(dir: string): Promise<ProjectInfo> {
	const info: ProjectInfo = {
		hasPackageJson: false,
		hasEnvFile: false,
		hasNextConfig: false,
		projectType: 'empty',
		packageManager: 'npm',
		missingEnvVars: [],
	}

	// Check for package.json
	try {
		const pkgContent = await readFile(join(dir, 'package.json'), 'utf-8')
		info.hasPackageJson = true
		const pkg = JSON.parse(pkgContent)

		// Detect project type
		if (pkg.dependencies?.next || pkg.devDependencies?.next) {
			info.projectType = 'nextjs'
		} else if (pkg.dependencies?.react || pkg.devDependencies?.react) {
			info.projectType = 'react'
		} else {
			info.projectType = 'node'
		}
	} catch {
		info.projectType = 'empty'
	}

	// Detect package manager
	try {
		await stat(join(dir, 'bun.lockb'))
		info.packageManager = 'bun'
	} catch {
		try {
			await stat(join(dir, 'pnpm-lock.yaml'))
			info.packageManager = 'pnpm'
		} catch {
			try {
				await stat(join(dir, 'yarn.lock'))
				info.packageManager = 'yarn'
			} catch {
				info.packageManager = 'npm'
			}
		}
	}

	// Check for .env file and parse it
	try {
		const envContent = await readFile(join(dir, '.env'), 'utf-8')
		info.hasEnvFile = true

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

		info.appId = envVars.NEXT_PUBLIC_WHOP_APP_ID
		info.companyId = envVars.NEXT_PUBLIC_WHOP_COMPANY_ID

		// Check for missing required vars
		const requiredVars = ['NEXT_PUBLIC_WHOP_APP_ID', 'NEXT_PUBLIC_WHOP_COMPANY_ID']
		info.missingEnvVars = requiredVars.filter((v) => !envVars[v])
	} catch {
		info.hasEnvFile = false
		info.missingEnvVars = ['NEXT_PUBLIC_WHOP_APP_ID', 'NEXT_PUBLIC_WHOP_COMPANY_ID']
	}

	// Check for next.config
	const configPaths = ['next.config.js', 'next.config.ts', 'next.config.mjs']
	for (const configPath of configPaths) {
		try {
			await stat(join(dir, configPath))
			info.hasNextConfig = true
			break
		} catch {
			// Continue checking
		}
	}

	return info
}

/**
 * Check if next.config has standalone output
 */
async function hasStandaloneOutput(dir: string): Promise<boolean> {
	const configPaths = ['next.config.js', 'next.config.ts', 'next.config.mjs']
	for (const configPath of configPaths) {
		try {
			const content = await readFile(join(dir, configPath), 'utf-8')
			if (content.includes("output: 'standalone'") || content.includes('output: "standalone"')) {
				return true
			}
		} catch {
			// Continue checking
		}
	}
	return false
}

/**
 * Add standalone output to next.config
 */
async function addStandaloneOutput(dir: string): Promise<boolean> {
	const configPaths = [
		{ path: 'next.config.js', ext: 'js' },
		{ path: 'next.config.ts', ext: 'ts' },
		{ path: 'next.config.mjs', ext: 'mjs' },
	]

	for (const { path: configPath } of configPaths) {
		try {
			let content = await readFile(join(dir, configPath), 'utf-8')

			// Add output: 'standalone' to the config
			if (content.includes('const nextConfig')) {
				content = content.replace(
					/const nextConfig\s*=\s*{/,
					"const nextConfig = {\n  output: 'standalone',",
				)
				await writeFile(join(dir, configPath), content)
				return true
			}
		} catch {
			// Continue to next file
		}
	}
	return false
}

/**
 * Create or update .env file
 */
async function createOrUpdateEnvFile(dir: string, vars: Record<string, string>): Promise<void> {
	const envPath = join(dir, '.env')
	let existingContent = ''

	try {
		existingContent = await readFile(envPath, 'utf-8')
	} catch {
		// File doesn't exist, that's fine
	}

	// Parse existing vars
	const existingVars: Record<string, string> = {}
	for (const line of existingContent.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const [key, ...valueParts] = trimmed.split('=')
		if (key && valueParts.length > 0) {
			existingVars[key.trim()] = valueParts.join('=').trim()
		}
	}

	// Merge with new vars
	const mergedVars = { ...existingVars, ...vars }

	// Generate new content
	let newContent = '# WhopShip Configuration\n'
	newContent += '# Generated by whopctl init\n\n'

	// Add Whop-specific vars first
	const whopVars = ['NEXT_PUBLIC_WHOP_APP_ID', 'NEXT_PUBLIC_WHOP_COMPANY_ID']
	for (const key of whopVars) {
		if (mergedVars[key]) {
			newContent += `${key}=${mergedVars[key]}\n`
			delete mergedVars[key]
		}
	}

	// Add remaining vars
	if (Object.keys(mergedVars).length > 0) {
		newContent += '\n# Other environment variables\n'
		for (const [key, value] of Object.entries(mergedVars)) {
			newContent += `${key}=${value}\n`
		}
	}

	await writeFile(envPath, newContent)
}

/**
 * Run a command and return success status
 */
async function runCommand(cmd: string, args: string[], cwd: string): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { cwd, stdio: 'pipe' })
		child.on('close', (code) => resolve(code === 0))
		child.on('error', () => resolve(false))
	})
}

/**
 * Interactive init wizard
 */
export async function initCommand(path: string = '.'): Promise<void> {
	const targetDir = resolve(process.cwd(), path)
	const _projectName = basename(targetDir)

	console.log()
	console.log(chalk.bold.cyan('🚀 WhopShip Project Setup'))
	console.log(chalk.gray('─'.repeat(50)))
	console.log()
	console.log(chalk.dim(`Setting up: ${targetDir}`))
	console.log()

	// Step 1: Detect project
	const spinner = createSpinner('Analyzing your project...')
	spinner.start()
	const projectInfo = await detectProject(targetDir)
	spinner.succeed('Project analyzed')

	// Show what we found
	console.log()
	console.log(chalk.bold('📋 What we found:'))
	if (projectInfo.hasPackageJson) {
		console.log(
			chalk.green(
				`  ✓ ${projectInfo.projectType === 'nextjs' ? 'Next.js' : projectInfo.projectType} project detected`,
			),
		)
		console.log(chalk.dim(`    Package manager: ${projectInfo.packageManager}`))
	} else {
		console.log(chalk.yellow('  ○ No package.json found'))
	}

	if (projectInfo.hasEnvFile) {
		if (projectInfo.missingEnvVars.length === 0) {
			console.log(chalk.green('  ✓ .env file configured'))
		} else {
			console.log(chalk.yellow(`  ⚠ .env file missing: ${projectInfo.missingEnvVars.join(', ')}`))
		}
	} else {
		console.log(chalk.yellow('  ○ No .env file found'))
	}

	if (projectInfo.projectType === 'nextjs') {
		const hasStandalone = await hasStandaloneOutput(targetDir)
		if (hasStandalone) {
			console.log(chalk.green('  ✓ Next.js configured for standalone output'))
		} else {
			console.log(chalk.yellow('  ○ Next.js needs standalone output configuration'))
		}
	}

	console.log()

	// Step 2: Check authentication
	if (!whop.isAuthenticated()) {
		console.log(chalk.bold('🔐 Authentication Required'))
		console.log(chalk.dim('You need to log in to WhopShip to continue.'))
		console.log()

		const shouldLogin = await promptUser('Would you like to log in now? (Y/n) ')
		if (shouldLogin.toLowerCase() !== 'n') {
			// Inline login flow
			const email = await promptUser('Enter your email: ')
			if (!email || !email.includes('@')) {
				printError('Invalid email address')
				return
			}

			printInfo('Sending verification code to your email...')

			try {
				const ticket = await whop.auth.sendOTP(email)
				printSuccess('Code sent! Check your email.')

				const code = await promptUser('Enter the verification code: ')
				if (!code || code.length < 4) {
					printError('Invalid code')
					return
				}

				printInfo('Verifying...')
				await whop.auth.verify({ code, ticket, persist: sessionPath })
				printSuccess('Successfully logged in!')
				console.log()
			} catch (error) {
				printError(`Login failed: ${error}`)
				console.log()
				printInfo('You can try again later with: whopctl login')
				return
			}
		} else {
			printInfo('Run "whopctl login" when you\'re ready to authenticate.')
			return
		}
	} else {
		console.log(chalk.green('✓ Already logged in to WhopShip'))
		console.log()
	}

	// Step 3: Configure Whop App ID and Company ID
	let appId = projectInfo.appId
	let companyId = projectInfo.companyId

	if (!appId || !companyId) {
		console.log(chalk.bold('📱 Connect Your Whop App'))
		console.log()
		console.log(chalk.dim('You can find these values in your Whop dashboard:'))
		console.log(chalk.dim('  1. Go to https://whop.com/apps'))
		console.log(chalk.dim('  2. Select your app'))
		console.log(chalk.dim('  3. Find the App ID (starts with app_)'))
		console.log(chalk.dim('  4. Find the Company ID (starts with biz_)'))
		console.log()

		if (!appId) {
			appId = await promptUser('Enter your Whop App ID (app_xxx): ')
			if (!appId) {
				printError('App ID is required')
				return
			}
			if (!appId.startsWith('app_')) {
				printWarning('App ID should start with "app_" - make sure this is correct')
			}
		} else {
			console.log(chalk.dim(`  App ID: ${appId} (from .env)`))
		}

		if (!companyId) {
			companyId = await promptUser('Enter your Company ID (biz_xxx): ')
			if (!companyId) {
				printError('Company ID is required')
				return
			}
			if (!companyId.startsWith('biz_')) {
				printWarning('Company ID should start with "biz_" - make sure this is correct')
			}
		} else {
			console.log(chalk.dim(`  Company ID: ${companyId} (from .env)`))
		}

		console.log()
	}

	// Step 4: Create/update .env file
	const envSpinner = createSpinner('Configuring environment...')
	envSpinner.start()

	await createOrUpdateEnvFile(targetDir, {
		NEXT_PUBLIC_WHOP_APP_ID: appId!,
		NEXT_PUBLIC_WHOP_COMPANY_ID: companyId!,
	})

	envSpinner.succeed('.env file configured')

	// Step 5: Configure Next.js for standalone output (if applicable)
	if (projectInfo.projectType === 'nextjs') {
		const hasStandalone = await hasStandaloneOutput(targetDir)
		if (!hasStandalone) {
			const configSpinner = createSpinner('Configuring Next.js for deployment...')
			configSpinner.start()

			const success = await addStandaloneOutput(targetDir)
			if (success) {
				configSpinner.succeed('Next.js configured for standalone output')
			} else {
				configSpinner.warn('Could not auto-configure Next.js')
				console.log(
					chalk.yellow('  Please add `output: "standalone"` to your next.config.js manually'),
				)
			}
		}
	}

	// Step 6: Check for node_modules
	try {
		await stat(join(targetDir, 'node_modules'))
	} catch {
		console.log()
		const shouldInstall = await promptUser('Install dependencies? (Y/n) ')
		if (shouldInstall.toLowerCase() !== 'n') {
			const installSpinner = createSpinner(
				`Installing dependencies with ${projectInfo.packageManager}...`,
			)
			installSpinner.start()

			const success = await runCommand(projectInfo.packageManager, ['install'], targetDir)
			if (success) {
				installSpinner.succeed('Dependencies installed')
			} else {
				installSpinner.fail('Failed to install dependencies')
				console.log(chalk.dim(`  Try running: ${projectInfo.packageManager} install`))
			}
		}
	}

	// Success! Show next steps
	console.log()
	console.log(chalk.bold.green('✅ Project configured successfully!'))
	console.log()
	console.log(chalk.bold("🎯 What's Next:"))
	console.log()
	console.log(chalk.cyan('  1. Test your app locally:'))
	console.log(chalk.dim(`     ${projectInfo.packageManager} run dev`))
	console.log()
	console.log(chalk.cyan('  2. Deploy to WhopShip:'))
	console.log(chalk.dim('     whopctl deploy'))
	console.log()
	console.log(chalk.cyan('  3. Check deployment status:'))
	console.log(chalk.dim('     whopctl status'))
	console.log()
	console.log(chalk.dim('─'.repeat(50)))
	console.log(chalk.dim('Need help? Run: whopctl doctor'))
	console.log(chalk.dim('View docs: whopctl docs'))
	console.log()
}
