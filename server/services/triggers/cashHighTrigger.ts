import { notificationService } from '../notificationService';
import { db } from '../../db';
import { machines, locations } from '@shared/schema';
import { eq, sql, and, gt } from 'drizzle-orm';

/**
 * Cash High Trigger - ERWEITERT: Intelligente Bargeldüberwachung
 * Enhanced cash level monitoring with multiple thresholds, dynamic prioritization and smart collection algorithms
 */
export class CashHighTrigger {
  // ERWEITERTE SCHWELLENWERTE für stufenweise Überwachung
  private readonly CASH_THRESHOLDS = {
    ATTENTION: 200,   // 🟡 Aufmerksamkeit
    WARNING: 500,     // 🟠 Warnung
    CRITICAL: 1000,   // 🔴 Kritisch
    URGENT: 1500,     // 🚨 Dringend
    MAXIMUM: 2000     // ⚠️ Maximum
  };

  private readonly COLLECTION_SCHEDULES = {
    ROUTINE: 7,      // Routine-Abholung alle 7 Tage
    REGULAR: 3,      // Regelmäßige Abholung alle 3 Tage  
    PRIORITY: 1,     // Prioritäts-Abholung binnen 24h
    URGENT: 0.5,     // Dringende Abholung binnen 12h
    EMERGENCY: 0.25  // Notfall-Abholung binnen 6h
  };

