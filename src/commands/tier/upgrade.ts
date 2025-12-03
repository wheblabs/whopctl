import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipClient } from '../../lib/whopship-client.ts'

/**
 * Handles the "tier upgrade" command.
 *
 * Upgrades the user's pricing tier via checkout flow.
 */
export async function tierUpgradeCommand(tier: 'free' | 'hobby' | 'pro'): Promise<void> {
	requireAuth()

	if (!['free', 'hobby', 'pro'].includes(tier)) {
		printError('Invalid tier. Must be one of: free, hobby, pro')
		process.exit(1)
	}

	try {
		printInfo(`Subscribing to ${tier} tier...`)

		const result = await whopshipClient.createCheckoutSession(tier)

		if (!result.requiresPayment) {
			// Free tier - no payment needed
			console.log()
			printSuccess(`✓ ${result.tier} tier activated successfully!`)
			console.log()
		} else {
			// Paid tier - show checkout URL
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
		printError('Failed to upgrade tier')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}
