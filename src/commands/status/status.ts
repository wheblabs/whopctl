import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printWarning } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'
import { createSpinner } from '../../lib/progress.ts'
import { aliasManager } from '../../lib/alias-manager.ts'

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
 * Format status with color and badges
 */
function formatStatus(status: string): string {
	switch (status) {
		case 'init':
			return chalk.bgGray.white(' INIT ') + chalk.gray(' initializing')
		case 'uploaded':
			return chalk.bgBlue.white(' UPLOADED ') + chalk.blue(' source ready')
		case 'queued':
			return chalk.bgYellow.black(' QUEUED ') + chalk.yellow(' waiting in queue')
		case 'building':
			return chalk.bgYellow.black(' BUILDING ') + chalk.yellow(' in progress')
		case 'built':
		case 'completed':
			return chalk.bgGreen.black(' LIVE ') + chalk.green(' deployment ready')
		case 'deploying':
			return chalk.bgCyan.black(' DEPLOYING ') + chalk.cyan(' going live')
		case 'failed':
			return chalk.bgRed.white(' FAILED ') + chalk.red(' build error')
		default:
			return chalk.bgGray.white(` ${status.toUpperCase()} `)
	}
}

/**
 * Get status icon
 */
function getStatusIcon(status: string): string {
	switch (status) {
		case 'init':
			return '🔄'
		case 'uploaded':
			return '📤'
		case 'queued':
			return '⏳'
		case 'building':
			return '🔨'
		case 'built':
		case 'completed':
			return '✅'
		case 'deploying':
			return '🚀'
		case 'failed':
			return '❌'
		default:
			return '📦'
	}
}

/**
 * Get estimated completion time
 */
function getEstimatedTime(status: string, createdAt: string): string {
	const created = new Date(createdAt)
	const now = new Date()
	const elapsed = now.getTime() - created.getTime()
	const elapsedMinutes = Math.floor(elapsed / (1000 * 60))

	switch (status) {
		case 'queued':
			return 'Usually starts within 2-5 minutes'
		case 'building':
			const avgBuildTime = 8 // minutes
			const remaining = Math.max(0, avgBuildTime - elapsedMinutes)
			return remaining > 0 ? `~${remaining} minutes remaining` : 'Should complete soon'
		case 'deploying':
			return 'Usually completes within 1-2 minutes'
		case 'built':
		case 'completed':
			return `Completed in ${elapsedMinutes} minutes`
		case 'failed':
			return `Failed after ${elapsedMinutes} minutes`
		default:
			return ''
	}
}

/**
 * Format log line with colors
 */
function formatLogLine(line: string): string {
	// Check for common log patterns and colorize
	const lowerLine = line.toLowerCase()

	if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('✗')) {
		return chalk.red(line)
	}
	if (lowerLine.includes('warning') || lowerLine.includes('warn') || lowerLine.includes('⚠')) {
		return chalk.yellow(line)
	}
	if (lowerLine.includes('success') || lowerLine.includes('complete') || lowerLine.includes('✓')) {
		return chalk.green(line)
	}
	if (lowerLine.includes('info') || lowerLine.includes('ℹ')) {
		return chalk.blue(line)
	}

	return line
}

/**
 * Display build logs
 */
