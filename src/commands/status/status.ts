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
 * Format log line with colors
 */
function formatLogLine(line: string): string {
  // Check for common log patterns and colorize
  const lowerLine = line.toLowerCase()
  
  if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('✗')) {
    return chalk.red(line)
  }
  if (lowerLine.includes('warning') || lowerLine.includes('warn') || lowerLine.includes('⚠')) {
    return chalk.yellow(line)
  }
  if (lowerLine.includes('success') || lowerLine.includes('complete') || lowerLine.includes('✓')) {
    return chalk.green(line)
  }
  if (lowerLine.includes('info') || lowerLine.includes('ℹ')) {
    return chalk.blue(line)
  }
  
  return line
}

/**
 * Display build logs
 */
async function displayLogs(
  api: WhopshipAPI,
  buildId: string,
  options: { lines: number; follow: boolean },
): Promise<void> {
  let lastLogCount = 0
  
  const fetchAndDisplayLogs = async (): Promise<{ logs: string[]; status: string }> => {
    try {
      const logsResponse = (await api.getBuildLogs(buildId)) as {
        logs: string[]
        status: string
      }
      
      if (logsResponse.logs && logsResponse.logs.length > 0) {
        // Show only new logs if following
        const logsToShow = options.follow
          ? logsResponse.logs.slice(lastLogCount)
          : logsResponse.logs.slice(-options.lines)
        
        for (const log of logsToShow) {
          console.log(formatLogLine(log))
        }
        
        lastLogCount = logsResponse.logs.length
      }
      
      return { logs: logsResponse.logs || [], status: logsResponse.status }
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        return { logs: [], status: 'unknown' }
      }
      throw error
    }
  }
  
  // Initial fetch
  const initialResult = await fetchAndDisplayLogs()
  
  if (initialResult.logs.length === 0 && !options.follow) {
    printInfo('No logs available yet. Build may still be in queue.')
    return
  }
  
  // Follow mode: poll for updates
  if (options.follow) {
    const activeStatuses = ['init', 'uploading', 'uploaded', 'queued', 'building']
    
    if (!activeStatuses.includes(initialResult.status)) {
      // Build is complete, no need to follow
      return
    }
    
    console.log()
    printInfo('Following logs... (Press Ctrl+C to stop)')
    console.log()
    
    // Handle Ctrl+C gracefully
    let interrupted = false
    const interruptHandler = () => {
      interrupted = true
      console.log()
      printInfo('Stopped following logs.')
      process.exit(0)
    }
    process.on('SIGINT', interruptHandler)
    
    try {
      while (!interrupted) {
        await new Promise((resolve) => setTimeout(resolve, 2500)) // Poll every 2.5 seconds
        
        const result = await fetchAndDisplayLogs()
        
        // Exit if build is complete
        if (!activeStatuses.includes(result.status)) {
          console.log()
          printInfo(`Build status changed to ${result.status}. Stopping follow mode.`)
          break
        }
      }
    } finally {
      process.removeListener('SIGINT', interruptHandler)
    }
  }
}

/**
 * Check deployment status for the current app
 */
export async function statusCommand(
  path: string = '.',
  options: { showLogs?: boolean; follow?: boolean; lines?: number } = {},
): Promise<void> {
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
    
    // Show deployment URLs if built
    if (build.status === 'built') {
      const normalizedSubdomain = build.app.subdomain.toLowerCase()
      const appUrl = `https://${normalizedSubdomain}.whopship.app`
      
      console.log(chalk.bold.cyan('🌐 Deployed App URL:'))
      console.log(chalk.cyan(`   ${appUrl}`))
      console.log()
      console.log(chalk.dim('To use this app in Whop:'))
      console.log(chalk.dim(`   1. Go to https://whop.com/apps/${build.app.whop_app_id}/settings`))
      console.log(chalk.dim(`   2. Set the App URL to: ${appUrl}`))
      console.log(chalk.dim(`   3. Install the app in your company to test`))
      console.log()
      console.log(chalk.yellow('📋 View runtime logs:'))
      console.log(chalk.dim(`   whopctl logs app ${build.app.whop_app_id}`))
      console.log()
    }
    
    // Show hint for active/failed builds
    if ((build.status === 'building' || build.status === 'failed') && !options.showLogs) {
      console.log(chalk.yellow('💡 Tip: Run `whopctl status --logs` to view build logs'))
      console.log()
    }
    
    if (build.error_message) {
      printError(`Error: ${build.error_message}`)
      console.log()
    }
    
    if (build.build_log_url && !options.showLogs) {
      printInfo(`Logs: ${build.build_log_url}`)
    }
    
    if (build.artifacts) {
      printSuccess(`✓ Artifacts available at: ${build.artifacts.s3_bucket}/${build.artifacts.s3_key}`)
    }
    
    // Display logs if requested
    if (options.showLogs) {
      console.log()
      printInfo('📋 Build Logs')
      console.log()
      await displayLogs(api, build.build_id, {
        lines: options.lines || 30,
        follow: options.follow || false,
      })
      console.log()
    }
    
  } catch (error) {
    printError(`Failed to get status: ${error}`)
    process.exit(1)
  }
}