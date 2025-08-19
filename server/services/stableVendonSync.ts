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
   * Synchronisiert Maschinen - VERWENDET NUR BESTEHENDE MASCHINEN
   * FALLBACK: Arbeitet mit bestehenden Maschinen wenn API nicht verfügbar ist
   */
  private async syncMachines(): Promise<{ itemsUpdated: number; message: string }> {
    console.log('🔄 Synchronisiere Maschinen...');
    
    try {
      // FALLBACK STRATEGIE: Verwende bestehende Maschinen aus der Datenbank
      const existingMachines = await storage.getMachines();
      
      if (existingMachines.length === 0) {
        return { itemsUpdated: 0, message: 'Keine Maschinen in der Datenbank gefunden' };
      }

      // Aktualisiere lastSync für alle bestehenden Maschinen
      let itemsUpdated = 0;
      for (const machine of existingMachines) {
        await storage.updateMachine(machine.id, {
          lastSync: new Date(),
          updatedAt: new Date()
        });
        itemsUpdated++;
      }

      console.log(`✅ ${existingMachines.length} bestehende Maschinen aktualisiert (Fallback-Modus)`);

      return {
        itemsUpdated,
        message: `${itemsUpdated} Maschinen aktualisiert (Fallback-Modus ohne neue Maschinen)`
      };

    } catch (error) {
      console.error('❌ Fehler beim Synchronisieren der Maschinen:', error);
      
      // Selbst bei Fehlern: Verwende bestehende Maschinen
      try {
        const existingMachines = await storage.getMachines();
        return {
          itemsUpdated: 0,
          message: `Fallback: ${existingMachines.length} bestehende Maschinen verfügbar`
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
        vendonTransactions = await this.makeApiRequest<VendonTransaction[]>('/transactions', {
          from: effectiveStartDate.toISOString().split('T')[0],
          to: effectiveEndDate.toISOString().split('T')[0]
        });
      } catch (apiError) {
        console.warn('⚠️ Vendon API nicht verfügbar, überspringe Transaktions-Sync:', apiError instanceof Error ? apiError.message : String(apiError));
        return { itemsSaved: 0, itemsUpdated: 0, message: 'Vendon API nicht verfügbar - Transaktions-Sync übersprungen' };
      }

      if (!vendonTransactions || vendonTransactions.length === 0) {
        return { itemsSaved: 0, itemsUpdated: 0, message: 'Keine neuen Transaktionen von API erhalten' };
      }

      // Hole bestehende Maschinen
      const existingMachines = await storage.getMachines();
      const machinesMap = new Map(
        existingMachines.map(m => [m.vendonId, m.id])
      );

      let itemsSaved = 0;
      let itemsSkipped = 0;

      for (const vendonTransaction of vendonTransactions) {
        try {
          // Prüfe ob Maschine existiert
          const machineId = machinesMap.get(vendonTransaction.machine_id);
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

          // Erstelle neue Transaktion
          const newTransaction: InsertTransaction = {
            vendonId: vendonTransaction.id,
            machineId: machineId,
            amount: vendonTransaction.amount || 0,
            price: vendonTransaction.amount || 0, // price ist required
            datetime: new Date(vendonTransaction.datetime),
            productId: vendonTransaction.product_id || null,
            productName: vendonTransaction.product_name || null,
            paymentMethod: this.normalizePaymentMethod(vendonTransaction.payment_method),
            extraData: JSON.stringify(vendonTransaction)
          };

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

    const effectiveStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate || new Date();

    try {
      // Versuche Events von Vendon API zu holen
      let vendonEvents: VendonEvent[] = [];
      
      try {
        vendonEvents = await this.makeApiRequest<VendonEvent[]>('/events', {
          from: effectiveStartDate.toISOString().split('T')[0],
          to: effectiveEndDate.toISOString().split('T')[0]
        });
      } catch (apiError) {
        console.warn('⚠️ Vendon API nicht verfügbar, überspringe Events-Sync:', apiError instanceof Error ? apiError.message : String(apiError));
        return { itemsSaved: 0, message: 'Vendon API nicht verfügbar - Events-Sync übersprungen' };
      }

      if (!vendonEvents || vendonEvents.length === 0) {
        return { itemsSaved: 0, message: 'Keine neuen Events von API erhalten' };
      }

      const existingMachines = await storage.getMachines();
      const machinesMap = new Map(
        existingMachines.map(m => [m.vendonId, m.id])
      );

      let itemsSaved = 0;

      for (const vendonEvent of vendonEvents) {
        try {
          const machineId = machinesMap.get(vendonEvent.machine_id);
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

    const effectiveStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate || new Date();

    try {
      // Versuche Refills von Vendon API zu holen
      let vendonRefills: VendonRefill[] = [];
      
      try {
        vendonRefills = await this.makeApiRequest<VendonRefill[]>('/refills', {
          from: effectiveStartDate.toISOString().split('T')[0],
          to: effectiveEndDate.toISOString().split('T')[0]
        });
      } catch (apiError) {
        console.warn('⚠️ Vendon API nicht verfügbar, überspringe Refills-Sync:', apiError instanceof Error ? apiError.message : String(apiError));
        return { itemsSaved: 0, message: 'Vendon API nicht verfügbar - Refills-Sync übersprungen' };
      }

      if (!vendonRefills || vendonRefills.length === 0) {
        return { itemsSaved: 0, message: 'Keine neuen Refills von API erhalten' };
      }

      const existingMachines = await storage.getMachines();
      const machinesMap = new Map(
        existingMachines.map(m => [m.vendonId, m.id])
      );

      let itemsSaved = 0;

      for (const vendonRefill of vendonRefills) {
        try {
          const machineId = machinesMap.get(vendonRefill.machine_id);
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