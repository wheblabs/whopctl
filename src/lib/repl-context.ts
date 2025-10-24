/**
 * Global context for tracking REPL mode.
 *
 * This module provides a way to detect if commands are being run
 * in REPL mode vs. normal CLI mode, so we can adjust behavior
 * (e.g., not calling process.exit() in REPL mode).
 */

let isReplMode = false

/**
 * Sets whether the CLI is currently in REPL mode.
 *
 * @param value true if in REPL mode, false otherwise
 */
export function setReplMode(value: boolean): void {
	isReplMode = value
}

/**
 * Checks if the CLI is currently in REPL mode.
 *
 * @returns true if in REPL mode, false otherwise
 */
export function isInReplMode(): boolean {
	return isReplMode
}
