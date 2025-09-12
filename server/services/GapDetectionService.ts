import { db } from '../db';
import { transactions, machines, transactionGaps, recoveryJobs } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, asc, count, max, min, isNull } from 'drizzle-orm';
import { EventEmitter } from 'events';

// Types für Gap Detection
export interface DetectedGap {
  machineId: number | null;
  vendonMachineId: string;
  machineName: string | null;
  gapStart: Date;
  gapEnd: Date;
  gapDurationHours: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  expectedTransactions: number;
  confidence: number; // 0-1, wie sicher sind wir dass das eine echte Lücke ist
  detectionMethod: string;
  context?: {
    normalActivityPattern?: string;
    businessHours?: boolean;
    holidayPeriod?: boolean;
    weatherImpact?: boolean;
  };
}

export interface GapAnalysisResult {
  totalGapsFound: number;
  newGaps: DetectedGap[];
  criticalGaps: DetectedGap[];
  resolvedGaps: number;
  analysisTimeMs: number;
  coverage: {
    startTime: Date;
    endTime: Date;
    machinesAnalyzed: number;
    transactionsAnalyzed: number;
  };
}

/**
 * GapDetectionService - Erweiterte Lückenerkennung mit intelligenten Algorithmen
 * 
 * Features:
 * - Multiple Detection-Algorithmen (Zeit-basiert, Pattern-basiert, Statistical)
 * - Maschinenlern-ähnliche Pattern-Erkennung
 * - Kontext-bewusste Bewertung (Geschäftszeiten, Feiertage, Wetter)
 * - Confidence-basierte Filterung
 * - Automatische Recovery-Job Triggering
 */
export class GapDetectionService extends EventEmitter {
  private readonly MIN_GAP_HOURS = 1; // Minimale Lückengröße für Detection
  private readonly BUSINESS_HOURS_START = 6; // 6:00 Uhr
  private readonly BUSINESS_HOURS_END = 22; // 22:00 Uhr
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.8;
  private readonly PATTERN_ANALYSIS_DAYS = 7; // Analyse der letzten 7 Tage für Patterns

  constructor() {
    super();
  }

  /**
   * Führt eine umfassende Gap-Analyse durch
   */
  async performComprehensiveGapAnalysis(
    startTime?: Date,
    endTime?: Date,
    machineIds?: number[]
  ): Promise<GapAnalysisResult> {
    const analysisStart = Date.now();
    
    // Standard-Zeitraum: letzte 24 Stunden
    const analysisStartTime = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const analysisEndTime = endTime || new Date();

    console.log(`[GapDetection] Starte umfassende Gap-Analyse: ${analysisStartTime.toISOString()} - ${analysisEndTime.toISOString()}`);

    try {
      // 1. Hole relevante Maschinen
      const machinesForAnalysis = await this.getMachinesForAnalysis(machineIds, analysisStartTime);
      
      // 2. Analysiere jede Maschine mit verschiedenen Algorithmen
      const allDetectedGaps: DetectedGap[] = [];
      let totalTransactionsAnalyzed = 0;

      for (const machine of machinesForAnalysis) {
        const machineGaps = await this.analyzeGapsForMachine(
          machine.id,
          machine.vendonId,
          machine.machineName,
          analysisStartTime,
          analysisEndTime
        );
        
        allDetectedGaps.push(...machineGaps.gaps);
        totalTransactionsAnalyzed += machineGaps.transactionsAnalyzed;
      }

      // 3. Filtere und klassifiziere gefundene Lücken
      const filteredGaps = this.filterAndRankGaps(allDetectedGaps);
      
      // 4. Identifiziere neue Lücken (noch nicht in DB)
      const newGaps = await this.identifyNewGaps(filteredGaps);
      
      // 5. Speichere neue Lücken
      await this.saveNewGaps(newGaps);
      
      // 6. Triggere Recovery-Jobs für kritische Lücken
      const criticalGaps = newGaps.filter(gap => gap.severity === 'critical' || gap.severity === 'high');
      await this.triggerRecoveryJobs(criticalGaps);

      // 7. Prüfe auf aufgelöste Lücken
      const resolvedGaps = await this.checkForResolvedGaps(analysisStartTime, analysisEndTime);

      const analysisTimeMs = Date.now() - analysisStart;

      const result: GapAnalysisResult = {
        totalGapsFound: filteredGaps.length,
        newGaps,
        criticalGaps,
        resolvedGaps,
        analysisTimeMs,
        coverage: {
          startTime: analysisStartTime,
          endTime: analysisEndTime,
          machinesAnalyzed: machinesForAnalysis.length,
          transactionsAnalyzed: totalTransactionsAnalyzed
        }
      };

      console.log(`[GapDetection] Analyse abgeschlossen: ${newGaps.length} neue Lücken gefunden in ${analysisTimeMs}ms`);
      
      // Event emittieren
      this.emit('analysis_complete', result);
      
      return result;

    } catch (error) {
      console.error('[GapDetection] Fehler bei Gap-Analyse:', error);
      throw error;
    }
  }

