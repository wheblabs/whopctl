import chalk from 'chalk'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

/**
 * Handles the "billing periods" command.
 *
 * Fetches and displays billing periods.
 */
export async function billingPeriodsCommand(limit?: number): Promise<void> {
	try {
		printInfo('Fetching billing periods...')

		const data = await whopshipApi.getBillingPeriods(limit || 12) as any

		if (!data.periods || data.periods.length === 0) {
			printInfo('No billing periods found.')
			return
		}

		console.log('')
		printSuccess(`Billing Periods (${data.periods.length})`)
		console.log('')

		data.periods.forEach((period: any, index: number) => {
			console.log(chalk.bold(`Period ${index + 1}:`))
			console.log(`  Start: ${chalk.cyan(new Date(period.periodStart).toLocaleDateString())}`)
			console.log(`  End: ${chalk.cyan(new Date(period.periodEnd).toLocaleDateString())}`)
			console.log(`  Status: ${chalk.cyan(period.status)}`)
			console.log(`  Total Cost: ${chalk.green('$' + parseFloat(period.totalCost || '0').toFixed(2))}`)
			if (period.invoiceId) {
				console.log(`  Invoice ID: ${chalk.dim(period.invoiceId)}`)
			}
			if (period.metadata?.plan) {
				console.log(`  Plan: ${chalk.cyan(period.metadata.plan)}`)
			}
			console.log('')
		})
	} catch (error) {
		printError('Failed to fetch billing periods')
		if (error instanceof Error) {
			console.error(chalk.red(error.message))
		}
		throw error
	}
}
