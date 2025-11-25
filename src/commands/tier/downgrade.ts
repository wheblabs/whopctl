import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'

interface TierDowngradeResponse {
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
 * Handles the "tier downgrade" command.
 *
 * Downgrades the user's pricing tier.
 */
export async function tierDowngradeCommand(tier: 'free' | 'hobby' | 'pro'): Promise<void> {
	requireAuth()

	if (!['free', 'hobby', 'pro'].includes(tier)) {
		printError('Invalid tier. Must be one of: free, hobby, pro')
		process.exit(1)
	}

	try {
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
			uidToken: session.uidToken,
			ssk: session.ssk,
			userId: session.userId,
		})

		// For free tier, allow immediate downgrade
		if (tier === 'free') {
			printInfo(`Downgrading to free tier...`)
			const result = await api.createCheckoutSession('free')
			console.log()
			printSuccess(`✓ Downgraded to free tier`)
			console.log()
			return
		}

		// For paid tiers, use checkout flow
		printInfo(`Subscribing to ${tier} tier...`)
		const result = await api.createCheckoutSession(tier)

		if (!result.requiresPayment) {
			console.log()
			printSuccess(`✓ ${result.tier} tier activated successfully!`)
			console.log()
		} else {
			console.log()
			printSuccess('Checkout session created!')
			console.log()
			printInfo('Complete your subscription:')
			console.log(chalk.cyan(result.checkoutUrl))
			console.log()
			printInfo('After completing payment, your subscription will be activated automatically.')
			console.log()
		}
	} catch (error) {
		printError('Failed to change tier')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}
