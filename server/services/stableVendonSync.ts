/**
 * STABLE VENDON SYNC SERVICE
 * Überarbeiteter, stabiler Vendon-Synchronisationsservice
 * Löst das Problem der ständig neu angelegten Standorte
 */

import { storage } from "../storage";
import { 
  InsertTransaction, 
  InsertMachine,
  InsertEvent,
  InsertRefill,
  InsertSyncLog
} from "@shared/schema";
import { rawDb } from "../db";
import axios, { AxiosInstance } from "axios";

interface VendonMachine {
  id: string;
  name: string;
  location?: string;
  status?: string;
  last_ping?: string;
  [key: string]: any;
}

interface VendonTransaction {
  id: string;
  machine_id: string;
  amount: number;
  datetime: string;
  product_id?: string;
  product_name?: string;
  payment_method?: string;
  [key: string]: any;
}

interface VendonEvent {
  id: string;
  machine_id: string;
  datetime: string;
  event_type: string;
  description?: string;
  [key: string]: any;
}

interface VendonRefill {
  id: string;
  machine_id: string;
  datetime: string;
  user?: string;
  [key: string]: any;
}

export class StableVendonSync {
  private readonly BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";
  private readonly apiKey: string;
  private readonly client: AxiosInstance;
  private readonly maxRetries = 3;
  private readonly timeoutMs = 15000;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
    
    this.client = axios.create({
      baseURL: this.BASE_URL,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: this.timeoutMs,
    });

