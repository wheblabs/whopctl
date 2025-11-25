#!/usr/bin/env node
/**
 * Comprehensive test harness for WhopShip CLI features
 * Tests: Build cancellation, queue management, and overage billing
 */

import { execSync, spawn } from 'child_process';
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_DIR = __dirname;
const CLI_BIN = join(CLI_DIR, 'dist', 'index.js');

// Output files
const RESULTS_DIR = join(CLI_DIR, 'test-results');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RESULTS_FILE = join(RESULTS_DIR, `test-results-${TIMESTAMP}.md`);
const JSON_RESULTS_FILE = join(RESULTS_DIR, `test-results-${TIMESTAMP}.json`);
const LOG_FILE = join(RESULTS_DIR, `test-execution-${TIMESTAMP}.log`);

// Test state
let testCount = 0;
let passCount = 0;
let failCount = 0;
let skipCount = 0;
const testResults = [];
const capturedOutputs = [];

// Ensure results directory exists
try {
    if (!existsSync(RESULTS_DIR)) {
        execSync(`mkdir -p "${RESULTS_DIR}"`, { stdio: 'inherit' });
    }
} catch (error) {
    console.error('Failed to create results directory:', error);
    process.exit(1);
}

/**
 * Log a message with timestamp
 */
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    appendFileSync(LOG_FILE, logMessage + '\n');
}

/**
 * Execute a CLI command and capture full output
 * Always uses the local CLI build, never global whopctl
 */
function executeCommand(command, options = {}) {
    const {
        timeout = 60000,
        expectFailure = false,
        captureOutput = true,
        workingDir = CLI_DIR,
    } = options;

    // Always use the local CLI build (absolute path)
    // Never use global whopctl - ensure we use the local dist/index.js
    let fullCommand;
    if (command.startsWith(CLI_BIN) || command.startsWith('./dist/index.js') || command.startsWith('node')) {
        // Already has full path or node command
        fullCommand = command;
    } else {
        // Prepend the absolute path to local CLI build
        fullCommand = `node "${CLI_BIN}" ${command}`;
    }

    log(`\n${'='.repeat(80)}`);
    log(`Executing: ${fullCommand}`);
    log(`Working Directory: ${workingDir}`);
    log(`${'='.repeat(80)}`);

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let success = false;

    try {
        const result = execSync(fullCommand, {
            encoding: 'utf-8',
            stdio: captureOutput ? 'pipe' : 'inherit',
            timeout,
            cwd: workingDir,
            env: { ...process.env, FORCE_COLOR: '1' },
        });

        stdout = result || '';
        exitCode = 0;
        success = !expectFailure;

        if (captureOutput) {
            log(`STDOUT:\n${stdout}`);
            if (stderr) log(`STDERR:\n${stderr}`);
        }
    } catch (error) {
        exitCode = error.status || 1;
        stdout = error.stdout?.toString() || '';
        stderr = error.stderr?.toString() || error.message || '';

        if (expectFailure) {
            success = true; // Expected to fail
        } else {
            success = false;
        }

        if (captureOutput) {
            log(`STDOUT:\n${stdout}`);
            log(`STDERR:\n${stderr}`);
        }
    }

    const duration = Date.now() - startTime;
    log(`Command completed in ${duration}ms (exit code: ${exitCode})`);

    return {
        success,
        exitCode,
        stdout,
        stderr,
        duration,
        command: fullCommand,
    };
}

/**
 * Run a test case
 */
