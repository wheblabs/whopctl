import { describe, expect, test } from 'bun:test'
import {
	getContextualErrorMessage,
	getErrorMessage,
	isRetryableError,
	RetryableError,
	withRetry,
} from './retry.ts'
import { WhopshipApiError } from './whopship-client.ts'

describe('getErrorMessage', () => {
	test('extracts message from Error instance', () => {
		const error = new Error('Test error message')
		expect(getErrorMessage(error)).toBe('Test error message')
	})

	test('converts non-Error to string', () => {
		expect(getErrorMessage('string error')).toBe('string error')
		expect(getErrorMessage(42)).toBe('42')
		expect(getErrorMessage(null)).toBe('null')
		expect(getErrorMessage(undefined)).toBe('undefined')
	})

	test('handles WhopshipApiError', () => {
		const error = new WhopshipApiError('API failed', 500)
		expect(getErrorMessage(error)).toBe('API failed')
	})
})

describe('isRetryableError', () => {
	test('returns true for RetryableError', () => {
		const error = new RetryableError('Retryable')
		expect(isRetryableError(error)).toBe(true)
	})

	test('returns true for network error codes', () => {
		const errors = [
			{ code: 'ECONNRESET', message: 'Connection reset' },
			{ code: 'ENOTFOUND', message: 'Not found' },
			{ code: 'ETIMEDOUT', message: 'Timeout' },
			{ code: 'ECONNREFUSED', message: 'Connection refused' },
		]
		for (const error of errors) {
			expect(isRetryableError(error)).toBe(true)
		}
	})

	test('returns true for retryable HTTP status codes', () => {
		expect(isRetryableError(new WhopshipApiError('Timeout', 408))).toBe(true)
		expect(isRetryableError(new WhopshipApiError('Too many requests', 429))).toBe(true)
		expect(isRetryableError(new WhopshipApiError('Server error', 500))).toBe(true)
		expect(isRetryableError(new WhopshipApiError('Bad gateway', 502))).toBe(true)
	})

	test('returns false for non-retryable HTTP status codes', () => {
		expect(isRetryableError(new WhopshipApiError('Bad request', 400))).toBe(false)
		expect(isRetryableError(new WhopshipApiError('Unauthorized', 401))).toBe(false)
		expect(isRetryableError(new WhopshipApiError('Not found', 404))).toBe(false)
	})

	test('returns true for fetch TypeError', () => {
		const error = new TypeError('Failed to fetch')
		expect(isRetryableError(error)).toBe(true)
	})

	test('returns false for regular Error', () => {
		const error = new Error('Regular error')
		expect(isRetryableError(error)).toBe(false)
	})
})

describe('getContextualErrorMessage', () => {
	test('provides context for authentication errors', () => {
		const message = getContextualErrorMessage(new Error('401 Unauthorized'), 'authentication')
		expect(message).toContain('whopctl login')
	})

	test('provides context for network errors', () => {
		const message = getContextualErrorMessage(new Error('ENOTFOUND'), 'network')
		expect(message).toContain('Network error')
	})

	test('provides context for deployment errors', () => {
		const message = getContextualErrorMessage(new Error('404 Not Found'), 'deployment')
		expect(message).toContain('NEXT_PUBLIC_WHOP_APP_ID')
	})

	test('returns original message for unknown context', () => {
		const original = 'Some random error'
		const message = getContextualErrorMessage(new Error(original), 'unknown_context')
		expect(message).toBe(original)
	})
})

describe('withRetry', () => {
	test('returns result on first successful attempt', async () => {
		const operation = async () => 'success'
		const result = await withRetry(operation)
		expect(result).toBe('success')
	})

	test('retries on retryable error and eventually succeeds', async () => {
		let attempts = 0
		const operation = async () => {
			attempts++
			if (attempts < 2) {
				const error = new Error('Temporary failure')
				;(error as any).status = 500
				throw error
			}
			return 'success'
		}

		const result = await withRetry(operation, { baseDelay: 10 })
		expect(result).toBe('success')
		expect(attempts).toBe(2)
	})

	test('throws after max attempts', async () => {
		let attempts = 0
		const operation = async () => {
			attempts++
			const error = new Error('Always fails')
			;(error as any).status = 500
			throw error
		}

		await expect(withRetry(operation, { maxAttempts: 3, baseDelay: 10 })).rejects.toThrow(
			'Always fails',
		)
		expect(attempts).toBe(3)
	})

	test('does not retry non-retryable errors', async () => {
		let attempts = 0
		const operation = async () => {
			attempts++
			throw new WhopshipApiError('Not found', 404)
		}

		await expect(withRetry(operation, { maxAttempts: 3, baseDelay: 10 })).rejects.toThrow()
		expect(attempts).toBe(1)
	})
})
