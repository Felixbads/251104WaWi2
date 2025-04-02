import { storage } from "../storage";
import { 
  InsertSyncLog, 
  InsertMachine, 
  InsertTransaction, 
  InsertEvent,
  InsertProduct,
  InsertRefill,
  InsertRefillDetail,
  Stock,
  InsertStock,
  MachineStock,
  InsertMachineStock,
  Product
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
    
    // Headers für API-Anfragen einrichten.
    // Basierend auf dem verbesserten Python-Code verwenden wir 'Token' statt 'Bearer'
    this.headers = {
      'Authorization': `Token ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Axios-Client mit Timeouts und Basis-URL konfigurieren
    this.client = axios.create({
      baseURL: this.BASE_URL,
      headers: this.headers,
      timeout: 15000, // 15 Sekunden timeout
    });
  }
  
  /**
   * Führt eine API-Anfrage mit Wiederholungsversuchen durch
   */
  private async makeRequest<T>(
    endpoint: string, 
    method: string = 'GET', 
    params: Record<string, any> = {}, 
    data: any = null, 
    retries: number = 3
  ): Promise<T> {
    let lastError: any = null;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Log der Anfrage für Debugging-Zwecke
        console.log(`API-Anfrage: ${method} ${endpoint} (Versuch ${attempt + 1}/${retries})`);
        console.log('Parameter:', params);
        if (data) console.log('Daten:', data);
        
        const config: AxiosRequestConfig = {
          method,
          url: endpoint,
          params,
        };
        
        if (data) {
          config.data = data;
        }
        
        const response = await this.client.request<{result: T}>(config);
        
        // Für Debugging-Zwecke, zeige die ersten 500 Zeichen der Antwort
        const responseText = JSON.stringify(response.data);
        console.log(`API-Antwort: ${responseText.substring(0, 500)} ${responseText.length > 500 ? '...' : ''}`);
        
        // Die Vendon API gibt Daten im Format { result: ... } zurück
        if (response.data && ('result' in response.data)) {
          return response.data.result;
        }
        
        return response.data as T;
      } catch (error: any) {
        // Bei Fehlern wird ein Wiederholungsversuch unternommen.
        lastError = error;
        const errorMessage = error.response
          ? `Status: ${error.response.status}, Daten: ${JSON.stringify(error.response.data)}`
          : error.message;
        
        console.warn(`API-Fehler (Versuch ${attempt + 1}/${retries}): ${errorMessage}`);
        
        // Bei letztem Versuch nicht warten
        if (attempt < retries - 1) {
          // Exponentielles Backoff für Wiederholungen (0.5s, 1s, 2s, ...)
          const delay = Math.pow(2, attempt) * 500;
          console.log(`Warte ${delay}ms vor dem nächsten Versuch...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Alle Versuche fehlgeschlagen
    console.error(`API-Anfrage fehlgeschlagen nach ${retries} Versuchen.`);
    throw lastError;
  }
  
  /**
   * Ruft alle Automaten (Maschinen) von der Vendon API ab
   * 
   * Laut Dokumentation ist der korrekte Endpunkt '/machine/' (Singular)
   */
  async getMachines() {
    return this.makeRequest<any[]>('/machine/');
  }
  
  /**
   * Ruft Details zu einem bestimmten Automaten ab
   * 
   * Laut Dokumentation ist der korrekte Endpunkt '/machine/{id}'
   */
  async getMachineDetail(machineId: string) {
    return this.makeRequest<any>(`/machine/${machineId}`);
  }
  
  /**
   * Ruft aktuelle Probleme bei Automaten ab
   * 
   * Laut Dokumentation ist der korrekte Endpunkt '/machine/issues'
   */
  async getMachineIssues() {
    return this.makeRequest<any[]>('/machine/issues');
  }
  
  /**
   * Ruft alle Produkte von der Vendon API ab
   * Da es keinen direkten Produkte-Endpunkt gibt, kombinieren wir Daten aus verschiedenen Quellen
   */
  async getProducts() {
    console.log("Starte verbesserte Produktsynchronisierung...");
    const products: Record<string, any> = {};
    
    // Schritt 1: Hole alle Automaten
    const machines = await this.getMachines();
    console.log(`${machines.length} Automaten gefunden für Produktabruf`);
    
    // Schritt 2: Hole für jeden Automaten den Stock-Bestand
    for (const machine of machines) {
      try {
        console.log(`Hole Produktdaten für Automat ${machine.id} (${machine.name || 'Unbekannt'})`);
        const stock = await this.getMachineStock(machine.id.toString());
        
        // Verarbeite Stock-Daten und extrahiere Produkte
        if (stock && Array.isArray(stock)) {
          console.log(`${stock.length} Produkte im Lagerbestand für Automat ${machine.id} gefunden`);
          
          for (const item of stock) {
            if (item.product && item.product.id) {
              const productId = item.product.id.toString();
              
              // Verwende Object.assign, um bestehende Produktdaten zu ergänzen
              products[productId] = Object.assign({}, 
                products[productId] || {}, // Bestehende Daten oder leeres Objekt
                item.product, // Daten aus dem aktuellen Stock-Item
                { 
                  machine_id: machine.id,
                  machine_name: machine.name || 'Unbekannte Maschine',
                  location: machine.location || null
                }
              );
            } else if (item.id && item.name) {
              // Fallback, wenn Produkt nicht im üblichen Pfad liegt
              const productId = item.id.toString();
              products[productId] = Object.assign({},
                products[productId] || {},
                item,
                { 
                  machine_id: machine.id,
                  machine_name: machine.name || 'Unbekannte Maschine'
                }
              );
            }
          }
        }
      } catch (error) {
        console.error(`Fehler beim Abrufen des Lagerbestands für Maschine ${machine.id}:`, error);
      }
    }
    
    // Schritt 3: Hole Produkte aus den letzten Transaktionen
    try {
      console.log("Hole Produkte aus den letzten Transaktionen...");
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const transactions = await this.getTransactions(
        oneMonthAgo,
        new Date(),
        undefined,
        0,
        500 // Erhöhe die Anzahl der Transaktionen
      );
      
      if (transactions.data && Array.isArray(transactions.data)) {
        console.log(`${transactions.data.length} Transaktionen für Produktextraktion gefunden`);
        
        for (const transaction of transactions.data) {
          try {
            // Versuche, Produkt-ID und Produktnamen zu extrahieren
            if (transaction.stock_id && !products[transaction.stock_id]) {
              // Versuche, das Produkt über stock_id zu extrahieren
              console.log(`Neues Produkt aus Transaktion (stock_id ${transaction.stock_id}) gefunden`);
              
              const productObject = {
                id: transaction.stock_id,
                name: transaction.name || 'Unbekanntes Produkt',
                price: transaction.price || 0,
                machine_id: transaction.machine_id,
                machine_name: transaction.machine_name,
                source: 'transaction'
              };
              
              products[transaction.stock_id.toString()] = productObject;
            }
          } catch (transactionError) {
            console.error("Fehler bei der Verarbeitung einer Transaktion für Produktextraktion:", transactionError);
          }
        }
      }
    } catch (error) {
      console.error("Fehler beim Extrahieren von Produkten aus Transaktionen:", error);
    }
    
    // Konvertiere das Objekt in ein Array für die Rückgabe
    const productArray = Object.values(products);
    console.log(`Insgesamt ${productArray.length} einzigartige Produkte gefunden`);
    return productArray;
  }
  
  /**
   * Bereitet Zeitstempel für die API-Anfragen vor
   * Konvertiert verschiedene Datumsformate in UNIX-Zeitstempel (Sekunden)
   * für die Verwendung mit der Vendon API
   */
  private prepareTimestamps(startDate?: Date | string | number, endDate?: Date | string | number): [number, number] {
    let startTimestamp: number;
    let endTimestamp: number;
    
    // Aktuelle Zeit für Standardwerte
    const now = Math.floor(Date.now() / 1000); // Sekunden
    const oneMonthAgo = now - (30 * 24 * 60 * 60); // 30 Tage zurück
    
    // Hilfsfunktion zur konsistenten Konvertierung in UNIX-Zeitstempel (Sekunden)
    const convertToUnixTimestamp = (input: Date | string | number): number => {
      if (input instanceof Date) {
        // Wenn ein Date Objekt übergeben wurde
        return Math.floor(input.getTime() / 1000);
      } else if (typeof input === 'string') {
        // Wenn ein ISO-String oder anderes Datumsformat übergeben wurde
        return Math.floor(new Date(input).getTime() / 1000);
      } else {
        // Wenn ein Zeitstempel übergeben wurde
        // Überprüfen, ob es in Millisekunden ist (13-stellig) oder in Sekunden (10-stellig)
        // Eine Zahl > 10^10 ist mit ziemlicher Sicherheit ein Millisekunden-Timestamp
        return input > 10000000000 
          ? Math.floor(input / 1000) // Konvertiere von ms zu s
          : input;
      }
    };
    
    // Verarbeite startDate (oder Standardwert)
    startTimestamp = startDate ? convertToUnixTimestamp(startDate) : oneMonthAgo;
    
    // Verarbeite endDate (oder Standardwert)
    endTimestamp = endDate ? convertToUnixTimestamp(endDate) : now;
    
    // Sicherstellen, dass startTimestamp nicht größer als endTimestamp ist
    if (startTimestamp > endTimestamp) {
      console.warn("Warnhinweis: startDate ist größer als endDate; Werte werden getauscht");
      [startTimestamp, endTimestamp] = [endTimestamp, startTimestamp];
    }
    
    // Logge die verwendeten Timestamps für Debugging
    console.log(`Verwende Zeitraum: ${new Date(startTimestamp * 1000).toISOString()} bis ${new Date(endTimestamp * 1000).toISOString()}`);
    console.log(`Timestamps: ${startTimestamp} bis ${endTimestamp}`);
    
    return [startTimestamp, endTimestamp];
  }
  
  /**
   * Ruft Ereignisse von der Vendon API ab
   * 
   * Laut Dokumentation ist der korrekte Endpunkt '/event/' (Singular)
   */
  async getEvents(
    startDate?: Date | string | number,
    endDate?: Date | string | number,
    machineId?: string,
    offset: number = 0,
    limit: number = 100
  ) {
    const [startTimestamp, endTimestamp] = this.prepareTimestamps(startDate, endDate);
    
    const params: Record<string, any> = {
      from_timestamp: startTimestamp,
      to_timestamp: endTimestamp,
      offset,
      limit
    };
    
    if (machineId) {
      params.machine_id = machineId;
    }
    
    try {
      // Korrekter Endpunkt ist '/event/' (Singular) anstatt '/events'
      const events = await this.makeRequest<any[]>('/event/', 'GET', params);
      const result = {
        data: events,
        total: events.length, // Die API gibt die Gesamtzahl nicht direkt zurück, nehmen wir an, dass das alles ist
      };
      return result;
    } catch (error) {
      console.error('Fehler beim Abrufen von Ereignissen:', error);
      return { data: [], total: 0 };
    }
  }
  
  /**
   * Ruft Transaktionsdaten von der Vendon API über den stats/vends Endpunkt ab
   * 
   * Laut Dokumentation im Vendon.net Screenshot:
   * - Endpunkt ist '/stats/vends'
   * - Parameter: from_timestamp, to_timestamp (UNIX-Zeitstempel in Sekunden)
   * - Pagination: offset, limit
   * - Rückgabeformat: { code: 200, result: [...Transaktionen...] }
   */
  async getTransactions(
    startDate?: Date | string | number,
    endDate?: Date | string | number,
    machineId?: string,
    offset: number = 0,
    limit: number = 100
  ) {
    const [startTimestamp, endTimestamp] = this.prepareTimestamps(startDate, endDate);
    
    const params: Record<string, any> = {
      from_timestamp: startTimestamp,
      to_timestamp: endTimestamp,
      offset,
      limit
    };
    
    if (machineId) {
      params.machine_id = machineId;
    }
    
    try {
      // Logge die Anfrage-Parameter für Debugging
      console.log('API-Anfrage: GET /stats/vends (Versuch 1/3)');
      console.log('Parameter:', JSON.stringify(params, null, 2));
      
      // Führe die API-Anfrage durch
      const response = await this.makeRequest<any>('/stats/vends', 'GET', params);
      
      // Extrahiere die eigentlichen Transaktionsdaten aus der Antwort
      // Wenn die Antwort direkt ein Array ist (ältere API-Version), verwende es direkt
      // Andernfalls, extrahiere das result-Array aus der Antwort (neuere API-Version)
      let transactionData: any[] = [];
      
      if (Array.isArray(response)) {
        // Direkte Array-Antwort (ältere API-Version)
        transactionData = response;
      } else if (response && Array.isArray(response.result)) {
        // Neuere API-Version mit { code: 200, result: [...] } Format
        transactionData = response.result;
      }
      
      return { 
        data: transactionData, 
        total: transactionData.length 
      };
    } catch (error) {
      console.error('Fehler beim Abrufen von Transaktionen:', error);
      return { data: [], total: 0 };
    }
  }
  
  /**
   * Ruft den aktuellen Lagerbestand eines Automaten ab
   * 
   * Korrekter Endpunkt laut Dokumentation und Screenshot ist '/stock'
   * Die Maschinendaten werden durch Filter-Parameter eingeschränkt
   */
  async getMachineStock(machineId: string) {
    try {
      // Richtiger Endpunkt mit Filter-Parameter für Maschinen-ID
      const params = { machine_id: machineId };
      return this.makeRequest<any[]>('/stock', 'GET', params);
    } catch (error) {
      console.error(`Fehler beim Abrufen des Lagerbestands für Maschine ${machineId}:`, error);
      return [];
    }
  }
  
  /**
   * Ruft alle verfügbaren Stock-Produkte von der Vendon API ab
   * 
   * Verwendet die Stock API, die in der Dokumentation beschrieben ist
   * Diese Funktion gibt alle Stock-Produkte ohne Filterung zurück
   */
  async getStockProducts() {
    try {
      // Richtiger Endpunkt für die Stock API (nach Dokumentation)
      const result = await this.makeRequest<any[]>('/stock');
      
      console.log(`${result.length} Stock-Produkte von der Vendon API abgerufen`);
      return result;
    } catch (error) {
      console.error('Fehler beim Abrufen der Stock-Produkte:', error);
      return [];
    }
  }
  
  /**
   * Ruft Refill-Daten (Auffüllungen) von der Vendon API ab
   * 
   * Laut Dokumentation in Pasted-Refills-API-Abruf-von-Refills-Auff-llungen-Endpunkt-GET:
   * - Der korrekte Endpunkt ist "refills" (Plural)
   * - Die Parameter heißen from_timestamp und to_timestamp
   * - Die Werte müssen in Sekunden (nicht Millisekunden) sein
   */
  async getRefills(
    startDate?: Date | string | number,
    endDate?: Date | string | number,
    page: number = 1,
    limit: number = 100
  ) {
    // Bereite die Timestamps im korrekten Format vor
    const [startTimestamp, endTimestamp] = this.prepareTimestamps(startDate, endDate);
    
    // Berechne den Offset basierend auf der Seite
    const offset = (page - 1) * limit;
    
    const params: Record<string, any> = {
      from_timestamp: startTimestamp,
      to_timestamp: endTimestamp,
      offset,
      limit
    };
    
    try {
      // Verwende den korrekten Endpunkt 'refills'
      const refills = await this.makeRequest<any[]>('/refills', 'GET', params);
      
      return {
        data: refills,
        total: refills.length // Die API gibt die Gesamtzahl nicht direkt zurück, nehmen wir an, dass das alles ist
      };
    } catch (error) {
      console.error('Fehler beim Abrufen von Refills:', error);
      return { data: [], total: 0 };
    }
  }
  
  /**
   * Ruft Details zu einem bestimmten Refill ab
   * 
   * Laut Dokumentation ist der Endpunkt für Refill-Details:
   * GET https://cloud.vendon.net/rest/v1.8.0/refills/{refill_id}
   * 
   * Die Antwort enthält information über hinzugefügte und entfernte Produkte
   * in den Feldern 'added' und 'removed'
   */
  async getRefillDetails(refillId: string) {
    try {
      console.log(`Rufe Refill-Details für ID ${refillId} ab...`);
      const result = await this.makeRequest<any>(`/refills/${refillId}`);
      
      // Protokolliere die Antwort für Debugging-Zwecke
      if (process.env.NODE_ENV === 'development') {
        console.log(`Refill-Details Antwort für ${refillId}:`, 
          JSON.stringify(result).substring(0, 200) + '...');
      }
      
      // Vergewissere dich, dass wir ein Array zurückgeben 
      // Manchmal gibt die API ein Objekt mit einem 'products'-Feld zurück,
      // manchmal ein direktes Array
      if (Array.isArray(result)) {
        return result;
      } else if (result && result.products && Array.isArray(result.products)) {
        return result.products;
      } else if (result && typeof result === 'object') {
        // Wenn es sich um ein Objekt handelt, aber kein products-Array enthält,
        // versuche, es als einzelnes Produkt zu behandeln
        return [result];
      }
      
      // Fallback: Leeres Array zurückgeben
      console.warn(`Unerwartetes Format für Refill-Details ${refillId}, gebe leeres Array zurück`);
      return [];
    } catch (error) {
      console.error(`Fehler beim Abrufen der Refill-Details für Refill ${refillId}:`, error);
      
      // Versuche alternative Endpunkte, wie in der Python-Implementierung
      try {
        console.log(`Versuche alternativen Endpunkt /refill/${refillId}...`);
        const result = await this.makeRequest<any>(`/refill/${refillId}`);
        return Array.isArray(result) ? result : [result];
      } catch (fallbackError) {
        console.error(`Auch alternativer Endpunkt fehlgeschlagen:`, fallbackError);
        return [];
      }
    }
  }
}

