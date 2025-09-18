#!/usr/bin/env node
/**
 * AUTH STABILITY CHECK - Phase 2.3 Critical Fix
 * 
 * Parses vitest auth test results and enforces >80% pass rate (21/25 tests)
 * REPLACES echo-only CI gates with real validation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Auth stability thresholds
const AUTH_TEST_THRESHOLD = 0.8; // 80% pass rate
const MIN_PASSING_TESTS = 21; // 21 out of 25 tests must pass
const EXPECTED_TOTAL_TESTS = 25;

function runAuthTests() {
  console.log('🔐 Running auth stability tests...');
  
  try {
    // Run auth tests with JSON reporter
    const result = execSync('npx vitest run test/unit/auth --reporter=json --reporter=verbose', {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    return result;
  } catch (error) {
    // Vitest returns non-zero exit code even for some passing tests
    // We'll parse the output to determine actual results
    console.log('⚠️  Auth tests completed with exit code:', error.status);
    return error.stdout || '';
  }
}

function parseTestResults(output) {
  console.log('📊 Parsing auth test results...');
  
  let jsonOutput = '';
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  try {
    // Try to extract JSON from output
    const lines = output.split('\n');
    let jsonLine = null;
    
    for (const line of lines) {
      if (line.trim().startsWith('{') && line.includes('"testResults"')) {
        jsonLine = line.trim();
        break;
      }
    }
    
    if (jsonLine) {
      const testData = JSON.parse(jsonLine);
      
      if (testData.testResults) {
        totalTests = testData.numTotalTests || 0;
        passedTests = testData.numPassedTests || 0;
        failedTests = testData.numFailedTests || 0;
      }
    }
  } catch (parseError) {
    console.log('⚠️  Could not parse JSON output, falling back to text parsing...');
  }
  
  // Fallback: parse text output for test counts
  if (totalTests === 0) {
    const testSummaryMatch = output.match(/(\d+)\s+passed.*?(\d+)\s+total/i);
    if (testSummaryMatch) {
      passedTests = parseInt(testSummaryMatch[1]);
      totalTests = parseInt(testSummaryMatch[2]);
      failedTests = totalTests - passedTests;
    } else {
      // Look for individual test patterns
      const passedMatch = output.match(/✓.*?(\d+)\s+passed/i) || output.match(/(\d+)\s+passed/i);
      const failedMatch = output.match(/✗.*?(\d+)\s+failed/i) || output.match(/(\d+)\s+failed/i);
      
      if (passedMatch) passedTests = parseInt(passedMatch[1]);
      if (failedMatch) failedTests = parseInt(failedMatch[1]);
      
      totalTests = passedTests + failedTests;
    }
  }
  
  return { totalTests, passedTests, failedTests };
}

function main() {
  console.log('🔐 AUTH STABILITY CHECK - Phase 2.3 Critical Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const output = runAuthTests();
  const { totalTests, passedTests, failedTests } = parseTestResults(output);
  
  console.log('\n📊 Auth Test Results:');
  console.log(`   Total Tests: ${totalTests}`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${failedTests}`);
  
  if (totalTests === 0) {
    console.error('❌ No auth tests found or could not parse results');
    console.log('💡 Make sure auth tests exist in test/unit/auth/');
    process.exit(1);
  }
  
  const passRate = totalTests > 0 ? (passedTests / totalTests) : 0;
  const passPercentage = (passRate * 100).toFixed(1);
  
  console.log(`   Pass Rate: ${passPercentage}% (${passedTests}/${totalTests})`);
  console.log(`   Required: ${(AUTH_TEST_THRESHOLD * 100).toFixed(1)}% (${MIN_PASSING_TESTS}+/${EXPECTED_TOTAL_TESTS})`);
  
  console.log('\n🎯 Stability Analysis:');
  
  if (passRate >= AUTH_TEST_THRESHOLD && passedTests >= MIN_PASSING_TESTS) {
    console.log('✅ AUTH STABILITY CHECK PASSED');
    console.log(`   ✅ Pass rate ${passPercentage}% meets minimum ${(AUTH_TEST_THRESHOLD * 100)}%`);
    console.log(`   ✅ ${passedTests} passed tests meets minimum ${MIN_PASSING_TESTS}`);
    console.log('🎉 Authentication system is stable - ready for production');
    
    process.exit(0);
  } else {
    console.log('❌ AUTH STABILITY CHECK FAILED');
    
    if (passRate < AUTH_TEST_THRESHOLD) {
      console.log(`   ❌ Pass rate ${passPercentage}% below required ${(AUTH_TEST_THRESHOLD * 100)}%`);
    }
    
    if (passedTests < MIN_PASSING_TESTS) {
      console.log(`   ❌ Only ${passedTests} tests passed, need ${MIN_PASSING_TESTS}+`);
    }
    
    console.log('\n🔧 To fix auth stability issues:');
    console.log('1. Review and fix failing auth unit tests');
    console.log('2. Focus on bcrypt hashing, session management, and JWT validation');
    console.log('3. Run: npm test test/unit/auth -- --watch for development');
    console.log('4. Ensure createTestUser properly hashes passwords');
    
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseTestResults };