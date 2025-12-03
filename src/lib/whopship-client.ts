import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BuildLogsResponse, BuildStatusResponse } from '~/types/index.ts'
import { retryableRequest } from './retry.ts'

const whoplabsDir = join(homedir(), '.whoplabs')
const sessionPath = join(whoplabsDir, 'whop-session.json')

// Default API URL - can be overridden via environment variable
const DEFAULT_API_URL = 'https://api.whopship.app'

/**
 * Session structure from Whop SDK
 */
export interface WhopSession {
	accessToken?: string
	refreshToken?: string
	csrfToken?: string
	uidToken?: string
	ssk?: string
	userId?: string
	expiresAt?: number
	tokens?: {
		accessToken?: string
		refreshToken?: string
		csrfToken?: string
		uidToken?: string
		ssk?: string
		userId?: string
	}
}

/**
 * API error with additional context
 */
export class WhopshipApiError extends Error {
	readonly status: number
	readonly responseBody?: string
	readonly errorJson?: Record<string, unknown>

	constructor(
		message: string,
		status: number,
		responseBody?: string,
		errorJson?: Record<string, unknown>,
	) {
		super(message)
		this.name = 'WhopshipApiError'
		this.status = status
		this.responseBody = responseBody
		this.errorJson = errorJson
	}

	get isAuthError(): boolean {
		return this.status === 401 || this.status === 403
	}

	get isNotFound(): boolean {
		return this.status === 404
	}

	get isRateLimited(): boolean {
		return this.status === 429
	}

	get isServerError(): boolean {
		return this.status >= 500 && this.status < 600
	}
}

/**
 * Request options for the API client
 */
export interface RequestOptions extends Omit<RequestInit, 'signal'> {
	/** Timeout in milliseconds (default: 30000) */
	timeout?: number
	/** Whether to retry on failure (default: true for GET requests) */
	retry?: boolean
}

/**
 * Configuration for the WhopShip client
 */
export interface WhopshipClientConfig {
	/** API base URL */
	apiUrl?: string
	/** Session tokens (if not provided, will be loaded from disk) */
	session?: WhopSession
	/** Default request timeout in milliseconds */
	defaultTimeout?: number
}

/**
 * Deployment creation request
 */
export interface CreateDeploymentRequest {
	whopAppId: string
	metadata?: {
		nextVersion?: string
		opennextVersion?: string
		wranglerVersion?: string
		nodeVersion?: string
		buildTime?: number
		checksum?: string
	}
	checksum?: string
}

/**
 * Deployment creation response
 */
export interface CreateDeploymentResponse {
	deployment: {
		id: number
		uuid: string
		appId: number
		status: string
		metadata?: object
		createdAt: string
	}
	uploadUrl: string
	uploadKey: string
	instructions: {
		method: string
		url: string
		note: string
		nextStep: string
	}
}

/**
 * Deployment status
 */
export interface DeploymentStatus {
	deployment: {
		id: number
		uuid: string
		appId: number
		status: 'pending' | 'building' | 'deploying' | 'active' | 'failed'
		metadata?: object
		versionId?: string
		rolloutStage?: 'stage1_50' | 'stage2_100' | 'complete'
		workerName?: string
		errorMessage?: string
		buildLogUrl?: string
		createdAt: string
		deployedAt?: string
		logsUrl: string
	}
	app: {
		id: number
		name: string
		subdomain: string
	}
	url: string | null
}

/**
 * Queue status response
 */
export interface QueueStatusResponse {
	queued: number
	building: number
	queue: Array<{
		build_id: string
		app_id: string
		app_name: string
		status: string
		created_at: string
		position?: number
	}>
}

/**
 * Subdomain availability response
 */
export interface SubdomainAvailabilityResponse {
	available: boolean
	suggestions?: string[]
}

/**
 * User subdomains response
 */
export interface UserSubdomainsResponse {
	subdomains: Array<{
		subdomain: string
		app_id: string
		app_name: string
		reserved_at: string
	}>
}

// =============================================================================
// Rollback Types
// =============================================================================

