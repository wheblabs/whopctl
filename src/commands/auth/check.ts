import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'

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

		// Get session tokens
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		// Create WhopshipAPI instance and fetch user info
	const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
		uidToken: session.uidToken,
		ssk: session.ssk,
		userId: session.userId,
	})

		const user = await api.getMe()

		// Display user information
		printSuccess('✓ Authentication valid')
		console.log()
		printInfo('User Information:')
		console.log(`  Username:     ${user.whopUsername}`)
		console.log(`  Display Name: ${user.whopDisplayName}`)
		console.log(`  Email:        ${user.whopEmail}`)
		console.log(`  User ID:      ${user.whopUserId}`)
	} catch (error) {
		printError(`Authentication check failed: ${error}`)
		process.exit(1)
	}
}