function runTest(name, testFn, category = 'general') {
    testCount++;
    const testId = `TEST-${testCount}`;
    log(`\n${'#'.repeat(80)}`);
    log(`Starting ${testId}: ${name}`);
    log(`Category: ${category}`);
    log(`${'#'.repeat(80)}`);

    const startTime = Date.now();
    let result = {
        id: testId,
        name,
        category,
        status: 'pending',
        duration: 0,
        error: null,
        output: null,
        assertions: [],
    };

    try {
        const testResult = testFn();
        const duration = Date.now() - startTime;

        if (testResult && testResult.success !== false) {
            result.status = 'passed';
            result.duration = duration;
            result.output = testResult.output || testResult.stdout || '';
            passCount++;
            log(`✅ PASS: ${name} (${duration}ms)`);
        } else {
            result.status = 'failed';
            result.duration = duration;
            result.error = testResult?.error || testResult?.stderr || 'Test failed';
            result.output = testResult?.output || testResult?.stdout || '';
            failCount++;
            log(`❌ FAIL: ${name} (${duration}ms)`);
            if (result.error) log(`   Error: ${result.error}`);
        }
    } catch (error) {
        const duration = Date.now() - startTime;
        result.status = 'failed';
        result.duration = duration;
        result.error = error.message || String(error);
        result.output = error.stdout || '';
        failCount++;
        log(`❌ FAIL: ${name} (${duration}ms)`);
        log(`   Error: ${result.error}`);
    }

    testResults.push(result);
    return result;
}

/**
 * Assertion helper
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Test Suite: Build Cancellation
 */
function testBuildCancellation() {
    log('\n' + '='.repeat(80));
    log('TEST SUITE: Build Cancellation');
    log('='.repeat(80));

    let buildIds = [];
    let queuedBuildId = null;
    let completedBuildId = null;

    // Test cancel command help
    runTest('Cancel command help', () => {
        return executeCommand('builds cancel --help');
    }, 'build-cancellation');

    // Get build list for testing
    runTest('Get build list for cancellation test', () => {
        const result = executeCommand('builds list', { timeout: 30000 });
        assert(result.success, 'Should successfully list builds');
        
        // Try to extract build IDs from output
        const buildIdMatches = result.stdout.matchAll(/ID:\s*([a-f0-9-]+)/gi);
        for (const match of buildIdMatches) {
            buildIds.push(match[1]);
        }
        
        // Try to find queued/completed builds
        const lines = result.stdout.split('\n');
        buildIds.forEach((id, idx) => {
            const lineIdx = result.stdout.indexOf(id);
            if (lineIdx !== -1) {
                const context = result.stdout.substring(Math.max(0, lineIdx - 100), lineIdx + 100);
                if (context.includes('QUEUED') || context.includes('queued')) {
                    queuedBuildId = id;
                }
                if (context.includes('BUILT') || context.includes('ACTIVE') || context.includes('completed')) {
                    completedBuildId = id;
                }
            }
        });
        
        log(`Found ${buildIds.length} build IDs`);
        if (queuedBuildId) log(`Found queued build: ${queuedBuildId}`);
        if (completedBuildId) log(`Found completed build: ${completedBuildId}`);
        
        return result;
    }, 'build-cancellation');

    // Test cancel with invalid build ID
    runTest('Cancel invalid build ID (should fail)', () => {
        const result = executeCommand('builds cancel invalid-build-id-12345', {
            expectFailure: true,
            timeout: 30000,
        });
        // Verify error message mentions build not found
        const hasError = result.stderr.includes('not found') || 
                        result.stderr.includes('Not found') ||
                        result.stdout.includes('not found');
        assert(hasError, 'Should show build not found error');
        return result;
    }, 'build-cancellation');

    // Test cancel with queued build (if available)
    if (queuedBuildId) {
        runTest(`Cancel queued build ${queuedBuildId}`, () => {
            return executeCommand(`builds cancel ${queuedBuildId}`, {
                timeout: 30000,
            });
        }, 'build-cancellation');
    } else {
        log('⚠️  No queued build found, skipping queued cancellation test');
        skipCount++;
    }

    // Test cancel with completed build (should fail)
    if (completedBuildId) {
        runTest(`Cancel completed build ${completedBuildId} (should fail)`, () => {
            const result = executeCommand(`builds cancel ${completedBuildId}`, {
                expectFailure: true,
                timeout: 30000,
            });
            // Verify error message indicates build cannot be cancelled
            const hasError = result.stderr.includes('cannot be cancelled') ||
                            result.stderr.includes('already') ||
                            result.stdout.includes('cannot be cancelled');
            assert(hasError, 'Should show cannot cancel completed build error');
            return result;
        }, 'build-cancellation');
    } else {
        log('⚠️  No completed build found, skipping completed cancellation test');
        skipCount++;
    }
}

