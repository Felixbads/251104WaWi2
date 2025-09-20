import { notificationService } from '../notificationService';
import { db } from '../../db';
import { transactions, machines, locations } from '@shared/schema';
import { eq, sql, and, gte, lt } from 'drizzle-orm';

/**
 * Sales Weekly Trigger - Umsätze der letzten Woche (Summe + pro Standort)
 * Generates weekly sales reports for the previous 7 days
 */
export class SalesWeeklyTrigger {
  /**
   * Generate weekly sales report
   */
  async generateWeeklySalesReport(): Promise<void> {
    try {
      console.log('Generating weekly sales report...');

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);

      // Get total sales for the week
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
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      // Get daily breakdown for the week
      const dailyBreakdown = await db
        .select({
          date: sql<string>`DATE(${transactions.datetime})`,
          dayOfWeek: sql<string>`TO_CHAR(${transactions.datetime}::date, 'Day')`,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          transactionCount: sql<number>`COUNT(*)`,
          averageTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        )
        .groupBy(sql`DATE(${transactions.datetime})`, sql`TO_CHAR(${transactions.datetime}::date, 'Day')`)
        .orderBy(sql`DATE(${transactions.datetime})`);

      // Get sales by location for the week
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
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        )
        .groupBy(locations.id, locations.name)
        .orderBy(sql`SUM(${transactions.price}) DESC`);

      // Get hourly pattern analysis
      const hourlyPattern = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${transactions.datetime})`,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          transactionCount: sql<number>`COUNT(*)`,
          averageTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        )
        .groupBy(sql`EXTRACT(HOUR FROM ${transactions.datetime})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${transactions.datetime})`);

      // Get top performing machines for the week
      const topMachines = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          transactionCount: sql<number>`COUNT(${transactions.id})`,
          averagePerTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
          dailyAverage: sql<number>`COALESCE(SUM(${transactions.price}) / 7.0, 0)`
        })
        .from(transactions)
        .innerJoin(machines, eq(transactions.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        )
        .groupBy(machines.id, machines.name, locations.name)
        .orderBy(sql`SUM(${transactions.price}) DESC`)
        .limit(15);

      // Get product performance
      const topProducts = await db
        .select({
          productName: transactions.productName,
          productId: transactions.productId,
          quantitySold: sql<number>`COALESCE(SUM(${transactions.quantity}), 0)`,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          averagePrice: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
          transactionCount: sql<number>`COUNT(*)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed'),
            sql`${transactions.productName} IS NOT NULL`
          )
        )
        .groupBy(transactions.productName, transactions.productId)
        .orderBy(sql`COALESCE(SUM(${transactions.price}), 0) DESC`)
        .limit(15);

      const report = totalSales[0];
      const weekNumber = this.getWeekNumber(endDate);
      
      const payload = {
        reportPeriod: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          weekNumber,
          year: endDate.getFullYear()
        },
        generatedAt: new Date().toISOString(),
        summary: {
          totalRevenue: Number(report.totalRevenue.toFixed(2)),
          totalTransactions: report.totalTransactions,
          averageTransaction: Number(report.averageTransaction.toFixed(2)),
          dailyAverage: Number((report.totalRevenue / 7).toFixed(2)),
          cashTransactions: report.totalCashTransactions,
          cardTransactions: report.totalCardTransactions,
          cashRevenue: Number(report.cashRevenue.toFixed(2)),
          cardRevenue: Number(report.cardRevenue.toFixed(2)),
          cashPercentage: report.totalRevenue > 0 ? Number(((report.cashRevenue / report.totalRevenue) * 100).toFixed(1)) : 0
        },
        dailyBreakdown: dailyBreakdown.map(day => ({
          date: day.date,
          dayOfWeek: day.dayOfWeek.trim(),
          revenue: Number(day.revenue.toFixed(2)),
          transactionCount: day.transactionCount,
          averageTransaction: Number(day.averageTransaction.toFixed(2)),
          revenueShare: report.totalRevenue > 0 ? Number(((day.revenue / report.totalRevenue) * 100).toFixed(1)) : 0
        })),
        locationBreakdown: salesByLocation.map(loc => ({
          locationId: loc.locationId,
          locationName: loc.locationName || 'Unbekannter Standort',
          revenue: Number(loc.revenue.toFixed(2)),
          transactionCount: loc.transactionCount,
          averagePerTransaction: Number(loc.averagePerTransaction.toFixed(2)),
          dailyAverage: Number((loc.revenue / 7).toFixed(2)),
          machineCount: loc.machineCount,
          revenueShare: report.totalRevenue > 0 ? Number(((loc.revenue / report.totalRevenue) * 100).toFixed(1)) : 0
        })),
        hourlyPattern: hourlyPattern.map(hour => ({
          hour: hour.hour,
          revenue: Number(hour.revenue.toFixed(2)),
          transactionCount: hour.transactionCount,
          averageTransaction: Number(hour.averageTransaction.toFixed(2))
        })),
        topMachines: topMachines.map(machine => ({
          machineId: machine.machineId,
          machineName: machine.machineName,
          locationName: machine.locationName || 'Unbekannter Standort',
          revenue: Number(machine.revenue.toFixed(2)),
          transactionCount: machine.transactionCount,
          averagePerTransaction: Number(machine.averagePerTransaction.toFixed(2)),
          dailyAverage: Number(machine.dailyAverage.toFixed(2))
        })),
        topProducts: topProducts.map(product => ({
          productName: product.productName,
          productId: product.productId,
          quantitySold: product.quantitySold,
          revenue: Number(product.revenue.toFixed(2)),
          averagePrice: Number(product.averagePrice.toFixed(2)),
          transactionCount: product.transactionCount
        })),
        performance: {
          weeklyGrowth: await this.calculateWeeklyGrowth(startDate, endDate),
          bestDay: dailyBreakdown.reduce((best, day) => day.revenue > best.revenue ? day : best, dailyBreakdown[0] || { date: 'N/A', revenue: 0 }),
          bestPerformingLocation: salesByLocation[0]?.locationName || 'N/A',
          bestPerformingMachine: topMachines[0]?.machineName || 'N/A',
          peakHour: hourlyPattern.reduce((peak, hour) => hour.revenue > peak.revenue ? hour : peak, hourlyPattern[0] || { hour: 0, revenue: 0 })
        }
      };

      // Record the event
      await notificationService.recordEvent('sales_weekly', payload, 604800); // 7 day dedupe window

      console.log(`Weekly sales report generated: ${report.totalRevenue}€ from ${report.totalTransactions} transactions (Week ${weekNumber})`);

    } catch (error) {
      console.error('Error generating weekly sales report:', error);
      throw error;
    }
  }

  /**
   * Calculate week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Calculate weekly growth compared to previous week
   */
  private async calculateWeeklyGrowth(startDate: Date, endDate: Date): Promise<number> {
    try {
      const previousWeekEnd = new Date(startDate);
      const previousWeekStart = new Date(startDate);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);

      const currentWeekRevenue = await db
        .select({
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      const previousWeekRevenue = await db
        .select({
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, previousWeekStart.toISOString()),
            lt(transactions.datetime, previousWeekEnd.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      const current = currentWeekRevenue[0]?.revenue || 0;
      const previous = previousWeekRevenue[0]?.revenue || 0;

      if (previous === 0) return current > 0 ? 100 : 0;
      
      return Number((((current - previous) / previous) * 100).toFixed(2));

    } catch (error) {
      console.error('Error calculating weekly growth:', error);
      return 0;
    }
  }

  /**
   * Get weekly summary for a specific week
   */
  async getWeeklySummary(weekNumber: number, year: number): Promise<any> {
    try {
      // Calculate start and end dates for the given week
      const startDate = this.getDateFromWeek(weekNumber, year);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      const summary = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          totalTransactions: sql<number>`COUNT(*)`,
          averageTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      return {
        weekNumber,
        year,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        ...summary[0]
      };

    } catch (error) {
      console.error(`Error getting weekly summary for week ${weekNumber}, ${year}:`, error);
      throw error;
    }
  }

  /**
   * Get start date for a given week number and year
   */
  private getDateFromWeek(weekNumber: number, year: number): Date {
    const date = new Date(year, 0, 1);
    const dayOfWeek = date.getDay();
    const daysToAdd = (weekNumber - 1) * 7 - dayOfWeek + 1;
    date.setDate(date.getDate() + daysToAdd);
    return date;
  }

  /**
   * Manual trigger for testing or immediate report generation
   */
  async triggerManualReport(): Promise<{ reportGenerated: boolean; weekNumber: number; year: number }> {
    try {
      const today = new Date();
      const weekNumber = this.getWeekNumber(today);
      
      await this.generateWeeklySalesReport();

      return {
        reportGenerated: true,
        weekNumber,
        year: today.getFullYear()
      };

    } catch (error) {
      console.error('Error in manual weekly sales report generation:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const salesWeeklyTrigger = new SalesWeeklyTrigger();