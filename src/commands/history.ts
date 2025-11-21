import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../lib/output.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'
import { createSpinner } from '../lib/progress.ts'

/**
 * Simple .env reader
 */
async function readEnvFile(dir: string): Promise<Record<string, string>> {
	const envPath = resolve(dir, '.env')
	const content = await readFile(envPath, 'utf-8')
	const env: Record<string, string> = {}

	for (const line of content.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue

		const [key, ...valueParts] = trimmed.split('=')
		if (key && valueParts.length > 0) {
			let value = valueParts.join('=').trim()
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1)
			}
			env[key.trim()] = value
		}
	}

	return env
}

/**
 * Format status with color and icon
 */
function formatStatus(status: string): string {
	switch (status) {
		case 'init':
			return chalk.gray('🔄 init')
		case 'uploaded':
			return chalk.blue('📤 uploaded')
		case 'queued':
			return chalk.yellow('⏳ queued')
		case 'building':
			return chalk.yellow('🔨 building')
		case 'built':
		case 'completed':
			return chalk.green('✅ live')
		case 'deploying':
			return chalk.cyan('🚀 deploying')
		case 'failed':
			return chalk.red('❌ failed')
		default:
			return chalk.gray(`📦 ${status}`)
	}
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffMinutes = Math.floor(diffMs / (1000 * 60))
	const diffHours = Math.floor(diffMinutes / 60)
	const diffDays = Math.floor(diffHours / 24)

	if (diffMinutes < 1) {
		return chalk.green('just now')
	} else if (diffMinutes < 60) {
		return chalk.green(`${diffMinutes}m ago`)
	} else if (diffHours < 24) {
		return chalk.yellow(`${diffHours}h ago`)
	} else if (diffDays < 7) {
		return chalk.dim(`${diffDays}d ago`)
	} else {
		return chalk.dim(date.toLocaleDateString())
	}
}

/**
 * Display deployment history for the current app
 */
export async function historyCommand(
	path: string = '.',
	options: { limit?: number; all?: boolean } = {}
): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		// 1. Read .env
		const env = await readEnvFile(targetDir)
		const appId = env.NEXT_PUBLIC_WHOP_APP_ID

		if (!appId) {
			printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
			process.exit(1)
		}

		// 2. Get session
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)

		// 3. Fetch build history
		const spinner = createSpinner(`Fetching deployment history for ${appId}...`)
		spinner.start()

		const limit = options.limit || (options.all ? 100 : 10)
		const buildsResponse = await api.getBuilds(appId, limit)
		const builds = buildsResponse.builds || []

		spinner.succeed(`Found ${builds.length} deployments`)

		if (builds.length === 0) {
			console.log()
			printInfo('No deployments found for this app.')
			console.log(chalk.dim('Run `whopctl deploy` to create your first deployment.'))
			return
		}

		// 4. Display history
		console.log()
		console.log(chalk.bold('📚 Deployment History'))
		console.log(chalk.gray('─'.repeat(80)))
		console.log()

		// Table header
		console.log(
			chalk.bold(
				`${'Build ID'.padEnd(38)} ${'Status'.padEnd(15)} ${'Created'.padEnd(12)} ${'Duration'.padEnd(10)}`
			)
		)
		console.log(chalk.gray('─'.repeat(80)))

		for (const build of builds) {
			const buildId = build.build_id.substring(0, 8) + '...'
			const status = formatStatus(build.status)
			const created = formatRelativeTime(build.created_at)
			
			// Calculate duration
			const createdTime = new Date(build.created_at)
			const updatedTime = new Date(build.updated_at)
			const durationMs = updatedTime.getTime() - createdTime.getTime()
			const durationMinutes = Math.floor(durationMs / (1000 * 60))
			const duration = durationMinutes > 0 ? `${durationMinutes}m` : '<1m'

			console.log(
				`${chalk.cyan(buildId.padEnd(38))} ${status.padEnd(25)} ${created.padEnd(12)} ${chalk.dim(duration.padEnd(10))}`
			)

			// Show error message if failed
			if (build.status === 'failed' && build.error_message) {
				console.log(chalk.red(`  ↳ ${build.error_message.substring(0, 60)}...`))
			}
		}

		console.log()

		// Show current deployment info
		const currentBuild = builds[0]
		if (currentBuild && (currentBuild.status === 'built' || currentBuild.status === 'completed')) {
			const appUrl = `https://${currentBuild.app.subdomain}.whopship.app`
			console.log(chalk.bold.green('🚀 Current Deployment:'))
			console.log(`   ${chalk.cyan(appUrl)}`)
			console.log(`   Build: ${chalk.dim(currentBuild.build_id)}`)
			console.log()
		}

		// Show helpful commands
		console.log(chalk.bold('Quick Actions:'))
		console.log(`  ${chalk.blue('•')} View details: ${chalk.dim('whopctl status')}`)
		console.log(`  ${chalk.blue('•')} View logs: ${chalk.dim('whopctl status --logs')}`)
		console.log(`  ${chalk.blue('•')} Redeploy latest: ${chalk.dim(`whopctl redeploy ${builds[0]?.build_id}`)}`)
		console.log(`  ${chalk.blue('•')} New deployment: ${chalk.dim('whopctl deploy')}`)
		console.log()

		if (!options.all && builds.length >= 10) {
			console.log(chalk.dim('💡 Use --all to see complete history'))
		}

	} catch (error) {
		printError(`Failed to get deployment history: ${error}`)
		process.exit(1)
	}
}