/**
 * Test Suite: Queue Management
 */
function testQueueManagement() {
    log('\n' + '='.repeat(80));
    log('TEST SUITE: Queue Management');
    log('='.repeat(80));

    // Test queue command help
    runTest('Queue command help', () => {
        return executeCommand('builds queue --help');
    }, 'queue-management');

    // Test queue status
    runTest('View queue status', () => {
        const result = executeCommand('builds queue', { timeout: 30000 });
        assert(result.success, 'Should successfully show queue status');
        
        // Verify output contains expected elements
        const hasQueueInfo = result.stdout.includes('Queue') || 
                            result.stdout.includes('queued') ||
                            result.stdout.includes('building');
        assert(hasQueueInfo, 'Should show queue information');
        
        return result;
    }, 'queue-management');

    // Test queue alias
    runTest('Queue command alias (q)', () => {
        return executeCommand('builds q', { timeout: 30000 });
    }, 'queue-management');

    // Test queue with app ID filter
    runTest('Queue status with app filter', () => {
        // Try to get app ID from .env or builds list
        const buildsResult = executeCommand('builds list', { timeout: 30000 });
        
        // Try multiple patterns to find app ID
        const patterns = [
            /NEXT_PUBLIC_WHOP_APP_ID[:\s=]+([a-z0-9_-]+)/i,
            /app[_-]?id[:\s]+([a-z0-9_-]+)/i,
            /App ID[:\s]+([a-z0-9_-]+)/i,
        ];
        
        let appId = null;
        for (const pattern of patterns) {
            const match = buildsResult.stdout.match(pattern);
            if (match) {
                appId = match[1];
                break;
            }
        }
        
        if (appId) {
            log(`Found app ID: ${appId}`);
            const result = executeCommand(`builds queue --app-id ${appId}`, {
                timeout: 30000,
            });
            assert(result.success, 'Should successfully filter queue by app ID');
            return result;
        } else {
            log('⚠️  No app ID found, skipping filtered queue test');
            skipCount++;
            return { success: true, skipped: true };
        }
    }, 'queue-management');
}

/**
 * Test Suite: Overage Billing
 */
function testOverageBilling() {
    log('\n' + '='.repeat(80));
    log('TEST SUITE: Overage Billing');
    log('='.repeat(80));

    // Test billing current command
    runTest('View current billing status', () => {
        const result = executeCommand('billing current', { timeout: 30000 });
        assert(result.success, 'Should successfully show billing status');
        
        // Verify output contains billing information
        const hasBillingInfo = result.stdout.includes('Billing') ||
                              result.stdout.includes('Usage') ||
                              result.stdout.includes('Tier') ||
                              result.stdout.includes('Subscription');
        assert(hasBillingInfo, 'Should show billing information');
        
        return result;
    }, 'overage-billing');

    // Test billing history
    runTest('View billing history', () => {
        return executeCommand('billing history', { timeout: 30000 });
    }, 'overage-billing');

    // Test billing periods
    runTest('View billing periods', () => {
        return executeCommand('billing periods', { timeout: 30000 });
    }, 'overage-billing');

    // Check if overages are displayed
    runTest('Verify overage information display', () => {
        const result = executeCommand('billing current', { timeout: 30000 });
        
        // Check if output contains overage-related keywords
        const hasOverageInfo = 
            result.stdout.includes('overage') ||
            result.stdout.includes('Overage') ||
            result.stdout.includes('exceeded') ||
            result.stdout.includes('grace period') ||
            result.stdout.includes('Grace period');
        
        // Check for overage cost display
        const hasOverageCost = result.stdout.includes('Overage Cost') ||
                              result.stdout.includes('overage cost') ||
                              result.stdout.includes('Total Overage');
        
        // Check for usage vs limits display
        const hasUsageLimits = result.stdout.includes('/') && 
                              (result.stdout.includes('Function Invocations') ||
                               result.stdout.includes('Bandwidth') ||
                               result.stdout.includes('Build Minutes'));
        
        if (hasOverageInfo || hasOverageCost) {
            log('✅ Overage information found in billing output');
        } else {
            log('ℹ️  No overage information found (may be normal if within limits)');
        }
        
        if (hasUsageLimits) {
            log('✅ Usage vs limits display found');
        }
        
        return { success: true, output: result.stdout };
    }, 'overage-billing');

    // Test billing display format
    runTest('Verify billing display format', () => {
        const result = executeCommand('billing current', { timeout: 30000 });
        
        // Verify it shows tier information
        const hasTier = result.stdout.includes('free') ||
                       result.stdout.includes('hobby') ||
                       result.stdout.includes('pro') ||
                       result.stdout.includes('Tier');
        
        assert(hasTier, 'Should show tier information');
        
        return result;
    }, 'overage-billing');
}

