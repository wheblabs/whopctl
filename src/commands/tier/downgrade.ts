import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipClient } from '../../lib/whopship-client.ts'

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
		// For free tier, allow immediate downgrade
		if (tier === 'free') {
			printInfo(`Downgrading to free tier...`)
			const _result = await whopshipClient.createCheckoutSession('free')
			console.log()
			printSuccess(`✓ Downgraded to free tier`)
			console.log()
			return
		}

		// For paid tiers, use checkout flow
		printInfo(`Subscribing to ${tier} tier...`)
		const result = await whopshipClient.createCheckoutSession(tier)

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
