import { HistoricalSyncOptions, insertSyncLogSchema } from '@shared/schema';
import { db, rawSql, rawDb } from '../db';
import { vendonAPI } from './vendonAPI';
import { formatISO } from 'date-fns';
import { eq } from 'drizzle-orm';
import { syncLogs, syncState } from '@shared/schema';
import { sql } from 'drizzle-orm';

/**
 * VendonHistoryImporter - Service zur tageweisen Synchronisierung historischer Vendon-Transaktionen
 * 
 * Diese Klasse implementiert den Import historischer Transaktionsdaten von Vendon mit:
 * - Tag-für-Tag Pagination für bessere Performance und Fehlerbehandlung
 * - Speicherung des Cursor-Zustands in der sync_state Tabelle
 * - Idempotente Transaktion-Speicherung mit ON CONFLICT Handling
 * - Detailliertes Logging und Metriken für Monitoring
 */
export class VendonHistoryImporter {
  
  /**
   * Hilfsmethode für Datum-zu-String-Konvertierung für die Datenbank
   * Sorgt für einheitliche Formatierung aller Datumsfelder
   */
  private static formatDate(date: Date): string {
    return formatISO(date);
  }
  private readonly vendonApi: typeof vendonAPI;
  private readonly jobName: string = 'vendon_history_import';
  private syncLogId: number | null = null;
  
  // Statistiken für den aktuellen Import
  private stats = {
    totalProcessed: 0,
    totalSaved: 0,
    totalDuplicates: 0,
    totalErrors: 0,
    pagesProcessed: 0,
    daysProcessed: 0,
  };

  constructor() {
    this.vendonApi = vendonAPI;
  }

  /**
   * Startet den historischen Import mit den angegebenen Optionen
   * @param options Import-Optionen (Startdatum, Enddatum, Batch-Größe, etc.)
   */
  async startImport(options: HistoricalSyncOptions) {
    console.log(`Starte historischen Vendon-Import mit folgenden Optionen:`, options);

    try {
      // Sync-Log für den Import erstellen
      await this.createSyncLog('vendon_history_import', 'transactions');

      // Cursor-Status aus der Datenbank laden oder initialisieren
      const syncState = await this.getSyncState();
      
      // Import durchführen
      await this.performImport(options, syncState);

      // Sync-Log aktualisieren
      await this.updateSyncLog('completed');
      
      console.log(`Historischer Vendon-Import abgeschlossen.`);
      console.log(`Statistik: ${this.stats.totalProcessed} Transaktionen verarbeitet, ${this.stats.totalSaved} gespeichert, ${this.stats.totalDuplicates} Duplikate, ${this.stats.totalErrors} Fehler`);
      return this.stats;
    } catch (error) {
      console.error(`Fehler beim historischen Vendon-Import:`, error);
      
      // Sync-Log als fehlgeschlagen markieren
      await this.updateSyncLog('failed', error instanceof Error ? error.message : String(error));
      
      throw error;
    }
  }

  /**
   * Führt den eigentlichen Import durch
   */
  private async performImport(options: HistoricalSyncOptions, syncState: any) {
    // Startdatum festlegen: Entweder aus den Optionen oder aus dem gespeicherten Status
    let currentDate = options.startDate 
      ? new Date(options.startDate) 
      : new Date(syncState.lastDate);

    // Enddatum festlegen: Entweder aus den Optionen oder heute
    const endDate = options.endDate 
      ? new Date(options.endDate) 
      : new Date();
    
    // Überprüfen, ob Startdatum vor Enddatum liegt
    if (currentDate > endDate) {
      throw new Error(`Startdatum (${currentDate.toISOString()}) liegt nach Enddatum (${endDate.toISOString()})`);
    }
    
    console.log(`Importiere Transaktionen von ${currentDate.toISOString()} bis ${endDate.toISOString()}`);
    
    // Tageweise durch den Zeitraum iterieren
    while (currentDate <= endDate) {
      console.log(`Verarbeite Tag: ${currentDate.toISOString().split('T')[0]}`);
      
      // Initialoffset verwenden, wenn es der Startdatum ist, sonst bei 0 beginnen
      const initialOffset = currentDate.toISOString().split('T')[0] === syncState.lastDate.toISOString().split('T')[0]
        ? syncState.lastOffset
        : 0;
      
      // Transaktionen für den aktuellen Tag importieren
      await this.importTransactionsForDay(currentDate, options, initialOffset);
      
      // Zum nächsten Tag gehen
      currentDate.setDate(currentDate.getDate() + 1);
      this.stats.daysProcessed++;
      
      // Sync-Status mit dem neuen Tag und Offset 0 aktualisieren
      await this.updateSyncState(currentDate, 0);
      
      // Optional: Synchronisierung bei maximaler Anzahl von Transaktionen stoppen
      if (options.maxTransactions && this.stats.totalProcessed >= options.maxTransactions) {
        console.log(`Maximale Anzahl von Transaktionen (${options.maxTransactions}) erreicht. Beende Import.`);
        break;
      }
    }
  }

