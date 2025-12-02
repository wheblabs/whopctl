import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { promptUser } from '../../lib/repl-prompt.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'

/**
 * Handles the "billing subscribe" command.
 * Initiates subscription flow for a tier.
 */
export async function billingSubscribeCommand(tier?: 'free' | 'hobby' | 'pro'): Promise<void> {
	requireAuth()

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

		// If tier not provided, prompt user
		let selectedTier: 'free' | 'hobby' | 'pro' = tier || 'free'

		if (!tier) {
			console.log()
			printInfo('Select a subscription tier:')
			console.log()
			console.log(`${chalk.cyan('1) Free')} - $0/month`)
			console.log('   • 100 function invocations/month')
			console.log('   • 1 GB bandwidth/month')
			console.log('   • 10 build minutes/month')
			console.log('   • 1 GB storage')
			console.log('   • 10 deployments/month')
			console.log()
			console.log(`${chalk.cyan('2) Hobby')} - $20/month`)
			console.log('   • 10,000 function invocations/month')
			console.log('   • 100 GB bandwidth/month')
			console.log('   • 100 build minutes/month')
			console.log('   • 10 GB storage')
			console.log('   • 100 deployments/month')
			console.log()
			console.log(`${chalk.cyan('3) Pro')} - $100/month`)
			console.log('   • 1,000,000 function invocations/month')
			console.log('   • 1 TB bandwidth/month')
			console.log('   • 1,000 build minutes/month')
			console.log('   • 100 GB storage')
			console.log('   • 1,000 deployments/month')
			console.log()

			const choice = await promptUser('Enter tier number (1-3) or name (free/hobby/pro): ')
			const choiceLower = choice.trim().toLowerCase()

			if (choiceLower === '1' || choiceLower === 'free') {
				selectedTier = 'free'
			} else if (choiceLower === '2' || choiceLower === 'hobby') {
				selectedTier = 'hobby'
			} else if (choiceLower === '3' || choiceLower === 'pro') {
				selectedTier = 'pro'
			} else {
				printError(`Invalid choice: ${choice}`)
				process.exit(1)
			}
		}

		printInfo(`Creating checkout session for ${selectedTier} tier...`)

		const result = await api.createCheckoutSession(selectedTier)

		if (!result.requiresPayment) {
			// Free tier - no payment needed
			console.log()
			printSuccess(`✓ ${result.tier} tier activated successfully!`)
			console.log()
			printInfo('You can now deploy your apps.')
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
	} catch (error: any) {
		printError('Failed to create checkout session')
		if (error?.message) {
			console.error(chalk.red(error.message))
		} else if (error instanceof Error) {
			console.error(chalk.red(error.message))
		} else {
			console.error(chalk.red(String(error)))
		}

		// Log additional error details if available
		if (error?.responseBody) {
			try {
				const errorJson = JSON.parse(error.responseBody)
				if (errorJson.error && errorJson.error !== error.message) {
					console.error(chalk.dim(`Error: ${errorJson.error}`))
				}
			} catch {
				// Ignore parse errors
			}
		}

		process.exit(1)
	}
}
