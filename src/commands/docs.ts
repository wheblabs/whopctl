import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { printInfo, printSuccess, printWarning } from '../lib/output.ts'

const execAsync = promisify(exec)

/**
 * Documentation URLs
 */
const DOCS_URLS: Record<string, { url: string; description: string }> = {
	main: {
		url: 'https://docs.whopship.app',
		description: 'WhopShip documentation home',
	},
	deploy: {
		url: 'https://docs.whopship.app/deploy',
		description: 'Deployment guide',
	},
	errors: {
		url: 'https://docs.whopship.app/troubleshooting',
		description: 'Troubleshooting common errors',
	},
	api: {
		url: 'https://docs.whopship.app/api',
		description: 'API reference',
	},
	nextjs: {
		url: 'https://docs.whopship.app/frameworks/nextjs',
		description: 'Next.js setup guide',
	},
	env: {
		url: 'https://docs.whopship.app/configuration/environment',
		description: 'Environment variables',
	},
	billing: {
		url: 'https://docs.whopship.app/billing',
		description: 'Billing and pricing',
	},
	cli: {
		url: 'https://docs.whopship.app/cli',
		description: 'CLI reference',
	},
	quickstart: {
		url: 'https://docs.whopship.app/quickstart',
		description: 'Quick start guide',
	},
}

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

type DocsTopic =
	| 'main'
	| 'deploy'
	| 'errors'
	| 'api'
	| 'nextjs'
	| 'env'
	| 'billing'
	| 'cli'
	| 'quickstart'

/**
 * Docs command - open documentation
 */
export async function docsCommand(topic: DocsTopic = 'main'): Promise<void> {
	console.log()

	// If just 'docs', show available topics
	if (!topic || topic === 'main') {
		console.log(chalk.bold.cyan('📚 WhopShip Documentation'))
		console.log(chalk.gray('─'.repeat(50)))
		console.log()
		console.log(chalk.bold('Available topics:'))
		console.log()

		for (const [key, { description }] of Object.entries(DOCS_URLS)) {
			if (key === 'main') continue
			console.log(`  ${chalk.cyan(`whopctl docs ${key}`)}`)
			console.log(chalk.dim(`  ${description}`))
			console.log()
		}

		console.log(chalk.gray('─'.repeat(50)))
		console.log()

		printInfo('Opening main documentation...')
		const { url } = DOCS_URLS.main
		const success = await openInBrowser(url)
		if (success) {
			printSuccess(`Opened: ${url}`)
		} else {
			printWarning(`Could not open browser. Please visit:`)
			console.log(chalk.cyan(`  ${url}`))
		}
		return
	}

	// Open specific topic
	const docInfo = DOCS_URLS[topic]
	if (!docInfo) {
		printWarning(`Unknown topic: ${topic}`)
		console.log()
		console.log(chalk.bold('Available topics:'))
		for (const key of Object.keys(DOCS_URLS)) {
			if (key !== 'main') {
				console.log(chalk.cyan(`  ${key}`))
			}
		}
		return
	}

	printInfo(`Opening ${docInfo.description}...`)
	const success = await openInBrowser(docInfo.url)
	if (success) {
		printSuccess(`Opened: ${docInfo.url}`)
	} else {
		printWarning(`Could not open browser. Please visit:`)
		console.log(chalk.cyan(`  ${docInfo.url}`))
	}
	console.log()
}
