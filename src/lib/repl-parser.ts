import chalk from 'chalk'
import { deployAppCommand } from '../commands/apps/deploy.ts'
import { listAppsCommand } from '../commands/apps/list.ts'
import { loginCommand } from '../commands/login.ts'
import { logoutCommand } from '../commands/logout.ts'
import { deployCommand } from '../commands/deploy.ts'
import { statusCommand } from '../commands/status/status.ts'
import { analyticsUsageCommand } from '../commands/analytics/usage.ts'
import { historyCommand } from '../commands/history.ts'
import { logsCommand } from '../commands/logs.ts'
import { setAliasCommand, removeAliasCommand, listAliasesCommand, showAliasCommand, discoverAliasesCommand } from '../commands/alias.ts'
import { checkUrlCommand, reserveUrlCommand, releaseUrlCommand, listUrlsCommand, suggestUrlCommand } from '../commands/url.ts'
import { quickDeployCommand, quickStatusCommand, quickCheckCommand } from '../commands/quick.ts'
import { listBuildsCommand } from '../commands/builds/list.ts'
import { redeployBuildCommand } from '../commands/builds/redeploy.ts'
import { cancelBuildCommand } from '../commands/builds/cancel.ts'
import { queueStatusCommand } from '../commands/builds/queue.ts'
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
	console.log(`${chalk.bold('│')}  ${chalk.cyan('Authentication:')}`)
	console.log(`${chalk.bold('│')}    login            Authenticate with your Whop account`)
	console.log(`${chalk.bold('│')}    logout           Clear authentication session`)
	console.log(`${chalk.bold('│')}`)
	console.log(`${chalk.bold('│')}  ${chalk.cyan('Deployment:')}`)
	console.log(`${chalk.bold('│')}    deploy [project] Deploy your app to WhopShip`)
	console.log(`${chalk.bold('│')}    cancel <id>      Cancel a build`)
	console.log(`${chalk.bold('│')}    queue            Show build queue status`)
	console.log(`${chalk.bold('│')}    status [project] Check deployment status`)
	console.log(`${chalk.bold('│')}    redeploy <id>    Redeploy a previous build`)
	console.log(`${chalk.bold('│')}    history [project] Show deployment history`)
	console.log(`${chalk.bold('│')}`)
	console.log(`${chalk.bold('│')}  ${chalk.cyan('Analytics & Logs:')}`)
	console.log(`${chalk.bold('│')}    usage [appId]    View usage analytics`)
	console.log(`${chalk.bold('│')}    logs <type>      Stream runtime logs`)
	console.log(`${chalk.bold('│')}`)
	console.log(`${chalk.bold('│')}  ${chalk.cyan('Project Management:')}`)
	console.log(`${chalk.bold('│')}    alias <cmd>      Manage project aliases`)
	console.log(`${chalk.bold('│')}    url <cmd>        Manage custom URLs`)
	console.log(`${chalk.bold('│')}`)
	console.log(`${chalk.bold('│')}  ${chalk.cyan('Quick Commands:')}`)
	console.log(`${chalk.bold('│')}    quick <cmd>      Quick workflow shortcuts`)
	console.log(`${chalk.bold('│')}`)
	console.log(`${chalk.bold('│')}  ${chalk.cyan('Legacy App Management:')}`)
	console.log(`${chalk.bold('│')}    apps list        List all your apps`)
	console.log(`${chalk.bold('│')}    apps deploy <id> Build and deploy an app`)
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
		} else if (command === 'deploy' || command === 'd') {
			// Deploy command: deploy [project] [--background]
			let projectIdentifier = args[0]
			let options = { background: false }
			
			// Check for --background flag
			const backgroundIndex = args.indexOf('--background')
			if (backgroundIndex !== -1) {
				options.background = true
				// Remove --background from args
				args.splice(backgroundIndex, 1)
				projectIdentifier = args[0] // Re-get project after removing flag
			}
			
			await deployCommand('.', projectIdentifier, options)
		} else if (command === 'status' || command === 's') {
			// Status command: status [project]
			await statusCommand(args[0])
		} else if (command === 'usage' || command === 'u') {
			// Usage command: usage [appId]
			await analyticsUsageCommand(args[0])
		} else if (command === 'redeploy' || command === 'rd') {
			// Redeploy command: redeploy <buildId>
			if (args.length === 0) {
				printError('Missing build ID for redeploy command')
				console.log(chalk.dim('Usage: redeploy <buildId>'))
			} else {
				await redeployBuildCommand(args[0])
			}
		} else if (command === 'history' || command === 'h') {
			// History command: history [project]
			if (args.length === 0) {
				// This will be intercepted by the custom eval to call .history
				console.log(chalk.yellow('Command history feature'))
			} else {
				await historyCommand(args[0])
			}
		} else if (command === 'logs') {
			// Logs command: logs <type> [options]
			if (args.length === 0) {
				printError('Missing log type for logs command')
				console.log(chalk.dim('Usage: logs <app|deploy-runner|router> [--follow] [--level=info]'))
			} else {
				// Parse logs arguments
				const logType = args[0]
				const options: any = {}
				
				for (let i = 1; i < args.length; i++) {
					const arg = args[i]
					if (arg === '--follow' || arg === '-f') {
						options.follow = true
					} else if (arg.startsWith('--level=')) {
						options.level = arg.split('=')[1]
					} else if (arg.startsWith('--filter=')) {
						options.filter = arg.split('=')[1]
					}
				}
				
				await logsCommand(logType, options)
			}
		} else if (command === 'alias') {
			// Alias command: alias <subcommand> [args]
			if (args.length === 0) {
				printError('Missing subcommand for alias command')
				console.log(chalk.dim('Usage: alias <set|remove|list|show|discover> [args]'))
			} else {
				await handleAliasCommand(args[0], args.slice(1))
			}
		} else if (command === 'url') {
			// URL command: url <subcommand> [args]
			if (args.length === 0) {
				printError('Missing subcommand for url command')
				console.log(chalk.dim('Usage: url <check|reserve|release|list|suggest> [args]'))
			} else {
				await handleUrlCommand(args[0], args.slice(1))
			}
		} else if (command === 'quick') {
			// Quick command: quick <subcommand> [args]
			if (args.length === 0) {
				printError('Missing subcommand for quick command')
				console.log(chalk.dim('Usage: quick <deploy|status|check> [args]'))
			} else {
				await handleQuickCommand(args[0], args.slice(1))
			}
		} else if (command === 'builds') {
			// Builds command: builds <subcommand> [args]
			if (args.length === 0) {
				printError('Missing subcommand for builds command')
				console.log(chalk.dim('Usage: builds <list|deploy|cancel|queue> [args]'))
			} else if (args[0] === 'list') {
				await listBuildsCommand(args[1] || '.')
			} else if (args[0] === 'deploy') {
				if (args.length < 2) {
					printError('Missing build ID for builds deploy command')
					console.log(chalk.dim('Usage: builds deploy <buildId>'))
				} else {
					await redeployBuildCommand(args[1])
				}
			} else if (args[0] === 'cancel' || args[0] === 'stop') {
				if (args.length < 2) {
					printError('Missing build ID for builds cancel command')
					console.log(chalk.dim('Usage: builds cancel <buildId>'))
				} else {
					await cancelBuildCommand(args[1], args[2] || '.')
				}
			} else if (args[0] === 'queue' || args[0] === 'q') {
				await queueStatusCommand(args[1] || '.')
			} else {
				printError(`Unknown builds subcommand: ${args[0]}`)
				console.log(chalk.dim('Usage: builds <list|deploy|cancel|queue> [args]'))
			}
		} else if (command === 'cancel' || command === 'stop') {
			// Cancel command: cancel <buildId>
			if (args.length === 0) {
				printError('Missing build ID for cancel command')
				console.log(chalk.dim('Usage: cancel <buildId>'))
			} else {
				await cancelBuildCommand(args[0], args[1] || '.')
			}
		} else if (command === 'queue' || command === 'q') {
			// Queue command: queue [path]
			await queueStatusCommand(args[0] || '.')
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
		const appId = subArgs[0]
		if (!appId) {
			printError('Missing app ID for deploy command')
			return
		}
		await deployAppCommand(appId)
	} else {
		printError(`Unknown apps subcommand: ${subcommand}`)
		console.log(chalk.dim('Available: list, deploy <id>'))
	}
}

