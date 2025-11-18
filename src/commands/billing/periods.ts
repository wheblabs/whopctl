import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printTable } from '../../lib/output.ts'
import { whopshipApi } from '../../lib/whopship-api.ts'

interface BillingPeriod {
	id: number
	userId: number
	periodStart: string
	periodEnd: string
	totalCost: string
	status: string
	invoiceId: string | null
	metadata: {
		plan?: string
		baseCost?: number
		overageCost?: number
	}
	createdAt: string
	updatedAt: string
}

interface BillingPeriodsResponse {
	periods: BillingPeriod[]
}

/**
 * Handles the "billing periods" command.
 * 
 * Lists billing periods (invoices).
 */
export async function billingPeriodsCommand(limit?: number): Promise<void> {
	requireAuth()

	try {
		printInfo('Fetching billing periods...')

		const response = (await whopshipApi.getBillingPeriods(limit)) as BillingPeriodsResponse

		if (response.periods.length === 0) {
			printInfo('No billing periods found.')
			return
		}

		console.log('')
		printSuccess(`Billing Periods (${response.periods.length})`)
		console.log('')

		const tableData = response.periods.map((period) => {
			const startDate = new Date(period.periodStart).toLocaleDateString()
			const endDate = new Date(period.periodEnd).toLocaleDateString()
			const cost = parseFloat(period.totalCost).toFixed(2)
			
			return {
				Period: `${startDate} - ${endDate}`,
				Status: period.status,
				Plan: period.metadata?.plan || 'N/A',
				Cost: `$${cost}`,
				Invoice: period.invoiceId || 'N/A',
			}
		})

		printTable(tableData)
		console.log('')
	} catch (error) {
		printError('Failed to fetch billing periods')
		if (error instanceof Error) {
			printError(error.message)
		}
		process.exit(1)
	}
}

