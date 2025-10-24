import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Whop } from '@whoplabs/whop-client'

const configDir = join(homedir(), '.config', 'whopctl')
const sessionPath = join(configDir, 'session.json')
//on startup make our config dir if it doesn't exist
try {
	mkdirSync(configDir, { recursive: true })
} catch (_error) {
	// Directory might already exist, that's fine
}

/**
 * Shared Whop client instance used across all CLI commands.
 *
 * This client:
 * - Automatically loads existing sessions from ~/.config/whopctl/session.json
 * - Handles token refresh automatically via the SDK
 * - Persists sessions to disk when authentication succeeds
 *
 * Usage:
 * ```typescript
 * import { whop } from '~/lib/whop';
 *
 * const companies = await whop.companies.list();
 * ```
 */
export const whop = new Whop({ sessionPath, autoLoad: true })

/**
 * Path to the config directory where session and history files are stored.
 */
export { configDir }

/**
 * Path where the authentication session is stored.
 * Used by the login command to persist tokens after successful authentication.
 */
export { sessionPath }
