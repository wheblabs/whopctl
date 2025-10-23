import { requireAuth } from '../../lib/auth-guard.ts'
import {
	printError,
	printInfo,
	printSuccess,
	printTable,
	printWhopError,
} from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'

/**
 * Interface for formatted app data displayed in the table.
 */
interface AppTableRow {
	'App ID': string
	Name: string
	Company: string
	DAU: number
	WAU: number
	MAU: number
}

/**
 * Handles the "apps list" command.
 *
 * This command:
 * 1. Fetches all companies owned by the authenticated user
 * 2. For each company, fetches all installed apps
 * 3. Displays the apps in a formatted table with usage statistics
 *
 * The table shows:
 * - App ID: Unique identifier for the app
 * - Name: App display name
 * - Company: Which company the app is installed on
 * - DAU/WAU/MAU: Daily/Weekly/Monthly Active Users - think this is some hallucinated bullshit tbh
 */
export async function listAppsCommand(): Promise<void> {
	// Ensure user is authenticated
	requireAuth()

	try {
		printInfo('Fetching your companies...')

		// Fetch all companies owned by the user
		const companies = await whop.companies.list()

		if (!companies || companies.length === 0) {
			printInfo('You do not own any companies yet.')
			printInfo('Create a company at https://whop.com/apps')
			return
		}

		printSuccess(`Found ${companies.length} company(ies)`)

		// Collect all apps from all companies
		const allApps: AppTableRow[] = []

		for (const company of companies) {
			printInfo(`Fetching apps for "${company.title}"...`)

			try {
				const apps = await whop.companies.listApps(company.id)

				if (apps && apps.length > 0) {
					for (const app of apps) {
						allApps.push({
							'App ID': app.id,
							Name: app.name,
							Company: company.title,
							DAU: app.dau ?? 0,
							WAU: app.wau ?? 0,
							MAU: app.mau ?? 0,
						})
					}
				}
			} catch (error) {
				printError(`Failed to fetch apps for company "${company.title}"`)
				printWhopError(error)
			}
		}

		// Display results
		if (allApps.length === 0) {
			printInfo('No apps found.')
			printInfo('Create an app at https://whop.com/apps')
		} else {
			console.log('') // Empty line for spacing
			printTable(allApps)
			console.log('') // Empty line for spacing
			printSuccess(`Total: ${allApps.length} app(s)`)
		}
	} catch (error) {
		printError('Failed to list apps')
		printWhopError(error)
		process.exit(1)
	}
}
