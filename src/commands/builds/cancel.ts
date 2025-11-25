import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printWarning } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'
import { createSpinner } from '../../lib/progress.ts'

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
 * Cancel a build by build ID
 */
export async function cancelBuildCommand(buildId: string, path: string = '.'): Promise<void> {
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

		// First, get build status to verify it exists and can be cancelled
		printInfo(`Checking build status...`)
		let buildStatus
		try {
			buildStatus = await api.getBuildStatus(buildId)
		} catch (error: any) {
			if (error.message?.includes('404') || error.message?.includes('not found')) {
				printError(`Build not found: ${buildId}`)
				printInfo('Make sure you have the correct build ID and that you own this build.')
				process.exit(1)
			}
			throw error
		}

		const status = (buildStatus as any).status || buildStatus.status

		// Check if build can be cancelled
		if (status === 'built' || status === 'completed' || status === 'deployed' || status === 'active') {
			printWarning(`Build is already ${status} and cannot be cancelled.`)
			process.exit(1)
		}

		if (status === 'failed' || status === 'cancelled') {
			printWarning(`Build is already ${status}.`)
			process.exit(1)
		}

		// Confirm cancellation
		console.log()
		printInfo(`Build Status: ${status}`)
		printInfo(`Build ID: ${buildId}`)
		console.log()

		// Cancel the build
		const spinner = createSpinner('Cancelling build...')
		spinner.start()

		try {
			await api.cancelBuild(buildId)
			spinner.succeed('Build cancelled successfully')
			printSuccess(`✓ Build ${buildId} has been cancelled`)
		} catch (error: any) {
			spinner.fail('Failed to cancel build')
			const errorMessage = error.message || String(error)
			if (error.status === 404 || errorMessage.includes('404') || errorMessage.includes('not found')) {
				printError(`Build not found: ${buildId}`)
				printInfo('Make sure you have the correct build ID and that you own this build.')
			} else if (error.status === 400 || errorMessage.includes('cannot be cancelled') || errorMessage.includes('Cannot cancel')) {
				printError(`Build cannot be cancelled: ${errorMessage}`)
				if (status === 'deploying') {
					printInfo('Note: Builds in "deploying" status should be cancellable. This might be a temporary issue.')
					printInfo('If the build is stuck, it may complete on its own or you may need to wait for the deployment to finish.')
				}
			} else {
				printError(`Failed to cancel build: ${errorMessage}`)
				if (error.status) {
					printInfo(`HTTP Status: ${error.status}`)
				}
			}
			process.exit(1)
		}
	} catch (error: any) {
		printError(`Failed to cancel build: ${error.message || error}`)
		process.exit(1)
	}
}

