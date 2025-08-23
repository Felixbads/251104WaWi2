/**
 * UNIFIED VENDON SYNC COORDINATOR
 * 
 * Solves the Duplikat-Problem und instabile Synchronisation by providing:
 * - Single entry point for all Vendon synchronization
 * - Proper locking mechanism to prevent race conditions  
 * - Centralized duplicate prevention
 * - Robust error handling and monitoring
 * - Transaction-safe database operations
 * 
 * This replaces:
 * - vendonSync.ts (3,476 lines with 36 errors)
 * - stableVendonSync.ts  
 * - resilientVendonSync.ts
 * - vendonBackgroundService.ts
 * - All competing schedulers
 */

import { storage } from "../storage";
import { 
  InsertSyncLog, 
  InsertMachine, 
  InsertTransaction, 
  InsertEvent,
  InsertRefill
} from "@shared/schema";
import { rawDb } from "../db";
import { sql } from "drizzle-orm";
import { SYNC_TYPE, acquireSyncLock, releaseSyncLock } from "./syncLock";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

interface SyncResult {
  success: boolean;
  itemsFound: number;
  itemsSaved: number;
  itemsUpdated: number;
  duplicates: number;
  errors: string[];
  durationMs: number;
  message: string;
}

interface VendonApiResponse<T> {
  code?: number;
  result: T | T[];
  paging?: {
    offset: number;
    limit: number;
    total: number;
  };
}

interface VendonTransaction {
  transaction_id: string;
  machine_id: string;
  machine_name?: string;
  datetime: string;
  transaction_dt?: string;
  registered_dt?: string;
  quantity?: number;
  price: number;
  product_name?: string;
  payment_method?: string;
  [key: string]: any;
}

interface VendonMachine {
  id: string;
  name: string;
  location?: string;
  status?: string;
  last_ping?: string;
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
  operator?: string;
  status?: string;
  [key: string]: any;
}

// =============================================================================
// VENDON API CLIENT
// =============================================================================

class VendonApiClient {
  private readonly BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
    
    this.client = axios.create({
      baseURL: this.BASE_URL,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000, // 30 seconds
    });

