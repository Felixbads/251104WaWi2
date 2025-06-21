/**
 * VENDON GAP CRAWLER - AUTOMATISIERTE LÜCKENSCHLIESSUNG
 * Systematischer Crawler der alle Datenlücken bis 01.01.2024 schließt
 * Vergleicht API-Stand mit Datenbankstand und füllt automatisch alle Lücken
 */

import { storage } from "../storage";
import { InsertTransaction, InsertMachine } from "@shared/schema";
import axios from "axios";
import { rawDb } from "../db";

interface DateGap {
  date: string;
  expectedTransactions: number;
  actualTransactions: number;
  gapSize: number;
  priority: 'high' | 'medium' | 'low';
}

interface CrawlerStatus {
  isRunning: boolean;
  currentDate: string | null;
  totalGapsFound: number;
  gapsProcessed: number;
  transactionsRecovered: number;
  startDate: string;
  targetDate: string;
  lastUpdate: Date;
  errors: string[];
}

export class VendonGapCrawler {
  private readonly BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";
  private readonly apiKey: string;
  private readonly TARGET_DATE = new Date('2024-01-01');
  private readonly maxRetries = 3;
  private readonly timeoutMs = 30000;
  private readonly delayBetweenRequests = 1000; // 1 Sekunde zwischen Anfragen

  private status: CrawlerStatus = {
    isRunning: false,
    currentDate: null,
    totalGapsFound: 0,
    gapsProcessed: 0,
    transactionsRecovered: 0,
    startDate: new Date().toISOString().split('T')[0],
    targetDate: '2024-01-01',
    lastUpdate: new Date(),
    errors: []
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
    console.log('🕷️ Vendon Gap Crawler initialisiert - Ziel: Alle Lücken bis 01.01.2024 schließen');
  }

  /**
   * Startet den automatisierten Gap-Crawler
   */
  async startGapCrawling(): Promise<void> {
    if (this.status.isRunning) {
      console.log('Gap Crawler läuft bereits');
      return;
    }

    this.status.isRunning = true;
    this.status.lastUpdate = new Date();
    this.status.errors = [];

    console.log('🚀 Starte automatisierten Gap Crawler...');

    try {
      // 1. Analysiere aktuellen Datenstand
      const analysis = await this.analyzeDataCompleteness();
      console.log('📊 Datenanalyse abgeschlossen:', analysis);

      // 2. Identifiziere alle Lücken
      const gaps = await this.identifyAllGaps();
      this.status.totalGapsFound = gaps.length;
      console.log(`🔍 ${gaps.length} Datenlücken identifiziert`);

      // 3. Priorisiere Lücken (neueste zuerst, dann größte Lücken)
      const prioritizedGaps = this.prioritizeGaps(gaps);

      // 4. Systematisch alle Lücken schließen
      await this.fillAllGaps(prioritizedGaps);

      console.log('✅ Gap Crawler erfolgreich abgeschlossen');

    } catch (error) {
      console.error('❌ Gap Crawler Fehler:', error);
      this.status.errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      this.status.isRunning = false;
      this.status.lastUpdate = new Date();
    }
  }

  /**
   * Analysiert die Vollständigkeit der vorhandenen Daten
   */
  private async analyzeDataCompleteness() {
    const result = await rawDb.query(`
      SELECT 
        DATE(datetime) as date,
        COUNT(*) as transaction_count,
        COUNT(DISTINCT machine_id) as machine_count,
        MIN(datetime) as first_transaction,
        MAX(datetime) as last_transaction
      FROM transactions 
      WHERE datetime >= '2024-01-01' 
        AND source IN ('vendon_api', 'vendon', 'REALTIME')
      GROUP BY DATE(datetime)
      ORDER BY date DESC
      LIMIT 30
    `);

    const stats = await rawDb.query(`
      SELECT 
        MIN(DATE(datetime)) as earliest_date,
        MAX(DATE(datetime)) as latest_date,
        COUNT(DISTINCT DATE(datetime)) as days_with_data,
        COUNT(*) as total_transactions
      FROM transactions 
      WHERE datetime >= '2024-01-01'
        AND source IN ('vendon_api', 'vendon', 'REALTIME')
    `);

    return {
      dailyStats: result.rows,
      overallStats: stats.rows[0],
      analysisDate: new Date()
    };
  }

