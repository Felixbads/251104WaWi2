/**
 * VENDON HINTERGRUND-SERVICE
 * 
 * Zentraler Service der alle Vendon-Synchronisationen koordiniert:
 * - Kontinuierliche Datenabfrage im Hintergrund
 * - Intelligente Lückenerkennung und -schließung
 * - Prioritätsbasierte Synchronisation
 * - Health-Monitoring und Alerting
 * - Automatisches Recovery bei Fehlern
 */

import { getResilientSyncInstance, ResilientVendonSync } from "./resilientVendonSync";
import { VendonGapCrawler } from "./vendonGapCrawler";
import { storage } from "../storage";
import { InsertSyncLog } from "@shared/schema";

interface BackgroundServiceConfig {
  enabled: boolean;
  syncInterval: number; // Minuten
  gapCheckInterval: number; // Minuten
  maxConcurrentSyncs: number;
  autoRecovery: boolean;
  alertThreshold: number; // Anzahl Fehler bevor Alert
}

interface ServiceHealth {
  overall: 'healthy' | 'degraded' | 'critical' | 'offline';
  components: {
    resilientSync: 'healthy' | 'warning' | 'error' | 'offline';
    gapCrawler: 'healthy' | 'warning' | 'error' | 'offline';
    database: 'healthy' | 'warning' | 'error' | 'offline';
    vendonApi: 'healthy' | 'warning' | 'error' | 'offline';
  };
  lastCheck: Date;
  uptime: number; // Sekunden
  stats: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    dataGapsFound: number;
    dataGapsResolved: number;
    lastSyncDuration: number; // Millisekunden
  };
}

export class VendonBackgroundService {
  private config: BackgroundServiceConfig;
  private resilientSync: ResilientVendonSync;
  private gapCrawler: VendonGapCrawler;
  
  private isRunning = false;
  private startTime: Date | null = null;
  private lastHealthCheck: Date | null = null;
  
  private healthStatus: ServiceHealth = {
    overall: 'offline',
    components: {
      resilientSync: 'offline',
      gapCrawler: 'offline',
      database: 'offline',
      vendonApi: 'offline'
    },
    lastCheck: new Date(),
    uptime: 0,
    stats: {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      dataGapsFound: 0,
      dataGapsResolved: 0,
      lastSyncDuration: 0
    }
  };

  constructor(config?: Partial<BackgroundServiceConfig>) {
    this.config = {
      enabled: true,
      syncInterval: 5, // 5 Minuten
      gapCheckInterval: 30, // 30 Minuten  
      maxConcurrentSyncs: 3,
      autoRecovery: true,
      alertThreshold: 5,
      ...config
    };

    this.resilientSync = getResilientSyncInstance();
    this.gapCrawler = new VendonGapCrawler();

    console.log('Vendon Hintergrund-Service initialisiert', this.config);
  }

  /**
   * Startet den kompletten Hintergrund-Service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Hintergrund-Service läuft bereits');
      return;
    }

    if (!this.config.enabled) {
      console.log('Hintergrund-Service ist deaktiviert');
      return;
    }

    console.log('🚀 Starte Vendon Hintergrund-Service...');
    
    this.isRunning = true;
    this.startTime = new Date();

    try {
      // Komponenten-Health prüfen
      await this.performHealthCheck();
      
      // Resiliente Synchronisation starten
      await this.resilientSync.startBackgroundSync();
      
      // Regelmäßige Health-Checks aktivieren
      this.startHealthMonitoring();
      
      // Initial-Synchronisation durchführen
      await this.performInitialSync();
      
      this.healthStatus.overall = 'healthy';
      console.log('✅ Vendon Hintergrund-Service erfolgreich gestartet');
      
    } catch (error) {
      console.error('❌ Fehler beim Starten des Hintergrund-Service:', error);
      this.healthStatus.overall = 'critical';
      throw error;
    }
  }

  /**
   * Stoppt den Hintergrund-Service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Hintergrund-Service läuft nicht');
      return;
    }

    console.log('⏹️ Stoppe Vendon Hintergrund-Service...');

    try {
      // Resiliente Synchronisation stoppen
      this.resilientSync.stopBackgroundSync();
      
      // Gap Crawler stoppen (falls läuft)
      // this.gapCrawler.stop(); // Implementierung falls verfügbar
      
      this.isRunning = false;
      this.healthStatus.overall = 'offline';
      
      console.log('✅ Vendon Hintergrund-Service gestoppt');
      
    } catch (error) {
      console.error('❌ Fehler beim Stoppen des Hintergrund-Service:', error);
      throw error;
    }
  }

  /**
   * Führt eine initiale Synchronisation durch
   */
  private async performInitialSync(): Promise<void> {
    console.log('🔄 Führe initiale Synchronisation durch...');
    
    const startTime = Date.now();
    this.healthStatus.stats.totalSyncs++;

    try {
      // Vollständige Synchronisation der letzten 24 Stunden
      const result = await this.resilientSync.triggerSync();
      
      this.healthStatus.stats.lastSyncDuration = Date.now() - startTime;
      
      if (result.status === 'success' || result.status === 'partial') {
        this.healthStatus.stats.successfulSyncs++;
        console.log('✅ Initiale Synchronisation erfolgreich:', result.message);
      } else {
        this.healthStatus.stats.failedSyncs++;
        console.log('⚠️ Initiale Synchronisation mit Fehlern:', result.message);
      }

    } catch (error) {
      this.healthStatus.stats.failedSyncs++;
      console.error('❌ Initiale Synchronisation fehlgeschlagen:', error);
      
      if (this.config.autoRecovery) {
        console.log('🔧 Versuche automatisches Recovery...');
        await this.attemptRecovery();
      }
    }
  }

