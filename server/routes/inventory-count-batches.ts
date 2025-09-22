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
        const dateObj = new Date(expiryDate);
        console.log("Parsed expiry date:", dateObj, "Valid:", !isNaN(dateObj.getTime()));
        
        // Überprüfe, ob das Datum gültig ist
        if (isNaN(dateObj.getTime())) {
          console.warn("Warning: Invalid expiry date format received:", expiryDate);
          parsedExpiryDate = null;
        } else {
          // Formatiere das Datum im Format YYYY-MM-DD für PostgreSQL
          // WICHTIG: Verwende lokale Zeit-Methoden statt toISOString() um Zeitzonenfehler zu vermeiden
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          parsedExpiryDate = `${year}-${month}-${day}`;
          console.log("MHD formatiert (lokale Zeit):", parsedExpiryDate, "von Original:", expiryDate);
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
    
    // 🔢 NEUE LOGIK: Automatische Inventur-Batch-Nummerierung
    let finalBatchNumber = batchNumber;
    if (batchNumber && batchNumber.includes('INV-') && batchNumber.endsWith('-AUTO')) {
      try {
        // Extrahiere Inventur-ID aus dem Batch-Number-Format: INV-{ID}-AUTO
        const inventoryIdMatch = batchNumber.match(/INV-(\d+)-AUTO/);
        if (inventoryIdMatch) {
          const inventoryId = parseInt(inventoryIdMatch[1]);
          console.log(`🔢 [BATCH-NUMBERING] Generiere automatische Nummer für Inventur ${inventoryId}`);
          
          // Ermittle die nächste fortlaufende Nummer für diese Inventur
          const existingBatchesResult = await rawDb.query(
            `SELECT COUNT(*) as count 
             FROM product_batches 
             WHERE batch_number LIKE $1`,
            [`INV-${inventoryId}-%`]
          );
          
          const nextNumber = (parseInt(existingBatchesResult.rows[0]?.count || 0) + 1).toString().padStart(3, '0');
          finalBatchNumber = `INV-${inventoryId}-${nextNumber}`;
          
          console.log(`✅ [BATCH-NUMBERING] Automatische Nummer generiert: ${finalBatchNumber}`);
        }
      } catch (error) {
        console.error(`❌ [BATCH-NUMBERING] Fehler bei automatischer Nummerierung:`, error);
        // Fallback: verwende ursprüngliche Batch-Nummer
      }
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
    
    // Verwende Standardwerte wenn keine Mengen angegeben wurden
    // Erlaubt auch 0 als gültige Menge für leere Batches
    const finalInitialQuantity = (initialQuantity !== undefined && initialQuantity !== null && !isNaN(initialQuantity)) 
      ? initialQuantity 
      : 0;
    const finalCurrentQuantity = (currentQuantity !== undefined && currentQuantity !== null && !isNaN(currentQuantity)) 
      ? currentQuantity 
      : finalInitialQuantity;
    console.log("Finaler Initial Quantity-Wert:", finalInitialQuantity, "Finaler Current Quantity-Wert:", finalCurrentQuantity);
    
    // Baue die SQL-Abfrage dynamisch auf basierend auf vorhandenen Spalten
    // Die quantity-Spalte wurde entfernt, jetzt verwenden wir initial_quantity und current_quantity
    let columnsString = 'product_id, warehouse_id, batch_number, expiry_date';
    let valuesString = '$1, $2, $3, $4';
    let valuesArray = [productId, warehouseId, finalBatchNumber, parsedExpiryDate]; // Verwende finale Batch-Nummer
    let valueIndex = 5;
    
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
    
    // Hinweis: Die Spalte "quantity" wurde aus der Datenbank entfernt und durch initial_quantity und current_quantity ersetzt
    
    // Füge initial_quantity und current_quantity hinzu (anstelle von quantity)
    columnsString += `, initial_quantity, current_quantity, notes`;
    valuesString += `, $${valueIndex}, $${valueIndex + 1}, $${valueIndex + 2}`;
    valuesArray.push(finalInitialQuantity, finalCurrentQuantity, notes);
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
    
    // Aktualisiere oder erstelle einen entsprechenden Eintrag in inventory_items
    try {
      // Prüfe, ob bereits ein Inventareintrag existiert
      const inventoryResult = await rawDb.query(
        `SELECT * FROM inventory_items 
         WHERE product_id = $1 AND warehouse_id = $2`,
        [batch.product_id, batch.warehouse_id]
      );
      
      if (inventoryResult.rows.length > 0) {
        // Vorhandenen Eintrag aktualisieren - Berechne den Bestand aller aktiven Chargen
        const totalQuantityResult = await rawDb.query(
          `SELECT SUM(current_quantity) as total_quantity 
           FROM product_batches 
           WHERE product_id = $1 
           AND warehouse_id = $2 
           AND status = 'active'`,
          [batch.product_id, batch.warehouse_id]
        );
        
        const totalQuantity = totalQuantityResult.rows[0].total_quantity || 0;
        
        // Aktualisiere den inventory_items Eintrag
        await rawDb.query(
          `UPDATE inventory_items 
           SET quantity = $1, 
               updated_at = NOW() 
           WHERE product_id = $2 AND warehouse_id = $3`,
          [totalQuantity, batch.product_id, batch.warehouse_id]
        );
        
        console.log(`Inventarbestand für Produkt ${batch.product_id} im Lager ${batch.warehouse_id} auf ${totalQuantity} aktualisiert`);
      } else {
        // Neuen Eintrag erstellen
        await rawDb.query(
          `INSERT INTO inventory_items 
           (product_id, warehouse_id, quantity, min_quantity, status, last_count_date, created_at, updated_at)
           VALUES ($1, $2, $3, 5, 'active', NOW(), NOW(), NOW())`,
          [batch.product_id, batch.warehouse_id, batch.current_quantity]
        );
        
        console.log(`Neuer Inventarbestand für Produkt ${batch.product_id} im Lager ${batch.warehouse_id} mit Menge ${batch.current_quantity} erstellt`);
      }
    } catch (inventoryError) {
      console.error("Fehler bei der Aktualisierung des Lagerbestands:", inventoryError);
      // Wir geben trotzdem die erfolgreich erstellte Charge zurück
    }
    
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

// GET /api/inventory-batches/product/:productId/warehouse/:warehouseId - Verfügbare Batches für ein Produkt in einem Lager abrufen
router.get('/product/:productId/warehouse/:warehouseId', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.productId);
    const warehouseId = parseInt(req.params.warehouseId);
    const excludeExpired = req.query.excludeExpired !== 'false'; // Default true - abgelaufene Batches ausblenden
    
    if (!productId || isNaN(productId) || !warehouseId || isNaN(warehouseId)) {
      return res.status(400).json({ error: "Valid Product ID and Warehouse ID are required" });
    }
    
    // Dynamische WHERE clause basierend auf excludeExpired Parameter
    const expiredCondition = excludeExpired 
      ? `AND (pb.expiry_date IS NULL OR pb.expiry_date > CURRENT_DATE)` 
      : '';
    
    // Hole Batches für das Produkt im spezifizierten Lager
    const query = `
      SELECT 
        pb.*,
        p.product_name as product_name,
        -- Expiry status calculation für FIFO sorting
        CASE 
          WHEN pb.expiry_date IS NULL THEN 'no_expiry'
          WHEN pb.expiry_date <= CURRENT_DATE THEN 'expired'
          WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'warning'
          WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'attention'
          ELSE 'good'
        END as expiry_status,
        -- Days until expiry für Frontend-Anzeige
        CASE 
          WHEN pb.expiry_date IS NULL THEN NULL
          ELSE pb.expiry_date - CURRENT_DATE
        END as days_until_expiry
      FROM 
        product_batches pb
      JOIN 
        products p ON pb.product_id = p.id
      WHERE 
        pb.product_id = $1
        AND pb.warehouse_id = $2
        AND pb.status = 'active'
        AND pb.current_quantity > 0
        ${expiredCondition}
      ORDER BY 
        pb.expiry_date ASC NULLS LAST, pb.created_at ASC
    `;
    
    const batchesResult = await rawDb.query(query, [productId, warehouseId]);
    
    // Formatiere das Ergebnis mit erweiterten Expiry-Informationen
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
      expiryStatus: row.expiry_status, // expired, warning, attention, good, no_expiry
      daysUntilExpiry: row.days_until_expiry, // Tage bis Ablauf (kann negativ sein)
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      productName: row.product_name || null
    }));
    
    console.log(`Found ${batches.length} batches for product ${productId} in warehouse ${warehouseId} (excludeExpired: ${excludeExpired})`);
    res.status(200).json(batches);
  } catch (error) {
    console.error("Error fetching product batches:", error);
    res.status(500).json({ 
      error: "Failed to fetch product batches", 
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

// PATCH /api/inventory-counts/product-batches/:batchId - Bestehende Charge bearbeiten
router.patch('/product-batches/:batchId', async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.batchId);
    const { 
      batchNumber, 
      expiryDate,
      currentQuantity,
      initialQuantity, 
      notes,
      locationInWarehouse 
    } = req.body;
    
    console.log(`PATCH /api/inventory-counts/product-batches/${batchId} request:`, JSON.stringify(req.body, null, 2));
    
    if (!batchId) {
      return res.status(400).json({ error: "Batch ID is required" });
    }
    
    // Überprüfe, ob die Charge existiert
    const existingBatchResult = await rawDb.query(
      `SELECT * FROM product_batches WHERE id = $1`,
      [batchId]
    );
    
    if (existingBatchResult.rows.length === 0) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    const existingBatch = existingBatchResult.rows[0];
    
    // Baue die Update-Klauseln dynamisch auf
    const updateParts = [];
    const updateValues = [];
    let valueIndex = 1;
    
    if (batchNumber !== undefined) {
      updateParts.push(`batch_number = $${valueIndex}`);
      updateValues.push(batchNumber);
      valueIndex++;
    }
    
    if (expiryDate !== undefined) {
      updateParts.push(`expiry_date = $${valueIndex}`);
      updateValues.push(expiryDate);
      valueIndex++;
    }
    
    if (currentQuantity !== undefined) {
      updateParts.push(`current_quantity = $${valueIndex}`);
      updateValues.push(currentQuantity);
      valueIndex++;
    }
    
    if (initialQuantity !== undefined) {
      updateParts.push(`initial_quantity = $${valueIndex}`);
      updateValues.push(initialQuantity);
      valueIndex++;
    }
    
    if (notes !== undefined) {
      updateParts.push(`notes = $${valueIndex}`);
      updateValues.push(notes);
      valueIndex++;
    }
    
    if (locationInWarehouse !== undefined) {
      updateParts.push(`location_in_warehouse = $${valueIndex}`);
      updateValues.push(locationInWarehouse);
      valueIndex++;
    }
    
    // Immer updated_at aktualisieren
    updateParts.push('updated_at = NOW()');
    
    if (updateParts.length === 1) { // Nur updated_at
      return res.status(400).json({ error: "No fields to update" });
    }
    
    // Update-Query ausführen
    updateValues.push(batchId); // Für WHERE-Klausel
    const updateQuery = `
      UPDATE product_batches 
      SET ${updateParts.join(', ')} 
      WHERE id = $${valueIndex} 
      RETURNING *
    `;
    
    console.log("Update Query:", updateQuery);
    console.log("Update Values:", updateValues);
    
    const updateResult = await rawDb.query(updateQuery, updateValues);
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Batch not found or could not be updated" });
    }
    
    const updatedBatch = updateResult.rows[0];
    
    // Aktualisiere den Gesamtbestand in inventory_items wenn sich die Menge geändert hat
    if (currentQuantity !== undefined) {
      try {
        const totalQuantityResult = await rawDb.query(
          `SELECT SUM(current_quantity) as total_quantity 
           FROM product_batches 
           WHERE product_id = $1 AND warehouse_id = $2 AND status = 'active'`,
          [existingBatch.product_id, existingBatch.warehouse_id]
        );
        
        const totalQuantity = totalQuantityResult.rows[0].total_quantity || 0;
        
        await rawDb.query(
          `UPDATE inventory_items 
           SET quantity = $1, updated_at = NOW() 
           WHERE product_id = $2 AND warehouse_id = $3`,
          [totalQuantity, existingBatch.product_id, existingBatch.warehouse_id]
        );
        
        console.log(`Lagerbestand für Produkt ${existingBatch.product_id} auf ${totalQuantity} aktualisiert`);
      } catch (inventoryError) {
        console.error("Fehler bei der Lagerbestand-Aktualisierung:", inventoryError);
      }
    }
    
    // Formatiere das Ergebnis
    const formattedBatch = {
      id: updatedBatch.id,
      productId: updatedBatch.product_id,
      warehouseId: updatedBatch.warehouse_id,
      batchNumber: updatedBatch.batch_number,
      expiryDate: updatedBatch.expiry_date,
      initialQuantity: updatedBatch.initial_quantity,
      currentQuantity: updatedBatch.current_quantity,
      receivedDate: updatedBatch.received_date,
      locationInWarehouse: updatedBatch.location_in_warehouse,
      notes: updatedBatch.notes,
      status: updatedBatch.status,
      createdAt: updatedBatch.created_at,
      updatedAt: updatedBatch.updated_at
    };
    
    console.log("Charge erfolgreich aktualisiert:", formattedBatch.id);
    res.status(200).json(formattedBatch);
  } catch (error) {
    console.error("Error updating product batch:", error);
    res.status(500).json({ 
      error: "Failed to update product batch", 
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
      `SELECT * FROM inventory_count_items WHERE id = $1`,
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
      `UPDATE inventory_count_items 
       SET actual_quantity = actual_quantity - $1, 
           difference = (actual_quantity - $1) - expected_quantity,
           updated_at = NOW()
       WHERE id = $2`,
      [splitQuantity, itemId]
    );
    
    // Erstellen Sie ein neues Zählelement für die Ziel-Charge
    const createItemResult = await rawDb.query(
      `INSERT INTO inventory_count_items
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
        `UPDATE inventory_count_items 
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

// Sowohl PATCH als auch POST erlauben für /api/inventory-counts/items/:id/batch
// POST wird vom Frontend beim Erstellen einer neuen Charge verwendet
router.post('/items/:itemId/batch', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { batchId } = req.body;
    
    console.log(`POST /api/inventory-counts/items/${itemId}/batch`, { batchId });
    
    if (!itemId) {
      return res.status(400).json({ error: "Inventory Count Item ID is required" });
    }
    
    // Aktualisiere das Inventurzählungselement mit der Batch-ID
    const updateResult = await rawDb.query(
      `UPDATE inventory_count_items 
       SET batch_id = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [batchId, itemId]
    );
    
    if (!updateResult.rows || updateResult.rows.length === 0) {
      console.error(`Item nicht gefunden: ${itemId}`);
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
        console.log(`Charge gefunden: ID=${row.id}, Nummer=${row.batch_number}, MHD=${row.expiry_date}`);
      } else {
        console.error(`Charge nicht gefunden: ${batchId}`);
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

// PATCH /api/inventory-count-items/:id/batch - Batch-Informationen für ein Inventurelement aktualisieren
router.patch('/items/:itemId/batch', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { batchId } = req.body;
    
    console.log(`PATCH /api/inventory-counts/items/${itemId}/batch`, { batchId });
    
    if (!itemId) {
      return res.status(400).json({ error: "Inventory Count Item ID is required" });
    }
    
    // Aktualisiere das Inventurzählungselement mit der Batch-ID
    const updateResult = await rawDb.query(
      `UPDATE inventory_count_items 
       SET batch_id = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [batchId, itemId]
    );
    
    if (!updateResult.rows || updateResult.rows.length === 0) {
      console.error(`Item nicht gefunden: ${itemId}`);
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
        console.log(`Charge gefunden: ID=${row.id}, Nummer=${row.batch_number}, MHD=${row.expiry_date}`);
        
        // Nach der Aktualisierung der Batch-ID sollten wir den Lagerbestand synchronisieren
        try {
          // Hole die Produkt-ID und Lager-ID aus dem Inventurzählungselement
          const inventoryCountItem = updateResult.rows[0];
          const productId = inventoryCountItem.product_id;
          
          // Hole das Lager aus der Inventur
          const inventoryCountResult = await rawDb.query(
            `SELECT warehouse_id FROM inventory_counts WHERE id = $1`,
            [inventoryCountItem.inventory_count_id]
          );
          
          if (inventoryCountResult.rows.length > 0) {
            const warehouseId = inventoryCountResult.rows[0].warehouse_id;
            
            // Berechne den Gesamtbestand aller aktiven Chargen dieses Produkts im Lager
            const totalQuantityResult = await rawDb.query(
              `SELECT SUM(current_quantity) as total_quantity 
               FROM product_batches 
               WHERE product_id = $1 
               AND warehouse_id = $2 
               AND status = 'active'`,
              [productId, warehouseId]
            );
            
            const totalQuantity = totalQuantityResult.rows[0].total_quantity || 0;
            
            // Überprüfe, ob ein Inventareintrag existiert
            const inventoryItemResult = await rawDb.query(
              `SELECT * FROM inventory_items 
               WHERE product_id = $1 AND warehouse_id = $2`,
              [productId, warehouseId]
            );
            
            if (inventoryItemResult.rows.length > 0) {
              // Aktualisiere den vorhandenen Eintrag
              await rawDb.query(
                `UPDATE inventory_items 
                 SET quantity = $1, 
                     updated_at = NOW() 
                 WHERE product_id = $2 AND warehouse_id = $3`,
                [totalQuantity, productId, warehouseId]
              );
              
              console.log(`Inventarbestand für Produkt ${productId} im Lager ${warehouseId} auf ${totalQuantity} aktualisiert`);
            } else {
              // Erstelle einen neuen Inventareintrag
              await rawDb.query(
                `INSERT INTO inventory_items 
                 (product_id, warehouse_id, quantity, min_quantity, status, last_count_date, created_at, updated_at)
                 VALUES ($1, $2, $3, 5, 'active', NOW(), NOW(), NOW())`,
                [productId, warehouseId, totalQuantity]
              );
              
              console.log(`Neuer Inventarbestand für Produkt ${productId} im Lager ${warehouseId} mit Menge ${totalQuantity} erstellt`);
            }
          }
        } catch (inventoryError) {
          console.error("Fehler bei der Aktualisierung des Lagerbestands nach Batch-Änderung:", inventoryError);
          // Wir fahren trotzdem fort, da die eigentliche Batch-Aktualisierung erfolgreich war
        }
      } else {
        console.error(`Charge nicht gefunden: ${batchId}`);
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

// GET /api/inventory-counts/warehouse/:warehouseId/products - Hole alle Batches für ein Lager
router.get('/warehouse/:warehouseId/products', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (!warehouseId) {
      return res.status(400).json({ error: "Warehouse ID is required" });
    }
    
    console.log(`[BATCHES API] Fetching batches for warehouse ${warehouseId}`);
    
    // Hole alle aktiven Batches für das Lager
    const query = `
      SELECT 
        pb.*,
        p.product_name as product_name
      FROM 
        product_batches pb
      JOIN 
        products p ON pb.product_id = p.id
      WHERE 
        pb.warehouse_id = $1
        AND pb.status = 'active'
      ORDER BY 
        p.product_name ASC,
        pb.expiry_date ASC NULLS LAST
    `;
    
    const result = await rawDb.query(query, [warehouseId]);
    
    // Formatiere das Ergebnis
    const batches = result.rows.map((row: any) => ({
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
      productName: row.product_name
    }));
    
    console.log(`[BATCHES API] Found ${batches.length} batches for warehouse ${warehouseId}`);
    
    res.status(200).json(batches);
  } catch (error) {
    console.error(`[BATCHES API] Error fetching batches for warehouse ${req.params.warehouseId}:`, error);
    res.status(500).json({ 
      error: "Failed to fetch batches for warehouse", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// DELETE /api/inventory-counts/product-batches/:batchId - Bestehende Charge löschen
router.delete('/product-batches/:batchId', async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.batchId);
    
    console.log(`DELETE /api/inventory-counts/product-batches/${batchId} request`);
    
    if (!batchId) {
      return res.status(400).json({ error: "Batch ID is required" });
    }
    
    // Überprüfe, ob die Charge existiert
    const existingBatchResult = await rawDb.query(
      `SELECT * FROM product_batches WHERE id = $1`,
      [batchId]
    );
    
    if (existingBatchResult.rows.length === 0) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    const existingBatch = existingBatchResult.rows[0];
    
    // Lösche die Charge
    const deleteResult = await rawDb.query(
      `DELETE FROM product_batches WHERE id = $1 RETURNING *`,
      [batchId]
    );
    
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: "Batch not found or could not be deleted" });
    }
    
    // Aktualisiere den Gesamtbestand in inventory_items nach dem Löschen
    try {
      const totalQuantityResult = await rawDb.query(
        `SELECT SUM(current_quantity) as total_quantity 
         FROM product_batches 
         WHERE product_id = $1 AND warehouse_id = $2 AND status = 'active'`,
        [existingBatch.product_id, existingBatch.warehouse_id]
      );
      
      const totalQuantity = totalQuantityResult.rows[0].total_quantity || 0;
      
      await rawDb.query(
        `UPDATE inventory_items 
         SET quantity = $1, updated_at = NOW() 
         WHERE product_id = $2 AND warehouse_id = $3`,
        [totalQuantity, existingBatch.product_id, existingBatch.warehouse_id]
      );
      
      console.log(`Lagerbestand für Produkt ${existingBatch.product_id} auf ${totalQuantity} aktualisiert nach Batch-Löschung`);
    } catch (inventoryError) {
      console.error("Fehler bei der Lagerbestand-Aktualisierung nach Batch-Löschung:", inventoryError);
    }
    
    console.log("Charge erfolgreich gelöscht:", batchId);
    res.status(200).json({ 
      message: "Batch successfully deleted", 
      deletedBatchId: batchId 
    });
  } catch (error) {
    console.error("Error deleting product batch:", error);
    res.status(500).json({ 
      error: "Failed to delete product batch", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
export const inventoryCountBatchesRouter = router;