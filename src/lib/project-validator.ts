import { readFile, stat, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import chalk from 'chalk'
import { printError, printInfo, printSuccess, printWarning } from './output.ts'

export interface ValidationResult {
	isValid: boolean
	errors: string[]
	warnings: string[]
	suggestions: string[]
	projectType: 'nextjs' | 'react' | 'node' | 'unknown'
}

export interface ProjectValidatorOptions {
	checkEnv?: boolean
	checkPackageJson?: boolean
	checkNextConfig?: boolean
	checkBuildScript?: boolean
	verbose?: boolean
}

export class ProjectValidator {
	private projectPath: string
	private options: ProjectValidatorOptions

	constructor(projectPath: string, options: ProjectValidatorOptions = {}) {
		this.projectPath = resolve(projectPath)
		this.options = {
			checkEnv: true,
			checkPackageJson: true,
			checkNextConfig: true,
			checkBuildScript: true,
			verbose: false,
			...options,
		}
	}

	async validate(): Promise<ValidationResult> {
		const result: ValidationResult = {
			isValid: true,
			errors: [],
			warnings: [],
			suggestions: [],
			projectType: 'unknown',
		}

		if (this.options.verbose) {
			printInfo(`Validating project at: ${this.projectPath}`)
		}

		// Check if directory exists
		try {
			await stat(this.projectPath)
		} catch {
			result.errors.push('Project directory does not exist')
			result.isValid = false
			return result
		}

		// Validate package.json
		if (this.options.checkPackageJson) {
			await this.validatePackageJson(result)
		}

		// Validate .env file
		if (this.options.checkEnv) {
			await this.validateEnvFile(result)
		}

		// Validate Next.js configuration
		if (this.options.checkNextConfig && result.projectType === 'nextjs') {
			await this.validateNextConfig(result)
		}

		// Check build script
		if (this.options.checkBuildScript) {
			await this.validateBuildScript(result)
		}

		// Additional framework-specific validations
		await this.validateFrameworkSpecific(result)

		result.isValid = result.errors.length === 0

		return result
	}

	private async validatePackageJson(result: ValidationResult): Promise<void> {
		const packageJsonPath = join(this.projectPath, 'package.json')

		try {
			const content = await readFile(packageJsonPath, 'utf-8')
			const packageJson = JSON.parse(content)

			// Determine project type
			if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
				result.projectType = 'nextjs'
			} else if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
				result.projectType = 'react'
			} else if (packageJson.dependencies?.express || packageJson.devDependencies?.express) {
				result.projectType = 'node'
			}

			// Check for required scripts
			if (!packageJson.scripts?.build) {
				result.errors.push('Missing "build" script in package.json')
				result.suggestions.push('Add a "build" script to your package.json')
			}

			// Next.js specific checks
			if (result.projectType === 'nextjs') {
				if (!packageJson.scripts?.start) {
					result.warnings.push('Missing "start" script - recommended for Next.js projects')
				}

				// Check Next.js version
				const nextVersion = packageJson.dependencies?.next || packageJson.devDependencies?.next
				if (nextVersion) {
					const majorVersion = parseInt(nextVersion.replace(/[^\d]/g, ''))
					if (majorVersion < 13) {
						result.warnings.push(`Next.js version ${nextVersion} is outdated. Consider upgrading to v13+`)
					}
				}
			}

			if (this.options.verbose) {
				printSuccess(`✓ package.json found (${result.projectType} project)`)
			}
		} catch (error) {
			if ((error as any).code === 'ENOENT') {
				result.errors.push('package.json not found')
				result.suggestions.push('Initialize your project with "npm init" or "yarn init"')
			} else {
				result.errors.push(`Invalid package.json: ${(error as Error).message}`)
			}
		}
	}

	private async validateEnvFile(result: ValidationResult): Promise<void> {
		const envPath = join(this.projectPath, '.env')
		const envLocalPath = join(this.projectPath, '.env.local')

		try {
			let envContent = ''
			let envFile = ''

			// Try .env first, then .env.local
			try {
				envContent = await readFile(envPath, 'utf-8')
				envFile = '.env'
			} catch {
				try {
					envContent = await readFile(envLocalPath, 'utf-8')
					envFile = '.env.local'
				} catch {
					result.errors.push('No .env or .env.local file found')
					result.suggestions.push('Create a .env file with your Whop app configuration')
					return
				}
			}

			// Parse environment variables
			const envVars: Record<string, string> = {}
			for (const line of envContent.split('\n')) {
				const trimmed = line.trim()
				if (!trimmed || trimmed.startsWith('#')) continue

				const [key, ...valueParts] = trimmed.split('=')
				if (key && valueParts.length > 0) {
					envVars[key.trim()] = valueParts.join('=').trim()
				}
			}

			// Check required variables
			const requiredVars = ['NEXT_PUBLIC_WHOP_APP_ID', 'NEXT_PUBLIC_WHOP_COMPANY_ID']
			const missingVars = requiredVars.filter(varName => !envVars[varName])

			if (missingVars.length > 0) {
				result.errors.push(`Missing required environment variables: ${missingVars.join(', ')}`)
				result.suggestions.push('Add the missing variables to your .env file')
			}

			// Check variable formats
			if (envVars.NEXT_PUBLIC_WHOP_APP_ID && !envVars.NEXT_PUBLIC_WHOP_APP_ID.startsWith('app_')) {
				result.warnings.push('NEXT_PUBLIC_WHOP_APP_ID should start with "app_"')
			}

			if (envVars.NEXT_PUBLIC_WHOP_COMPANY_ID && !envVars.NEXT_PUBLIC_WHOP_COMPANY_ID.startsWith('biz_')) {
				result.warnings.push('NEXT_PUBLIC_WHOP_COMPANY_ID should start with "biz_"')
			}

			if (this.options.verbose) {
				printSuccess(`✓ ${envFile} found with ${Object.keys(envVars).length} variables`)
			}
		} catch (error) {
			result.errors.push(`Error reading .env file: ${(error as Error).message}`)
		}
	}

	private async validateNextConfig(result: ValidationResult): Promise<void> {
		const configPaths = [
			join(this.projectPath, 'next.config.js'),
			join(this.projectPath, 'next.config.ts'),
			join(this.projectPath, 'next.config.mjs'),
		]

		let configFound = false
		let hasStandaloneOutput = false

		for (const configPath of configPaths) {
			try {
				const content = await readFile(configPath, 'utf-8')
				configFound = true

				// Check for standalone output
				if (content.includes("output: 'standalone'") || content.includes('output: "standalone"')) {
					hasStandaloneOutput = true
				}

				if (this.options.verbose) {
					printSuccess(`✓ Next.js config found: ${configPath}`)
				}
				break
			} catch {
				// Continue to next config file
			}
		}

		if (!configFound) {
			result.warnings.push('No Next.js config file found')
			result.suggestions.push('Consider creating a next.config.js file for better control')
		} else if (!hasStandaloneOutput) {
			result.warnings.push('Next.js config missing standalone output')
			result.suggestions.push('Add `output: "standalone"` to your Next.js config for optimal deployment')
		}
	}

	private async validateBuildScript(result: ValidationResult): Promise<void> {
		// Check if node_modules exists
		try {
			await stat(join(this.projectPath, 'node_modules'))
			if (this.options.verbose) {
				printSuccess('✓ node_modules directory found')
			}
		} catch {
			result.warnings.push('node_modules not found')
			result.suggestions.push('Run "npm install" or "yarn install" to install dependencies')
		}

		// Check for common build output directories
		const buildDirs = ['.next', 'dist', 'build']
		let hasBuildOutput = false

		for (const dir of buildDirs) {
			try {
				await stat(join(this.projectPath, dir))
				hasBuildOutput = true
				break
			} catch {
				// Continue checking
			}
		}

		if (!hasBuildOutput && result.projectType === 'nextjs') {
			result.suggestions.push('Run "npm run build" locally to test your build before deploying')
		}
	}

	private async validateFrameworkSpecific(result: ValidationResult): Promise<void> {
		if (result.projectType === 'nextjs') {
			// Check for app directory (App Router)
			try {
				await stat(join(this.projectPath, 'app'))
				if (this.options.verbose) {
					printInfo('✓ Next.js App Router detected')
				}
			} catch {
				// Check for pages directory (Pages Router)
				try {
					await stat(join(this.projectPath, 'pages'))
					if (this.options.verbose) {
						printInfo('✓ Next.js Pages Router detected')
					}
				} catch {
					result.warnings.push('No app/ or pages/ directory found')
					result.suggestions.push('Create an app/ directory for App Router or pages/ for Pages Router')
				}
			}

			// Check for public directory
			try {
				await stat(join(this.projectPath, 'public'))
				if (this.options.verbose) {
					printSuccess('✓ public/ directory found')
				}
			} catch {
				result.warnings.push('No public/ directory found')
				result.suggestions.push('Create a public/ directory for static assets')
			}
		}
	}

	async printValidationResults(result: ValidationResult): Promise<void> {
		console.log()
		console.log(chalk.bold('📋 Project Validation Results'))
		console.log(chalk.gray('─'.repeat(40)))

		if (result.isValid) {
			printSuccess(`✅ Project is ready for deployment (${result.projectType})`)
		} else {
			printError(`❌ Project has ${result.errors.length} error(s) that must be fixed`)
		}

		if (result.errors.length > 0) {
			console.log()
			console.log(chalk.bold.red('Errors:'))
			for (const error of result.errors) {
				console.log(chalk.red(`  ✗ ${error}`))
			}
		}

		if (result.warnings.length > 0) {
			console.log()
			console.log(chalk.bold.yellow('Warnings:'))
			for (const warning of result.warnings) {
				console.log(chalk.yellow(`  ⚠ ${warning}`))
			}
		}

		if (result.suggestions.length > 0) {
			console.log()
			console.log(chalk.bold.blue('Suggestions:'))
			for (const suggestion of result.suggestions) {
				console.log(chalk.blue(`  💡 ${suggestion}`))
			}
		}

		console.log()
	}
}

export async function validateProject(
	projectPath: string,
	options?: ProjectValidatorOptions
): Promise<ValidationResult> {
	const validator = new ProjectValidator(projectPath, options)
	return validator.validate()
}

export async function validateAndPrint(
	projectPath: string,
	options?: ProjectValidatorOptions
): Promise<boolean> {
	const validator = new ProjectValidator(projectPath, options)
	const result = await validator.validate()
	await validator.printValidationResults(result)
	return result.isValid
}