  /**
   * Identifiziert alle Datenlücken seit dem Target-Datum
   */
  private async identifyAllGaps(): Promise<DateGap[]> {
    console.log('🔍 Identifiziere alle Datenlücken seit 01.01.2024...');

    const gapQuery = `
      WITH RECURSIVE date_series AS (
        SELECT DATE('2024-01-01') as check_date
        UNION ALL
        SELECT DATE(check_date + INTERVAL '1 day')
        FROM date_series
        WHERE check_date < CURRENT_DATE
      ),
      daily_counts AS (
        SELECT 
          DATE(datetime) as transaction_date,
          COUNT(*) as actual_count,
          COUNT(DISTINCT machine_id) as machine_count
        FROM transactions 
        WHERE datetime >= '2024-01-01'
          AND source IN ('vendon_api', 'vendon', 'REALTIME')
        GROUP BY DATE(datetime)
      ),
      expected_counts AS (
        SELECT 
          ds.check_date,
          CASE 
            WHEN EXTRACT(DOW FROM ds.check_date) IN (0, 6) THEN 50  -- Wochenende: weniger Transaktionen
            WHEN EXTRACT(DOW FROM ds.check_date) = 1 THEN 40  -- Montag: etwas weniger
            ELSE 100   -- Werktage: normale Anzahl
          END as expected_transactions
        FROM date_series ds
      )
      SELECT 
        ec.check_date as date,
        ec.expected_transactions,
        COALESCE(dc.actual_count, 0) as actual_transactions,
        GREATEST(0, ec.expected_transactions - COALESCE(dc.actual_count, 0)) as gap_size,
        CASE 
          WHEN dc.actual_count IS NULL THEN 'high'
          WHEN dc.actual_count < (ec.expected_transactions * 0.3) THEN 'high'
          WHEN dc.actual_count < (ec.expected_transactions * 0.7) THEN 'medium'
          ELSE 'low'
        END as priority
      FROM expected_counts ec
      LEFT JOIN daily_counts dc ON ec.check_date = dc.transaction_date
      WHERE COALESCE(dc.actual_count, 0) < ec.expected_transactions
      ORDER BY ec.check_date DESC
    `;

    const result = await rawDb.query(gapQuery);
    
    return result.rows.map(row => ({
      date: row.date,
      expectedTransactions: parseInt(row.expected_transactions),
      actualTransactions: parseInt(row.actual_transactions),
      gapSize: parseInt(row.gap_size),
      priority: row.priority as 'high' | 'medium' | 'low'
    }));
  }

  /**
   * Priorisiert Lücken nach Wichtigkeit
   */
  private prioritizeGaps(gaps: DateGap[]): DateGap[] {
    return gaps.sort((a, b) => {
      // Erst nach Priorität sortieren
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      
      // Dann nach Datum (neueste zuerst)
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  /**
   * Füllt systematisch alle identifizierten Lücken
   */
  private async fillAllGaps(gaps: DateGap[]): Promise<void> {
    console.log(`🔧 Beginne systematische Lückenschließung für ${gaps.length} Lücken...`);

    for (let i = 0; i < gaps.length; i++) {
      const gap = gaps[i];
      this.status.currentDate = gap.date;
      this.status.gapsProcessed = i + 1;

      console.log(`📅 Verarbeite Lücke ${i + 1}/${gaps.length}: ${gap.date} (${gap.priority} Priorität, ${gap.gapSize} fehlende Transaktionen)`);

      try {
        const recovered = await this.fillSingleDateGap(gap);
        this.status.transactionsRecovered += recovered;
        
        console.log(`✅ Lücke für ${gap.date} geschlossen: ${recovered} Transaktionen wiederhergestellt`);

        // Fortschritt aktualisieren
        this.status.lastUpdate = new Date();

        // Pause zwischen Anfragen um API nicht zu überlasten
        if (i < gaps.length - 1) {
          await this.sleep(this.delayBetweenRequests);
        }

      } catch (error) {
        const errorMsg = `Fehler bei ${gap.date}: ${error instanceof Error ? error.message : error}`;
        console.error(`❌ ${errorMsg}`);
        this.status.errors.push(errorMsg);
        
        // Bei Fehlern etwas länger warten
        await this.sleep(this.delayBetweenRequests * 2);
      }
    }
  }

  /**
   * Füllt eine einzelne Datumslücke
   */
  private async fillSingleDateGap(gap: DateGap): Promise<number> {
    const date = new Date(gap.date);
    const startTimestamp = Math.floor(date.getTime() / 1000);
    const endTimestamp = Math.floor((date.getTime() + 24 * 60 * 60 * 1000 - 1) / 1000);

    console.log(`🔄 Hole Daten für ${gap.date} von Vendon API...`);

    let recovered = 0;
    let offset = 0;
    const limit = 500;

    while (true) {
      const transactions = await this.fetchVendonDataRobust(startTimestamp, endTimestamp, offset, limit);
      
      if (!transactions || transactions.length === 0) {
        break;
      }

      console.log(`📦 ${transactions.length} Transaktionen für ${gap.date} erhalten (Offset: ${offset})`);

      // Speichere jede Transaktion
      for (const transaction of transactions) {
        try {
          const saved = await this.saveTransactionSafely(transaction);
          if (saved) {
            recovered++;
          }
        } catch (error) {
          console.error(`Fehler beim Speichern von Transaktion ${transaction.id}:`, error);
        }
      }

      // Wenn weniger als limit Transaktionen zurückkommen, sind wir fertig
      if (transactions.length < limit) {
        break;
      }

      offset += limit;
      
      // Kurze Pause zwischen Batches
      await this.sleep(500);
    }

    return recovered;
  }

  /**
   * Robuster API-Aufruf mit Wiederholungen
   */
  private async fetchVendonDataRobust(startTimestamp: number, endTimestamp: number, offset = 0, limit = 500) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.get(`${this.BASE_URL}/stats/vends`, {
          params: {
            from_timestamp: startTimestamp,
            to_timestamp: endTimestamp,
            offset: offset,
            limit: limit
          },
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Accept': 'application/json'
          },
          timeout: this.timeoutMs
        });
        
        if (response.data && response.data.code === 200 && Array.isArray(response.data.result)) {
          return response.data.result;
        } else {
          console.warn(`Unerwartete API-Antwort (Versuch ${attempt}):`, response.data);
          return [];
        }
        
      } catch (error) {
        console.error(`API-Aufruf fehlgeschlagen (Versuch ${attempt}/${this.maxRetries}):`, error instanceof Error ? error.message : error);
        
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }
    
    return [];
  }

