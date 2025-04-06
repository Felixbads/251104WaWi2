import express, { Request, Response } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { productBatches, products, warehouses } from '@shared/schema';
import { eq, and, gt, inArray, asc, min, sql } from 'drizzle-orm';

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
    
    // Hole die frühesten ablaufenden Batches für jedes Produkt und die Summen
    // Wir bauen ein alternatives Inventar basierend auf Batches
    let batchInventoryQuery = db
      .select({
        productId: productBatches.productId,
        warehouseId: productBatches.warehouseId,
        // Summe der aktuellen Mengen aller aktiven Batches
        quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
        // Frühestes Ablaufdatum
        nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
      })
      .from(productBatches)
      .where(
        and(
          // Nur aktive Batches
          eq(productBatches.status, 'active')
        )
      )
      .groupBy(productBatches.productId, productBatches.warehouseId);
    
    // Wenn ein bestimmtes Lager gefiltert wird
    if (warehouseId) {
      batchInventoryQuery = db
        .select({
          productId: productBatches.productId,
          warehouseId: productBatches.warehouseId,
          quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
          nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
        })
        .from(productBatches)
        .where(
          and(
            eq(productBatches.status, 'active'),
            eq(productBatches.warehouseId, warehouseId)
          )
        )
        .groupBy(productBatches.productId, productBatches.warehouseId);
    }
    
    // Wenn includeZeroStock auf false gesetzt ist, erstellen wir eine neue Query mit having-Klausel
    if (!includeZeroStock) {
      // Wir müssen eine neue Query definieren, weil drizzle-orm keine Verkettung von having nach where unterstützt
      if (warehouseId) {
        batchInventoryQuery = db
          .select({
            productId: productBatches.productId,
            warehouseId: productBatches.warehouseId,
            quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
            nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
          })
          .from(productBatches)
          .where(
            and(
              eq(productBatches.status, 'active'),
              eq(productBatches.warehouseId, warehouseId)
            )
          )
          .groupBy(productBatches.productId, productBatches.warehouseId)
          .having(sql`SUM(${productBatches.currentQuantity}) > 0`);
      } else {
        batchInventoryQuery = db
          .select({
            productId: productBatches.productId,
            warehouseId: productBatches.warehouseId,
            quantity: sql<number>`SUM(${productBatches.currentQuantity})`,
            nextExpiryDate: min(productBatches.expiryDate).as('nextExpiryDate')
          })
          .from(productBatches)
          .where(eq(productBatches.status, 'active'))
          .groupBy(productBatches.productId, productBatches.warehouseId)
          .having(sql`SUM(${productBatches.currentQuantity}) > 0`);
      }
    }
    
    // Führe die Batch-Inventur durch
    const batchInventory = await batchInventoryQuery;
    
    // Hole zusätzliche Produktinformationen, wenn Batches vorhanden sind
    let productInfoMap = new Map();
    let warehouseInfoMap = new Map();
    
    if (batchInventory.length > 0) {
      // Sammle alle Produkt-IDs aus dem Batch-Inventar
      const productIds = [...new Set(batchInventory.map(item => item.productId))];
      const warehouseIds = [...new Set(batchInventory.map(item => item.warehouseId))];
      
      // Lade alle Produktdaten in einem einzigen Query
      const productData = await db
        .select()
        .from(products)
        .where(inArray(products.id, productIds));
      
      // Lade alle Lagerdaten in einem einzigen Query
      const warehouseData = await db
        .select()
        .from(warehouses)
        .where(inArray(warehouses.id, warehouseIds));
      
      // Erstelle Maps für schnellen Zugriff
      productData.forEach(product => {
        productInfoMap.set(product.id, product);
      });
      
      warehouseData.forEach(warehouse => {
        warehouseInfoMap.set(warehouse.id, warehouse);
      });
    }
    
    // Erstelle eine Kombination aus traditionellem Inventar und Batch-basiertem Inventar
    // Zuerst alle bestehenden Inventareinträge (alte Methode)
    const formattedInventory: FormattedInventoryItem[] = inventoryItems.map(item => {
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
      
      // Suche nach Batch-Daten für dieses Produkt-Lager-Paar
      const batchData = batchInventory.find(
        batch => batch.productId === item.productId && batch.warehouseId === item.warehouseId
      );
      
      // Wenn Batch-Daten vorhanden sind, aktualisiere die Menge und setze das Ablaufdatum
      if (batchData) {
        // Bei aktiven Batches verwenden wir die Batch-Menge
        if (item.status === 'active') {
          inventoryItem.quantity = batchData.quantity;
        }
        inventoryItem.nextExpiryDate = batchData.nextExpiryDate;
      }
      
      // Füge optionale Felder hinzu, wenn sie existieren
      if ('productName' in item) {
        inventoryItem.productName = item['productName'] as string;
      } else if (productInfoMap.has(item.productId)) {
        inventoryItem.productName = productInfoMap.get(item.productId).productName;
      }
      
      if ('targetQuantity' in item) {
        inventoryItem.targetQuantity = item['targetQuantity'] as number;
      }
      
      if ('locationInWarehouse' in item) {
        inventoryItem.locationInWarehouse = item['locationInWarehouse'] as string;
      }
      
      if (!('warehouseName' in item) && warehouseInfoMap.has(item.warehouseId)) {
        inventoryItem.warehouseName = warehouseInfoMap.get(item.warehouseId).name;
      }
      
      return inventoryItem;
    });
    
    // Jetzt füge alle Batch-Einträge hinzu, die noch nicht im traditionellen Inventar sind
    // Erstelle eine Map der vorhandenen Einträge für schnellen Zugriff
    const existingEntries = new Map();
    formattedInventory.forEach(item => {
      const key = `${item.productId}-${item.warehouseId}`;
      existingEntries.set(key, true);
    });
    
    // Füge neue Einträge aus dem Batch-Inventar hinzu
    for (const batchItem of batchInventory) {
      const key = `${batchItem.productId}-${batchItem.warehouseId}`;
      
      // Überspringe, wenn dieser Eintrag bereits existiert
      if (existingEntries.has(key)) {
        continue;
      }
      
      // Hole Produktdaten
      const productInfo = productInfoMap.get(batchItem.productId);
      const warehouseInfo = warehouseInfoMap.get(batchItem.warehouseId);
      
      if (!productInfo) {
        console.warn(`Produkt mit ID ${batchItem.productId} nicht gefunden für Batch-Inventareintrag`);
        continue;
      }
      
      // Erstelle einen neuen Eintrag basierend auf Batch-Daten
      const newInventoryItem: FormattedInventoryItem = {
        // Virtuelle ID für Batch-basierte Einträge
        id: -1 * (batchItem.productId * 1000 + batchItem.warehouseId), // Negative ID um Konflikte zu vermeiden
        warehouseId: batchItem.warehouseId,
        productId: batchItem.productId,
        quantity: batchItem.quantity,
        minQuantity: 5, // Standardwert
        status: 'active',
        notes: 'Automatisch aus Batches generiert',
        lastUpdated: new Date(),
        productName: productInfo.productName,
        warehouseName: warehouseInfo ? warehouseInfo.name : 'Unbekanntes Lager',
        nextExpiryDate: batchItem.nextExpiryDate
      };
      
      formattedInventory.push(newInventoryItem);
    }
    
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