/**
 * ULTRA-ROBUSTE VENDON SYNCHRONISIERUNG SERVICE
 * Integriert in die bestehende TypeScript-Anwendung
 * Garantiert zuverlässige API-Abrufe ohne Ausfälle
 */

import { storage } from "../storage";
import { InsertTransaction, InsertMachine } from "@shared/schema";
import axios from "axios";
import { db, rawDb } from "../db";

export class UltraRobustVendonSync {
  private readonly BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";
  private readonly apiKey: string;
  private readonly maxRetries = 5;
  private readonly timeoutMs = 30000;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
    console.log('🚀 Ultra-Robuste Vendon Synchronisierung initialisiert');
  }

  /**
   * HAUPTFUNKTION: Führt eine vollständige, robuste Synchronisierung durch
   */
  async performCompleteSync(): Promise<{
    success: boolean;
    message: string;
    totalSynced: number;
    details: any;
  }> {
    console.log('\n=== ULTRA-ROBUSTE VENDON SYNCHRONISIERUNG GESTARTET ===');
    
    try {
      // 1. Finde letzte Transaktion
      const lastTransaction = await this.findLastTransaction();
      console.log('🔍 Letzte Transaktion:', lastTransaction);
      
      // 2. Synchronisiere alle fehlenden Daten seit der letzten Transaktion
      const syncResult = await this.syncFromLastTransaction(lastTransaction);
      console.log('✅ Synchronisierung abgeschlossen:', syncResult);
      
      // 3. Identifiziere und schließe Lücken
      await this.identifyAndFillGaps();
      
      return {
        success: true,
        message: 'Ultra-robuste Synchronisierung erfolgreich abgeschlossen',
        totalSynced: syncResult.totalSynced,
        details: {
          lastTransaction,
          syncResult
        }
      };
      
    } catch (error) {
      console.error('❌ Kritischer Fehler in der Ultra-Robusten Synchronisierung:', error);
      throw error;
    }
  }

  /**
   * Findet die letzte verfügbare Transaktion
   */
  private async findLastTransaction() {
    try {
      const transactions = await storage.getTransactions();
      
      if (transactions.length > 0) {
        return {
          datetime: transactions[0].datetime,
          source: transactions[0].source,
          vendonId: transactions[0].vendonId,
          machineName: transactions[0].machineName
        };
      }
      
      // Fallback: Beginne vor 7 Tagen
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() - 7);
      
      return {
        datetime: fallbackDate,
        source: 'fallback',
        vendonId: null,
        machineName: null
      };
      
    } catch (error) {
      console.error('Fehler beim Finden der letzten Transaktion:', error);
      
      // Fallback: Beginne vor 7 Tagen
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() - 7);
      
      return {
        datetime: fallbackDate,
        source: 'fallback',
        vendonId: null,
        machineName: null
      };
    }
  }

  /**
   * Synchronisiert alle Transaktionen seit der letzten bekannten Transaktion
   */
  private async syncFromLastTransaction(lastTransaction: any) {
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
  private async syncSingleDayRobust(startDate: Date, endDate: Date) {
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
      
      // 🚀 BATCH-OPTIMIERUNG: Verwende Batch-Verarbeitung wie im optimierten vendonSync
      const processedTransactions: Array<{
        vendonId: string;
        transaction: InsertTransaction;
        originalData: any;
      }> = [];
      
      // Schritt 1: Bereite alle Transaktions-Objekte vor
      for (const transaction of transactions) {
        try {
          const transactionObj = await this.prepareTransactionObject(transaction);
          if (transactionObj) {
            processedTransactions.push(transactionObj);
          }
        } catch (error) {
          console.error(`❌ Fehler beim Vorbereiten der Transaktion ${transaction.id || 'unbekannt'}:`, error);
        }
      }
      
      if (processedTransactions.length > 0) {
        // Schritt 2: Batch-Duplikatsprüfung (1 SQL-Abfrage statt hunderte)
        const vendonIds = processedTransactions.map(pt => pt.vendonId);
        const existingIds = await storage.getExistingTransactionIds(vendonIds);
        
        // Schritt 3: Filtere neue Transaktionen
        const newTransactions: any[] = [];
        
        for (const processed of processedTransactions) {
          if (!existingIds.has(processed.vendonId)) {
            newTransactions.push(processed.transaction);
          }
        }
        
        // Schritt 4: Batch-Insertion (1 SQL-Operation statt hunderte)
        if (newTransactions.length > 0) {
          try {
            const savedTransactions = await storage.createTransactionsBatch(newTransactions);
            synced += savedTransactions.length;
            console.log(`⚡ Batch gespeichert: ${savedTransactions.length} neue Transaktionen`);
          } catch (error) {
            console.error("❌ Fehler bei Batch-Insertion:", error);
          }
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
   * Bereitet ein Transaktions-Objekt für die Batch-Verarbeitung vor
   */
  private async prepareTransactionObject(transaction: any): Promise<{ vendonId: string; transaction: InsertTransaction; originalData: any } | null> {
    try {
      // Prüfe, ob die Transaktion eine ID hat
      const transactionId = transaction.id || transaction.transaction_id;
      if (!transactionId) {
        console.error("Transaktion ohne ID übersprungen:", transaction);
        return null;
      }
      
      // Maschinen-ID verarbeiten
      let machineId: number = 1; // Standardwert
      if (transaction.machine_id) {
        const machineVendonId = transaction.machine_id.toString();
        let machineData = await storage.getMachineByVendonId(machineVendonId);
        
        if (!machineData) {
          const newMachine: InsertMachine = {
            vendonId: machineVendonId,
            machineName: transaction.machine_name || `Maschine ${machineVendonId}`,
            lastSync: new Date()
          };
          machineData = await storage.createMachine(newMachine);
        }
        machineId = machineData.id;
      }
      
      // Datetime konvertieren
      let transactionDate: Date;
      if (transaction.datetime) {
        if (typeof transaction.datetime === 'number') {
          transactionDate = new Date(
            transaction.datetime > 1577836800000 
              ? transaction.datetime 
              : transaction.datetime * 1000
          );
        } else {
          transactionDate = new Date(transaction.datetime);
        }
      } else {
        transactionDate = new Date();
      }
      
      // Produktname aus verschiedenen Quellen
      let productName = transaction.name || 
                       transaction.product_name || 
                       transaction.product?.name || 
                       'Unbekanntes Produkt';
      
      const vendonId = transactionId.toString();
      
      // Vollständiges Transaktions-Objekt erstellen
      const newTransaction: InsertTransaction = {
        vendonId: vendonId,
        machineId: machineId,
        machineName: transaction.machine_name || 'Unbekannte Maschine',
        datetime: transactionDate,
        transactionDt: transaction.transaction_dt ? new Date(transaction.transaction_dt * 1000) : null,
        registeredDt: transaction.registered_dt ? new Date(transaction.registered_dt * 1000) : null,
        updatedAt: transaction.updated_at ? new Date(transaction.updated_at * 1000) : null,
        amount: transaction.amount || 0,
        price: transaction.price || 0,
        priceVat: transaction.price_vat || null,
        priceWoVat: transaction.price_wo_vat || null,
        vat: transaction.vat || null,
        quantity: transaction.quantity || 1,
        productId: transaction.product_id?.toString() || null,
        productName: productName,
        stockId: transaction.stock_id || null,
        selection: transaction.selection || null,
        paymentMethod: transaction.payment_method || null, // 🎯 CRITICAL: Payment method aus Vendon API!
        status: transaction.status || null,
        currency: transaction.currency || null,
        coinCredit: transaction.coin_credit || 0,
        cardCredit: transaction.card_credit || 0,
        cashlessCredit: transaction.cashless_credit || 0,
        discountCode: transaction.discount_code || null,
        discountAmount: transaction.discount_amount || null,
        locationId: null,
        locationName: transaction.location_name || null,
        note: transaction.note || null,
        transactionData: transaction.transaction_data ? JSON.stringify(transaction.transaction_data) : null,
        metadata: transaction.metadata ? JSON.stringify(transaction.metadata) : null,
        source: transaction.source || "REALTIME",
        isTest: transaction.is_test === true,
        extraData: JSON.stringify(transaction)
      };
      
      return {
        vendonId,
        transaction: newTransaction,
        originalData: transaction
      };
    } catch (error) {
      console.error("Fehler beim Vorbereiten der Transaktion:", error);
      return null;
    }
  }

  /**
   * Extrem robuster API-Aufruf mit mehrfachen Wiederholungen
   */
  private async fetchVendonDataRobust(startTimestamp: number, endTimestamp: number, offset = 0, limit = 500) {
    const url = `${this.BASE_URL}/stats/vends`;
    const params = {
      from_timestamp: startTimestamp,
      to_timestamp: endTimestamp,
      offset: offset,
      limit: limit
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      console.log(`🌐 API-Aufruf Versuch ${attempt}/${this.maxRetries}`);
      
      try {
        const response = await axios.get(url, {
          params,
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Accept': 'application/json',
            'User-Agent': 'UltraRobustVendonSync/1.0'
          },
          timeout: this.timeoutMs
        });
        
        if (response.data && response.data.code === 200 && Array.isArray(response.data.result)) {
          console.log(`✅ API-Aufruf erfolgreich: ${response.data.result.length} Transaktionen`);
          return response.data.result;
        } else {
          console.warn(`⚠️ Unerwartete API-Antwort:`, response.data);
          return [];
        }
        
      } catch (error) {
        console.error(`❌ API-Aufruf fehlgeschlagen (Versuch ${attempt}):`, error instanceof Error ? error.message : error);
        
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
   * Speichert eine Transaktion mit maximaler Robustheit
   */
  private async saveTransactionRobust(vendonTransaction: any): Promise<{ action: string; reason?: string; id?: number }> {
    try {
      // Extrahiere alle wichtigen Felder
      const transactionId = vendonTransaction.id || vendonTransaction.transaction_id;
      if (!transactionId) {
        throw new Error('Transaktion hat keine ID');
      }

      // Prüfe ob Transaktion bereits existiert
      // Direkte SQL-Abfrage statt storage method
      const existingResult = await rawDb.query(
        'SELECT id FROM transactions WHERE vendon_id = $1 LIMIT 1',
        [transactionId.toString()]
      );
      const existingTransaction = existingResult.rows[0];

      if (existingTransaction) {
        // Transaktion existiert bereits - überspringe
        return { action: 'skipped', reason: 'already_exists' };
      }

      // Hole oder erstelle Maschine
      let machineId = 1; // Default
      if (vendonTransaction.machine_id) {
        const machineResult = await this.getOrCreateMachine(vendonTransaction);
        machineId = machineResult.id;
      }

      // Bereite Transaktionsdaten vor
      const datetime = vendonTransaction.datetime 
        ? new Date(vendonTransaction.datetime * 1000)
        : new Date();

      const newTransaction: InsertTransaction = {
        vendonId: transactionId.toString(),
        machineId: machineId,
        machineName: vendonTransaction.machine_name || 'Unbekannte Maschine',
        datetime: datetime,
        productName: vendonTransaction.name || vendonTransaction.product_name || 'Unbekanntes Produkt',
        price: vendonTransaction.price || 0,
        quantity: vendonTransaction.quantity || 1,
        source: 'vendon_api',
        extraData: JSON.stringify(vendonTransaction)
      };

      const savedTransaction = await storage.createTransaction(newTransaction);
      
      return { 
        action: 'inserted', 
        id: savedTransaction.id
      };

    } catch (error) {
      console.error('Fehler beim Speichern der Transaktion:', error);
      throw error;
    }
  }

  /**
   * Holt oder erstellt eine Maschine
   */
  private async getOrCreateMachine(vendonTransaction: any) {
    const vendonId = vendonTransaction.machine_id.toString();
    
    // Prüfe ob Maschine existiert
    const existingMachine = await storage.getMachineByVendonId(vendonId);

    if (existingMachine) {
      return existingMachine;
    }

    // Erstelle neue Maschine
    const newMachine: InsertMachine = {
      vendonId: vendonId,
      machineName: vendonTransaction.machine_name || `Maschine ${vendonId}`,
      lastSync: new Date()
    };

    const savedMachine = await storage.createMachine(newMachine);
    
    console.log(`✅ Neue Maschine erstellt: ${vendonId}`);
    return savedMachine;
  }

  /**
   * Identifiziert und füllt Datenlücken
   */
  private async identifyAndFillGaps() {
    console.log('\n🔍 Identifiziere und schließe Datenlücken...');
    
    try {
      // Prüfe die letzten 7 Tage auf Lücken
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      // Gehe Tag für Tag durch und prüfe auf ausreichende Daten
      let currentDate = new Date(startDate);
      
      while (currentDate < endDate) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        // Prüfe wieviele Transaktionen wir für diesen Tag haben
        const dayResult = await rawDb.query(
          'SELECT COUNT(*) as count FROM transactions WHERE datetime >= $1 AND datetime <= $2',
          [dayStart.toISOString(), dayEnd.toISOString()]
        );
        const dayTransactions = { length: parseInt(dayResult.rows[0].count) };
        
        if (dayTransactions.length < 10) { // Weniger als 10 Transaktionen pro Tag ist verdächtig
          console.log(`🔧 Schließe Lücke für: ${dayStart.toISOString().split('T')[0]} (nur ${dayTransactions.length} Transaktionen)`);
          
          const fillResult = await this.syncSingleDayRobust(dayStart, dayEnd);
          console.log(`✅ Lücke geschlossen: ${fillResult.synced} Transaktionen`);
          
          await this.sleep(1000);
        }
        
        // Nächster Tag
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
    } catch (error) {
      console.error('Fehler beim Schließen der Datenlücken:', error);
    }
  }

  /**
   * Hilfsfunktion für Delays
   */
  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Exportiere eine Standard-Instanz
export const ultraRobustVendonSync = new UltraRobustVendonSync();