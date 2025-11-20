import chalk from 'chalk'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

/**
 * Handles the "billing current" command.
 *
 * Fetches and displays current billing period usage.
 */
export async function billingCurrentCommand(appId?: number): Promise<void> {
	try {
		printInfo('Fetching current billing period...')

		const data = await whopshipApi.getCurrentUsage(appId) as any

		console.log('')
		printSuccess('Current Billing Period')
		console.log('')

		if (data.appId) {
			console.log(chalk.dim(`App ID: ${data.appId}`))
		}
		console.log('')

		console.log(chalk.bold('Function Invocations:'))
		console.log(`  ${chalk.cyan(data.functionInvocations?.toLocaleString() || '0')}`)
		console.log('')

		console.log(chalk.bold('Bandwidth:'))
		console.log(`  ${chalk.cyan(parseFloat(data.bandwidthGb || '0').toFixed(2))} GB`)
		console.log('')

		console.log(chalk.bold('Build Minutes:'))
		console.log(`  ${chalk.cyan(parseFloat(data.buildMinutes || '0').toFixed(2))}`)
		console.log('')

		console.log(chalk.bold('Storage:'))
		console.log(`  ${chalk.cyan(parseFloat(data.storageGb || '0').toFixed(2))} GB`)
		console.log('')

		console.log(chalk.bold('Deployments:'))
		console.log(`  ${chalk.cyan(data.deployments?.toLocaleString() || '0')}`)
		console.log('')

		console.log(chalk.bold('Compute (GB-seconds):'))
		console.log(`  ${chalk.cyan(parseFloat(data.computeGbSeconds || '0').toFixed(2))}`)
		console.log('')

		if (data.costUsd !== undefined) {
			console.log(chalk.bold('Cost:'))
			console.log(`  ${chalk.green('$' + parseFloat(data.costUsd || '0').toFixed(2))}`)
			console.log('')
		}
	} catch (error) {
		printError('Failed to fetch current billing period')
		if (error instanceof Error) {
			console.error(chalk.red(error.message))
		}
		throw error
	}
}
