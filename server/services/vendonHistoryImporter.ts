/**
 * Vendon Historien-Importer
 * 
 * Ein robuster, tagesbasierter Importer für historische Vendon-Transaktionen
 * - Tagesbasierte Iteration vom konfigurierten Start-Datum bis heute
 * - Pro Tag: Offset-basierte Paginierung mit 100er-Batches
 * - Idempotente Speicherung mit ON CONFLICT DO NOTHING
 * - Robustes Fehlerhandling mit Retry-Mechanismus
 * - Ausführliche Log-Protokollierung
 */

import { Pool } from 'pg';
import { vendonAPI } from './vendonAPI';
import { addDays, format, parseISO, startOfDay, endOfDay, isBefore, isAfter } from 'date-fns';

// Name des Import-Jobs für die sync_state-Tabelle
const JOB_NAME = 'vendon_history_import';

// Konfiguration
interface ImportConfig {
  // Startdatum für den Import (YYYY-MM-DD)
  startDate: string;
  // Endedatum für den Import (YYYY-MM-DD), default: heute
  endDate?: string;
  // Automatisch den Fortschritt speichern nach x Batches (default: 1)
  saveProgressInterval: number;
  // Batch-Größe für API-Anfragen (default: 100, max API-Limit)
  batchSize: number;
  // Maximale Anzahl von Wiederholungsversuchen bei Fehlern (default: 3)
  maxRetries: number;
  // Verzögerung zwischen Wiederholungsversuchen in ms (default: 5000)
  retryDelay: number;
  // Verzögerung zwischen API-Anfragen in ms (default: 1000)
  requestDelay: number;
}

// Import-Ergebnisse
interface ImportResult {
  date: string;
  totalItems: number;
  savedItems: number;
  duplicateItems: number;
  errorItems: number;
  batchesProcessed: number;
  duration: number;
  errorDetails?: Record<string, any>;
}

// Tagesergebnisse für Gesamtreport
interface DailyImportResult extends ImportResult {
  completed: boolean;
}

/**
 * VendonHistoryImporter Klasse
 * Implementiert einen robusten, tagesweisen Import historischer Vendon-Transaktionen
 */
export class VendonHistoryImporter {
  private pool: Pool;
  private config: ImportConfig;
  private dailyResults: Map<string, DailyImportResult>;
  
  /**
   * Konstruktor
   * @param pool PostgreSQL-Verbindung
   * @param customConfig Optionale benutzerdefinierte Konfiguration
   */
  constructor(pool: Pool, customConfig?: Partial<ImportConfig>) {
    this.pool = pool;
    
    // Default-Konfiguration
    const defaultConfig: ImportConfig = {
      startDate: '2015-01-01', // Standardmäßig ab Anfang 2015
      saveProgressInterval: 1,  // Nach jedem Batch speichern
      batchSize: 100,           // 100 Einträge pro Batch (API-Limit)
      maxRetries: 3,            // 3 Wiederholungsversuche bei Fehlern
      retryDelay: 5000,         // 5 Sekunden Wartezeit zwischen Wiederholungen
      requestDelay: 1000        // 1 Sekunde Wartezeit zwischen API-Anfragen
    };
    
    // Konfiguration mit benutzerdefinierten Werten überschreiben
    this.config = { ...defaultConfig, ...customConfig };
    
    // Ergebnisse initialisieren
    this.dailyResults = new Map<string, DailyImportResult>();
    
    // Konfiguration loggen
    console.log('VendonHistoryImporter initialisiert mit Konfiguration:', this.config);
  }
  
