import { exec } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
	type ArtifactMetadata,
	createArtifact,
	getPackageVersion,
	validateOpenNextBuild,
} from './artifact.ts'

const execAsync = promisify(exec)

/**
 * Manages the OpenNext build and artifact creation process.
 *
 * This class:
 * - Creates a temporary build directory
 * - Runs OpenNext build command
 * - Creates deployment artifacts
 * - Tracks build metadata
 * - Handles cleanup
 */
export class BuildManager {
	private buildDir: string
	private artifactPath: string | null = null
	private checksum: string | null = null
	private metadata: ArtifactMetadata | null = null
	private buildStartTime: number = 0

	constructor() {
		// Create temp directory: ~/.whopctl/builds/<timestamp>/
		const timestamp = Date.now()
		this.buildDir = join(homedir(), '.whopctl', 'builds', timestamp.toString())
		mkdirSync(this.buildDir, { recursive: true })
	}

	/**
	 * Runs the OpenNext build command.
	 *
	 * This executes: npx @opennextjs/cloudflare build
	 *
	 * @throws Error if build fails or .open-next directory is not created
	 */
	async buildOpenNext(): Promise<void> {
		this.buildStartTime = Date.now()

		try {
			// Run OpenNext build in the current working directory
			const { stdout, stderr } = await execAsync('npx @opennextjs/cloudflare build', {
				cwd: process.cwd(),
				maxBuffer: 10 * 1024 * 1024, // 10MB buffer for build output
			})

			// Log build output (optional, can be controlled by verbose flag later)
			if (stdout) {
				console.log(stdout)
			}
			if (stderr) {
				console.error(stderr)
			}

			// Validate that the build created the expected output
			const openNextDir = join(process.cwd(), '.open-next')
			validateOpenNextBuild(openNextDir)
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`OpenNext build failed: ${error.message}`)
			}
			throw error
		}
	}

	/**
	 * Creates a deployment artifact from the OpenNext build.
	 *
	 * This:
	 * - Zips the .open-next directory
	 * - Adds meta.json with build metadata
	 * - Calculates checksum
	 *
	 * @returns Path to the created artifact
	 */
	async createArtifact(): Promise<string> {
		const buildTime = Date.now() - this.buildStartTime

		// Collect build metadata
		this.metadata = {
			nextVersion: getPackageVersion('next'),
			opennextVersion: getPackageVersion('@opennextjs/cloudflare'),
			wranglerVersion: getPackageVersion('wrangler'),
			nodeVersion: process.version,
			buildTime,
		}

		// Create artifact in the build directory
		this.artifactPath = join(this.buildDir, 'artifact.zip')
		const openNextDir = join(process.cwd(), '.open-next')

		this.checksum = await createArtifact(openNextDir, this.artifactPath, this.metadata)

		// Update metadata with checksum
		this.metadata.checksum = this.checksum

		return this.artifactPath
	}

	/**
	 * Gets the build metadata.
	 *
	 * @returns Build metadata or null if artifact hasn't been created yet
	 */
	getMetadata(): ArtifactMetadata | null {
		return this.metadata
	}

	/**
	 * Gets the artifact checksum.
	 *
	 * @returns Checksum or null if artifact hasn't been created yet
	 */
	getChecksum(): string | null {
		return this.checksum
	}

	/**
	 * Gets the path to the artifact.
	 *
	 * @returns Artifact path or null if artifact hasn't been created yet
	 */
	getArtifactPath(): string | null {
		return this.artifactPath
	}

	/**
	 * Gets the temporary build directory path.
	 *
	 * @returns Build directory path
	 */
	getBuildDir(): string {
		return this.buildDir
	}

	/**
	 * Cleans up temporary build files.
	 *
	 * This removes the entire build directory and its contents.
	 * Safe to call multiple times.
	 */
	async cleanup(): Promise<void> {
		try {
			if (existsSync(this.buildDir)) {
				rmSync(this.buildDir, { recursive: true, force: true })
			}
		} catch (error) {
			// Log but don't throw - cleanup failures shouldn't break the flow
			console.error(`Warning: Failed to cleanup build directory: ${error}`)
		}
	}
}
