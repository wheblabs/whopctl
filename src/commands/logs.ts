import chalk from 'chalk'
import { requireAuth } from '../lib/auth-guard.ts'
import { CloudWatchLogs } from '../lib/cloudwatch.ts'
import { printError, printInfo, printSuccess, printWarning } from '../lib/output.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'
import { createSpinner } from '../lib/progress.ts'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { aliasManager } from '../lib/alias-manager.ts'

/**
 * Simple .env reader
 */
async function readEnvFile(dir: string): Promise<Record<string, string>> {
	try {
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
	} catch {
		return {}
	}
}

/**
 * Format log message with colors based on content
 */
function formatLogMessage(message: string): string {
	const lowerMessage = message.toLowerCase()
	
	// Error patterns
	if (lowerMessage.includes('error') || lowerMessage.includes('exception') || lowerMessage.includes('failed')) {
		return chalk.red(message)
	}
	
	// Warning patterns
	if (lowerMessage.includes('warn') || lowerMessage.includes('warning') || lowerMessage.includes('deprecated')) {
		return chalk.yellow(message)
	}
	
	// Info patterns
	if (lowerMessage.includes('info') || lowerMessage.includes('starting') || lowerMessage.includes('listening')) {
		return chalk.blue(message)
	}
	
	// Success patterns
	if (lowerMessage.includes('success') || lowerMessage.includes('completed') || lowerMessage.includes('ready')) {
		return chalk.green(message)
	}
	
	// HTTP status codes
	if (message.match(/\b[2]\d{2}\b/)) {
		return chalk.green(message) // 2xx success
	}
	if (message.match(/\b[4-5]\d{2}\b/)) {
		return chalk.red(message) // 4xx/5xx errors
	}
	
	return message
}

/**
 * Resolve app ID from project name or direct ID
 */
async function resolveAppId(projectNameOrId: string, api: WhopshipAPI): Promise<{ appId: string; internalId: number }> {
	try {
		// Use alias manager to resolve project ID
		const { appId } = await aliasManager.resolveProjectId(projectNameOrId)
		const appInfo = await api.getAppByWhopId(appId)
		return { appId, internalId: appInfo.id }
	} catch (error) {
		throw new Error(`${error}`)
	}
}

export async function logsCommand(options: {
	type?: 'deploy-runner' | 'router' | 'app'
	appId?: string
	projectName?: string
	buildId?: string
	hours?: number
	follow?: boolean
	filter?: string
	level?: 'error' | 'warn' | 'info' | 'debug'
	lines?: number
}) {
	requireAuth()

	try {
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
		const cw = new CloudWatchLogs()
		let logGroupName: string
		let logDescription: string

		// Determine which log group to query
		if (options.type === 'deploy-runner') {
			logGroupName = '/aws/lambda/whopship-infra-production-DeployRunnerFunction-dhkddrhs'
			logDescription = 'deploy-runner'
			if (options.buildId) {
				logDescription += ` (build: ${options.buildId})`
			}
		} else if (options.type === 'router') {
			logGroupName = '/aws/lambda/whopship-infra-production-RouterApi'
			logDescription = 'router'
		} else {
			// Default to app logs
			let projectIdentifier = options.projectName || options.appId
			
			// Try to read from .env if not specified
			if (!projectIdentifier) {
				const env = await readEnvFile(process.cwd())
				if (env.NEXT_PUBLIC_WHOP_APP_ID) {
					projectIdentifier = env.NEXT_PUBLIC_WHOP_APP_ID
				}
			}

			if (!projectIdentifier) {
				printError('No project specified. Use --app-id, --project-name, or run from a project directory.')
				process.exit(1)
			}

			const spinner = createSpinner(`Resolving project: ${projectIdentifier}`)
			spinner.start()

			try {
				const { appId, internalId } = await resolveAppId(projectIdentifier, api)
				spinner.succeed(`Found app: ${appId}`)
				
				logGroupName = `/aws/lambda/whopship-app-${internalId}`
				logDescription = `app ${appId}`
			} catch (error) {
				spinner.fail(`Failed to resolve project: ${error}`)
				process.exit(1)
			}
		}

		// Build filter pattern
		let filterPattern: string | undefined
		const filters: string[] = []
		
		if (options.buildId) {
			filters.push(`"${options.buildId}"`)
		}
		
		if (options.filter) {
			filters.push(`"${options.filter}"`)
		}
		
		if (options.level) {
			const levelPatterns = {
				error: '"ERROR" OR "error" OR "Error"',
				warn: '"WARN" OR "warn" OR "Warning"',
				info: '"INFO" OR "info"',
				debug: '"DEBUG" OR "debug"'
			}
			filters.push(`(${levelPatterns[options.level]})`)
		}
		
		if (filters.length > 0) {
			filterPattern = filters.join(' AND ')
		}

		// Show what we're doing
		console.log()
		console.log(chalk.bold(`📋 ${logDescription.charAt(0).toUpperCase() + logDescription.slice(1)} Logs`))
		console.log(chalk.gray('─'.repeat(60)))
		
		if (options.follow) {
			console.log(chalk.cyan('Mode: ') + 'Live streaming (Press Ctrl+C to stop)')
		} else {
			console.log(chalk.cyan('Mode: ') + `Recent logs (${options.hours || 1} hour${(options.hours || 1) > 1 ? 's' : ''})`)
		}
		
		if (filterPattern) {
			console.log(chalk.cyan('Filter: ') + chalk.dim(filterPattern))
		}
		
		if (options.level) {
			console.log(chalk.cyan('Level: ') + chalk.dim(options.level.toUpperCase()))
		}
		
		console.log()

		const lineCap = options.lines || (options.follow ? 200 : 1000)
		if (options.follow) {
			await streamLogs(cw, logGroupName, filterPattern, lineCap)
		} else {
			await fetchRecentLogs(cw, logGroupName, filterPattern, options.hours || 1, lineCap)
		}

	} catch (error) {
		printError(`Failed to fetch logs: ${error}`)
		process.exit(1)
	}
}

