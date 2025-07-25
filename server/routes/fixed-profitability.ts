import { Router } from 'express';
import { db } from '../db';
import { transactions, products, purchaseConditions } from '../../shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

const router = Router();

// FIXED profitability calculation - eliminates NaN values and corruption
router.get('/:productId/profitability', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    console.log(`[FIXED-PROFITABILITY] Starting clean calculation for product ${productId}`);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    // Get product info
    const product = await db
      .select({
        id: products.id,
        productName: products.productName,
        category: products.category,
        price: products.price
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productInfo = product[0];
    console.log(`[FIXED-PROFITABILITY] Found product: ${productInfo.productName}`);

    // Date range (last 90 days)
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get transaction data with NETTO calculation (ohne Pfand, ohne MwSt)
    const rawTransactions = await db.execute(sql`
      SELECT 
        -- NETTO-BERECHNUNG: Umsatz / 1.19 für MwSt-Abzug
        CASE 
          WHEN t.amount > 0 THEN (t.amount::DECIMAL / 1.19)
          ELSE ((COALESCE(t.price, 2.50) * COALESCE(t.quantity, 1))::DECIMAL / 1.19)
        END as transaction_revenue_netto,
        COALESCE(t.quantity, 1)::INTEGER as transaction_quantity,
        EXTRACT(YEAR FROM t.datetime)::INTEGER as year,
        EXTRACT(MONTH FROM t.datetime)::INTEGER as month,
        COALESCE(m.machine_name, m.location_name, 'Unbekannter Standort') as location_name
      FROM transactions t
      LEFT JOIN machines m ON t.machine_id = m.id
      WHERE t.product_name = ${productInfo.productName}
        AND t.datetime >= ${start.toISOString()}
        AND t.datetime <= ${end.toISOString()}
        AND t.quantity > 0
    `);

    const transactionRows = rawTransactions.rows || [];
    console.log(`[FIXED-PROFITABILITY] Found ${transactionRows.length} transactions`);

    // Calculate totals with SAFE numeric operations - NETTO ohne Pfand
    let totalRevenue = 0;
    let totalQuantity = 0;
    const locationData = new Map<string, { revenue: number; quantity: number }>();
    
    for (const row of transactionRows) {
      const revenue = parseFloat(String(row.transaction_revenue_netto || '0'));
      const quantity = parseInt(String(row.transaction_quantity || '0'));
      const location = String(row.location_name || 'Unbekannter Standort');
      
      if (!isNaN(revenue) && revenue > 0) {
        totalRevenue += revenue;
        
        // Standort-Daten sammeln
        if (!locationData.has(location)) {
          locationData.set(location, { revenue: 0, quantity: 0 });
        }
        locationData.get(location)!.revenue += revenue;
      }
      
      if (!isNaN(quantity) && quantity > 0) {
        totalQuantity += quantity;
        
        // Standort-Mengen sammeln
        if (locationData.has(location)) {
          locationData.get(location)!.quantity += quantity;
        }
      }
    }

    console.log(`[FIXED-PROFITABILITY] Clean totals - Revenue: ${totalRevenue}, Quantity: ${totalQuantity}`);

    // Get cost data (NETTO-EINKAUFSPREIS ohne Pfand)
    const costData = await db
      .select({ 
        unitPrice: purchaseConditions.unitPrice,
        depositPerUnit: purchaseConditions.depositPerUnit 
      })
      .from(purchaseConditions)
      .where(eq(purchaseConditions.productId, productId))
      .limit(1);

    let unitCost = 0;
    if (costData.length > 0) {
      const grossUnitPrice = parseFloat(costData[0].unitPrice || '0');
      const depositPerUnit = parseFloat(costData[0].depositPerUnit || '0');
      
      // NETTO-KOSTEN: Einkaufspreis ohne Pfand, dann MwSt abziehen
      const netPriceWithoutDeposit = grossUnitPrice - depositPerUnit;
      unitCost = netPriceWithoutDeposit / 1.19; // MwSt-Abzug
    }
    
    const totalCosts = unitCost * totalQuantity;

    // Calculate final metrics - NO NaN values possible
    const totalProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const averageSellingPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;
    const averageCostPrice = totalQuantity > 0 ? totalCosts / totalQuantity : 0;

    // Calculate location breakdown with proper costs
    const locationBreakdown = await Promise.all(
      Array.from(locationData.entries()).map(async ([location, data]) => {
        const locationCosts = unitCost * data.quantity;
        const locationProfit = data.revenue - locationCosts;
        const locationMargin = data.revenue > 0 ? (locationProfit / data.revenue) * 100 : 0;
        
        return {
          location,
          revenue: Math.round(data.revenue * 100) / 100,
          profit: Math.round(locationProfit * 100) / 100,
          margin: Math.round(locationMargin * 100) / 100
        };
      })
    );

    // NETTO-BERECHNUNG DOKUMENTIERT
    const result = {
      productId,
      productName: productInfo.productName,
      category: productInfo.category || 'Unbekannt',
      totalRevenue: Math.round(totalRevenue * 100) / 100, // NETTO ohne MwSt
      totalCosts: Math.round(totalCosts * 100) / 100, // NETTO ohne Pfand, ohne MwSt
      totalProfit: Math.round(totalProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      totalQuantitySold: totalQuantity,
      averageSellingPrice: Math.round(averageSellingPrice * 100) / 100,
      averageCostPrice: Math.round(averageCostPrice * 100) / 100,
      monthlySummary: [], // Simplified for now
      locationBreakdown, // JETZT MIT ECHTEN STANDORT-DATEN
      
      // BERECHUNGSHERLEITUNG
      calculationDetails: {
        revenueCalculation: "Brutto-Umsatz / 1.19 = Netto-Umsatz (ohne 19% MwSt)",
        costCalculation: "(Einkaufspreis - Pfand) / 1.19 = Netto-Kosten",
        profitCalculation: "Netto-Umsatz - Netto-Kosten = Netto-Gewinn",
        marginCalculation: "(Netto-Gewinn / Netto-Umsatz) × 100 = Gewinnmarge %",
        note: "Alle Werte sind netto ohne Pfand und ohne Mehrwertsteuer"
      }
    };

    console.log(`[FIXED-PROFITABILITY] SUCCESS - Clean result:`, {
      revenue: result.totalRevenue,
      costs: result.totalCosts,
      profit: result.totalProfit,
      margin: result.profitMargin,
      quantity: result.totalQuantitySold,
      locationCount: locationBreakdown.length
    });

    res.json(result);
    
  } catch (error) {
    console.error('[FIXED-PROFITABILITY] ERROR:', error);
    res.status(500).json({
      error: 'Calculation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;