export class VendonSyncService {
  private api: VendonAPI;
  
  /**
   * Ruft alle Produkte aus der Datenbank ab
   * Diese Methode ist für die Web-API gedacht
   */
  async getAllProducts() {
    return await storage.getProducts(0); // 0 bedeutet kein Limit
  }
  
  // Status für inkrementelle historische Synchronisierung
  private historicalSyncState: {
    inProgress: boolean;
    currentYear: number;
    currentMonth: number;
    targetDate: Date;
    startDate: Date;
    batchSize: number;
    totalTransactions: number; // Gesamtzahl der geladenen historischen Transaktionen
    completedMonths: Array<string>; // Liste der fertig synchronisierten Monate im Format YYYY-MM
    processingStart: number; // Zeitstempel für den Beginn der aktuellen Synchronisierung
  };
  
  constructor() {
    // Initialisiere die API mit dem Schlüssel aus den Umgebungsvariablen
    this.api = new VendonAPI();
    
    // Initialwerte für historische Synchronisierung
    this.historicalSyncState = {
      inProgress: false,
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth(),
      targetDate: new Date(2023, 0, 1), // Ziel: 1. Januar 2023
      startDate: new Date(), // Startdatum ist das aktuelle Datum
      batchSize: 200, // Erhöht für bessere Performance
      totalTransactions: 0,
      completedMonths: [],
      processingStart: 0
    };
  }
  
  /**
   * Gibt die API-Instanz für Debug-Zwecke zurück
   */
  getApi(): VendonAPI {
    return this.api;
  }
  
  /**
   * Aktualisiert existierende Transaktionen mit Daten aus dem extraData-Feld
   * Diese Methode extrahiert Informationen aus dem extraData JSON und speichert sie in den entsprechenden Spalten
   */
  async updateExistingTransactions(
    limit: number = 100,
    offset: number = 0
  ): Promise<{ status: string; message: string; updated: number; errors: number; total: number }> {
    try {
      console.log(`Aktualisiere bestehende Transaktionen mit Limit ${limit} und Offset ${offset}`);
      const startTime = Date.now();
      
      // Zähler für die Verarbeitung
      let totalItems = 0;
      let updatedItems = 0;
      let errors = 0;
      
      // Hole Transaktionen, die noch nicht aktualisiert wurden (processingStatus = 'pending')
      const transactions = await storage.getTransactionsForProcessing(limit, offset);
      totalItems = transactions.length;
      
      console.log(`${totalItems} Transaktionen zur Aktualisierung gefunden`);
      
      if (totalItems === 0) {
        return {
          status: 'success',
          message: 'Keine Transaktionen zur Aktualisierung gefunden',
          updated: 0,
          errors: 0,
          total: 0
        };
      }
      
      // Verarbeite jede Transaktion
      for (const transaction of transactions) {
        try {
          console.log(`Verarbeite Transaktion ${transaction.id} (Vendon-ID: ${transaction.vendonId})`);
          
          // Prüfe, ob extraData vorhanden ist
          if (!transaction.extraData) {
            console.warn(`Transaktion ${transaction.id} hat keine extraData`);
            await storage.updateTransactionProcessingStatus(transaction.id, 'skipped', 'Keine extraData vorhanden');
            continue;
          }
          
          // Versuche extraData zu parsen
          let extraDataObj: any;
          try {
            extraDataObj = JSON.parse(transaction.extraData);
          } catch (parseError) {
            console.error(`Fehler beim Parsen von extraData für Transaktion ${transaction.id}:`, parseError);
            await storage.updateTransactionProcessingStatus(transaction.id, 'error', `JSON Parse-Fehler: ${parseError}`);
            errors++;
            continue;
          }
          
          // Erstelle ein Update-Objekt mit den extrahierten Werten
          const updateData: Partial<InsertTransaction> = {
            // Extrahiere Preisdaten
            priceVat: extraDataObj.price_vat || null,
            priceWoVat: extraDataObj.price_wo_vat || null,
            vat: extraDataObj.vat || null,
            
            // Extrahiere Zeitstempel
            transactionDt: extraDataObj.transaction_dt 
              ? new Date(
                  extraDataObj.transaction_dt > 1577836800000
                  ? extraDataObj.transaction_dt
                  : extraDataObj.transaction_dt * 1000
                )
              : null,
            registeredDt: extraDataObj.registered_dt
              ? new Date(
                  extraDataObj.registered_dt > 1577836800000
                  ? extraDataObj.registered_dt
                  : extraDataObj.registered_dt * 1000
                )
              : null,
            updatedAt: extraDataObj.updated_at
              ? new Date(
                  extraDataObj.updated_at > 1577836800000
                  ? extraDataObj.updated_at
                  : extraDataObj.updated_at * 1000
                )
              : null,
            
            // Extrahiere Produktinformationen
            productName: extraDataObj.name || transaction.productName,
            stockId: extraDataObj.stock_id || null,
            selection: extraDataObj.selection || null,
            
            // Zahlungsinformationen
            paymentMethod: extraDataObj.payment_method || null,
            currency: extraDataObj.currency || null,
            
            // Meta-Informationen
            processingStatus: 'processed',
            processedAt: new Date(),
            lastSync: new Date()
          };
          
          // Aktualisiere die Transaktion in der Datenbank
          await storage.updateTransaction(transaction.id, updateData);
          updatedItems++;
          
        } catch (updateError) {
          console.error(`Fehler bei der Aktualisierung von Transaktion ${transaction.id}:`, updateError);
          await storage.updateTransactionProcessingStatus(
            transaction.id, 
            'error', 
            updateError instanceof Error ? updateError.message : String(updateError)
          );
          errors++;
        }
      }
      
      // Berechne die Dauer
      const durationSeconds = (Date.now() - startTime) / 1000;
      
      return {
        status: 'success',
        message: `${updatedItems} von ${totalItems} Transaktionen aktualisiert in ${durationSeconds.toFixed(2)} Sekunden`,
        updated: updatedItems,
        errors: errors,
        total: totalItems
      };
      
    } catch (error) {
      console.error("Fehler bei der Massenaktualisierung von Transaktionen:", error);
      return {
        status: 'error',
        message: `Fehler bei der Aktualisierung: ${error instanceof Error ? error.message : String(error)}`,
        updated: 0,
        errors: 1,
        total: 0
      };
    }
  }
  