/**
 * Fetch and display recent logs
 */
async function fetchRecentLogs(
	cw: CloudWatchLogs, 
	logGroupName: string, 
	filterPattern: string | undefined, 
	hours: number,
	maxLines: number
): Promise<void> {
	const spinner = createSpinner('Fetching logs...')
	spinner.start()

	try {
		const events = await cw.getRecentLogs(logGroupName, hours, filterPattern, maxLines)
		spinner.succeed(`Found ${events.length} log events`)

		if (events.length === 0) {
			console.log()
			printInfo('No logs found in the specified time range')
			console.log()
			console.log(chalk.dim('💡 Try:'))
			console.log(chalk.dim('  • Increase time range: --hours 24'))
			console.log(chalk.dim('  • Remove filters to see all logs'))
			console.log(chalk.dim('  • Use --follow for live streaming'))
			return
		}

		console.log()
		for (const event of events) {
			const timestamp = new Date(event.timestamp!).toLocaleString()
			const message = event.message?.trim() || ''
			console.log(
				chalk.dim(`[${timestamp}]`), 
				formatLogMessage(message)
			)
		}
		console.log()

	} catch (error) {
		spinner.fail('Failed to fetch logs')
		throw error
	}
}

/**
 * Stream logs in real-time
 */
async function streamLogs(
	cw: CloudWatchLogs, 
	logGroupName: string, 
	filterPattern: string | undefined,
	initialLines: number
): Promise<void> {
	// First, get recent logs as context
	const spinner = createSpinner(`Loading last ${initialLines} log entries...`)
	spinner.start()

	let interrupted = false
	const interruptHandler = () => {
		interrupted = true
		console.log()
		printInfo('Stopped streaming logs.')
		process.exit(0)
	}

	try {
		process.on('SIGINT', interruptHandler)

		const recentEvents = await cw.getRecentLogs(logGroupName, 0.5, filterPattern, initialLines)
		spinner.succeed(`Loaded ${recentEvents.length} recent entries`)

		// Display recent logs
		if (recentEvents.length > 0) {
			console.log()
			console.log(chalk.dim('--- Recent logs ---'))
			for (const event of recentEvents) {
				const timestamp = new Date(event.timestamp!).toLocaleString()
				const message = event.message?.trim() || ''
				console.log(
					chalk.dim(`[${timestamp}]`), 
					formatLogMessage(message)
				)
			}
		}

		console.log()
		console.log(chalk.dim('--- Live logs (Press Ctrl+C to stop) ---'))
		console.log()

		// Set up live streaming
		let lastTimestamp = recentEvents.length > 0 ? 
			Math.max(...recentEvents.map(e => e.timestamp || 0)) : 
			Date.now() - 1000

		// Poll for new logs every 2 seconds
		while (!interrupted) {
			await new Promise(resolve => setTimeout(resolve, 2000))

			try {
				const newEvents = await cw.getRecentLogs(
					logGroupName, 
					0.1, // Last 6 minutes to catch any delayed logs
					filterPattern, 
					100
				)

				// Filter to only new events
				const freshEvents = newEvents.filter(event => 
					(event.timestamp || 0) > lastTimestamp
				)

				if (freshEvents.length > 0) {
					for (const event of freshEvents) {
						const timestamp = new Date(event.timestamp!).toLocaleString()
						const message = event.message?.trim() || ''
						console.log(
							chalk.dim(`[${timestamp}]`), 
							formatLogMessage(message)
						)
					}
					
					lastTimestamp = Math.max(...freshEvents.map(e => e.timestamp || 0))
				}
			} catch (error) {
				// Don't break streaming for temporary errors
				console.log(chalk.red(`[${new Date().toLocaleString()}] Error fetching logs: ${error}`))
			}
		}

	} catch (error) {
		spinner.fail('Failed to start log streaming')
		throw error
	} finally {
		process.removeListener('SIGINT', interruptHandler)
	}
}
