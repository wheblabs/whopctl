import { resolve } from 'node:path'
import chalk from 'chalk'
import type { BuildStage, BuildStages, DeployStage, ErrorContext } from '~/types/index.ts'
import { requireAuth } from '../../lib/auth-guard.ts'
import { readEnvFile } from '../../lib/env.ts'
import { formatDuration } from '../../lib/format.ts'
import { printError, printInfo, printSuccess, printWarning } from '../../lib/output.ts'
import { createSpinner } from '../../lib/progress.ts'
import { whopshipClient } from '../../lib/whopship-client.ts'

// Stage display names
const STAGE_NAMES: Record<string, string> = {
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
 * Format log line with colors based on content
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
	// Dim timestamps
	if (line.match(/^\[\d{4}-\d{2}-\d{2}/)) {
		const match = line.match(/^(\[[^\]]+\])(.*)$/)
		if (match) {
			return chalk.dim(match[1]) + match[2]
		}
	}

	return line
}

/**
 * Display stage summary
 */
function displayStageSummary(stages: BuildStages): void {
	console.log(chalk.bold('Stage Summary:'))
	console.log()

	const stageOrder: Array<keyof BuildStages> = ['upload', 'queue', 'build', 'deploy']

	for (const stageName of stageOrder) {
		const stage = stages[stageName]
		if (!stage) continue

		const isComplete = stage.completedAt !== undefined
		const isActive = stage.startedAt && !stage.completedAt
		const icon = isComplete ? chalk.green('✓') : isActive ? chalk.yellow('●') : chalk.dim('○')
		const name = STAGE_NAMES[stageName] || stageName
		const duration = stage.durationMs ? formatDuration(stage.durationMs) : ''

		console.log(`  ${icon} ${chalk.bold(name)} ${duration ? chalk.dim(`(${duration})`) : ''}`)

		// Show sub-stages for build
		if (stageName === 'build' && stage) {
			const buildStage = stage as BuildStage
			if (buildStage.subStages) {
				for (const [subName, subStage] of Object.entries(buildStage.subStages)) {
					if (!subStage) continue
					const subComplete = subStage.completedAt !== undefined
					const subActive = subStage.startedAt && !subStage.completedAt
					const subIcon = subComplete
						? chalk.green('✓')
						: subActive
							? chalk.yellow('→')
							: chalk.dim('·')
					const subLabel = BUILD_SUBSTAGE_NAMES[subName] || subName
					const subDuration = subStage.durationMs ? formatDuration(subStage.durationMs) : ''
					console.log(
						`     ${subIcon} ${subLabel} ${subDuration ? chalk.dim(`(${subDuration})`) : ''}`,
					)
				}
			}
		}

		// Show sub-stages for deploy
		if (stageName === 'deploy' && stage) {
			const deployStage = stage as DeployStage
			if (deployStage.subStages) {
				for (const [subName, subStage] of Object.entries(deployStage.subStages)) {
					if (!subStage) continue
					const subComplete = subStage.completedAt !== undefined
					const subActive = subStage.startedAt && !subStage.completedAt
					const subIcon = subComplete
						? chalk.green('✓')
						: subActive
							? chalk.yellow('→')
							: chalk.dim('·')
					const subLabel = DEPLOY_SUBSTAGE_NAMES[subName] || subName
					const subDuration = subStage.durationMs ? formatDuration(subStage.durationMs) : ''
					console.log(
						`     ${subIcon} ${subLabel} ${subDuration ? chalk.dim(`(${subDuration})`) : ''}`,
					)
				}
			}
		}
	}

	console.log()
}

/**
 * Display error context
 */
