import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { replitAuthMiddleware, ReplitUser } from '../auth/replit-auth';
import { 
  retroactiveInventoryCounts, 
  retroactiveInventoryCountItems, 
  retroactiveInventoryAdjustments,
  insertRetroactiveInventoryCountSchema,
  insertRetroactiveInventoryCountItemSchema,
  insertRetroactiveInventoryAdjustmentSchema,
  type RetroactiveInventoryCount,
  type RetroactiveInventoryCountItem,
  type RetroactiveInventoryAdjustment
} from "@shared/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";

const router = express.Router();

// Erweitere Request-Interface um user-Property
interface AuthenticatedRequest extends Request {
  user?: ReplitUser;
}

// Authentifizierungs-Middleware für alle Routes anwenden
router.use(replitAuthMiddleware);

// Validation schemas
const createRetroactiveCountSchema = z.object({
  countName: z.string().min(1, "Name der Inventur ist erforderlich"),
  countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD sein"),
  warehouseId: z.number().positive("Lager-ID ist erforderlich"),
  description: z.string().optional(),
  reasonForRetroactiveCount: z.string().optional(),
  notes: z.string().optional(),
});

const addCountItemSchema = z.object({
  productId: z.number().positive("Produkt-ID ist erforderlich"),
  countedQuantity: z.number().min(0, "Gezählte Menge muss positiv sein"),
  unitCost: z.number().optional(),
  batchId: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  countingRemarks: z.string().optional(),
});

/**
 * Service-Klasse für retroaktive Inventarberechnung
 */
class RetroactiveInventoryService {
  /**
   * Berechnet die Systemmenge für ein Produkt zu einem bestimmten Datum
   */
  async calculateSystemQuantityAtDate(
    productId: number, 
    warehouseId: number, 
    countDate: string
  ): Promise<number> {
    try {
      // Hole alle Lagerbewegungen bis zum Stichtag
      const movements = await db
        .select({
          movementType: sql`movement_type`,
          quantity: sql`quantity`,
          timestamp: sql`timestamp`
        })
        .from(sql`inventory_movements`)
        .where(sql`product_id = ${productId} AND warehouse_id = ${warehouseId} AND DATE(timestamp) <= '${countDate}'`)
        .orderBy(sql`timestamp ASC`);

      // Berechne Bestand zum Stichtag
      let systemQuantity = 0;
      for (const movement of movements) {
        const qty = Number(movement.quantity) || 0;
        if (movement.movementType === 'IN' || movement.movementType === 'GOODS_RECEIPT') {
          systemQuantity += qty;
        } else if (movement.movementType === 'OUT' || movement.movementType === 'SALE' || movement.movementType === 'REFILL') {
          systemQuantity -= qty;
        }
      }

      return Math.max(0, systemQuantity);
    } catch (error) {
      console.error('Fehler bei der Berechnung der Systemmenge:', error);
      return 0;
    }
  }

  /**
   * Berechnet Bewegungen zwischen Count-Date und heute
   */
  async calculateMovementsSinceCount(
    productId: number,
    warehouseId: number,
    countDate: string
  ): Promise<{
    sales: number;
    refills: number;
    otherOut: number;
    otherIn: number;
    total: number;
  }> {
    try {
      const movements = await db
        .select({
          movementType: sql`movement_type`,
          quantity: sql`quantity`
        })
        .from(sql`inventory_movements`)
        .where(sql`product_id = ${productId} AND warehouse_id = ${warehouseId} AND DATE(timestamp) > '${countDate}'`);

      let sales = 0, refills = 0, otherOut = 0, otherIn = 0;

      for (const movement of movements) {
        const qty = Number(movement.quantity) || 0;
        
        switch (movement.movementType) {
          case 'SALE':
            sales += qty;
            break;
          case 'REFILL':
            refills += qty;
            break;
          case 'OUT':
            otherOut += qty;
            break;
          case 'IN':
          case 'GOODS_RECEIPT':
            otherIn += qty;
            break;
        }
      }

      const total = (otherIn - sales - refills - otherOut);
      
      return { sales, refills, otherOut, otherIn, total };
    } catch (error) {
      console.error('Fehler bei der Berechnung der Bewegungen seit Count:', error);
      return { sales: 0, refills: 0, otherOut: 0, otherIn: 0, total: 0 };
    }
  }