  /**
   * Analysiert Lücken für eine spezifische Maschine mit mehreren Algorithmen
   */
  private async analyzeGapsForMachine(
    machineId: number,
    vendonMachineId: string,
    machineName: string | null,
    startTime: Date,
    endTime: Date
  ): Promise<{ gaps: DetectedGap[]; transactionsAnalyzed: number }> {
    
    // Hole Transaktionsdaten für die Maschine
    const machineTransactions = await db
      .select({
        datetime: transactions.datetime,
        price: transactions.price,
        paymentMethod: transactions.paymentMethod
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
      return { gaps: [], transactionsAnalyzed: machineTransactions.length };
    }

    // Hole historische Pattern für Kontext
    const historicalPattern = await this.analyzeHistoricalPattern(machineId);
    
    const detectedGaps: DetectedGap[] = [];

    // Algorithmus 1: Zeit-basierte Gap-Detection
    const timeBasedGaps = await this.detectTimeBasedGaps(
      machineId, vendonMachineId, machineName, machineTransactions, historicalPattern
    );
    detectedGaps.push(...timeBasedGaps);

    // Algorithmus 2: Statistical Anomaly Detection
    const statisticalGaps = await this.detectStatisticalAnomalies(
      machineId, vendonMachineId, machineName, machineTransactions, historicalPattern
    );
    detectedGaps.push(...statisticalGaps);

    // Algorithmus 3: Pattern-based Detection
    const patternGaps = await this.detectPatternAnomalies(
      machineId, vendonMachineId, machineName, machineTransactions, historicalPattern
    );
    detectedGaps.push(...patternGaps);

    // Dedupliziere überlappende Lücken
    const uniqueGaps = this.deduplicateGaps(detectedGaps);

    return { 
      gaps: uniqueGaps, 
      transactionsAnalyzed: machineTransactions.length 
    };
  }

  /**
   * Zeit-basierte Gap-Detection (traditioneller Ansatz)
   */
  private async detectTimeBasedGaps(
    machineId: number,
    vendonMachineId: string,
    machineName: string | null,
    transactions: Array<{ datetime: Date; price: number | null; paymentMethod: string | null }>,
    historicalPattern: any
  ): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = [];

    for (let i = 1; i < transactions.length; i++) {
      const prevTransaction = transactions[i - 1];
      const currentTransaction = transactions[i];
      
      const gapDurationMs = currentTransaction.datetime.getTime() - prevTransaction.datetime.getTime();
      const gapDurationHours = gapDurationMs / (1000 * 60 * 60);

      if (gapDurationHours >= this.MIN_GAP_HOURS) {
        const context = this.analyzeGapContext(prevTransaction.datetime, currentTransaction.datetime);
        const severity = this.calculateGapSeverity(gapDurationHours, context);
        const expectedTransactions = this.estimateExpectedTransactions(gapDurationHours, historicalPattern, context);
        const confidence = this.calculateTimeBasedConfidence(gapDurationHours, context);

        gaps.push({
          machineId,
          vendonMachineId,
          machineName,
          gapStart: prevTransaction.datetime,
          gapEnd: currentTransaction.datetime,
          gapDurationHours,
          severity,
          expectedTransactions,
          confidence,
          detectionMethod: 'time_based',
          context
        });
      }
    }

    return gaps;
  }

  /**
   * Statistical Anomaly Detection basierend auf historischen Daten
   */
  private async detectStatisticalAnomalies(
    machineId: number,
    vendonMachineId: string,
    machineName: string | null,
    transactions: Array<{ datetime: Date; price: number | null; paymentMethod: string | null }>,
    historicalPattern: any
  ): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = [];

