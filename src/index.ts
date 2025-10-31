#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { deployAppCommand } from './commands/apps/deploy.ts'
import { listAppsCommand } from './commands/apps/list.ts'
import { checkAuthCommand } from './commands/auth/check.ts'
import { loginCommand } from './commands/login.ts'
import { logoutCommand } from './commands/logout.ts'
import { startRepl } from './lib/repl.ts'

/**
 * Whopctl - CLI tool for managing Whop apps
 *
 * This CLI provides commands to:
 * - Authenticate with your Whop account
 * - List your apps across all companies
 * - Deploy apps (coming soon)
 * - Interactive REPL mode for easier command execution
 *
 * Architecture:
 * - Uses yargs for command parsing with nested command structure
 * - Uses @whoplabs/whop-client for Whop API interactions
 * - Session-based authentication stored in ~/.config/whopctl/session.json
 * - REPL mode for interactive command execution
 */

// Read version from package.json
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const pkgPath = resolve(__dirname, '../package.json')
const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))

async function main() {
	const argv = hideBin(process.argv)

	// If no command provided, start REPL
	if (argv.length === 0) {
		await startRepl()
		return
	}

	await yargs(argv)
		.scriptName('whopctl')
		.usage('$0 <command> [options]')
		.command('login', 'Authenticate with your Whop account', {}, async () => {
			await loginCommand()
		})
		.command('logout', 'Clear authentication session', {}, async () => {
			await logoutCommand()
		})
		.command('auth', 'Manage authentication', (yargs) => {
			return yargs
				.command('check', 'Check authentication status', {}, async () => {
					await checkAuthCommand()
				})
				.demandCommand(1, 'Please specify a subcommand (check)')
				.help()
		})
		.command('repl', 'Start interactive mode', {}, async () => {
			await startRepl()
		})
		.command('apps', 'Manage Whop apps', (yargs) => {
			return yargs
				.command('list', 'List all your apps', {}, async () => {
					await listAppsCommand()
				})
				.command(
					'deploy [appId]',
					'Deploy an app',
					(yargs) => {
						return yargs.positional('appId', {
							describe: 'The ID of the app to deploy (optional if whopship.config.json exists)',
							type: 'string',
						})
					},
					async (argv) => {
						await deployAppCommand(argv.appId as string | undefined)
					},
				)
				.demandCommand(1, 'Please specify a subcommand (list, deploy)')
				.help()
		})
		.demandCommand(1, 'Please specify a command or run without arguments for interactive mode')
		.help()
		.alias('h', 'help')
		.version(pkg.version)
		.alias('v', 'version')
		.strict()
		.parse()
}

main().catch((err) => {
	console.error(chalk.red('Error:'), err)
	process.exit(1)
})
