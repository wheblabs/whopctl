import { z } from 'zod'

export const whopshipUserSchema = z.object({
	id: z.number(),
	uuid: z.string(),
	whopUsername: z.string(),
	whopUserId: z.string(),
	whopDisplayName: z.string(),
	whopEmail: z.string(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
})

export type WhopshipUser = z.infer<typeof whopshipUserSchema>

export const buildStatusSchema = z.object({
  build_id: z.string(),
  status: z.string(),
  app: z.object({
    id: z.string(),
    whop_app_id: z.string(),
    whop_app_name: z.string(),
    subdomain: z.string(),
  }),
  source: z.object({
    sha256: z.string(),
    s3_bucket: z.string(),
    s3_key: z.string(),
  }),
  artifacts: z.object({
    s3_bucket: z.string(),
    s3_key: z.string(),
  }).nullable(),
  error_message: z.string().nullable(),
  build_log_url: z.string().nullable(),
  metadata: z.any().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})

export type BuildStatus = z.infer<typeof buildStatusSchema>

export class WhopshipAPI {
	// private readonly apiURL: string = 'https://api.whopship.com'
	private readonly apiURL: string = 'http://localhost:3000'

	constructor(
		private readonly accessToken: string,
		private readonly refreshToken: string,
		private readonly csrfToken: string,
	) {}

	async getMe(): Promise<WhopshipUser> {
		const response = await fetch(`${this.apiURL}/api/me`, {
			headers: {
				'x-whop-access-token': this.accessToken,
				'x-whop-refresh-token': this.refreshToken,
				'x-whop-csrf-token': this.csrfToken,
			},
		})

		const json = (await response.json()) as { user: WhopshipUser }
		return whopshipUserSchema.parse(json.user)
	}

  async deployInit(params: {
    whop_app_id: string
    whop_app_company_id: string
    source_sha256: string
  }): Promise<any> {
    const response = await fetch(`${this.apiURL}/api/deploy/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whop-access-token': this.accessToken,
        'x-whop-refresh-token': this.refreshToken,
        'x-whop-csrf-token': this.csrfToken,
      },
      body: JSON.stringify(params),
    })
  
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Deploy init failed: ${error}`)
    }
  
    const json = await response.json()
    // return deployInitResponseSchema.parse(json)
    return json
  }

  async deployComplete(buildId: string): Promise<{ success: boolean; build_id: string; status: string }> {
    const response = await fetch(`${this.apiURL}/api/deploy/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whop-access-token': this.accessToken,
        'x-whop-refresh-token': this.refreshToken,
        'x-whop-csrf-token': this.csrfToken,
      },
      body: JSON.stringify({ build_id: buildId }),
    })
  
    if (!response.ok) {
      throw new Error(`Deploy complete failed: ${await response.text()}`)
    }
  
    const json = await response.json() as { success: boolean; build_id: string; status: string }
    return json
  }

  async getLatestBuildForApp(whopAppId: string): Promise<BuildStatus> {
    const response = await fetch(
      `${this.apiURL}/api/deploy/builds?whop_app_id=${whopAppId}&limit=1`,
      {
        headers: {
          'x-whop-access-token': this.accessToken,
          'x-whop-refresh-token': this.refreshToken,
          'x-whop-csrf-token': this.csrfToken,
        },
      }
    )
  
    if (!response.ok) {
      throw new Error(`Failed to get builds: ${await response.text()}`)
    }
  
    const json = await response.json() as { builds: BuildStatus[] }
    if (!json.builds || json.builds.length === 0) {
      throw new Error('No builds found for this app')
    }
  
    return buildStatusSchema.parse(json.builds[0])
  }

  async getBuildLogs(buildId: string) {
    const response = await fetch(`${this.apiURL}/api/deploy/builds/${buildId}/logs`, {
      headers: {
        'x-whop-access-token': this.accessToken,
        'x-whop-refresh-token': this.refreshToken,
        'x-whop-csrf-token': this.csrfToken,
      },
    })
  
    if (!response.ok) {
      throw new Error(`Failed to get build logs: ${await response.text()}`)
    }
  
    return await response.json()
  }

  async getBuilds(whopAppId: string, limit: number = 10) {
    const response = await fetch(
      `${this.apiURL}/api/deploy/builds?whop_app_id=${whopAppId}&limit=${limit}`,
      {
        headers: {
          'x-whop-access-token': this.accessToken,
          'x-whop-refresh-token': this.refreshToken,
          'x-whop-csrf-token': this.csrfToken,
        },
      }
    )
  
    if (!response.ok) {
      throw new Error(`Failed to get builds: ${await response.text()}`)
    }
  
    return await response.json()
  }
  
  async redeploy(buildId: string) {
    const response = await fetch(`${this.apiURL}/api/deploy/redeploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whop-access-token': this.accessToken,
        'x-whop-refresh-token': this.refreshToken,
        'x-whop-csrf-token': this.csrfToken,
      },
      body: JSON.stringify({ build_id: buildId }),
    })
  
    if (!response.ok) {
      throw new Error(`Redeploy failed: ${await response.text()}`)
    }
  
    return await response.json()
  }
}
