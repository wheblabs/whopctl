import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printTable } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

interface UsageSummary {
	id: number
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
	createdAt: string
	updatedAt: string
}

/**
 * Handles the "analytics summary" command.
 * 
 * Displays usage summary for a specific month.
 */
export async function analyticsSummaryCommand(
	appId?: number,
	month?: string,
): Promise<void> {
	requireAuth()

	try {
		printInfo('Fetching usage summary...')

		const summary = (await whopshipApi.getUsageSummary({
			appId,
			month,
		})) as UsageSummary

		console.log('')
		printSuccess(`Usage Summary for ${summary.month}`)
		console.log('')

		const tableData = [
			{
				Metric: 'Function Invocations',
				Value: summary.functionInvocations.toLocaleString(),
			},
			{
				Metric: 'Bandwidth',
				Value: `${parseFloat(summary.bandwidthGb).toFixed(2)} GB`,
			},
			{
				Metric: 'Build Minutes',
				Value: `${parseFloat(summary.buildMinutes).toFixed(2)}`,
			},
			{
				Metric: 'Storage',
				Value: `${parseFloat(summary.storageGb).toFixed(2)} GB`,
			},
			{
				Metric: 'Deployments',
				Value: summary.deployments.toLocaleString(),
			},
			{
				Metric: 'Compute (GB-seconds)',
				Value: `${parseFloat(summary.computeGbSeconds).toFixed(2)}`,
			},
			{
				Metric: 'Cost (USD)',
				Value: `$${parseFloat(summary.costUsd).toFixed(2)}`,
			},
		]

		printTable(tableData)
		console.log('')
		if (summary.appId) {
			printInfo(`App ID: ${summary.appId}`)
		}
	} catch (error) {
		printError('Failed to fetch usage summary')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}

