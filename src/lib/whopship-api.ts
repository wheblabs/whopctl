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

export class WhopshipAPI {
	// private readonly apiURL: string = 'https://api.whopship.com'
	private readonly apiURL: string = 'http://localhost:3000'

	constructor(
		private readonly accessToken: string,
		private readonly refreshToken: string,
		private readonly csrfToken: string,
	) {}

	async getMe(): Promise<WhopshipUser> {
		const response = await fetch(`${this.apiURL}/me`, {
			headers: {
				'x-whop-access-token': this.accessToken,
				'x-whop-refresh-token': this.refreshToken,
				'x-whop-csrf-token': this.csrfToken,
			},
		})

		const json = (await response.json()) as { user: WhopshipUser }
		return whopshipUserSchema.parse(json.user)
	}
}
