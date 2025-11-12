import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, writeFile, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { create as createTar} from 'tar'
import { requireAuth } from '../lib/auth-guard.ts'
import { printError, printInfo, printSuccess, printWarning } from '../lib/output.ts'
import { whop } from '../lib/whop.ts'
import { WhopshipAPI } from '../lib/whopship-api.ts'

/**
 * Create tar.gz archive of the project
 */
async function createArchive(dir: string): Promise<{ path: string; sha256: string }> {
  const tarPath = join(dir, '.whopctl-build.tar')
  const gzPath = join(dir, '.whopctl-build.tar.gz')

  printInfo('Creating tar archive...')
  
  // Create tar (exclude common directories)
  await createTar(
    {
      gzip: false,
      file: tarPath,
      cwd: dir,
      filter: (path) => {
        const excluded = ['node_modules', '.next', '.git', '.whopctl-build.tar', '.whopctl-build.tar.gz']
        return !excluded.some(e => path.includes(e))
      }
    },
    ['.'] // Archive everything from current directory
  )

  printInfo('Compressing with gzip...')
  
  // Compress with gzip (fastest for upload + build-runner expectations)
  await pipeline(
    createReadStream(tarPath),
    createGzip({ level: 1 }), // prioritize speed over ratio
    createWriteStream(gzPath)
  )

  // Calculate SHA256
  printInfo('Calculating SHA256...')
  const fileBuffer = await readFile(gzPath)
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex')
  
  // Clean up tar file
  await unlink(tarPath)
  
  const stats = await stat(gzPath)
  printSuccess(`✓ Archive created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
  
  return { path: gzPath, sha256 }
}

/**
 * Upload archive to S3
 */
async function uploadToS3(filePath: string, uploadUrl: string, sha256: string): Promise<void> {
  printInfo('Uploading to S3...')
  
  const fileBuffer = await readFile(filePath)
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: fileBuffer,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${await response.text()}`)
  }
  
  printSuccess('✓ Upload complete')
}

/**
 * Reads environment variables from .env file
 */
async function readEnvFile(dir: string): Promise<Record<string, string>> {
  const envPath = resolve(dir, '.env')
  
  try {
    const content = await readFile(envPath, 'utf-8')
    const env: Record<string, string> = {}
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue
      
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        // Remove quotes if present
        let value = valueParts.join('=').trim()
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key.trim()] = value
      }
    }
    
    return env
  } catch (error) {
    throw new Error(`Failed to read .env file at ${envPath}: ${error}`)
  }
}

/**
 * Ensure Next.js config has standalone output
 */
async function ensureStandaloneOutput(dir: string): Promise<void> {
  const configPath = join(dir, 'next.config.js')
  const configTsPath = join(dir, 'next.config.ts')
  
  // Try both .js and .ts
  let configFile = configPath
  try {
    await readFile(configTsPath)
    configFile = configTsPath
  } catch {
    // Use .js
  }
  
  try {
    let config = await readFile(configFile, 'utf-8')
    
    // Check if standalone is already configured
    if (config.includes("output: 'standalone'") || config.includes('output: "standalone"')) {
      printInfo('✓ Next.js already configured for standalone output')
      return
    }
    
    // Add standalone output
    printInfo('Adding standalone output to Next.js config...')
    
    // Simple regex replacement - add output to nextConfig
    config = config.replace(
      /const nextConfig\s*=\s*{/,
      "const nextConfig = {\n  output: 'standalone',"
    )
    
    await writeFile(configFile, config)
    printSuccess('✓ Updated Next.js config for standalone build')
  } catch (error) {
    printWarning('Could not update Next.js config - ensure output: "standalone" is set manually')
  }
}

/**
 * Handles the "deploy" command.
 * Initiates a deployment by sending source to the whopship API.
 *
 * @param path Optional path to the project directory (defaults to current directory)
 */
export async function deployCommand(path: string = '.'): Promise<void> {
  requireAuth()
  const targetDir = resolve(process.cwd(), path)
  
  try {
    printInfo(`Deploying from: ${targetDir}`)
    
    // 1. Read .env
    printInfo('Reading configuration from .env...')
    const env = await readEnvFile(targetDir)
    
    const appId = env.NEXT_PUBLIC_WHOP_APP_ID
    const companyId = env.NEXT_PUBLIC_WHOP_COMPANY_ID
    
    if (!appId || !companyId) {
      printError('Missing NEXT_PUBLIC_WHOP_APP_ID or NEXT_PUBLIC_WHOP_COMPANY_ID in .env')
      process.exit(1)
    }
    
    printSuccess(`✓ App ID: ${appId}`)
    printInfo(`  Company ID: ${companyId}`)

    // Ensure Next.js is configured for standalone output
    await ensureStandaloneOutput(targetDir)
    
    // 2. Create archive
    const { path: archivePath, sha256 } = await createArchive(targetDir)
    printInfo(`  Source SHA256: ${sha256}`)
    
    // 3. Get presigned URL
    const session = whop.getTokens()
    if (!session) {
      printError('No session found. Please run "whopctl login" first.')
      process.exit(1)
    }
    
    const api = new WhopshipAPI(session.accessToken, session.refreshToken, session.csrfToken)
    
    printInfo('\nInitializing deployment...')
    const response = await api.deployInit({
      whop_app_id: appId,
      whop_app_company_id: companyId,
      source_sha256: sha256,
    })
    
    printSuccess('✓ Deployment initialized')
    printInfo(`  Build ID: ${response.build_id}`)
    
    // 4. Upload to S3
    await uploadToS3(archivePath, response.upload.url, sha256)

    // 5. Clean up archive
    await unlink(archivePath)

    // 6. Mark upload as complete
    printInfo('Finalizing deployment...')
    const completeResponse = await api.deployComplete(response.build_id)
    printSuccess(`✓ Build marked as ${completeResponse.status}`)

    printSuccess('\n✓ Deployment complete!')
    printInfo(`\nBuild ID: ${response.build_id}`)
    printInfo(`Status: ${response.status_url}`)
    printInfo('\nRun `whopctl status` to check build progress')
  } catch (error) {
    printError(`Deployment failed: ${error}`)
    process.exit(1)
  }
}