  /**
   * Startet den vollständigen Historien-Import
   * @returns Zusammenfassung des Imports
   */
  async runFullImport(): Promise<{ 
    summary: { 
      daysProcessed: number, 
      totalItems: number, 
      savedItems: number, 
      errorItems: number, 
      duplicateItems: number, 
      durationSeconds: number 
    },
    dailyResults: DailyImportResult[] 
  }> {
    console.log('Starte vollständigen Vendon-Historien-Import...');
    
    const startTime = Date.now();
    let totalItems = 0;
    let savedItems = 0;
    let errorItems = 0;
    let duplicateItems = 0;
    let daysProcessed = 0;
    
    // Datumsbereich festlegen
    const startDate = parseISO(this.config.startDate);
    const endDate = this.config.endDate ? parseISO(this.config.endDate) : new Date();
    
    // Cursor aus der Datenbank laden
    let { cursorDate, cursorOffset } = await this.loadSyncState();
    
    // Startdatum anpassen, wenn ein Cursor existiert
    let currentDate = startDate;
    if (cursorDate) {
      currentDate = parseISO(cursorDate);
      console.log(`Fortsetzen vom letzten Cursor: ${cursorDate} mit Offset ${cursorOffset}`);
    }
    
    // Tagesweise durchlaufen
    while (!isAfter(currentDate, endDate)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      console.log(`Verarbeite Tag: ${dateStr}`);
      
      try {
        // Initialen Offset setzen (wenn Cursor für diesen Tag existiert)
        const initialOffset = dateStr === cursorDate ? cursorOffset : 0;
        
        // Tag importieren
        const result = await this.importDay(currentDate, initialOffset);
        
        // Gesamtstatistik aktualisieren
        totalItems += result.totalItems;
        savedItems += result.savedItems;
        errorItems += result.errorItems;
        duplicateItems += result.duplicateItems;
        daysProcessed++;
        
        // Tagesergebnis speichern
        this.dailyResults.set(dateStr, {
          ...result,
          completed: true
        });
        
        // Vollständigkeitsprüfungen für den Tag durchführen
        await this.checkDayCompleteness(dateStr);
        
        // Cursor zurücksetzen für den nächsten Tag
        cursorOffset = 0;
      } catch (error) {
        console.error(`Fehler beim Import für Tag ${dateStr}:`, error);
        
        // Fehlgeschlagenen Tag im Ergebnis speichern
        this.dailyResults.set(dateStr, {
          date: dateStr,
          totalItems: 0,
          savedItems: 0,
          duplicateItems: 0,
          errorItems: 1,
          batchesProcessed: 0,
          duration: 0,
          completed: false,
          errorDetails: { message: error instanceof Error ? error.message : String(error) }
        });
        
        // Wir brechen nicht ab, sondern versuchen den nächsten Tag
        errorItems++;
      }
      
      // Zum nächsten Tag
      currentDate = addDays(currentDate, 1);
    }
    
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    // Gesamtergebnis erstellen
    const summary = {
      daysProcessed,
      totalItems,
      savedItems,
      errorItems,
      duplicateItems,
      durationSeconds
    };
    
    // Sync-Log erstellen
    await this.createSyncLog(summary);
    
    console.log('Vendon-Historien-Import abgeschlossen', summary);
    
    return { 
      summary, 
      dailyResults: Array.from(this.dailyResults.values())
    };
  }
  
