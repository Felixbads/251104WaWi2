import express from 'express';
import { db, rawDb } from '../db';
import { eq, and, lt, or, gte, sql } from 'drizzle-orm';
import { inventoryItems, products, warehouses, productBatches } from '../../shared/schema';
import { storage } from '../storage';

const router = express.Router();

// Hole kritische Produkte (niedriger Bestand oder bald ablaufend)
router.get('/critical-items', async (req, res) => {
  try {
    
    // Aktuelles Datum und Datum in 14 Tagen
    const today = new Date();
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(today.getDate() + 14);
    
    // 1. Hole Produkte mit niedrigem Bestand 
    // (Menge < Mindestmenge oder Menge < 20% der Maximalmenge)
    // Da wir Probleme mit dem ORM haben, verwenden wir SQL direkt
    const lowStockItemsQuery = `
      SELECT 
        i.id, 
        i.product_id AS "productId", 
        p.name AS "productName", 
        i.warehouse_id AS "warehouseId", 
        w.name AS "warehouseName", 
        i.quantity, 
        i.min_quantity AS "minQuantity", 
        i.max_quantity AS "maxQuantity"
      FROM 
        inventory_items i
      LEFT JOIN 
        products p ON i.product_id = p.id
      LEFT JOIN 
        warehouses w ON i.warehouse_id = w.id
      WHERE 
        (i.quantity < i.min_quantity OR (i.max_quantity >= 1 AND i.quantity < i.max_quantity * 0.2))
    `;
    const lowStockResult = await rawDb.query(lowStockItemsQuery);
    const lowStockItems = lowStockResult.rows;

    // 2. Hole Produkte mit nahem Ablaufdatum (innerhalb der nächsten 14 Tage)
    const expiringBatchesQuery = `
      SELECT 
        id AS "productBatchId", 
        product_id AS "productId", 
        warehouse_id AS "warehouseId", 
        expiry_date AS "expiryDate"
      FROM 
        product_batches
      WHERE 
        expiry_date >= $1 
        AND expiry_date < $2
        AND quantity >= 1
    `;
    const expiringBatchesResult = await rawDb.query(expiringBatchesQuery, [today, twoWeeksLater]);
    const expiringBatches = expiringBatchesResult.rows;
      
    // Wir brauchen Produkt- und Lagernamen für die ablaufenden Batches
    const expiringWithDetails = await Promise.all(
      expiringBatches.map(async (batch) => {
        const product = await storage.getProduct(batch.productId);
        const warehouse = await storage.getWarehouse(batch.warehouseId);
        // Direkte SQL-Abfrage verwenden
        const inventoryItemQuery = `
          SELECT * FROM inventory_items
          WHERE product_id = $1 AND warehouse_id = $2
          LIMIT 1
        `;
        const inventoryItemResult = await rawDb.query(inventoryItemQuery, [batch.productId, batch.warehouseId]);
        const inventoryItem = inventoryItemResult.rows[0];
          
        return {
          id: inventoryItem?.id || 0,
          productId: batch.productId,
          productName: product?.productName || 'Unbekanntes Produkt',
          warehouseId: batch.warehouseId,
          warehouseName: warehouse?.name || 'Unbekanntes Lager',
          quantity: inventoryItem?.quantity || 0,
          minQuantity: inventoryItem?.minQuantity || 0,
          maxQuantity: inventoryItem?.maxQuantity || 0,
          nextExpiryDate: typeof batch.expiryDate === 'string' 
            ? batch.expiryDate 
            : new Date(batch.expiryDate).toISOString(),
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
    await rawDb.query(`
      DELETE FROM product_movements 
      WHERE product_batch_id IN (SELECT id FROM product_batches)
    `);
    
    console.log('Produktbewegungen gelöscht');
    
    // 2. Lösche product_batches
    await rawDb.query(`DELETE FROM product_batches`);
    console.log('Produktchargen gelöscht');
    
    // 3. Lösche inventory_count_items
    await rawDb.query(`DELETE FROM inventory_count_items`);
    console.log('Inventurelemente gelöscht');
    
    // 4. Lösche inventory_items
    await rawDb.query(`DELETE FROM inventory_items`);
    console.log('Lagerinventar gelöscht');

    // 5. Lösche product_conditions
    await rawDb.query(`DELETE FROM purchase_conditions`);
    console.log('Einkaufsbedingungen gelöscht');
    
    // 6. Lösche machine_stocks
    await rawDb.query(`DELETE FROM machine_stocks`);
    console.log('Automatenbestände gelöscht');
    
    // 7. Starte den Lagerabgleich neu
    console.log('Starte den Lagerabgleich für alle Produkte...');
    
    // Initiale Produkte aus der Produkttabelle holen
    const allProducts = await db.select().from(products);
    console.log(`${allProducts.length} Produkte für den Neuaufbau gefunden`);
    
    // Wir starten einen einfachen Abgleich ohne Vendon-API, nur mit den Produkten aus der Datenbank
    // Die Vendon-Synchronisierung wird später automatisch laufen
    const warehouses = await storage.getWarehouses();
    
    if (warehouses && warehouses.length > 0) {
      // Wähle das Standardlager (oder das erste in der Liste)
      // Da wir keine isDefault-Eigenschaft haben, nehmen wir das erste Lager
      const defaultWarehouse = warehouses[0];
      
      // Füge alle Produkte zum Standardlager hinzu
      for (const product of allProducts) {
        try {
          // Verwende createInventoryItem anstelle von createOrUpdateInventoryItem
          await storage.createInventoryItem({
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