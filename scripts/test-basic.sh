#!/bin/bash

# Basic functionality test script for whopctl CLI
# This script verifies core commands work correctly

set -e

CLI_PATH="./dist/index.js"
PASSED=0
FAILED=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_command() {
    local name="$1"
    local command="$2"
    local expected_exit="$3"
    
    echo -n "Testing: $name... "
    
    if [ -z "$expected_exit" ]; then
        expected_exit=0
    fi
    
    # Run command and capture exit code
    eval "$command" > /dev/null 2>&1
    local exit_code=$?
    
    if [ $exit_code -eq $expected_exit ]; then
        echo -e "${GREEN}PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC} (expected exit $expected_exit, got $exit_code)"
        ((FAILED++))
        return 1
    fi
}

echo "=========================================="
echo "whopctl Basic Functionality Tests"
echo "=========================================="
echo ""

# Check if CLI is built
if [ ! -f "$CLI_PATH" ]; then
    echo -e "${RED}ERROR: CLI not built. Run 'bun run build' first.${NC}"
    exit 1
fi

# Make sure CLI is executable
chmod +x "$CLI_PATH"

# Test 1: Help command
test_command "Help command" "$CLI_PATH --help" 0

# Test 2: Version command
test_command "Version command" "$CLI_PATH --version" 0

# Test 3: Invalid command (should show error)
test_command "Invalid command" "$CLI_PATH invalid-command-that-does-not-exist" 1

# Test 4: Apps list (requires auth, but should not crash)
test_command "Apps list (no auth)" "$CLI_PATH apps list" 1

# Test 5: Apps deploy (requires auth and appId, but should show usage)
test_command "Apps deploy (no args)" "$CLI_PATH apps deploy" 1

# Test 6: Analytics commands (should show coming soon)
test_command "Analytics usage" "$CLI_PATH analytics usage" 0
test_command "Analytics summary" "$CLI_PATH analytics summary" 0

# Test 7: Billing commands (should show coming soon)
test_command "Billing current" "$CLI_PATH billing current" 0
test_command "Billing history" "$CLI_PATH billing history" 0
test_command "Billing periods" "$CLI_PATH billing periods" 0

# Test 8: Auth check (requires auth, but should not crash)
test_command "Auth check (no auth)" "$CLI_PATH auth check" 1

# Test 9: Logout (should work even without auth)
test_command "Logout" "$CLI_PATH logout" 0

echo ""
echo "=========================================="
echo "Test Results:"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}Failed: $FAILED${NC}"
fi
echo ""
echo -e "${YELLOW}Note: Some commands require authentication to fully test.${NC}"
echo -e "${YELLOW}Run 'whopctl login' manually to test authenticated commands.${NC}"
echo ""

