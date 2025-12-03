import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { readEnvFile } from '../../lib/env.ts'
import { printError, printInfo } from '../../lib/output.ts'
import { type WhopshipClient, whopshipClient } from '../../lib/whopship-client.ts'

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
 * Display build logs with follow support
 */
async function displayLogs(
	api: WhopshipClient,
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
			printInfo(`Build status is ${initialResult.status}. No need to follow.`)
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

export async function logsCommand(
	path: string = '.',
	options: { follow?: boolean; lines?: number } = {},
): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		const env = await readEnvFile(targetDir)
		const appId = env.NEXT_PUBLIC_WHOP_APP_ID

		if (!appId) {
			printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
			process.exit(1)
		}

		printInfo(`Fetching logs for app ${appId}...`)
		const build = await whopshipClient.getLatestBuildForApp(appId)

		console.log()
		printInfo(`Build ${build.build_id} - ${build.status.toUpperCase()}`)
		console.log()

		await displayLogs(whopshipClient, build.build_id, {
			lines: options.lines || 30,
			follow: options.follow || false,
		})
	} catch (error: any) {
		// Handle 404 or no logs gracefully
		if (error.message?.includes('404') || error.message?.includes('not found')) {
			printInfo('No logs available yet. Build may still be in queue.')
		} else {
			printError(`Failed to get logs: ${error}`)
			process.exit(1)
		}
	}
}
