/**
 * Zentraler Rate Limiter für alle Vendon API Aufrufe
 * Stellt sicher, dass das API-Limit von 60 Requests/Minute nicht überschritten wird
 */

export class VendonRateLimiter {
  private static instance: VendonRateLimiter;
  private requestQueue: Array<{ resolve: () => void; timestamp: number }> = [];
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequestsPerMinute = 50; // Konservativ unter dem 60er Limit
  private readonly windowSizeMs = 60 * 1000; // 1 Minute
  private readonly useJitter = true; // Add jitter to prevent thundering herd
  private isProcessing = false;

  private constructor() {
    // Starte Cleanup-Interval für alte Requests
    setInterval(() => {
      this.cleanupOldRequests();
    }, 5000);
  }

  public static getInstance(): VendonRateLimiter {
    if (!VendonRateLimiter.instance) {
      VendonRateLimiter.instance = new VendonRateLimiter();
    }
    return VendonRateLimiter.instance;
  }

  /**
   * Wartet bis ein API-Aufruf erlaubt ist
   */
  public async waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const now = Date.now();
      
      // Bereinige alte Requests
      this.cleanupOldRequests();
      
      // Prüfe ob wir bereits am Limit sind
      if (this.requestCount >= this.maxRequestsPerMinute) {
        // Füge Request zur Warteschlange hinzu
        this.requestQueue.push({ resolve, timestamp: now });
        this.processQueue();
      } else {
        // Request kann sofort ausgeführt werden
        this.requestCount++;
        resolve();
      }
    });
  }

  /**
   * Verarbeitet die Warteschlange
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      this.cleanupOldRequests();
      
      if (this.requestCount < this.maxRequestsPerMinute) {
        const next = this.requestQueue.shift();
        if (next) {
          this.requestCount++;
          next.resolve();
        }
      } else {
        // Warte bis ein Slot frei wird (mit Jitter)
        const baseDelay = 1000;
        const jitter = this.useJitter ? Math.random() * 200 : 0; // 0-200ms jitter
        await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Entfernt alte Requests aus dem aktuellen Zeitfenster
   */
  private cleanupOldRequests(): void {
    const now = Date.now();
    
    // Wenn das Zeitfenster abgelaufen ist, zurücksetzen
    if (now - this.windowStart >= this.windowSizeMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }
  }

  /**
   * Gibt aktuelle Statistiken zurück
   */
  public getStats(): { requestCount: number; maxRequests: number; queueLength: number } {
    this.cleanupOldRequests();
    return {
      requestCount: this.requestCount,
      maxRequests: this.maxRequestsPerMinute,
      queueLength: this.requestQueue.length
    };
  }
}

export const vendonRateLimiter = VendonRateLimiter.getInstance();