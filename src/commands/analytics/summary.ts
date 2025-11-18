import { printInfo } from '../../lib/output.ts'

/**
 * Handles the "analytics summary" command.
 *
 * Analytics features are coming soon!
 */
export async function analyticsSummaryCommand(_appId?: number, _month?: string): Promise<void> {
	printInfo('Analytics features are coming soon!')
	printInfo('Stay tuned for usage analytics and reporting capabilities.')
}
