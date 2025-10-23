import { printError } from './output.ts'
import { whop } from './whop.ts'

/**
 * Checks if the user is authenticated before running a command.
 *
 * This function:
 * - Checks if valid authentication tokens exist
 * - Prints a helpful error message if not authenticated
 * - Exits the process with code 1 if authentication is missing
 *
 * Usage:
 * ```typescript
 * export async function listApps() {
 *   requireAuth();
 *   // Proceed with authenticated API calls
 * }
 * ```
 *
 * @returns void if authenticated, exits process otherwise
 */
export function requireAuth(): void {
	if (!whop.isAuthenticated()) {
		printError('Not authenticated. Please run "whopctl login" first.')
		process.exit(1)
	}
}
