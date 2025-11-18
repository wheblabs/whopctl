import { printInfo } from '../../lib/output.ts'

/**
 * Handles the "billing current" command.
 *
 * Billing features are coming soon!
 */
export async function billingCurrentCommand(_appId?: number): Promise<void> {
	printInfo('Billing features are coming soon!')
	printInfo('Stay tuned for usage tracking and billing information.')
}
