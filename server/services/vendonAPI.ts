/**
 * Verbesserte Vendon API Klasse
 * Bietet einen zuverlässigen Zugriff auf die Vendon API mit
 * - Robusten Fehlerbehandlungsstrategien
 * - Automatischen Wiederholungsversuchen
 * - Ratenbegrenzung zur Vermeidung von API-Limits
 */

const DEFAULT_API_KEY = process.env.VENDON_API_KEY || '';
const DEFAULT_API_BASE_URL = 'https://api.vendon.net/v1';

// Anzahl der maximalen Wiederholungsversuche
const MAX_RETRIES = 3;
// Timeout zwischen Wiederholungsversuchen in ms (exponential backoff)
const RETRY_BASE_DELAY = 1000;
// Rate limiting: Anzahl der API-Anfragen pro Minute
const MAX_REQUESTS_PER_MINUTE = 60;

export class VendonAPI {
  private apiKey: string;
  private apiBaseUrl: string;
  private requestCount: number = 0;
  private lastResetTime: number = Date.now();
  
  constructor(apiKey?: string, apiBaseUrl?: string) {
    this.apiKey = apiKey || DEFAULT_API_KEY;
    this.apiBaseUrl = apiBaseUrl || DEFAULT_API_BASE_URL;
    
    // Reset des Request-Counters alle 60 Sekunden
    setInterval(() => {
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }, 60000);
  }
  
  /**
   * Führt eine API-Anfrage mit automatischen Wiederholungen und Ratenbegrenzung durch
   * @param endpoint API-Endpunkt (ohne Basis-URL)
   * @param params Optionale Parameter
   * @param method HTTP-Methode (default: GET)
   * @param body Optionaler Request-Body für POST-Anfragen
   * @returns API-Antwort oder null im Fehlerfall
   */
  async request(
    endpoint: string,
    params: Record<string, any> = {},
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<any> {
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        // Ratenbegrenzung prüfen
        await this.checkRateLimit();
        
        // Aktuellen Versuch protokollieren
        console.log(`API-Anfrage: ${method} ${endpoint} (Versuch ${retries + 1}/${MAX_RETRIES})`);
        console.log(`Parameter: ${JSON.stringify(params)}`);
        
        // URL mit Parametern aufbauen
        let url = `${this.apiBaseUrl}${endpoint}`;
        
        // Für GET-Anfragen Parameter an URL anhängen
        if (method === 'GET' && Object.keys(params).length > 0) {
          const queryParams = new URLSearchParams();
          for (const [key, value] of Object.entries(params)) {
            queryParams.append(key, String(value));
          }
          url += `?${queryParams.toString()}`;
        }

        // Request-Optionen
        const options: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        };
        
        // Für POST-Anfragen Body hinzufügen
        if (method === 'POST') {
          options.body = JSON.stringify(body || params);
        }
        
        // API-Anfrage ausführen
        console.log(`API-Anfrage: ${method} ${endpoint} (Versuch ${retries + 1}/${MAX_RETRIES})`);
        console.log(`Parameter: ${JSON.stringify(method === 'GET' ? params : body || params)}`);
        
        const response = await fetch(url, options);
        this.requestCount++;
        
        // Fehlerbehandlung basierend auf HTTP-Status
        if (!response.ok) {
          throw new Error(`API-Fehler: ${response.status} ${response.statusText}`);
        }
        
        // Antwort parsen
        const data = await response.json();
        
        // API-spezifische Fehlerbehandlung
        if (data.code !== 200) {
          throw new Error(`API-Fehler: ${data.code} ${data.message || 'Unbekannter Fehler'}`);
        }
        
        return data.result;
      } catch (error) {
        retries++;
        console.error(`API-Fehler (Versuch ${retries}/${MAX_RETRIES}):`, error);
        
        // Nach dem letzten Versuch den Fehler weiterreichen
        if (retries >= MAX_RETRIES) {
          throw error;
        }
        
        // Exponential Backoff für den nächsten Versuch
        const delay = RETRY_BASE_DELAY * Math.pow(2, retries - 1);
        console.log(`Warte ${delay}ms vor dem nächsten Versuch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Sollte nicht erreicht werden, da im letzten Versuch ein Fehler geworfen würde
    return null;
  }
  
  /**
   * Prüft Ratenbegrenzung und wartet gegebenenfalls
   */
  private async checkRateLimit(): Promise<void> {
    if (this.requestCount >= MAX_REQUESTS_PER_MINUTE) {
      const now = Date.now();
      const timeElapsed = now - this.lastResetTime;
      
      // Wenn fast eine Minute vorbei ist, warte bis zum Reset
      if (timeElapsed < 60000) {
        const waitTime = 60000 - timeElapsed + 100; // +100ms Puffer
        console.log(`Rate-Limit erreicht, warte ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  /**
   * Holt alle Produkte von der API
   * @returns Liste aller Produkte
   */
  async getProducts(): Promise<any[]> {
    try {
      return await this.request('/products', { limit: 1000 });
    } catch (error) {
      console.error('Fehler beim Abrufen der Produkte:', error);
      return [];
    }
  }
  
  /**
   * Holt ein Produkt anhand seiner ID
   * @param id Die Produkt-ID
   * @returns Produktdetails oder null im Fehlerfall
   */
  async getProduct(id: string): Promise<any | null> {
    try {
      return await this.request(`/products/${id}`);
    } catch (error) {
      console.error(`Fehler beim Abrufen des Produkts ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Holt alle Automaten von der API
   * @returns Liste aller Automaten
   */
  async getMachines(): Promise<any[]> {
    try {
      return await this.request('/machines', { limit: 500 });
    } catch (error) {
      console.error('Fehler beim Abrufen der Automaten:', error);
      return [];
    }
  }
  
  /**
   * Holt alle Transaktionen innerhalb eines Zeitraums
   * @param fromDate Startdatum
   * @param toDate Enddatum (optional, default: jetzt)
   * @param limit Anzahl der zurückzugebenden Ergebnisse (max. 1000)
   * @returns Liste der Transaktionen
   */
  async getTransactions(
    fromDate: Date,
    toDate: Date = new Date(),
    limit: number = 1000
  ): Promise<any[]> {
    try {
      const fromTimestamp = Math.floor(fromDate.getTime() / 1000);
      const toTimestamp = Math.floor(toDate.getTime() / 1000);
      
      return await this.request('/stats/vends', {
        from_timestamp: fromTimestamp,
        to_timestamp: toTimestamp,
        limit
      });
    } catch (error) {
      console.error('Fehler beim Abrufen der Transaktionen:', error);
      return [];
    }
  }
  
  /**
   * Holt alle Lagerbestände für einen bestimmten Automaten
   * @param machineId Die Automaten-ID
   * @returns Liste der Lagerbestände oder null im Fehlerfall
   */
  async getMachineStock(machineId: string): Promise<any[] | null> {
    try {
      return await this.request(`/machines/${machineId}/stock`);
    } catch (error) {
      console.error(`Fehler beim Abrufen der Lagerbestände für Automat ${machineId}:`, error);
      return null;
    }
  }
}

// Exportiere eine Default-Instanz
export const vendonAPI = new VendonAPI();