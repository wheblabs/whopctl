import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import chalk from 'chalk'
import { printError, printInfo, printSuccess, printWarning } from './output.ts'
import { WhopshipAPI } from './whopship-api.ts'

const whoplabsDir = join(homedir(), '.whoplabs')
const aliasesPath = join(whoplabsDir, 'aliases.json')

export interface ProjectAlias {
	name: string
	appId: string
	appName?: string
	subdomain?: string
	createdAt: string
	lastUsed?: string
}

export interface AliasConfig {
	aliases: Record<string, ProjectAlias>
	version: string
}

export class AliasManager {
	private config: AliasConfig | null = null

	constructor() {
		// Ensure config directory exists
		try {
			if (!existsSync(whoplabsDir)) {
				mkdir(whoplabsDir, { recursive: true })
			}
		} catch (error) {
			// Ignore errors, will handle when needed
		}
	}

	/**
	 * Load aliases from disk
	 */
	private async loadConfig(): Promise<AliasConfig> {
		if (this.config) {
			return this.config
		}

		try {
			const content = await readFile(aliasesPath, 'utf-8')
			this.config = JSON.parse(content)
		} catch (error) {
			// File doesn't exist or is invalid, create default config
			this.config = {
				aliases: {},
				version: '1.0.0'
			}
		}

		return this.config
	}

	/**
	 * Save aliases to disk
	 */
	private async saveConfig(): Promise<void> {
		if (!this.config) return

		try {
			await writeFile(aliasesPath, JSON.stringify(this.config, null, 2), 'utf-8')
		} catch (error) {
			throw new Error(`Failed to save aliases: ${error}`)
		}
	}

	/**
	 * Add or update an alias
	 */
	async setAlias(name: string, appId: string, appName?: string, subdomain?: string): Promise<void> {
		// Validate alias name
		if (!this.isValidAliasName(name)) {
			throw new Error('Alias name must contain only letters, numbers, hyphens, and underscores')
		}

		// Validate app ID format
		if (!appId.startsWith('app_')) {
			throw new Error('App ID must start with "app_"')
		}

		const config = await this.loadConfig()
		
		const alias: ProjectAlias = {
			name,
			appId,
			appName,
			subdomain,
			createdAt: new Date().toISOString(),
			lastUsed: new Date().toISOString()
		}

		config.aliases[name] = alias
		await this.saveConfig()
	}

	/**
	 * Get an alias by name
	 */
	async getAlias(name: string): Promise<ProjectAlias | null> {
		const config = await this.loadConfig()
		const alias = config.aliases[name]
		
		if (alias) {
			// Update last used timestamp
			alias.lastUsed = new Date().toISOString()
			await this.saveConfig()
		}
		
		return alias || null
	}

	/**
	 * Remove an alias
	 */
	async removeAlias(name: string): Promise<boolean> {
		const config = await this.loadConfig()
		
		if (config.aliases[name]) {
			delete config.aliases[name]
			await this.saveConfig()
			return true
		}
		
		return false
	}

	/**
	 * List all aliases
	 */
	async listAliases(): Promise<ProjectAlias[]> {
		const config = await this.loadConfig()
		return Object.values(config.aliases).sort((a, b) => 
			new Date(b.lastUsed || b.createdAt).getTime() - new Date(a.lastUsed || a.createdAt).getTime()
		)
	}

	/**
	 * Resolve a project identifier to an app ID
	 */
	async resolveProjectId(identifier: string): Promise<{ appId: string; source: 'alias' | 'direct' | 'env' }> {
		// If it's already an app ID, return it
		if (identifier.startsWith('app_')) {
			return { appId: identifier, source: 'direct' }
		}

		// Try to resolve from alias
		const alias = await this.getAlias(identifier)
		if (alias) {
			return { appId: alias.appId, source: 'alias' }
		}

		// If no identifier provided, try to read from .env
		if (!identifier) {
			try {
				const envPath = join(process.cwd(), '.env')
				const content = await readFile(envPath, 'utf-8')
				
				for (const line of content.split('\n')) {
					const trimmed = line.trim()
					if (trimmed.startsWith('NEXT_PUBLIC_WHOP_APP_ID=')) {
						const appId = trimmed.split('=')[1]?.trim().replace(/['"]/g, '')
						if (appId && appId.startsWith('app_')) {
							return { appId, source: 'env' }
						}
					}
				}
			} catch {
				// Ignore .env read errors
			}
		}

		throw new Error(`Project "${identifier}" not found. Use an app ID (app_xxx) or create an alias.`)
	}

	/**
	 * Auto-discover and suggest aliases for apps
	 */
	async suggestAliases(api: WhopshipAPI): Promise<{ name: string; appId: string; appName: string }[]> {
		try {
			// This would require an API endpoint to list user's apps
			// For now, return empty array
			return []
		} catch {
			return []
		}
	}

	/**
	 * Validate alias name format
	 */
	private isValidAliasName(name: string): boolean {
		return /^[a-zA-Z0-9_-]+$/.test(name) && name.length >= 2 && name.length <= 50
	}

	/**
	 * Display aliases in a formatted table
	 */
	async displayAliases(): Promise<void> {
		const aliases = await this.listAliases()

		if (aliases.length === 0) {
			console.log()
			printInfo('No project aliases configured.')
			console.log()
			console.log(chalk.dim('Create an alias with:'))
			console.log(chalk.dim('  whopctl alias set my-project app_abc123'))
			console.log()
			return
		}

		console.log()
		console.log(chalk.bold('📋 Project Aliases'))
		console.log(chalk.gray('─'.repeat(80)))
		console.log()

		// Table header
		console.log(
			chalk.bold(
				`${'Name'.padEnd(20)} ${'App ID'.padEnd(25)} ${'App Name'.padEnd(20)} ${'Last Used'.padEnd(12)}`
			)
		)
		console.log(chalk.gray('─'.repeat(80)))

		for (const alias of aliases) {
			const name = chalk.cyan(alias.name.padEnd(20))
			const appId = chalk.dim(alias.appId.padEnd(25))
			const appName = (alias.appName || 'Unknown').padEnd(20)
			const lastUsed = alias.lastUsed ? 
				this.formatRelativeTime(alias.lastUsed).padEnd(12) : 
				chalk.dim('Never'.padEnd(12))

			console.log(`${name} ${appId} ${appName} ${lastUsed}`)
		}

		console.log()
		console.log(chalk.dim(`Total: ${aliases.length} alias${aliases.length !== 1 ? 'es' : ''}`))
		console.log()
	}

	/**
	 * Format relative time
	 */
	private formatRelativeTime(dateString: string): string {
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
}

// Singleton instance
export const aliasManager = new AliasManager()
