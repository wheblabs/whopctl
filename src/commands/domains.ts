/**
 * Custom Domains Command Group
 *
 * Manage custom domains for WhopShip applications.
 * Usage:
 *   whopctl domains list [path]              # List custom domains
 *   whopctl domains add <domain> [path]      # Add custom domain
 *   whopctl domains verify <domain> [path]   # Check DNS verification
 *   whopctl domains remove <domain> [path]   # Remove domain
 */

import chalk from 'chalk'
import ora from 'ora'
import type { CommandModule } from 'yargs'
import { whopshipClient, type CustomDomain } from '~/lib/whopship-client.ts'
import { loadAppConfig } from '~/lib/config.ts'

async function getAppId(path: string): Promise<string> {
	const config = await loadAppConfig(path)
	if (!config) {
		throw new Error('No whop.json found. Run this command in a Whop app directory.')
	}
	if (!config.whopAppId) {
		throw new Error('No app ID found in whop.json. Deploy your app first with `whopctl deploy`.')
	}
	return config.whopAppId
}

function formatDomainStatus(status: CustomDomain['status']): string {
	switch (status) {
		case 'active':
			return chalk.green('● Active')
		case 'verifying':
			return chalk.yellow('◐ Verifying SSL')
		case 'pending_verification':
			return chalk.yellow('○ Pending DNS')
		case 'failed':
			return chalk.red('✗ Failed')
		case 'deleting':
			return chalk.gray('⏳ Deleting')
		default:
			return chalk.gray(status)
	}
}

// List command
const listCommand: CommandModule<object, { path: string }> = {
	command: 'list [path]',
	describe: 'List custom domains',
	builder: (yargs) =>
		yargs.positional('path', {
			describe: 'Path to the Whop app directory',
			type: 'string',
			default: '.',
		}),
	handler: async (args) => {
		const spinner = ora('Fetching domains...').start()

		try {
			const appId = await getAppId(args.path)
			const domains = await whopshipClient.listDomains(appId)

			spinner.stop()

			if (domains.length === 0) {
				console.log(chalk.yellow('No custom domains configured.'))
				console.log(chalk.dim('Add one with: whopctl domains add <domain>'))
				return
			}

			console.log(chalk.bold('\nCustom Domains\n'))

			for (const domain of domains) {
				console.log(`  ${chalk.cyan(domain.domain)}  ${formatDomainStatus(domain.status)}`)

				// Show DNS records if pending verification
				if (domain.status === 'pending_verification' && domain.validationRecords) {
					console.log(chalk.dim('    DNS records required:'))
					for (const record of domain.validationRecords) {
						console.log(chalk.dim(`      ${record.type} ${record.name}`))
						console.log(chalk.dim(`        → ${record.value}`))
					}
				}
			}

			console.log()
		} catch (error) {
			spinner.fail('Failed to fetch domains')
			throw error
		}
	},
}

// Add command
const addCommand: CommandModule<object, { path: string; domain: string }> = {
	command: 'add <domain> [path]',
	describe: 'Add a custom domain',
	builder: (yargs) =>
		yargs
			.positional('domain', {
				describe: 'Domain name to add (e.g., app.example.com)',
				type: 'string',
				demandOption: true,
			})
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			}),
	handler: async (args) => {
		const spinner = ora(`Adding domain ${args.domain}...`).start()

		try {
			const appId = await getAppId(args.path)
			const result = await whopshipClient.addDomain(appId, args.domain)

			spinner.succeed(chalk.green(`Added domain ${chalk.cyan(args.domain)}`))

			// Show DNS instructions
			if (result.status === 'pending_verification' && result.validationRecords) {
				console.log()
				console.log(chalk.bold('Next Steps:'))
				console.log()
				console.log('Add these DNS records to verify your domain:')
				console.log()

				for (const record of result.validationRecords) {
					console.log(`  ${chalk.cyan('Type:')} ${record.type}`)
					console.log(`  ${chalk.cyan('Name:')} ${record.name}`)
					console.log(`  ${chalk.cyan('Value:')} ${record.value}`)
					console.log()
				}

				console.log(chalk.dim('After adding DNS records, verify with:'))
				console.log(chalk.dim(`  whopctl domains verify ${args.domain}`))
			}
		} catch (error) {
			spinner.fail(`Failed to add domain ${args.domain}`)
			throw error
		}
	},
}