/**
 * Rollback target (previous successful build)
 */
export interface RollbackTarget {
	id: string
	createdAt: string
	status: string
	commitHash?: string
	commitMessage?: string
	metadata?: Record<string, unknown>
}

/**
 * Rollback response
 */
export interface RollbackResponse {
	message: string
	new_build_id: string
	target_build_id: string
}

// =============================================================================
// Environment Variables Types
// =============================================================================

/**
 * Environment variable entry
 */
export interface EnvVar {
	key: string
	value: string
	exposeToBuild: boolean
	isSensitive: boolean
	createdAt: string
	updatedAt: string
}

/**
 * Create environment variable request
 */
export interface CreateEnvVarRequest {
	key: string
	value: string
	exposeToBuild?: boolean
	isSensitive?: boolean
}

/**
 * Update environment variable request
 */
export interface UpdateEnvVarRequest {
	key?: string
	value?: string
	exposeToBuild?: boolean
	isSensitive?: boolean
}

/**
 * Bulk set environment variables result
 */
export interface BulkEnvVarResult {
	message: string
	processed: number
	results: Array<{
		key: string
		status: 'created' | 'updated' | 'failed'
		message?: string
	}>
}

// =============================================================================
// Custom Domains Types
// =============================================================================

/**
 * Custom domain entry
 */
export interface CustomDomain {
	domain: string
	status: 'pending_verification' | 'verifying' | 'active' | 'failed' | 'deleting'
	certificateArn?: string
	validationRecords?: Array<{
		name: string
		type: string
		value: string
	}>
	createdAt: string
	updatedAt: string
	expiresAt?: string
}

/**
 * Domain verification result
 */
export interface DomainVerification {
	domain: string
	status: string
	dnsVerified: boolean
	sslStatus: string
	validationRecords?: Array<{
		name: string
		type: string
		value: string
		verified: boolean
	}>
}

// =============================================================================
// Log Streaming Types
// =============================================================================

/**
 * Log entry from SSE stream
 */
export interface LogEntry {
	index: number
	timestamp: string
	message: string
	level: 'info' | 'error' | 'warn' | 'debug'
}

/**
 * SSE connection options
 */
export interface SSEOptions {
	onLog: (log: LogEntry) => void
	onComplete?: (status: string) => void
	onError?: (error: Error) => void
	fromIndex?: number
}

/**
 * Subscription status response
 */
export interface SubscriptionStatusResponse {
	tier: 'free' | 'hobby' | 'pro'
	tierInfo: {
		name: string
		monthlyPrice: number
		limits: {
			functionInvocations: number
			bandwidthGb: number
			buildMinutes: number
			storageGb: number
			deployments: number
		}
	}
	subscriptionStatus?: 'free' | 'active' | 'cancelled' | 'expired' | 'trial'
	whopMembershipId?: string | null
	subscriptionEndsAt?: string | null
}

/**
 * Checkout session response
 */
export interface CheckoutSessionResponse {
	success: boolean
	tier: string
	requiresPayment: boolean
	checkoutUrl?: string
	sessionId?: string
	message?: string
}

/**
 * Unified WhopShip API client.
 *
 * This client provides access to all WhopShip API endpoints with:
 * - Automatic session loading from disk
 * - Request timeouts
 * - Retry logic for transient failures
 * - Proper error typing
 *
 * Usage:
 * ```typescript
 * // Use the singleton (auto-loads session)
 * import { whopshipClient } from '~/lib/whopship-client';
 * const builds = await whopshipClient.getBuilds('app_xxx');
 *
 * // Or create a custom instance
 * const client = createWhopshipClient({ apiUrl: 'https://custom.api.url' });
 * ```
 */
export class WhopshipClient {
	private readonly apiUrl: string
	private readonly defaultTimeout: number
	private session: WhopSession | null
	private sessionLoaded = false

	constructor(config: WhopshipClientConfig = {}) {
		this.apiUrl = config.apiUrl || process.env.WHOPSHIP_API_URL || DEFAULT_API_URL
		this.defaultTimeout = config.defaultTimeout || 30000
		this.session = config.session || null
	}