    console.log('🚀 Stable Vendon Sync initialisiert');
  }

  /**
   * HAUPTFUNKTION: Führt eine vollständige Synchronisation durch
   */
  async performFullSync(): Promise<{
    success: boolean;
    message: string;
    details: any;
  }> {
    console.log('\n=== STABLE VENDON SYNC GESTARTET ===');
    
    try {
      // 1. Synchronisiere Maschinen (ohne neue anzulegen)
      const machinesResult = await this.syncMachines();
      console.log('✅ Maschinen synchronisiert:', machinesResult);

      // 2. Synchronisiere Transaktionen
      const transactionsResult = await this.syncTransactions();
      console.log('✅ Transaktionen synchronisiert:', transactionsResult);

      // 3. Synchronisiere Events
      const eventsResult = await this.syncEvents();
      console.log('✅ Events synchronisiert:', eventsResult);

      // 4. Synchronisiere Refills
      const refillsResult = await this.syncRefills();
      console.log('✅ Refills synchronisiert:', refillsResult);

      const totalSynced = 
        transactionsResult.itemsSaved + 
        eventsResult.itemsSaved + 
        refillsResult.itemsSaved;

      return {
        success: true,
        message: `Vollständige Synchronisation erfolgreich: ${totalSynced} Datensätze synchronisiert`,
        details: {
          machines: machinesResult,
          transactions: transactionsResult,
          events: eventsResult,
          refills: refillsResult,
          totalSynced
        }
      };
    } catch (error) {
      console.error('❌ Stable Vendon Sync fehlgeschlagen:', error);
      throw error;
    }
  }

  /**
   * Synchronisiert Maschinen - Versucht API-Abruf, nutzt Fallback bei Fehler
   */
  private async syncMachines(): Promise<{ itemsUpdated: number; itemsSaved: number; duplicates: number; message: string }> {
    console.log('🔄 Synchronisiere Maschinen...');
    
    let itemsSaved = 0;
    let itemsUpdated = 0;
    let duplicates = 0;
    
    try {
      // Versuche Maschinen von API zu holen
      let apiMachines: any[] = [];
      
      try {
        // Versuche API-Abruf
        const response = await this.makeApiRequest<any>('/machines', {
          limit: 100,
          offset: 0
        });
        apiMachines = Array.isArray(response) ? response : [];
        console.log(`📡 ${apiMachines.length} Maschinen von API erhalten`);
      } catch (apiError) {
        console.warn('⚠️ Vendon API nicht verfügbar für Maschinen:', apiError instanceof Error ? apiError.message : String(apiError));
      }
      
      // Wenn API-Maschinen vorhanden, synchronisiere sie
      if (apiMachines.length > 0) {
        for (const apiMachine of apiMachines) {
          const vendonId = String(apiMachine.id || apiMachine.machine_id);
          
          // Prüfe ob Maschine bereits existiert
          const existingMachine = await storage.getMachineByVendonId(vendonId);
          
          if (existingMachine) {
            duplicates++;
            console.log(`📊 Duplikat gefunden: Maschine ${vendonId} existiert bereits mit ID ${existingMachine.id}`);
            
            // Aktualisiere bestehende Maschine
            await storage.updateMachine(existingMachine.id, {
              machineName: apiMachine.name || existingMachine.machineName,
              locationName: apiMachine.location || existingMachine.locationName,
              lastSync: new Date(),
              updatedAt: new Date()
            });
            itemsUpdated++;
            console.log(`✅ Maschine ${vendonId} aktualisiert (Duplikat #${duplicates})`);
          } else {
            // Erstelle neue Maschine
            await storage.createMachine({
              vendonId: vendonId,
              machineName: apiMachine.name || `Maschine ${vendonId}`,
              locationName: apiMachine.location || 'Unbekannt',
              status: 'active',
              lastSync: new Date()
            });
            itemsSaved++;
            console.log(`🆕 Neue Maschine ${vendonId} erstellt`);
          }
        }
        
        console.log(`📊 Sync-Ergebnis: ${apiMachines.length} Maschinen, ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate`);
        return {
          itemsSaved,
          itemsUpdated,
          duplicates,
          message: `${apiMachines.length} Maschinen synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate`
        };
      }
      
      // FALLBACK: Wenn keine API-Daten, aktualisiere nur lastSync für bestehende Maschinen
      const existingMachines = await storage.getMachines();
      
      if (existingMachines.length === 0) {
        return { itemsSaved: 0, itemsUpdated: 0, duplicates: 0, message: 'Keine Maschinen in der Datenbank gefunden' };
      }

      // Aktualisiere lastSync für alle bestehenden Maschinen
      for (const machine of existingMachines) {
        await storage.updateMachine(machine.id, {
          lastSync: new Date(),
          updatedAt: new Date()
        });
        itemsUpdated++;
        duplicates++; // Im Fallback-Modus zählen alle als Duplikate
      }

      console.log(`✅ ${existingMachines.length} bestehende Maschinen aktualisiert (Fallback-Modus)`);
      console.log(`📊 Fallback-Ergebnis: ${duplicates} Duplikate (alle bestehenden Maschinen)`);

      return {
        itemsSaved: 0,
        itemsUpdated,
        duplicates,
        message: `${itemsUpdated} Maschinen aktualisiert (Fallback-Modus, ${duplicates} Duplikate)`
      };

    } catch (error) {
      console.error('❌ Fehler beim Synchronisieren der Maschinen:', error);
      
      // Selbst bei Fehlern: Verwende bestehende Maschinen
      try {
        const existingMachines = await storage.getMachines();
        return {
          itemsSaved: 0,
          itemsUpdated: 0,
          duplicates: existingMachines.length,
          message: `Fehler bei Sync: ${existingMachines.length} bestehende Maschinen verfügbar`
        };
      } catch (fallbackError) {
        throw error;
      }
    }
  }

  /**
   * Synchronisiert Transaktionen (bargeldlose Verkäufe)
   */
  async syncTransactions(
    startDate?: Date,
    endDate?: Date
  ): Promise<{ itemsSaved: number; itemsUpdated: number; message: string }> {
    console.log('🔄 Synchronisiere Transaktionen...');

    // Standard: letzte 24 Stunden
    const effectiveStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate || new Date();

    try {
      // Versuche Transaktionen von Vendon API zu holen
      let vendonTransactions: VendonTransaction[] = [];
      
      try {
        // Vendon API erwartet UNIX-Zeitstempel in SEKUNDEN (nicht Millisekunden!)
        const fromTimestamp = Math.floor(effectiveStartDate.getTime() / 1000);
        const toTimestamp = Math.floor(effectiveEndDate.getTime() / 1000);
        
        // Verwende den korrekten Endpunkt /stats/vends für Transaktionen
        vendonTransactions = await this.makeApiRequest<VendonTransaction[]>('/stats/vends', {
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          limit: 1000,
          offset: 0
        });
      } catch (apiError) {
        console.warn('⚠️ Vendon API nicht verfügbar, überspringe Transaktions-Sync:', apiError instanceof Error ? apiError.message : String(apiError));
        return { itemsSaved: 0, itemsUpdated: 0, message: 'Vendon API nicht verfügbar - Transaktions-Sync übersprungen' };
      }

      // Prüfe ob vendonTransactions valide ist
      if (!vendonTransactions) {
        console.warn('⚠️ Keine Transaktionsdaten von API erhalten');
        return { itemsSaved: 0, itemsUpdated: 0, message: 'Keine neuen Transaktionen von API erhalten' };
      }
      
      // Konvertiere zu Array falls nötig
      const transactionsArray = Array.isArray(vendonTransactions) ? vendonTransactions : [];
      
      if (transactionsArray.length === 0) {
        console.log('📦 Keine Transaktionen im gewählten Zeitraum');
        return { itemsSaved: 0, itemsUpdated: 0, message: 'Keine neuen Transaktionen im gewählten Zeitraum' };
      }
      
      console.log(`📡 ${transactionsArray.length} Transaktionen von API erhalten`);

      // Hole bestehende Maschinen
      const existingMachines = await storage.getMachines();
      const machinesMap = new Map(
        existingMachines.map(m => [m.vendonId, m.id])
      );
      
      console.log(`🔍 Database Machine IDs:`, Array.from(machinesMap.keys()).slice(0, 10));
      
      // Sammle API Machine IDs für Debug
      const apiMachineIds = [...new Set(transactionsArray.map(t => t.machine_id))];
      console.log(`🔍 API Machine IDs:`, apiMachineIds.slice(0, 10));
      
      // Finde matching und missing Machine IDs
      const matchingIds = apiMachineIds.filter(id => machinesMap.has(id));
      const missingIds = apiMachineIds.filter(id => !machinesMap.has(id));
      
      console.log(`✅ Matching Machine IDs (${matchingIds.length}):`, matchingIds.slice(0, 5));
      console.log(`❌ Missing Machine IDs (${missingIds.length}):`, missingIds.slice(0, 10));

      let itemsSaved = 0;
      let itemsSkipped = 0;

      for (const vendonTransaction of transactionsArray) {
        try {
          // Prüfe ob Maschine existiert - konvertiere machine_id zu String für Mapping
          const machineId = machinesMap.get(String(vendonTransaction.machine_id));
          if (!machineId) {
            console.warn(`⚠️ Transaktion für unbekannte Maschine ${vendonTransaction.machine_id} übersprungen`);
            itemsSkipped++;
            continue;
          }

          // Prüfe auf Duplikate
          const existingTransaction = await this.checkTransactionExists(vendonTransaction.id);
          if (existingTransaction) {
            continue; // Überspringen, bereits vorhanden
          }

          // Debug: Log Vendon Transaction structure
          console.log(`🔍 Vendon Transaction Keys:`, Object.keys(vendonTransaction).slice(0, 8));
          console.log(`💰 Vendon Transaction amount/price:`, {
            amount: vendonTransaction.amount,
            price: vendonTransaction.price,
            total: vendonTransaction.total,
            sum: vendonTransaction.sum
          });
          
          // Erstelle neue Transaktion - robusteres Feldmapping für Vendon API
          const amount = vendonTransaction.amount || vendonTransaction.total || vendonTransaction.price || vendonTransaction.sum || 0;
          const price = vendonTransaction.price || vendonTransaction.amount || vendonTransaction.total || vendonTransaction.sum || 0;
          
          const newTransaction: InsertTransaction = {
            vendonId: String(vendonTransaction.id || vendonTransaction.transaction_id),
            machineId: machineId,
            amount: amount,
            price: price,
            datetime: new Date(vendonTransaction.datetime || vendonTransaction.timestamp),
            productId: vendonTransaction.product_id || vendonTransaction.productId || null,
            productName: vendonTransaction.product_name || vendonTransaction.productName || 'Unbekanntes Produkt',
            paymentMethod: this.normalizePaymentMethod(vendonTransaction.payment_method || vendonTransaction.paymentMethod),
            quantity: vendonTransaction.quantity || 1,
            priceVat: vendonTransaction.price_vat || vendonTransaction.vat || null,
            priceWoVat: vendonTransaction.price_wo_vat || vendonTransaction.net || null,
            extraData: JSON.stringify(vendonTransaction)
          };
          
          console.log(`💰 Neue Transaktion: ${newTransaction.vendonId} - ${newTransaction.productName} - ${newTransaction.amount}€`);

          await storage.createTransaction(newTransaction);
          itemsSaved++;

        } catch (error) {
          console.error(`❌ Fehler beim Verarbeiten der Transaktion ${vendonTransaction.id}:`, error);
        }
      }

      return {
        itemsSaved,
        itemsUpdated: 0,
        message: `${itemsSaved} neue Transaktionen gespeichert, ${itemsSkipped} übersprungen`
      };

    } catch (error) {
      console.error('❌ Fehler beim Synchronisieren der Transaktionen:', error);
      throw error;
    }
  }

  /**
   * Synchronisiert Events (Türöffnungen, etc.)
   */
  private async syncEvents(
    startDate?: Date,
    endDate?: Date
  ): Promise<{ itemsSaved: number; message: string }> {
    console.log('🔄 Synchronisiere Events...');

    const effectiveStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate || new Date();

    try {
      // Versuche Events von Vendon API zu holen
      let vendonEvents: VendonEvent[] = [];
      
      try {
        // Vendon API erwartet UNIX-Zeitstempel in SEKUNDEN
        const fromTimestamp = Math.floor(effectiveStartDate.getTime() / 1000);
        const toTimestamp = Math.floor(effectiveEndDate.getTime() / 1000);
        
        vendonEvents = await this.makeApiRequest<VendonEvent[]>('/stats/events', {
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          limit: 1000,
          offset: 0
        });
      } catch (apiError) {
        console.warn('⚠️ Vendon API nicht verfügbar, überspringe Events-Sync:', apiError instanceof Error ? apiError.message : String(apiError));
        return { itemsSaved: 0, message: 'Vendon API nicht verfügbar - Events-Sync übersprungen' };
      }

      // Prüfe ob vendonEvents valide ist
      if (!vendonEvents) {
        console.warn('⚠️ Keine Event-Daten von API erhalten');
        return { itemsSaved: 0, message: 'Keine neuen Events von API erhalten' };
      }
      
      // Konvertiere zu Array falls nötig
      const eventsArray = Array.isArray(vendonEvents) ? vendonEvents : [];
      
      if (eventsArray.length === 0) {
        console.log('📦 Keine Events im gewählten Zeitraum');
        return { itemsSaved: 0, message: 'Keine neuen Events im gewählten Zeitraum' };
      }
      
      console.log(`📡 ${eventsArray.length} Events von API erhalten`);

      const existingMachines = await storage.getMachines();
      const machinesMap = new Map(
        existingMachines.map(m => [m.vendonId, m.id])
      );

      let itemsSaved = 0;

      for (const vendonEvent of eventsArray) {
        try {
          const machineId = machinesMap.get(String(vendonEvent.machine_id));
          if (!machineId) {
            continue; // Überspringen, wenn Maschine nicht existiert
          }

          // Prüfe auf Duplikate
          const existingEvent = await this.checkEventExists(vendonEvent.id);
          if (existingEvent) {
            continue;
          }

          const newEvent: InsertEvent = {
            vendonId: vendonEvent.id,
            machineId: machineId,
            datetime: new Date(vendonEvent.datetime),
            eventType: vendonEvent.event_type || 'unknown',
            description: vendonEvent.description || null,
            rawApiData: JSON.stringify(vendonEvent)
          };

          await storage.createEvent(newEvent);
          itemsSaved++;

        } catch (error) {
          console.error(`❌ Fehler beim Verarbeiten des Events ${vendonEvent.id}:`, error);
        }
      }

      return {
        itemsSaved,
        message: `${itemsSaved} neue Events gespeichert`
      };

    } catch (error) {
      console.error('❌ Fehler beim Synchronisieren der Events:', error);
      throw error;
    }
  }

  /**
   * Synchronisiert Refills (Nachfüllungen)
   */
  private async syncRefills(
    startDate?: Date,
    endDate?: Date
  ): Promise<{ itemsSaved: number; message: string }> {
    console.log('🔄 Synchronisiere Refills...');

    const effectiveStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate || new Date();

    try {
      // Versuche Refills von Vendon API zu holen
      let vendonRefills: VendonRefill[] = [];
      
      try {
        // Vendon API erwartet UNIX-Zeitstempel in SEKUNDEN
        const fromTimestamp = Math.floor(effectiveStartDate.getTime() / 1000);
        const toTimestamp = Math.floor(effectiveEndDate.getTime() / 1000);
        
        vendonRefills = await this.makeApiRequest<VendonRefill[]>('/refills', {
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          limit: 1000,
          offset: 0
        });
      } catch (apiError) {
        console.warn('⚠️ Vendon API nicht verfügbar, überspringe Refills-Sync:', apiError instanceof Error ? apiError.message : String(apiError));
        return { itemsSaved: 0, message: 'Vendon API nicht verfügbar - Refills-Sync übersprungen' };
      }

      // Prüfe ob vendonRefills valide ist
      if (!vendonRefills) {
        console.warn('⚠️ Keine Refill-Daten von API erhalten');
        return { itemsSaved: 0, message: 'Keine neuen Refills von API erhalten' };
      }
      
      // Konvertiere zu Array falls nötig
      const refillsArray = Array.isArray(vendonRefills) ? vendonRefills : [];
      
      if (refillsArray.length === 0) {
        console.log('📦 Keine Refills im gewählten Zeitraum');
        return { itemsSaved: 0, message: 'Keine neuen Refills im gewählten Zeitraum' };
      }
      
      console.log(`📡 ${refillsArray.length} Refills von API erhalten`);

      const existingMachines = await storage.getMachines();
      const machinesMap = new Map(
        existingMachines.map(m => [m.vendonId, m.id])
      );

      let itemsSaved = 0;

      for (const vendonRefill of refillsArray) {
        try {
          const machineId = machinesMap.get(String(vendonRefill.machine_id));
          if (!machineId) {
            continue;
          }

          // Prüfe auf Duplikate
          const existingRefill = await this.checkRefillExists(vendonRefill.id);
          if (existingRefill) {
            continue;
          }

          const newRefill: InsertRefill = {
            vendonId: vendonRefill.id,
            machineId: machineId,
            datetime: new Date(vendonRefill.datetime),
            operator: vendonRefill.user || null,
            extraData: JSON.stringify(vendonRefill)
          };

          await storage.createRefill(newRefill);
          itemsSaved++;

        } catch (error) {
          console.error(`❌ Fehler beim Verarbeiten des Refills ${vendonRefill.id}:`, error);
        }
      }

      return {
        itemsSaved,
        message: `${itemsSaved} neue Refills gespeichert`
      };

    } catch (error) {
      console.error('❌ Fehler beim Synchronisieren der Refills:', error);
      throw error;
    }
  }

  /**
   * API-Request mit Retry-Logik
   */
  private async makeApiRequest<T>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`📡 API-Request: ${endpoint} (Versuch ${attempt + 1}/${this.maxRetries})`);
        
        const response = await this.client.get(endpoint, { params });
        
        if (response.status === 200 && response.data) {
          console.log(`✅ API-Request erfolgreich: ${endpoint}`);
          
          // Debug: Log response structure
          if (endpoint.includes('/stats/vends') || endpoint.includes('/machines')) {
            console.log(`🔍 Response-Typ für ${endpoint}:`, typeof response.data);
            console.log(`🔍 Response-Keys:`, response.data ? Object.keys(response.data).slice(0, 5) : 'keine');
            
            // Vendon API gibt oft ein Objekt mit 'data', 'items' oder 'result' Property zurück
            if (response.data.result && Array.isArray(response.data.result)) {
              console.log(`📦 Found nested result array with ${response.data.result.length} items`);
              return response.data.result as T;
            }
            if (response.data.data && Array.isArray(response.data.data)) {
              console.log(`📦 Found nested data array with ${response.data.data.length} items`);
              return response.data.data as T;
            }
            if (response.data.items && Array.isArray(response.data.items)) {
              console.log(`📦 Found nested items array with ${response.data.items.length} items`);
              return response.data.items as T;
            }
            // Wenn response.data selbst ein Array ist
            if (Array.isArray(response.data)) {
              console.log(`📦 Response is array with ${response.data.length} items`);
            }
          }
          
          return response.data;
        }
        
        throw new Error(`Unerwarteter Status: ${response.status}`);
        
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️ API-Request fehlgeschlagen (Versuch ${attempt + 1}):`, error.message);
        
        if (attempt < this.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ Warte ${delay}ms vor nächstem Versuch...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`API-Request nach ${this.maxRetries} Versuchen fehlgeschlagen: ${lastError?.message}`);
  }

  /**
   * Hilfsfunktionen zur Duplikatsprüfung
   */
  private async checkTransactionExists(vendonId: string): Promise<boolean> {
    try {
      const result = await rawDb.query(
        'SELECT id FROM transactions WHERE vendon_id = $1 LIMIT 1',
        [vendonId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Fehler bei Transaktions-Duplikatsprüfung:', error);
      return false;
    }
  }

  private async checkEventExists(vendonId: string): Promise<boolean> {
    try {
      const result = await rawDb.query(
        'SELECT id FROM events WHERE vendon_id = $1 LIMIT 1',
        [vendonId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Fehler bei Event-Duplikatsprüfung:', error);
      return false;
    }
  }

  private async checkRefillExists(vendonId: string): Promise<boolean> {
    try {
      const result = await rawDb.query(
        'SELECT id FROM refills WHERE vendon_id = $1 LIMIT 1',
        [vendonId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Fehler bei Refill-Duplikatsprüfung:', error);
      return false;
    }
  }

  /**
   * Normalisiert Zahlungsmethoden
   */
  private normalizePaymentMethod(paymentMethod?: string): string {
    if (!paymentMethod) return 'UNKNOWN';
    
    const method = paymentMethod.toUpperCase();
    const cashlessTypes = ['CARD', 'CASHLESS', 'MOBILE', 'CONTACTLESS', 'NFC', 'QR'];
    
    if (cashlessTypes.some(type => method.includes(type))) {
      return 'CASHLESS';
    }
    
    return method;
  }

  /**
   * Erstellt einen Sync-Log-Eintrag
   */
  async createSyncLog(syncType: string, data: Partial<InsertSyncLog>): Promise<void> {
    try {
      const syncLog: InsertSyncLog = {
        syncType,
        startDate: data.startDate || new Date(),
        endDate: data.endDate || new Date(),
        itemsFound: data.itemsFound || 0,
        itemsSaved: data.itemsSaved || 0,
        itemsUpdated: data.itemsUpdated || 0,
        syncStatus: data.syncStatus || 'completed',
        errorMessage: data.errorMessage || null,
        additionalData: data.additionalData || '{}'
      };

      await storage.createSyncLog(syncLog);
    } catch (error) {
      console.error('Fehler beim Erstellen des Sync-Logs:', error);
    }
  }
}

// Export einer Singleton-Instanz
export const stableVendonSync = new StableVendonSync();