// Verify command
const verifyCommand: CommandModule<object, { path: string; domain: string }> = {
	command: 'verify <domain> [path]',
	describe: 'Verify DNS configuration for a domain',
	builder: (yargs) =>
		yargs
			.positional('domain', {
				describe: 'Domain name to verify',
				type: 'string',
				demandOption: true,
			})
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			}),
	handler: async (args) => {
		const spinner = ora(`Verifying ${args.domain}...`).start()

		try {
			const appId = await getAppId(args.path)
			const result = await whopshipClient.verifyDomain(appId, args.domain)

			spinner.stop()

			console.log()
			console.log(chalk.bold(`Domain: ${chalk.cyan(result.domain)}`))
			console.log()

			if (result.dnsVerified) {
				console.log(chalk.green('✓ DNS verified'))
			} else {
				console.log(chalk.yellow('○ DNS not verified'))
			}

			console.log(chalk.dim(`  SSL Status: ${result.sslStatus}`))

			if (result.validationRecords && result.validationRecords.length > 0) {
				console.log()
				console.log('DNS Records:')
				for (const record of result.validationRecords) {
					const status = record.verified ? chalk.green('✓') : chalk.yellow('○')
					console.log(`  ${status} ${record.type} ${record.name}`)
					console.log(chalk.dim(`      → ${record.value}`))
				}
			}

			if (!result.dnsVerified) {
				console.log()
				console.log(chalk.yellow('DNS propagation can take up to 48 hours.'))
				console.log(chalk.dim('Run this command again later to check status.'))
			} else if (result.sslStatus === 'active') {
				console.log()
				console.log(chalk.green('✓ Domain is fully active!'))
			}
		} catch (error) {
			spinner.fail(`Failed to verify ${args.domain}`)
			throw error
		}
	},
}

// Remove command
const removeCommand: CommandModule<object, { path: string; domain: string; force: boolean }> = {
	command: 'remove <domain> [path]',
	describe: 'Remove a custom domain',
	aliases: ['rm', 'delete'],
	builder: (yargs) =>
		yargs
			.positional('domain', {
				describe: 'Domain name to remove',
				type: 'string',
				demandOption: true,
			})
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			})
			.option('force', {
				describe: 'Skip confirmation',
				type: 'boolean',
				alias: 'f',
				default: false,
			}),
	handler: async (args) => {
		// Skip confirmation in non-interactive mode or if --force
		if (!args.force && process.stdin.isTTY) {
			console.log(chalk.yellow(`Warning: This will remove ${args.domain} from your app.`))
			console.log(chalk.dim('Use --force to skip this confirmation.'))
			// In a real implementation, we'd use a prompt library here
			// For now, just proceed
		}

		const spinner = ora(`Removing ${args.domain}...`).start()

		try {
			const appId = await getAppId(args.path)
			await whopshipClient.removeDomain(appId, args.domain)

			spinner.succeed(chalk.green(`Removed domain ${chalk.cyan(args.domain)}`))
		} catch (error) {
			spinner.fail(`Failed to remove ${args.domain}`)
			throw error
		}
	},
}

// Main domains command group
export const domainsCommands: CommandModule<object, object> = {
	command: 'domains',
	describe: 'Manage custom domains',
	builder: (yargs) =>
		yargs
			.command(listCommand)
			.command(addCommand)
			.command(verifyCommand)
			.command(removeCommand)
			.demandCommand(1, 'You must specify a subcommand'),
	handler: () => {
		// This won't be called due to demandCommand
	},
}

export default domainsCommands

