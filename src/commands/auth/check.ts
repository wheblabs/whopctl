import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { whopshipClient } from '../../lib/whopship-client.ts'

/**
 * Checks authentication status and displays user information.
 *
 * This command:
 * 1. Verifies that authentication tokens exist
 * 2. Makes an API call to fetch user information
 * 3. Displays the user's details
 */
export async function checkAuthCommand(): Promise<void> {
	try {
		// Check if authenticated
		if (!whop.isAuthenticated()) {
			printError('Not authenticated. Please run "whopctl login" first.')
			process.exit(1)
		}

		printInfo('Checking authentication status...')

		const response = (await whopshipClient.getMe()) as { user: any }
		const user = response.user

		if (!user) {
			printError('Failed to retrieve user information from API')
			process.exit(1)
		}

		// Display user information
		printSuccess('✓ Authentication valid')
		console.log()
		printInfo('User Information:')
		console.log(`  Username:     ${user.whopUsername || 'N/A'}`)
		console.log(`  Display Name: ${user.whopDisplayName || 'N/A'}`)
		console.log(`  Email:        ${user.whopEmail || 'N/A'}`)
		console.log(`  User ID:      ${user.whopUserId || 'N/A'}`)
	} catch (error) {
		printError(`Authentication check failed: ${error}`)
		process.exit(1)
	}
}
