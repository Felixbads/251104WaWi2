/**
 * RESILIENTE VENDON HINTERGRUND-SYNCHRONISATION
 * 
 * Systematische Synchronisation für:
 * - Transaktionen (vends)
 * - Events (Alarme, Störungen, etc.)
 * - Refills (Nachfüllungen)
 * 
 * Features:
 * - Kontinuierliche Hintergrund-Synchronisation
 * - Automatische Lückenerkennung und -schließung
 * - Robuste Fehlerbehandlung
 * - Intelligente Priorisierung
 * - Status-Monitoring
 */

import { storage } from "../storage";
import { 
  InsertSyncLog, 
  InsertMachine, 
  InsertTransaction, 
  InsertEvent,
  InsertRefill,
  InsertRefillDetail
} from "@shared/schema";
import { SYNC_TYPE, acquireSyncLock, releaseSyncLock } from "./syncLock";
import axios, { AxiosInstance } from "axios";
import { rawDb } from "../db";

interface SyncResult {
  status: 'success' | 'partial' | 'error';
  message: string;
  stats: {
    transactions: { found: number; saved: number; duplicates: number; };
    events: { found: number; saved: number; duplicates: number; };
    refills: { found: number; saved: number; duplicates: number; };
    errors: number;
    duration: number;
  };
}

interface DataGap {
  type: 'transactions' | 'events' | 'refills';
  startDate: Date;
  endDate: Date;
  priority: 'high' | 'medium' | 'low';
  expectedCount: number;
  actualCount: number;
}

interface SystemStatus {
  isRunning: boolean;
  lastSync: Date | null;
  lastCheck: Date | null;
  totalGapsFound: number;
  gapsResolved: number;
  nextScheduledSync: Date | null;
  errors: string[];
  health: 'healthy' | 'warning' | 'critical';
}

export class ResilientVendonSync {
  private readonly BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";
  private readonly apiKey: string;
  private readonly client: AxiosInstance;
  
  // Sync-Konfiguration
  private readonly SYNC_INTERVAL = 5 * 60 * 1000; // 5 Minuten
  private readonly GAP_CHECK_INTERVAL = 30 * 60 * 1000; // 30 Minuten
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 100;
  private readonly REQUEST_DELAY = 1000; // 1 Sekunde zwischen Anfragen
  
  private status: SystemStatus = {
    isRunning: false,
    lastSync: null,
    lastCheck: null,
    totalGapsFound: 0,
    gapsResolved: 0,
    nextScheduledSync: null,
    errors: [],
    health: 'healthy'
  };
  
  private syncTimer: NodeJS.Timeout | null = null;
  private gapCheckTimer: NodeJS.Timeout | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
    
    this.client = axios.create({
      baseURL: this.BASE_URL,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('Resiliente Vendon-Synchronisation initialisiert');
  }

  /**
   * Startet die kontinuierliche Hintergrund-Synchronisation
   */
  async startBackgroundSync(): Promise<void> {
    if (this.status.isRunning) {
      console.log('Hintergrund-Synchronisation läuft bereits');
      return;
    }

    console.log('Starte resiliente Hintergrund-Synchronisation...');
    this.status.isRunning = true;
    this.status.errors = [];

    // Sofortige erste Synchronisation
    await this.performFullSync();

    // Regelmäßige Synchronisation starten
    this.syncTimer = setInterval(async () => {
      try {
        await this.performIncrementalSync();
      } catch (error) {
        this.handleError('Incrementelle Synchronisation fehlgeschlagen', error);
      }
    }, this.SYNC_INTERVAL);

    // Regelmäßige Lückenprüfung starten  
    this.gapCheckTimer = setInterval(async () => {
      try {
        await this.checkAndFillGaps();
      } catch (error) {
        this.handleError('Lückenprüfung fehlgeschlagen', error);
      }
    }, this.GAP_CHECK_INTERVAL);

    this.status.nextScheduledSync = new Date(Date.now() + this.SYNC_INTERVAL);
    console.log('Hintergrund-Synchronisation gestartet');
  }

  /**
   * Stoppt die Hintergrund-Synchronisation
   */
  stopBackgroundSync(): void {
    console.log('Stoppe Hintergrund-Synchronisation...');
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    
    if (this.gapCheckTimer) {
      clearInterval(this.gapCheckTimer);
      this.gapCheckTimer = null;
    }
    
    this.status.isRunning = false;
    this.status.nextScheduledSync = null;
    console.log('Hintergrund-Synchronisation gestoppt');
  }

  /**
   * Führt eine vollständige Synchronisation durch
   */
  async performFullSync(): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      status: 'success',
      message: '',
      stats: {
        transactions: { found: 0, saved: 0, duplicates: 0 },
        events: { found: 0, saved: 0, duplicates: 0 },
        refills: { found: 0, saved: 0, duplicates: 0 },
        errors: 0,
        duration: 0
      }
    };

