/**
 * Rollback Command
 *
 * Quickly revert to a previous successful deployment.
 * Usage:
 *   whopctl rollback [path]              # Rollback to previous build
 *   whopctl rollback --to <buildId>      # Rollback to specific build
 *   whopctl rollback --list              # List available rollback targets
 */

import chalk from 'chalk'
import ora from 'ora'
import type { CommandModule } from 'yargs'
import { whopshipClient, type RollbackTarget } from '~/lib/whopship-client.ts'
import { loadAppConfig, type WhopAppConfig } from '~/lib/config.ts'

interface RollbackArgs {
	path?: string
	to?: string
	list?: boolean
	limit?: number
}

function formatBuildInfo(build: RollbackTarget, isCurrent = false): string {
	const date = new Date(build.createdAt).toLocaleString()
	const status = isCurrent ? chalk.green('(current)') : ''
	const hash = build.commitHash ? chalk.dim(`#${build.commitHash.slice(0, 7)}`) : ''
	const message = build.commitMessage ? chalk.gray(build.commitMessage.slice(0, 50)) : ''

	return `${chalk.cyan(build.id.slice(0, 8))} ${hash} ${date} ${status}\n    ${message}`
}

export const rollbackCommand: CommandModule<object, RollbackArgs> = {
	command: 'rollback [path]',
	describe: 'Rollback to a previous successful deployment',
	builder: (yargs) =>
		yargs
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			})
			.option('to', {
				describe: 'Specific build ID to rollback to',
				type: 'string',
			})
			.option('list', {
				describe: 'List available rollback targets',
				type: 'boolean',
				alias: 'l',
			})
			.option('limit', {
				describe: 'Maximum number of builds to show (with --list)',
				type: 'number',
				default: 10,
			}),

	handler: async (args) => {
		try {
			// Load app config to get app ID
			const config = await loadAppConfig(args.path || '.')
			if (!config) {
				console.error(chalk.red('Error: No whop.json found. Run this command in a Whop app directory.'))
				process.exit(1)
			}

			const appId = config.whopAppId
			if (!appId) {
				console.error(chalk.red('Error: No app ID found in whop.json. Deploy your app first with `whopctl deploy`.'))
				process.exit(1)
			}

			// List mode: show available rollback targets
			if (args.list) {
				const spinner = ora('Fetching deployment history...').start()

				try {
					const [current, builds] = await Promise.all([
						whopshipClient.getCurrentDeployment(appId).catch(() => null),
						whopshipClient.listRollbackTargets(appId, args.limit),
					])

					spinner.stop()

					if (builds.length === 0) {
						console.log(chalk.yellow('No previous deployments found.'))
						return
					}

					console.log(chalk.bold('\nDeployment History\n'))

					for (const build of builds) {
						const isCurrent = current?.id === build.id
						console.log(formatBuildInfo(build, isCurrent))
						console.log()
					}

					console.log(chalk.dim(`To rollback: whopctl rollback --to <build-id>`))
				} catch (error) {
					spinner.fail('Failed to fetch deployment history')
					throw error
				}

				return
			}

			// Rollback mode
			const targetBuildId = args.to

			const spinner = ora(
				targetBuildId
					? `Rolling back to build ${targetBuildId.slice(0, 8)}...`
					: 'Rolling back to previous deployment...',
			).start()

			try {
				const result = await whopshipClient.triggerRollback(appId, targetBuildId)

				spinner.succeed(chalk.green('Rollback initiated successfully!'))
				console.log()
				console.log(chalk.dim('  New deployment ID:'), chalk.cyan(result.new_build_id))
				console.log(chalk.dim('  Target build:'), chalk.cyan(result.target_build_id))
				console.log()
				console.log(chalk.dim(`  Monitor progress: whopctl logs ${result.new_build_id} --follow`))
			} catch (error) {
				spinner.fail('Rollback failed')
				throw error
			}
		} catch (error) {
			if (error instanceof Error) {
				console.error(chalk.red(`Error: ${error.message}`))
			} else {
				console.error(chalk.red('An unknown error occurred'))
			}
			process.exit(1)
		}
	},
}

export default rollbackCommand

