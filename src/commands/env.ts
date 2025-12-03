/**
 * Environment Variables Command Group
 *
 * Manage environment variables for WhopShip applications.
 * Usage:
 *   whopctl env list [path]                 # List env vars (masked)
 *   whopctl env set KEY=value [path]        # Set single env var
 *   whopctl env set KEY=value --build       # Mark as exposeToBuild
 *   whopctl env delete KEY [path]           # Delete env var
 *   whopctl env push [path]                 # Push local .env to WhopShip
 *   whopctl env pull [path]                 # Pull env vars to local .env
 */

import chalk from 'chalk'
import ora from 'ora'
import { readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandModule, Argv } from 'yargs'
import { whopshipClient, type EnvVar, type CreateEnvVarRequest } from '~/lib/whopship-client.ts'
import { loadAppConfig } from '~/lib/config.ts'

// Parse .env file content
function parseEnvFile(content: string): Record<string, string> {
	const env: Record<string, string> = {}
	const lines = content.split('\n')

	for (const line of lines) {
		const trimmed = line.trim()
		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith('#')) continue

		const eqIndex = trimmed.indexOf('=')
		if (eqIndex === -1) continue

		const key = trimmed.slice(0, eqIndex).trim()
		let value = trimmed.slice(eqIndex + 1).trim()

		// Remove surrounding quotes if present
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}

		env[key] = value
	}

	return env
}

// Generate .env file content
function generateEnvFile(vars: EnvVar[], existingContent?: string): string {
	const lines: string[] = []

	// Preserve existing comments and structure if available
	if (existingContent) {
		const existingLines = existingContent.split('\n')
		for (const line of existingLines) {
			const trimmed = line.trim()
			if (trimmed.startsWith('#') || trimmed === '') {
				lines.push(line)
			}
		}
	} else {
		lines.push('# Environment variables managed by WhopShip')
		lines.push('# Synced with: whopctl env pull')
		lines.push('')
	}

	// Add variables
	for (const v of vars) {
		// Quote values that contain special characters
		const needsQuotes = v.value.includes(' ') || v.value.includes('\n') || v.value.includes('"')
		const value = needsQuotes ? `"${v.value.replace(/"/g, '\\"')}"` : v.value
		lines.push(`${v.key}=${value}`)
	}

	return lines.join('\n') + '\n'
}

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

// List command
const listCommand: CommandModule<object, { path: string }> = {
	command: 'list [path]',
	describe: 'List environment variables',
	builder: (yargs) =>
		yargs.positional('path', {
			describe: 'Path to the Whop app directory',
			type: 'string',
			default: '.',
		}),
	handler: async (args) => {
		const spinner = ora('Fetching environment variables...').start()

		try {
			const appId = await getAppId(args.path)
			const vars = await whopshipClient.listEnvVars(appId)

			spinner.stop()

			if (vars.length === 0) {
				console.log(chalk.yellow('No environment variables found.'))
				console.log(chalk.dim('Add one with: whopctl env set KEY=value'))
				return
			}

			console.log(chalk.bold('\nEnvironment Variables\n'))

			for (const v of vars) {
				const flags: string[] = []
				if (v.exposeToBuild) flags.push(chalk.blue('build'))
				if (v.isSensitive) flags.push(chalk.yellow('sensitive'))
				const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : ''

				console.log(`  ${chalk.cyan(v.key)}=${chalk.dim(v.value)}${flagStr}`)
			}

			console.log()
		} catch (error) {
			spinner.fail('Failed to fetch environment variables')
			throw error
		}
	},
}

// Set command
const setCommand: CommandModule<object, { path: string; keyValue: string; build: boolean; sensitive: boolean }> = {
	command: 'set <keyValue> [path]',
	describe: 'Set an environment variable (KEY=value)',
	builder: (yargs) =>
		yargs
			.positional('keyValue', {
				describe: 'Environment variable in KEY=value format',
				type: 'string',
				demandOption: true,
			})
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			})
			.option('build', {
				describe: 'Expose this variable to the build process',
				type: 'boolean',
				alias: 'b',
				default: false,
			})
			.option('sensitive', {
				describe: 'Mark as sensitive (masked in logs)',
				type: 'boolean',
				alias: 's',
				default: true,
			}),
	handler: async (args) => {
		const eqIndex = args.keyValue.indexOf('=')
		if (eqIndex === -1) {
			console.error(chalk.red('Error: Invalid format. Use KEY=value'))
			process.exit(1)
		}

		const key = args.keyValue.slice(0, eqIndex)
		const value = args.keyValue.slice(eqIndex + 1)

		if (!key) {
			console.error(chalk.red('Error: Key cannot be empty'))
			process.exit(1)
		}

		const spinner = ora(`Setting ${key}...`).start()

		try {
			const appId = await getAppId(args.path)

			// Try to create, if already exists, update
			try {
				await whopshipClient.createEnvVar(appId, {
					key,
					value,
					exposeToBuild: args.build,
					isSensitive: args.sensitive,
				})
				spinner.succeed(chalk.green(`Created ${chalk.cyan(key)}`))
			} catch (error) {
				if (error instanceof Error && error.message.includes('already exists')) {
					await whopshipClient.updateEnvVar(appId, key, {
						value,
						exposeToBuild: args.build,
						isSensitive: args.sensitive,
					})
					spinner.succeed(chalk.green(`Updated ${chalk.cyan(key)}`))
				} else {
					throw error
				}
			}
		} catch (error) {
			spinner.fail(`Failed to set ${key}`)
			throw error
		}
	},
}

