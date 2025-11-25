import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'

export async function redeployBuildCommand(buildId: string): Promise<void> {
	requireAuth()

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

		printInfo(`Redeploying build ${buildId}...`)
		const response = (await api.redeploy(buildId)) as { build_id: string; status?: string }

		printSuccess('✓ Build queued for redeployment')
		console.log()
		printInfo(`Build ID: ${response.build_id}`)
		if (response.status) {
			printInfo(`Status: ${response.status}`)
		}
		console.log()
		printInfo('💡 Tip: Run "whopctl status" to see updated deployment status')
	} catch (error: any) {
		// Extract the full error message
		// The error object might not have errorJson attached due to bundling/transpilation issues
		// So we'll try multiple strategies to get the detailed message
		let errorMessage: string = error?.message || String(error)
		
		// Strategy 1: Try to get the detailed message from errorJson if available
		if (error?.errorJson?.message) {
			errorMessage = error.errorJson.message
		} 
		// Strategy 2: Try to parse responseBody if available
		else if (error?.responseBody) {
			try {
				const errorData = JSON.parse(error.responseBody)
				if (errorData?.message) {
					errorMessage = errorData.message
				}
			} catch {
				// Ignore parsing errors
			}
		}
		// Strategy 3: If the error message is the short "error" field, provide helpful context
		// This handles cases where the API client didn't extract the message field properly
		else if (errorMessage === 'Build artifacts not found') {
			// The API returns: {"error": "Build artifacts not found", "message": "Cannot redeploy..."}
			// Provide a helpful message when we detect this specific error
			errorMessage = 'Cannot redeploy a failed build without artifacts. The build likely failed during the build phase. Please create a new build instead.'
		}
		
		printError(`Redeploy failed: ${errorMessage}`)
		process.exit(1)
	}
}
