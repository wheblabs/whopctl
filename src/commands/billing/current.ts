import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../../lib/output.ts'
import { whopshipClient } from '../../lib/whopship-client.ts'

/**
 * Handles the "billing current" command.
 *
 * Fetches and displays current billing period usage and subscription status.
 */
export async function billingCurrentCommand(appId?: number): Promise<void> {
	requireAuth()

	try {
		printInfo('Fetching billing information...')

		// Get subscription status
		const subscriptionStatus = await whopshipClient.getSubscriptionStatus()

		// Get usage
		const usageData = (await whopshipClient.getCurrentUsage(appId)) as any

		console.log('')
		printSuccess('Billing Status')
		console.log('')

		// Subscription info
		console.log(chalk.bold('Subscription:'))
		console.log(`  Tier: ${chalk.cyan(subscriptionStatus.tierInfo.name)}`)
		console.log(
			`  Price: ${chalk.cyan(`$${subscriptionStatus.tierInfo.monthlyPrice.toFixed(2)}`)}/month`,
		)

		if (subscriptionStatus.subscriptionStatus) {
			const statusColor =
				subscriptionStatus.subscriptionStatus === 'active' ? chalk.green : chalk.yellow
			console.log(`  Status: ${statusColor(subscriptionStatus.subscriptionStatus)}`)
		}

		if (subscriptionStatus.subscriptionEndsAt) {
			const endsAt = new Date(subscriptionStatus.subscriptionEndsAt)
			console.log(`  Renews: ${chalk.cyan(endsAt.toLocaleDateString())}`)
		}

		console.log('')

		// Usage info
		if (usageData.appId) {
			console.log(chalk.dim(`App ID: ${usageData.appId}`))
			console.log('')
		}

		console.log(chalk.bold('Current Period Usage:'))
		console.log('')

		const limits = subscriptionStatus.tierInfo.limits

		console.log(chalk.bold('Function Invocations:'))
		const invocations = usageData.functionInvocations || 0
		const invocationsUsage = `${invocations.toLocaleString()} / ${limits.functionInvocations.toLocaleString()}`
		const invocationsColor = invocations >= limits.functionInvocations ? chalk.red : chalk.cyan
		console.log(`  ${invocationsColor(invocationsUsage)}`)
		console.log('')

		console.log(chalk.bold('Bandwidth:'))
		const bandwidth = parseFloat(usageData.bandwidthGb || '0')
		const bandwidthUsage = `${bandwidth.toFixed(2)} / ${limits.bandwidthGb} GB`
		const bandwidthColor = bandwidth >= limits.bandwidthGb ? chalk.red : chalk.cyan
		console.log(`  ${bandwidthColor(bandwidthUsage)}`)
		console.log('')

		console.log(chalk.bold('Build Minutes:'))
		const buildMinutes = parseFloat(usageData.buildMinutes || '0')
		const buildMinutesUsage = `${buildMinutes.toFixed(2)} / ${limits.buildMinutes}`
		const buildMinutesColor = buildMinutes >= limits.buildMinutes ? chalk.red : chalk.cyan
		console.log(`  ${buildMinutesColor(buildMinutesUsage)}`)
		console.log('')

		console.log(chalk.bold('Storage:'))
		const storage = parseFloat(usageData.storageGb || '0')
		const storageUsage = `${storage.toFixed(2)} / ${limits.storageGb} GB`
		const storageColor = storage >= limits.storageGb ? chalk.red : chalk.cyan
		console.log(`  ${storageColor(storageUsage)}`)
		console.log('')

		console.log(chalk.bold('Deployments:'))
		const deployments = usageData.deployments || 0
		const deploymentsUsage = `${deployments.toLocaleString()} / ${limits.deployments}`
		const deploymentsColor = deployments >= limits.deployments ? chalk.red : chalk.cyan
		console.log(`  ${deploymentsColor(deploymentsUsage)}`)
		console.log('')

		// Show overage information if present
		if (usageData.overages) {
			console.log(chalk.bold.yellow('⚠️  Usage Overages:'))
			console.log('')

			if (usageData.overages.functionInvocations) {
				const overage = usageData.overages.functionInvocations
				console.log(
					`  Function Invocations: ${chalk.red(`+${Math.round(overage.amount).toLocaleString()}`)} ($${overage.cost.toFixed(4)})`,
				)
			}

			if (usageData.overages.bandwidthGb) {
				const overage = usageData.overages.bandwidthGb
				console.log(
					`  Bandwidth: ${chalk.red(`+${overage.amount.toFixed(2)} GB`)} ($${overage.cost.toFixed(2)})`,
				)
			}

			if (usageData.overages.buildMinutes) {
				const overage = usageData.overages.buildMinutes
				console.log(
					`  Build Minutes: ${chalk.red(`+${overage.amount.toFixed(2)}`)} ($${overage.cost.toFixed(2)})`,
				)
			}

			if (usageData.overages.storageGb) {
				const overage = usageData.overages.storageGb
				console.log(
					`  Storage: ${chalk.red(`+${overage.amount.toFixed(2)} GB`)} ($${overage.cost.toFixed(2)})`,
				)
			}

			if (usageData.totalOverageCost !== undefined && usageData.totalOverageCost > 0) {
				console.log('')
				console.log(
					chalk.bold.red(`  Total Overage Cost: $${usageData.totalOverageCost.toFixed(4)}`),
				)
			}

			if (usageData.gracePeriodEndsAt) {
				const graceEnd = new Date(usageData.gracePeriodEndsAt)
				const now = new Date()
				const daysRemaining = Math.ceil(
					(graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
				)
				console.log('')
				if (daysRemaining > 0) {
					console.log(
						chalk.yellow(
							`  ⏰ Grace period ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} (${graceEnd.toLocaleDateString()})`,
						),
					)
				} else {
					console.log(chalk.red(`  ⚠️  Grace period ended on ${graceEnd.toLocaleDateString()}`))
				}
			}

			console.log('')
		}

		// Show warnings if present
		if (usageData.warnings && usageData.warnings.length > 0) {
			console.log(chalk.bold.yellow('⚠️  Warnings:'))
			for (const warning of usageData.warnings) {
				console.log(chalk.yellow(`  • ${warning}`))
			}
			console.log('')
		}

		if (usageData.costUsd !== undefined) {
			console.log(chalk.bold('Cost:'))
			console.log(`  ${chalk.green(`$${parseFloat(usageData.costUsd || '0').toFixed(2)}`)}`)
			if (usageData.totalOverageCost !== undefined && usageData.totalOverageCost > 0) {
				console.log(`  ${chalk.yellow(`Overage: $${usageData.totalOverageCost.toFixed(4)}`)}`)
			}
			console.log('')
		}

		// Show upgrade suggestion if on free tier
		if (subscriptionStatus.tier === 'free') {
			console.log('')
			printInfo('💡 Upgrade to unlock more resources:')
			console.log(chalk.dim('   whopctl billing subscribe hobby'))
			console.log(chalk.dim('   whopctl billing subscribe pro'))
			console.log('')
		}
	} catch (error) {
		printError('Failed to fetch billing information')
		if (error instanceof Error) {
			console.error(chalk.red(error.message))
		}
		throw error
	}
}
