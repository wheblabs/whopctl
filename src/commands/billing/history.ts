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

interface UsageHistory {
	userId: number
	appId: number | null
	summaries: UsageSummary[]
}

/**
 * Handles the "billing history" command.
 * 
 * Displays usage history for the last N months.
 */
export async function billingHistoryCommand(
	appId?: number,
	months?: number,
): Promise<void> {
	requireAuth()

	try {
		printInfo('Fetching usage history...')

		const history = (await whopshipApi.getUsageHistory({
			appId,
			months,
		})) as UsageHistory

		if (history.summaries.length === 0) {
			printInfo('No usage history found.')
			return
		}

		console.log('')
		printSuccess(`Usage History (${history.summaries.length} month(s))`)
		console.log('')

		const tableData = history.summaries.map((summary) => ({
			Month: summary.month,
			Invocations: summary.functionInvocations.toLocaleString(),
			Bandwidth: `${parseFloat(summary.bandwidthGb).toFixed(2)} GB`,
			Builds: `${parseFloat(summary.buildMinutes).toFixed(1)} min`,
			Storage: `${parseFloat(summary.storageGb).toFixed(2)} GB`,
			Deployments: summary.deployments.toString(),
			Cost: `$${parseFloat(summary.costUsd).toFixed(2)}`,
		}))

		printTable(tableData)
		console.log('')
		if (history.appId) {
			printInfo(`App ID: ${history.appId}`)
		}
	} catch (error) {
		printError('Failed to fetch usage history')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}

