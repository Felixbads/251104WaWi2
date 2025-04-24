import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

/**
 * Verbesserte Vendon API Client Klasse
 * Extrahiert aus der vendonSync.ts, um eine klare Trennung zwischen API und Sync-Logik zu schaffen
 */
export class VendonAPI {
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
   * Hilfsmethode zur Konvertierung von Datum in UNIX-Zeitstempel (Sekunden)
   */
  private convertToTimestamp(date: Date | string | number): number {
    if (date instanceof Date) {
      return Math.floor(date.getTime() / 1000);
    } else if (typeof date === 'string') {
      return Math.floor(new Date(date).getTime() / 1000);
    } else {
      // Wenn bereits ein Zeitstempel, prüfen ob ms oder s
      return date > 10000000000 ? Math.floor(date / 1000) : date;
    }
  }

  /**
   * Ruft alle Automaten (Maschinen) von der Vendon API ab
   */
  async getMachines() {
    return this.makeRequest<any[]>('/machine/');
  }
  
  /**
   * Ruft Details zu einem bestimmten Automaten ab
   */
  async getMachineDetail(machineId: string) {
    return this.makeRequest<any>(`/machine/${machineId}`);
  }
  
  /**
   * Ruft aktuelle Probleme bei Automaten ab
   */
  async getMachineIssues() {
    return this.makeRequest<any[]>('/machine/issues');
  }

  /**
   * Ruft den Lagerbestand eines bestimmten Automaten ab
   */
  async getMachineStock(machineId: string) {
    return this.makeRequest<any[]>(`/machine/${machineId}/stock`);
  }

  /**
   * Ruft alle verfügbaren Lagerprodukte ab
   * Wichtig: Dies ist der verbesserte, direkte API-Endpunkt für Produkte
   */
  async getProducts() {
    return this.makeRequest<any[]>('/product/');
  }

  /**
   * Ruft Details zu einem bestimmten Produkt ab
   */
  async getProductDetail(productId: string) {
    return this.makeRequest<any>(`/product/${productId}`);
  }

  /**
   * Ruft alle Stock-Produkte ab (kombinierte Produktliste)
   */
  async getStockProducts() {
    return this.makeRequest<any[]>('/stock/product');
  }

  /**
   * Ruft Transaktionen ab
   */
  async getTransactions(
    startDate: Date | string | number,
    endDate: Date | string | number,
    machineId?: string,
    offset: number = 0,
    limit: number = 100
  ) {
    // Konvertiere Daten in UNIX-Zeitstempel (Sekunden)
    const fromTimestamp = this.convertToTimestamp(startDate);
    const toTimestamp = this.convertToTimestamp(endDate);
    
    const params: Record<string, any> = {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      offset,
      limit
    };
    
    // Füge die Maschinen-ID hinzu, wenn vorhanden
    if (machineId) {
      params.machine_id = machineId;
    }
    
    const result = await this.makeRequest<any>('/stats/vends', 'GET', params);
    
    // Strukturiere die Antwort für einfachere Handhabung
    return {
      data: Array.isArray(result) ? result : [],
      total: Array.isArray(result) ? result.length : 0,
      offset,
      limit
    };
  }

  /**
   * Ruft Events (Ereignisse) ab
   */
  async getEvents(
    startDate: Date | string | number,
    endDate: Date | string | number,
    machineId?: string,
    offset: number = 0,
    limit: number = 100
  ) {
    // Konvertiere Daten in UNIX-Zeitstempel (Sekunden)
    const fromTimestamp = this.convertToTimestamp(startDate);
    const toTimestamp = this.convertToTimestamp(endDate);
    
    const params: Record<string, any> = {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      offset,
      limit
    };
    
    // Füge die Maschinen-ID hinzu, wenn vorhanden
    if (machineId) {
      params.machine_id = machineId;
    }
    
    const result = await this.makeRequest<any>('/event/', 'GET', params);
    
    // Strukturiere die Antwort für einfachere Handhabung
    return {
      data: Array.isArray(result) ? result : [],
      total: Array.isArray(result) ? result.length : 0,
      offset,
      limit
    };
  }

  /**
   * Ruft Refills (Auffüllvorgänge) ab
   */
  async getRefills(
    startDate: Date | string | number,
    endDate: Date | string | number,
    machineId?: string,
    offset: number = 0,
    limit: number = 100
  ) {
    // Konvertiere Daten in UNIX-Zeitstempel (Sekunden)
    const fromTimestamp = this.convertToTimestamp(startDate);
    const toTimestamp = this.convertToTimestamp(endDate);
    
    const params: Record<string, any> = {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      offset,
      limit
    };
    
    // Füge die Maschinen-ID hinzu, wenn vorhanden
    if (machineId) {
      params.machine_id = machineId;
    }
    
    const result = await this.makeRequest<any>('/refill/', 'GET', params);
    
    // Strukturiere die Antwort für einfachere Handhabung
    return {
      data: Array.isArray(result) ? result : [],
      total: Array.isArray(result) ? result.length : 0,
      offset,
      limit
    };
  }

  /**
   * Ruft Details zu einem bestimmten Refill ab
   */
  async getRefillDetail(refillId: string) {
    return this.makeRequest<any>(`/refill/${refillId}`);
  }
}