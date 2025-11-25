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

### Analytics

#### `whopctl analytics usage`

Get usage data for a time period.

```bash
./dist/index.js analytics usage
./dist/index.js analytics usage --app-id 123
./dist/index.js analytics usage --start-date 2024-01-01 --end-date 2024-01-31
```

Options:
- `--app-id`: Filter by app ID
- `--start-date`: Start date in ISO format (defaults to 30 days ago)
- `--end-date`: End date in ISO format (defaults to today)

#### `whopctl analytics summary`

Get usage summary for a specific month.

```bash
./dist/index.js analytics summary
./dist/index.js analytics summary --app-id 123
./dist/index.js analytics summary --month 2024-01
```

Options:
- `--app-id`: Filter by app ID
- `--month`: Month in YYYY-MM format (defaults to current month)

### Billing

#### `whopctl billing current`

Get current period usage and cost.

```bash
./dist/index.js billing current
./dist/index.js billing current --app-id 123
```

Options:
- `--app-id`: Filter by app ID

#### `whopctl billing history`

Get usage history for the last N months.

```bash
./dist/index.js billing history
./dist/index.js billing history --app-id 123 --months 12
```

Options:
- `--app-id`: Filter by app ID
- `--months`: Number of months to show (default: 6)

#### `whopctl billing periods`

List billing periods (invoices).

```bash
./dist/index.js billing periods
./dist/index.js billing periods --limit 24
```

Options:
- `--limit`: Number of periods to show (default: 12)

### Tier Management

#### `whopctl tier current`

Show current pricing tier and limits.

```bash
./dist/index.js tier current
```

#### `whopctl tier update <tier>`

Update your pricing tier.

```bash
./dist/index.js tier update hobby
./dist/index.js tier update pro
```

Available tiers: `free`, `hobby`, `pro`

#### `whopctl tier upgrade <tier>`

Upgrade your pricing tier.

```bash
./dist/index.js tier upgrade hobby
./dist/index.js tier upgrade pro
```

#### `whopctl tier downgrade <tier>`

Downgrade your pricing tier.

```bash
./dist/index.js tier downgrade hobby
./dist/index.js tier downgrade free
```

### Configuration

The CLI uses the `WHOPSHIP_API_URL` environment variable to determine the WhopShip API endpoint. Defaults to `http://localhost:3000` if not set.

```bash
export WHOPSHIP_API_URL=https://api.whopship.com
./dist/index.js analytics usage
```

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
│   ├── whopship-api.ts  # WhopShip API client
│   ├── auth-guard.ts    # Authentication check helper
│   └── output.ts        # Formatted output helpers
├── commands/
│   ├── login.ts         # Login command handler
│   ├── apps/
│   │   ├── list.ts      # List apps command
│   │   └── deploy.ts    # Deploy app command
│   ├── analytics/
│   │   ├── usage.ts     # Usage analytics command
│   │   └── summary.ts   # Usage summary command
│   ├── billing/
│   │   ├── current.ts   # Current usage command
│   │   ├── history.ts   # Usage history command
│   │   └── periods.ts  # Billing periods command
│   └── tier/
│       ├── current.ts   # Current tier command
│       ├── update.ts    # Update tier command
│       ├── upgrade.ts   # Upgrade tier command
│       └── downgrade.ts # Downgrade tier command
└── types/
    └── index.ts         # Shared TypeScript types
```

### Key Components

**Whop Client (`src/lib/whop.ts`)**
- Shared instance of `@whoplabs/whop-client`
- Automatically loads sessions from `~/.whoplabs/whop-session.json`
- Handles token refresh automatically

**WhopShip API Client (`src/lib/whopship-api.ts`)**
- Client for WhopShip API endpoints
- Reads Whop session tokens and converts them to WhopShip API headers
- Configurable API URL via `WHOPSHIP_API_URL` environment variable

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
~/.whoplabs/whop-session.json
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
rm ~/.whoplabs/whop-session.json
```

## WhopShip API Integration

The CLI integrates with the WhopShip API for analytics and billing features. The API URL can be configured via the `WHOPSHIP_API_URL` environment variable:

```bash
export WHOPSHIP_API_URL=https://api.whopship.com
```

If not set, defaults to `http://localhost:3000` for local development.

All analytics and billing commands require:
1. Authentication with Whop (via `whopctl login`)
2. The WhopShip API to be running and accessible
3. Your Whop account to be registered in the WhopShip system

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

