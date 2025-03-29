import { storage } from "../storage";
import { 
  InsertSyncLog, 
  InsertMachine, 
  InsertTransaction, 
  InsertEvent,
  InsertProduct,
  InsertRefill,
  InsertRefillDetail 
} from "@shared/schema";
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
   * Da es keinen direkten Produkte-Endpunkt gibt, kombinieren wir Daten aus verschiedenen Quellen
   */
  async getProducts() {
    // Versuche zuerst, die Produkte aus dem Stock-Endpunkt zu holen
    const stockResult = await this.makeRequest<any[]>("stock");
    
    if (stockResult && stockResult.length > 0) {
      console.log(`${stockResult.length} Produkte aus dem Stock-Endpunkt abgerufen`);
      return stockResult;
    }
    
    console.log("Keine Produkte im Stock-Endpunkt gefunden, versuche Alternative...");
    
    // Alternative: Produkte aus Transaktionen extrahieren
    // Wir holen die neuesten Transaktionen und extrahieren einzigartige Produkte
    const transactions = await this.getTransactions(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 Tage zurück
      new Date(),
      1,
      1000
    );
    
    if (transactions.data && transactions.data.length > 0) {
      // Eindeutige Produkt-IDs aus Transaktionen extrahieren
      const uniqueProducts = new Map();
      
      for (const transaction of transactions.data) {
        if (transaction.product_id && transaction.product_name) {
          // Verwende product_id als Schlüssel, um Duplikate zu vermeiden
          if (!uniqueProducts.has(transaction.product_id)) {
            uniqueProducts.set(transaction.product_id, {
              id: transaction.product_id,
              name: transaction.product_name,
              price: transaction.price || 0,
              // Füge weitere Felder hinzu, wenn verfügbar
              type: transaction.product_type || 'unknown',
              source: 'transactions'
            });
          }
        }
      }
      
      const extractedProducts = Array.from(uniqueProducts.values());
      console.log(`${extractedProducts.length} einzigartige Produkte aus Transaktionen extrahiert`);
      return extractedProducts;
    }
    
    // Wenn auch dieser Versuch fehlschlägt, geben wir eine leere Liste zurück
    return [];
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
        // Direkt UNIX-Timestamp aus JavaScript Date Object erzeugen
        startTimestamp = Math.floor(startDate.getTime() / 1000);
        console.log(`Startdatum (Date-Objekt) umgewandelt in Timestamp ${startTimestamp}, was ${new Date(startTimestamp * 1000).toISOString()} entspricht`);
      } else if (typeof startDate === 'string') {
        try {
          // Versuchen, das Datum im Format YYYY-MM-DD zu interpretieren
          const dt = new Date(startDate);
          if (!isNaN(dt.getTime())) {
            startTimestamp = Math.floor(dt.getTime() / 1000);
            console.log(`Startdatum ${startDate} umgewandelt in Timestamp ${startTimestamp}, was ${new Date(startTimestamp * 1000).toISOString()} entspricht`);
          } else {
            // Vielleicht ist es bereits ein UNIX-Timestamp als String
            startTimestamp = parseInt(startDate, 10);
            if (isNaN(startTimestamp)) {
              console.warn(`Ungültiges Startdatum-Format: ${startDate}, verwende Standard`);
              startTimestamp = null;
            } else {
              console.log(`Startdatum als direkter Timestamp ${startTimestamp} erkannt, was ${new Date(startTimestamp * 1000).toISOString()} entspricht`);
            }
          }
        } catch (error) {
          console.warn(`Fehler beim Parsen des Startdatums: ${error}`);
          startTimestamp = null;
        }
      } else if (typeof startDate === 'number') {
        // Wenn bereits eine Zahl, prüfen ob es sich um einen korrekten Timestamp handelt
        // Ein Timestamp von vor 2020 ist wahrscheinlich falsch, da wir aktuelle Daten erwarten
        if (startDate > 1577836800) { // 01.01.2020 00:00:00 GMT
          startTimestamp = startDate;
          console.log(`Startdatum als Timestamp ${startTimestamp} verarbeitet, was ${new Date(startTimestamp * 1000).toISOString()} entspricht`);
        } else {
          // Möglicherweise ist der Timestamp in Millisekunden (JavaScript) statt Sekunden (UNIX)
          if (startDate > 1577836800000) { // 01.01.2020 in Millisekunden
            startTimestamp = Math.floor(startDate / 1000);
            console.log(`Startdatum als Millisekunden-Timestamp erkannt, konvertiert zu ${startTimestamp}, was ${new Date(startTimestamp * 1000).toISOString()} entspricht`);
          } else {
            console.warn(`Zeitstempel ${startDate} scheint ungültig zu sein (vor 2020), verwende Standard`);
            startTimestamp = null;
          }
        }
      }
    }
    
    // Enddatum konvertieren - analog zum Startdatum
    if (endDate !== undefined) {
      if (endDate instanceof Date) {
        endTimestamp = Math.floor(endDate.getTime() / 1000);
        console.log(`Enddatum (Date-Objekt) umgewandelt in Timestamp ${endTimestamp}, was ${new Date(endTimestamp * 1000).toISOString()} entspricht`);
      } else if (typeof endDate === 'string') {
        try {
          // Bei YYYY-MM-DD Format, setze auf Ende des Tages
          const dt = new Date(endDate);
          if (!isNaN(dt.getTime())) {
            dt.setHours(23, 59, 59, 999);
            endTimestamp = Math.floor(dt.getTime() / 1000);
            console.log(`Enddatum ${endDate} umgewandelt in Timestamp ${endTimestamp}, was ${new Date(endTimestamp * 1000).toISOString()} entspricht`);
          } else {
            // Vielleicht ist es bereits ein UNIX-Timestamp als String
            endTimestamp = parseInt(endDate, 10);
            if (isNaN(endTimestamp)) {
              console.warn(`Ungültiges Enddatum-Format: ${endDate}, verwende Standard`);
              endTimestamp = null;
            } else {
              console.log(`Enddatum als direkter Timestamp ${endTimestamp} erkannt, was ${new Date(endTimestamp * 1000).toISOString()} entspricht`);
            }
          }
        } catch (error) {
          console.warn(`Fehler beim Parsen des Enddatums: ${error}`);
          endTimestamp = null;
        }
      } else if (typeof endDate === 'number') {
        // Gleiche Prüfung wie beim Startdatum
        if (endDate > 1577836800) { // 01.01.2020 00:00:00 GMT
          endTimestamp = endDate;
          console.log(`Enddatum als Timestamp ${endTimestamp} verarbeitet, was ${new Date(endTimestamp * 1000).toISOString()} entspricht`);
        } else {
          // Möglicherweise ist der Timestamp in Millisekunden (JavaScript) statt Sekunden (UNIX)
          if (endDate > 1577836800000) { // 01.01.2020 in Millisekunden
            endTimestamp = Math.floor(endDate / 1000);
            console.log(`Enddatum als Millisekunden-Timestamp erkannt, konvertiert zu ${endTimestamp}, was ${new Date(endTimestamp * 1000).toISOString()} entspricht`);
          } else {
            console.warn(`Zeitstempel ${endDate} scheint ungültig zu sein (vor 2020), verwende Standard`);
            endTimestamp = null;
          }
        }
      }
    }
    
    // Standardwerte, falls keine gültigen Daten angegeben wurden
    if (startTimestamp === null) {
      // Standardmäßig 7 Tage zurück
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      startTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);
      console.log(`Kein gültiger Startzeitstempel angegeben, verwende Standardwert von 7 Tagen zurück: ${new Date(startTimestamp * 1000).toISOString()}`);
    }
    
    if (endTimestamp === null) {
      // Standardmäßig jetzt
      endTimestamp = Math.floor(Date.now() / 1000);
      console.log(`Kein gültiger Endzeitstempel angegeben, verwende aktuelle Zeit: ${new Date(endTimestamp * 1000).toISOString()}`);
    }
    
    // Zeitraum in Tagen berechnen (für Protokollzwecke)
    const daysRange = Math.floor((endTimestamp - startTimestamp) / 86400) + 1;
    console.log(`Abfragebereich beträgt ${daysRange} Tage von ${new Date(startTimestamp * 1000).toISOString()} bis ${new Date(endTimestamp * 1000).toISOString()}`);
    
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
      
      // Für Events verwendet die API das Parameterformat from und to
      const params: Record<string, any> = {
        from: startTimestamp, // Sekunden für den Events-Endpunkt
        to: endTimestamp,     // Sekunden für den Events-Endpunkt
        offset: (page - 1) * limit,
        limit
      };
      
      if (machineId) {
        params.machine_id = machineId;
      }
      
      console.log(`Rufe Events ab mit Parametern: ${JSON.stringify(params)}`);
      
      // Laut Python-Code ist "events" der korrekte Endpunkt
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
        from: startTimestamp, // Verwende 'from' statt 'from_timestamp'
        to: endTimestamp,     // Verwende 'to' statt 'to_timestamp'
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
            // First, find the corresponding machine by vendonId
            let machineId = null;
            if (transaction.machine_id) {
              const machine = await storage.getMachineByVendonId(transaction.machine_id.toString());
              if (machine) {
                machineId = machine.id;
              } else {
                console.warn(`Machine with vendonId ${transaction.machine_id} not found. Creating a minimal machine record.`);
                
                // If machine doesn't exist, we need to create a minimal machine record
                const newMachine: InsertMachine = {
                  vendonId: transaction.machine_id.toString(),
                  machineName: transaction.machine_name || `Machine ${transaction.machine_id}`,
                  lastSync: new Date(),
                };
                
                const createdMachine = await storage.createMachine(newMachine);
                machineId = createdMachine.id;
              }
            }

            // Check if product exists
            let productId = null;
            if (transaction.product_id) {
              const product = await storage.getProductByVendonId(transaction.product_id.toString());
              if (product) {
                productId = product.id;
              } else if (transaction.product_name) {
                // If product doesn't exist, create it with minimal data
                const newProduct: InsertProduct = {
                  vendonId: transaction.product_id.toString(),
                  productName: transaction.product_name,
                  price: transaction.price || 0
                };
                
                const createdProduct = await storage.createProduct(newProduct);
                productId = createdProduct.id;
              }
            }

            // Zeitstempel in Date-Objekt umwandeln - API liefert entweder Sekunden oder Millisekunden
            let transactionDate: Date;
            if (typeof transaction.datetime === 'number') {
              // Wenn der Timestamp bereits eine Zahl ist
              if (transaction.datetime > 1577836800000) { // > 01.01.2020 in Millisekunden
                // Timestamp ist in Millisekunden
                transactionDate = new Date(transaction.datetime);
              } else {
                // Timestamp ist in Sekunden
                transactionDate = new Date(transaction.datetime * 1000);
              }
            } else if (typeof transaction.datetime === 'string') {
              // Versuche, den String als Timestamp zu parsen
              const parsedTimestamp = parseInt(transaction.datetime, 10);
              if (!isNaN(parsedTimestamp)) {
                if (parsedTimestamp > 1577836800000) { // > 01.01.2020 in Millisekunden
                  // Timestamp ist in Millisekunden
                  transactionDate = new Date(parsedTimestamp);
                } else {
                  // Timestamp ist in Sekunden
                  transactionDate = new Date(parsedTimestamp * 1000);
                }
              } else {
                // Versuche, es als ISO-Datum zu parsen
                transactionDate = new Date(transaction.datetime);
                if (isNaN(transactionDate.getTime())) {
                  // Notfallösung: Verwende die aktuelle Zeit
                  console.error(`Ungültiges Datumsformat in Transaktion ${transaction.id}: ${transaction.datetime}`);
                  transactionDate = new Date();
                }
              }
            } else {
              // Wenn datetime nicht vorhanden oder undefiniert ist
              console.error(`Fehlendes Datum in Transaktion ${transaction.id}`);
              transactionDate = new Date();
            }
            
            console.log(`Transaktion ${transaction.id}: Originaldatum ${transaction.datetime} → Konvertiert zu ${transactionDate.toISOString()}`);

            // Create transaction object with resolved IDs
            const newTransaction: InsertTransaction = {
              vendonId: transaction.id,
              machineId: machineId,
              productId: productId,
              price: transaction.price,
              datetime: transactionDate,
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
            // First, find the corresponding machine by vendonId
            let machineId = null;
            if (event.machine_id) {
              const machine = await storage.getMachineByVendonId(event.machine_id.toString());
              if (machine) {
                machineId = machine.id;
              } else {
                console.warn(`Machine with vendonId ${event.machine_id} not found for event. Creating a minimal machine record.`);
                
                // If machine doesn't exist, we need to create a minimal machine record
                const newMachine: InsertMachine = {
                  vendonId: event.machine_id.toString(),
                  machineName: event.machine_name || `Machine ${event.machine_id}`,
                  lastSync: new Date(),
                };
                
                const createdMachine = await storage.createMachine(newMachine);
                machineId = createdMachine.id;
              }
            }

            // Zeitstempel in Date-Objekt umwandeln - API liefert entweder Sekunden oder Millisekunden
            let eventDate: Date;
            if (typeof event.datetime === 'number') {
              // Wenn der Timestamp bereits eine Zahl ist
              if (event.datetime > 1577836800000) { // > 01.01.2020 in Millisekunden
                // Timestamp ist in Millisekunden
                eventDate = new Date(event.datetime);
              } else {
                // Timestamp ist in Sekunden
                eventDate = new Date(event.datetime * 1000);
              }
            } else if (typeof event.datetime === 'string') {
              // Versuche, den String als Timestamp zu parsen
              const parsedTimestamp = parseInt(event.datetime, 10);
              if (!isNaN(parsedTimestamp)) {
                if (parsedTimestamp > 1577836800000) { // > 01.01.2020 in Millisekunden
                  // Timestamp ist in Millisekunden
                  eventDate = new Date(parsedTimestamp);
                } else {
                  // Timestamp ist in Sekunden
                  eventDate = new Date(parsedTimestamp * 1000);
                }
              } else {
                // Versuche, es als ISO-Datum zu parsen
                eventDate = new Date(event.datetime);
                if (isNaN(eventDate.getTime())) {
                  // Notfallösung: Verwende die aktuelle Zeit
                  console.error(`Ungültiges Datumsformat in Event ${event.id}: ${event.datetime}`);
                  eventDate = new Date();
                }
              }
            } else {
              // Wenn datetime nicht vorhanden oder undefiniert ist
              console.error(`Fehlendes Datum in Event ${event.id}`);
              eventDate = new Date();
            }
            
            console.log(`Event ${event.id}: Originaldatum ${event.datetime} → Konvertiert zu ${eventDate.toISOString()}`);

            // Ähnliche Behandlung für resolved_at
            let resolvedDate: Date | null = null;
            if (event.resolved_at) {
              if (typeof event.resolved_at === 'number') {
                if (event.resolved_at > 1577836800000) { // > 01.01.2020 in Millisekunden
                  resolvedDate = new Date(event.resolved_at);
                } else {
                  resolvedDate = new Date(event.resolved_at * 1000);
                }
              } else if (typeof event.resolved_at === 'string') {
                const parsedTimestamp = parseInt(event.resolved_at, 10);
                if (!isNaN(parsedTimestamp)) {
                  if (parsedTimestamp > 1577836800000) {
                    resolvedDate = new Date(parsedTimestamp);
                  } else {
                    resolvedDate = new Date(parsedTimestamp * 1000);
                  }
                } else {
                  resolvedDate = new Date(event.resolved_at);
                  if (isNaN(resolvedDate.getTime())) {
                    console.error(`Ungültiges resolved_at Format in Event ${event.id}: ${event.resolved_at}`);
                    resolvedDate = null;
                  }
                }
              }
            }

            // Create event object with resolved machine ID
            const newEvent: InsertEvent = {
              vendonId: event.id,
              eventType: event.type,
              eventName: event.name,
              description: event.description,
              machineId: machineId,
              machineName: event.machine_name,
              datetime: eventDate,
              status: event.status,
              resolvedAt: resolvedDate,
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

  // Synchronize refills and refill details
  async syncRefills(
    startDate?: Date,
    endDate?: Date,
    batchSize: number = 100
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'refills',
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Default to last 30 days if no start date provided
      const effectiveStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const effectiveEndDate = endDate || new Date();
      
      console.log(`Syncing refills from ${effectiveStartDate.toISOString()} to ${effectiveEndDate.toISOString()}`);
      
      // Fetch refills from Vendon API
      let page = 1;
      let totalItems = 0;
      let hasMoreItems = true;
      
      // Track stats
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      let detailsSaved = 0;
      
      while (hasMoreItems) {
        const { data: refills, total } = await this.api.getRefills(
          effectiveStartDate,
          effectiveEndDate,
          page,
          batchSize
        );
        
        if (!refills || refills.length === 0) {
          hasMoreItems = false;
          break;
        }
        
        totalItems += refills.length;
        console.log(`Processing page ${page} with ${refills.length} refills`);
        
        // Process each refill
        for (const refill of refills) {
          try {
            // Get corresponding machine from database
            const machineData = await storage.getMachineByVendonId(refill.machine_id.toString());
            if (!machineData) {
              console.warn(`Machine with Vendon ID ${refill.machine_id} not found. Skipping refill.`);
              errors++;
              continue;
            }
            
            // Convert timestamp to JavaScript Date
            // Zeitstempel in Date-Objekt umwandeln - API liefert entweder Sekunden oder Millisekunden
            let timestamp: Date;
            if (typeof refill.datetime === 'number') {
              // Wenn der Timestamp bereits eine Zahl ist
              if (refill.datetime > 1577836800000) { // > 01.01.2020 in Millisekunden
                // Timestamp ist in Millisekunden
                timestamp = new Date(refill.datetime);
              } else {
                // Timestamp ist in Sekunden
                timestamp = new Date(refill.datetime * 1000);
              }
            } else if (typeof refill.datetime === 'string') {
              // Versuche, den String als Timestamp zu parsen
              const parsedTimestamp = parseInt(refill.datetime, 10);
              if (!isNaN(parsedTimestamp)) {
                if (parsedTimestamp > 1577836800000) { // > 01.01.2020 in Millisekunden
                  // Timestamp ist in Millisekunden
                  timestamp = new Date(parsedTimestamp);
                } else {
                  // Timestamp ist in Sekunden
                  timestamp = new Date(parsedTimestamp * 1000);
                }
              } else {
                // Versuche, es als ISO-Datum zu parsen
                timestamp = new Date(refill.datetime);
                if (isNaN(timestamp.getTime())) {
                  // Notfallösung: Verwende die aktuelle Zeit
                  console.error(`Ungültiges Datumsformat in Refill ${refill.id}: ${refill.datetime}`);
                  timestamp = new Date();
                }
              }
            } else {
              // Wenn datetime nicht vorhanden oder undefiniert ist
              console.error(`Fehlendes Datum in Refill ${refill.id}`);
              timestamp = new Date();
            }
            
            console.log(`Refill ${refill.id}: Originaldatum ${refill.datetime} → Konvertiert zu ${timestamp.toISOString()}`);
            
            // Prepare refill data
            const refillData = {
              vendonId: refill.id?.toString() || refill.refill_id?.toString(),
              machineId: machineData.id,
              machineName: refill.machine_name || machineData.machineName,
              datetime: timestamp,
              operator: refill.operator || '',
              status: refill.status || 'completed',
              extraData: JSON.stringify(refill),
              locationId: machineData.locationId,
              totalAmount: refill.total_amount || 0,
            };
            
            // Check if refill already exists
            const existingRefill = await storage.getRefillByVendonId(refillData.vendonId);
            
            let refillId: number;
            
            if (existingRefill) {
              // Skip duplicate
              duplicates++;
              refillId = existingRefill.id;
            } else {
              // Save new refill
              const savedRefill = await storage.createRefill(refillData);
              itemsSaved++;
              refillId = savedRefill.id;
              
              // Fetch and save refill details if available
              try {
                const refillDetails = await this.api.getRefillDetails(refillData.vendonId);
                
                if (refillDetails && Array.isArray(refillDetails.products)) {
                  for (const product of refillDetails.products) {
                    try {
                      // Find product in database or create minimal record
                      let productId: number | null = null;
                      
                      if (product.product_id) {
                        const existingProduct = await storage.getProductByVendonId(product.product_id.toString());
                        if (existingProduct) {
                          productId = existingProduct.id;
                        } else {
                          // Create minimal product record
                          const newProduct = await storage.createProduct({
                            vendonId: product.product_id.toString(),
                            productName: product.name || 'Unknown Product',
                            price: product.price || 0,
                            status: 'active',
                          });
                          productId = newProduct.id;
                        }
                      }
                      
                      // Save refill detail
                      await storage.createRefillDetail({
                        refillId,
                        productId: productId || undefined,
                        productName: product.name || 'Unknown Product',
                        quantity: product.quantity || 0,
                        price: product.price || 0,
                        datetime: timestamp,
                        extraData: JSON.stringify(product),
                      });
                      
                      detailsSaved++;
                    } catch (detailError) {
                      console.error(`Error saving refill detail: ${detailError}`);
                      errors++;
                    }
                  }
                }
              } catch (detailsError) {
                console.error(`Error fetching refill details: ${detailsError}`);
                errors++;
              }
            }
          } catch (refillError) {
            console.error(`Error processing refill: ${refillError}`);
            errors++;
          }
        }
        
        // Check if there are more pages
        hasMoreItems = refills.length >= batchSize;
        page++;
      }
      
      // Calculate duration
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      
      // Update sync log with results
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'completed',
        itemsFound: totalItems,
        itemsSaved,
        itemsUpdated,
        duplicates,
        errors,
        durationSeconds,
        additionalData: JSON.stringify({
          detailsSaved,
          startDate: effectiveStartDate.toISOString(),
          endDate: effectiveEndDate.toISOString(),
        }),
      });
      
      return {
        syncLogId,
        status: 'success',
        message: `Successfully synced ${totalItems} refills (${itemsSaved} new, ${duplicates} duplicates, ${errors} errors, ${detailsSaved} details)`,
      };
    } catch (error) {
      // Handle exceptions
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Refill sync error: ${errorMessage}`);
      
      // Update sync log with error status
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });
      
      return {
        syncLogId,
        status: 'error',
        message: `Refill synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Synchronize products from all available sources
  async syncProducts(): Promise<{ syncLogId: number; status: string; message: string }> {
    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'products',
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Fetch products from Vendon API
      const products = await this.api.getProducts();
      
      // Process results
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;

      for (const product of products) {
        try {
          // Verwende entweder id oder product_id als vendonId
          const vendonId = (product.id || product.product_id || '').toString();
          const productName = product.name || product.product_name || 'Unbekanntes Produkt';
          
          if (!vendonId) {
            console.warn(`Produkt ohne ID gefunden: ${productName}. Überspringe.`);
            continue;
          }
          
          // Check if product already exists
          const existing = await storage.getProductByVendonId(vendonId);
          
          if (existing) {
            // Update product
            await storage.updateProduct(existing.id, {
              productName: productName,
              price: product.price || 0,
              // Weitere verfügbare Felder
              status: product.status || 'active',
              description: product.description || null,
              category: product.category || null,
              additionalData: JSON.stringify(product),
            });
            itemsUpdated++;
          } else {
            // Create new product
            const newProduct: InsertProduct = {
              vendonId: vendonId,
              productName: productName,
              price: product.price || 0,
              // Weitere verfügbare Felder
              status: product.status || 'active',
              description: product.description || null,
              category: product.category || null,
              additionalData: JSON.stringify(product),
            };
            await storage.createProduct(newProduct);
            itemsSaved++;
          }
        } catch (error) {
          errors++;
          console.error(`Error processing product ${product.id || product.product_id}:`, error);
        }
      }

      // Update sync log with results
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: products.length,
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
        message: `Synchronized ${products.length} products: ${itemsSaved} saved, ${itemsUpdated} updated, ${errors} errors`,
      };
    } catch (error) {
      // Log error and update sync log
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Product synchronization error:', error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });

      return {
        syncLogId,
        status: 'error',
        message: `Product synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Run a full synchronization of all data types
  async syncAll(): Promise<{ status: string; message: string; results: any }> {
    const results = {
      machines: await this.syncMachines(),
      products: await this.syncProducts(),
      transactions: await this.syncTransactions(),
      refills: await this.syncRefills(),
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
    products: { status: string; lastSync: Date | null; count: number };
    transactions: { status: string; lastSync: Date | null; count: number; latest: Date | null };
    refills: { status: string; lastSync: Date | null; count: number };
    events: { status: string; lastSync: Date | null; count: number };
  }> {
    // Get latest sync logs
    const machinesSyncLog = await storage.getLatestSyncLog('machines');
    const productsSyncLog = await storage.getLatestSyncLog('products');
    const transactionsSyncLog = await storage.getLatestSyncLog('transactions');
    const refillsSyncLog = await storage.getLatestSyncLog('refills');
    const eventsSyncLog = await storage.getLatestSyncLog('events');

    // Count items in database
    const machines = await storage.getMachines(0); // 0 means no limit
    const products = await storage.getProducts(0); // 0 means no limit
    const transactions = await storage.getTransactions(1); // Just get the latest transaction
    const refills = await storage.getRefills(0); // 0 means no limit
    const events = await storage.getEvents(0); // 0 means no limit

    return {
      machines: {
        status: machinesSyncLog?.syncStatus || 'never',
        lastSync: machinesSyncLog?.endDate || null,
        count: machines.length,
      },
      products: {
        status: productsSyncLog?.syncStatus || 'never',
        lastSync: productsSyncLog?.endDate || null,
        count: products.length,
      },
      transactions: {
        status: transactionsSyncLog?.syncStatus || 'never',
        lastSync: transactionsSyncLog?.endDate || null,
        count: transactionsSyncLog?.itemsFound || 0,
        latest: transactions.length > 0 ? transactions[0].datetime : null,
      },
      refills: {
        status: refillsSyncLog?.syncStatus || 'never',
        lastSync: refillsSyncLog?.endDate || null,
        count: refillsSyncLog?.itemsFound || 0,
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
