import { stdin, stdout } from 'node:process'
import * as readline from 'node:readline/promises'
import { isInReplMode } from './repl-context.ts'
import { getReplServer } from './repl-state.ts'

/**
 * Prompts the user for input in a REPL-aware way.
 *
 * This function works correctly in both REPL and CLI modes:
 * - In REPL mode: Temporarily overrides the REPL's eval function to capture input
 * - In CLI mode: Uses standard readline interface
 *
 * This avoids all stdin conflicts by using the REPL's own input mechanism.
 *
 * @param question The question/prompt to display to the user
 * @returns Promise that resolves with the user's input
 */
export async function promptUser(question: string): Promise<string> {
	if (isInReplMode()) {
		const replServer = getReplServer()
		if (!replServer) {
			throw new Error('REPL server not available')
		}

		// Write the question to output
		replServer.output.write(question)

		// Return a promise that resolves when user enters input
		return new Promise((resolve) => {
			// Store the original eval function
			const originalEval = replServer.eval

			// Temporarily override eval to capture the next line of input
			replServer.eval = (cmd, _context, _filename, callback) => {
				// Immediately restore the original eval
				replServer.eval = originalEval

				// Extract the input, removing any wrapping parentheses
				const input = cmd
					.toString()
					.trim()
					.replace(/^\(|\)$/g, '')

				// Resolve the promise with the input
				resolve(input)

				// Complete the eval callback
				callback(null, undefined)
			}
		})
	} else {
		// Standard readline for CLI mode
		const rl = readline.createInterface({
			input: stdin,
			output: stdout,
		})

		try {
			const answer = await rl.question(question)
			return answer
		} finally {
			rl.close()
		}
	}
}
