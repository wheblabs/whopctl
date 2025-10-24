import { printError, printInfo, printSuccess, printWhopError } from '../lib/output.ts'
import { isInReplMode } from '../lib/repl-context.ts'
import { promptUser } from '../lib/repl-prompt.ts'
import { sessionPath, whop } from '../lib/whop.ts'

/**
 * Handles the login command flow.
 *
 * This command:
 * 1. Prompts the user for their email
 * 2. Sends an OTP (one-time password) to their email
 * 3. Prompts for the OTP code
 * 4. Verifies the OTP and persists the session
 *
 * The session is saved to ~/.config/whopctl/session.json and will be
 * automatically loaded for future commands.
 */
export async function loginCommand(): Promise<void> {
	const inRepl = isInReplMode()

	try {
		// Check if already authenticated
		if (whop.isAuthenticated()) {
			printInfo('You are already logged in.')
			const answer = await promptUser('Do you want to login with a different account? (y/N) ')
			const trimmedAnswer = answer.trim().toLowerCase()
			if (trimmedAnswer !== 'y' && trimmedAnswer !== 'yes') {
				return
			}
		}

		// Step 1: Prompt for email
		const email = await promptUser('Enter your email: ')
		if (!email || !email.includes('@')) {
			printError('Invalid email address')
			if (!inRepl) {
				process.exit(1)
			}
			return
		}

		printInfo('Sending OTP to your email...')

		// Step 2: Send OTP
		let ticket: string
		try {
			ticket = await whop.auth.sendOTP(email)
		} catch (error) {
			printWhopError(error)
			if (!inRepl) {
				process.exit(1)
			}
			return
		}

		printSuccess('OTP sent! Check your email.')

		// Step 3: Prompt for OTP code
		const code = await promptUser('Enter the OTP code: ')
		if (!code || code.length < 4) {
			printError('Invalid OTP code')
			if (!inRepl) {
				process.exit(1)
			}
			return
		}

		printInfo('Verifying OTP...')

		// Step 4: Verify OTP and persist session
		try {
			await whop.auth.verify({
				code,
				ticket,
				persist: sessionPath,
			})
		} catch (error) {
			printWhopError(error)
			if (!inRepl) {
				process.exit(1)
			}
			return
		}

		printSuccess('Successfully authenticated!')
		printInfo(`Session saved to: ${sessionPath}`)
	} catch (error) {
		printError(`Login failed: ${error}`)
		if (!inRepl) {
			process.exit(1)
		}
	}
}
