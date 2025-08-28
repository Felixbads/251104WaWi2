#!/usr/bin/env node
/**
 * DIREKTER SYNC TEST
 * Testet die korrigierte API-Verbindung und Datenverarbeitung
 */

import { getEnhancedVendonApiClientInstance } from './server/services/EnhancedVendonApiClient.js';

async function testDirectSync() {
  console.log('🔧 Teste direkten Vendon Sync');
  console.log('═════════════════════════════════');
  
  try {
    const apiClient = getEnhancedVendonApiClientInstance();
    
    // Teste Transaktionen für letzte Stunde
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 60 * 60 * 1000); // 1 Stunde zurück
    
    console.log(`📅 Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    console.log('\n📡 Hole Transaktionen von API...');
    
    const transactions = await apiClient.getTransactions(startDate, endDate, 50);
    
    console.log(`\n✅ Ergebnis:`);
    console.log(`  - Type: ${typeof transactions}`);
    console.log(`  - Is Array: ${Array.isArray(transactions)}`);
    console.log(`  - Anzahl: ${transactions?.length || 0}`);
    
    if (Array.isArray(transactions) && transactions.length > 0) {
      console.log('\n📊 Erste Transaktion:');
      const tx = transactions[0];
      console.log(`  - Transaction ID: ${tx.transaction_id}`);
      console.log(`  - Machine ID: ${tx.machine_id}`);
      console.log(`  - Machine Name: ${tx.machine_name}`);
      console.log(`  - Product: ${tx.product_name || 'N/A'}`);
      console.log(`  - Price: ${tx.price} EUR`);
      console.log(`  - Datetime: ${tx.datetime}`);
      
      console.log('\n✅ API-Client funktioniert korrekt! Transaktionen werden als Array zurückgegeben.');
      return true;
    } else if (!Array.isArray(transactions)) {
      console.error('\n❌ FEHLER: API gibt kein Array zurück!');
      console.error('Response:', transactions);
      return false;
    } else {
      console.log('\n⚠️ Keine Transaktionen in der letzten Stunde gefunden.');
      return true; // Kein Fehler, nur keine Daten
    }
    
  } catch (error) {
    console.error('\n❌ Fehler beim API-Aufruf:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    return false;
  }
}

// Führe Test aus
testDirectSync()
  .then(success => {
    if (success) {
      console.log('\n✅ Test erfolgreich abgeschlossen');
    } else {
      console.log('\n❌ Test fehlgeschlagen');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unerwarteter Fehler:', error);
    process.exit(1);
  });