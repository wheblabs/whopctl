import { resolve } from 'node:path'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printWarning } from '../../lib/output.ts'
import { createSpinner } from '../../lib/progress.ts'
import { getErrorMessage } from '../../lib/retry.ts'
import { WhopshipApiError, whopshipClient } from '../../lib/whopship-client.ts'

/**
 * Cancel a build by build ID
 */
export async function cancelBuildCommand(buildId: string, path: string = '.'): Promise<void> {
	requireAuth()
	const _targetDir = resolve(process.cwd(), path)

	try {
		// First, get build status to verify it exists and can be cancelled
		printInfo(`Checking build status...`)
		let buildStatus
		try {
			buildStatus = await whopshipClient.getBuildStatus(buildId)
		} catch (error) {
			if (error instanceof WhopshipApiError && error.isNotFound) {
				printError(`Build not found: ${buildId}`)
				printInfo('Make sure you have the correct build ID and that you own this build.')
				process.exit(1)
			}
			throw error
		}

		const status = buildStatus.status

		// Check if build can be cancelled
		if (
			status === 'built' ||
			status === 'completed' ||
			status === 'deployed' ||
			status === 'active'
		) {
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
			await whopshipClient.cancelBuild(buildId)
			spinner.succeed('Build cancelled successfully')
			printSuccess(`✓ Build ${buildId} has been cancelled`)
		} catch (error) {
			spinner.fail('Failed to cancel build')
			const errorMessage = getErrorMessage(error)

			if (error instanceof WhopshipApiError) {
				if (error.isNotFound) {
					printError(`Build not found: ${buildId}`)
					printInfo('Make sure you have the correct build ID and that you own this build.')
				} else if (error.status === 400 || errorMessage.includes('cannot be cancelled')) {
					printError(`Build cannot be cancelled: ${errorMessage}`)
					if (status === 'deploying') {
						printInfo(
							'Note: Builds in "deploying" status should be cancellable. This might be a temporary issue.',
						)
						printInfo(
							'If the build is stuck, it may complete on its own or you may need to wait for the deployment to finish.',
						)
					}
				} else {
					printError(`Failed to cancel build: ${errorMessage}`)
					printInfo(`HTTP Status: ${error.status}`)
				}
			} else {
				printError(`Failed to cancel build: ${errorMessage}`)
			}
			process.exit(1)
		}
	} catch (error) {
		printError(`Failed to cancel build: ${getErrorMessage(error)}`)
		process.exit(1)
	}
}
