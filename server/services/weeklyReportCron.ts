/**
 * Cron-Service für wöchentliche E-Mail-Berichte
 * Automatischer Versand jeden Montag um 06:00 Uhr
 */

import cron from 'node-cron';
import { weeklyReportService } from './weeklyReportService';

class WeeklyReportCron {
  private isRunning = false;

  /**
   * Startet den Cron-Job für wöchentliche Berichte
   * Ausführung: Jeden Montag um 06:00 Uhr
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Weekly Report Cron-Job läuft bereits');
      return;
    }

    // Jeden Montag um 06:00 Uhr
    cron.schedule('0 6 * * 1', async () => {
      console.log('📧 Starte automatischen wöchentlichen Bericht (Montag 06:00 Uhr)');
      
      try {
        const result = await weeklyReportService.sendWeeklyReport('felix@proviantomat.de');
        
        if (result.success) {
          console.log('✅ Wöchentlicher Bericht automatisch versendet:', result.message);
        } else {
          console.error('❌ Automatischer Versand fehlgeschlagen:', result.message);
        }
      } catch (error: any) {
        console.error('❌ Kritischer Fehler beim automatischen wöchentlichen Bericht:', error.message);
      }
    }, {
      scheduled: true,
      timezone: "Europe/Berlin"
    });

    this.isRunning = true;
    console.log('🚀 Weekly Report Cron-Service gestartet (jeden Montag 06:00 Uhr)');
  }

  /**
   * Stoppt den Cron-Job
   */
  stop() {
    this.isRunning = false;
    console.log('⏹️ Weekly Report Cron-Service gestoppt');
  }

  /**
   * Status des Cron-Services
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: 'Jeden Montag um 06:00 Uhr',
      timezone: 'Europe/Berlin',
      nextExecution: this.getNextMonday()
    };
  }

  /**
   * Berechnet den nächsten Montag 06:00 Uhr
   */
  private getNextMonday(): string {
    const now = new Date();
    const nextMonday = new Date(now);
    
    // Finde nächsten Montag
    const daysUntilMonday = (8 - now.getDay()) % 7;
    if (daysUntilMonday === 0 && now.getHours() >= 6) {
      // Wenn heute Montag ist und es bereits nach 06:00 Uhr ist, nimm nächsten Montag
      nextMonday.setDate(now.getDate() + 7);
    } else {
      nextMonday.setDate(now.getDate() + daysUntilMonday);
    }
    
    nextMonday.setHours(6, 0, 0, 0);
    
    return nextMonday.toLocaleString('de-DE');
  }

  /**
   * Test-Ausführung (für Debugging)
   */
  async runTestExecution(): Promise<{ success: boolean; message: string }> {
    console.log('🧪 Test-Ausführung des wöchentlichen Berichts');
    
    try {
      const result = await weeklyReportService.sendWeeklyReport('felix@proviantomat.de');
      return result;
    } catch (error: any) {
      return {
        success: false,
        message: `Test-Ausführung fehlgeschlagen: ${error.message}`
      };
    }
  }
}

export const weeklyReportCron = new WeeklyReportCron();