#!/usr/bin/env node

import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { deployAppCommand } from './commands/apps/deploy.ts'
import { listAppsCommand } from './commands/apps/list.ts'
import { loginCommand } from './commands/login.ts'

/**
 * Whopctl - CLI tool for managing Whop apps
 *
 * This CLI provides commands to:
 * - Authenticate with your Whop account
 * - List your apps across all companies
 * - Deploy apps (coming soon)
 *
 * Architecture:
 * - Uses yargs for command parsing with nested command structure
 * - Uses @whoplabs/whop-client for Whop API interactions
 * - Session-based authentication stored in ~/.config/whopctl/session.json
 */

async function main() {
	await yargs(hideBin(process.argv))
		.scriptName('whopctl')
		.usage('$0 <command> [options]')
		.command('login', 'Authenticate with your Whop account', {}, async () => {
			await loginCommand()
		})
		.command('apps', 'Manage Whop apps', (yargs) => {
			return yargs
				.command('list', 'List all your apps', {}, async () => {
					await listAppsCommand()
				})
				.command(
					'deploy <appId>',
					'Deploy an app',
					(yargs) => {
						return yargs.positional('appId', {
							describe: 'The ID of the app to deploy',
							type: 'string',
							demandOption: true,
						})
					},
					async (argv) => {
						await deployAppCommand(argv.appId as string)
					},
				)
				.demandCommand(1, 'Please specify a subcommand (list, deploy)')
				.help()
		})
		.demandCommand(1, 'Please specify a command')
		.help()
		.alias('h', 'help')
		.version('1.0.1')
		.alias('v', 'version')
		.strict()
		.parse()
}

main().catch((err) => {
	console.error(chalk.red('Error:'), err)
	process.exit(1)
})
