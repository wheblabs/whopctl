import chalk from 'chalk'
import { aliasManager } from '../lib/alias-manager.ts'
import { requireAuth } from '../lib/auth-guard.ts'
import { printError, printSuccess } from '../lib/output.ts'
import { createSpinner } from '../lib/progress.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'

/**
 * Set a project alias
 */
export async function setAliasCommand(name: string, appId: string): Promise<void> {
	requireAuth()

	try {
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
			uidToken: session.uidToken,
			ssk: session.ssk,
			userId: session.userId,
		})

		// Validate that the app ID exists and get app info
		const spinner = createSpinner(`Validating app ID: ${appId}`)
		spinner.start()

		try {
			const appInfo = await api.getAppByWhopId(appId)
			spinner.succeed(`Found app: ${appInfo.whop_app_name}`)

			// Set the alias with app metadata
			await aliasManager.setAlias(name, appId, appInfo.whop_app_name)

			console.log()
			printSuccess(`✅ Alias created: ${chalk.cyan(name)} → ${chalk.dim(appId)}`)
			console.log(`   App: ${appInfo.whop_app_name}`)
			console.log()
			console.log(chalk.dim('You can now use:'))
			console.log(chalk.dim(`  whopctl deploy ${name}`))
			console.log(chalk.dim(`  whopctl status ${name}`))
			console.log(chalk.dim(`  whopctl logs ${name}`))
			console.log()
		} catch (error) {
			spinner.fail(`App ID not found: ${appId}`)
			printError(`${error}`)
			console.log()
			console.log(chalk.dim('💡 Make sure the app ID is correct and you have access to it.'))
			process.exit(1)
		}
	} catch (error) {
		printError(`Failed to create alias: ${error}`)
		process.exit(1)
	}
}

/**
 * Remove a project alias
 */
export async function removeAliasCommand(name: string): Promise<void> {
	try {
		const alias = await aliasManager.getAlias(name)

		if (!alias) {
			printError(`Alias "${name}" not found.`)
			process.exit(1)
		}

		const removed = await aliasManager.removeAlias(name)

		if (removed) {
			printSuccess(`✅ Removed alias: ${chalk.cyan(name)}`)
			console.log(`   Was pointing to: ${chalk.dim(alias.appId)}`)
		} else {
			printError(`Failed to remove alias "${name}".`)
			process.exit(1)
		}
	} catch (error) {
		printError(`Failed to remove alias: ${error}`)
		process.exit(1)
	}
}

/**
 * List all project aliases
 */
export async function listAliasesCommand(): Promise<void> {
	try {
		await aliasManager.displayAliases()
	} catch (error) {
		printError(`Failed to list aliases: ${error}`)
		process.exit(1)
	}
}

/**
 * Show details of a specific alias
 */
export async function showAliasCommand(name: string): Promise<void> {
	try {
		const alias = await aliasManager.getAlias(name)

		if (!alias) {
			printError(`Alias "${name}" not found.`)
			console.log()
			console.log(chalk.dim('Available aliases:'))
			const aliases = await aliasManager.listAliases()
			if (aliases.length === 0) {
				console.log(chalk.dim('  (none)'))
			} else {
				for (const a of aliases.slice(0, 5)) {
					console.log(chalk.dim(`  ${a.name} → ${a.appId}`))
				}
				if (aliases.length > 5) {
					console.log(chalk.dim(`  ... and ${aliases.length - 5} more`))
				}
			}
			console.log()
			process.exit(1)
		}

		console.log()
		console.log(chalk.bold(`📋 Alias: ${chalk.cyan(alias.name)}`))
		console.log(chalk.gray('─'.repeat(50)))
		console.log()
		console.log(`${chalk.cyan('App ID:')}      ${alias.appId}`)
		if (alias.appName) {
			console.log(`${chalk.cyan('App Name:')}    ${alias.appName}`)
		}
		if (alias.subdomain) {
			console.log(`${chalk.cyan('Subdomain:')}   ${alias.subdomain}`)
			console.log(`${chalk.cyan('URL:')}         https://${alias.subdomain}.whopship.app`)
		}
		console.log(`${chalk.cyan('Created:')}     ${new Date(alias.createdAt).toLocaleString()}`)
		if (alias.lastUsed) {
			console.log(`${chalk.cyan('Last Used:')}   ${new Date(alias.lastUsed).toLocaleString()}`)
		}
		console.log()
		console.log(chalk.bold('Commands you can run:'))
		console.log(chalk.dim(`  whopctl deploy ${alias.name}`))
		console.log(chalk.dim(`  whopctl status ${alias.name}`))
		console.log(chalk.dim(`  whopctl logs ${alias.name}`))
		console.log(chalk.dim(`  whopctl usage ${alias.name}`))
		console.log()
	} catch (error) {
		printError(`Failed to show alias: ${error}`)
		process.exit(1)
	}
}

/**
 * Auto-discover and suggest aliases
 */
export async function discoverAliasesCommand(): Promise<void> {
	requireAuth()

	try {
		const session = whop.getTokens()
		if (!session) {
			printError('No session found. Please run "whopctl login" first.')
			process.exit(1)
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
			uidToken: session.uidToken,
			ssk: session.ssk,
			userId: session.userId,
		})
		const spinner = createSpinner('Discovering your apps...')
		spinner.start()

		const suggestions = await aliasManager.suggestAliases(api)

		if (suggestions.length === 0) {
			spinner.info('No new apps found to create aliases for.')
			console.log()
			console.log(chalk.dim('💡 You can manually create aliases with:'))
			console.log(chalk.dim('   whopctl alias set my-project app_abc123'))
			return
		}

		spinner.succeed(`Found ${suggestions.length} apps`)

		console.log()
		console.log(chalk.bold('🔍 Suggested Aliases'))
		console.log(chalk.gray('─'.repeat(60)))
		console.log()

		for (const suggestion of suggestions) {
			console.log(
				`${chalk.cyan(suggestion.name.padEnd(20))} → ${chalk.dim(suggestion.appId)} (${suggestion.appName})`,
			)
		}

		console.log()
		console.log(chalk.dim('To create these aliases, run:'))
		for (const suggestion of suggestions.slice(0, 3)) {
			console.log(chalk.dim(`  whopctl alias set ${suggestion.name} ${suggestion.appId}`))
		}
		if (suggestions.length > 3) {
			console.log(chalk.dim(`  ... and ${suggestions.length - 3} more`))
		}
		console.log()
	} catch (error) {
		printError(`Failed to discover aliases: ${error}`)
		process.exit(1)
	}
}
