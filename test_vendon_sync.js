#!/usr/bin/env node

// Test script for Vendon API sync functions
const { vendonSync } = require('./server/services/vendonSync');

async function testAllSyncs() {
  console.log('='.repeat(60));
  console.log('VENDON API SYNC TEST - Alle Funktionen prüfen');
  console.log('='.repeat(60));
  console.log('');

  const results = {
    machines: null,
    transactions: null,
    events: null,
    refills: null,
    products: null,
    stocks: null
  };

  // Test 1: Maschinen-Sync
  console.log('1. Teste Maschinen-Sync...');
  try {
    results.machines = await vendonSync.syncMachines();
    console.log('✅ Maschinen-Sync erfolgreich:', results.machines.message);
  } catch (error) {
    console.error('❌ Maschinen-Sync fehlgeschlagen:', error.message);
    results.machines = { status: 'error', message: error.message };
  }
  console.log('');

  // Test 2: Transaktionen-Sync (letzte 3 Tage)
  console.log('2. Teste Transaktionen-Sync (letzte 3 Tage)...');
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    results.transactions = await vendonSync.syncTransactions(threeDaysAgo, new Date(), 100, 200);
    console.log('✅ Transaktionen-Sync erfolgreich:', results.transactions.message);
  } catch (error) {
    console.error('❌ Transaktionen-Sync fehlgeschlagen:', error.message);
    results.transactions = { status: 'error', message: error.message };
  }
  console.log('');

  // Test 3: Events-Sync (letzte 3 Tage)
  console.log('3. Teste Events-Sync (letzte 3 Tage)...');
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    results.events = await vendonSync.syncEvents(threeDaysAgo, new Date(), 100);
    console.log('✅ Events-Sync erfolgreich:', results.events.message);
  } catch (error) {
    console.error('❌ Events-Sync fehlgeschlagen:', error.message);
    results.events = { status: 'error', message: error.message };
  }
  console.log('');

  // Test 4: Refills-Sync (letzte 7 Tage)
  console.log('4. Teste Refills-Sync (letzte 7 Tage)...');
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    results.refills = await vendonSync.syncRefills(sevenDaysAgo, new Date(), 100);
    console.log('✅ Refills-Sync erfolgreich:', results.refills.message);
  } catch (error) {
    console.error('❌ Refills-Sync fehlgeschlagen:', error.message);
    results.refills = { status: 'error', message: error.message };
  }
  console.log('');

  // Test 5: Produkte-Sync
  console.log('5. Teste Produkte-Sync...');
  try {
    results.products = await vendonSync.syncProducts();
    console.log('✅ Produkte-Sync erfolgreich:', results.products.message);
  } catch (error) {
    console.error('❌ Produkte-Sync fehlgeschlagen:', error.message);
    results.products = { status: 'error', message: error.message };
  }
  console.log('');

  // Test 6: Stock-Sync
  console.log('6. Teste Stock-Sync...');
  try {
    results.stocks = await vendonSync.syncStocks();
    console.log('✅ Stock-Sync erfolgreich:', results.stocks.message);
  } catch (error) {
    console.error('❌ Stock-Sync fehlgeschlagen:', error.message);
    results.stocks = { status: 'error', message: error.message };
  }
  console.log('');

  // Zusammenfassung
  console.log('='.repeat(60));
  console.log('ZUSAMMENFASSUNG');
  console.log('='.repeat(60));
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const [key, result] of Object.entries(results)) {
    const status = result?.status === 'success' ? '✅' : '❌';
    if (result?.status === 'success') {
      successCount++;
    } else {
      errorCount++;
    }
    console.log(`${status} ${key.padEnd(15)}: ${result?.message || 'Nicht getestet'}`);
  }
  
  console.log('');
  console.log(`Gesamt: ${successCount} erfolgreich, ${errorCount} fehlgeschlagen`);
  
  process.exit(errorCount > 0 ? 1 : 0);
}

// Run the tests
testAllSyncs().catch(error => {
  console.error('Fataler Fehler:', error);
  process.exit(1);
});