  private formatDate(date: Date): string {
    return date.toISOString();
  }
  
  /**
   * Holt die aktuelle Anzahl von Transaktionen aus der Datenbank
   * @returns Die Anzahl der Transaktionen
   */
  public async getTransactionCount(): Promise<number> {
    try {
      const count = await storage.getTransactionCount();
      return count;
    } catch (error) {
      console.error("Fehler beim Abrufen der Transaktionsanzahl:", error);
      return 0;
    }
  }
  
  /**
   * Synchronisiert historische Transaktionen seit Januar 2023
   * Diese Methode ruft Transaktionen in Monatsblöcken ab, um die Datenmenge pro API-Aufruf zu begrenzen
   */
  async syncHistoricalTransactions(
    batchSize: number = 100,
    maxTransactionsPerMonth: number = 10000
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Erstelle einen Sync-Log-Eintrag
    const syncLog: InsertSyncLog = {
      syncType: 'historical_transactions',
      startDate: new Date(2023, 0, 1), // 1. Januar 2023
      endDate: new Date(),
      syncStatus: 'running',
    };
    
    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;
    
    try {
      console.log(`Starte Synchronisierung historischer Transaktionen seit Januar 2023`);
      const startTime = Date.now();
      
      // Startdatum: 1. Januar 2023
      const startDate = new Date(2023, 0, 1);
      
      // Enddatum: Heute
      const endDate = new Date();
      
      // Zähler für die Gesamtstatistik
      let totalImported = 0;
      let totalDuplicates = 0;
      let totalErrors = 0;
      
      // Für jeden Monat von Januar 2023 bis zum aktuellen Monat
      for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year++) {
        // Startmonat für dieses Jahr (für 2023 ist es Januar, für andere Jahre ist es der aktuelle Monat)
        const startMonth = year === startDate.getFullYear() ? startDate.getMonth() : 0;
        
        // Endmonat für dieses Jahr (für das aktuelle Jahr ist es der aktuelle Monat, für andere Jahre ist es Dezember)
        const endMonth = year === endDate.getFullYear() ? endDate.getMonth() : 11;
        
        for (let month = startMonth; month <= endMonth; month++) {
          // Startdatum für diesen Monat
          const monthStartDate = new Date(year, month, 1);
          
          // Enddatum für diesen Monat (erster Tag des nächsten Monats minus 1 ms)
          const monthEndDate = new Date(year, month + 1, 1);
          monthEndDate.setMilliseconds(-1);
          
          console.log(`Synchronisiere Transaktionen für ${monthStartDate.toLocaleDateString()} bis ${monthEndDate.toLocaleDateString()}`);
          
          // Monatliche Synchronisation durchführen
          const result = await this.syncTransactions(monthStartDate, monthEndDate, batchSize, maxTransactionsPerMonth);
          
          // Statistiken extrahieren
          const syncLog = await storage.getSyncLog(result.syncLogId);
          
          if (syncLog) {
            totalImported += syncLog.itemsSaved || 0;
            totalDuplicates += syncLog.duplicates || 0;
            totalErrors += syncLog.errors || 0;
            
            console.log(`Monat ${year}-${month+1} abgeschlossen: ${syncLog.itemsSaved} neue Transaktionen, ${syncLog.duplicates} Duplikate, ${syncLog.errors} Fehler`);
          }
          
          // Aktualisiere den Haupt-Sync-Log mit dem aktuellen Fortschritt
          await storage.updateSyncLog(syncLogId, {
            itemsFound: totalImported + totalDuplicates,
            itemsSaved: totalImported,
            duplicates: totalDuplicates,
            errors: totalErrors
          });
        }
      }
      
      // Berechne die Gesamtdauer
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      // Aktualisiere den Sync-Log mit dem Endergebnis
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: totalImported + totalDuplicates,
        itemsSaved: totalImported,
        duplicates: totalDuplicates,
        errors: totalErrors,
        durationSeconds,
        syncStatus: 'completed'
      });
      
      return {
        syncLogId,
        status: 'success',
        message: `Historische Transaktionssynchronisation abgeschlossen: ${totalImported} neue Transaktionen, ${totalDuplicates} Duplikate, ${totalErrors} Fehler`
      };
    } catch (error) {
      console.error("Fehler bei der historischen Transaktionssynchronisation:", error);
      
      // Aktualisiere den Sync-Log mit dem Fehler
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      return {
        syncLogId,
        status: 'error',
        message: `Historische Transaktionssynchronisation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Synchronisiert Maschinen/Automaten
   */
  async syncMachines(): Promise<{ syncLogId: number; status: string; message: string }> {
    // Sync-Log-Eintrag mit Status "running" erstellen
    const syncLog: InsertSyncLog = {
      syncType: 'machines',
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      console.log("Hole Maschinendaten von der Vendon API");
      const startTime = Date.now();
      
      // Maschinen von der Vendon API abrufen
      const machines = await this.api.getMachines();
      
      if (!machines || machines.length === 0) {
        throw new Error("Keine Maschinen von der API erhalten");
      }
      
      console.log(`${machines.length} Maschinen gefunden.`);
      
      // Zähler für Erfolgsstatistik
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      
      // Jede Maschine verarbeiten
      for (const machine of machines) {
        // Grundlegende Validierung
        if (!machine.id) {
          console.error("Maschine ohne ID übersprungen:", machine);
          errors++;
          continue;
        }
        
        // Konvertiere die machine.id zu einem String
        const vendonId = machine.id.toString();
        
        // Hole detaillierte Maschineninfos für jede Maschine
        console.log(`Hole Details für Maschine ${vendonId}...`);
        let machineDetail;
        try {
          machineDetail = await this.api.getMachineDetail(vendonId);
          console.log(`Details für Maschine ${vendonId} erhalten.`);
        } catch (error) {
          console.error(`Fehler beim Abrufen von Maschinendetails für ${vendonId}:`, error);
          machineDetail = null;
        }
        
        // Kombiniere die Basisdaten mit den Detaildaten
        const combinedData = machineDetail ? { ...machine, ...machineDetail } : machine;
        
        // Extrahiere alle wichtigen Felder aus dem kombinierten Objekt
        // Bereite die Maschinendaten vor
        const newMachine: InsertMachine = {
          vendonId: vendonId,
          machineName: combinedData.name || `Maschine ${vendonId}`,
          serialNumber: combinedData.serial_number || null,
          status: combinedData.status || 'unknown',
          model: combinedData.model || null, 
          machineType: combinedData.type || null,
          description: combinedData.description || null,
          
          // Standortinformationen
          locationName: combinedData.location?.name || null,
          // Setze locationId bewusst immer auf null, da wir keine Location-Tabelle haben, die referenziert werden könnte
          locationId: null, 
          locationAddress: combinedData.location?.address || combinedData.address || null,
          
          // GPS-Koordinaten
          telemetryUnitId: combinedData.telemetry_unit_id || null,
          power: combinedData.power || null,
          powerStatus: combinedData.power_status || null,
          currency: combinedData.currency || null,
          
          // Weitere Standortdaten aus location oder direkt aus dem Objekt
          additionalData: JSON.stringify({
            gps: combinedData.gps || combinedData.location?.gps || null,
            address: combinedData.address || combinedData.location?.address || null,
            zip: combinedData.zip || combinedData.location?.zip || null,
            city: combinedData.city || combinedData.location?.city || null,
            country: combinedData.country || combinedData.location?.country || null,
          }),
          
          // Zeitstempel
          lastPing: combinedData.last_ping ? new Date(combinedData.last_ping * 1000) : null,
          lastVend: combinedData.last_vend ? new Date(combinedData.last_vend * 1000) : null,
          lastSync: new Date(),
          
          // Vollständiger Datensatz als JSON
          extraData: JSON.stringify(combinedData),
        };
        
        try {
          // Prüfen, ob die Maschine bereits existiert
          const existingMachine = await storage.getMachineByVendonId(vendonId);
          
          if (existingMachine) {
            // Aktualisiere bestehende Maschine
            await storage.updateMachine(existingMachine.id, newMachine);
            itemsUpdated++;
          } else {
            // Erstelle neue Maschine
            await storage.createMachine(newMachine);
            itemsSaved++;
          }
        } catch (err) {
          console.error(`Fehler beim Speichern der Maschine ${vendonId}:`, err);
          errors++;
        }
      }
      
      // Berechne Statistiken
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      // Aktualisiere den Sync-Log-Eintrag mit Erfolgsstatistiken
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: machines.length,
        itemsSaved,
        itemsUpdated,
        duplicates,
        errors,
        durationSeconds,
        syncStatus: 'completed'
      });
      
      // Rückgabe des Ergebnisses
      return {
        syncLogId,
        status: 'success',
        message: `${machines.length} Maschinen synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${errors} Fehler`
      };
    } catch (error) {
      console.error("Fehler bei der Maschinensynchronisation:", error);
      
      // Aktualisiere den Sync-Log-Eintrag mit Fehlerinformationen
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      // Rückgabe des Fehlerstatus
      return {
        syncLogId,
        status: 'error',
        message: `Maschinensynchronisation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Synchronisiert Transaktionen
   */
  async syncTransactions(
    startDate?: Date,
    endDate?: Date,
    batchSize: number = 100,
    maxTransactions: number = 1000,
    preloadedData?: any // Optional vorgeladene API-Antwort
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Standardwerte für Start- und Enddatum, wenn nicht angegeben
    const effectiveStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 Tage zurück
    const effectiveEndDate = endDate || new Date();
    
    // Erstelle einen Sync-Log-Eintrag
    const syncLog: InsertSyncLog = {
      syncType: 'transactions',
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      syncStatus: 'running',
    };
    
    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;
    
    try {
      console.log(`Synchronisiere Transaktionen von ${this.formatDate(effectiveStartDate)} bis ${this.formatDate(effectiveEndDate)}`);
      const startTime = Date.now();
      
      // Zähler für die Synchronisation
      let page = 1;
      let totalItems = 0;
      let hasMoreTransactions = true;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      
      // Wenn vorgeladene Daten existieren, diese zuerst verarbeiten
      let transactions = [];
      if (preloadedData && preloadedData.result && Array.isArray(preloadedData.result)) {
        const preloadedTransactions = preloadedData.result;
        console.log(`Verarbeite ${preloadedTransactions.length} vorgeladene Transaktionen direkt`);
        totalItems += preloadedTransactions.length;

        // Einfaches Schema zur Verarbeitung der Transaktionen
        for (const transaction of preloadedTransactions) {
          try {
            // Sicherstellen, dass eine TransaktionsID vorhanden ist
            const transactionId = transaction.transaction_id;
            if (!transactionId) {
              console.error("Transaktion ohne ID übersprungen:", transaction);
              errors++;
              continue;
            }
            
            // Transaktions-ID in String-Format konvertieren
            const vendonId = transactionId.toString();
            
            // Verbesserte Duplikaterkennung
            // Prüft nur die Transaktion und nicht nur die vendonId
            const existingTransaction = await storage.getTransactionByVendonId(vendonId);
            if (existingTransaction) {
              // Bei manueller Synchronisierung werden manchmal Transaktionen fälschlicherweise als Duplikate erkannt
              // Zusätzliche Überprüfung des Datums, um sicherzustellen, dass es tatsächlich die gleiche Transaktion ist
              // Wenn das Datum genau identisch ist, handelt es sich um einen echten Duplikat
              const existingDate = existingTransaction.datetime.getTime();
              
              // Zeitstempel der aktuellen Transaktion verarbeiten
              const newDatetime = new Date(transaction.datetime * 1000);
              const newDate = newDatetime.getTime();
              
              if (existingDate === newDate) {
                duplicates++;
                continue;
              } else {
                // Wenn das Datum unterschiedlich ist, trotz gleicher ID, könnten es verschiedene Transaktionen sein
                // Hier gibt es 2 Möglichkeiten:
                // 1. Die vendonId wurde wiederverwendet (eher unwahrscheinlich)
                // 2. Es ist ein Fehler in der API (wahrscheinlicher)
                console.log(`Warnung: Transaktion mit ID ${vendonId} könnte ein Duplikat sein, hat aber ein anderes Datum. Alte: ${existingDate}, Neue: ${newDate}`);
                // Speichern mit modifizierter vendonId, um Duplikat zu vermeiden
                // Da wir vendonId nicht direkt ändern können (es ist eine Konstante), 
                // erstellen wir eine neue Variable mit der modifizierten ID
                const modifiedVendonId = `${vendonId}_${newDate}`;
                // Und verwenden diese modifizierte ID später
              }
            }
            
            // Maschine verarbeiten
            let machineId = 1; // Fallback
            if (transaction.machine_id) {
              const machineVendonId = transaction.machine_id.toString();
              let machineData = await storage.getMachineByVendonId(machineVendonId);
              
              if (!machineData) {
                // Einfach eine neue Maschine erstellen
                const newMachine: InsertMachine = {
                  vendonId: machineVendonId,
                  machineName: transaction.machine_name || `Maschine ${machineVendonId}`,
                  lastSync: new Date()
                };
                
                try {
                  machineData = await storage.createMachine(newMachine);
                  machineId = machineData.id;
                } catch (machineError) {
                  console.error(`Fehler beim Erstellen der Maschine für ID ${machineVendonId}:`, machineError);
                  // Weiter mit Standard-ID
                }
              } else {
                machineId = machineData.id;
              }
            }
            
            // Produktnamen verwenden wenn vorhanden
            const productName = transaction.name || "Unbekanntes Produkt";
            
            // Zeitstempel verarbeiten
            const datetime = new Date(transaction.datetime * 1000);
            
            // Minimales Transaktionsobjekt erstellen - nur die wichtigsten Felder
            const simplifiedTransaction: InsertTransaction = {
              vendonId: vendonId,
              machineId: machineId,
              machineName: transaction.machine_name || "Unbekannt",
              datetime: datetime,
              productName: productName,
              price: transaction.price || 0,
              quantity: transaction.quantity || 1,
              paymentMethod: transaction.payment_method || "UNKNOWN",
              currency: transaction.currency || "EUR",
              status: "completed",
              source: "vendon_api",
              extraData: JSON.stringify(transaction)
            };
            
            // In die Datenbank speichern
            try {
              await storage.createTransaction(simplifiedTransaction);
              itemsSaved++;
              console.log(`Transaktion gespeichert: ID ${vendonId}, Produkt: ${productName}`);
            } catch (saveError) {
              console.error(`Fehler beim Speichern der Transaktion ${vendonId}:`, saveError);
              errors++;
            }
            
          } catch (processError) {
            console.error("Fehler bei der Verarbeitung einer Transaktion:", processError);
            errors++;
          }
        }
        
        // Status aktualisieren nach der Verarbeitung
        await storage.updateSyncLog(syncLogId, {
          itemsFound: totalItems,
          itemsSaved,
          duplicates,
          errors
        });
        
        // Vorgeladene Daten wurden verarbeitet, an die nächste Seite weitergehen
        transactions = preloadedTransactions;
      }
      
      // Solange es weitere Transaktionen gibt und wir das Maximum nicht erreicht haben
      while (hasMoreTransactions && totalItems < maxTransactions) {
        // Überspringe die erste API-Anfrage, wenn bereits vorgeladene Daten verarbeitet wurden
        if (page === 1 && transactions.length > 0) {
          page++;
          continue;
        }
        
        console.log(`Hole Transaktionen, Seite ${page} mit Batchgröße ${batchSize}`);
        
        // Berechne den verbleibenden Limit für diese Anfrage
        const remainingLimit = Math.min(batchSize, maxTransactions - totalItems);
        
        // Hole Transaktionen von der API
        const result = await this.api.getTransactions(
          effectiveStartDate,
          effectiveEndDate,
          undefined, // keine Maschinen-ID-Filterung
          (page - 1) * batchSize, // Offset
          remainingLimit // Limit
        );
        
        transactions = result.data;
        
        if (!transactions || transactions.length === 0) {
          // Keine weiteren Transaktionen
          hasMoreTransactions = false;
          break;
        }
        
        console.log(`${transactions.length} Transaktionen auf Seite ${page} gefunden`);
        totalItems += transactions.length;
        
        // Verarbeite jede Transaktion
        for (const transaction of transactions) {
          try {
            // Prüfe, ob die Transaktion eine ID hat (entweder id oder transaction_id)
            const transactionId = transaction.id || transaction.transaction_id;
            if (!transactionId) {
              console.error("Transaktion ohne ID übersprungen:", transaction);
              errors++;
              continue;
            }
            
            // Prüfe, ob die Maschine existiert
            let machineId: number;
            if (transaction.machine_id) {
              const machineVendonId = transaction.machine_id.toString();
              let machineData = await storage.getMachineByVendonId(machineVendonId);
              
              if (!machineData) {
                // Erstelle einen minimalen Maschinendatensatz, wenn er nicht existiert
                const newMachine: InsertMachine = {
                  vendonId: machineVendonId,
                  machineName: transaction.machine_name || `Maschine ${machineVendonId}`,
                  lastSync: new Date()
                };
                machineData = await storage.createMachine(newMachine);
              }
              
              machineId = machineData.id;
            } else {
              console.warn(`Transaktion ${transactionId} hat keine Maschinen-ID. Verwende Standardwert.`);
              machineId = 1; // Standardwert, wenn keine Maschinen-ID vorhanden ist
            }
            
            // Datetime aus verschiedenen möglichen Formaten konvertieren
            let transactionDate: Date;
            if (transaction.datetime) {
              if (typeof transaction.datetime === 'number') {
                // Unix-Timestamp (Sekunden oder Millisekunden)
                transactionDate = new Date(
                  transaction.datetime > 1577836800000 // Wenn > 01.01.2020 in Millisekunden
                    ? transaction.datetime // Ist bereits in Millisekunden
                    : transaction.datetime * 1000 // Konvertiere Sekunden zu Millisekunden
                );
              } else {
                // String-Datum
                transactionDate = new Date(transaction.datetime);
              }
            } else {
              console.warn(`Transaktion ${transactionId} hat kein Datum. Verwende aktuelles Datum.`);
              transactionDate = new Date();
            }
            
            // JSON-Daten aus extraData extrahieren, falls vorhanden
            const extraDataStr = transaction.extraData || transaction.extra_data;
            const extraDataObj = extraDataStr
              ? (typeof extraDataStr === 'string' ? JSON.parse(extraDataStr) : extraDataStr)
              : {};
              
            // Finde den ursprünglichen Produktnamen - er kann in verschiedenen Feldern sein
            let productId = null;
            let productName = null;
            
            // WICHTIG: Bei der Vendon API kommt der Produktname primär direkt im 'name'-Feld
            // Wir priorisieren dies als erste Quelle
            if (transaction.name) {
              productName = transaction.name;
              console.log(`Produktname direkt aus transaction.name: "${productName}"`);
            }
            
            // Versuche, die Produkt-ID zu extrahieren
            if (transaction.product_id) {
              productId = transaction.product_id.toString();
            } else if (transaction.product && transaction.product.id) {
              productId = transaction.product.id.toString();
            } else if (extraDataObj.product_id) {
              productId = extraDataObj.product_id.toString();
            } else if (extraDataObj.product && extraDataObj.product.id) {
              productId = extraDataObj.product.id.toString();
            }
            
            // Falls wir noch keinen Namen haben, versuche andere Felder
            if (!productName) {
              if (transaction.product_name) {
                productName = transaction.product_name;
                console.log(`Produktname aus transaction.product_name: "${productName}"`);
              } else if (transaction.product && transaction.product.name) {
                productName = transaction.product.name;
                console.log(`Produktname aus transaction.product.name: "${productName}"`);
              } else if (extraDataObj.product_name) {
                productName = extraDataObj.product_name;
                console.log(`Produktname aus extraDataObj.product_name: "${productName}"`);
              } else if (extraDataObj.product && extraDataObj.product.name) {
                productName = extraDataObj.product.name;
                console.log(`Produktname aus extraDataObj.product.name: "${productName}"`);
              } else if (extraDataObj.name) {
                productName = extraDataObj.name;
                console.log(`Produktname aus extraDataObj.name: "${productName}"`);
              }
            }
            
            // Hole detaillierte Produktinformationen über den stock_id Endpunkt, wenn vorhanden
            const stockId = transaction.stock_id || extraDataObj.stock_id;
            if (stockId && !productName) {
              try {
                console.log(`Hole Produktdetails für stock_id ${stockId}...`);
                const machineId = transaction.machine_id ? transaction.machine_id.toString() : null;
                
                if (machineId) {
                  const stockData = await this.api.getMachineStock(machineId);
                  
                  if (stockData && Array.isArray(stockData)) {
                    // Finde das Produkt mit der passenden stock_id
                    const stockItem = stockData.find(item => item.id?.toString() === stockId.toString());
                    
                    if (stockItem) {
                      if (stockItem.product) {
                        if (!productId && stockItem.product.id) {
                          productId = stockItem.product.id.toString();
                        }
                        if (!productName && stockItem.product.name) {
                          productName = stockItem.product.name;
                        }
                      } else if (stockItem.name) {
                        productName = stockItem.name;
                      }
                    }
                  }
                }
              } catch (error) {
                console.error(`Fehler beim Abrufen von Produktdetails für stock_id ${stockId}:`, error);
              }
            }
            
            // Wenn immer noch kein Produktname gefunden wurde, verwende das Standard-Fallback
            if (!productName) {
              productName = 'Unbekanntes Produkt';
              console.warn(`Kein Produktname für Transaktion ${transaction.id || ''} gefunden. Verwende '${productName}'`);
            }
              
            // Extrahiere alle verfügbaren Daten aus dem Transaction-Objekt oder aus extraData
            const vendonId = (transaction.id || transaction.transaction_id || extraDataObj.transaction_id || extraDataObj.id).toString();
            const machineNameValue = transaction.machine_name || extraDataObj.machine_name || 'Unbekannte Maschine';
            
            // Extrahiere Preisdaten
            const priceValue = transaction.price || extraDataObj.price || 0;
            const priceVatValue = transaction.price_vat || extraDataObj.price_vat || null;
            const priceWoVatValue = transaction.price_wo_vat || extraDataObj.price_wo_vat || null;
            const vatValue = transaction.vat || extraDataObj.vat || null;
            
            // Extrahiere wichtige Zeitstempel
            // transaction_dt und registered_dt sind oft in extraData vorhanden
            const transactionDt = extraDataObj.transaction_dt 
              ? new Date(extraDataObj.transaction_dt * 1000) 
              : null;
            const registeredDt = extraDataObj.registered_dt 
              ? new Date(extraDataObj.registered_dt * 1000) 
              : null;
            const updatedAt = extraDataObj.updated_at 
              ? new Date(extraDataObj.updated_at * 1000) 
              : null;
              
            // Extrahiere Produktinformationen
            // name in extraData ist oft der echte Produktname
            const productNameValue = productName || extraDataObj.name || 'Unbekanntes Produkt';
            const selectionValue = transaction.selection || extraDataObj.selection || null;
            const stockIdValue = transaction.stock_id || extraDataObj.stock_id || null;
            
            // Zahlungsinformationen
            const paymentMethodValue = transaction.payment_method || extraDataObj.payment_method || null;
            const currencyValue = transaction.currency || extraDataObj.currency || null;
            const discountCodeValue = transaction.discount_code || extraDataObj.discount_code || null;
            const discountAmountValue = transaction.discount_amount || extraDataObj.discount_amount || null;
            const statusValue = transaction.status || extraDataObj.status || null;
            
            // Zusätzliche Metadaten
            const noteValue = transaction.note || extraDataObj.note || null;
            const transactionDataValue = transaction.transaction_data || extraDataObj.transaction_data || null;
            const metadataValue = transaction.metadata || extraDataObj.metadata || null;
              
            // Erstelle das vollständige Transaktionsobjekt
            const newTransaction: InsertTransaction = {
              vendonId: vendonId,
              machineId: machineId,
              machineName: machineNameValue,
              datetime: transactionDate,
              transactionDt: transactionDt, 
              registeredDt: registeredDt,
              updatedAt: updatedAt,
              amount: transaction.amount || 0,
              price: priceValue,
              priceVat: priceVatValue,
              priceWoVat: priceWoVatValue,
              vat: vatValue,
              quantity: transaction.quantity || extraDataObj.quantity || 1,
              productId: productId,
              productName: productNameValue,
              stockId: stockIdValue,
              selection: selectionValue,
              // Nur paymentMethod verwenden, paymentType existiert nicht mehr im Schema
              paymentMethod: paymentMethodValue,
              status: statusValue,
              currency: currencyValue,
              coinCredit: transaction.coin_credit || 0,
              cardCredit: transaction.card_credit || 0,
              cashlessCredit: transaction.cashless_credit || 0,
              discountCode: discountCodeValue,
              discountAmount: discountAmountValue,
              // Setze locationId auf null, um FK-Constraint-Fehler zu vermeiden
              locationId: null, // war: transaction.location_id ? transaction.location_id.toString() : null,
              locationName: transaction.location_name || null,
              note: noteValue,
              transactionData: transactionDataValue ? JSON.stringify(transactionDataValue) : null,
              metadata: metadataValue ? JSON.stringify(metadataValue) : null,
              source: extraDataObj.source || transaction.source || "vendon",
              isTest: transaction.is_test === true,
              extraData: JSON.stringify(transaction)
            };
            
            // Prüfe, ob die Transaktion bereits existiert
            // Stellen Sie sicher, dass vendonId nicht undefined ist
            if (newTransaction.vendonId) {
              const existingTransaction = await storage.getTransactionByVendonId(newTransaction.vendonId);
              
              if (existingTransaction) {
                // Bei manueller Synchronisierung werden manchmal Transaktionen fälschlicherweise als Duplikate erkannt
                // Zusätzliche Überprüfung des Datums, um sicherzustellen, dass es tatsächlich die gleiche Transaktion ist
                const existingDate = existingTransaction.datetime.getTime();
                const newDate = newTransaction.datetime.getTime();
                
                if (existingDate === newDate) {
                  // Überspringe nur echte Duplikate (gleiche ID UND gleiches Datum)
                  duplicates++;
                } else {
                  // Wenn das Datum unterschiedlich ist, trotz gleicher ID, könnten es verschiedene Transaktionen sein
                  console.log(`Warnung: Transaktion mit ID ${newTransaction.vendonId} könnte ein Duplikat sein, hat aber ein anderes Datum. Alte: ${existingDate}, Neue: ${newDate}`);
                  // Speichern mit modifizierter vendonId, um Duplikat zu vermeiden
                  const modifiedTransaction = {
                    ...newTransaction,
                    vendonId: `${newTransaction.vendonId}_${newDate}`
                  };
                  await storage.createTransaction(modifiedTransaction);
                  itemsSaved++;
                }
              } else {
                // Speichere neue Transaktion
                await storage.createTransaction(newTransaction);
                itemsSaved++;
              }
            } else {
              console.error("Transaktion konnte nicht gespeichert werden, weil die vendonId fehlt");
              errors++;
            }
          } catch (transactionError) {
            console.error(`Fehler bei der Verarbeitung von Transaktion:`, transactionError);
            errors++;
          }
        }
        
        // Prüfe, ob wir alle Transaktionen erhalten haben
        hasMoreTransactions = transactions.length === batchSize && totalItems < maxTransactions;
        page++;
        
        // Aktualisiere den Sync-Log mit dem bisherigen Fortschritt
        await storage.updateSyncLog(syncLogId, {
          itemsFound: totalItems,
          itemsSaved,
          itemsUpdated,
          duplicates,
          errors
        });
      }
      
      // Berechne die Gesamtdauer
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      // Aktualisiere den Sync-Log mit dem Endergebnis
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: totalItems,
        itemsSaved,
        itemsUpdated,
        duplicates,
        errors,
        durationSeconds,
        syncStatus: 'completed'
      });
      
      // Rückgabe des Ergebnisses
      return {
        syncLogId,
        status: 'success',
        message: `${totalItems} Transaktionen synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate, ${errors} Fehler`
      };
    } catch (error) {
      console.error("Fehler bei der Transaktionssynchronisation:", error);
      
      // Aktualisiere den Sync-Log mit dem Fehler
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      // Rückgabe des Fehlerstatus
      return {
        syncLogId,
        status: 'error',
        message: `Transaktionssynchronisation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Synchronisiert Events (Ereignisse)
   */
  async syncEvents(
    startDate?: Date,
    endDate?: Date,
    batchSize: number = 100
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Standardwerte für Start- und Enddatum, wenn nicht angegeben
    const effectiveStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 Tage zurück
    const effectiveEndDate = endDate || new Date();
    
    // Erstelle einen Sync-Log-Eintrag
    const syncLog: InsertSyncLog = {
      syncType: 'events',
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      syncStatus: 'running',
    };
    
    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;
    
    try {
      console.log(`Synchronisiere Ereignisse von ${this.formatDate(effectiveStartDate)} bis ${this.formatDate(effectiveEndDate)}`);
      const startTime = Date.now();
      
      // Zähler für die Synchronisation
      let page = 1;
      let totalItems = 0;
      let hasMoreEvents = true;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      
      // Solange es weitere Ereignisse gibt
      while (hasMoreEvents) {
        console.log(`Hole Ereignisse, Seite ${page} mit Batchgröße ${batchSize}`);
        
        // Hole Ereignisse von der API
        const result = await this.api.getEvents(
          effectiveStartDate,
          effectiveEndDate,
          undefined, // keine Maschinen-ID-Filterung
          (page - 1) * batchSize, // Offset
          batchSize // Limit
        );
        
        const events = result.data;
        
        if (!events || events.length === 0) {
          // Keine weiteren Ereignisse
          hasMoreEvents = false;
          break;
        }
        
        console.log(`${events.length} Ereignisse auf Seite ${page} gefunden`);
        totalItems += events.length;
        
        // Verarbeite jedes Ereignis
        for (const event of events) {
          try {
            // Prüfe, ob das Ereignis eine ID hat
            if (!event.id) {
              console.error("Ereignis ohne ID übersprungen:", event);
              errors++;
              continue;
            }
            
            // Prüfe, ob die Maschine existiert
            let machineId: number | null = null;
            if (event.machine_id || event.machine?.id) {
              const machineVendonId = (event.machine_id || event.machine?.id).toString();
              let machineData = await storage.getMachineByVendonId(machineVendonId);
              
              if (!machineData) {
                // Erstelle einen minimalen Maschinendatensatz, wenn er nicht existiert
                const newMachine: InsertMachine = {
                  vendonId: machineVendonId,
                  machineName: event.machine_name || event.machine?.name || `Maschine ${machineVendonId}`,
                  lastSync: new Date()
                };
                machineData = await storage.createMachine(newMachine);
              }
              
              machineId = machineData.id;
            }
            
            // Datetime aus verschiedenen möglichen Formaten konvertieren
            let eventDate: Date;
            if (event.datetime) {
              if (typeof event.datetime === 'number') {
                // Unix-Timestamp (Sekunden oder Millisekunden)
                eventDate = new Date(
                  event.datetime > 1577836800000 // Wenn > 01.01.2020 in Millisekunden
                    ? event.datetime // Ist bereits in Millisekunden
                    : event.datetime * 1000 // Konvertiere Sekunden zu Millisekunden
                );
              } else {
                // String-Datum
                eventDate = new Date(event.datetime);
              }
            } else if (event.timestamp) {
              // Falls datetime nicht vorhanden, aber timestamp
              if (typeof event.timestamp === 'number') {
                eventDate = new Date(
                  event.timestamp > 1577836800000 // Wenn > 01.01.2020 in Millisekunden
                    ? event.timestamp // Ist bereits in Millisekunden
                    : event.timestamp * 1000 // Konvertiere Sekunden zu Millisekunden
                );
              } else {
                // String-Timestamp
                eventDate = new Date(event.timestamp);
              }
            } else {
              console.warn(`Ereignis ${event.id} hat kein Datum. Verwende aktuelles Datum.`);
              eventDate = new Date();
            }
            
            // Resolved_at aus verschiedenen möglichen Formaten konvertieren
            let resolvedAt: Date | null = null;
            if (event.resolved_at) {
              if (typeof event.resolved_at === 'number') {
                // Unix-Timestamp (Sekunden oder Millisekunden)
                resolvedAt = new Date(
                  event.resolved_at > 1577836800000 // Wenn > 01.01.2020 in Millisekunden
                    ? event.resolved_at // Ist bereits in Millisekunden
                    : event.resolved_at * 1000 // Konvertiere Sekunden zu Millisekunden
                );
              } else if (event.resolved_at !== null) {
                // String-Datum
                try {
                  resolvedAt = new Date(event.resolved_at);
                  if (isNaN(resolvedAt.getTime())) {
                    resolvedAt = null;
                  }
                } catch {
                  resolvedAt = null;
                }
              }
            }
            
            // Erstelle die Ereignisdaten
            const newEvent: InsertEvent = {
              vendonId: event.id.toString(),
              machineId: machineId,
              machineName: event.machine_name || event.machine?.name || 'Unbekannte Maschine',
              datetime: eventDate,
              resolvedAt: resolvedAt,
              eventType: event.type || event.event_type || 'unknown',
              eventName: event.name || event.event_name || 'Unbekanntes Ereignis',
              severity: event.severity || 'normal',
              description: event.description || event.message || null,
              // Setze locationId auf null, um FK-Constraint-Fehler zu vermeiden
              locationId: null, // war: event.location_id || event.machine?.location_id || null,
              extraData: JSON.stringify(event)
            };
            
            // Prüfe, ob das Ereignis bereits existiert
            const existingEvent = await storage.getEventByVendonId(newEvent.vendonId);
            
            if (existingEvent) {
              // Aktualisiere, wenn z.B. resolvedAt geändert wurde
              await storage.updateEvent(existingEvent.id, newEvent);
              itemsUpdated++;
            } else {
              // Speichere neues Ereignis
              await storage.createEvent(newEvent);
              itemsSaved++;
            }
          } catch (eventError) {
            console.error(`Fehler bei der Verarbeitung von Ereignis:`, eventError);
            errors++;
          }
        }
        
        // Prüfe, ob wir alle Ereignisse erhalten haben
        hasMoreEvents = events.length === batchSize;
        page++;
        
        // Aktualisiere den Sync-Log mit dem bisherigen Fortschritt
        await storage.updateSyncLog(syncLogId, {
          itemsFound: totalItems,
          itemsSaved,
          itemsUpdated,
          duplicates,
          errors
        });
      }
      
      // Berechne die Gesamtdauer
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      // Aktualisiere den Sync-Log mit dem Endergebnis
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        durationSeconds,
        syncStatus: 'completed'
      });
      
      // Rückgabe des Ergebnisses
      return {
        syncLogId,
        status: 'success',
        message: `${totalItems} Ereignisse synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate, ${errors} Fehler`
      };
    } catch (error) {
      console.error("Fehler bei der Ereignissynchronisation:", error);
      
      // Aktualisiere den Sync-Log mit dem Fehler
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      // Rückgabe des Fehlerstatus
      return {
        syncLogId,
        status: 'error',
        message: `Ereignissynchronisation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Synchronisiere Refills (Auffüllungen)
  async syncRefills(
    startDate?: Date,
    endDate?: Date,
    batchSize: number = 100
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Startdatum (letzte 30 Tage) und Enddatum (jetzt) definieren
    const effectiveStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate || new Date();
    
    // Sync-Log-Eintrag mit Status "running" erstellen
    const syncLog: InsertSyncLog = {
      syncType: 'refills',
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      // Da wir die API-Struktur jetzt verstehen, vereinfachen wir den Code
      console.log(`Synchronisiere Refills von ${effectiveStartDate.toISOString()} bis ${effectiveEndDate.toISOString()}`);
      const startTime = Date.now();
      
      // Statistik-Variablen
      let itemsFound = 0;
      let itemsSaved = 0;
      let duplicates = 0;
      let errors = 0;
      let detailsSaved = 0;
      
      // Refills von der API abrufen
      const result = await this.api.getRefills(
        effectiveStartDate,
        effectiveEndDate,
        1, // Erste Seite
        500 // Größere Batch-Größe für die meisten Refills
      );
      
      if (!result.data) {
        throw new Error("API hat keine Refills zurückgegeben");
      }
      
      const refills = result.data;
      itemsFound = refills.length;
      console.log(`${refills.length} Refills gefunden`);
      
      // Jeden Refill verarbeiten
      for (const refill of refills) {
        try {
          // 1. Beziehe die Maschinen-ID aus relation_id (nicht machine_id)
          const machineVendonId = refill.relation_id?.toString();
          
          if (!machineVendonId) {
            console.warn(`Refill ${refill.id} hat keine relation_id`);
            errors++;
            continue;
          }
          
          // 2. Suche oder erstelle die Maschine
          let machineId: number;
          const machineData = await storage.getMachineByVendonId(machineVendonId);
          
          if (!machineData) {
            // Erstelle einen minimalen Maschinendatensatz
            const newMachine: InsertMachine = {
              vendonId: machineVendonId,
              machineName: refill.relation_name || `Automat ${machineVendonId}`,
              lastSync: new Date()
            };
            
            const createdMachine = await storage.createMachine(newMachine);
            machineId = createdMachine.id;
          } else {
            machineId = machineData.id;
          }
          
          // 3. Konvertiere refill_date in ein Date-Objekt (in Sekunden)
          let timestamp: Date;
          if (typeof refill.refill_date === 'number') {
            // In Sekunden zu Millisekunden konvertieren
            timestamp = new Date(refill.refill_date * 1000);
          } else {
            // Fallback: Aktuelles Datum verwenden
            console.warn(`Refill ${refill.id} hat kein gültiges refill_date`);
            timestamp = new Date();
          }
          
          // 4. Erstelle den Refill-Datensatz
          const refillData: InsertRefill = {
            vendonId: refill.id.toString(),
            machineId: machineId,
            machineName: refill.relation_name || "Unbekannter Automat",
            datetime: timestamp,
            operator: refill.refiller || '',
            status: 'completed',
            refillType: refill.refill_type || refill.type || '',
            // Setze locationId auf null, um FK-Constraint-Fehler zu vermeiden
            locationId: null, // war: refill.relation_location_id || null,
            extraData: JSON.stringify(refill),
            processStatus: 'pending'
          };
          
          // 5. Prüfe auf Duplikate
          const existingRefill = await storage.getRefillByVendonId(refillData.vendonId);
          
          if (existingRefill) {
            duplicates++;
            continue;
          }
          
          // 6. Speichere den Refill
          const savedRefill = await storage.createRefill(refillData);
          itemsSaved++;
          
          // 7. Hole und speichere die Details (wenn verfügbar)
          try {
            const details = await this.api.getRefillDetails(refillData.vendonId);
            
            if (Array.isArray(details)) {
              for (const detail of details) {
                // Debugging-Log für Details
                console.log(`Refill-Detail für ${refillData.vendonId}, Produkt: ${detail.name || 'Unbekannt'}`, 
                  detail.added !== undefined ? `hinzugefügt: ${detail.added}` : '',
                  detail.removed !== undefined ? `entfernt: ${detail.removed}` : '');
                
                // Ermittle die Werte für added und removed
                const added = typeof detail.added === 'number' ? detail.added : 0;
                const removed = typeof detail.removed === 'number' ? detail.removed : 0;
                
                // Berechne die Gesamtmenge (kann positiv oder negativ sein)
                const quantity = added - removed;
                
                await storage.createRefillDetail({
                  refillId: savedRefill.id,
                  productName: detail.name || 'Unbekanntes Produkt',
                  quantity: quantity, // Nettoveränderung (kann negativ sein)
                  datetime: timestamp,
                  vendonProductId: detail.stock_id?.toString() || null,
                  // Neue Felder für added und removed
                  added: added,
                  removed: removed,
                  // Speichere zusätzliche Informationen im extraData-Feld
                  extraData: JSON.stringify(detail)
                });
                
                detailsSaved++;
              }
            }
          } catch (detailError) {
            console.error(`Fehler beim Abrufen der Details für Refill ${refillData.vendonId}:`, detailError);
          }
        } catch (error) {
          errors++;
          console.error(`Fehler bei der Verarbeitung von Refill ${refill.id}:`, error);
        }
      }
      
      // Endergebnisse
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound,
        itemsSaved,
        duplicates,
        errors,
        durationSeconds,
        syncStatus: 'completed'
      });
      
      return {
        syncLogId,
        status: 'success',
        message: `${itemsFound} Refills synchronisiert: ${itemsSaved} neu, ${duplicates} Duplikate, ${errors} Fehler, ${detailsSaved} Details`
      };
    } catch (error) {
      // Fehlerbehandlung
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Fehler bei der Refill-Synchronisation:", error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage
      });
      
      return {
        syncLogId,
        status: 'error',
        message: `Refill-Synchronisation fehlgeschlagen: ${errorMessage}`
      };
    }
  }
  
  // Implementierung der fehlenden erforderlichen Methoden
  
  /**
   * Synchronisiert Lagerbestand (Stock) aller Automaten und Produkte
   */
  async syncStocks(): Promise<{ syncLogId: number; status: string; message: string }> {
    // Erstelle einen Sync-Log-Eintrag
    const syncLog: InsertSyncLog = {
      syncType: 'stocks',
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      console.log("Starte Lagerbestand-Synchronisierung...");
      const startTime = Date.now();
      
      // Schritt A: Allgemeine Stock-Produkte abrufen
      console.log("Hole allgemeine Stock-Produkte...");
      const stockProducts = await this.api.getStockProducts();
      
      // Zähler für Stock-Synchronisation
      let stockItemsSaved = 0;
      let stockItemsUpdated = 0;
      let stockDuplicates = 0;
      let stockErrors = 0;
      
      if (stockProducts && stockProducts.length > 0) {
        console.log(`${stockProducts.length} Stock-Produkte von der API erhalten.`);
        
        // Hole bestehende Stock-Einträge
        const existingStocks = await storage.getStocks(0); // Kein Limit
        const existingStocksMap: Record<string, Stock> = {};
        
        // Erstelle eine Map für schnelle Suche
        existingStocks.forEach(stock => {
          if (stock.vendonId) {
            existingStocksMap[stock.vendonId] = stock;
          }
        });
        
        // Verarbeite jeden Stock-Datensatz
        for (const stockProduct of stockProducts) {
          try {
            if (!stockProduct.id) {
              console.warn("Stock-Produkt ohne ID übersprungen");
              continue;
            }
            
            const vendonId = stockProduct.id.toString();
            const existingStock = existingStocksMap[vendonId];
            
            // Extrahiere Stock-Daten aus dem API-Objekt
            const stockData: InsertStock = {
              vendonId: vendonId,
              productName: stockProduct.name || "Unbenanntes Stock-Produkt",
              description: stockProduct.category || null,
              status: stockProduct.status || "active",
              price: stockProduct.price || null,
              vat: stockProduct.vat || null,
              amountMax: stockProduct.amount_max || null,
              amountStandard: stockProduct.amount_standard || null,
              amountCritical: stockProduct.amount_critical || null,
              refillUnitSize: stockProduct.refill_unit_size || null,
              depositPrice: stockProduct.deposit_price || null,
              depositVat: stockProduct.deposit_vat || null,
              sku: stockProduct.sku || null,
              barcode: stockProduct.barcode || null,
              rawData: JSON.stringify(stockProduct)
            };
            
            if (existingStock) {
              // Aktualisiere nur, wenn sich die Daten geändert haben
              await storage.updateStock(existingStock.id, stockData);
              stockItemsUpdated++;
            } else {
              // Neuer Stock-Eintrag
              await storage.createStock(stockData);
              stockItemsSaved++;
            }
          } catch (error) {
            console.error(`Fehler bei der Verarbeitung des Stock-Produkts ${stockProduct.id || 'unknown'}:`, error);
            stockErrors++;
          }
        }
      } else {
        console.warn("Keine Stock-Produkte von der API erhalten");
      }
      
      // Schritt B: Maschinen-spezifische Bestände abrufen
      console.log("Hole Maschinen für Lagerbestand-Synchronisierung...");
      const machines = await this.api.getMachines();
      
      // Zähler für Machine-Stock-Synchronisation
      let machineStockItemsSaved = 0;
      let machineStockItemsUpdated = 0;
      let machineStockDuplicates = 0;
      let machineStockErrors = 0;
      
      if (machines && machines.length > 0) {
        console.log(`${machines.length} Maschinen gefunden. Hole Lagerbestände...`);
        
        // Für jede Maschine den Lagerbestand abrufen
        for (const machine of machines) {
          try {
            console.log(`Hole Lagerbestand für Maschine ${machine.id} (${machine.name || 'Unbekannt'})`);
            const machineStock = await this.api.getMachineStock(machine.id.toString());
            
            if (machineStock && Array.isArray(machineStock) && machineStock.length > 0) {
              console.log(`${machineStock.length} Lagerbestandseinträge für Maschine ${machine.id} gefunden`);
              
              // Hole bestehende Machine-Stock-Einträge für diese Maschine
              const machineDbRecord = await storage.getMachineByVendonId(machine.id.toString());
              
              if (!machineDbRecord) {
                console.warn(`Keine Maschineneinträge in der Datenbank für Vendon-ID ${machine.id}, überspringe...`);
                continue;
              }
              
              const existingMachineStocks = await storage.getMachineStocks(machineDbRecord.id);
              const existingMachineStocksMap: Record<string, MachineStock> = {};
              
              // Erstelle eine Map für schnelle Suche (Key: productVendonId + selectionNumber)
              existingMachineStocks.forEach(stock => {
                const key = `${stock.productVendonId}-${stock.selectionNumber}`;
                existingMachineStocksMap[key] = stock;
              });
              
              // Verarbeite jeden Maschinen-Lagerbestandseintrag
              for (const stockItem of machineStock) {
                try {
                  // Extrahiere Produkt-ID und Auswahlnummer
                  let productVendonId = "unknown";
                  if (stockItem.product && stockItem.product.id) {
                    productVendonId = stockItem.product.id.toString();
                  }
                  
                  const selectionNumber = stockItem.selection?.toString() || "unknown";
                  const key = `${productVendonId}-${selectionNumber}`;
                  const existingMachineStock = existingMachineStocksMap[key];
                  
                  // Extrahiere Maschinen-Stock-Daten
                  const machineStockData: InsertMachineStock = {
                    machineId: machineDbRecord.id,
                    machineVendonId: machine.id.toString(),
                    productVendonId: productVendonId,
                    selectionNumber: selectionNumber,
                    quantity: stockItem.quantity || 0,
                    status: stockItem.status || "active",
                    lastFilled: stockItem.last_filled ? new Date(stockItem.last_filled * 1000) : null,
                    rawData: JSON.stringify(stockItem),
                    lastSync: new Date()
                  };
                  
                  if (existingMachineStock) {
                    // Aktualisiere bestehenden Maschinen-Lagerbestand
                    await storage.updateMachineStock(existingMachineStock.id, machineStockData);
                    machineStockItemsUpdated++;
                  } else {
                    // Neuer Maschinen-Lagerbestandseintrag
                    await storage.createMachineStock(machineStockData);
                    machineStockItemsSaved++;
                  }
                } catch (itemError) {
                  console.error(`Fehler bei der Verarbeitung eines Maschinen-Lagerbestandseintrags:`, itemError);
                  machineStockErrors++;
                }
              }
            } else {
              console.warn(`Kein Lagerbestand für Maschine ${machine.id} gefunden oder ungültiges Format`);
            }
          } catch (machineError) {
            console.error(`Fehler beim Abrufen des Lagerbestands für Maschine ${machine.id}:`, machineError);
            machineStockErrors++;
          }
        }
      } else {
        console.warn("Keine Maschinen für Lagerbestand-Synchronisierung gefunden");
      }
      
      // Berechne die Dauer der Synchronisierung
      const durationSeconds = (Date.now() - startTime) / 1000;
      
      // Gesamtstatistiken
      const totalItemsFound = (stockProducts?.length || 0) + (machines?.length || 0);
      const totalItemsSaved = stockItemsSaved + machineStockItemsSaved;
      const totalItemsUpdated = stockItemsUpdated + machineStockItemsUpdated;
      const totalDuplicates = stockDuplicates + machineStockDuplicates;
      const totalErrors = stockErrors + machineStockErrors;
      
      // Aktualisiere den Sync-Log mit den Ergebnissen
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: totalItemsFound,
        itemsSaved: totalItemsSaved,
        itemsUpdated: totalItemsUpdated,
        duplicates: totalDuplicates,
        errors: totalErrors,
        durationSeconds,
        syncStatus: 'completed'
      });
      
      const message = `Lagerbestand-Synchronisierung abgeschlossen: 
        Stock-Produkte: ${stockItemsSaved} neue, ${stockItemsUpdated} aktualisiert, ${stockErrors} Fehler
        Maschinen-Lagerbestände: ${machineStockItemsSaved} neue, ${machineStockItemsUpdated} aktualisiert, ${machineStockErrors} Fehler
        Dauer: ${durationSeconds.toFixed(2)}s.`;
      console.log(message);
      
      return {
        syncLogId,
        status: 'success',
        message
      };
    } catch (error) {
      console.error("Fehler bei der Lagerbestand-Synchronisierung:", error);
      
      // Aktualisiere den Sync-Log mit dem Fehler
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      return {
        syncLogId,
        status: 'error',
        message: `Lagerbestand-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  // Produkte synchronisieren
  async syncProducts(): Promise<{ syncLogId: number; status: string; message: string }> {
    // Erstelle einen Sync-Log-Eintrag
    const syncLog: InsertSyncLog = {
      syncType: 'products',
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      console.log("Starte erweiterte Produktsynchronisierung...");
      const startTime = Date.now();
      
      // Produkte von der API abrufen mit der verbesserten Methode
      const products = await this.api.getProducts();
      
      // Zähler für die Synchronisation
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      
      if (!products || products.length === 0) {
        throw new Error("Keine Produkte von der API erhalten");
      }
      
      console.log(`${products.length} Produkte von der API erhalten. Starte Verarbeitung...`);
      
      // Sammle vorhandene Produkte in einem einzigen Datenbankaufruf
      console.log("Hole bestehende Produkte aus der Datenbank...");
      const existingProducts = await storage.getProducts(0); // 0 means no limit
      const existingProductMap: Record<string, any> = {};
      
      // Erstelle eine Map für schnelle Suche
      // Verwende eine type assertion, da wir wissen, dass es ein Array ist
      (existingProducts as any[]).forEach(product => {
        existingProductMap[product.vendonId] = product;
      });
      
      // Type assertion für die Längenprüfung
      console.log(`${(existingProducts as any[]).length} bestehende Produkte in der Datenbank gefunden.`);
      
      // Verarbeite jeden Produkt-Datensatz einzeln, aber effizienter
      for (const product of products) {
        try {
          if (!product.id) {
            console.warn("Produkt ohne ID übersprungen");
            errors++;
            continue;
          }
          
          const vendonId = product.id.toString();
          
          // Verbesserte Produktnamenextraktion
          let productName = product.name;
          
          // Wenn kein Name vorhanden ist, versuche verschiedene Felder
          if (!productName && product.product_name) {
            productName = product.product_name;
          } else if (!productName && product.title) {
            productName = product.title;
          } else if (!productName && product.label) {
            productName = product.label;
          } else if (!productName) {
            // Fallback
            productName = `Produkt ${vendonId}`;
          }
          
          // Extrahiere Produktdaten mit mehr Informationen
          const productData = {
            vendonId,
            productName: productName,
            price: product.price || 0,
            status: product.status || 'active',
            sku: product.sku || product.code || null,
            barcode: product.barcode || product.code || null,
            // Felder aus dem extraData-Feld können später extrahiert werden
            extraData: JSON.stringify(product)
          };
          
          // Prüfe, ob das Produkt bereits existiert anhand der Map (nicht DB-Abfrage für jedes Produkt)
          const existing = existingProductMap[vendonId];
          
          if (existing) {
            // Update vorhandenes Produkt
            await storage.updateProduct(existing.id, productData);
            itemsUpdated++;
          } else {
            // Erstelle neues Produkt
            await storage.createProduct(productData);
            itemsSaved++;
          }
        } catch (error) {
          console.error(`Fehler bei der Verarbeitung des Produkts:`, error);
          errors++;
        }
      }
      
      // Berechne Gesamtdauer
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      // Aktualisiere den Sync-Log-Eintrag
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: products.length,
        itemsSaved,
        itemsUpdated,
        duplicates,
        errors,
        durationSeconds,
        syncStatus: 'completed'
      });
      
      console.log(`Erweiterte Produktsynchronisierung abgeschlossen. ${itemsSaved} hinzugefügt, ${itemsUpdated} aktualisiert, ${errors} Fehler in ${durationSeconds} Sekunden.`);
      
      return {
        syncLogId,
        status: 'success',
        message: `${products.length} Produkte synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${errors} Fehler`
      };
    } catch (error) {
      console.error("Fehler bei der erweiterten Produktsynchronisierung:", error);
      
      // Aktualisiere den Sync-Log-Eintrag mit Fehlerinformationen
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      return {
        syncLogId,
        status: 'error',
        message: `Produktsynchronisation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  // Alle Daten synchronisieren
  async syncAll(): Promise<{ status: string; message: string; results: any }> {
    console.log("Starte vollständige Synchronisation aller Daten...");
    const results = {
      machines: await this.syncMachines(),
      products: await this.syncProducts(),
      transactions: await this.syncTransactions(),
      refills: await this.syncRefills(),
      events: await this.syncEvents(),
      stocks: await this.syncStocks()
    };
    
    // Prüfe, ob ein Fehler aufgetreten ist
    const hasErrors = Object.values(results).some(r => r.status === 'error');
    
    return {
      status: hasErrors ? 'partial' : 'success',
      message: hasErrors 
        ? 'Synchronisation teilweise fehlgeschlagen. Siehe Details für weitere Informationen.' 
        : 'Alle Daten erfolgreich synchronisiert.',
      results
    };
  }
  
  /**
   * Führt einen einzelnen Batch der historischen Synchronisierung durch
   * Diese Methode ruft einen Monat ab und aktualisiert den historischen Status
   * 
   * Verbesserter Algorithmus für die historische Synchronisierung:
   * 1. Korrekte Behandlung von UNIX-Zeitstempeln
   * 2. Übersichtliche Fortschrittsanzeige
   * 3. Robuste Fehlerbehandlung
   * 4. Effiziente Nutzung der stats/vends-API
   */
  async syncHistoricalBatch(): Promise<{ status: string; message: string; isComplete: boolean }> {
    // Wenn keine historische Synchronisierung läuft, starte eine neue
    if (!this.historicalSyncState.inProgress) {
      console.log("Starte neue historische Synchronisierung...");
      
      // Aktuelle Anzahl der Transaktionen ermitteln
      const transactionCount = await this.getTransactionCount();
      
      this.historicalSyncState = {
        inProgress: true,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth(),
        targetDate: new Date(2023, 0, 1), // Ziel: 1. Januar 2023
        startDate: new Date(), // Startdatum ist das aktuelle Datum
        batchSize: 200, // Erhöhte Batchgröße für schnellere Verarbeitung
        totalTransactions: transactionCount,
        completedMonths: [],
        processingStart: Date.now()
      };
    }
    
    try {
      // Prüfe, ob wir das Ziel bereits erreicht haben
      const currentDate = new Date(this.historicalSyncState.currentYear, this.historicalSyncState.currentMonth, 1);
      if (currentDate < this.historicalSyncState.targetDate) {
        console.log("Historische Synchronisierung abgeschlossen, Zieldatum erreicht.");
        this.historicalSyncState.inProgress = false;
        return {
          status: 'success',
          message: 'Historische Synchronisierung abgeschlossen (Zieldatum erreicht)',
          isComplete: true
        };
      }
      
      // Berechne Start- und Enddatum für diesen Batch
      const batchStartDate = new Date(this.historicalSyncState.currentYear, this.historicalSyncState.currentMonth, 1);
      // Letzter Tag des Monats (erster Tag des nächsten Monats minus 1ms)
      const batchEndDate = new Date(this.historicalSyncState.currentYear, this.historicalSyncState.currentMonth + 1, 0, 23, 59, 59, 999);
      
      console.log(`Synchronisiere historischen Batch für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}`);
      console.log(`Zeitraum: ${batchStartDate.toISOString()} bis ${batchEndDate.toISOString()}`);
      
      // Erstelle einen Sync-Log-Eintrag für diesen Batch
      const syncLog: InsertSyncLog = {
        syncType: 'historical_transactions',
        startDate: batchStartDate,
        endDate: batchEndDate,
        syncStatus: 'running',
        notes: `Historischer Batch für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}`
      };
      
      const logEntry = await storage.createSyncLog(syncLog);
      const syncLogId = logEntry.id;
      
      try {
        // Hole Transaktionen für diesen Monat von der API
        console.log(`Hole Transaktionen für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}`);
        
        // Verwende die verbesserte getTransactions-Methode mit korrekter UNIX-Zeitstempel-Konvertierung
        const result = await this.api.getTransactions(
          batchStartDate,
          batchEndDate,
          undefined, // keine Maschinen-ID-Filterung
          0, // Offset
          this.historicalSyncState.batchSize // Limit
        );
        
        // Wenn keine Transaktionen gefunden wurden
        if (!result.data || result.data.length === 0) {
          console.log(`Keine Transaktionen für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })} gefunden.`);
          
          // Aktualisiere den Sync-Log-Eintrag
          await storage.updateSyncLog(syncLogId, {
            endDate: new Date(),
            itemsFound: 0,
            itemsSaved: 0,
            duplicates: 0,
            syncStatus: 'completed',
            notes: `Keine Transaktionen für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })} gefunden.`
          });
        } else {
          // Transaktionen wurden gefunden
          console.log(`${result.data.length} Transaktionen für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })} gefunden.`);
          
          // Speichere die neuen Transaktionen in der Datenbank
          let savedCount = 0;
          let duplicateCount = 0;
          let errorCount = 0;
          
          for (const transaction of result.data) {
            try {
              // Extrahiere die notwendigen Felder aus der API-Antwort
              const vendonId = transaction.transaction_id?.toString() || '';
              if (!vendonId) {
                console.error(`Transaction ohne ID übersprungen:`, transaction);
                errorCount++;
                continue;
              }
              
              // Prüfe, ob die Transaktion bereits existiert
              const existingTransaction = await storage.getTransactionByVendonId(vendonId);
              if (existingTransaction) {
                // Transaktion existiert bereits, zähle als Duplikat
                duplicateCount++;
                continue;
              }
              
              // Extrahiere die Maschinen-ID
              const machineVendonId = transaction.machine_id?.toString() || '';
              let machineId = null;
              
              if (machineVendonId) {
                // Finde die Maschine in der Datenbank
                const machine = await storage.getMachineByVendonId(machineVendonId);
                if (machine) {
                  machineId = machine.id;
                } else {
                  // Wenn die Maschine nicht existiert, erstelle sie
                  const newMachine: InsertMachine = {
                    vendonId: machineVendonId,
                    machineName: transaction.machine_name || `Maschine ${machineVendonId}`,
                    lastSync: new Date()
                  };
                  const createdMachine = await storage.createMachine(newMachine);
                  machineId = createdMachine.id;
                }
              }
              
              // Extrahiere den Zeitstempel und konvertiere ihn in ein Date-Objekt
              const timestamp = transaction.datetime;
              let transactionDate: Date;
              
              if (typeof timestamp === 'number') {
                // Bei der Vendon API ist der Zeitstempel in Sekunden, nicht in Millisekunden
                transactionDate = new Date(timestamp * 1000);
              } else {
                // Fallback, falls der Zeitstempel nicht als Zahl vorliegt
                transactionDate = new Date();
                console.warn(`Unerwartetes Zeitstempel-Format für Transaktion ${vendonId}: ${timestamp}. Verwende aktuelles Datum.`);
              }
              
              // Erstelle das Transaktionsobjekt für die Datenbank
              const newTransaction: InsertTransaction = {
                vendonId,
                machineId,
                datetime: transactionDate,
                price: transaction.price || 0,
                productName: transaction.name || null,
                quantity: transaction.quantity || 1,
                paymentMethod: transaction.payment_method || null,
                extraData: JSON.stringify(transaction), // Speichern der vollständigen API-Antwort
                processingStatus: 'pending', // Wird später verarbeitet
                createdAt: new Date(),
                lastSync: new Date()
              };
              
              // Speichere die Transaktion in der Datenbank
              await storage.createTransaction(newTransaction);
              savedCount++;
              
            } catch (error) {
              console.error(`Fehler beim Speichern der Transaktion:`, error);
              errorCount++;
            }
          }
          
          // Aktualisiere den Sync-Log-Eintrag
          await storage.updateSyncLog(syncLogId, {
            endDate: new Date(),
            itemsFound: result.data.length,
            itemsSaved: savedCount,
            duplicates: duplicateCount,
            errors: errorCount,
            syncStatus: 'completed',
            notes: `Batch für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })} abgeschlossen: ${savedCount} neue Transaktionen, ${duplicateCount} Duplikate, ${errorCount} Fehler.`
          });
        }
        
        // Aktualisiere die Transaktionszahl
        this.historicalSyncState.totalTransactions = await this.getTransactionCount();
        
        // Füge den abgeschlossenen Monat zu den vollständig verarbeiteten Monaten hinzu
        const monthKey = `${this.historicalSyncState.currentYear}-${(this.historicalSyncState.currentMonth + 1).toString().padStart(2, '0')}`;
        if (!this.historicalSyncState.completedMonths.includes(monthKey)) {
          this.historicalSyncState.completedMonths.push(monthKey);
        }
        
        // Gehe zum vorherigen Monat für den nächsten Durchlauf
        this.historicalSyncState.currentMonth--;
        if (this.historicalSyncState.currentMonth < 0) {
          this.historicalSyncState.currentMonth = 11; // Dezember
          this.historicalSyncState.currentYear--;
        }
        
        // Erstelle eine statistische Zusammenfassung
        const monthsSyncedCount = this.historicalSyncState.completedMonths.length;
        const nextDate = new Date(this.historicalSyncState.currentYear, this.historicalSyncState.currentMonth, 1);
        
        return {
          status: 'success',
          message: `Historischer Batch für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })} abgeschlossen. Insgesamt ${this.historicalSyncState.totalTransactions} Transaktionen in ${monthsSyncedCount} Monaten. Nächster Batch: ${nextDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}`,
          isComplete: false
        };
      } catch (syncError) {
        // Fehler bei der Synchronisierung
        console.error(`Fehler bei der Synchronisierung für ${batchStartDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}:`, syncError);
        
        // Aktualisiere den Sync-Log-Eintrag mit dem Fehler
        await storage.updateSyncLog(syncLogId, {
          endDate: new Date(),
          syncStatus: 'error',
          errorMessage: syncError instanceof Error ? syncError.message : String(syncError)
        });
        
        throw syncError; // Wirf den Fehler weiter, damit er im äußeren catch-Block behandelt wird
      }
      
    } catch (error) {
      console.error("Fehler bei der historischen Batch-Synchronisierung:", error);
      
      // Setze die Synchronisierung zurück, damit sie beim nächsten Mal neu gestartet wird
      this.historicalSyncState.inProgress = false;
      
      return {
        status: 'error',
        message: `Historische Batch-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
        isComplete: false
      };
    }
  }
  
  // Status der Synchronisation abrufen
  async getSyncStatus(): Promise<{
    machines: { status: string; lastSync: number; count: number },
    products: { status: string; lastSync: number; count: number },
    transactions: { status: string; lastSync: number; count: number; latest: number },
    refills: { status: string; lastSync: number; count: number },
    events: { status: string; lastSync: number; count: number },
    stocks: { status: string; lastSync: number; count: number },
    historicalSync: { 
      inProgress: boolean; 
      currentDate: string; 
      targetDate: string; 
      progress: number;
      completedMonths: string[];
      totalTransactions: number;
      processingTimeMin: number;
    }
  }> {
    // Hole den letzten Sync-Log-Eintrag für jeden Typ
    const machinesSyncLog = await storage.getLatestSyncLog('machines');
    const productsSyncLog = await storage.getLatestSyncLog('products');
    const transactionsSyncLog = await storage.getLatestSyncLog('transactions');
    const refillsSyncLog = await storage.getLatestSyncLog('refills');
    const eventsSyncLog = await storage.getLatestSyncLog('events');
    const historicalSyncLog = await storage.getLatestSyncLog('historical_transactions');
    
    // Hole die Anzahl der Datensätze für jeden Typ
    const machines = await storage.getMachines(0); // 0 means no limit
    const products = await storage.getProducts(0); // 0 means no limit
    const transactions = await storage.getTransactions(1); // Just get the latest transaction
    const refills = await storage.getRefills(0); // 0 means no limit
    const events = await storage.getEvents(0); // 0 means no limit
    const stocks = await storage.getStocks(0); // 0 means no limit
    const stocksSyncLog = await storage.getLatestSyncLog('stocks');
    
    // Berechne den aktuellen Fortschritt der historischen Synchronisierung
    const currentDate = this.historicalSyncState.inProgress
      ? new Date(this.historicalSyncState.currentYear, this.historicalSyncState.currentMonth, 1)
      : new Date();
      
    const targetDate = this.historicalSyncState.targetDate;
    
    // Berechne den Fortschritt in Prozent
    const totalDays = Math.floor((this.historicalSyncState.startDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysProcessed = Math.floor((this.historicalSyncState.startDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    const progressPercent = totalDays > 0 ? Math.round((daysProcessed / totalDays) * 100) : 0;
    
    return {
      machines: {
        status: machinesSyncLog?.syncStatus || 'never',
        lastSync: machinesSyncLog ? machinesSyncLog.endDate?.getTime() || 0 : 0,
        count: Array.isArray(machines) ? machines.length : 0
      },
      products: {
        status: productsSyncLog?.syncStatus || 'never',
        lastSync: productsSyncLog ? productsSyncLog.endDate?.getTime() || 0 : 0,
        count: Array.isArray(products) ? products.length : 0
      },
      transactions: {
        status: transactionsSyncLog?.syncStatus || 'never',
        lastSync: transactionsSyncLog ? transactionsSyncLog.endDate?.getTime() || 0 : 0,
        count: await this.getTransactionCount(), // Aktuelle Transaktionsanzahl aus der Datenbank
        latest: Array.isArray(transactions) && transactions.length > 0 ? transactions[0].datetime.getTime() : 0
      },
      refills: {
        status: refillsSyncLog?.syncStatus || 'never',
        lastSync: refillsSyncLog ? refillsSyncLog.endDate?.getTime() || 0 : 0,
        count: Array.isArray(refills) ? refills.length : 0
      },
      events: {
        status: eventsSyncLog?.syncStatus || 'never',
        lastSync: eventsSyncLog ? eventsSyncLog.endDate?.getTime() || 0 : 0,
        count: Array.isArray(events) ? events.length : 0
      },
      stocks: {
        status: stocksSyncLog?.syncStatus || 'never',
        lastSync: stocksSyncLog ? stocksSyncLog.endDate?.getTime() || 0 : 0,
        count: Array.isArray(stocks) ? stocks.length : 0
      },
      historicalSync: {
        inProgress: this.historicalSyncState.inProgress,
        currentDate: currentDate.toISOString().split('T')[0],
        targetDate: targetDate.toISOString().split('T')[0],
        progress: progressPercent,
        completedMonths: this.historicalSyncState.completedMonths,
        totalTransactions: this.historicalSyncState.totalTransactions,
        processingTimeMin: this.historicalSyncState.processingStart ? 
          Math.floor((Date.now() - this.historicalSyncState.processingStart) / (1000 * 60)) : 0
      }
    };
  }
}

export const vendonSync = new VendonSyncService();