  /**
   * ERWEITERTE Check-Funktion mit intelligenter Schwellenwert-Analyse
   */
  async checkCashLevels(): Promise<void> {
    try {
      console.log('💰 Erweiterte Bargeldstand-Analyse wird durchgeführt...');

      // Alle aktiven Automaten mit detaillierter Bargeld-Analyse
      const allMachines = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          cashCredit: sql<number>`COALESCE(${machines.cashCredit}, 0)`,
          cardCredit: sql<number>`COALESCE(${machines.cardCredit}, 0)`,
          totalCash: sql<number>`COALESCE(${machines.cashCredit}, 0) + COALESCE(${machines.cardCredit}, 0)`,
          // ERWEITERT: Durchschnittlicher täglicher Cash-Zufluss (falls verfügbar)
          dailyCashInflow: sql<number>`COALESCE(${machines.dailyRevenue}, 0)`
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.isActive, true),
            gt(sql<number>`COALESCE(${machines.cashCredit}, 0)`, this.CASH_THRESHOLDS.ATTENTION)
          )
        );

      console.log(`📊 ${allMachines.length} Automaten mit erhöhten Bargeldständen gefunden`);

      for (const machine of allMachines) {
        const analysis = this.analyzeCashLevel(machine);
        
        if (analysis.requiresNotification) {
          const payload = {
            machineId: machine.machineId,
            machineName: machine.machineName,
            vendonId: machine.vendonId,
            locationName: machine.locationName,
            locationId: machine.locationId,
            currentCashCredit: machine.cashCredit,
            currentCardCredit: machine.cardCredit,
            totalCash: machine.totalCash,
            dailyCashInflow: machine.dailyCashInflow,
            
            // ERWEITERTE Analyse-Daten
            thresholdLevel: analysis.thresholdLevel,
            severity: analysis.severity,
            priority: analysis.priority,
            riskLevel: analysis.riskLevel,
            
            // INTELLIGENTE Empfehlungen
            recommendedAction: analysis.recommendedAction,
            collectionPriority: analysis.collectionPriority,
            estimatedDaysUntilFull: analysis.estimatedDaysUntilFull,
            suggestedCollectionAmount: analysis.suggestedCollectionAmount,
            
            // Zusätzliche Metadaten
            timestamp: new Date().toISOString(),
            message: analysis.message,
            category: 'cash_management',
            alertType: analysis.alertType
          };

          // ERWEITERTE Deduplikation basierend auf Schweregrad
          const dedupeWindow = this.getDeduplicationWindow(analysis.severity);
          await notificationService.recordEvent('cash_high_enhanced', payload, dedupeWindow);
        }
      }

    } catch (error) {
      console.error('❌ Fehler bei der erweiterten Bargeldstand-Analyse:', error);
      throw error;
    }
  }

  /**
   * NEUE Funktion: Intelligente Bargeldstand-Analyse
   */
  private analyzeCashLevel(machine: any): {
    requiresNotification: boolean;
    thresholdLevel: string;
    severity: 'info' | 'warning' | 'critical' | 'urgent';
    priority: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendedAction: string;
    collectionPriority: string;
    estimatedDaysUntilFull: number;
    suggestedCollectionAmount: number;
    message: string;
    alertType: string;
  } {
    const totalCash = machine.totalCash;
    const dailyInflow = machine.dailyCashInflow || 50; // Fallback: 50€/Tag
    
    let thresholdLevel: string;
    let severity: 'info' | 'warning' | 'critical' | 'urgent';
    let priority: number;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    let collectionPriority: string;
    let alertType: string;
    let icon: string;

    // STUFENWEISE Schwellenwert-Analyse
    if (totalCash >= this.CASH_THRESHOLDS.MAXIMUM) {
      thresholdLevel = 'MAXIMUM';
      severity = 'urgent';
      priority = 5;
      riskLevel = 'critical';
      collectionPriority = 'NOTFALL';
      alertType = 'cash_maximum_exceeded';
      icon = '⚠️';
    } else if (totalCash >= this.CASH_THRESHOLDS.URGENT) {
      thresholdLevel = 'URGENT';
      severity = 'urgent';
      priority = 4;
      riskLevel = 'critical';
      collectionPriority = 'DRINGEND';
      alertType = 'cash_urgent_collection';
      icon = '🚨';
    } else if (totalCash >= this.CASH_THRESHOLDS.CRITICAL) {
      thresholdLevel = 'CRITICAL';
      severity = 'critical';
      priority = 3;
      riskLevel = 'high';
      collectionPriority = 'PRIORITÄT';
      alertType = 'cash_critical_level';
      icon = '🔴';
    } else if (totalCash >= this.CASH_THRESHOLDS.WARNING) {
      thresholdLevel = 'WARNING';
      severity = 'warning';
      priority = 2;
      riskLevel = 'medium';
      collectionPriority = 'GEPLANT';
      alertType = 'cash_warning_level';
      icon = '🟠';
    } else {
      thresholdLevel = 'ATTENTION';
      severity = 'info';
      priority = 1;
      riskLevel = 'low';
      collectionPriority = 'ROUTINE';
      alertType = 'cash_attention_level';
      icon = '🟡';
    }

    // INTELLIGENTE Prognose: Wann ist der Automat voll?
    const remainingCapacity = this.CASH_THRESHOLDS.MAXIMUM - totalCash;
    const estimatedDaysUntilFull = Math.max(1, Math.floor(remainingCapacity / dailyInflow));

    // OPTIMIERTE Abhol-Empfehlung
    const suggestedCollectionAmount = Math.max(
      totalCash * 0.7, // Mindestens 70% abholen
      totalCash - this.CASH_THRESHOLDS.WARNING // Auf Warnstufe reduzieren
    );

    // DYNAMISCHE Nachrichten
    const message = `${icon} ${collectionPriority}: ${machine.machineName} - ${totalCash}€ Bargeld (${thresholdLevel})`;
    
    let recommendedAction: string;
    switch (severity) {
      case 'urgent':
        recommendedAction = `Sofortige Abholung binnen ${this.COLLECTION_SCHEDULES.EMERGENCY * 24}h - Sicherheitsrisiko!`;
        break;
      case 'critical':
        recommendedAction = `Prioritäts-Abholung binnen ${this.COLLECTION_SCHEDULES.PRIORITY * 24}h planen`;
        break;
      case 'warning':
        recommendedAction = `Regelmäßige Abholung binnen ${this.COLLECTION_SCHEDULES.REGULAR} Tagen einplanen`;
        break;
      default:
        recommendedAction = `Routine-Abholung binnen ${this.COLLECTION_SCHEDULES.ROUTINE} Tagen vorsehen`;
    }

    return {
      requiresNotification: totalCash >= this.CASH_THRESHOLDS.ATTENTION,
      thresholdLevel,
      severity,
      priority,
      riskLevel,
      recommendedAction,
      collectionPriority,
      estimatedDaysUntilFull,
      suggestedCollectionAmount: Math.round(suggestedCollectionAmount),
      message,
      alertType
    };
  }

  /**
   * NEUE Funktion: Deduplikationsfenster basierend auf Schweregrad
   */
  private getDeduplicationWindow(severity: string): number {
    switch (severity) {
      case 'urgent': return 1800;  // 30 Minuten für dringende Fälle
      case 'critical': return 3600; // 1 Stunde für kritische Fälle
      case 'warning': return 7200;  // 2 Stunden für Warnungen
      default: return 14400;        // 4 Stunden für Info-Level
    }
  }

  /**
   * Check cash level for a specific machine
   */
  async checkMachineCashLevel(machineId: number): Promise<void> {
    try {
      const machine = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          cashCredit: sql<number>`COALESCE(${machines.cashCredit}, 0)`,
          cardCredit: sql<number>`COALESCE(${machines.cardCredit}, 0)`,
          totalCash: sql<number>`COALESCE(${machines.cashCredit}, 0) + COALESCE(${machines.cardCredit}, 0)`
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.id, machineId),
            eq(machines.isActive, true)
          )
        )
        .limit(1);

      if (machine.length === 0) {
        console.log(`Machine ${machineId} not found or inactive`);
        return;
      }

      const machineData = machine[0];

      if (machineData.cashCredit > 500) {
        const payload = {
          machineId: machineData.machineId,
          machineName: machineData.machineName,
          vendonId: machineData.vendonId,
          locationName: machineData.locationName,
          locationId: machineData.locationId,
          currentCashCredit: machineData.cashCredit,
          currentCardCredit: machineData.cardCredit,
          totalCash: machineData.totalCash,
          maxSafeLevel: 500,
          severity: machineData.totalCash > 1000 ? 'critical' : 'warning',
          timestamp: new Date().toISOString(),
          message: `Bargeldabholung erforderlich in ${machineData.machineName}: ${machineData.totalCash}€ verfügbar`,
          recommendedAction: 'Bargeldabholung planen'
        };

        await notificationService.recordEvent('cash_high', payload, 3600); // 1 hour dedupe window for specific machine
      }

    } catch (error) {
      console.error(`Error checking cash level for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Get cash collection schedule suggestions based on current levels
   */
  async getCashCollectionSuggestions(): Promise<Array<{
    machineId: number;
    machineName: string;
    locationName: string;
    currentCash: number;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    suggestedCollectionDate: Date;
  }>> {
    try {
      const machines = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          cashCredit: sql<number>`COALESCE(${machines.cashCredit}, 0)`,
          cardCredit: sql<number>`COALESCE(${machines.cardCredit}, 0)`,
          totalCash: sql<number>`COALESCE(${machines.cashCredit}, 0) + COALESCE(${machines.cardCredit}, 0)`
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(eq(machines.isActive, true));

      const suggestions = machines
        .filter(machine => machine.totalCash > 200) // Only suggest for machines with >200€
        .map(machine => {
          let priority: 'low' | 'medium' | 'high' | 'urgent';
          let daysUntilCollection: number;

          if (machine.totalCash > 1000) {
            priority = 'urgent';
            daysUntilCollection = 1;
          } else if (machine.totalCash > 750) {
            priority = 'high';
            daysUntilCollection = 2;
          } else if (machine.totalCash > 500) {
            priority = 'medium';
            daysUntilCollection = 3;
          } else {
            priority = 'low';
            daysUntilCollection = 7;
          }

          const suggestedDate = new Date();
          suggestedDate.setDate(suggestedDate.getDate() + daysUntilCollection);

          return {
            machineId: machine.machineId,
            machineName: machine.machineName,
            locationName: machine.locationName,
            currentCash: machine.totalCash,
            priority,
            suggestedCollectionDate: suggestedDate
          };
        })
        .sort((a, b) => {
          // Sort by priority and cash amount
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
          }
          return b.currentCash - a.currentCash;
        });

      return suggestions;

    } catch (error) {
      console.error('Error getting cash collection suggestions:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for testing or immediate check
   */
  async triggerManualCheck(): Promise<{ machinesChecked: number; alertsTriggered: number }> {
    const startTime = Date.now();
    let alertsTriggered = 0;

    try {
      const allMachines = await db
        .select({ id: machines.id })
        .from(machines)
        .where(eq(machines.isActive, true));

      for (const machine of allMachines) {
        const eventsBefore = await notificationService.getEvents({
          eventType: 'cash_high',
          processed: false
        });

        await this.checkMachineCashLevel(machine.id);

        const eventsAfter = await notificationService.getEvents({
          eventType: 'cash_high',
          processed: false
        });

        if (eventsAfter.length > eventsBefore.length) {
          alertsTriggered++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Manual cash check completed in ${duration}ms: ${allMachines.length} machines checked, ${alertsTriggered} alerts triggered`);

      return {
        machinesChecked: allMachines.length,
        alertsTriggered
      };

    } catch (error) {
      console.error('Error in manual cash level check:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const cashHighTrigger = new CashHighTrigger();