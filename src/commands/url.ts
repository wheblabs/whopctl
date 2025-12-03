import chalk from 'chalk'
import { aliasManager } from '../lib/alias-manager.ts'
import { requireAuth } from '../lib/auth-guard.ts'
import { printError, printInfo } from '../lib/output.ts'
import { createSpinner } from '../lib/progress.ts'
import { whopshipClient } from '../lib/whopship-client.ts'

/**
 * Check if a subdomain is available
 */
export async function checkUrlCommand(subdomain: string): Promise<void> {
	requireAuth()

	try {
		// Validate subdomain format
		if (!isValidSubdomain(subdomain)) {
			printError(
				'Invalid subdomain format. Use only letters, numbers, and hyphens (2-63 characters).',
			)
			process.exit(1)
		}

		const spinner = createSpinner(`Checking availability: ${subdomain}.whopship.app`)
		spinner.start()

		try {
			const result = await whopshipClient.checkSubdomainAvailability(subdomain)

			if (result.available) {
				spinner.succeed(`✅ ${subdomain}.whopship.app is available!`)
				console.log()
				console.log(chalk.dim('Reserve it with:'))
				console.log(chalk.dim(`  whopctl url reserve ${subdomain} <app-id-or-alias>`))
			} else {
				spinner.fail(`❌ ${subdomain}.whopship.app is not available`)

				if (result.suggestions && result.suggestions.length > 0) {
					console.log()
					console.log(chalk.yellow('💡 Suggested alternatives:'))
					for (const suggestion of result.suggestions) {
						console.log(chalk.dim(`  ${suggestion}.whopship.app`))
					}
				}
			}
			console.log()
		} catch (error) {
			spinner.fail('Failed to check subdomain availability')
			throw error
		}
	} catch (error) {
		printError(`Failed to check URL: ${error}`)
		process.exit(1)
	}
}

/**
 * Reserve a custom subdomain for an app
 */
export async function reserveUrlCommand(
	subdomain: string,
	projectIdentifier: string,
): Promise<void> {
	requireAuth()

	try {
		// Validate subdomain format
		if (!isValidSubdomain(subdomain)) {
			printError(
				'Invalid subdomain format. Use only letters, numbers, and hyphens (2-63 characters).',
			)
			process.exit(1)
		}

		// Resolve project identifier to app ID
		const spinner = createSpinner(`Resolving project: ${projectIdentifier}`)
		spinner.start()

		let appId: string
		try {
			const { appId: resolvedAppId } = await aliasManager.resolveProjectId(projectIdentifier)
			appId = resolvedAppId
			spinner.succeed(`Found app: ${appId}`)
		} catch (error) {
			spinner.fail(`Failed to resolve project: ${error}`)
			process.exit(1)
		}

		// Check availability first
		const checkSpinner = createSpinner(`Checking availability: ${subdomain}.whopship.app`)
		checkSpinner.start()

		try {
			const availability = await whopshipClient.checkSubdomainAvailability(subdomain)

			if (!availability.available) {
				checkSpinner.fail(`❌ ${subdomain}.whopship.app is not available`)

				if (availability.suggestions && availability.suggestions.length > 0) {
					console.log()
					console.log(chalk.yellow('💡 Try these alternatives:'))
					for (const suggestion of availability.suggestions) {
						console.log(chalk.dim(`  whopctl url reserve ${suggestion} ${projectIdentifier}`))
					}
				}
				console.log()
				process.exit(1)
			}

			checkSpinner.succeed(`✅ ${subdomain}.whopship.app is available`)
		} catch (error) {
			checkSpinner.fail('Failed to check availability')
			throw error
		}

		// Reserve the subdomain
		const reserveSpinner = createSpinner(`Reserving ${subdomain}.whopship.app...`)
		reserveSpinner.start()

		try {
			await whopshipClient.reserveSubdomain(subdomain, appId)
			reserveSpinner.succeed(`🎉 Reserved ${subdomain}.whopship.app`)

			console.log()
			console.log(chalk.bold.green('🌐 Custom URL Reserved!'))
			console.log(chalk.gray('─'.repeat(50)))
			console.log()
			console.log(`${chalk.cyan('URL:')}        https://${subdomain}.whopship.app`)
			console.log(`${chalk.cyan('App ID:')}     ${appId}`)
			console.log(`${chalk.cyan('Reserved:')}   ${new Date().toLocaleString()}`)
			console.log()
			console.log(chalk.bold('Next Steps:'))
			console.log(
				`  ${chalk.green('1.')} Deploy your app: ${chalk.dim(`whopctl deploy ${projectIdentifier}`)}`,
			)
			console.log(
				`  ${chalk.green('2.')} Your app will be available at the custom URL after deployment`,
			)
			console.log()

			// Update alias with subdomain info if it exists
			try {
				const alias = await aliasManager.getAlias(projectIdentifier)
				if (alias) {
					await aliasManager.setAlias(alias.name, alias.appId, alias.appName, subdomain)
				}
			} catch {
				// Ignore alias update errors
			}
		} catch (error) {
			reserveSpinner.fail('Failed to reserve subdomain')
			throw error
		}
	} catch (error) {
		printError(`Failed to reserve URL: ${error}`)
		process.exit(1)
	}
}

/**
 * Release a reserved subdomain
 */
