import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { readEnvFileSafe } from '../../lib/env.ts'
import { formatBuildStatus } from '../../lib/format.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { getErrorMessage } from '../../lib/retry.ts'
import { whopshipClient } from '../../lib/whopship-client.ts'

/**
 * Show queue status
 */
export async function queueStatusCommand(path: string = '.', appId?: string): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		// If no appId provided, try to get it from .env
		let targetAppId = appId
		if (!targetAppId) {
			try {
				const env = await readEnvFileSafe(targetDir)
				targetAppId = env.NEXT_PUBLIC_WHOP_APP_ID
			} catch {
				// .env not found, that's okay - we'll show all queues
			}
		}

		printInfo('Fetching queue status...')
		const queueStatus = await whopshipClient.getQueueStatus(targetAppId)

		console.log()
		printSuccess('📊 Build Queue Status')
		console.log()

		// Show summary
		console.log(chalk.bold('Summary:'))
		console.log(`  Queued builds: ${chalk.yellow(queueStatus.queued?.toString() || '0')}`)
		console.log(`  Building: ${chalk.blue(queueStatus.building?.toString() || '0')}`)
		if (queueStatus.deploying && queueStatus.deploying > 0) {
			console.log(`  Deploying: ${chalk.cyan(queueStatus.deploying.toString())}`)
		}
		console.log()

		// Show queue details
		if (queueStatus.queue && queueStatus.queue.length > 0) {
			console.log(chalk.bold('Queue:'))
			console.log()

			for (const [index, item] of queueStatus.queue.entries()) {
				const position = item.position !== undefined ? item.position : index + 1
				const date = new Date(item.created_at).toLocaleString()
				const statusBadge = formatBuildStatus(item.status)

				console.log(`  ${position}. ${statusBadge.padEnd(12)} ${item.app_name || item.app_id}`)
				console.log(`     Build ID: ${item.build_id}`)
				console.log(`     Created: ${date}`)
				if (item.status === 'queued' && position > 1) {
					const estimatedWait = (position - 1) * 3 // Rough estimate: 3 min per build
					console.log(`     Estimated wait: ~${estimatedWait} minutes`)
				}
				console.log()
			}
		} else {
			console.log(chalk.dim('  No builds in queue'))
			console.log()
		}

		printInfo('Use "whopctl builds cancel <build-id>" to cancel a queued build')
	} catch (error) {
		printError(`Failed to get queue status: ${getErrorMessage(error)}`)
		process.exit(1)
	}
}
