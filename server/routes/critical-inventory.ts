import express from 'express';
import { db } from '../db';
import { eq, and, lt, or, gte } from 'drizzle-orm';
import { inventoryItems, products, warehouses, productBatches } from '../../shared/schema';
import { Storage } from '../storage';

const router = express.Router();

// Hole kritische Produkte (niedriger Bestand oder bald ablaufend)
router.get('/critical-items', async (req, res) => {
  try {
    const storage = Storage.getInstance();
    
    // Aktuelles Datum und Datum in 14 Tagen
    const today = new Date();
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(today.getDate() + 14);
    
    // 1. Hole Produkte mit niedrigem Bestand 
    // (Menge < Mindestmenge oder Menge < 20% der Maximalmenge)
    const lowStockItems = await db
      .select({
        id: inventoryItems.id,
        productId: inventoryItems.productId,
        productName: products.name,
        warehouseId: inventoryItems.warehouseId,
        warehouseName: warehouses.name,
        quantity: inventoryItems.quantity,
        minQuantity: inventoryItems.minQuantity,
        maxQuantity: inventoryItems.maxQuantity,
      })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .leftJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(
        or(
          lt(inventoryItems.quantity, inventoryItems.minQuantity),
          and(
            gte(inventoryItems.maxQuantity, 1),
            lt(inventoryItems.quantity, db.raw(`${inventoryItems.tableName}.max_quantity * 0.2`))
          )
        )
      );

    // 2. Hole Produkte mit nahem Ablaufdatum (innerhalb der nächsten 14 Tage)
    const expiringBatches = await db
      .select({
        productBatchId: productBatches.id,
        productId: productBatches.productId,
        warehouseId: productBatches.warehouseId,
        expiryDate: productBatches.expiryDate,
      })
      .from(productBatches)
      .where(
        and(
          gte(productBatches.expiryDate, today), 
          lt(productBatches.expiryDate, twoWeeksLater),
          gte(productBatches.quantity, 1) // Nur Batches mit positivem Bestand
        )
      );
      
    // Wir brauchen Produkt- und Lagernamen für die ablaufenden Batches
    const expiringWithDetails = await Promise.all(
      expiringBatches.map(async (batch) => {
        const product = await storage.getProductById(batch.productId);
        const warehouse = await storage.getWarehouseById(batch.warehouseId);
        const inventoryItem = await db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.productId, batch.productId),
              eq(inventoryItems.warehouseId, batch.warehouseId)
            )
          )
          .then(items => items[0]);
          
        return {
          id: inventoryItem?.id || 0,
          productId: batch.productId,
          productName: product?.name || 'Unbekanntes Produkt',
          warehouseId: batch.warehouseId,
          warehouseName: warehouse?.name || 'Unbekanntes Lager',
          quantity: inventoryItem?.quantity || 0,
          minQuantity: inventoryItem?.minQuantity || 0,
          maxQuantity: inventoryItem?.maxQuantity || 0,
          nextExpiryDate: batch.expiryDate.toISOString(),
        };
      })
    );
    
    // 3. Kombiniere die Ergebnisse und markiere Kritikalitätsart
    const combinedItems = new Map();
    
    // Füge Produkte mit niedrigem Bestand hinzu
    lowStockItems.forEach(item => {
      combinedItems.set(`${item.productId}-${item.warehouseId}`, {
        ...item,
        criticality: 'low-stock'
      });
    });
    
    // Füge Produkte mit ablaufendem MHD hinzu
    expiringWithDetails.forEach(item => {
      const key = `${item.productId}-${item.warehouseId}`;
      
      if (combinedItems.has(key)) {
        // Wenn das Produkt bereits wegen niedrigem Bestand in der Liste ist
        const existingItem = combinedItems.get(key);
        
        combinedItems.set(key, {
          ...existingItem,
          nextExpiryDate: item.nextExpiryDate,
          criticality: 'both'
        });
      } else {
        // Wenn das Produkt nur wegen ablaufendem MHD kritisch ist
        combinedItems.set(key, {
          ...item,
          criticality: 'expiring'
        });
      }
    });
    
    res.json(Array.from(combinedItems.values()));
  } catch (error) {
    console.error('Fehler beim Abrufen kritischer Lagerposten:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen kritischer Lagerposten',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Route zum Löschen aller Duplikate im Lager und Neuaufbau
router.post('/reset-and-rebuild', async (req, res) => {
  try {
    console.log('Starte Bereinigung und Neuaufbau des Lagerbestands...');
    
    // 1. Sichere Löschen von product_movements, die auf product_batches verweisen
    await db.execute(`
      DELETE FROM product_movements 
      WHERE product_batch_id IN (SELECT id FROM product_batches)
    `);
    
    console.log('Produktbewegungen gelöscht');
    
    // 2. Lösche product_batches
    await db.execute(`DELETE FROM product_batches`);
    console.log('Produktchargen gelöscht');
    
    // 3. Lösche inventory_count_items
    await db.execute(`DELETE FROM inventory_count_items`);
    console.log('Inventurelemente gelöscht');
    
    // 4. Lösche inventory_items
    await db.execute(`DELETE FROM inventory_items`);
    console.log('Lagerinventar gelöscht');

    // 5. Lösche product_conditions
    await db.execute(`DELETE FROM purchase_conditions`);
    console.log('Einkaufsbedingungen gelöscht');
    
    // 6. Lösche machine_stocks
    await db.execute(`DELETE FROM machine_stocks`);
    console.log('Automatenbestände gelöscht');
    
    // 7. Starte den Lagerabgleich neu
    console.log('Starte den Lagerabgleich für alle Produkte...');
    
    // Initiale Produkte aus der Produkttabelle holen
    const allProducts = await db.select().from(products);
    console.log(`${allProducts.length} Produkte für den Neuaufbau gefunden`);
    
    // Wir starten einen einfachen Abgleich ohne Vendon-API, nur mit den Produkten aus der Datenbank
    // Die Vendon-Synchronisierung wird später automatisch laufen
    const storage = Storage.getInstance();
    const warehouses = await storage.getWarehouses();
    
    if (warehouses && warehouses.length > 0) {
      // Wähle das Standardlager (oder das erste in der Liste)
      const defaultWarehouse = warehouses.find(w => w.isDefault) || warehouses[0];
      
      // Füge alle Produkte zum Standardlager hinzu
      for (const product of allProducts) {
        try {
          await storage.createOrUpdateInventoryItem({
            productId: product.id,
            warehouseId: defaultWarehouse.id,
            quantity: 0,
            minQuantity: 5,
            maxQuantity: 50,
            reorderPoint: 10,
            reorderQuantity: 20,
            notes: 'Automatisch erstellt durch Lagerbereinigung'
          });
        } catch (err) {
          console.error(`Fehler beim Hinzufügen von Produkt ${product.id} zum Lager:`, err);
        }
      }
      
      console.log(`Alle Produkte wurden zum Lager ${defaultWarehouse.name} (ID: ${defaultWarehouse.id}) hinzugefügt`);
    }
    
    res.json({
      success: true,
      message: `Lagerbestände erfolgreich bereinigt und neu aufgebaut. ${allProducts.length} Produkte wurden dem Standardlager hinzugefügt.`
    });
  } catch (error) {
    console.error('Fehler bei der Bereinigung des Lagerbestands:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Bereinigen des Lagerbestands',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export const criticalInventoryRouter = router;