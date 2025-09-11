import { storage } from "../storage";
import { 
  InsertSyncLog, 
  InsertTransaction,
  HistoricalSyncOptions
} from "@shared/schema";
// import { vendonSync } from "./vendonSync"; // DEPRECATED - use UnifiedVendonSyncCoordinator
import { addDays, format, parseISO } from "date-fns";

/**
 * Service für den Abruf historischer Vendon-Transaktionen
 * 
 * Dieser Service implementiert einen optimierten Prozess zum Abruf historischer Transaktionsdaten
 * von der Vendon API. Es wird ein paginierter Abruf implementiert, der die API-Limits berücksichtigt
 * und immer maximal 100 Transaktionen pro Anfrage abruft.
 * 
 * FIXED: Verwendet jetzt die gemeinsame vendonSync-Instanz statt einer neuen Instanz zu erstellen.
 */
export class HistoricalVendonSyncService {
  // Verwende UnifiedVendonSyncCoordinator
  private async getUnifiedSyncCoordinator() {
    const { getUnifiedSyncCoordinator } = await import('./unifiedVendonSyncCoordinator');
    return getUnifiedSyncCoordinator();
  }
  
  /**
   * Startet eine historische Synchronisierung von Vendon-Transaktionen
   * 
   * @param options Optionen für die historische Synchronisierung
   * @returns Objekt mit Status und SyncLog-ID
   */
  async startHistoricalSync(options: HistoricalSyncOptions): Promise<{
    syncLogId: number;
    status: string;
    message: string;
    preview?: any;
  }> {
    console.log("Starte historische Synchronisierung mit Optionen:", options);
    
    // Standardwerte für Start- und Enddatum setzen
    let startDate = options.startDate ? 
      (typeof options.startDate === 'string' ? parseISO(options.startDate) : options.startDate) : 
      new Date(2022, 5, 1); // 1. Juni 2022
    
    let endDate = options.endDate ? 
      (typeof options.endDate === 'string' ? parseISO(options.endDate) : options.endDate) : 
      new Date();
    
    // Synchronisierungs-Log erstellen
    const syncLog: InsertSyncLog = {
      syncType: 'historical_transactions',
      startDate,
      endDate,
      syncStatus: 'running',
      additionalData: JSON.stringify(options)
    };
    
    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;
    
    // Starte die Synchronisierung im Hintergrund
    this.runHistoricalSync(syncLogId, startDate, endDate, options).catch(error => {
      console.error("Fehler bei der historischen Synchronisierung:", error);
      // Aktualisiere das Synchronisierungslog mit dem Fehler
      storage.updateSyncLog(syncLogId, {
        syncStatus: 'error',
        errorMessage: `${error}`
      }).catch(e => console.error("Fehler beim Aktualisieren des SyncLogs:", e));
    });
    
    // Berechne eine Vorschau der zu erwartenden Daten
    const preview = await this.getHistoricalSyncPreview(startDate, endDate, options.batchSize);
    
    return {
      syncLogId,
      status: 'started',
      message: 'Historische Synchronisierung im Hintergrund gestartet',
      preview
    };
  }
  