  /**
   * Berechnet neue Anpassungen basierend auf retroaktiver Inventur
   */
  async calculateAdjustments(countId: number): Promise<RetroactiveInventoryAdjustment[]> {
    try {
      // Hole Count-Details
      const count = await db
        .select()
        .from(retroactiveInventoryCounts)
        .where(eq(retroactiveInventoryCounts.id, countId))
        .limit(1);
      
      if (count.length === 0) {
        throw new Error('Inventur nicht gefunden');
      }

      const inventoryCount = count[0];
      
      // Hole alle Count-Items
      const countItems = await db
        .select()
        .from(retroactiveInventoryCountItems)
        .where(eq(retroactiveInventoryCountItems.countId, countId));

      const adjustments: RetroactiveInventoryAdjustment[] = [];

      for (const item of countItems) {
        // Berechne System-Menge zum Count-Date
        const systemQuantity = await this.calculateSystemQuantityAtDate(
          item.productId, 
          inventoryCount.warehouseId, 
          inventoryCount.countDate
        );

        // Berechne Bewegungen seit Count-Date
        const movements = await this.calculateMovementsSinceCount(
          item.productId,
          inventoryCount.warehouseId,
          inventoryCount.countDate
        );

        // Hole aktuelle System-Menge
        const currentStock = await db
          .select({ quantity: sql`COALESCE(SUM(quantity), 0)` })
          .from(sql`inventory_items`)
          .where(sql`product_id = ${item.productId} AND warehouse_id = ${inventoryCount.warehouseId}`)
          .limit(1);

        const currentSystemQuantity = Number(currentStock[0]?.quantity) || 0;

        // Berechne Anpassungen
        const discrepancy = item.countedQuantity - systemQuantity;
        const newCalculatedQuantity = currentSystemQuantity + discrepancy;
        const finalAdjustment = discrepancy;

        // Prüfe auf negative Bestände
        const wouldCauseNegativeStock = newCalculatedQuantity < 0;

        // Erstelle Anpassung
        const adjustment: RetroactiveInventoryAdjustment = {
          id: 0, // wird von der DB gesetzt
          countId: countId,
          countItemId: item.id,
          productId: item.productId,
          warehouseId: inventoryCount.warehouseId,
          originalQuantity: systemQuantity,
          adjustedQuantity: item.countedQuantity,
          adjustmentAmount: discrepancy,
          movementsSinceCount: movements.total,
          salesSinceCount: movements.sales,
          refillsSinceCount: movements.refills,
          otherMovements: movements.otherOut + movements.otherIn,
          currentSystemQuantity: currentSystemQuantity,
          newCalculatedQuantity: newCalculatedQuantity,
          finalAdjustment: finalAdjustment,
          wouldCauseNegativeStock: wouldCauseNegativeStock,
          confidenceLevel: movements.total === 0 ? 1.0 : 0.8, // Hohe Konfidenz wenn keine Bewegungen
          hasDataGaps: false, // TODO: Implementiere Gap-Detection
          status: wouldCauseNegativeStock ? 'pending_review' : 'calculated',
          appliedAt: null,
          appliedBy: null,
          appliedByName: null,
          calculationDetails: JSON.stringify({
            systemQuantityAtCount: systemQuantity,
            countedQuantity: item.countedQuantity,
            discrepancy: discrepancy,
            movementsSinceCount: movements,
            calculationDate: new Date().toISOString()
          }),
          validationNotes: wouldCauseNegativeStock ? 'Führt zu negativen Beständen - manuelle Prüfung erforderlich' : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        adjustments.push(adjustment);
      }

      return adjustments;
    } catch (error) {
      console.error('Fehler bei der Berechnung der Anpassungen:', error);
      throw error;
    }
  }
}

const retroInventoryService = new RetroactiveInventoryService();

// GET /api/retroactive-inventory/counts - Alle retroaktiven Inventuren
router.get('/counts', async (req, res) => {
  try {
    const countsResult = await db.execute(sql`
      SELECT 
        id,
        count_name,
        count_date,
        warehouse_id,
        warehouse_name,
        status,
        is_processed,
        total_items_count,
        total_discrepancy_value,
        has_conflicts,
        created_by,
        created_by_name,
        created_at
      FROM retroactive_inventory_counts
      ORDER BY created_at DESC
    `);
    
    const counts = countsResult.rows;

    res.json(counts);
  } catch (error) {
    console.error('Fehler beim Laden der retroaktiven Inventuren:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Inventuren' });
  }
});

