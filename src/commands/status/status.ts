import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { requireAuth } from '../../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printWarning } from '../../lib/output.ts'
import { whop } from '../../lib/whop.ts'
import { WhopshipAPI } from '../../lib/whopship-api.ts'

/**
 * Simple .env reader
 */
async function readEnvFile(dir: string): Promise<Record<string, string>> {
  const envPath = resolve(dir, '.env')
  const content = await readFile(envPath, 'utf-8')
  const env: Record<string, string> = {}
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    const [key, ...valueParts] = trimmed.split('=')
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').trim()
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key.trim()] = value
    }
  }
  
  return env
}

/**
 * Format status with color
 */
function formatStatus(status: string): string {
  const colors: Record<string, (text: string) => string> = {
    init: chalk.gray,
    uploading: chalk.blue,
    uploaded: chalk.cyan,
    queued: chalk.yellow,
    building: chalk.yellow,
    built: chalk.green,
    failed: chalk.red,
  }
  const colorFn = colors[status] || chalk.white
  return colorFn(status.toUpperCase())
}

/**
 * Check deployment status for the current app
 */
export async function statusCommand(path: string = '.'): Promise<void> {
  requireAuth()
  const targetDir = resolve(process.cwd(), path)
  
  try {
    // 1. Read .env
    const env = await readEnvFile(targetDir)
    const appId = env.NEXT_PUBLIC_WHOP_APP_ID
    
    if (!appId) {
      printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
      process.exit(1)
    }
    
    // 2. Get session
    const session = whop.getTokens()
    if (!session) {
      printError('No session found. Please run "whopctl login" first.')
      process.exit(1)
    }
    
    const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)
    
    // 3. Fetch latest build
    printInfo(`Fetching latest build for app ${appId}...`)
    const build = await api.getLatestBuildForApp(appId)
    
    // 4. Display status
    console.log()
    printSuccess('📦 Latest Build Status')
    console.log()
    console.log(`  App:        ${chalk.bold(build.app.whop_app_name)} (${build.app.whop_app_id})`)
    console.log(`  Subdomain:  ${build.app.subdomain}`)
    console.log(`  Build ID:   ${build.build_id}`)
    console.log(`  Status:     ${formatStatus(build.status)}`)
    console.log(`  Created:    ${build.created_at.toLocaleString()}`)
    console.log(`  Updated:    ${build.updated_at.toLocaleString()}`)
    console.log()
    
    if (build.error_message) {
      printError(`Error: ${build.error_message}`)
      console.log()
    }
    
    if (build.build_log_url) {
      printInfo(`Logs: ${build.build_log_url}`)
    }
    
    if (build.artifacts) {
      printSuccess(`✓ Artifacts available at: ${build.artifacts.s3_bucket}/${build.artifacts.s3_key}`)
    }
    
  } catch (error) {
    printError(`Failed to get status: ${error}`)
    process.exit(1)
  }
}