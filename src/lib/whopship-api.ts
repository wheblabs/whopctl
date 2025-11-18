import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { printError } from './output.ts'

const whoplabsDir = join(homedir(), '.whoplabs')
const sessionPath = join(whoplabsDir, 'whop-session.json')

/**
 * Session structure from Whop SDK
 */
interface WhopSession {
	accessToken?: string
	refreshToken?: string
	csrfToken?: string
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
		this.apiUrl = process.env.WHOPSHIP_API_URL || 'https://api.whopship.com'
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

		return headers
	}

	/**
	 * Make an authenticated request to WhopShip API
	 */
	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const headers = await this.getAuthHeaders()
		
		const url = `${this.apiUrl}${endpoint}`
		const response = await fetch(url, {
			...options,
			headers: {
				...headers,
				...options.headers,
			},
		})

		if (!response.ok) {
			const errorText = await response.text()
			let errorMessage = `API error: ${response.status} ${response.statusText}`
			
			try {
				const errorJson = JSON.parse(errorText)
				errorMessage = errorJson.error || errorJson.message || errorMessage
			} catch {
				// If not JSON, use the text as-is
				if (errorText) {
					errorMessage = errorText
				}
			}
			
			throw new Error(errorMessage)
		}

		return response.json()
	}

	/**
	 * Get usage data for a time period
	 */
	async getUsage(params?: {
		appId?: number
		startDate?: string
		endDate?: string
	}) {
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
	}) {
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
	async getUsageHistory(params?: {
		appId?: number
		months?: number
	}) {
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
	async getBillingCost(params?: {
		startDate?: string
		endDate?: string
	}) {
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
	) {
		this.apiUrl = process.env.WHOPSHIP_API_URL || 'https://api.whopship.com'
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Whop-Access-Token': this.accessToken,
			'X-Whop-Refresh-Token': this.refreshToken,
			'X-Whop-Csrf-Token': this.csrfToken,
		}

		const url = `${this.apiUrl}${endpoint}`
		const response = await fetch(url, {
			...options,
      headers: {
				...headers,
				...options.headers,
      },
    })
  
    if (!response.ok) {
			const errorText = await response.text()
			let errorMessage = `API error: ${response.status} ${response.statusText}`
			
			try {
				const errorJson = JSON.parse(errorText)
				errorMessage = errorJson.error || errorJson.message || errorMessage
			} catch {
				if (errorText) {
					errorMessage = errorText
				}
			}
			
			throw new Error(errorMessage)
		}

		return response.json()
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

	async getDeploymentStatus(deploymentId: number) {
		return this.request(`/api/deployments/${deploymentId}`)
	}

	async getDeploymentLogs(deploymentId: number) {
    const response = await fetch(
			`${this.apiUrl}/api/deployments/${deploymentId}/logs`,
      {
        headers: {
					'X-Whop-Access-Token': this.accessToken,
					'X-Whop-Refresh-Token': this.refreshToken,
					'X-Whop-Csrf-Token': this.csrfToken,
				},
			},
		)
    if (!response.ok) {
			if (response.status === 404) return ''
			throw new Error(`Failed to fetch logs: ${response.statusText}`)
    }
		return response.text()
  }
}
