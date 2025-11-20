import chalk from 'chalk'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

/**
 * Handles the "analytics summary" command.
 *
 * Fetches and displays usage summary for a specific month.
 */
export async function analyticsSummaryCommand(appId?: number, month?: string): Promise<void> {
	try {
		printInfo('Fetching usage summary...')

		const summary = await whopshipApi.getUsageSummary({
			appId,
			month,
		}) as any

		console.log('')
		printSuccess('Usage Summary')
		console.log('')
		console.log(chalk.dim(`Month: ${summary.month}`))
		if (summary.appId) {
			console.log(chalk.dim(`App ID: ${summary.appId}`))
		}
		console.log('')

		console.log(chalk.bold('Function Invocations:'))
		console.log(`  ${chalk.cyan(summary.functionInvocations?.toLocaleString() || '0')}`)
		console.log('')

		console.log(chalk.bold('Bandwidth:'))
		console.log(`  ${chalk.cyan(parseFloat(summary.bandwidthGb || '0').toFixed(2))} GB`)
		console.log('')

		console.log(chalk.bold('Build Minutes:'))
		console.log(`  ${chalk.cyan(parseFloat(summary.buildMinutes || '0').toFixed(2))}`)
		console.log('')

		console.log(chalk.bold('Storage:'))
		console.log(`  ${chalk.cyan(parseFloat(summary.storageGb || '0').toFixed(2))} GB`)
		console.log('')

		console.log(chalk.bold('Deployments:'))
		console.log(`  ${chalk.cyan(summary.deployments?.toLocaleString() || '0')}`)
		console.log('')

		console.log(chalk.bold('Compute (GB-seconds):'))
		console.log(`  ${chalk.cyan(parseFloat(summary.computeGbSeconds || '0').toFixed(2))}`)
		console.log('')

		console.log(chalk.bold('Cost:'))
		console.log(`  ${chalk.green('$' + parseFloat(summary.costUsd || '0').toFixed(2))}`)
		console.log('')
	} catch (error) {
		printError('Failed to fetch usage summary')
		if (error instanceof Error) {
			console.error(chalk.red(error.message))
		}
		throw error
	}
}
