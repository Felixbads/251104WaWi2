/**
 * Diagnose- und Test-Skript für Vendon-Transaktionssynchronisation
 * Führt eine vollständige Analyse des aktuellen Problems durch
 */

import axios from 'axios';
import pkg from 'pg';
const { Pool } = pkg;

// Konfiguration
const VENDON_API_KEY = process.env.VENDON_API_KEY;
const BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";

// PostgreSQL Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Schritt 1: API-Konnektivität testen
 */
async function testVendonAPIConnection() {
  console.log('🔍 Schritt 1: Teste Vendon API-Verbindung...');
  
  if (!VENDON_API_KEY) {
    console.error('❌ VENDON_API_KEY Umgebungsvariable nicht gesetzt');
    return false;
  }
  
  const maskedKey = VENDON_API_KEY.length >= 4 ? "****" + VENDON_API_KEY.slice(-4) : "****";
  console.log(`🔑 API-Schlüssel gefunden: ${maskedKey}`);
  
  try {
    // Test mit dem aktuellen Datum
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const fromTimestamp = Math.floor(yesterday.getTime() / 1000);
    const toTimestamp = Math.floor(today.getTime() / 1000);
    
    console.log(`📅 Teste Zeitraum: ${yesterday.toISOString()} bis ${today.toISOString()}`);
    console.log(`📊 Timestamps: ${fromTimestamp} bis ${toTimestamp}`);
    
    const response = await axios.get(`${BASE_URL}/stats/vends`, {
      params: {
        from_timestamp: fromTimestamp,
        to_timestamp: toTimestamp,
        limit: 10,
        offset: 0
      },
      headers: {
        'Authorization': `Token ${VENDON_API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`✅ API-Verbindung erfolgreich (Status: ${response.status})`);
    console.log(`📋 Antwortformat:`, Object.keys(response.data));
    
    if (response.data.result) {
      console.log(`📊 Anzahl Transaktionen: ${response.data.result.length}`);
      if (response.data.result.length > 0) {
        console.log(`📝 Beispiel-Transaktion:`, JSON.stringify(response.data.result[0], null, 2));
      }
    }
    
    return {
      success: true,
      transactionCount: response.data.result ? response.data.result.length : 0,
      sampleData: response.data.result ? response.data.result[0] : null
    };
    
  } catch (error) {
    console.error('❌ API-Verbindung fehlgeschlagen:', error.message);
    if (error.response) {
      console.error('📋 API-Fehlerdetails:', error.response.status, error.response.data);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Schritt 2: Datenbank-Status prüfen
 */
async function analyzeDatabaseStatus() {
  console.log('\n🔍 Schritt 2: Analysiere Datenbank-Status...');
  
  try {
    // Transaktionen-Tabelle prüfen
    const transactionStats = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN source = 'vendon_api' THEN 1 END) as vendon_api_transactions,
        COUNT(CASE WHEN source = 'history-import' THEN 1 END) as history_import_transactions,
        MIN(datetime) as earliest_transaction,
        MAX(datetime) as latest_transaction
      FROM transactions
    `);
    
    const stats = transactionStats.rows[0];
    console.log('📊 Transaktions-Statistik:');
    console.log(`   Gesamt: ${stats.total_transactions}`);
    console.log(`   Vendon API: ${stats.vendon_api_transactions}`);
    console.log(`   History Import: ${stats.history_import_transactions}`);
    console.log(`   Zeitraum: ${stats.earliest_transaction} bis ${stats.latest_transaction}`);
    
    // Sync-Logs prüfen
    const syncLogs = await pool.query(`
      SELECT sync_type, sync_status, start_date, items_saved, errors
      FROM sync_logs 
      WHERE sync_type LIKE '%vendon%' OR sync_type LIKE '%transaction%'
      ORDER BY start_date DESC 
      LIMIT 5
    `);
    
    console.log('\n📋 Letzte Sync-Logs:');
    syncLogs.rows.forEach(log => {
      console.log(`   ${log.start_date}: ${log.sync_type} - ${log.sync_status} (${log.items_saved} gespeichert, ${log.errors} Fehler)`);
    });
    
    // Maschinen prüfen
    const machineStats = await pool.query(`
      SELECT COUNT(*) as total_machines,
             COUNT(CASE WHEN vendon_id IS NOT NULL THEN 1 END) as machines_with_vendon_id
      FROM machines
    `);
    
    const machines = machineStats.rows[0];
    console.log(`\n🤖 Maschinen: ${machines.total_machines} gesamt, ${machines.machines_with_vendon_id} mit Vendon-ID`);
    
    return {
      totalTransactions: parseInt(stats.total_transactions),
      vendonTransactions: parseInt(stats.vendon_api_transactions) + parseInt(stats.history_import_transactions),
      machinesWithVendonId: parseInt(machines.machines_with_vendon_id),
      recentSyncLogs: syncLogs.rows
    };
    
  } catch (error) {
    console.error('❌ Datenbankanalyse fehlgeschlagen:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Schritt 3: Testlauf einer Transaktionssynchronisation
 */
async function performTestSync() {
  console.log('\n🔍 Schritt 3: Führe Test-Synchronisation durch...');
  
  try {
    // Zeitraum für die letzten 7 Tage
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);
    
    const fromTimestamp = Math.floor(startDate.getTime() / 1000);
    const toTimestamp = Math.floor(endDate.getTime() / 1000);
    
    console.log(`📅 Test-Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    let totalFound = 0;
    let totalSaved = 0;
    let totalErrors = 0;
    let offset = 0;
    const limit = 50;
    
    while (true) {
      console.log(`📊 Hole Batch ${Math.floor(offset/limit) + 1} (Offset: ${offset})...`);
      
      const response = await axios.get(`${BASE_URL}/stats/vends`, {
        params: {
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          limit: limit,
          offset: offset
        },
        headers: {
          'Authorization': `Token ${VENDON_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      const transactions = response.data.result || [];
      totalFound += transactions.length;
      
      console.log(`   ${transactions.length} Transaktionen gefunden`);
      
      // Transaktionen in Datenbank speichern
      for (const transaction of transactions) {
        try {
          await saveTransactionToDatabase(transaction);
          totalSaved++;
        } catch (error) {
          console.error(`   ❌ Fehler beim Speichern der Transaktion ${transaction.transaction_id}:`, error.message);
          totalErrors++;
        }
      }
      
      // Stoppen, wenn weniger als limit Transaktionen zurückgegeben wurden
      if (transactions.length < limit) {
        break;
      }
      
      offset += limit;
      
      // Sicherheitsbegrenzung
      if (offset >= 1000) {
        console.log('🛑 Sicherheitsbegrenzung erreicht (1000 Transaktionen)');
        break;
      }
      
      // Kurze Pause zwischen API-Aufrufen
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ Test-Synchronisation abgeschlossen:`);
    console.log(`   Gefunden: ${totalFound}`);
    console.log(`   Gespeichert: ${totalSaved}`);
    console.log(`   Fehler: ${totalErrors}`);
    
    return {
      totalFound,
      totalSaved,
      totalErrors
    };
    
  } catch (error) {
    console.error('❌ Test-Synchronisation fehlgeschlagen:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Hilfsfunktion zum Speichern einer Transaktion
 */
async function saveTransactionToDatabase(vendonTransaction) {
  // Maschinen-ID aus der Datenbank holen
  const machineQuery = 'SELECT id FROM machines WHERE vendon_id = $1';
  const machineResult = await pool.query(machineQuery, [vendonTransaction.machine_id]);
  
  if (machineResult.rows.length === 0) {
    throw new Error(`Maschine mit Vendon-ID ${vendonTransaction.machine_id} nicht gefunden`);
  }
  
  const machineId = machineResult.rows[0].id;
  
  // Transaktion speichern mit verbesserter Konfliktbehandlung
  const insertQuery = `
    INSERT INTO transactions (
      vendon_id, machine_id, machine_name, datetime, transaction_dt, 
      registered_dt, product_id, product_name, selection, stock_id,
      article, quantity, price, price_vat, price_wo_vat, vat, currency,
      discount_code, discount_amount, payment_method, payment_type,
      source, transaction_data, note, metadata, extra_data, amount,
      location_id, location_name, transaction_type, status,
      coin_credit, card_credit, cashless_credit, is_test,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 
      $29, $30, $31, $32, $33, $34, $35, NOW(), NOW()
    ) ON CONFLICT (vendon_id) DO UPDATE SET
      price = EXCLUDED.price,
      price_vat = EXCLUDED.price_vat,
      price_wo_vat = EXCLUDED.price_wo_vat,
      updated_at = NOW()
    RETURNING id
  `;
  
  const values = [
    vendonTransaction.transaction_id?.toString() || null,
    machineId,
    vendonTransaction.machine_name || null,
    vendonTransaction.datetime ? new Date(vendonTransaction.datetime * 1000) : null,
    vendonTransaction.datetime ? new Date(vendonTransaction.datetime * 1000) : null,
    vendonTransaction.received_at ? new Date(vendonTransaction.received_at * 1000) : null,
    vendonTransaction.stock_id?.toString() || null,
    vendonTransaction.name || vendonTransaction.product_name || null,
    vendonTransaction.selection || null,
    vendonTransaction.stock_id || null,
    vendonTransaction.article || null,
    vendonTransaction.quantity || 1,
    vendonTransaction.price || 0,
    vendonTransaction.price_vat || 0,
    vendonTransaction.price_wo_vat || 0,
    vendonTransaction.vat || 0,
    vendonTransaction.currency || 'EUR',
    vendonTransaction.discount_code || null,
    vendonTransaction.discount_amount || 0,
    vendonTransaction.payment_method || null,
    vendonTransaction.payment_type || null,
    'test-sync',
    vendonTransaction.transaction_data ? JSON.stringify(vendonTransaction.transaction_data) : null,
    vendonTransaction.note || null,
    vendonTransaction.metadata ? JSON.stringify(vendonTransaction.metadata) : null,
    vendonTransaction.extra_data ? JSON.stringify(vendonTransaction.extra_data) : null,
    vendonTransaction.amount || vendonTransaction.price || 0,
    vendonTransaction.location_id || null,
    vendonTransaction.location_name || null,
    vendonTransaction.transaction_type || 'sale',
    vendonTransaction.status || 'completed',
    vendonTransaction.coin_credit || 0,
    vendonTransaction.card_credit || 0,
    vendonTransaction.cashless_credit || 0,
    vendonTransaction.is_test || false
  ];
  
  const result = await pool.query(insertQuery, values);
  return result.rows[0]?.id;
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Starte Vendon-Transaktions-Diagnose...\n');
  
  try {
    // Schritt 1: API-Test
    const apiTest = await testVendonAPIConnection();
    
    if (!apiTest.success) {
      console.log('❌ API-Test fehlgeschlagen. Beende Diagnose.');
      return;
    }
    
    // Schritt 2: Datenbank-Analyse
    const dbAnalysis = await analyzeDatabaseStatus();
    
    // Schritt 3: Test-Synchronisation (nur wenn API funktioniert)
    if (apiTest.success && apiTest.transactionCount >= 0) {
      const syncTest = await performTestSync();
      
      console.log('\n📋 Zusammenfassung der Diagnose:');
      console.log('=====================================');
      console.log(`API-Verbindung: ${apiTest.success ? '✅ Funktioniert' : '❌ Fehlgeschlagen'}`);
      console.log(`Aktuelle Transaktionen in DB: ${dbAnalysis.totalTransactions}`);
      console.log(`Vendon-Transaktionen in DB: ${dbAnalysis.vendonTransactions}`);
      console.log(`Maschinen mit Vendon-ID: ${dbAnalysis.machinesWithVendonId}`);
      
      if (syncTest.success !== false) {
        console.log(`Test-Sync Ergebnis: ${syncTest.totalSaved}/${syncTest.totalFound} gespeichert`);
        
        if (syncTest.totalSaved > 0) {
          console.log('\n✅ LÖSUNG: Die API funktioniert und Transaktionen können erfolgreich importiert werden.');
          console.log('📝 Empfehlung: Führe eine vollständige historische Synchronisation durch.');
        } else if (syncTest.totalFound === 0) {
          console.log('\n⚠️ BEFUND: API funktioniert, aber keine Transaktionen im Test-Zeitraum gefunden.');
          console.log('📝 Empfehlung: Erweitere den Zeitraum oder prüfe Maschinen-Konfiguration.');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Unerwarteter Fehler bei der Diagnose:', error);
  } finally {
    await pool.end();
    console.log('\n🏁 Diagnose abgeschlossen.');
  }
}

// Skript ausführen
main().catch(console.error);