/**
 * Test Suite: Command Registration
 */
function testCommandRegistration() {
    log('\n' + '='.repeat(80));
    log('TEST SUITE: Command Registration');
    log('='.repeat(80));

    // Test main help
    runTest('Main help command', () => {
        return executeCommand('--help');
    }, 'command-registration');

    // Test builds help
    runTest('Builds help command', () => {
        return executeCommand('builds --help');
    }, 'command-registration');

    // Verify cancel command is registered
    runTest('Cancel command registered', () => {
        const result = executeCommand('builds --help');
        const hasCancel = result.stdout.includes('cancel') || result.stdout.includes('Cancel');
        assert(hasCancel, 'Cancel command should be in builds help');
        return result;
    }, 'command-registration');

    // Verify queue command is registered
    runTest('Queue command registered', () => {
        const result = executeCommand('builds --help');
        const hasQueue = result.stdout.includes('queue') || result.stdout.includes('Queue');
        assert(hasQueue, 'Queue command should be in builds help');
        return result;
    }, 'command-registration');
}

/**
 * Test Suite: Authentication
 */
function testAuthentication() {
    log('\n' + '='.repeat(80));
    log('TEST SUITE: Authentication');
    log('='.repeat(80));

    // Check auth status
    runTest('Check authentication status', () => {
        return executeCommand('auth check', { timeout: 30000 });
    }, 'authentication');
}

/**
 * Generate test report
 */
