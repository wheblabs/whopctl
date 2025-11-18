import { readFileSync } from 'node:fs'
import { whop } from './whop.ts'

// Get API URL from environment or default to production
const WHOPSHIP_API_URL = process.env.WHOPSHIP_API_URL || 'https://api.whopship.com'

/**
 * Request body for creating a new deployment.
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
 * Response from creating a deployment.
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
 * Response from triggering a deployment.
 */
export interface TriggerDeploymentResponse {
	message: string
	deploymentId: number
	status: string
}

/**
 * Deployment status information.
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
 * WhopShip API client for deployment operations.
 *
 * This client handles:
 * - Creating deployments
 * - Uploading artifacts to R2
 * - Triggering deployment processing
 * - Monitoring deployment status
 * - Fetching deployment logs
 */
export class WhopShipClient {
	private baseUrl: string

	constructor(baseUrl: string = WHOPSHIP_API_URL) {
		this.baseUrl = baseUrl
	}

	/**
	 * Gets authentication headers for WhopShip API requests.
	 * Uses the access token from the Whop client session.
	 */
	private async getAuthHeaders(): Promise<Record<string, string>> {
		if (!whop.isAuthenticated()) {
			throw new Error('Not authenticated. Please run "whopctl login" first.')
		}

		// Get the session from the Whop client
		const session = whop.getSession()
		if (!session?.accessToken) {
			throw new Error('No access token available. Please login again.')
		}

		return {
			Authorization: `Bearer ${session.accessToken}`,
			'Content-Type': 'application/json',
		}
	}

	/**
	 * Creates a new deployment and returns a presigned upload URL.
	 *
	 * @param request Deployment creation request
	 * @returns Deployment details and upload URL
	 */
	async createDeployment(request: CreateDeploymentRequest): Promise<CreateDeploymentResponse> {
		const headers = await this.getAuthHeaders()

		const response = await fetch(`${this.baseUrl}/deployments`, {
			method: 'POST',
			headers,
			body: JSON.stringify(request),
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Failed to create deployment (${response.status}): ${errorText}`)
		}

		return await response.json()
	}

	/**
	 * Uploads an artifact to the presigned R2 URL.
	 *
	 * @param uploadUrl Presigned R2 URL from createDeployment
	 * @param artifactPath Local path to the artifact zip file
	 */
	async uploadArtifact(uploadUrl: string, artifactPath: string): Promise<void> {
		// Read the artifact file
		const artifactBuffer = readFileSync(artifactPath)

		// Upload to R2 using the presigned URL
		// No authentication headers needed - the URL is presigned
		const response = await fetch(uploadUrl, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/zip',
			},
			body: artifactBuffer,
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Failed to upload artifact (${response.status}): ${errorText}`)
		}
	}

	/**
	 * Notifies the API that artifact upload is complete.
	 * This signals that the deployment can begin processing.
	 *
	 * @param deploymentId Deployment ID
	 */
	async completeDeployment(deploymentId: number): Promise<void> {
		const headers = await this.getAuthHeaders()

		const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}/complete`, {
			method: 'POST',
			headers,
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Failed to complete deployment (${response.status}): ${errorText}`)
		}
	}

	/**
	 * Triggers deployment processing after artifact upload.
	 *
	 * @param deploymentId Deployment ID
	 */
	async triggerDeployment(deploymentId: number): Promise<TriggerDeploymentResponse> {
		const headers = await this.getAuthHeaders()

		const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}/trigger`, {
			method: 'POST',
			headers,
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Failed to trigger deployment (${response.status}): ${errorText}`)
		}

		return await response.json()
	}

	/**
	 * Gets the current status of a deployment.
	 *
	 * @param deploymentId Deployment ID
	 * @returns Deployment status information
	 */
	async getDeploymentStatus(deploymentId: number): Promise<DeploymentStatus> {
		const headers = await this.getAuthHeaders()

		const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}`, {
			method: 'GET',
			headers,
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Failed to get deployment status (${response.status}): ${errorText}`)
		}

		return await response.json()
	}

	/**
	 * Fetches deployment logs.
	 *
	 * @param deploymentId Deployment ID
	 * @returns Plain text logs
	 */
	async getDeploymentLogs(deploymentId: number): Promise<string> {
		const headers = await this.getAuthHeaders()

		const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}/logs`, {
			method: 'GET',
			headers,
		})

		if (!response.ok) {
			// 404 is expected if logs aren't available yet
			if (response.status === 404) {
				return ''
			}
			const errorText = await response.text()
			throw new Error(`Failed to fetch logs (${response.status}): ${errorText}`)
		}

		return await response.text()
	}
}

/**
 * Shared WhopShip client instance.
 */
export const whopship = new WhopShipClient()