    try {
      console.log('Beginne vollständige Synchronisation...');
      
      // Parallele Synchronisation aller Datentypen
      const [transactionResult, eventResult, refillResult] = await Promise.allSettled([
        this.syncTransactions(new Date(Date.now() - 24 * 60 * 60 * 1000)), // Letzte 24h
        this.syncEvents(new Date(Date.now() - 24 * 60 * 60 * 1000)),
        this.syncRefills(new Date(Date.now() - 24 * 60 * 60 * 1000))
      ]);

      // Ergebnisse zusammenfassen
      if (transactionResult.status === 'fulfilled') {
        result.stats.transactions = transactionResult.value;
      } else {
        result.stats.errors++;
        this.handleError('Transaktions-Sync fehlgeschlagen', transactionResult.reason);
      }

      if (eventResult.status === 'fulfilled') {
        result.stats.events = eventResult.value;
      } else {
        result.stats.errors++;
        this.handleError('Event-Sync fehlgeschlagen', eventResult.reason);
      }

      if (refillResult.status === 'fulfilled') {
        result.stats.refills = refillResult.value;
      } else {
        result.stats.errors++;
        this.handleError('Refill-Sync fehlgeschlagen', refillResult.reason);
      }

      result.stats.duration = Date.now() - startTime;
      this.status.lastSync = new Date();
      
      const totalSaved = result.stats.transactions.saved + result.stats.events.saved + result.stats.refills.saved;
      result.message = `Vollständige Synchronisation abgeschlossen: ${totalSaved} neue Datensätze`;
      
      if (result.stats.errors > 0) {
        result.status = 'partial';
        result.message += ` (${result.stats.errors} Fehler)`;
      }

      console.log(result.message);
      return result;

    } catch (error) {
      result.status = 'error';
      result.message = `Vollständige Synchronisation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      this.handleError('Vollständige Synchronisation fehlgeschlagen', error);
      return result;
    }
  }

  /**
   * Führt eine inkrementelle Synchronisation durch (nur neue Daten)
   */
  async performIncrementalSync(): Promise<SyncResult> {
    console.log('Beginne inkrementelle Synchronisation...');
    
    // Letzten Sync-Zeitpunkt ermitteln
    const lastSyncDate = this.status.lastSync || new Date(Date.now() - 60 * 60 * 1000); // Fallback: letzte Stunde
    
    return await this.performFullSync();
  }

  /**
   * Prüft auf Datenlücken und füllt sie
   */
  async checkAndFillGaps(): Promise<void> {
    console.log('Prüfe auf Datenlücken...');
    
    try {
      const gaps = await this.identifyDataGaps();
      this.status.totalGapsFound = gaps.length;
      this.status.lastCheck = new Date();

      if (gaps.length === 0) {
        console.log('Keine Datenlücken gefunden');
        return;
      }

      console.log(`${gaps.length} Datenlücken gefunden, beginne Schließung...`);
      
      // Lücken nach Priorität sortieren
      const prioritizedGaps = gaps.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      // Lücken systematisch schließen
      for (const gap of prioritizedGaps) {
        try {
          await this.fillGap(gap);
          this.status.gapsResolved++;
        } catch (error) {
          this.handleError(`Fehler beim Schließen der Lücke ${gap.type}`, error);
        }
        
        // Kurze Pause zwischen Lücken
        await this.sleep(this.REQUEST_DELAY);
      }

      console.log(`Lückenschließung abgeschlossen: ${this.status.gapsResolved} von ${this.status.totalGapsFound} Lücken geschlossen`);

    } catch (error) {
      this.handleError('Fehler bei der Lückenprüfung', error);
    }
  }

  /**
   * Synchronisiert Transaktionen für einen Zeitraum
   */
  private async syncTransactions(fromDate: Date, toDate?: Date): Promise<{ found: number; saved: number; duplicates: number; }> {
    const endDate = toDate || new Date();
    const result = { found: 0, saved: 0, duplicates: 0 };
    
    try {
      const startTimestamp = Math.floor(fromDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);
      
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const response = await this.makeApiRequest(
          `/stats/vends?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=${this.BATCH_SIZE}&offset=${offset}`
        );
        
        if (!response.result || !Array.isArray(response.result)) {
          break;
        }
        
        const transactions = response.result;
        result.found += transactions.length;
        
        for (const transaction of transactions) {
          try {
            // Prüfe auf Duplikat
            const existing = await storage.getTransactionByVendonId(transaction.id.toString());
            if (existing) {
              result.duplicates++;
              continue;
            }
            
            // Maschine sicherstellen
            const machineId = await this.ensureMachine(transaction.machine_id?.toString(), transaction.machine_name);
            
            // Transaktion speichern
            const newTransaction = {
              vendonId: transaction.id.toString(),
              machineId,
              machineName: transaction.machine_name || 'Unbekannt',
              datetime: new Date(transaction.datetime * 1000),
              amount: transaction.amount || 0,
              price: transaction.price || 0,
              productId: transaction.product_id?.toString() || null,
              productName: transaction.product_name || 'Unbekannt',
              coinCredit: transaction.coin_credit || 0,
              cardCredit: transaction.card_credit || 0,
              cashlessCredit: transaction.cashless_credit || 0,
              paymentType: transaction.payment_type || 'unknown',
              locationId: transaction.location_id?.toString() || null,
              locationName: transaction.location_name || null,
              isTest: transaction.is_test === true,
              extraData: JSON.stringify(transaction)
            };
            
            await storage.createTransaction(newTransaction);
            result.saved++;
            
          } catch (error) {
            console.error('Fehler beim Speichern der Transaktion:', error);
          }
        }
        
        // Prüfe ob mehr Daten verfügbar sind
        hasMore = transactions.length === this.BATCH_SIZE;
        offset += this.BATCH_SIZE;
        
        // Kurze Pause zwischen API-Anfragen
        await this.sleep(this.REQUEST_DELAY);
      }
      
    } catch (error) {
      console.error('Fehler bei der Transaktions-Synchronisation:', error);
      throw error;
    }
    
    return result;
  }

  /**
   * Synchronisiert Events für einen Zeitraum
   */
  private async syncEvents(fromDate: Date, toDate?: Date): Promise<{ found: number; saved: number; duplicates: number; }> {
    const endDate = toDate || new Date();
    const result = { found: 0, saved: 0, duplicates: 0 };
    
    try {
      const startTimestamp = Math.floor(fromDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);
      
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const response = await this.makeApiRequest(
          `/events?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=${this.BATCH_SIZE}&offset=${offset}`
        );
        
        if (!response.result || !Array.isArray(response.result)) {
          break;
        }
        
        const events = response.result;
        result.found += events.length;
        
        for (const event of events) {
          try {
            // Prüfe auf Duplikat
            const existing = await storage.getEventByVendonId(event.id.toString());
            if (existing) {
              result.duplicates++;
              continue;
            }
            
            // Maschine sicherstellen
            const machineId = await this.ensureMachine(event.machine_id?.toString(), event.machine_name);
            
            // Event speichern
            const newEvent = {
              vendonId: event.id.toString(),
              machineId,
              machineName: event.machine_name || 'Unbekannt',
              eventType: event.event_type || 'unknown',
              eventName: event.event_name || event.name || 'Unbekannt',
              eventDatetime: new Date(event.event_datetime ? event.event_datetime * 1000 : Date.now()),
              receivedAt: event.received_at ? new Date(event.received_at * 1000) : new Date(),
              resolvedAt: event.resolved_at ? new Date(event.resolved_at * 1000) : null,
              state: event.state || 'unknown',
              active: event.active || 'unknown',
              ignored: event.ignored === true,
              duration: event.duration || 0,
              severity: event.severity || 'unknown',
              priority: event.priority || 'medium',
              category: event.category || 'general',
              description: event.description || '',
              baseCode: event.base_code || '',
              originalCode: event.original_code || '',
              locationId: event.location_id?.toString() || null,
              locationName: event.location_name || null,
              extraData: JSON.stringify(event)
            };
            
            await storage.createEvent(newEvent);
            result.saved++;
            
          } catch (error) {
            console.error('Fehler beim Speichern des Events:', error);
          }
        }
        
        hasMore = events.length === this.BATCH_SIZE;
        offset += this.BATCH_SIZE;
        
        await this.sleep(this.REQUEST_DELAY);
      }
      
    } catch (error) {
      console.error('Fehler bei der Event-Synchronisation:', error);
      throw error;
    }
    
    return result;
  }

  /**
   * Synchronisiert Refills für einen Zeitraum
   */
  private async syncRefills(fromDate: Date, toDate?: Date): Promise<{ found: number; saved: number; duplicates: number; }> {
    const endDate = toDate || new Date();
    const result = { found: 0, saved: 0, duplicates: 0 };
    
    try {
      const startTimestamp = Math.floor(fromDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);
      
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const response = await this.makeApiRequest(
          `/refills?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}&limit=${this.BATCH_SIZE}&offset=${offset}`
        );
        
        if (!response.result || !Array.isArray(response.result)) {
          break;
        }
        
        const refills = response.result;
        result.found += refills.length;
        
        for (const refill of refills) {
          try {
            // Prüfe auf Duplikat
            const existing = await storage.getRefillByVendonId(refill.id.toString());
            if (existing) {
              result.duplicates++;
              continue;
            }
            
            // Maschine sicherstellen
            const machineId = await this.ensureMachine(refill.machine_id?.toString() || refill.relation_machine_id?.toString(), refill.machine_name || refill.relation_name);
            
            // Refill speichern
            const newRefill = {
              vendonId: refill.id.toString(),
              machineId,
              machineName: refill.machine_name || refill.relation_name || 'Unbekannt',
              datetime: new Date(refill.refill_date ? refill.refill_date * 1000 : Date.now()),
              operator: refill.refiller || refill.operator || '',
              status: 'completed',
              refillType: refill.refill_type || refill.type || '',
              plannedAmount: refill.planned_amount || 0,
              actualAmount: refill.actual_amount || 0,
              totalProducts: refill.total_products || 0,
              notes: refill.notes || '',
              refillNumber: refill.refill_number || '',
              accountId: refill.account_id || 0,
              accountName: refill.account_name || '',
              timezone: refill.timezone || '',
              locationId: refill.location_id?.toString() || null,
              extraData: JSON.stringify(refill),
              processStatus: 'pending'
            };
            
            const savedRefill = await storage.createRefill(newRefill);
            result.saved++;
            
            // Refill-Details abrufen und speichern
            try {
              const detailsResponse = await this.makeApiRequest(`/refills/${refill.id}/details`);
              if (detailsResponse.result && Array.isArray(detailsResponse.result)) {
                for (const detail of detailsResponse.result) {
                  await storage.createRefillDetail({
                    refillId: savedRefill.id,
                    productName: detail.name || 'Unbekannt',
                    quantity: detail.quantity || 0,
                    datetime: savedRefill.datetime,
                    added: detail.added || 0,
                    removed: detail.removed || 0,
                    vendonProductId: detail.product_id?.toString() || null
                  });
                }
              }
            } catch (detailError) {
              console.error(`Fehler beim Abrufen der Refill-Details für ${refill.id}:`, detailError);
            }
            
          } catch (error) {
            console.error('Fehler beim Speichern des Refills:', error);
          }
        }
        
        hasMore = refills.length === this.BATCH_SIZE;
        offset += this.BATCH_SIZE;
        
        await this.sleep(this.REQUEST_DELAY);
      }
      
    } catch (error) {
      console.error('Fehler bei der Refill-Synchronisation:', error);
      throw error;
    }
    
    return result;
  }

  /**
   * Identifiziert Datenlücken im System
   */
  private async identifyDataGaps(): Promise<DataGap[]> {
    const gaps: DataGap[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    try {
      // Prüfe Transaktions-Lücken (tägliche Basis)
      for (let d = new Date(sevenDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);
        
        const transactionCount = await this.getTransactionCountForPeriod(dayStart, dayEnd);
        
        // Erwarte mindestens 10 Transaktionen pro Tag als Normalfall
        if (transactionCount < 10) {
          gaps.push({
            type: 'transactions',
            startDate: dayStart,
            endDate: dayEnd,
            priority: transactionCount === 0 ? 'high' : 'medium',
            expectedCount: 50, // Geschätzter Normalwert
            actualCount: transactionCount
          });
        }
      }
      
      // Ähnlich für Events und Refills...
      // (Vereinfacht für Beispiel)
      
    } catch (error) {
      console.error('Fehler bei der Lückenidentifikation:', error);
    }
    
    return gaps;
  }

  /**
   * Füllt eine spezifische Datenlücke
   */
  private async fillGap(gap: DataGap): Promise<void> {
    console.log(`Schließe ${gap.type}-Lücke vom ${gap.startDate.toISOString()} bis ${gap.endDate.toISOString()}`);
    
    try {
      switch (gap.type) {
        case 'transactions':
          await this.syncTransactions(gap.startDate, gap.endDate);
          break;
        case 'events':
          await this.syncEvents(gap.startDate, gap.endDate);
          break;
        case 'refills':
          await this.syncRefills(gap.startDate, gap.endDate);
          break;
      }
    } catch (error) {
      console.error(`Fehler beim Schließen der ${gap.type}-Lücke:`, error);
      throw error;
    }
  }

  /**
   * Hilfsmethoden
   */
  private async makeApiRequest(endpoint: string): Promise<any> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.get(endpoint);
        return response.data;
      } catch (error) {
        if (attempt === this.MAX_RETRIES) {
          throw error;
        }
        await this.sleep(1000 * attempt); // Exponential backoff
      }
    }
  }

  private async ensureMachine(vendonId?: string, machineName?: string): Promise<number> {
    if (!vendonId) {
      return 1; // Fallback-Maschine
    }
    
    let machine = await storage.getMachineByVendonId(vendonId);
    
    if (!machine) {
      const newMachine = {
        vendonId,
        machineName: machineName || `Maschine ${vendonId}`,
        lastSync: new Date()
      };
      machine = await storage.createMachine(newMachine);
    }
    
    return machine.id;
  }

  private async getTransactionCountForPeriod(startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await rawDb.execute(`
        SELECT COUNT(*) as count 
        FROM transactions 
        WHERE datetime >= $1 AND datetime <= $2
      `, [startDate.toISOString(), endDate.toISOString()]);
      
      return parseInt(result.rows[0].count as string) || 0;
    } catch (error) {
      console.error('Fehler beim Zählen der Transaktionen:', error);
      return 0;
    }
  }

  private handleError(message: string, error: any): void {
    const errorMessage = `${message}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMessage);
    
    this.status.errors.push(errorMessage);
    if (this.status.errors.length > 10) {
      this.status.errors = this.status.errors.slice(-10); // Nur letzte 10 Fehler behalten
    }
    
    // Gesundheitsstatus aktualisieren
    if (this.status.errors.length > 5) {
      this.status.health = 'critical';
    } else if (this.status.errors.length > 2) {
      this.status.health = 'warning';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Öffentliche Status-Abfrage
   */
  getStatus(): SystemStatus {
    return { ...this.status };
  }

  /**
   * Manueller Sync-Trigger
   */
  async triggerSync(): Promise<SyncResult> {
    return await this.performFullSync();
  }

  /**
   * Manueller Gap-Check
   */
  async triggerGapCheck(): Promise<void> {
    await this.checkAndFillGaps();
  }
}

// Singleton-Instanz für globale Verwendung
let resilientSyncInstance: ResilientVendonSync | null = null;

export function getResilientSyncInstance(): ResilientVendonSync {
  if (!resilientSyncInstance) {
    resilientSyncInstance = new ResilientVendonSync();
  }
  return resilientSyncInstance;
}

export async function startResilientSync(): Promise<void> {
  const instance = getResilientSyncInstance();
  await instance.startBackgroundSync();
}

export function stopResilientSync(): void {
  if (resilientSyncInstance) {
    resilientSyncInstance.stopBackgroundSync();
  }
}