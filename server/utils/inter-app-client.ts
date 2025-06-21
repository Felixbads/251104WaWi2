import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createInterAppSignature } from '../middleware/inter-app-auth';

/**
 * Client für sichere Kommunikation mit anderen Replit-Anwendungen
 */
export class InterAppClient {
  private client: AxiosInstance;
  private appSource: string;
  private baseURL: string;

  constructor(baseURL: string, appSource: string = 'main-app') {
    this.baseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    this.appSource = appSource;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `InterAppClient/${appSource}`
      }
    });

    // Request Interceptor für automatische Signierung
    this.client.interceptors.request.use((config) => {
      try {
        const method = (config.method || 'GET').toUpperCase();
        const path = config.url || '/';
        const body = config.data || null;
        
        const authData = createInterAppSignature(method, path, body, this.appSource);
        
        // Headers für Authentifizierung setzen
        config.headers = {
          ...config.headers,
          ...authData.headers
        };
        
        console.log(`[INTER-APP-CLIENT] ${method} ${path} - Signatur erstellt`);
        return config;
      } catch (error) {
        console.error('[INTER-APP-CLIENT] Fehler bei Request-Signierung:', error);
        throw error;
      }
    });

    // Response Interceptor für Logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[INTER-APP-CLIENT] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      (error) => {
        const status = error.response?.status || 'NETWORK_ERROR';
        const url = error.config?.url || 'unknown';
        console.error(`[INTER-APP-CLIENT] ${error.config?.method?.toUpperCase()} ${url} - ${status}:`, 
          error.response?.data || error.message);
        throw error;
      }
    );
  }

  /**
   * Health Check der Ziel-Anwendung
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/inter-app/health');
      return response.data?.success === true;
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Health Check fehlgeschlagen:', error);
      return false;
    }
  }

  /**
   * Alle Lieferanten abrufen
   */
  async getSuppliers(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/inter-app/suppliers');
      return response.data?.data || [];
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen der Lieferanten:', error);
      throw new Error(`Fehler beim Abrufen der Lieferanten: ${error.message}`);
    }
  }

  /**
   * Spezifischen Lieferanten abrufen
   */
  async getSupplier(id: number): Promise<any | null> {
    try {
      const response = await this.client.get(`/api/inter-app/suppliers/${id}`);
      return response.data?.data || null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen des Lieferanten:', error);
      throw new Error(`Fehler beim Abrufen des Lieferanten: ${error.message}`);
    }
  }

  /**
   * Produkte abrufen (mit Pagination)
   */
  async getProducts(options: {
    supplierId?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ data: any[]; pagination: any }> {
    try {
      const params = new URLSearchParams();
      if (options.supplierId) params.append('supplier_id', options.supplierId.toString());
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());

      const response = await this.client.get(`/api/inter-app/products?${params.toString()}`);
      return {
        data: response.data?.data || [],
        pagination: response.data?.pagination || {}
      };
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen der Produkte:', error);
      throw new Error(`Fehler beim Abrufen der Produkte: ${error.message}`);
    }
  }

  /**
   * Spezifisches Produkt abrufen
   */
  async getProduct(id: number): Promise<any | null> {
    try {
      const response = await this.client.get(`/api/inter-app/products/${id}`);
      return response.data?.data || null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen des Produkts:', error);
      throw new Error(`Fehler beim Abrufen des Produkts: ${error.message}`);
    }
  }

  /**
   * Lager abrufen
   */
  async getWarehouses(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/inter-app/warehouses');
      return response.data?.data || [];
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen der Lager:', error);
      throw new Error(`Fehler beim Abrufen der Lager: ${error.message}`);
    }
  }

  /**
   * Daten-Vollständigkeitsanalyse abrufen
   */
  async getDataCompleteness(): Promise<any> {
    try {
      const response = await this.client.get('/api/inter-app/data-completeness');
      return response.data?.data || {};
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler bei Vollständigkeitsanalyse:', error);
      throw new Error(`Fehler bei der Vollständigkeitsanalyse: ${error.message}`);
    }
  }

  /**
   * Generische GET-Anfrage
   */
  async get(path: string, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.client.get(path, config);
      return response.data;
    } catch (error) {
      console.error(`[INTER-APP-CLIENT] GET ${path} fehlgeschlagen:`, error);
      throw error;
    }
  }

  /**
   * Generische POST-Anfrage
   */
  async post(path: string, data?: any, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.client.post(path, data, config);
      return response.data;
    } catch (error) {
      console.error(`[INTER-APP-CLIENT] POST ${path} fehlgeschlagen:`, error);
      throw error;
    }
  }

  /**
   * Verbindung testen und Details abrufen
   */
  async testConnection(): Promise<{
    success: boolean;
    details: any;
    error?: string;
  }> {
    try {
      const health = await this.healthCheck();
      
      if (!health) {
        return {
          success: false,
          details: null,
          error: 'Health Check fehlgeschlagen'
        };
      }

      const [suppliers, products, completeness] = await Promise.all([
        this.getSuppliers().catch(() => []),
        this.getProducts({ limit: 10 }).catch(() => ({ data: [], pagination: {} })),
        this.getDataCompleteness().catch(() => ({}))
      ]);

      return {
        success: true,
        details: {
          suppliersCount: suppliers.length,
          productsCount: products.data.length,
          completeness,
          baseURL: this.baseURL,
          appSource: this.appSource
        }
      };
    } catch (error) {
      return {
        success: false,
        details: null,
        error: error.message
      };
    }
  }
}

/**
 * Factory-Funktion für Inter-App Client
 */
export function createInterAppClient(targetAppURL: string, sourceAppName: string = 'main-app'): InterAppClient {
  return new InterAppClient(targetAppURL, sourceAppName);
}

/**
 * Standardisierte Fehlerbehandlung für Inter-App Kommunikation
 */
export class InterAppError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: any;

  constructor(message: string, code: string = 'INTER_APP_ERROR', statusCode?: number, details?: any) {
    super(message);
    this.name = 'InterAppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static fromAxiosError(error: any): InterAppError {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const code = errorData?.code || 'NETWORK_ERROR';
    const message = errorData?.error || error.message || 'Unbekannter Fehler';
    
    return new InterAppError(message, code, statusCode, errorData);
  }
}