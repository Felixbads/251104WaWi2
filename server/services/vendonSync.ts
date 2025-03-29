import { storage } from "../storage";
import { InsertSyncLog, InsertMachine, InsertTransaction, InsertEvent } from "@shared/schema";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

/**
 * Vendon API Client
 * Implementiert die Kommunikation mit der Vendon API basierend auf dem verbesserten Python-Code
 */
class VendonAPI {
  private readonly BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";
  private readonly headers: Record<string, string>;
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  
  constructor(apiKey?: string) {
    // Hierarchie für API-Schlüssel:
    // 1. Explizit übergebener Schlüssel hat höchste Priorität
    // 2. Umgebungsvariable VENDON_API_KEY
    // 3. Umgebungsvariable API_KEY
    
    if (apiKey) {
      this.apiKey = apiKey;
      console.log("API-Schlüssel vom Parameter verwendet.");
    } else if (process.env.VENDON_API_KEY) {
      this.apiKey = process.env.VENDON_API_KEY;
      console.log("API-Schlüssel aus VENDON_API_KEY Umgebungsvariable verwendet.");
    } else if (process.env.API_KEY) {
      this.apiKey = process.env.API_KEY;
      console.log("API-Schlüssel aus API_KEY Umgebungsvariable verwendet.");
    } else {
      // Standardwert als letzte Option (sollte in der Praxis durch einen echten API-Schlüssel ersetzt werden)
      this.apiKey = "e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB";
      console.warn("Fallback auf bekannten API-Schlüssel. Dieser könnte abgelaufen sein.");
    }

    // Überprüfen, ob wir einen API-Schlüssel haben
    if (!this.apiKey) {
      console.error("Kein API-Schlüssel gefunden! Die API wird nicht funktionieren.");
    } else {
      // Maske für Protokollierung erstellen
      const maskedKey = this.apiKey.length >= 4 ? "****" + this.apiKey.slice(-4) : "****";
      console.log(`Vendon API mit Schlüssel ${maskedKey} initialisiert.`);
    }

    // WICHTIG: Laut Vendon-Dokumentation muss der Authorization-Header "Token" und nicht "Bearer" verwenden
    this.headers = {
      "Authorization": `Token ${this.apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    // Axios-Client mit konfigurierten Headers erstellen
    this.client = axios.create({
      baseURL: this.BASE_URL,
      headers: this.headers,
      timeout: 30000, // 30 Sekunden Timeout
    });
  }

  /**
   * Führt eine API-Anfrage mit Wiederholungsversuchen durch
   */
  private async makeRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', 
    params?: Record<string, any>, 
    data?: any, 
    retries = 3
  ): Promise<T | null> {
    const url = `${this.BASE_URL}/${endpoint}`;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const config: AxiosRequestConfig = {
          method,
          url: endpoint, // URL ist relativ, da wir baseURL in axios.create gesetzt haben
          params,
          data,
        };

        // Log der API-Anfrage
        console.log(`API Request: ${method} ${url}`);
        if (params) console.log(`Params: ${JSON.stringify(params)}`);
        if (data) console.log(`Data: ${JSON.stringify(data)}`);

        const response = await this.client.request<{result: T}>(config);
        
        if (response.status === 200 && response.data) {
          return response.data.result;
        } else {
          console.warn(`API-Anfrage fehlgeschlagen: ${response.status}`);
          return null;
        }
      } catch (error: any) {
        if (error.response) {
          // Der Server hat mit einem Fehlerstatuscode geantwortet
          console.warn(`API-Anfrage fehlgeschlagen: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
          
          // Bei Authentifizierungsfehler nicht wiederholen
          if (error.response.status === 401) {
            console.error("Authentifizierungsfehler bei der Vendon API. Prüfen Sie den API-Schlüssel.");
            return null;
          }
          
          // Bei Rate-Limiting kurz warten und dann erneut versuchen
          if (error.response.status === 429 && attempt < retries - 1) {
            console.log(`Rate-Limiting erkannt, warte vor dem nächsten Versuch (${attempt+1}/${retries})...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 Sekunden warten
            continue;
          }
        } else if (error.request) {
          // Die Anfrage wurde gemacht, aber keine Antwort erhalten
          console.error(`Netzwerkfehler: Keine Antwort erhalten (${attempt+1}/${retries})`);
        } else {
          // Ein Fehler ist bei der Erstellung der Anfrage aufgetreten
          console.error(`Fehler bei der Anfrageerstellung: ${error.message}`);
        }
        
        if (attempt < retries - 1) {
          console.log(`Versuche erneut (${attempt+1}/${retries})...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 Sekunden warten
          continue;
        }
      }
    }
    
    // Wenn wir hier ankommen, hat die Anfrage nach allen Wiederholungsversuchen fehlgeschlagen
    return null;
  }

