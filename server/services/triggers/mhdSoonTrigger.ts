import { notificationService } from '../notificationService';
import { db } from '../../db';
import { machineStocks, machines, locations, products } from '@shared/schema';
import { eq, sql, and, lte } from 'drizzle-orm';

/**
 * MHD Soon Trigger - MHD bald (nur Produkte in Automaten)
 * Monitors expiry dates of products in vending machines and triggers notifications for soon-to-expire items
 */
export class MhdSoonTrigger {
  /**
   * Check all machines for products with expiry dates within warning period
   */
  async checkExpiryDates(warningDays: number = 7): Promise<void> {
    try {
      console.log(`Checking for products expiring within ${warningDays} days...`);

      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + warningDays);

      // Get products in machines that are expiring soon
      const expiringProducts = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          productName: sql<string>`COALESCE(${machineStocks.productVendonId}, 'Unbekanntes Produkt')`,
          selectionNumber: machineStocks.selectionNumber,
          quantity: machineStocks.quantity,
          expiryDate: machineStocks.expiryDate,
          daysUntilExpiry: sql<number>`DATE_PART('day', ${machineStocks.expiryDate} - CURRENT_DATE)`
        })
        .from(machineStocks)
        .innerJoin(machines, eq(machineStocks.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.isActive, true),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.quantity} > 0`,
            sql`${machineStocks.expiryDate} IS NOT NULL`,
            lte(machineStocks.expiryDate, warningDate.toISOString().split('T')[0])
          )
        )
        .orderBy(machineStocks.expiryDate);

      console.log(`Found ${expiringProducts.length} products expiring soon`);

      // Group by machine for efficient notification
      const machineGroups = new Map<number, typeof expiringProducts>();
      
      for (const product of expiringProducts) {
        if (!machineGroups.has(product.machineId)) {
          machineGroups.set(product.machineId, []);
        }
        machineGroups.get(product.machineId)!.push(product);
      }

      for (const [machineId, products] of machineGroups) {
        const machine = products[0]; // Get machine info from first product
        
        const payload = {
          machineId: machine.machineId,
          machineName: machine.machineName,
          vendonId: machine.vendonId,
          locationName: machine.locationName,
          locationId: machine.locationId,
          expiringProducts: products.map(p => ({
            productName: p.productName,
            selectionNumber: p.selectionNumber,
            quantity: p.quantity,
            expiryDate: p.expiryDate,
            daysUntilExpiry: p.daysUntilExpiry
          })),
          totalExpiringItems: products.reduce((sum, p) => sum + (p.quantity || 0), 0),
          urgentItems: products.filter(p => (p.daysUntilExpiry || 0) <= 3).length,
          warningItems: products.filter(p => (p.daysUntilExpiry || 0) > 3 && (p.daysUntilExpiry || 0) <= 7).length,
          timestamp: new Date().toISOString(),
          message: `MHD-Warnung für ${machine.machineName}: ${products.length} Produkte laufen ab`,
          severity: products.some(p => (p.daysUntilExpiry || 0) <= 3) ? 'critical' : 'warning'
        };

        // Record the event (with deduplication based on machine and day)
        await notificationService.recordEvent('mhd_soon', payload, 43200); // 12 hour dedupe window
      }

    } catch (error) {
      console.error('Error checking expiry dates:', error);
      throw error;
    }
  }

  /**
   * Check expiry dates for a specific machine
   */
  async checkMachineExpiryDates(machineId: number, warningDays: number = 7): Promise<void> {
    try {
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + warningDays);

      const expiringProducts = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          productName: sql<string>`COALESCE(${machineStocks.productVendonId}, 'Unbekanntes Produkt')`,
          selectionNumber: machineStocks.selectionNumber,
          quantity: machineStocks.quantity,
          expiryDate: machineStocks.expiryDate,
          daysUntilExpiry: sql<number>`DATE_PART('day', ${machineStocks.expiryDate} - CURRENT_DATE)`
        })
        .from(machineStocks)
        .innerJoin(machines, eq(machineStocks.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.id, machineId),
            eq(machines.isActive, true),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.quantity} > 0`,
            sql`${machineStocks.expiryDate} IS NOT NULL`,
            lte(machineStocks.expiryDate, warningDate.toISOString().split('T')[0])
          )
        )
        .orderBy(machineStocks.expiryDate);

      if (expiringProducts.length === 0) {
        console.log(`No expiring products found for machine ${machineId}`);
        return;
      }

      const machine = expiringProducts[0];
      
      const payload = {
        machineId: machine.machineId,
        machineName: machine.machineName,
        vendonId: machine.vendonId,
        locationName: machine.locationName,
        locationId: machine.locationId,
        expiringProducts: expiringProducts.map(p => ({
          productName: p.productName,
          selectionNumber: p.selectionNumber,
          quantity: p.quantity,
          expiryDate: p.expiryDate,
          daysUntilExpiry: p.daysUntilExpiry
        })),
        totalExpiringItems: expiringProducts.reduce((sum, p) => sum + (p.quantity || 0), 0),
        urgentItems: expiringProducts.filter(p => (p.daysUntilExpiry || 0) <= 3).length,
        warningItems: expiringProducts.filter(p => (p.daysUntilExpiry || 0) > 3 && (p.daysUntilExpiry || 0) <= 7).length,
        timestamp: new Date().toISOString(),
        message: `MHD-Warnung für ${machine.machineName}: ${expiringProducts.length} Produkte laufen ab`,
        severity: expiringProducts.some(p => (p.daysUntilExpiry || 0) <= 3) ? 'critical' : 'warning'
      };

      await notificationService.recordEvent('mhd_soon', payload, 21600); // 6 hour dedupe window for specific machine
      
    } catch (error) {
      console.error(`Error checking expiry dates for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Get expiry summary for all machines
   */
  async getExpirySummary(): Promise<{
    totalMachines: number;
    machinesWithExpiringProducts: number;
    totalExpiringProducts: number;
    urgentItems: number;
    warningItems: number;
    detailsByMachine: Array<{
      machineId: number;
      machineName: string;
      locationName: string;
      expiringProductCount: number;
      urgentCount: number;
      earliestExpiry: string | null;
    }>;
  }> {
    try {
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + 7);

      const summary = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          expiringProductCount: sql<number>`COUNT(${machineStocks.id})`,
          urgentCount: sql<number>`COUNT(CASE WHEN DATE_PART('day', ${machineStocks.expiryDate} - CURRENT_DATE) <= 3 THEN 1 END)`,
          earliestExpiry: sql<string>`MIN(${machineStocks.expiryDate})`
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(
          machineStocks,
          and(
            eq(machineStocks.machineId, machines.id),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.quantity} > 0`,
            sql`${machineStocks.expiryDate} IS NOT NULL`,
            lte(machineStocks.expiryDate, warningDate.toISOString().split('T')[0])
          )
        )
        .where(eq(machines.isActive, true))
        .groupBy(machines.id, machines.name, locations.name)
        .having(sql`COUNT(${machineStocks.id}) > 0`);

      const totalMachines = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(machines)
        .where(eq(machines.isActive, true));

      const totals = summary.reduce(
        (acc, machine) => ({
          totalExpiringProducts: acc.totalExpiringProducts + machine.expiringProductCount,
          urgentItems: acc.urgentItems + machine.urgentCount,
          warningItems: acc.warningItems + (machine.expiringProductCount - machine.urgentCount)
        }),
        { totalExpiringProducts: 0, urgentItems: 0, warningItems: 0 }
      );

      return {
        totalMachines: totalMachines[0].count,
        machinesWithExpiringProducts: summary.length,
        ...totals,
        detailsByMachine: summary
      };

    } catch (error) {
      console.error('Error getting expiry summary:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for testing or immediate check
   */
  async triggerManualCheck(warningDays: number = 7): Promise<{ machinesChecked: number; alertsTriggered: number }> {
    const startTime = Date.now();
    let alertsTriggered = 0;

    try {
      const allMachines = await db
        .select({ id: machines.id })
        .from(machines)
        .where(eq(machines.isActive, true));

      for (const machine of allMachines) {
        const eventsBefore = await notificationService.getEvents({
          eventType: 'mhd_soon',
          processed: false
        });

        await this.checkMachineExpiryDates(machine.id, warningDays);

        const eventsAfter = await notificationService.getEvents({
          eventType: 'mhd_soon',
          processed: false
        });

        if (eventsAfter.length > eventsBefore.length) {
          alertsTriggered++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Manual expiry check completed in ${duration}ms: ${allMachines.length} machines checked, ${alertsTriggered} alerts triggered`);

      return {
        machinesChecked: allMachines.length,
        alertsTriggered
      };

    } catch (error) {
      console.error('Error in manual expiry check:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const mhdSoonTrigger = new MhdSoonTrigger();