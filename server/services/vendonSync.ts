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
import { rawDb } from "../db";
import { SYNC_TYPE, acquireSyncLock, releaseSyncLock } from "./syncLock";
import { stockRatioService } from './stockRatioService';
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { vendonRateLimiter } from './vendonRateLimiter';

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
      throw new Error("Kein gültiger API-Schlüssel gefunden! Bitte setzen Sie VENDON_API_KEY in den Umgebungsvariablen.");
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
        
        // Zentrales Rate Limiting verwenden
        await vendonRateLimiter.waitForSlot();
        
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
   * Versucht mehrere Endpunkte für eine vollständige Maschinenerfassung
   */
  async getMachines() {
    try {
      // Versuche zuerst den ursprünglichen Endpunkt
      return await this.makeRequest<any[]>('/machines');
    } catch (machinesError) {
      console.log('Machines-Endpunkt nicht verfügbar, versuche alternative Endpunkte...');
      
      // Versuche alternative Endpunkte für Maschinen
      const alternativeEndpoints = ['/devices', '/locations', '/vending-machines'];
      
      for (const endpoint of alternativeEndpoints) {
        try {
          console.log(`Versuche Endpunkt: ${endpoint}`);
          const result = await this.makeRequest<any[]>(endpoint);
          if (result && Array.isArray(result) && result.length > 0) {
            console.log(`✅ ${result.length} Automaten über ${endpoint} gefunden`);
            return result;
          }
        } catch (endpointError) {
          console.log(`Endpunkt ${endpoint} nicht verfügbar`);
        }
      }
      
      console.log('Alle Maschinen-Endpunkte fehlgeschlagen, extrahiere aus Transaktionen...');
      
      // 🔄 IMPROVED FALLBACK: Paginierte Maschinen-Extraktion aus Transaktionen
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const machineMap = new Map();
      let offset = 0;
      const pageSize = 1000;
      let hasMoreTransactions = true;
      let totalTransactionsChecked = 0;
      const maxTransactions = 50000; // Sicherheitsgrenze
      
      console.log('📊 Starte paginierte Maschinen-Extraktion aus Transaktionen...');
      
      while (hasMoreTransactions && totalTransactionsChecked < maxTransactions) {
        try {
          const transactions = await this.getTransactions(oneMonthAgo, new Date(), undefined, offset, pageSize);
          
          if (!transactions.data || !Array.isArray(transactions.data) || transactions.data.length === 0) {
            hasMoreTransactions = false;
            break;
          }
          
          // Verarbeite Transaktionen in aktueller Seite
          let newMachinesInPage = 0;
          for (const tx of transactions.data) {
            if (tx.machine_id && !machineMap.has(tx.machine_id)) {
              machineMap.set(tx.machine_id, {
                id: tx.machine_id,
                name: tx.machine_name || `Automat ${tx.machine_id}`,
                location: tx.location || 'Unbekannt'
              });
              newMachinesInPage++;
            }
          }
          
          totalTransactionsChecked += transactions.data.length;
          offset += pageSize;
          
          console.log(`📄 Seite ${Math.floor(offset/pageSize)}: ${transactions.data.length} Transaktionen, ${newMachinesInPage} neue Maschinen gefunden`);
          
          // Stoppe wenn weniger als die Seitengröße zurückgegeben wird
          if (transactions.data.length < pageSize) {
            hasMoreTransactions = false;
          }
          
          // Stoppe wenn keine neuen Maschinen in den letzten 3 Seiten gefunden wurden
          if (newMachinesInPage === 0 && offset > pageSize * 3) {
            console.log('⏹️ Keine neuen Maschinen in den letzten Seiten - stoppe Pagination');
            hasMoreTransactions = false;
          }
          
        } catch (pageError) {
          console.error(`Fehler beim Abrufen von Transaktionsseite ${Math.floor(offset/pageSize)}:`, pageError);
          hasMoreTransactions = false;
        }
      }
      
      const machines = Array.from(machineMap.values());
      console.log(`✅ ${machines.length} eindeutige Automaten aus ${totalTransactionsChecked} Transaktionen extrahiert`);
      return machines;
    }
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
      // Korrekter Endpunkt laut Vendon API v1.9.0 Dokumentation
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
   * Updates the lastSync timestamp for a machine
   */
  private async updateMachineLastSync(machineId: string | number): Promise<void> {
    try {
      await rawDb.query(
        'UPDATE machines SET last_sync = NOW(), updated_at = NOW() WHERE vendon_id = $1',
        [machineId.toString()]
      );
    } catch (error) {
      console.error(`Failed to update lastSync for machine ${machineId}:`, error);
    }
  }
  
  /**
   * Updates lastSync for multiple machines at once
   */
  private async updateMachinesLastSync(machineIds: (string | number)[]): Promise<void> {
    if (machineIds.length === 0) return;
    
    try {
      const uniqueMachineIds = [...new Set(machineIds.map(id => id.toString()))];
      const placeholders = uniqueMachineIds.map((_, index) => `$${index + 1}`).join(', ');
      
      await rawDb.query(
        `UPDATE machines SET last_sync = NOW(), updated_at = NOW() WHERE vendon_id IN (${placeholders})`,
        uniqueMachineIds
      );
      
      console.log(`✅ Updated lastSync for ${uniqueMachineIds.length} machines`);
    } catch (error) {
      console.error(`Failed to update lastSync for machines:`, error);
    }
  }
  
  /**
   * Ruft alle Produkte aus der Datenbank ab
   * Diese Methode ist für die Web-API gedacht
   */
  async getAllProducts() {
    const result = await rawDb.query('SELECT * FROM products');
    return result.rows;
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
      
      // 🚀 PERFORMANCE FIX: Batch-verarbeitung für Machine Details
      console.log(`Hole Details für ${machines.length} Maschinen in Batches...`);
      
      // Erstelle Batches von 5 Maschinen für parallele Verarbeitung
      const batchSize = 5;
      const machineDetailsMap = new Map();
      
      for (let i = 0; i < machines.length; i += batchSize) {
        const batch = machines.slice(i, i + batchSize);
        const detailPromises = batch.map(async (machine) => {
          if (!machine.id) return { vendonId: null, detail: null };
          
          const vendonId = machine.id.toString();
          try {
            const detail = await this.api.getMachineDetail(vendonId);
            return { vendonId, detail };
          } catch (error) {
            console.error(`Fehler beim Abrufen von Details für ${vendonId}:`, error);
            return { vendonId, detail: null };
          }
        });
        
        const batchResults = await Promise.all(detailPromises);
        batchResults.forEach(({ vendonId, detail }) => {
          if (vendonId) machineDetailsMap.set(vendonId, detail);
        });
        
        console.log(`Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(machines.length/batchSize)} abgeschlossen`);
      }
      
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
        const machineDetail = machineDetailsMap.get(vendonId);
        
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
            // 🔧 FIX: Duplikat-Zähler korrekt incrementieren
            duplicates++;
            console.log(`📊 Duplikat gefunden: Maschine ${vendonId} existiert bereits mit ID ${existingMachine.id}`);
            // Aktualisiere bestehende Maschine
            await storage.updateMachine(existingMachine.id, newMachine);
            itemsUpdated++;
            console.log(`✅ Maschine ${vendonId} aktualisiert (Duplikat #${duplicates})`);
          } else {
            // Erstelle neue Maschine
            await storage.createMachine(newMachine);
            itemsSaved++;
            console.log(`🆕 Neue Maschine ${vendonId} erstellt`);
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
      console.log(`📊 Sync-Ergebnis: ${machines.length} Maschinen, ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate, ${errors} Fehler`);
      return {
        syncLogId,
        status: 'success',
        message: `${machines.length} Maschinen synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate, ${errors} Fehler`
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
    maxTransactions: number = 0, // 0 = no limit, sync until no more data available
    forceUpdate: boolean = false
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Debug-Ausgabe für forceUpdate-Parameter
    console.log(`syncTransactions aufgerufen mit forceUpdate=${forceUpdate}`);
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
      
      // Direkt von der API holen, kein Preprocessing
      let transactions = [];
      
      // Debug-Ausgabe
      console.log(`Verwende Zeitraum: ${effectiveStartDate.toISOString()} bis ${effectiveEndDate.toISOString()}`);
      console.log(`Timestamps: ${Math.floor(effectiveStartDate.getTime() / 1000)} bis ${Math.floor(effectiveEndDate.getTime() / 1000)}`);
      
      // Solange es weitere Transaktionen gibt (dynamisches Limit basierend auf API-Antworten)
      // Wenn maxTransactions = 0, dann unbegrenzt bis keine Daten mehr zurückkommen
      while (hasMoreTransactions && (maxTransactions === 0 || totalItems < maxTransactions)) {
        
        console.log(`Hole Transaktionen, Seite ${page} mit Batchgröße ${batchSize}`);
        
        // Berechne den verbleibenden Limit für diese Anfrage
        // Wenn maxTransactions = 0 (unbegrenzt), verwende immer batchSize
        const remainingLimit = maxTransactions === 0 ? batchSize : Math.min(batchSize, maxTransactions - totalItems);
        
        // Hole Transaktionen von der API
        const fromTimestamp = Math.floor(effectiveStartDate.getTime() / 1000);
        const toTimestamp = Math.floor(effectiveEndDate.getTime() / 1000);
        
        // Detaillierte Log-Ausgabe für die API-Anfrage
        console.log("API-Anfrage: GET /stats/vends (Versuch 1/3)");
        console.log("Parameter:", {
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          offset: (page - 1) * batchSize,
          limit: remainingLimit
        });
        
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
        
        // 🚀 BATCH-OPTIMIERUNG: Effizienter Transaktions-Import
        console.log(`⚡ Starte Batch-Verarbeitung für ${transactions.length} Transaktionen`);
        
        // Schritt 1: Bereite alle Transaktions-Objekte vor
        const processedTransactions: Array<{
          vendonId: string;
          transaction: InsertTransaction;
          originalData: any;
        }> = [];
        
        for (const transaction of transactions) {
          try {
            // Prüfe, ob die Transaktion eine ID hat
            const transactionId = transaction.id || transaction.transaction_id;
            if (!transactionId) {
              console.error("Transaktion ohne ID übersprungen:", transaction);
              errors++;
              continue;
            }
            
            // 🛡️ DUPLIKAT-SCHUTZ: Robuste Maschinen-ID Verarbeitung (FIXED)
            let machineId: number | null = null; // Kein Standardwert - null wenn unbekannt
            if (transaction.machine_id) {
              const machineVendonId = transaction.machine_id.toString();
              const machineName = transaction.machine_name || `Maschine ${machineVendonId}`;
              
              // FIXED: Prüfe NUR nach vendon_id - das ist der eindeutige Schlüssel!
              const existingMachine = await rawDb.query(
                'SELECT * FROM machines WHERE vendon_id = $1 LIMIT 1',
                [machineVendonId]
              );
              
              if (existingMachine.rows.length > 0) {
                // Maschine existiert bereits - nutze erste gefundene (älteste)
                const machineData = existingMachine.rows[0];
                
                // Ensure vendon_id is set if missing
                if (!machineData.vendon_id || machineData.vendon_id !== machineVendonId) {
                  await rawDb.query(
                    'UPDATE machines SET vendon_id = $1, last_sync = $2 WHERE id = $3',
                    [machineVendonId, new Date(), machineData.id]
                  );
                  console.log(`✅ Maschine ${machineName} vendon_id aktualisiert: ${machineVendonId}`);
                }
                
                machineId = machineData.id;
              } else {
                // ONLY create new machine if NONE exists with this vendon_id OR name
                const newMachine: InsertMachine = {
                  vendonId: machineVendonId,
                  machineName: machineName,
                  lastSync: new Date()
                };
                const machineData = await storage.createMachine(newMachine);
                machineId = machineData.id;
                console.log(`🆕 Neue Maschine erstellt: ${machineName} (${machineVendonId})`);
              }
            } else {
              // Keine machine_id in der Transaktion - warnen und null verwenden
              console.warn(`⚠️ Transaktion ${transactionId} hat keine machine_id - wird als unzugeordnet gespeichert`);
              machineId = null;
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
              paymentMethod: transaction.payment_method || null,
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
            
            processedTransactions.push({
              vendonId,
              transaction: newTransaction,
              originalData: transaction
            });
          } catch (error) {
            console.error("Fehler beim Verarbeiten einer Transaktion:", error);
            errors++;
          }
        }
        
        // Schritt 2: Batch-Duplikatsprüfung (1 SQL-Abfrage statt hunderte)
        const vendonIds = processedTransactions.map(pt => pt.vendonId);
        const existingIds = await storage.getExistingTransactionIds(vendonIds);
        
        // Schritt 3: Filtere neue Transaktionen
        const newTransactions: any[] = [];
        let duplicatesInBatch = 0;
        
        for (const processed of processedTransactions) {
          if (existingIds.has(processed.vendonId)) {
            if (forceUpdate) {
              // Bei forceUpdate: Update bestehende Transaktionen (TODO: Batch-Update implementieren)
              try {
                const existingTransaction = await storage.getTransactionByVendonId(processed.vendonId);
                if (existingTransaction) {
                  await storage.updateTransaction(existingTransaction.id, processed.transaction);
                  itemsUpdated++;
                }
              } catch (error) {
                console.error(`Fehler beim Update von ${processed.vendonId}:`, error);
                errors++;
              }
            } else {
              duplicatesInBatch++;
            }
          } else {
            newTransactions.push(processed.transaction);
          }
        }
        
        duplicates += duplicatesInBatch;
        console.log(`📊 Batch-Analyse: ${newTransactions.length} neue, ${duplicatesInBatch} Duplikate`);
        
        // Schritt 4: Batch-Insertion (1 SQL-Operation statt hunderte)
        if (newTransactions.length > 0) {
          try {
            const savedTransactions = await storage.createTransactionsBatch(newTransactions);
            itemsSaved += savedTransactions.length;
            
            // Update lastSync for all machines in this batch
            const machineIds = newTransactions.map(t => t.machineId).filter(id => id);
            await this.updateMachinesLastSync(machineIds);
          } catch (error) {
            console.error("Fehler bei Batch-Insertion:", error);
            errors += newTransactions.length;
          }
        }
        
        // Prüfe, ob wir alle Transaktionen erhalten haben
        // Dynamische Logik: Wenn weniger als batchSize Transaktionen zurückkommen,
        // dann sind keine weiteren Daten verfügbar (unabhängig vom maxTransactions-Limit)
        const hasApiMoreData = transactions.length >= batchSize;
        const withinMaxLimit = maxTransactions === 0 || totalItems < maxTransactions;
        hasMoreTransactions = hasApiMoreData && withinMaxLimit;
        
        console.log(`Prüfe, ob weitere Transaktionen existieren: ${hasMoreTransactions}`);
        console.log(`Aktuelle Anzahl: ${transactions.length}, Batch-Größe: ${batchSize}, Gesamt: ${totalItems}${maxTransactions > 0 ? '/' + maxTransactions : ' (unbegrenzt)'}`);
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
            const dateField = event.event_datetime || event.datetime || event.received_at || event.timestamp;
            
            if (dateField) {
              if (typeof dateField === 'number') {
                // Unix-Timestamp (Sekunden oder Millisekunden)
                eventDate = new Date(
                  dateField > 1577836800000 // Wenn > 01.01.2020 in Millisekunden
                    ? dateField // Ist bereits in Millisekunden
                    : dateField * 1000 // Konvertiere Sekunden zu Millisekunden
                );
              } else {
                // String-Datum
                eventDate = new Date(dateField);
              }
              
              // Validiere das Datum
              if (isNaN(eventDate.getTime())) {
                console.warn(`Ereignis ${event.id} hat ungültiges Datum: ${dateField}. Verwende aktuelles Datum.`);
                eventDate = new Date();
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

  // Synchronisiere Refills (Auffüllungen) mit vollständiger Pagination
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
      console.log(`Synchronisiere Refills von ${effectiveStartDate.toISOString()} bis ${effectiveEndDate.toISOString()}`);
      const startTime = Date.now();
      
      // Statistik-Variablen
      let itemsFound = 0;
      let itemsSaved = 0;
      let duplicates = 0;
      let errors = 0;
      let detailsSaved = 0;
      
      // Sammle alle Refills mit Pagination
      const allRefills = [];
      let page = 1;
      let hasMoreData = true;
      
      console.log('🔄 Hole Refills mit Pagination...');
      
      while (hasMoreData) {
        const result = await this.api.getRefills(
          effectiveStartDate,
          effectiveEndDate,
          page,
          batchSize
        );
        
        if (!result.data || result.data.length === 0) {
          hasMoreData = false;
          break;
        }
        
        allRefills.push(...result.data);
        console.log(`📄 Seite ${page}: ${result.data.length} Refills erhalten (Gesamt: ${allRefills.length})`);
        
        // Prüfe ob weitere Seiten vorhanden sind
        if (result.data.length < batchSize) {
          hasMoreData = false;
        } else {
          page++;
        }
        
        // Sicherheitslimit: Maximal 50 Seiten
        if (page > 50) {
          console.warn('⚠️ Sicherheitslimit erreicht: Maximal 50 Seiten');
          hasMoreData = false;
        }
      }
      
      itemsFound = allRefills.length;
      console.log(`✅ Insgesamt ${allRefills.length} Refills gefunden`);
      
      // Jeden Refill verarbeiten
      for (const refill of allRefills) {
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
      
      console.log(`🎯 Refills-Sync abgeschlossen: ${itemsFound} gefunden, ${itemsSaved} neu, ${duplicates} Duplikate`);
      
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
    // Prüfe, ob bereits eine Produktsynchronisierung läuft
    const lockAcquired = await acquireSyncLock(SYNC_TYPE.PRODUCTS);
    
    if (!lockAcquired) {
      console.warn("Es läuft bereits eine Produktsynchronisierung. Diese Anfrage wird übersprungen.");
      
      // Versuche, den laufenden Synchronisierungsprozess zu finden
      const runningSyncLog = await storage.getLatestRunningSyncLog(SYNC_TYPE.PRODUCTS);
      if (runningSyncLog) {
        return {
          syncLogId: runningSyncLog.id,
          status: "running_elsewhere",
          message: `Eine Produktsynchronisierung läuft bereits seit ${runningSyncLog.startDate?.toISOString()}. Bitte warten Sie, bis diese abgeschlossen ist.`
        };
      } else {
        return {
          syncLogId: 0,
          status: "locked",
          message: "Die Produktsynchronisierung ist derzeit gesperrt. Bitte versuchen Sie es später erneut."
        };
      }
    }
    
    // Erstelle einen Sync-Log-Eintrag
    const syncLog: InsertSyncLog = {
      syncType: SYNC_TYPE.PRODUCTS,
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      console.log("Starte erweiterte Produktsynchronisierung mit verbesserter Duplikatprüfung...");
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
      
      // Sammle vorhandene Produkte in einem einzigen Datenbankaufruf mit Verwendung von SQL-Abfragen
      // zur genaueren Kontrolle, da hier Massenduplikate vorliegen könnten
      console.log("Hole bestehende Produkte aus der Datenbank...");
      
      // Direkte SQL-Abfrage statt ORM-Aufruf für bessere Kontrolle über die Ergebnisse
      const existingProductsResult = await storage.executeRawQuery(`
        SELECT 
          id, 
          vendon_id as "vendonId", 
          product_name as "productName",
          price, 
          status, 
          sku, 
          barcode
        FROM products
      `);
      
      const existingProducts = existingProductsResult.rows;
      console.log(`${existingProducts.length} bestehende Produkte in der Datenbank gefunden.`);
      
      // Suche nach Duplikaten, um dieses Problem zu diagnostizieren
      const duplicateVendonIdsResult = await storage.executeRawQuery(`
        SELECT 
          vendon_id, 
          COUNT(*) as count 
        FROM products 
        GROUP BY vendon_id 
        HAVING COUNT(*) > 1
        ORDER BY count DESC
        LIMIT 5
      `);
      
      if (duplicateVendonIdsResult.rows.length > 0) {
        console.log("WARNUNG: Folgende Vendon-IDs haben Duplikate in der Datenbank:");
        duplicateVendonIdsResult.rows.forEach(row => {
          console.log(`  VendonID: ${row.vendon_id}, Anzahl: ${row.count}`);
        });
      }
      
      // Erstelle zwei Maps für effiziente Suche:
      // 1. Nach Vendon-ID (bevorzugt)
      // 2. Nach normalisiertem Produktnamen (Fallback)
      const existingByVendonId: Record<string, any> = {};
      const existingByNormalizedName: Record<string, any> = {};
      
      // Normalisiere Namen für Vergleich (Kleinbuchstaben, Leerzeichen trimmen)
      const normalizeProductName = (name: string): string => {
        if (!name) return '';
        return name.toLowerCase().trim();
      };
      
      // Fülle die Maps, aber vermeide Duplikate - behalte nur das erste Produkt pro Vendon-ID
      // oder normalisiertem Namen
      existingProducts.forEach(product => {
        // Nach Vendon-ID - nur einfügen, wenn noch nicht vorhanden
        if (product.vendonId && !existingByVendonId[product.vendonId]) {
          existingByVendonId[product.vendonId] = product;
        }
        
        // Nach normalisiertem Namen - nur einfügen, wenn noch nicht vorhanden
        if (product.productName) {
          const normalizedName = normalizeProductName(product.productName);
          if (!existingByNormalizedName[normalizedName]) {
            existingByNormalizedName[normalizedName] = product;
          }
        }
      });
      
      console.log(`Nach Deduplizierung: ${Object.keys(existingByVendonId).length} einzigartige Produkte nach Vendon-ID`);
      console.log(`Nach Deduplizierung: ${Object.keys(existingByNormalizedName).length} einzigartige Produkte nach normalisiertem Namen`);
      
      // Gruppiere Produkte nach normalisiertem Namen für Duplikaterkennung
      // Verarbeite die Produkte nach Wichtigkeit: API-Produkte haben höhere Priorität
      const processedProductIds = new Set<string>();
      const processedNormalizedNames = new Set<string>();
      
      // Verarbeite jeden Produkt-Datensatz einzeln, effizient und mit strengerer Duplikatschutz
      for (const product of products) {
        try {
          if (!product.id) {
            console.warn("Produkt ohne ID übersprungen");
            errors++;
            continue;
          }
          
          const vendonId = product.id.toString();
          
          // Überspringe, wenn dieses Produkt bereits in diesem Durchlauf verarbeitet wurde
          if (processedProductIds.has(vendonId)) {
            console.log(`Produkt mit vendonId ${vendonId} bereits in diesem Durchlauf verarbeitet (Duplikat in API-Daten)`);
            duplicates++;
            continue;
          }
          
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
          
          // Normalisierter Name für Duplikatprüfung
          const normalizedName = normalizeProductName(productName);
          
          // Überspringe auch, wenn der normalisierte Name bereits verarbeitet wurde
          if (processedNormalizedNames.has(normalizedName)) {
            console.log(`Produkt mit normalisiertem Namen '${normalizedName}' bereits verarbeitet (Duplikat in API-Daten)`);
            duplicates++;
            continue;
          }
          
          // Extrahiere Produktdaten mit mehr Informationen
          const productData = {
            vendonId,
            productName: productName,
            price: product.price || 0,
            status: product.status || 'active',
            sku: product.sku || product.code || null,
            barcode: product.barcode || product.code || null,
            // Zeitstempel für die letzte Aktualisierung von Vendon
            vendonUpdatedAt: new Date(),
            // Felder aus dem extraData-Feld können später extrahiert werden
            extraData: JSON.stringify(product)
          };
          
          // Prüfe, ob das Produkt bereits existiert (nach Vendon-ID)
          const existingById = existingByVendonId[vendonId];
          
          // Prüfe, ob das Produkt bereits existiert (nach normalisiertem Namen)
          const existingByName = existingByNormalizedName[normalizedName];
          
          // Markiere als verarbeitet, um Duplikate in diesem Durchlauf zu vermeiden
          processedProductIds.add(vendonId);
          processedNormalizedNames.add(normalizedName);
          
          if (existingById) {
            // Aktualisieren des bestehenden Produkts mit derselben vendonId
            console.log(`Aktualisiere bestehendes Produkt (vendonId: ${vendonId}): ${productName}`);
            
            await storage.updateProduct(existingById.id, {
              ...productData,
              updatedAt: new Date()
            });
            
            // Aktualisiere auch die Maps für nachfolgende Lookups
            existingByVendonId[vendonId] = {...existingById, ...productData, updatedAt: new Date()};
            existingByNormalizedName[normalizedName] = existingByVendonId[vendonId];
            
            itemsUpdated++;
          } else if (existingByName) {
            // Aktualisiere das bestehende Produkt mit dem gleichen Namen und setze vendonId
            console.log(`Aktualisiere bestehendes Produkt (Name: ${productName}) und setze vendonId: ${vendonId}`);
            
            await storage.updateProduct(existingByName.id, {
              ...productData,
              updatedAt: new Date()
            });
            
            // Aktualisiere auch die lokalen Referenzen, damit nachfolgende Abfragen korrekt sind
            existingByVendonId[vendonId] = {...existingByName, ...productData, updatedAt: new Date()};
            existingByNormalizedName[normalizedName] = existingByVendonId[vendonId];
            
            itemsUpdated++;
          } else {
            // Überprüfe nochmals direkt in der Datenbank, ob ein Produkt mit dieser vendonId oder diesem Namen existiert
            // Dies ist ein doppelter Sicherheitsmechanismus gegen Duplikate
            const existingInDB = await storage.getProductByVendonId(vendonId);
            
            if (existingInDB) {
              // Aktualisiere das Produkt, das in der Datenbank gefunden wurde
              console.log(`Produkt mit vendonId ${vendonId} doch in DB gefunden, aktualisiere: ${productName}`);
              
              await storage.updateProduct(existingInDB.id, {
                ...productData,
                updatedAt: new Date()
              });
              
              // Aktualisiere die Maps
              existingByVendonId[vendonId] = {...existingInDB, ...productData, updatedAt: new Date()};
              existingByNormalizedName[normalizedName] = existingByVendonId[vendonId];
              
              itemsUpdated++;
            } else {
              // Noch eine letzte Prüfung nach Name
              const existingByNameInDB = await storage.executeRawQuery(`
                SELECT id FROM products 
                WHERE LOWER(TRIM(product_name)) = $1 
                LIMIT 1
              `, [normalizedName]);
              
              if (existingByNameInDB.rows.length > 0) {
                // Produkt mit gleichem Namen gefunden, aktualisieren
                const productId = existingByNameInDB.rows[0].id;
                console.log(`Produkt mit normalisiertem Namen '${normalizedName}' in DB gefunden (ID: ${productId}), aktualisiere`);
                
                await storage.updateProduct(productId, {
                  ...productData,
                  updatedAt: new Date()
                });
                
                // Aktualisiere die Maps
                const updatedProduct = {...productData, id: productId, updatedAt: new Date()};
                existingByVendonId[vendonId] = updatedProduct;
                existingByNormalizedName[normalizedName] = updatedProduct;
                
                itemsUpdated++;
              } else {
                // Jetzt erst wirklich ein neues Produkt erstellen, wenn wir sicher sind
                console.log(`Erstelle neues Produkt: ${productName} (vendonId: ${vendonId})`);
                
                const newProduct = await storage.createProduct({
                  ...productData,
                  createdAt: new Date(),
                  updatedAt: new Date()
                });
                
                // Aktualisiere die Maps mit dem neuen Produkt für nachfolgende Lookups
                existingByVendonId[vendonId] = newProduct;
                existingByNormalizedName[normalizedName] = newProduct;
                
                itemsSaved++;
              }
            }
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
      
      console.log(`Erweiterte Produktsynchronisierung abgeschlossen. ${itemsSaved} hinzugefügt, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate übersprungen, ${errors} Fehler in ${durationSeconds} Sekunden.`);
      
      // Gebe Sperre frei
      releaseSyncLock(SYNC_TYPE.PRODUCTS);
      
      return {
        syncLogId,
        status: 'success',
        message: `${products.length} Produkte synchronisiert: ${itemsSaved} neu, ${itemsUpdated} aktualisiert, ${duplicates} Duplikate übersprungen, ${errors} Fehler`
      };
    } catch (error) {
      console.error("Fehler bei der erweiterten Produktsynchronisierung:", error);
      
      // Aktualisiere den Sync-Log-Eintrag mit Fehlerinformationen
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      // Gebe Sperre frei auch im Fehlerfall
      releaseSyncLock(SYNC_TYPE.PRODUCTS);
      
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
              
              // Update lastSync for this machine
              if (newTransaction.machineId) {
                await this.updateMachineLastSync(newTransaction.machineId);
              }
              
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
    const result = await rawDb.query('SELECT * FROM products');
    const products = result.rows;
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

  /**
   * VENDON-DATENLÜCKEN-PRÜFUNG
   * Analysiert Transaktionsdaten auf fehlende oder unvollständige Zeiträume
   * und führt automatische Backfill-Operationen durch
   */

  /**
   * Führt eine umfassende Datenlücken-Analyse durch
   * @param startDate Startdatum für die Analyse
   * @param endDate Enddatum für die Analyse
   * @param thresholds Schwellenwerte für die Lücken-Erkennung
   * @returns Detaillierter Gap-Analyse-Bericht
   */
  async analyzeDataGaps(
    startDate?: Date,
    endDate?: Date,
    thresholds: {
      minDailyTransactions?: number;
      criticalGapDays?: number;
      warningGapDays?: number;
    } = {}
  ): Promise<{
    status: string;
    summary: {
      totalDaysAnalyzed: number;
      missingDays: number;
      incompleteDays: number;
      criticalGaps: number;
      warningGaps: number;
    };
    gaps: {
      missing: Array<{ date: string; type: 'missing'; severity: 'critical' | 'warning' }>;
      incomplete: Array<{ date: string; type: 'incomplete'; severity: 'critical' | 'warning'; actualCount: number; expectedCount: number }>;
    };
    recommendations: Array<{ action: string; priority: 'high' | 'medium' | 'low'; details: string }>;
    backfillOperations?: Array<{ startDate: string; endDate: string; estimatedTransactions: number }>;
  }> {
    // Standardwerte setzen
    const effectiveStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 Tage zurück
    const effectiveEndDate = endDate || new Date();
    
    const defaultThresholds = {
      minDailyTransactions: 50, // Minimum erwartete Transaktionen pro Tag
      criticalGapDays: 3, // Kritische Lücke: 3+ aufeinanderfolgende Tage
      warningGapDays: 1, // Warnung: 1+ Tag
      ...thresholds
    };

    console.log(`🔍 Starte Datenlücken-Analyse von ${this.formatDate(effectiveStartDate)} bis ${this.formatDate(effectiveEndDate)}`);

    try {
      // Hole historische Durchschnitte für bessere Erwartungswerte
      const historicalAverages = await this.getHistoricalAverages(30); // Letzten 30 Tage analysieren
      const adaptiveThreshold = Math.max(
        defaultThresholds.minDailyTransactions,
        Math.floor(historicalAverages.avgDailyTransactions * 0.3) // 30% des historischen Durchschnitts
      );

      // SQL-Query für umfassende Datenlücken-Analyse
      const gapAnalysisQuery = `
        WITH RECURSIVE date_series AS (
          SELECT DATE($1) as check_date
          UNION ALL
          SELECT DATE(check_date + INTERVAL '1 day')
          FROM date_series
          WHERE check_date < DATE($2)
        ),
        daily_counts AS (
          SELECT 
            DATE(datetime) as transaction_date,
            COUNT(*) as daily_count,
            COUNT(DISTINCT machine_id) as active_machines
          FROM transactions 
          WHERE datetime >= $1 AND datetime <= $2
          GROUP BY DATE(datetime)
        ),
        machine_activity AS (
          SELECT COUNT(DISTINCT vendon_id) as total_machines
          FROM machines
          WHERE last_sync >= $1 - INTERVAL '7 days'
        )
        SELECT 
          ds.check_date,
          COALESCE(dc.daily_count, 0) as actual_count,
          COALESCE(dc.active_machines, 0) as active_machines,
          ma.total_machines,
          CASE 
            WHEN dc.daily_count IS NULL THEN 'missing'
            WHEN dc.daily_count < $3 THEN 'incomplete'
            ELSE 'complete'
          END as status,
          EXTRACT(DOW FROM ds.check_date) as day_of_week
        FROM date_series ds
        CROSS JOIN machine_activity ma
        LEFT JOIN daily_counts dc ON ds.check_date = dc.transaction_date
        ORDER BY ds.check_date
      `;

      const gapResults = await rawDb.query(gapAnalysisQuery, [
        effectiveStartDate.toISOString().split('T')[0],
        effectiveEndDate.toISOString().split('T')[0],
        adaptiveThreshold
      ]);

      // Analysiere die Ergebnisse
      const analysis = this.processGapResults(gapResults.rows, defaultThresholds, historicalAverages);

      // Erstelle Empfehlungen
      const recommendations = this.generateGapRecommendations(analysis, historicalAverages);

      // Bereite Backfill-Operationen vor (falls erforderlich)
      const backfillOperations = this.planBackfillOperations(analysis.gaps.missing, historicalAverages);

      const result = {
        status: analysis.gaps.missing.length > 0 || analysis.gaps.incomplete.length > 0 ? 'gaps_detected' : 'complete',
        summary: {
          totalDaysAnalyzed: gapResults.rows.length,
          missingDays: analysis.gaps.missing.length,
          incompleteDays: analysis.gaps.incomplete.length,
          criticalGaps: analysis.gaps.missing.filter(g => g.severity === 'critical').length + 
                       analysis.gaps.incomplete.filter(g => g.severity === 'critical').length,
          warningGaps: analysis.gaps.missing.filter(g => g.severity === 'warning').length + 
                      analysis.gaps.incomplete.filter(g => g.severity === 'warning').length
        },
        gaps: analysis.gaps,
        recommendations,
        backfillOperations
      };

      console.log(`📊 Datenlücken-Analyse abgeschlossen: ${result.summary.missingDays} fehlende Tage, ${result.summary.incompleteDays} unvollständige Tage`);
      return result;

    } catch (error) {
      console.error('❌ Fehler bei der Datenlücken-Analyse:', error);
      throw error;
    }
  }

  /**
   * Verarbeitet die SQL-Ergebnisse der Gap-Analyse
   */
  private processGapResults(
    rows: any[], 
    thresholds: any, 
    historicalAverages: any
  ): {
    gaps: {
      missing: Array<{ date: string; type: 'missing'; severity: 'critical' | 'warning' }>;
      incomplete: Array<{ date: string; type: 'incomplete'; severity: 'critical' | 'warning'; actualCount: number; expectedCount: number }>;
    }
  } {
    const gaps = { missing: [], incomplete: [] };
    let consecutiveMissingDays = 0;
    let consecutiveIncompleteDays = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dayOfWeek = parseInt(row.day_of_week);
      
      // Erwartete Transaktionszahl basierend auf Wochentag und historischen Daten
      const expectedCount = this.calculateExpectedTransactions(dayOfWeek, historicalAverages);

      if (row.status === 'missing') {
        consecutiveMissingDays++;
        consecutiveIncompleteDays = 0;
        
        const severity = consecutiveMissingDays >= thresholds.criticalGapDays ? 'critical' : 'warning';
        gaps.missing.push({
          date: row.check_date,
          type: 'missing',
          severity
        });
      } else if (row.status === 'incomplete') {
        consecutiveIncompleteDays++;
        consecutiveMissingDays = 0;
        
        const severity = row.actual_count < expectedCount * 0.1 ? 'critical' : 'warning'; // Weniger als 10% = kritisch
        gaps.incomplete.push({
          date: row.check_date,
          type: 'incomplete',
          severity,
          actualCount: parseInt(row.actual_count),
          expectedCount
        });
      } else {
        consecutiveMissingDays = 0;
        consecutiveIncompleteDays = 0;
      }
    }

    return { gaps };
  }

  /**
   * Berechnet erwartete Transaktionszahl basierend auf Wochentag und historischen Daten
   */
  private calculateExpectedTransactions(dayOfWeek: number, historicalAverages: any): number {
    // Wochenend-Faktoren (Samstag = 6, Sonntag = 0)
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.0;
    
    // Basis auf historischem Durchschnitt
    return Math.floor(historicalAverages.avgDailyTransactions * weekendFactor);
  }

  /**
   * Holt historische Durchschnittswerte für bessere Gap-Erkennung
   */
  async getHistoricalAverages(dayRange: number = 30): Promise<{
    avgDailyTransactions: number;
    avgWeeklyTransactions: number;
    avgActiveMachines: number;
    weekdayPattern: Record<number, number>;
  }> {
    const query = `
      WITH daily_stats AS (
        SELECT 
          DATE(datetime) as date,
          COUNT(*) as daily_count,
          COUNT(DISTINCT machine_id) as daily_machines,
          EXTRACT(DOW FROM datetime) as day_of_week
        FROM transactions 
        WHERE datetime >= NOW() - INTERVAL '${dayRange} days'
        GROUP BY DATE(datetime), EXTRACT(DOW FROM datetime)
      )
      SELECT 
        AVG(daily_count) as avg_daily_transactions,
        AVG(daily_count) * 7 as avg_weekly_transactions,
        AVG(daily_machines) as avg_active_machines,
        day_of_week,
        AVG(daily_count) as avg_for_weekday
      FROM daily_stats
      GROUP BY day_of_week
      ORDER BY day_of_week
    `;

    const result = await rawDb.query(query);
    
    // Erstelle Wochentag-Pattern
    const weekdayPattern: Record<number, number> = {};
    let overallAvg = 0;
    
    for (const row of result.rows) {
      weekdayPattern[parseInt(row.day_of_week)] = parseFloat(row.avg_for_weekday);
      overallAvg += parseFloat(row.avg_for_weekday);
    }
    
    overallAvg = overallAvg / result.rows.length;

    return {
      avgDailyTransactions: overallAvg,
      avgWeeklyTransactions: overallAvg * 7,
      avgActiveMachines: result.rows.length > 0 ? parseFloat(result.rows[0].avg_active_machines) : 0,
      weekdayPattern
    };
  }

  /**
   * Generiert Empfehlungen basierend auf der Gap-Analyse
   */
  private generateGapRecommendations(
    analysis: any, 
    historicalAverages: any
  ): Array<{ action: string; priority: 'high' | 'medium' | 'low'; details: string }> {
    const recommendations = [];

    // Kritische fehlende Tage
    const criticalMissing = analysis.gaps.missing.filter(g => g.severity === 'critical');
    if (criticalMissing.length > 0) {
      recommendations.push({
        action: 'immediate_backfill',
        priority: 'high' as const,
        details: `${criticalMissing.length} kritische Datenlücken gefunden. Sofortiges Backfill erforderlich.`
      });
    }

    // Unvollständige Tage
    const criticalIncomplete = analysis.gaps.incomplete.filter(g => g.severity === 'critical');
    if (criticalIncomplete.length > 0) {
      recommendations.push({
        action: 'verify_api_connectivity',
        priority: 'high' as const,
        details: `${criticalIncomplete.length} Tage mit extrem niedrigen Transaktionszahlen. API-Konnektivität prüfen.`
      });
    }

    // Allgemeine Empfehlungen
    if (analysis.gaps.missing.length > 0 || analysis.gaps.incomplete.length > 0) {
      recommendations.push({
        action: 'increase_sync_frequency',
        priority: 'medium' as const,
        details: 'Synchronisierungsfrequenz erhöhen, um zukünftige Lücken zu vermeiden.'
      });

      recommendations.push({
        action: 'setup_monitoring',
        priority: 'medium' as const,
        details: 'Automatische Überwachung für Datenlücken einrichten.'
      });
    }

    return recommendations;
  }

  /**
   * Plant Backfill-Operationen für erkannte Lücken
   */
  private planBackfillOperations(
    missingGaps: any[], 
    historicalAverages: any
  ): Array<{ startDate: string; endDate: string; estimatedTransactions: number }> {
    const operations = [];
    
    // Gruppiere aufeinanderfolgende fehlende Tage
    let currentGroup = null;
    
    for (const gap of missingGaps) {
      if (!currentGroup) {
        currentGroup = {
          startDate: gap.date,
          endDate: gap.date,
          days: 1
        };
      } else {
        const currentDate = new Date(gap.date);
        const lastDate = new Date(currentGroup.endDate);
        
        // Prüfe, ob der Tag aufeinanderfolgend ist
        if (currentDate.getTime() - lastDate.getTime() === 24 * 60 * 60 * 1000) {
          currentGroup.endDate = gap.date;
          currentGroup.days++;
        } else {
          // Schließe die aktuelle Gruppe ab
          operations.push({
            startDate: currentGroup.startDate,
            endDate: currentGroup.endDate,
            estimatedTransactions: Math.floor(historicalAverages.avgDailyTransactions * currentGroup.days)
          });
          
          // Starte neue Gruppe
          currentGroup = {
            startDate: gap.date,
            endDate: gap.date,
            days: 1
          };
        }
      }
    }
    
    // Schließe die letzte Gruppe ab
    if (currentGroup) {
      operations.push({
        startDate: currentGroup.startDate,
        endDate: currentGroup.endDate,
        estimatedTransactions: Math.floor(historicalAverages.avgDailyTransactions * currentGroup.days)
      });
    }
    
    return operations;
  }

  /**
   * Führt automatisches Backfill für erkannte Datenlücken durch
   */
  async performAutomaticBackfill(
    gapAnalysis: any,
    options: {
      maxDaysPerOperation?: number;
      dryRun?: boolean;
      priority?: 'critical' | 'all';
    } = {}
  ): Promise<{
    status: string;
    operations: Array<{
      startDate: string;
      endDate: string;
      result: { syncLogId: number; status: string; message: string };
    }>;
    summary: {
      totalOperations: number;
      successful: number;
      failed: number;
      transactionsSynced: number;
    };
  }> {
    const { maxDaysPerOperation = 7, dryRun = false, priority = 'all' } = options;
    
    console.log(`🔄 Starte automatisches Backfill${dryRun ? ' (Testlauf)' : ''} für Datenlücken...`);
    
    const operations = [];
    let totalTransactionsSynced = 0;
    let successful = 0;
    let failed = 0;
    
    try {
      // Filtere Operationen basierend auf Priorität
      let targetOperations = gapAnalysis.backfillOperations || [];
      if (priority === 'critical') {
        // Nur kritische Lücken (mehr als 3 aufeinanderfolgende Tage)
        targetOperations = targetOperations.filter(op => {
          const dayDiff = Math.ceil(
            (new Date(op.endDate).getTime() - new Date(op.startDate).getTime()) / (24 * 60 * 60 * 1000)
          );
          return dayDiff >= 3;
        });
      }
      
      for (const operation of targetOperations) {
        console.log(`📅 Backfill-Operation: ${operation.startDate} bis ${operation.endDate}`);
        
        if (dryRun) {
          operations.push({
            startDate: operation.startDate,
            endDate: operation.endDate,
            result: {
              syncLogId: -1,
              status: 'dry_run',
              message: `Testlauf: Würde ${operation.estimatedTransactions} Transaktionen synchronisieren`
            }
          });
          successful++;
        } else {
          try {
            // Führe die Synchronisierung durch
            const result = await this.syncTransactions(
              new Date(operation.startDate),
              new Date(operation.endDate),
              100, // Batch-Größe
              0, // Kein Limit
              false // Kein Force-Update
            );
            
            operations.push({
              startDate: operation.startDate,
              endDate: operation.endDate,
              result
            });
            
            if (result.status === 'success') {
              successful++;
              // Extrahiere Anzahl synchronisierter Transaktionen aus der Nachricht
              const match = result.message.match(/(\d+) Transaktionen synchronisiert/);
              if (match) {
                totalTransactionsSynced += parseInt(match[1]);
              }
            } else {
              failed++;
            }
            
            // Warte zwischen den Operationen, um die API nicht zu überlasten
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } catch (error) {
            console.error(`❌ Backfill-Fehler für ${operation.startDate}-${operation.endDate}:`, error);
            operations.push({
              startDate: operation.startDate,
              endDate: operation.endDate,
              result: {
                syncLogId: -1,
                status: 'error',
                message: `Fehler: ${error instanceof Error ? error.message : String(error)}`
              }
            });
            failed++;
          }
        }
      }
      
      const summary = {
        totalOperations: operations.length,
        successful,
        failed,
        transactionsSynced: totalTransactionsSynced
      };
      
      console.log(`✅ Automatisches Backfill abgeschlossen: ${successful}/${operations.length} erfolgreich, ${totalTransactionsSynced} Transaktionen synchronisiert`);
      
      return {
        status: failed === 0 ? 'success' : (successful > 0 ? 'partial' : 'error'),
        operations,
        summary
      };
      
    } catch (error) {
      console.error('❌ Fehler beim automatischen Backfill:', error);
      throw error;
    }
  }

  /**
   * Erstellt einen detaillierten Gap-Analyse-Bericht
   */
  async createGapAnalysisReport(
    startDate?: Date,
    endDate?: Date,
    includeRecommendations: boolean = true
  ): Promise<{
    reportId: string;
    generatedAt: Date;
    analysis: any;
    backfillSuggestions: any;
    healthScore: number;
    trendAnalysis: any;
  }> {
    const reportId = `gap-analysis-${Date.now()}`;
    console.log(`📋 Erstelle Gap-Analyse-Bericht ${reportId}...`);
    
    try {
      // Führe die Hauptanalyse durch
      const analysis = await this.analyzeDataGaps(startDate, endDate);
      
      // Berechne Health Score (0-100)
      const healthScore = this.calculateDataHealthScore(analysis);
      
      // Trend-Analyse über verschiedene Zeiträume
      const trendAnalysis = await this.analyzeTrends();
      
      // Backfill-Empfehlungen
      const backfillSuggestions = {
        immediate: analysis.backfillOperations?.filter(op => {
          const days = Math.ceil(
            (new Date(op.endDate).getTime() - new Date(op.startDate).getTime()) / (24 * 60 * 60 * 1000)
          );
          return days >= 3;
        }) || [],
        scheduled: analysis.backfillOperations?.filter(op => {
          const days = Math.ceil(
            (new Date(op.endDate).getTime() - new Date(op.startDate).getTime()) / (24 * 60 * 60 * 1000)
          );
          return days < 3;
        }) || []
      };
      
      const report = {
        reportId,
        generatedAt: new Date(),
        analysis,
        backfillSuggestions,
        healthScore,
        trendAnalysis
      };
      
      console.log(`📊 Gap-Analyse-Bericht erstellt: Health Score ${healthScore}/100`);
      return report;
      
    } catch (error) {
      console.error('❌ Fehler beim Erstellen des Gap-Analyse-Berichts:', error);
      throw error;
    }
  }

  /**
   * Berechnet einen Data Health Score basierend auf der Gap-Analyse
   */
  private calculateDataHealthScore(analysis: any): number {
    const { summary } = analysis;
    
    // Basis-Score: 100
    let score = 100;
    
    // Abzüge für fehlende Tage
    score -= summary.missingDays * 5; // -5 Punkte pro fehlenden Tag
    
    // Abzüge für unvollständige Tage
    score -= summary.incompleteDays * 2; // -2 Punkte pro unvollständigen Tag
    
    // Zusätzliche Abzüge für kritische Lücken
    score -= summary.criticalGaps * 10; // -10 Punkte pro kritischer Lücke
    
    // Minimum: 0, Maximum: 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analysiert Trends in der Datenqualität über verschiedene Zeiträume
   */
  private async analyzeTrends(): Promise<{
    last7Days: { missingDays: number; incompleteDays: number };
    last30Days: { missingDays: number; incompleteDays: number };
    improvement: 'better' | 'worse' | 'stable';
  }> {
    try {
      // Analysiere letzte 7 Tage
      const last7Days = await this.analyzeDataGaps(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        new Date()
      );
      
      // Analysiere letzte 30 Tage
      const last30Days = await this.analyzeDataGaps(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        new Date()
      );
      
      // Bestimme Trend
      const recent7DayScore = this.calculateDataHealthScore(last7Days);
      const overall30DayScore = this.calculateDataHealthScore(last30Days);
      
      let improvement: 'better' | 'worse' | 'stable';
      if (recent7DayScore > overall30DayScore + 5) {
        improvement = 'better';
      } else if (recent7DayScore < overall30DayScore - 5) {
        improvement = 'worse';
      } else {
        improvement = 'stable';
      }
      
      return {
        last7Days: {
          missingDays: last7Days.summary.missingDays,
          incompleteDays: last7Days.summary.incompleteDays
        },
        last30Days: {
          missingDays: last30Days.summary.missingDays,
          incompleteDays: last30Days.summary.incompleteDays
        },
        improvement
      };
      
    } catch (error) {
      console.error('❌ Fehler bei der Trend-Analyse:', error);
      return {
        last7Days: { missingDays: 0, incompleteDays: 0 },
        last30Days: { missingDays: 0, incompleteDays: 0 },
        improvement: 'stable'
      };
    }
  }
}

export const vendonSync = new VendonSyncService();