// Delete command
const deleteCommand: CommandModule<object, { path: string; key: string }> = {
	command: 'delete <key> [path]',
	describe: 'Delete an environment variable',
	aliases: ['rm', 'remove'],
	builder: (yargs) =>
		yargs
			.positional('key', {
				describe: 'Environment variable key to delete',
				type: 'string',
				demandOption: true,
			})
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			}),
	handler: async (args) => {
		const spinner = ora(`Deleting ${args.key}...`).start()

		try {
			const appId = await getAppId(args.path)
			await whopshipClient.deleteEnvVar(appId, args.key)
			spinner.succeed(chalk.green(`Deleted ${chalk.cyan(args.key)}`))
		} catch (error) {
			spinner.fail(`Failed to delete ${args.key}`)
			throw error
		}
	},
}

// Push command - push local .env to WhopShip
const pushCommand: CommandModule<object, { path: string; file: string; force: boolean }> = {
	command: 'push [path]',
	describe: 'Push local .env file to WhopShip',
	builder: (yargs) =>
		yargs
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			})
			.option('file', {
				describe: 'Path to .env file (relative to app directory)',
				type: 'string',
				alias: 'f',
				default: '.env',
			})
			.option('force', {
				describe: 'Overwrite existing variables without confirmation',
				type: 'boolean',
				default: false,
			}),
	handler: async (args) => {
		const envPath = join(args.path, args.file)

		// Check if file exists
		try {
			await access(envPath)
		} catch {
			console.error(chalk.red(`Error: ${args.file} not found in ${args.path}`))
			process.exit(1)
		}

		const spinner = ora(`Reading ${args.file}...`).start()

		try {
			const content = await readFile(envPath, 'utf-8')
			const envVars = parseEnvFile(content)
			const keys = Object.keys(envVars)

			if (keys.length === 0) {
				spinner.warn('No variables found in .env file')
				return
			}

			spinner.text = `Pushing ${keys.length} variables...`

			const appId = await getAppId(args.path)

			// Prepare variables for bulk upload
			const variables: CreateEnvVarRequest[] = keys.map((key) => ({
				key,
				value: envVars[key],
				exposeToBuild: key.startsWith('NEXT_PUBLIC_'), // Auto-expose NEXT_PUBLIC_ vars
				isSensitive: !key.startsWith('NEXT_PUBLIC_'), // Non-public vars are sensitive
			}))

			const result = await whopshipClient.bulkSetEnvVars(appId, variables)

			spinner.succeed(chalk.green(`Pushed ${result.processed} variables`))

			// Show results summary
			const created = result.results.filter((r) => r.status === 'created').length
			const updated = result.results.filter((r) => r.status === 'updated').length
			const failed = result.results.filter((r) => r.status === 'failed')

			if (created > 0) console.log(chalk.dim(`  Created: ${created}`))
			if (updated > 0) console.log(chalk.dim(`  Updated: ${updated}`))
			if (failed.length > 0) {
				console.log(chalk.red(`  Failed: ${failed.length}`))
				for (const f of failed) {
					console.log(chalk.red(`    - ${f.key}: ${f.message}`))
				}
			}
		} catch (error) {
			spinner.fail('Failed to push environment variables')
			throw error
		}
	},
}

// Pull command - pull WhopShip env vars to local .env
const pullCommand: CommandModule<object, { path: string; file: string; overwrite: boolean }> = {
	command: 'pull [path]',
	describe: 'Pull environment variables from WhopShip to local .env file',
	builder: (yargs) =>
		yargs
			.positional('path', {
				describe: 'Path to the Whop app directory',
				type: 'string',
				default: '.',
			})
			.option('file', {
				describe: 'Path to .env file (relative to app directory)',
				type: 'string',
				alias: 'f',
				default: '.env.local',
			})
			.option('overwrite', {
				describe: 'Overwrite existing .env file',
				type: 'boolean',
				default: false,
			}),
	handler: async (args) => {
		const envPath = join(args.path, args.file)
		const spinner = ora('Fetching environment variables...').start()

		try {
			const appId = await getAppId(args.path)
			const vars = await whopshipClient.listEnvVars(appId)

			if (vars.length === 0) {
				spinner.warn('No environment variables found on WhopShip')
				return
			}

			spinner.text = `Writing ${vars.length} variables to ${args.file}...`

			// Read existing file content if it exists
			let existingContent: string | undefined
			try {
				existingContent = await readFile(envPath, 'utf-8')
			} catch {
				// File doesn't exist, that's fine
			}

			const content = generateEnvFile(vars, args.overwrite ? undefined : existingContent)
			await writeFile(envPath, content, 'utf-8')

			spinner.succeed(chalk.green(`Pulled ${vars.length} variables to ${args.file}`))
			console.log(chalk.dim(`\n  Note: Sensitive values are masked. Update manually if needed.`))
		} catch (error) {
			spinner.fail('Failed to pull environment variables')
			throw error
		}
	},
}

// Main env command group
export const envCommands: CommandModule<object, object> = {
	command: 'env',
	describe: 'Manage environment variables',
	builder: (yargs) =>
		yargs
			.command(listCommand)
			.command(setCommand)
			.command(deleteCommand)
			.command(pushCommand)
			.command(pullCommand)
			.demandCommand(1, 'You must specify a subcommand'),
	handler: () => {
		// This won't be called due to demandCommand
	},
}

export default envCommands