    if (!historicalPattern || transactions.length < 10) {
      return gaps; // Nicht genug Daten für statistische Analyse
    }

    // Analysiere stündliche Transaktionsraten
    const hourlyRates = this.calculateHourlyTransactionRates(transactions);
    const expectedRates = historicalPattern.hourlyAverages || {};

    for (const [hour, actualRate] of Object.entries(hourlyRates)) {
      const expectedRate = expectedRates[hour] || 0;
      const deviation = Math.abs(actualRate - expectedRate);
      const relativeDeviation = expectedRate > 0 ? deviation / expectedRate : 0;

      // Erkenne signifikante Abweichungen (> 70% unter Erwartung)
      if (relativeDeviation > 0.7 && actualRate < expectedRate) {
        const hourNum = parseInt(hour);
        const gapStart = new Date();
        gapStart.setHours(hourNum, 0, 0, 0);
        const gapEnd = new Date(gapStart);
        gapEnd.setHours(hourNum + 1, 0, 0, 0);

        const context = this.analyzeGapContext(gapStart, gapEnd);
        const severity = relativeDeviation > 0.9 ? 'critical' : relativeDeviation > 0.8 ? 'high' : 'medium';
        const expectedTransactions = Math.round(expectedRate - actualRate);
        const confidence = Math.min(0.95, relativeDeviation);

        gaps.push({
          machineId,
          vendonMachineId,
          machineName,
          gapStart,
          gapEnd,
          gapDurationHours: 1,
          severity: severity as 'low' | 'medium' | 'high' | 'critical',
          expectedTransactions,
          confidence,
          detectionMethod: 'statistical_anomaly',
          context: {
            ...context,
            expectedRate,
            actualRate,
            deviation: relativeDeviation
          }
        });
      }
    }

