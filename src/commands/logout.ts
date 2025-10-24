import { unlinkSync } from 'node:fs'
import { printError, printInfo, printSuccess, printWarning } from '../lib/output.ts'
import { isInReplMode } from '../lib/repl-context.ts'
import { sessionPath, whop } from '../lib/whop.ts'

/**
 * Handles the logout command.
 *
 * This command:
 * 1. Checks if the user is currently authenticated
 * 2. Deletes the session file from disk
 * 3. Notes that a restart may be needed in REPL mode
 *
 * After logout, the user will need to run `login` again to authenticate.
 * 
 * Note: In REPL mode, the Whop client keeps tokens in memory even after
 * the file is deleted. The user should restart the REPL or the tokens
 * will still be valid until the process ends.
 */
export async function logoutCommand(): Promise<void> {
	try {
		// Check if user is authenticated
		if (!whop.isAuthenticated()) {
			printInfo('You are not currently logged in.')
			return
		}

		// Delete the session file
		try {
			unlinkSync(sessionPath)
			printSuccess('Successfully logged out!')
			printInfo(`Session file removed: ${sessionPath}`)
			
			// Warn about REPL mode limitation
			if (isInReplMode()) {
				printWarning('Note: In REPL mode, you may need to restart (exit and reopen)')
				printWarning('for the logout to take full effect, as tokens are cached in memory.')
			}
		} catch (error) {
			// If file doesn't exist, that's fine
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				printSuccess('Successfully logged out!')
				if (isInReplMode()) {
					printWarning('Note: Restart the REPL for logout to take full effect.')
				}
			} else {
				throw error
			}
		}
	} catch (error) {
		printError('Failed to logout')
		if (error instanceof Error) {
			console.error(error.message)
		}
	}
}
