import chalk from 'chalk'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

/**
 * Handles the "analytics usage" command.
 *
 * Fetches and displays usage analytics for the authenticated user.
 */
export async function analyticsUsageCommand(
	appId?: number,
	startDate?: string,
	endDate?: string,
): Promise<void> {
	try {
		printInfo('Fetching usage analytics...')

		const data = await whopshipApi.getUsage({
			appId,
			startDate,
			endDate,
		}) as any

		if (!data.usage) {
			printInfo('No usage data found for the specified period.')
			return
		}

		const usage = data.usage

		console.log('')
		printSuccess('Usage Analytics')
		console.log('')
		console.log(chalk.dim(`Period: ${data.startDate} to ${data.endDate}`))
		if (data.appId) {
			console.log(chalk.dim(`App ID: ${data.appId}`))
		}
		console.log('')

		console.log(chalk.bold('Function Invocations:'))
		console.log(`  ${chalk.cyan(usage.functionInvocations?.toLocaleString() || '0')}`)
		console.log('')

		console.log(chalk.bold('Bandwidth:'))
		console.log(`  ${chalk.cyan((usage.bandwidthGb || 0).toFixed(2))} GB`)
		console.log('')

		console.log(chalk.bold('Build Minutes:'))
		console.log(`  ${chalk.cyan((usage.buildMinutes || 0).toFixed(2))}`)
		console.log('')

		console.log(chalk.bold('Storage:'))
		console.log(`  ${chalk.cyan((usage.storageGb || 0).toFixed(2))} GB`)
		console.log('')

		console.log(chalk.bold('Deployments:'))
		console.log(`  ${chalk.cyan(usage.deployments?.toLocaleString() || '0')}`)
		console.log('')

		console.log(chalk.bold('Compute (GB-seconds):'))
		console.log(`  ${chalk.cyan((usage.computeGbSeconds || 0).toFixed(2))}`)
		console.log('')
	} catch (error) {
		printError('Failed to fetch usage analytics')
		if (error instanceof Error) {
			console.error(chalk.red(error.message))
		}
		throw error
	}
}
