/**
 * Systematische Historische Vendon Synchronisation
 * 
 * Dieses Service synchronisiert systematisch alle Transaktionen ab dem 01.01.2024
 * in 6-Stunden-Intervallen, um sicherzustellen, dass keine Daten fehlen.
 */

import { db } from "../db";
import { transactions, syncLogs, syncState } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import axios, { AxiosInstance } from "axios";
import { storage } from "../storage";
import { InsertTransaction, InsertSyncLog } from "@shared/schema";

export interface SyncWindow {
  startDate: Date;
  endDate: Date;
  intervalHours: number;
}

export interface SyncProgress {
  currentDate: Date;
  totalWindows: number;
  completedWindows: number;
  totalTransactions: number;
  newTransactions: number;
  duplicates: number;
  errors: number;
}

export class SystematicHistoricalSync {
  private apiClient: AxiosInstance;
  private syncLogId: number | null = null;

  constructor() {
    this.apiClient = axios.create({
      baseURL: 'https://cloud.vendon.net/rest/v1.8.0',
      headers: {
        'Authorization': `Token ${process.env.VENDON_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  /**
   * Startet die systematische historische Synchronisation ab 01.01.2024
   */
  async startSystematicSync(
    startDate: Date = new Date('2024-01-01'),
    endDate: Date = new Date(),
    intervalHours: number = 6
  ): Promise<SyncProgress> {
    console.log('🚀 Starte systematische historische Synchronisation');
    console.log(`Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    console.log(`Intervall: ${intervalHours} Stunden`);

    // Erstelle Sync-Log-Eintrag
    const syncLog: InsertSyncLog = {
      syncType: 'historical-systematic',
      startDate: new Date(),
      syncStatus: 'running',
      additionalData: JSON.stringify({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        intervalHours
      })
    };

    const logEntry = await storage.createSyncLog(syncLog);
    this.syncLogId = logEntry.id;

    try {
      const progress = await this.processTimeWindows(startDate, endDate, intervalHours);
      
      // Aktualisiere Sync-Log mit Erfolg
      await storage.updateSyncLog(this.syncLogId, {
        endDate: new Date(),
        syncStatus: 'completed',
        itemsFound: progress.totalTransactions,
        itemsSaved: progress.newTransactions,
        duplicates: progress.duplicates,
        errors: progress.errors
      });

      return progress;
    } catch (error) {
      console.error('❌ Fehler bei systematischer Synchronisation:', error);
      
      // Aktualisiere Sync-Log mit Fehler
      if (this.syncLogId) {
        await storage.updateSyncLog(this.syncLogId, {
          endDate: new Date(),
          syncStatus: 'error',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
      
      throw error;
    }
  }

  /**
   * Verarbeitet systematisch alle Zeitfenster
   */
  private async processTimeWindows(
    startDate: Date,
    endDate: Date,
    intervalHours: number
  ): Promise<SyncProgress> {
    const windows = this.generateTimeWindows(startDate, endDate, intervalHours);
    
    const progress: SyncProgress = {
      currentDate: startDate,
      totalWindows: windows.length,
      completedWindows: 0,
      totalTransactions: 0,
      newTransactions: 0,
      duplicates: 0,
      errors: 0
    };

    console.log(`📊 Gesamt ${windows.length} Zeitfenster zu verarbeiten`);

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      progress.currentDate = window.startDate;

      console.log(`⏳ Fenster ${i + 1}/${windows.length}: ${window.startDate.toISOString()} - ${window.endDate.toISOString()}`);

      try {
        const windowResult = await this.syncTimeWindow(window);
        
        progress.totalTransactions += windowResult.totalTransactions;
        progress.newTransactions += windowResult.newTransactions;
        progress.duplicates += windowResult.duplicates;
        progress.completedWindows++;

        console.log(`✅ Fenster abgeschlossen: ${windowResult.newTransactions} neue, ${windowResult.duplicates} Duplikate`);

        // Kurze Pause zwischen den Anfragen
        await this.delay(500);

      } catch (error) {
        console.error(`❌ Fehler in Fenster ${i + 1}:`, error);
        progress.errors++;
        
        // Bei Fehlern etwas länger warten
        await this.delay(2000);
      }

      // Aktualisiere Sync-Log Fortschritt alle 10 Fenster
      if (i % 10 === 0 && this.syncLogId) {
        await storage.updateSyncLog(this.syncLogId, {
          itemsFound: progress.totalTransactions,
          itemsSaved: progress.newTransactions,
          duplicates: progress.duplicates,
          errors: progress.errors,
          additionalData: JSON.stringify({
            progress: `${progress.completedWindows}/${progress.totalWindows}`,
            currentDate: progress.currentDate.toISOString()
          })
        });
      }
    }

    return progress;
  }

  /**
   * Synchronisiert ein einzelnes Zeitfenster
   */
  private async syncTimeWindow(window: SyncWindow): Promise<{
    totalTransactions: number;
    newTransactions: number;
    duplicates: number;
  }> {
    const fromTimestamp = Math.floor(window.startDate.getTime() / 1000);
    const toTimestamp = Math.floor(window.endDate.getTime() / 1000);

    let offset = 0;
    let totalTransactions = 0;
    let newTransactions = 0;
    let duplicates = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.apiClient.get('/stats/vends', {
          params: {
            from_timestamp: fromTimestamp,
            to_timestamp: toTimestamp,
            offset,
            limit: 100
          }
        });

        if (response.data.code !== 200) {
          throw new Error(`API Fehler: ${response.data.code}`);
        }

        const transactions = response.data.result || [];
        totalTransactions += transactions.length;

        if (transactions.length === 0) {
          hasMore = false;
          break;
        }

        // Verarbeite jede Transaktion
        for (const transaction of transactions) {
          const result = await this.saveTransaction(transaction);
          if (result === 'new') {
            newTransactions++;
          } else if (result === 'duplicate') {
            duplicates++;
          }
        }

        // Wenn weniger als Limit zurückgegeben wird, sind wir am Ende
        if (transactions.length < 100) {
          hasMore = false;
        } else {
          offset += 100;
        }

      } catch (error) {
        console.error('API-Anfrage fehlgeschlagen:', error);
        throw error;
      }
    }

    return { totalTransactions, newTransactions, duplicates };
  }

  /**
   * Speichert eine einzelne Transaktion
   */
  private async saveTransaction(vendonTransaction: any): Promise<'new' | 'duplicate' | 'error'> {
    try {
      // Prüfe ob Transaktion bereits existiert
      const existingTransaction = await storage.getTransactionByVendonId(vendonTransaction.transaction_id.toString());
      
      if (existingTransaction) {
        return 'duplicate';
      }

      // Hole Maschine
      const machine = await storage.getMachineByVendonId(vendonTransaction.machine_id.toString());
      if (!machine) {
        console.warn(`Maschine ${vendonTransaction.machine_id} nicht gefunden`);
        return 'error';
      }

      // Erstelle neue Transaktion
      const newTransaction: InsertTransaction = {
        vendonId: vendonTransaction.transaction_id.toString(),
        machineId: machine.id,
        datetime: new Date(vendonTransaction.datetime * 1000),
        productName: vendonTransaction.name || 'Unbekanntes Produkt',
        price: vendonTransaction.price || 0,
        quantity: vendonTransaction.quantity || 1,
        paymentMethod: vendonTransaction.payment_method || 'unknown',
        currency: vendonTransaction.currency || 'EUR',
        extraData: JSON.stringify(vendonTransaction)
      };

      await storage.createTransaction(newTransaction);
      return 'new';

    } catch (error) {
      console.error('Fehler beim Speichern der Transaktion:', error);
      return 'error';
    }
  }

  /**
   * Generiert Zeitfenster für die Synchronisation
   */
  private generateTimeWindows(startDate: Date, endDate: Date, intervalHours: number): SyncWindow[] {
    const windows: SyncWindow[] = [];
    const intervalMs = intervalHours * 60 * 60 * 1000;

    let currentStart = new Date(startDate);
    
    while (currentStart < endDate) {
      const currentEnd = new Date(Math.min(currentStart.getTime() + intervalMs, endDate.getTime()));
      
      windows.push({
        startDate: new Date(currentStart),
        endDate: new Date(currentEnd),
        intervalHours
      });

      currentStart = new Date(currentEnd);
    }

    return windows;
  }

  /**
   * Hilfsmethode für Verzögerungen
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Prüft den aktuellen Synchronisationsstatus
   */
  async getLastSyncStatus(): Promise<any> {
    try {
      const lastSync = await db
        .select()
        .from(syncLogs)
        .where(eq(syncLogs.syncType, 'historical-systematic'))
        .orderBy(desc(syncLogs.startDate))
        .limit(1);

      return lastSync[0] || null;
    } catch (error) {
      console.error('Fehler beim Abrufen des Sync-Status:', error);
      return null;
    }
  }
}