	/**
	 * Load session from disk if not already loaded
	 */
	private async ensureSession(): Promise<WhopSession> {
		if (this.session) {
			return this.normalizeSession(this.session)
		}

		if (!this.sessionLoaded) {
			this.session = await this.loadSessionFromDisk()
			this.sessionLoaded = true
		}

		if (!this.session) {
			throw new WhopshipApiError('Not authenticated. Please run "whopctl login" first.', 401)
		}

		return this.normalizeSession(this.session)
	}

	/**
	 * Normalize session to handle both flat and nested token structures
	 */
	private normalizeSession(session: WhopSession): WhopSession {
		if (session.tokens) {
			return {
				accessToken: session.tokens.accessToken,
				refreshToken: session.tokens.refreshToken,
				csrfToken: session.tokens.csrfToken,
				uidToken: session.tokens.uidToken,
				ssk: session.tokens.ssk,
				userId: session.tokens.userId,
			}
		}
		return session
	}

	/**
	 * Load session from disk
	 */
	private async loadSessionFromDisk(): Promise<WhopSession | null> {
		try {
			const sessionData = await readFile(sessionPath, 'utf-8')
			return JSON.parse(sessionData) as WhopSession
		} catch {
			return null
		}
	}

	/**
	 * Get authentication headers
	 */
	private async getAuthHeaders(): Promise<Record<string, string>> {
		const session = await this.ensureSession()
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}

		if (session.accessToken) {
			headers['X-Whop-Access-Token'] = session.accessToken
		}
		if (session.refreshToken) {
			headers['X-Whop-Refresh-Token'] = session.refreshToken
		}
		if (session.csrfToken) {
			headers['X-Whop-Csrf-Token'] = session.csrfToken
		}
		if (session.uidToken) {
			headers['X-Whop-Uid-Token'] = session.uidToken
		}
		if (session.ssk) {
			headers['X-Whop-Ssk'] = session.ssk
		}
		if (session.userId) {
			headers['X-Whop-User-Id'] = session.userId
		}