async function displayLogs(
	api: WhopshipAPI,
	buildId: string,
	options: { lines: number; follow: boolean },
): Promise<void> {
	let lastLogCount = 0

	const fetchAndDisplayLogs = async (): Promise<{ logs: string[]; status: string }> => {
		try {
			const logsResponse = (await api.getBuildLogs(buildId)) as {
				logs: string[]
				status: string
			}

			if (logsResponse.logs && logsResponse.logs.length > 0) {
				// Show only new logs if following
				const logsToShow = options.follow
					? logsResponse.logs.slice(lastLogCount)
					: logsResponse.logs.slice(-options.lines)

				for (const log of logsToShow) {
					console.log(formatLogLine(log))
				}

				lastLogCount = logsResponse.logs.length
			}

			return { logs: logsResponse.logs || [], status: logsResponse.status }
		} catch (error: any) {
			if (error.message?.includes('404') || error.message?.includes('not found')) {
				return { logs: [], status: 'unknown' }
			}
			throw error
		}
	}

	// Initial fetch
	const initialResult = await fetchAndDisplayLogs()

	if (initialResult.logs.length === 0 && !options.follow) {
		printInfo('No logs available yet. Build may still be in queue.')
		return
	}

	// Follow mode: poll for updates
	if (options.follow) {
		const activeStatuses = ['init', 'uploading', 'uploaded', 'queued', 'building']

		if (!activeStatuses.includes(initialResult.status)) {
			// Build is complete, no need to follow
			return
		}

		console.log()
		printInfo('Following logs... (Press Ctrl+C to stop)')
		console.log()

		// Handle Ctrl+C gracefully
		let interrupted = false
		const interruptHandler = () => {
			interrupted = true
			console.log()
			printInfo('Stopped following logs.')
			process.exit(0)
		}
		process.on('SIGINT', interruptHandler)

		try {
			while (!interrupted) {
				await new Promise((resolve) => setTimeout(resolve, 2500)) // Poll every 2.5 seconds

				const result = await fetchAndDisplayLogs()

				// Exit if build is complete
				if (!activeStatuses.includes(result.status)) {
					console.log()
					printInfo(`Build status changed to ${result.status}. Stopping follow mode.`)
					break
				}
			}
		} finally {
			process.removeListener('SIGINT', interruptHandler)
		}
	}
}

/**
 * Check deployment status for the current app
 */