// POST /api/retroactive-inventory/counts - Neue retroaktive Inventur erstellen
router.post('/counts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = createRetroactiveCountSchema.parse(req.body);
    
    // Hole Warehouse-Name
    const warehouse = await db
      .select({ name: sql`name` })
      .from(sql`warehouses`)
      .where(sql`id = ${validatedData.warehouseId}`)
      .limit(1);

    if (warehouse.length === 0) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }

    // Prüfe, ob Count-Date in der Vergangenheit liegt
    const countDate = new Date(validatedData.countDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (countDate >= today) {
      return res.status(400).json({ error: 'Count-Date muss in der Vergangenheit liegen' });
    }

    // Prüfe, ob Benutzer authentifiziert ist
    if (!req.user) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    // Erstelle neue Inventur
    const newCount = await db
      .insert(retroactiveInventoryCounts)
      .values({
        countName: validatedData.countName,
        countDate: validatedData.countDate,
        warehouseId: validatedData.warehouseId,
        warehouseName: warehouse[0].name,
        description: validatedData.description,
        reasonForRetroactiveCount: validatedData.reasonForRetroactiveCount,
        notes: validatedData.notes,
        createdBy: req.user.id,
        createdByName: req.user.username,
        status: 'draft',
      })
      .returning();

    res.status(201).json(newCount[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validierungsfehler', details: error.errors });
    }
    console.error('Fehler beim Erstellen der retroaktiven Inventur:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen der Inventur' });
  }
});

// GET /api/retroactive-inventory/counts/:id - Einzelne Inventur mit Details
router.get('/counts/:id', async (req, res) => {
  try {
    const countId = parseInt(req.params.id);
    
    // Hole Inventur-Details
    const count = await db
      .select()
      .from(retroactiveInventoryCounts)
      .where(eq(retroactiveInventoryCounts.id, countId))
      .limit(1);

    if (count.length === 0) {
      return res.status(404).json({ error: 'Inventur nicht gefunden' });
    }

    // Hole Count-Items
    const items = await db
      .select({
        id: retroactiveInventoryCountItems.id,
        productId: retroactiveInventoryCountItems.productId,
        productName: retroactiveInventoryCountItems.productName,
        productSku: retroactiveInventoryCountItems.productSku,
        countedQuantity: retroactiveInventoryCountItems.countedQuantity,
        systemQuantity: retroactiveInventoryCountItems.systemQuantity,
        discrepancy: retroactiveInventoryCountItems.discrepancy,
        discrepancyPercentage: retroactiveInventoryCountItems.discrepancyPercentage,
        unitCost: retroactiveInventoryCountItems.unitCost,
        totalDiscrepancyValue: retroactiveInventoryCountItems.totalDiscrepancyValue,
        isValidated: retroactiveInventoryCountItems.isValidated,
        hasConflict: retroactiveInventoryCountItems.hasConflict,
        requiresAttention: retroactiveInventoryCountItems.requiresAttention,
        notes: retroactiveInventoryCountItems.notes,
        countingRemarks: retroactiveInventoryCountItems.countingRemarks,
      })
      .from(retroactiveInventoryCountItems)
      .where(eq(retroactiveInventoryCountItems.countId, countId));

    // Hole Anpassungen (falls bereits berechnet)
    const adjustments = await db
      .select()
      .from(retroactiveInventoryAdjustments)
      .where(eq(retroactiveInventoryAdjustments.countId, countId));

    res.json({
      count: count[0],
      items: items,
      adjustments: adjustments,
    });
  } catch (error) {
    console.error('Fehler beim Laden der Inventur-Details:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Details' });
  }
});

