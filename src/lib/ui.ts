import boxen, { type Options as BoxenOptions } from 'boxen'
import chalk from 'chalk'
import Table from 'cli-table3'
import gradient from 'gradient-string'

type TableColumn<T> = {
	key: keyof T
	label?: string
	align?: 'left' | 'right' | 'center'
}

type CalloutKind = 'info' | 'success' | 'warn' | 'error'

const termWidth = Math.min(Math.max(process.stdout.columns ?? 80, 60), 120)
const supportsColor = process.stdout.isTTY && chalk.level > 0

const palette = {
	primary: '#38bdf8',
	secondary: '#a855f7',
	success: '#22c55e',
	warn: '#fbbf24',
	error: '#f87171',
	info: '#22d3ee',
	muted: '#94a3b8',
}

export const icons = {
	info: 'ℹ',
	success: '✓',
	warn: '⚠',
	error: '✗',
	rocket: '🚀',
	sparkles: '✨',
	logs: '📋',
	link: '🔗',
}

const gradientTitle = gradient([palette.primary, palette.secondary])

export function divider(length = termWidth - 10): string {
	const len = Math.max(20, Math.min(length, termWidth - 2))
	return chalk.gray('─'.repeat(len))
}

export function banner(
	title: string,
	subtitle?: string,
	options?: { tag?: string; padding?: number | BoxenOptions['padding'] },
): string {
	const formattedTitle = supportsColor ? gradientTitle(title) : title
	const tag = options?.tag ? chalk.white.bold(options.tag) : ''
	const content = [formattedTitle, subtitle ? chalk.gray(subtitle) : null, tag ? ` ${tag}` : null]
		.filter(Boolean)
		.join('\n')

	return boxen(content, {
		padding: options?.padding ?? { top: 1, right: 2, bottom: 1, left: 2 },
		borderStyle: 'round',
		borderColor: 'cyan',
		dimBorder: true,
		align: 'center',
	})
}

export function section(title: string, hint?: string): string {
	const label = `${chalk.bold.cyan(title)}${hint ? chalk.gray(` · ${hint}`) : ''}`
	return `${label}\n${divider(title.length + (hint?.length ?? 0) + 3)}`
}

export function pill(text: string, variant: CalloutKind | 'primary' = 'info'): string {
	const color =
		variant === 'success'
			? chalk.bgGreen.black
			: variant === 'warn'
				? chalk.bgYellow.black
				: variant === 'error'
					? chalk.bgRed.white
					: variant === 'primary'
						? chalk.bgCyan.black
						: chalk.bgBlue.white
	return color(` ${text} `)
}

export function bulletList(
	items: Array<string | { text: string; icon?: string; dim?: boolean }>,
): string {
	return items
		.map((item) => {
			const { text, icon, dim } = typeof item === 'string' ? { text: item } : item
			const bullet = icon ?? '•'
			const line = `${chalk.cyan(bullet)} ${text}`
			return dim ? chalk.dim(line) : line
		})
		.join('\n')
}

export function keyValues(
	rows: Array<{ label: string; value: string | number; hint?: string; dimValue?: boolean }>,
): string {
	const maxLabel = Math.max(...rows.map((row) => row.label.length))
	return rows
		.map((row) => {
			const label = chalk.gray(row.label.padEnd(maxLabel))
			const value = row.dimValue ? chalk.dim(String(row.value)) : chalk.bold(String(row.value))
			const hint = row.hint ? chalk.dim(`  ${row.hint}`) : ''
			return `${label}  ${value}${hint}`
		})
		.join('\n')
}

export function renderTable<T extends Record<string, unknown>>(
	rows: T[],
	columns: TableColumn<T>[],
	options?: { compact?: boolean; border?: boolean },
): string {
	if (!rows || rows.length === 0) return chalk.dim('No data to display')

	const table = new Table({
		head: columns.map((col) => chalk.cyan(col.label ?? String(col.key))),
		colAligns: columns.map((col) => col.align ?? 'left'),
		style: {
			head: supportsColor ? undefined : [],
			border: options?.border === false ? [] : undefined,
			compact: options?.compact ?? true,
		},
		wordWrap: true,
		wrapOnWordBoundary: false,
	})

	for (const row of rows) {
		table.push(columns.map((col) => row[col.key] ?? ''))
	}

	return table.toString()
}

export function callout(
	kind: CalloutKind,
	title: string,
	body?: string | string[],
	options?: { borderTitle?: string },
): string {
	const icon = icons[kind]
	const bodyLines = Array.isArray(body) ? body : body ? [body] : []
	const content = [
		chalk.bold(`${icon} ${title}`),
		...bodyLines.map((line) => chalk.white(line)),
	].join('\n')

	return boxen(content, {
		padding: { top: 0, right: 1, bottom: 0, left: 1 },
		borderStyle: 'round',
		borderColor:
			kind === 'success' ? 'green' : kind === 'warn' ? 'yellow' : kind === 'error' ? 'red' : 'cyan',
		dimBorder: true,
		title: options?.borderTitle,
		titleAlignment: 'center',
	})
}

export function softDivider(): string {
	return chalk.dim('·'.repeat(Math.max(20, Math.min(termWidth - 4, 60))))
}
