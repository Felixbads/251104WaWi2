import { notificationService } from '../notificationService';
import { db } from '../../db';
import { transactions, machines, locations } from '@shared/schema';
import { eq, sql, and, gte, lt } from 'drizzle-orm';

/**
 * Sales Yesterday Trigger - gestrige Umsätze (Summe + pro Standort)
 * Generates daily sales reports for the previous day
 */
export class SalesYesterdayTrigger {
  /**
   * Generate sales report for yesterday
   */
  async generateYesterdaySalesReport(): Promise<void> {
    try {
      console.log('Generating yesterday sales report...');

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get total sales for yesterday
      const totalSales = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          totalTransactions: sql<number>`COUNT(*)`,
          averageTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
          totalCashTransactions: sql<number>`COUNT(CASE WHEN ${transactions.paymentMethod} = 'CASH' THEN 1 END)`,
          totalCardTransactions: sql<number>`COUNT(CASE WHEN ${transactions.paymentMethod} = 'CASHLESS' THEN 1 END)`,
          cashRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.paymentMethod} = 'CASH' THEN ${transactions.price} ELSE 0 END), 0)`,
          cardRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.paymentMethod} = 'CASHLESS' THEN ${transactions.price} ELSE 0 END), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, yesterday.toISOString()),
            lt(transactions.datetime, today.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      // Get sales by location
      const salesByLocation = await db
        .select({
          locationId: locations.id,
          locationName: locations.name,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          transactionCount: sql<number>`COUNT(${transactions.id})`,
          averagePerTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
          machineCount: sql<number>`COUNT(DISTINCT ${machines.id})`
        })
        .from(transactions)
        .innerJoin(machines, eq(transactions.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            gte(transactions.datetime, yesterday.toISOString()),
            lt(transactions.datetime, today.toISOString()),
            eq(transactions.status, 'completed')
          )
        )
        .groupBy(locations.id, locations.name)
        .orderBy(sql`SUM(${transactions.price}) DESC`);

      // Get sales by machine (top 10)
      const salesByMachine = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          transactionCount: sql<number>`COUNT(${transactions.id})`,
          averagePerTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`
        })
        .from(transactions)
        .innerJoin(machines, eq(transactions.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            gte(transactions.datetime, yesterday.toISOString()),
            lt(transactions.datetime, today.toISOString()),
            eq(transactions.status, 'completed')
          )
        )
        .groupBy(machines.id, machines.name, locations.name)
        .orderBy(sql`SUM(${transactions.price}) DESC`)
        .limit(10);

      // Get most popular products
      const topProducts = await db
        .select({
          productName: transactions.productName,
          productId: transactions.productId,
          quantitySold: sql<number>`COALESCE(SUM(${transactions.quantity}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          averagePrice: sql<number>`COALESCE(AVG(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, yesterday.toISOString()),
            lt(transactions.datetime, today.toISOString()),
            eq(transactions.status, 'completed'),
            sql`${transactions.productName} IS NOT NULL`
          )
        )
        .groupBy(transactions.productName, transactions.productId)
        .orderBy(sql`COALESCE(SUM(${transactions.quantity}), 0) DESC`)
        .limit(10);

      const report = totalSales[0];
      
      const payload = {
        reportDate: yesterday.toISOString().split('T')[0],
        generatedAt: new Date().toISOString(),
        summary: {
          totalRevenue: Number(report.totalRevenue.toFixed(2)),
          totalTransactions: report.totalTransactions,
          averageTransaction: Number(report.averageTransaction.toFixed(2)),
          cashTransactions: report.totalCashTransactions,
          cardTransactions: report.totalCardTransactions,
          cashRevenue: Number(report.cashRevenue.toFixed(2)),
          cardRevenue: Number(report.cardRevenue.toFixed(2)),
          cashPercentage: report.totalRevenue > 0 ? Number(((report.cashRevenue / report.totalRevenue) * 100).toFixed(1)) : 0
        },
        locationBreakdown: salesByLocation.map(loc => ({
          locationId: loc.locationId,
          locationName: loc.locationName || 'Unbekannter Standort',
          revenue: Number(loc.revenue.toFixed(2)),
          transactionCount: loc.transactionCount,
          averagePerTransaction: Number(loc.averagePerTransaction.toFixed(2)),
          machineCount: loc.machineCount,
          revenueShare: report.totalRevenue > 0 ? Number(((loc.revenue / report.totalRevenue) * 100).toFixed(1)) : 0
        })),
        topMachines: salesByMachine.map(machine => ({
          machineId: machine.machineId,
          machineName: machine.machineName,
          locationName: machine.locationName || 'Unbekannter Standort',
          revenue: Number(machine.revenue.toFixed(2)),
          transactionCount: machine.transactionCount,
          averagePerTransaction: Number(machine.averagePerTransaction.toFixed(2))
        })),
        topProducts: topProducts.map(product => ({
          productName: product.productName,
          productId: product.productId,
          quantitySold: product.quantitySold,
          revenue: Number(product.revenue.toFixed(2)),
          averagePrice: Number(product.averagePrice.toFixed(2))
        })),
        performance: {
          revenueGrowth: await this.calculateRevenueGrowth(yesterday),
          bestPerformingLocation: salesByLocation[0]?.locationName || 'N/A',
          bestPerformingMachine: salesByMachine[0]?.machineName || 'N/A'
        }
      };

      // Record the event
      await notificationService.recordEvent('sales_yesterday', payload, 86400); // 24 hour dedupe window

      console.log(`Yesterday sales report generated: ${report.totalRevenue}€ from ${report.totalTransactions} transactions`);

    } catch (error) {
      console.error('Error generating yesterday sales report:', error);
      throw error;
    }
  }

  /**
   * Calculate revenue growth compared to previous day
   */
  private async calculateRevenueGrowth(targetDate: Date): Promise<number> {
    try {
      const dayBefore = new Date(targetDate);
      dayBefore.setDate(dayBefore.getDate() - 1);

      const targetRevenue = await db
        .select({
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, targetDate.toISOString()),
            lt(transactions.datetime, new Date(targetDate.getTime() + 24 * 60 * 60 * 1000).toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      const previousRevenue = await db
        .select({
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, dayBefore.toISOString()),
            lt(transactions.datetime, targetDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      const target = targetRevenue[0]?.revenue || 0;
      const previous = previousRevenue[0]?.revenue || 0;

      if (previous === 0) return target > 0 ? 100 : 0;
      
      return Number((((target - previous) / previous) * 100).toFixed(2));

    } catch (error) {
      console.error('Error calculating revenue growth:', error);
      return 0;
    }
  }

  /**
   * Get sales data for a specific date
   */
  async getSalesForDate(date: Date): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const totalSales = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          totalTransactions: sql<number>`COUNT(*)`,
          averageTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, startOfDay.toISOString()),
            lt(transactions.datetime, endOfDay.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      return totalSales[0];

    } catch (error) {
      console.error(`Error getting sales for date ${date}:`, error);
      throw error;
    }
  }

  /**
   * Manual trigger for testing or immediate report generation
   */
  async triggerManualReport(date?: Date): Promise<{ reportGenerated: boolean; reportDate: string }> {
    try {
      const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday if no date provided
      targetDate.setHours(0, 0, 0, 0);

      await this.generateYesterdaySalesReport();

      return {
        reportGenerated: true,
        reportDate: targetDate.toISOString().split('T')[0]
      };

    } catch (error) {
      console.error('Error in manual sales report generation:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const salesYesterdayTrigger = new SalesYesterdayTrigger();