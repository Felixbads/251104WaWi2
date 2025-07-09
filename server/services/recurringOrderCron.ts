import * as cron from 'node-cron';
import { db } from '../db';
import { recurringOrders, recurringOrderExecutions } from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import { executeRecurringOrder } from '../routes/recurring-orders';

/**
 * Cron-Service für die automatische Ausführung wiederkehrender Bestellungen
 * 
 * Läuft täglich um 06:00 Uhr und prüft alle aktiven wiederkehrenden Bestellungen,
 * die für heute oder früher geplant sind und führt sie automatisch aus.
 */
class RecurringOrderCronService {
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Startet den Cron-Job
   */
  start(): void {
    if (this.cronJob) {
      console.log('Recurring Order Cron-Service läuft bereits');
      return;
    }

    // Täglich um 06:00 Uhr ausführen
    this.cronJob = cron.schedule('0 6 * * *', async () => {
      if (this.isRunning) {
        console.log('Recurring Order Cron läuft bereits, überspringe diese Ausführung');
        return;
      }

      this.isRunning = true;
      console.log('Starte automatische Ausführung wiederkehrender Bestellungen...');
      
      try {
        await this.processRecurringOrders();
      } catch (error) {
        console.error('Fehler bei der automatischen Ausführung wiederkehrender Bestellungen:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Berlin'
    });

    console.log('Recurring Order Cron-Service gestartet (täglich 06:00 Uhr)');
  }

  /**
   * Stoppt den Cron-Job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('Recurring Order Cron-Service gestoppt');
    }
  }

  /**
   * Führt eine manuelle Ausführung aller fälligen Bestellungen durch
   */
  async runManually(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Cron-Service läuft bereits');
    }

    this.isRunning = true;
    console.log('Starte manuelle Ausführung wiederkehrender Bestellungen...');
    
    try {
      await this.processRecurringOrders();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Prüft und verarbeitet alle fälligen wiederkehrenden Bestellungen
   */
  private async processRecurringOrders(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Alle aktiven wiederkehrenden Bestellungen abrufen, die heute oder früher fällig sind
      const dueOrders = await db
        .select()
        .from(recurringOrders)
        .where(
          and(
            eq(recurringOrders.isActive, true),
            eq(recurringOrders.isAutoGenerate, true),
            lte(recurringOrders.nextExecutionDate, today)
          )
        );

      console.log(`Gefunden: ${dueOrders.length} fällige wiederkehrende Bestellungen`);

      let successCount = 0;
      let errorCount = 0;
      const results = [];

      // Jede fällige Bestellung einzeln verarbeiten
      for (const order of dueOrders) {
        try {
          console.log(`Verarbeite wiederkehrende Bestellung: ${order.name} (ID: ${order.id})`);
          
          // Prüfen, ob bereits heute eine Ausführung stattgefunden hat
          const [existingExecution] = await db
            .select()
            .from(recurringOrderExecutions)
            .where(
              and(
                eq(recurringOrderExecutions.recurringOrderId, order.id),
                eq(recurringOrderExecutions.scheduledDate, today),
                eq(recurringOrderExecutions.success, true)
              )
            );

          if (existingExecution) {
            console.log(`Bestellung ${order.name} wurde heute bereits erfolgreich ausgeführt, überspringe`);
            continue;
          }

          // Genehmigung prüfen
          if (order.requiresApproval) {
            console.log(`Bestellung ${order.name} benötigt Genehmigung, überspringe automatische Ausführung`);
            continue;
          }

          // Bestellung ausführen
          const result = await executeRecurringOrder(order.id, today, 'automatic');
          
          if (result.success) {
            successCount++;
            console.log(`✓ Bestellung ${order.name} erfolgreich ausgeführt. Neue Bestellung: ${result.orderNumber}`);
            results.push({
              orderName: order.name,
              success: true,
              orderNumber: result.orderNumber,
              orderId: result.orderId
            });
          } else {
            errorCount++;
            console.error(`✗ Fehler bei Bestellung ${order.name}: ${result.error}`);
            results.push({
              orderName: order.name,
              success: false,
              error: result.error
            });
          }

          // Kurze Pause zwischen den Bestellungen, um die Datenbank nicht zu überlasten
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
          console.error(`✗ Unerwarteter Fehler bei Bestellung ${order.name}:`, error);
          results.push({
            orderName: order.name,
            success: false,
            error: errorMessage
          });
        }
      }

      // Zusammenfassung protokollieren
      console.log(`\n=== Zusammenfassung wiederkehrende Bestellungen ===`);
      console.log(`Gesamt fällig: ${dueOrders.length}`);
      console.log(`Erfolgreich: ${successCount}`);
      console.log(`Fehler: ${errorCount}`);
      console.log(`=================================================\n`);

      // Detaillierte Ergebnisse protokollieren
      if (results.length > 0) {
        console.log('Detaillierte Ergebnisse:');
        results.forEach((result, index) => {
          if (result.success) {
            console.log(`${index + 1}. ✓ ${result.orderName} → ${result.orderNumber}`);
          } else {
            console.log(`${index + 1}. ✗ ${result.orderName} → ${result.error}`);
          }
        });
      }

    } catch (error) {
      console.error('Kritischer Fehler beim Verarbeiten wiederkehrender Bestellungen:', error);
      throw error;
    }
  }

  /**
   * Gibt den aktuellen Status des Cron-Services zurück
   */
  getStatus(): {
    isActive: boolean;
    isRunning: boolean;
    nextRun?: string;
  } {
    return {
      isActive: this.cronJob !== null,
      isRunning: this.isRunning,
      nextRun: this.cronJob ? 'Täglich um 06:00 Uhr' : undefined
    };
  }

  /**
   * Gibt Statistiken über die letzten Ausführungen zurück
   */
  async getExecutionStats(days: number = 7): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    executionsByDay: Array<{ date: string; total: number; successful: number; failed: number }>;
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const executions = await db
      .select()
      .from(recurringOrderExecutions)
      .where(
        and(
          lte(recurringOrderExecutions.scheduledDate, endDate.toISOString().split('T')[0]),
          lte(startDate.toISOString().split('T')[0], recurringOrderExecutions.scheduledDate)
        )
      );

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.success).length;
    const failedExecutions = executions.filter(e => !e.success).length;

    // Gruppierung nach Tagen
    const executionsByDay: { [key: string]: { total: number; successful: number; failed: number } } = {};
    
    executions.forEach(execution => {
      const day = execution.scheduledDate;
      if (!executionsByDay[day]) {
        executionsByDay[day] = { total: 0, successful: 0, failed: 0 };
      }
      executionsByDay[day].total++;
      if (execution.success) {
        executionsByDay[day].successful++;
      } else {
        executionsByDay[day].failed++;
      }
    });

    const executionsByDayArray = Object.entries(executionsByDay).map(([date, stats]) => ({
      date,
      ...stats
    })).sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      executionsByDay: executionsByDayArray
    };
  }
}

// Singleton-Instanz erstellen
const recurringOrderCronService = new RecurringOrderCronService();

export { recurringOrderCronService, RecurringOrderCronService };