/**
 * Shared TypeScript types for the CLI.
 *
 * This file re-exports types from @whoplabs/whop-client and defines
 * any CLI-specific types needed across multiple commands.
 *
 * Usage:
 * ```typescript
 * import type { Company, App } from '~/types';
 * ```
 */

// Re-export commonly used types from the Whop client
export type {
	AccessPass,
	App,
	AppCredentials,
	AppSummary,
	AuthTokens,
	Company,
	Experience,
	Plan,
	User,
} from '@whoplabs/whop-client'
