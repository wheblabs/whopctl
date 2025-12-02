import chalk from 'chalk'
import { WhopshipAPI } from './whopship-api.ts'
import { createSpinner } from './progress.ts'
import { printError, printInfo, printSuccess, printWarning } from './output.ts'
import { showTipSync } from './tips.ts'
import type {
	BuildStatusResponse,
	BuildStages,
	BuildStage,
	DeployStage,
	QueueStage,
	ErrorContext,
} from '~/types/index.ts'

// Encouraging messages to show during long waits
const ENCOURAGING_MESSAGES = [
	"☕ Great time for a coffee break!",
	"🔨 Building something awesome...",
	"⚡ Almost there, hang tight!",
	"🎯 Your app is getting ready for the spotlight",
	"🚀 Preparing for liftoff...",
	"✨ Magic is happening behind the scenes",
	"🌟 Your app will be live soon!",
	"💪 Stay patient, great things take time",
]

// Typical build times for estimation
const TYPICAL_STAGE_TIMES_MS = {
	upload: 5000,
	queue: 10000,
	build: 120000, // 2 minutes typical
	deploy: 30000,
}

export interface BuildStatus {
	build_id: string
	status: string
	app: {
		subdomain: string
		whop_app_name: string
	}
	error_message?: string
	progress?: {
		current_stage?: string
		stages?: BuildStages
		error_context?: ErrorContext
	}
	created_at: string
	updated_at: string
}

export interface BuildTrackingOptions {
	pollInterval?: number
	timeout?: number
	showLogs?: boolean
	showStages?: boolean
}

// Stage display names
const STAGE_NAMES = {
	upload: 'Upload',
	queue: 'Queue',
	build: 'Build',
	deploy: 'Deploy',
}

const BUILD_SUBSTAGE_NAMES = {
	download: 'Download source',
	extract: 'Extract archive',
	install: 'Install dependencies',
	openNextBuild: 'OpenNext build',
	artifact: 'Create artifact',
}

const DEPLOY_SUBSTAGE_NAMES = {
	roleSetup: 'Configure IAM',
	lambdaCreate: 'Create Lambda',
	staticAssets: 'Upload assets',
	urlSetup: 'Configure URL',
	subdomainMapping: 'Configure routing',
}

export class BuildTracker {
	private api: WhopshipAPI
	private buildId: string
	private options: BuildTrackingOptions
	private lastEncouragingMessage: number = 0
	private shownTip: boolean = false

	constructor(api: WhopshipAPI, buildId: string, options: BuildTrackingOptions = {}) {
		this.api = api
		this.buildId = buildId
		this.options = {
			pollInterval: 3000, // 3 seconds
			timeout: 1800000, // 30 minutes
			showLogs: true,
			showStages: true,
			...options,
		}
	}

	/**
	 * Get estimated remaining time based on current stage
	 */
	private getEstimatedRemaining(currentStage: string, stages: BuildStages): string | null {
		const stageOrder = ['upload', 'queue', 'build', 'deploy']
		const currentIndex = stageOrder.indexOf(currentStage)
		if (currentIndex === -1) return null

		let remainingMs = 0
		
		// Add remaining time for current stage
		const currentStageData = stages[currentStage as keyof BuildStages]
		if (currentStageData?.startedAt) {
			const elapsed = Date.now() - new Date(currentStageData.startedAt).getTime()
			const typical = TYPICAL_STAGE_TIMES_MS[currentStage as keyof typeof TYPICAL_STAGE_TIMES_MS]
			remainingMs += Math.max(0, typical - elapsed)
		}

		// Add typical times for remaining stages
		for (let i = currentIndex + 1; i < stageOrder.length; i++) {
			const stageName = stageOrder[i]
			remainingMs += TYPICAL_STAGE_TIMES_MS[stageName as keyof typeof TYPICAL_STAGE_TIMES_MS]
		}

		if (remainingMs <= 0) return null
		return this.formatDuration(remainingMs)
	}

	/**
	 * Show an encouraging message periodically
	 */
	private maybeShowEncouragement(elapsedMs: number): void {
		// Show an encouraging message every 30 seconds
		const interval = 30000
		if (elapsedMs - this.lastEncouragingMessage > interval) {
			const message = ENCOURAGING_MESSAGES[Math.floor(Math.random() * ENCOURAGING_MESSAGES.length)]
			console.log(chalk.dim(`  ${message}`))
			this.lastEncouragingMessage = elapsedMs
		}
	}

	/**
	 * Show a tip once during long builds
	 */
	private maybeShowTip(elapsedMs: number): void {
		// Show a tip after 45 seconds, only once
		if (!this.shownTip && elapsedMs > 45000) {
			showTipSync('Use "whopctl status --follow" to resume watching a build')
			this.shownTip = true
		}
	}