// POST /api/retroactive-inventory/counts/:id/items - Item zur Inventur hinzufügen
router.post('/counts/:id/items', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const countId = parseInt(req.params.id);
    const validatedData = addCountItemSchema.parse(req.body);

    // Prüfe, ob Count existiert und noch im Draft-Status ist
    const count = await db
      .select({ status: retroactiveInventoryCounts.status })
      .from(retroactiveInventoryCounts)
      .where(eq(retroactiveInventoryCounts.id, countId))
      .limit(1);

    if (count.length === 0) {
      return res.status(404).json({ error: 'Inventur nicht gefunden' });
    }

    if (count[0].status !== 'draft') {
      return res.status(400).json({ error: 'Items können nur zu Entwürfen hinzugefügt werden' });
    }

    // Hole Produktdaten
    const product = await db
      .select({ 
        productName: sql`product_name`,
        sku: sql`sku`
      })
      .from(sql`products`)
      .where(sql`id = ${validatedData.productId}`)
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    // Erstelle neues Count-Item
    const newItem = await db
      .insert(retroactiveInventoryCountItems)
      .values({
        countId: countId,
        productId: validatedData.productId,
        productName: product[0].productName,
        productSku: product[0].sku,
        countedQuantity: validatedData.countedQuantity,
        unitCost: validatedData.unitCost,
        batchId: validatedData.batchId,
        expiryDate: validatedData.expiryDate,
        notes: validatedData.notes,
        countingRemarks: validatedData.countingRemarks,
      })
      .returning();

    res.status(201).json(newItem[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validierungsfehler', details: error.errors });
    }
    console.error('Fehler beim Hinzufügen des Items:', error);
    res.status(500).json({ error: 'Fehler beim Hinzufügen des Items' });
  }
});

// POST /api/retroactive-inventory/counts/:id/process - Anpassungen berechnen und verarbeiten
router.post('/counts/:id/process', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const countId = parseInt(req.params.id);

    // Prüfe Count-Status
    const count = await db
      .select({ 
        status: retroactiveInventoryCounts.status,
        isProcessed: retroactiveInventoryCounts.isProcessed 
      })
      .from(retroactiveInventoryCounts)
      .where(eq(retroactiveInventoryCounts.id, countId))
      .limit(1);

    if (count.length === 0) {
      return res.status(404).json({ error: 'Inventur nicht gefunden' });
    }

    if (count[0].isProcessed) {
      return res.status(400).json({ error: 'Inventur wurde bereits verarbeitet' });
    }

    // Berechne Anpassungen
    const adjustments = await retroInventoryService.calculateAdjustments(countId);

    // Speichere Anpassungen
    if (adjustments.length > 0) {
      await db.insert(retroactiveInventoryAdjustments).values(adjustments);
    }

    // Prüfe, ob Benutzer authentifiziert ist
    if (!req.user) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    // Update Count-Status
    await db
      .update(retroactiveInventoryCounts)
      .set({
        status: 'processed',
        isProcessed: true,
        processingDate: new Date(),
        processedBy: req.user.id,
        processedByName: req.user.username,
        totalItemsCount: adjustments.length,
        totalDiscrepancies: adjustments.filter(a => a.adjustmentAmount !== 0).length,
        hasNegativeStock: adjustments.some(a => a.wouldCauseNegativeStock),
        updatedAt: new Date(),
      })
      .where(eq(retroactiveInventoryCounts.id, countId));

    res.json({
      message: 'Anpassungen erfolgreich berechnet',
      adjustmentsCount: adjustments.length,
      discrepanciesCount: adjustments.filter(a => a.adjustmentAmount !== 0).length,
      negativeStockWarnings: adjustments.filter(a => a.wouldCauseNegativeStock).length,
    });
  } catch (error) {
    console.error('Fehler bei der Verarbeitung:', error);
    res.status(500).json({ error: 'Fehler bei der Verarbeitung' });
  }
});

// GET /api/retroactive-inventory/warehouses - Verfügbare Lager
router.get('/warehouses', async (req, res) => {
  try {
    const warehouses = await db
      .select({
        id: sql`id`,
        name: sql`name`,
        city: sql`city`,
        isActive: sql`is_active`
      })
      .from(sql`warehouses`)
      .where(sql`is_active = true`)
      .orderBy(sql`name ASC`);

    res.json(warehouses);
  } catch (error) {
    console.error('Fehler beim Laden der Lager:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Lager' });
  }
});

// GET /api/retroactive-inventory/products/:warehouseId - Produkte im Lager
router.get('/products/:warehouseId', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    
    const products = await db
      .select({
        id: sql`p.id`,
        productName: sql`p.product_name`,
        sku: sql`p.sku`,
        currentQuantity: sql`COALESCE(SUM(ii.quantity), 0)`
      })
      .from(sql`products p`)
      .leftJoin(sql`inventory_items ii`, sql`p.id = ii.product_id AND ii.warehouse_id = ${warehouseId}`)
      .groupBy(sql`p.id, p.product_name, p.sku`)
      .having(sql`COALESCE(SUM(ii.quantity), 0) > 0`)
      .orderBy(sql`p.product_name ASC`);

    res.json(products);
  } catch (error) {
    console.error('Fehler beim Laden der Produkte:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Produkte' });
  }
});

export default router;