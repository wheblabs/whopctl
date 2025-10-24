import chalk from 'chalk'
import { deployAppCommand } from '../commands/apps/deploy.ts'
import { listAppsCommand } from '../commands/apps/list.ts'
import { loginCommand } from '../commands/login.ts'
import { logoutCommand } from '../commands/logout.ts'
import { AuthenticationRequiredError } from './auth-guard.ts'
import { printError, printWhopError } from './output.ts'

/**
 * Prints help information for REPL mode.
 *
 * Shows available commands and REPL utilities with descriptions.
 */
export function printReplHelp(): void {
	console.log(chalk.bold('\n╭─ Whopctl Commands ─────────────────────────────────╮'))
	console.log(chalk.bold('│'))
	console.log(`${chalk.bold('│')}  login              Authenticate with your Whop account`)
	console.log(`${chalk.bold('│')}  logout             Clear authentication session`)
	console.log(`${chalk.bold('│')}  apps list          List all your apps`)
	console.log(`${chalk.bold('│')}  apps deploy <id>   Deploy an app`)
	console.log(chalk.bold('│'))
	console.log(chalk.bold('╰────────────────────────────────────────────────────╯'))
	console.log('')
	console.log(chalk.bold('╭─ REPL Utilities ───────────────────────────────────╮'))
	console.log(chalk.bold('│'))
	console.log(`${chalk.bold('│')}  help               Show this help message`)
	console.log(`${chalk.bold('│')}  history            Display command history`)
	console.log(`${chalk.bold('│')}  search <term>      Search command history`)
	console.log(`${chalk.bold('│')}  clear              Clear the screen`)
	console.log(`${chalk.bold('│')}  exit               Exit the REPL`)
	console.log(`${chalk.bold('│')}  .editor            Enter multi-line editor mode`)
	console.log(chalk.bold('│'))
	console.log(chalk.bold('╰────────────────────────────────────────────────────╯'))
	console.log('')
	console.log(chalk.dim('Tip: Use ↑/↓ arrow keys to navigate history'))
	console.log('')
}

/**
 * Parses and executes a command entered in the REPL.
 *
 * This function:
 * - Parses the input string into command and arguments
 * - Routes to the appropriate command handler
 * - Handles errors without exiting the process
 * - Returns control to the REPL prompt
 *
 * @param input The raw command string from the REPL
 */
export async function parseAndExecute(input: string): Promise<void> {
	const trimmed = input.trim()

	// Empty input, just return
	if (!trimmed) {
		return
	}

	// Parse command and arguments
	const parts = trimmed.split(/\s+/)
	const [command, ...args] = parts

	try {
		// Handle top-level commands
		if (command === 'login') {
			await loginCommand()
		} else if (command === 'logout') {
			await logoutCommand()
		} else if (command === 'help') {
			printReplHelp()
		} else if (command === 'clear') {
			console.clear()
		} else if (command === 'exit') {
			console.log(chalk.cyan('\nGoodbye!\n'))
			process.exit(0)
		} else if (command === 'history') {
			// This will be intercepted by the custom eval to call .history
			// This is just a fallback
			console.log(chalk.yellow('Command history feature'))
		} else if (command === 'search') {
			// This will be intercepted by the custom eval to call .search
			// This is just a fallback
			if (args.length === 0) {
				console.log(chalk.yellow('Usage: search <term>'))
			}
		} else if (command === 'apps') {
			// Handle apps subcommands
			await handleAppsCommand(args)
		} else {
			printError(`Unknown command: ${command}`)
			console.log(chalk.dim('Type "help" for available commands'))
		}
	} catch (error) {
		// Handle authentication errors specially in REPL mode
		if (error instanceof AuthenticationRequiredError) {
			printError(error.message)
		} else {
			// Don't exit on errors in REPL mode, just display them
			printWhopError(error)
		}
	}
}

/**
 * Handles the 'apps' command and its subcommands.
 *
 * @param args The arguments after 'apps'
 */
async function handleAppsCommand(args: string[]): Promise<void> {
	if (args.length === 0) {
		printError('Missing subcommand for "apps"')
		console.log(chalk.dim('Available: apps list, apps deploy <id>'))
		return
	}

	const [subcommand, ...subArgs] = args

	if (subcommand === 'list') {
		await listAppsCommand()
	} else if (subcommand === 'deploy') {
		if (subArgs.length === 0) {
			printError('Missing app ID for deploy command')
			console.log(chalk.dim('Usage: apps deploy <appId>'))
			return
		}
		await deployAppCommand(subArgs[0])
	} else {
		printError(`Unknown apps subcommand: ${subcommand}`)
		console.log(chalk.dim('Available: list, deploy <id>'))
	}
}
