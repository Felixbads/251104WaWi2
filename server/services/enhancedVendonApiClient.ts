import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { storage } from '../storage';

/**
 * Robuster Vendon API-Client mit Status-Aware Retries und Rate-Limiting
 * Basierend auf Analyse-Empfehlung für besseres Fehler-Handling
 */
export class EnhancedVendonApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;
  
  // Konfigurierbare Retry-Parameter (über Umgebungsvariablen)
  private readonly MAX_RETRIES: number;
  private readonly REQUEST_DELAY: number;
  private readonly RATE_LIMIT_DELAY: number;
  private readonly BACKOFF_MULTIPLIER: number;
  
  // Rate-Limiting
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private requestWindow: number = 60000; // 1 Minute
  private maxRequestsPerWindow: number = 100;
  
  constructor() {
    // Konfiguration aus Umgebungsvariablen
    this.baseUrl = process.env.VENDON_API_URL || 'https://cloud.vendon.net/api';
    this.apiKey = process.env.VENDON_API_KEY || '';
    
    this.MAX_RETRIES = parseInt(process.env.VENDON_MAX_RETRIES || '5');
    this.REQUEST_DELAY = parseInt(process.env.VENDON_REQUEST_DELAY || '500');
    this.RATE_LIMIT_DELAY = parseInt(process.env.VENDON_RATE_LIMIT_DELAY || '2000');
    this.BACKOFF_MULTIPLIER = parseFloat(process.env.VENDON_BACKOFF_MULTIPLIER || '1.5');
    
    if (!this.apiKey) {
      console.warn('⚠️ VENDON_API_KEY nicht gesetzt - API-Aufrufe werden fehlschlagen');
    }
    
    // Axios-Instanz mit Standard-Konfiguration
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    
    // Response-Interceptor für Logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.status} - ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(`❌ API Error: ${error.response.status} - ${error.config.url}`);
        }
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Rate-Limiting-Prüfung
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset Zähler wenn Zeitfenster abgelaufen
    if (now - this.lastRequestTime > this.requestWindow) {
      this.requestCount = 0;
    }
    
    // Prüfe ob Limit erreicht
    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitTime = this.requestWindow - (now - this.lastRequestTime);
      console.log(`⏳ Rate-Limit erreicht, warte ${waitTime}ms`);
      await this.sleep(waitTime);
      this.requestCount = 0;
    }
    
    // Minimale Verzögerung zwischen Requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.REQUEST_DELAY) {
      await this.sleep(this.REQUEST_DELAY - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }
  
  /**
   * Sleep-Funktion für Delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Berechne Backoff-Zeit basierend auf Versuch und Status-Code
   */
  private calculateBackoff(attempt: number, statusCode?: number): number {
    let baseDelay = this.REQUEST_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, attempt - 1);
    
    // Spezielle Behandlung für bestimmte Status-Codes
    if (statusCode === 429) {
      // Rate-Limit: Längere Wartezeit
      baseDelay = Math.max(baseDelay, this.RATE_LIMIT_DELAY * attempt);
    } else if (statusCode && statusCode >= 500) {
      // Server-Fehler: Moderate Wartezeit
      baseDelay = Math.max(baseDelay, 1000 * attempt);
    }
    
    // Füge Jitter hinzu um Thundering Herd zu vermeiden
    const jitter = Math.random() * 1000;
    
    return Math.min(baseDelay + jitter, 30000); // Max 30 Sekunden
  }
  
  /**
   * Prüfe ob ein Retry sinnvoll ist basierend auf Status-Code
   */
  private shouldRetry(error: AxiosError): boolean {
    if (!error.response) {
      // Netzwerk-Fehler: Retry sinnvoll
      return true;
    }
    
    const status = error.response.status;
    
    // Retryable Status-Codes
    const retryableStatuses = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
      509  // Bandwidth Limit Exceeded
    ];
    
    return retryableStatuses.includes(status);
  }
  
  /**
   * Haupt-Request-Methode mit verbessertem Error-Handling
   */
  async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    config?: any
  ): Promise<T> {
    await this.enforceRateLimit();
    
    let lastError: AxiosError | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`📡 API-Request: ${method} ${endpoint} (Versuch ${attempt}/${this.MAX_RETRIES})`);
        
        let response: AxiosResponse<T>;
        
        switch (method) {
          case 'GET':
            response = await this.client.get<T>(endpoint, config);
            break;
          case 'POST':
            response = await this.client.post<T>(endpoint, data, config);
            break;
          case 'PUT':
            response = await this.client.put<T>(endpoint, data, config);
            break;
          case 'DELETE':
            response = await this.client.delete<T>(endpoint, config);
            break;
        }
        
        // Erfolg - Log und Return
        console.log(`✅ API-Request erfolgreich: ${endpoint}`);
        return response.data;
        
      } catch (error) {
        lastError = error as AxiosError;
        
        const statusCode = lastError.response?.status;
        const statusText = lastError.response?.statusText;
        
        console.error(`❌ API-Fehler bei ${endpoint}: ${statusCode} ${statusText}`);
        
        // Prüfe ob Retry sinnvoll
        if (!this.shouldRetry(lastError)) {
          console.error(`🛑 Fehler nicht retryable: ${statusCode} - ${statusText}`);
          
          // Bei 401/403: API-Key prüfen
          if (statusCode === 401 || statusCode === 403) {
            console.error('⚠️ Authentifizierungsfehler - bitte VENDON_API_KEY prüfen');
          }
          
          throw lastError;
        }
        
        // Letzter Versuch?
        if (attempt === this.MAX_RETRIES) {
          console.error(`❌ Max Retries erreicht für ${endpoint}`);
          throw lastError;
        }
        
        // Berechne Backoff und warte
        const backoffTime = this.calculateBackoff(attempt, statusCode);
        console.log(`⏳ Warte ${backoffTime}ms vor Retry ${attempt + 1}/${this.MAX_RETRIES}`);
        await this.sleep(backoffTime);
      }
    }
    
    // Sollte nie erreicht werden
    throw lastError || new Error(`Unerwarteter Fehler bei ${endpoint}`);
  }
  
  /**
   * Convenience-Methoden
   */
  async get<T = any>(endpoint: string, config?: any): Promise<T> {
    return this.makeRequest<T>('GET', endpoint, undefined, config);
  }
  
  async post<T = any>(endpoint: string, data?: any, config?: any): Promise<T> {
    return this.makeRequest<T>('POST', endpoint, data, config);
  }
  
  async put<T = any>(endpoint: string, data?: any, config?: any): Promise<T> {
    return this.makeRequest<T>('PUT', endpoint, data, config);
  }
  
  async delete<T = any>(endpoint: string, config?: any): Promise<T> {
    return this.makeRequest<T>('DELETE', endpoint, undefined, config);
  }
  
  /**
   * Spezielle Vendon-API-Methoden
   */
  async getTransactions(params: {
    from_timestamp?: number;
    to_timestamp?: number;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    
    if (params.from_timestamp) queryParams.append('from_timestamp', params.from_timestamp.toString());
    if (params.to_timestamp) queryParams.append('to_timestamp', params.to_timestamp.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    const endpoint = `/stats/vends?${queryParams.toString()}`;
    return this.get(endpoint);
  }
  
  async getEvents(params: {
    from_timestamp?: number;
    to_timestamp?: number;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    
    if (params.from_timestamp) queryParams.append('from_timestamp', params.from_timestamp.toString());
    if (params.to_timestamp) queryParams.append('to_timestamp', params.to_timestamp.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    const endpoint = `/events?${queryParams.toString()}`;
    return this.get(endpoint);
  }
  
  async getRefills(params: {
    from_timestamp?: number;
    to_timestamp?: number;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    
    if (params.from_timestamp) queryParams.append('from_timestamp', params.from_timestamp.toString());
    if (params.to_timestamp) queryParams.append('to_timestamp', params.to_timestamp.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    const endpoint = `/refills?${queryParams.toString()}`;
    return this.get(endpoint);
  }
  
  async getMachines(): Promise<any> {
    return this.get('/machines');
  }
  
  async getProducts(): Promise<any> {
    return this.get('/products');
  }
  
  /**
   * Health-Check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/health', { timeout: 5000 });
      return true;
    } catch (error) {
      console.error('❌ Vendon API Health-Check fehlgeschlagen:', error);
      return false;
    }
  }
  
  /**
   * Statistiken für Monitoring
   */
  getStats(): {
    requestCount: number;
    lastRequestTime: number;
    isRateLimited: boolean;
  } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      isRateLimited: this.requestCount >= this.maxRequestsPerWindow
    };
  }
}

// Singleton-Instanz
let apiClientInstance: EnhancedVendonApiClient | null = null;

/**
 * Singleton-Getter für den API-Client
 */
export function getVendonApiClient(): EnhancedVendonApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new EnhancedVendonApiClient();
  }
  return apiClientInstance;
}

// Export für Kompatibilität
export default EnhancedVendonApiClient;