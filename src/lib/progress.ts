import ora, { type Ora, type SpinnerName } from 'ora'
import chalk from 'chalk'

export interface ProgressOptions {
	total?: number
	width?: number
	format?: string
	clear?: boolean
}

export interface TaskStep {
	title: string
	successText?: string
	errorText?: string
	action: () => Promise<void>
	spinner?: SpinnerName
}

export class ProgressBar {
	private current = 0
	private total: number
	private width: number
	private format: string
	private clear: boolean
	private startTime: number
	private lastUpdate = 0

	constructor(options: ProgressOptions = {}) {
		this.total = options.total || 100
		this.width = options.width || 40
		this.format = options.format || ':bar :percent :eta'
		this.clear = options.clear !== false
		this.startTime = Date.now()
	}

	tick(delta = 1, tokens: Record<string, any> = {}): void {
		this.current = Math.min(this.current + delta, this.total)
		this.render(tokens)
	}

	update(current: number, tokens: Record<string, any> = {}): void {
		this.current = Math.min(Math.max(current, 0), this.total)
		this.render(tokens)
	}

	private render(tokens: Record<string, any> = {}): void {
		// Throttle updates to avoid spam
		const now = Date.now()
		if (now - this.lastUpdate < 100 && this.current < this.total) {
			return
		}
		this.lastUpdate = now

		const percent = Math.floor((this.current / this.total) * 100)
		const completed = Math.floor((this.current / this.total) * this.width)
		const remaining = this.width - completed

		// Calculate ETA
		const elapsed = now - this.startTime
		const rate = this.current / elapsed
		const eta = rate > 0 ? Math.ceil((this.total - this.current) / rate / 1000) : 0

		const bar = chalk.green('█'.repeat(completed)) + chalk.gray('░'.repeat(remaining))

		let output = this.format
			.replace(':bar', `[${bar}]`)
			.replace(':percent', `${percent}%`)
			.replace(':current', this.current.toString())
			.replace(':total', this.total.toString())
			.replace(':eta', eta > 0 ? `${eta}s` : 'N/A')
			.replace(':elapsed', `${Math.floor(elapsed / 1000)}s`)

		// Replace custom tokens
		for (const [key, value] of Object.entries(tokens)) {
			output = output.replace(`:${key}`, String(value))
		}

		// Clear line and write
		process.stdout.write(`\r\x1b[K${output}`)

		// Add newline when complete
		if (this.current >= this.total) {
			process.stdout.write('\n')
		}
	}

	complete(): void {
		this.current = this.total
		this.render()
	}
}

export class Spinner {
	private ora: Ora | null
	private text: string
	private isSilent: boolean

	constructor(text = 'Loading...', spinner: SpinnerName = 'dots') {
		this.text = text
		this.isSilent = !process.stdout.isTTY
		this.ora = this.isSilent
			? null
			: ora({
					text,
					spinner,
					color: 'cyan',
			  })
	}

	start(): this {
		if (this.ora) {
			this.ora.start()
		} else {
			console.log(chalk.cyan(`… ${this.text}`))
		}
		return this
	}

	stop(symbol?: string, text?: string): this {
		if (this.ora) {
			if (symbol && text) {
				this.ora.stopAndPersist({ symbol, text })
			} else {
				this.ora.stop()
			}
		} else if (symbol && text) {
			console.log(`${symbol} ${text}`)
		}
		return this
	}

	succeed(text?: string): this {
		return this.stop(chalk.green('✓'), text || this.text)
	}

	fail(text?: string): this {
		return this.stop(chalk.red('✗'), text || this.text)
	}

	warn(text?: string): this {
		return this.stop(chalk.yellow('⚠'), text || this.text)
	}

	info(text?: string): this {
		return this.stop(chalk.blue('ℹ'), text || this.text)
	}

	setText(text: string): this {
		this.text = text
		if (this.ora) {
			this.ora.text = text
		}
		return this
	}
}

export function createSpinner(text?: string, spinner?: SpinnerName): Spinner {
	return new Spinner(text, spinner)
}

export async function runTasks(steps: TaskStep[]): Promise<void> {
	for (const step of steps) {
		const spinner = createSpinner(step.title, step.spinner).start()
		try {
			await step.action()
			spinner.succeed(step.successText || step.title)
		} catch (error) {
			spinner.fail(step.errorText || step.title)
			throw error
		}
	}
}

export function createProgressBar(options?: ProgressOptions): ProgressBar {
	return new ProgressBar(options)
}
