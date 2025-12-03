import { printInfo, printWarning } from './output.ts'

/**
 * Error with HTTP status code
 */
export interface HttpError extends Error {
	status?: number
	code?: string
}

export interface RetryOptions {
	maxAttempts?: number
	baseDelay?: number
	maxDelay?: number
	backoffFactor?: number
	retryCondition?: (error: unknown) => boolean
	onRetry?: (error: unknown, attempt: number) => void
}

export class RetryableError extends Error {
	constructor(
		message: string,
		public originalError?: Error,
	) {
		super(message)
		this.name = 'RetryableError'
	}
}

/**
 * Type guard to check if an error has an HTTP status property
 */
function hasHttpStatus(error: unknown): error is HttpError {
	return (
		typeof error === 'object' &&
		error !== null &&
		'status' in error &&
		typeof (error as HttpError).status === 'number'
	)
}

/**
 * Type guard to check if an error has a code property (Node.js system errors)
 */
function hasErrorCode(error: unknown): error is { code: string } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		typeof (error as { code: string }).code === 'string'
	)
}

/**
 * Get error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}
	return String(error)
}

export async function withRetry<T>(
	operation: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const {
		maxAttempts = 3,
		baseDelay = 1000,
		maxDelay = 10000,
		backoffFactor = 2,
		retryCondition = (error) => isRetryableError(error),
		onRetry,
	} = options

	let lastError: Error

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error as Error

			// Don't retry on last attempt or if error is not retryable
			if (attempt === maxAttempts || !retryCondition(error)) {
				throw error
			}

			// Calculate delay with exponential backoff
			const delay = Math.min(baseDelay * backoffFactor ** (attempt - 1), maxDelay)

			if (onRetry) {
				onRetry(error, attempt)
			} else {
				printWarning(`Attempt ${attempt} failed, retrying in ${delay}ms...`)
			}

			await new Promise((resolve) => setTimeout(resolve, delay))
		}
	}

	throw lastError!
}

export function isRetryableError(error: unknown): boolean {
	if (error instanceof RetryableError) {
		return true
	}

	// Network errors (Node.js system errors)
	if (hasErrorCode(error)) {
		const retryableCodes = ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED']
		if (retryableCodes.includes(error.code)) {
			return true
		}
	}

	// HTTP errors that are typically retryable
	if (hasHttpStatus(error)) {
		const status = error.status
		return (
			status === 408 || status === 429 || (status !== undefined && status >= 500 && status < 600)
		)
	}

	// Fetch errors
	if (error instanceof TypeError && error.message.includes('fetch')) {
		return true
	}

	return false
}

export function createContextualError(error: unknown, context: string): Error {
	const contextualMessage = getContextualErrorMessage(error, context)
	const newError = new Error(contextualMessage)
	if (error instanceof Error) {
		newError.stack = error.stack
	}
	return newError
}

export function getContextualErrorMessage(error: unknown, context: string): string {
	const baseMessage = getErrorMessage(error)

	switch (context) {
		case 'authentication':
			if (baseMessage.includes('401') || baseMessage.includes('Unauthorized')) {
				return 'Authentication failed. Please run "whopctl login" to authenticate again.'
			}
			if (baseMessage.includes('403') || baseMessage.includes('Forbidden')) {
				return 'Access denied. Make sure you have permission to access this resource.'
			}
			break

		case 'network':
			if (baseMessage.includes('ENOTFOUND') || baseMessage.includes('getaddrinfo')) {
				return 'Network error: Unable to connect to WhopShip servers. Please check your internet connection.'
			}
			if (baseMessage.includes('ECONNRESET') || baseMessage.includes('ETIMEDOUT')) {
				return 'Connection timeout: The request took too long. This might be a temporary network issue.'
			}
			break

		case 'deployment':
			if (baseMessage.includes('404') || baseMessage.includes('Not Found')) {
				return 'App not found. Make sure your NEXT_PUBLIC_WHOP_APP_ID is correct in your .env file.'
			}
			if (baseMessage.includes('413') || baseMessage.includes('too large')) {
				return 'Upload failed: Your app is too large. Try reducing the size of your assets or node_modules.'
			}
			if (baseMessage.includes('Build failed')) {
				return `Build failed: ${baseMessage}\n\nTroubleshooting tips:\n• Ensure your app builds locally with "npm run build"\n• Check that all environment variables are set\n• Verify your Next.js configuration is correct`
			}
			break

		case 'file_system':
			if (baseMessage.includes('ENOENT')) {
				return "File not found. Make sure you're running the command from your project directory."
			}
			if (baseMessage.includes('EACCES')) {
				return 'Permission denied. You may need to run the command with appropriate permissions.'
			}
			break

		case 'validation':
			if (baseMessage.includes('NEXT_PUBLIC_WHOP_APP_ID')) {
				return 'Missing NEXT_PUBLIC_WHOP_APP_ID in your .env file. This is required for deployment.'
			}
			if (baseMessage.includes('NEXT_PUBLIC_WHOP_COMPANY_ID')) {
				return 'Missing NEXT_PUBLIC_WHOP_COMPANY_ID in your .env file. This is required for deployment.'
			}
			break
	}

	return baseMessage
}

export async function retryableRequest<T>(
	requestFn: () => Promise<T>,
	context: string = 'network',
): Promise<T> {
	return withRetry(requestFn, {
		maxAttempts: 3,
		baseDelay: 1000,
		retryCondition: (error: unknown) => {
			// Don't retry authentication errors
			if (context === 'authentication' && hasHttpStatus(error)) {
				if (error.status === 401 || error.status === 403) {
					return false
				}
			}
			return isRetryableError(error)
		},
		onRetry: (error: unknown, attempt: number) => {
			const contextualMessage = getContextualErrorMessage(error, context)
			printWarning(`${contextualMessage} (Attempt ${attempt}/3)`)
			if (attempt === 2) {
				printInfo('This might be a temporary issue. Trying one more time...')
			}
		},
	})
}
