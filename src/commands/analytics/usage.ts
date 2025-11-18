import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printTable } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

interface UsageData {
	userId: number
	appId: number | null
	startDate: string
	endDate: string
	usage: {
		functionInvocations: number
		bandwidthGb: number
		buildMinutes: number
		storageGb: number
		deployments: number
		computeGbSeconds: number
	}
}

/**
 * Handles the "analytics usage" command.
 * 
 * Displays usage data for a time period.
 */
export async function analyticsUsageCommand(
	appId?: number,
	startDate?: string,
	endDate?: string,
): Promise<void> {
	requireAuth()

	try {
		printInfo('Fetching usage data...')

		const data = (await whopshipApi.getUsage({
			appId,
			startDate,
			endDate,
		})) as UsageData

		console.log('')
		printSuccess('Usage Data')
		console.log('')

		const tableData = [
			{
				Metric: 'Function Invocations',
				Value: data.usage.functionInvocations.toLocaleString(),
			},
			{
				Metric: 'Bandwidth',
				Value: `${data.usage.bandwidthGb.toFixed(2)} GB`,
			},
			{
				Metric: 'Build Minutes',
				Value: `${data.usage.buildMinutes.toFixed(2)}`,
			},
			{
				Metric: 'Storage',
				Value: `${data.usage.storageGb.toFixed(2)} GB`,
			},
			{
				Metric: 'Deployments',
				Value: data.usage.deployments.toLocaleString(),
			},
			{
				Metric: 'Compute (GB-seconds)',
				Value: data.usage.computeGbSeconds.toFixed(2),
			},
		]

		printTable(tableData)
		console.log('')
		printInfo(`Period: ${new Date(data.startDate).toLocaleDateString()} - ${new Date(data.endDate).toLocaleDateString()}`)
		if (data.appId) {
			printInfo(`App ID: ${data.appId}`)
		}
	} catch (error) {
		printError('Failed to fetch usage data')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}

