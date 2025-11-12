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
import { deployCommand } from './commands/deploy.ts'
import { statusCommand } from './commands/status/status.ts'
import { logsCommand as buildLogsCommand } from './commands/status/logs.ts'
import { redeployBuildCommand } from './commands/builds/redeploy.ts'
import { listBuildsCommand } from './commands/builds/list.ts'
import { logsCommand } from './commands/logs.ts'

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
		.command(
      'deploy [path]', 
      'Deploy a whop app from a directory', 
      (yargs) => {
			  return yargs.positional('path', {
          describe: 'Path to the app directory (defaults to current directory)',
          type: 'string',
          default: '.',
        })
      },
      async (argv) => {
        await deployCommand(argv.path as string)
      }
    )
    .command('status', 'Check deployment status', (yargs) => {
      return yargs
        .command(
          'logs [path]',
          'View build logs',
          (yargs) => {
            return yargs.positional('path', {
              describe: 'Path to the app directory (defaults to current directory)',
              type: 'string',
              default: '.',
            })
          },
          async (argv) => {
            await buildLogsCommand(argv.path as string)
          }
        )
        .command(
          '$0 [path]',  // Default subcommand (runs when just "status" is called)
          'Show latest build status',
          (yargs) => {
            return yargs.positional('path', {
              describe: 'Path to the app directory (defaults to current directory)',
              type: 'string',
              default: '.',
            })
          },
          async (argv) => {
            await statusCommand(argv.path as string)
          }
        )
        .demandCommand(0) // Allow running without subcommand (defaults to status)
        .help()
    })
    .command('builds', 'Manage builds', (yargs) => {
      return yargs
        .command(
          'list [path]',
          'List recent builds',
          (yargs) => {
            return yargs
              .positional('path', {
                describe: 'Path to the app directory',
                type: 'string',
                default: '.',
              })
              .option('limit', {
                describe: 'Number of builds to show',
                type: 'number',
                default: 10,
              })
          },
          async (argv) => {
            await listBuildsCommand(argv.path as string, argv.limit as number)
          }
        )
        .command(
          'deploy <buildId>',  // Changed from 'redeploy' to 'deploy'
          'Deploy a build',
          (yargs) => {
            return yargs.positional('buildId', {
              describe: 'Build ID to deploy',
              type: 'string',
              demandOption: true,
            })
          },
          async (argv) => {
            await redeployBuildCommand(argv.buildId as string)
          }
        )
        .command(
          '$0 [path]',
          'List recent builds (default)',
          (yargs) => {
            return yargs.positional('path', {
              describe: 'Path to the app directory',
              type: 'string',
              default: '.',
            })
          },
          async (argv) => {
            await listBuildsCommand(argv.path as string, 10)
          }
        )
        .demandCommand(0)
        .help()
    })
    .command('logs', 'View runtime logs', (yargs) => {
      return yargs
        .command(
          'deploy-runner [buildId]',
          'View deploy-runner Lambda logs',
          (yargs) => {
            return yargs
              .positional('buildId', {
                describe: 'Filter logs for specific build ID',
                type: 'string',
              })
              .option('hours', {
                type: 'number',
                default: 1,
                describe: 'Hours of logs to fetch',
              })
          },
          async (argv) => {
            await logsCommand({
              type: 'deploy-runner',
              buildId: argv.buildId as string | undefined,
              hours: argv.hours,
            })
          }
        )
        .command(
          'router',
          'View router Lambda logs',
          (yargs) => {
            return yargs.option('hours', {
              type: 'number',
              default: 1,
              describe: 'Hours of logs to fetch',
            })
          },
          async (argv) => {
            await logsCommand({
              type: 'router',
              hours: argv.hours,
            })
          }
        )
        .command(
          'app <appId>',
          'View app runtime logs',
          (yargs) => {
            return yargs
              .positional('appId', {
                describe: 'Whop app ID (e.g., app_xxx)',
                type: 'string',
                demandOption: true,
              })
              .option('hours', {
                type: 'number',
                default: 1,
                describe: 'Hours of logs to fetch',
              })
          },
          async (argv) => {
            await logsCommand({
              type: 'app',
              appId: argv.appId as string,
              hours: argv.hours,
            })
          }
        )
        .demandCommand(1, 'Please specify log type (deploy-runner, router, app)')
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
