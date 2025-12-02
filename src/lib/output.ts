import {
	WhopAPIError,
	WhopAuthError,
	WhopError,
	WhopHTTPError,
	WhopNetworkError,
	WhopParseError,
	WhopServerActionError,
} from '@whoplabs/whop-client'
import chalk from 'chalk'

/**
 * Prints an error message in red to stderr.
 */
export function printError(message: string): void {
	console.error(chalk.red('✗'), message)
}

/**
 * Prints a success message in green.
 */
export function printSuccess(message: string): void {
	console.log(chalk.green('✓'), message)
}

/**
 * Prints an info message in blue.
 */
export function printInfo(message: string): void {
	console.log(chalk.blue('ℹ'), message)
}

/**
 * Prints a warning message in yellow.
 */
export function printWarning(message: string): void {
	console.log(chalk.yellow('⚠'), message)
}

/**
 * Friendly error translations for common error patterns
 */
interface FriendlyError {
	message: string
	whatToDo: string[]
	docsLink?: string
}

const ERROR_TRANSLATIONS: Record<string, FriendlyError> = {
	ENOENT: {
		message: 'File or directory not found',
		whatToDo: [
			"Make sure you're in the correct directory",
			'Run: whopctl init to set up your project',
		],
	},
	EACCES: {
		message: 'Permission denied',
		whatToDo: [
			'Check that you have permission to access this file',
			'Try running the command with appropriate permissions',
		],
	},
	'401': {
		message: 'Authentication required',
		whatToDo: [
			'Run: whopctl login',
			'If already logged in, try: whopctl logout then whopctl login',
		],
	},
	'403': {
		message: 'Access denied',
		whatToDo: [
			'Check that you have permission to access this resource',
			"Make sure you're using the correct App ID and Company ID",
		],
	},
	'404': {
		message: 'Resource not found',
		whatToDo: [
			'Check that your App ID and Company ID are correct',
			'Verify the resource exists in your Whop dashboard',
		],
	},
	'402': {
		message: 'Payment or billing issue',
		whatToDo: [
			'Check your subscription status: whopctl billing current',
			'Upgrade your plan if needed: whopctl billing subscribe',
		],
	},
	'429': {
		message: 'Too many requests - please slow down',
		whatToDo: ['Wait a few seconds and try again', 'Reduce the frequency of your requests'],
	},
	'500': {
		message: 'Server error - this is on our end',
		whatToDo: ['Wait a few minutes and try again', 'Check status at: https://status.whopship.app'],
	},
	'502': {
		message: 'Service temporarily unavailable',
		whatToDo: ['Wait a few minutes and try again', 'Check status at: https://status.whopship.app'],
	},
	'503': {
		message: 'Service temporarily unavailable',
		whatToDo: ['Wait a few minutes and try again', 'Check status at: https://status.whopship.app'],
	},
	ECONNREFUSED: {
		message: 'Could not connect to the server',
		whatToDo: ['Check your internet connection', 'Run: whopctl doctor to diagnose issues'],
	},
	ETIMEDOUT: {
		message: 'Connection timed out',
		whatToDo: [
			'Check your internet connection',
			'The server might be busy, try again in a few seconds',
		],
	},
	ENOTFOUND: {
		message: 'Could not find the server',
		whatToDo: ['Check your internet connection', 'Make sure DNS is working correctly'],
	},
	'fetch failed': {
		message: 'Network request failed',
		whatToDo: ['Check your internet connection', 'Run: whopctl doctor to diagnose issues'],
	},
	'.env': {
		message: 'Environment configuration issue',
		whatToDo: [
			'Run: whopctl init to set up your environment',
			'Make sure .env file exists with required variables',
		],
	},
	'package.json': {
		message: 'Project configuration issue',
		whatToDo: [
			"Make sure you're in a valid project directory",
			'Run: npm init or whopctl init to set up',
		],
	},
	'Build failed': {
		message: 'Your app failed to build',
		whatToDo: [
			'Test locally first: npm run build',
			'Check the build logs: whopctl status --logs',
			'Run: whopctl doctor to check your setup',
		],
	},
}

/**
 * Translate technical error to friendly message
 */
function translateError(error: string): FriendlyError | null {
	for (const [pattern, translation] of Object.entries(ERROR_TRANSLATIONS)) {
		if (error.includes(pattern)) {
			return translation
		}
	}
	return null
}

/**
 * Print a user-friendly error with guidance
 */
