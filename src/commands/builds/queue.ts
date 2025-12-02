import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'

/**
 * Simple .env reader
 */
async function readEnvFile(dir: string): Promise<Record<string, string>> {
	const envPath = resolve(dir, '.env')
	const content = await readFile(envPath, 'utf-8')
	const env: Record<string, string> = {}

	for (const line of content.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue

		const [key, ...valueParts] = trimmed.split('=')
		if (key && valueParts.length > 0) {
			let value = valueParts.join('=').trim()
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1)
			}
			env[key.trim()] = value
		}
	}

	return env
}

/**
 * Format status with color
 */
function formatStatus(status: string): string {
	const colors: Record<string, (text: string) => string> = {
		queued: chalk.yellow,
		building: chalk.blue,
		deploying: chalk.cyan,
		uploading: chalk.cyan,
		uploaded: chalk.cyan,
		built: chalk.green,
		failed: chalk.red,
		cancelled: chalk.gray,
	}
	const colorFn = colors[status] || chalk.white
	return colorFn(status.toUpperCase())
}

/**
 * Show queue status
 */
export async function queueStatusCommand(path: string = '.', appId?: string): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
			uidToken: session.uidToken,
			ssk: session.ssk,
			userId: session.userId,
		})

		// If no appId provided, try to get it from .env
		let targetAppId = appId
		if (!targetAppId) {
			try {
				const env = await readEnvFile(targetDir)
				targetAppId = env.NEXT_PUBLIC_WHOP_APP_ID
			} catch {
				// .env not found, that's okay - we'll show all queues
			}
		}

		printInfo('Fetching queue status...')
		const queueStatus = await api.getQueueStatus(targetAppId)

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
				const statusBadge = formatStatus(item.status)

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
	} catch (error: any) {
		printError(`Failed to get queue status: ${error.message || error}`)
		process.exit(1)
	}
}
