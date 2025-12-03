import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { readEnvFile } from '../../lib/env.ts'
import { formatBuildStatus } from '../../lib/format.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { type BuildStatus, whopshipClient } from '../../lib/whopship-client.ts'

export async function listBuildsCommand(path: string = '.', limit: number = 10): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		const env = await readEnvFile(targetDir)
		const appId = env.NEXT_PUBLIC_WHOP_APP_ID

		if (!appId) {
			printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
			process.exit(1)
		}

		printInfo(`Fetching builds for app ${appId}...`)
		const response = (await whopshipClient.getBuilds(appId, limit)) as { builds: BuildStatus[] }

		if (!response.builds || response.builds.length === 0) {
			printInfo('No builds found for this app')
			return
		}

		console.log()
		printSuccess('📦 Recent Builds')
		console.log()

		for (const build of response.builds) {
			const hasArtifacts = build.artifacts ? '✓' : ' '
			const date = new Date(build.created_at).toLocaleString()

			console.log(`${hasArtifacts} ${formatBuildStatus(build.status).padEnd(12)} ${date}`)
			console.log(`  ID: ${build.build_id}`) // Full ID on its own line - easy to copy

			if (build.error_message) {
				console.log(`  ${chalk.red('Error:')} ${build.error_message.substring(0, 80)}`)
			}
			console.log() // Empty line between builds
		}

		printInfo('Use "whopctl builds deploy <build-id>" to deploy a build')
	} catch (error) {
		printError(`Failed to list builds: ${error}`)
		process.exit(1)
	}
}
