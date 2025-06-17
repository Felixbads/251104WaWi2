/**
 * BESCHLEUNIGTE HISTORISCHE SYNCHRONISIERUNG
 * Fokussiert auf die kritischsten Datenlücken mit maximaler Effizienz
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

async function acceleratedHistoricalSync() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('🚀 BESCHLEUNIGTE HISTORISCHE SYNCHRONISIERUNG GESTARTET\n');
    
    // Kritische Monate priorisieren (größte Lücken zuerst)
    const criticalPeriods = [
      // 2025 - Fehlende Monate
      { year: 2025, month: 2, name: 'Februar 2025' },
      { year: 2025, month: 3, name: 'März 2025 (vervollständigen)' },
      { year: 2025, month: 4, name: 'April 2025 (vervollständigen)' },
      
      // 2024 - Komplett fehlende Monate
      { year: 2024, month: 1, name: 'Januar 2024' },
      { year: 2024, month: 2, name: 'Februar 2024' },
      { year: 2024, month: 3, name: 'März 2024' },
      { year: 2024, month: 4, name: 'April 2024' },
      { year: 2024, month: 6, name: 'Juni 2024' },
      { year: 2024, month: 7, name: 'Juli 2024' },
      { year: 2024, month: 8, name: 'August 2024' },
      { year: 2024, month: 9, name: 'September 2024' },
      { year: 2024, month: 10, name: 'Oktober 2024' },
      { year: 2024, month: 11, name: 'November 2024' }
    ];
    
    let totalAdded = 0;
    
    for (const period of criticalPeriods) {
      console.log(`\n📅 ${period.name}`);
      console.log('-'.repeat(40));
      
      const monthStart = new Date(period.year, period.month - 1, 1);
      const monthEnd = new Date(period.year, period.month, 0, 23, 59, 59);
      
      const monthResult = await syncMonthAccelerated(client, monthStart, monthEnd);
      totalAdded += monthResult.added;
      
      console.log(`✅ ${period.name}: +${monthResult.added} Transaktionen`);
      
      // Kurze Pause zwischen Monaten
      await sleep(1000);
    }
    
    // Finale Statistiken
    const finalCount = await client.query('SELECT COUNT(*) as total FROM transactions');
    
    console.log('\n' + '='.repeat(60));
    console.log('BESCHLEUNIGTE SYNCHRONISIERUNG ABGESCHLOSSEN');
    console.log('='.repeat(60));
    console.log(`✅ Neue Transaktionen: ${totalAdded}`);
    console.log(`📊 Gesamtsystem: ${finalCount.rows[0].total} Transaktionen`);
    
    // Finale Monatsübersicht
    const monthlyOverview = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM datetime) as year,
        EXTRACT(MONTH FROM datetime) as month,
        COUNT(*) as transactions
      FROM transactions 
      WHERE EXTRACT(YEAR FROM datetime) IN (2024, 2025)
      GROUP BY EXTRACT(YEAR FROM datetime), EXTRACT(MONTH FROM datetime)
      ORDER BY year DESC, month DESC
    `);
    
    console.log('\nMONATLICHE ÜBERSICHT:');
    monthlyOverview.rows.forEach(row => {
      const monthName = new Date(row.year, row.month - 1).toLocaleDateString('de-DE', { 
        month: 'long', year: 'numeric' 
      });
      console.log(`${monthName}: ${row.transactions} Transaktionen`);
    });
    
  } catch (error) {
    console.error('Kritischer Fehler:', error.message);
  } finally {
    await client.end();
  }
}

async function syncMonthAccelerated(client, monthStart, monthEnd) {
  let totalAdded = 0;
  let daysProcessed = 0;
  
  // Wochenweise durch den Monat (effizienter als täglich)
  for (let weekStart = new Date(monthStart); weekStart <= monthEnd; weekStart.setDate(weekStart.getDate() + 7)) {
    const weekEnd = new Date(Math.min(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000, monthEnd.getTime()));
    
    const weekResult = await syncWeekBatch(client, weekStart, weekEnd);
    totalAdded += weekResult.added;
    daysProcessed += weekResult.days;
    
    if (weekResult.added > 0) {
      console.log(`  Woche ${weekStart.toISOString().split('T')[0]}: +${weekResult.added} Transaktionen`);
    }
  }
  
  return { added: totalAdded, days: daysProcessed };
}

async function syncWeekBatch(client, weekStart, weekEnd) {
  const startTs = Math.floor(weekStart.getTime() / 1000);
  const endTs = Math.floor(weekEnd.getTime() / 1000);
  
  // Mehrfache API-Aufrufe für maximale Abdeckung
  const allData = [];
  const limits = [5000, 10000, 15000];
  
  for (const limit of limits) {
    try {
      const data = await fetchVendonData(startTs, endTs, limit);
      allData.push(...data);
    } catch (error) {
      // Fehler ignorieren, nächsten Versuch probieren
    }
  }
  
  // Deduplizierung
  const uniqueData = allData.filter((tx, index, arr) => 
    arr.findIndex(t => t.transaction_id === tx.transaction_id) === index
  );
  
  let added = 0;
  for (const tx of uniqueData) {
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
      
      added++;
    } catch (error) {
      // Duplikate ignorieren
      if (!error.message.includes('duplicate key')) {
        console.error(`    Fehler: ${error.message}`);
      }
    }
  }
  
  const days = Math.ceil((weekEnd - weekStart) / (24 * 60 * 60 * 1000));
  return { added, days };
}

async function fetchVendonData(startTimestamp, endTimestamp, limit = 5000) {
  return new Promise((resolve) => {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

acceleratedHistoricalSync().catch(console.error);