/**
 * Vendon Events API Synchronisation Service
 * 
 * Dieser Service ruft Events von der Vendon API ab und speichert sie in der Datenbank.
 * Er implementiert eine robuste Synchronisierungsstrategie mit:
 * - Paginierung für große Datenmengen
 * - Fehlerbehandlung und Retry-Mechanismus
 * - Fortschrittsverfolgung
 * - Duplikaterkennung
 * - Vollständige Feldabbildung basierend auf der API-Dokumentation
 */

import { db } from "../db";
import { events, syncLogs, syncState } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import axios from "axios";

// Konfiguration für Vendon API
const VENDON_API_BASE = "https://cloud.vendon.net/rest/v1.8.0";
const DEFAULT_BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 Sekunde

// Interface für Vendon Event API Response
interface VendonEventResponse {
  code: number;
  result: VendonEvent[];
  paging: {
    offset: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}

// Interface für einzelnes Vendon Event
interface VendonEvent {
  id: string;
  event_type?: string;
  event_name?: string;
  base_code?: string;
  original_code?: string;
  description?: string;
  name?: string;
  machine_id?: string;
  machine_name?: string;
  event_datetime?: string;
  received_at?: string;
  resolved_at?: string;
  state?: string;
  active?: string;
  ignored?: boolean;
  duration?: number;
  severity?: string;
  priority?: string;
  category?: string;
  event_tags?: string[];
  machine_tags?: string[];
  location_id?: string;
  location_name?: string;
  location_type?: string;
  client_id?: string;
  client_name?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  telemetry_unit_id?: string;
  sensor_data?: any;
  [key: string]: any; // Für zusätzliche unbekannte Felder
}

// Optionen für die Event-Synchronisation
export interface VendonEventsSyncOptions {
  fromTimestamp?: number;
  toTimestamp?: number;
  timeframeFilterType?: 'received_at' | 'resolved_at';
  machineId?: number;
  warehouseId?: number;
  state?: string[];
  locationId?: number;
  locationType?: string;
  clientId?: number;
  minDuration?: number;
  maxDuration?: number;
  ignored?: 'exclude' | 'include' | 'only';
  machineTags?: string[];
  eventTags?: string[];
  batchSize?: number;
  maxEvents?: number;
  forceUpdate?: boolean;
}

export class VendonEventsSync {
  private apiKey: string;
  private syncId: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.syncId = `events_sync_${Date.now()}`;
  }

  /**
   * Hauptmethode für die Event-Synchronisation
   */
  async syncEvents(options: VendonEventsSyncOptions = {}): Promise<{
    success: boolean;
    totalProcessed: number;
    duplicates: number;
    errors: number;
    errorMessage?: string;
  }> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let duplicates = 0;
    let errors = 0;
    let syncLogId: number | null = null;

    try {
      // Sync-Log erstellen
      const [syncLog] = await db.insert(syncLogs).values({
        syncType: 'vendon_events',
        startDate: new Date(),
        syncStatus: 'running',
        additionalData: JSON.stringify(options),
        entityType: 'events'
      }).returning({ id: syncLogs.id });
      
      syncLogId = syncLog.id;

      console.log(`🚀 Starte Vendon Events Synchronisation (ID: ${this.syncId})`);
      console.log(`📋 Optionen:`, options);

      // Default-Werte setzen
      const {
        fromTimestamp = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000), // 7 Tage zurück
        toTimestamp = Math.floor(Date.now() / 1000), // Jetzt
        timeframeFilterType = 'received_at',
        batchSize = DEFAULT_BATCH_SIZE,
        maxEvents = 10000,
        forceUpdate = false
      } = options;

      let offset = 0;
      let hasMore = true;
      let processedInBatch = 0;