/**
 * Handles the 'alias' command and its subcommands.
 *
 * @param subcommand The alias subcommand
 * @param args The arguments after the subcommand
 */
async function handleAliasCommand(subcommand: string, args: string[]): Promise<void> {
	switch (subcommand) {
		case 'set':
		case 's':
			if (args.length < 2) {
				printError('Missing arguments for alias set command')
				console.log(chalk.dim('Usage: alias set <name> <appId>'))
				return
			}
			await setAliasCommand(args[0], args[1])
			break
		case 'remove':
		case 'rm':
		case 'delete':
			if (args.length === 0) {
				printError('Missing alias name for remove command')
				console.log(chalk.dim('Usage: alias remove <name>'))
				return
			}
			await removeAliasCommand(args[0])
			break
		case 'list':
		case 'ls':
			await listAliasesCommand()
			break
		case 'show':
		case 'info':
			if (args.length === 0) {
				printError('Missing alias name for show command')
				console.log(chalk.dim('Usage: alias show <name>'))
				return
			}
			await showAliasCommand(args[0])
			break
		case 'discover':
			await discoverAliasesCommand()
			break
		default:
			printError(`Unknown alias subcommand: ${subcommand}`)
			console.log(chalk.dim('Available: set, remove, list, show, discover'))
	}
}

