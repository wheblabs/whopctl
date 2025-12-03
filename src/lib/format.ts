import chalk from 'chalk'

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * Examples:
 * - 500 -> "500ms"
 * - 2500 -> "2.5s"
 * - 65000 -> "1m 5s"
 * - 3700000 -> "1h 1m"
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
	const minutes = Math.floor(ms / 60000)
	const seconds = Math.floor((ms % 60000) / 1000)
	if (minutes < 60) {
		return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
	}
	const hours = Math.floor(minutes / 60)
	const remainingMinutes = minutes % 60
	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

/**
 * Format bytes to a human-readable string with appropriate units.
 *
 * Examples:
 * - 512 -> "512 B"
 * - 1536 -> "1.5 KB"
 * - 1572864 -> "1.5 MB"
 *
 * @param bytes - Number of bytes
 * @returns Formatted size string
 */
export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	let size = bytes
	let unitIndex = 0
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex++
	}
	return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

/**
 * Format a date to a relative time string (e.g., "2h ago", "3d ago").
 *
 * Uses color coding:
 * - Green: recent (< 1 hour)
 * - Yellow: today (1-24 hours)
 * - Dim: older
 *
 * @param dateString - ISO date string
 * @returns Colored relative time string
 */
export function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffMinutes = Math.floor(diffMs / (1000 * 60))
	const diffHours = Math.floor(diffMinutes / 60)
	const diffDays = Math.floor(diffHours / 24)

	if (diffMinutes < 1) {
		return chalk.green('just now')
	} else if (diffMinutes < 60) {
		return chalk.green(`${diffMinutes}m ago`)
	} else if (diffHours < 24) {
		return chalk.yellow(`${diffHours}h ago`)
	} else if (diffDays < 7) {
		return chalk.dim(`${diffDays}d ago`)
	} else {
		return chalk.dim(date.toLocaleDateString())
	}
}

/**
 * Format a date to a short relative time (without "ago").
 *
 * @param dateString - ISO date string
 * @returns Colored relative time string
 */
export function formatRelativeTimeShort(dateString: string): string {
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffMinutes = Math.floor(diffMs / (1000 * 60))
	const diffHours = Math.floor(diffMinutes / 60)
	const diffDays = Math.floor(diffHours / 24)

	if (diffMinutes < 1) {
		return chalk.green('now')
	} else if (diffMinutes < 60) {
		return chalk.green(`${diffMinutes}m`)
	} else if (diffHours < 24) {
		return chalk.yellow(`${diffHours}h`)
	} else if (diffDays < 7) {
		return chalk.dim(`${diffDays}d`)
	} else {
		return chalk.dim(date.toLocaleDateString())
	}
}

/**
 * Build status colors and formatting.
 */
const BUILD_STATUS_COLORS: Record<string, (text: string) => string> = {
	init: chalk.gray,
	uploading: chalk.blue,
	uploaded: chalk.cyan,
	queued: chalk.yellow,
	building: chalk.yellow,
	deploying: chalk.cyan,
	built: chalk.green,
	completed: chalk.green,
	deployed: chalk.green,
	active: chalk.green,
	failed: chalk.red,
	cancelled: chalk.gray,
}

const BUILD_STATUS_ICONS: Record<string, string> = {
	init: '🔄',
	uploading: '📤',
	uploaded: '📤',
	queued: '⏳',
	building: '🔨',
	deploying: '🚀',
	built: '✅',
	completed: '✅',
	deployed: '✅',
	active: '✅',
	failed: '❌',
	cancelled: '⏹️',
}

/**
 * Format a build status with color.
 *
 * @param status - Build status string
 * @returns Colored status string in uppercase
 */
export function formatBuildStatus(status: string): string {
	const colorFn = BUILD_STATUS_COLORS[status] || chalk.white
	return colorFn(status.toUpperCase())
}

/**
 * Format a build status with icon and color.
 *
 * @param status - Build status string
 * @returns Status with icon and color
 */
export function formatBuildStatusWithIcon(status: string): string {
	const colorFn = BUILD_STATUS_COLORS[status] || chalk.white
	const icon = BUILD_STATUS_ICONS[status] || '📦'
	return colorFn(`${icon} ${status}`)
}

/**
 * Format a number with locale-specific separators (e.g., 1,234,567).
 *
 * @param num - Number to format
 * @returns Formatted number string
 */
export function formatNumber(num: number): string {
	return num.toLocaleString()
}

/**
 * Format a percentage with a specified number of decimal places.
 *
 * @param value - The value (0-100 or 0-1 depending on isDecimal)
 * @param decimals - Number of decimal places (default: 1)
 * @param isDecimal - Whether value is already a decimal (0-1) (default: false)
 * @returns Formatted percentage string with % symbol
 */
export function formatPercent(value: number, decimals = 1, isDecimal = false): string {
	const percentage = isDecimal ? value * 100 : value
	return `${percentage.toFixed(decimals)}%`
}

/**
 * Format a cost in USD.
 *
 * @param amount - Amount in dollars
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted cost string with $ symbol
 */
export function formatCost(amount: number, decimals = 2): string {
	return `$${amount.toFixed(decimals)}`
}

/**
 * Pad a string to a specific length for table alignment.
 *
 * @param str - String to pad
 * @param length - Target length
 * @param align - Alignment ('left' | 'right') (default: 'left')
 * @returns Padded string
 */
export function padString(str: string, length: number, align: 'left' | 'right' = 'left'): string {
	if (align === 'right') {
		return str.padStart(length)
	}
	return str.padEnd(length)
}

/**
 * Create a horizontal divider line.
 *
 * @param length - Length of the divider (default: 50)
 * @param char - Character to use (default: '─')
 * @returns Dimmed divider string
 */
export function divider(length = 50, char = '─'): string {
	return chalk.gray(char.repeat(length))
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str
	return `${str.substring(0, maxLength - 3)}...`
}
