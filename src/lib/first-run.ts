import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'

interface FirstRunState {
	hasSeenWelcome: boolean
	firstRun: string
	version: string
}

const STATE_FILE = join(homedir(), '.whopctl', 'state.json')

/**
 * Get the current CLI version
 */
function getVersion(): string {
	// We can't easily read package.json at runtime with bundled CLI
	// Just use a placeholder that gets replaced at build time or hardcode
	return '1.7.0'
}

/**
 * Load first-run state from disk
 */
async function loadState(): Promise<FirstRunState | null> {
	try {
		const content = await readFile(STATE_FILE, 'utf-8')
		return JSON.parse(content)
	} catch {
		return null
	}
}

/**
 * Save first-run state to disk
 */
async function saveState(state: FirstRunState): Promise<void> {
	try {
		await mkdir(join(homedir(), '.whopctl'), { recursive: true })
		await writeFile(STATE_FILE, JSON.stringify(state, null, 2))
	} catch {
		// Ignore errors
	}
}

/**
 * Check if this is the user's first time running the CLI
 */
export async function isFirstRun(): Promise<boolean> {
	const state = await loadState()
	return state === null
}

/**
 * Mark that the user has seen the welcome message
 */
export async function markWelcomeSeen(): Promise<void> {
	const state = await loadState()
	await saveState({
		hasSeenWelcome: true,
		firstRun: state?.firstRun || new Date().toISOString(),
		version: getVersion(),
	})
}

/**
 * Display welcome message for first-time users
 */
export function showWelcomeMessage(): void {
	console.log()
	console.log(chalk.bold.cyan('🚀 Welcome to WhopShip CLI!'))
	console.log(chalk.gray('─'.repeat(50)))
	console.log()
	console.log('WhopShip makes it easy to deploy your Whop apps.')
	console.log()
	console.log(chalk.bold('Quick Start:'))
	console.log()
	console.log(chalk.cyan('  1. Set up your project'))
	console.log(chalk.dim('     whopctl init'))
	console.log()
	console.log(chalk.cyan('  2. Log in to your account'))
	console.log(chalk.dim('     whopctl login'))
	console.log()
	console.log(chalk.cyan('  3. Deploy your app'))
	console.log(chalk.dim('     whopctl deploy'))
	console.log()
	console.log(chalk.gray('─'.repeat(50)))
	console.log()
	console.log(chalk.bold('Helpful Commands:'))
	console.log()
	console.log(`  ${chalk.cyan('whopctl init')}     Set up a new project`)
	console.log(`  ${chalk.cyan('whopctl doctor')}   Diagnose issues`)
	console.log(`  ${chalk.cyan('whopctl status')}   Check deployment status`)
	console.log(`  ${chalk.cyan('whopctl docs')}     Open documentation`)
	console.log()
	console.log(chalk.dim('Run "whopctl --help" for all commands.'))
	console.log()
}

/**
 * Check and show welcome message if first run
 */
export async function checkFirstRun(): Promise<void> {
	if (await isFirstRun()) {
		showWelcomeMessage()
		await markWelcomeSeen()
	}
}