  /**
   * Ruft alle Automaten (Maschinen) von der Vendon API ab
   */
  async getMachines() {
    const result = await this.makeRequest<any[]>("machine");
    if (result) {
      console.log(`Anzahl der abgerufenen Maschinen: ${result.length}`);
      return result;
    }
    console.warn("Keine Maschinen gefunden oder API-Anfrage fehlgeschlagen");
    return [];
  }

  /**
   * Ruft Details zu einem bestimmten Automaten ab
   */
  async getMachineDetail(machineId: string) {
    const result = await this.makeRequest<any>(`machine/${machineId}`);
    return result || null;
  }

  /**
   * Ruft aktuelle Probleme bei Automaten ab
   */
  async getMachineIssues() {
    const result = await this.makeRequest<any[]>("machine/issues");
    return result || [];
  }

  /**
   * Ruft alle Produkte von der Vendon API ab
   */
  async getProducts() {
    const result = await this.makeRequest<any[]>("stock");
    return result || [];
  }

  /**
   * Bereitet Zeitstempel für die API-Anfragen vor
   */
  private prepareTimestamps(startDate?: Date | string | number, endDate?: Date | string | number): [number, number] {
    let startTimestamp: number | null = null;
    let endTimestamp: number | null = null;
    
    // Startdatum konvertieren
    if (startDate !== undefined) {
      if (startDate instanceof Date) {
        startTimestamp = Math.floor(startDate.getTime() / 1000);
      } else if (typeof startDate === 'string') {
        try {
          // Versuchen, das Datum im Format YYYY-MM-DD zu interpretieren
          const dt = new Date(startDate);
          if (!isNaN(dt.getTime())) {
            startTimestamp = Math.floor(dt.getTime() / 1000);
          } else {
            // Vielleicht ist es bereits ein UNIX-Timestamp als String
            startTimestamp = parseInt(startDate, 10);
            if (isNaN(startTimestamp)) {
              console.warn(`Ungültiges Startdatum-Format: ${startDate}, verwende Standard`);
              startTimestamp = null;
            }
          }
        } catch (error) {
          console.warn(`Fehler beim Parsen des Startdatums: ${error}`);
          startTimestamp = null;
        }
      } else if (typeof startDate === 'number') {
        startTimestamp = startDate;
      }
    }
    
    // Enddatum konvertieren
    if (endDate !== undefined) {
      if (endDate instanceof Date) {
        endTimestamp = Math.floor(endDate.getTime() / 1000);
      } else if (typeof endDate === 'string') {
        try {
          // Bei YYYY-MM-DD Format, setze auf Ende des Tages
          const dt = new Date(endDate);
          if (!isNaN(dt.getTime())) {
            dt.setHours(23, 59, 59, 999);
            endTimestamp = Math.floor(dt.getTime() / 1000);
          } else {
            // Vielleicht ist es bereits ein UNIX-Timestamp als String
            endTimestamp = parseInt(endDate, 10);
            if (isNaN(endTimestamp)) {
              console.warn(`Ungültiges Enddatum-Format: ${endDate}, verwende Standard`);
              endTimestamp = null;
            }
          }
        } catch (error) {
          console.warn(`Fehler beim Parsen des Enddatums: ${error}`);
          endTimestamp = null;
        }
      } else if (typeof endDate === 'number') {
        endTimestamp = endDate;
      }
    }
    
    // Standardwerte, falls keine gültigen Daten angegeben wurden
    if (startTimestamp === null) {
      // Standardmäßig 7 Tage zurück
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      startTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);
    }
    
