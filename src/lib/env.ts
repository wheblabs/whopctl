import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Read and parse a .env file into a key-value object.
 *
 * Handles:
 * - Comments (lines starting with #)
 * - Empty lines
 * - Quoted values (single or double quotes)
 * - Values with equals signs
 *
 * @param dir - Directory containing the .env file
 * @returns Object with environment variable key-value pairs
 * @throws Error if the file cannot be read
 */
export async function readEnvFile(dir: string): Promise<Record<string, string>> {
	const envPath = resolve(dir, '.env')
	const content = await readFile(envPath, 'utf-8')
	return parseEnvContent(content)
}

/**
 * Try to read a .env file, returning an empty object if it doesn't exist.
 *
 * @param dir - Directory containing the .env file
 * @returns Object with environment variable key-value pairs, or empty object
 */
export async function readEnvFileSafe(dir: string): Promise<Record<string, string>> {
	try {
		return await readEnvFile(dir)
	} catch {
		return {}
	}
}

/**
 * Parse .env file content into key-value pairs.
 *
 * @param content - Raw .env file content
 * @returns Object with environment variable key-value pairs
 */
export function parseEnvContent(content: string): Record<string, string> {
	const env: Record<string, string> = {}

	for (const line of content.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue

		const [key, ...valueParts] = trimmed.split('=')
		if (key && valueParts.length > 0) {
			let value = valueParts.join('=').trim()
			// Remove surrounding quotes if present
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

/**
 * Get a specific environment variable from a .env file.
 *
 * @param dir - Directory containing the .env file
 * @param key - Environment variable key to retrieve
 * @returns The value or null if not found
 */
export async function getEnvVar(dir: string, key: string): Promise<string | null> {
	try {
		const env = await readEnvFile(dir)
		return env[key] ?? null
	} catch {
		return null
	}
}

/**
 * Get the Whop App ID from the current project's .env file.
 *
 * @param dir - Project directory (defaults to cwd)
 * @returns The app ID or null if not found
 */
export async function getWhopAppId(dir: string = process.cwd()): Promise<string | null> {
	return getEnvVar(dir, 'NEXT_PUBLIC_WHOP_APP_ID')
}

/**
 * Get the Whop Company ID from the current project's .env file.
 *
 * @param dir - Project directory (defaults to cwd)
 * @returns The company ID or null if not found
 */
export async function getWhopCompanyId(dir: string = process.cwd()): Promise<string | null> {
	return getEnvVar(dir, 'NEXT_PUBLIC_WHOP_COMPANY_ID')
}
