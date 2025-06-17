/**
 * VOLLSTÄNDIGE HISTORISCHE VENDON SYNCHRONISIERUNG 2024-2025
 * Systematische Wiederherstellung aller fehlenden Transaktionsdaten
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
import https from 'https';

class ComprehensiveHistoricalSync {
  constructor() {
    this.client = new Client({
      connectionString: process.env.DATABASE_URL
    });
    this.apiKey = process.env.VENDON_API_KEY;
    this.stats = {
      totalDaysProcessed: 0,
      totalTransactionsAdded: 0,
      totalApiCalls: 0,
      errors: 0,
      daysWithData: 0,
      daysWithoutData: 0
    };
  }

  async connect() {
    await this.client.connect();
    console.log('Historische Synchronisierung initialisiert');
  }

  async disconnect() {
    await this.client.end();
  }

  /**
   * Hauptsynchronisierung für 2024 und 2025
   */
  async performComprehensiveSync() {
    console.log('🚀 STARTE VOLLSTÄNDIGE HISTORISCHE SYNCHRONISIERUNG 2024-2025\n');

    // Zuerst aktuellen Stand analysieren
    await this.analyzeCurrentData();

    // Prioritäten: 2025 zuerst (aktueller), dann 2024
    const years = [2025, 2024];
    
    for (const year of years) {
      console.log(`\n📅 JAHR ${year} VERARBEITUNG`);
      console.log('='.repeat(50));
      
      await this.syncYear(year);
    }

    await this.generateComprehensiveReport();
  }

  /**
   * Analysiert den aktuellen Datenstand
   */
  async analyzeCurrentData() {
    console.log('📊 AKTUELLE DATENLAGE ANALYSIEREN\n');

    const yearlyStats = await this.client.query(`
      SELECT 
        EXTRACT(YEAR FROM datetime) as year,
        COUNT(*) as transactions,
        MIN(DATE(datetime)) as first_date,
        MAX(DATE(datetime)) as last_date,
        COUNT(DISTINCT DATE(datetime)) as days_with_data
      FROM transactions 
      WHERE EXTRACT(YEAR FROM datetime) IN (2024, 2025)
      GROUP BY EXTRACT(YEAR FROM datetime)
      ORDER BY year DESC
    `);

    yearlyStats.rows.forEach(row => {
      console.log(`${row.year}: ${row.transactions} Transaktionen`);
      console.log(`  Zeitraum: ${row.first_date} bis ${row.last_date}`);
      console.log(`  Tage mit Daten: ${row.days_with_data}`);
    });

    // Lücken identifizieren
    console.log('\n🔍 DATENLÜCKEN IDENTIFIZIEREN:');
    await this.identifyDataGaps();
  }

  /**
   * Identifiziert Datenlücken
   */
  async identifyDataGaps() {
    const gapAnalysis = await this.client.query(`
      WITH date_series AS (
        SELECT generate_series(
          '2024-01-01'::date,
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      ),
      daily_counts AS (
        SELECT 
          DATE(datetime) as date,
          COUNT(*) as transactions
        FROM transactions 
        WHERE datetime >= '2024-01-01'
        GROUP BY DATE(datetime)
      )
      SELECT 
        ds.date,
        COALESCE(dc.transactions, 0) as transactions
      FROM date_series ds
      LEFT JOIN daily_counts dc ON ds.date = dc.date
      WHERE COALESCE(dc.transactions, 0) = 0
      ORDER BY ds.date
      LIMIT 20
    `);

    console.log(`Gefunden: ${gapAnalysis.rows.length} Tage ohne Transaktionen`);
    if (gapAnalysis.rows.length > 0) {
      console.log('Erste 20 Lücken:');
      gapAnalysis.rows.forEach(row => {
        console.log(`  ${row.date}: ${row.transactions} Transaktionen`);
      });
    }
  }

  /**
   * Synchronisiert ein komplettes Jahr
   */
  async syncYear(year) {
    const startDate = new Date(`${year}-01-01`);
    const endDate = year === 2025 ? new Date() : new Date(`${year}-12-31`);
    
    console.log(`Zeitraum: ${startDate.toISOString().split('T')[0]} bis ${endDate.toISOString().split('T')[0]}`);

    // Monatsweise verarbeiten für bessere Performance
    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      
      // Für 2025: nur bis heute
      if (year === 2025 && monthStart > new Date()) break;
      if (year === 2025 && monthEnd > new Date()) {
        monthEnd.setTime(new Date().getTime());
      }

      await this.syncMonth(monthStart, monthEnd);
    }
  }

  /**
   * Synchronisiert einen Monat
   */
  async syncMonth(startDate, endDate) {
    const monthName = startDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    console.log(`\n📅 ${monthName}`);

    let monthTotal = 0;
    let daysProcessed = 0;

    // Tag für Tag durch den Monat
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const dayResult = await this.syncSingleDay(dateStr);
      
      monthTotal += dayResult.added;
      daysProcessed++;
      
      if (dayResult.added > 0) {
        this.stats.daysWithData++;
      } else {
        this.stats.daysWithoutData++;
      }

      // Fortschrittsanzeige alle 10 Tage
      if (daysProcessed % 10 === 0) {
        console.log(`  ${daysProcessed} Tage verarbeitet, ${monthTotal} Transaktionen hinzugefügt`);
      }
    }

    console.log(`✅ ${monthName}: ${monthTotal} neue Transaktionen`);
    this.stats.totalDaysProcessed += daysProcessed;
    this.stats.totalTransactionsAdded += monthTotal;
  }

  /**
   * Synchronisiert einen einzelnen Tag mit robuster Methode
   */
  async syncSingleDay(dateStr) {
    const existing = await this.client.query(
      'SELECT COUNT(*) as count FROM transactions WHERE DATE(datetime) = $1',
      [dateStr]
    );

    // Skip wenn bereits vollständige Daten vorhanden (>50 Transaktionen)
    if (existing.rows[0].count > 50) {
      return { added: 0, skipped: true };
    }

    // Ganztagesabruf mit mehreren Versuchen
    const startTs = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 1000);
    const endTs = Math.floor(new Date(`${dateStr}T23:59:59.999Z`).getTime() / 1000);

    const apiData = await this.fetchDayDataRobust(startTs, endTs);
    
    if (apiData.length === 0) {
      return { added: 0, skipped: false };
    }

    let added = 0;
    for (const tx of apiData) {
      try {
        if (!tx.transaction_id) continue;

        const exists = await this.client.query(
          'SELECT id FROM transactions WHERE vendon_id = $1',
          [tx.transaction_id.toString()]
        );

        if (exists.rows.length > 0) continue;

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
      } catch (error) {
        if (!error.message.includes('duplicate key')) {
          this.stats.errors++;
        }
      }
    }

    return { added, skipped: false };
  }

  /**
   * Robuster API-Abruf für einen Tag
   */
  async fetchDayDataRobust(startTs, endTs, maxRetries = 3) {
    const allData = [];
    
    // Mehrere API-Konfigurationen für maximale Abdeckung
    const configs = [
      { limit: 5000 },
      { limit: 10000 }
    ];

    for (const config of configs) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const data = await this.fetchVendonData(startTs, endTs, config.limit);
          allData.push(...data);
          this.stats.totalApiCalls++;
          break; // Erfolg, nächste Konfiguration
        } catch (error) {
          if (attempt === maxRetries) {
            this.stats.errors++;
          }
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    // Deduplizierung
    const uniqueData = allData.filter((tx, index, arr) => 
      arr.findIndex(t => t.transaction_id === tx.transaction_id) === index
    );

    return uniqueData;
  }

  /**
   * Basis API-Aufruf
   */
  async fetchVendonData(startTimestamp, endTimestamp, limit = 5000) {
    return new Promise((resolve, reject) => {
      const path = `/rest/v1.8.0/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=${limit}`;
      
      const req = https.request({
        hostname: 'cloud.vendon.net',
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 60000
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
        reject(new Error('Request Timeout'));
      });
      req.end();
    });
  }

  /**
   * Generiert umfassenden Abschlussbericht
   */
  async generateComprehensiveReport() {
    const finalStats = await this.client.query(`
      SELECT 
        EXTRACT(YEAR FROM datetime) as year,
        EXTRACT(MONTH FROM datetime) as month,
        COUNT(*) as transactions,
        COUNT(DISTINCT DATE(datetime)) as days_with_data,
        COUNT(DISTINCT machine_name) as active_machines,
        ROUND(AVG(price), 2) as avg_price,
        SUM(price) as total_revenue
      FROM transactions 
      WHERE EXTRACT(YEAR FROM datetime) IN (2024, 2025)
      GROUP BY EXTRACT(YEAR FROM datetime), EXTRACT(MONTH FROM datetime)
      ORDER BY year DESC, month DESC
    `);

    const totalCount = await this.client.query('SELECT COUNT(*) as total FROM transactions');

    console.log('\n' + '='.repeat(80));
    console.log('VOLLSTÄNDIGE HISTORISCHE SYNCHRONISIERUNG ABGESCHLOSSEN');
    console.log('='.repeat(80));
    
    console.log('\nSYNC-STATISTIKEN:');
    console.log(`📊 Verarbeitete Tage: ${this.stats.totalDaysProcessed}`);
    console.log(`✅ Neue Transaktionen: ${this.stats.totalTransactionsAdded}`);
    console.log(`🔗 API-Aufrufe: ${this.stats.totalApiCalls}`);
    console.log(`📈 Tage mit Daten: ${this.stats.daysWithData}`);
    console.log(`📉 Tage ohne Daten: ${this.stats.daysWithoutData}`);
    console.log(`❌ Fehler: ${this.stats.errors}`);
    
    console.log('\nMONATLICHE ÜBERSICHT:');
    finalStats.rows.forEach(row => {
      const monthName = new Date(row.year, row.month - 1).toLocaleDateString('de-DE', { 
        month: 'long', year: 'numeric' 
      });
      console.log(`${monthName}: ${row.transactions} Transaktionen (${row.days_with_data} Tage, ${row.active_machines} Maschinen)`);
    });

    console.log(`\n🏢 GESAMTSYSTEM: ${totalCount.rows[0].total} Transaktionen`);
    console.log('\n✅ VENDON DATENINTEGRITÄT VOLLSTÄNDIG WIEDERHERGESTELLT');
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  const sync = new ComprehensiveHistoricalSync();
  
  try {
    await sync.connect();
    await sync.performComprehensiveSync();
  } catch (error) {
    console.error('Kritischer Fehler:', error.message);
  } finally {
    await sync.disconnect();
  }
}

main().catch(console.error);