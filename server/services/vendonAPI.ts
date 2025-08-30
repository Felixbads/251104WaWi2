/**
 * Verbesserte Vendon API Klasse
 * Bietet einen zuverlässigen Zugriff auf die Vendon API mit
 * - Robusten Fehlerbehandlungsstrategien
 * - Automatischen Wiederholungsversuchen
 * - Ratenbegrenzung zur Vermeidung von API-Limits
 */

const DEFAULT_API_KEY = process.env.VENDON_API_KEY || '';
// Basierend auf der API-Dokumentation
const DEFAULT_API_BASE_URL = 'https://cloud.vendon.net/rest/v1.8.0';

// Anzahl der maximalen Wiederholungsversuche
const MAX_RETRIES = 3;
// Timeout zwischen Wiederholungsversuchen in ms (exponential backoff)
const RETRY_BASE_DELAY = 1000;
import { vendonRateLimiter } from './vendonRateLimiter';

export class VendonAPI {
  private apiKey: string;
  // Mache apiBaseUrl öffentlich zugänglich für Debug-Endpunkte
  public readonly apiBaseUrl: string;
  private requestCount: number = 0;
  
  constructor(apiKey?: string, apiBaseUrl?: string) {
    this.apiKey = apiKey || DEFAULT_API_KEY;
    this.apiBaseUrl = apiBaseUrl || DEFAULT_API_BASE_URL;
    
    // Masking des API-Keys für Logs
    const maskedKey = this.apiKey.length >= 4 ? 
      "****" + this.apiKey.slice(-4) : "****";
    console.log(`Vendon API initialisiert mit Basis-URL: ${this.apiBaseUrl}`);
    console.log(`API-Schlüssel: ${maskedKey}`);
    
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
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        // Zentrales Rate Limiting verwenden
        await vendonRateLimiter.waitForSlot();
        
        // URL mit Parametern aufbauen
        let url = `${this.apiBaseUrl}${endpoint}`;
        
        // Für GET-Anfragen Parameter an URL anhängen
        if (method === 'GET' && Object.keys(params).length > 0) {
          const queryParams = new URLSearchParams();
          for (const [key, value] of Object.entries(params)) {
            if (Array.isArray(value)) {
              // Arrays werden als wiederholte Parameter übergeben
              for (const item of value) {
                queryParams.append(`${key}[]`, String(item));
              }
            } else {
              queryParams.append(key, String(value));
            }
          }
          url += `?${queryParams.toString()}`;
        }

        // Request-Optionen
        const options: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Laut API-Dokumentation wird "Token" verwendet
            'Authorization': `Token ${this.apiKey}`
          }
        };
        
        // Für POST/PUT-Anfragen Body hinzufügen
        if (method === 'POST' || method === 'PUT') {
          options.body = JSON.stringify(body || params);
        }
        
        // API-Anfrage ausführen
        console.log(`API-Anfrage: ${method} ${endpoint} (Versuch ${retries + 1}/${MAX_RETRIES})`);
        console.log(`Parameter: ${JSON.stringify(method === 'GET' ? params : {})}`);
        
        const response = await fetch(url, options);
        this.requestCount++;
        
        // Prüfen für leere Antwort
        if (response.status === 204) {
          return null; // No Content
        }
        
        // Antwort parsen
        const data = await response.json();
        
        // Fehlerbehandlung basierend auf HTTP-Status
        if (!response.ok) {
          console.error(`API-Fehler Response: ${JSON.stringify(data)}`);
          throw new Error(`API-Fehler: ${response.status} ${response.statusText}`);
        }
        
        // API-spezifische Fehlerbehandlung gemäß Dokumentation
        if (data.code !== 200) {
          throw new Error(`API-Fehler: ${data.code} ${data.result || 'Unbekannter Fehler'}`);
        }
        
        console.log(`API-Antwort: Erfolg (Code ${data.code})`);
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
   * Holt alle Produkte von der API
   * Basierend auf der API-Dokumentation
   * @returns Liste aller Produkte
   */
  async getProducts(): Promise<any[]> {
    try {
      // Korrekte Endpoint entsprechend der Dokumentation
      return await this.request('/stock', { limit: 1000 });
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
      // ID als Parameter verwenden
      const products = await this.request('/stock', { id });
      
      // Die API gibt ein Array zurück, auch wenn nur ein Produkt angefordert wurde
      if (Array.isArray(products) && products.length > 0) {
        console.log(`Produkt mit ID ${id} erfolgreich abgerufen`);
        return products[0]; // Wir nehmen das erste Element
      } else {
        console.warn(`Kein Produkt mit ID ${id} gefunden`);
        return null;
      }
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
      return await this.request('/machine', { limit: 500 });
    } catch (error) {
      console.error('Fehler beim Abrufen der Automaten:', error);
      return [];
    }
  }
  
  /**
   * Holt einen Automaten anhand seiner ID
   * @param id Die Automaten-ID
   * @returns Automatendetails oder null im Fehlerfall
   */
  async getMachine(id: string): Promise<any | null> {
    try {
      return await this.request(`/machine/${id}`);
    } catch (error) {
      console.error(`Fehler beim Abrufen des Automaten ${id}:`, error);
      return null;
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
   * Holt Transaktionen mit mehr Parametern und paginiert
   * @param params Parameter für die Anfrage
   * @returns API-Antwort mit Ergebnissen
   */
  async getVendTransactions(params: {
    from_timestamp: number;
    to_timestamp: number;
    limit?: number;
    offset?: number;
    machine_id?: string | number;
  }): Promise<any> {
    try {
      console.log(`Verwende Zeitraum: ${new Date(params.from_timestamp * 1000).toISOString()} bis ${new Date(params.to_timestamp * 1000).toISOString()}`);
      console.log(`Timestamps: ${params.from_timestamp} bis ${params.to_timestamp}`);
      
      // Vollständige API-Antwort zurückgeben, um den Statuscode zu prüfen
      return await this.request('/stats/vends', params, 'GET');
    } catch (error) {
      console.error('Fehler beim Abrufen der Vendon-Transaktionen:', error);
      throw error; // Fehler weiterreichen für bessere Fehlerbehandlung
    }
  }
  
  /**
   * Holt alle Lagerbestände für einen bestimmten Automaten
   * @param machineId Die Automaten-ID
   * @returns Liste der Lagerbestände oder null im Fehlerfall
   */
  async getMachineStock(machineId: string): Promise<any[] | null> {
    try {
      return await this.request(`/machine/${machineId}/stock`);
    } catch (error) {
      console.error(`Fehler beim Abrufen der Lagerbestände für Automat ${machineId}:`, error);
      return null;
    }
  }

  /**
   * Holt alle Refill-Vorlagen für einen bestimmten Automaten
   * @param machineId Die Automaten-ID  
   * @returns Liste der Refill-Vorlagen oder null im Fehlerfall
   */
  async getMachineRefillTemplates(machineId: string): Promise<any[] | null> {
    try {
      console.log(`[VENDON API] Fetching refill templates for machine ${machineId}`);
      return await this.request(`/machine/${machineId}/refilltemplates`);
    } catch (error) {
      console.error(`Fehler beim Abrufen der Refill-Vorlagen für Automat ${machineId}:`, error);
      return null;
    }
  }

  /**
   * Erstellt eine neue Refill-Vorlage für einen Automaten
   * @param machineId Die Automaten-ID
   * @param templateData Die Vorlage-Daten
   * @returns Erstellte Vorlage oder null im Fehlerfall
   */
  async createMachineRefillTemplate(machineId: string, templateData: any): Promise<any | null> {
    try {
      console.log(`[VENDON API] Creating refill template for machine ${machineId}`);
      return await this.request(`/machine/${machineId}/refilltemplates`, templateData, 'POST');
    } catch (error) {
      console.error(`Fehler beim Erstellen der Refill-Vorlage für Automat ${machineId}:`, error);
      return null;
    }
  }
}

/**
 * Ruft die Lagerbestände für eine bestimmte Maschine ab (für Stock Sync Service)
 * @param machineId Die Vendon Machine ID
 * @returns Promise mit Bestandsdaten in einem format das stockSyncService erwartet
 */
export async function fetchMachineStock(machineId: number) {
  try {
    const apiKey = process.env.VENDON_API_KEY;
    if (!apiKey) {
      console.error('VENDON_API_KEY nicht gefunden');
      return null;
    }

    console.log(`[VENDON API] Abrufen der Lagerbestände für Maschine ${machineId}...`);
    
    const url = `https://cloud.vendon.net/rest/v1.8.0/machine/${machineId}/stock`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[VENDON API] HTTP ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    if (data.code === 200 && Array.isArray(data.result)) {
      console.log(`[VENDON API] ✅ ${data.result.length} Bestände für Maschine ${machineId} abgerufen`);
      return { products: data.result };
    } else {
      console.error(`[VENDON API] Unerwartete Antwort:`, data);
      return null;
    }
  } catch (error) {
    console.error(`[VENDON API] Fehler beim Abrufen der Bestände für Maschine ${machineId}:`, error);
    return null;
  }
}

/**
 * Ruft die Produktbestände für eine bestimmte Maschine ab
 * @param machineId Die Vendon Machine ID
 * @returns Promise mit Produktbeständen oder null bei Fehler
 */
export async function fetchMachineProducts(machineId: number) {
  try {
    const apiKey = process.env.VENDON_API_KEY;
    if (!apiKey) {
      console.error('VENDON_API_KEY nicht gefunden');
      return null;
    }

    console.log(`[VENDON API] Abrufen der Produktbestände für Maschine ${machineId}...`);
    
    const url = `https://cloud.vendon.net/rest/v1.9.0/machine/${machineId}/products`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[VENDON API] HTTP ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    if (data.code === 200 && Array.isArray(data.result)) {
      console.log(`[VENDON API] ✅ ${data.result.length} Produkte für Maschine ${machineId} abgerufen`);
      return data.result;
    } else {
      console.error(`[VENDON API] Unerwartete Antwort:`, data);
      return null;
    }
    
  } catch (error) {
    console.error(`[VENDON API] Fehler beim Abrufen der Produktbestände für Maschine ${machineId}:`, error);
    return null;
  }
}

// Exportiere eine Default-Instanz
export const vendonAPI = new VendonAPI();
export default vendonAPI;