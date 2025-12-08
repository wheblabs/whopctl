import chalk from 'chalk'
import { requireAuth } from '../lib/auth-guard.ts'
import { printError, printInfo, printSuccess } from '../lib/output.ts'
import { banner, divider } from '../lib/ui.ts'
import { analyticsUsageCommand } from './analytics/usage.ts'
import { deployCommand } from './deploy.ts'
import { historyCommand } from './history.ts'
import { statusCommand } from './status/status.ts'

/**
 * Quick deploy: validate, deploy, and show status
 */
export async function quickDeployCommand(path: string = '.'): Promise<void> {
	requireAuth()

	try {
		console.log(banner('🚀 Quick Deploy', 'Deploy then show status', { tag: 'quick' }))
		console.log(divider())
		console.log()

		// 1. Deploy
		printInfo('Step 1: Deploying your app...')
		await deployCommand(path)

		console.log()
		console.log(chalk.green('✅ Deployment completed successfully!'))
		console.log()

		// 2. Show status
		printInfo('Step 2: Checking deployment status...')
		await statusCommand(path)
	} catch (error) {
		printError(`Quick deploy failed: ${error}`)
		console.log()
		printInfo('💡 You can check the status with: whopctl status')
		process.exit(1)
	}
}

/**
 * Quick status: show status, recent history, and usage
 */
export async function quickStatusCommand(path: string = '.'): Promise<void> {
	requireAuth()

	try {
		console.log(banner('📊 Quick Status', 'Status · history · usage', { tag: 'quick' }))
		console.log(divider())
		console.log()

		// 1. Current status
		printInfo('Current Deployment Status:')
		await statusCommand(path)

		console.log()
		console.log(chalk.gray('─'.repeat(50)))

		// 2. Recent history
		printInfo('Recent Deployment History:')
		await historyCommand(path, { limit: 5 })

		console.log()
		console.log(chalk.gray('─'.repeat(50)))

		// 3. Usage summary
		printInfo('Usage Summary:')
		await analyticsUsageCommand()
	} catch (error) {
		printError(`Quick status failed: ${error}`)
		process.exit(1)
	}
}

/**
 * Quick check: validate project and show recommendations
 */
export async function quickCheckCommand(path: string = '.'): Promise<void> {
	const { validateAndPrint } = await import('../lib/project-validator.ts')

	try {
		console.log(banner('🔍 Quick Project Check', 'Validate readiness', { tag: 'quick' }))
		console.log(divider())
		console.log()

		const isValid = await validateAndPrint(path, { verbose: true })

		if (isValid) {
			console.log()
			printSuccess('🎉 Your project is ready for deployment!')
			console.log()
			console.log(chalk.bold('Next steps:'))
			console.log(`  ${chalk.green('•')} Deploy: ${chalk.dim('whopctl deploy')}`)
			console.log(`  ${chalk.green('•')} Quick deploy: ${chalk.dim('whopctl quick deploy')}`)
			console.log()
		} else {
			console.log()
			printError('❌ Please fix the issues above before deploying.')
			console.log()
			console.log(chalk.bold('After fixing:'))
			console.log(`  ${chalk.yellow('•')} Check again: ${chalk.dim('whopctl quick check')}`)
			console.log(`  ${chalk.yellow('•')} Deploy: ${chalk.dim('whopctl deploy')}`)
			console.log()
		}
	} catch (error) {
		printError(`Quick check failed: ${error}`)
		process.exit(1)
	}
}