	async trackBuild(): Promise<BuildStatus> {
		const spinner = createSpinner('Initializing build...')
		spinner.start()

		const startTime = Date.now()
		let lastStatus = ''
		let lastLogCount = 0
		let lastStageDisplay = ''

		try {
			while (true) {
				// Check timeout
				if (Date.now() - startTime > this.options.timeout!) {
					spinner.fail('Build timed out')
					throw new Error('Build timed out after 30 minutes')
				}

				// Get current status
				const status = await this.api.getBuildStatus(this.buildId)
				
				// Calculate elapsed time
				const elapsedMs = Date.now() - startTime

				// Update spinner text if status changed
				if (status.status !== lastStatus) {
					lastStatus = status.status
					
					// Include estimated remaining time if available
					let message = this.getStatusMessage(status.status, status.progress)
					if (status.progress?.stages && status.progress.current_stage) {
						const remaining = this.getEstimatedRemaining(status.progress.current_stage, status.progress.stages)
						if (remaining) {
							message += chalk.dim(` (~${remaining} remaining)`)
						}
					}
					spinner.setText(message)
				}

				// Show encouraging messages during long waits
				if (['queued', 'building'].includes(status.status)) {
					this.maybeShowEncouragement(elapsedMs)
					this.maybeShowTip(elapsedMs)
				}

				// Show stage progress if enabled and available
				if (this.options.showStages && status.progress?.stages) {
					const stageDisplay = this.formatStageProgress(status.progress.stages, status.progress.current_stage)
					if (stageDisplay !== lastStageDisplay) {
						spinner.stop()
						console.log() // Add spacing
						console.log(stageDisplay)
						lastStageDisplay = stageDisplay
						spinner.setText(this.getStatusMessage(status.status, status.progress)).start()
					}
				}

				// Show logs if available and enabled
				if (this.options.showLogs && status.status === 'building') {
					try {
						const logs = await this.api.getBuildLogs(this.buildId)
						if (logs.logs && logs.logs.length > lastLogCount) {
							spinner.stop()
							
							// Show new log lines (limit to last 5 to avoid flooding)
							const newLogs = logs.logs.slice(lastLogCount)
							const displayLogs = newLogs.slice(-5)
							if (newLogs.length > 5) {
								console.log(chalk.dim(`  │ ... ${newLogs.length - 5} more lines ...`))
							}
							for (const log of displayLogs) {
								console.log(chalk.dim('  │ ') + this.formatLogLine(log))
							}
							lastLogCount = logs.logs.length
							
							spinner.setText(this.getStatusMessage(status.status, status.progress)).start()
						}
					} catch (logError) {
						// Ignore log errors, continue tracking
					}
				}

				// Check if build is complete
				if (['built', 'failed', 'completed'].includes(status.status)) {
					if (status.status === 'built' || status.status === 'completed') {
						spinner.succeed('Build completed successfully')
						
						// Show final stage progress
						if (this.options.showStages && status.progress?.stages) {
							console.log()
							console.log(this.formatStageProgress(status.progress.stages, 'deploy'))
						}
						
						// Show final logs
						if (this.options.showLogs) {
							try {
								const logs = await this.api.getBuildLogs(this.buildId)
								if (logs.logs && logs.logs.length > lastLogCount) {
									const newLogs = logs.logs.slice(lastLogCount)
									for (const log of newLogs) {
										console.log(chalk.dim('  │ ') + this.formatLogLine(log))
									}
								}
							} catch (logError) {
								// Ignore log errors
							}
						}
						
						return status as BuildStatus
					} else {
						spinner.fail('Build failed')
						
						// Show error context with debugging help
						if (status.progress?.error_context) {
							this.displayErrorContext(status.progress.error_context, status.error_message || '')
						} else if (status.error_message) {
							printError(`Error: ${status.error_message}`)
						}
						
						throw new Error(`Build failed: ${status.error_message || 'Unknown error'}`)
					}
				}

				// Wait before next poll
				await new Promise(resolve => setTimeout(resolve, this.options.pollInterval))
			}
		} catch (error) {
			spinner.fail('Build tracking failed')
			throw error
		}
	}

	private formatLogLine(log: string): string {
		// Colorize log lines based on content
		if (log.includes('ERROR') || log.includes('error:') || log.includes('✗')) {
			return chalk.red(log)
		}
		if (log.includes('WARN') || log.includes('warning:') || log.includes('⚠')) {
			return chalk.yellow(log)
		}
		if (log.includes('✓') || log.includes('success') || log.includes('Complete')) {
			return chalk.green(log)
		}
		return chalk.dim(log)
	}

