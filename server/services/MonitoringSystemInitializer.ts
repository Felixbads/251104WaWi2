import { transactionMonitoringService } from './TransactionMonitoringService';
import { gapDetectionService } from './GapDetectionService';
import { smartRecoveryService } from './SmartRecoveryService';
import { alertingService } from './AlertingService';

/**
 * MonitoringSystemInitializer - Zentraler Service für die Initialisierung des gesamten Monitoring-Systems
 * 
 * Startet und koordiniert alle Monitoring-Services:
 * - TransactionMonitoringService: Kontinuierliche Überwachung
 * - GapDetectionService: Intelligente Lückenerkennung  
 * - SmartRecoveryService: Automatische Datenwiederherstellung
 * - AlertingService: Real-time Benachrichtigungen
 */
export class MonitoringSystemInitializer {
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Startet das komplette Monitoring-System
   */
  async start(): Promise<void> {
    if (this.isInitialized) {
      console.log('[MonitoringSystem] System bereits initialisiert');
      return;
    }

    if (this.initializationPromise) {
      console.log('[MonitoringSystem] Warte auf laufende Initialisierung...');
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  /**
   * Führt die eigentliche Initialisierung durch
   */
  private async performInitialization(): Promise<void> {
    try {
      console.log('[MonitoringSystem] 🚀 Starte Transaction Gap Monitoring & Recovery System...');
      
      // Schritt 1: AlertingService starten (als erstes, da andere Services Events emittieren)
      console.log('[MonitoringSystem] 📢 Initialisiere Alerting Service...');
      await alertingService.start();
      console.log('[MonitoringSystem] ✅ Alerting Service gestartet');

      // Schritt 2: SmartRecoveryService starten (für Job-Processing)
      console.log('[MonitoringSystem] 🔧 Initialisiere Smart Recovery Service...');
      // SmartRecoveryService startet automatisch seinen Job-Processor im Konstruktor
      console.log('[MonitoringSystem] ✅ Smart Recovery Service gestartet');

      // Schritt 3: TransactionMonitoringService starten (kontinuierliche Überwachung)
      console.log('[MonitoringSystem] 📊 Initialisiere Transaction Monitoring Service...');
      await transactionMonitoringService.start();
      console.log('[MonitoringSystem] ✅ Transaction Monitoring Service gestartet');

      // Schritt 4: Event-Handler zwischen Services einrichten
      this.setupInterServiceCommunication();

      // Schritt 5: System als initialisiert markieren (vor Gap-Analyse)
      this.isInitialized = true;

      // Schritt 6: Initiale Gap-Analyse asynchron starten (nicht blockierend)
      console.log('[MonitoringSystem] 🔍 Plane initiale Gap-Analyse (asynchron nach Startup)...');
      this.scheduleInitialGapAnalysis();
      
      console.log('[MonitoringSystem] ✅ Transaction Gap Monitoring & Recovery System erfolgreich gestartet');
      console.log('[MonitoringSystem] 📈 Kontinuierliche Überwachung aktiv - Gap Detection & Recovery bereit');
      
      // Erfolgreiche Initialisierung protokollieren
      await alertingService.processAlert(
        'system_overload',
        'info',
        'Monitoring System gestartet',
        'Transaction Gap Monitoring & Recovery System erfolgreich initialisiert',
        { service: 'MonitoringSystemInitializer' },
        { 
          systemComponents: ['TransactionMonitoring', 'GapDetection', 'SmartRecovery', 'Alerting'],
          startupTime: new Date().toISOString()
        }
      );

    } catch (error) {
      console.error('[MonitoringSystem] ❌ Fehler bei Initialisierung:', error);
      
      // Fehler-Alert senden
      await alertingService.processAlert(
        'health_critical',
        'critical',
        'Monitoring System Startup Fehler',
        `Initialisierung fehlgeschlagen: ${error}`,
        { service: 'MonitoringSystemInitializer' },
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      throw error;
    }
  }

  /**
   * Richtet Event-Handler zwischen den Services ein
   */
  private setupInterServiceCommunication(): void {
    console.log('[MonitoringSystem] 🔗 Richte Inter-Service Communication ein...');

    // TransactionMonitoringService Events -> AlertingService
    transactionMonitoringService.on('gap_detected', async (event) => {
      await alertingService.processAlert(
        'gap_detected',
        event.severity as any,
        `Transaktionslücke erkannt: ${event.machineName}`,
        `${event.severity.toUpperCase()} Lücke von ${event.gapDurationHours.toFixed(1)}h erkannt (${event.expectedTransactions} erwartete Transaktionen)`,
        {
          service: 'TransactionMonitoringService',
          machineId: event.machineId,
          machineName: event.machineName,
          vendonMachineId: event.vendonMachineId
        },
        {
          gapStart: event.gapStart,
          gapEnd: event.gapEnd,
          gapDurationHours: event.gapDurationHours,
          expectedTransactions: event.expectedTransactions,
          severity: event.severity
        }
      );
    });

    transactionMonitoringService.on('health_check', async (event) => {
      if (event.status !== 'healthy') {
        await alertingService.processAlert(
          'health_critical',
          event.status === 'critical' ? 'critical' : 'warning',
          `System Health Problem: ${event.component}`,
          event.message,
          { service: 'TransactionMonitoringService' },
          { component: event.component, ...(event.metrics || {}) }
        );
      }
    });

    transactionMonitoringService.on('data_quality', async (event) => {
      if (event.overallScore < 60) {
        await alertingService.processAlert(
          'data_quality_low',
          event.overallScore < 40 ? 'critical' : 'warning',
          'Niedrige Datenqualität erkannt',
          `Datenqualität für ${event.entityType}: ${event.overallScore.toFixed(1)}%`,
          { service: 'TransactionMonitoringService' },
          {
            entityType: event.entityType,
            overallScore: event.overallScore,
            completenessScore: event.completenessScore,
            accuracyScore: event.accuracyScore,
            consistencyScore: event.consistencyScore,
            timelinessScore: event.timelinessScore
          }
        );
      }
    });

    // GapDetectionService Events -> AlertingService & SmartRecoveryService
    gapDetectionService.on('analysis_complete', async (result) => {
      if (result.criticalGaps.length > 0) {
        await alertingService.processAlert(
          'gap_detected',
          'critical',
          `${result.criticalGaps.length} kritische Lücken gefunden`,
          `Gap-Analyse abgeschlossen: ${result.newGaps.length} neue Lücken, ${result.criticalGaps.length} kritisch`,
          { service: 'GapDetectionService' },
          {
            totalGapsFound: result.totalGapsFound,
            newGaps: result.newGaps.length,
            criticalGaps: result.criticalGaps.length,
            analysisTimeMs: result.analysisTimeMs,
            machinesAnalyzed: result.coverage.machinesAnalyzed
          }
        );
      }
    });

    // SmartRecoveryService Events -> AlertingService
    smartRecoveryService.on('job_completed', async (result) => {
      if (!result.success) {
        await alertingService.processAlert(
          'recovery_failed',
          'error',
          `Recovery Job ${result.jobId} fehlgeschlagen`,
          result.summary,
          { service: 'SmartRecoveryService' },
          {
            jobId: result.jobId,
            itemsRecovered: result.itemsRecovered,
            itemsFailed: result.itemsFailed,
            durationMs: result.durationMs,
            strategy: result.strategy,
            errors: result.errors
          }
        );
      }
    });

    smartRecoveryService.on('job_created', async (event) => {
      console.log(`[MonitoringSystem] Recovery Job ${event.jobId} erstellt: ${event.jobType} (${event.priority})`);
    });

    console.log('[MonitoringSystem] ✅ Inter-Service Communication eingerichtet');
  }

  /**
   * Startet die initiale Gap-Analyse asynchron nach einer Verzögerung
   */
  private scheduleInitialGapAnalysis(): void {
    console.log('[MonitoringSystem] ⏰ Gap-Analyse wird in 30 Sekunden nach Server-Start durchgeführt');
    setTimeout(() => {
      this.performInitialGapAnalysis().catch(error => {
        console.error('[MonitoringSystem] Fehler bei verzögerter Gap-Analyse:', error);
      });
    }, 30000); // 30 Sekunden Verzögerung
  }

  /**
   * Führt eine initiale Gap-Analyse durch
   */
  private async performInitialGapAnalysis(): Promise<void> {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const now = new Date();

      console.log('[MonitoringSystem] Analysiere Transaktionslücken der letzten 24 Stunden...');
      
      const analysisResult = await gapDetectionService.performComprehensiveGapAnalysis(
        last24Hours,
        now
      );

      console.log(`[MonitoringSystem] Initiale Gap-Analyse abgeschlossen:`);
      console.log(`  • ${analysisResult.totalGapsFound} Lücken gefunden`);
      console.log(`  • ${analysisResult.newGaps.length} neue Lücken`);
      console.log(`  • ${analysisResult.criticalGaps.length} kritische Lücken`);
      console.log(`  • ${analysisResult.coverage.machinesAnalyzed} Maschinen analysiert`);
      console.log(`  • Analyse-Zeit: ${Math.round(analysisResult.analysisTimeMs / 1000)}s`);

      if (analysisResult.criticalGaps.length > 0) {
        console.log('[MonitoringSystem] ⚠️ Kritische Lücken gefunden - Recovery-Jobs werden automatisch gestartet');
      }

    } catch (error) {
      console.error('[MonitoringSystem] Fehler bei initialer Gap-Analyse:', error);
      
      await alertingService.processAlert(
        'health_critical',
        'warning',
        'Initiale Gap-Analyse fehlgeschlagen',
        `Fehler bei der ersten Gap-Analyse: ${error}`,
        { service: 'MonitoringSystemInitializer' },
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Stoppt das komplette Monitoring-System
   */
  async stop(): Promise<void> {
    if (!this.isInitialized) {
      console.log('[MonitoringSystem] System nicht initialisiert');
      return;
    }

    try {
      console.log('[MonitoringSystem] 🛑 Stoppe Transaction Gap Monitoring & Recovery System...');

      // Services in umgekehrter Reihenfolge stoppen
      await transactionMonitoringService.stop();
      smartRecoveryService.stopJobProcessor();
      await alertingService.stop();

      this.isInitialized = false;
      this.initializationPromise = null;
      
      console.log('[MonitoringSystem] ✅ Monitoring System gestoppt');

    } catch (error) {
      console.error('[MonitoringSystem] Fehler beim Stoppen:', error);
      throw error;
    }
  }

  /**
   * Gibt den Status des Monitoring-Systems zurück
   */
  getSystemStatus() {
    return {
      isInitialized: this.isInitialized,
      isInitializing: this.initializationPromise !== null && !this.isInitialized,
      services: {
        transactionMonitoring: transactionMonitoringService.getServiceStats(),
        smartRecovery: smartRecoveryService.getServiceStats(),
        alerting: alertingService.getServiceStats()
      },
      lastUpdate: new Date()
    };
  }
}

// Singleton Instance
export const monitoringSystemInitializer = new MonitoringSystemInitializer();