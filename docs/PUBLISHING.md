# Publishing Whopctl to npm

This guide explains how to continuously publish updates to the `@whoplabs/whopctl` npm package.

## Prerequisites

1. **npm account**: You need to be logged into npm with access to the `@whoplabs` organization
2. **Authentication**: Run `npm login` if not already authenticated

```bash
npm login
```

## Publishing Process

### 1. Update Version

Update the version in `package.json`. Use semantic versioning:

- **Patch** (0.6.7 → 0.6.8): Bug fixes, minor improvements
- **Minor** (0.6.7 → 0.7.0): New features, backward compatible
- **Major** (0.6.7 → 1.0.0): Breaking changes

You can use npm version commands to bump versions automatically:

```bash
# Patch version (0.6.7 → 0.6.8)
npm version patch

# Minor version (0.6.7 → 0.7.0)
npm version minor

# Major version (0.6.7 → 1.0.0)
npm version major
```

This will:
- Update `package.json` version
- Create a git commit with the version change
- Create a git tag

### 2. Build the CLI

The `prepublishOnly` script automatically builds before publishing, but you can build manually:

```bash
bun run build
```

This creates `dist/index.js` which is the executable that gets published.

### 3. Test Locally (Optional)

Before publishing, test the built version:

```bash
./dist/index.js --version
./dist/index.js analytics usage
```

### 4. Publish to npm

Publish the package:

```bash
npm publish
```

Or if you want to publish a specific tag (beta, alpha, etc.):

```bash
npm publish --tag beta
```

### 5. Verify Publication

Check that the package was published:

```bash
npm view @whoplabs/whopctl version
```

## Quick Publishing Workflow

For rapid iteration, here's a one-liner workflow:

```bash
# 1. Make your changes
# 2. Test locally: bun run build && ./dist/index.js analytics usage
# 3. Bump version and publish
npm version patch && npm publish
```

Or create a script in `package.json`:

```json
{
  "scripts": {
    "release:patch": "npm version patch && npm publish",
    "release:minor": "npm version minor && npm publish",
    "release:major": "npm version major && npm publish"
  }
}
```

Then run:

```bash
bun run release:patch
```

## Continuous Publishing Tips

### 1. Use npm version for automatic versioning

The `npm version` command automatically:
- Updates `package.json`
- Creates a git commit
- Creates a git tag

### 2. Test before publishing

Always test the built version:

```bash
bun run build
./dist/index.js analytics usage
```

### 3. Use tags for pre-releases

For testing before full release:

```bash
npm version 0.6.8-beta.1
npm publish --tag beta
```

Users can install with: `npm install -g @whoplabs/whopctl@beta`

### 4. Automate with GitHub Actions (Optional)

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - uses: actions/setup-node@v3
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Package Configuration

The package is configured as:

- **Name**: `@whoplabs/whopctl`
- **Access**: `restricted` (private package, requires org access)
- **Bin**: `whopctl` → `./dist/index.js`
- **Pre-publish**: Automatically builds via `prepublishOnly` script

## Files Included

The `.npmignore` file controls what gets published. Currently excludes:
- Source files (`src/`)
- Development files
- Only includes `dist/index.js` and `package.json`

## Troubleshooting

### "You do not have permission to publish"

Make sure you're logged in and have access to the `@whoplabs` organization:

```bash
npm whoami
npm login
```

### "Package already exists"

The version already exists. Bump the version:

```bash
npm version patch
npm publish
```

### Build fails

Make sure Bun is installed and dependencies are up to date:

```bash
bun install
bun run build
```

## Example: Publishing Analytics Features

```bash
# 1. Make changes to analytics commands
# 2. Test locally
bun run build
./dist/index.js analytics usage

# 3. Bump patch version (0.6.7 → 0.6.8)
npm version patch

# 4. Publish
npm publish

# 5. Verify
npm view @whoplabs/whopctl version

# 6. Users can update with:
npm install -g @whoplabs/whopctl@latest
```

