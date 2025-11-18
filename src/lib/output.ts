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