export async function releaseUrlCommand(subdomain: string): Promise<void> {
	requireAuth()

	try {
		const spinner = createSpinner(`Releasing ${subdomain}.whopship.app...`)
		spinner.start()

		try {
			await whopshipClient.releaseSubdomain(subdomain)
			spinner.succeed(`✅ Released ${subdomain}.whopship.app`)

			console.log()
			console.log(chalk.yellow('⚠️  Subdomain released'))
			console.log(`The URL ${subdomain}.whopship.app is now available for others to reserve.`)
			console.log()
			console.log(chalk.dim('💡 Your app will continue to work at its default URL:'))
			console.log(chalk.dim('   https://app-<id>.whopship.app'))
			console.log()
		} catch (error) {
			spinner.fail('Failed to release subdomain')
			throw error
		}
	} catch (error) {
		printError(`Failed to release URL: ${error}`)
		process.exit(1)
	}
}

/**
 * List all reserved subdomains for the user
 */
export async function listUrlsCommand(): Promise<void> {
	requireAuth()

	try {
		const spinner = createSpinner('Fetching your reserved URLs...')
		spinner.start()

		try {
			const result = await whopshipClient.listUserSubdomains()
			const subdomains = result.subdomains || []

			spinner.succeed(
				`Found ${subdomains.length} reserved URL${subdomains.length !== 1 ? 's' : ''}`,
			)

			if (subdomains.length === 0) {
				console.log()
				printInfo('No custom URLs reserved.')
				console.log()
				console.log(chalk.dim('Reserve a custom URL with:'))
				console.log(chalk.dim('  whopctl url reserve my-project <app-id-or-alias>'))
				console.log()
				return
			}

			console.log()
			console.log(chalk.bold('🌐 Your Reserved URLs'))
			console.log(chalk.gray('─'.repeat(80)))
			console.log()

			// Table header
			console.log(
				chalk.bold(
					`${'URL'.padEnd(30)} ${'App ID'.padEnd(25)} ${'App Name'.padEnd(20)} ${'Reserved'.padEnd(12)}`,
				),
			)
			console.log(chalk.gray('─'.repeat(80)))

			for (const subdomain of subdomains) {
				const url = chalk.cyan(`${subdomain.subdomain}.whopship.app`.padEnd(30))
				const appId = chalk.dim(subdomain.app_id.padEnd(25))
				const appName = (subdomain.app_name || 'Unknown').padEnd(20)
				const reserved = formatRelativeTime(subdomain.reserved_at).padEnd(12)

				console.log(`${url} ${appId} ${appName} ${reserved}`)
			}

			console.log()
			console.log(
				chalk.dim(`Total: ${subdomains.length} reserved URL${subdomains.length !== 1 ? 's' : ''}`),
			)
			console.log()
		} catch (error) {
			spinner.fail('Failed to fetch reserved URLs')
			throw error
		}
	} catch (error) {
		printError(`Failed to list URLs: ${error}`)
		process.exit(1)
	}
}

/**
 * Suggest available subdomains based on a project name
 */
export async function suggestUrlCommand(baseName: string): Promise<void> {
	requireAuth()

	try {
		// Generate variations of the base name
		const variations = generateSubdomainVariations(baseName)

		console.log()
		console.log(chalk.bold(`🔍 Checking availability for "${baseName}"...`))
		console.log(chalk.gray('─'.repeat(50)))
		console.log()

		const available: string[] = []
		const unavailable: string[] = []

		for (const variation of variations) {
			try {
				const result = await whopshipClient.checkSubdomainAvailability(variation)
				if (result.available) {
					available.push(variation)
					console.log(chalk.green(`✅ ${variation}.whopship.app`))
				} else {
					unavailable.push(variation)
					console.log(chalk.red(`❌ ${variation}.whopship.app`))
				}
			} catch {
				console.log(chalk.dim(`⚠️  ${variation}.whopship.app (error checking)`))
			}
		}

		console.log()

		if (available.length > 0) {
			console.log(
				chalk.bold.green(
					`🎉 ${available.length} available option${available.length !== 1 ? 's' : ''}:`,
				),
			)
			console.log()
			for (const subdomain of available.slice(0, 5)) {
				console.log(chalk.dim(`  whopctl url reserve ${subdomain} <app-id-or-alias>`))
			}
			if (available.length > 5) {
				console.log(chalk.dim(`  ... and ${available.length - 5} more`))
			}
		} else {
			console.log(chalk.yellow('😔 No variations available. Try a different base name.'))
		}
		console.log()
	} catch (error) {
		printError(`Failed to suggest URLs: ${error}`)
		process.exit(1)
	}
}

/**
 * Validate subdomain format
 */
function isValidSubdomain(subdomain: string): boolean {
	// RFC 1123 hostname rules
	return (
		/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain) &&
		subdomain.length >= 2 &&
		subdomain.length <= 63 &&
		!subdomain.startsWith('-') &&
		!subdomain.endsWith('-')
	)
}

/**
 * Generate subdomain variations
 */
function generateSubdomainVariations(baseName: string): string[] {
	const clean = baseName
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')

	const variations = [
		clean,
		`${clean}-app`,
		`${clean}-dev`,
		`${clean}-prod`,
		`my-${clean}`,
		`${clean}-v1`,
		`${clean}-2024`,
		`${clean}-api`,
		`${clean}-web`,
		`${clean}-live`,
	].filter((v) => isValidSubdomain(v))

	// Remove duplicates
	return [...new Set(variations)]
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffMinutes = Math.floor(diffMs / (1000 * 60))
	const diffHours = Math.floor(diffMinutes / 60)
	const diffDays = Math.floor(diffHours / 24)

	if (diffMinutes < 1) {
		return chalk.green('now')
	} else if (diffMinutes < 60) {
		return chalk.green(`${diffMinutes}m`)
	} else if (diffHours < 24) {
		return chalk.yellow(`${diffHours}h`)
	} else if (diffDays < 7) {
		return chalk.dim(`${diffDays}d`)
	} else {
		return chalk.dim(date.toLocaleDateString())
	}
}
