/**
 * INTELLIGENTE TÄGLICHE SYNCHRONISIERUNG
 * Erst Anzahl abrufen, dann in 100er-Batches mit korrekten Zeitstempeln
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

async function smartDailySync() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('🎯 SMART DAILY SYNC GESTARTET\n');
    
    // Kritische Datenlücken identifizieren
    const criticalDates = [
      '2025-06-15', // Komplett fehlend
      '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04', '2025-02-05',
      '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05',
      '2024-06-01', '2024-06-02', '2024-06-03', '2024-06-04', '2024-06-05'
    ];
    
    let totalAdded = 0;
    
    for (const dateStr of criticalDates) {
      console.log(`\n📅 Verarbeite ${dateStr}`);
      
      // Schritt 1: Prüfe lokalen Bestand
      const existing = await client.query(
        'SELECT COUNT(*) as count FROM transactions WHERE DATE(datetime) = $1',
        [dateStr]
      );
      
      console.log(`  Lokal: ${existing.rows[0].count} Transaktionen`);
      
      // Schritt 2: API-Gesamtzahl abrufen
      const dayTotal = await getDayTotal(dateStr);
      console.log(`  API Total: ${dayTotal} Transaktionen verfügbar`);
      
      if (dayTotal === 0) {
        console.log(`  ⏭️ Keine Daten verfügbar`);
        continue;
      }
      
      if (existing.rows[0].count >= dayTotal) {
        console.log(`  ✅ Bereits vollständig`);
        continue;
      }
      
      // Schritt 3: In 100er-Batches abrufen
      const dayResult = await syncDayInBatches(client, dateStr, dayTotal);
      totalAdded += dayResult.added;
      
      console.log(`  ✅ ${dayResult.added} neue Transaktionen hinzugefügt`);
    }
    
    const finalCount = await client.query('SELECT COUNT(*) as total FROM transactions');
    
    console.log('\n' + '='.repeat(50));
    console.log('SMART SYNC ABGESCHLOSSEN');
    console.log('='.repeat(50));
    console.log(`✅ Neue Transaktionen: ${totalAdded}`);
    console.log(`📊 Gesamtsystem: ${finalCount.rows[0].total} Transaktionen`);
    
  } catch (error) {
    console.error('Fehler:', error.message);
  } finally {
    await client.end();
  }
}

async function getDayTotal(dateStr) {
  const startTs = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 1000);
  const endTs = Math.floor(new Date(`${dateStr}T23:59:59.999Z`).getTime() / 1000);
  
  try {
    // Erst mal mit limit=1 abrufen um total count zu bekommen
    const data = await fetchVendonData(startTs, endTs, 1);
    
    // Wenn Daten vorhanden, mit höherem Limit die Gesamtzahl schätzen
    if (data.length > 0) {
      const fullData = await fetchVendonData(startTs, endTs, 1000);
      return fullData.length;
    }
    
    return 0;
  } catch (error) {
    console.error(`    Fehler beim Abrufen der Tagesanzahl: ${error.message}`);
    return 0;
  }
}

async function syncDayInBatches(client, dateStr, expectedTotal) {
  const startTs = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 1000);
  const endTs = Math.floor(new Date(`${dateStr}T23:59:59.999Z`).getTime() / 1000);
  
  let added = 0;
  let offset = 0;
  const batchSize = 100;
  
  console.log(`    Lade in ${batchSize}er-Batches...`);
  
  while (offset < expectedTotal) {
    try {
      // Zeitbereich für aktuellen Batch berechnen
      const batchStartTs = startTs + Math.floor((offset / expectedTotal) * (endTs - startTs));
      const batchEndTs = startTs + Math.floor(((offset + batchSize) / expectedTotal) * (endTs - startTs));
      
      const batchData = await fetchVendonData(batchStartTs, batchEndTs, batchSize);
      
      if (batchData.length === 0) {
        console.log(`    Batch ${Math.floor(offset/batchSize) + 1}: Keine Daten`);
        break;
      }
      
      let batchAdded = 0;
      for (const tx of batchData) {
        try {
          if (!tx.transaction_id) continue;
          
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
            console.error(`      Fehler: ${error.message}`);
          }
        }
      }
      
      added += batchAdded;
      console.log(`    Batch ${Math.floor(offset/batchSize) + 1}: +${batchAdded} (${batchData.length} geladen)`);
      
      offset += batchSize;
      
      // Kurze Pause zwischen Batches
      await sleep(500);
      
    } catch (error) {
      console.error(`    Batch-Fehler: ${error.message}`);
      break;
    }
  }
  
  return { added };
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
            console.error(`API Fehler: ${parsed.message || 'Unbekannt'}`);
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
      reject(new Error('Request Timeout'));
    });
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

smartDailySync().catch(console.error);