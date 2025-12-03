import { resolve } from 'node:path'
import chalk from 'chalk'
import type {
	BuildStage,
	BuildStages,
	DeployStage,
	ErrorContext,
	QueueStage,
} from '~/types/index.ts'
import { aliasManager } from '../../lib/alias-manager.ts'
import { requireAuth } from '../../lib/auth-guard.ts'
import { readEnvFile } from '../../lib/env.ts'
import { formatBytes, formatDuration } from '../../lib/format.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { createSpinner } from '../../lib/progress.ts'
import { type WhopshipClient, whopshipClient } from '../../lib/whopship-client.ts'

// Stage display names
const STAGE_NAMES = {
	upload: 'Upload',
	queue: 'Queue',
	build: 'Build',
	deploy: 'Deploy',
}

const BUILD_SUBSTAGE_NAMES: Record<string, string> = {
	download: 'Download source',
	extract: 'Extract archive',
	install: 'Install dependencies',
	openNextBuild: 'OpenNext build',
	artifact: 'Create artifact',
}

const DEPLOY_SUBSTAGE_NAMES: Record<string, string> = {
	roleSetup: 'Configure IAM',
	lambdaCreate: 'Create Lambda',
	staticAssets: 'Upload assets',
	urlSetup: 'Configure URL',
	subdomainMapping: 'Configure routing',
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
 * Display stage timeline with sub-stages
 */
function displayStageTimeline(stages: BuildStages, currentStage?: string): void {
	console.log(chalk.bold('Build Pipeline:'))
	console.log()

	// Define stage order
	const stageOrder: Array<keyof BuildStages> = ['upload', 'queue', 'build', 'deploy']

	for (const stageName of stageOrder) {
		const stage = stages[stageName]
		const isCurrent = currentStage === stageName
		const isComplete = stage?.completedAt !== undefined
		const isActive = stage?.startedAt && !stage?.completedAt

		// Main stage line
		const icon = isComplete
			? chalk.green('✓')
			: isActive || isCurrent
				? chalk.yellow('●')
				: chalk.dim('○')
		const name = STAGE_NAMES[stageName]
		const duration = stage?.durationMs ? formatDuration(stage.durationMs) : ''

		let info = ''
		if (stageName === 'upload' && stage) {
			const uploadStage = stage as typeof stages.upload
			if (uploadStage?.sizeBytes) {
				info = chalk.dim(` (${formatBytes(uploadStage.sizeBytes)})`)
			}
		} else if (stageName === 'queue' && stage) {
			const queueStage = stage as QueueStage
			if (queueStage?.position) {
				info = chalk.dim(` Position ${queueStage.position}`)
				if (queueStage.totalInQueue) {
					info += chalk.dim(`/${queueStage.totalInQueue}`)
				}
				if (queueStage.estimatedWaitMinutes) {
					info += chalk.dim(` (~${queueStage.estimatedWaitMinutes} min wait)`)
				}
			}
		}

		const durationStr = duration ? chalk.dim(` ${duration}`) : ''
		const status = isComplete
			? chalk.green('complete')
			: isActive
				? chalk.yellow('in progress')
				: chalk.dim('pending')
		console.log(`  ${icon} ${chalk.bold(name)}${info}${durationStr} ${chalk.dim('–')} ${status}`)

		// Sub-stages for build
		if (stageName === 'build' && stage) {
			const buildStage = stage as BuildStage
			if (buildStage.subStages) {
				const subStageOrder: Array<keyof typeof buildStage.subStages> = [
					'download',
					'extract',
					'install',
					'openNextBuild',
					'artifact',
				]
				for (const subName of subStageOrder) {
					const subStage = buildStage.subStages[subName]
					if (subStage) {
						const subComplete = subStage.completedAt !== undefined
						const subActive = subStage.startedAt && !subStage.completedAt
						const subIcon = subComplete
							? chalk.green('✓')
							: subActive
								? chalk.yellow('→')
								: chalk.dim('·')
						const subLabel = BUILD_SUBSTAGE_NAMES[subName] || subName
						const subDuration = subStage.durationMs
							? chalk.dim(` ${formatDuration(subStage.durationMs)}`)
							: ''

						let subInfo = ''
						if (subName === 'download' && subStage.sizeMb) {
							subInfo = chalk.dim(` (${subStage.sizeMb} MB)`)
						} else if (subName === 'extract' && subStage.fileCount) {
							subInfo = chalk.dim(` (${subStage.fileCount} files)`)
						} else if (subName === 'artifact' && subStage.sizeMb) {
							subInfo = chalk.dim(` (${subStage.sizeMb} MB)`)
						}

						console.log(`     ${subIcon} ${subLabel}${subInfo}${subDuration}`)
					}
				}
			}
		}

		// Sub-stages for deploy
		if (stageName === 'deploy' && stage) {
			const deployStage = stage as DeployStage
			if (deployStage.subStages) {
				const subStageOrder: Array<keyof typeof deployStage.subStages> = [
					'roleSetup',
					'lambdaCreate',
					'staticAssets',
					'urlSetup',
					'subdomainMapping',
				]
				for (const subName of subStageOrder) {
					const subStage = deployStage.subStages[subName]
					if (subStage) {
						const subComplete = subStage.completedAt !== undefined
						const subActive = subStage.startedAt && !subStage.completedAt
						const subIcon = subComplete
							? chalk.green('✓')
							: subActive
								? chalk.yellow('→')
								: chalk.dim('·')
						const subLabel = DEPLOY_SUBSTAGE_NAMES[subName] || subName
						const subDuration = subStage.durationMs
							? chalk.dim(` ${formatDuration(subStage.durationMs)}`)
							: ''

						let subInfo = ''
						if (subName === 'staticAssets' && subStage.fileCount) {
							subInfo = chalk.dim(` (${subStage.fileCount} files)`)
						}

						console.log(`     ${subIcon} ${subLabel}${subInfo}${subDuration}`)
					}
				}
			}
		}
	}

	console.log()
}

/**
 * Display error context with debugging help
 */
function displayErrorContext(context: ErrorContext, errorMessage: string): void {
	console.log(chalk.bold.red('❌ Build Failed'))
	console.log(chalk.gray('─'.repeat(60)))
	console.log()

	if (context.stage) {
		const stageName = context.subStage
			? `${STAGE_NAMES[context.stage as keyof typeof STAGE_NAMES] || context.stage} → ${BUILD_SUBSTAGE_NAMES[context.subStage] || DEPLOY_SUBSTAGE_NAMES[context.subStage] || context.subStage}`
			: STAGE_NAMES[context.stage as keyof typeof STAGE_NAMES] || context.stage
		console.log(chalk.red(`Failed at: ${stageName}`))
	}

	if (context.exitCode !== undefined) {
		console.log(chalk.dim(`Exit code: ${context.exitCode}`))
	}

	console.log()
	console.log(chalk.yellow(`Error: ${errorMessage}`))

	if (context.likelyCauses && context.likelyCauses.length > 0) {
		console.log()
		console.log(chalk.bold('Likely causes:'))
		for (const cause of context.likelyCauses) {
			console.log(chalk.yellow(`  • ${cause}`))
		}
	}

	if (context.debugSteps && context.debugSteps.length > 0) {
		console.log()
		console.log(chalk.bold('How to fix:'))
		for (let i = 0; i < context.debugSteps.length; i++) {
			console.log(chalk.cyan(`  ${i + 1}. ${context.debugSteps[i]}`))
		}
	}

	console.log()
}

/**
 * Format log line with colors
 */
function formatLogLine(line: string): string {
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
	api: WhopshipClient,
	buildId: string,
	options: { lines: number; follow: boolean },
): Promise<void> {
	let lastLogCount = 0

	const fetchAndDisplayLogs = async (): Promise<{ logs: string[]; status: string }> => {
		try {
			const logsResponse = await api.getBuildLogs(buildId)

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
		const activeStatuses = ['init', 'uploading', 'uploaded', 'queued', 'building', 'deploying']

		if (!activeStatuses.includes(initialResult.status)) {
			return
		}

		console.log()
		printInfo('Following logs... (Press Ctrl+C to stop)')
		console.log()

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
				await new Promise((resolve) => setTimeout(resolve, 2500))

				const result = await fetchAndDisplayLogs()

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
			try {
				const { appId: resolvedAppId } = await aliasManager.resolveProjectId(options.project)
				appId = resolvedAppId
			} catch (error) {
				printError(`Failed to resolve project: ${error}`)
				process.exit(1)
			}
		} else {
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

		// 2. Fetch latest build
		const spinner = createSpinner(`Fetching latest build for app ${appId}...`)
		spinner.start()

		const build = await whopshipClient.getLatestBuildForApp(appId)
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
		console.log()

		// Show stage timeline if available
		if (build.progress?.stages && Object.keys(build.progress.stages).length > 0) {
			displayStageTimeline(build.progress.stages, build.progress.current_stage)
		}

		// Show deployment URLs if built
		if (build.status === 'built' || build.status === 'completed') {
			const normalizedSubdomain = build.app.subdomain.toLowerCase()
			const appUrl = `https://${normalizedSubdomain}.whopship.app`

			console.log(chalk.bold.green('🚀 Your App is Live!'))
			console.log(chalk.gray('─'.repeat(60)))
			console.log()
			console.log(`${chalk.bold.cyan('Production URL:')} ${chalk.underline.cyan(appUrl)}`)
			console.log(
				`${chalk.bold.cyan('Short URL:')}     ${chalk.underline.cyan(`https://app-${build.app.id}.whopship.app`)}`,
			)
			console.log()
			console.log(chalk.bold('Next Steps:'))
			console.log(`  ${chalk.green('1.')} Configure your app settings:`)
			console.log(`     ${chalk.dim(`https://whop.com/apps/${build.app.whop_app_id}/settings`)}`)
			console.log(`  ${chalk.green('2.')} Set your App URL to: ${chalk.cyan(appUrl)}`)
			console.log(`  ${chalk.green('3.')} Install and test in your company`)
			console.log()
			console.log(chalk.bold('Monitoring:'))
			console.log(
				`  ${chalk.yellow('•')} View runtime logs: ${chalk.dim(`whopctl logs ${build.app.whop_app_id}`)}`,
			)
			console.log(`  ${chalk.yellow('•')} Check usage: ${chalk.dim('whopctl usage')}`)
			console.log(
				`  ${chalk.yellow('•')} Redeploy: ${chalk.dim(`whopctl redeploy ${build.build_id}`)}`,
			)
			console.log()
		}

		// Show contextual actions based on status
		if (build.status === 'building' || build.status === 'queued' || build.status === 'deploying') {
			console.log(chalk.bold.yellow('⏳ Build in Progress'))
			console.log(chalk.gray('─'.repeat(60)))
			console.log()

			// Show queue information if queued
			if (build.status === 'queued') {
				try {
					const queueStatus = await whopshipClient.getQueueStatus(appId)
					const queueItem = queueStatus.queue?.find((item: any) => item.build_id === build.build_id)
					if (queueItem?.position) {
						console.log(
							chalk.yellow(`Queue Position: ${queueItem.position} of ${queueStatus.queued}`),
						)
						const estimatedWait = (queueItem.position - 1) * 3
						if (estimatedWait > 0) {
							console.log(chalk.dim(`Estimated wait: ~${estimatedWait} minutes`))
						}
						console.log()
					}
				} catch {
					// Queue status unavailable
				}
			}

			console.log(chalk.yellow('Your build is currently processing. You can:'))
			console.log(
				`  ${chalk.blue('•')} Watch live logs: ${chalk.dim('whopctl status --logs --follow')}`,
			)
			console.log(`  ${chalk.blue('•')} Check queue: ${chalk.dim('whopctl builds queue')}`)
			if (build.status === 'queued') {
				console.log(
					`  ${chalk.blue('•')} Cancel build: ${chalk.dim(`whopctl builds cancel ${build.build_id}`)}`,
				)
			}
			console.log(`  ${chalk.blue('•')} Check again: ${chalk.dim('whopctl status')}`)
			console.log()
		} else if (build.status === 'failed') {
			// Show enhanced error context if available
			if (build.progress?.error_context) {
				displayErrorContext(build.progress.error_context, build.error_message || 'Unknown error')
			} else {
				console.log(chalk.bold.red('❌ Build Failed'))
				console.log(chalk.gray('─'.repeat(60)))
				console.log()
				if (build.error_message) {
					console.log(chalk.red(`Error: ${build.error_message}`))
					console.log()
				}
				console.log(chalk.red('Your build encountered an error. Try these steps:'))
				console.log(
					`  ${chalk.yellow('1.')} Check build logs: ${chalk.dim('whopctl status --logs')}`,
				)
				console.log(`  ${chalk.yellow('2.')} Test locally: ${chalk.dim('npm run build')}`)
				console.log(
					`  ${chalk.yellow('3.')} Fix issues and redeploy: ${chalk.dim('whopctl deploy')}`,
				)
				console.log()
			}
		}

		if (build.artifacts?.available) {
			printSuccess('✓ Build artifacts available')
		}

		// Display logs if requested
		if (options.showLogs) {
			console.log()
			printInfo('📋 Build Logs')
			console.log()
			await displayLogs(whopshipClient, build.build_id, {
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