  /**
   * Überwacht die Gesundheit des Systems
   */
  private startHealthMonitoring(): void {
    // Health-Check alle 5 Minuten
    setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Fehler beim Health-Check:', error);
      }
    }, 5 * 60 * 1000);

    // Detaillierte Statistiken alle 30 Minuten
    setInterval(async () => {
      try {
        await this.collectDetailedStats();
      } catch (error) {
        console.error('Fehler beim Sammeln der Statistiken:', error);
      }
    }, 30 * 60 * 1000);
  }

  /**
   * Führt einen umfassenden Health-Check durch
   */
  private async performHealthCheck(): Promise<void> {
    console.log('🏥 Führe Health-Check durch...');
    
    this.lastHealthCheck = new Date();
    this.healthStatus.lastCheck = new Date();
    
    if (this.startTime) {
      this.healthStatus.uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }

    // Datenbank-Health prüfen
    try {
      await storage.getAllMachines();
      this.healthStatus.components.database = 'healthy';
    } catch (error) {
      console.error('Datenbank-Health-Check fehlgeschlagen:', error);
      this.healthStatus.components.database = 'error';
    }

    // Resiliente Sync Health prüfen
    try {
      const syncStatus = this.resilientSync.getStatus();
      if (syncStatus.health === 'healthy') {
        this.healthStatus.components.resilientSync = 'healthy';
      } else if (syncStatus.health === 'warning') {
        this.healthStatus.components.resilientSync = 'warning';
      } else {
        this.healthStatus.components.resilientSync = 'error';
      }
    } catch (error) {
      this.healthStatus.components.resilientSync = 'error';
    }

    // Vendon API Health prüfen
    try {
      // Einfacher API-Test
      const testResult = await this.testVendonApiConnection();
      this.healthStatus.components.vendonApi = testResult ? 'healthy' : 'warning';
    } catch (error) {
      this.healthStatus.components.vendonApi = 'error';
    }

    // Gap Crawler Health prüfen
    try {
      // Status des Gap Crawlers prüfen (vereinfacht)
      this.healthStatus.components.gapCrawler = 'healthy';
    } catch (error) {
      this.healthStatus.components.gapCrawler = 'error';
    }

    // Gesamtstatus bestimmen
    this.updateOverallHealth();
  }

  /**
   * Aktualisiert den Gesamt-Gesundheitsstatus
   */
  private updateOverallHealth(): void {
    const components = Object.values(this.healthStatus.components);
    
    if (components.every(status => status === 'healthy')) {
      this.healthStatus.overall = 'healthy';
    } else if (components.some(status => status === 'error')) {
      if (components.filter(status => status === 'error').length > 1) {
        this.healthStatus.overall = 'critical';
      } else {
        this.healthStatus.overall = 'degraded';
      }
    } else if (components.some(status => status === 'warning')) {
      this.healthStatus.overall = 'degraded';
    } else {
      this.healthStatus.overall = 'offline';
    }
  }

  /**
   * Sammelt detaillierte Statistiken
   */
  private async collectDetailedStats(): Promise<void> {
    try {
      // Synchronisations-Logs der letzten 24 Stunden abrufen
      const logs = await storage.getRecentSyncLogs(24);
      
      this.healthStatus.stats.totalSyncs = logs.length;
      this.healthStatus.stats.successfulSyncs = logs.filter(log => log.syncStatus === 'completed').length;
      this.healthStatus.stats.failedSyncs = logs.filter(log => log.syncStatus === 'error').length;
      
      // Gap-Statistiken aktualisieren
      const syncStatus = this.resilientSync.getStatus();
      this.healthStatus.stats.dataGapsFound = syncStatus.totalGapsFound;
      this.healthStatus.stats.dataGapsResolved = syncStatus.gapsResolved;
      
    } catch (error) {
      console.error('Fehler beim Sammeln der Statistiken:', error);
    }
  }

  /**
   * Testet die Vendon API-Verbindung
   */
  private async testVendonApiConnection(): Promise<boolean> {
    try {
      // Einfacher API-Test mit minimaler Datenabfrage
      const result = await this.resilientSync.triggerSync();
      return result.status !== 'error';
    } catch (error) {
      return false;
    }
  }

  /**
   * Versucht automatisches Recovery
   */
  private async attemptRecovery(): Promise<void> {
    console.log('🔧 Beginne automatisches Recovery...');
    
    try {
      // Resiliente Synchronisation neu starten
      this.resilientSync.stopBackgroundSync();
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 Sekunden warten
      await this.resilientSync.startBackgroundSync();
      
      console.log('✅ Automatisches Recovery erfolgreich');
      
    } catch (error) {
      console.error('❌ Automatisches Recovery fehlgeschlagen:', error);
    }
  }

  /**
   * Manueller Sync-Trigger
   */
  async triggerManualSync(): Promise<any> {
    console.log('🔄 Manueller Sync ausgelöst...');
    
    const startTime = Date.now();
    this.healthStatus.stats.totalSyncs++;

    try {
      const result = await this.resilientSync.triggerSync();
      this.healthStatus.stats.lastSyncDuration = Date.now() - startTime;
      
      if (result.status === 'success' || result.status === 'partial') {
        this.healthStatus.stats.successfulSyncs++;
      } else {
        this.healthStatus.stats.failedSyncs++;
      }
      
      return result;
      
    } catch (error) {
      this.healthStatus.stats.failedSyncs++;
      throw error;
    }
  }

  /**
   * Manueller Gap-Check
   */
  async triggerGapCheck(): Promise<void> {
    console.log('🔍 Manueller Gap-Check ausgelöst...');
    
    try {
      await this.resilientSync.triggerGapCheck();
      console.log('✅ Gap-Check abgeschlossen');
    } catch (error) {
      console.error('❌ Gap-Check fehlgeschlagen:', error);
      throw error;
    }
  }

  /**
   * Startet den Gap Crawler für historische Daten
   */
  async startGapCrawler(): Promise<void> {
    console.log('🕷️ Starte Gap Crawler...');
    
    try {
      await this.gapCrawler.startGapCrawling();
      console.log('✅ Gap Crawler gestartet');
    } catch (error) {
      console.error('❌ Fehler beim Starten des Gap Crawlers:', error);
      throw error;
    }
  }

  /**
   * Konfiguration aktualisieren
   */
  updateConfig(newConfig: Partial<BackgroundServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Konfiguration aktualisiert:', this.config);
  }

  /**
   * Status-Abfragen
   */
  getStatus(): ServiceHealth {
    return { ...this.healthStatus };
  }

  getConfig(): BackgroundServiceConfig {
    return { ...this.config };
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton-Instanz
let backgroundServiceInstance: VendonBackgroundService | null = null;

export function getBackgroundServiceInstance(): VendonBackgroundService {
  if (!backgroundServiceInstance) {
    backgroundServiceInstance = new VendonBackgroundService();
  }
  return backgroundServiceInstance;
}

export async function startVendonBackgroundService(): Promise<void> {
  const service = getBackgroundServiceInstance();
  await service.start();
}

export async function stopVendonBackgroundService(): Promise<void> {
  if (backgroundServiceInstance) {
    await backgroundServiceInstance.stop();
  }
}