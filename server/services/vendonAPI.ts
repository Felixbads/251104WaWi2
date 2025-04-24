import { default as axios, AxiosInstance, AxiosRequestConfig } from 'axios';

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
    this.apiKey = apiKey || process.env.VENDON_API_KEY || '';
    
    if (!this.apiKey) {
      console.error('Fehler: Kein Vendon API-Schlüssel gefunden. Bitte stellen Sie sicher, dass VENDON_API_KEY in der .env-Datei definiert ist.');
    }

    this.headers = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };

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
    method: string,
    endpoint: string,
    params: Record<string, any> = {},
    maxRetries = 3,
    retryDelay = 1000
  ): Promise<T> {
    let attempt = 1;
    let lastError: any;

    while (attempt <= maxRetries) {
      try {
        console.log(`API-Anfrage: ${method} ${endpoint} (Versuch ${attempt}/${maxRetries})`);
        console.log(`Parameter: ${JSON.stringify(params)}`);

        const config: AxiosRequestConfig = {
          method,
          url: endpoint,
        };

        // Bei GET-Anfragen verwenden wir params, bei anderen data
        if (method.toUpperCase() === 'GET') {
          config.params = params;
        } else {
          config.data = params;
        }

        const response = await this.client.request<{result: T}>(config);
        
        // Gekürzte API-Antwort für bessere Lesbarkeit
        const responseData = JSON.stringify(response.data).substring(0, 200);
        console.log(`API-Antwort: ${responseData}${responseData.length >= 200 ? '...' : ''} `);
        
        // Überprüfen, ob das result-Feld vorhanden ist
        if (!response.data || !('result' in response.data)) {
          throw new Error(`Ungültige API-Antwort: 'result'-Feld fehlt`);
        }

        return response.data.result;
      } catch (error: any) {
        console.error(`Fehler bei API-Anfrage (Versuch ${attempt}/${maxRetries}):`, error.message);
        lastError = error;
        
        // Erhöhe den Retry-Delay bei jedem Versuch
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        attempt++;
      }
    }

    // Nach allen Wiederholungsversuchen werfen wir den letzten Fehler
    throw lastError || new Error(`API-Anfrage fehlgeschlagen nach ${maxRetries} Versuchen`);
  }

  /**
   * Hilfsmethode zur Konvertierung von Datum in UNIX-Zeitstempel (Sekunden)
   */
  private convertToTimestamp(date: Date | string | number): number {
    let timestamp: number;
    
    if (typeof date === 'string') {
      timestamp = Math.floor(new Date(date).getTime() / 1000);
    } else if (date instanceof Date) {
      timestamp = Math.floor(date.getTime() / 1000);
    } else {
      timestamp = Math.floor(date / 1000);
    }
    
    return timestamp;
  }

  /**
   * Ruft alle Automaten (Maschinen) von der Vendon API ab
   */
  async getMachines() {
    return this.makeRequest<any[]>('GET', '/machines', {});
  }

  /**
   * Ruft Details zu einem bestimmten Automaten ab
   */
  async getMachineDetail(machineId: string) {
    return this.makeRequest<any>('GET', `/machines/${machineId}`, {});
  }

  /**
   * Ruft aktuelle Probleme bei Automaten ab
   */
  async getMachineIssues() {
    return this.makeRequest<any[]>('GET', '/machines/issues', {});
  }

  /**
   * Ruft den Lagerbestand eines bestimmten Automaten ab
   */
  async getMachineStock(machineId: string) {
    return this.makeRequest<any[]>('GET', `/machines/${machineId}/stock`, {});
  }

  /**
   * Ruft alle verfügbaren Lagerprodukte ab
   * Wichtig: Dies ist der verbesserte, direkte API-Endpunkt für Produkte
   * 
   * Der Vendon-API Endpunkt hat sich wahrscheinlich geändert. Wir versuchen 
   * verschiedene Varianten, beginnend mit dem aktuellsten API-Pfad
   */
  async getProducts() {
    try {
      // Erster Versuch mit dem neuesten Endpunkt
      console.log("Versuche Produkte über den neuesten API-Pfad /products abzurufen...");
      return await this.makeRequest<any[]>('GET', '/products', {});
    } catch (error) {
      console.warn("Fehler beim Abrufen über /products, versuche alternativen Pfad:", error);
      
      try {
        // Zweiter Versuch mit einem älteren Endpunkt
        console.log("Versuche Produkte über alternativen API-Pfad /stock/products abzurufen...");
        return await this.makeRequest<any[]>('GET', '/stock/products', {});
      } catch (error2) {
        console.warn("Fehler beim Abrufen über /stock/products, versuche letzten Fallback:", error2);
        
        // Dritter Versuch als letzter Fallback
        console.log("Versuche Produkte über Fallback-Methode abzurufen...");
        const machinesResponse = await this.getMachines();
        const machines = machinesResponse || [];
        
        // Extrahiere Produkte aus allen Automaten (alter Weg)
        const allProducts: any[] = [];
        for (const machine of machines) {
          try {
            const stockResponse = await this.getMachineStock(machine.id);
            const stockProducts = stockResponse || [];
            
            // Füge nur eindeutige Produkte hinzu
            for (const product of stockProducts) {
              if (!allProducts.some(p => p.id === product.product_id)) {
                allProducts.push({
                  id: product.product_id,
                  name: product.name,
                  price: product.price,
                  // Weitere Felder könnten hier hinzugefügt werden
                });
              }
            }
          } catch (machineError) {
            console.error(`Fehler beim Abrufen des Lagerbestands für Automat ${machine.id}:`, machineError);
          }
        }
        
        return allProducts;
      }
    }
  }

  /**
   * Ruft Details zu einem bestimmten Produkt ab
   */
  async getProductDetail(productId: string) {
    return this.makeRequest<any>('GET', `/products/${productId}`, {});
  }

  /**
   * Ruft alle Stock-Produkte ab (kombinierte Produktliste)
   */
  async getStockProducts() {
    return this.makeRequest<any[]>('GET', '/stock/products', {});
  }

  /**
   * Ruft Transaktionen ab
   */
  async getTransactions(
    fromDate?: Date | string | number,
    toDate?: Date | string | number,
    offset = 0,
    limit = 100
  ) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const fromTimestamp = fromDate ? this.convertToTimestamp(fromDate) : this.convertToTimestamp(yesterday);
    const toTimestamp = toDate ? this.convertToTimestamp(toDate) : this.convertToTimestamp(now);

    return this.makeRequest<any[]>('GET', '/stats/vends', {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      offset,
      limit
    });
  }

  /**
   * Ruft Events (Ereignisse) ab
   */
  async getEvents(
    fromDate?: Date | string | number,
    toDate?: Date | string | number,
    offset = 0,
    limit = 100
  ) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const fromTimestamp = fromDate ? this.convertToTimestamp(fromDate) : this.convertToTimestamp(yesterday);
    const toTimestamp = toDate ? this.convertToTimestamp(toDate) : this.convertToTimestamp(now);

    return this.makeRequest<any[]>('GET', '/stats/events', {
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      offset,
      limit
    });
  }

  /**
   * Ruft Refills (Auffüllvorgänge) ab
   */
  async getRefills(
    fromDate?: Date | string | number,
    toDate?: Date | string | number,
    offset = 0,
    limit = 100
  ) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const fromTimestamp = fromDate ? this.convertToTimestamp(fromDate) : this.convertToTimestamp(yesterday);
    const toTimestamp = toDate ? this.convertToTimestamp(toDate) : this.convertToTimestamp(now);

    return this.makeRequest<any[]>('GET', '/refills', {
      from: fromTimestamp,
      to: toTimestamp,
      offset,
      limit
    });
  }

  /**
   * Ruft Details zu einem bestimmten Refill ab
   */
  async getRefillDetail(refillId: string) {
    return this.makeRequest<any[]>('GET', `/refills/${refillId}`, {});
  }
}