export function printFriendlyError(error: unknown): void {
	const errorMessage = error instanceof Error ? error.message : String(error)
	const translation = translateError(errorMessage)

	console.log()
	if (translation) {
		console.log(chalk.red.bold('Something went wrong'))
		console.log(chalk.red(`${translation.message}`))
		console.log()
		console.log(chalk.bold('What to do:'))
		for (const step of translation.whatToDo) {
			console.log(chalk.cyan(`  → ${step}`))
		}
		if (translation.docsLink) {
			console.log()
			console.log(chalk.dim(`Learn more: ${translation.docsLink}`))
		}
	} else {
		// Fall back to showing the actual error
		console.log(chalk.red.bold('An error occurred'))
		console.log(chalk.red(errorMessage))
		console.log()
		console.log(chalk.bold('What to do:'))
		console.log(chalk.cyan('  → Run: whopctl doctor to diagnose issues'))
		console.log(chalk.cyan('  → Check the docs: whopctl docs'))
	}
	console.log()
	console.log(chalk.dim('─'.repeat(50)))
	console.log(chalk.dim('Still stuck? Visit: https://docs.whopship.app/help'))
	console.log()
}

/**
 * Formats and prints a simple table from an array of objects.
 *
 * @param data Array of objects to display as a table
 * @param columns Optional array of column keys to display (defaults to all keys from first object)
 */
export function printTable<T extends Record<string, unknown>>(
	data: T[],
	columns?: (keyof T)[],
): void {
	if (data.length === 0) {
		printInfo('No data to display')
		return
	}

	const cols = columns || (Object.keys(data[0] ?? {}) as (keyof T)[])
	const colWidths = new Map<keyof T, number>()

	// Calculate column widths
	for (const col of cols) {
		const headerWidth = String(col).length
		const maxDataWidth = Math.max(...data.map((row) => String(row[col] ?? '').length))
		colWidths.set(col, Math.max(headerWidth, maxDataWidth))
	}

	// Print header
	const header = cols
		.map((col) => {
			const width = colWidths.get(col) ?? 0
			return chalk.bold(String(col).padEnd(width))
		})
		.join('  ')
	console.log(header)

	// Print separator
	const separator = cols
		.map((col) => {
			const width = colWidths.get(col) ?? 0
			return '─'.repeat(width)
		})
		.join('  ')
	console.log(chalk.dim(separator))

	// Print rows
	for (const row of data) {
		const rowStr = cols
			.map((col) => {
				const width = colWidths.get(col) ?? 0
				return String(row[col] ?? '').padEnd(width)
			})
			.join('  ')
		console.log(rowStr)
	}
}

/**
 * Handles and prints WhopError instances with actionable guidance.
 *
 * This function maps different error types to user-friendly messages:
 * - WhopAuthError: Authentication issues (invalid OTP, missing session)
 * - WhopHTTPError: HTTP errors with status codes
 * - WhopNetworkError: Network/fetch failures
 * - WhopAPIError: GraphQL API errors
 *
 * @param error The WhopError to handle
 */
export function printWhopError(error: unknown): void {
	if (!(error instanceof WhopError)) {
		printError(`Unexpected error: ${error}`)
		return
	}

	if (error instanceof WhopAuthError) {
		printError(`Authentication error: ${error.message}`)
		if (error.code === 'INVALID_OTP') {
			printInfo('The OTP code you entered is invalid or has expired.')
			printInfo('Please try logging in again.')
		} else if (error.code === 'AUTH_INIT_FAILED') {
			printInfo('Failed to initialize authentication.')
			printInfo('Please check your internet connection and try again.')
		} else {
			printInfo('Please run "whopctl login" to authenticate.')
		}
	} else if (error instanceof WhopHTTPError) {
		printError(`HTTP error (${error.statusCode}): ${error.message}`)
		if (error.responseBody) {
			console.error(chalk.dim('Response:'), error.responseBody)
		}
	} else if (error instanceof WhopNetworkError) {
		printError(`Network error: ${error.message}`)
		printInfo('Please check your internet connection and try again.')
		if (error.cause) {
			console.error(chalk.dim('Cause:'), error.cause)
		}
	} else if (error instanceof WhopAPIError) {
		printError(`API error: ${error.message}`)
		if (error.code) {
			console.error(chalk.dim('Error code:'), error.code)
		}
	} else if (error instanceof WhopParseError) {
		printError(`Parse error: ${error.message}`)
		if (error.code) {
			console.error(chalk.dim('Error code:'), error.code)
		}
		printInfo('This might indicate that Whop has changed their API format.')
		printInfo('Please try again, or report this issue if it persists.')
	} else if (error instanceof WhopServerActionError) {
		printError(`Server action error: ${error.message}`)
		if (error.code) {
			console.error(chalk.dim('Error code:'), error.code)
		}
		printInfo('This might indicate that Whop has changed their frontend structure.')
		printInfo('Please try again, or report this issue if it persists.')
	} else {
		printError(`Whop error: ${error.message}`)
		if (error.code) {
			console.error(chalk.dim('Error code:'), error.code)
		}
	}
}
