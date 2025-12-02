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

// ============================================================================
// Build Stage Types
// ============================================================================

/**
 * Stage timing information
 */
export interface StageInfo {
	startedAt?: string
	completedAt?: string
	durationMs?: number
}

/**
 * Upload stage details
 */
export interface UploadStage extends StageInfo {
	sizeBytes?: number
}

/**
 * Queue stage details
 */
export interface QueueStage extends StageInfo {
	position?: number
	totalInQueue?: number
	estimatedWaitMinutes?: number
}

/**
 * Build sub-stages
 */
export interface BuildSubStages {
	download?: StageInfo & { sizeMb?: number }
	extract?: StageInfo & { fileCount?: number; sizeMb?: number }
	install?: StageInfo & { packageManager?: string }
	openNextBuild?: StageInfo
	artifact?: StageInfo & { sizeMb?: number }
}

/**
 * Build stage details
 */
export interface BuildStage extends StageInfo {
	currentSubStage?: keyof BuildSubStages
	subStages?: BuildSubStages
}

/**
 * Deploy sub-stages
 */
export interface DeploySubStages {
	roleSetup?: StageInfo
	lambdaCreate?: StageInfo
	staticAssets?: StageInfo & { fileCount?: number; sizeMb?: number }
	urlSetup?: StageInfo
	subdomainMapping?: StageInfo
}

/**
 * Deploy stage details
 */
export interface DeployStage extends StageInfo {
	currentSubStage?: keyof DeploySubStages
	subStages?: DeploySubStages
}

/**
 * Structured stage tracking for builds
 */
export interface BuildStages {
	upload?: UploadStage
	queue?: QueueStage
	build?: BuildStage
	deploy?: DeployStage
}

/**
 * Error context for debugging
 */
export interface ErrorContext {
	stage?: string
	subStage?: string
	likelyCauses?: string[]
	debugSteps?: string[]
	exitCode?: number
}

/**
 * Build progress information
 */
export interface BuildProgress {
	current_stage?: 'upload' | 'queue' | 'build' | 'deploy'
	stages: BuildStages
	error_context?: ErrorContext
}

/**
 * Build status response from API
 */
export interface BuildStatusResponse {
	build_id: string
	status: string
	app: {
		id: number
		uuid: string
		whop_app_id: string
		whop_app_name: string
		subdomain: string
	}
	source: {
		sha256: string
	}
	artifacts: { available: boolean } | null
	error_message: string | null
	progress: BuildProgress
	total_duration_ms?: number
	logs: string[]
	created_at: string
	updated_at: string
}

/**
 * Build logs response from API
 */
export interface BuildLogsResponse {
	build_id: string
	status: string
	current_stage?: 'upload' | 'queue' | 'build' | 'deploy'
	stages: BuildStages
	logs: string[]
	error_context?: ErrorContext
	error_message: string | null
	created_at: string
	updated_at: string
}
