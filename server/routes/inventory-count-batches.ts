import { Router, Request, Response } from 'express';
import { db, rawDb } from '../db';
import { productBatches } from '../../shared/warehouse3.schema';
import { eq } from 'drizzle-orm';

const router = Router();

// POST /api/inventory-counts/product-batches - Neue Charge für ein Produkt erstellen
router.post('/product-batches', async (req: Request, res: Response) => {
  try {
    const { 
      productId, 
      warehouseId, 
      batchNumber, 
      expiryDate,
      receivedDate,
      locationInWarehouse, 
      initialQuantity = 0,
      currentQuantity = 0,
      quantity = 0, // Explizit das neue quantity-Feld extrahieren
      notes 
    } = req.body;
    
    console.log("POST /api/inventory-counts/product-batches request:", JSON.stringify(req.body, null, 2));
    console.log("expiryDate type:", typeof expiryDate, "value:", expiryDate);
    console.log("receivedDate type:", typeof receivedDate, "value:", receivedDate);
    console.log("locationInWarehouse type:", typeof locationInWarehouse, "value:", locationInWarehouse);
    
    // Validiere Eingabedaten
    if (!productId || !warehouseId) {
      console.error("Validation error: Product ID or Warehouse ID missing", { productId, warehouseId });
      return res.status(400).json({ 
        error: "Product ID and Warehouse ID are required",
        receivedData: { productId, warehouseId }
      });
    }
    
    // Behandle potenzielle Probleme mit expiryDate
    let parsedExpiryDate = null;
    if (expiryDate) {
      try {
        // Versuche, das Datum zu parsen, um sicherzustellen, dass es ein gültiges Format hat
        parsedExpiryDate = new Date(expiryDate);
        console.log("Parsed expiry date:", parsedExpiryDate, "Valid:", !isNaN(parsedExpiryDate.getTime()));
        
        // Überprüfe, ob das Datum gültig ist
        if (isNaN(parsedExpiryDate.getTime())) {
          console.warn("Warning: Invalid expiry date format received:", expiryDate);
          parsedExpiryDate = null;
        } else {
          // Formatiere das Datum im Format YYYY-MM-DD für PostgreSQL
          parsedExpiryDate = parsedExpiryDate.toISOString().split('T')[0];
        }
      } catch (dateError) {
        console.error("Error parsing expiry date:", dateError);
        parsedExpiryDate = null;
      }
    }
    
    // Überprüfe, ob das Produkt existiert
    try {
      const productResult = await rawDb.query(
        `SELECT * FROM products WHERE id = $1`,
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        console.error("Product not found:", productId);
        return res.status(404).json({ error: "Product not found", productId });
      }
      
      console.log("Product found:", productResult.rows[0].product_name);
    } catch (dbError) {
      console.error("Database error while checking product:", dbError);
      return res.status(500).json({ 
        error: "Database error while checking product", 
        details: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }
    
    // Überprüfe, ob das Lager existiert
    try {
      const warehouseResult = await rawDb.query(
        `SELECT * FROM warehouses WHERE id = $1`,
        [warehouseId]
      );
      
      if (warehouseResult.rows.length === 0) {
        console.error("Warehouse not found:", warehouseId);
        return res.status(404).json({ error: "Warehouse not found", warehouseId });
      }
      
      console.log("Warehouse found:", warehouseResult.rows[0].name);
    } catch (dbError) {
      console.error("Database error while checking warehouse:", dbError);
      return res.status(500).json({ 
        error: "Database error while checking warehouse", 
        details: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }
    
    // Erstelle die neue Charge
    // Prüfen, welche Spalten in der Tabelle vorhanden sind, um Fehler zu vermeiden
    let columns = [];
    try {
      const columnsResult = await rawDb.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_name = 'product_batches'`
      );
      
      columns = columnsResult.rows.map(row => row.column_name);
      console.log("Verfügbare Spalten in product_batches:", columns);
    } catch (dbError) {
      console.error("Error getting table columns:", dbError);
      return res.status(500).json({ 
        error: "Failed to get database schema", 
        details: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }
    
    // Status-Spalte prüfen und Standardwert hinzufügen
    let statusValue = 'active';
    let hasStatusColumn = columns.includes('status');
    
    // Überprüfe, welche zusätzlichen Spalten in der Tabelle vorhanden sind
    let hasReceivedDateColumn = columns.includes('received_date');
    let hasLocationColumn = columns.includes('location_in_warehouse');
    
    console.log("Received Date vorhanden:", hasReceivedDateColumn);
    console.log("Location vorhanden:", hasLocationColumn);
    
    // DIREKTES HINZUFÜGEN DER QUANTITY-SPALTE - REQUIRED FIELD
    // Baue die SQL-Abfrage dynamisch auf basierend auf vorhandenen Spalten
    let columnsString = 'product_id, warehouse_id, batch_number, expiry_date, quantity';
    let valuesString = '$1, $2, $3, $4, $5';
    let valuesArray = [productId, warehouseId, batchNumber, parsedExpiryDate, quantity || initialQuantity]; // Verwende quantity, wenn es vorhanden ist, ansonsten initialQuantity
    let valueIndex = 6;
    
    // Füge receivedDate hinzu, wenn die Spalte existiert
    if (hasReceivedDateColumn) {
      columnsString += ', received_date';
      valuesString += `, $${valueIndex}`;
      
      // Stelle sicher, dass receivedDate korrekt formatiert ist
      let formattedReceivedDate;
      try {
        formattedReceivedDate = receivedDate ? new Date(receivedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      } catch (dateError) {
        console.warn("Error parsing received date, using current date:", dateError);
        formattedReceivedDate = new Date().toISOString().split('T')[0];
      }
      
      valuesArray.push(formattedReceivedDate);
      valueIndex++;
    }
    
    // Füge locationInWarehouse hinzu, wenn die Spalte existiert
    if (hasLocationColumn) {
      columnsString += ', location_in_warehouse';
      valuesString += `, $${valueIndex}`;
      valuesArray.push(locationInWarehouse || null);
      valueIndex++;
    }
    
    // Füge manufacturing_date hinzu, wenn die Spalte existiert (als NULL)
    if (columns.includes('manufacturing_date')) {
      columnsString += ', manufacturing_date';
      valuesString += ', NULL';
    }
    
    // HINWEIS: Da quantity bereits in der Abfrage enthalten ist, müssen wir es hier nicht noch einmal hinzufügen
    // Dies wurde entfernt, um eine Duplizierung der Spalte zu vermeiden:
    
    // Füge remaining columns hinzu
    columnsString += `, initial_quantity, current_quantity, notes`;
    valuesString += `, $${valueIndex}, $${valueIndex + 1}, $${valueIndex + 2}`;
    valuesArray.push(initialQuantity, currentQuantity, notes);
    valueIndex += 3;
    
    // Füge Status hinzu, wenn die Spalte existiert
    if (hasStatusColumn) {
      columnsString += ', status';
      valuesString += `, $${valueIndex}`;
      valuesArray.push(statusValue);
      valueIndex++;
    }
    
    // Füge created_at und updated_at hinzu
    columnsString += ', created_at, updated_at';
    valuesString += ', NOW(), NOW()';
    
    console.log("SQL-Abfrage zum Erstellen der Charge:");
    console.log("SQL Columns:", columnsString);
    console.log("SQL Values:", valuesString);
    console.log("Values Array:", valuesArray);
    
    // Führe die SQL-Abfrage aus
    let result;
    try {
      result = await rawDb.query(
        `INSERT INTO product_batches (${columnsString})
         VALUES (${valuesString})
         RETURNING *`,
        valuesArray
      );
      
      if (!result.rows || result.rows.length === 0) {
        return res.status(500).json({ 
          error: "Failed to create product batch, no rows returned", 
          sqlInfo: { columnsString, valuesString }
        });
      }
    } catch (dbError) {
      console.error("Error executing insert query:", dbError);
      return res.status(500).json({ 
        error: "Database error while creating product batch", 
        details: dbError instanceof Error ? dbError.message : String(dbError),
        sqlInfo: { columnsString, valuesString }
      });
    }
    
    // Transformiere das Ergebnis in ein sauberes Format
    const batch = result.rows[0];
    const formattedBatch = {
      id: batch.id,
      productId: batch.product_id,
      warehouseId: batch.warehouse_id,
      batchNumber: batch.batch_number,
      expiryDate: batch.expiry_date,
      initialQuantity: batch.initial_quantity,
      currentQuantity: batch.current_quantity,
      receivedDate: batch.received_date,
      locationInWarehouse: batch.location_in_warehouse,
      notes: batch.notes,
      createdAt: batch.created_at,
      updatedAt: batch.updated_at
    };
    
    console.log("Batch successfully created:", formattedBatch.id);
    res.status(201).json(formattedBatch);
  } catch (error) {
    console.error("Unexpected error creating product batch:", error);
    res.status(500).json({ 
      error: "Failed to create product batch", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET /api/inventory-counts/:id/product-batches/:productId - Verfügbare Batches für ein Produkt in einer Inventur abrufen
router.get('/:inventoryCountId/product-batches/:productId', async (req: Request, res: Response) => {
  try {
    const inventoryCountId = parseInt(req.params.inventoryCountId);
    const productId = parseInt(req.params.productId);
    
    if (!inventoryCountId) {
      return res.status(400).json({ error: "Inventory Count ID is required" });
    }
    
    // Wenn keine gültige Produkt-ID vorhanden ist, geben wir eine leere Liste zurück
    if (!productId || isNaN(productId)) {
      return res.status(200).json([]);
    }
    
    // Überprüfe, ob die Inventurzählung existiert
    const result = await rawDb.query(
      `SELECT * FROM inventory_counts WHERE id = $1`,
      [inventoryCountId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Inventory Count not found" });
    }
    
    const count = result.rows[0];
    
    // Hole Batches für das Produkt im entsprechenden Lager
    const query = `
      SELECT 
        pb.*,
        p.product_name as product_name
      FROM 
        product_batches pb
      JOIN 
        products p ON pb.product_id = p.id
      WHERE 
        pb.product_id = $1
        AND pb.warehouse_id = $2
        AND pb.status = 'active'
        AND pb.current_quantity > 0
      ORDER BY 
        pb.expiry_date ASC NULLS LAST
    `;
    
    const batchesResult = await rawDb.query(query, [productId, count.warehouse_id]);
    
    // Formatiere das Ergebnis
    const batches = batchesResult.rows.map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      initialQuantity: row.initial_quantity,
      currentQuantity: row.current_quantity,
      expiryDate: row.expiry_date,
      manufacturingDate: row.manufacturing_date,
      notes: row.notes,
      locationInWarehouse: row.location_in_warehouse,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      productName: row.product_name || null
    }));
    
    res.status(200).json(batches);
  } catch (error) {
    console.error("Error fetching product batches for inventory count:", error);
    res.status(500).json({ 
      error: "Failed to fetch product batches for inventory count", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST /api/inventory-counts/items/:id/split - Bestand zwischen Chargen aufteilen
router.post('/items/:itemId/split', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { originalBatchId, targetBatchId, splitQuantity } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ error: "Inventory Count Item ID is required" });
    }
    
    if (splitQuantity === null || splitQuantity === undefined || splitQuantity <= 0) {
      return res.status(400).json({ error: "Valid split quantity is required" });
    }
    
    if (!targetBatchId) {
      return res.status(400).json({ error: "Target batch ID is required" });
    }
    
    // Holen Sie das Zählelement
    const inventoryItemResult = await rawDb.query(
      `SELECT * FROM inventory_count_items_v3 WHERE id = $1`,
      [itemId]
    );
    
    if (!inventoryItemResult.rows || inventoryItemResult.rows.length === 0) {
      return res.status(404).json({ error: "Inventory Count Item not found" });
    }
    
    const inventoryItem = inventoryItemResult.rows[0];
    const currentQuantity = inventoryItem.actual_quantity || 0;
    
    if (splitQuantity >= currentQuantity) {
      return res.status(400).json({ 
        error: "Split quantity must be less than the current quantity",
        currentQuantity,
        splitQuantity
      });
    }
    
    // Überprüfen Sie, ob die Ziel-Charge existiert
    const targetBatchResult = await rawDb.query(
      `SELECT * FROM product_batches WHERE id = $1`,
      [targetBatchId]
    );
    
    if (!targetBatchResult.rows || targetBatchResult.rows.length === 0) {
      return res.status(404).json({ error: "Target batch not found" });
    }
    
    // Aktualisieren Sie das bestehende Zählelement
    await rawDb.query(
      `UPDATE inventory_count_items_v3 
       SET actual_quantity = actual_quantity - $1, 
           difference = (actual_quantity - $1) - expected_quantity,
           updated_at = NOW()
       WHERE id = $2`,
      [splitQuantity, itemId]
    );
    
    // Erstellen Sie ein neues Zählelement für die Ziel-Charge
    const createItemResult = await rawDb.query(
      `INSERT INTO inventory_count_items_v3
       (inventory_count_id, product_id, expected_quantity, actual_quantity, 
        difference, status, batch_id, created_at, updated_at)
       VALUES ($1, $2, 0, $3, $3, 'counted', $4, NOW(), NOW())
       RETURNING *`,
      [
        inventoryItem.inventory_count_id,
        inventoryItem.product_id,
        splitQuantity,
        targetBatchId
      ]
    );
    
    if (!createItemResult.rows || createItemResult.rows.length === 0) {
      // Fehler beim Erstellen des neuen Elements - Zurückrollen der Änderung
      await rawDb.query(
        `UPDATE inventory_count_items_v3 
         SET actual_quantity = $1, 
             difference = $1 - expected_quantity,
             updated_at = NOW()
         WHERE id = $2`,
        [currentQuantity, itemId]
      );
      
      return res.status(500).json({ error: "Failed to create new inventory count item" });
    }
    
    res.status(200).json({
      originalItem: {
        id: itemId,
        quantity: currentQuantity - splitQuantity,
        batchId: originalBatchId
      },
      newItem: {
        id: createItemResult.rows[0].id,
        quantity: splitQuantity,
        batchId: targetBatchId
      },
      success: true
    });
  } catch (error) {
    console.error('Error splitting inventory item:', error);
    res.status(500).json({ 
      error: "Failed to split inventory item",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PATCH /api/inventory-count-items/:id/batch - Batch-Informationen für ein Inventurelement aktualisieren
router.patch('/items/:itemId/batch', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { batchId } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ error: "Inventory Count Item ID is required" });
    }
    
    // Aktualisiere das Inventurzählungselement mit der Batch-ID
    const updateResult = await rawDb.query(
      `UPDATE inventory_count_items_v3 
       SET batch_id = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [batchId, itemId]
    );
    
    if (!updateResult.rows || updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Inventory Count Item not found" });
    }
    
    // Wenn eine Batch-ID gesetzt wurde, hole weitere Informationen
    let batch = null;
    if (batchId) {
      const batchResult = await rawDb.query(
        `SELECT * FROM product_batches WHERE id = $1`, 
        [batchId]
      );
      
      if (batchResult.rows.length > 0) {
        const row = batchResult.rows[0];
        batch = {
          id: row.id,
          batchNumber: row.batch_number,
          expiryDate: row.expiry_date,
          currentQuantity: row.current_quantity,
          receivedDate: row.received_date,
          notes: row.notes
        };
      }
    }
    
    res.status(200).json({
      item: updateResult.rows[0],
      batch
    });
  } catch (error) {
    console.error("Error updating batch for inventory count item:", error);
    res.status(500).json({ 
      error: "Failed to update batch for inventory count item", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
export const inventoryCountBatchesRouter = router;