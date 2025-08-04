import express, { Request, Response } from 'express';
import { db } from '../db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { products, productBatches, transactions } from '@shared/schema';

const router = express.Router();

// GET /api/duplicate-cleanup/analyze - Analyze product duplicates
router.get('/analyze', async (req: Request, res: Response) => {
  try {
    // Find products with duplicate names
    const duplicateAnalysis = await db.execute(sql`
      SELECT 
        product_name,
        COUNT(*) as duplicate_count,
        array_agg(DISTINCT id ORDER BY id) as product_ids,
        array_agg(DISTINCT vendon_id ORDER BY vendon_id) as vendon_ids,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
      FROM products 
      GROUP BY product_name
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
    `);

    // Get total impact statistics
    const totalStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_products,
        COUNT(DISTINCT product_name) as unique_names,
        COUNT(*) - COUNT(DISTINCT product_name) as duplicate_count
      FROM products
    `);

    // Find products with duplicate names that have batches
    const duplicatesWithBatches = await db.execute(sql`
      SELECT 
        p.product_name,
        COUNT(DISTINCT p.id) as product_duplicates,
        COUNT(pb.id) as total_batches,
        SUM(pb.current_quantity) as total_quantity
      FROM products p
      LEFT JOIN product_batches pb ON p.id = pb.product_id
      WHERE p.product_name IN (
        SELECT product_name 
        FROM products 
        GROUP BY product_name 
        HAVING COUNT(*) > 1
      )
      GROUP BY p.product_name
      ORDER BY product_duplicates DESC
    `);

    // Find the specific "6 frische Eier, Struppen" case
    const eierStruppensCase = await db.execute(sql`
      SELECT 
        id,
        vendon_id,
        product_name,
        created_at,
        (SELECT COUNT(*) FROM product_batches WHERE product_id = p.id) as batch_count,
        (SELECT SUM(current_quantity) FROM product_batches WHERE product_id = p.id) as total_quantity
      FROM products p
      WHERE product_name ILIKE '%Eier%' AND product_name ILIKE '%Struppen%'
      ORDER BY created_at
    `);

    res.json({
      summary: {
        totalProducts: totalStats[0]?.total_products || 0,
        uniqueNames: totalStats[0]?.unique_names || 0,
        duplicateCount: totalStats[0]?.duplicate_count || 0
      },
      duplicateGroups: duplicateAnalysis.map((row: any) => ({
        productName: row.product_name,
        duplicateCount: row.duplicate_count,
        productIds: row.product_ids,
        vendonIds: row.vendon_ids,
        firstCreated: row.first_created,
        lastCreated: row.last_created
      })),
      duplicatesWithBatches: duplicatesWithBatches.map((row: any) => ({
        productName: row.product_name,
        productDuplicates: row.product_duplicates,
        totalBatches: row.total_batches,
        totalQuantity: row.total_quantity || 0
      })),
      eierStruppensCase: eierStruppensCase.map((row: any) => ({
        id: row.id,
        vendonId: row.vendon_id,
        productName: row.product_name,
        createdAt: row.created_at,
        batchCount: row.batch_count || 0,
        totalQuantity: row.total_quantity || 0
      }))
    });

  } catch (error) {
    console.error('Fehler bei der Duplikat-Analyse:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Duplikat-Analyse',
      details: (error as Error).message 
    });
  }
});

// POST /api/duplicate-cleanup/consolidate - Consolidate duplicate products
router.post('/consolidate', async (req: Request, res: Response) => {
  try {
    const { productName, keepProductId, dryRun = true } = req.body;

    if (!productName || !keepProductId) {
      return res.status(400).json({ error: 'productName und keepProductId sind erforderlich' });
    }

    // Find all products with this name
    const duplicateProducts = await db.select()
      .from(products)
      .where(eq(products.productName, productName));

    if (duplicateProducts.length <= 1) {
      return res.status(400).json({ error: 'Keine Duplikate für diesen Produktnamen gefunden' });
    }

    const keepProduct = duplicateProducts.find(p => p.id === parseInt(keepProductId));
    if (!keepProduct) {
      return res.status(400).json({ error: 'Zu behaltenes Produkt nicht gefunden' });
    }

    const duplicatesToRemove = duplicateProducts.filter(p => p.id !== parseInt(keepProductId));
    const duplicateIds = duplicatesToRemove.map(p => p.id);

    let consolidationPlan = {
      productName,
      keepProduct: {
        id: keepProduct.id,
        vendonId: keepProduct.vendonId,
        createdAt: keepProduct.createdAt
      },
      duplicatesToRemove: duplicatesToRemove.map(p => ({
        id: p.id,
        vendonId: p.vendonId,
        createdAt: p.createdAt
      })),
      impacts: {
        batchesToUpdate: 0,
        transactionsToUpdate: 0
      }
    };

    // Count batches that would be affected
    if (duplicateIds.length > 0) {
      const batchCount = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM product_batches 
        WHERE product_id = ANY(${duplicateIds})
      `);
      consolidationPlan.impacts.batchesToUpdate = batchCount[0]?.count || 0;

      // Count transactions that would be affected
      const transactionCount = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM transactions 
        WHERE product_id = ANY(${duplicateIds})
      `);
      consolidationPlan.impacts.transactionsToUpdate = transactionCount[0]?.count || 0;
    }

    if (dryRun) {
      return res.json({
        message: 'Trockenabstimmung - Keine Änderungen vorgenommen',
        plan: consolidationPlan
      });
    }

    // Execute consolidation if not dry run
    const results = {
      batchesUpdated: 0,
      transactionsUpdated: 0,
      productsDeleted: 0
    };

    // Update product batches to point to the kept product
    if (duplicateIds.length > 0) {
      const batchUpdateResult = await db.execute(sql`
        UPDATE product_batches 
        SET product_id = ${keepProduct.id}, updated_at = NOW()
        WHERE product_id = ANY(${duplicateIds})
      `);
      results.batchesUpdated = batchUpdateResult.rowCount || 0;

      // Update transactions to point to the kept product
      const transactionUpdateResult = await db.execute(sql`
        UPDATE transactions 
        SET product_id = ${keepProduct.id}
        WHERE product_id = ANY(${duplicateIds})
      `);
      results.transactionsUpdated = transactionUpdateResult.rowCount || 0;

      // Delete duplicate products
      const deleteResult = await db.delete(products)
        .where(inArray(products.id, duplicateIds));
      results.productsDeleted = deleteResult.rowCount || 0;
    }

    console.log(`Konsolidierung abgeschlossen für "${productName}":`, results);

    res.json({
      message: 'Konsolidierung erfolgreich abgeschlossen',
      plan: consolidationPlan,
      results
    });

  } catch (error) {
    console.error('Fehler bei der Konsolidierung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Konsolidierung',
      details: (error as Error).message 
    });
  }
});

// POST /api/duplicate-cleanup/auto-consolidate - Auto-consolidate all duplicates
router.post('/auto-consolidate', async (req: Request, res: Response) => {
  try {
    const { dryRun = true, strategy = 'oldest' } = req.body;

    // Get all duplicate product names
    const duplicateGroups = await db.execute(sql`
      SELECT 
        product_name,
        array_agg(id ORDER BY created_at ASC) as product_ids,
        array_agg(created_at ORDER BY created_at ASC) as created_dates,
        COUNT(*) as duplicate_count
      FROM products 
      GROUP BY product_name
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `);

    const consolidationPlan = [];
    let totalResults = {
      groupsProcessed: 0,
      batchesUpdated: 0,
      transactionsUpdated: 0,
      productsDeleted: 0
    };

    for (const group of duplicateGroups) {
      const productIds = group.product_ids;
      const productName = group.product_name;
      
      // Choose which product to keep based on strategy
      let keepProductId;
      if (strategy === 'oldest') {
        keepProductId = productIds[0]; // First in ASC order = oldest
      } else if (strategy === 'newest') {
        keepProductId = productIds[productIds.length - 1]; // Last in ASC order = newest
      } else {
        keepProductId = productIds[0]; // Default to oldest
      }

      const duplicateIds = productIds.filter((id: number) => id !== keepProductId);

      // Count impacts for this group
      let batchCount = 0;
      let transactionCount = 0;

      if (duplicateIds.length > 0) {
        const batchResult = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM product_batches 
          WHERE product_id = ANY(${duplicateIds})
        `);
        batchCount = batchResult[0]?.count || 0;

        const transactionResult = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM transactions 
          WHERE product_id = ANY(${duplicateIds})
        `);
        transactionCount = transactionResult[0]?.count || 0;
      }

      const groupPlan = {
        productName,
        keepProductId,
        duplicateIds,
        impactBatches: batchCount,
        impactTransactions: transactionCount
      };

      consolidationPlan.push(groupPlan);

      if (!dryRun && duplicateIds.length > 0) {
        // Execute consolidation for this group
        try {
          // Update batches
          const batchUpdate = await db.execute(sql`
            UPDATE product_batches 
            SET product_id = ${keepProductId}, updated_at = NOW()
            WHERE product_id = ANY(${duplicateIds})
          `);

          // Update transactions
          const transactionUpdate = await db.execute(sql`
            UPDATE transactions 
            SET product_id = ${keepProductId}
            WHERE product_id = ANY(${duplicateIds})
          `);

          // Delete duplicates
          const deleteResult = await db.delete(products)
            .where(inArray(products.id, duplicateIds));

          totalResults.batchesUpdated += batchUpdate.rowCount || 0;
          totalResults.transactionsUpdated += transactionUpdate.rowCount || 0;
          totalResults.productsDeleted += deleteResult.rowCount || 0;
          totalResults.groupsProcessed++;

        } catch (groupError) {
          console.error(`Fehler bei Gruppe "${productName}":`, groupError);
        }
      }
    }

    res.json({
      message: dryRun ? 'Trockenabstimmung - Keine Änderungen vorgenommen' : 'Auto-Konsolidierung abgeschlossen',
      strategy,
      groupsFound: duplicateGroups.length,
      consolidationPlan,
      results: dryRun ? null : totalResults
    });

  } catch (error) {
    console.error('Fehler bei der Auto-Konsolidierung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Auto-Konsolidierung',
      details: (error as Error).message 
    });
  }
});

export default router;