      while (hasMore && totalProcessed < maxEvents) {
        try {
          console.log(`📥 Lade Events: Offset ${offset}, Limit ${batchSize}`);

          // Events von API abrufen
          const response = await this.fetchEventsFromAPI({
            ...options,
            fromTimestamp,
            toTimestamp,
            timeframeFilterType,
            offset,
            limit: batchSize
          });

          if (!response.result || response.result.length === 0) {
            console.log('ℹ️ Keine weiteren Events gefunden');
            break;
          }

          console.log(`📦 ${response.result.length} Events erhalten`);

          // Events in Datenbank speichern
          const batchResult = await this.saveEventsBatch(response.result, forceUpdate);
          
          processedInBatch = batchResult.processed;
          duplicates += batchResult.duplicates;
          errors += batchResult.errors;
          totalProcessed += processedInBatch;

          console.log(`💾 Batch verarbeitet: ${processedInBatch} gespeichert, ${batchResult.duplicates} Duplikate, ${batchResult.errors} Fehler`);

          // Prüfen ob weitere Seiten vorhanden
          hasMore = response.paging.has_more;
          offset += batchSize;

          // Kleine Pause zwischen Requests um API nicht zu überlasten
          await this.sleep(100);

        } catch (error) {
          console.error(`❌ Fehler beim Verarbeiten von Batch bei Offset ${offset}:`, error);
          errors++;
          
          // Bei kritischen Fehlern abbrechen
          if (errors > MAX_RETRIES) {
            throw new Error(`Zu viele Fehler (${errors}). Synchronisation abgebrochen.`);
          }
          
          // Retry mit exponential backoff
          await this.sleep(RETRY_DELAY * Math.pow(2, errors));
          continue;
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      
      // Sync-Log aktualisieren
      if (syncLogId) {
        await db.update(syncLogs)
          .set({
            endDate: new Date(),
            itemsFound: totalProcessed + duplicates,
            itemsSaved: totalProcessed,
            duplicates,
            errors,
            durationSeconds: duration,
            syncStatus: 'completed'
          })
          .where(eq(syncLogs.id, syncLogId));
      }

      console.log(`✅ Event-Synchronisation abgeschlossen:`);
      console.log(`   📊 Gesamt verarbeitet: ${totalProcessed}`);
      console.log(`   🔄 Duplikate übersprungen: ${duplicates}`);
      console.log(`   ❌ Fehler: ${errors}`);
      console.log(`   ⏱️ Dauer: ${duration.toFixed(2)}s`);

      return {
        success: true,
        totalProcessed,
        duplicates,
        errors
      };

    } catch (error) {
      console.error('❌ Kritischer Fehler bei Event-Synchronisation:', error);
      
      const duration = (Date.now() - startTime) / 1000;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Sync-Log mit Fehler aktualisieren
      if (syncLogId) {
        await db.update(syncLogs)
          .set({
            endDate: new Date(),
            itemsFound: totalProcessed + duplicates,
            itemsSaved: totalProcessed,
            duplicates,
            errors: errors + 1,
            durationSeconds: duration,
            syncStatus: 'error',
            errorMessage
          })
          .where(eq(syncLogs.id, syncLogId));
      }

      return {
        success: false,
        totalProcessed,
        duplicates,
        errors: errors + 1,
        errorMessage
      };
    }
  }

  /**
   * Events von der Vendon API abrufen
   */
  private async fetchEventsFromAPI(params: {
    fromTimestamp: number;
    toTimestamp: number;
    timeframeFilterType: string;
    offset: number;
    limit: number;
    [key: string]: any;
  }): Promise<VendonEventResponse> {
    const url = `${VENDON_API_BASE}/event/`;
    
    // API-Parameter aufbauen
    const apiParams: Record<string, any> = {
      from_timestamp: params.fromTimestamp,
      to_timestamp: params.toTimestamp,
      timeframe_filter_type: params.timeframeFilterType,
      offset: params.offset,
      limit: params.limit,
      sort: '-id' // Neueste zuerst
    };

    // Optionale Parameter hinzufügen
    if (params.machineId) apiParams.machine_id = params.machineId;
    if (params.warehouseId) apiParams.warehouse_id = params.warehouseId;
    if (params.state) apiParams.state = params.state;
    if (params.locationId) apiParams.location_id = params.locationId;
    if (params.locationType) apiParams.location_type = params.locationType;
    if (params.clientId) apiParams.client_id = params.clientId;
    if (params.minDuration) apiParams.min_duration = params.minDuration;
    if (params.maxDuration) apiParams.max_duration = params.maxDuration;
    if (params.ignored) apiParams.ignored = params.ignored;
    if (params.machineTags) apiParams.machine_tags = params.machineTags;
    if (params.eventTags) apiParams.event_tags = params.eventTags;

    console.log(`🌐 API Request: ${url}`, apiParams);

    const response = await axios.get(url, {
      params: apiParams,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 Sekunden Timeout
    });

    if (response.status !== 200) {
      throw new Error(`API Request fehlgeschlagen: Status ${response.status}`);
    }

    return response.data;
  }

