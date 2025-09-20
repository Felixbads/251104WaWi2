import { notificationService } from '../notificationService';
import { db } from '../../db';
import { transactions, machines, locations } from '@shared/schema';
import { eq, sql, and, gte, lt } from 'drizzle-orm';

/**
 * Margin Report Trigger - Ergebnis & Marge der Automaten
 * Generates profitability and margin reports for vending machines
 */
export class MarginReportTrigger {
  /**
   * Generate margin and profitability report
   */
  async generateMarginReport(): Promise<void> {
    try {
      console.log('Generating margin report...');

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Last 30 days
      startDate.setHours(0, 0, 0, 0);

      // Get profitability data by machine
      const machineMargins = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${transactions.totalCost}), 0)`,
          grossProfit: sql<number>`COALESCE(SUM(${transactions.grossProfit}), 0)`,
          transactionCount: sql<number>`COUNT(${transactions.id})`,
          averageTransaction: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
          marginPercentage: sql<number>`
            CASE 
              WHEN COALESCE(SUM(${transactions.price}), 0) > 0 
              THEN (COALESCE(SUM(${transactions.grossProfit}), 0) / COALESCE(SUM(${transactions.price}), 0)) * 100 
              ELSE 0 
            END
          `
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
        .groupBy(machines.id, machines.name, machines.vendonId, locations.name, locations.id)
        .orderBy(sql`COALESCE(SUM(${transactions.grossProfit}), 0) DESC`);

      // Get location-level profitability
      const locationMargins = await db
        .select({
          locationId: locations.id,
          locationName: locations.name,
          machineCount: sql<number>`COUNT(DISTINCT ${machines.id})`,
          totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${transactions.totalCost}), 0)`,
          grossProfit: sql<number>`COALESCE(SUM(${transactions.grossProfit}), 0)`,
          transactionCount: sql<number>`COUNT(${transactions.id})`,
          marginPercentage: sql<number>`
            CASE 
              WHEN COALESCE(SUM(${transactions.price}), 0) > 0 
              THEN (COALESCE(SUM(${transactions.grossProfit}), 0) / COALESCE(SUM(${transactions.price}), 0)) * 100 
              ELSE 0 
            END
          `,
          revenuePerMachine: sql<number>`
            CASE 
              WHEN COUNT(DISTINCT ${machines.id}) > 0 
              THEN COALESCE(SUM(${transactions.price}), 0) / COUNT(DISTINCT ${machines.id}) 
              ELSE 0 
            END
          `
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
        .orderBy(sql`COALESCE(SUM(${transactions.grossProfit}), 0) DESC`);

