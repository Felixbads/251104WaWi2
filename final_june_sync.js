/**
 * Finale Synchronisierung für Juni 14-15, 2025 mit robustem Error Handling
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

async function finalJuneSync() {
  console.log('=== FINALE JUNI SYNCHRONISIERUNG ===\n');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    
    // Alle Tage nochmals prüfen für Vollständigkeit
    const allDates = [
      '2025-06-12',
      '2025-06-13',
      '2025-06-14', 
      '2025-06-15',
      '2025-06-16'
    ];
    
    let totalSynced = 0;
    
    for (const date of allDates) {
      console.log(`Prüfe ${date}...`);
      
      const startDate = new Date(`${date}T00:00:00.000Z`);
      const endDate = new Date(`${date}T23:59:59.999Z`);
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);
      
      // Aktuelle Anzahl in DB prüfen
      const currentCount = await client.query(
        'SELECT COUNT(*) as count FROM transactions WHERE DATE(datetime) = $1',
        [date]
      );
      
      console.log(`  Aktuell in DB: ${currentCount.rows[0].count} Transaktionen`);
      
      const transactions = await fetchVendonTransactions(startTimestamp, endTimestamp);
      console.log(`  API gefunden: ${transactions.length} Transaktionen`);
      
      if (transactions.length === 0) {
        console.log(`  Keine API-Daten für ${date}`);
        continue;
      }
      
      let daySynced = 0;
      for (const tx of transactions) {
        try {
          const existing = await client.query(
            'SELECT id FROM transactions WHERE vendon_id = $1',
            [tx.transaction_id.toString()]
          );
          
          if (existing.rows.length > 0) continue;
          
          await client.query(`
            INSERT INTO transactions (
              vendon_id, datetime, product_name, price, machine_id, 
              machine_name, transaction_type, status, payment_method
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            tx.transaction_id.toString(),
            new Date(tx.datetime * 1000).toISOString(),
            tx.name || 'Unbekanntes Produkt',
            tx.price || 0,
            tx.machine_id || null,
            tx.machine_name || 'Unbekannte Maschine',
            'sale',
            'completed',
            tx.payment_method || 'CASHLESS'
          ]);
          
          daySynced++;
        } catch (error) {
          if (!error.message.includes('duplicate key')) {
            console.error(`  Fehler bei ${tx.transaction_id}: ${error.message}`);
          }
        }
      }
      
      console.log(`  ✓ ${daySynced} neue Transaktionen hinzugefügt\n`);
      totalSynced += daySynced;
    }
    
    // Finale Statistiken
    const finalCount = await client.query('SELECT COUNT(*) as total FROM transactions');
    const juneComplete = await client.query(`
      SELECT 
        DATE(datetime) as date,
        COUNT(*) as count
      FROM transactions 
      WHERE DATE(datetime) BETWEEN '2025-06-12' AND '2025-06-16'
      GROUP BY DATE(datetime)
      ORDER BY date
    `);
    
    console.log(`✓ FINALE SYNCHRONISIERUNG ABGESCHLOSSEN`);
    console.log(`  Neue Transaktionen: ${totalSynced}`);
    console.log(`  Gesamttransaktionen: ${finalCount.rows[0].total}`);
    console.log('\n📊 JUNI 12-16 VOLLSTÄNDIGE ÜBERSICHT:');
    
    let juneTotal = 0;
    juneComplete.rows.forEach(row => {
      console.log(`  ${row.date}: ${row.count} Transaktionen`);
      juneTotal += parseInt(row.count);
    });
    console.log(`  GESAMT JUNI 12-16: ${juneTotal} Transaktionen`);
    
  } catch (error) {
    console.error('Sync-Fehler:', error.message);
  } finally {
    await client.end();
  }
}

async function fetchVendonTransactions(startTimestamp, endTimestamp) {
  return new Promise((resolve) => {
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
            resolve([]);
          }
        } catch (e) {
          resolve([]);
        }
      });
    });
    
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

finalJuneSync().catch(console.error);