import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { printError } from './output.ts'
import { retryableRequest, createContextualError } from './retry.ts'

const whoplabsDir = join(homedir(), '.whoplabs')
const sessionPath = join(whoplabsDir, 'whop-session.json')

/**
 * Session structure from Whop SDK
 */
interface WhopSession {
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
 * WhopShip API client for CLI commands.
 *
 * This client:
 * - Reads Whop session tokens from ~/.whoplabs/whop-session.json
 * - Converts Whop tokens to WhopShip API headers
 * - Makes authenticated requests to WhopShip API
 *
 * Usage:
 * ```typescript
 * import { whopshipApi } from '~/lib/whopship-api';
 *
 * const usage = await whopshipApi.getUsage();
 * ```
 */
class WhopShipApiClient {
	private apiUrl: string

	constructor() {
		// Get API URL from environment or default to production
		this.apiUrl = process.env.WHOPSHIP_API_URL || 'https://api.whopship.app'
	}

	/**
	 * Load Whop session from disk
	 */
	private async loadSession(): Promise<WhopSession | null> {
		try {
			const sessionData = await readFile(sessionPath, 'utf-8')
			const session = JSON.parse(sessionData) as WhopSession

			// Handle nested tokens structure (new format)
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

			// Handle flat structure (old format)
			return session
		} catch (error) {
			return null
		}
	}

	/**
	 * Get authentication headers from Whop session
	 */
	private async getAuthHeaders(): Promise<Record<string, string>> {
		const session = await this.loadSession()

		if (!session) {
			throw new Error('Not authenticated. Please run "whopctl login" first.')
		}

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
	 * Make an authenticated request to WhopShip API with retry logic
	 */
	private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
		return retryableRequest(async () => {
			const headers = await this.getAuthHeaders()

			const url = `${this.apiUrl}${endpoint}`
			const response = await fetch(url, {
				...options,
				headers: {
					...headers,
					...options.headers,
				},
			})

			if (response.status === 401) {
				const error = new Error(
					'Your session has expired or is invalid. Please run "whopctl login" to authenticate again.',
				)
				;(error as any).status = 401
				throw error
			}

			if (!response.ok) {
				const errorText = await response.text()
				let errorMessage = `API error: ${response.status} ${response.statusText}`
				let errorJson: any = null

				try {
					errorJson = JSON.parse(errorText)
					// Prefer message over error, as message usually contains more detailed information
					// Show message if available, otherwise fall back to error
					if (errorJson.message) {
						errorMessage = errorJson.message
					} else if (errorJson.error) {
						errorMessage = errorJson.error
					}
				} catch {
					// If not JSON, use the text as-is
					if (errorText) {
						errorMessage = errorText
					}
				}

				const error = new Error(errorMessage)
				;(error as any).status = response.status
				;(error as any).responseBody = errorText // Store original response for debugging
				if (errorJson) {
					;(error as any).errorJson = errorJson // Store parsed JSON for access
				}
				throw error
			}

			const data = (await response.json()) as T
			return data
		}, 'network')
	}