    return gaps;
  }

  /**
   * Pattern-based Anomaly Detection
   */
  private async detectPatternAnomalies(
    machineId: number,
    vendonMachineId: string,
    machineName: string | null,
    transactions: Array<{ datetime: Date; price: number | null; paymentMethod: string | null }>,
    historicalPattern: any
  ): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = [];

    if (!historicalPattern || !historicalPattern.dayOfWeekPatterns) {
      return gaps;
    }

    // Analysiere Wochentag-Patterns
    const currentDayPattern = this.analyzeDayOfWeekPattern(transactions);
    const expectedDayPattern = historicalPattern.dayOfWeekPatterns;

    // Vergleiche mit erwarteten Patterns für diesen Wochentag
    for (const [dayOfWeek, currentActivity] of Object.entries(currentDayPattern)) {
      const expectedActivity = expectedDayPattern[dayOfWeek] || 0;
      const activityRatio = expectedActivity > 0 ? currentActivity / expectedActivity : 0;

      // Erkenne ungewöhnlich niedrige Aktivität für diesen Wochentag
      if (activityRatio < 0.3 && expectedActivity > 5) {
        const day = parseInt(dayOfWeek);
        const gapStart = new Date();
        gapStart.setDate(gapStart.getDate() - (gapStart.getDay() - day));
        gapStart.setHours(0, 0, 0, 0);
        
        const gapEnd = new Date(gapStart);
        gapEnd.setHours(23, 59, 59, 999);

        const context = this.analyzeGapContext(gapStart, gapEnd);
        const severity = activityRatio < 0.1 ? 'critical' : activityRatio < 0.2 ? 'high' : 'medium';
        const expectedTransactions = Math.round(expectedActivity - currentActivity);
        const confidence = 1 - activityRatio; // Je weniger Aktivität, desto höher die Confidence

        gaps.push({
          machineId,
          vendonMachineId,
          machineName,
          gapStart,
          gapEnd,
          gapDurationHours: 24,
          severity: severity as 'low' | 'medium' | 'high' | 'critical',
          expectedTransactions,
          confidence: Math.min(0.95, confidence),
          detectionMethod: 'pattern_anomaly',
          context: {
            ...context,
            expectedDayActivity: expectedActivity,
            actualDayActivity: currentActivity,
            activityRatio
          }
        });
      }
    }

    return gaps;
  }

  /**
   * Analysiert historische Patterns einer Maschine
   */
  private async analyzeHistoricalPattern(machineId: number): Promise<any> {
    const analysisStartDate = new Date();
    analysisStartDate.setDate(analysisStartDate.getDate() - this.PATTERN_ANALYSIS_DAYS);

    try {
      const historicalTransactions = await db
        .select({
          datetime: transactions.datetime,
          price: transactions.price
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.machineId, machineId),
            gte(transactions.datetime, analysisStartDate)
          )
        )
        .orderBy(asc(transactions.datetime));

      if (historicalTransactions.length < 50) {
        return null; // Nicht genug historische Daten
      }

      // Berechne stündliche Durchschnitte
      const hourlyAverages: Record<string, number> = {};
      for (let hour = 0; hour < 24; hour++) {
        const hourlyTransactions = historicalTransactions.filter(t => 
          t.datetime.getHours() === hour
        );
        hourlyAverages[hour.toString()] = hourlyTransactions.length / this.PATTERN_ANALYSIS_DAYS;
      }

      // Berechne Wochentag-Patterns
      const dayOfWeekPatterns: Record<string, number> = {};
      for (let day = 0; day < 7; day++) {
        const dayTransactions = historicalTransactions.filter(t => 
          t.datetime.getDay() === day
        );
        dayOfWeekPatterns[day.toString()] = dayTransactions.length;
      }

      return {
        hourlyAverages,
        dayOfWeekPatterns,
        totalTransactions: historicalTransactions.length,
        averagePerDay: historicalTransactions.length / this.PATTERN_ANALYSIS_DAYS,
        analysisStartDate,
        analysisEndDate: new Date()
      };

    } catch (error) {
      console.error(`[GapDetection] Fehler bei historischer Pattern-Analyse für Maschine ${machineId}:`, error);
      return null;
    }
  }

  /**
   * Analysiert den Kontext einer Lücke (Geschäftszeiten, Feiertage, etc.)
   */
  private analyzeGapContext(gapStart: Date, gapEnd: Date): any {
    const startHour = gapStart.getHours();
    const endHour = gapEnd.getHours();
    
    // Prüfe Geschäftszeiten
    const isBusinessHours = (startHour >= this.BUSINESS_HOURS_START && startHour <= this.BUSINESS_HOURS_END) ||
                           (endHour >= this.BUSINESS_HOURS_START && endHour <= this.BUSINESS_HOURS_END);

    // Prüfe Wochenende
    const isWeekend = gapStart.getDay() === 0 || gapStart.getDay() === 6;

    // Prüfe Nachtzeit
    const isNightTime = (startHour >= 23 || startHour <= 5) && (endHour >= 23 || endHour <= 5);

    return {
      businessHours: isBusinessHours,
      weekend: isWeekend,
      nightTime: isNightTime,
      startHour,
      endHour,
      dayOfWeek: gapStart.getDay()
    };
  }

  /**
   * Berechnet die Schwere einer Lücke basierend auf Dauer und Kontext
   */
  private calculateGapSeverity(
    gapDurationHours: number, 
    context: any
  ): 'low' | 'medium' | 'high' | 'critical' {
    let baseSeverity: number;

    // Basis-Bewertung nach Dauer
    if (gapDurationHours >= 24) baseSeverity = 4; // critical
    else if (gapDurationHours >= 12) baseSeverity = 3; // high
    else if (gapDurationHours >= 6) baseSeverity = 2; // medium
    else baseSeverity = 1; // low

    // Kontext-Anpassungen
    if (context.businessHours && !context.weekend) {
      baseSeverity += 1; // Schwerwiegender während Geschäftszeiten
    }
    
    if (context.nightTime && !context.businessHours) {
      baseSeverity -= 1; // Weniger schwerwiegend nachts
    }

    if (context.weekend) {
      baseSeverity -= 0.5; // Weniger schwerwiegend am Wochenende
    }

    // Normalisiere auf Severity-Levels
    const normalizedSeverity = Math.max(1, Math.min(4, Math.round(baseSeverity)));

    switch (normalizedSeverity) {
      case 4: return 'critical';
      case 3: return 'high';
      case 2: return 'medium';
      default: return 'low';
    }
  }

  /**
   * Schätzt erwartete Transaktionen basierend auf historischen Daten
   */
  private estimateExpectedTransactions(
    gapDurationHours: number,
    historicalPattern: any,
    context: any
  ): number {
    if (!historicalPattern) {
      // Fallback-Schätzung: ~1-3 Transaktionen pro Stunde je nach Kontext
      let baseRate = 2;
      if (context.businessHours && !context.weekend) baseRate = 3;
      if (context.nightTime) baseRate = 1;
      if (context.weekend) baseRate = 1.5;
      
      return Math.round(gapDurationHours * baseRate);
    }

    // Verwende historische Durchschnitte
    const averagePerHour = historicalPattern.averagePerDay / 24;
    return Math.round(gapDurationHours * averagePerHour);
  }

  /**
   * Berechnet Confidence für zeit-basierte Detection
   */
  private calculateTimeBasedConfidence(gapDurationHours: number, context: any): number {
    let confidence = 0.5; // Basis-Confidence

    // Höhere Confidence für längere Lücken
    if (gapDurationHours >= 12) confidence += 0.3;
    else if (gapDurationHours >= 6) confidence += 0.2;
    else if (gapDurationHours >= 3) confidence += 0.1;

    // Kontext-Anpassungen
    if (context.businessHours && !context.weekend) confidence += 0.2;
    if (context.nightTime) confidence -= 0.1;
    if (context.weekend) confidence -= 0.1;

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Berechnet stündliche Transaktionsraten
   */
  private calculateHourlyTransactionRates(
    transactions: Array<{ datetime: Date; price: number | null; paymentMethod: string | null }>
  ): Record<string, number> {
    const hourlyRates: Record<string, number> = {};
    
    for (let hour = 0; hour < 24; hour++) {
      const hourlyTransactions = transactions.filter(t => t.datetime.getHours() === hour);
      hourlyRates[hour.toString()] = hourlyTransactions.length;
    }

    return hourlyRates;
  }

  /**
   * Analysiert Wochentag-Pattern
   */
  private analyzeDayOfWeekPattern(
    transactions: Array<{ datetime: Date; price: number | null; paymentMethod: string | null }>
  ): Record<string, number> {
    const dayOfWeekPattern: Record<string, number> = {};
    
    for (let day = 0; day < 7; day++) {
      const dayTransactions = transactions.filter(t => t.datetime.getDay() === day);
      dayOfWeekPattern[day.toString()] = dayTransactions.length;
    }

    return dayOfWeekPattern;
  }

  /**
   * Dedupliziert überlappende Lücken
   */
  private deduplicateGaps(gaps: DetectedGap[]): DetectedGap[] {
    if (gaps.length <= 1) return gaps;

    // Sortiere nach Start-Zeit
    gaps.sort((a, b) => a.gapStart.getTime() - b.gapStart.getTime());

    const uniqueGaps: DetectedGap[] = [];
    let currentGap = gaps[0];

    for (let i = 1; i < gaps.length; i++) {
      const nextGap = gaps[i];
      
      // Prüfe auf Überlappung (mit 30min Toleranz)
      const tolerance = 30 * 60 * 1000; // 30 Minuten in ms
      const overlap = currentGap.gapEnd.getTime() + tolerance >= nextGap.gapStart.getTime();

      if (overlap) {
        // Merge overlapping gaps - behalte den mit höherer Confidence
        if (nextGap.confidence > currentGap.confidence) {
          currentGap = nextGap;
        }
      } else {
        uniqueGaps.push(currentGap);
        currentGap = nextGap;
      }
    }
    
    uniqueGaps.push(currentGap);
    return uniqueGaps;
  }

  /**
   * Filtert und rankt gefundene Lücken nach Relevanz
   */
  private filterAndRankGaps(gaps: DetectedGap[]): DetectedGap[] {
    return gaps
      .filter(gap => gap.confidence >= 0.3) // Mindest-Confidence
      .sort((a, b) => {
        // Sortiere nach Schwere, dann nach Confidence
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.confidence - a.confidence;
      });
  }

  /**
   * Identifiziert neue Lücken (noch nicht in DB)
   */
  private async identifyNewGaps(detectedGaps: DetectedGap[]): Promise<DetectedGap[]> {
    const newGaps: DetectedGap[] = [];

    for (const gap of detectedGaps) {
      // Prüfe ob ähnliche Lücke bereits existiert
      const existingGap = await db
        .select()
        .from(transactionGaps)
        .where(
          and(
            gap.machineId ? eq(transactionGaps.machineId, gap.machineId) : isNull(transactionGaps.machineId),
            sql`ABS(EXTRACT(EPOCH FROM ${transactionGaps.gapStart} - ${gap.gapStart})) < 3600`, // Binnen 1 Stunde
            sql`ABS(EXTRACT(EPOCH FROM ${transactionGaps.gapEnd} - ${gap.gapEnd})) < 3600`
          )
        )
        .limit(1);

      if (existingGap.length === 0) {
        newGaps.push(gap);
      }
    }

    return newGaps;
  }

  /**
   * Speichert neue Lücken in der Datenbank
   */
  private async saveNewGaps(newGaps: DetectedGap[]): Promise<void> {
    for (const gap of newGaps) {
      try {
        await db.insert(transactionGaps).values({
          machineId: gap.machineId,
          vendonMachineId: gap.vendonMachineId,
          machineName: gap.machineName,
          gapStart: gap.gapStart,
          gapEnd: gap.gapEnd,
          gapDurationHours: gap.gapDurationHours,
          expectedTransactions: gap.expectedTransactions,
          severity: gap.severity,
          status: 'detected',
          detectionMethod: gap.detectionMethod,
          detectedBy: 'GapDetectionService',
          notes: gap.context ? JSON.stringify(gap.context) : null
        });

        console.log(`[GapDetection] Neue ${gap.severity} Lücke gespeichert: ${gap.machineName} (${gap.gapDurationHours.toFixed(1)}h, Confidence: ${(gap.confidence * 100).toFixed(1)}%)`);
        
      } catch (error) {
        console.error('[GapDetection] Fehler beim Speichern der Lücke:', error);
      }
    }
  }

  /**
   * Triggert Recovery-Jobs für kritische Lücken
   */
  private async triggerRecoveryJobs(criticalGaps: DetectedGap[]): Promise<void> {
    for (const gap of criticalGaps.filter(g => g.confidence >= this.HIGH_CONFIDENCE_THRESHOLD)) {
      try {
        await db.insert(recoveryJobs).values({
          jobType: 'gap_recovery',
          machineId: gap.machineId,
          vendonMachineId: gap.vendonMachineId,
          machineName: gap.machineName,
          startDate: gap.gapStart,
          endDate: gap.gapEnd,
          priority: gap.severity === 'critical' ? 'urgent' : 'high',
          batchSize: 100,
          status: 'pending'
        });

        console.log(`[GapDetection] Recovery-Job getriggert für ${gap.machineName} (${gap.severity})`);
        
      } catch (error) {
        console.error('[GapDetection] Fehler beim Triggern des Recovery-Jobs:', error);
      }
    }
  }

  /**
   * Prüft auf aufgelöste Lücken
   */
  private async checkForResolvedGaps(startTime: Date, endTime: Date): Promise<number> {
    try {
      // Hier könnte Logic implementiert werden, um zu prüfen ob vorher erkannte Lücken
      // inzwischen mit Daten gefüllt wurden
      return 0;
    } catch (error) {
      console.error('[GapDetection] Fehler bei Prüfung auf aufgelöste Lücken:', error);
      return 0;
    }
  }

  /**
   * Hole Maschinen für Analyse
   */
  private async getMachinesForAnalysis(
    machineIds?: number[],
    startTime?: Date
  ): Promise<Array<{ id: number; vendonId: string; machineName: string | null }>> {
    if (machineIds && machineIds.length > 0) {
      // Spezifische Maschinen
      return await db
        .select({
          id: machines.id,
          vendonId: machines.vendonId,
          machineName: machines.machineName
        })
        .from(machines)
        .where(sql`${machines.id} = ANY(${machineIds})`);
    } else {
      // Alle aktiven Maschinen mit Transaktionen im Zeitraum
      const recentStartTime = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      return await db
        .selectDistinct({
          id: machines.id,
          vendonId: machines.vendonId,
          machineName: machines.machineName
        })
        .from(machines)
        .innerJoin(transactions, eq(machines.id, transactions.machineId))
        .where(gte(transactions.datetime, recentStartTime));
    }
  }
}

// Singleton Instance
export const gapDetectionService = new GapDetectionService();