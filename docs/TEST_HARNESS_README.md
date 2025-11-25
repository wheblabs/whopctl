# WhopShip CLI Test Harness

## Overview

The test harness (`test-harness.js`) is a comprehensive testing tool that programmatically tests all new CLI features including:
- Build cancellation (`whopctl builds cancel`)
- Queue management (`whopctl builds queue`)
- Overage billing display

## Prerequisites

1. **Authentication Required**: You must be logged in before running tests
   ```bash
   cd /Users/krisciu/workspace/cli
   ./dist/index.js login
   ```

2. **CLI Built**: The CLI must be built before running tests
   ```bash
   bun run build
   ```

## Running the Test Harness

```bash
cd /Users/krisciu/workspace/cli
node test-harness.js
```

Or with bun:
```bash
bun test-harness.js
```

## What It Tests

### Command Registration Tests
- ✅ Main help command
- ✅ Builds help command
- ✅ Cancel command registered
- ✅ Queue command registered

### Authentication Tests
- ⚠️ Check authentication status (requires login)

### Build Cancellation Tests
- ✅ Cancel command help
- ⚠️ Get build list (requires authentication)
- ⚠️ Cancel invalid build ID (requires authentication)
- ⚠️ Cancel queued build (requires authentication + queued build)
- ⚠️ Cancel completed build (requires authentication + completed build)

### Queue Management Tests
- ✅ Queue command help
- ⚠️ View queue status (requires authentication)
- ⚠️ Queue command alias (requires authentication)
- ⚠️ Queue status with app filter (requires authentication)

### Overage Billing Tests
- ⚠️ View current billing status (requires authentication)
- ⚠️ View billing history (requires authentication)
- ⚠️ View billing periods (requires authentication)
- ⚠️ Verify overage information display (requires authentication)
- ⚠️ Verify billing display format (requires authentication)

## Test Output

The test harness generates three types of output:

1. **Console Output**: Real-time progress with full terminal output for each command
2. **Markdown Report**: Detailed test results in `test-results/test-results-{timestamp}.md`
3. **JSON Report**: Machine-readable results in `test-results/test-results-{timestamp}.json`
4. **Execution Log**: Complete log file in `test-results/test-execution-{timestamp}.log`

## Understanding Test Results

### Success Indicators
- ✅ **Passed**: Test completed successfully
- ❌ **Failed**: Test failed (check error message)
- ⏭️ **Skipped**: Test was skipped (usually due to missing prerequisites)

### Common Failure Reasons

1. **Authentication Required**: Many tests require a valid login session
   - Solution: Run `./dist/index.js login` first

2. **No Builds Available**: Some tests require existing builds
   - Solution: Create a deployment first, or tests will be skipped

3. **Missing .env File**: Some commands look for `.env` file
   - Solution: Ensure you're running from a project directory with `.env`

## Example Output

```
================================================================================
TEST EXECUTION COMPLETE
================================================================================
Total Tests: 17
✅ Passed: 8
❌ Failed: 9
⏭️  Skipped: 3
Success Rate: 47.06%

Reports:
  - Markdown: /Users/krisciu/workspace/cli/test-results/test-results-{timestamp}.md
  - JSON: /Users/krisciu/workspace/cli/test-results/test-results-{timestamp}.json
  - Log: /Users/krisciu/workspace/cli/test-results/test-execution-{timestamp}.log
================================================================================
```

## Full Terminal Output

The test harness captures **complete terminal output** for every command executed, including:
- STDOUT (standard output)
- STDERR (standard error)
- Exit codes
- Execution time
- Command that was run

This allows you to see exactly what happened during each test.

## Next Steps

1. **Authenticate**: Run `./dist/index.js login` to authenticate
2. **Re-run Tests**: Run `node test-harness.js` again
3. **Review Results**: Check the generated markdown report for detailed results
4. **Fix Issues**: Address any failures found in the test results

## Test Categories

Tests are organized into categories:
- `command-registration`: Tests that commands are properly registered
- `authentication`: Tests authentication functionality
- `build-cancellation`: Tests build cancellation features
- `queue-management`: Tests queue management features
- `overage-billing`: Tests overage billing display

## Notes

- Tests that require authentication will fail if you're not logged in
- Tests that require builds will be skipped if no builds are available
- The test harness automatically builds the CLI if it's not already built
- All output is captured and saved for review

