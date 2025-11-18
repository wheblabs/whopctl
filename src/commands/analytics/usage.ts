import { printInfo } from '../../lib/output.ts'

/**
 * Handles the "analytics usage" command.
 *
 * Analytics features are coming soon!
 */
export async function analyticsUsageCommand(
	_appId?: number,
	_startDate?: string,
	_endDate?: string,
): Promise<void> {
	printInfo('Analytics features are coming soon!')
	printInfo('Stay tuned for usage analytics and reporting capabilities.')
}
