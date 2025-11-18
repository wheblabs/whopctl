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

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)

		printInfo(`Redeploying build ${buildId}...`)
		const response = (await api.redeploy(buildId)) as { build_id: string }

		printSuccess('✓ Build queued for redeployment')
		console.log()
		printInfo(`Build ID: ${response.build_id}`)
		printInfo('Check deployment status with "whopctl status"')
	} catch (error) {
		printError(`Redeploy failed: ${error}`)
		process.exit(1)
	}
}
