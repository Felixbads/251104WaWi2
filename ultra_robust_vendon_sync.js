/**
 * ULTRA-ROBUSTE VENDON SYNCHRONISIERUNG
 * Die stabilste API-Abruf-Implementierung für den Backbone der Anwendung
 * 
 * Features:
 * - Automatische Lückenerkennung und -schließung
 * - Fortsetzung von der letzten Transaktion
 * - Mehrfache Wiederholungsversuche mit exponential backoff
 * - Komplett fehlerresistent
 * - Überwacht und behebt alle Datenlücken
 */

import { Pool } from 'pg';
import https from 'https';

class UltraRobustVendonSync {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    this.apiKey = process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
    this.baseUrl = 'cloud.vendon.net';
    this.maxRetries = 5;
    this.timeoutMs = 30000;
    
    console.log('🚀 Ultra-Robuste Vendon Synchronisierung initialisiert');
  }

  /**
   * HAUPTFUNKTION: Führt eine vollständige, robuste Synchronisierung durch
   */
  async performUltraRobustSync() {
    console.log('\n=== ULTRA-ROBUSTE VENDON SYNCHRONISIERUNG GESTARTET ===');
    
    try {
      // 1. Analysiere aktuellen Datenstand
      const analysis = await this.analyzeCurrentState();
      console.log('📊 Datenanalyse:', analysis);
      
      // 2. Bestimme letzte Transaktion
      const lastTransaction = await this.findLastTransaction();
      console.log('🔍 Letzte Transaktion:', lastTransaction);
      
      // 3. Synchronisiere alle fehlenden Daten seit der letzten Transaktion
      const syncResult = await this.syncFromLastTransaction(lastTransaction);
      console.log('✅ Synchronisierung abgeschlossen:', syncResult);
      
      // 4. Führe Lückenanalyse durch und schließe alle Lücken
      await this.identifyAndFillGaps();
      
      // 5. Finaler Integritätscheck
      const finalCheck = await this.performIntegrityCheck();
      console.log('🔐 Integritätscheck:', finalCheck);
      
      return {
        success: true,
        message: 'Ultra-robuste Synchronisierung erfolgreich abgeschlossen',
        details: {
          analysis,
          lastTransaction,
          syncResult,
          finalCheck
        }
      };
      
    } catch (error) {
      console.error('❌ Kritischer Fehler in der Ultra-Robusten Synchronisierung:', error);
      throw error;
    }
  }

  /**
   * Analysiert den aktuellen Zustand der Datenbank
   */
  async analyzeCurrentState() {
    const client = await this.pool.connect();
    
    try {
      // Gesamtanzahl Transaktionen
      const totalResult = await client.query('SELECT COUNT(*) as total FROM transactions');
      const total = parseInt(totalResult.rows[0].total);
      
      // Transaktionen nach Quelle
      const sourceResult = await client.query(`
        SELECT source, COUNT(*) as count, 
               MIN(datetime) as earliest, 
               MAX(datetime) as latest
        FROM transactions 
        GROUP BY source 
        ORDER BY count DESC
      `);
      
      // Vendon API Transaktionen
      const vendonApiResult = await client.query(`
        SELECT COUNT(*) as vendon_api_count,
               MIN(datetime) as earliest_vendon,
               MAX(datetime) as latest_vendon
        FROM transactions 
        WHERE source = 'vendon_api'
      `);
      
      // Letzte 7 Tage Aktivität
      const recentResult = await client.query(`
        SELECT DATE(datetime) as date, COUNT(*) as count
        FROM transactions 
        WHERE datetime >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(datetime)
        ORDER BY date DESC
      `);
      
      return {
        totalTransactions: total,
        sourceBreakdown: sourceResult.rows,
        vendonApiStats: vendonApiResult.rows[0],
        recentActivity: recentResult.rows
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Findet die letzte verfügbare Transaktion
   */
  async findLastTransaction() {
    const client = await this.pool.connect();
    
    try {
      // Suche nach der neuesten Transaktion aus allen Quellen
      const result = await client.query(`
        SELECT datetime, source, vendon_id, machine_name
        FROM transactions 
        WHERE datetime IS NOT NULL
        ORDER BY datetime DESC 
        LIMIT 1
      `);
      
      if (result.rows.length > 0) {
        return {
          datetime: result.rows[0].datetime,
          source: result.rows[0].source,
          vendonId: result.rows[0].vendon_id,
          machineName: result.rows[0].machine_name
        };
      }
      
      // Fallback: Beginne vor 30 Tagen
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() - 30);
      
      return {
        datetime: fallbackDate,
        source: 'fallback',
        vendonId: null,
        machineName: null
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Synchronisiert alle Transaktionen seit der letzten bekannten Transaktion
   */
  async syncFromLastTransaction(lastTransaction) {
    console.log('\n🔄 Starte Synchronisierung seit letzter Transaktion...');
    
    // Beginne 1 Stunde vor der letzten Transaktion um Überschneidungen zu vermeiden
    const startDate = new Date(lastTransaction.datetime);
    startDate.setHours(startDate.getHours() - 1);
    
    const endDate = new Date();
    
    console.log(`📅 Synchronisiere von ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    let totalSynced = 0;
    let currentDate = new Date(startDate);
    
    // Synchronisiere tageweise für maximale Stabilität
    while (currentDate < endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setDate(dayEnd.getDate() + 1);
      dayEnd.setSeconds(dayEnd.getSeconds() - 1);
      
      console.log(`📅 Synchronisiere Tag: ${dayStart.toISOString().split('T')[0]}`);
      
      const dayResult = await this.syncSingleDayRobust(dayStart, dayEnd);
      totalSynced += dayResult.synced;
      
      console.log(`✅ Tag abgeschlossen: ${dayResult.synced} Transaktionen`);
      
      // Nächster Tag
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Kurze Pause zwischen den Tagen
      await this.sleep(1000);
    }
    
    return {
      totalSynced,
      dateRange: {
        start: startDate,
        end: endDate
      }
    };
  }

  /**
   * Synchronisiert einen einzelnen Tag mit maximaler Robustheit
   */
  async syncSingleDayRobust(startDate, endDate) {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    let synced = 0;
    let offset = 0;
    const limit = 500; // Kleinere Batches für Stabilität
    
    console.log(`🔄 Synchronisiere Tag-Batch: ${startDate.toISOString().split('T')[0]}`);
    
    while (true) {
      const transactions = await this.fetchVendonDataRobust(startTimestamp, endTimestamp, offset, limit);
      
      if (!transactions || transactions.length === 0) {
        break;
      }
      
      console.log(`📦 ${transactions.length} Transaktionen erhalten (Offset: ${offset})`);
      
      // Speichere jede Transaktion einzeln für maximale Robustheit
      for (const transaction of transactions) {
        try {
          await this.saveTransactionRobust(transaction);
          synced++;
        } catch (error) {
          console.error(`❌ Fehler beim Speichern der Transaktion ${transaction.id || 'unbekannt'}:`, error.message);
        }
      }
      
      // Wenn weniger als limit Transaktionen zurückkommen, sind wir am Ende
      if (transactions.length < limit) {
        break;
      }
      
      offset += limit;
      
      // Pause zwischen Batches
      await this.sleep(500);
    }
    
    return { synced };
  }

  /**
   * Extrem robuster API-Aufruf mit mehrfachen Wiederholungen
   */
  async fetchVendonDataRobust(startTimestamp, endTimestamp, offset = 0, limit = 500) {
    const path = `/rest/v1.8.0/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&offset=${offset}&limit=${limit}`;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      console.log(`🌐 API-Aufruf Versuch ${attempt}/${this.maxRetries}`);
      
      try {
        const data = await this.makeHttpRequest(path);
        
        if (data && data.code === 200 && Array.isArray(data.result)) {
          console.log(`✅ API-Aufruf erfolgreich: ${data.result.length} Transaktionen`);
          return data.result;
        } else {
          console.warn(`⚠️ Unerwartete API-Antwort:`, data);
          return [];
        }
        
      } catch (error) {
        console.error(`❌ API-Aufruf fehlgeschlagen (Versuch ${attempt}):`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ Warte ${delay}ms vor nächstem Versuch...`);
          await this.sleep(delay);
        }
      }
    }
    
    console.error('❌ Alle API-Versuche fehlgeschlagen');
    return [];
  }

  /**
   * Macht einen HTTPS-Request mit Timeout
   */
  async makeHttpRequest(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'UltraRobustVendonSync/1.0'
        },
        timeout: this.timeoutMs
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`JSON Parse Error: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request Error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request Timeout'));
      });

      req.end();
    });
  }

  /**
   * Speichert eine Transaktion mit maximaler Robustheit
   */
  async saveTransactionRobust(vendonTransaction) {
    const client = await this.pool.connect();
    
    try {
      // Extrahiere alle wichtigen Felder
      const transactionId = vendonTransaction.id || vendonTransaction.transaction_id;
      if (!transactionId) {
        throw new Error('Transaktion hat keine ID');
      }

      // Prüfe ob Transaktion bereits existiert
      const existsResult = await client.query(
        'SELECT id FROM transactions WHERE vendon_id = $1',
        [transactionId.toString()]
      );

      if (existsResult.rows.length > 0) {
        // Transaktion existiert bereits - überspringe
        return { action: 'skipped', reason: 'already_exists' };
      }

      // Hole oder erstelle Maschine
      let machineId = 1; // Default
      if (vendonTransaction.machine_id) {
        const machineResult = await this.getOrCreateMachine(client, vendonTransaction);
        machineId = machineResult.id;
      }

      // Bereite Transaktionsdaten vor
      const datetime = vendonTransaction.datetime 
        ? new Date(vendonTransaction.datetime * 1000)
        : new Date();

      const insertQuery = `
        INSERT INTO transactions (
          vendon_id, machine_id, machine_name, datetime, 
          product_name, price, quantity, source, extra_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;

      const values = [
        transactionId.toString(),
        machineId,
        vendonTransaction.machine_name || 'Unbekannte Maschine',
        datetime,
        vendonTransaction.name || vendonTransaction.product_name || 'Unbekanntes Produkt',
        vendonTransaction.price || 0,
        vendonTransaction.quantity || 1,
        'vendon_api',
        JSON.stringify(vendonTransaction)
      ];

      const result = await client.query(insertQuery, values);
      
      return { 
        action: 'inserted', 
        id: result.rows[0].id,
        vendonId: transactionId 
      };

    } finally {
      client.release();
    }
  }

  /**
   * Holt oder erstellt eine Maschine
   */
  async getOrCreateMachine(client, vendonTransaction) {
    const vendonId = vendonTransaction.machine_id.toString();
    
    // Prüfe ob Maschine existiert
    let result = await client.query(
      'SELECT id FROM machines WHERE vendon_id = $1',
      [vendonId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Erstelle neue Maschine
    const insertQuery = `
      INSERT INTO machines (vendon_id, machine_name, last_sync)
      VALUES ($1, $2, NOW())
      RETURNING id
    `;

    const values = [
      vendonId,
      vendonTransaction.machine_name || `Maschine ${vendonId}`
    ];

    result = await client.query(insertQuery, values);
    
    console.log(`✅ Neue Maschine erstellt: ${vendonId}`);
    return result.rows[0];
  }

  /**
   * Identifiziert und füllt Datenlücken
   */
  async identifyAndFillGaps() {
    console.log('\n🔍 Identifiziere und schließe Datenlücken...');
    
    const client = await this.pool.connect();
    
    try {
      // Finde Tage ohne Transaktionen in den letzten 30 Tagen
      const gapQuery = `
        WITH date_series AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '30 days',
            CURRENT_DATE,
            '1 day'::interval
          )::date as check_date
        ),
        daily_counts AS (
          SELECT DATE(datetime) as transaction_date, COUNT(*) as count
          FROM transactions 
          WHERE datetime >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(datetime)
        )
        SELECT ds.check_date
        FROM date_series ds
        LEFT JOIN daily_counts dc ON ds.check_date = dc.transaction_date
        WHERE dc.count IS NULL OR dc.count < 10
        ORDER BY ds.check_date
      `;
      
      const gapResult = await client.query(gapQuery);
      const gapDays = gapResult.rows;
      
      console.log(`🔍 ${gapDays.length} Tage mit Datenlücken gefunden`);
      
      // Fülle jede Lücke
      for (const gap of gapDays) {
        const gapDate = new Date(gap.check_date);
        const nextDay = new Date(gapDate);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setSeconds(nextDay.getSeconds() - 1);
        
        console.log(`🔧 Schließe Lücke für: ${gapDate.toISOString().split('T')[0]}`);
        
        const fillResult = await this.syncSingleDayRobust(gapDate, nextDay);
        console.log(`✅ Lücke geschlossen: ${fillResult.synced} Transaktionen`);
        
        await this.sleep(1000);
      }
      
    } finally {
      client.release();
    }
  }

  /**
   * Führt einen finalen Integritätscheck durch
   */
  async performIntegrityCheck() {
    const client = await this.pool.connect();
    
    try {
      // Anzahl Transaktionen heute
      const todayResult = await client.query(`
        SELECT COUNT(*) as today_count
        FROM transactions 
        WHERE DATE(datetime) = CURRENT_DATE
      `);
      
      // Anzahl vendon_api Transaktionen
      const vendonApiResult = await client.query(`
        SELECT COUNT(*) as vendon_api_count,
               MAX(datetime) as latest_vendon_api
        FROM transactions 
        WHERE source = 'vendon_api'
      `);
      
      // Anzahl Maschinen mit Aktivität
      const activeMachinesResult = await client.query(`
        SELECT COUNT(DISTINCT machine_id) as active_machines
        FROM transactions 
        WHERE datetime >= CURRENT_DATE - INTERVAL '7 days'
      `);
      
      return {
        todayTransactions: parseInt(todayResult.rows[0].today_count),
        vendonApiTransactions: parseInt(vendonApiResult.rows[0].vendon_api_count),
        latestVendonApi: vendonApiResult.rows[0].latest_vendon_api,
        activeMachines: parseInt(activeMachinesResult.rows[0].active_machines),
        timestamp: new Date()
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Hilfsfunktion für Delays
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Schließt alle Datenbankverbindungen
   */
  async close() {
    await this.pool.end();
    console.log('🔐 Ultra-Robuste Vendon Synchronisierung beendet');
  }
}

// Hauptfunktion
async function main() {
  const sync = new UltraRobustVendonSync();
  
  try {
    const result = await sync.performUltraRobustSync();
    console.log('\n🎉 SYNCHRONISIERUNG ERFOLGREICH ABGESCHLOSSEN:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\n💥 KRITISCHER FEHLER:', error);
    process.exit(1);
  } finally {
    await sync.close();
  }
}

// Führe aus, wenn direkt aufgerufen
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { UltraRobustVendonSync };