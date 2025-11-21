import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, writeFile, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { create as createTar } from 'tar'
import chalk from 'chalk'
import { requireAuth } from '../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printWarning } from '../lib/output.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'
import { createProgressBar, createSpinner } from '../lib/progress.ts'
import { createBuildTracker } from '../lib/build-tracker.ts'
import { createContextualError } from '../lib/retry.ts'
import { validateProject } from '../lib/project-validator.ts'
import { aliasManager } from '../lib/alias-manager.ts'

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
 * Upload archive to S3 with progress tracking
 */
async function uploadToS3(filePath: string, uploadUrl: string, sha256: string): Promise<void> {
	const fileBuffer = await readFile(filePath)
	const totalSize = fileBuffer.length
	const progressBar = createProgressBar({
		total: totalSize,
		format: 'Uploading [:bar] :percent (:current/:total bytes) :eta',
	})

	printInfo(`Uploading ${(totalSize / 1024 / 1024).toFixed(2)} MB to S3...`)

	// Create a readable stream to track progress
	const chunks: Buffer[] = []
	const chunkSize = Math.max(1024 * 64, Math.floor(totalSize / 100)) // 64KB or 1% chunks

	for (let i = 0; i < totalSize; i += chunkSize) {
		const end = Math.min(i + chunkSize, totalSize)
		chunks.push(fileBuffer.subarray(i, end))
	}

	const response = await fetch(uploadUrl, {
		method: 'PUT',
		body: fileBuffer,
		headers: {
			'Content-Type': 'application/octet-stream',
		},
	})

	// Simulate progress for upload (since fetch doesn't provide upload progress)
	let uploaded = 0
	const progressInterval = setInterval(() => {
		uploaded = Math.min(uploaded + chunkSize, totalSize)
		progressBar.update(uploaded)
		if (uploaded >= totalSize) {
			clearInterval(progressInterval)
		}
	}, 50)

	if (!response.ok) {
		clearInterval(progressInterval)
		throw new Error(`Upload failed: ${response.status} ${await response.text()}`)
	}

	clearInterval(progressInterval)
	progressBar.complete()
	printSuccess('✓ Upload complete')
}

/**
 * Reads environment variables from .env file
 */
async function readEnvFile(dir: string): Promise<Record<string, string>> {
	const envPath = resolve(dir, '.env')

	try {
		const content = await readFile(envPath, 'utf-8')
		const env: Record<string, string> = {}

		for (const line of content.split('\n')) {
			const trimmed = line.trim()
			// Skip comments and empty lines
			if (!trimmed || trimmed.startsWith('#')) continue

			const [key, ...valueParts] = trimmed.split('=')
			if (key && valueParts.length > 0) {
				// Remove quotes if present
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
	} catch (error) {
		throw new Error(`Failed to read .env file at ${envPath}: ${error}`)
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
	} catch (error) {
		printWarning('Could not update Next.js config - ensure output: "standalone" is set manually')
	}
}

/**
 * Handles the "deploy" command.
 * Initiates a deployment by sending source to the whopship API.
 *
 * @param path Optional path to the project directory (defaults to current directory)
 * @param projectIdentifier Optional project name/alias or app ID to deploy
 */
export async function deployCommand(path: string = '.', projectIdentifier?: string): Promise<void> {
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
				companyId = env.NEXT_PUBLIC_WHOP_COMPANY_ID
				if (!companyId) {
					printError('NEXT_PUBLIC_WHOP_COMPANY_ID required in .env file')
					process.exit(1)
				}
				printInfo(`  Company ID: ${companyId}`)
			} catch (error) {
				printError(`Failed to resolve project: ${error}`)
				process.exit(1)
			}
		} else {
			// Read from .env (already validated)
			printInfo('📄 Reading configuration from .env...')
			const env = await readEnvFile(targetDir)

			appId = env.NEXT_PUBLIC_WHOP_APP_ID
			companyId = env.NEXT_PUBLIC_WHOP_COMPANY_ID

			printSuccess(`✓ App ID: ${appId}`)
			printInfo(`  Company ID: ${companyId}`)
		}

		// Ensure Next.js is configured for standalone output
		if (validationResult.projectType === 'nextjs') {
			await ensureStandaloneOutput(targetDir)
		}

		// 3. Create archive
		const { path: archivePath, sha256 } = await createArchive(targetDir)
		printInfo(`  Source SHA256: ${sha256}`)

		// 3. Get presigned URL
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)

		printInfo('\nInitializing deployment...')
		const response = await api.deployInit({
			whop_app_id: appId,
			whop_app_company_id: companyId,
			source_sha256: sha256,
		})

		printSuccess('✓ Deployment initialized')
		printInfo(`  Build ID: ${response.build_id}`)

		// 4. Upload to S3
		await uploadToS3(archivePath, response.upload.url, sha256)

		// 5. Clean up archive
		await unlink(archivePath)

		// 6. Mark upload as complete
		const spinner = createSpinner('Finalizing deployment...')
		spinner.start()
		
		const completeResponse = await api.deployComplete(response.build_id)
		spinner.succeed(`Build queued as ${completeResponse.status}`)

		// 7. Track build progress in real-time
		console.log()
		printInfo('🔨 Starting build process...')
		console.log(chalk.dim('This may take several minutes depending on your app size'))
		console.log()

		const buildTracker = createBuildTracker(api, response.build_id, {
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
