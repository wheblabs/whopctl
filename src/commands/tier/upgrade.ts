import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

interface TierUpgradeResponse {
	success: boolean
	tier: 'free' | 'hobby' | 'pro'
	tierInfo: {
		name: string
		monthlyPrice: number
		limits: Record<string, unknown>
		overageRates: Record<string, unknown>
	}
	previousTier: 'free' | 'hobby' | 'pro'
	userId: number
}

/**
 * Handles the "tier upgrade" command.
 * 
 * Upgrades the user's pricing tier.
 */
export async function tierUpgradeCommand(tier: 'free' | 'hobby' | 'pro'): Promise<void> {
	requireAuth()

	if (!['free', 'hobby', 'pro'].includes(tier)) {
		printError('Invalid tier. Must be one of: free, hobby, pro')
		process.exit(1)
	}

	try {
		printInfo(`Upgrading tier to ${tier}...`)

		const response = (await whopshipApi.upgradeTier(tier)) as TierUpgradeResponse

		console.log('')
		printSuccess(`Tier upgraded from ${response.previousTier} to ${response.tier}`)
		printInfo(`New tier: ${response.tierInfo.name}`)
		printInfo(`Monthly price: $${response.tierInfo.monthlyPrice}`)
	} catch (error) {
		printError('Failed to upgrade tier')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}

