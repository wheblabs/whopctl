#!/usr/bin/env node
import chalk from 'chalk'

async function main() {
	console.log('Hello, world!')
}

main().catch((err) => {
	console.error(chalk.red('Error:'), err)
	process.exit(1)
})
