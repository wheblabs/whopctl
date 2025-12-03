import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../lib/auth-guard.ts'
import { readEnvFile } from '../lib/env.ts'
import { formatBuildStatusWithIcon, formatRelativeTime } from '../lib/format.ts'
import { printError, printInfo } from '../lib/output.ts'
import { createSpinner } from '../lib/progress.ts'
import { whopshipClient } from '../lib/whopship-client.ts'

/**
 * Display deployment history for the current app
 */
export async function historyCommand(
	path: string = '.',
	options: { limit?: number; all?: boolean } = {},
): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		// 1. Read .env
		const env = await readEnvFile(targetDir)
		const appId = env.NEXT_PUBLIC_WHOP_APP_ID

		if (!appId) {
			printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
			process.exit(1)
		}

		// 2. Fetch build history
		const spinner = createSpinner(`Fetching deployment history for ${appId}...`)
		spinner.start()

		const limit = options.limit || (options.all ? 100 : 10)
		const buildsResponse = await whopshipClient.getBuilds(appId, limit)
		const builds = buildsResponse.builds || []

		spinner.succeed(`Found ${builds.length} deployments`)

		if (builds.length === 0) {
			console.log()
			printInfo('No deployments found for this app.')
			console.log(chalk.dim('Run `whopctl deploy` to create your first deployment.'))
			return
		}

		// 4. Display history
		console.log()
		console.log(chalk.bold('📚 Deployment History'))
		console.log(chalk.gray('─'.repeat(80)))
		console.log()

		// Table header
		console.log(
			chalk.bold(
				`${'Build ID'.padEnd(38)} ${'Status'.padEnd(15)} ${'Created'.padEnd(12)} ${'Duration'.padEnd(10)}`,
			),
		)
		console.log(chalk.gray('─'.repeat(80)))

		for (const build of builds) {
			const buildId = `${build.build_id.substring(0, 8)}...`
			const status = formatBuildStatusWithIcon(build.status)
			const created = formatRelativeTime(build.created_at)

			// Calculate duration
			const createdTime = new Date(build.created_at)
			const updatedTime = new Date(build.updated_at)
			const durationMs = updatedTime.getTime() - createdTime.getTime()
			const durationMinutes = Math.floor(durationMs / (1000 * 60))
			const duration = durationMinutes > 0 ? `${durationMinutes}m` : '<1m'

			console.log(
				`${chalk.cyan(buildId.padEnd(38))} ${status.padEnd(25)} ${created.padEnd(12)} ${chalk.dim(duration.padEnd(10))}`,
			)

			// Show error message if failed
			if (build.status === 'failed' && build.error_message) {
				console.log(chalk.red(`  ↳ ${build.error_message.substring(0, 60)}...`))
			}
		}

		console.log()

		// Show current deployment info
		const currentBuild = builds[0]
		if (currentBuild && (currentBuild.status === 'built' || currentBuild.status === 'completed')) {
			const appUrl = `https://${currentBuild.app.subdomain}.whopship.app`
			console.log(chalk.bold.green('🚀 Current Deployment:'))
			console.log(`   ${chalk.cyan(appUrl)}`)
			console.log(`   Build: ${chalk.dim(currentBuild.build_id)}`)
			console.log()
		}

		// Show helpful commands
		console.log(chalk.bold('Quick Actions:'))
		console.log(`  ${chalk.blue('•')} View details: ${chalk.dim('whopctl status')}`)
		console.log(`  ${chalk.blue('•')} View logs: ${chalk.dim('whopctl status --logs')}`)
		console.log(
			`  ${chalk.blue('•')} Redeploy latest: ${chalk.dim(`whopctl redeploy ${builds[0]?.build_id}`)}`,
		)
		console.log(`  ${chalk.blue('•')} New deployment: ${chalk.dim('whopctl deploy')}`)
		console.log()

		if (!options.all && builds.length >= 10) {
			console.log(chalk.dim('💡 Use --all to see complete history'))
		}
	} catch (error) {
		printError(`Failed to get deployment history: ${error}`)
		process.exit(1)
	}
}
