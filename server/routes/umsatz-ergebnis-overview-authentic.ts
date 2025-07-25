import { Router } from 'express';
import { db } from '../db';
import { transactions, machines } from '../../shared/schema';
import { sql, and, gte, lte, eq } from 'drizzle-orm';

/**
 * AUTHENTIC COST VERSION - Uses REAL purchase_conditions data
 * This is the high-accuracy, lower-performance version that uses
 * actual purchase prices from your datasets.
 */

interface MachineOverviewAuthentic {
  machineId: number;
  machineName: string;
  locationName: string;
  netRevenue: number;
  transactionCount: number;
  totalResult: number;
  averageMargin: number;
  fixedCosts: number;
  delta: number;
  hasRealCosts: boolean;
  authenticCostPercentage: number; // % of costs from real data
  products: ProductSalesAuthentic[];
}

interface ProductSalesAuthentic {
  productName: string;
  netSalePrice: number;
  purchasePrice: number;
  marginEur: number;
  marginPercent: number;
  salesCount: number;
  productResult: number;
  hasRealCosts: boolean;
  costSource: 'authentic' | 'estimated';
}

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to last 7 days if no dates provided
    const now = new Date();
    const defaultEndDate = now.toISOString().split('T')[0];
    const defaultStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    const finalStartDate = startDate as string || defaultStartDate;
    const finalEndDate = endDate as string || defaultEndDate;

    console.log('AUTHENTIC API: Loading data with REAL costs for', finalStartDate, 'to', finalEndDate);

    // Get only active machines (last 30 days)
    const allMachines = await db
      .selectDistinct({
        machineId: transactions.machineId,
        machineName: transactions.machineName,
      })
      .from(transactions)
      .where(sql`DATE(${transactions.datetime}) >= CURRENT_DATE - INTERVAL '30 days'`)
      .orderBy(transactions.machineName)
      .limit(20); // Limit for performance

    console.log(`Found ${allMachines.length} active machines`);

    const overviewData: MachineOverviewAuthentic[] = [];

    // Process each machine with AUTHENTIC costs
    for (const machine of allMachines) {
      console.log(`Processing machine ${machine.machineName} with AUTHENTIC costs...`);

      // Get transaction totals for this machine
      const machineTransactions = await db
        .select({
          totalRevenue: sql<number>`SUM(${transactions.price} * ${transactions.quantity})`,
          totalTransactions: sql<number>`COUNT(*)`,
        })
        .from(transactions)
        .where(and(
          sql`${transactions.machineId} = ${machine.machineId}`,
          sql`DATE(${transactions.datetime}) >= ${finalStartDate}`,
          sql`DATE(${transactions.datetime}) <= ${finalEndDate}`
        ));

      const transactionData = machineTransactions[0];
      const totalBruttoRevenue = transactionData?.totalRevenue ?? 0;
      const totalNettoRevenue = totalBruttoRevenue / 1.19;

      if (totalBruttoRevenue === 0) continue; // Skip machines with no revenue

      // Get AUTHENTIC costs using real purchase_conditions data
      const authenticCosts = await db.execute(sql`
        SELECT 
          t.product_name,
          SUM(t.quantity) as quantity_sold,
          AVG(t.price) as avg_sale_price,
          pc.unit_price as authentic_cost,
          pc.deposit_per_unit as deposit,
          CASE WHEN pc.unit_price > 0 THEN 'authentic' ELSE 'estimated' END as cost_source
        FROM transactions t
        LEFT JOIN products p ON TRIM(LOWER(t.product_name)) = TRIM(LOWER(p.product_name))
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
        WHERE t.machine_id = ${machine.machineId}
          AND DATE(t.datetime) >= ${finalStartDate}
          AND DATE(t.datetime) <= ${finalEndDate}
        GROUP BY t.product_name, pc.unit_price, pc.deposit_per_unit
        ORDER BY SUM(t.quantity * t.price) DESC
        LIMIT 10
      `);

      // Calculate total costs using authentic data where available
      let totalAuthenticCosts = 0;
      let authenticProductCount = 0;
      let totalProductCount = 0;
      const productDetails: ProductSalesAuthentic[] = [];

      for (const row of authenticCosts.rows) {
        totalProductCount++;
        
        const productName = row.product_name as string || 'Unbekanntes Produkt';
        const quantitySold = row.quantity_sold as number || 0;
        const avgSalePrice = row.avg_sale_price as number || 0;
        const authenticCost = row.authentic_cost as number || 0;
        const deposit = row.deposit_per_unit as number || 0;
        const costSource = row.cost_source as string;
        
        const netSalePrice = avgSalePrice / 1.19;
        let actualCostPrice: number;
        let hasRealCosts: boolean;
        
        if (authenticCost > 0 && costSource === 'authentic') {
          // Use AUTHENTIC cost from your purchase_conditions data
          actualCostPrice = authenticCost - deposit;
          hasRealCosts = true;
          authenticProductCount++;
          totalAuthenticCosts += actualCostPrice * quantitySold;
        } else {
          // Fallback to 40% estimate only when no authentic data exists
          actualCostPrice = netSalePrice * 0.4;
          hasRealCosts = false;
          totalAuthenticCosts += actualCostPrice * quantitySold;
        }
        
        const margin = netSalePrice - actualCostPrice;
        
        productDetails.push({
          productName,
          netSalePrice,
          purchasePrice: actualCostPrice,
          marginEur: margin,
          marginPercent: netSalePrice > 0 ? (margin / netSalePrice) * 100 : 0,
          salesCount: quantitySold,
          productResult: margin * quantitySold,
          hasRealCosts,
          costSource: hasRealCosts ? 'authentic' : 'estimated'
        });
      }

      const totalResult = totalNettoRevenue - totalAuthenticCosts;
      const averageMargin = totalBruttoRevenue > 0 ? (totalResult / totalBruttoRevenue) * 100 : 0;
      const authenticCostPercentage = totalProductCount > 0 ? (authenticProductCount / totalProductCount) * 100 : 0;

      overviewData.push({
        machineId: machine.machineId,
        machineName: machine.machineName,
        locationName: machine.machineName, // Using machine name as location
        netRevenue: totalNettoRevenue,
        transactionCount: transactionData?.totalTransactions || 0,
        totalResult: totalResult,
        averageMargin: averageMargin,
        fixedCosts: totalAuthenticCosts,
        hasRealCosts: authenticProductCount > 0,
        authenticCostPercentage: authenticCostPercentage,
        delta: totalResult,
        products: productDetails,
      });
      
      console.log(`${machine.machineName}: ${authenticCostPercentage.toFixed(1)}% authentic costs`);
    }

    // Sort by revenue descending
    overviewData.sort((a, b) => b.netRevenue - a.netRevenue);

    console.log(`AUTHENTIC API: Processed ${overviewData.length} machines with real cost data`);

    res.json({
      success: true,
      data: overviewData,
      summary: {
        totalMachines: overviewData.length,
        dateRange: { startDate: finalStartDate, endDate: finalEndDate },
        costDataSource: 'authentic_purchase_conditions',
        avgAuthenticCostPercentage: overviewData.length > 0 
          ? overviewData.reduce((sum, m) => sum + m.authenticCostPercentage, 0) / overviewData.length 
          : 0
      }
    });

  } catch (error) {
    console.error('AUTHENTIC API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load authentic cost data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;