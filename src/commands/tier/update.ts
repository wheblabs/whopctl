import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

interface TierUpdateResponse {
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
 * Handles the "tier update" command.
 *
 * Updates the user's pricing tier.
 */
export async function tierUpdateCommand(tier: 'free' | 'hobby' | 'pro'): Promise<void> {
	requireAuth()

	if (!['free', 'hobby', 'pro'].includes(tier)) {
		printError('Invalid tier. Must be one of: free, hobby, pro')
		process.exit(1)
	}

	try {
		printInfo(`Updating tier to ${tier}...`)

		const response = (await whopshipApi.updateTier(tier)) as TierUpdateResponse

		console.log('')
		printSuccess(`Tier updated from ${response.previousTier} to ${response.tier}`)
		printInfo(`New tier: ${response.tierInfo.name}`)
		printInfo(`Monthly price: $${response.tierInfo.monthlyPrice}`)
	} catch (error) {
		printError('Failed to update tier')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}
