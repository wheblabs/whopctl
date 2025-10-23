import { stdin as input, stdout as output } from 'node:process'
import * as readline from 'node:readline/promises'
import { printError, printInfo, printSuccess, printWhopError } from '../lib/output.ts'
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
	const rl = readline.createInterface({ input, output })

	try {
		// Check if already authenticated
		if (whop.isAuthenticated()) {
			printInfo('You are already logged in.')
			const answer = await rl.question('Do you want to login with a different account? (y/N) ')
			if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
				rl.close()
				return
			}
		}

		// Step 1: Prompt for email
		const email = await rl.question('Enter your email: ')
		if (!email || !email.includes('@')) {
			printError('Invalid email address')
			rl.close()
			process.exit(1)
		}

		printInfo('Sending OTP to your email...')

		// Step 2: Send OTP
		let ticket: string
		try {
			ticket = await whop.auth.sendOTP(email)
		} catch (error) {
			printWhopError(error)
			rl.close()
			process.exit(1)
		}

		printSuccess('OTP sent! Check your email.')

		// Step 3: Prompt for OTP code
		const code = await rl.question('Enter the OTP code: ')
		if (!code || code.length < 4) {
			printError('Invalid OTP code')
			rl.close()
			process.exit(1)
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
			rl.close()
			process.exit(1)
		}

		printSuccess('Successfully authenticated!')
		printInfo(`Session saved to: ${sessionPath}`)
	} catch (error) {
		printError(`Login failed: ${error}`)
		process.exit(1)
	} finally {
		rl.close()
	}
}