function displayErrorContext(context: ErrorContext, errorMessage: string): void {
	console.log(chalk.bold.red('Error Details:'))
	console.log()

	if (context.stage) {
		const stageName = context.subStage
			? `${STAGE_NAMES[context.stage] || context.stage} → ${BUILD_SUBSTAGE_NAMES[context.subStage] || DEPLOY_SUBSTAGE_NAMES[context.subStage] || context.subStage}`
			: STAGE_NAMES[context.stage] || context.stage
		console.log(`  ${chalk.cyan('Failed at:')} ${stageName}`)
	}

	if (context.exitCode !== undefined) {
		console.log(`  ${chalk.cyan('Exit code:')} ${context.exitCode}`)
	}

	console.log(`  ${chalk.cyan('Message:')} ${chalk.red(errorMessage)}`)

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

export interface BuildLogsOptions {
	buildId?: string
	lines?: number
	follow?: boolean
	verbose?: boolean
	stage?: 'upload' | 'queue' | 'build' | 'deploy'
}

/**
 * Display structured build logs
 */
export async function buildLogsCommand(
	path: string = '.',
	options: BuildLogsOptions = {},
): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		let buildId = options.buildId

		// If no build ID provided, get the latest
		if (!buildId) {
			const env = await readEnvFile(targetDir)
			const appId = env.NEXT_PUBLIC_WHOP_APP_ID

			if (!appId) {
				printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
				console.log()
				console.log(chalk.dim('💡 Specify a build ID:'))
				console.log(chalk.dim('   whopctl builds logs --build-id <build-uuid>'))
				process.exit(1)
			}

			const spinner = createSpinner('Fetching latest build...')
			spinner.start()

			try {
				const build = await whopshipClient.getLatestBuildForApp(appId)
				buildId = build.build_id
				spinner.succeed(`Found build: ${buildId.substring(0, 8)}...`)
			} catch (_error) {
				spinner.fail('Failed to find builds for this app')
				printError(`No builds found. Deploy first with: whopctl deploy`)
				process.exit(1)
			}
		}

		// Fetch build logs
		const spinner = createSpinner('Fetching build logs...')
		spinner.start()

		const logsResponse = await whopshipClient.getBuildLogs(buildId)
		spinner.succeed('Build logs retrieved')

		console.log()
		console.log(chalk.bold(`📋 Build Logs - ${buildId.substring(0, 8)}...`))
		console.log(chalk.gray('─'.repeat(60)))
		console.log()

		// Display current stage
		if (logsResponse.current_stage) {
			console.log(
				chalk.bold('Current Stage:'),
				chalk.cyan(STAGE_NAMES[logsResponse.current_stage] || logsResponse.current_stage),
			)
			console.log()
		}

		// Display stage summary if not verbose
		if (!options.verbose && logsResponse.stages && Object.keys(logsResponse.stages).length > 0) {
			displayStageSummary(logsResponse.stages)
		}

		// Display error context if failed
		if (logsResponse.status === 'failed' && logsResponse.error_context) {
			displayErrorContext(logsResponse.error_context, logsResponse.error_message || 'Unknown error')
		} else if (logsResponse.status === 'failed' && logsResponse.error_message) {
			console.log(chalk.red.bold('Error:'), chalk.red(logsResponse.error_message))
			console.log()
		}

		// Display logs
		const logs = logsResponse.logs || []
		if (logs.length === 0) {
			printInfo('No logs available yet. Build may still be in queue.')
		} else {
			console.log(chalk.bold('Logs:'))
			console.log()

			// Limit lines if specified and not verbose
			const linesToShow = options.verbose ? logs : logs.slice(-(options.lines || 50))

			if (!options.verbose && logs.length > linesToShow.length) {
				console.log(
					chalk.dim(
						`... ${logs.length - linesToShow.length} earlier lines hidden (use --verbose to see all)`,
					),
				)
				console.log()
			}

			for (const log of linesToShow) {
				console.log(formatLogLine(log))
			}
		}

		// Follow mode
		if (options.follow) {
			const activeStatuses = ['init', 'uploading', 'uploaded', 'queued', 'building', 'deploying']

			if (!activeStatuses.includes(logsResponse.status)) {
				console.log()
				printInfo(`Build is ${logsResponse.status}. No new logs expected.`)
				return
			}

			console.log()
			printInfo('Following logs... (Press Ctrl+C to stop)')
			console.log()

			let lastLogCount = logs.length
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

					try {
						const newLogs = await api.getBuildLogs(buildId)

						if (newLogs.logs && newLogs.logs.length > lastLogCount) {
							const newLines = newLogs.logs.slice(lastLogCount)
							for (const log of newLines) {
								console.log(formatLogLine(log))
							}
							lastLogCount = newLogs.logs.length
						}

						if (!activeStatuses.includes(newLogs.status)) {
							console.log()
							if (newLogs.status === 'completed' || newLogs.status === 'built') {
								printSuccess(`Build ${newLogs.status}!`)
							} else if (newLogs.status === 'failed') {
								printError(`Build failed`)
								if (newLogs.error_context) {
									displayErrorContext(
										newLogs.error_context,
										newLogs.error_message || 'Unknown error',
									)
								} else if (newLogs.error_message) {
									console.log(chalk.red(`Error: ${newLogs.error_message}`))
								}
							} else {
								printInfo(`Build status: ${newLogs.status}`)
							}
							break
						}
					} catch (_error) {
						printWarning('Failed to fetch logs, retrying...')
					}
				}
			} finally {
				process.removeListener('SIGINT', interruptHandler)
			}
		}

		console.log()
	} catch (error) {
		printError(`Failed to fetch build logs: ${error}`)
		process.exit(1)
	}
}
