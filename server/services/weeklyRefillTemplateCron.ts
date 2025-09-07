/**
 * Cron-Service für wöchentliche automatische Refill-Template Erstellung
 * Automatische Ausführung jeden Sonntag um 06:00 Uhr
 */

import cron from 'node-cron';
import { createWeeklyTemplatesForAllMachines } from './weeklyRefillTemplateService';

class WeeklyRefillTemplateCron {
  private isRunning = false;

  /**
   * Startet den Cron-Job für wöchentliche Template-Erstellung
   * Ausführung: Jeden Sonntag um 06:00 Uhr
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Weekly Refill Template Cron-Job läuft bereits');
      return;
    }

    // Jeden Sonntag um 06:00 Uhr
    cron.schedule('0 6 * * 0', async () => {
      console.log('🔄 Starte automatische wöchentliche Template-Erstellung (Sonntag 06:00 Uhr)');
      
      try {
        const result = await createWeeklyTemplatesForAllMachines();
        
        if (result.success) {
          console.log(`✅ Wöchentliche Templates automatisch erstellt: ${result.summary.successfulMachines}/${result.summary.totalMachines} Maschinen, ${result.summary.totalChanges} Änderungen`);
          
          // Detailiertes Logging der Ergebnisse
          result.results.forEach(template => {
            const changedProducts = template.changes.filter(c => c.changeType !== 'unchanged');
            if (changedProducts.length > 0) {
              console.log(`  📋 ${template.machineName}: ${changedProducts.length} Produktänderungen`);
              changedProducts.forEach(change => {
                const direction = change.changeType === 'increase' ? '⬆️' : '⬇️';
                console.log(`    ${direction} ${change.productName}: ${change.oldQuantity} → ${change.newQuantity} (${change.changePercentage}%)`);
              });
            }
          });
        } else {
          console.error('❌ Automatische wöchentliche Template-Erstellung fehlgeschlagen:', result.error);
        }
      } catch (error: any) {
        console.error('❌ Kritischer Fehler bei automatischer wöchentlicher Template-Erstellung:', error.message);
      }
    }, {
      timezone: "Europe/Berlin"
    });

    this.isRunning = true;
    console.log('🚀 Weekly Refill Template Cron-Service gestartet (jeden Sonntag 06:00 Uhr)');
  }

  /**
   * Stoppt den Cron-Job
   */
  stop() {
    this.isRunning = false;
    console.log('⏹️ Weekly Refill Template Cron-Service gestoppt');
  }

  /**
   * Status des Cron-Services
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: 'Jeden Sonntag um 06:00 Uhr',
      timezone: 'Europe/Berlin',
      nextExecution: this.getNextSunday()
    };
  }

  /**
   * Berechnet den nächsten Sonntag 06:00 Uhr
   */
  private getNextSunday(): string {
    const now = new Date();
    const nextSunday = new Date(now);
    
    // Finde nächsten Sonntag (Tag 0 = Sonntag)
    const daysUntilSunday = (7 - now.getDay()) % 7;
    if (daysUntilSunday === 0 && now.getHours() >= 6) {
      // Wenn heute Sonntag ist und es bereits nach 06:00 Uhr ist, nimm nächsten Sonntag
      nextSunday.setDate(now.getDate() + 7);
    } else if (daysUntilSunday === 0) {
      // Wenn heute Sonntag ist aber vor 06:00 Uhr, nimm heute
      nextSunday.setDate(now.getDate());
    } else {
      nextSunday.setDate(now.getDate() + daysUntilSunday);
    }
    
    nextSunday.setHours(6, 0, 0, 0);
    
    return nextSunday.toLocaleString('de-DE');
  }

  /**
   * Test-Ausführung (für Debugging)
   */
  async runTestExecution(): Promise<{ success: boolean; message: string }> {
    console.log('🧪 Test-Ausführung der wöchentlichen Template-Erstellung');
    
    try {
      const result = await createWeeklyTemplatesForAllMachines();
      
      if (result.success) {
        return {
          success: true,
          message: `Test erfolgreich: ${result.summary.successfulMachines}/${result.summary.totalMachines} Maschinen, ${result.summary.totalChanges} Änderungen`
        };
      } else {
        return {
          success: false,
          message: `Test fehlgeschlagen: ${result.error}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Test-Ausführung fehlgeschlagen: ${error.message}`
      };
    }
  }

  /**
   * Manuelle Ausführung (für sofortige Erstellung)
   */
  async runManualExecution(): Promise<{ success: boolean; message: string; results?: any[] }> {
    console.log('⚡ Manuelle Ausführung der wöchentlichen Template-Erstellung');
    
    try {
      const result = await createWeeklyTemplatesForAllMachines();
      
      return {
        success: result.success,
        message: result.success 
          ? `Manuelle Erstellung erfolgreich: ${result.summary.successfulMachines}/${result.summary.totalMachines} Maschinen`
          : `Manuelle Erstellung fehlgeschlagen: ${result.error}`,
        results: result.results
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Manuelle Ausführung fehlgeschlagen: ${error.message}`
      };
    }
  }

  /**
   * Holt die letzten Ausführungsstatistiken
   */
  async getLastExecutionStats(): Promise<{
    lastRun?: Date;
    totalMachines: number;
    successfulMachines: number;
    totalChanges: number;
  }> {
    // TODO: Implementiere Statistik-Tracking in der Datenbank
    return {
      totalMachines: 0,
      successfulMachines: 0,
      totalChanges: 0,
    };
  }
}

export const weeklyRefillTemplateCron = new WeeklyRefillTemplateCron();