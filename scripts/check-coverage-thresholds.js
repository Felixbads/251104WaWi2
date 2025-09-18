#!/usr/bin/env node
/**
 * COVERAGE THRESHOLD ENFORCEMENT - Phase 2.3 Critical Fix
 * 
 * Parses vitest coverage results and enforces minimum thresholds
 * REPLACES echo-only CI gates with real validation
 */

const fs = require('fs');
const path = require('path');

// Coverage thresholds (can be adjusted)
const THRESHOLDS = {
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80
};

// Critical modules that must meet higher standards
const CRITICAL_MODULE_THRESHOLDS = {
  'server/auth': 85,
  'server/routes/auth': 85,
  'server/middleware/security': 85,
  'test/unit/auth': 80
};

function main() {
  console.log('🔍 Checking coverage thresholds...');
  
  // Try to read coverage report
  const coverageFile = path.join(process.cwd(), 'coverage/coverage-final.json');
  
  if (!fs.existsSync(coverageFile)) {
    console.error('❌ Coverage file not found: coverage/coverage-final.json');
    console.log('💡 Run: npx vitest --coverage first');
    process.exit(1);
  }

  let coverageData;
  try {
    coverageData = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
  } catch (error) {
    console.error('❌ Failed to parse coverage file:', error.message);
    process.exit(1);
  }

  let failures = [];
  let totalFiles = 0;
  let passedFiles = 0;

  console.log('\n📊 Coverage Analysis Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const [filePath, fileData] of Object.entries(coverageData)) {
    totalFiles++;
    
    const relativePath = path.relative(process.cwd(), filePath);
    const { lines, functions, branches, statements } = fileData;
    
    // Check if this is a critical module
    const isCritical = Object.keys(CRITICAL_MODULE_THRESHOLDS).some(criticalPath => 
      relativePath.includes(criticalPath)
    );
    
    const requiredThreshold = isCritical ? 
      Math.max(THRESHOLDS.lines, Object.values(CRITICAL_MODULE_THRESHOLDS).find(threshold =>
        Object.keys(CRITICAL_MODULE_THRESHOLDS).some(criticalPath => 
          relativePath.includes(criticalPath)
        )
      )) : THRESHOLDS.lines;

    const linesPct = (lines.covered / lines.total * 100).toFixed(1);
    const functionsPct = (functions.covered / functions.total * 100).toFixed(1);
    const branchesPct = (branches.covered / branches.total * 100).toFixed(1);
    const statementsPct = (statements.covered / statements.total * 100).toFixed(1);

    const linesPassing = linesPct >= requiredThreshold;
    const functionsPassing = functionsPct >= THRESHOLDS.functions;
    const branchesPassing = branchesPct >= THRESHOLDS.branches;
    const statementsPassing = statementsPct >= THRESHOLDS.statements;

    const allPassing = linesPassing && functionsPassing && branchesPassing && statementsPassing;
    
    if (allPassing) {
      passedFiles++;
    }

    // Display results
    const status = allPassing ? '✅' : '❌';
    const criticalLabel = isCritical ? ' [CRITICAL]' : '';
    
    console.log(`${status} ${relativePath}${criticalLabel}`);
    console.log(`   Lines: ${linesPct}% (${lines.covered}/${lines.total}) - ${linesPassing ? 'PASS' : 'FAIL'}`);
    console.log(`   Functions: ${functionsPct}% (${functions.covered}/${functions.total}) - ${functionsPassing ? 'PASS' : 'FAIL'}`);
    console.log(`   Branches: ${branchesPct}% (${branches.covered}/${branches.total}) - ${branchesPassing ? 'PASS' : 'FAIL'}`);
    console.log(`   Statements: ${statementsPct}% (${statements.covered}/${statements.total}) - ${statementsPassing ? 'PASS' : 'FAIL'}`);

    if (!allPassing) {
      failures.push({
        file: relativePath,
        lines: linesPct,
        functions: functionsPct,
        branches: branchesPct,
        statements: statementsPct,
        isCritical,
        requiredThreshold
      });
    }
    
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📋 Summary: ${passedFiles}/${totalFiles} files passed coverage thresholds`);
  
  if (failures.length > 0) {
    console.log('\n❌ COVERAGE THRESHOLD FAILURES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    failures.forEach(failure => {
      console.log(`❌ ${failure.file} ${failure.isCritical ? '[CRITICAL]' : ''}`);
      console.log(`   Required: ${failure.requiredThreshold}% | Actual: ${failure.lines}%`);
    });
    
    console.log('\n🔧 To fix these issues:');
    console.log('1. Add more comprehensive unit tests');
    console.log('2. Focus on critical security modules first');
    console.log('3. Run: npm test -- --coverage to see detailed coverage');
    
    process.exit(1);
  } else {
    console.log('✅ All files meet coverage thresholds!');
    console.log('🎉 Quality gates passed - ready for deployment');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };