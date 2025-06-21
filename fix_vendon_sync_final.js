/**
 * FINALE VENDON SYNCHRONISIERUNG - PROBLEM BEHOBEN
 * Dieses Skript führt eine sofortige robuste Synchronisierung durch
 */

import pkg from 'pg';
const { Pool } = pkg;
import https from 'https';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const API_KEY = process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';

async function immediateSync() {
  console.log('🚀 Starte sofortige robuste Vendon Synchronisierung...');
  
  try {
    // Hole die letzten 1000 Transaktionen von der API
    const endTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = endTimestamp - (7 * 24 * 60 * 60); // 7 Tage zurück
    
    console.log(`📅 Synchronisiere von ${new Date(startTimestamp * 1000).toISOString()} bis ${new Date(endTimestamp * 1000).toISOString()}`);
    
    const transactions = await fetchVendonData(startTimestamp, endTimestamp, 0, 1000);
    
    if (!transactions || transactions.length === 0) {
      console.log('⚠️ Keine Transaktionen von der API erhalten');
      return;
    }
    
    console.log(`✅ ${transactions.length} Transaktionen von der API erhalten`);
    
    const client = await pool.connect();
    let saved = 0;
    let skipped = 0;
    
    try {
      for (const transaction of transactions) {
        try {
          const vendonId = transaction.id?.toString();
          if (!vendonId) continue;
          
          // Prüfe ob bereits vorhanden
          const existing = await client.query(
            'SELECT id FROM transactions WHERE vendon_id = $1',
            [vendonId]
          );
          
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }
          
          // Hole oder erstelle Maschine
          let machineId = 1;
          if (transaction.machine_id) {
            const machineResult = await client.query(
              'SELECT id FROM machines WHERE vendon_id = $1',
              [transaction.machine_id.toString()]
            );
            
            if (machineResult.rows.length > 0) {
              machineId = machineResult.rows[0].id;
            } else {
              // Erstelle neue Maschine
              const newMachine = await client.query(
                'INSERT INTO machines (vendon_id, machine_name, last_sync) VALUES ($1, $2, NOW()) RETURNING id',
                [transaction.machine_id.toString(), transaction.machine_name || `Maschine ${transaction.machine_id}`]
              );
              machineId = newMachine.rows[0].id;
            }
          }
          
          // Speichere Transaktion
          await client.query(`
            INSERT INTO transactions (
              vendon_id, machine_id, machine_name, datetime, 
              product_name, price, quantity, source, extra_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            vendonId,
            machineId,
            transaction.machine_name || 'Unbekannte Maschine',
            transaction.datetime ? new Date(transaction.datetime * 1000) : new Date(),
            transaction.name || transaction.product_name || 'Unbekanntes Produkt',
            transaction.price || 0,
            transaction.quantity || 1,
            'vendon_api',
            JSON.stringify(transaction)
          ]);
          
          saved++;
          
        } catch (error) {
          console.error(`Fehler beim Speichern von Transaktion ${transaction.id}:`, error.message);
        }
      }
    } finally {
      client.release();
    }
    
    console.log(`✅ Synchronisierung abgeschlossen: ${saved} neue Transaktionen, ${skipped} übersprungen`);
    
  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
  } finally {
    await pool.end();
  }
}

async function fetchVendonData(startTimestamp, endTimestamp, offset = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    const path = `/rest/v1.8.0/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&offset=${offset}&limit=${limit}`;
    
    const req = https.request({
      hostname: 'cloud.vendon.net',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code === 200 && Array.isArray(parsed.result)) {
            resolve(parsed.result);
          } else {
            console.warn('Unerwartete API-Antwort:', parsed);
            resolve([]);
          }
        } catch (error) {
          reject(new Error(`JSON Parse Error: ${error.message}`));
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

// Führe sofort aus
immediateSync();