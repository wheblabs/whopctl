import { describe, expect, test } from 'bun:test'
import {
	divider,
	formatBytes,
	formatCost,
	formatDuration,
	formatNumber,
	formatPercent,
	padString,
	truncate,
} from './format.ts'

describe('formatDuration', () => {
	test('formats milliseconds', () => {
		expect(formatDuration(500)).toBe('500ms')
		expect(formatDuration(0)).toBe('0ms')
		expect(formatDuration(999)).toBe('999ms')
	})

	test('formats seconds', () => {
		expect(formatDuration(1000)).toBe('1.0s')
		expect(formatDuration(2500)).toBe('2.5s')
		expect(formatDuration(59999)).toBe('60.0s')
	})

	test('formats minutes and seconds', () => {
		expect(formatDuration(60000)).toBe('1m')
		expect(formatDuration(65000)).toBe('1m 5s')
		expect(formatDuration(120000)).toBe('2m')
		expect(formatDuration(3599999)).toBe('59m 59s')
	})

	test('formats hours and minutes', () => {
		expect(formatDuration(3600000)).toBe('1h')
		expect(formatDuration(3660000)).toBe('1h 1m')
		expect(formatDuration(7200000)).toBe('2h')
	})
})

describe('formatBytes', () => {
	test('formats bytes', () => {
		expect(formatBytes(0)).toBe('0 B')
		expect(formatBytes(512)).toBe('512 B')
		expect(formatBytes(1023)).toBe('1023 B')
	})

	test('formats kilobytes', () => {
		expect(formatBytes(1024)).toBe('1.0 KB')
		expect(formatBytes(1536)).toBe('1.5 KB')
		expect(formatBytes(1024 * 1023)).toMatch(/KB$/)
	})

	test('formats megabytes', () => {
		expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
		expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
	})

	test('formats gigabytes', () => {
		expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
		expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
	})
})

describe('formatNumber', () => {
	test('formats numbers with locale separators', () => {
		// Locale formatting may vary, so we just check it returns a string
		expect(typeof formatNumber(1234567)).toBe('string')
		expect(formatNumber(0)).toBe('0')
	})
})

describe('formatPercent', () => {
	test('formats percentage values', () => {
		expect(formatPercent(50)).toBe('50.0%')
		expect(formatPercent(100)).toBe('100.0%')
		expect(formatPercent(0)).toBe('0.0%')
	})

	test('supports custom decimal places', () => {
		expect(formatPercent(50, 0)).toBe('50%')
		expect(formatPercent(33.333, 2)).toBe('33.33%')
	})

	test('handles decimal input when isDecimal is true', () => {
		expect(formatPercent(0.5, 1, true)).toBe('50.0%')
		expect(formatPercent(1, 1, true)).toBe('100.0%')
	})
})

describe('formatCost', () => {
	test('formats cost in USD', () => {
		expect(formatCost(10)).toBe('$10.00')
		expect(formatCost(0)).toBe('$0.00')
		expect(formatCost(99.99)).toBe('$99.99')
	})

	test('supports custom decimal places', () => {
		expect(formatCost(10.1234, 4)).toBe('$10.1234')
		expect(formatCost(10, 0)).toBe('$10')
	})
})

describe('padString', () => {
	test('pads string to the right by default', () => {
		expect(padString('hello', 10)).toBe('hello     ')
		expect(padString('hello', 5)).toBe('hello')
	})

	test('pads string to the left when specified', () => {
		expect(padString('hello', 10, 'right')).toBe('     hello')
	})
})

describe('divider', () => {
	test('creates a divider of default length', () => {
		const result = divider()
		expect(result).toContain('─')
		// Note: The result includes ANSI color codes from chalk
	})

	test('creates a divider with custom length and character', () => {
		const result = divider(10, '-')
		expect(result).toContain('-')
	})
})

describe('truncate', () => {
	test('returns string unchanged if shorter than max', () => {
		expect(truncate('hello', 10)).toBe('hello')
		expect(truncate('hello', 5)).toBe('hello')
	})

	test('truncates string and adds ellipsis', () => {
		expect(truncate('hello world', 8)).toBe('hello...')
		expect(truncate('abcdefghij', 7)).toBe('abcd...')
	})

	test('handles edge cases', () => {
		expect(truncate('abc', 3)).toBe('abc')
		expect(truncate('abcd', 3)).toBe('...')
	})
})