  /**
   * Importiert Transaktionen für einen bestimmten Tag mit Pagination
   */
  private async importTransactionsForDay(date: Date, options: HistoricalSyncOptions, initialOffset = 0) {
    // Tageszeiträume (Mitternacht bis Mitternacht) in Unix-Timestamps umwandeln
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Unix-Timestamps für die Vendon API
    const fromTimestamp = Math.floor(startOfDay.getTime() / 1000);
    const toTimestamp = Math.floor(endOfDay.getTime() / 1000);
    
    console.log(`Importiere Transaktionen für ${date.toISOString().split('T')[0]}`);
    console.log(`Zeitraum: ${startOfDay.toISOString()} bis ${endOfDay.toISOString()}`);
    
    let offset = initialOffset;
    let hasMoreTransactions = true;
    let pageCount = 0;
    
    // Pagination: Hole 'batchSize' Transaktionen pro Anfrage, bis keine mehr vorhanden sind
    while (hasMoreTransactions) {
      pageCount++;
      console.log(`Hole Transaktionen für ${date.toISOString().split('T')[0]}, Seite ${pageCount} (Offset: ${offset}, Limit: ${options.batchSize || 100})`);
      
      try {
        // API-Aufruf für Transaktionen im angegebenen Zeitraum
        const response = await this.vendonApi.getVendTransactions({
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          limit: options.batchSize || 100,
          offset: offset
        });
        
        if (!response || !response.result || !Array.isArray(response.result)) {
          console.error(`Ungültige Antwort von der Vendon API:`, response);
          throw new Error('Ungültige Antwort von der Vendon API');
        }
        
        const transactions = response.result;
        const transactionCount = transactions.length;
        
        console.log(`${transactionCount} Transaktionen für ${date.toISOString().split('T')[0]}, Seite ${pageCount} gefunden`);
        
        this.stats.totalProcessed += transactionCount;
        this.stats.pagesProcessed++;
        
        // Keine weiteren Transaktionen, wenn weniger als 'batchSize' zurückgegeben wurden
        hasMoreTransactions = transactionCount >= (options.batchSize || 100);
        
        // Transaktionen speichern
        for (const transaction of transactions) {
          try {
            await this.saveTransaction(transaction);
          } catch (error) {
            console.error(`Fehler beim Speichern der Transaktion ${transaction.transaction_id}:`, error);
            this.stats.totalErrors++;
          }
        }
        
        // Cursor für die nächste Seite aktualisieren
        offset += transactionCount;
        
        // Sync-Status aktualisieren
        await this.updateSyncState(date, offset);
        
        // Optional: Warten, um die API nicht zu überlasten
        if (hasMoreTransactions) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Fehler beim Abrufen der Transaktionen für ${date.toISOString().split('T')[0]}, Seite ${pageCount}:`, error);
        this.stats.totalErrors++;
        
        // Bei einem Fehler den Import für diesen Tag abbrechen
        hasMoreTransactions = false;
      }
    }
    
    console.log(`Import für ${date.toISOString().split('T')[0]} abgeschlossen. ${offset - initialOffset} Transaktionen verarbeitet.`);
  }

  /**
   * Speichert eine einzelne Transaktion in der Datenbank mit Idempotenz durch ON CONFLICT
   */
  private async saveTransaction(transaction: any) {
    try {
      // Vendon-ID für die Transaktion extrahieren
      const vendonId = String(transaction.transaction_id);
      
      // Prüfen, ob die Transaktion bereits existiert
      console.log(`Prüfe, ob Transaktion ${vendonId} bereits existiert...`);
      
      // Direktes SQL mit parametrisierter Abfrage für Sicherheit
      const result = await rawDb.query(
        `INSERT INTO transactions (
          vendon_id, machine_id, machine_name, 
          datetime, transaction_dt, registered_dt,
          product_id, product_name, selection,
          stock_id, article, 
          quantity, price, price_vat, price_wo_vat, vat, currency,
          discount_code, discount_amount,
          payment_method, source
        ) 
        VALUES (
          $1, $2, $3, 
          to_timestamp($4), to_timestamp($5), to_timestamp($6),
          $7, $8, $9,
          $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19,
          $20, $21
        )
        ON CONFLICT (vendon_id) DO NOTHING
        RETURNING id`,
        [
          vendonId,
          transaction.machine_id,
          transaction.machine_name,
          transaction.datetime,
          transaction.transaction_dt || transaction.datetime,
          transaction.registered_dt || transaction.datetime,
          transaction.stock_id?.toString() || null,
          transaction.name,
          transaction.selection,
          transaction.stock_id,
          transaction.article,
          transaction.quantity || 1,
          transaction.price,
          transaction.price_vat,
          transaction.price_wo_vat,
          transaction.vat,
          transaction.currency,
          transaction.discount_code,
          transaction.discount_amount,
          transaction.payment_method,
          'history-import'  // Markierung als historischer Import
        ]
      );
      
      // Wenn ein Ergebnis zurückgegeben wird, wurde eine neue Transaktion eingefügt
      if (result.rows && result.rows.length > 0) {
        this.stats.totalSaved++;
        // Bei vielen Transaktionen Log reduzieren
        if (this.stats.totalSaved % 100 === 0 || this.stats.totalSaved < 10) {
          console.log(`Transaktion ${vendonId} mit ID ${result.rows[0].id} gespeichert.`);
        }
      } else {
        // Wenn kein Ergebnis, wurde die Transaktion aufgrund von ON CONFLICT übersprungen
        this.stats.totalDuplicates++;
        console.log(`Echtes Duplikat gefunden: ${vendonId} mit Datum ${new Date(transaction.datetime * 1000).toISOString()}`);
      }
      
      return result.rows && result.rows.length > 0;
    } catch (error) {
      console.error(`Fehler beim Speichern der Transaktion:`, error);
      this.stats.totalErrors++;
      throw error;
    }
  }

  /**
   * Holt den aktuellen Sync-Status aus der Datenbank oder erstellt einen Initialzustand
   */
  private async getSyncState() {
    try {
      // Direkte SQL-Abfrage für bessere Kontrolle
      const result = await rawDb.query(
        'SELECT * FROM sync_state WHERE job_name = $1 LIMIT 1',
        [this.jobName]
      );
      
      if (result.rows && result.rows.length > 0) {
        const state = result.rows[0];
        console.log(`Fortsetzen des Imports ab Datum ${state.last_date} mit Offset ${state.last_offset}`);
        return {
          jobName: state.job_name,
          lastDate: new Date(state.last_date),
          lastOffset: state.last_offset,
          updatedAt: new Date(state.updated_at),
          lastId: state.last_id,
          additionalState: state.additional_state
        };
      }
      
      // Initialzustand, wenn kein Sync-State gefunden wurde
      const initialState = {
        jobName: this.jobName,
        lastDate: new Date('2020-01-01'), // Beginne mit einem sinnvollen Standardwert
        lastOffset: 0,
        updatedAt: new Date()
      };
      
      console.log(`Kein vorheriger Import-Status gefunden. Beginne mit Initialzustand: `, initialState);
      
      // Initialzustand in der Datenbank speichern mit direktem SQL
      await rawDb.query(
        `INSERT INTO sync_state (job_name, last_date, last_offset, updated_at) VALUES ($1, $2, $3, $4)`,
        [
          initialState.jobName, 
          initialState.lastDate.toISOString(), 
          initialState.lastOffset, 
          initialState.updatedAt.toISOString()
        ]
      );
      
      return initialState;
    } catch (error) {
      console.error(`Fehler beim Abrufen des Sync-Status:`, error);
      throw error;
    }
  }

  /**
   * Aktualisiert den Sync-Status in der Datenbank
   */
  private async updateSyncState(date: Date, offset: number) {
    try {
      // Direktes SQL für Update
      await rawDb.query(
        `UPDATE sync_state SET last_date = $1, last_offset = $2, updated_at = $3 WHERE job_name = $4`,
        [date.toISOString(), offset, new Date().toISOString(), this.jobName]
      );
      
      console.log(`Sync-Status aktualisiert: Datum=${date.toISOString()}, Offset=${offset}`);
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Sync-Status:`, error);
      throw error;
    }
  }

