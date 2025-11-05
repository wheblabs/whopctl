# WhopShip CLI Integration Guide

This document provides all the information needed to integrate a CLI tool with the WhopShip API for deploying OpenNext applications.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Deployment Flow](#deployment-flow)
- [API Endpoints](#api-endpoints)
- [Artifact Format](#artifact-format)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

The WhopShip CLI is responsible for:

1. Building the Next.js app locally using OpenNext's Cloudflare adapter
2. Creating a deployment artifact (zip file)
3. Uploading the artifact to WhopShip's R2 storage
4. Triggering the deployment process
5. Monitoring deployment status and streaming logs

The WhopShip API handles:

1. Generating presigned upload URLs for R2
2. Enqueuing deployment jobs
3. Processing OpenNext artifacts
4. Deploying to Cloudflare Workers for Platforms
5. Managing subdomain routing

## Authentication

All API requests must include Whop authentication headers. The exact authentication mechanism depends on your Whop integration, but typically includes:

```http
Authorization: Bearer <whop_access_token>
```

Or Whop-specific headers:

```http
X-Whop-User-Id: <user_id>
X-Whop-Company-Id: <company_id>
```

**Note:** Consult the Whop authentication documentation for the exact headers required.

## Deployment Flow

### Step 1: Build Locally

```bash
# CLI runs OpenNext build
npx @opennextjs/cloudflare build
```

This creates a `.open-next/` directory with:
- `worker/index.js` - The Cloudflare Worker script
- `assets/` - Static assets (HTML, CSS, JS, images)
- `manifests/` - Routing and ISR configuration
- `middleware/` - Optional middleware

### Step 2: Create Artifact

Package the OpenNext output into a zip file:

```
artifact.zip
├── open-next/
│   ├── worker/
│   │   └── index.js
│   ├── assets/
│   │   ├── _next/
│   │   │   ├── static/
│   │   │   └── ...
│   │   ├── favicon.ico
│   │   └── ...
│   ├── manifests/
│   │   └── ...
│   └── middleware/
│       └── ...
└── meta.json
```

**meta.json format:**

```json
{
  "nextVersion": "14.0.0",
  "opennextVersion": "3.0.0",
  "wranglerVersion": "3.100.0",
  "nodeVersion": "20.0.0",
  "buildTime": 45000,
  "checksum": "sha256:abc123..."
}
```

### Step 3: Create Deployment

```http
POST /deployments
Content-Type: application/json

{
  "whopAppId": "app_123abc",
  "metadata": {
    "nextVersion": "14.0.0",
    "opennextVersion": "3.0.0",
    "wranglerVersion": "3.100.0",
    "nodeVersion": "20.0.0",
    "buildTime": 45000,
    "checksum": "sha256:abc123..."
  },
  "checksum": "sha256:abc123..."
}
```

**Response:**

```json
{
  "deployment": {
    "id": 123,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "appId": 456,
    "status": "pending",
    "metadata": {
      "nextVersion": "14.0.0",
      "opennextVersion": "3.0.0",
      "wranglerVersion": "3.100.0",
      "nodeVersion": "20.0.0",
      "buildTime": 45000,
      "checksum": "sha256:abc123..."
    },
    "artifactChecksum": "sha256:abc123...",
    "createdAt": "2025-01-24T12:00:00.000Z"
  },
  "uploadUrl": "https://whopship-builds.r2.cloudflarestorage.com/builds/123/artifact.zip?X-Amz-...",
  "uploadKey": "builds/123/artifact.zip",
  "instructions": {
    "method": "PUT",
    "url": "https://...",
    "note": "Upload your OpenNext build artifact (zip file) to this URL",
    "nextStep": "After upload, call POST /deployments/123/trigger to start the build"
  }
}
```

### Step 4: Upload Artifact

Upload the zip file to the presigned URL:

```bash
curl -X PUT \
  -H "Content-Type: application/zip" \
  --data-binary @artifact.zip \
  "https://whopship-builds.r2.cloudflarestorage.com/builds/123/artifact.zip?X-Amz-..."
```

**Important:**
- Use HTTP PUT method
- Set `Content-Type: application/zip`
- Upload the entire file as binary data
- The presigned URL expires in 1 hour
- No authentication headers needed (presigned URL includes credentials)

### Step 5: Trigger Deployment

```http
POST /deployments/123/trigger
```

**Response:**

```json
{
  "message": "Deployment triggered successfully",
  "deploymentId": 123,
  "status": "building"
}
```

### Step 6: Monitor Status

Poll the deployment status:

```http
GET /deployments/123
```

**Response:**

```json
{
  "deployment": {
    "id": 123,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "appId": 456,
    "status": "deploying",
    "metadata": { ... },
    "versionId": "version_abc123",
    "rolloutStage": "stage1_50",
    "workerName": "whopship-456-123",
    "createdAt": "2025-01-24T12:00:00.000Z",
    "logsUrl": "/deployments/123/logs"
  },
  "app": {
    "id": 456,
    "name": "My Next.js App",
    "subdomain": "my-app"
  },
  "url": null
}
```

**Status progression:**
- `pending` → Waiting for artifact upload
- `building` → Artifact uploaded, queued for processing
- `deploying` → Being deployed to Cloudflare (with rolloutStage)
- `active` → Live and accessible
- `failed` → Deployment failed (check logs)

**Rollout stages:**
- `stage1_50` → Deployed at 50% traffic
- `stage2_100` → Deployed at 100% traffic
- `complete` → Rollout finished

### Step 7: Stream Logs

Fetch deployment logs:

```http
GET /deployments/123/logs
```

**Response:** (text/plain)

```
[2025-01-24T12:00:00.000Z] Starting deployment 123 for app 456
[2025-01-24T12:00:01.000Z] Downloading build artifact from R2...
[2025-01-24T12:00:02.000Z] Downloaded artifact: 5.23 MB
[2025-01-24T12:00:03.000Z] Extracting artifact...
[2025-01-24T12:00:04.000Z] Extracted 1247 files from artifact
[2025-01-24T12:00:05.000Z] Parsing OpenNext build structure...
[2025-01-24T12:00:06.000Z] Found worker script at: open-next/worker/index.js
[2025-01-24T12:00:07.000Z] Found 234 static assets
[2025-01-24T12:00:08.000Z] Worker bundle size: 2.45 MB
[2025-01-24T12:00:09.000Z] Assets run_worker_first: true
[2025-01-24T12:00:10.000Z] Deploying to Cloudflare Workers for Platforms...
[2025-01-24T12:00:11.000Z] Uploading 234 static assets...
[2025-01-24T12:00:15.000Z] Worker deployed: whopship-456-123
[2025-01-24T12:00:16.000Z] Version ID: version_abc123
[2025-01-24T12:00:17.000Z] Starting two-stage rollout: 50% traffic...
[2025-01-24T12:00:18.000Z] Waiting 30 seconds before increasing to 100%...
[2025-01-24T12:00:48.000Z] Increasing to 100% traffic...
[2025-01-24T12:00:49.000Z] Updating KV mapping...
[2025-01-24T12:00:50.000Z] KV mapping set: my-app → whopship-456-123@version_abc123
[2025-01-24T12:00:51.000Z] Deployment completed successfully in 51.23s
```

**Note:** Logs may not be available immediately. Poll until they appear or status changes to `active` or `failed`.

## API Endpoints

### Base URL

```
https://api.whopship.com
```

Or your configured API endpoint.

### POST /deployments

Create a new deployment and get a presigned upload URL.

**Request:**

```typescript
interface CreateDeploymentRequest {
  whopAppId: string;           // Required: Whop app identifier
  uploadMethod?: 'direct' | 'presigned';  // Default: 'presigned'
  metadata?: {
    nextVersion?: string;
    opennextVersion?: string;
    wranglerVersion?: string;
    nodeVersion?: string;
    buildTime?: number;        // milliseconds
    checksum?: string;
  };
  checksum?: string;           // Artifact checksum for validation
}
```

**Response:**

```typescript
interface CreateDeploymentResponse {
  deployment: {
    id: number;
    uuid: string;
    appId: number;
    status: 'pending';
    metadata?: object;
    artifactChecksum?: string;
    createdAt: string;
  };
  uploadUrl: string;           // Presigned R2 URL (1 hour expiry)
  uploadKey: string;           // R2 object key
  instructions: {
    method: 'PUT';
    url: string;
    note: string;
    nextStep: string;
  };
}
```

**Status Codes:**
- `201` - Deployment created successfully
- `400` - Invalid request body
- `401` - Unauthorized (invalid Whop credentials)
- `403` - Forbidden (user doesn't own this app)
- `404` - App not found

### POST /deployments/:id/trigger

Trigger deployment processing after artifact upload.

**Parameters:**
- `id` (number) - Deployment ID

**Response:**

```typescript
interface TriggerDeploymentResponse {
  message: string;
  deploymentId: number;
  status: 'building';
}
```

**Status Codes:**
- `202` - Deployment triggered successfully
- `400` - Deployment already triggered or invalid status
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Deployment not found

### GET /deployments/:id

Get deployment status and details.

**Parameters:**
- `id` (number) - Deployment ID

**Response:**

```typescript
interface GetDeploymentResponse {
  deployment: {
    id: number;
    uuid: string;
    appId: number;
    status: 'pending' | 'building' | 'deploying' | 'active' | 'failed';
    metadata?: object;
    versionId?: string;
    rolloutStage?: 'stage1_50' | 'stage2_100' | 'complete';
    workerName?: string;
    errorMessage?: string;
    buildLogUrl?: string;
    createdAt: string;
    deployedAt?: string;
    logsUrl: string;           // Path to logs endpoint
  };
  app: {
    id: number;
    name: string;
    subdomain: string;
  };
  url: string | null;          // Live URL if status is 'active'
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Deployment not found

### GET /deployments/:id/logs

Fetch deployment build logs.

**Parameters:**
- `id` (number) - Deployment ID

**Response:**

Plain text log output with timestamps.

**Status Codes:**
- `200` - Success (returns text/plain)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Logs not found (may not be available yet)

### GET /apps/:appId/deployments

List all deployments for an app.

**Parameters:**
- `appId` (number) - App ID

**Response:**

```typescript
interface ListDeploymentsResponse {
  deployments: Array<{
    id: number;
    uuid: string;
    appId: number;
    status: string;
    versionId?: string;
    rolloutStage?: string;
    createdAt: string;
    deployedAt?: string;
  }>;
  app: {
    id: number;
    name: string;
    subdomain: string;
  };
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `403` - Forbidden
- `404` - App not found

## Artifact Format

### Directory Structure

```
artifact.zip
├── open-next/                 # or .open-next/
│   ├── worker/
│   │   └── index.js          # Required: Main worker script
│   ├── assets/               # Optional: Static assets
│   │   ├── _next/
│   │   │   ├── static/
│   │   │   │   └── chunks/
│   │   │   └── ...
│   │   ├── favicon.ico
│   │   └── ...
│   ├── manifests/            # Optional: Routing manifests
│   │   └── ...
│   └── middleware/           # Optional: Middleware
│       └── ...
└── meta.json                 # Required: Build metadata
```

### meta.json Schema

```json
{
  "nextVersion": "14.0.0",
  "opennextVersion": "3.0.0",
  "wranglerVersion": "3.100.0",
  "nodeVersion": "20.0.0",
  "buildTime": 45000,
  "checksum": "sha256:abc123..."
}
```

All fields are optional but recommended for debugging and reproducibility.

### Worker Script Requirements

- Must be valid JavaScript/ES Module
- Should export a default object with a `fetch` handler
- OpenNext Cloudflare adapter generates this automatically
- Maximum size: 10 MiB compressed

### Static Assets

- Stored in `open-next/assets/` or `.open-next/assets/`
- Served via Cloudflare Workers Static Assets
- Automatically cached at the edge
- No size limit on individual assets, but more assets = longer upload time

### Checksum Calculation

Calculate SHA-256 checksum of the zip file:

```bash
# macOS/Linux
shasum -a 256 artifact.zip

# Output format
sha256:abc123def456...
```

Include this in both the `metadata.checksum` and `checksum` fields.

## Error Handling

### Common Error Responses

**400 Bad Request**

```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "field": "whopAppId",
    "issue": "Required field missing"
  }
}
```

**401 Unauthorized**

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication credentials"
}
```

**403 Forbidden**

```json
{
  "error": "Forbidden",
  "message": "You do not have access to this app"
}
```

**404 Not Found**

```json
{
  "error": "Not Found",
  "message": "Deployment not found"
}
```

**409 Conflict**

```json
{
  "error": "Conflict",
  "message": "Deployment has already been triggered"
}
```

**500 Internal Server Error**

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

### Deployment Failures

When a deployment fails (status: `failed`), check the logs for details:

```http
GET /deployments/123/logs
```

Common failure reasons:

1. **Worker bundle too large (>10 MiB)**
   ```
   Worker bundle exceeds 10 MiB limit (12.45 MB).
   See https://developers.cloudflare.com/workers/platform/limits/ for optimization tips.
   ```

2. **Invalid artifact structure**
   ```
   Worker script not found in artifact. Expected at open-next/worker/index.js
   ```

3. **Cloudflare API error**
   ```
   Failed to deploy worker: 400 - Invalid worker script syntax
   ```

4. **Missing artifact**
   ```
   Build artifact not found in R2
   ```

## Examples

### Complete CLI Workflow (Pseudocode)

```typescript
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import crypto from 'crypto';

async function deploy(whopAppId: string, apiUrl: string, authToken: string) {
  // Step 1: Build with OpenNext
  console.log('Building with OpenNext...');
  await execAsync('npx @opennextjs/cloudflare build');
  
  // Step 2: Create artifact
  console.log('Creating deployment artifact...');
  const zip = new AdmZip();
  zip.addLocalFolder('.open-next', 'open-next');
  
  // Create meta.json
  const metadata = {
    nextVersion: getPackageVersion('next'),
    opennextVersion: getPackageVersion('@opennextjs/cloudflare'),
    wranglerVersion: getPackageVersion('wrangler'),
    nodeVersion: process.version,
    buildTime: Date.now(),
  };
  
  zip.addFile('meta.json', Buffer.from(JSON.stringify(metadata, null, 2)));
  
  const artifactPath = 'artifact.zip';
  zip.writeZip(artifactPath);
  
  // Calculate checksum
  const checksum = await calculateChecksum(artifactPath);
  metadata.checksum = checksum;
  
  // Step 3: Create deployment
  console.log('Creating deployment...');
  const createResponse = await fetch(`${apiUrl}/deployments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      whopAppId,
      metadata,
      checksum,
    }),
  });
  
  if (!createResponse.ok) {
    throw new Error(`Failed to create deployment: ${await createResponse.text()}`);
  }
  
  const { deployment, uploadUrl } = await createResponse.json();
  console.log(`Deployment created: ${deployment.id}`);
  
  // Step 4: Upload artifact
  console.log('Uploading artifact...');
  const artifactBuffer = fs.readFileSync(artifactPath);
  
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/zip',
    },
    body: artifactBuffer,
  });
  
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload artifact: ${await uploadResponse.text()}`);
  }
  
  console.log('Artifact uploaded successfully');
  
  // Step 5: Trigger deployment
  console.log('Triggering deployment...');
  const triggerResponse = await fetch(`${apiUrl}/deployments/${deployment.id}/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });
  
  if (!triggerResponse.ok) {
    throw new Error(`Failed to trigger deployment: ${await triggerResponse.text()}`);
  }
  
  console.log('Deployment triggered');
  
  // Step 6: Monitor status
  console.log('Monitoring deployment...');
  let status = 'building';
  let lastLogPosition = 0;
  
  while (status !== 'active' && status !== 'failed') {
    await sleep(5000); // Poll every 5 seconds
    
    const statusResponse = await fetch(`${apiUrl}/deployments/${deployment.id}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    
    const statusData = await statusResponse.json();
    status = statusData.deployment.status;
    
    console.log(`Status: ${status} (${statusData.deployment.rolloutStage || 'N/A'})`);
    
    // Stream logs
    try {
      const logsResponse = await fetch(`${apiUrl}/deployments/${deployment.id}/logs`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      if (logsResponse.ok) {
        const logs = await logsResponse.text();
        const newLogs = logs.slice(lastLogPosition);
        if (newLogs) {
          process.stdout.write(newLogs);
          lastLogPosition = logs.length;
        }
      }
    } catch (error) {
      // Logs not available yet
    }
  }
  
  if (status === 'active') {
    const finalResponse = await fetch(`${apiUrl}/deployments/${deployment.id}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    const finalData = await finalResponse.json();
    
    console.log('\n✅ Deployment successful!');
    console.log(`🌐 URL: ${finalData.url}`);
  } else {
    console.log('\n❌ Deployment failed. Check logs for details.');
    throw new Error('Deployment failed');
  }
}

async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
    stream.on('error', reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Minimal Example (curl)

```bash
#!/bin/bash

WHOP_APP_ID="app_123abc"
API_URL="https://api.whopship.com"
AUTH_TOKEN="your_auth_token"

# Build
npx @opennextjs/cloudflare build

# Create artifact
cd .open-next
zip -r ../artifact.zip .
cd ..

# Create deployment
RESPONSE=$(curl -s -X POST "$API_URL/deployments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{\"whopAppId\":\"$WHOP_APP_ID\"}")

DEPLOYMENT_ID=$(echo $RESPONSE | jq -r '.deployment.id')
UPLOAD_URL=$(echo $RESPONSE | jq -r '.uploadUrl')

echo "Deployment ID: $DEPLOYMENT_ID"

# Upload artifact
curl -X PUT \
  -H "Content-Type: application/zip" \
  --data-binary @artifact.zip \
  "$UPLOAD_URL"

# Trigger deployment
curl -X POST "$API_URL/deployments/$DEPLOYMENT_ID/trigger" \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Monitor status
while true; do
  STATUS=$(curl -s "$API_URL/deployments/$DEPLOYMENT_ID" \
    -H "Authorization: Bearer $AUTH_TOKEN" | jq -r '.deployment.status')
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "active" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  
  sleep 5
done

# Get final URL
if [ "$STATUS" = "active" ]; then
  URL=$(curl -s "$API_URL/deployments/$DEPLOYMENT_ID" \
    -H "Authorization: Bearer $AUTH_TOKEN" | jq -r '.url')
  echo "✅ Deployed to: $URL"
else
  echo "❌ Deployment failed"
  curl -s "$API_URL/deployments/$DEPLOYMENT_ID/logs" \
    -H "Authorization: Bearer $AUTH_TOKEN"
fi
```

## Best Practices

### 1. Error Handling

- Always check HTTP status codes
- Parse error messages and display them to users
- Retry failed uploads (with exponential backoff)
- Don't retry failed deployments automatically (user should fix the issue)

### 2. Progress Indication

- Show progress during artifact creation
- Display upload progress (if possible)
- Stream logs in real-time during deployment
- Show rollout stages (50% → 100%)

### 3. Validation

- Validate OpenNext output exists before creating artifact
- Check artifact size before upload (warn if >50 MB)
- Verify worker script exists in `.open-next/worker/`
- Calculate and include checksums

### 4. Performance

- Compress artifacts efficiently (use standard zip compression)
- Don't include unnecessary files (node_modules, .git, etc.)
- Use streaming for large file uploads
- Poll status at reasonable intervals (5-10 seconds)

### 5. User Experience

- Provide clear error messages
- Show estimated deployment time
- Display the final URL prominently
- Offer to open the deployed app in browser
- Save deployment history locally

## Troubleshooting

### "Deployment has already been triggered"

You tried to trigger a deployment that's already in progress. Check the status:

```bash
GET /deployments/:id
```

### "Build artifact not found in R2"

The artifact wasn't uploaded successfully. Verify:
1. Upload completed without errors
2. Used the correct presigned URL
3. Didn't exceed the 1-hour expiry

### "Worker bundle exceeds 10 MiB limit"

Your worker script is too large. Optimize by:
1. Removing unused dependencies
2. Enabling tree-shaking
3. Using dynamic imports
4. Splitting into multiple workers (advanced)

### Logs not available

Logs may take a few seconds to appear. Keep polling until:
- Status changes to `active` or `failed`
- Logs endpoint returns 200

### Authentication errors

Verify:
1. Whop credentials are valid
2. User has access to the specified app
3. Auth token hasn't expired

## Rate Limits

- **Deployments:** 10 per hour per app
- **Status checks:** 120 per minute
- **Log fetches:** 60 per minute

Exceeding rate limits returns `429 Too Many Requests`.

## Support

For issues or questions:
- Check deployment logs first
- Review this documentation
- Contact WhopShip support with deployment ID

## Changelog

### v1.0.0 (2025-01-24)

- Initial API release
- Support for OpenNext Cloudflare adapter
- Two-stage gradual rollouts
- Workers Static Assets support
- Build log streaming

