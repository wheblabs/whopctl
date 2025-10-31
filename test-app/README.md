# WhopCTL Test App

A simple Next.js app for testing WhopShip deployments via the `whopctl` CLI.

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your Whop credentials:
- `WHOP_APP_ID`: Your Whop app ID
- `WHOP_API_KEY`: Your Whop API key (if needed)

### 3. Configure Deployment

The `whopship.config.json` file contains deployment configuration:

```json
{
  "whopAppId": "app_test123",
  "subdomain": "test-app",
  "env": {
    "NODE_ENV": "production"
  }
}
```

Update `whopAppId` with your actual Whop app ID.

## Development

Run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Building Locally

Test the OpenNext build process:

```bash
bun run deploy
```

This runs `npx @opennextjs/cloudflare build` which creates a `.open-next/` directory with:
- `worker/index.js` - Cloudflare Worker script
- `assets/` - Static assets
- `middleware/` - Middleware (if any)

## Deploying to WhopShip

### Prerequisites

1. **Authenticate with Whop:**
   ```bash
   whopctl login
   ```

2. **Ensure your app exists in Whop:**
   - Create an app in the [Whop Developer Dashboard](https://whop.com/developers)
   - Note the app ID (e.g., `app_abc123`)

### Deploy

From this directory, run:

```bash
whopctl deploy app_test123
```

Or use the config file (no app ID needed):

```bash
whopctl deploy
```

### What Happens

1. **Build**: CLI builds the app locally with OpenNext
2. **Artifact**: CLI creates a deployment artifact (zip file)
3. **Upload**: CLI uploads artifact to S3
4. **Deploy**: WhopShip deploys to AWS Lambda
5. **Live**: Your app is accessible at `https://test-app.whopship.app`

### Expected Output

```
✓ Authenticated
⚙ Building with OpenNext Cloudflare adapter...
✓ Build completed (45.2s)
✓ Artifact created: 5.2 MB
⚙ Creating deployment on WhopShip...
✓ Deployment created: 123
⚙ Uploading artifact...
✓ Uploaded successfully
⚙ Triggering deployment...
✓ Deployment triggered
⚙ Monitoring progress...
  Status: building
  Status: deploying
  Status: active
✅ Deployment complete!
🌐 https://test-app.whopship.app
```

## App Structure

```
test-app/
├── app/
│   ├── about/
│   │   └── page.tsx          # About page
│   ├── api/
│   │   └── hello/
│   │       └── route.ts      # API route example
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Home page
├── next.config.js
├── package.json
├── whopship.config.json      # Deployment config
└── .env.example              # Environment template
```

## Troubleshooting

### Build Fails

If `npx @opennextjs/cloudflare build` fails:

1. Check that Next.js version is compatible (≥14.0.0)
2. Ensure `@opennextjs/cloudflare` is installed
3. Check that `next.config.js` is valid

### Deployment Fails

If deployment fails:

1. Check authentication: `whopctl login`
2. Verify app exists in Whop dashboard
3. Check deployment logs: `whopctl logs <deployment-id>`
4. Ensure you have sufficient AWS resources

### App Not Accessible

If the deployed app isn't accessible:

1. Wait a few minutes for DNS propagation
2. Check deployment status: `whopctl status <deployment-id>`
3. Verify subdomain in WhopShip dashboard
4. Check Lambda function logs in AWS console

## Next Steps

- Add Whop authentication to your app
- Configure environment variables
- Set up custom domain
- Enable monitoring and logging
- Implement CI/CD pipeline

## Resources

- [WhopShip Documentation](https://docs.whopship.com)
- [WhopCTL CLI Guide](../README.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [OpenNext Cloudflare Adapter](https://opennext.js.org/cloudflare)