  /**
   * Batch von Events in Datenbank speichern
   */
  private async saveEventsBatch(vendonEvents: VendonEvent[], forceUpdate: boolean = false): Promise<{
    processed: number;
    duplicates: number;
    errors: number;
  }> {
    let processed = 0;
    let duplicates = 0;
    let errors = 0;

    for (const vendonEvent of vendonEvents) {
      try {
        // Event-Daten konvertieren
        const eventData = await this.convertVendonEventToDbFormat(vendonEvent);
        
        if (!eventData) {
          console.warn(`⚠️ Event ${vendonEvent.id} konnte nicht konvertiert werden`);
          errors++;
          continue;
        }

        // Prüfen ob Event bereits existiert
        const existing = await db.select()
          .from(events)
          .where(eq(events.vendonId, eventData.vendonId))
          .limit(1);

        if (existing.length > 0) {
          if (forceUpdate) {
            // Event aktualisieren
            await db.update(events)
              .set({
                ...eventData,
                updatedAt: new Date()
              })
              .where(eq(events.vendonId, eventData.vendonId));
            
            console.log(`🔄 Event ${eventData.vendonId} aktualisiert`);
            processed++;
          } else {
            console.log(`⏭️ Event ${eventData.vendonId} bereits vorhanden (übersprungen)`);
            duplicates++;
          }
        } else {
          // Neues Event einfügen
          await db.insert(events).values(eventData);
          console.log(`✅ Event ${eventData.vendonId} gespeichert`);
          processed++;
        }

      } catch (error) {
        console.error(`❌ Fehler beim Speichern von Event ${vendonEvent.id}:`, error);
        errors++;
      }
    }

    return { processed, duplicates, errors };
  }

  /**
   * Vendon Event in Datenbankformat konvertieren
   */
  private async convertVendonEventToDbFormat(vendonEvent: VendonEvent): Promise<any | null> {
    try {
      // Zeitstempel konvertieren
      const parseTimestamp = (timestamp?: string): Date | null => {
        if (!timestamp) return null;
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? null : date;
      };

      // Maschinen-ID aus lokaler Datenbank ermitteln (falls verfügbar)
      let machineId: number | null = null;
      if (vendonEvent.machine_id) {
        // Hier könnte eine Suche in der machines-Tabelle erfolgen
        // const machine = await this.findMachineByVendonId(vendonEvent.machine_id);
        // machineId = machine?.id || null;
      }

      // Event-Daten zusammenstellen
      const eventData = {
        vendonId: vendonEvent.id,
        eventType: vendonEvent.event_type || null,
        eventName: vendonEvent.event_name || null,
        baseCode: vendonEvent.base_code || null,
        originalCode: vendonEvent.original_code || null,
        description: vendonEvent.description || null,
        name: vendonEvent.name || null,
        
        machineId: machineId,
        machineName: vendonEvent.machine_name || null,
        vendonMachineId: vendonEvent.machine_id || null,
        
        eventDatetime: parseTimestamp(vendonEvent.event_datetime),
        receivedAt: parseTimestamp(vendonEvent.received_at),
        resolvedAt: parseTimestamp(vendonEvent.resolved_at),
        datetime: parseTimestamp(vendonEvent.event_datetime) || parseTimestamp(vendonEvent.received_at) || new Date(),
        
        state: vendonEvent.state || null,
        status: vendonEvent.state || null, // Für Kompatibilität
        active: vendonEvent.active || null,
        ignored: vendonEvent.ignored || false,
        
        duration: vendonEvent.duration || null,
        
        severity: vendonEvent.severity || null,
        priority: vendonEvent.priority || null,
        category: vendonEvent.category || null,
        
        eventTags: vendonEvent.event_tags ? JSON.stringify(vendonEvent.event_tags) : null,
        machineTags: vendonEvent.machine_tags ? JSON.stringify(vendonEvent.machine_tags) : null,
        
        locationId: null, // Würde aus lokaler locations-Tabelle ermittelt
        locationName: vendonEvent.location_name || null,
        locationType: vendonEvent.location_type || null,
        
        clientId: vendonEvent.client_id ? parseInt(vendonEvent.client_id) : null,
        clientName: vendonEvent.client_name || null,
        warehouseId: vendonEvent.warehouse_id ? parseInt(vendonEvent.warehouse_id) : null,
        warehouseName: vendonEvent.warehouse_name || null,
        
        telemetryUnitId: vendonEvent.telemetry_unit_id ? parseInt(vendonEvent.telemetry_unit_id) : null,
        sensorData: vendonEvent.sensor_data ? JSON.stringify(vendonEvent.sensor_data) : null,
        
        extraData: JSON.stringify({
          originalEvent: vendonEvent,
          syncedBy: this.syncId,
          syncedAt: new Date().toISOString()
        }),
        rawApiData: JSON.stringify(vendonEvent),
        
        syncedAt: new Date(),
        processingStatus: 'pending'
      };

      return eventData;

    } catch (error) {
      console.error('Fehler bei Event-Konvertierung:', error);
      return null;
    }
  }

