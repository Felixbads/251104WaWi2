/**
 * Synchronisiert alle fehlenden Transaktionen vom 12.-17. Juni 2025
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

async function syncMissingTransactions() {
  console.log('=== VENDON TRANSAKTIONS-SYNCHRONISIERUNG ===\n');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    
    // Definiere den Zeitraum für fehlende Daten
    const missingDates = [
      '2025-06-12',
      '2025-06-13', 
      '2025-06-14',
      '2025-06-15',
      '2025-06-16',
      '2025-06-17'
    ];
    
    let totalSynced = 0;
    
    for (const date of missingDates) {
      console.log(`\nSynchronisiere Transaktionen für ${date}...`);
      
      // Berechne Timestamps für den Tag
      const startDate = new Date(`${date}T00:00:00.000Z`);
      const endDate = new Date(`${date}T23:59:59.999Z`);
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);
      
      // Hole Transaktionen von Vendon API
      const transactions = await fetchVendonTransactions(startTimestamp, endTimestamp);
      
      if (transactions.length === 0) {
        console.log(`  ⚠️ Keine Transaktionen für ${date} gefunden`);
        continue;
      }
      
      // Debug: Zeige die Struktur der ersten Transaktion
      if (transactions.length > 0) {
        console.log(`  Debug: Erste Transaktion:`, JSON.stringify(transactions[0], null, 2));
      }
      
      // Speichere Transaktionen in der Datenbank
      let daySynced = 0;
      for (const tx of transactions) {
        try {
          // Prüfe ob Transaktion bereits existiert
          const existing = await client.query(
            'SELECT id FROM transactions WHERE vendon_id = $1',
            [tx.id.toString()]
          );
          
          if (existing.rows.length > 0) {
            continue; // Transaktion bereits vorhanden
          }
          
          // Konvertiere Timestamp zu ISO-String
          const datetime = new Date(tx.timestamp * 1000).toISOString();
          
          // Füge Transaktion hinzu
          await client.query(`
            INSERT INTO transactions (
              vendon_id, datetime, product_name, price, machine_id, 
              machine_name, location, transaction_type, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            tx.id.toString(),
            datetime,
            tx.product_name || 'Unbekanntes Produkt',
            tx.amount || 0,
            tx.machine_id || null,
            tx.machine_name || 'Unbekannte Maschine',
            tx.location || null,
            'sale',
            'completed'
          ]);
          
          daySynced++;
        } catch (error) {
          console.error(`    Fehler bei Transaktion ${tx.id}:`, error.message);
        }
      }
      
      console.log(`  ✓ ${daySynced} neue Transaktionen für ${date} synchronisiert`);
      totalSynced += daySynced;
    }
    
    // Prüfe finale Statistiken
    const finalCount = await client.query('SELECT COUNT(*) as total FROM transactions');
    console.log(`\n✓ Synchronisierung abgeschlossen!`);
    console.log(`  - ${totalSynced} neue Transaktionen hinzugefügt`);
    console.log(`  - Gesamtzahl Transaktionen: ${finalCount.rows[0].total}`);
    
    // Prüfe heutige Performance
    const todayStats = await client.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(price), 0) as revenue
      FROM transactions 
      WHERE DATE(datetime) = CURRENT_DATE
    `);
    
    console.log(`  - Heutige Transaktionen: ${todayStats.rows[0].count}`);
    console.log(`  - Heutiger Umsatz: ${parseFloat(todayStats.rows[0].revenue).toFixed(2)}€`);
    
  } catch (error) {
    console.error('Fehler bei der Synchronisierung:', error);
  } finally {
    await client.end();
  }
}

async function fetchVendonTransactions(startTimestamp, endTimestamp) {
  return new Promise((resolve, reject) => {
    const path = `/rest/v1.8.0/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=1000`;
    
    const req = https.request({
      hostname: 'cloud.vendon.net',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Token ${process.env.VENDON_API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code === 200 && Array.isArray(parsed.result)) {
            resolve(parsed.result);
          } else {
            console.error(`API Error: ${parsed.code} - ${parsed.result}`);
            resolve([]);
          }
        } catch (e) {
          console.error('Parse Error:', e.message);
          resolve([]);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Request Error:', error.message);
      resolve([]);
    });
    
    req.on('timeout', () => {
      console.error('Request Timeout');
      req.destroy();
      resolve([]);
    });
    
    req.end();
  });
}

syncMissingTransactions().catch(console.error);