# Whopctl CLI Usage Guide

A command-line interface for managing Whop apps.

## Installation

```bash
# Install dependencies
bun install

# Build the CLI
bun run build
```

## Commands

### Authentication

#### `whopctl login`

Authenticate with your Whop account using email and OTP (one-time password).

```bash
./dist/index.js login
```

The CLI will:
1. Prompt for your email address
2. Send an OTP code to your email
3. Prompt for the OTP code
4. Save your session to `~/.config/whopctl/session.json`

Once authenticated, your session will be automatically loaded for future commands.

### App Management

#### `whopctl apps list`

List all apps across your owned companies.

```bash
./dist/index.js apps list
```

This command displays:
- App ID
- App Name
- Company Name
- DAU (Daily Active Users)
- WAU (Weekly Active Users)
- MAU (Monthly Active Users)

**Note:** You must be authenticated to use this command.

#### `whopctl apps deploy <appId>`

Deploy an app (placeholder for v0).

```bash
./dist/index.js apps deploy app_xxx
```

**Note:** This is a placeholder command in v0. The deployment functionality is coming soon.

### Help

View available commands and options:

```bash
./dist/index.js --help
./dist/index.js apps --help
```

## Architecture

### File Structure

```
src/
├── index.ts              # Main entry with yargs setup
├── lib/
│   ├── whop.ts          # Shared Whop client instance
│   ├── auth-guard.ts    # Authentication check helper
│   └── output.ts        # Formatted output helpers
├── commands/
│   ├── login.ts         # Login command handler
│   └── apps/
│       ├── list.ts      # List apps command
│       └── deploy.ts    # Deploy app command (placeholder)
└── types/
    └── index.ts         # Shared TypeScript types
```

### Key Components

**Whop Client (`src/lib/whop.ts`)**
- Shared instance of `@whoplabs/whop-client`
- Automatically loads sessions from `~/.config/whopctl/session.json`
- Handles token refresh automatically

**Auth Guard (`src/lib/auth-guard.ts`)**
- Checks if user is authenticated before running commands
- Provides helpful error messages if not authenticated

**Output Helpers (`src/lib/output.ts`)**
- `printError()` - Red error messages
- `printSuccess()` - Green success messages
- `printInfo()` - Blue informational messages
- `printWarning()` - Yellow warning messages
- `printTable()` - Formatted table output
- `printWhopError()` - Handles Whop SDK errors with actionable guidance

### Error Handling

The CLI handles various error types from the Whop SDK:

- **WhopAuthError**: Authentication issues (invalid OTP, missing session)
- **WhopHTTPError**: HTTP errors with status codes
- **WhopNetworkError**: Network/fetch failures
- **WhopAPIError**: GraphQL API errors

Each error type provides actionable guidance to help users resolve issues.

## Development

### Building

```bash
bun run build
```

This compiles TypeScript and outputs to `dist/index.js` with the proper shebang for CLI execution.

### Linting

```bash
bun run lint
```

### Formatting

```bash
bun run format
```

## Session Management

Authentication sessions are stored at:
```
~/.config/whopctl/session.json
```

This file contains:
- Access token
- CSRF token
- Refresh token
- User ID
- Session metadata

The file is automatically created with `chmod 0600` permissions for security.

To logout, simply delete this file:
```bash
rm ~/.config/whopctl/session.json
```

## Next Steps (Post-v0)

- [ ] Implement actual deployment functionality
- [ ] Add app creation command
- [ ] Add app update command
- [ ] Add company management commands
- [ ] Add experience management commands
- [ ] Add access pass/plan management
- [ ] Add environment variable override for session path
- [ ] Add `--json` flag for machine-readable output
- [ ] Add pagination for large app lists
- [ ] Add filtering/search capabilities

