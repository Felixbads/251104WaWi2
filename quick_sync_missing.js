/**
 * Schnelle Synchronisierung fehlender Transaktionen vom 12.-17. Juni 2025
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

async function quickSyncMissing() {
  console.log('=== SCHNELLE VENDON SYNC ===\n');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    
    // Nur heute synchronisieren für sofortige Dashboard-Verbesserung
    const today = new Date().toISOString().split('T')[0];
    console.log(`Synchronisiere Transaktionen für ${today}...`);
    
    const startDate = new Date(`${today}T00:00:00.000Z`);
    const endDate = new Date(`${today}T23:59:59.999Z`);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    // Hole heutige Transaktionen von Vendon API
    const transactions = await fetchVendonTransactions(startTimestamp, endTimestamp);
    
    if (transactions.length === 0) {
      console.log(`Keine neuen Transaktionen für heute gefunden`);
      return;
    }
    
    console.log(`${transactions.length} Transaktionen von API erhalten`);
    
    // Batch-Insert für bessere Performance
    let synced = 0;
    for (const tx of transactions) {
      try {
        // Prüfe ob bereits vorhanden
        const existing = await client.query(
          'SELECT id FROM transactions WHERE vendon_id = $1',
          [tx.transaction_id.toString()]
        );
        
        if (existing.rows.length > 0) continue;
        
        // Vereinfachter Insert mit nur wichtigen Feldern
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
        
        synced++;
      } catch (error) {
        // Stille Fehlerbehandlung für bessere Performance
        if (error.message.includes('duplicate key')) continue;
        console.error(`Fehler bei ${tx.transaction_id}: ${error.message}`);
      }
    }
    
    console.log(`✓ ${synced} neue Transaktionen für heute synchronisiert`);
    
    // Prüfe heutige Performance
    const todayStats = await client.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(price), 0) as revenue
      FROM transactions 
      WHERE DATE(datetime) = CURRENT_DATE
    `);
    
    console.log(`Heutige Performance: ${todayStats.rows[0].count} Transaktionen, ${parseFloat(todayStats.rows[0].revenue).toFixed(2)}€`);
    
  } catch (error) {
    console.error('Sync-Fehler:', error.message);
  } finally {
    await client.end();
  }
}

async function fetchVendonTransactions(startTimestamp, endTimestamp) {
  return new Promise((resolve) => {
    const path = `/rest/v1.8.0/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=500`;
    
    const req = https.request({
      hostname: 'cloud.vendon.net',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Token ${process.env.VENDON_API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 15000
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

quickSyncMissing().catch(console.error);