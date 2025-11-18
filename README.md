# Whopctl CLI

A command-line interface for managing Whop apps and WhopShip deployments.

## Features

- **Authentication**: Login with Whop account using email/OTP
- **App Management**: List and deploy Whop apps
- **Analytics**: View usage analytics and summaries
- **Billing**: Check current usage, history, and billing periods
- **Tier Management**: View and manage pricing tiers
- **Build Management**: List builds, view logs, redeploy
- **Interactive REPL**: Command-line interface with auto-completion

## Installation

```bash
# Install from npm (once published)
npm install -g whopctl

# Or using bun
bun install -g whopctl
```

## Quick Start

```bash
# Login with your Whop account
whopctl login

# List your apps
whopctl apps list

# View analytics
whopctl analytics usage

# Check billing
whopctl billing current
```

## Development

For local development:

```bash
# Install dependencies
bun install

# Build the CLI
bun run build

# Run locally
./dist/index.js login
```

## Commands

### Authentication
- `login` - Authenticate with Whop account
- `logout` - Clear authentication session
- `auth check` - Check authentication status

### Apps
- `apps list` - List all your apps
- `apps deploy <appId>` - Deploy an app

### Analytics
- `analytics usage` - Get usage data for a time period
- `analytics summary` - Get usage summary for a month

### Billing
- `billing current` - Get current period usage
- `billing history` - Get usage history
- `billing periods` - List billing periods

### Tier Management
- `tier current` - Show current tier
- `tier update <tier>` - Update tier
- `tier upgrade <tier>` - Upgrade tier
- `tier downgrade <tier>` - Downgrade tier

See [USAGE.md](./USAGE.md) for detailed command documentation.

## Configuration

The CLI connects to the WhopShip API at `https://api.whopship.com` by default.

For local development, you can override the API URL using the `WHOPSHIP_API_URL` environment variable:

```bash
export WHOPSHIP_API_URL=http://localhost:3000
```

This allows you to test against a local API server during development.

## TODOS

- Show which apps are managed by whopctl
- Add JSON output format
- Add pagination for large lists