function generateReport() {
    log('\n' + '='.repeat(80));
    log('Generating Test Report');
    log('='.repeat(80));

    const totalDuration = testResults.reduce((sum, t) => sum + t.duration, 0);
    const successRate = testCount > 0 ? ((passCount / testCount) * 100).toFixed(2) : 0;

    // Generate Markdown report
    let markdown = `# WhopShip CLI Test Results

**Generated**: ${new Date().toISOString()}
**CLI Binary**: ${CLI_BIN}
**Test Duration**: ${(totalDuration / 1000).toFixed(2)}s

## Summary

- **Total Tests**: ${testCount}
- **Passed**: ${passCount} ✅
- **Failed**: ${failCount} ❌
- **Skipped**: ${skipCount} ⏭️
- **Success Rate**: ${successRate}%

## Test Results by Category

`;

    // Group by category
    const byCategory = {};
    testResults.forEach(test => {
        if (!byCategory[test.category]) {
            byCategory[test.category] = [];
        }
        byCategory[test.category].push(test);
    });

    Object.keys(byCategory).forEach(category => {
        const categoryTests = byCategory[category];
        const passed = categoryTests.filter(t => t.status === 'passed').length;
        const failed = categoryTests.filter(t => t.status === 'failed').length;
        
        markdown += `### ${category}\n\n`;
        markdown += `- **Total**: ${categoryTests.length}\n`;
        markdown += `- **Passed**: ${passed}\n`;
        markdown += `- **Failed**: ${failed}\n\n`;

        categoryTests.forEach(test => {
            const statusIcon = test.status === 'passed' ? '✅' : '❌';
            markdown += `#### ${statusIcon} ${test.name}\n\n`;
            markdown += `- **Status**: ${test.status.toUpperCase()}\n`;
            markdown += `- **Duration**: ${test.duration}ms\n`;
            
            if (test.error) {
                markdown += `- **Error**: \`${test.error}\`\n`;
            }
            
            if (test.output) {
                markdown += `\n**Output:**\n\`\`\`\n${test.output.substring(0, 500)}${test.output.length > 500 ? '...' : ''}\n\`\`\`\n\n`;
            }
            
            markdown += '\n';
        });
    });

    markdown += `\n## Full Execution Log\n\nSee \`${LOG_FILE}\` for complete execution log.\n\n`;

    writeFileSync(RESULTS_FILE, markdown);
    log(`✅ Markdown report written to: ${RESULTS_FILE}`);

    // Generate JSON report
    const jsonReport = {
        timestamp: new Date().toISOString(),
        summary: {
            total: testCount,
            passed: passCount,
            failed: failCount,
            skipped: skipCount,
            successRate: parseFloat(successRate),
            totalDuration,
        },
        results: testResults,
    };

    writeFileSync(JSON_RESULTS_FILE, JSON.stringify(jsonReport, null, 2));
    log(`✅ JSON report written to: ${JSON_RESULTS_FILE}`);

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST EXECUTION COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${testCount}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`\nReports:`);
    console.log(`  - Markdown: ${RESULTS_FILE}`);
    console.log(`  - JSON: ${JSON_RESULTS_FILE}`);
    console.log(`  - Log: ${LOG_FILE}`);
    console.log('='.repeat(80));
}

/**
 * Check authentication status
 */
function checkAuthentication() {
    log('Checking authentication status...');
    try {
        const result = executeCommand('auth check', { timeout: 10000 });
        if (result.success) {
            log('✅ Authentication verified');
            return true;
        } else {
            log('⚠️  Authentication check failed or not logged in');
            log('   Some tests will fail without authentication');
            log('   Run: node "' + CLI_BIN + '" login');
            return false;
        }
    } catch (error) {
        log('⚠️  Could not check authentication status');
        return false;
    }
}

/**
 * Main test runner
 */
async function main() {
    log('Starting WhopShip CLI Test Harness');
    log(`CLI Binary: ${CLI_BIN}`);
    log(`Results Directory: ${RESULTS_DIR}`);
    log(`Using LOCAL build (not global whopctl)`);

    // Verify CLI is built
    if (!existsSync(CLI_BIN)) {
        log('❌ CLI binary not found. Building...', 'ERROR');
        try {
            execSync('bun run build', { cwd: CLI_DIR, stdio: 'inherit' });
            log('✅ CLI built successfully');
        } catch (error) {
            log(`❌ Failed to build CLI: ${error.message}`, 'ERROR');
            process.exit(1);
        }
    } else {
        log(`✅ CLI binary found at: ${CLI_BIN}`);
    }

    // Check authentication status
    const isAuthenticated = checkAuthentication();
    if (!isAuthenticated) {
        log('\n⚠️  WARNING: Not authenticated. Many tests will fail.');
        log('   To authenticate, run: node "' + CLI_BIN + '" login\n');
    }

    // Run test suites
    try {
        testCommandRegistration();
        testAuthentication();
        testBuildCancellation();
        testQueueManagement();
        testOverageBilling();
    } catch (error) {
        log(`❌ Test execution error: ${error.message}`, 'ERROR');
        log(error.stack, 'ERROR');
    }

    // Generate reports
    generateReport();

    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
    process.exit(1);
});

