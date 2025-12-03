import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { getErrorMessage } from '../../lib/retry.ts'
import { WhopshipApiError, whopshipClient } from '../../lib/whopship-client.ts'

export async function redeployBuildCommand(buildId: string): Promise<void> {
	requireAuth()

	try {
		printInfo(`Redeploying build ${buildId}...`)
		const response = (await whopshipClient.redeploy(buildId)) as {
			build_id: string
			status?: string
		}

		printSuccess('✓ Build queued for redeployment')
		console.log()
		printInfo(`Build ID: ${response.build_id}`)
		if (response.status) {
			printInfo(`Status: ${response.status}`)
		}
		console.log()
		printInfo('💡 Tip: Run "whopctl status" to see updated deployment status')
	} catch (error) {
		let errorMessage = getErrorMessage(error)

		// Provide better context for specific errors
		if (error instanceof WhopshipApiError) {
			// Try to get detailed message from errorJson
			if (error.errorJson?.message && typeof error.errorJson.message === 'string') {
				errorMessage = error.errorJson.message
			}
			// Handle specific error cases
			else if (errorMessage === 'Build artifacts not found' || error.isNotFound) {
				errorMessage =
					'Cannot redeploy a failed build without artifacts. The build likely failed during the build phase. Please create a new build instead.'
			}
		}

		printError(`Redeploy failed: ${errorMessage}`)
		process.exit(1)
	}
}
