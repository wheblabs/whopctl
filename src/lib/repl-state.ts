import type repl from 'node:repl'

/**
 * Global state for the REPL server instance.
 * This allows commands to access the REPL server for custom input handling.
 */
let replServerInstance: repl.REPLServer | null = null

/**
 * Sets the global REPL server instance.
 * Called when the REPL starts.
 */
export function setReplServer(server: repl.REPLServer): void {
	replServerInstance = server
}

/**
 * Gets the global REPL server instance.
 * Used by repl-prompt.ts to provide REPL-aware user input.
 */
export function getReplServer(): repl.REPLServer | null {
	return replServerInstance
}

