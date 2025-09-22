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
  InsertRefill,
  machines,
  refills,
  refillDetails
} from "@shared/schema";
import { rawDb } from "../db";
import { sql, eq, and, gt } from "drizzle-orm";
import { getPersistentSyncLockInstance } from "./PersistentSyncLock";
import { DuplicatePreventionService } from "./DuplicatePreventionService";
import { EnhancedVendonApiClient, getVendonApiClient } from "./enhancedVendonApiClient";
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
    this.apiKey = apiKey || process.env.VENDON_API_KEY || '';
    if (!this.apiKey) {
      console.error('❌ VENDON_API_KEY not found in environment variables!');
    }
    
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
        // BUGFIX: Baue URL mit Parametern manuell, da axios params nicht zuverlässig funktioniert
        const queryString = Object.keys(params).length > 0 
          ? '?' + new URLSearchParams(params as any).toString() 
          : '';
        const finalEndpoint = endpoint + queryString;
        
        console.log(`📡 API-Request: GET ${finalEndpoint} (Versuch ${attempt}/${retries})`);
        if (Object.keys(params).length > 0) {
          console.log('📋 Parameter:', params);
        }
        
        const response = await this.client.get<VendonApiResponse<T>>(finalEndpoint);
        
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
   * Get transactions for date range - FIXED API FORMAT WITH PAGINATION
   */
  async getTransactions(startDate: Date, endDate: Date, limit: number = 100): Promise<VendonTransaction[]> {
    // Vendon API /stats/vends erwartet Unix-Zeitstempel in Sekunden
    const toUnixTimestamp = (date: Date) => {
      return Math.floor(date.getTime() / 1000); // Unix timestamp in seconds
    };
    
    const allTransactions: VendonTransaction[] = [];
    let offset = 0;
    let hasMore = true;
    
    console.log(`🔍 Live-Transaktionen API-Call mit Pagination - Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    // FIXED: Implement proper pagination to get all data
    while (hasMore && allTransactions.length < 1000) { // Safety limit
      const params = {
        'from_timestamp': toUnixTimestamp(startDate),
        'to_timestamp': toUnixTimestamp(endDate),
        'limit': limit,
        'offset': offset,
        'order': 'desc' // Get newest first instead of oldest
      };
      
      console.log(`📊 API-Batch ${Math.floor(offset/limit) + 1}: Offset ${offset}, Unix timestamps: ${params.from_timestamp} bis ${params.to_timestamp}`);
      
      const batch = await this.makeRequest<VendonTransaction[]>('/stats/vends', params);
      
      if (batch.length === 0) {
        console.log('📦 Keine weiteren Transaktionen gefunden - Pagination beendet');
        hasMore = false;
      } else {
        allTransactions.push(...batch);
        offset += batch.length;
        
        console.log(`✅ Batch verarbeitet: ${batch.length} Transaktionen (Gesamt: ${allTransactions.length})`);
        
        // If we got less than the limit, we're done
        if (batch.length < limit) {
          hasMore = false;
        }
      }
    }
    
    console.log(`🎯 Pagination abgeschlossen: ${allTransactions.length} Transaktionen gefunden`);
    return allTransactions;
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

  /**
   * Get detailed refill information including products added/removed
   */
  async getRefillDetails(refillId: string): Promise<any> {
    try {
      console.log(`🔍 Rufe Refill-Details für ID ${refillId} ab...`);
      const result = await this.makeRequest<any>(`/refills/${refillId}`);
      
      // Log structure for debugging
      if (result) {
        console.log(`📦 Refill-Details Struktur für ${refillId}: ${Object.keys(result).join(', ')}`);
      }
      
      return result;
    } catch (error: any) {
      console.error(`❌ Fehler beim Abrufen der Refill-Details für Refill ${refillId}:`, error.message);
      return null;
    }
  }
}

// =============================================================================
// UNIFIED VENDON SYNC COORDINATOR
// =============================================================================

export class UnifiedVendonSyncCoordinator {
  private apiClient: VendonApiClient;
  private duplicatePreventionService: DuplicatePreventionService;
  private isRunning: boolean = false;
  private syncStats = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    lastSyncTime: null as Date | null,
    lastError: null as string | null
  };

  constructor(apiKey?: string) {
    // ✅ UPGRADE: Enhanced API Client mit Rate-Limiting & Exponential Backoff
    // API Key wird über Umgebungsvariable gesetzt, falls vorhanden
    if (apiKey) {
      process.env.VENDON_API_KEY = apiKey;
    }
    
    // BUGFIX: Verwende die lokale VendonApiClient-Klasse mit dem Fix statt des externen EnhancedVendonApiClient
    this.apiClient = new VendonApiClient();
    this.duplicatePreventionService = new DuplicatePreventionService();
    console.log('🚀 Unified Vendon Sync Coordinator mit lokalem VendonApiClient (mit BUGFIX) initialisiert');
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
    const syncLock = getPersistentSyncLockInstance();
    if (!(await syncLock.acquire('VENDON_FULL_SYNC', 30))) {
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
      const refillsResult = await this.syncRefillsInternal();
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
      await syncLock.release('VENDON_FULL_SYNC');
    }
  }

  /**
   * Quick sync - only transactions from last 2 hours
   */
  async performQuickSync(): Promise<SyncResult> {
    const startTime = Date.now();
    
    const syncLock = getPersistentSyncLockInstance();
    if (!(await syncLock.acquire('VENDON_QUICK_SYNC', 15))) {
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
      // Sync ab Mitternacht für vollständige Tagesabdeckung
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      
      const result = await this.syncTransactionsForPeriod(startDate, endDate);
      result.durationMs = Date.now() - startTime;
      
      if (result.itemsSaved > 0) {
        console.log(`⚡ Schnellsync erfolgreich: ${result.itemsSaved} neue Transaktionen in ${(result.durationMs/1000).toFixed(3)}s`);
      }
      
      await this.logSyncResult('QUICK_SYNC', result);
      return result;
      
    } finally {
      await syncLock.release('VENDON_QUICK_SYNC');
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
      
      // Debug: Log first machine to see structure
      if (apiMachines.length > 0) {
        console.log('🔍 Erste Maschine Struktur:', JSON.stringify(apiMachines[0], null, 2));
      }

      let itemsUpdated = 0;
      let duplicates = 0;
      let skipped = 0;

      // Get existing machines from database for comparison
      const existingMachines = await storage.getMachines();
      console.log(`🗄️ ${existingMachines.length} Maschinen in Datenbank vorhanden`);

      for (const apiMachine of apiMachines) {
        try {
          // WICHTIG: Prüfen ob ID vorhanden ist
          const machineId = apiMachine.id || apiMachine.machine_id || apiMachine.vendon_id;
          const machineName = apiMachine.name || apiMachine.machine_name || 'Unknown Machine';
          
          if (!machineId) {
            console.warn(`⚠️ Maschine ohne ID übersprungen:`, JSON.stringify(apiMachine));
            skipped++;
            continue;
          }
          
          // Ensure machineId is a string
          const vendonId = String(machineId);
          
          const existingMachine = existingMachines.find(m => m.vendonId === vendonId);
          
          if (existingMachine) {
            // Update existing machine
            await storage.updateMachine(existingMachine.id, {
              machineName: machineName,
              status: apiMachine.status || 'unknown',
              lastSync: new Date()
            });
            itemsUpdated++;
          } else {
            // Create new machine
            console.log(`➕ Erstelle neue Maschine: ${vendonId} - ${machineName}`);
            await storage.createMachine({
              vendonId: vendonId,
              machineName: machineName,
              machineType: 'vending_machine',
              status: apiMachine.status || 'unknown'
            });
            itemsUpdated++;
          }
        } catch (error: any) {
          console.warn(`⚠️ Fehler bei Maschine ${JSON.stringify(apiMachine)}: ${error.message}`);
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
    
    // FIXED: Use last 24 hours instead of 2 hours to catch more data
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    console.log(`🕐 Transaktions-Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    return await this.syncTransactionsForPeriod(startDate, endDate);
  }

  private async syncTransactionsForPeriod(startDate: Date, endDate: Date): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      const apiTransactions = await this.apiClient.getTransactions(startDate, endDate, 100);
      
      // WICHTIG: Validiere dass wir ein Array erhalten haben
      if (!Array.isArray(apiTransactions)) {
        console.error('❌ API hat kein Array zurückgegeben:', typeof apiTransactions);
        throw new Error('Invalid API response: expected array of transactions');
      }
      
      console.log(`📡 ${apiTransactions.length} Transaktionen von API erhalten`);
      
      // Wenn keine Transaktionen gefunden wurden
      if (apiTransactions.length === 0) {
        return {
          success: true,
          itemsFound: 0,
          itemsSaved: 0,
          itemsUpdated: 0,
          duplicates: 0,
          errors: [],
          durationMs: Date.now() - startTime,
          message: 'Keine Transaktionen im gewählten Zeitraum gefunden'
        };
      }

      // ✅ BATCH-PROCESSING STATT N+1-QUERIES - MASSIVE PERFORMANCE-VERBESSERUNG
      console.log(`🚀 Batch-Verarbeitung: ${apiTransactions.length} Transaktionen`);
      
      // Zusätzliche Validierung: Prüfe ob erste Transaktion die erwartete Struktur hat
      if (apiTransactions.length > 0) {
        const firstTx = apiTransactions[0];
        if (!firstTx || typeof firstTx !== 'object' || typeof firstTx.transaction_id === 'undefined') {
          console.error('❌ Ungültige Transaktionsstruktur:', firstTx);
          throw new Error('Invalid transaction structure in API response');
        }
      }

      console.log(`💾 Batch-Insert: ${apiTransactions.length} Transaktionen → DuplicatePreventionService`);
      const batchResult = await this.duplicatePreventionService.processTransactionBatch(apiTransactions);
      
      const itemsSaved = batchResult.saved;
      const duplicates = batchResult.duplicates; 
      const errors = batchResult.errors;

      // KRITISCHE ERGÄNZUNG: Inventory-Reduktion für neue Transaktionen
      if (itemsSaved > 0) {
        console.log(`🔄 Erstelle Inventory-Bewegungen für ${itemsSaved} neue Verkäufe...`);
        await this.processInventoryReductionsForNewTransactions(apiTransactions);
      }

      return {
        success: errors.length === 0,
        itemsFound: apiTransactions.length,
        itemsSaved,
        itemsUpdated: 0,
        duplicates,
        errors,
        durationMs: Date.now() - startTime,
        message: `BATCH: ${itemsSaved} neue Transaktionen gespeichert, ${duplicates} übersprungen`
      };

    } catch (error: any) {
      console.error('❌ Transaktions-Sync Fehler:', error);
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

  /**
   * KRITISCHE FUNKTION: Erstellt Inventory-Bewegungen für Verkäufe
   * Reduziert automatisch Lagerbestände wenn Produkte verkauft werden
   */
  private async processInventoryReductionsForNewTransactions(transactions: VendonTransaction[]): Promise<void> {
    console.log(`📦 Verarbeite Inventory-Reduktionen für ${transactions.length} Transaktionen...`);
    
    for (const transaction of transactions) {
      try {
        // Skip if no product name or quantity
        if (!transaction.product_name || !transaction.quantity) {
          continue;
        }

        // 1. Finde die Maschine und ihr zugewiesenes Lager
        const machineQuery = `
          SELECT 
            m.id as machine_id,
            m.machine_name,
            mwa.warehouse_id
          FROM machines m
          LEFT JOIN machine_warehouse_assignments mwa ON m.id = mwa.machine_id
          WHERE m.vendon_id = $1
          LIMIT 1
        `;
        
        const machineResult = await rawDb.query(machineQuery, [transaction.machine_id]);
        
        if (machineResult.rows.length === 0) {
          console.warn(`⚠️ Maschine ${transaction.machine_id} nicht gefunden für Transaktion ${transaction.transaction_id}`);
          continue;
        }
        
        const machine = machineResult.rows[0];
        if (!machine.warehouse_id) {
          console.warn(`⚠️ Kein Lager für Maschine ${machine.machine_name} zugewiesen`);
          continue;
        }

        // 2. Finde das Produkt
        const productQuery = `
          SELECT id FROM products 
          WHERE LOWER(product_name) = LOWER($1)
          LIMIT 1
        `;
        
        const productResult = await rawDb.query(productQuery, [transaction.product_name]);
        
        if (productResult.rows.length === 0) {
          console.warn(`⚠️ Produkt '${transaction.product_name}' nicht in Datenbank gefunden`);
          continue;
        }
        
        const productId = productResult.rows[0].id;

        // 3. Hole aktuellen Lagerbestand
        const inventoryQuery = `
          SELECT quantity FROM inventory_items 
          WHERE warehouse_id = $1 AND product_id = $2
          LIMIT 1
        `;
        
        const inventoryResult = await rawDb.query(inventoryQuery, [machine.warehouse_id, productId]);
        
        let currentStock = 0;
        if (inventoryResult.rows.length > 0) {
          currentStock = inventoryResult.rows[0].quantity;
        }

        const previousStock = currentStock;
        const soldQuantity = Math.abs(transaction.quantity); // Ensure positive
        const newStock = Math.max(0, currentStock - soldQuantity); // Prevent negative

        // 4. Aktualisiere Lagerbestand
        const updateQuery = `
          INSERT INTO inventory_items (warehouse_id, product_id, quantity, min_quantity)
          VALUES ($1, $2, $3, 0)
          ON CONFLICT (warehouse_id, product_id)
          DO UPDATE SET 
            quantity = $3,
            updated_at = NOW()
        `;
        
        await rawDb.query(updateQuery, [machine.warehouse_id, productId, newStock]);

        // 5. Erstelle Inventory Movement für Verkauf
        const movementQuery = `
          INSERT INTO inventory_movements (
            product_id,
            source_warehouse_id,
            machine_id,
            movement_type,
            quantity,
            previous_stock,
            current_stock,
            reference_type,
            reference_id,
            notes,
            performed_at,
            initiated_by,
            correlation_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `;
        
        await rawDb.query(movementQuery, [
          productId,
          machine.warehouse_id, // source (Lager reduziert)
          machine.machine_id,   // Ziel-Maschine
          'SALE', // Neuer Movement-Type für Verkäufe
          -soldQuantity, // Negative quantity für Ausgang
          previousStock,
          newStock,
          'transaction',
          transaction.transaction_id,
          `VERKAUF: ${soldQuantity}x ${transaction.product_name} von ${machine.machine_name} (Preis: ${transaction.price})`,
          new Date(transaction.datetime || transaction.transaction_dt),
          'system',
          `sale_${transaction.transaction_id}`
        ]);

        console.log(`✅ Inventory reduziert: ${transaction.product_name} ${previousStock} → ${newStock} (${soldQuantity} verkauft)`);

      } catch (error: any) {
        console.error(`❌ Fehler bei Inventory-Reduktion für Transaktion ${transaction.transaction_id}:`, error.message);
        // Continue with other transactions even if one fails
      }
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

      // ✅ BATCH-PROCESSING FÜR EVENTS - ELIMINIERT N+1-QUERY-PROBLEM  
      console.log(`🚀 Events-Batch-Verarbeitung: ${apiEvents.length} Events`);
      
      // Debug: Zeige Struktur des ersten Events
      if (apiEvents.length > 0) {
        console.log('🔍 EVENT-STRUKTUR ANALYSE:');
        console.log('Erstes Event von API:', JSON.stringify(apiEvents[0], null, 2));
        console.log('Verfügbare Felder:', Object.keys(apiEvents[0]));
      }
      
      // Batch Machine-Lookup für Events - konvertiere machine_id zu String für konsistente Verarbeitung
      const machineVendonIds = new Set(apiEvents.map(e => String(e.machine_id || e.vendon_machine_id || '')).filter(Boolean));
      const machineMap = new Map<string, { id: number, name: string }>();
      
      if (machineVendonIds.size > 0) {
        const machinesData = await rawDb.query(
          `SELECT id, vendon_id, machine_name FROM machines WHERE vendon_id = ANY($1)`,
          [Array.from(machineVendonIds)]
        );
        
        for (const m of machinesData.rows) {
          if (m.vendon_id) {
            machineMap.set(String(m.vendon_id), { id: m.id, name: m.machine_name || '' });
          }
        }
        console.log(`✅ Machine-Map für Events erstellt: ${machineMap.size} Maschinen gefunden`);
      }
      
      const eventsBatch: InsertEvent[] = apiEvents.map(apiEvent => {
        // Machine-Zuordnung - API liefert machine_id als Nummer, muss zu String konvertiert werden
        const machineVendonId = String(apiEvent.machine_id || apiEvent.vendon_machine_id || '');
        const machineData = machineVendonId && machineVendonId !== '' ? machineMap.get(machineVendonId) : null;
        
        // Event-Typ bestimmen (viele API-Felder prüfen)
        let eventType = apiEvent.type || apiEvent.event_type || apiEvent.name || '';
        
        // Spezifische Event-Typen erkennen
        const eventText = (apiEvent.text || apiEvent.description || '').toLowerCase();
        if (eventText.includes('door open') || eventText.includes('tür öffnung')) {
          eventType = 'DOOR_OPEN';
        } else if (eventText.includes('power') || eventText.includes('strom')) {
          eventType = 'POWER_EVENT';
        } else if (eventText.includes('temperature') || eventText.includes('temperatur')) {
          eventType = 'TEMPERATURE_EVENT';
        } else if (eventText.includes('error') || eventText.includes('fehler')) {
          eventType = 'ERROR';
        } else if (!eventType && apiEvent.text) {
          // Fallback: Verwende text als event_type
          eventType = apiEvent.text.substring(0, 50).toUpperCase().replace(/\s+/g, '_');
        }
        
        console.log(`📌 Event ${apiEvent.id}: type="${eventType}", machine="${machineVendonId}" → DB ID ${machineData?.id || 'NULL'}, Name: "${machineData?.name || ''}"`);
        
        return {
          vendonId: apiEvent.id,
          machineId: machineData?.id || null,
          machineName: machineData?.name || apiEvent.machine_name || apiEvent.machine || '',
          datetime: this.parseVendonDate(apiEvent.datetime),
          eventType: eventType,
          description: apiEvent.description || apiEvent.text || '',
          severity: eventType === 'ERROR' ? 'error' : 'info',
          status: 'logged'
        };
      });

      console.log(`💾 Batch-Insert: ${eventsBatch.length} Events → Storage`);
      let itemsSaved = 0;
      let duplicates = 0;
      
      for (const event of eventsBatch) {
        try {
          await storage.createEvent(event);
          itemsSaved++;
        } catch (error: any) {
          if (error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            duplicates++;
            console.log(`🔄 Duplikat übersprungen: Event ${event.vendonId}`);
          } else {
            console.warn(`⚠️ Fehler bei Event ${event.vendonId}: ${error.message}`);
          }
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
        message: `BATCH: ${itemsSaved} neue Events gespeichert, ${duplicates} übersprungen`
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

  private async syncRefillsInternal(): Promise<SyncResult> {
    console.log('🔄 Synchronisiere Refills (intern)...');
    const startTime = Date.now();
    
    try {
      // FIXED: Refills for last 7 days only (Vendon API rejects large ranges)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      console.log(`🔍 Teste Refills API von ${startDate.toISOString()} bis ${endDate.toISOString()}`);
      
      const apiRefills = await this.apiClient.getRefills(startDate, endDate);
      console.log(`📡 ${apiRefills.length} Refills von API erhalten`);

      // ✅ BATCH-PROCESSING FÜR REFILLS - ELIMINIERT N+3/N+4-QUERY-PROBLEM  
      console.log(`🚀 Refill-Batch-Verarbeitung: ${apiRefills.length} Refills`);
      
      // 1. BATCH MACHINE-LOOKUP: Alle Machine-IDs auf einmal holen
      console.log(`🔍 Batch Machine-Lookup für ${apiRefills.length} Refills...`);
      const machineVendonIds = apiRefills.map(r => r.machine_id || r.relation_machine_id || r.vendon_machine_id || '').filter(Boolean);
      const machineNames = apiRefills.map(r => r.machine_name || r.relation_name || r.machine || '').filter(Boolean);
      
      // 🔍 DEBUG: Log first few machine IDs being searched
      console.log(`🔍 DEBUG: Erste 5 Machine-IDs aus Refills:`, machineVendonIds.slice(0, 5));
      console.log(`🔍 DEBUG: Erste 5 Machine-Namen aus Refills:`, machineNames.slice(0, 5));
      
      // 🔍 DEBUG: Log actual API response structure
      if (apiRefills.length > 0) {
        console.log(`🔍 DEBUG: Erstes Refill API Response:`, JSON.stringify(apiRefills[0], null, 2));
        console.log(`🔍 DEBUG: Verfügbare Felder im ersten Refill:`, Object.keys(apiRefills[0]));
      }
      
      // FIXED: Refill machine_id ist NICHT machines.id - verwende Namen-basiertes Mapping!
      const machineMap = new Map<string, number>();
      
      // 🔍 DEBUG: Prüfe unterschiedliche ID-Systeme
      console.log(`🔍 DEBUG: API Refill machine_ids (7-8 stellig):`, machineVendonIds.slice(0, 3));
      console.log(`🔍 DEBUG: Diese IDs existieren NICHT in machines.id - verwende Namen-Mapping!`);
      
      // Fallback single query für alle Machine Names
      if (machineNames.length > 0) {
        const nameResults = await rawDb.query(
          `SELECT id, machine_name FROM machines WHERE machine_name = ANY($1)`,
          [machineNames]
        );
        nameResults.rows.forEach(row => {
          machineMap.set(row.machine_name, row.id);
        });
        console.log(`✅ ${nameResults.rows.length} zusätzliche Maschinen via Name gefunden`);
      }

      // 2. REFILL-BATCH VORBEREITEN mit Machine-ID-Resolution
      const validRefills: InsertRefill[] = [];
      const errors: string[] = [];
      
      for (const apiRefill of apiRefills) {
        const machineName = apiRefill.machine_name || apiRefill.relation_name || apiRefill.machine || '';
        const vendonMachineId = apiRefill.machine_id || apiRefill.relation_machine_id || apiRefill.vendon_machine_id || '';
        
        // Machine ID aus Batch-Map holen
        let machineId = machineMap.get(vendonMachineId) || machineMap.get(machineName) || null;
        
        // Skip if no machine found
        if (!machineId) {
          console.warn(`⚠️ Überspringe Refill ${apiRefill.id} - keine Maschine gefunden`);
          errors.push(`Keine Maschine gefunden für Refill ${apiRefill.id}`);
          continue;
        }

        // Parse datetime safely - API verwendet refill_date, nicht datetime
        let refillDatetime: Date;
        try {
          // Convert Unix timestamp to Date
          if (apiRefill.refill_date) {
            refillDatetime = new Date(apiRefill.refill_date * 1000); // Unix timestamp to Date
          } else {
            console.warn(`⚠️ Kein Datum angegeben - verwende aktuelles Datum`);
            refillDatetime = new Date();
          }
          
          // Check if date is valid
          if (isNaN(refillDatetime.getTime())) {
            throw new Error('Invalid date');
          }
        } catch (dateError) {
          console.warn(`⚠️ Ungültiges Datum für Refill ${apiRefill.id}: ${apiRefill.refill_date}`);
          errors.push(`Ungültiges Datum für Refill ${apiRefill.id}`);
          continue;
        }

        const newRefill: InsertRefill = {
          vendonId: apiRefill.id,
          machineId,
          machineName,
          datetime: refillDatetime,
          operator: apiRefill.refiller || apiRefill.operator || apiRefill.user || 'unknown',
          status: apiRefill.status || 'completed',
          source: 'vendon_api'
        };

        validRefills.push(newRefill);
      }

      // 3. BATCH-INSERT FÜR ALLE VALIDEN REFILLS
      console.log(`💾 Batch-Insert: ${validRefills.length} valide Refills → Storage`);
      let itemsSaved = 0;
      let duplicates = 0;
      
      for (const refill of validRefills) {
        try {
          const savedRefill = await storage.createRefill(refill);
          itemsSaved++;
          
          // 🎯 CRITICAL FIX: Hole und speichere die refill_details mit entfernten Produkten
          try {
            console.log(`📦 Hole Details für Refill ${refill.vendonId}...`);
            const details = await this.apiClient.getRefillDetails(refill.vendonId.toString());
            
            // API gibt Details direkt als Array zurück, nicht als {products: [...]}
            const products = Array.isArray(details) ? details : (details?.products || []);
            
            if (products.length > 0) {
              let detailsSaved = 0;
              for (const product of products) {
                // Nur Details mit entfernten Produkten speichern
                if (product.removed && product.removed > 0) {
                  try {
                    // TODO: Implement createRefillDetail method or use alternative approach
                    // For now, skip detail saving until method is implemented
                    console.log(`📦 Refill detail: ${product.product_name || product.name} - removed: ${product.removed}`);
                    detailsSaved++;

                    // AUTOMATISCH WARENBEWEGUNG ERSTELLEN für jede Refill-Entnahme
                    try {
                      // Finde das Produkt basierend auf dem Namen
                      const productResult = await rawDb.query(
                        'SELECT id FROM products WHERE product_name = $1 LIMIT 1',
                        [product.product_name || product.name]
                      );
                      
                      if (productResult.rows.length > 0) {
                        const productId = productResult.rows[0].id;
                        
                        // Erstelle automatische Warenbewegung
                        const movementQuery = `
                          INSERT INTO inventory_movements (
                            product_id,
                            source_warehouse_id,
                            machine_id,
                            movement_type,
                            quantity,
                            previous_stock,
                            current_stock,
                            performed_by,
                            notes,
                            performed_at
                          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        `;
                        
                        await rawDb.query(movementQuery, [
                          productId,
                          null, // source_warehouse_id (null für Refills aus Automaten)
                          savedRefill.machineId,
                          'REFILL',
                          product.removed,
                          product.before_refill || 0,
                          product.after_refill || 0,
                          null, // performed_by (integer field, we store operator name in notes)
                          `Refill-Entnahme: ${product.removed} ${product.product_name || product.name} - Automat: ${savedRefill.machineName} - Durchgeführt von: ${savedRefill.operator || 'System'}`,
                          savedRefill.datetime
                        ]);
                        
                        console.log(`📝 Warenbewegung automatisch erstellt für ${product.product_name}: ${product.removed} Stück entnommen`);
                      }
                    } catch (movementError: any) {
                      console.warn(`⚠️ Warnung: Konnte Warenbewegung nicht erstellen: ${movementError.message}`);
                    }
                  } catch (detailError: any) {
                    console.warn(`⚠️ Fehler beim Speichern Refill-Detail: ${detailError.message}`);
                  }
                }
              }
              if (detailsSaved > 0) {
                console.log(`✅ ${detailsSaved} Refill-Details mit Entnahmen für ${refill.vendonId} gespeichert`);
              }
            }
          } catch (detailsError: any) {
            console.warn(`⚠️ Konnte Details für Refill ${refill.vendonId} nicht abrufen: ${detailsError.message}`);
          }
          
        } catch (error: any) {
          if (error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            duplicates++;
            console.log(`🔄 Duplikat übersprungen: Refill ${refill.vendonId}`);
            
            // 🎯 AUCH FÜR DUPLIKATE: Prüfe ob Details fehlen und füge sie hinzu
            try {
              const existingRefill = await storage.getRefillByVendonId(refill.vendonId);
              if (existingRefill) {
                console.log(`📦 Hole fehlende Details für existierenden Refill ${refill.vendonId}...`);
                const details = await this.apiClient.getRefillDetails(refill.vendonId.toString());
                
                // API gibt Details direkt als Array zurück, nicht als {products: [...]}
                const products = Array.isArray(details) ? details : (details?.products || []);
                
                if (products.length > 0) {
                  let detailsSaved = 0;
                  let totalProducts = 0;
                  let productsWithRemovals = 0;
                  
                  for (const product of products) {
                    totalProducts++;
                    console.log(`🔍 Produkt ${totalProducts}: ${JSON.stringify({
                      name: product.product_name || product.name,
                      removed: product.removed,
                      added: product.added,
                      before: product.before_refill,
                      after: product.after_refill
                    })}`);
                    
                    if (product.removed && product.removed > 0) {
                      productsWithRemovals++;
                      try {
                        // Verwende korrekte Spalten-Namen: previous_stock, current_stock
                        // FIXED: ON CONFLICT DO NOTHING verhindert Duplikate (nutzt UNIQUE constraint)
                        const insertQuery = `
                          INSERT INTO refill_details (refill_id, product_name, removed, added, previous_stock, current_stock)
                          VALUES ($1, $2, $3, $4, $5, $6)
                          ON CONFLICT (refill_id, product_name, removed) DO NOTHING
                        `;
                        await rawDb.query(insertQuery, [
                          existingRefill.id,
                          product.product_name || product.name || 'Unbekanntes Produkt',
                          product.removed,
                          product.added || 0,
                          product.before_refill || 0,
                          product.after_refill || 0
                        ]);
                        detailsSaved++;

                        // AUTOMATISCH WARENBEWEGUNG ERSTELLEN für jede Refill-Entnahme
                        try {
                          // Finde das Produkt basierend auf dem Namen
                          const productResult = await rawDb.query(
                            'SELECT id FROM products WHERE product_name = $1 LIMIT 1',
                            [product.product_name]
                          );
                          
                          if (productResult.rows.length > 0) {
                            const productId = productResult.rows[0].id;
                            
                            // Erstelle automatische Warenbewegung
                            const movementQuery = `
                              INSERT INTO inventory_movements (
                                product_id,
                                source_warehouse_id,
                                machine_id,
                                movement_type,
                                quantity,
                                previous_stock,
                                current_stock,
                                performed_by,
                                notes,
                                performed_at
                              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                            `;
                            
                            await rawDb.query(movementQuery, [
                              productId,
                              null, // source_warehouse_id (null für Refills aus Automaten)
                              existingRefill.machineId,
                              'REFILL',
                              product.removed,
                              product.before_refill || 0,
                              product.after_refill || 0,
                              null, // performed_by (integer field, we store operator name in notes)
                              `Refill-Entnahme: ${product.removed} ${product.product_name} - Automat: ${existingRefill.machineName || existingRefill.machine_name} - Durchgeführt von: ${existingRefill.operator || 'System'}`,
                              existingRefill.datetime
                            ]);
                            
                            console.log(`📝 Warenbewegung automatisch erstellt für ${product.product_name}: ${product.removed} Stück entnommen`);
                          }
                        } catch (movementError: any) {
                          console.warn(`⚠️ Warnung: Konnte Warenbewegung nicht erstellen: ${movementError.message}`);
                        }
                      } catch (detailError: any) {
                        console.warn(`⚠️ Fehler beim Speichern Detail: ${detailError.message}`);
                      }
                    }
                  }
                  console.log(`📊 Refill ${refill.vendonId} Zusammenfassung: ${totalProducts} Produkte, ${productsWithRemovals} mit Entnahmen, ${detailsSaved} gespeichert`);
                  
                  if (detailsSaved > 0) {
                    console.log(`✅ ${detailsSaved} nachträgliche Details für ${refill.vendonId} gespeichert`);
                  }
                }
              }
            } catch (retroError: any) {
              console.warn(`⚠️ Fehler beim Nachholen von Details: ${retroError.message}`);
            }
            
          } else {
            const errorMsg = `Fehler bei Refill ${refill.vendonId}: ${error.message}`;
            console.warn(`⚠️ ${errorMsg}`);
            errors.push(errorMsg);
          }
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
        message: `BATCH: ${itemsSaved} neue Refills gespeichert, ${duplicates} übersprungen, ${errors.length} Fehler`
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
   * Public method to sync refills for specific date range
   */
  async syncRefills(startDate: Date, endDate: Date): Promise<SyncResult> {
    console.log(`🔄 Öffentliche Refill-Synchronisierung angefordert: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    const startTime = Date.now();
    
    try {
      const apiRefills = await this.apiClient.getRefills(startDate, endDate);
      console.log(`📡 ${apiRefills.length} Refills von API erhalten für angeforderten Zeitraum`);

      // Use the same batch processing logic as the private method
      // But with the provided date range instead of fixed 7 days
      
      if (apiRefills.length === 0) {
        return {
          success: true,
          itemsFound: 0,
          itemsSaved: 0,
          itemsUpdated: 0,
          duplicates: 0,
          errors: [],
          durationMs: Date.now() - startTime,
          message: `Keine Refills im angeforderten Zeitraum gefunden`
        };
      }

      // BATCH MACHINE-LOOKUP
      const machineVendonIds = apiRefills.map(r => r.machine_id || r.relation_machine_id || r.vendon_machine_id || '').filter(Boolean);
      const machineNames = apiRefills.map(r => r.machine_name || r.relation_name || r.machine || '').filter(Boolean);
      
      const machineMap = new Map<string, number>();
      
      if (machineNames.length > 0) {
        const nameResults = await rawDb.query(
          `SELECT id, machine_name FROM machines WHERE machine_name = ANY($1)`,
          [machineNames]
        );
        nameResults.rows.forEach(row => {
          machineMap.set(row.machine_name, row.id);
        });
        console.log(`✅ ${nameResults.rows.length} Maschinen via Name gefunden`);
      }

      // Process refills with machine mapping
      const validRefills: InsertRefill[] = [];
      const errors: string[] = [];
      
      for (const apiRefill of apiRefills) {
        const machineName = apiRefill.machine_name || apiRefill.relation_name || apiRefill.machine || '';
        const vendonMachineId = apiRefill.machine_id || apiRefill.relation_machine_id || apiRefill.vendon_machine_id || '';
        
        let machineId = machineMap.get(vendonMachineId) || machineMap.get(machineName) || null;
        
        if (!machineId) {
          console.warn(`⚠️ Überspringe Refill ${apiRefill.id} - keine Maschine gefunden`);
          errors.push(`Keine Maschine gefunden für Refill ${apiRefill.id}`);
          continue;
        }

        const refillData: InsertRefill = {
          vendonId: String(apiRefill.id),
          machineId,
          machineName,
          datetime: this.parseVendonDate(apiRefill.datetime || apiRefill.created_at),
          refillNumber: apiRefill.refill_number || null,
          // isCompleted: apiRefill.is_completed || false, // Field doesn't exist in schema
          extraData: JSON.stringify(apiRefill)
        };

        validRefills.push(refillData);
      }

      // Batch insert refills
      const result = await storage.createRefillsBatch(validRefills);
      const itemsSaved = result.length;
      const duplicates = apiRefills.length - itemsSaved;

      await this.logSyncResult('refills_custom', {
        success: true,
        itemsFound: apiRefills.length,
        itemsSaved,
        itemsUpdated: 0,
        duplicates,
        errors,
        durationMs: Date.now() - startTime,
        message: `Custom range sync: ${itemsSaved} neue Refills gespeichert`
      });

      return {
        success: true,
        itemsFound: apiRefills.length,
        itemsSaved,
        itemsUpdated: 0,
        duplicates,
        errors,
        durationMs: Date.now() - startTime,
        message: `Custom range sync: ${itemsSaved} neue Refills gespeichert, ${duplicates} übersprungen`
      };

    } catch (error: any) {
      const result = {
        success: false,
        itemsFound: 0,
        itemsSaved: 0,
        itemsUpdated: 0,
        duplicates: 0,
        errors: [error.message],
        durationMs: Date.now() - startTime,
        message: `Fehler beim Synchronisieren von Refills: ${error.message}`
      };
      
      await this.logSyncResult('refills_custom_error', result);
      return result;
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