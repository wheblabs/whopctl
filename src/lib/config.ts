import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

/**
 * WhopShip configuration schema
 */
const whopshipConfigSchema = z.object({
	whopAppId: z.string(),
	subdomain: z.string().optional(),
	env: z.record(z.string(), z.string()).optional(),
})

export type WhopshipConfig = z.infer<typeof whopshipConfigSchema>

/**
 * Loads whopship.config.json from the current working directory.
 *
 * @returns Configuration object
 * @throws Error if config file doesn't exist or is invalid
 */
export function loadWhopshipConfig(): WhopshipConfig {
	const configPath = join(process.cwd(), 'whopship.config.json')

	if (!existsSync(configPath)) {
		throw new Error(
			'whopship.config.json not found in current directory.\n' +
				'Run this command from your project directory or specify an app ID explicitly.',
		)
	}

	try {
		const configContent = readFileSync(configPath, 'utf-8')
		const configJson = JSON.parse(configContent)
		return whopshipConfigSchema.parse(configJson)
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in whopship.config.json: ${error.message}`)
		}
		if (error instanceof z.ZodError) {
			const errors = error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')
			throw new Error(`Invalid whopship.config.json:\n${errors}`)
		}
		throw error
	}
}

/**
 * Checks if a whopship.config.json file exists in the current directory.
 *
 * @returns true if config file exists
 */
export function hasWhopshipConfig(): boolean {
	const configPath = join(process.cwd(), 'whopship.config.json')
	return existsSync(configPath)
}