  /**
   * Erstellt einen Sync-Log-Eintrag für den Import-Prozess
   */
  private async createSyncLog(syncType: string, entityType: string) {
    try {
      const startDate = new Date();
      
      // Direktes SQL für bessere Kontrolle
      const result = await rawDb.query(
        `INSERT INTO sync_logs 
          (sync_type, entity_type, sync_status, start_date, items_found, items_saved, duplicates, errors) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING id`,
        [
          syncType, 
          entityType, 
          'running', 
          startDate.toISOString(), 
          0, 
          0, 
          0, 
          0
        ]
      );
      
      if (result.rows && result.rows.length > 0) {
        this.syncLogId = result.rows[0].id;
        console.log(`Sync-Log erstellt mit ID ${this.syncLogId}`);
      }
    } catch (error) {
      console.error(`Fehler beim Erstellen des Sync-Logs:`, error);
      throw error;
    }
  }

  /**
   * Aktualisiert den Sync-Log-Eintrag mit aktuellen Statistiken
   */
  private async updateSyncLog(status: 'completed' | 'failed' | 'running', errorMessage?: string) {
    if (!this.syncLogId) return;
    
    try {
      const endDate = status !== 'running' ? new Date() : null;
      const startDate = await this.getSyncLogStartDate();
      const duration = endDate 
        ? (endDate.getTime() - startDate.getTime()) / 1000
        : null;
      
      const additionalData = JSON.stringify({
        pagesProcessed: this.stats.pagesProcessed,
        daysProcessed: this.stats.daysProcessed,
      });
      
      // Direktes SQL für Update
      await rawDb.query(
        `UPDATE sync_logs 
         SET sync_status = $1, 
             end_date = $2, 
             duration_seconds = $3, 
             items_found = $4, 
             items_saved = $5, 
             duplicates = $6, 
             errors = $7, 
             error_message = $8, 
             additional_data = $9
         WHERE id = $10`,
        [
          status,
          endDate ? endDate.toISOString() : null,
          duration,
          this.stats.totalProcessed,
          this.stats.totalSaved,
          this.stats.totalDuplicates,
          this.stats.totalErrors,
          errorMessage || null,
          additionalData,
          this.syncLogId
        ]
      );
      
      console.log(`Sync-Log ${this.syncLogId} aktualisiert mit Status "${status}"`);
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Sync-Logs:`, error);
    }
  }

  /**
   * Hilfsmethode zum Abrufen des Startdatums des Sync-Logs
   */
  private async getSyncLogStartDate(): Promise<Date> {
    if (!this.syncLogId) return new Date();
    
    try {
      const result = await rawDb.query(
        'SELECT start_date FROM sync_logs WHERE id = $1',
        [this.syncLogId]
      );
      
      if (result.rows && result.rows.length > 0) {
        return new Date(result.rows[0].start_date);
      }
      
      return new Date();
    } catch (error) {
      console.error(`Fehler beim Abrufen des Sync-Log-Startdatums:`, error);
      return new Date();
    }
  }
}

// Singleton-Instanz exportieren
export const vendonHistoryImporter = new VendonHistoryImporter();

/**
 * Funktion zum Starten des historischen Imports mit Konfigurationsparametern
 * Für die Verwendung in der API-Route
 */
export async function importVendonHistory(pool: any, config: {
  startDate: string;
  endDate?: string;
  batchSize: number;
  requestDelay: number;
  maxRetries: number;
  retryDelay: number;
  saveProgressInterval: number;
}) {
  // Adapter-Funktion für die API-Route
  try {
    console.log('Start historischer Import mit Konfiguration:', config);
    
    const options: HistoricalSyncOptions = {
      startDate: config.startDate,
      endDate: config.endDate,
      batchSize: config.batchSize,
      maxTransactions: 10000, // Sinnvoller Standardwert
      syncStep: 30, // Standardmäßig 30 Tage pro Synchronisierungsschritt
      forceUpdate: false
    };
    
    const stats = await vendonHistoryImporter.startImport(options);
    
    return {
      success: true,
      summary: {
        daysProcessed: stats.daysProcessed,
        totalItems: stats.totalProcessed,
        savedItems: stats.totalSaved,
        duplicateItems: stats.totalDuplicates,
        errorItems: stats.totalErrors,
        durationSeconds: 0 // Wird aus dem Sync-Log geholt
      }
    };
  } catch (error) {
    console.error('Fehler beim historischen Import:', error);
    throw error;
  }
}