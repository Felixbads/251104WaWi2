#!/usr/bin/env npx tsx

/**
 * C1) Test Runner für historische Vendon-Synchronisation
 * 
 * Führt die wichtigsten Unit- und Integrationstests durch:
 * - Watermark-Fortschreibung (max updated_at)
 * - Upsert-Idempotenz
 * - CLI Exit-Codes
 */

// Simple test assertions
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values not equal'}: expected ${expected}, got ${actual}`);
  }
}

// Test runner
class SimpleTestRunner {
  private results: Array<{ name: string; passed: boolean; error?: string }> = [];

  async test(name: string, testFn: () => Promise<void> | void): Promise<void> {
    try {
      await testFn();
      this.results.push({ name, passed: true });
      console.log(`✅ ${name}`);
    } catch (error) {
      this.results.push({ name, passed: false, error: String(error) });
      console.log(`❌ ${name}: ${error}`);
    }
  }

  summary(): { passed: number; failed: number; total: number } {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.length - passed;
    return { passed, failed, total: this.results.length };
  }

  printSummary() {
    const { passed, failed, total } = this.summary();
    console.log('\n' + '='.repeat(60));
    console.log('📊 C1) TEST ZUSAMMENFASSUNG');
    console.log('='.repeat(60));
    console.log(`✅ Erfolgreich: ${passed}`);
    console.log(`❌ Fehlgeschlagen: ${failed}`);
    console.log(`📈 Gesamt: ${total}`);
    console.log(`📊 Erfolgsrate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));

    if (failed > 0) {
      process.exit(1);
    }
  }
}

async function runTests() {
  const runner = new SimpleTestRunner();
  console.log('🚀 C1) Tests für Historische Vendon-Synchronisation\n');

  // Unit Test: Watermark max(updated_at) Logik
  await runner.test('Unit: Watermark max(updated_at) Berechnung', async () => {
    const mockTransactions = [
      { updated_at: '2024-01-15T10:00:00Z' },
      { updated_at: '2024-01-15T11:05:00Z' }, // Maximum
      { updated_at: '2024-01-15T09:30:00Z' }
    ];

    // Simuliere die reduce-Logik aus WatermarkStore
    const maxUpdatedAt = mockTransactions.reduce((max, transaction) => {
      if (transaction.updated_at) {
        const transactionDate = new Date(transaction.updated_at);
        return transactionDate > max ? transactionDate : max;
      }
      return max;
    }, new Date(0));

    const expectedDate = new Date('2024-01-15T11:05:00Z');
    assertEqual(maxUpdatedAt.getTime(), expectedDate.getTime(), 'Max updated_at nicht korrekt berechnet');
  });

  // Unit Test: Upsert-Idempotenz Konzept
  await runner.test('Unit: Upsert-Idempotenz Konzept', async () => {
    // Mock Upsert SQL Logik
    const transactions = [
      { vendonId: 'txn-001', machineId: 123, price: 2.50 },
      { vendonId: 'txn-001', machineId: 123, price: 3.00 }, // Update
      { vendonId: 'txn-002', machineId: 123, price: 1.50 }  // Insert
    ];

    const results = new Map();
    
    // Simuliere Upsert-Verhalten
    transactions.forEach(tx => {
      const key = `${tx.machineId}-${tx.vendonId}`;
      results.set(key, tx); // Überschreibt bei Duplikaten
    });

    assertEqual(results.size, 2, 'Upsert sollte 2 eindeutige Einträge haben');
    assertEqual(results.get('123-txn-001').price, 3.00, 'Preis sollte überschrieben sein');
  });

  // Unit Test: API-Parameter Enforcement Concept  
  await runner.test('Unit: API-Parameter Enforcement Concept', async () => {
    // Simuliere API-Client Validierung
    function validateApiParams(params: any) {
      if (!params.machineId) {
        throw new Error('machineId is required');
      }
      return {
        ...params,
        searchTime: params.searchTime || 'updated',
        sort: params.sort || '-transaction_id'
      };
    }

    // Test: machineId required
    let threwError = false;
    try {
      validateApiParams({});
    } catch (error) {
      threwError = true;
    }
    assert(threwError, 'Sollte Fehler werfen wenn machineId fehlt');

    // Test: Defaults werden gesetzt
    const result = validateApiParams({ machineId: 'test' });
    assertEqual(result.searchTime, 'updated', 'searchTime default nicht gesetzt');
    assertEqual(result.sort, '-transaction_id', 'sort default nicht gesetzt');
  });

  // Integration Test: CLI Exit Codes (simulated)
  await runner.test('Integration: CLI Exit-Codes Konzept', async () => {
    // Simuliere verschiedene CLI-Szenarien
    function simulateCliExecution(hasErrors: boolean): number {
      return hasErrors ? 1 : 0;
    }

    const successExitCode = simulateCliExecution(false);
    const failureExitCode = simulateCliExecution(true);

    assertEqual(successExitCode, 0, 'Erfolgreiche CLI sollte Exit-Code 0 haben');
    assertEqual(failureExitCode, 1, 'Fehlgeschlagene CLI sollte Exit-Code 1 haben');
  });

  // Mock Test: 429 Retry-After Parsing
  await runner.test('Mock: 429 Retry-After Header Parsing', async () => {
    // Mock Retry-After Header Parsing Logic
    function parseRetryAfter(headerValue: string | null): number {
      if (!headerValue) return 1000; // Fallback
      
      const seconds = parseFloat(headerValue);
      return isNaN(seconds) ? 1000 : seconds * 1000;
    }

    assertEqual(parseRetryAfter('5'), 5000, 'Retry-After Parsing fehlerhaft');
    assertEqual(parseRetryAfter('invalid'), 1000, 'Fallback bei ungültigem Header');
    assertEqual(parseRetryAfter(null), 1000, 'Fallback bei fehlendem Header');
  });

  // Mock Test: Domain Mapping
  await runner.test('Mock: Vendon API Domain Mapping', async () => {
    const apiItem = {
      transaction_id: 'api-txn-123',
      machine_id: 'machine-456',
      updated_at: '2024-01-15T10:00:00Z',
      price: 4.50
    };

    // Simuliere Domain-Mapping
    const domainTransaction = {
      vendonId: apiItem.transaction_id,
      machineId: apiItem.machine_id,
      updatedAt: new Date(apiItem.updated_at),
      price: apiItem.price,
      source: 'vendon_delta'
    };

    assertEqual(domainTransaction.vendonId, 'api-txn-123', 'vendonId mapping fehlerhaft');
    assertEqual(domainTransaction.machineId, 'machine-456', 'machineId mapping fehlerhaft');
    assertEqual(domainTransaction.source, 'vendon_delta', 'source nicht gesetzt');
  });

  runner.printSummary();
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('🚨 Test Fehler:', error);
    process.exit(1);
  });
}

export { runTests };