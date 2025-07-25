/**
 * PURCHASE PRICE HISTORY API ROUTES
 * 
 * Ermöglicht Abfrage und Verwaltung der historischen Preisänderungen
 * für Audit-Zwecke und Margenanalyse
 */

import express from 'express';
import { db } from '../db';
import { purchasePriceHistory, purchaseConditions, products, suppliers } from '../../shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const router = express.Router();

// GET /api/purchase-price-history - Alle Preisänderungen mit Details
router.get('/', async (req, res) => {
  try {
    const { productId, supplierId, limit = 50 } = req.query;
    
    let query = db
      .select({
        id: purchasePriceHistory.id,
        purchaseConditionId: purchasePriceHistory.purchaseConditionId,
        oldUnitPrice: purchasePriceHistory.oldUnitPrice,
        newUnitPrice: purchasePriceHistory.newUnitPrice,
        changeDate: purchasePriceHistory.changeDate,
        changeReason: purchasePriceHistory.changeReason,
        orderId: purchasePriceHistory.orderId,
        invoiceReference: purchasePriceHistory.invoiceReference,
        automaticUpdate: purchasePriceHistory.automaticUpdate,
        notes: purchasePriceHistory.notes,
        // Join mit Purchase Conditions für Produkt- und Lieferanten-Info
        productId: purchaseConditions.productId,
        supplierId: purchaseConditions.supplierId,
        productName: products.productName,
        supplierName: suppliers.name
      })
      .from(purchasePriceHistory)
      .innerJoin(purchaseConditions, eq(purchasePriceHistory.purchaseConditionId, purchaseConditions.id))
      .leftJoin(products, eq(purchaseConditions.productId, products.id))
      .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
      .orderBy(desc(purchasePriceHistory.changeDate));

    // Filter nach Produkt-ID
    if (productId) {
      query = query.where(eq(purchaseConditions.productId, parseInt(productId as string)));
    }

    // Filter nach Lieferanten-ID
    if (supplierId) {
      query = query.where(eq(purchaseConditions.supplierId, parseInt(supplierId as string)));
    }

    // Limit anwenden
    const results = await query.limit(parseInt(limit as string));

    console.log(`📊 Preishistorie abgerufen: ${results.length} Einträge`);
    res.json(results);

  } catch (error) {
    console.error('Fehler beim Abrufen der Preishistorie:', error);
    res.status(500).json({
      error: 'Fehler beim Abrufen der Preishistorie',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// GET /api/purchase-price-history/product/:productId - Preishistorie für ein Produkt
router.get('/product/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Ungültige Produkt-ID' });
    }

    const history = await db
      .select({
        id: purchasePriceHistory.id,
        oldUnitPrice: purchasePriceHistory.oldUnitPrice,
        newUnitPrice: purchasePriceHistory.newUnitPrice,
        changeDate: purchasePriceHistory.changeDate,
        changeReason: purchasePriceHistory.changeReason,
        orderId: purchasePriceHistory.orderId,
        automaticUpdate: purchasePriceHistory.automaticUpdate,
        notes: purchasePriceHistory.notes,
        supplierName: suppliers.name,
        priceChange: sql<number>`${purchasePriceHistory.newUnitPrice} - COALESCE(${purchasePriceHistory.oldUnitPrice}, 0)`.as('priceChange'),
        percentChange: sql<number>`
          CASE 
            WHEN ${purchasePriceHistory.oldUnitPrice} > 0 
            THEN ((${purchasePriceHistory.newUnitPrice} - ${purchasePriceHistory.oldUnitPrice}) / ${purchasePriceHistory.oldUnitPrice}) * 100
            ELSE 100
          END
        `.as('percentChange')
      })
      .from(purchasePriceHistory)
      .innerJoin(purchaseConditions, eq(purchasePriceHistory.purchaseConditionId, purchaseConditions.id))
      .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
      .where(eq(purchaseConditions.productId, productId))
      .orderBy(desc(purchasePriceHistory.changeDate));

    console.log(`📈 Preishistorie für Produkt ${productId}: ${history.length} Änderungen`);
    res.json(history);

  } catch (error) {
    console.error('Fehler beim Abrufen der Produkt-Preishistorie:', error);
    res.status(500).json({
      error: 'Fehler beim Abrufen der Produkt-Preishistorie',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// GET /api/purchase-price-history/supplier/:supplierId - Preishistorie für einen Lieferanten
router.get('/supplier/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({ error: 'Ungültige Lieferanten-ID' });
    }

    const history = await db
      .select({
        id: purchasePriceHistory.id,
        oldUnitPrice: purchasePriceHistory.oldUnitPrice,
        newUnitPrice: purchasePriceHistory.newUnitPrice,
        changeDate: purchasePriceHistory.changeDate,
        changeReason: purchasePriceHistory.changeReason,
        automaticUpdate: purchasePriceHistory.automaticUpdate,
        productName: products.productName,
        productId: products.id
      })
      .from(purchasePriceHistory)
      .innerJoin(purchaseConditions, eq(purchasePriceHistory.purchaseConditionId, purchaseConditions.id))
      .leftJoin(products, eq(purchaseConditions.productId, products.id))
      .where(eq(purchaseConditions.supplierId, supplierId))
      .orderBy(desc(purchasePriceHistory.changeDate));

    console.log(`🏢 Preishistorie für Lieferant ${supplierId}: ${history.length} Änderungen`);
    res.json(history);

  } catch (error) {
    console.error('Fehler beim Abrufen der Lieferanten-Preishistorie:', error);
    res.status(500).json({
      error: 'Fehler beim Abrufen der Lieferanten-Preishistorie',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// GET /api/purchase-price-history/stats - Preisstatistiken und Trends
router.get('/stats', async (req, res) => {
  try {
    // Gesamtstatistiken
    const totalChanges = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(purchasePriceHistory);

    const automaticChanges = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(purchasePriceHistory)
      .where(eq(purchasePriceHistory.automaticUpdate, true));

    const recentChanges = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(purchasePriceHistory)
      .where(sql`${purchasePriceHistory.changeDate} >= NOW() - INTERVAL '30 days'`);

    // Durchschnittliche Preisänderung
    const avgPriceChange = await db
      .select({
        avgIncrease: sql<number>`AVG(${purchasePriceHistory.newUnitPrice} - COALESCE(${purchasePriceHistory.oldUnitPrice}, 0))`,
        avgPercentChange: sql<number>`AVG(
          CASE 
            WHEN ${purchasePriceHistory.oldUnitPrice} > 0 
            THEN ((${purchasePriceHistory.newUnitPrice} - ${purchasePriceHistory.oldUnitPrice}) / ${purchasePriceHistory.oldUnitPrice}) * 100
            ELSE 0
          END
        )`
      })
      .from(purchasePriceHistory)
      .where(sql`${purchasePriceHistory.oldUnitPrice} IS NOT NULL`);

    const stats = {
      totalPriceChanges: totalChanges[0]?.count || 0,
      automaticPriceChanges: automaticChanges[0]?.count || 0,
      recentChanges30Days: recentChanges[0]?.count || 0,
      averagePriceIncrease: avgPriceChange[0]?.avgIncrease || 0,
      averagePercentChange: avgPriceChange[0]?.avgPercentChange || 0,
      manualChanges: (totalChanges[0]?.count || 0) - (automaticChanges[0]?.count || 0)
    };

    console.log('📊 Preishistorie-Statistiken abgerufen:', stats);
    res.json(stats);

  } catch (error) {
    console.error('Fehler beim Abrufen der Preisstatistiken:', error);
    res.status(500).json({
      error: 'Fehler beim Abrufen der Preisstatistiken',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;