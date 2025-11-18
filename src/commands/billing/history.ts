import { printInfo } from '../../lib/output.ts'

/**
 * Handles the "billing history" command.
 *
 * Billing features are coming soon!
 */
export async function billingHistoryCommand(_appId?: number, _months?: number): Promise<void> {
	printInfo('Billing features are coming soon!')
	printInfo('Stay tuned for usage tracking and billing information.')
}