    if (endTimestamp === null) {
      // Standardmäßig jetzt
      endTimestamp = Math.floor(Date.now() / 1000);
    }
    
    // Zeitraum in Tagen berechnen (für Protokollzwecke)
    const daysRange = Math.floor((endTimestamp - startTimestamp) / 86400) + 1;
    console.log(`Abfragebereich beträgt ${daysRange} Tage`);
    
    return [startTimestamp, endTimestamp];
  }

  /**
   * Ruft Ereignisse von der Vendon API ab
   */
  async getEvents(
    startDate?: Date | string,
    endDate?: Date | string,
    page = 1,
    limit = 100,
    machineId?: string
  ) {
    try {
      const [startTimestamp, endTimestamp] = this.prepareTimestamps(startDate, endDate);
      
      const params: Record<string, any> = {
        from_timestamp: startTimestamp,
        to_timestamp: endTimestamp,
        offset: (page - 1) * limit,
        limit
      };
      
      if (machineId) {
        params.machine_id = machineId;
      }
      
      console.log(`Rufe Events ab mit Parametern: ${JSON.stringify(params)}`);
      
      const events = await this.makeRequest<any[]>("events", "GET", params);
      if (events) {
        console.log(`Erfolgreich ${events.length} Events abgerufen`);
        return { 
          data: events, 
          total: events.length >= limit ? (page * limit) + 1 : page * limit, // Schätzung der Gesamtzahl
          page,
          limit
        };
      }
      
      console.warn("Keine Events gefunden oder API-Anfrage fehlgeschlagen");
      return { data: [], total: 0, page, limit };
    } catch (error) {
      console.error(`Fehler beim Abrufen von Ereignissen: ${error}`);
      return { data: [], total: 0, page, limit };
    }
  }

  /**
   * Ruft Transaktionsdaten von der Vendon API über den stats/vends Endpunkt ab
   */
  async getTransactions(
    startDate?: Date | string,
    endDate?: Date | string,
    page = 1,
    limit = 100,
    machineId?: string
  ) {
    try {
      const [startTimestamp, endTimestamp] = this.prepareTimestamps(startDate, endDate);
      
      const params: Record<string, any> = {
        from_timestamp: startTimestamp,
        to_timestamp: endTimestamp,
        offset: (page - 1) * limit,
        limit
      };
      
      if (machineId) {
        params.machine_id = machineId;
      }
      
      console.log(`Rufe Transaktionen ab mit Parametern: ${JSON.stringify(params)}`);
      
      // Verwende den stats/vends Endpunkt, der nachweislich funktioniert
      const transactions = await this.makeRequest<any[]>("stats/vends", "GET", params);
      
      if (transactions) {
        console.log(`Erfolgreich ${transactions.length} Transaktionen abgerufen`);
        return { 
          data: transactions, 
          total: transactions.length >= limit ? (page * limit) + 1 : page * limit, // Schätzung der Gesamtzahl
          page,
          limit
        };
      }
      
      console.warn("Keine Transaktionen gefunden oder API-Anfrage fehlgeschlagen");
      return { data: [], total: 0, page, limit };
    } catch (error) {
      console.error(`Fehler beim Abrufen von Transaktionen: ${error}`);
      return { data: [], total: 0, page, limit };
    }
  }

  /**
   * Ruft den aktuellen Lagerbestand eines Automaten ab
   */
  async getMachineStock(machineId: string) {
    const result = await this.makeRequest<any[]>(`machine/${machineId}/stock`);
    return result || [];
  }

  /**
   * Ruft Refill-Daten (Auffüllungen) von der Vendon API ab
   */
  async getRefills(
    startDate?: Date | string,
    endDate?: Date | string,
    page = 1,
    limit = 100,
    machineId?: string
  ) {
    try {
      const [startTimestamp, endTimestamp] = this.prepareTimestamps(startDate, endDate);
      
      // Bei Refills verwendet die API Millisekunden statt Sekunden!
      const params: Record<string, any> = {
        from: startTimestamp * 1000, // In Millisekunden umwandeln
        till: endTimestamp * 1000,   // In Millisekunden umwandeln
        offset: (page - 1) * limit,
        limit
      };
      
      if (machineId) {
        params.machine_id = machineId;
      }
      
      console.log(`Rufe Refills ab mit Parametern: ${JSON.stringify(params)}`);
      
      const refills = await this.makeRequest<any[]>("refill", "GET", params);
      
      if (refills) {
        console.log(`Erfolgreich ${refills.length} Refills abgerufen`);
        return { 
          data: refills, 
          total: refills.length >= limit ? (page * limit) + 1 : page * limit, // Schätzung der Gesamtzahl
          page,
          limit
        };
      }
      
      console.warn("Keine Refills gefunden oder API-Anfrage fehlgeschlagen");
      return { data: [], total: 0, page, limit };
    } catch (error) {
      console.error(`Fehler beim Abrufen von Refills: ${error}`);
      return { data: [], total: 0, page, limit };
    }
  }

  /**
   * Ruft Details zu einem bestimmten Refill ab
   */
  async getRefillDetails(refillId: string) {
    const result = await this.makeRequest<any>(`refill/${refillId}`);
    return result || null;
  }
}