		return headers
	}

	/**
	 * Make an authenticated request with timeout and retry support
	 */
	private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
		const { timeout = this.defaultTimeout, retry = true, ...fetchOptions } = options

		const makeRequest = async (): Promise<T> => {
			const headers = await this.getAuthHeaders()
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), timeout)

			try {
				const url = `${this.apiUrl}${endpoint}`
				const response = await fetch(url, {
					...fetchOptions,
					headers: {
						...headers,
						...fetchOptions.headers,
					},
					signal: controller.signal,
				})

				clearTimeout(timeoutId)

				if (response.status === 401) {
					throw new WhopshipApiError(
						'Your session has expired or is invalid. Please run "whopctl login" to authenticate again.',
						401,
					)
				}

				if (!response.ok) {
					const errorText = await response.text()
					let errorMessage = `API error: ${response.status} ${response.statusText}`
					let errorJson: Record<string, unknown> | undefined

					try {
						errorJson = JSON.parse(errorText)
						if (errorJson?.message && typeof errorJson.message === 'string') {
							errorMessage = errorJson.message
						} else if (errorJson?.error && typeof errorJson.error === 'string') {
							errorMessage = errorJson.error
						}
					} catch {
						if (errorText) {
							errorMessage = errorText
						}
					}

					throw new WhopshipApiError(errorMessage, response.status, errorText, errorJson)
				}

				return (await response.json()) as T
			} catch (error) {
				clearTimeout(timeoutId)

				if (error instanceof WhopshipApiError) {
					throw error
				}

				if (error instanceof Error && error.name === 'AbortError') {
					throw new WhopshipApiError(`Request timed out after ${timeout}ms`, 408)
				}

				throw error
			}
		}

		if (retry) {
			return retryableRequest(makeRequest, 'network')
		}

		return makeRequest()
	}

	// ============================================================================
	// User / Auth Methods
	// ============================================================================

	/**
	 * Get current user information
	 */
	async getMe(): Promise<{ id: string; email: string; name: string }> {
		return this.request('/api/me')
	}

	// ============================================================================
	// Deployment Methods
	// ============================================================================

	/**
	 * Initialize a deployment
	 */
	async deployInit(data: {
		whop_app_id: string
		whop_app_company_id?: string
		source_sha256: string
	}): Promise<{
		build_id: string
		upload: { url: string }
		billing?: {
			warnings?: string[]
			totalOverageCost?: number
			gracePeriodEndsAt?: string
		}
	}> {
		return this.request('/api/deploy/init', {
			method: 'POST',
			body: JSON.stringify(data),
		})
	}

	/**
	 * Complete a deployment (notify upload is done)
	 */
	async deployComplete(buildId: string): Promise<{
		status: string
		billing?: {
			warnings?: string[]
			totalOverageCost?: number
		}
	}> {
		return this.request('/api/deploy/complete', {
			method: 'POST',
			body: JSON.stringify({ build_id: buildId }),
		})
	}

	/**
	 * Get deployment status
	 */
	async getDeploymentStatus(deploymentId: number): Promise<DeploymentStatus> {
		return this.request(`/api/deployments/${deploymentId}`)
	}

	/**
	 * Get deployment logs
	 */
	async getDeploymentLogs(deploymentId: number): Promise<string> {
		const session = await this.ensureSession()
		const headers: Record<string, string> = {}

		if (session.accessToken) {
			headers['X-Whop-Access-Token'] = session.accessToken
		}
		if (session.refreshToken) {
			headers['X-Whop-Refresh-Token'] = session.refreshToken
		}
		if (session.csrfToken) {
			headers['X-Whop-Csrf-Token'] = session.csrfToken
		}

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout)

		try {
			const response = await fetch(`${this.apiUrl}/api/deployments/${deploymentId}/logs`, {
				headers,
				signal: controller.signal,
			})
			clearTimeout(timeoutId)

			if (!response.ok) {
				if (response.status === 404) return ''
				throw new WhopshipApiError(`Failed to fetch logs: ${response.statusText}`, response.status)
			}

			return response.text()
		} catch (error) {
			clearTimeout(timeoutId)
			if (error instanceof Error && error.name === 'AbortError') {
				throw new WhopshipApiError(`Request timed out after ${this.defaultTimeout}ms`, 408)
			}
			throw error
		}
	}

	// ============================================================================
	// Build Methods
	// ============================================================================

	/**
	 * Get builds for an app
	 */
	async getBuilds(whopAppId: string, limit = 10): Promise<{ builds: BuildStatusResponse[] }> {
		return this.request(`/api/deploy/builds?whop_app_id=${whopAppId}&limit=${limit}`)
	}

	/**
	 * Get the latest build for an app
	 */
	async getLatestBuildForApp(whopAppId: string): Promise<BuildStatusResponse> {
		const response = await this.getBuilds(whopAppId, 1)
		if (!response.builds || response.builds.length === 0) {
			throw new WhopshipApiError('No builds found for this app', 404)
		}
		return response.builds[0]!
	}

	/**
	 * Get build logs
	 */
	async getBuildLogs(buildId: string): Promise<BuildLogsResponse> {
		return this.request(`/api/deploy/builds/${buildId}/logs`)
	}

	/**
	 * Get build status
	 */
	async getBuildStatus(buildId: string): Promise<BuildStatusResponse> {
		return this.request(`/api/deploy/status/${buildId}`)
	}

	/**
	 * Get app by Whop ID
	 */
	async getAppByWhopId(whopAppId: string): Promise<{
		id: number
		uuid: string
		whop_app_id: string
		whop_app_name: string
	}> {
		return this.request(`/api/deploy/apps/${whopAppId}`)
	}

	/**
	 * Redeploy a build
	 */
	async redeploy(buildId: string): Promise<{ build_id: string; status: string }> {
		return this.request('/api/deploy/redeploy', {
			method: 'POST',
			body: JSON.stringify({ build_id: buildId }),
		})
	}

	/**
	 * Cancel a build
	 */
	async cancelBuild(buildId: string): Promise<{ success: boolean; message: string }> {
		return this.request(`/api/deploy/builds/${buildId}/cancel`, {
			method: 'POST',
			body: JSON.stringify({}),
		})
	}

	/**
	 * Get build queue status
	 */
	async getQueueStatus(appId?: string): Promise<QueueStatusResponse> {
		const query = appId ? `?app_id=${appId}` : ''
		return this.request(`/api/deploy/queue${query}`)
	}

	// ============================================================================
	// Subdomain / URL Methods
	// ============================================================================

	/**
	 * Check subdomain availability
	 */
	async checkSubdomainAvailability(subdomain: string): Promise<SubdomainAvailabilityResponse> {
		return this.request(`/api/subdomains/check/${subdomain}`)
	}

	/**
	 * Reserve a subdomain
	 */
	async reserveSubdomain(subdomain: string, appId: string): Promise<{ success: boolean }> {
		return this.request('/api/subdomains/reserve', {
			method: 'POST',
			body: JSON.stringify({ subdomain, app_id: appId }),
		})
	}

	/**
	 * Release a subdomain
	 */
	async releaseSubdomain(subdomain: string): Promise<{ success: boolean }> {
		return this.request('/api/subdomains/release', {
			method: 'POST',
			body: JSON.stringify({ subdomain }),
		})
	}

	/**
	 * List user's reserved subdomains
	 */
	async listUserSubdomains(): Promise<UserSubdomainsResponse> {
		return this.request('/api/subdomains/list')
	}

	// ============================================================================
	// Analytics Methods
	// ============================================================================

	/**
	 * Get usage data for a time period
	 */
	async getUsage(params?: {
		appId?: number
		startDate?: string
		endDate?: string
	}): Promise<Record<string, unknown>> {
		const queryParams = new URLSearchParams()
		if (params?.appId) queryParams.set('app_id', params.appId.toString())
		if (params?.startDate) queryParams.set('start_date', params.startDate)
		if (params?.endDate) queryParams.set('end_date', params.endDate)

		const query = queryParams.toString() ? `?${queryParams}` : ''
		return this.request(`/api/analytics/usage${query}`)
	}

	/**
	 * Get usage summary for a specific month
	 */
	async getUsageSummary(params?: {
		appId?: number
		month?: string
	}): Promise<Record<string, unknown>> {
		const queryParams = new URLSearchParams()
		if (params?.appId) queryParams.set('app_id', params.appId.toString())
		if (params?.month) queryParams.set('month', params.month)

		const query = queryParams.toString() ? `?${queryParams}` : ''
		return this.request(`/api/analytics/usage/summary${query}`)
	}

	// ============================================================================
	// Billing Methods
	// ============================================================================

	/**
	 * Get current period usage
	 */
	async getCurrentUsage(appId?: number): Promise<Record<string, unknown>> {
		const query = appId ? `?app_id=${appId}` : ''
		return this.request(`/api/billing/usage${query}`)
	}

	/**
	 * Get usage history
	 */
	async getUsageHistory(params?: {
		appId?: number
		months?: number
	}): Promise<Record<string, unknown>> {
		const queryParams = new URLSearchParams()
		if (params?.appId) queryParams.set('app_id', params.appId.toString())
		if (params?.months) queryParams.set('months', params.months.toString())

		const query = queryParams.toString() ? `?${queryParams}` : ''
		return this.request(`/api/billing/history${query}`)
	}

	/**
	 * Get billing periods
	 */
	async getBillingPeriods(limit?: number): Promise<Record<string, unknown>> {
		const query = limit ? `?limit=${limit}` : ''
		return this.request(`/api/billing/periods${query}`)
	}

	/**
	 * Get billing cost breakdown
	 */
	async getBillingCost(params?: {
		startDate?: string
		endDate?: string
	}): Promise<Record<string, unknown>> {
		const queryParams = new URLSearchParams()
		if (params?.startDate) queryParams.set('start_date', params.startDate)
		if (params?.endDate) queryParams.set('end_date', params.endDate)

		const query = queryParams.toString() ? `?${queryParams}` : ''
		return this.request(`/api/billing/cost${query}`)
	}

	/**
	 * Create checkout session for subscription
	 */
	async createCheckoutSession(tier: 'free' | 'hobby' | 'pro'): Promise<CheckoutSessionResponse> {
		return this.request('/api/billing/checkout', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}

	// ============================================================================
	// Tier Methods
	// ============================================================================

	/**
	 * Get current tier
	 */
	async getCurrentTier(): Promise<SubscriptionStatusResponse> {
		return this.request('/api/tiers/current')
	}

	/**
	 * Get subscription status (alias for getCurrentTier)
	 */
	async getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
		return this.getCurrentTier()
	}

	/**
	 * Update tier
	 */
	async updateTier(tier: 'free' | 'hobby' | 'pro'): Promise<{ success: boolean }> {
		return this.request('/api/tiers/update', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}

	/**
	 * Upgrade tier
	 */
	async upgradeTier(tier: 'free' | 'hobby' | 'pro'): Promise<{ success: boolean }> {
		return this.request('/api/tiers/upgrade', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}

	/**
	 * Downgrade tier
	 */
	async downgradeTier(tier: 'free' | 'hobby' | 'pro'): Promise<{ success: boolean }> {
		return this.request('/api/tiers/downgrade', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}

	// ============================================================================
	// Legacy Deployment Methods (for apps/deploy.ts compatibility)
	// ============================================================================

	/**
	 * Create a fetch request with timeout support
	 */
	private async fetchWithTimeout(
		url: string,
		options: RequestInit,
		timeout: number = this.defaultTimeout,
	): Promise<Response> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeout)

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			return response
		} catch (error) {
			clearTimeout(timeoutId)
			if (error instanceof Error && error.name === 'AbortError') {
				throw new WhopshipApiError(`Request timed out after ${timeout}ms`, 408)
			}
			throw error
		}
	}

	/**
	 * Create a new deployment (legacy API)
	 */
	async createDeployment(request: CreateDeploymentRequest): Promise<CreateDeploymentResponse> {
		// Use Bearer auth for legacy deployment endpoint
		const session = await this.ensureSession()
		if (!session.accessToken) {
			throw new WhopshipApiError('No access token available. Please login again.', 401)
		}

		const response = await this.fetchWithTimeout(`${this.apiUrl}/deployments`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${session.accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new WhopshipApiError(
				`Failed to create deployment (${response.status}): ${errorText}`,
				response.status,
				errorText,
			)
		}

		return await response.json()
	}

	/**
	 * Upload artifact to presigned URL
	 * Note: Uses a longer timeout (5 minutes) for large file uploads
	 */
	async uploadArtifact(uploadUrl: string, artifactPath: string): Promise<void> {
		const artifactBuffer = readFileSync(artifactPath)
		const uploadTimeout = 5 * 60 * 1000 // 5 minutes for uploads

		const response = await this.fetchWithTimeout(
			uploadUrl,
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'application/zip',
				},
				body: artifactBuffer,
			},
			uploadTimeout,
		)

		if (!response.ok) {
			const errorText = await response.text()
			throw new WhopshipApiError(
				`Failed to upload artifact (${response.status}): ${errorText}`,
				response.status,
				errorText,
			)
		}
	}

	/**
	 * Notify API that upload is complete
	 */
	async completeDeployment(deploymentId: number): Promise<void> {
		const session = await this.ensureSession()
		if (!session.accessToken) {
			throw new WhopshipApiError('No access token available. Please login again.', 401)
		}

		const response = await this.fetchWithTimeout(
			`${this.apiUrl}/deployments/${deploymentId}/complete`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${session.accessToken}`,
					'Content-Type': 'application/json',
				},
			},
		)

		if (!response.ok) {
			const errorText = await response.text()
			throw new WhopshipApiError(
				`Failed to complete deployment (${response.status}): ${errorText}`,
				response.status,
				errorText,
			)
		}
	}

	/**
	 * Trigger deployment processing
	 */
	async triggerDeployment(deploymentId: number): Promise<{
		message: string
		deploymentId: number
		status: string
	}> {
		const session = await this.ensureSession()
		if (!session.accessToken) {
			throw new WhopshipApiError('No access token available. Please login again.', 401)
		}

		const response = await this.fetchWithTimeout(
			`${this.apiUrl}/deployments/${deploymentId}/trigger`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${session.accessToken}`,
					'Content-Type': 'application/json',
				},
			},
		)

		if (!response.ok) {
			const errorText = await response.text()
			throw new WhopshipApiError(
				`Failed to trigger deployment (${response.status}): ${errorText}`,
				response.status,
				errorText,
			)
		}

		return await response.json()
	}

	// ============================================================================
	// Rollback Methods
	// ============================================================================

	/**
	 * List rollback targets (previous successful builds)
	 */
	async listRollbackTargets(appId: string, limit = 10): Promise<RollbackTarget[]> {
		return this.request(`/api/apps/${appId}/builds?limit=${limit}`)
	}

	/**
	 * Get the current deployment for an app
	 */
	async getCurrentDeployment(appId: string): Promise<RollbackTarget> {
		return this.request(`/api/apps/${appId}/current`)
	}

	/**
	 * Trigger a rollback to a previous build
	 * @param appId - The app UUID
	 * @param targetBuildId - Optional specific build ID to rollback to (defaults to previous successful)
	 */
	async triggerRollback(appId: string, targetBuildId?: string): Promise<RollbackResponse> {
		return this.request(`/api/apps/${appId}/rollback`, {
			method: 'POST',
			body: JSON.stringify(targetBuildId ? { target_build_id: targetBuildId } : {}),
		})
	}

	// ============================================================================
	// Environment Variables Methods
	// ============================================================================

	/**
	 * List environment variables for an app
	 */
	async listEnvVars(appId: string): Promise<EnvVar[]> {
		return this.request(`/api/apps/${appId}/env`)
	}

	/**
	 * Create a new environment variable
	 */
	async createEnvVar(appId: string, data: CreateEnvVarRequest): Promise<EnvVar> {
		return this.request(`/api/apps/${appId}/env`, {
			method: 'POST',
			body: JSON.stringify(data),
		})
	}

	/**
	 * Update an existing environment variable
	 */
	async updateEnvVar(appId: string, key: string, data: UpdateEnvVarRequest): Promise<EnvVar> {
		return this.request(`/api/apps/${appId}/env/${encodeURIComponent(key)}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		})
	}

	/**
	 * Delete an environment variable
	 */
	async deleteEnvVar(appId: string, key: string): Promise<void> {
		await this.request(`/api/apps/${appId}/env/${encodeURIComponent(key)}`, {
			method: 'DELETE',
		})
	}

	/**
	 * Bulk set environment variables (create or update)
	 */
	async bulkSetEnvVars(appId: string, variables: CreateEnvVarRequest[]): Promise<BulkEnvVarResult> {
		return this.request(`/api/apps/${appId}/env/bulk`, {
			method: 'POST',
			body: JSON.stringify(variables),
		})
	}

	// ============================================================================
	// Custom Domains Methods
	// ============================================================================

	/**
	 * List custom domains for an app
	 */
	async listDomains(appId: string): Promise<CustomDomain[]> {
		return this.request(`/api/apps/${appId}/domains`)
	}

	/**
	 * Add a custom domain to an app
	 */
	async addDomain(appId: string, domain: string): Promise<CustomDomain> {
		return this.request(`/api/apps/${appId}/domains`, {
			method: 'POST',
			body: JSON.stringify({ domain }),
		})
	}

	/**
	 * Verify DNS for a custom domain
	 */
	async verifyDomain(appId: string, domain: string): Promise<DomainVerification> {
		return this.request(`/api/apps/${appId}/domains/${encodeURIComponent(domain)}/verify`, {
			method: 'POST',
		})
	}

	/**
	 * Remove a custom domain
	 */
	async removeDomain(appId: string, domain: string): Promise<void> {
		await this.request(`/api/apps/${appId}/domains/${encodeURIComponent(domain)}`, {
			method: 'DELETE',
		})
	}

	// ============================================================================
	// Log Streaming Methods (SSE)
	// ============================================================================

	/**
	 * Stream build logs in real-time using Server-Sent Events
	 * Note: This method is designed for Node.js environments and uses fetch with streaming.
	 *
	 * @param buildId - The build UUID to stream logs for
	 * @param options - Streaming options including callbacks
	 * @returns AbortController to cancel the stream
	 */
	async streamBuildLogs(buildId: string, options: SSEOptions): Promise<AbortController> {
		const session = await this.ensureSession()
		const accessToken = session.accessToken || session.tokens?.accessToken

		if (!accessToken) {
			throw new WhopshipApiError('No access token available. Please login again.', 401)
		}

		const controller = new AbortController()
		const url = new URL(`/api/builds/${buildId}/stream`, this.apiUrl)
		if (options.fromIndex !== undefined) {
			url.searchParams.set('from_index', options.fromIndex.toString())
		}

		// Use native fetch for SSE streaming
		const startStream = async () => {
			try {
				const response = await fetch(url.toString(), {
					headers: {
						Authorization: `Bearer ${accessToken}`,
						Accept: 'text/event-stream',
					},
					signal: controller.signal,
				})

				if (!response.ok) {
					const errorText = await response.text()
					throw new WhopshipApiError(
						`Failed to connect to log stream (${response.status}): ${errorText}`,
						response.status,
						errorText,
					)
				}

				if (!response.body) {
					throw new WhopshipApiError('No response body for SSE stream', 500)
				}

				const reader = response.body.getReader()
				const decoder = new TextDecoder()
				let buffer = ''

				while (true) {
					const { done, value } = await reader.read()

					if (done) {
						break
					}

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split('\n')
					buffer = lines.pop() || '' // Keep incomplete line in buffer

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = line.slice(6)
							try {
								const parsed = JSON.parse(data)

								if (parsed.type === 'log' && parsed.data) {
									options.onLog(parsed.data as LogEntry)
								} else if (parsed.type === 'complete') {
									options.onComplete?.(parsed.data?.status || 'unknown')
									return
								} else if (parsed.type === 'error') {
									options.onError?.(new Error(parsed.data?.message || 'Unknown error'))
									return
								}
							} catch {
								// Ignore malformed JSON lines
							}
						}
					}
				}
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') {
					// Stream was intentionally aborted
					return
				}
				options.onError?.(error instanceof Error ? error : new Error(String(error)))
			}
		}

		// Start streaming in background
		startStream()

		return controller
	}

	/**
	 * Poll for build logs (fallback when SSE is not available)
	 * Fetches all logs from a starting index
	 */
	async pollBuildLogs(
		buildId: string,
		fromIndex = 0,
	): Promise<{
		logs: LogEntry[]
		status: string
		completed: boolean
	}> {
		return this.request(`/api/builds/${buildId}/logs?from_index=${fromIndex}`)
	}
}

/**
 * Create a WhopShip client with custom configuration
 */
export function createWhopshipClient(config?: WhopshipClientConfig): WhopshipClient {
	return new WhopshipClient(config)
}

/**
 * Create a WhopShip client with explicit session tokens
 */
export function createWhopshipClientWithTokens(
	accessToken: string,
	refreshToken: string,
	csrfToken: string,
	extraTokens?: {
		uidToken?: string
		ssk?: string
		userId?: string
	},
): WhopshipClient {
	return new WhopshipClient({
		session: {
			accessToken,
			refreshToken,
			csrfToken,
			...extraTokens,
		},
	})
}

/**
 * Shared WhopShip client instance (singleton)
 * Auto-loads session from disk
 */
export const whopshipClient = new WhopshipClient()

// Re-export types for convenience
export type { BuildLogsResponse, BuildStatusResponse }
