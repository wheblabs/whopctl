import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI, type BuildStatus } from '../../lib/whopship-api.ts'

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

function formatStatus(status: string): string {
	const colors: Record<string, (text: string) => string> = {
		init: chalk.gray,
		uploading: chalk.blue,
		uploaded: chalk.cyan,
		queued: chalk.yellow,
		building: chalk.yellow,
		built: chalk.green,
		failed: chalk.red,
	}
	const colorFn = colors[status] || chalk.white
	return colorFn(status.toUpperCase())
}

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

		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)

		printInfo(`Fetching builds for app ${appId}...`)
		const response = (await api.getBuilds(appId, limit)) as { builds: BuildStatus[] }

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

			console.log(`${hasArtifacts} ${formatStatus(build.status).padEnd(12)} ${date}`)
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
