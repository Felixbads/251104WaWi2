import { notificationService } from '../notificationService';
import { db } from '../../db';
import { machines, locations } from '@shared/schema';
import { eq, sql, and, gt } from 'drizzle-orm';

/**
 * Cash High Trigger - zu viel Bargeld → Abholung
 * Monitors cash levels in vending machines and triggers notifications when they exceed safe limits
 */
export class CashHighTrigger {
  /**
   * Check all machines for high cash levels
   */
  async checkCashLevels(): Promise<void> {
    try {
      console.log('Checking cash levels across all machines...');

      // Get machines with high cash levels (more than 500 EUR)
      const highCashMachines = await db
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
            eq(machines.isActive, true),
            gt(sql<number>`COALESCE(${machines.cashCredit}, 0)`, 500) // More than 500 EUR in cash
          )
        );

      console.log(`Found ${highCashMachines.length} machines with high cash levels`);

      for (const machine of highCashMachines) {
        const payload = {
          machineId: machine.machineId,
          machineName: machine.machineName,
          vendonId: machine.vendonId,
          locationName: machine.locationName,
          locationId: machine.locationId,
          currentCashCredit: machine.cashCredit,
          currentCardCredit: machine.cardCredit,
          totalCash: machine.totalCash,
          maxSafeLevel: 500,
          severity: machine.totalCash > 1000 ? 'critical' : 'warning',
          timestamp: new Date().toISOString(),
          message: `Bargeldabholung erforderlich in ${machine.machineName}: ${machine.totalCash}€ verfügbar`,
          recommendedAction: 'Bargeldabholung planen'
        };

        // Record the event (with deduplication)
        await notificationService.recordEvent('cash_high', payload, 7200); // 2 hour dedupe window
      }

    } catch (error) {
      console.error('Error checking cash levels:', error);
      throw error;
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