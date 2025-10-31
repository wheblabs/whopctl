import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { BuildManager } from '../../lib/build.ts'
import { hasWhopshipConfig, loadWhopshipConfig } from '../../lib/config.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { isInReplMode } from '../../lib/repl-context.ts'
import { type DeploymentStatus, whopship } from '../../lib/whopship.ts'

/**
 * Handles the "apps deploy" command.
 *
 * This command:
 * 1. Builds the Next.js app with OpenNext Cloudflare adapter
 * 2. Creates a deployment artifact (zip file)
 * 3. Uploads the artifact to WhopShip's R2 storage
 * 4. Triggers the deployment process
 * 5. Monitors deployment status and streams logs
 *
 * @param appId The Whop app ID to deploy (optional if whopship.config.json exists)
 */
export async function deployAppCommand(appId?: string): Promise<void> {
	// Ensure user is authenticated
	requireAuth()

	// If no appId provided, try to load from config file
	if (!appId) {
		if (!hasWhopshipConfig()) {
			printError('No app ID provided and no whopship.config.json found')
			console.log(chalk.dim('Usage:'))
			console.log(chalk.dim('  whopctl deploy <app-id>'))
			console.log(chalk.dim('  OR create a whopship.config.json with "whopAppId"'))
			if (!isInReplMode()) {
				process.exit(1)
			}
			return
		}

		try {
			const config = loadWhopshipConfig()
			appId = config.whopAppId
			printInfo(`Using app ID from whopship.config.json: ${appId}`)
		} catch (error) {
			printError('Failed to load whopship.config.json')
			if (error instanceof Error) {
				console.error(chalk.red(error.message))
			}
			if (!isInReplMode()) {
				process.exit(1)
			}
			return
		}
	}

	const buildManager = new BuildManager()

	try {
		// Step 1: Build with OpenNext
		printInfo('Building with OpenNext Cloudflare adapter...')
		console.log(chalk.dim('Running: npx @opennextjs/cloudflare build\n'))

		await buildManager.buildOpenNext()
		printSuccess('Build completed successfully')

		// Step 2: Create artifact
		printInfo('Creating deployment artifact...')
		const artifactPath = await buildManager.createArtifact()
		const metadata = buildManager.getMetadata()
		const checksum = buildManager.getChecksum()

		printSuccess(`Artifact created: ${artifactPath}`)
		if (metadata) {
			console.log(chalk.dim(`  Next.js: ${metadata.nextVersion || 'unknown'}`))
			console.log(
				chalk.dim(`  OpenNext: ${metadata.opennextVersion || 'unknown'}`),
			)
			console.log(
				chalk.dim(`  Build time: ${metadata.buildTime}ms`),
			)
		}

		// Step 3: Create deployment
		printInfo('Creating deployment on WhopShip...')
		const deployment = await whopship.createDeployment({
			whopAppId: appId,
			metadata: metadata || undefined,
			checksum: checksum || undefined,
		})

		printSuccess(`Deployment created: ${deployment.deployment.id}`)
		console.log(chalk.dim(`  UUID: ${deployment.deployment.uuid}`))

		// Step 4: Upload artifact
		printInfo('Uploading artifact to R2...')
		await whopship.uploadArtifact(deployment.uploadUrl, artifactPath)
		printSuccess('Artifact uploaded successfully')

		// Step 5: Trigger deployment
		printInfo('Triggering deployment...')
		await whopship.triggerDeployment(deployment.deployment.id)
		printSuccess('Deployment triggered')

		// Step 6: Monitor status and stream logs
		printInfo('Monitoring deployment progress...')
		console.log(chalk.dim('This may take a few minutes...\n'))

		await monitorDeployment(deployment.deployment.id)
	} catch (error) {
		printError('Deployment failed')
		if (error instanceof Error) {
			console.error(chalk.red(error.message))
		}

		// In REPL mode, don't exit - just return
		if (!isInReplMode()) {
			process.exit(1)
		}
	} finally {
		// Always cleanup temp files
		await buildManager.cleanup()
	}
}

/**
 * Monitors a deployment until it completes or fails.
 *
 * This function:
 * - Polls deployment status every 5 seconds
 * - Streams logs in real-time
 * - Shows rollout stages (50% → 100%)
 * - Displays final URL on success
 *
 * @param deploymentId The deployment ID to monitor
 */
async function monitorDeployment(deploymentId: number): Promise<void> {
	let lastLogLength = 0
	let status: DeploymentStatus['deployment']['status'] = 'building'

	while (status !== 'active' && status !== 'failed') {
		// Wait 5 seconds between polls
		await sleep(5000)

		try {
			// Get current status
			const statusData = await whopship.getDeploymentStatus(deploymentId)
			status = statusData.deployment.status

			// Show status update
			const statusEmoji = getStatusEmoji(status)
			const rolloutInfo = statusData.deployment.rolloutStage
				? ` (${formatRolloutStage(statusData.deployment.rolloutStage)})`
				: ''

			console.log(
				chalk.blue('⟳'),
				`Status: ${chalk.bold(status)}${rolloutInfo}`,
			)

			// Try to fetch and stream logs
			try {
				const logs = await whopship.getDeploymentLogs(deploymentId)
				if (logs && logs.length > lastLogLength) {
					const newLogs = logs.slice(lastLogLength)
					process.stdout.write(chalk.dim(newLogs))
					lastLogLength = logs.length
				}
			} catch (_logError) {
				// Logs might not be available yet, that's okay
			}
		} catch (error) {
			printError('Failed to check deployment status')
			if (error instanceof Error) {
				console.error(chalk.dim(error.message))
			}
			// Continue polling despite errors
		}
	}

	// Final status
	if (status === 'active') {
		console.log('')
		printSuccess('Deployment completed successfully!')

		// Get final deployment info with URL
		try {
			const finalData = await whopship.getDeploymentStatus(deploymentId)
			if (finalData.url) {
				console.log(chalk.bold.green('\n🌐 Your app is live at:'))
				console.log(chalk.cyan.underline(`   ${finalData.url}`))
				console.log('')
			}
		} catch (_error) {
			// URL fetch failed, but deployment succeeded
		}
	} else if (status === 'failed') {
		console.log('')
		printError('Deployment failed')

		// Try to fetch final logs
		try {
			const logs = await whopship.getDeploymentLogs(deploymentId)
			if (logs && logs.length > lastLogLength) {
				const newLogs = logs.slice(lastLogLength)
				console.error(chalk.dim(newLogs))
			}
		} catch (_logError) {
			// Couldn't fetch logs
		}

		printInfo('Check the logs above for error details.')
		throw new Error('Deployment failed')
	}
}

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Gets an emoji for a deployment status.
 */
function getStatusEmoji(
	status: DeploymentStatus['deployment']['status'],
): string {
	switch (status) {
		case 'pending':
			return '⏳'
		case 'building':
			return '🔨'
		case 'deploying':
			return '🚀'
		case 'active':
			return '✅'
		case 'failed':
			return '❌'
		default:
			return '❓'
	}
}

/**
 * Formats a rollout stage for display.
 */
function formatRolloutStage(
	stage: 'stage1_50' | 'stage2_100' | 'complete',
): string {
	switch (stage) {
		case 'stage1_50':
			return '50% traffic'
		case 'stage2_100':
			return '100% traffic'
		case 'complete':
			return 'rollout complete'
		default:
			return stage
	}
}