	private formatStageProgress(stages: BuildStages, currentStage?: string): string {
		const lines: string[] = []
		lines.push(chalk.bold.cyan('Build Progress'))
		lines.push('')
		
		// Define stage order
		const stageOrder: Array<keyof BuildStages> = ['upload', 'queue', 'build', 'deploy']
		
		for (const stageName of stageOrder) {
			const stage = stages[stageName]
			const isCurrent = currentStage === stageName
			const isComplete = stage?.completedAt !== undefined
			const isActive = stage?.startedAt && !stage?.completedAt
			
			// Main stage line
			const icon = isComplete ? chalk.green('✓') : (isActive || isCurrent) ? chalk.yellow('●') : chalk.dim('○')
			const name = STAGE_NAMES[stageName]
			const duration = stage?.durationMs ? this.formatDuration(stage.durationMs) : ''
			
			let info = ''
			if (stageName === 'upload' && stage) {
				const uploadStage = stage as typeof stages.upload
				if (uploadStage?.sizeBytes) {
					info = chalk.dim(` (${this.formatBytes(uploadStage.sizeBytes)})`)
				}
			} else if (stageName === 'queue' && stage) {
				const queueStage = stage as QueueStage
				if (queueStage?.position) {
					info = chalk.dim(` Position ${queueStage.position}/${queueStage.totalInQueue || '?'}`)
					if (queueStage.estimatedWaitMinutes) {
						info += chalk.dim(` (~${queueStage.estimatedWaitMinutes} min)`)
					}
				}
			}
			
			const durationStr = duration ? chalk.dim(` ${duration}`) : ''
			lines.push(`${icon} ${chalk.bold(name)}${info}${durationStr}`)
			
			// Sub-stages for build
			if (stageName === 'build' && stage) {
				const buildStage = stage as BuildStage
				if (buildStage.subStages) {
					const subStageOrder: Array<keyof typeof buildStage.subStages> = ['download', 'extract', 'install', 'openNextBuild', 'artifact']
					for (const subName of subStageOrder) {
						const subStage = buildStage.subStages[subName]
						if (subStage) {
							const subComplete = subStage.completedAt !== undefined
							const subActive = subStage.startedAt && !subStage.completedAt
							const subIcon = subComplete ? chalk.green('✓') : subActive ? chalk.yellow('→') : chalk.dim('·')
							const subLabel = BUILD_SUBSTAGE_NAMES[subName]
							const subDuration = subStage.durationMs ? chalk.dim(` ${this.formatDuration(subStage.durationMs)}`) : ''
							
							let subInfo = ''
							if (subName === 'download' && subStage.sizeMb) {
								subInfo = chalk.dim(` (${subStage.sizeMb} MB)`)
							} else if (subName === 'extract' && subStage.fileCount) {
								subInfo = chalk.dim(` (${subStage.fileCount} files)`)
							} else if (subName === 'artifact' && subStage.sizeMb) {
								subInfo = chalk.dim(` (${subStage.sizeMb} MB)`)
							}
							
							lines.push(`  ${subIcon} ${subLabel}${subInfo}${subDuration}`)
						}
					}
				}
			}
			
			// Sub-stages for deploy
			if (stageName === 'deploy' && stage) {
				const deployStage = stage as DeployStage
				if (deployStage.subStages) {
					const subStageOrder: Array<keyof typeof deployStage.subStages> = ['roleSetup', 'lambdaCreate', 'staticAssets', 'urlSetup', 'subdomainMapping']
					for (const subName of subStageOrder) {
						const subStage = deployStage.subStages[subName]
						if (subStage) {
							const subComplete = subStage.completedAt !== undefined
							const subActive = subStage.startedAt && !subStage.completedAt
							const subIcon = subComplete ? chalk.green('✓') : subActive ? chalk.yellow('→') : chalk.dim('·')
							const subLabel = DEPLOY_SUBSTAGE_NAMES[subName]
							const subDuration = subStage.durationMs ? chalk.dim(` ${this.formatDuration(subStage.durationMs)}`) : ''
							
							let subInfo = ''
							if (subName === 'staticAssets' && subStage.fileCount) {
								subInfo = chalk.dim(` (${subStage.fileCount} files)`)
							}
							
							lines.push(`  ${subIcon} ${subLabel}${subInfo}${subDuration}`)
						}
					}
				}
			}
		}
		
		return lines.join('\n')
	}

