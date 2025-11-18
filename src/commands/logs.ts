import chalk from 'chalk'
import { requireAuth } from '../lib/auth-guard.ts'
import { CloudWatchLogs } from '../lib/cloudwatch.ts'
import { printError, printInfo, printSuccess } from '../lib/output.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'

export async function logsCommand(options: {
	type: 'deploy-runner' | 'router' | 'app'
	appId?: string
	buildId?: string
	hours?: number
}) {
	requireAuth()

	try {
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const cw = new CloudWatchLogs()
		let logGroupName: string

		// Determine which log group to query
		if (options.type === 'deploy-runner') {
			// The actual function name includes a random suffix, but we can search for it
			// For now, use the log group we know exists
			logGroupName = '/aws/lambda/whopship-infra-production-DeployRunnerFunction-dhkddrhs'
			printInfo(`Fetching deploy-runner logs (last ${options.hours || 1} hour)...`)

			if (options.buildId) {
				printInfo(`Filtering for build ID: ${options.buildId}`)
			}
		} else if (options.type === 'router') {
			logGroupName = '/aws/lambda/whopship-infra-production-RouterApi'
			printInfo(`Fetching router logs (last ${options.hours || 1} hour)...`)
		} else if (options.type === 'app') {
			if (!options.appId) {
				printError('--app-id required for app logs')
				process.exit(1)
			}

			// Get internal app ID from WhopShip API
			const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)
			const appInfo = await api.getAppInfo(options.appId)
			const internalAppId = appInfo.id

			logGroupName = `/aws/lambda/whopship-app-${internalAppId}`
			printInfo(`Fetching app logs for ${options.appId} (last ${options.hours || 1} hour)...`)
		}

		// Fetch logs
		const filterPattern = options.buildId ? `"${options.buildId}"` : undefined
		const events = await cw.getRecentLogs(logGroupName!, options.hours || 1, filterPattern)

		console.log()
		if (events.length === 0) {
			printInfo('No logs found in the specified time range')

			if (options.type === 'deploy-runner') {
				console.log()
				console.log(chalk.yellow('⚠️  This likely means:'))
				console.log(chalk.dim('   1. The deploy-runner Lambda never processed this build'))
				console.log(chalk.dim('   2. Check if the DEPLOY_QUEUE has messages'))
				console.log(chalk.dim('   3. Check if the deploy-runner Lambda has permissions'))
			}
		} else {
			printSuccess(`Found ${events.length} log events`)
			console.log()

			for (const event of events) {
				const timestamp = new Date(event.timestamp!).toLocaleString()
				console.log(chalk.dim(`[${timestamp}]`), event.message?.trim())
			}
		}

		console.log()
	} catch (error) {
		printError(`Failed to fetch logs: ${error}`)
		process.exit(1)
	}
}
