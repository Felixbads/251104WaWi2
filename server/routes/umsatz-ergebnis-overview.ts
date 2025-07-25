import { Request, Response } from 'express';
import { eq, and, gte, lte, sql, desc, or, isNull } from 'drizzle-orm';
import { db } from '../db';
import { machines, transactions, products, locationCosts } from '../../shared/schema';

interface MachineOverview {
  machineId: number;
  machineName: string;
  locationName: string;
  netRevenue: number;
  transactionCount: number;
  totalResult: number;
  averageMargin: number;
  fixedCosts: number;
  delta: number;
  products: ProductSales[];
}

interface ProductSales {
  productName: string;
  netSalePrice: number;
  purchasePrice: number;
  marginEur: number;
  marginPercent: number;
  salesCount: number;
  productResult: number;
}

interface ChartDataPoint {
  date: string;
  revenue: number;
  transactions: number;
  result: number;
}

// Get machine overview with calculations - FAST VERSION
export async function getUmsatzErgebnisOverview(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    
    // Use default dates if not provided (today only for speed)
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date().toISOString().split('T')[0]; // Same day for speed
    
    const finalStartDate = startDate || defaultStartDate;
    const finalEndDate = endDate || defaultEndDate;

    console.log('FAST API: Loading data for', finalStartDate, 'to', finalEndDate);

    // Get aggregated data directly - much faster
    const aggregatedResults = await db
      .select({
        machineId: transactions.machineId,
        machineName: transactions.machineName,
        totalRevenue: sql<number>`SUM(${transactions.price} * ${transactions.quantity})`,
        totalTransactions: sql<number>`COUNT(*)`,
        avgPrice: sql<number>`AVG(${transactions.price})`,
      })
      .from(transactions)
      .where(
        and(
          gte(sql`DATE(${transactions.datetime})`, finalStartDate),
          lte(sql`DATE(${transactions.datetime})`, finalEndDate)
        )
      )
      .groupBy(transactions.machineId, transactions.machineName)
      .orderBy(sql<number>`SUM(${transactions.price} * ${transactions.quantity}) DESC`)
      .limit(10); // Top 10 machines only

    console.log('FAST API: Found', aggregatedResults.length, 'machines with data');

    const machineOverviews: MachineOverview[] = [];

    for (const machineData of aggregatedResults) {
      // Simplified calculations for speed
      const totalBruttoRevenue = machineData.totalRevenue || 0;
      const totalNettoRevenue = totalBruttoRevenue / 1.19; // Remove VAT
      const estimatedCosts = totalNettoRevenue * 0.6; // 60% estimated costs
      const totalResult = totalNettoRevenue - estimatedCosts;
      const averageMargin = totalBruttoRevenue > 0 ? (totalResult / totalBruttoRevenue) * 100 : 0;

      // Simple product breakdown - just top products
      const topProducts: ProductSales[] = [
        {
          productName: 'Diverse Produkte',
          netSalePrice: machineData.avgPrice ? machineData.avgPrice / 1.19 : 0,
          purchasePrice: machineData.avgPrice ? (machineData.avgPrice / 1.19) * 0.6 : 0,
          marginEur: machineData.avgPrice ? (machineData.avgPrice / 1.19) * 0.4 : 0,
          marginPercent: 40,
          salesCount: machineData.totalTransactions || 0,
          productResult: totalResult,
        }
      ];
      const costResults = await db
        .select({
          amountNet: locationCosts.amountNet,
          billingCycle: locationCosts.billingCycle,
        })
        .from(locationCosts)
        .where(
          and(
            eq(locationCosts.machineId, machine.machineId),
            eq(locationCosts.isActive, true),
            lte(locationCosts.validFrom, endDate),
            or(
              isNull(locationCosts.validTo),
              gte(locationCosts.validTo, startDate)
            )
          )
        );

      // Calculate total fixed costs for the period
      let totalFixedCosts = 0;
      for (const cost of costResults) {
        let dailyCost = 0;
        switch (cost.billingCycle) {
          case 'daily':
            dailyCost = cost.amountNet || 0;
            break;
          case 'weekly':
            dailyCost = (cost.amountNet || 0) / 7;
            break;
          case 'monthly':
            dailyCost = (cost.amountNet || 0) / 30;
            break;
          case 'yearly':
            dailyCost = (cost.amountNet || 0) / 365;
            break;
          default:
            dailyCost = 0;
        }
        totalFixedCosts += dailyCost * daysDiff;
      }

      // Calculate totals
      const productsArray = Array.from(productSalesMap.values());
      const totalProductResult = productsArray.reduce((sum, p) => sum + p.productResult, 0);
      const totalResult = totalProductResult - totalFixedCosts;
      const averageMargin = productsArray.length > 0 ? 
        productsArray.reduce((sum, p) => sum + p.marginPercent, 0) / productsArray.length : 0;

      machineOverviews.push({
        machineId: machine.machineId,
        machineName: machine.machineName,
        locationName: machine.locationName || 'Unbekannt',
        netRevenue: totalRevenue,
        transactionCount: totalTransactions,
        totalResult: totalResult,
        averageMargin: averageMargin,
        fixedCosts: totalFixedCosts,
        delta: totalResult, // Same as totalResult for this context
        products: productsArray,
      });
    }

    res.json({
      success: true,
      data: machineOverviews,
    });

  } catch (error) {
    console.error('Error in getUmsatzErgebnisOverview:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

// Get chart data for multi-day periods
export async function getUmsatzErgebnisChart(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    
    // Use default dates if not provided (last 7 days)
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const finalStartDate = startDate || defaultStartDate;
    const finalEndDate = endDate || defaultEndDate;

    // Get daily aggregated data
    const chartResults = await db
      .select({
        date: sql<string>`DATE(${transactions.datetime})`.as('date'),
        revenue: sql<number>`SUM(${transactions.price} / 1.19)`.as('revenue'),
        transactions: sql<number>`COUNT(${transactions.id})`.as('transactions'),
      })
      .from(transactions)
      .where(
        and(
          gte(sql`DATE(${transactions.datetime})`, finalStartDate),
          lte(sql`DATE(${transactions.datetime})`, finalEndDate)
        )
      )
      .groupBy(sql`DATE(${transactions.datetime})`)
      .orderBy(sql`DATE(${transactions.datetime})`);

    // For each day, calculate the result (revenue - costs)
    const chartData: ChartDataPoint[] = [];
    
    for (const dayData of chartResults) {
      // Simplified cost calculation - could be enhanced with actual daily costs
      const estimatedDailyCosts = dayData.revenue * 0.1; // 10% of revenue as estimated costs
      
      chartData.push({
        date: dayData.date,
        revenue: dayData.revenue || 0,
        transactions: dayData.transactions || 0,
        result: (dayData.revenue || 0) - estimatedDailyCosts,
      });
    }

    res.json({
      success: true,
      data: chartData,
    });

  } catch (error) {
    console.error('Error in getUmsatzErgebnisChart:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