  /**
   * Importiert Transaktionen für einen Tag
   * @param date Datum
   * @param initialOffset Start-Offset
   * @returns Import-Ergebnis für den Tag
   */
  private async importDay(date: Date, initialOffset: number = 0): Promise<ImportResult> {
    const dateStr = format(date, 'yyyy-MM-dd');
    const startTime = Date.now();
    
    console.log(`Import für ${dateStr} mit initialem Offset ${initialOffset} gestartet`);
    
    // Zeitraum für den Tag festlegen (00:00:00 bis 23:59:59)
    const fromDate = startOfDay(date);
    const toDate = endOfDay(date);
    
    let offset = initialOffset;
    let totalItems = 0;
    let savedItems = 0;
    let duplicateItems = 0;
    let errorItems = 0;
    let batchesProcessed = 0;
    let hasMore = true;
    
    // Paging-Loop
    while (hasMore) {
      try {
        console.log(`${dateStr}: Lade Batch mit Offset ${offset}, Batch-Größe ${this.config.batchSize}`);
        
        // Transaktionen von der API holen
        const transactions = await this.fetchTransactionBatch(
          fromDate, 
          toDate, 
          offset, 
          this.config.batchSize
        );
        
        if (!transactions || transactions.length === 0) {
          console.log(`${dateStr}: Keine weiteren Transaktionen gefunden.`);
          hasMore = false;
          break;
        }
        
        totalItems += transactions.length;
        batchesProcessed++;
        
        console.log(`${dateStr}: ${transactions.length} Transaktionen geladen`);
        
        // Transaktionen in der Datenbank speichern
        const saveResult = await this.saveTransactions(transactions);
        
        savedItems += saveResult.saved;
        duplicateItems += saveResult.duplicates;
        errorItems += saveResult.errors;
        
        console.log(`${dateStr}: Batch ${batchesProcessed} verarbeitet - ${saveResult.saved} gespeichert, ${saveResult.duplicates} Duplikate, ${saveResult.errors} Fehler`);
        
        // Offset aktualisieren
        offset += transactions.length;
        
        // Sync-State aktualisieren nach konfigurierten Intervallen
        if (batchesProcessed % this.config.saveProgressInterval === 0) {
          await this.updateSyncState(dateStr, offset);
        }
        
        // Prüfen, ob wir weitere Daten erwarten können
        hasMore = transactions.length === this.config.batchSize;
        
        // Verzögerung zwischen Anfragen
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, this.config.requestDelay));
        }
      } catch (error) {
        console.error(`${dateStr}: Fehler beim Verarbeiten des Batches mit Offset ${offset}:`, error);
        
        errorItems++;
        
        // Nach maximalen Wiederholungen abbrechen
        if (errorItems >= this.config.maxRetries) {
          throw new Error(`Maximale Anzahl an Fehlern (${this.config.maxRetries}) erreicht für ${dateStr}.`);
        }
        
        // Kurz warten vor dem nächsten Versuch
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      }
    }
    
    // Nach dem letzten Batch immer den Sync-State aktualisieren
    await this.updateSyncState(dateStr, offset);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`Import für ${dateStr} abgeschlossen: ${totalItems} gesamt, ${savedItems} gespeichert, ${duplicateItems} Duplikate, ${errorItems} Fehler, Dauer: ${duration}s`);
    
    return {
      date: dateStr,
      totalItems,
      savedItems,
      duplicateItems,
      errorItems,
      batchesProcessed,
      duration
    };
  }
  
  /**
   * Holt einen Batch von Transaktionen von der Vendon API
   * @param fromDate Startdatum
   * @param toDate Enddatum
   * @param offset Offset
   * @param limit Maximale Anzahl von Transaktionen
   * @returns Array von Transaktionen
   */
  private async fetchTransactionBatch(
    fromDate: Date, 
    toDate: Date, 
    offset: number, 
    limit: number
  ): Promise<any[]> {
    try {
      // Parameter für die API-Anfrage
      const params = {
        from_timestamp: Math.floor(fromDate.getTime() / 1000),
        to_timestamp: Math.floor(toDate.getTime() / 1000),
        offset,
        limit,
        search_time: 'vend' // Parameter aus der API-Dokumentation
      };
      
      // API-Anfrage an Vendon
      const response = await vendonAPI.request('/stats/vends', params);
      
      if (!response || !Array.isArray(response)) {
        console.warn('Unerwartete API-Antwort:', response);
        return [];
      }
      
      return response;
    } catch (error) {
      console.error('Fehler beim Abrufen der Transaktionen:', error);
      throw error;
    }
  }
  
  /**
   * Speichert Transaktionen in der Datenbank
   * @param transactions Transaktionen von der API
   * @returns Ergebnis des Speichervorgangs
   */
  private async saveTransactions(transactions: any[]): Promise<{ 
    saved: number, 
    duplicates: number, 
    errors: number 
  }> {
    let saved = 0;
    let duplicates = 0;
    let errors = 0;
    
    // Queries in einer Transaktion ausführen
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const transaction of transactions) {
        try {
          // Prüfen, ob die Transaktion bereits existiert
          const checkResult = await client.query(
            'SELECT id FROM transactions WHERE vendon_id = $1',
            [transaction.id.toString()]
          );
          
          if (checkResult.rowCount > 0) {
            duplicates++;
            continue;
          }
          
          // Transaktion mappen und speichern
          const mappedTransaction = this.mapTransactionToDbSchema(transaction);
          
          // INSERT mit ON CONFLICT DO NOTHING
          const insertQuery = `
            INSERT INTO transactions (
              vendon_id, datetime, machine_id, machine_name, product_id, product_name,
              quantity, price, price_wo_vat, vat, currency, source, status,
              payment_method, metadata, synced_at, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
            ) ON CONFLICT (vendon_id) DO NOTHING
            RETURNING id
          `;
          
          const insertResult = await client.query(insertQuery, [
            mappedTransaction.vendon_id,
            mappedTransaction.datetime,
            mappedTransaction.machine_id,
            mappedTransaction.machine_name,
            mappedTransaction.product_id,
            mappedTransaction.product_name,
            mappedTransaction.quantity,
            mappedTransaction.price,
            mappedTransaction.price_wo_vat,
            mappedTransaction.vat,
            mappedTransaction.currency,
            mappedTransaction.source,
            mappedTransaction.status,
            mappedTransaction.payment_method,
            mappedTransaction.metadata,
            new Date()
          ]);
          
          if (insertResult.rowCount > 0) {
            saved++;
          } else {
            // INSERT hat kein neues Element eingefügt (wahrscheinlich Duplikat)
            duplicates++;
          }
        } catch (error) {
          console.error('Fehler beim Speichern einer Transaktion:', error);
          console.error('Fehlerhafte Transaktion:', JSON.stringify(transaction));
          errors++;
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Fehler beim Speichern von Transaktionen:', error);
      errors += transactions.length; // Alle als fehlerhaft markieren
    } finally {
      client.release();
    }
    
    return { saved, duplicates, errors };
  }
  
  /**
   * Mappt eine Transaktion von der API auf das Datenbankschema
   * @param apiTransaction Transaktion von der API
   * @returns Gemappte Transaktion für die Datenbank
   */
  private mapTransactionToDbSchema(apiTransaction: any): Record<string, any> {
    // Diese Mapping-Funktion muss exakt die gleiche Logik verwenden wie der Live-Importer
    // Hier ist eine allgemeine Implementation, die an die tatsächliche Struktur angepasst werden muss
    
    // Datum parsen
    let datetime = new Date();
    if (apiTransaction.datetime) {
      datetime = new Date(parseInt(apiTransaction.datetime) * 1000);
    }
    
    // Zahlungsmethode extrahieren
    let paymentMethod = 'unknown';
    if (apiTransaction.payment_method) {
      paymentMethod = apiTransaction.payment_method;
    } else if (apiTransaction.payment_type) {
      paymentMethod = apiTransaction.payment_type;
    }
    
    // Standardstatus
    const status = 'completed';
    
    // Quelle
    const source = 'history-import';
    
    // Metadaten erstellen (für Nachverfolgbarkeit)
    const metadata = JSON.stringify({
      importSource: 'vendon-history-import',
      importDate: new Date().toISOString(),
      originalData: apiTransaction
    });
    
    return {
      vendon_id: apiTransaction.id.toString(),
      datetime,
      machine_id: apiTransaction.machine_id || null,
      machine_name: apiTransaction.machine_name || null,
      product_id: apiTransaction.product_id || apiTransaction.stock_id || null,
      product_name: apiTransaction.product_name || apiTransaction.name || null,
      quantity: apiTransaction.quantity || 1,
      price: apiTransaction.price || 0,
      price_wo_vat: apiTransaction.price_wo_vat || 0,
      vat: apiTransaction.vat || 0,
      currency: apiTransaction.currency || 'EUR',
      source,
      status,
      payment_method: paymentMethod,
      metadata
    };
  }
  
  /**
   * Lädt den aktuellen Sync-State aus der Datenbank
   * @returns Cursor mit Datum und Offset
   */
  private async loadSyncState(): Promise<{ cursorDate: string | null, cursorOffset: number }> {
    try {
      const result = await this.pool.query(
        'SELECT last_date, last_offset FROM sync_state WHERE job_name = $1',
        [JOB_NAME]
      );
      
      if (result.rowCount > 0) {
        const row = result.rows[0];
        return {
          cursorDate: format(row.last_date, 'yyyy-MM-dd'),
          cursorOffset: row.last_offset
        };
      }
      
      return { cursorDate: null, cursorOffset: 0 };
    } catch (error) {
      console.error('Fehler beim Laden des Sync-States:', error);
      return { cursorDate: null, cursorOffset: 0 };
    }
  }
  
  /**
   * Aktualisiert den Sync-State in der Datenbank
   * @param date Aktuelles Datum
   * @param offset Aktueller Offset
   */
  private async updateSyncState(date: string, offset: number): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO sync_state (job_name, last_date, last_offset, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (job_name) 
        DO UPDATE SET last_date = $2, last_offset = $3, updated_at = NOW()
      `, [JOB_NAME, date, offset]);
      
      console.log(`Sync-State aktualisiert: ${date}, Offset ${offset}`);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Sync-States:', error);
    }
  }
  
  /**
   * Führt Vollständigkeitsprüfungen für einen Tag durch
   * @param date Datum
   */
  private async checkDayCompleteness(date: string): Promise<void> {
    try {
      console.log(`Führe Vollständigkeitsprüfungen für ${date} durch...`);
      
      // Prüfung auf Duplikate
      const duplicateCheck = await this.pool.query(`
        SELECT vendon_id, COUNT(*)
        FROM transactions
        WHERE DATE(datetime) = $1
        GROUP BY vendon_id
        HAVING COUNT(*) > 1
      `, [date]);
      
      if (duplicateCheck.rowCount > 0) {
        console.warn(`${duplicateCheck.rowCount} Duplikate für ${date} gefunden!`);
        for (const row of duplicateCheck.rows) {
          console.warn(`- Duplikat: ${row.vendon_id} (${row.count}x)`);
        }
      } else {
        console.log(`Keine Duplikate für ${date} gefunden.`);
      }
      
      // Weitere Prüfungen könnten hier implementiert werden, z.B.:
      // - Vergleich der Anzahl mit vendsTotals API
      // - Prüfung auf Lücken in den IDs
      // - Prüfung der Summen
    } catch (error) {
      console.error(`Fehler bei Vollständigkeitsprüfungen für ${date}:`, error);
    }
  }
  
  /**
   * Erstellt einen Synchronisierungslog-Eintrag
   * @param summary Zusammenfassung des Imports
   */
  private async createSyncLog(summary: any): Promise<void> {
    try {
      const query = `
        INSERT INTO sync_logs (
          sync_type, start_date, end_date, items_found, items_saved,
          duplicates, errors, duration_seconds, sync_status,
          additional_data, created_at, entity_type
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11
        )
      `;
      
      const startDate = parseISO(this.config.startDate);
      const endDate = this.config.endDate ? parseISO(this.config.endDate) : new Date();
      
      await this.pool.query(query, [
        'vendon-history-import',
        startDate,
        endDate,
        summary.totalItems,
        summary.savedItems,
        summary.duplicateItems,
        summary.errorItems,
        summary.durationSeconds,
        summary.errorItems > 0 ? 'completed_with_errors' : 'completed',
        JSON.stringify(summary),
        'transaction'
      ]);
      
      console.log('Sync-Log erstellt.');
    } catch (error) {
      console.error('Fehler beim Erstellen des Sync-Logs:', error);
    }
  }
}

/**
 * Helfer-Funktion zum einfachen Importieren historischer Daten
 * @param pool PostgreSQL-Verbindung
 * @param config Import-Konfiguration
 * @returns Ergebnis des Imports
 */
export async function importVendonHistory(
  pool: Pool,
  config?: Partial<ImportConfig>
): Promise<any> {
  const importer = new VendonHistoryImporter(pool, config);
  return await importer.runFullImport();
}