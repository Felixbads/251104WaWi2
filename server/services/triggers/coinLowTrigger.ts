import { notificationService } from '../notificationService';
import { db } from '../../db';
import { machineStocks, machines, locations } from '@shared/schema';
import { eq, sql, and, lt } from 'drizzle-orm';

/**
 * Coin Low Trigger - Münzbestand niedrig
 * Monitors coin levels in vending machines and triggers notifications when they fall below critical levels
 */
export class CoinLowTrigger {
  /**
   * Check all machines for low coin levels
   */
  async checkCoinLevels(): Promise<void> {
    try {
      console.log('Checking coin levels across all machines...');

      // Get machines with low coin credit (less than 50 EUR worth of change)
      const lowCoinMachines = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          // Assuming coinCredit is tracked somewhere - this may need adjustment based on actual schema
          coinCredit: sql<number>`COALESCE(${machines.coinCredit}, 0)`
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.isActive, true),
            lt(sql<number>`COALESCE(${machines.coinCredit}, 0)`, 50) // Less than 50 EUR in coin credit
          )
        );

      console.log(`Found ${lowCoinMachines.length} machines with low coin levels`);

      for (const machine of lowCoinMachines) {
        const payload = {
          machineId: machine.machineId,
          machineName: machine.machineName,
          vendonId: machine.vendonId,
          locationName: machine.locationName,
          locationId: machine.locationId,
          currentCoinCredit: machine.coinCredit,
          criticalLevel: 50,
          severity: machine.coinCredit < 20 ? 'critical' : 'warning',
          timestamp: new Date().toISOString(),
          message: `Münzbestand niedrig in ${machine.machineName}: ${machine.coinCredit}€ verfügbar`
        };

        // Record the event (with deduplication)
        await notificationService.recordEvent('coin_low', payload, 3600); // 1 hour dedupe window
      }

    } catch (error) {
      console.error('Error checking coin levels:', error);
      throw error;
    }
  }

  /**
   * Check coin level for a specific machine
   */
  async checkMachineCoinLevel(machineId: number): Promise<void> {
    try {
      const machine = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          coinCredit: sql<number>`COALESCE(${machines.coinCredit}, 0)`
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

      if (machineData.coinCredit < 50) {
        const payload = {
          machineId: machineData.machineId,
          machineName: machineData.machineName,
          vendonId: machineData.vendonId,
          locationName: machineData.locationName,
          locationId: machineData.locationId,
          currentCoinCredit: machineData.coinCredit,
          criticalLevel: 50,
          severity: machineData.coinCredit < 20 ? 'critical' : 'warning',
          timestamp: new Date().toISOString(),
          message: `Münzbestand niedrig in ${machineData.machineName}: ${machineData.coinCredit}€ verfügbar`
        };

        await notificationService.recordEvent('coin_low', payload, 1800); // 30 minute dedupe window for specific machine
      }

    } catch (error) {
      console.error(`Error checking coin level for machine ${machineId}:`, error);
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
          eventType: 'coin_low',
          processed: false
        });

        await this.checkMachineCoinLevel(machine.id);

        const eventsAfter = await notificationService.getEvents({
          eventType: 'coin_low',
          processed: false
        });

        if (eventsAfter.length > eventsBefore.length) {
          alertsTriggered++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Manual coin check completed in ${duration}ms: ${allMachines.length} machines checked, ${alertsTriggered} alerts triggered`);

      return {
        machinesChecked: allMachines.length,
        alertsTriggered
      };

    } catch (error) {
      console.error('Error in manual coin level check:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const coinLowTrigger = new CoinLowTrigger();