  /**
   * Hilfsmethode für Sleep/Delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Statistiken über gespeicherte Events abrufen
   */
  async getEventStats(): Promise<{
    totalEvents: number;
    eventsByState: Record<string, number>;
    eventsByType: Record<string, number>;
    latestEvent: Date | null;
    oldestEvent: Date | null;
  }> {
    try {
      // Gesamtanzahl Events
      const totalResult = await db.select({
        count: sql`count(*)`
      }).from(events);
      
      const totalEvents = parseInt(totalResult[0]?.count as string) || 0;

      // Events nach Status
      const stateResult = await db.select({
        state: events.state,
        count: sql`count(*)`
      })
      .from(events)
      .groupBy(events.state);

      const eventsByState: Record<string, number> = {};
      stateResult.forEach(row => {
        eventsByState[row.state || 'unknown'] = parseInt(row.count as string);
      });

      // Events nach Typ
      const typeResult = await db.select({
        eventType: events.eventType,
        count: sql`count(*)`
      })
      .from(events)
      .groupBy(events.eventType);

      const eventsByType: Record<string, number> = {};
      typeResult.forEach(row => {
        eventsByType[row.eventType || 'unknown'] = parseInt(row.count as string);
      });

      // Ältestes und neuestes Event
      const dateResult = await db.select({
        latest: sql`max(${events.datetime})`,
        oldest: sql`min(${events.datetime})`
      }).from(events);

      return {
        totalEvents,
        eventsByState,
        eventsByType,
        latestEvent: dateResult[0]?.latest ? new Date(dateResult[0].latest as string) : null,
        oldestEvent: dateResult[0]?.oldest ? new Date(dateResult[0].oldest as string) : null
      };

    } catch (error) {
      console.error('Fehler beim Abrufen der Event-Statistiken:', error);
      return {
        totalEvents: 0,
        eventsByState: {},
        eventsByType: {},
        latestEvent: null,
        oldestEvent: null
      };
    }
  }
}

// Helper-Funktion zum Importieren mit Standard-Optionen
export async function importVendonEvents(options: VendonEventsSyncOptions = {}): Promise<{
  success: boolean;
  totalProcessed: number;
  duplicates: number;
  errors: number;
  errorMessage?: string;
}> {
  // API-Key aus Umgebungsvariablen holen
  const apiKey = process.env.VENDON_API_KEY;
  
  if (!apiKey) {
    throw new Error('VENDON_API_KEY Umgebungsvariable ist nicht gesetzt. Bitte API-Key konfigurieren.');
  }

  const sync = new VendonEventsSync(apiKey);
  return await sync.syncEvents(options);
}