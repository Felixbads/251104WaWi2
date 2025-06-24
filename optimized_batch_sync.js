/**
 * OPTIMIERTE BATCH-SYNCHRONISIERUNG
 * Verbesserte Zeitstempel-Berechnung für präzise 100er-Batches
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

async function optimizedBatchSync() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('🔄 OPTIMIERTE BATCH-SYNCHRONISIERUNG GESTARTET\n');
    
    // Prioritäre Datenlücken mit bekannten API-Daten
    const priorityDates = [
      '2025-06-15', // 390 verfügbar, 13 geladen
      '2025-06-12', // 232 verfügbar, 51 geladen 
      '2025-02-01', '2025-02-02', '2025-02-03',
      '2024-01-01', '2024-01-02', '2024-01-03',
      '2024-06-01', '2024-07-01', '2024-08-01'
    ];
    
    let totalRecovered = 0;
    
    for (const dateStr of priorityDates) {
      console.log(`\n📅 ${dateStr}`);
      
      const existingCount = await client.query(
        'SELECT COUNT(*) as count FROM transactions WHERE DATE(datetime) = $1',
        [dateStr]
      );
      
      const apiTotal = await getApiCount(dateStr);
      const localCount = parseInt(existingCount.rows[0].count);
      
      console.log(`  Lokal: ${localCount} | API: ${apiTotal} verfügbar`);
      
      if (apiTotal === 0 || localCount >= apiTotal) {
        console.log(`  ✅ Vollständig oder keine Daten`);
        continue;
      }
      
      const needed = apiTotal - localCount;
      console.log(`  🎯 ${needed} Transaktionen benötigt`);
      
      const dayResult = await syncDayOptimized(client, dateStr, apiTotal);
      totalRecovered += dayResult.added;
      
      console.log(`  ✅ +${dayResult.added} neue Transaktionen`);
      
      // API-Schonung zwischen Tagen
      await sleep(2000);
    }
    
    const finalStats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT DATE(datetime)) as unique_days
      FROM transactions
    `);
    
    console.log('\n' + '='.repeat(50));
    console.log('OPTIMIERTE SYNCHRONISIERUNG ABGESCHLOSSEN');
    console.log('='.repeat(50));
    console.log(`✅ Neue Transaktionen: ${totalRecovered}`);
    console.log(`📊 Gesamtsystem: ${finalStats.rows[0].total} Transaktionen`);
    console.log(`📅 Abgedeckte Tage: ${finalStats.rows[0].unique_days}`);
    
  } catch (error) {
    console.error('Fehler:', error.message);
  } finally {
    await client.end();
  }
}

async function getApiCount(dateStr) {
  const startTs = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 1000);
  const endTs = Math.floor(new Date(`${dateStr}T23:59:59.999Z`).getTime() / 1000);
  
  try {
    // Erst mit limit=1000 abrufen für Gesamtschätzung
    const sample = await fetchVendonData(startTs, endTs, 1000);
    return sample.length;
  } catch (error) {
    console.error(`    API-Fehler: ${error.message}`);
    return 0;
  }
}

async function syncDayOptimized(client, dateStr, totalAvailable) {
  const startTs = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 1000);
  const endTs = Math.floor(new Date(`${dateStr}T23:59:59.999Z`).getTime() / 1000);
  const dayDuration = endTs - startTs;
  
  let totalAdded = 0;
  let processedTransactions = new Set();
  
  // Berechne Anzahl benötigter Batches
  const batchSize = 100;
  const totalBatches = Math.ceil(totalAvailable / batchSize);
  
  console.log(`    Lade ${totalBatches} Batches...`);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    try {
      // Präzise Zeitfenster-Berechnung für gleichmäßige Verteilung
      const batchStartTs = startTs + Math.floor((batchIndex / totalBatches) * dayDuration);
      const batchEndTs = startTs + Math.floor(((batchIndex + 1) / totalBatches) * dayDuration);
      
      const batchData = await fetchVendonData(batchStartTs, batchEndTs, batchSize);
      
      if (batchData.length === 0) {
        console.log(`    Batch ${batchIndex + 1}: Keine neuen Daten`);
        continue;
      }
      
      let batchAdded = 0;
      for (const tx of batchData) {
        try {
          if (!tx.transaction_id || processedTransactions.has(tx.transaction_id)) {
            continue;
          }
          
          processedTransactions.add(tx.transaction_id);
          
          const exists = await client.query(
            'SELECT id FROM transactions WHERE vendon_id = $1',
            [tx.transaction_id.toString()]
          );
          
          if (exists.rows.length > 0) continue;
          
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
          
          batchAdded++;
        } catch (error) {
          if (!error.message.includes('duplicate key')) {
            console.error(`      TX-Fehler: ${error.message}`);
          }
        }
      }
      
      totalAdded += batchAdded;
      console.log(`    Batch ${batchIndex + 1}/${totalBatches}: +${batchAdded} (${batchData.length} geladen)`);
      
      // Pause zwischen Batches
      await sleep(800);
      
    } catch (error) {
      console.error(`    Batch ${batchIndex + 1} Fehler: ${error.message}`);
      continue;
    }
  }
  
  return { added: totalAdded };
}

async function fetchVendonData(startTimestamp, endTimestamp, limit = 100) {
  return new Promise((resolve, reject) => {
    const path = `/rest/v1.8.0/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=${limit}`;
    
    const req = https.request({
      hostname: 'cloud.vendon.net',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Token ${process.env.VENDON_API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 25000
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
          reject(new Error(`JSON Parse Error: ${e.message}`));
        }
      });
    });
    
    req.on('error', (error) => reject(error));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API Timeout'));
    });
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

optimizedBatchSync().catch(console.error);