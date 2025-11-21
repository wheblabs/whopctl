# Whopctl

The command-line interface for WhopShip. Build, deploy, and manage your Whop Apps directly from your terminal.

## The WhopShip Workflow

Experience a Vercel-like workflow for your Whop Apps.

### 1. Deploy
Deploy your app with a single command. `whopctl` automatically detects your app configuration from `.env`, builds your project, and pushes it to the edge.

```bash
whopctl deploy
```

**Output:**
```
✓ Deployment complete!

Production: https://my-app.whopship.app
Build ID:   build_xyz123
Status:     BUILT
```

### 2. Check Status & Logs
Monitor your build progress and view runtime logs.

```bash
# Check status
whopctl status

# Follow logs
whopctl status --logs --follow
```

### 3. View Usage
Check real-time analytics for your current project without leaving your terminal.

```bash
whopctl usage
```

### 4. Rollback
Instantly revert to a previous build if something goes wrong.

```bash
whopctl redeploy <build-id>
```

## Installation

```bash
npm install -g @whoplabs/whopctl
# or
bun install -g @whoplabs/whopctl
```

## Authentication

Login with your Whop account:

```bash
whopctl login
```

## All Commands

### Apps & Builds
- `deploy` - Deploy the current app
- `status` - Check deployment status
- `redeploy <buildId>` - Rollback/Redeploy a specific build
- `apps list` - List all your apps

### Analytics & Billing
- `usage` - View usage analytics (context-aware)
- `billing current` - Check current billing period
- `billing history` - View past invoices

## Configuration

The CLI connects to `https://api.whopship.app` by default.

For local development:
```bash
export WHOPSHIP_API_URL=http://localhost:3001
```
