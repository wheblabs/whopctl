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
import { analyticsUsageCommand } from './commands/analytics/usage.ts'
import { analyticsSummaryCommand } from './commands/analytics/summary.ts'
import { historyCommand } from './commands/history.ts'
import { quickDeployCommand, quickStatusCommand, quickCheckCommand } from './commands/quick.ts'
import { setAliasCommand, removeAliasCommand, listAliasesCommand, showAliasCommand, discoverAliasesCommand } from './commands/alias.ts'
import { checkUrlCommand, reserveUrlCommand, releaseUrlCommand, listUrlsCommand, suggestUrlCommand } from './commands/url.ts'
import { billingCurrentCommand } from './commands/billing/current.ts'
import { billingHistoryCommand } from './commands/billing/history.ts'
import { billingPeriodsCommand } from './commands/billing/periods.ts'
import { tierCurrentCommand } from './commands/tier/current.ts'
import { tierUpdateCommand } from './commands/tier/update.ts'
import { tierUpgradeCommand } from './commands/tier/upgrade.ts'
import { tierDowngradeCommand } from './commands/tier/downgrade.ts'

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
		.usage(chalk.bold('WhopShip CLI - Deploy and manage your Whop apps\n\n') + 
			   chalk.cyan('Usage: ') + '$0 <command> [options]\n\n' +
			   chalk.bold('Quick Start:\n') +
			   chalk.dim('  whopctl login              # Authenticate with Whop\n') +
			   chalk.dim('  whopctl deploy             # Deploy your app\n') +
			   chalk.dim('  whopctl status             # Check deployment status\n') +
			   chalk.dim('  whopctl usage              # View usage analytics\n\n') +
			   chalk.bold('Common Workflows:\n') +
			   chalk.dim('  whopctl quick deploy       # Deploy with real-time progress\n') +
			   chalk.dim('  whopctl quick status       # Full status overview\n') +
			   chalk.dim('  whopctl quick check        # Validate project setup\n'))
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
			['deploy [path] [project]', 'd [path] [project]'],
			'Deploy a whop app from a directory',
			(yargs) => {
				return yargs
					.positional('path', {
						describe: 'Path to the app directory (defaults to current directory)',
						type: 'string',
						default: '.',
					})
					.positional('project', {
						describe: 'Project name/alias or app ID (defaults to .env)',
						type: 'string',
					})
			},
			async (argv) => {
				await deployCommand(argv.path as string, argv.project as string | undefined)
			},
		)
		.command(
			['redeploy <buildId>', 'rd <buildId>'],
			'Redeploy a previous build',
			(yargs) => {
				return yargs.positional('buildId', {
					describe: 'Build ID to redeploy',
					type: 'string',
					demandOption: true,
				})
			},
			async (argv) => {
				await redeployBuildCommand(argv.buildId as string)
			},
		)
		.command(['usage', 'u'], 'View usage analytics', (yargs) => {
			return yargs
				.option('app-id', {
					type: 'number',
					describe: 'Filter by app ID',
				})
				.option('start-date', {
					type: 'string',
					describe: 'Start date (ISO format)',
				})
				.option('end-date', {
					type: 'string',
					describe: 'End date (ISO format)',
				})
		}, async (argv) => {
			await analyticsUsageCommand(
				argv['app-id'] as number | undefined,
				argv['start-date'] as string | undefined,
				argv['end-date'] as string | undefined,
			)
		})
		.command(['history [path]', 'h [path]'], 'View deployment history', (yargs) => {
			return yargs
				.positional('path', {
					describe: 'Path to the app directory (defaults to current directory)',
					type: 'string',
					default: '.',
				})
				.option('limit', {
					type: 'number',
					describe: 'Number of deployments to show',
					default: 10,
				})
				.option('all', {
					type: 'boolean',
					describe: 'Show all deployments',
					default: false,
				})
		}, async (argv) => {
			await historyCommand(argv.path as string, {
				limit: argv.limit as number,
				all: argv.all as boolean,
			})
		})
		.command('quick', 'Quick commands for common workflows', (yargs) => {
			return yargs
				.command(['deploy [path]', 'd [path]'], 'Quick deploy with status check', (yargs) => {
					return yargs.positional('path', {
						describe: 'Path to the app directory',
						type: 'string',
						default: '.',
					})
				}, async (argv) => {
					await quickDeployCommand(argv.path as string)
				})
				.command(['status [path]', 's [path]'], 'Quick status overview', (yargs) => {
					return yargs.positional('path', {
						describe: 'Path to the app directory',
						type: 'string',
						default: '.',
					})
				}, async (argv) => {
					await quickStatusCommand(argv.path as string)
				})
				.command(['check [path]', 'c [path]'], 'Quick project validation', (yargs) => {
					return yargs.positional('path', {
						describe: 'Path to the app directory',
						type: 'string',
						default: '.',
					})
				}, async (argv) => {
					await quickCheckCommand(argv.path as string)
				})
				.demandCommand(1, 'Please specify a quick command (deploy, status, check)')
				.help()
		})
		.command('alias', 'Manage project name aliases', (yargs) => {
			return yargs
				.command(['set <name> <appId>', 's <name> <appId>'], 'Create a project alias', (yargs) => {
					return yargs
						.positional('name', {
							describe: 'Alias name (letters, numbers, hyphens, underscores)',
							type: 'string',
							demandOption: true,
						})
						.positional('appId', {
							describe: 'Whop app ID (app_xxx)',
							type: 'string',
							demandOption: true,
						})
				}, async (argv) => {
					await setAliasCommand(argv.name as string, argv.appId as string)
				})
				.command(['remove <name>', 'rm <name>', 'delete <name>'], 'Remove a project alias', (yargs) => {
					return yargs.positional('name', {
						describe: 'Alias name to remove',
						type: 'string',
						demandOption: true,
					})
				}, async (argv) => {
					await removeAliasCommand(argv.name as string)
				})
				.command(['list', 'ls'], 'List all project aliases', {}, async () => {
					await listAliasesCommand()
				})
				.command(['show <name>', 'info <name>'], 'Show details of a project alias', (yargs) => {
					return yargs.positional('name', {
						describe: 'Alias name to show',
						type: 'string',
						demandOption: true,
					})
				}, async (argv) => {
					await showAliasCommand(argv.name as string)
				})
				.command('discover', 'Auto-discover and suggest aliases for your apps', {}, async () => {
					await discoverAliasesCommand()
				})
				.demandCommand(1, 'Please specify an alias command (set, remove, list, show, discover)')
				.help()
		})
		.command('url', 'Manage custom subdomain URLs', (yargs) => {
			return yargs
				.command(['check <subdomain>', 'c <subdomain>'], 'Check if a subdomain is available', (yargs) => {
					return yargs.positional('subdomain', {
						describe: 'Subdomain to check (without .whopship.app)',
						type: 'string',
						demandOption: true,
					})
				}, async (argv) => {
					await checkUrlCommand(argv.subdomain as string)
				})
				.command(['reserve <subdomain> <project>', 'r <subdomain> <project>'], 'Reserve a custom subdomain', (yargs) => {
					return yargs
						.positional('subdomain', {
							describe: 'Subdomain to reserve (without .whopship.app)',
							type: 'string',
							demandOption: true,
						})
						.positional('project', {
							describe: 'Project name/alias or app ID',
							type: 'string',
							demandOption: true,
						})
				}, async (argv) => {
					await reserveUrlCommand(argv.subdomain as string, argv.project as string)
				})
				.command(['release <subdomain>', 'rm <subdomain>'], 'Release a reserved subdomain', (yargs) => {
					return yargs.positional('subdomain', {
						describe: 'Subdomain to release',
						type: 'string',
						demandOption: true,
					})
				}, async (argv) => {
					await releaseUrlCommand(argv.subdomain as string)
				})
				.command(['list', 'ls'], 'List your reserved subdomains', {}, async () => {
					await listUrlsCommand()
				})
				.command(['suggest <name>', 's <name>'], 'Suggest available subdomains', (yargs) => {
					return yargs.positional('name', {
						describe: 'Base name for subdomain suggestions',
						type: 'string',
						demandOption: true,
					})
				}, async (argv) => {
					await suggestUrlCommand(argv.name as string)
				})
				.demandCommand(1, 'Please specify a URL command (check, reserve, release, list, suggest)')
				.help()
		})
		.command('status', 'Check deployment status', (yargs) => {
			return yargs
				.command(
					'logs [path]',
					'View build logs',
					(yargs) => {
						return yargs
							.positional('path', {
								describe: 'Path to the app directory (defaults to current directory)',
								type: 'string',
								default: '.',
							})
							.option('follow', {
								alias: 'f',
								type: 'boolean',
								default: false,
								describe: 'Follow logs for active builds (stream updates)',
							})
							.option('lines', {
								alias: 'n',
								type: 'number',
								default: 30,
								describe: 'Number of log lines to show (default: 30)',
							})
					},
					async (argv) => {
						await buildLogsCommand(argv.path as string, {
							follow: argv.follow as boolean,
							lines: argv.lines as number,
						})
					},
				)
				.command(
					'$0 [path]', // Default subcommand (runs when just "status" is called)
					'Show latest build status',
					(yargs) => {
						return yargs
							.positional('path', {
								describe: 'Path to the app directory (defaults to current directory)',
								type: 'string',
								default: '.',
							})
							.option('logs', {
								alias: 'l',
								type: 'boolean',
								default: false,
								describe: 'Display build logs inline',
							})
							.option('follow', {
								alias: 'f',
								type: 'boolean',
								default: false,
								describe: 'Follow logs for active builds (stream updates)',
							})
							.option('lines', {
								alias: 'n',
								type: 'number',
								default: 30,
								describe: 'Number of log lines to show when using --logs (default: 30)',
							})
							.option('project', {
								alias: 'p',
								type: 'string',
								describe: 'Project name/alias or app ID',
							})
					},
					async (argv) => {
						await statusCommand(argv.path as string, {
							project: argv.project as string | undefined,
							showLogs: argv.logs as boolean,
							follow: argv.follow as boolean,
							lines: argv.lines as number,
						})
					},
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
					},
				)
				.command(
					'deploy <buildId>', // Changed from 'redeploy' to 'deploy'
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
					},
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
					},
				)
				.demandCommand(0)
				.help()
		})
		.command(['logs [project]', 'l [project]'], 'View runtime logs with live streaming', (yargs) => {
			return yargs
				.positional('project', {
					describe: 'Project name or app ID (defaults to current directory)',
					type: 'string',
				})
				.option('type', {
					type: 'string',
					choices: ['deploy-runner', 'router', 'app'],
					describe: 'Type of logs to view',
					default: 'app',
				})
				.option('app-id', {
					type: 'string',
					describe: 'App ID for app logs',
				})
				.option('build-id', {
					type: 'string',
					describe: 'Filter by build ID',
				})
				.option('hours', {
					type: 'number',
					describe: 'Hours of logs to fetch',
					default: 1,
				})
				.option('follow', {
					alias: 'f',
					type: 'boolean',
					describe: 'Stream logs in real-time',
					default: false,
				})
				.option('filter', {
					type: 'string',
					describe: 'Filter logs by text content',
				})
				.option('level', {
					type: 'string',
					choices: ['error', 'warn', 'info', 'debug'],
					describe: 'Filter by log level',
				})
				.option('lines', {
					alias: 'n',
					type: 'number',
					describe: 'Number of lines to show',
					default: 100,
				})
		}, async (argv) => {
			await logsCommand({
				type: argv.type as 'deploy-runner' | 'router' | 'app',
				projectName: argv.project as string | undefined,
				appId: argv['app-id'] as string | undefined,
				buildId: argv['build-id'] as string | undefined,
				hours: argv.hours as number,
				follow: argv.follow as boolean,
				filter: argv.filter as string | undefined,
				level: argv.level as 'error' | 'warn' | 'info' | 'debug' | undefined,
				lines: argv.lines as number,
			})
		})
		.command('analytics', 'View usage analytics', (yargs) => {
			return yargs
				.command(
					'usage',
					'Get usage data for a time period',
					(yargs) => {
						return yargs
							.option('app-id', {
								type: 'number',
								describe: 'Filter by app ID',
							})
							.option('start-date', {
								type: 'string',
								describe: 'Start date (ISO format)',
							})
							.option('end-date', {
								type: 'string',
								describe: 'End date (ISO format)',
							})
					},
					async (argv) => {
						await analyticsUsageCommand(
							argv['app-id'] as number | undefined,
							argv['start-date'] as string | undefined,
							argv['end-date'] as string | undefined,
						)
					},
				)
				.command(
					'summary',
					'Get usage summary for a month',
					(yargs) => {
						return yargs
							.option('app-id', {
								type: 'number',
								describe: 'Filter by app ID',
							})
							.option('month', {
								type: 'string',
								describe: 'Month in YYYY-MM format (defaults to current month)',
							})
					},
					async (argv) => {
						await analyticsSummaryCommand(
							argv['app-id'] as number | undefined,
							argv.month as string | undefined,
						)
					},
				)
				.demandCommand(1, 'Please specify a subcommand (usage, summary)')
				.help()
		})
		.command('billing', 'View billing information', (yargs) => {
			return yargs
				.command(
					'current',
					'Get current period usage',
					(yargs) => {
						return yargs.option('app-id', {
							type: 'number',
							describe: 'Filter by app ID',
						})
					},
					async (argv) => {
						await billingCurrentCommand(argv['app-id'] as number | undefined)
					},
				)
				.command(
					'history',
					'Get usage history',
					(yargs) => {
						return yargs
							.option('app-id', {
								type: 'number',
								describe: 'Filter by app ID',
							})
							.option('months', {
								type: 'number',
								default: 6,
								describe: 'Number of months to show (default: 6)',
							})
					},
					async (argv) => {
						await billingHistoryCommand(
							argv['app-id'] as number | undefined,
							argv.months as number | undefined,
						)
					},
				)
				.command(
					'periods',
					'List billing periods',
					(yargs) => {
						return yargs.option('limit', {
							type: 'number',
							default: 12,
							describe: 'Number of periods to show (default: 12)',
						})
					},
					async (argv) => {
						await billingPeriodsCommand(argv.limit as number | undefined)
					},
				)
				.demandCommand(1, 'Please specify a subcommand (current, history, periods)')
				.help()
		})
		.command('tier', 'Manage pricing tier', (yargs) => {
			return yargs
				.command('current', 'Show current tier', {}, async () => {
					await tierCurrentCommand()
				})
				.command(
					'update <tier>',
					'Update tier',
					(yargs) => {
						return yargs.positional('tier', {
							describe: 'Tier to set (free, hobby, pro)',
							type: 'string',
							choices: ['free', 'hobby', 'pro'],
							demandOption: true,
						})
					},
					async (argv) => {
						await tierUpdateCommand(argv.tier as 'free' | 'hobby' | 'pro')
					},
				)
				.command(
					'upgrade <tier>',
					'Upgrade tier',
					(yargs) => {
						return yargs.positional('tier', {
							describe: 'Tier to upgrade to (hobby, pro)',
							type: 'string',
							choices: ['hobby', 'pro'],
							demandOption: true,
						})
					},
					async (argv) => {
						await tierUpgradeCommand(argv.tier as 'free' | 'hobby' | 'pro')
					},
				)
				.command(
					'downgrade <tier>',
					'Downgrade tier',
					(yargs) => {
						return yargs.positional('tier', {
							describe: 'Tier to downgrade to (free, hobby)',
							type: 'string',
							choices: ['free', 'hobby'],
							demandOption: true,
						})
					},
					async (argv) => {
						await tierDowngradeCommand(argv.tier as 'free' | 'hobby' | 'pro')
					},
				)
				.demandCommand(1, 'Please specify a subcommand (current, update, upgrade, downgrade)')
				.help()
		})
		.demandCommand(1, 'Please specify a command or run without arguments for interactive mode')
		.help()
		.alias('h', 'help')
		.version(pkg.version)
		.alias('v', 'version')
		.example('whopctl login', 'Authenticate with your Whop account')
		.example('whopctl deploy', 'Deploy your Next.js app to WhopShip')
		.example('whopctl status --logs', 'Check deployment status with build logs')
		.example('whopctl usage', 'View your app usage and analytics')
		.example('whopctl history', 'See your deployment history')
		.example('whopctl redeploy abc123', 'Redeploy a previous build')
		.example('whopctl quick deploy', 'Deploy with progress tracking')
		.epilogue(chalk.bold('Need help?\n') +
			chalk.cyan('  Documentation: ') + chalk.underline('https://docs.whopship.app\n') +
			chalk.cyan('  Support: ') + chalk.underline('https://whop.com/support\n') +
			chalk.cyan('  GitHub: ') + chalk.underline('https://github.com/whoplabs/whopship'))
		.strict()
		.parse()
}

main().catch((err) => {
	console.error(chalk.red('Error:'), err)
	process.exit(1)
})
