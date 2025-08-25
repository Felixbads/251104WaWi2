/**
 * ENHANCED VENDON API CLIENT - ROBUST RATE LIMITING & RETRY STRATEGY
 * 
 * Löst die API-Probleme aus der Analyse:
 * - Exponential backoff für 429/5xx Responses
 * - Konfigurierbare Rate-Limits
 * - Strukturiertes Logging für Retry-Zyklen
 * - Zentrale API-Client-Verwaltung
 * - Request-Queue für Burst-Protection
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

interface ApiClientConfig {
  baseUrl: string;
  apiKey: string;
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  requestsPerSecond: number;
  burstLimit: number;
  timeout: number;
}

interface RateLimitState {
  requestCount: number;
  lastReset: number;
  isBlocked: boolean;
  blockUntil: number;
}

interface RetryStats {
  attempt: number;
  lastError: string | null;
  totalRetries: number;
  delayMs: number;
}

class EnhancedVendonApiClient {
  private client: AxiosInstance;
  private config: ApiClientConfig;
  private rateLimitState: RateLimitState = {
    requestCount: 0,
    lastReset: Date.now(),
    isBlocked: false,
    blockUntil: 0
  };

  private requestQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
    request: () => Promise<any>;
  }> = [];

  private processingQueue = false;

  constructor(config?: Partial<ApiClientConfig>) {
    this.config = {
      baseUrl: "https://cloud.vendon.net/rest/v1.8.0",
      apiKey: process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB',
      maxRetries: parseInt(process.env.VENDON_MAX_RETRIES || '3'),
      initialDelay: parseInt(process.env.VENDON_INITIAL_DELAY || '1000'),
      maxDelay: parseInt(process.env.VENDON_MAX_DELAY || '30000'),
      requestsPerSecond: parseInt(process.env.VENDON_REQUESTS_PER_SECOND || '2'),
      burstLimit: parseInt(process.env.VENDON_BURST_LIMIT || '5'),
      timeout: parseInt(process.env.VENDON_TIMEOUT || '30000'),
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Token ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Enhanced-Vendon-Client/1.0'
      },
      timeout: this.config.timeout
    });

    console.log('🌐 Enhanced Vendon API Client initialisiert');
    console.log(`📊 Rate-Limit: ${this.config.requestsPerSecond} req/s, Burst: ${this.config.burstLimit}`);
  }

  /**
   * Hauptmethode für robuste API-Requests mit Rate-Limiting
   */
  async makeRequest<T>(
    endpoint: string, 
    params: Record<string, any> = {},
    options: AxiosRequestConfig = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        resolve,
        reject,
        request: () => this.executeRequest<T>(endpoint, params, options)
      });
      
      this.processRequestQueue();
    });
  }

  /**
   * Verarbeitet die Request-Queue mit Rate-Limiting
   */
  private async processRequestQueue(): Promise<void> {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.requestQueue.length > 0) {
      // Rate-Limit prüfen
      await this.enforceRateLimit();

      const queueItem = this.requestQueue.shift();
      if (!queueItem) continue;

      try {
        const result = await queueItem.request();
        queueItem.resolve(result);
      } catch (error) {
        queueItem.reject(error);
      }

      // Kleine Pause zwischen Requests
      await this.delay(1000 / this.config.requestsPerSecond);
    }

    this.processingQueue = false;
  }

  /**
   * Führt einen einzelnen Request mit Retry-Logik aus
   */
  private async executeRequest<T>(
    endpoint: string,
    params: Record<string, any>,
    options: AxiosRequestConfig
  ): Promise<T> {
    const retryStats: RetryStats = {
      attempt: 0,
      lastError: null,
      totalRetries: 0,
      delayMs: this.config.initialDelay
    };

    while (retryStats.attempt < this.config.maxRetries) {
      retryStats.attempt++;

      try {
        console.log(`📡 API Request: ${endpoint} (Versuch ${retryStats.attempt}/${this.config.maxRetries})`);
        if (Object.keys(params).length > 0) {
          console.log(`📋 Parameter:`, params);
        }

        const response = await this.client.get<any>(endpoint, {
          params,
          ...options
        });

        console.log(`✅ API Request erfolgreich: ${endpoint}`);
        
        // Reset retry stats bei Erfolg
        retryStats.totalRetries = retryStats.attempt - 1;
        
        return this.parseResponse<T>(response);

      } catch (error: any) {
        retryStats.lastError = this.extractErrorMessage(error);
        retryStats.totalRetries++;

        console.warn(`⚠️ API Request fehlgeschlagen (Versuch ${retryStats.attempt}): ${retryStats.lastError}`);

        // 429 (Rate Limit) oder 5xx (Server Error) -> Retry mit Backoff
        if (this.shouldRetry(error, retryStats.attempt)) {
          const delay = this.calculateBackoffDelay(retryStats.attempt, error.response?.status);
          retryStats.delayMs = delay;
          
          console.log(`⏳ Exponential Backoff: Warte ${delay}ms vor nächstem Versuch...`);
          console.log(`📊 Retry-Stats: { attempt: ${retryStats.attempt}, totalRetries: ${retryStats.totalRetries}, delay: ${delay}ms }`);
          
          await this.delay(delay);
          continue;
        }

        // Nicht retry-fähiger Fehler oder max retries erreicht
        console.error(`❌ API Request endgültig fehlgeschlagen nach ${retryStats.totalRetries} Retries: ${endpoint}`);
        throw error;
      }
    }

    throw new Error(`Max retries (${this.config.maxRetries}) exceeded for ${endpoint}`);
  }

  /**
   * Berechnet Backoff-Delay mit Jitter und spezielle Behandlung für Rate-Limits
   */
  private calculateBackoffDelay(attempt: number, statusCode?: number): number {
    let delay = Math.min(
      this.config.initialDelay * Math.pow(2, attempt - 1),
      this.config.maxDelay
    );

    // Spezielle Behandlung für Rate-Limits (429)
    if (statusCode === 429) {
      delay = Math.min(delay * 2, this.config.maxDelay); // Aggresiveres Backoff
    }

    // Jitter hinzufügen (±20%)
    const jitter = 0.2;
    const jitterMs = delay * jitter * (Math.random() - 0.5) * 2;
    
    return Math.max(1000, Math.floor(delay + jitterMs));
  }

  /**
   * Prüft ob ein Request retry-fähig ist
   */
  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    const status = error.response?.status;
    
    // Rate-Limits (429) und Server-Fehler (5xx) sind retry-fähig
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }

    // Network-Fehler sind retry-fähig
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return true;
    }

    return false;
  }

  /**
   * Enforced Rate-Limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowSize = 1000; // 1 Sekunde

    // Reset counter wenn Window abgelaufen
    if (now - this.rateLimitState.lastReset > windowSize) {
      this.rateLimitState.requestCount = 0;
      this.rateLimitState.lastReset = now;
      this.rateLimitState.isBlocked = false;
    }

    // Prüfe ob Block noch aktiv
    if (this.rateLimitState.isBlocked && now < this.rateLimitState.blockUntil) {
      const waitTime = this.rateLimitState.blockUntil - now;
      console.log(`🚫 Rate-Limit aktiv, warte ${waitTime}ms...`);
      await this.delay(waitTime);
      return;
    }

    // Prüfe Burst-Limit
    if (this.rateLimitState.requestCount >= this.config.burstLimit) {
      const blockDuration = windowSize;
      this.rateLimitState.isBlocked = true;
      this.rateLimitState.blockUntil = now + blockDuration;
      
      console.log(`🚫 Burst-Limit erreicht (${this.config.burstLimit} requests), blockiere für ${blockDuration}ms`);
      await this.delay(blockDuration);
    }

    this.rateLimitState.requestCount++;
  }

  /**
   * Parse API Response mit Fehlerbehandlung
   */
  private parseResponse<T>(response: AxiosResponse<any>): T {
    if (response.data && typeof response.data === 'object' && 'result' in response.data) {
      // Standard Vendon API Format
      if (Array.isArray(response.data.result)) {
        return response.data.result as T;
      } else {
        return response.data.result as T;
      }
    }
    
    // Fallback für non-standard responses
    return response.data as T;
  }

  /**
   * Extrahiert aussagekräftige Fehlermeldung
   */
  private extractErrorMessage(error: any): string {
    if (error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      const data = error.response.data;
      
      if (status === 429) {
        return `Rate limit exceeded (429)`;
      } else if (status >= 500) {
        return `Server error ${status}: ${statusText}`;
      } else if (data && typeof data === 'object' && data.message) {
        return `API error: ${data.message}`;
      } else {
        return `HTTP ${status}: ${statusText}`;
      }
    } else if (error.code) {
      return `Network error: ${error.code}`;
    } else {
      return error.message || 'Unknown error';
    }
  }

  /**
   * Utility: Promise-based delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * API-spezifische Methoden
   */
  async getTransactions(startDate: Date, endDate: Date, limit: number = 100): Promise<any[]> {
    const toUnixTimestamp = (date: Date) => Math.floor(date.getTime() / 1000);
    
    const params = {
      'from_timestamp': toUnixTimestamp(startDate),
      'to_timestamp': toUnixTimestamp(endDate),
      'limit': limit,
      'offset': 0
    };
    
    console.log(`🔍 Transactions API Call - Zeitraum: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
    
    return await this.makeRequest<any[]>('/stats/vends', params);
  }

  async getMachines(): Promise<any[]> {
    try {
      return await this.makeRequest<any[]>('/machines');
    } catch (error) {
      console.warn('⚠️ Machines API nicht verfügbar');
      return [];
    }
  }

  async getEvents(startDate: Date, endDate: Date): Promise<any[]> {
    const toUnixTimestamp = (date: Date) => Math.floor(date.getTime() / 1000);
    
    const params = {
      'from_timestamp': toUnixTimestamp(startDate),
      'to_timestamp': toUnixTimestamp(endDate),
      'limit': 100,
      'offset': 0
    };
    
    try {
      return await this.makeRequest<any[]>('/event/', params);
    } catch (error) {
      console.warn('⚠️ Events API nicht verfügbar');
      return [];
    }
  }

  async getRefills(startDate: Date, endDate: Date): Promise<any[]> {
    const toUnixTimestamp = (date: Date) => Math.floor(date.getTime() / 1000);
    
    const allRefills: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    console.log('📄 Hole Refills mit Pagination...');
    
    while (hasMore) {
      const params = {
        'from_timestamp': toUnixTimestamp(startDate),
        'to_timestamp': toUnixTimestamp(endDate),
        'limit': limit,
        'offset': offset
      };
      
      try {
        const batch = await this.makeRequest<any[]>('/refills', params);
        if (batch && batch.length > 0) {
          allRefills.push(...batch);
          console.log(`📦 Seite ${Math.floor(offset/limit) + 1}: ${batch.length} Refills erhalten (Gesamt: ${allRefills.length})`);
          
          if (batch.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.warn('⚠️ Fehler beim Abrufen von Refills - abgebrochen');
        hasMore = false;
      }
    }
    
    return allRefills;
  }

  /**
   * Status und Statistiken
   */
  getStats() {
    return {
      config: this.config,
      rateLimitState: this.rateLimitState,
      queueLength: this.requestQueue.length,
      isProcessing: this.processingQueue
    };
  }
}

// Singleton-Instanz
let enhancedApiClientInstance: EnhancedVendonApiClient | null = null;

export function getEnhancedVendonApiClientInstance(config?: Partial<ApiClientConfig>): EnhancedVendonApiClient {
  if (!enhancedApiClientInstance) {
    enhancedApiClientInstance = new EnhancedVendonApiClient(config);
  }
  return enhancedApiClientInstance;
}

export { EnhancedVendonApiClient };