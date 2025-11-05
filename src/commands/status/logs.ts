import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { requireAuth } from '../../lib/auth-guard'
import { printError, printInfo } from '../../lib/output'
import { whop } from '../../lib/whop'
import { WhopshipAPI } from '../../lib/whopship-api'

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

export async function logsCommand(path: string = '.'): Promise<void> {
  requireAuth()
  const targetDir = resolve(process.cwd(), path)
  
  try {
    const env = await readEnvFile(targetDir)
    const appId = env.NEXT_PUBLIC_WHOP_APP_ID
    
    if (!appId) {
      printError('NEXT_PUBLIC_WHOP_APP_ID not found in .env file')
      process.exit(1)
    }
    
    const session = whop.getTokens()
    if (!session) {
      printError('No session found. Please run "whopctl login" first.')
      process.exit(1)
    }
    
    const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)
    
    printInfo(`Fetching logs for app ${appId}...`)
    const build = await api.getLatestBuildForApp(appId)
    
    console.log()
    printInfo(`Build ${build.build_id} - ${build.status.toUpperCase()}`)
    console.log()
    
    try {
      const logsResponse = await api.getBuildLogs(build.build_id) as { logs: string[] }
            
      if (logsResponse.logs && logsResponse.logs.length > 0) {
        for (const log of logsResponse.logs) {
          console.log(log)
        }
      } else {
        printInfo('No logs available yet. Build may still be in queue.')
      }
    } catch (error: any) {
      // Handle 404 or no logs gracefully
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        printInfo('No logs available yet. Build may still be in queue.')
      } else {
        throw error
      }
    }
    
  } catch (error) {
    printError(`Failed to get logs: ${error}`)
    process.exit(1)
  }
}