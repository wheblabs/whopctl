import { join } from 'node:path'
import repl from 'node:repl'
import chalk from 'chalk'
import { setReplMode } from './repl-context.ts'
import { parseAndExecute, printReplHelp } from './repl-parser.ts'
import { setReplServer } from './repl-state.ts'
import { configDir } from './whop.ts'

/**
 * Extended REPL server interface with internal history property.
 * The history property is not officially typed but exists at runtime.
 */
interface ReplServerWithHistory extends repl.REPLServer {
	history?: string[]
}

/**
 * Starts the interactive REPL mode for whopctl.
 *
 * This function:
 * - Displays a welcome message
 * - Initializes a REPL server with custom prompt and styling
 * - Sets up command history persistence
 * - Defines utility commands (.help, .history, .search, etc.)
 * - Routes user input to command handlers
 *
 * The REPL allows users to run commands without typing "whopctl" each time.
 */
export async function startRepl(): Promise<void> {
	// Set global REPL mode flag
	setReplMode(true)

	// Print welcome message with ASCII art
	console.log(chalk.cyan('\n╔════════════════════════════════════════════════════╗'))
	console.log(
		`${chalk.cyan('║')}       Welcome to Whopctl Interactive Mode        ${chalk.cyan('║')}`,
	)
	console.log(chalk.cyan('╚════════════════════════════════════════════════════╝'))
	console.log(chalk.dim('\nType "help" for available commands or "exit" to quit\n'))

	// Create REPL server with custom configuration
	const replServer = repl.start({
		prompt: chalk.blue('whopctl ❯ '),
		useColors: true,
		ignoreUndefined: true,
		preview: false,
	})

	// Setup command history
	const historyFile = join(configDir, 'repl_history')
	replServer.setupHistory(historyFile, (err) => {
		if (err) {
			console.error(chalk.dim('Could not load command history'))
		}
	})

	// Setup utility commands
	setupReplCommands(replServer)

	// Register the REPL server globally so commands can pause it
	setReplServer(replServer)

	// Override the eval function to parse commands and intercept special commands
	const _originalEval = replServer.eval

	replServer.eval = async (cmd, _context, _filename, callback) => {
		// Remove the trailing newline and any wrapping parentheses
		const cleanCmd = cmd
			.toString()
			.trim()
			.replace(/^\(|\)$/g, '')

		// If it's empty or just whitespace, return
		if (!cleanCmd) {
			callback(null, undefined)
			return
		}

		// Intercept special commands that should use the defineCommand versions
		const parts = cleanCmd.split(/\s+/)
		const [command, ...args] = parts

		// Redirect 'history' to '.history'
		if (command === 'history' && args.length === 0) {
			replServer.commands.history.action.call(replServer)
			callback(null, undefined)
			return
		}

		// Redirect 'search <term>' to '.search <term>'
		if (command === 'search' && args.length > 0) {
			replServer.commands.search.action.call(replServer, args.join(' '))
			callback(null, undefined)
			return
		}

		try {
			// Parse and execute the command
			await parseAndExecute(cleanCmd)
			callback(null, undefined)
		} catch (_error) {
			// Don't crash the REPL on errors
			callback(null, undefined)
		}
	}

	// Handle exit gracefully
	replServer.on('exit', () => {
		console.log(chalk.cyan('\n╔════════════════════════════════════════════════════╗'))
		console.log(
			`${chalk.cyan('║')}                     Goodbye!                     ${chalk.cyan('║')}`,
		)
		console.log(chalk.cyan('╚════════════════════════════════════════════════════╝\n'))
		process.exit(0)
	})
}

/**
 * Sets up custom REPL commands using defineCommand.
 *
 * These commands are prefixed with a dot (.) and provide utility functions:
 * - .help - Show help
 * - .history - Display command history
 * - .search - Search command history
 *
 * @param replServer The REPL server instance
 */
function setupReplCommands(replServer: repl.REPLServer): void {
	// Help command
	replServer.defineCommand('help', {
		help: 'Show available commands',
		action() {
			printReplHelp()
			this.displayPrompt()
		},
	})

	// History display command
	replServer.defineCommand('history', {
		help: 'Show command history',
		action() {
			// Access the internal history array
			const history = (replServer as ReplServerWithHistory).history || []

			if (history.length === 0) {
				console.log(chalk.dim('No command history yet'))
			} else {
				console.log(chalk.bold('\n╭─ Command History ──────────────────────────────────╮'))
				// Reverse to show most recent first
				history
					.slice()
					.reverse()
					.forEach((cmd: string, i: number) => {
						const num = String(i + 1).padStart(3, ' ')
						console.log(chalk.bold('│') + chalk.dim(`  ${num}.`), cmd)
					})
				console.log(chalk.bold('╰────────────────────────────────────────────────────╯'))
				console.log('')
			}
			this.displayPrompt()
		},
	})

	// History search command
	replServer.defineCommand('search', {
		help: 'Search command history',
		action(term: string) {
			if (!term || term.trim() === '') {
				console.log(chalk.yellow('Usage: .search <term>'))
				this.displayPrompt()
				return
			}

			const history = (replServer as ReplServerWithHistory).history || []
			const searchTerm = term.toLowerCase()
			const matches = history.filter((cmd: string) => cmd.toLowerCase().includes(searchTerm))

			if (matches.length === 0) {
				console.log(chalk.dim(`No matches found for "${term}"`))
			} else {
				console.log(
					chalk.bold(
						`\n╭─ Search Results (${matches.length} match${matches.length === 1 ? '' : 'es'}) ───────────────────────╮`,
					),
				)
				matches.forEach((cmd: string, i: number) => {
					// Highlight the matching term
					const highlighted = cmd.replace(new RegExp(term, 'gi'), (match) => chalk.yellow(match))
					const num = String(i + 1).padStart(3, ' ')
					console.log(chalk.bold('│') + chalk.dim(`  ${num}.`), highlighted)
				})
				console.log(chalk.bold('╰────────────────────────────────────────────────────╯'))
				console.log('')
			}
			this.displayPrompt()
		},
	})
}
