import { db } from '../db';
import { transactions, machines, transactionGaps, syncHealthLogs, dataQualityMetrics } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, asc, count, max, min } from 'drizzle-orm';
import { EventEmitter } from 'events';

// Types für Monitoring Events
export interface TransactionGapEvent {
  type: 'gap_detected';
  machineId: number | null;
  vendonMachineId: string | null;
  machineName: string | null;
  gapStart: Date;
  gapEnd: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  expectedTransactions: number;
  gapDurationHours: number;
}

export interface HealthCheckEvent {
  type: 'health_check';
  component: 'transaction_monitor' | 'gap_detector' | 'data_validator';
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  metrics?: Record<string, any>;
}

export interface DataQualityEvent {
  type: 'data_quality';
  entityType: 'transactions';
  overallScore: number;
  completenessScore: number;
  accuracyScore: number;
  consistencyScore: number;
  timelinessScore: number;
}

/**
 * TransactionMonitoringService - Kontinuierliche Überwachung der Transaktionsdaten
 * 
 * Funktionen:
 * - Real-time Monitoring der Transaktionsaktivität
 * - Automatische Gap-Detection
 * - Datenqualitätsbewertung
 * - Health Checks der Sync-Komponenten
 * - Event-basierte Benachrichtigungen
 */
export class TransactionMonitoringService extends EventEmitter {
  private isRunning = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL_MS = 30000; // 30 Sekunden
  private readonly HEALTH_CHECK_INTERVAL_MS = 300000; // 5 Minuten
  private readonly GAP_THRESHOLD_HOURS = 2; // Lücken > 2 Stunden sind kritisch
  
  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Startet den Monitoring Service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[TransactionMonitoring] Service bereits gestartet');
      return;
    }

    console.log('[TransactionMonitoring] Starte Monitoring Service...');
    this.isRunning = true;

    // Initiale Gesundheitsprüfung
    await this.performHealthCheck();

    // Kontinuierliches Monitoring starten
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCycle();
      } catch (error) {
        console.error('[TransactionMonitoring] Fehler im Monitoring-Zyklus:', error);
        await this.logHealthStatus('critical', 'transaction_monitor', 
          `Monitoring-Zyklus fehlgeschlagen: ${error}`);
      }
    }, this.MONITORING_INTERVAL_MS);

    // Gesundheitsprüfungen starten
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('[TransactionMonitoring] Fehler bei Gesundheitsprüfung:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);

    console.log('[TransactionMonitoring] Service erfolgreich gestartet');
    
    // Health Log erstellen
    await this.logHealthStatus('healthy', 'transaction_monitor', 
      'Transaction Monitoring Service gestartet');
  }

  /**
   * Stoppt den Monitoring Service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[TransactionMonitoring] Stoppe Monitoring Service...');
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Health Log erstellen
    await this.logHealthStatus('healthy', 'transaction_monitor', 
      'Transaction Monitoring Service gestoppt');

    console.log('[TransactionMonitoring] Service gestoppt');
  }

  /**
   * Führt einen kompletten Monitoring-Zyklus durch
   */
  private async performMonitoringCycle(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // 1. Überprüfe Transaktionsaktivität der letzten Stunden
      await this.checkRecentTransactionActivity();
      
      // 2. Erkenne neue Transaktionslücken
      await this.detectTransactionGaps();
      
      // 3. Bewerte Datenqualität
      await this.assessDataQuality();
      
      // 4. Überprüfe Machine-spezifische Anomalien
      await this.checkMachineAnomalies();

      const duration = Date.now() - startTime;
      console.log(`[TransactionMonitoring] Monitoring-Zyklus abgeschlossen in ${duration}ms`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[TransactionMonitoring] Monitoring-Zyklus fehlgeschlagen nach ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Überprüft die Transaktionsaktivität der letzten Stunden
   */
  private async checkRecentTransactionActivity(): Promise<void> {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    try {
      // Zähle Transaktionen der letzten 2 Stunden
      const recentTransactions = await db
        .select({ count: count() })
        .from(transactions)
        .where(gte(transactions.datetime, twoHoursAgo));

      const transactionCount = recentTransactions[0]?.count || 0;

      // Zähle aktive Maschinen in der letzten Stunde
      const activeMachines = await db
        .selectDistinct({ machineId: transactions.machineId })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, oneHourAgo),
            eq(transactions.machineId, sql`transactions.machine_id`)
          )
        );

      const activeMachineCount = activeMachines.length;

      // Bewerte Aktivitätsniveau
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      let message = `${transactionCount} Transaktionen, ${activeMachineCount} aktive Maschinen`;

      if (transactionCount === 0) {
        status = 'critical';
        message = 'KEINE Transaktionen in den letzten 2 Stunden!';
      } else if (transactionCount < 10) {
        status = 'warning';
        message = `Sehr niedrige Aktivität: ${transactionCount} Transaktionen in 2h`;
      } else if (activeMachineCount < 5) {
        status = 'warning';
        message = `Wenige aktive Maschinen: ${activeMachineCount} in der letzten Stunde`;
      }

      // Event emittieren wenn problematisch
      if (status !== 'healthy') {
        this.emit('health_check', {
          type: 'health_check',
          component: 'transaction_monitor',
          status,
          message,
          metrics: {
            transactionCount,
            activeMachineCount,
            period: '2 hours'
          }
        } as HealthCheckEvent);
      }

      // Gesundheitsstatus loggen
      await this.logHealthStatus(status, 'transaction_monitor', message, {
        transactionCount,
        activeMachineCount,
        checkPeriod: '2 hours'
      });

    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Aktivitätsprüfung:', error);
      await this.logHealthStatus('critical', 'transaction_monitor', 
        `Aktivitätsprüfung fehlgeschlagen: ${error}`);
    }
  }

  /**
   * Erkennt neue Transaktionslücken automatisch
   */
  private async detectTransactionGaps(): Promise<void> {
    const now = new Date();
    const checkStartTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Letzten 24 Stunden

    try {
      // Hole alle Maschinen mit Transaktionen im Prüfzeitraum
      const machinesWithTransactions = await db
        .selectDistinct({
          machineId: transactions.machineId,
          vendonMachineId: sql<string>`CAST(${transactions.machineId} AS TEXT)`,
          machineName: transactions.machineName
        })
        .from(transactions)
        .where(gte(transactions.datetime, checkStartTime));

      for (const machine of machinesWithTransactions) {
        if (!machine.machineId) continue;
        
        await this.detectGapsForMachine(machine.machineId, checkStartTime, now);
      }

    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Gap-Detection:', error);
      await this.logHealthStatus('critical', 'gap_detector', 
        `Gap-Detection fehlgeschlagen: ${error}`);
    }
  }

  /**
   * Erkennt Lücken für eine spezifische Maschine
   */
  private async detectGapsForMachine(machineId: number, startTime: Date, endTime: Date): Promise<void> {
    try {
      // Hole alle Transaktionen für diese Maschine im Zeitraum, sortiert nach Zeit
      const machineTransactions = await db
        .select({
          datetime: transactions.datetime,
          machineName: transactions.machineName
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.machineId, machineId),
            gte(transactions.datetime, startTime),
            lte(transactions.datetime, endTime)
          )
        )
        .orderBy(asc(transactions.datetime));

      if (machineTransactions.length < 2) {
        // Nicht genug Daten für Gap-Analyse
        return;
      }

      // Analysiere Zeitabstände zwischen aufeinanderfolgenden Transaktionen
      for (let i = 1; i < machineTransactions.length; i++) {
        const prevTransaction = machineTransactions[i - 1];
        const currentTransaction = machineTransactions[i];
        
        const gapDurationMs = currentTransaction.datetime.getTime() - prevTransaction.datetime.getTime();
        const gapDurationHours = gapDurationMs / (1000 * 60 * 60);

        // Prüfe ob das eine signifikante Lücke ist
        if (gapDurationHours > this.GAP_THRESHOLD_HOURS) {
          const severity = this.calculateGapSeverity(gapDurationHours);
          const expectedTransactions = Math.round(gapDurationHours * 2); // Schätzung: ~2 Transaktionen pro Stunde

          // Prüfe ob diese Lücke bereits bekannt ist
          const existingGap = await db
            .select()
            .from(transactionGaps)
            .where(
              and(
                eq(transactionGaps.machineId, machineId),
                eq(transactionGaps.gapStart, prevTransaction.datetime),
                eq(transactionGaps.gapEnd, currentTransaction.datetime)
              )
            )
            .limit(1);

          if (existingGap.length === 0) {
            // Neue Lücke gefunden - speichern und Event emittieren
            await this.recordTransactionGap(
              machineId,
              machineId.toString(),
              machineTransactions[0].machineName,
              prevTransaction.datetime,
              currentTransaction.datetime,
              severity,
              expectedTransactions,
              gapDurationHours
            );

            // Event emittieren
            this.emit('gap_detected', {
              type: 'gap_detected',
              machineId,
              vendonMachineId: machineId.toString(),
              machineName: machineTransactions[0].machineName,
              gapStart: prevTransaction.datetime,
              gapEnd: currentTransaction.datetime,
              severity,
              expectedTransactions,
              gapDurationHours
            } as TransactionGapEvent);
          }
        }
      }

    } catch (error) {
      console.error(`[TransactionMonitoring] Fehler bei Gap-Detection für Maschine ${machineId}:`, error);
    }
  }

  /**
   * Berechnet die Schwere einer Transaktionslücke
   */
  private calculateGapSeverity(gapDurationHours: number): 'low' | 'medium' | 'high' | 'critical' {
    if (gapDurationHours >= 24) return 'critical';  // Mehr als 1 Tag
    if (gapDurationHours >= 12) return 'high';      // Mehr als 12 Stunden
    if (gapDurationHours >= 6) return 'medium';     // Mehr als 6 Stunden
    return 'low';                                   // 2-6 Stunden
  }

  /**
   * Speichert eine erkannte Transaktionslücke
   */
  private async recordTransactionGap(
    machineId: number,
    vendonMachineId: string,
    machineName: string | null,
    gapStart: Date,
    gapEnd: Date,
    severity: 'low' | 'medium' | 'high' | 'critical',
    expectedTransactions: number,
    gapDurationHours: number
  ): Promise<void> {
    try {
      await db.insert(transactionGaps).values({
        machineId,
        vendonMachineId,
        machineName,
        gapStart,
        gapEnd,
        gapDurationHours,
        expectedTransactions,
        severity,
        status: 'detected',
        detectionMethod: 'automatic',
        detectedBy: 'TransactionMonitoringService'
      });

      console.log(`[TransactionMonitoring] Neue ${severity} Lücke erkannt für ${machineName}: ${gapDurationHours.toFixed(1)}h`);
      
    } catch (error) {
      console.error('[TransactionMonitoring] Fehler beim Speichern der Gap-Information:', error);
    }
  }

  /**
   * Bewertet die aktuelle Datenqualität
   */
  private async assessDataQuality(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Bewerte Vollständigkeit (Completeness)
      const completenessScore = await this.calculateCompletenessScore();
      
      // Bewerte Genauigkeit (Accuracy)  
      const accuracyScore = await this.calculateAccuracyScore();
      
      // Bewerte Konsistenz (Consistency)
      const consistencyScore = await this.calculateConsistencyScore();
      
      // Bewerte Aktualität (Timeliness)
      const timelinessScore = await this.calculateTimelinessScore();
      
      // Berechne Gesamtscore
      const overallScore = (completenessScore + accuracyScore + consistencyScore + timelinessScore) / 4;

      // Speichere Metriken
      await db.insert(dataQualityMetrics).values({
        metricType: 'overall',
        entityType: 'transactions',
        measurementDate: today,
        completenessScore,
        accuracyScore,
        consistencyScore,
        timelinessScore,
        overallScore,
        calculationMethod: 'automated_analysis',
        confidenceLevel: 0.85
      });

      // Event emittieren
      this.emit('data_quality', {
        type: 'data_quality',
        entityType: 'transactions',
        overallScore,
        completenessScore,
        accuracyScore,
        consistencyScore,
        timelinessScore
      } as DataQualityEvent);

      // Status bestimmen
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (overallScore < 60) status = 'critical';
      else if (overallScore < 80) status = 'warning';

      await this.logHealthStatus(status, 'data_validator', 
        `Datenqualität: ${overallScore.toFixed(1)}% (Vollständigkeit: ${completenessScore.toFixed(1)}%)`);

    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Datenqualitätsbewertung:', error);
      await this.logHealthStatus('critical', 'data_validator', 
        `Datenqualitätsbewertung fehlgeschlagen: ${error}`);
    }
  }

  /**
   * Berechnet Score für Datenvollständigkeit
   */
  private async calculateCompletenessScore(): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    try {
      // Zähle erwartete vs. tatsächliche Transaktionen
      const totalTransactions = await db
        .select({ count: count() })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, yesterday),
            lte(transactions.datetime, today)
          )
        );

      const transactionCount = totalTransactions[0]?.count || 0;
      
      // Erwarte mindestens 100 Transaktionen pro Tag (konservative Schätzung)
      const expectedMinimum = 100;
      return Math.min(100, (transactionCount / expectedMinimum) * 100);
      
    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Vollständigkeitsberechnung:', error);
      return 0;
    }
  }

  /**
   * Berechnet Score für Datengenauigkeit
   */
  private async calculateAccuracyScore(): Promise<number> {
    try {
      // Prüfe auf offensichtlich falsche Daten
      const invalidTransactions = await db
        .select({ count: count() })
        .from(transactions)
        .where(
          sql`(price <= 0 OR price > 50 OR datetime > NOW() + INTERVAL '1 hour')`
        );

      const totalTransactions = await db
        .select({ count: count() })
        .from(transactions);

      const invalidCount = invalidTransactions[0]?.count || 0;
      const totalCount = totalTransactions[0]?.count || 1;
      
      return Math.max(0, ((totalCount - invalidCount) / totalCount) * 100);
      
    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Genauigkeitsberechnung:', error);
      return 0;
    }
  }

  /**
   * Berechnet Score für Datenkonsistenz
   */
  private async calculateConsistencyScore(): Promise<number> {
    try {
      // Prüfe auf Inkonsistenzen zwischen verwandten Feldern
      const inconsistentTransactions = await db
        .select({ count: count() })
        .from(transactions)
        .where(
          sql`(machine_name IS NULL AND machine_id IS NOT NULL) 
              OR (product_name IS NULL AND product_id IS NOT NULL)
              OR (price != price_wo_vat + price_vat AND price_vat IS NOT NULL)`
        );

      const totalTransactions = await db
        .select({ count: count() })
        .from(transactions);

      const inconsistentCount = inconsistentTransactions[0]?.count || 0;
      const totalCount = totalTransactions[0]?.count || 1;
      
      return Math.max(0, ((totalCount - inconsistentCount) / totalCount) * 100);
      
    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Konsistenzberechnung:', error);
      return 0;
    }
  }

  /**
   * Berechnet Score für Datenaktualität
   */
  private async calculateTimelinessScore(): Promise<number> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Prüfe ob wir aktuelle Daten haben
      const recentTransactions = await db
        .select({ count: count() })
        .from(transactions)
        .where(gte(transactions.datetime, oneHourAgo));

      const recentCount = recentTransactions[0]?.count || 0;
      
      // Score basierend auf Anzahl der Transaktionen in der letzten Stunde
      if (recentCount >= 10) return 100;
      if (recentCount >= 5) return 75;
      if (recentCount >= 1) return 50;
      return 0;
      
    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Aktualitätsberechnung:', error);
      return 0;
    }
  }

  /**
   * Überprüft Machine-spezifische Anomalien
   */
  private async checkMachineAnomalies(): Promise<void> {
    try {
      // Identifiziere Maschinen mit ungewöhnlichen Mustern
      const machineStats = await db
        .select({
          machineId: transactions.machineId,
          machineName: transactions.machineName,
          transactionCount: count(),
          lastTransaction: max(transactions.datetime),
          firstTransaction: min(transactions.datetime)
        })
        .from(transactions)
        .where(gte(transactions.datetime, sql`NOW() - INTERVAL '24 hours'`))
        .groupBy(transactions.machineId, transactions.machineName)
        .having(sql`COUNT(*) > 0`);

      for (const machine of machineStats) {
        const timeSinceLastTransaction = machine.lastTransaction ? 
          (Date.now() - machine.lastTransaction.getTime()) / (1000 * 60 * 60) : Infinity;

        // Prüfe auf zu lange Inaktivität
        if (timeSinceLastTransaction > 12) { // 12 Stunden ohne Transaktion
          await this.logHealthStatus('warning', 'transaction_monitor',
            `Maschine ${machine.machineName} inaktiv seit ${timeSinceLastTransaction.toFixed(1)}h`,
            { machineId: machine.machineId, hoursSinceLastTransaction: timeSinceLastTransaction }
          );
        }
      }

    } catch (error) {
      console.error('[TransactionMonitoring] Fehler bei Machine-Anomalie-Prüfung:', error);
    }
  }

  /**
   * Führt eine umfassende Gesundheitsprüfung durch
   */
  private async performHealthCheck(): Promise<void> {
    const healthChecks = [
      this.checkDatabaseConnectivity(),
      this.checkApiConnectivity(),
      this.checkServicePerformance()
    ];

    const results = await Promise.allSettled(healthChecks);
    
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    const issues: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        overallStatus = 'critical';
        issues.push(`Health Check ${index + 1} fehlgeschlagen: ${result.reason}`);
      }
    });

    const message = issues.length > 0 ? 
      `Health Checks abgeschlossen mit ${issues.length} Problemen` :
      'Alle Health Checks erfolgreich';

    await this.logHealthStatus(overallStatus, 'transaction_monitor', message);
  }

  /**
   * Prüft Datenbankverbindung
   */
  private async checkDatabaseConnectivity(): Promise<void> {
    try {
      await db.select({ count: count() }).from(transactions).limit(1);
    } catch (error) {
      throw new Error(`Datenbankverbindung fehlgeschlagen: ${error}`);
    }
  }

  /**
   * Prüft API-Konnektivität (Placeholder)
   */
  private async checkApiConnectivity(): Promise<void> {
    // Hier könnte eine Prüfung der Vendon API erfolgen
    // Momentan als Erfolg gewertet
  }

  /**
   * Prüft Service-Performance
   */
  private async checkServicePerformance(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Führe eine repräsentative Abfrage aus
      await db
        .select({ count: count() })
        .from(transactions)
        .where(gte(transactions.datetime, sql`NOW() - INTERVAL '1 hour'`));
        
      const duration = Date.now() - startTime;
      
      if (duration > 5000) { // Mehr als 5 Sekunden
        throw new Error(`Langsame Datenbankabfrage: ${duration}ms`);
      }
    } catch (error) {
      throw new Error(`Performance-Problem: ${error}`);
    }
  }

  /**
   * Protokolliert Gesundheitsstatus
   */
  private async logHealthStatus(
    status: 'healthy' | 'warning' | 'critical',
    component: string,
    message: string,
    metrics?: Record<string, any>
  ): Promise<void> {
    try {
      await db.insert(syncHealthLogs).values({
        checkType: 'performance',
        component,
        status,
        severity: status === 'healthy' ? 'info' : status === 'warning' ? 'warning' : 'error',
        message,
        metrics: metrics ? JSON.stringify(metrics) : null,
        checkDurationMs: null
      });
    } catch (error) {
      console.error('[TransactionMonitoring] Fehler beim Loggen des Gesundheitsstatus:', error);
    }
  }

  /**
   * Setup für Event-Handler
   */
  private setupEventHandlers(): void {
    this.on('gap_detected', this.handleGapDetected.bind(this));
    this.on('health_check', this.handleHealthCheck.bind(this));
    this.on('data_quality', this.handleDataQuality.bind(this));
  }

  /**
   * Handler für erkannte Transaktionslücken
   */
  private async handleGapDetected(event: TransactionGapEvent): Promise<void> {
    console.log(`[TransactionMonitoring] GAP DETECTED: ${event.severity} Lücke bei ${event.machineName} - ${event.gapDurationHours.toFixed(1)}h`);
    
    // Hier könnten weitere Aktionen ausgelöst werden:
    // - E-Mail-Benachrichtigungen
    // - Automatische Recovery-Jobs
    // - Dashboard-Updates
  }

  /**
   * Handler für Gesundheitsprüfungen
   */
  private async handleHealthCheck(event: HealthCheckEvent): Promise<void> {
    if (event.status !== 'healthy') {
      console.log(`[TransactionMonitoring] HEALTH: ${event.status.toUpperCase()} - ${event.component}: ${event.message}`);
    }
  }

  /**
   * Handler für Datenqualitäts-Events
   */
  private async handleDataQuality(event: DataQualityEvent): Promise<void> {
    console.log(`[TransactionMonitoring] DATA QUALITY: ${event.overallScore.toFixed(1)}% (${event.entityType})`);
  }

  /**
   * Gibt aktuelle Service-Statistiken zurück
   */
  public getServiceStats() {
    return {
      isRunning: this.isRunning,
      monitoringInterval: this.MONITORING_INTERVAL_MS,
      healthCheckInterval: this.HEALTH_CHECK_INTERVAL_MS,
      gapThresholdHours: this.GAP_THRESHOLD_HOURS,
      eventListeners: this.listenerCount('gap_detected') + this.listenerCount('health_check') + this.listenerCount('data_quality')
    };
  }
}

// Singleton Instance
export const transactionMonitoringService = new TransactionMonitoringService();