      // Get product profitability
      const productMargins = await db
        .select({
          productName: transactions.productName,
          productId: transactions.productId,
          quantitySold: sql<number>`COALESCE(SUM(${transactions.quantity}), 0)`,
          totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${transactions.totalCost}), 0)`,
          grossProfit: sql<number>`COALESCE(SUM(${transactions.grossProfit}), 0)`,
          averagePrice: sql<number>`COALESCE(AVG(${transactions.price}), 0)`,
          averageCost: sql<number>`COALESCE(AVG(${transactions.totalCost}), 0)`,
          marginPercentage: sql<number>`
            CASE 
              WHEN COALESCE(SUM(${transactions.price}), 0) > 0 
              THEN (COALESCE(SUM(${transactions.grossProfit}), 0) / COALESCE(SUM(${transactions.price}), 0)) * 100 
              ELSE 0 
            END
          `
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
        .orderBy(sql`COALESCE(SUM(${transactions.grossProfit}), 0) DESC`)
        .limit(20);

      // Calculate overall totals
      const overallTotals = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${transactions.totalCost}), 0)`,
          grossProfit: sql<number>`COALESCE(SUM(${transactions.grossProfit}), 0)`,
          transactionCount: sql<number>`COUNT(*)`,
          averageMargin: sql<number>`
            CASE 
              WHEN COALESCE(SUM(${transactions.price}), 0) > 0 
              THEN (COALESCE(SUM(${transactions.grossProfit}), 0) / COALESCE(SUM(${transactions.price}), 0)) * 100 
              ELSE 0 
            END
          `
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        );

      const totals = overallTotals[0];

      // Performance categorization
      const performanceCategories = {
        excellent: machineMargins.filter(m => m.marginPercentage >= 40),
        good: machineMargins.filter(m => m.marginPercentage >= 25 && m.marginPercentage < 40),
        average: machineMargins.filter(m => m.marginPercentage >= 15 && m.marginPercentage < 25),
        poor: machineMargins.filter(m => m.marginPercentage >= 0 && m.marginPercentage < 15),
        unprofitable: machineMargins.filter(m => m.marginPercentage < 0)
      };

      const payload = {
        reportPeriod: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          daysAnalyzed: 30
        },
        generatedAt: new Date().toISOString(),
        overallPerformance: {
          totalRevenue: Number(totals.totalRevenue.toFixed(2)),
          totalCost: Number(totals.totalCost.toFixed(2)),
          grossProfit: Number(totals.grossProfit.toFixed(2)),
          marginPercentage: Number(totals.averageMargin.toFixed(2)),
          transactionCount: totals.transactionCount,
          profitPerTransaction: totals.transactionCount > 0 ? Number((totals.grossProfit / totals.transactionCount).toFixed(2)) : 0,
          dailyAverageProfit: Number((totals.grossProfit / 30).toFixed(2))
        },
        machinePerformance: machineMargins.map(machine => ({
          machineId: machine.machineId,
          machineName: machine.machineName,
          vendonId: machine.vendonId,
          locationName: machine.locationName || 'Unbekannter Standort',
          revenue: Number(machine.totalRevenue.toFixed(2)),
          cost: Number(machine.totalCost.toFixed(2)),
          grossProfit: Number(machine.grossProfit.toFixed(2)),
          marginPercentage: Number(machine.marginPercentage.toFixed(2)),
          transactionCount: machine.transactionCount,
          profitPerTransaction: machine.transactionCount > 0 ? Number((machine.grossProfit / machine.transactionCount).toFixed(2)) : 0,
          performance: this.categorizePerformance(machine.marginPercentage)
        })),
        locationPerformance: locationMargins.map(location => ({
          locationId: location.locationId,
          locationName: location.locationName || 'Unbekannter Standort',
          machineCount: location.machineCount,
          revenue: Number(location.totalRevenue.toFixed(2)),
          cost: Number(location.totalCost.toFixed(2)),
          grossProfit: Number(location.grossProfit.toFixed(2)),
          marginPercentage: Number(location.marginPercentage.toFixed(2)),
          revenuePerMachine: Number(location.revenuePerMachine.toFixed(2)),
          profitPerMachine: location.machineCount > 0 ? Number((location.grossProfit / location.machineCount).toFixed(2)) : 0
        })),
        productProfitability: productMargins.map(product => ({
          productName: product.productName,
          productId: product.productId,
          quantitySold: product.quantitySold,
          revenue: Number(product.totalRevenue.toFixed(2)),
          cost: Number(product.totalCost.toFixed(2)),
          grossProfit: Number(product.grossProfit.toFixed(2)),
          marginPercentage: Number(product.marginPercentage.toFixed(2)),
          averagePrice: Number(product.averagePrice.toFixed(2)),
          averageCost: Number(product.averageCost.toFixed(2)),
          profitPerUnit: product.quantitySold > 0 ? Number((product.grossProfit / product.quantitySold).toFixed(2)) : 0
        })),
        performanceAnalysis: {
          excellentMachines: performanceCategories.excellent.length,
          goodMachines: performanceCategories.good.length,
          averageMachines: performanceCategories.average.length,
          poorMachines: performanceCategories.poor.length,
          unprofitableMachines: performanceCategories.unprofitable.length,
          totalMachines: machineMargins.length,
          profitabilityRate: machineMargins.length > 0 ? Number(((machineMargins.length - performanceCategories.unprofitable.length) / machineMargins.length * 100).toFixed(1)) : 0
        },
        insights: {
          bestPerformingMachine: machineMargins[0]?.machineName || 'N/A',
          worstPerformingMachine: machineMargins[machineMargins.length - 1]?.machineName || 'N/A',
          mostProfitableProduct: productMargins[0]?.productName || 'N/A',
          averageTransactionMargin: Number(totals.averageMargin.toFixed(2)),
          recommendedActions: this.generateRecommendations(performanceCategories, totals)
        }
      };

      // Record the event
      await notificationService.recordEvent('margin_report', payload, 86400); // 24 hour dedupe window

      console.log(`Margin report generated: ${totals.grossProfit}€ profit (${totals.averageMargin.toFixed(1)}% margin) from ${machineMargins.length} machines`);

    } catch (error) {
      console.error('Error generating margin report:', error);
      throw error;
    }
  }

  /**
   * Categorize machine performance based on margin percentage
   */
  private categorizePerformance(marginPercentage: number): string {
    if (marginPercentage >= 40) return 'Exzellent';
    if (marginPercentage >= 25) return 'Gut';
    if (marginPercentage >= 15) return 'Durchschnittlich';
    if (marginPercentage >= 0) return 'Schlecht';
    return 'Unrentabel';
  }

  /**
   * Generate actionable recommendations based on performance data
   */
  private generateRecommendations(performanceCategories: any, totals: any): string[] {
    const recommendations = [];

    if (performanceCategories.unprofitable.length > 0) {
      recommendations.push(`${performanceCategories.unprofitable.length} Automaten sind unrentabel - Kostenstruktur überprüfen`);
    }

    if (performanceCategories.poor.length > 0) {
      recommendations.push(`${performanceCategories.poor.length} Automaten haben niedrige Margen - Produktmix optimieren`);
    }

    if (totals.averageMargin < 20) {
      recommendations.push('Gesamtmarge unter 20% - Einkaufspreise verhandeln');
    }

    if (performanceCategories.excellent.length > 0) {
      recommendations.push(`${performanceCategories.excellent.length} Automaten als Vorbilder für Expansion nutzen`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Starke Performance - Aktuellen Kurs beibehalten');
    }

    return recommendations;
  }

  /**
   * Get margin data for a specific machine over a period
   */
  async getMachineMarginHistory(machineId: number, days: number = 30): Promise<any> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const dailyMargins = await db
        .select({
          date: sql<string>`DATE(${transactions.datetime})`,
          revenue: sql<number>`COALESCE(SUM(${transactions.price}), 0)`,
          cost: sql<number>`COALESCE(SUM(${transactions.totalCost}), 0)`,
          grossProfit: sql<number>`COALESCE(SUM(${transactions.grossProfit}), 0)`,
          transactionCount: sql<number>`COUNT(*)`,
          marginPercentage: sql<number>`
            CASE 
              WHEN COALESCE(SUM(${transactions.price}), 0) > 0 
              THEN (COALESCE(SUM(${transactions.grossProfit}), 0) / COALESCE(SUM(${transactions.price}), 0)) * 100 
              ELSE 0 
            END
          `
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.machineId, machineId),
            gte(transactions.datetime, startDate.toISOString()),
            lt(transactions.datetime, endDate.toISOString()),
            eq(transactions.status, 'completed')
          )
        )
        .groupBy(sql`DATE(${transactions.datetime})`)
        .orderBy(sql`DATE(${transactions.datetime})`);

      return dailyMargins;

    } catch (error) {
      console.error(`Error getting margin history for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Manual trigger for testing or immediate report generation
   */
  async triggerManualReport(): Promise<{ reportGenerated: boolean; analyzedPeriod: string }> {
    try {
      await this.generateMarginReport();

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      return {
        reportGenerated: true,
        analyzedPeriod: `${startDate.toISOString().split('T')[0]} bis ${endDate.toISOString().split('T')[0]}`
      };

    } catch (error) {
      console.error('Error in manual margin report generation:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const marginReportTrigger = new MarginReportTrigger();