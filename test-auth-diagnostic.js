#!/usr/bin/env node
/**
 * Diagnostic script to test authentication flow
 * Tests both Whop API and WhopShip API authentication
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Whop } from '@whoplabs/whop-client';

const sessionPath = join(homedir(), '.whoplabs', 'whop-session.json');

console.log('🔍 Authentication Diagnostic Tool\n');
console.log('='.repeat(80));

// Load session
let session;
try {
    const sessionData = readFileSync(sessionPath, 'utf-8');
    session = JSON.parse(sessionData);
    console.log('✅ Session file loaded');
    console.log(`   Path: ${sessionPath}`);
    console.log(`   Version: ${session.version || 'unknown'}`);
    console.log(`   Created: ${session.createdAt || 'unknown'}`);
} catch (error) {
    console.error('❌ Failed to load session:', error.message);
    process.exit(1);
}

// Extract tokens
const tokens = session.tokens || session;
console.log('\n📋 Tokens found:');
console.log(`   Access Token: ${tokens.accessToken ? '✅' : '❌'} (${tokens.accessToken?.substring(0, 50)}...)`);
console.log(`   Refresh Token: ${tokens.refreshToken ? '✅' : '❌'}`);
console.log(`   CSRF Token: ${tokens.csrfToken ? '✅' : '❌'}`);
console.log(`   UID Token: ${tokens.uidToken ? '✅' : '❌'}`);
console.log(`   SSK: ${tokens.ssk ? '✅' : '❌'}`);
console.log(`   User ID: ${tokens.userId ? '✅' : '❌'}`);

// Test 1: Whop API validation
console.log('\n🧪 Test 1: Validating tokens with Whop API...');
try {
    const whop = Whop.fromTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        csrfToken: tokens.csrfToken,
        uidToken: tokens.uidToken,
        ssk: tokens.ssk,
        userId: tokens.userId,
    });

    const user = await whop.me.get();
    console.log('✅ Whop API validation SUCCESS');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
} catch (error) {
    console.error('❌ Whop API validation FAILED');
    console.error(`   Error: ${error.message}`);
    console.error(`   Type: ${error.constructor.name}`);
    process.exit(1);
}

// Test 2: WhopShip API authentication
console.log('\n🧪 Test 2: Testing WhopShip API authentication...');
const headers = {
    'X-Whop-Access-Token': tokens.accessToken,
    'X-Whop-Refresh-Token': tokens.refreshToken,
    'X-Whop-Csrf-Token': tokens.csrfToken,
    'X-Whop-Uid-Token': tokens.uidToken || '',
    'X-Whop-Ssk': tokens.ssk || '',
    'X-Whop-User-Id': tokens.userId || '',
    'Content-Type': 'application/json',
};

const apiUrl = process.env.WHOPSHIP_API_URL || 'https://api.whopship.app';
console.log(`   API URL: ${apiUrl}`);

try {
    const response = await fetch(`${apiUrl}/api/me`, {
        method: 'GET',
        headers,
    });

    const responseText = await response.text();
    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
        console.log('✅ WhopShip API authentication SUCCESS');
        try {
            const data = JSON.parse(responseText);
            console.log(`   Response: ${JSON.stringify(data, null, 2).substring(0, 200)}`);
        } catch {
            console.log(`   Response: ${responseText.substring(0, 200)}`);
        }
    } else {
        console.error('❌ WhopShip API authentication FAILED');
        console.error(`   Response: ${responseText.substring(0, 500)}`);
        
        // Try to parse error
        try {
            const error = JSON.parse(responseText);
            console.error(`   Error: ${error.error || 'Unknown'}`);
            console.error(`   Message: ${error.message || 'No message'}`);
        } catch {
            // Not JSON
        }

        // Show headers sent
        console.log('\n   Headers sent:');
        Object.entries(headers).forEach(([key, value]) => {
            const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
            console.log(`     ${key}: ${displayValue}`);
        });
    }
} catch (error) {
    console.error('❌ WhopShip API request FAILED');
    console.error(`   Error: ${error.message}`);
    console.error(`   Type: ${error.constructor.name}`);
}

// Test 3: Check token expiration
console.log('\n🧪 Test 3: Checking token expiration...');
try {
    const jwtParts = tokens.accessToken.split('.');
    if (jwtParts.length === 3) {
        const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
        const expiresAt = new Date(payload.exp * 1000);
        const now = new Date();
        const isExpired = now > expiresAt;
        
        console.log(`   Issued: ${new Date(payload.iat * 1000).toISOString()}`);
        console.log(`   Expires: ${expiresAt.toISOString()}`);
        console.log(`   Now: ${now.toISOString()}`);
        console.log(`   Status: ${isExpired ? '❌ EXPIRED' : '✅ VALID'}`);
        
        if (!isExpired) {
            const minutesRemaining = Math.floor((expiresAt - now) / 1000 / 60);
            console.log(`   Time remaining: ${minutesRemaining} minutes`);
        }
    } else {
        console.log('   ⚠️  Access token is not a valid JWT');
    }
} catch (error) {
    console.error(`   ❌ Failed to parse token: ${error.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('Diagnostic complete!');

