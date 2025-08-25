import { productSyncService } from './productSyncService';
import { getPersistentSyncLockInstance } from './PersistentSyncLock';

const SYNC_TYPE = {
  PRODUCTS: 'products',
  MACHINES: 'machines', 
  TRANSACTIONS: 'transactions',
  REFILLS: 'refills',
  EVENTS: 'events',
  WAREHOUSES: 'warehouses',
  WEATHER: 'weather'
} as const;

type SyncJob = {
  syncType: string;
  intervalMinutes: number;
  lastRun: Date | null;
  description: string;
  priority: 'high' | 'medium' | 'low';
  isRunning: boolean;
  enabled: boolean;
  runImmediately: boolean;
  run: () => Promise<any>;
};

/**
 * Verbesserter Scheduler für Synchronisierungsaufgaben
 * Ermöglicht die Konfiguration verschiedener Synchronisierungsjobs
 * mit unterschiedlichen Prioritäten und Intervallen
 */
export class SyncScheduler {
  private syncJobs: Record<string, SyncJob> = {};
  private scheduler: NodeJS.Timeout | null = null;
  private checkInterval: number = 60000; // 1 Minute Überprüfungsintervall
  private isRunning: boolean = false;

  constructor() {
    // Job für Produktsynchronisierung registrieren
    this.registerSyncJob({
      syncType: SYNC_TYPE.PRODUCTS,
      intervalMinutes: 60, // Stündlich
      lastRun: null,
      description: 'Synchronisierung von Produkten aus der Vendon API',
      priority: 'high',
      isRunning: false,
      enabled: true,
      runImmediately: true,
      run: async () => {
        console.log('Plane regelmäßige Produktsynchronisierung...');
        return await productSyncService.syncProducts(false);
      }
    });
  }

  /**
   * Registriert einen neuen Synchronisierungsjob
   */
  registerSyncJob(job: SyncJob): void {
    this.syncJobs[job.syncType] = job;
    console.log(`Synchronisierungsjob "${job.syncType}" registriert: ${job.description} (Intervall: ${job.intervalMinutes} Minuten)`);
  }

  /**
   * Aktiviert/deaktiviert einen Synchronisierungsjob
   */
  setJobEnabled(syncType: string, enabled: boolean): boolean {
    if (this.syncJobs[syncType]) {
      this.syncJobs[syncType].enabled = enabled;
      console.log(`Synchronisierungsjob "${syncType}" ${enabled ? 'aktiviert' : 'deaktiviert'}`);
      return true;
    }
    return false;
  }

  /**
   * Ändert das Intervall eines Synchronisierungsjobs
   */
  setJobInterval(syncType: string, intervalMinutes: number): boolean {
    if (this.syncJobs[syncType] && intervalMinutes > 0) {
      this.syncJobs[syncType].intervalMinutes = intervalMinutes;
      console.log(`Intervall für Synchronisierungsjob "${syncType}" auf ${intervalMinutes} Minuten gesetzt`);
      return true;
    }
    return false;
  }

  /**
   * Startet den Scheduler
   */
  start(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
    }

    this.isRunning = true;
    console.log(`Starte Synchronisierungs-Scheduler mit ${Object.keys(this.syncJobs).length} registrierten Jobs`);

    // Sofortige Ausführung für Jobs, die sofort starten sollen
    for (const jobKey of Object.keys(this.syncJobs)) {
      const job = this.syncJobs[jobKey];
      if (job.enabled && job.runImmediately) {
        console.log(`Initiiere sofortige Ausführung von "${job.syncType}"`);
        this.runJob(job).catch(err => {
          console.error(`Fehler bei initialer Ausführung von "${job.syncType}":`, err);
        });
      }
    }

    // Regelmäßige Überprüfung der Jobs
    this.scheduler = setInterval(() => {
      this.checkJobs();
    }, this.checkInterval);
  }

  /**
   * Stoppt den Scheduler
   */
  stop(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
    this.isRunning = false;
    console.log('Synchronisierungs-Scheduler gestoppt');
  }

  /**
   * Überprüft alle registrierten Jobs und führt fällige aus
   */
  private checkJobs(): void {
    const now = new Date();
    
    // Sortiere Jobs nach Priorität
    const sortedJobs = Object.values(this.syncJobs).sort((a, b) => {
      const priorityValues = { high: 0, medium: 1, low: 2 };
      return priorityValues[a.priority] - priorityValues[b.priority];
    });
    
    for (const job of sortedJobs) {
      if (!job.enabled || job.isRunning) {
        continue;
      }
      
      const shouldRun = !job.lastRun || 
        (now.getTime() - job.lastRun.getTime() >= job.intervalMinutes * 60 * 1000);
      
      if (shouldRun) {
        this.runJob(job).catch(err => {
          console.error(`Fehler bei Ausführung von "${job.syncType}":`, err);
        });
      }
    }
  }

  /**
   * Führt einen einzelnen Job aus
   */
  private async runJob(job: SyncJob): Promise<void> {
    if (job.isRunning) {
      console.log(`Job "${job.syncType}" läuft bereits, überspringe`);
      return;
    }
    
    job.isRunning = true;
    console.log(`Starte Ausführung von "${job.syncType}"`);
    
    try {
      const result = await job.run();
      console.log(`Job "${job.syncType}" erfolgreich abgeschlossen:`, result);
      job.lastRun = new Date();
    } catch (error) {
      console.error(`Fehler bei Ausführung von "${job.syncType}":`, error);
    } finally {
      job.isRunning = false;
    }
  }

  /**
   * Gibt den Status aller Jobs zurück
   */
  getStatus(): Array<{
    syncType: string;
    description: string;
    enabled: boolean;
    isRunning: boolean;
    lastRun: Date | null;
    intervalMinutes: number;
    priority: string;
  }> {
    return Object.values(this.syncJobs).map(job => ({
      syncType: job.syncType,
      description: job.description,
      enabled: job.enabled,
      isRunning: job.isRunning,
      lastRun: job.lastRun,
      intervalMinutes: job.intervalMinutes,
      priority: job.priority
    }));
  }

  /**
   * Führt einen Job manuell aus
   */
  async runJobManually(syncType: string): Promise<any> {
    const job = this.syncJobs[syncType];
    if (!job) {
      throw new Error(`Unbekannter Synchronisierungsjob: ${syncType}`);
    }
    
    return this.runJob(job);
  }
}

// Exportiere eine Singleton-Instanz
export const syncScheduler = new SyncScheduler();