	/**
	 * Get usage data for a time period
	 */
	async getUsage(params?: { appId?: number; startDate?: string; endDate?: string }) {
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
	async getUsageSummary(params?: { appId?: number; month?: string }) {
		const queryParams = new URLSearchParams()
		if (params?.appId) queryParams.set('app_id', params.appId.toString())
		if (params?.month) queryParams.set('month', params.month)

		const query = queryParams.toString() ? `?${queryParams}` : ''
		return this.request(`/api/analytics/usage/summary${query}`)
	}

	/**
	 * Get current period usage
	 */
	async getCurrentUsage(appId?: number) {
		const query = appId ? `?app_id=${appId}` : ''
		return this.request(`/api/billing/usage${query}`)
	}

	/**
	 * Get usage history
	 */
	async getUsageHistory(params?: { appId?: number; months?: number }) {
		const queryParams = new URLSearchParams()
		if (params?.appId) queryParams.set('app_id', params.appId.toString())
		if (params?.months) queryParams.set('months', params.months.toString())

		const query = queryParams.toString() ? `?${queryParams}` : ''
		return this.request(`/api/billing/history${query}`)
	}

	/**
	 * Get billing periods
	 */
	async getBillingPeriods(limit?: number) {
		const query = limit ? `?limit=${limit}` : ''
		return this.request(`/api/billing/periods${query}`)
	}

	/**
	 * Get billing cost breakdown
	 */
	async getBillingCost(params?: { startDate?: string; endDate?: string }) {
		const queryParams = new URLSearchParams()
		if (params?.startDate) queryParams.set('start_date', params.startDate)
		if (params?.endDate) queryParams.set('end_date', params.endDate)

		const query = queryParams.toString() ? `?${queryParams}` : ''
		return this.request(`/api/billing/cost${query}`)
	}

	/**
	 * Get current tier
	 */
	async getCurrentTier() {
		return this.request('/api/tiers/current')
	}

	/**
	 * Update tier
	 */
	async updateTier(tier: 'free' | 'hobby' | 'pro') {
		return this.request('/api/tiers/update', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}

	/**
	 * Upgrade tier
	 */
	async upgradeTier(tier: 'free' | 'hobby' | 'pro') {
		return this.request('/api/tiers/upgrade', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}

	/**
	 * Downgrade tier
	 */
	async downgradeTier(tier: 'free' | 'hobby' | 'pro') {
		return this.request('/api/tiers/downgrade', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}
}

/**
 * Shared WhopShip API client instance
 */
export const whopshipApi = new WhopShipApiClient()

/**
 * Compatibility class for old WhopshipAPI interface
 * @deprecated Use whopshipApi instance instead
 */
export class WhopshipAPI {
	private apiUrl: string

	constructor(
		private accessToken: string,
		private refreshToken: string,
		private csrfToken: string,
		private extraTokens?: {
			uidToken?: string
			ssk?: string
			userId?: string
		},
	) {
		this.apiUrl = process.env.WHOPSHIP_API_URL || 'https://api.whopship.app'
	}

	private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Whop-Access-Token': this.accessToken,
			'X-Whop-Refresh-Token': this.refreshToken,
			'X-Whop-Csrf-Token': this.csrfToken,
		}

		if (this.extraTokens?.uidToken) {
			headers['X-Whop-Uid-Token'] = this.extraTokens.uidToken
		}
		if (this.extraTokens?.ssk) {
			headers['X-Whop-Ssk'] = this.extraTokens.ssk
		}
		if (this.extraTokens?.userId) {
			headers['X-Whop-User-Id'] = this.extraTokens.userId
		}

		const url = `${this.apiUrl}${endpoint}`
		const response = await fetch(url, {
			...options,
			headers: {
				...headers,
				...options.headers,
			},
		})

		if (response.status === 401) {
			throw new Error(
				'Your session has expired or is invalid. Please run "whopctl login" to authenticate again.',
			)
		}

		if (!response.ok) {
			const errorText = await response.text()
			let errorMessage = `API error: ${response.status} ${response.statusText}`

			try {
				const errorJson = JSON.parse(errorText)
				// Prefer message over error, as message usually contains more detailed information
				if (errorJson.message) {
					errorMessage = errorJson.message
				} else if (errorJson.error) {
					errorMessage = errorJson.error
				}
			} catch {
				if (errorText) {
					errorMessage = errorText
				}
			}

			const error = new Error(errorMessage)
			;(error as any).status = response.status
			;(error as any).responseBody = errorText
			throw error
		}

		const data = (await response.json()) as T
		return data
	}

	async getMe() {
		return this.request('/api/me')
	}

	async deployInit(data: {
		whop_app_id: string
		whop_app_company_id?: string
		source_sha256: string
	}) {
		return this.request('/api/deploy/init', {
			method: 'POST',
			body: JSON.stringify(data),
		})
	}

	async deployComplete(buildId: string) {
		return this.request('/api/deploy/complete', {
			method: 'POST',
			body: JSON.stringify({ build_id: buildId }),
		})
	}

	async getDeploymentStatus(deploymentId: number) {
		return this.request(`/api/deployments/${deploymentId}`)
	}

	async getDeploymentLogs(deploymentId: number) {
		const response = await fetch(`${this.apiUrl}/api/deployments/${deploymentId}/logs`, {
			headers: {
				'X-Whop-Access-Token': this.accessToken,
				'X-Whop-Refresh-Token': this.refreshToken,
				'X-Whop-Csrf-Token': this.csrfToken,
			},
		})
		if (!response.ok) {
			if (response.status === 404) return ''
			throw new Error(`Failed to fetch logs: ${response.statusText}`)
		}
		return response.text()
	}

	async getBuilds(whopAppId: string, limit: number = 10) {
		return this.request<{ builds: any[] }>(
			`/api/deploy/builds?whop_app_id=${whopAppId}&limit=${limit}`,
		)
	}

	async getLatestBuildForApp(whopAppId: string) {
		const response = await this.request<{ builds: any[] }>(`/api/deploy/builds?whop_app_id=${whopAppId}&limit=1`)
		if (!response.builds || response.builds.length === 0) {
			throw new Error('No builds found for this app')
		}
		return response.builds[0]
	}

	async getBuildLogs(buildId: string) {
		return this.request(`/api/deploy/builds/${buildId}/logs`)
	}

	async getBuildStatus(buildId: string) {
		return this.request(`/api/deploy/status/${buildId}`)
	}

	async getAppByWhopId(whopAppId: string) {
		return this.request<{ id: number; uuid: string; whop_app_id: string; whop_app_name: string }>(
			`/api/deploy/apps/${whopAppId}`,
		)
	}

	async redeploy(buildId: string) {
		return this.request('/api/deploy/redeploy', {
			method: 'POST',
			body: JSON.stringify({ build_id: buildId }),
		})
	}

	/**
	 * Cancel a build
	 * @param buildId Build UUID to cancel
	 */
	async cancelBuild(buildId: string) {
		return this.request(`/api/deploy/builds/${buildId}/cancel`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({}),
		})
	}

	/**
	 * Get queue status for builds
	 */
	async getQueueStatus(appId?: string) {
		const query = appId ? `?app_id=${appId}` : ''
		return this.request<{
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
		}>(`/api/deploy/queue${query}`)
	}

	// URL Management methods
	async checkSubdomainAvailability(subdomain: string) {
		return this.request<{ available: boolean; suggestions?: string[] }>(`/api/subdomains/check/${subdomain}`)
	}

	async reserveSubdomain(subdomain: string, appId: string) {
		return this.request('/api/subdomains/reserve', {
			method: 'POST',
			body: JSON.stringify({ subdomain, app_id: appId }),
		})
	}

	async releaseSubdomain(subdomain: string) {
		return this.request('/api/subdomains/release', {
			method: 'POST',
			body: JSON.stringify({ subdomain }),
		})
	}

	async listUserSubdomains() {
		return this.request<{ subdomains: Array<{ subdomain: string; app_id: string; app_name: string; reserved_at: string }> }>('/api/subdomains/list')
	}

	/**
	 * Create checkout session for subscription
	 */
	async createCheckoutSession(tier: 'free' | 'hobby' | 'pro') {
		return this.request<{
			success: boolean
			tier: string
			requiresPayment: boolean
			checkoutUrl?: string
			sessionId?: string
			message?: string
		}>('/api/billing/checkout', {
			method: 'POST',
			body: JSON.stringify({ tier }),
		})
	}

	/**
	 * Get current period usage
	 */
	async getCurrentUsage(appId?: number) {
		const query = appId ? `?app_id=${appId}` : ''
		return this.request(`/api/billing/usage${query}`)
	}

	/**
	 * Get subscription status
	 */
	async getSubscriptionStatus() {
		return this.request<{
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
		}>('/api/tiers/current')
	}
}