  /**
   * Führt die eigentliche Synchronisierung durch
   * 
   * @param syncLogId ID des Synchronisierungs-Logs
   * @param startDate Startdatum der Synchronisierung
   * @param endDate Enddatum der Synchronisierung
   * @param options Optionen für die Synchronisierung
   */
  private async runHistoricalSync(
    syncLogId: number, 
    startDate: Date, 
    endDate: Date, 
    options: HistoricalSyncOptions
  ): Promise<void> {
    console.log(`Starte historische Synchronisierung für Zeitraum ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    const startTime = Date.now();
    
    // Zähler für die Gesamtstatistik
    let totalTransactionsFound = 0;
    let totalTransactionsSaved = 0;
    let totalDuplicates = 0;
    let totalErrors = 0;
    
    // Datum für die schrittweise Abarbeitung
    let currentStartDate = new Date(startDate);
    let syncStepDays = options.syncStep || 30; // Standard: 30 Tage pro Schritt
    
    // Abarbeitung in Schritten zu je syncStepDays Tagen
    while (currentStartDate < endDate) {
      // Berechne das Ende dieses Synchronisierungsschritts
      let currentEndDate = addDays(currentStartDate, syncStepDays);
      
      // Stelle sicher, dass wir nicht über das angegebene Enddatum hinausgehen
      if (currentEndDate > endDate) {
        currentEndDate = new Date(endDate);
      }
      
      console.log(`Verarbeite Zeitraum: ${format(currentStartDate, 'yyyy-MM-dd')} bis ${format(currentEndDate, 'yyyy-MM-dd')}`);
      
      try {
        // Aktualisiere das SyncLog mit dem aktuellen Fortschritt
        await storage.updateSyncLog(syncLogId, {
          additionalData: JSON.stringify({
            ...options,
            currentProgress: {
              currentStartDate: format(currentStartDate, 'yyyy-MM-dd'),
              currentEndDate: format(currentEndDate, 'yyyy-MM-dd'),
              totalTransactionsFound,
              totalTransactionsSaved,
              totalDuplicates,
              totalErrors
            }
          })
        });
        
        // Rufe die Transaktionen für diesen Zeitraum ab
        const result = await this.syncTransactionsForPeriod(
          currentStartDate, 
          currentEndDate, 
          options.batchSize || 100, 
          options.maxTransactions || 10000,
          options.forceUpdate || false
        );
        
        // Addiere die Ergebnisse zur Gesamtstatistik
        totalTransactionsFound += result.itemsFound;
        totalTransactionsSaved += result.itemsSaved;
        totalDuplicates += result.duplicates;
        totalErrors += result.errors;
        
        console.log(`Zeitraum ${format(currentStartDate, 'yyyy-MM-dd')} bis ${format(currentEndDate, 'yyyy-MM-dd')} abgeschlossen.`);
        console.log(`Statistik: ${result.itemsFound} gefunden, ${result.itemsSaved} gespeichert, ${result.duplicates} Duplikate, ${result.errors} Fehler`);
        
        // Nächster Zeitraum
        currentStartDate = addDays(currentEndDate, 1);
        
      } catch (error) {
        console.error(`Fehler bei der Verarbeitung des Zeitraums ${format(currentStartDate, 'yyyy-MM-dd')} bis ${format(currentEndDate, 'yyyy-MM-dd')}:`, error);
        totalErrors++;
        
        // Bei einem Fehler trotzdem zum nächsten Zeitraum weitergehen
        currentStartDate = addDays(currentEndDate, 1);
      }
    }
    
    // Berechne die Gesamtdauer
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    // Aktualisiere das SyncLog mit dem Endergebnis
    await storage.updateSyncLog(syncLogId, {
      endDate: new Date(),
      itemsFound: totalTransactionsFound,
      itemsSaved: totalTransactionsSaved,
      duplicates: totalDuplicates,
      errors: totalErrors,
      durationSeconds,
      syncStatus: 'completed',
      additionalData: JSON.stringify({
        ...options,
        finalStats: {
          totalTransactionsFound,
          totalTransactionsSaved,
          totalDuplicates,
          totalErrors,
          durationSeconds
        }
      })
    });
    
    console.log("Historische Synchronisierung abgeschlossen.");
    console.log(`Ergebnis: ${totalTransactionsFound} gefunden, ${totalTransactionsSaved} gespeichert, ${totalDuplicates} Duplikate, ${totalErrors} Fehler`);
    console.log(`Dauer: ${durationSeconds} Sekunden`);
  }
  
  /**
   * Synchronisiert Transaktionen für einen bestimmten Zeitraum mit Pagination
   */
  private async syncTransactionsForPeriod(
    startDate: Date,
    endDate: Date,
    batchSize: number = 100,
    maxTransactions: number = 10000,
    forceUpdate: boolean = false
  ): Promise<{
    itemsFound: number;
    itemsSaved: number;
    duplicates: number;
    errors: number;
  }> {
    console.log(`Synchronisiere Transaktionen von ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    // Zähler für die Synchronisation
    let page = 1;
    let totalItems = 0;
    let hasMoreTransactions = true;
    let itemsSaved = 0;
    let itemsUpdated = 0;
    let duplicates = 0;
    let errors = 0;
    
    // API-Client
    const api = this.vendonSync.getApi();
    
    // Solange es weitere Transaktionen gibt und wir das Maximum nicht erreicht haben
    while (hasMoreTransactions && totalItems < maxTransactions) {
      console.log(`Hole Transaktionen, Seite ${page} mit Batchgröße ${batchSize}`);
      
      // Berechne den verbleibenden Limit für diese Anfrage
      const remainingLimit = Math.min(batchSize, maxTransactions - totalItems);
      
      // Hole Transaktionen von der API mit Pagination
      const result = await api.getTransactions(
        startDate,
        endDate,
        undefined, // keine Maschinen-ID-Filterung
        (page - 1) * batchSize, // Offset
        remainingLimit // Limit
      );
      
      const transactions = result.data;
      
      if (!transactions || transactions.length === 0) {
        // Keine weiteren Transaktionen
        hasMoreTransactions = false;
        break;
      }
      
      console.log(`${transactions.length} Transaktionen auf Seite ${page} gefunden`);
      totalItems += transactions.length;
      
      // Verarbeite jede Transaktion
      for (const transaction of transactions) {
        try {
          // Prüfe, ob die Transaktion eine ID hat
          const transactionId = transaction.id || transaction.transaction_id;
          if (!transactionId) {
            console.error("Transaktion ohne ID übersprungen:", transaction);
            errors++;
            continue;
          }
          
          // Prüfe, ob die Transaktion bereits existiert
          const existingTransaction = await storage.getTransactionByVendonId(transactionId.toString());
          
          if (existingTransaction && !forceUpdate) {
            // Transaktion existiert bereits und soll nicht aktualisiert werden
            duplicates++;
            continue;
          }
          
          // Maschinen-ID abrufen oder erstellen
          let machineId: number | undefined;
          if (transaction.machine_id) {
            const machineVendonId = transaction.machine_id.toString();
            const machineData = await storage.getMachineByVendonId(machineVendonId);
            
            if (machineData) {
              machineId = machineData.id;
            }
          }
          
          // Standort-ID abrufen falls verfügbar
          let locationId: number | undefined;
          
          // Produkt-ID und Name extrahieren
          let productId: string | undefined;
          let productName: string | undefined;
          
          if (transaction.name) {
            productName = transaction.name;
            console.log(`Produktname direkt aus transaction.name: "${productName}"`);
          }
          
          if (transaction.stock_id) {
            productId = transaction.stock_id.toString();
          }
          
          // Datumsfelder konvertieren
          let datetime: Date | undefined;
          let transactionDt: Date | undefined;
          let registeredDt: Date | undefined;
          
          if (transaction.datetime) {
            datetime = new Date(transaction.datetime * 1000);
          }
          
          if (transaction.transaction_dt) {
            transactionDt = new Date(transaction.transaction_dt * 1000);
          }
          
          if (transaction.registered_dt) {
            registeredDt = new Date(transaction.registered_dt * 1000);
          }
          
          // Transaktion für das Speichern vorbereiten
          const transactionData: InsertTransaction = {
            vendonId: transactionId.toString(),
            machineId,
            machineName: transaction.machine_name,
            datetime: datetime || new Date(),
            transactionDt,
            registeredDt,
            productId,
            productName,
            selection: transaction.selection,
            stockId: transaction.stock_id,
            article: transaction.article,
            quantity: transaction.quantity || 1,
            price: transaction.price || 0,
            priceVat: transaction.price_vat,
            priceWoVat: transaction.price_wo_vat,
            vat: transaction.vat,
            currency: transaction.currency,
            discountCode: transaction.discount_code,
            discountAmount: transaction.discount_amount,
            paymentMethod: transaction.payment_method,
            source: transaction.source || "historical_import",
            transactionData: transaction.transaction_data ? JSON.stringify(transaction.transaction_data) : undefined,
            note: transaction.note,
            metadata: JSON.stringify(transaction),
            locationId,
            locationName: transaction.location_name,
            createdAt: new Date(),
            syncedAt: new Date(),
            processedAt: new Date(),
            processingStatus: "processed"
          };
          
          if (existingTransaction && forceUpdate) {
            // Aktualisiere die bestehende Transaktion
            await storage.updateTransaction(existingTransaction.id, transactionData);
            itemsUpdated++;
          } else {
            // Speichere die neue Transaktion
            console.log(`Neue Transaktion ${transactionId} wird gespeichert...`);
            const savedTransaction = await storage.createTransaction(transactionData);
            console.log(`Transaktion ${transactionId} (ID: ${savedTransaction.id}) erfolgreich gespeichert.`);
            itemsSaved++;
          }
          
        } catch (error) {
          console.error(`Fehler beim Verarbeiten der Transaktion:`, error);
          errors++;
        }
      }
      
      // Nächste Seite
      page++;
    }
    
    return {
      itemsFound: totalItems,
      itemsSaved,
      duplicates,
      errors
    };
  }
  
  /**
   * Erstellt eine Vorschau des zu erwartenden Datenvolumens
   */
  private async getHistoricalSyncPreview(
    startDate: Date,
    endDate: Date,
    batchSize: number = 100
  ): Promise<{
    count: number;
    estimatedTotal: number;
    timeRange: string;
  }> {
    try {
      const api = this.vendonSync.getApi();
      
      // Hole eine Stichprobe von Transaktionen für den angegebenen Zeitraum
      const result = await api.getTransactions(
        startDate,
        endDate,
        undefined,
        0,
        batchSize
      );
      
      const transactions = result.data;
      const sampleCount = transactions.length;
      
      // Schätze die Gesamtzahl der Transaktionen
      // Berechne die Anzahl der Tage im angegebenen Zeitraum
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Einfache Schätzung basierend auf der ersten Stichprobe und der Anzahl der Tage
      let estimatedTotal = sampleCount;
      
      if (days > 1 && sampleCount > 0) {
        // Für mehrtägige Zeiträume eine Hochrechnung basierend auf der Stichprobe
        estimatedTotal = Math.min(500000, sampleCount * days * 2);
      }
      
      return {
        count: sampleCount,
        estimatedTotal,
        timeRange: `${startDate.toISOString()} bis ${endDate.toISOString()}`
      };
      
    } catch (error) {
      console.error("Fehler bei der Vorschauberechnung:", error);
      
      // Fallback bei Fehlern
      return {
        count: 0,
        estimatedTotal: 1000,
        timeRange: `${startDate.toISOString()} bis ${endDate.toISOString()}`
      };
    }
  }
  
  /**
   * Formatiert ein Datum für die Protokollierung
   */
  private formatDate(date: Date): string {
    return format(date, 'yyyy-MM-dd HH:mm:ss');
  }
}

// Exportiere eine Singleton-Instanz
export const historicalVendonSync = new HistoricalVendonSyncService();