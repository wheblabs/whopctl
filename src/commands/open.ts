import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { printError, printInfo, printSuccess, printWarning } from '../lib/output.ts'
import { requireAuth } from '../lib/auth-guard.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'

const execAsync = promisify(exec)

/**
 * Open a URL in the default browser
 */
async function openInBrowser(url: string): Promise<boolean> {
	try {
		const platform = process.platform
		let command: string

		if (platform === 'darwin') {
			command = `open "${url}"`
		} else if (platform === 'win32') {
			command = `start "" "${url}"`
		} else {
			// Linux/Unix
			command = `xdg-open "${url}"`
		}

		await execAsync(command)
		return true
	} catch {
		return false
	}
}

/**
 * Read app ID from .env file
 */
async function getAppIdFromEnv(dir: string): Promise<string | null> {
	try {
		const envContent = await readFile(join(dir, '.env'), 'utf-8')
		for (const line of envContent.split('\n')) {
			const trimmed = line.trim()
			if (trimmed.startsWith('NEXT_PUBLIC_WHOP_APP_ID=')) {
				return trimmed.split('=')[1]?.replace(/^["']|["']$/g, '') || null
			}
		}
	} catch {
		// File doesn't exist
	}
	return null
}

/**
 * Get deployed app URL from WhopShip API
 */
async function getDeployedUrl(api: WhopshipAPI, appId: string): Promise<string | null> {
	try {
		const apps = await api.getApps()
		const app = apps.apps.find((a: any) => a.whop_app_id === appId)
		if (app && app.subdomain) {
			return `https://${app.subdomain}.whopship.app`
		}
	} catch {
		// Failed to fetch
	}
	return null
}

type OpenTarget = 'app' | 'dashboard' | 'logs' | 'settings' | 'billing'

/**
 * Open command - quick access to URLs
 */
export async function openCommand(
	target: OpenTarget = 'app',
	path: string = '.',
): Promise<void> {
	const targetDir = resolve(process.cwd(), path)

	console.log()

	// Dashboard, billing don't require auth
	if (target === 'dashboard') {
		const url = 'https://whop.com/apps'
		printInfo(`Opening Whop dashboard...`)
		const success = await openInBrowser(url)
		if (success) {
			printSuccess(`Opened: ${url}`)
		} else {
			printWarning(`Could not open browser. Please visit:`)
			console.log(chalk.cyan(`  ${url}`))
		}
		return
	}

	if (target === 'billing') {
		requireAuth()
		const session = whop.getTokens()
		if (!session) {
			printError('Not logged in. Run: whopctl login')
			return
		}

		const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
			uidToken: session.uidToken,
			ssk: session.ssk,
			userId: session.userId,
		})

		try {
			const billing = await api.getBillingInfo()
			const url = billing.manage_url || 'https://whop.com/settings/billing'
			printInfo(`Opening billing portal...`)
			const success = await openInBrowser(url)
			if (success) {
				printSuccess(`Opened: ${url}`)
			} else {
				printWarning(`Could not open browser. Please visit:`)
				console.log(chalk.cyan(`  ${url}`))
			}
		} catch {
			const url = 'https://whop.com/settings/billing'
			printInfo(`Opening billing page...`)
			await openInBrowser(url)
		}
		return
	}

	// For app, logs, settings - we need app ID
	const appId = await getAppIdFromEnv(targetDir)

	if (!appId) {
		printError('Could not find NEXT_PUBLIC_WHOP_APP_ID in .env')
		console.log()
		printInfo('Make sure you have a .env file with your App ID.')
		printInfo('Run: whopctl init to set up your project.')
		return
	}

	requireAuth()
	const session = whop.getTokens()
	if (!session) {
		printError('Not logged in. Run: whopctl login')
		return
	}

	const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken, {
		uidToken: session.uidToken,
		ssk: session.ssk,
		userId: session.userId,
	})

	let url: string

	switch (target) {
		case 'app': {
			const deployedUrl = await getDeployedUrl(api, appId)
			if (deployedUrl) {
				url = deployedUrl
				printInfo(`Opening your deployed app...`)
			} else {
				printWarning('No deployed app found.')
				printInfo('Deploy your app first: whopctl deploy')
				return
			}
			break
		}
		case 'logs': {
			// Open the latest build logs in the CLI (we could also link to a web UI)
			url = `https://whop.com/apps/${appId}`
			printInfo(`Opening app page (for logs, use: whopctl status)...`)
			break
		}
		case 'settings': {
			url = `https://whop.com/apps/${appId}/settings`
			printInfo(`Opening app settings...`)
			break
		}
		default:
			printError(`Unknown target: ${target}`)
			return
	}

	const success = await openInBrowser(url)
	if (success) {
		printSuccess(`Opened: ${url}`)
	} else {
		printWarning(`Could not open browser. Please visit:`)
		console.log(chalk.cyan(`  ${url}`))
	}
	console.log()
}

