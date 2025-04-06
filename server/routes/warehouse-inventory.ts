import express, { Request, Response } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { productBatches } from '@shared/schema';
import { eq, and, gt, inArray, asc } from 'drizzle-orm';

// Definiere eine Interface für das formatierte Inventar-Item
interface FormattedInventoryItem {
  id: number;
  warehouseId: number;
  productId: number;
  quantity: number | null;
  minQuantity: number | null;
  status: string | null;
  notes: string | null;
  lastUpdated: Date | null;
  productName?: string;
  targetQuantity?: number;
  locationInWarehouse?: string;
  nextExpiryDate?: string | null; // MHD des am frühesten ablaufenden Batches
  [key: string]: any; // Für alle zusätzlichen Felder
}

const router = express.Router();

// GET /api/inventory - Lagerbestand eines oder aller Lager abrufen
router.get('/', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId ? 
      isNaN(parseInt(req.query.warehouseId as string)) ? undefined : parseInt(req.query.warehouseId as string) 
      : undefined;
    const includeZeroStock = req.query.includeZeroStock === 'true';
    const critical = req.query.critical === 'true';
    
    // Lagerbestand abrufen - wenn warehouseId undefined ist, werden alle Lagerbestände abgerufen
    const inventoryItems = await storage.getInventoryItems({
      warehouseId,
      includeZeroStock,
      critical
    });
    
    // Hole die frühesten ablaufenden Batches für jedes Produkt
    const productIds = inventoryItems.map(item => item.productId);
    
    // Abfrage für die frühesten ablaufenden Batches pro Produkt und Lager
    let batchesQuery = db
      .select({
        productId: productBatches.productId,
        warehouseId: productBatches.warehouseId,
        // Nutze das früheste Ablaufdatum
        nextExpiryDate: db.sql`MIN(${productBatches.expiryDate})`.as('nextExpiryDate')
      })
      .from(productBatches)
      .where(
        and(
          // Nur aktive Batches
          eq(productBatches.status, 'active'),
          // Nur Batches mit einer Menge > 0
          gt(productBatches.currentQuantity, 0)
        )
      )
      .groupBy(productBatches.productId, productBatches.warehouseId);
    
    // Wenn ein bestimmtes Lager gefiltert wird
    if (warehouseId) {
      batchesQuery = batchesQuery.where(eq(productBatches.warehouseId, warehouseId));
    }
    
    // Wenn bestimmte Produkte gefiltert werden
    if (productIds.length > 0) {
      batchesQuery = batchesQuery.where(inArray(productBatches.productId, productIds));
    }
    
    const earliestBatches = await batchesQuery;
    
    // Erstelle eine Map für einfachen Zugriff
    const expiryDateMap = new Map();
    earliestBatches.forEach(batch => {
      const key = `${batch.productId}-${batch.warehouseId}`;
      expiryDateMap.set(key, batch.nextExpiryDate);
    });
    
    // Format für die Frontend-Anwendung anpassen
    const formattedInventory = inventoryItems.map(item => {
      // Erstelle ein Basisobjekt mit den garantierten Feldern
      const inventoryItem: FormattedInventoryItem = {
        id: item.id,
        warehouseId: item.warehouseId,
        productId: item.productId,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        status: item.status,
        notes: item.notes,
        lastUpdated: item.updatedAt || item.createdAt
      };
      
      // Füge das nächste Ablaufdatum hinzu
      const key = `${item.productId}-${item.warehouseId}`;
      inventoryItem.nextExpiryDate = expiryDateMap.get(key) || null;
      
      // Füge optionale Felder hinzu, wenn sie existieren
      if ('productName' in item) {
        inventoryItem.productName = item['productName'] as string;
      }
      
      if ('targetQuantity' in item) {
        inventoryItem.targetQuantity = item['targetQuantity'] as number;
      }
      
      if ('locationInWarehouse' in item) {
        inventoryItem.locationInWarehouse = item['locationInWarehouse'] as string;
      }
      
      return inventoryItem;
    });
    
    res.json(formattedInventory);
  } catch (error) {
    console.error("Error fetching warehouse inventory:", error);
    res.status(500).json({ 
      error: "Failed to fetch warehouse inventory", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;