	private formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
		const mins = Math.floor(ms / 60000)
		const secs = Math.floor((ms % 60000) / 1000)
		return `${mins}m ${secs}s`
	}

	private formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
	}

	private displayErrorContext(context: ErrorContext, errorMessage: string): void {
		console.log()
		console.log(chalk.red.bold('Build Failed'))
		
		if (context.stage) {
			const stageName = context.subStage 
				? `${context.stage}.${context.subStage}` 
				: context.stage
			console.log(chalk.red(`  Failed at stage: ${stageName}`))
		}
		
		if (context.exitCode !== undefined) {
			console.log(chalk.dim(`  Exit code: ${context.exitCode}`))
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
			console.log(chalk.bold('Debug steps:'))
			for (let i = 0; i < context.debugSteps.length; i++) {
				console.log(chalk.cyan(`  ${i + 1}. ${context.debugSteps[i]}`))
			}
		}
		
		console.log()
	}

	private getStatusMessage(status: string, progress?: { current_stage?: string; stages?: BuildStages }): string {
		// Get more specific message based on current stage
		if (progress?.current_stage) {
			const stageName = STAGE_NAMES[progress.current_stage as keyof typeof STAGE_NAMES]
			if (stageName) {
				// Check for sub-stage
				if (progress.current_stage === 'build' && progress.stages?.build?.currentSubStage) {
					const subStageName = BUILD_SUBSTAGE_NAMES[progress.stages.build.currentSubStage as keyof typeof BUILD_SUBSTAGE_NAMES]
					if (subStageName) {
						return `Building: ${subStageName}...`
					}
				}
				if (progress.current_stage === 'deploy' && progress.stages?.deploy?.currentSubStage) {
					const subStageName = DEPLOY_SUBSTAGE_NAMES[progress.stages.deploy.currentSubStage as keyof typeof DEPLOY_SUBSTAGE_NAMES]
					if (subStageName) {
						return `Deploying: ${subStageName}...`
					}
				}
			}
		}
		
		switch (status) {
			case 'init':
			case 'uploaded':
				return 'Preparing build environment...'
			case 'queued':
				if (progress?.stages?.queue?.position) {
					return `Waiting in queue (position ${progress.stages.queue.position})...`
				}
				return 'Waiting in build queue...'
			case 'building':
				return 'Building application...'
			case 'built':
				return 'Build completed, preparing deployment...'
			case 'deploying':
				return 'Deploying to production...'
			case 'completed':
				return 'Deployment completed!'
			case 'failed':
				return 'Build failed'
			default:
				return `Status: ${status}`
		}
	}

	async showBuildSummary(): Promise<void> {
		try {
			const status = await this.api.getBuildStatus(this.buildId)
			const appUrl = `https://${status.app.subdomain}.whopship.app`

			console.log()
			console.log(chalk.bold.green('═'.repeat(50)))
			console.log(chalk.bold.green('  🎉 DEPLOYMENT SUCCESSFUL!'))
			console.log(chalk.bold.green('═'.repeat(50)))
			console.log()
			console.log(chalk.bold.cyan('  Your app is now live at:'))
			console.log()
			console.log(chalk.bold.underline.white(`    ${appUrl}`))
			console.log()
			console.log(chalk.gray('─'.repeat(50)))
			console.log()
			console.log(chalk.dim('  Details:'))
			console.log(chalk.dim(`    App Name:  `) + chalk.white(status.app.whop_app_name))
			console.log(chalk.dim(`    Build ID:  `) + chalk.white(status.build_id))
			console.log(chalk.dim(`    Deployed:  `) + chalk.white(new Date(status.updated_at).toLocaleString()))
			
			// Show total duration if available
			if (status.total_duration_ms) {
				console.log(chalk.dim(`    Duration:  `) + chalk.white(this.formatDuration(status.total_duration_ms)))
			}
			
			console.log()
			console.log(chalk.gray('─'.repeat(50)))
			console.log()
			console.log(chalk.bold('  What\'s next?'))
			console.log()
			console.log(chalk.cyan('    • ') + chalk.white('View your app: ') + chalk.dim('whopctl open'))
			console.log(chalk.cyan('    • ') + chalk.white('Check status:  ') + chalk.dim('whopctl status'))
			console.log(chalk.cyan('    • ') + chalk.white('View logs:     ') + chalk.dim('whopctl logs'))
			console.log()
			console.log(chalk.gray('─'.repeat(50)))
			console.log()
		} catch (error) {
			printWarning('Could not fetch deployment summary')
		}
	}

	private getStatusBadge(status: string): string {
		switch (status) {
			case 'completed':
			case 'built':
				return chalk.bgGreen.black(' LIVE ') + chalk.green(` ${status}`)
			case 'building':
			case 'deploying':
				return chalk.bgYellow.black(' BUILDING ') + chalk.yellow(` ${status}`)
			case 'failed':
				return chalk.bgRed.white(' FAILED ') + chalk.red(` ${status}`)
			case 'queued':
				return chalk.bgBlue.white(' QUEUED ') + chalk.blue(` ${status}`)
			default:
				return chalk.bgGray.white(` ${status.toUpperCase()} `)
		}
	}
}

export function createBuildTracker(api: WhopshipAPI, buildId: string, options?: BuildTrackingOptions): BuildTracker {
	return new BuildTracker(api, buildId, options)
}
