import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printTable } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

interface TierInfo {
	tier: 'free' | 'hobby' | 'pro'
	tierInfo: {
		name: string
		monthlyPrice: number
		limits: {
			functionInvocations: number
			bandwidthGb: number
			buildMinutes: number
			storageGb: number
			deployments: number
		}
		overageRates: {
			functionInvocations: number
			bandwidthGb: number
			buildMinutes: number
			storageGb: number
		}
	}
	userId: number
}

/**
 * Handles the "tier current" command.
 * 
 * Displays current pricing tier and limits.
 */
export async function tierCurrentCommand(): Promise<void> {
	requireAuth()

	try {
		printInfo('Fetching current tier...')

		const tierInfo = (await whopshipApi.getCurrentTier()) as TierInfo

		console.log('')
		printSuccess(`Current Tier: ${tierInfo.tierInfo.name}`)
		console.log('')

		const limitsTable = [
			{
				Limit: 'Function Invocations',
				Value: tierInfo.tierInfo.limits.functionInvocations.toLocaleString(),
			},
			{
				Limit: 'Bandwidth',
				Value: `${tierInfo.tierInfo.limits.bandwidthGb} GB`,
			},
			{
				Limit: 'Build Minutes',
				Value: tierInfo.tierInfo.limits.buildMinutes.toString(),
			},
			{
				Limit: 'Storage',
				Value: `${tierInfo.tierInfo.limits.storageGb} GB`,
			},
			{
				Limit: 'Deployments',
				Value: tierInfo.tierInfo.limits.deployments.toString(),
			},
		]

		printTable(limitsTable)
		console.log('')
		printInfo(`Monthly Price: $${tierInfo.tierInfo.monthlyPrice}`)
	} catch (error) {
		printError('Failed to fetch tier information')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}

