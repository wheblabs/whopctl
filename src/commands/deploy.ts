import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import chalk from 'chalk'
import { create as createTar } from 'tar'
import { aliasManager } from '../lib/alias-manager.ts'
import { requireAuth } from '../lib/auth-guard.ts'
import { createBuildTracker } from '../lib/build-tracker.ts'
import { readEnvFile } from '../lib/env.ts'
import { printError, printInfo, printSuccess, printWarning } from '../lib/output.ts'
import { createSpinner } from '../lib/progress.ts'
import { validateProject } from '../lib/project-validator.ts'
import { createContextualError } from '../lib/retry.ts'
import { whopshipClient } from '../lib/whopship-client.ts'

/**
 * Create tar.gz archive of the project
 */
async function createArchive(dir: string): Promise<{ path: string; sha256: string }> {
	const tarPath = join(dir, '.whopctl-build.tar')
	const gzPath = join(dir, '.whopctl-build.tar.gz')

	printInfo('Creating tar archive...')

	// Create tar (exclude common directories)
	await createTar(
		{
			gzip: false,
			file: tarPath,
			cwd: dir,
			filter: (path) => {
				const excluded = [
					'node_modules',
					'.next',
					'.git',
					'.whopctl-build.tar',
					'.whopctl-build.tar.gz',
				]
				return !excluded.some((e) => path.includes(e))
			},
		},
		['.'], // Archive everything from current directory
	)

	printInfo('Compressing with gzip...')

	// Compress with gzip (fastest for upload + build-runner expectations)
	await pipeline(
		createReadStream(tarPath),
		createGzip({ level: 1 }), // prioritize speed over ratio
		createWriteStream(gzPath),
	)

	// Calculate SHA256
	printInfo('Calculating SHA256...')
	const fileBuffer = await readFile(gzPath)
	const sha256 = createHash('sha256').update(fileBuffer).digest('hex')

	// Clean up tar file
	await unlink(tarPath)

	const stats = await stat(gzPath)
	printSuccess(`✓ Archive created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

	return { path: gzPath, sha256 }
}

/**
 * Upload archive to S3 with spinner (fetch doesn't support upload progress)
 */
async function uploadToS3(filePath: string, uploadUrl: string, _sha256: string): Promise<void> {
	const fileBuffer = await readFile(filePath)
	const totalSize = fileBuffer.length
	const sizeMB = (totalSize / 1024 / 1024).toFixed(2)

	// Use a spinner instead of a fake progress bar
	// (fetch API doesn't provide upload progress events)
	const spinner = createSpinner(`Uploading ${sizeMB} MB...`)
	spinner.start()

	// Use 5 minute timeout for large file uploads
	const uploadTimeout = 5 * 60 * 1000
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), uploadTimeout)

	try {
		const response = await fetch(uploadUrl, {
			method: 'PUT',
			body: fileBuffer,
			headers: {
				'Content-Type': 'application/octet-stream',
			},
			signal: controller.signal,
		})

		clearTimeout(timeoutId)

		if (!response.ok) {
			spinner.fail('Upload failed')
			throw new Error(`Upload failed: ${response.status} ${await response.text()}`)
		}

		spinner.succeed(`Uploaded ${sizeMB} MB`)
	} catch (error) {
		clearTimeout(timeoutId)
		if (error instanceof Error && error.name === 'AbortError') {
			spinner.fail(`Upload timed out after ${uploadTimeout / 1000}s`)
			throw new Error(`Upload timed out after ${uploadTimeout / 1000} seconds`)
		}
		spinner.fail('Upload failed')
		throw error
	}
}

/**
 * Build the project based on its type
 */
async function buildProject(dir: string, projectType: string): Promise<void> {
	const spinner = createSpinner('Building project...')
	spinner.start()

	try {
		const { spawn } = await import('node:child_process')

		let buildCommand: string
		let buildArgs: string[]

		// Determine build command based on project type
		switch (projectType) {
			case 'nextjs':
				// Check for package manager
				try {
					await readFile(join(dir, 'bun.lockb'))
					buildCommand = 'bun'
					buildArgs = ['run', 'build']
				} catch {
					try {
						await readFile(join(dir, 'pnpm-lock.yaml'))
						buildCommand = 'pnpm'
						buildArgs = ['run', 'build']
					} catch {
						try {
							await readFile(join(dir, 'yarn.lock'))
							buildCommand = 'yarn'
							buildArgs = ['build']
						} catch {
							buildCommand = 'npm'
							buildArgs = ['run', 'build']
						}
					}
				}
				break
			default:
				spinner.warn(`Unknown project type: ${projectType}, skipping build`)
				return
		}

		// Run the build command
		const child = spawn(buildCommand, buildArgs, {
			cwd: dir,
			stdio: 'pipe',
		})

		let output = ''
		let errorOutput = ''

		child.stdout?.on('data', (data) => {
			output += data.toString()
		})

		child.stderr?.on('data', (data) => {
			errorOutput += data.toString()
		})

		const exitCode = await new Promise<number>((resolve) => {
			child.on('exit', (code) => resolve(code || 0))
		})

		if (exitCode !== 0) {
			spinner.fail('Build failed')
			console.log()
			printError('Build output:')
			console.log(chalk.dim(output))
			if (errorOutput) {
				printError('Build errors:')
				console.log(chalk.red(errorOutput))
			}
			throw new Error(`Build command failed with exit code ${exitCode}`)
		}

		spinner.succeed('✓ Project built successfully')
	} catch (error) {
		spinner.fail('Build failed')
		throw error
	}
}

/**
 * Ensure Next.js config has standalone output
 */
async function ensureStandaloneOutput(dir: string): Promise<void> {
	const configPath = join(dir, 'next.config.js')
	const configTsPath = join(dir, 'next.config.ts')

	// Try both .js and .ts
	let configFile = configPath
	try {
		await readFile(configTsPath)
		configFile = configTsPath
	} catch {
		// Use .js
	}

	try {
		let config = await readFile(configFile, 'utf-8')

		// Check if standalone is already configured
		if (config.includes("output: 'standalone'") || config.includes('output: "standalone"')) {
			printInfo('✓ Next.js already configured for standalone output')
			return
		}

		// Add standalone output
		printInfo('Adding standalone output to Next.js config...')

		// Simple regex replacement - add output to nextConfig
		config = config.replace(
			/const nextConfig\s*=\s*{/,
			"const nextConfig = {\n  output: 'standalone',",
		)

		await writeFile(configFile, config)
		printSuccess('✓ Updated Next.js config for standalone build')
	} catch (_error) {
		printWarning('Could not update Next.js config - ensure output: "standalone" is set manually')
	}
}

/**
 * Handles the "deploy" command.
 * Initiates a deployment by sending source to the whopship API.
 *
 * @param path Optional path to the project directory (defaults to current directory)
 * @param projectIdentifier Optional project name/alias or app ID to deploy
 * @param options Optional deployment options
 */
export async function deployCommand(
	path: string = '.',
	projectIdentifier?: string,
	options: { background?: boolean } = {},
): Promise<void> {
	requireAuth()
	const targetDir = resolve(process.cwd(), path)

	try {
		printInfo(`Deploying from: ${targetDir}`)

		// 1. Validate project
		printInfo('🔍 Validating project...')
		const validationResult = await validateProject(targetDir, { verbose: false })

		if (!validationResult.isValid) {
			console.log()
			console.log(chalk.bold.red('❌ Project validation failed'))
			console.log()

			for (const error of validationResult.errors) {
				printError(`✗ ${error}`)
			}

			if (validationResult.suggestions.length > 0) {
				console.log()
				printInfo('💡 Suggestions:')
				for (const suggestion of validationResult.suggestions) {
					console.log(chalk.blue(`  • ${suggestion}`))
				}
			}

			console.log()
			printError('Please fix the above issues before deploying.')
			process.exit(1)
		}

		// Show warnings but continue
		if (validationResult.warnings.length > 0) {
			console.log()
			printWarning('⚠️  Project validation warnings:')
			for (const warning of validationResult.warnings) {
				console.log(chalk.yellow(`  • ${warning}`))
			}
			console.log()
		}

		printSuccess(`✅ Project validated (${validationResult.projectType})`)

		// 2. Resolve project identifier (alias, app ID, or .env)
		let appId: string
		let companyId: string

		if (projectIdentifier) {
			// Use provided project identifier
			printInfo(`🔍 Resolving project: ${projectIdentifier}`)
			try {
				const { appId: resolvedAppId } = await aliasManager.resolveProjectId(projectIdentifier)
				appId = resolvedAppId
				printSuccess(`✓ Resolved to App ID: ${appId}`)

				// Still need company ID from .env for now
				const env = await readEnvFile(targetDir)
				const envCompanyId = env.NEXT_PUBLIC_WHOP_COMPANY_ID
				if (!envCompanyId) {
					printError('NEXT_PUBLIC_WHOP_COMPANY_ID required in .env file')
					process.exit(1)
				}
				companyId = envCompanyId
				printInfo(`  Company ID: ${companyId}`)
			} catch (error) {
				printError(`Failed to resolve project: ${error}`)
				process.exit(1)
			}
		} else {
			// Read from .env (already validated)
			printInfo('📄 Reading configuration from .env...')
			const env = await readEnvFile(targetDir)

			const envAppId = env.NEXT_PUBLIC_WHOP_APP_ID
			const envCompanyId = env.NEXT_PUBLIC_WHOP_COMPANY_ID

			if (!envAppId) {
				printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
				process.exit(1)
			}

			if (!envCompanyId) {
				printError('NEXT_PUBLIC_WHOP_COMPANY_ID not found in .env file')
				process.exit(1)
			}

			appId = envAppId
			companyId = envCompanyId

			printSuccess(`✓ App ID: ${appId}`)
			printInfo(`  Company ID: ${companyId}`)
		}

		// Ensure Next.js is configured for standalone output
		if (validationResult.projectType === 'nextjs') {
			await ensureStandaloneOutput(targetDir)
		}

		// 3. Build the project
		await buildProject(targetDir, validationResult.projectType)

		// 4. Create archive
		const { path: archivePath, sha256 } = await createArchive(targetDir)
		printInfo(`  Source SHA256: ${sha256}`)

		// 5. Check billing status and show onboarding for free tier
		// Check subscription status
		printInfo('Checking subscription status...')
		let subscriptionStatus
		try {
			subscriptionStatus = await whopshipClient.getSubscriptionStatus()

			// Show free tier onboarding if on free tier
			if (subscriptionStatus.tier === 'free' && subscriptionStatus.subscriptionStatus === 'free') {
				console.log()
				printInfo('🎉 Welcome to WhopShip Free Tier!')
				console.log()
				console.log(chalk.dim("You're on the free tier with the following limits:"))
				console.log(
					chalk.dim(
						`  • ${subscriptionStatus.tierInfo.limits.functionInvocations.toLocaleString()} function invocations/month`,
					),
				)
				console.log(
					chalk.dim(`  • ${subscriptionStatus.tierInfo.limits.bandwidthGb} GB bandwidth/month`),
				)
				console.log(
					chalk.dim(`  • ${subscriptionStatus.tierInfo.limits.buildMinutes} build minutes/month`),
				)
				console.log(chalk.dim(`  • ${subscriptionStatus.tierInfo.limits.storageGb} GB storage`))
				console.log(
					chalk.dim(`  • ${subscriptionStatus.tierInfo.limits.deployments} deployments/month`),
				)
				console.log()
				printInfo('💡 Upgrade anytime:')
				console.log(chalk.dim('   whopctl billing subscribe hobby  # $20/month'))
				console.log(chalk.dim('   whopctl billing subscribe pro    # $100/month'))
				console.log()
			}
		} catch (_error) {
			// If subscription check fails, continue anyway (might be first deploy)
			printWarning('Could not check subscription status, continuing...')
		}

		// 6. Get presigned URL
		printInfo('\nInitializing deployment...')
		let response
		try {
			response = await whopshipClient.deployInit({
				whop_app_id: appId,
				whop_app_company_id: companyId,
				source_sha256: sha256,
			})

			// Check for billing warnings/overages in response
			if (response.billing) {
				console.log()
				if (response.billing.warnings && response.billing.warnings.length > 0) {
					printWarning('⚠️  Usage Limit Warnings:')
					for (const warning of response.billing.warnings) {
						console.log(chalk.yellow(`  • ${warning}`))
					}
					console.log()

					if (response.billing.totalOverageCost && response.billing.totalOverageCost > 0) {
						printWarning(
							`  Estimated overage cost: $${response.billing.totalOverageCost.toFixed(4)}`,
						)
						console.log()
					}

					if (response.billing.gracePeriodEndsAt) {
						const graceEnd = new Date(response.billing.gracePeriodEndsAt)
						const now = new Date()
						const daysRemaining = Math.ceil(
							(graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
						)
						if (daysRemaining > 0) {
							printInfo(
								`⏰ Grace period: ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining (ends ${graceEnd.toLocaleDateString()})`,
							)
							console.log()
						}
					}

					printInfo('💡 Consider upgrading your tier to avoid overage charges:')
					console.log(chalk.dim('   whopctl billing subscribe hobby  # $20/month'))
					console.log(chalk.dim('   whopctl billing subscribe pro    # $100/month'))
					console.log()
				}
			}
		} catch (error: any) {
			// Handle billing errors
			if (error.message?.includes('402') || error.message?.includes('Billing check failed')) {
				console.log()
				printError('Billing check failed')
				if (error.message) {
					console.log(chalk.red(error.message))
				}
				console.log()
				printInfo('💡 To subscribe to a tier:')
				console.log(chalk.dim('   whopctl billing subscribe free   # Free tier'))
				console.log(chalk.dim('   whopctl billing subscribe hobby  # $20/month'))
				console.log(chalk.dim('   whopctl billing subscribe pro    # $100/month'))
				console.log()
				process.exit(1)
			}
			throw error
		}

		printSuccess('✓ Deployment initialized')
		printInfo(`  Build ID: ${response.build_id}`)

		// 7. Upload to S3
		await uploadToS3(archivePath, response.upload.url, sha256)

		// 8. Clean up archive
		await unlink(archivePath)

		// 9. Mark upload as complete
		const spinner = createSpinner('Finalizing deployment...')
		spinner.start()

		const completeResponse = await whopshipClient.deployComplete(response.build_id)
		spinner.succeed(`Build queued as ${completeResponse.status}`)

		// Check for billing warnings in complete response
		if (completeResponse.billing) {
			if (completeResponse.billing.warnings && completeResponse.billing.warnings.length > 0) {
				console.log()
				printWarning('⚠️  Usage Limit Warnings:')
				for (const warning of completeResponse.billing.warnings) {
					console.log(chalk.yellow(`  • ${warning}`))
				}
				console.log()

				if (
					completeResponse.billing.totalOverageCost &&
					completeResponse.billing.totalOverageCost > 0
				) {
					printWarning(
						`  Estimated overage cost: $${completeResponse.billing.totalOverageCost.toFixed(4)}`,
					)
					console.log()
				}
			}
		}

		if (options.background) {
			// Background mode - just show the build ID and exit
			console.log()
			printSuccess('✅ Deployment queued successfully!')
			printInfo(`📋 Build ID: ${chalk.cyan(response.build_id)}`)
			console.log()
			printInfo('💡 Check progress with:')
			console.log(chalk.dim(`   whopctl status`))
			console.log(chalk.dim(`   whopctl logs app --follow`))
			console.log()
			return
		}

		// 10. Track build progress in real-time
		console.log()
		printInfo('🔨 Starting build process...')
		console.log(chalk.dim('This may take several minutes depending on your app size'))
		console.log(
			chalk.dim(
				'💡 Press Ctrl+C to run in background, then use `whopctl status` to check progress',
			),
		)
		console.log()

		const buildTracker = createBuildTracker(whopshipClient, response.build_id, {
			showLogs: true,
			pollInterval: 3000,
		})

		try {
			await buildTracker.trackBuild()
			await buildTracker.showBuildSummary()
		} catch (buildError) {
			printError(`Build failed: ${buildError}`)
			printInfo('\nTroubleshooting tips:')
			console.log(chalk.dim('• Check your .env file has all required variables'))
			console.log(chalk.dim('• Ensure your Next.js app builds locally with `npm run build`'))
			console.log(chalk.dim('• Run `whopctl status` to view detailed build logs'))
			console.log(chalk.dim(`• Build ID: ${response.build_id}`))
			throw buildError
		}
	} catch (error) {
		// Provide contextual error messages
		let contextualError: Error

		if (error instanceof Error) {
			if (error.message.includes('ENOENT') && error.message.includes('.env')) {
				contextualError = createContextualError(error, 'validation')
			} else if (error.message.includes('401') || error.message.includes('403')) {
				contextualError = createContextualError(error, 'authentication')
			} else if (error.message.includes('Build failed') || error.message.includes('deployment')) {
				contextualError = createContextualError(error, 'deployment')
			} else if (error.message.includes('fetch') || error.message.includes('network')) {
				contextualError = createContextualError(error, 'network')
			} else {
				contextualError = error
			}
		} else {
			contextualError = new Error(String(error))
		}

		printError(`Deployment failed: ${contextualError.message}`)

		// Provide helpful next steps
		console.log()
		printInfo('💡 Need help? Try these steps:')
		console.log(chalk.dim('• Run `whopctl status` to check your latest deployment'))
		console.log(chalk.dim('• Verify your .env file has all required variables'))
		console.log(chalk.dim('• Test your app locally with `npm run build`'))
		console.log(chalk.dim('• Check our docs: https://docs.whopship.app'))

		process.exit(1)
	}
}
