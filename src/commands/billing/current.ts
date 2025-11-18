import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printTable } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

interface CurrentUsage {
	userId: number
	appId: number | null
	month: string
	functionInvocations: number
	bandwidthGb: string
	buildMinutes: string
	storageGb: string
	deployments: number
	computeGbSeconds: string
	costUsd: string
}

/**
 * Handles the "billing current" command.
 * 
 * Displays current period usage and cost.
 */
export async function billingCurrentCommand(appId?: number): Promise<void> {
	requireAuth()

	try {
		printInfo('Fetching current period usage...')

		const usage = (await whopshipApi.getCurrentUsage(appId)) as CurrentUsage

		console.log('')
		printSuccess(`Current Period Usage (${usage.month})`)
		console.log('')

		const tableData = [
			{
				Metric: 'Function Invocations',
				Value: usage.functionInvocations.toLocaleString(),
			},
			{
				Metric: 'Bandwidth',
				Value: `${parseFloat(usage.bandwidthGb).toFixed(2)} GB`,
			},
			{
				Metric: 'Build Minutes',
				Value: `${parseFloat(usage.buildMinutes).toFixed(2)}`,
			},
			{
				Metric: 'Storage',
				Value: `${parseFloat(usage.storageGb).toFixed(2)} GB`,
			},
			{
				Metric: 'Deployments',
				Value: usage.deployments.toLocaleString(),
			},
			{
				Metric: 'Compute (GB-seconds)',
				Value: `${parseFloat(usage.computeGbSeconds).toFixed(2)}`,
			},
			{
				Metric: 'Cost (USD)',
				Value: `$${parseFloat(usage.costUsd).toFixed(2)}`,
			},
		]

		printTable(tableData)
		console.log('')
		if (usage.appId) {
			printInfo(`App ID: ${usage.appId}`)
		}
	} catch (error) {
		printError('Failed to fetch current usage')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}

