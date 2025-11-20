import chalk from 'chalk'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

/**
 * Handles the "billing history" command.
 *
 * Fetches and displays billing history.
 */
export async function billingHistoryCommand(appId?: number, months?: number): Promise<void> {
	try {
		printInfo('Fetching billing history...')

		const data = await whopshipApi.getUsageHistory({
			appId,
			months: months || 6,
		}) as any

		if (!data.summaries || data.summaries.length === 0) {
			printInfo('No billing history found.')
			return
		}

		console.log('')
		printSuccess(`Billing History (${data.summaries.length} periods)`)
		console.log('')

		data.summaries.forEach((summary: any, index: number) => {
			console.log(chalk.bold(`Period ${index + 1}: ${summary.month}`))
			if (summary.appId) {
				console.log(chalk.dim(`  App ID: ${summary.appId}`))
			}
			console.log(`  Function Invocations: ${chalk.cyan(summary.functionInvocations?.toLocaleString() || '0')}`)
			console.log(`  Bandwidth: ${chalk.cyan(parseFloat(summary.bandwidthGb || '0').toFixed(2))} GB`)
			console.log(`  Build Minutes: ${chalk.cyan(parseFloat(summary.buildMinutes || '0').toFixed(2))}`)
			console.log(`  Storage: ${chalk.cyan(parseFloat(summary.storageGb || '0').toFixed(2))} GB`)
			console.log(`  Deployments: ${chalk.cyan(summary.deployments?.toLocaleString() || '0')}`)
			console.log(`  Cost: ${chalk.green('$' + parseFloat(summary.costUsd || '0').toFixed(2))}`)
			console.log('')
		})
	} catch (error) {
		printError('Failed to fetch billing history')
		if (error instanceof Error) {
			console.error(chalk.red(error.message))
		}
		throw error
	}
}