export class VendonSyncService {
  private api: VendonAPI;

  constructor() {
    this.api = new VendonAPI();
  }

  // Format date to API expected format: YYYY-MM-DD
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Synchronize machines
  async syncMachines(): Promise<{ syncLogId: number; status: string; message: string }> {
    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'machines',
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Fetch machines from Vendon API
      const machines = await this.api.getMachines();
      
      // Process results
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;

      for (const machine of machines) {
        try {
          // Check if machine already exists
          const existing = await storage.getMachineByVendonId(machine.vendon_id);
          
          if (existing) {
            // Update machine
            await storage.updateMachine(existing.id, {
              machineName: machine.name,
              machineType: machine.type,
              status: machine.status,
              model: machine.model,
              serialNumber: machine.serial_number,
              lastSync: new Date(),
              additionalData: JSON.stringify(machine.additional_data),
              locationId: machine.location_id,
            });
            itemsUpdated++;
          } else {
            // Create new machine
            const newMachine: InsertMachine = {
              vendonId: machine.vendon_id,
              machineName: machine.name,
              machineType: machine.type,
              status: machine.status,
              model: machine.model,
              serialNumber: machine.serial_number,
              lastSync: new Date(),
              additionalData: JSON.stringify(machine.additional_data),
              locationId: machine.location_id,
            };
            await storage.createMachine(newMachine);
            itemsSaved++;
          }
        } catch (error) {
          errors++;
          console.error(`Error processing machine ${machine.vendon_id}:`, error);
        }
      }

      // Update sync log with results
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: machines.length,
        itemsSaved,
        itemsUpdated,
        duplicates,
        errors,
        durationSeconds,
        syncStatus: 'completed',
      });

      return {
        syncLogId,
        status: 'success',
        message: `Synchronized ${machines.length} machines: ${itemsSaved} saved, ${itemsUpdated} updated, ${errors} errors`,
      };
    } catch (error) {
      // Log error and update sync log
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Machine synchronization error:', error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });

      return {
        syncLogId,
        status: 'error',
        message: `Machine synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Synchronize transactions with date range and pagination
  async syncTransactions(
    startDate?: Date,
    endDate?: Date,
    batchSize = 100
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Use current date as end date if not provided
    const effectiveEndDate = endDate || new Date();
    
    // If start date is not provided, use the date of the last transaction or a default date (1 week ago)
    let effectiveStartDate = startDate;
    if (!effectiveStartDate) {
      // Get the latest sync log to determine the last sync date
      const lastSyncLog = await storage.getLatestSyncLog('transactions');
      if (lastSyncLog && lastSyncLog.endDate) {
        effectiveStartDate = new Date(lastSyncLog.endDate);
      } else {
        // Default to 1 week ago if no previous sync
        effectiveStartDate = new Date();
        effectiveStartDate.setDate(effectiveStartDate.getDate() - 7);
      }
    }

    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'transactions',
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Initialize counters
      let itemsFound = 0;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      let page = 1;
      let hasMorePages = true;

      // Format dates for API
      const formattedStartDate = this.formatDate(effectiveStartDate);
      const formattedEndDate = this.formatDate(effectiveEndDate);

      // Process paginated results
      while (hasMorePages) {
        // Fetch transactions from Vendon API
        const result = await this.api.getTransactions(
          formattedStartDate,
          formattedEndDate,
          page,
          batchSize
        );

        const transactions = result.data;
        itemsFound += transactions.length;

        // Process transactions
        for (const transaction of transactions) {
          try {
            // Create transaction object
            const newTransaction: InsertTransaction = {
              vendonId: transaction.id,
              machineId: transaction.machine_id,
              productId: transaction.product_id,
              price: transaction.price,
              datetime: new Date(transaction.datetime),
              productName: transaction.product_name,
              machineName: transaction.machine_name,
              transactionType: transaction.type,
              paymentType: transaction.payment_type,
              paymentMethod: transaction.payment_method,
              status: transaction.status,
              currency: transaction.currency,
              extraData: JSON.stringify(transaction.extra_data),
              locationId: transaction.location_id,
            };

            // Attempt to insert transaction
            await storage.createTransaction(newTransaction);
            itemsSaved++;
          } catch (error) {
            // Check if it's a duplicate error
            if (error instanceof Error && error.message.includes('duplicate')) {
              duplicates++;
            } else {
              errors++;
              console.error(`Error processing transaction ${transaction.id}:`, error);
            }
          }
        }

        // Check if there are more pages
        hasMorePages = transactions.length === batchSize && page * batchSize < result.total;
        page++;

        // Update sync log with progress
        await storage.updateSyncLog(syncLogId, {
          itemsFound,
          itemsSaved,
          itemsUpdated,
          duplicates,
          errors,
        });
      }

      // Update sync log with final results
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        durationSeconds,
        syncStatus: 'completed',
      });

      return {
        syncLogId,
        status: 'success',
        message: `Synchronized ${itemsFound} transactions: ${itemsSaved} saved, ${duplicates} duplicates, ${errors} errors`,
      };
    } catch (error) {
      // Log error and update sync log
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Transaction synchronization error:', error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });

      return {
        syncLogId,
        status: 'error',
        message: `Transaction synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Synchronize events with date range and pagination
  async syncEvents(
    startDate?: Date,
    endDate?: Date,
    batchSize = 100
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Use current date as end date if not provided
    const effectiveEndDate = endDate || new Date();
    
    // If start date is not provided, use the date of the last event or a default date (1 week ago)
    let effectiveStartDate = startDate;
    if (!effectiveStartDate) {
      // Get the latest sync log to determine the last sync date
      const lastSyncLog = await storage.getLatestSyncLog('events');
      if (lastSyncLog && lastSyncLog.endDate) {
        effectiveStartDate = new Date(lastSyncLog.endDate);
      } else {
        // Default to 1 week ago if no previous sync
        effectiveStartDate = new Date();
        effectiveStartDate.setDate(effectiveStartDate.getDate() - 7);
      }
    }

    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'events',
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Initialize counters
      let itemsFound = 0;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      let page = 1;
      let hasMorePages = true;

      // Format dates for API
      const formattedStartDate = this.formatDate(effectiveStartDate);
      const formattedEndDate = this.formatDate(effectiveEndDate);

      // Process paginated results
      while (hasMorePages) {
        // Fetch events from Vendon API
        const result = await this.api.getEvents(
          formattedStartDate,
          formattedEndDate,
          page,
          batchSize
        );

        const events = result.data;
        itemsFound += events.length;

        // Process events
        for (const event of events) {
          try {
            // Create event object
            const newEvent: InsertEvent = {
              vendonId: event.id,
              eventType: event.type,
              eventName: event.name,
              description: event.description,
              machineId: event.machine_id,
              machineName: event.machine_name,
              datetime: new Date(event.datetime),
              status: event.status,
              resolvedAt: event.resolved_at ? new Date(event.resolved_at) : null,
              severity: event.severity,
              extraData: JSON.stringify(event.extra_data),
            };

            // Attempt to insert event
            await storage.createEvent(newEvent);
            itemsSaved++;
          } catch (error) {
            // Check if it's a duplicate error
            if (error instanceof Error && error.message.includes('duplicate')) {
              duplicates++;
            } else {
              errors++;
              console.error(`Error processing event ${event.id}:`, error);
            }
          }
        }

        // Check if there are more pages
        hasMorePages = events.length === batchSize && page * batchSize < result.total;
        page++;

        // Update sync log with progress
        await storage.updateSyncLog(syncLogId, {
          itemsFound,
          itemsSaved,
          itemsUpdated,
          duplicates,
          errors,
        });
      }

      // Update sync log with final results
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        durationSeconds,
        syncStatus: 'completed',
      });

      return {
        syncLogId,
        status: 'success',
        message: `Synchronized ${itemsFound} events: ${itemsSaved} saved, ${duplicates} duplicates, ${errors} errors`,
      };
    } catch (error) {
      // Log error and update sync log
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Event synchronization error:', error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });

      return {
        syncLogId,
        status: 'error',
        message: `Event synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Run a full synchronization of all data types
  async syncAll(): Promise<{ status: string; message: string; results: any }> {
    const results = {
      machines: await this.syncMachines(),
      transactions: await this.syncTransactions(),
      events: await this.syncEvents(),
    };

    // Determine overall status
    const hasErrors = Object.values(results).some(r => r.status === 'error');
    
    return {
      status: hasErrors ? 'partial' : 'success',
      message: hasErrors 
        ? 'Synchronization completed with some errors' 
        : 'All synchronizations completed successfully',
      results,
    };
  }

  // Get sync status summary
  async getSyncStatus(): Promise<{
    machines: { status: string; lastSync: Date | null; count: number };
    transactions: { status: string; lastSync: Date | null; count: number; latest: Date | null };
    events: { status: string; lastSync: Date | null; count: number };
  }> {
    // Get latest sync logs
    const machinesSyncLog = await storage.getLatestSyncLog('machines');
    const transactionsSyncLog = await storage.getLatestSyncLog('transactions');
    const eventsSyncLog = await storage.getLatestSyncLog('events');

    // Count items in database
    const machines = await storage.getMachines(0); // 0 means no limit
    const transactions = await storage.getTransactions(1); // Just get the latest transaction
    const events = await storage.getEvents(0); // 0 means no limit

    return {
      machines: {
        status: machinesSyncLog?.syncStatus || 'never',
        lastSync: machinesSyncLog?.endDate || null,
        count: machines.length,
      },
      transactions: {
        status: transactionsSyncLog?.syncStatus || 'never',
        lastSync: transactionsSyncLog?.endDate || null,
        count: transactionsSyncLog?.itemsFound || 0,
        latest: transactions.length > 0 ? transactions[0].datetime : null,
      },
      events: {
        status: eventsSyncLog?.syncStatus || 'never',
        lastSync: eventsSyncLog?.endDate || null,
        count: eventsSyncLog?.itemsFound || 0,
      },
    };
  }
}

export const vendonSync = new VendonSyncService();
