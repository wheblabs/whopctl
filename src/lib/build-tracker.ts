import chalk from 'chalk'
import { WhopshipAPI } from './whopship-api.ts'
import { createSpinner } from './progress.ts'
import { printError, printInfo, printSuccess, printWarning } from './output.ts'

export interface BuildStatus {
	build_id: string
	status: string
	app: {
		subdomain: string
		whop_app_name: string
	}
	error_message?: string
	created_at: string
	updated_at: string
}

export interface BuildTrackingOptions {
	pollInterval?: number
	timeout?: number
	showLogs?: boolean
}

export class BuildTracker {
	private api: WhopshipAPI
	private buildId: string
	private options: BuildTrackingOptions

	constructor(api: WhopshipAPI, buildId: string, options: BuildTrackingOptions = {}) {
		this.api = api
		this.buildId = buildId
		this.options = {
			pollInterval: 3000, // 3 seconds
			timeout: 1800000, // 30 minutes
			showLogs: true,
			...options,
		}
	}

	async trackBuild(): Promise<BuildStatus> {
		const spinner = createSpinner('Initializing build...')
		spinner.start()

		const startTime = Date.now()
		let lastStatus = ''
		let lastLogCount = 0

		try {
			while (true) {
				// Check timeout
				if (Date.now() - startTime > this.options.timeout!) {
					spinner.fail('Build timed out')
					throw new Error('Build timed out after 30 minutes')
				}

				// Get current status
				const status = await this.api.getBuildStatus(this.buildId)
				
				// Update spinner text if status changed
				if (status.status !== lastStatus) {
					lastStatus = status.status
					spinner.setText(this.getStatusMessage(status.status))
				}

				// Show logs if available and enabled
				if (this.options.showLogs && status.status === 'building') {
					try {
						const logs = await this.api.getBuildLogs(this.buildId)
						if (logs.logs && logs.logs.length > lastLogCount) {
							spinner.stop()
							
							// Show new log lines
							const newLogs = logs.logs.slice(lastLogCount)
							for (const log of newLogs) {
								console.log(chalk.dim('  │ ') + log)
							}
							lastLogCount = logs.logs.length
							
							spinner.setText(this.getStatusMessage(status.status)).start()
						}
					} catch (logError) {
						// Ignore log errors, continue tracking
					}
				}

				// Check if build is complete
				if (['built', 'failed', 'completed'].includes(status.status)) {
					if (status.status === 'built' || status.status === 'completed') {
						spinner.succeed('Build completed successfully')
						
						// Show final logs
						if (this.options.showLogs) {
							try {
								const logs = await this.api.getBuildLogs(this.buildId)
								if (logs.logs && logs.logs.length > lastLogCount) {
									const newLogs = logs.logs.slice(lastLogCount)
									for (const log of newLogs) {
										console.log(chalk.dim('  │ ') + log)
									}
								}
							} catch (logError) {
								// Ignore log errors
							}
						}
						
						return status
					} else {
						spinner.fail('Build failed')
						if (status.error_message) {
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

	private getStatusMessage(status: string): string {
		switch (status) {
			case 'init':
			case 'uploaded':
				return 'Preparing build environment...'
			case 'queued':
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
			console.log(chalk.bold.green('🚀 Deployment Summary'))
			console.log(chalk.gray('─'.repeat(50)))
			console.log(chalk.bold.cyan('Production URL: '), chalk.underline.cyan(appUrl))
			console.log(chalk.bold.white('App Name:       '), status.app.whop_app_name)
			console.log(chalk.bold.white('Build ID:       '), status.build_id)
			console.log(chalk.bold.white('Status:         '), this.getStatusBadge(status.status))
			console.log(chalk.bold.white('Deployed:       '), new Date(status.updated_at).toLocaleString())
			console.log()
			
			if (status.status === 'completed' || status.status === 'built') {
				printSuccess('🎉 Your app is now live!')
				printInfo(`Visit: ${appUrl}`)
			}
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