/**
 * Handles the 'url' command and its subcommands.
 *
 * @param subcommand The url subcommand
 * @param args The arguments after the subcommand
 */
async function handleUrlCommand(subcommand: string, args: string[]): Promise<void> {
	switch (subcommand) {
		case 'check':
		case 'c':
			if (args.length === 0) {
				printError('Missing subdomain for check command')
				console.log(chalk.dim('Usage: url check <subdomain>'))
				return
			}
			await checkUrlCommand(args[0])
			break
		case 'reserve':
		case 'r':
			if (args.length < 2) {
				printError('Missing arguments for reserve command')
				console.log(chalk.dim('Usage: url reserve <subdomain> <project>'))
				return
			}
			await reserveUrlCommand(args[0], args[1])
			break
		case 'release':
			if (args.length === 0) {
				printError('Missing subdomain for release command')
				console.log(chalk.dim('Usage: url release <subdomain>'))
				return
			}
			await releaseUrlCommand(args[0])
			break
		case 'list':
		case 'ls':
			await listUrlsCommand()
			break
		case 'suggest':
			if (args.length === 0) {
				printError('Missing base name for suggest command')
				console.log(chalk.dim('Usage: url suggest <baseName>'))
				return
			}
			await suggestUrlCommand(args[0])
			break
		default:
			printError(`Unknown url subcommand: ${subcommand}`)
			console.log(chalk.dim('Available: check, reserve, release, list, suggest'))
	}
}

/**
 * Handles the 'quick' command and its subcommands.
 *
 * @param subcommand The quick subcommand
 * @param args The arguments after the subcommand
 */
async function handleQuickCommand(subcommand: string, args: string[]): Promise<void> {
	switch (subcommand) {
		case 'deploy':
		case 'd':
			await quickDeployCommand(args[0] || '.')
			break
		case 'status':
		case 's':
			await quickStatusCommand(args[0] || '.')
			break
		case 'check':
		case 'c':
			await quickCheckCommand(args[0] || '.')
			break
		default:
			printError(`Unknown quick subcommand: ${subcommand}`)
			console.log(chalk.dim('Available: deploy, status, check'))
	}
}
