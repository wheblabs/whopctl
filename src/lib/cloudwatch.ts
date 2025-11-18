import {
	CloudWatchLogsClient,
	DescribeLogGroupsCommand,
	FilterLogEventsCommand,
	type OutputLogEvent,
} from '@aws-sdk/client-cloudwatch-logs'

export class CloudWatchLogs {
	private client: CloudWatchLogsClient

	constructor(region = 'us-west-1') {
		this.client = new CloudWatchLogsClient({ region })
	}

	async getLogGroups(prefix: string) {
		const result = await this.client.send(
			new DescribeLogGroupsCommand({
				logGroupNamePrefix: prefix,
			}),
		)
		return result.logGroups || []
	}

	async getRecentLogs(
		logGroupName: string,
		hoursBack = 1,
		filterPattern?: string,
		maxEvents = 500,
	) {
		const startTime = Date.now() - hoursBack * 60 * 60 * 1000

		const events: OutputLogEvent[] = []
		let nextToken: string | undefined
		let attempts = 0

		do {
			const response = await this.client.send(
				new FilterLogEventsCommand({
					logGroupName,
					startTime,
					endTime: Date.now(),
					filterPattern,
					nextToken,
					limit: 1000,
					interleaved: true,
				}),
			)

			if (response.events) {
				events.push(...response.events)
			}

			if (!response.nextToken || response.nextToken === nextToken) {
				break
			}

			nextToken = response.nextToken
			attempts += 1

			// Avoid unbounded pagination in very chatty log groups
			if (events.length >= maxEvents * 4 || attempts >= 10) {
				break
			}
		} while (nextToken)

		events.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

		// Return only the most recent maxEvents entries
		return events.slice(Math.max(events.length - maxEvents, 0))
	}
}