  /**
   * Speichert Transaktion sicher (ohne Duplikate)
   */
  private async saveTransactionSafely(vendonTransaction: any): Promise<boolean> {
    try {
      const transactionId = vendonTransaction.id?.toString();
      if (!transactionId) {
        return false;
      }

      // Prüfe ob bereits vorhanden
      const existing = await storage.getTransactionByVendonId(transactionId);
      if (existing) {
        return false; // Bereits vorhanden
      }

      // Hole oder erstelle Maschine
      let machineId = 1;
      if (vendonTransaction.machine_id) {
        const machineResult = await this.getOrCreateMachine(vendonTransaction);
        machineId = machineResult.id;
      }

      const datetime = vendonTransaction.datetime 
        ? new Date(vendonTransaction.datetime * 1000)
        : new Date();

      const newTransaction: InsertTransaction = {
        vendonId: transactionId,
        machineId: machineId,
        machineName: vendonTransaction.machine_name || 'Unbekannte Maschine',
        datetime: datetime,
        productName: vendonTransaction.name || vendonTransaction.product_name || 'Unbekanntes Produkt',
        price: vendonTransaction.price || 0,
        quantity: vendonTransaction.quantity || 1,
        source: 'vendon_api_crawler',
        extraData: JSON.stringify(vendonTransaction)
      };

      await storage.createTransaction(newTransaction);
      return true;

    } catch (error) {
      console.error('Fehler beim sicheren Speichern:', error);
      return false;
    }
  }

  /**
   * Holt oder erstellt Maschine
   */
  private async getOrCreateMachine(vendonTransaction: any) {
    const vendonId = vendonTransaction.machine_id.toString();
    
    const existingMachine = await storage.getMachineByVendonId(vendonId);
    if (existingMachine) {
      return existingMachine;
    }

    const newMachine: InsertMachine = {
      vendonId: vendonId,
      machineName: vendonTransaction.machine_name || `Maschine ${vendonId}`,
      lastSync: new Date()
    };

    return await storage.createMachine(newMachine);
  }

  /**
   * Stoppt den Crawler
   */
  stopCrawling(): void {
    this.status.isRunning = false;
    console.log('🛑 Gap Crawler gestoppt');
  }

  /**
   * Gibt den aktuellen Status zurück
   */
  getStatus(): CrawlerStatus {
    return { ...this.status };
  }

  /**
   * Generiert einen detaillierten Fortschrittsbericht
   */
  async generateProgressReport() {
    const analysis = await this.analyzeDataCompleteness();
    const remainingGaps = await this.identifyAllGaps();
    
    return {
      status: this.status,
      analysis,
      remainingGaps: remainingGaps.length,
      completionPercentage: this.status.totalGapsFound > 0 
        ? Math.round((this.status.gapsProcessed / this.status.totalGapsFound) * 100)
        : 0,
      estimatedCompletion: this.estimateCompletion(),
      lastUpdate: new Date()
    };
  }

  /**
   * Schätzt die verbleibende Zeit bis zur Vollendung
   */
  private estimateCompletion(): string {
    if (!this.status.isRunning || this.status.gapsProcessed === 0) {
      return 'Unbekannt';
    }

    const avgTimePerGap = (Date.now() - new Date(this.status.startDate).getTime()) / this.status.gapsProcessed;
    const remainingGaps = this.status.totalGapsFound - this.status.gapsProcessed;
    const estimatedMs = remainingGaps * avgTimePerGap;
    
    const hours = Math.floor(estimatedMs / (1000 * 60 * 60));
    const minutes = Math.floor((estimatedMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  }

  /**
   * Hilfsfunktion für Delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Exportiere Singleton-Instanz
export const vendonGapCrawler = new VendonGapCrawler();