import { notificationService } from '../notificationService';
import { db } from '../../db';
import { machineStocks, machines, locations } from '@shared/schema';
import { eq, sql, and, lte } from 'drizzle-orm';

/**
 * Stock Low Trigger - Lagerbestand niedrig (nur Produkte in Automaten)
 * Monitors stock levels in vending machines and triggers notifications when they fall below critical levels
 */
export class StockLowTrigger {
  /**
   * Check all machines for low stock levels
   */
  async checkStockLevels(): Promise<void> {
    try {
      console.log('Checking stock levels across all machines...');

      // Get products in machines with low stock (below critical or 20% of max)
      const lowStockProducts = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          productName: sql<string>`COALESCE(${machineStocks.productVendonId}, 'Unbekanntes Produkt')`,
          selectionNumber: machineStocks.selectionNumber,
          currentQuantity: machineStocks.quantity,
          maxQuantity: machineStocks.maxQuantity,
          criticalLevel: sql<number>`COALESCE(${machineStocks.maxQuantity} * 0.2, 5)`, // 20% of max or 5 items
          stockPercentage: sql<number>`CASE WHEN ${machineStocks.maxQuantity} > 0 THEN (${machineStocks.quantity}::float / ${machineStocks.maxQuantity}::float) * 100 ELSE 0 END`
        })
        .from(machineStocks)
        .innerJoin(machines, eq(machineStocks.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.isActive, true),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.maxQuantity} > 0`,
            sql`(${machineStocks.quantity}::float / ${machineStocks.maxQuantity}::float) <= 0.3` // 30% or less
          )
        )
        .orderBy(sql`(${machineStocks.quantity}::float / ${machineStocks.maxQuantity}::float)`);

      console.log(`Found ${lowStockProducts.length} products with low stock`);

      // Group by machine for efficient notification
      const machineGroups = new Map<number, typeof lowStockProducts>();
      
      for (const product of lowStockProducts) {
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
          lowStockProducts: products.map(p => ({
            productName: p.productName,
            selectionNumber: p.selectionNumber,
            currentQuantity: p.currentQuantity,
            maxQuantity: p.maxQuantity,
            stockPercentage: Math.round(p.stockPercentage || 0),
            urgency: p.stockPercentage <= 10 ? 'critical' : p.stockPercentage <= 20 ? 'high' : 'medium'
          })),
          totalLowStockItems: products.length,
          criticalItems: products.filter(p => (p.stockPercentage || 0) <= 10).length,
          highPriorityItems: products.filter(p => (p.stockPercentage || 0) > 10 && (p.stockPercentage || 0) <= 20).length,
          mediumPriorityItems: products.filter(p => (p.stockPercentage || 0) > 20 && (p.stockPercentage || 0) <= 30).length,
          timestamp: new Date().toISOString(),
          message: `Lagerbestand niedrig in ${machine.machineName}: ${products.length} Produkte benötigen Nachschub`,
          severity: products.some(p => (p.stockPercentage || 0) <= 10) ? 'critical' : 'warning',
          recommendedAction: 'Nachfüllung planen'
        };

        // Record the event (with deduplication)
        await notificationService.recordEvent('stock_low', payload, 10800); // 3 hour dedupe window
      }

    } catch (error) {
      console.error('Error checking stock levels:', error);
      throw error;
    }
  }

  /**
   * Check stock levels for a specific machine
   */
  async checkMachineStockLevels(machineId: number): Promise<void> {
    try {
      const lowStockProducts = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          productName: sql<string>`COALESCE(${machineStocks.productVendonId}, 'Unbekanntes Produkt')`,
          selectionNumber: machineStocks.selectionNumber,
          currentQuantity: machineStocks.quantity,
          maxQuantity: machineStocks.maxQuantity,
          stockPercentage: sql<number>`CASE WHEN ${machineStocks.maxQuantity} > 0 THEN (${machineStocks.quantity}::float / ${machineStocks.maxQuantity}::float) * 100 ELSE 0 END`
        })
        .from(machineStocks)
        .innerJoin(machines, eq(machineStocks.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.id, machineId),
            eq(machines.isActive, true),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.maxQuantity} > 0`,
            sql`(${machineStocks.quantity}::float / ${machineStocks.maxQuantity}::float) <= 0.3`
          )
        )
        .orderBy(sql`(${machineStocks.quantity}::float / ${machineStocks.maxQuantity}::float)`);

      if (lowStockProducts.length === 0) {
        console.log(`No low stock products found for machine ${machineId}`);
        return;
      }

      const machine = lowStockProducts[0];
      
      const payload = {
        machineId: machine.machineId,
        machineName: machine.machineName,
        vendonId: machine.vendonId,
        locationName: machine.locationName,
        locationId: machine.locationId,
        lowStockProducts: lowStockProducts.map(p => ({
          productName: p.productName,
          selectionNumber: p.selectionNumber,
          currentQuantity: p.currentQuantity,
          maxQuantity: p.maxQuantity,
          stockPercentage: Math.round(p.stockPercentage || 0),
          urgency: p.stockPercentage <= 10 ? 'critical' : p.stockPercentage <= 20 ? 'high' : 'medium'
        })),
        totalLowStockItems: lowStockProducts.length,
        criticalItems: lowStockProducts.filter(p => (p.stockPercentage || 0) <= 10).length,
        highPriorityItems: lowStockProducts.filter(p => (p.stockPercentage || 0) > 10 && (p.stockPercentage || 0) <= 20).length,
        mediumPriorityItems: lowStockProducts.filter(p => (p.stockPercentage || 0) > 20 && (p.stockPercentage || 0) <= 30).length,
        timestamp: new Date().toISOString(),
        message: `Lagerbestand niedrig in ${machine.machineName}: ${lowStockProducts.length} Produkte benötigen Nachschub`,
        severity: lowStockProducts.some(p => (p.stockPercentage || 0) <= 10) ? 'critical' : 'warning',
        recommendedAction: 'Nachfüllung planen'
      };

      await notificationService.recordEvent('stock_low', payload, 5400); // 1.5 hour dedupe window for specific machine
      
    } catch (error) {
      console.error(`Error checking stock levels for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Get refill recommendations based on current stock levels
   */
  async getRefillRecommendations(): Promise<Array<{
    machineId: number;
    machineName: string;
    locationName: string;
    refillProducts: Array<{
      productName: string;
      selectionNumber: string;
      currentQuantity: number;
      recommendedQuantity: number;
      priority: 'critical' | 'high' | 'medium' | 'low';
    }>;
    totalProductsToRefill: number;
    estimatedRefillTime: number; // in minutes
    urgency: 'urgent' | 'high' | 'medium' | 'low';
  }>> {
    try {
      // Get all machines with stock data
      const allStocks = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          productName: sql<string>`COALESCE(${machineStocks.productVendonId}, 'Unbekanntes Produkt')`,
          selectionNumber: machineStocks.selectionNumber,
          currentQuantity: machineStocks.quantity,
          maxQuantity: machineStocks.maxQuantity,
          stockPercentage: sql<number>`CASE WHEN ${machineStocks.maxQuantity} > 0 THEN (${machineStocks.quantity}::float / ${machineStocks.maxQuantity}::float) * 100 ELSE 0 END`
        })
        .from(machineStocks)
        .innerJoin(machines, eq(machineStocks.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.isActive, true),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.maxQuantity} > 0`
          )
        );

      // Group by machine
      const machineGroups = new Map<number, typeof allStocks>();
      for (const stock of allStocks) {
        if (!machineGroups.has(stock.machineId)) {
          machineGroups.set(stock.machineId, []);
        }
        machineGroups.get(stock.machineId)!.push(stock);
      }

      const recommendations = [];

      for (const [machineId, stocks] of machineGroups) {
        const refillProducts = stocks
          .filter(s => (s.stockPercentage || 0) <= 50) // Recommend refill for products below 50%
          .map(s => ({
            productName: s.productName,
            selectionNumber: s.selectionNumber,
            currentQuantity: s.currentQuantity || 0,
            recommendedQuantity: (s.maxQuantity || 0) - (s.currentQuantity || 0),
            priority: (s.stockPercentage || 0) <= 10 ? 'critical' as const
              : (s.stockPercentage || 0) <= 20 ? 'high' as const
              : (s.stockPercentage || 0) <= 30 ? 'medium' as const
              : 'low' as const
          }))
          .sort((a, b) => {
            const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
          });

        if (refillProducts.length > 0) {
          const machine = stocks[0];
          const criticalCount = refillProducts.filter(p => p.priority === 'critical').length;
          const highCount = refillProducts.filter(p => p.priority === 'high').length;

          recommendations.push({
            machineId: machine.machineId,
            machineName: machine.machineName,
            locationName: machine.locationName,
            refillProducts,
            totalProductsToRefill: refillProducts.length,
            estimatedRefillTime: Math.ceil(refillProducts.length * 2), // 2 minutes per product
            urgency: criticalCount > 0 ? 'urgent' as const
              : highCount > 0 ? 'high' as const
              : refillProducts.length > 5 ? 'medium' as const
              : 'low' as const
          });
        }
      }

      // Sort by urgency and number of products needing refill
      return recommendations.sort((a, b) => {
        const urgencyOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
        }
        return b.totalProductsToRefill - a.totalProductsToRefill;
      });

    } catch (error) {
      console.error('Error getting refill recommendations:', error);
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
          eventType: 'stock_low',
          processed: false
        });

        await this.checkMachineStockLevels(machine.id);

        const eventsAfter = await notificationService.getEvents({
          eventType: 'stock_low',
          processed: false
        });

        if (eventsAfter.length > eventsBefore.length) {
          alertsTriggered++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Manual stock check completed in ${duration}ms: ${allMachines.length} machines checked, ${alertsTriggered} alerts triggered`);

      return {
        machinesChecked: allMachines.length,
        alertsTriggered
      };

    } catch (error) {
      console.error('Error in manual stock level check:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const stockLowTrigger = new StockLowTrigger();