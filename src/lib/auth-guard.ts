import { printError } from './output.ts'
import { isInReplMode } from './repl-context.ts'
import { whop } from './whop.ts'

/**
 * Error thrown when authentication is required but not present.
 * Used in REPL mode to avoid calling process.exit().
 */
export class AuthenticationRequiredError extends Error {
	constructor() {
		super('Not authenticated. Please run "login" first.')
		this.name = 'AuthenticationRequiredError'
	}
}

/**
 * Checks if the user is authenticated before running a command.
 *
 * This function:
 * - Checks if valid authentication tokens exist
 * - Prints a helpful error message if not authenticated
 * - In normal mode: Exits the process with code 1
 * - In REPL mode: Throws AuthenticationRequiredError to return to prompt
 *
 * Usage:
 * ```typescript
 * export async function listApps() {
 *   requireAuth();
 *   // Proceed with authenticated API calls
 * }
 * ```
 *
 * @returns void if authenticated
 * @throws AuthenticationRequiredError in REPL mode when not authenticated
 */
export function requireAuth(): void {
	if (!whop.isAuthenticated()) {
		if (isInReplMode()) {
			// In REPL mode, throw error instead of exiting
			throw new AuthenticationRequiredError()
		} else {
			// In normal CLI mode, exit the process
			printError('Not authenticated. Please run "whopctl login" first.')
			process.exit(1)
		}
	}
}
