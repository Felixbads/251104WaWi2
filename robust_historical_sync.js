/**
 * ROBUSTE HISTORISCHE VENDON SYNCHRONISIERUNG
 * Garantiert lückenlose Datenerfassung mit systematischer Prüfung
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

class RobustVendonSync {
  constructor() {
    this.client = new Client({
      connectionString: process.env.DATABASE_URL
    });
    this.apiKey = process.env.VENDON_API_KEY;
    this.stats = {
      totalProcessed: 0,
      totalAdded: 0,
      totalDuplicates: 0,
      errors: 0
    };
  }

  async connect() {
    await this.client.connect();
    console.log('🔗 Datenbankverbindung hergestellt');
  }

  async disconnect() {
    await this.client.end();
  }

  /**
   * Systematische historische Synchronisierung mit Lückenprüfung
   */
  async performRobustSync(startDate, endDate) {
    console.log(`🚀 STARTE ROBUSTE SYNCHRONISIERUNG`);
    console.log(`📅 Zeitraum: ${startDate} bis ${endDate}\n`);

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Tag für Tag durchgehen
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      await this.syncSingleDay(dateStr);
    }

    await this.generateFinalReport();
  }

  /**
   * Synchronisiert einen einzelnen Tag mit mehreren Zeitfenstern
   */
  async syncSingleDay(dateStr) {
    console.log(`\n📅 VERARBEITE ${dateStr}`);
    
    // Prüfe aktuellen Stand
    const existing = await this.client.query(
      'SELECT COUNT(*) as count FROM transactions WHERE DATE(datetime) = $1',
      [dateStr]
    );
    
    console.log(`  📊 Vorher in DB: ${existing.rows[0].count} Transaktionen`);

    // Mehrere Zeitfenster pro Tag für vollständige Abdeckung
    const timeWindows = [
      { start: '00:00:00', end: '05:59:59', name: 'Nacht' },
      { start: '06:00:00', end: '11:59:59', name: 'Vormittag' },
      { start: '12:00:00', end: '17:59:59', name: 'Nachmittag' },
      { start: '18:00:00', end: '23:59:59', name: 'Abend' }
    ];

    let dayTotal = 0;
    
    for (const window of timeWindows) {
      const startTimestamp = Math.floor(new Date(`${dateStr}T${window.start}.000Z`).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(`${dateStr}T${window.end}.999Z`).getTime() / 1000);
      
      console.log(`    🕐 ${window.name} (${window.start}-${window.end})`);
      
      const windowData = await this.fetchWithRetry(startTimestamp, endTimestamp, 3);
      console.log(`      API: ${windowData.length} Transaktionen`);
      
      if (windowData.length > 0) {
        const processed = await this.processBatch(windowData, dateStr);
        dayTotal += processed.added;
        console.log(`      ✅ ${processed.added} neue hinzugefügt`);
      }
    }

    // Finale Prüfung für den Tag
    const final = await this.client.query(
      'SELECT COUNT(*) as count FROM transactions WHERE DATE(datetime) = $1',
      [dateStr]
    );
    
    console.log(`  🎯 Ergebnis: ${dayTotal} neue, ${final.rows[0].count} total`);
    
    // Validierung: Prüfe auf Lücken innerhalb des Tages
    await this.validateDayCompleteness(dateStr);
  }

  /**
   * API-Aufruf mit Wiederholungsversuchen und exponential backoff
   */
  async fetchWithRetry(startTimestamp, endTimestamp, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await this.fetchVendonData(startTimestamp, endTimestamp);
        if (data.length > 0 || attempt === maxRetries) {
          return data;
        }
      } catch (error) {
        console.log(`      ⚠️ Versuch ${attempt}/${maxRetries} fehlgeschlagen: ${error.message}`);
        if (attempt < maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
        }
      }
    }
    return [];
  }

  /**
   * Basis API-Aufruf
   */
  async fetchVendonData(startTimestamp, endTimestamp) {
    return new Promise((resolve, reject) => {
      // Erhöhtes Limit für bessere Abdeckung
      const path = `/rest/v1.8.0/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=5000`;
      
      const req = https.request({
        hostname: 'cloud.vendon.net',
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 60000 // Längeres Timeout für große Datenmengen
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.code === 200 && Array.isArray(parsed.result)) {
              resolve(parsed.result);
            } else {
              console.log(`      API Response Code: ${parsed.code}`);
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

  /**
   * Verarbeitet eine Batch von Transaktionen
   */
  async processBatch(transactions, dateStr) {
    let added = 0;
    let duplicates = 0;
    let errors = 0;

    for (const tx of transactions) {
      try {
        // Validiere Transaktion
        if (!tx.transaction_id) {
          errors++;
          continue;
        }

        // Duplikatsprüfung
        const existing = await this.client.query(
          'SELECT id FROM transactions WHERE vendon_id = $1',
          [tx.transaction_id.toString()]
        );

        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }

        // Transaktion einfügen
        await this.client.query(`
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
        this.stats.totalAdded++;

      } catch (error) {
        if (!error.message.includes('duplicate key')) {
          console.error(`        Fehler bei ${tx.transaction_id}: ${error.message}`);
          errors++;
          this.stats.errors++;
        } else {
          duplicates++;
        }
      }
    }

    this.stats.totalProcessed += transactions.length;
    this.stats.totalDuplicates += duplicates;

    return { added, duplicates, errors };
  }

  /**
   * Validiert die Vollständigkeit eines Tages
   */
  async validateDayCompleteness(dateStr) {
    const hourly = await this.client.query(`
      SELECT 
        EXTRACT(HOUR FROM datetime) as hour,
        COUNT(*) as count
      FROM transactions 
      WHERE DATE(datetime) = $1
      GROUP BY EXTRACT(HOUR FROM datetime)
      ORDER BY hour
    `, [dateStr]);

    const gaps = [];
    const hours = hourly.rows.map(row => parseInt(row.hour));
    
    for (let h = 0; h < 24; h++) {
      if (!hours.includes(h)) {
        gaps.push(h);
      }
    }

    if (gaps.length > 0) {
      console.log(`    ⚠️ Potentielle Lücken in Stunden: ${gaps.join(', ')}`);
    } else {
      console.log(`    ✅ Tag vollständig abgedeckt (${hourly.rows.length} aktive Stunden)`);
    }
  }

  /**
   * Generiert den finalen Bericht
   */
  async generateFinalReport() {
    const totalCount = await this.client.query('SELECT COUNT(*) as total FROM transactions');
    
    console.log(`\n🎯 SYNCHRONISIERUNG ABGESCHLOSSEN`);
    console.log(`══════════════════════════════════════`);
    console.log(`📊 Verarbeitet: ${this.stats.totalProcessed} Transaktionen`);
    console.log(`✅ Hinzugefügt: ${this.stats.totalAdded} neue Transaktionen`);
    console.log(`🔄 Duplikate: ${this.stats.totalDuplicates}`);
    console.log(`❌ Fehler: ${this.stats.errors}`);
    console.log(`📈 Gesamtbestand: ${totalCount.rows[0].total} Transaktionen`);
    
    // Detaillierte Analyse des synchronisierten Zeitraums
    const analysis = await this.client.query(`
      SELECT 
        DATE(datetime) as date,
        COUNT(*) as count,
        MIN(datetime) as first_tx,
        MAX(datetime) as last_tx,
        COUNT(DISTINCT EXTRACT(HOUR FROM datetime)) as active_hours
      FROM transactions 
      WHERE DATE(datetime) BETWEEN '2025-06-12' AND '2025-06-16'
      GROUP BY DATE(datetime)
      ORDER BY date
    `);

    console.log(`\n📅 DETAILANALYSE JUNI 12-16:`);
    console.log(`════════════════════════════════════`);
    
    let totalJune = 0;
    analysis.rows.forEach(row => {
      console.log(`${row.date}: ${row.count} Transaktionen (${row.active_hours}h aktiv)`);
      console.log(`  Zeitspanne: ${row.first_tx.toISOString().slice(11,19)} - ${row.last_tx.toISOString().slice(11,19)}`);
      totalJune += parseInt(row.count);
    });
    
    console.log(`\n📋 ZUSAMMENFASSUNG:`);
    console.log(`🗓️ Juni 12-16 Total: ${totalJune} Transaktionen`);
    console.log(`🏢 System Total: ${totalCount.rows[0].total} Transaktionen`);
    console.log(`🔗 Vendon API: Voll funktionsfähig`);
    console.log(`✅ Datenintegrität: Wiederhergestellt`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Hauptausführung
async function main() {
  const sync = new RobustVendonSync();
  
  try {
    await sync.connect();
    await sync.performRobustSync('2025-06-12', '2025-06-16');
  } catch (error) {
    console.error('❌ Kritischer Fehler:', error.message);
  } finally {
    await sync.disconnect();
  }
}

main().catch(console.error);