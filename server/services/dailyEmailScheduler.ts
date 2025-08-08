/**
 * Scheduler Service für automatische tägliche E-Mail-Benachrichtigungen
 */
import * as cron from 'node-cron';
import { DailyEmailService } from './dailyEmailService';

export class DailyEmailScheduler {
  private dailyEmailService: DailyEmailService;
  private scheduledTask: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor() {
    this.dailyEmailService = new DailyEmailService();
  }

  /**
   * Startet den Scheduler für tägliche E-Mail-Benachrichtigungen
   */
  start(): void {
    if (this.isRunning) {
      console.log('📧 Daily Email Scheduler läuft bereits');
      return;
    }

    try {
      // Cron-Job für jeden Tag um 06:00 Uhr
      // Format: "Sekunden Minute Stunde Tag Monat Wochentag"
      // 0 6 * * * = Jeden Tag um 06:00 Uhr
      this.scheduledTask = cron.schedule('0 6 * * *', async () => {
        console.log('⏰ Daily Email Scheduler ausgelöst:', new Date().toLocaleString('de-DE'));
        await this.executeScheduledEmailSending();
      }, {
        scheduled: true,
        timezone: 'Europe/Berlin'
      });

      this.isRunning = true;
      console.log('✅ Daily Email Scheduler erfolgreich gestartet (täglich 06:00 Uhr)');
      
    } catch (error) {
      console.error('❌ Fehler beim Starten des Daily Email Schedulers:', error);
    }
  }

  /**
   * Stoppt den Scheduler
   */
  stop(): void {
    if (this.scheduledTask) {
      this.scheduledTask.destroy();
      this.scheduledTask = null;
      this.isRunning = false;
      console.log('🛑 Daily Email Scheduler gestoppt');
    }
  }

  /**
   * Gibt den Status des Schedulers zurück
   */
  getStatus(): { isRunning: boolean; nextRun: string | null } {
    return {
      isRunning: this.isRunning,
      nextRun: this.scheduledTask ? 'Täglich um 06:00 Uhr' : null
    };
  }

  /**
   * Führt das geplante E-Mail-Versenden aus
   */
  private async executeScheduledEmailSending(): Promise<void> {
    try {
      console.log('📧 Starte geplante tägliche E-Mail-Benachrichtigung...');
      
      // Validiere erst die Konfiguration
      const validation = await this.dailyEmailService.validateConfiguration();
      if (!validation.isValid) {
        console.log('⚠️ E-Mail-Konfiguration ungültig, überspringe Versendung:', validation.issues);
        return;
      }

      // Sende tägliche E-Mail
      const result = await this.dailyEmailService.sendDailyEmail();
      
      if (result.success) {
        console.log(`✅ Geplante tägliche E-Mail erfolgreich versendet: ${result.emailsSent} E-Mails`);
      } else {
        console.error('❌ Fehler beim geplanten E-Mail-Versand:', result.errors);
      }
      
    } catch (error) {
      console.error('❌ Unerwarteter Fehler beim geplanten E-Mail-Versand:', error);
    }
  }

  /**
   * Manueller Test-Aufruf des Schedulers (für Debugging)
   */
  async runManualTest(): Promise<void> {
    console.log('🧪 Manueller Test des Daily Email Schedulers...');
    await this.executeScheduledEmailSending();
  }
}

// Singleton-Instanz für die Anwendung
let schedulerInstance: DailyEmailScheduler | null = null;

/**
 * Initialisiert und startet den Daily Email Scheduler
 */
export function startDailyEmailScheduler(): DailyEmailScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new DailyEmailScheduler();
    schedulerInstance.start();
  }
  return schedulerInstance;
}

/**
 * Stoppt den Daily Email Scheduler
 */
export function stopDailyEmailScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}

/**
 * Gibt den Status des Daily Email Schedulers zurück
 */
export function getDailyEmailSchedulerStatus(): { isRunning: boolean; nextRun: string | null } {
  if (!schedulerInstance) {
    return { isRunning: false, nextRun: null };
  }
  return schedulerInstance.getStatus();
}

/**
 * Manueller Test des Schedulers
 */
export async function testDailyEmailScheduler(): Promise<void> {
  if (!schedulerInstance) {
    schedulerInstance = new DailyEmailScheduler();
  }
  await schedulerInstance.runManualTest();
}