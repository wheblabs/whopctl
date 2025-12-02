import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'

/**
 * Collection of helpful tips to show users
 */
const TIPS: Array<{ id: string; text: string; context?: string[] }> = [
	{
		id: 'deploy-shortcut',
		text: 'Use "whopctl d" as a shortcut for "whopctl deploy"',
		context: ['deploy'],
	},
	{
		id: 'status-shortcut',
		text: 'Use "whopctl s" as a shortcut for "whopctl status"',
		context: ['status'],
	},
	{
		id: 'open-app',
		text: 'Use "whopctl open" to quickly view your deployed app in the browser',
		context: ['deploy', 'status'],
	},
	{
		id: 'doctor-check',
		text: 'Run "whopctl doctor" to diagnose issues with your setup',
		context: ['error', 'failed'],
	},
	{
		id: 'logs-follow',
		text: 'Use "whopctl builds logs --follow" to stream logs in real-time',
		context: ['logs', 'builds'],
	},
	{
		id: 'init-setup',
		text: 'Use "whopctl init" to set up a new project quickly',
		context: ['init', 'new'],
	},
	{
		id: 'docs-help',
		text: 'Run "whopctl docs" to open documentation in your browser',
		context: ['help', 'error'],
	},
	{
		id: 'standalone-config',
		text: 'Make sure your next.config.js has output: "standalone" for deployment',
		context: ['deploy', 'build'],
	},
	{
		id: 'env-check',
		text: 'Double-check your .env has NEXT_PUBLIC_WHOP_APP_ID and NEXT_PUBLIC_WHOP_COMPANY_ID',
		context: ['deploy', 'init'],
	},
	{
		id: 'local-test',
		text: 'Always test locally with "npm run build" before deploying',
		context: ['deploy', 'build'],
	},
]

interface TipsState {
	shownTips: string[]
	lastShown: number
}

const TIPS_FILE = join(homedir(), '.whopctl', 'tips.json')
const TIPS_COOLDOWN = 1000 * 60 * 5 // 5 minutes between tips

/**
 * Load tips state from disk
 */
async function loadTipsState(): Promise<TipsState> {
	try {
		const content = await readFile(TIPS_FILE, 'utf-8')
		return JSON.parse(content)
	} catch {
		return { shownTips: [], lastShown: 0 }
	}
}

/**
 * Save tips state to disk
 */
async function saveTipsState(state: TipsState): Promise<void> {
	try {
		await mkdir(join(homedir(), '.whopctl'), { recursive: true })
		await writeFile(TIPS_FILE, JSON.stringify(state, null, 2))
	} catch {
		// Ignore errors saving tips state
	}
}

/**
 * Get a random tip, optionally filtered by context
 */
export async function getRandomTip(context?: string): Promise<string | null> {
	const state = await loadTipsState()

	// Check cooldown
	if (Date.now() - state.lastShown < TIPS_COOLDOWN) {
		return null
	}

	// Filter tips by context and not shown
	let availableTips = TIPS.filter((tip) => !state.shownTips.includes(tip.id))

	// If context provided, prefer contextual tips
	if (context) {
		const contextualTips = availableTips.filter((tip) =>
			tip.context?.some((c) => context.toLowerCase().includes(c.toLowerCase())),
		)
		if (contextualTips.length > 0) {
			availableTips = contextualTips
		}
	}

	// If no tips available, reset and start over
	if (availableTips.length === 0) {
		state.shownTips = []
		availableTips = TIPS
	}

	// Pick a random tip
	const tip = availableTips[Math.floor(Math.random() * availableTips.length)]
	if (!tip) return null

	// Save state
	state.shownTips.push(tip.id)
	state.lastShown = Date.now()
	await saveTipsState(state)

	return tip.text
}

/**
 * Show a tip to the user
 */
export async function showTip(context?: string): Promise<void> {
	const tip = await getRandomTip(context)
	if (tip) {
		console.log()
		console.log(chalk.dim('💡 Tip: ') + chalk.cyan(tip))
	}
}

/**
 * Force show a specific tip (bypasses cooldown)
 */
export function showTipSync(text: string): void {
	console.log()
	console.log(chalk.dim('💡 Tip: ') + chalk.cyan(text))
}