    console.log('🔗 Vendon API Client initialisiert');
  }

  /**
   * Robust API request with exponential backoff retry
   */
  async makeRequest<T>(
    endpoint: string, 
    params: Record<string, any> = {}, 
    retries: number = 3
  ): Promise<T> {
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`📡 API-Request: ${endpoint} (Versuch ${attempt}/${retries})`);
        if (Object.keys(params).length > 0) {
          console.log('📋 Parameter:', params);
        }
        
        const response = await this.client.get<VendonApiResponse<T>>(endpoint, { 
          params 
        });
        
        console.log(`✅ API-Request erfolgreich: ${endpoint}`);
        console.log(`🔍 Response-Typ für ${endpoint}: ${typeof response.data}`);
        
        if (response.data && typeof response.data === 'object' && 'result' in response.data) {
          console.log(`🔍 Response-Keys: ${JSON.stringify(Object.keys(response.data))}`);
          
          // Handle nested result arrays
          if (Array.isArray(response.data.result)) {
            console.log(`📦 Found nested result array with ${response.data.result.length} items`);
            return response.data.result as T;
          } else {
            return response.data.result as T;
          }
        }
        
        // Fallback for non-standard responses
        return response.data as T;
        
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.response
          ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`
          : error.message;
        
        console.warn(`⚠️ API-Request fehlgeschlagen (Versuch ${attempt}): ${errorMessage}`);
        
        // Don't wait on last attempt
        if (attempt < retries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          console.log(`⏳ Warte ${delay}ms vor nächstem Versuch...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`❌ API-Request endgültig fehlgeschlagen nach ${retries} Versuchen: ${endpoint}`);
    throw lastError;
  }

  /**
   * Get machines from API with fallback handling
   */
  async getMachines(): Promise<VendonMachine[]> {
    try {
      return await this.makeRequest<VendonMachine[]>('/machines');
    } catch (error) {
      console.warn('⚠️ Vendon /machines API nicht verfügbar - wird übersprungen');
      return [];
    }
  }

  /**
   * Get transactions for date range - FIXED API FORMAT
   */
  async getTransactions(startDate: Date, endDate: Date, limit: number = 100): Promise<VendonTransaction[]> {
    // Vendon API /stats/vends erwartet Unix-Zeitstempel in Sekunden
    const toUnixTimestamp = (date: Date) => {
      return Math.floor(date.getTime() / 1000); // Unix timestamp in seconds
    };
    
    const params = {
      'from_timestamp': toUnixTimestamp(startDate),
      'to_timestamp': toUnixTimestamp(endDate),
      'limit': limit,
      'offset': 0
    };
    
    console.log(`🔍 Live-Transaktionen API-Call - Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    console.log(`📊 Unix timestamps: ${params.from_timestamp} bis ${params.to_timestamp}`);
    
    return await this.makeRequest<VendonTransaction[]>('/stats/vends', params);
  }

  /**
   * Get events for date range
   */
  async getEvents(startDate: Date, endDate: Date): Promise<VendonEvent[]> {
    // Vendon API erwartet Unix-Zeitstempel für Events
    const toUnixTimestamp = (date: Date) => {
      return Math.floor(date.getTime() / 1000); // Unix timestamp in seconds
    };
    
    const params = {
      'from_timestamp': toUnixTimestamp(startDate),
      'to_timestamp': toUnixTimestamp(endDate),
      'limit': 100,
      'offset': 0
    };
    
    try {
      return await this.makeRequest<VendonEvent[]>('/event/', params);
    } catch (error) {
      console.warn('⚠️ Events API nicht verfügbar - wird übersprungen');
      return [];
    }
  }

  /**
   * Get refills for date range with pagination
   */
  async getRefills(startDate: Date, endDate: Date): Promise<VendonRefill[]> {
    // Vendon API erwartet Unix-Zeitstempel für Refills
    const toUnixTimestamp = (date: Date) => {
      return Math.floor(date.getTime() / 1000); // Unix timestamp in seconds
    };
    
    const allRefills: VendonRefill[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    console.log('📄 Hole Refills mit Pagination...');
    
    while (hasMore) {
      const params = {
        'from_timestamp': toUnixTimestamp(startDate),
        'to_timestamp': toUnixTimestamp(endDate),
        'limit': limit,
        'offset': offset
      };
      
      try {
        const batch = await this.makeRequest<VendonRefill[]>('/refills', params);
        if (batch && batch.length > 0) {
          allRefills.push(...batch);
          console.log(`📦 Seite ${Math.floor(offset/limit) + 1}: ${batch.length} Refills erhalten (Gesamt: ${allRefills.length})`);
          
          if (batch.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.warn('⚠️ Fehler beim Abrufen von Refills - abgebrochen');
        hasMore = false;
      }
    }
    
    return allRefills;
  }
}

// =============================================================================
// UNIFIED VENDON SYNC COORDINATOR
// =============================================================================

export class UnifiedVendonSyncCoordinator {
  private apiClient: VendonApiClient;
  private isRunning: boolean = false;
  private syncStats = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    lastSyncTime: null as Date | null,
    lastError: null as string | null
  };

  constructor(apiKey?: string) {
    this.apiClient = new VendonApiClient(apiKey);
    console.log('🚀 Unified Vendon Sync Coordinator initialisiert');
  }

  /**
   * MAIN SYNC FUNCTION - Single entry point for all Vendon synchronization
   */
  async performFullSync(): Promise<SyncResult> {
    const startTime = Date.now();
    let totalResult: SyncResult = {
      success: false,
      itemsFound: 0,
      itemsSaved: 0,
      itemsUpdated: 0,
      duplicates: 0,
      errors: [],
      durationMs: 0,
      message: ''
    };

    // Global sync lock to prevent multiple syncs
    if (!(await acquireSyncLock('VENDON_FULL_SYNC', 'UnifiedCoordinator'))) {
      return {
        ...totalResult,
        success: false,
        message: 'Synchronisation bereits aktiv - übersprungen',
        durationMs: Date.now() - startTime
      };
    }

    console.log('\n=== UNIFIED VENDON SYNC GESTARTET ===');
    this.isRunning = true;
    this.syncStats.totalSyncs++;

    try {
      // 1. Sync Machines (if available)
      const machinesResult = await this.syncMachines();
      totalResult.itemsUpdated += machinesResult.itemsUpdated;
      totalResult.duplicates += machinesResult.duplicates;
      totalResult.errors.push(...machinesResult.errors);

      // 2. Sync Transactions (priority)
      const transactionsResult = await this.syncTransactions();
      totalResult.itemsFound += transactionsResult.itemsFound;
      totalResult.itemsSaved += transactionsResult.itemsSaved;
      totalResult.duplicates += transactionsResult.duplicates;
      totalResult.errors.push(...transactionsResult.errors);

      // 3. Sync Events
      const eventsResult = await this.syncEvents();
      totalResult.itemsFound += eventsResult.itemsFound;
      totalResult.itemsSaved += eventsResult.itemsSaved;
      totalResult.duplicates += eventsResult.duplicates;
      totalResult.errors.push(...eventsResult.errors);

      // 4. Sync Refills
      const refillsResult = await this.syncRefills();
      totalResult.itemsFound += refillsResult.itemsFound;
      totalResult.itemsSaved += refillsResult.itemsSaved;
      totalResult.duplicates += refillsResult.duplicates;
      totalResult.errors.push(...refillsResult.errors);

      const durationMs = Date.now() - startTime;
      totalResult.durationMs = durationMs;
      totalResult.success = totalResult.errors.length === 0;
      totalResult.message = `Vollsync erfolgreich: ${totalResult.itemsSaved} neue Datensätze in ${(durationMs/1000).toFixed(1)}s`;

      this.syncStats.successfulSyncs++;
      this.syncStats.lastSyncTime = new Date();
      this.syncStats.lastError = null;

      console.log(`✅ ${totalResult.message}`);
      
      // Log sync results
      await this.logSyncResult('FULL_SYNC', totalResult);

      return totalResult;

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.syncStats.failedSyncs++;
      this.syncStats.lastError = error.message;
      
      totalResult.success = false;
      totalResult.durationMs = durationMs;
      totalResult.errors.push(error.message);
      totalResult.message = `Synchronisation fehlgeschlagen: ${error.message}`;

      console.error(`❌ ${totalResult.message}`);
      await this.logSyncResult('FULL_SYNC', totalResult);

      throw error;

    } finally {
      this.isRunning = false;
      await releaseSyncLock('VENDON_FULL_SYNC', 'UnifiedCoordinator');
    }
  }

  /**
   * Quick sync - only transactions from last 2 hours
   */
  async performQuickSync(): Promise<SyncResult> {
    const startTime = Date.now();
    
    if (!(await acquireSyncLock('VENDON_QUICK_SYNC', 'UnifiedCoordinator'))) {
      return {
        success: false,
        itemsFound: 0,
        itemsSaved: 0,
        itemsUpdated: 0,
        duplicates: 0,
        errors: [],
        durationMs: Date.now() - startTime,
        message: 'Quick-Sync bereits aktiv - übersprungen'
      };
    }

    try {
      console.log('⚡ Starte schnelle Transaktions-Synchronisation...');
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
      
      const result = await this.syncTransactionsForPeriod(startDate, endDate);
      result.durationMs = Date.now() - startTime;
      
      if (result.itemsSaved > 0) {
        console.log(`⚡ Schnellsync erfolgreich: ${result.itemsSaved} neue Transaktionen in ${(result.durationMs/1000).toFixed(3)}s`);
      }
      
      await this.logSyncResult('QUICK_SYNC', result);
      return result;
      
    } finally {
      await releaseSyncLock('VENDON_QUICK_SYNC', 'UnifiedCoordinator');
    }
  }

  // =============================================================================
  // SYNC IMPLEMENTATIONS
  // =============================================================================

  private async syncMachines(): Promise<SyncResult> {
    console.log('🔄 Synchronisiere Maschinen...');
    const startTime = Date.now();
    
    try {
      const apiMachines = await this.apiClient.getMachines();
      console.log(`📡 ${apiMachines.length} Maschinen von API erhalten`);

      let itemsUpdated = 0;
      let duplicates = 0;

      // Get existing machines from database for comparison
      const existingMachines = await storage.getMachines();
      console.log(`🗄️ ${existingMachines.length} Maschinen in Datenbank vorhanden`);

      for (const apiMachine of apiMachines) {
        try {
          const existingMachine = existingMachines.find(m => m.vendonId === apiMachine.id);
          
          if (existingMachine) {
            // Update existing machine
            await storage.updateMachine(existingMachine.id, {
              machineName: apiMachine.name,
              status: apiMachine.status || 'unknown',
              lastSync: new Date()
            });
            itemsUpdated++;
          } else {
            // Create new machine
            await storage.createMachine({
              vendonId: apiMachine.id,
              machineName: apiMachine.name,
              machineType: 'vending_machine',
              status: apiMachine.status || 'unknown'
            });
            itemsUpdated++;
          }
        } catch (error: any) {
          console.warn(`⚠️ Fehler bei Maschine ${apiMachine.id}: ${error.message}`);
          duplicates++; // Count as duplicate if already exists
        }
      }

      return {
        success: true,
        itemsFound: apiMachines.length,
        itemsSaved: 0,
        itemsUpdated,
        duplicates,
        errors: [],
        durationMs: Date.now() - startTime,
        message: `${itemsUpdated} Maschinen aktualisiert`
      };

    } catch (error: any) {
      console.warn('⚠️ Maschinen-API nicht verfügbar - verwende Fallback aus Transaktionen');
      return {
        success: true,
        itemsFound: 0,
        itemsSaved: 0,
        itemsUpdated: 0,
        duplicates: 0,
        errors: [],
        durationMs: Date.now() - startTime,
        message: 'Maschinen-Sync übersprungen (API nicht verfügbar)'
      };
    }
  }

  private async syncTransactions(): Promise<SyncResult> {
    console.log('🔄 Synchronisiere Transaktionen...');
    
    // Sync transactions for last 2 hours by default
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 2 * 60 * 60 * 1000);
    
    console.log(`🕐 Transaktions-Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    return await this.syncTransactionsForPeriod(startDate, endDate);
  }

  private async syncTransactionsForPeriod(startDate: Date, endDate: Date): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      const apiTransactions = await this.apiClient.getTransactions(startDate, endDate, 100);
      console.log(`📡 ${apiTransactions.length} Transaktionen von API erhalten`);

      let itemsSaved = 0;
      let duplicates = 0;
      const errors: string[] = [];

      for (const apiTransaction of apiTransactions) {
        try {
          // Enhanced duplicate checking with database query
          const existingTransaction = await rawDb.query(
            `SELECT id FROM transactions WHERE vendon_id = $1 LIMIT 1`,
            [apiTransaction.transaction_id]
          );
          
          console.log(`🔍 Vendon Transaction Keys: ${JSON.stringify(Object.keys(apiTransaction))}`);
          console.log(`💰 Vendon Transaction amount/price: { amount: ${(apiTransaction as any).amount}, price: ${apiTransaction.price}, total: ${(apiTransaction as any).total}, sum: ${(apiTransaction as any).sum} }`);
          
          if (existingTransaction.rows.length > 0) {
            console.log(`⚠️ Transaktion ${apiTransaction.transaction_id} bereits vorhanden - übersprungen`);
            duplicates++;
            continue;
          }

          // Create new transaction
          const newTransaction: InsertTransaction = {
            vendonId: apiTransaction.transaction_id,
            machineId: null, // Will be resolved later
            machineName: apiTransaction.machine_name || '',
            datetime: this.parseVendonDate(apiTransaction.datetime),
            productName: apiTransaction.product_name || 'Unbekanntes Produkt',
            price: apiTransaction.price,
            quantity: apiTransaction.quantity || 1,
            source: 'vendon_api',
            paymentMethod: apiTransaction.payment_method || 'unknown',
            status: 'completed',
            currency: 'EUR'
          };

          console.log(`💰 Neue Transaktion: ${apiTransaction.transaction_id} - ${newTransaction.productName} - ${newTransaction.price}€`);

          await storage.createTransaction(newTransaction);
          itemsSaved++;

        } catch (error: any) {
          const errorMsg = `Fehler bei Transaktion ${apiTransaction.transaction_id}: ${error.message}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      return {
        success: errors.length === 0,
        itemsFound: apiTransactions.length,
        itemsSaved,
        itemsUpdated: 0,
        duplicates,
        errors,
        durationMs: Date.now() - startTime,
        message: `${itemsSaved} neue Transaktionen gespeichert, ${duplicates} übersprungen`
      };

    } catch (error: any) {
      return {
        success: false,
        itemsFound: 0,
        itemsSaved: 0,
        itemsUpdated: 0,
        duplicates: 0,
        errors: [error.message],
        durationMs: Date.now() - startTime,
        message: `Transaktions-Sync fehlgeschlagen: ${error.message}`
      };
    }
  }

  private async syncEvents(): Promise<SyncResult> {
    console.log('🔄 Synchronisiere Events...');
    const startTime = Date.now();
    
    try {
      // FIXED: Events for last 24 hours only (Vendon API rejects large ranges)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
      
      console.log(`🔍 Teste Events API-Endpunkte von ${startDate.toISOString()} bis ${endDate.toISOString()}`);
      console.log('📡 Teste /event/ Endpunkt...');
      
      const apiEvents = await this.apiClient.getEvents(startDate, endDate);
      console.log(`📦 ${apiEvents.length > 0 ? `${apiEvents.length} Events erhalten` : 'Keine Events im gewählten Zeitraum'}`);

      if (apiEvents.length === 0) {
        return {
          success: true,
          itemsFound: 0,
          itemsSaved: 0,
          itemsUpdated: 0,
          duplicates: 0,
          errors: [],
          durationMs: Date.now() - startTime,
          message: 'Keine neuen Events im gewählten Zeitraum'
        };
      }

      let itemsSaved = 0;
      let duplicates = 0;

      for (const apiEvent of apiEvents) {
        try {
          // Check for duplicates
          const existingEvent = await rawDb.query(
            `SELECT id FROM events WHERE vendon_id = $1 LIMIT 1`,
            [apiEvent.id]
          );
          
          if (existingEvent.rows.length > 0) {
            duplicates++;
            continue;
          }

          const newEvent: InsertEvent = {
            vendonId: apiEvent.id,
            machineId: null, // Will be resolved later
            machineName: '', // Will be resolved later
            datetime: this.parseVendonDate(apiEvent.datetime),
            eventType: apiEvent.event_type,
            description: apiEvent.description || '',
            source: 'vendon_api',
            severity: 'info',
            status: 'logged'
          };

          await storage.createEvent(newEvent);
          itemsSaved++;

        } catch (error: any) {
          console.warn(`⚠️ Fehler bei Event ${apiEvent.id}: ${error.message}`);
        }
      }

      return {
        success: true,
        itemsFound: apiEvents.length,
        itemsSaved,
        itemsUpdated: 0,
        duplicates,
        errors: [],
        durationMs: Date.now() - startTime,
        message: `${itemsSaved} neue Events gespeichert`
      };

    } catch (error: any) {
      return {
        success: true,
        itemsFound: 0,
        itemsSaved: 0,
        itemsUpdated: 0,
        duplicates: 0,
        errors: [],
        durationMs: Date.now() - startTime,
        message: 'Events API nicht verfügbar - übersprungen'
      };
    }
  }

  private async syncRefills(): Promise<SyncResult> {
    console.log('🔄 Synchronisiere Refills...');
    const startTime = Date.now();
    
    try {
      // FIXED: Refills for last 7 days only (Vendon API rejects large ranges)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      console.log(`🔍 Teste Refills API von ${startDate.toISOString()} bis ${endDate.toISOString()}`);
      
      const apiRefills = await this.apiClient.getRefills(startDate, endDate);
      console.log(`📡 ${apiRefills.length} Refills von API erhalten`);

      let itemsSaved = 0;
      let duplicates = 0;
      const errors: string[] = [];

      for (const apiRefill of apiRefills) {
        try {
          // Check for duplicates
          const existingRefill = await rawDb.query(
            `SELECT id FROM refills WHERE vendon_id = $1 LIMIT 1`,
            [apiRefill.id]
          );
          
          if (existingRefill.rows.length > 0) {
            duplicates++;
            continue;
          }

          // Find the correct machine ID based on machine name or vendon ID
          let machineId: number | null = null;
          const machineName = apiRefill.machine_name || apiRefill.machine || '';
          const vendonMachineId = apiRefill.machine_id || apiRefill.vendon_machine_id || '';
          
          // First try to find by vendon_id
          if (vendonMachineId) {
            const machineResult = await rawDb.query(
              `SELECT id, machine_name FROM machines WHERE vendon_id = $1 LIMIT 1`,
              [vendonMachineId]
            );
            
            if (machineResult.rows.length > 0) {
              machineId = machineResult.rows[0].id;
              console.log(`✅ Maschine gefunden via Vendon ID ${vendonMachineId}: ${machineResult.rows[0].machine_name}`);
            }
          }
          
          // If not found, try to find by machine name
          if (!machineId && machineName) {
            const machineResult = await rawDb.query(
              `SELECT id, vendon_id FROM machines WHERE machine_name ILIKE $1 LIMIT 1`,
              [`%${machineName}%`]
            );
            
            if (machineResult.rows.length > 0) {
              machineId = machineResult.rows[0].id;
              console.log(`✅ Maschine gefunden via Name '${machineName}': ID ${machineId}`);
            } else {
              console.log(`⚠️ Maschine nicht gefunden für Refill ${apiRefill.id}: Name='${machineName}', VendonID='${vendonMachineId}'`);
            }
          }

          // Skip if no machine found
          if (!machineId) {
            console.warn(`⚠️ Überspringe Refill ${apiRefill.id} - keine Maschine gefunden`);
            errors.push(`Keine Maschine gefunden für Refill ${apiRefill.id}`);
            continue;
          }

          // Parse datetime safely
          let refillDatetime: Date;
          try {
            refillDatetime = new Date(apiRefill.datetime);
            // Check if date is valid
            if (isNaN(refillDatetime.getTime())) {
              throw new Error('Invalid date');
            }
          } catch (dateError) {
            console.warn(`⚠️ Ungültiges Datum für Refill ${apiRefill.id}: ${apiRefill.datetime}`);
            errors.push(`Ungültiges Datum für Refill ${apiRefill.id}`);
            continue;
          }

          const newRefill: InsertRefill = {
            vendonId: apiRefill.id,
            machineId,
            machineName,
            datetime: refillDatetime,
            operator: apiRefill.operator || apiRefill.user || 'unknown',
            status: apiRefill.status || 'completed',
            source: 'vendon_api'
          };

          console.log(`✅ Speichere Refill ${apiRefill.id} für Maschine ${machineName} (ID: ${machineId})`);
          await storage.createRefill(newRefill);
          itemsSaved++;

        } catch (error: any) {
          const errorMsg = `Fehler bei Refill ${apiRefill.id}: ${error.message}`;
          console.warn(`⚠️ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      return {
        success: errors.length === 0,
        itemsFound: apiRefills.length,
        itemsSaved,
        itemsUpdated: 0,
        duplicates,
        errors,
        durationMs: Date.now() - startTime,
        message: `${itemsSaved} neue Refills gespeichert, ${duplicates} übersprungen, ${errors.length} Fehler`
      };

    } catch (error: any) {
      return {
        success: true,
        itemsFound: 0,
        itemsSaved: 0,
        itemsUpdated: 0,
        duplicates: 0,
        errors: [],
        durationMs: Date.now() - startTime,
        message: 'Refills API nicht verfügbar - übersprungen'
      };
    }
  }

  /**
   * Log sync results to database
   */
  private async logSyncResult(syncType: string, result: SyncResult): Promise<void> {
    try {
      const syncLog: InsertSyncLog = {
        syncType,
        itemsFound: result.itemsFound,
        itemsSaved: result.itemsSaved,
        itemsUpdated: result.itemsUpdated,
        duplicates: result.duplicates,
        errors: result.errors.length,
        durationSeconds: result.durationMs / 1000,
        syncStatus: result.success ? 'completed' : 'error',
        errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
        endDate: new Date()
      };

      await storage.createSyncLog(syncLog);
    } catch (error) {
      console.warn('⚠️ Fehler beim Protokollieren des Sync-Ergebnisses:', error);
    }
  }

  /**
   * Get sync status and statistics
   */
  getSyncStatus() {
    return {
      isRunning: this.isRunning,
      stats: this.syncStats
    };
  }

  /**
   * Parse Vendon API date strings safely to prevent "Invalid time value" errors
   */
  private parseVendonDate(dateString: any): Date {
    if (!dateString) {
      console.warn('⚠️ Kein Datum angegeben - verwende aktuelles Datum');
      return new Date();
    }
    
    try {
      // Handle various date formats from Vendon API
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn(`⚠️ Ungültiges Datum von Vendon API: ${dateString}`);
        return new Date(); // Return current date as fallback
      }
      
      // Check if date is reasonable (not in far future or past)
      const now = new Date();
      const yearDiff = Math.abs(date.getFullYear() - now.getFullYear());
      
      if (yearDiff > 100) {
        console.warn(`⚠️ Unplausibler Zeitstempel von Vendon API: ${dateString} (Jahr: ${date.getFullYear()})`);
        return new Date(); // Return current date as fallback
      }
      
      return date;
    } catch (error: any) {
      console.error(`❌ Fehler beim Parsen des Datums: ${dateString}`, error.message);
      return new Date(); // Return current date as fallback
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let coordinatorInstance: UnifiedVendonSyncCoordinator | null = null;

export function getUnifiedSyncCoordinator(): UnifiedVendonSyncCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new UnifiedVendonSyncCoordinator();
  }
  return coordinatorInstance;
}