export async function statusCommand(
	path: string = '.',
	options: { showLogs?: boolean; follow?: boolean; lines?: number; project?: string } = {},
): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		// 1. Resolve project identifier
		let appId: string

		if (options.project) {
			// Use provided project identifier
			try {
				const { appId: resolvedAppId } = await aliasManager.resolveProjectId(options.project)
				appId = resolvedAppId
			} catch (error) {
				printError(`Failed to resolve project: ${error}`)
				process.exit(1)
			}
		} else {
			// Read from .env
			const env = await readEnvFile(targetDir)
			const envAppId = env.NEXT_PUBLIC_WHOP_APP_ID

			if (!envAppId) {
				printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
				console.log()
				console.log(chalk.dim('💡 You can also specify a project:'))
				console.log(chalk.dim('   whopctl status --project my-app'))
				console.log(chalk.dim('   whopctl status --project app_abc123'))
				process.exit(1)
			}

			appId = envAppId
		}

		// 2. Get session
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

	const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
		uidToken: session.uidToken,
		ssk: session.ssk,
		userId: session.userId,
	})

		// 3. Fetch latest build
		const spinner = createSpinner(`Fetching latest build for app ${appId}...`)
		spinner.start()
		
		const build = await api.getLatestBuildForApp(appId)
		spinner.succeed('Build information retrieved')

		// 4. Display enhanced status
		console.log()
		console.log(chalk.bold(`${getStatusIcon(build.status)} Build Status`))
		console.log(chalk.gray('─'.repeat(60)))
		console.log()
		console.log(chalk.bold('App Details:'))
		console.log(`  ${chalk.cyan('Name:')}        ${chalk.bold(build.app.whop_app_name)}`)
		console.log(`  ${chalk.cyan('App ID:')}      ${build.app.whop_app_id}`)
		console.log(`  ${chalk.cyan('Subdomain:')}   ${build.app.subdomain}`)
		console.log()
		console.log(chalk.bold('Build Information:'))
		console.log(`  ${chalk.cyan('Build ID:')}    ${build.build_id}`)
		console.log(`  ${chalk.cyan('Status:')}      ${formatStatus(build.status)}`)
		console.log(`  ${chalk.cyan('Created:')}     ${new Date(build.created_at).toLocaleString()}`)
		console.log(`  ${chalk.cyan('Updated:')}     ${new Date(build.updated_at).toLocaleString()}`)
		
		const estimatedTime = getEstimatedTime(build.status, build.created_at)
		if (estimatedTime) {
			console.log(`  ${chalk.cyan('Timeline:')}    ${chalk.dim(estimatedTime)}`)
		}
		console.log()

		// Show deployment URLs if built
		if (build.status === 'built' || build.status === 'completed') {
			const normalizedSubdomain = build.app.subdomain.toLowerCase()
			const appUrl = `https://${normalizedSubdomain}.whopship.app`

			console.log(chalk.bold.green('🚀 Your App is Live!'))
			console.log(chalk.gray('─'.repeat(60)))
			console.log()
			console.log(`${chalk.bold.cyan('Production URL:')} ${chalk.underline.cyan(appUrl)}`)
			console.log(`${chalk.bold.cyan('Short URL:')}     ${chalk.underline.cyan(`https://app-${build.app.id}.whopship.app`)}`)
			console.log()
			console.log(chalk.bold('Next Steps:'))
			console.log(`  ${chalk.green('1.')} Configure your app settings:`)
			console.log(`     ${chalk.dim(`https://whop.com/apps/${build.app.whop_app_id}/settings`)}`)
			console.log(`  ${chalk.green('2.')} Set your App URL to: ${chalk.cyan(appUrl)}`)
			console.log(`  ${chalk.green('3.')} Install and test in your company`)
			console.log()
			console.log(chalk.bold('Monitoring:'))
			console.log(`  ${chalk.yellow('•')} View runtime logs: ${chalk.dim(`whopctl logs ${build.app.whop_app_id}`)}`)
			console.log(`  ${chalk.yellow('•')} Check usage: ${chalk.dim('whopctl usage')}`)
			console.log(`  ${chalk.yellow('•')} Redeploy: ${chalk.dim(`whopctl redeploy ${build.build_id}`)}`)
			console.log()
		}

		// Show contextual actions based on status
		if (build.status === 'building' || build.status === 'queued') {
			console.log(chalk.bold.yellow('⏳ Build in Progress'))
			console.log(chalk.gray('─'.repeat(60)))
			console.log()
			
			// Show queue information if queued
			if (build.status === 'queued') {
				try {
					const queueStatus = await api.getQueueStatus(appId)
					const queueItem = queueStatus.queue?.find((item: any) => item.build_id === build.build_id)
					if (queueItem && queueItem.position) {
						console.log(chalk.yellow(`Queue Position: ${queueItem.position} of ${queueStatus.queued}`))
						const estimatedWait = (queueItem.position - 1) * 3 // Rough estimate: 3 min per build
						if (estimatedWait > 0) {
							console.log(chalk.dim(`Estimated wait: ~${estimatedWait} minutes`))
						}
						console.log()
					}
				} catch {
					// Queue status unavailable, continue without it
				}
			}
			
			console.log(chalk.yellow('Your build is currently processing. You can:'))
			console.log(`  ${chalk.blue('•')} Watch live logs: ${chalk.dim('whopctl status --logs --follow')}`)
			console.log(`  ${chalk.blue('•')} Check queue: ${chalk.dim('whopctl builds queue')}`)
			if (build.status === 'queued') {
				console.log(`  ${chalk.blue('•')} Cancel build: ${chalk.dim(`whopctl builds cancel ${build.build_id}`)}`)
			}
			console.log(`  ${chalk.blue('•')} Check again: ${chalk.dim('whopctl status')}`)
			console.log()
		} else if (build.status === 'failed') {
			console.log(chalk.bold.red('❌ Build Failed'))
			console.log(chalk.gray('─'.repeat(60)))
			console.log()
			if (build.error_message) {
				console.log(chalk.red(`Error: ${build.error_message}`))
				console.log()
			}
			console.log(chalk.red('Your build encountered an error. Try these steps:'))
			console.log(`  ${chalk.yellow('1.')} Check build logs: ${chalk.dim('whopctl status --logs')}`)
			console.log(`  ${chalk.yellow('2.')} Test locally: ${chalk.dim('npm run build')}`)
			console.log(`  ${chalk.yellow('3.')} Fix issues and redeploy: ${chalk.dim('whopctl deploy')}`)
			console.log()
		} else if (!options.showLogs && (build.status === 'building' || build.status === 'failed')) {
			console.log(chalk.yellow('💡 Tip: Add --logs to see detailed build information'))
			console.log()
		}

		if (build.build_log_url && !options.showLogs) {
			printInfo(`Logs: ${build.build_log_url}`)
		}

		if (build.artifacts) {
			printSuccess(
				`✓ Artifacts available at: ${build.artifacts.s3_bucket}/${build.artifacts.s3_key}`,
			)
		}

		// Display logs if requested
		if (options.showLogs) {
			console.log()
			printInfo('📋 Build Logs')
			console.log()
			await displayLogs(api, build.build_id, {
				lines: options.lines || 30,
				follow: options.follow || false,
			})
			console.log()
		}
	} catch (error) {
		printError(`Failed to get status: ${error}`)
		process.exit(1)
	}
}
