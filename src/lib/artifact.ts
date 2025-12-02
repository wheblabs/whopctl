import { createHash, type Hash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'

/**
 * Metadata included in the deployment artifact.
 * This information helps with debugging and reproducibility.
 */
export interface ArtifactMetadata {
	nextVersion?: string
	opennextVersion?: string
	wranglerVersion?: string
	nodeVersion: string
	buildTime: number
	checksum?: string
}

/**
 * Creates a deployment artifact (zip file) from an OpenNext build.
 *
 * The artifact structure:
 * ```
 * artifact.zip
 * ├── open-next/
 * │   ├── worker/
 * │   │   └── index.js
 * │   ├── assets/
 * │   └── ...
 * └── meta.json
 * ```
 *
 * @param openNextDir Path to the .open-next directory
 * @param outputPath Path where the zip file should be created
 * @param metadata Build metadata to include in meta.json
 * @returns SHA-256 checksum of the created artifact
 */
export async function createArtifact(
	openNextDir: string,
	outputPath: string,
	metadata: ArtifactMetadata,
): Promise<string> {
	// Validate that the OpenNext directory exists
	if (!existsSync(openNextDir)) {
		throw new Error(`OpenNext directory not found: ${openNextDir}`)
	}

	// Validate that worker script exists
	const workerPath = join(openNextDir, 'worker', 'index.js')
	if (!existsSync(workerPath)) {
		throw new Error(
			`Worker script not found at ${workerPath}. Make sure OpenNext build completed successfully.`,
		)
	}

	const zip = new AdmZip()

	// Add .open-next/ directory as open-next/ in the zip
	zip.addLocalFolder(openNextDir, 'open-next')

	// Add meta.json with build metadata
	const metaJson = JSON.stringify(metadata, null, 2)
	zip.addFile('meta.json', Buffer.from(metaJson, 'utf-8'))

	// Write the zip file
	zip.writeZip(outputPath)

	// Calculate and return checksum
	const checksum = await calculateChecksum(outputPath)
	return checksum
}

/**
 * Calculates SHA-256 checksum of a file.
 *
 * @param filePath Path to the file
 * @returns Checksum in format "sha256:abc123..."
 */
export async function calculateChecksum(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash: Hash = createHash('sha256')
		const stream = createReadStream(filePath)

		stream.on('data', (data: Buffer) => hash.update(data))
		stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`))
		stream.on('error', reject)
	})
}

/**
 * Gets the version of a package from the current project's package.json.
 *
 * @param packageName Name of the package (e.g., "next", "@opennextjs/cloudflare")
 * @returns Version string or undefined if not found
 */
export function getPackageVersion(packageName: string): string | undefined {
	try {
		// Try to read package.json from current working directory
		const packageJsonPath = join(process.cwd(), 'package.json')
		if (!existsSync(packageJsonPath)) {
			return undefined
		}

		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

		// Check dependencies and devDependencies
		const version =
			packageJson.dependencies?.[packageName] || packageJson.devDependencies?.[packageName]

		if (version) {
			// Remove ^ or ~ prefix if present
			return version.replace(/^[\^~]/, '')
		}

		return undefined
	} catch (_error) {
		return undefined
	}
}

/**
 * Validates that an OpenNext build directory has the expected structure.
 *
 * @param openNextDir Path to the .open-next directory
 * @throws Error if validation fails
 */
export function validateOpenNextBuild(openNextDir: string): void {
	if (!existsSync(openNextDir)) {
		throw new Error(`OpenNext build directory not found: ${openNextDir}`)
	}

	const workerPath = join(openNextDir, 'worker', 'index.js')
	if (!existsSync(workerPath)) {
		throw new Error(
			`Worker script not found at ${workerPath}.\n` +
				'Expected structure: .open-next/worker/index.js\n' +
				'Make sure you ran "npx @opennextjs/cloudflare build" successfully.',
		)
	}
}
