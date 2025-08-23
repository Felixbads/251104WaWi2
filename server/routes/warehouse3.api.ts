import express from "express";
import { z } from "zod";
import { db, pool } from "../db";
import { eq, and, like, gt, lt, gte, lte, desc, asc, sql, isNull, isNotNull, not } from "drizzle-orm";
import { 
  warehouses, 
  insertWarehouseSchema,
  productInventory,
  inventoryMovements,
  productBatches,
  inventoryCounts,
  machineWarehouseAssignments,
  refillTrackings,
} from "../../shared/warehouse3.schema";

const router = express.Router();

// ---- Hilfsfunktionen ----

// Fehlerbehandlung für Validierungsfehler
const handleValidationError = (error: z.ZodError, res: express.Response) => {
  return res.status(400).json({
    success: false,
    message: "Validierungsfehler",
    errors: error.errors,
  });
};

// Fehlerbehandlung für Serverfehler
const handleServerError = (error: any, res: express.Response) => {
  console.error("[Warehouse3 API Error]", error);
  return res.status(500).json({
    success: false,
    message: "Ein Serverfehler ist aufgetreten",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
};

// ---- WAREHOUSE ROUTES ----

// GET /api/warehouse3/warehouses - Alle Lager abrufen
router.get("/warehouses", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM warehouses ORDER BY name`);
    return res.json(result.rows);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// POST /api/warehouse3/warehouses - Neues Lager erstellen
router.post("/warehouses", async (req, res) => {
  try {
    // Daten validieren
    const validatedData = insertWarehouseSchema.parse(req.body);

    // Neues Lager erstellen
    const [newWarehouse] = await db.insert(warehouses).values({
      ...validatedData,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return res.status(201).json({
      success: true,
      message: "Lager erfolgreich erstellt",
      warehouse: newWarehouse,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// GET /api/warehouse3/warehouses/:id - Einzelnes Lager abrufen
router.get("/warehouses/:id", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }

    const result = await pool.query(`SELECT * FROM warehouses WHERE id = $1 LIMIT 1`, [warehouseId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// PATCH /api/warehouse3/warehouses/:id - Lager aktualisieren
router.patch("/warehouses/:id", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }

    // Prüfen, ob das Lager existiert
    const existingWarehouseResult = await pool.query(`SELECT * FROM warehouses WHERE id = $1 LIMIT 1`, [warehouseId]);
    if (existingWarehouseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }

    // Daten validieren
    const validatedData = insertWarehouseSchema.partial().parse(req.body);

    // SQL-Update-Anweisung und Parameter erstellen
    const updateFields = [];
    const updateValues: any[] = [warehouseId]; // Erste Parameter-Position ist für die ID
    let paramPosition = 2; // Beginne mit Position 2 für die Update-Werte

    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== undefined) {
        updateFields.push(`${snakeCaseKey(key)} = $${paramPosition}`);
        updateValues.push(value as any);
        paramPosition++;
      }
    }

    // Immer updatedAt aktualisieren
    updateFields.push(`updated_at = $${paramPosition}`);
    updateValues.push(new Date());

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: "Keine Felder zum Aktualisieren angegeben" });
    }

    // SQL-Abfrage ausführen
    const updateResult = await pool.query(
      `UPDATE warehouses SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
      updateValues
    );

    const updatedWarehouse = updateResult.rows[0];

    return res.json({
      success: true,
      message: "Lager erfolgreich aktualisiert",
      warehouse: updatedWarehouse,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Hilfsfunktion zur Umwandlung von camelCase zu snake_case
function snakeCaseKey(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// DELETE /api/warehouse3/warehouses/:id - Lager löschen
router.delete("/warehouses/:id", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }

    // Prüfen, ob das Lager existiert
    const existingWarehouseResult = await pool.query(`SELECT * FROM warehouses WHERE id = $1 LIMIT 1`, [warehouseId]);
    if (existingWarehouseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }

    // Prüfen, ob Abhängigkeiten bestehen (Bestand, Bewegungen, etc.)
    const dependencyChecks = [
      {
        table: "machine_warehouse_assignments",
        field: "warehouse_id", 
        name: "Maschinen-Zuordnungen",
        query: `SELECT COUNT(*) as count FROM machine_warehouse_assignments WHERE warehouse_id = $1`
      }
    ];

    const dependencies = [];
    for (const check of dependencyChecks) {
      const result = await pool.query(check.query, [warehouseId]);
      const count = parseInt(result.rows[0].count);
      if (count > 0) {
        dependencies.push({
          name: check.name,
          count: count
        });
      }
    }

    // Falls Abhängigkeiten existieren, Löschung blockieren
    if (dependencies.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Das Lager kann nicht gelöscht werden, da abhängige Datensätze existieren.",
        dependencies: dependencies,
        hint: "Entfernen Sie zuerst alle abhängigen Datensätze oder verschieben Sie sie in ein anderes Lager."
      });
    }

    // Lager löschen (nur wenn keine Abhängigkeiten existieren)
    await pool.query(`DELETE FROM warehouses WHERE id = $1`, [warehouseId]);

    return res.json({
      success: true,
      message: "Lager erfolgreich gelöscht",
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// GET /api/warehouse3/warehouses/:id/stats - Statistiken eines Lagers abrufen
router.get("/warehouses/:id/stats", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }

    // Produkte im Lager zählen
    const productCountResult = await pool.query(
      `SELECT COUNT(*) FROM product_inventory WHERE warehouse_id = $1`,
      [warehouseId]
    );
    const productCount = parseInt(productCountResult.rows[0]?.count) || 0;

    // Produkte mit niedrigem Bestand zählen
    const lowStockCountResult = await pool.query(
      `SELECT COUNT(*) FROM inventory_items 
       WHERE warehouse_id = $1 AND quantity < min_quantity`,
      [warehouseId]
    );
    const lowStockCount = parseInt(lowStockCountResult.rows[0]?.count) || 0;

    // Zugewiesene Automaten zählen
    const machineCountResult = await pool.query(
      `SELECT COUNT(*) FROM machine_warehouse_assignments 
       WHERE warehouse_id = $1`,
      [warehouseId]
    );
    const machineCount = parseInt(machineCountResult.rows[0]?.count) || 0;

    // Datum der letzten Inventur
    const lastInventoryResult = await pool.query(
      `SELECT end_date FROM inventory_counts 
       WHERE warehouse_id = $1 
       ORDER BY end_date DESC 
       LIMIT 1`,
      [warehouseId]
    );
    const lastInventoryDate = lastInventoryResult.rows.length > 0 ? lastInventoryResult.rows[0].end_date : null;

    // Bewegungen der letzten 30 Tage zählen
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const movementCount30DaysResult = await pool.query(
      `SELECT COUNT(*) FROM inventory_movements 
       WHERE ((source_type = 'warehouse' AND source_id = $1) 
              OR (destination_type = 'warehouse' AND destination_id = $1))
             AND performed_at >= $2`,
      [warehouseId, thirtyDaysAgo]
    );
    const movementCount30Days = parseInt(movementCount30DaysResult.rows[0]?.count) || 0;

    // Statistiken zusammenstellen
    const stats = {
      productCount,
      lowStockCount,
      machineCount,
      lastInventoryDate,
      movementCount30Days,
    };

    return res.json(stats);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// ---- INVENTORY ROUTES ----

// GET /api/warehouse3/warehouses/:id/inventory - Lagerbestand abrufen
router.get("/warehouses/:id/inventory", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }

    // Abfrageparameter für Paginierung und Filterung
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search as string || '';
    const category = req.query.category as string || null;
    const sortBy = req.query.sortBy as string || 'productName';
    const sortOrder = req.query.sortOrder as string === 'desc' ? 'desc' : 'asc';
    const lowStock = req.query.lowStock === 'true';

    // Basis-SQL erstellen - mit Produktinformationen
    let sqlQuery = `
      SELECT 
        pi.id,
        pi.product_id as "productId",
        pi.quantity as "currentStock",
        pi.min_quantity as "minimumStock",
        pi.location_in_warehouse as "location",
        pi.last_count_date as "lastCountDate",
        COALESCE(p.product_name, 'Unbekanntes Produkt') as "productName",
        p.sku,
        COALESCE(p.category, 'Unkategorisiert') as "category"
      FROM inventory_items pi
      LEFT JOIN products p ON pi.product_id = p.id
      WHERE pi.warehouse_id = $1
    `;

    const queryParams = [warehouseId];
    let paramIndex = 2;

    // Suchfilter anwenden
    if (search) {
      // TODO: Hier müsste man eigentlich mit der products-Tabelle joinen
      // sqlQuery += ` AND p.name ILIKE $${paramIndex}`;
      // queryParams.push(`%${search}%`);
      // paramIndex++;
    }

    // Kategoriefilter anwenden
    if (category) {
      // TODO: Hier müsste man eigentlich mit der products-Tabelle joinen
      // sqlQuery += ` AND p.category = $${paramIndex}`;
      // queryParams.push(category);
      // paramIndex++;
    }

    // Filter für niedrigen Bestand
    if (lowStock) {
      sqlQuery += ` AND pi.quantity < pi.min_quantity`;
    }

    // Sortierung anwenden
    if (sortBy === 'currentStock') {
      sqlQuery += ` ORDER BY pi.quantity ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (sortBy === 'location') {
      sqlQuery += ` ORDER BY pi.location_in_warehouse ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (sortBy === 'expiryDate') {
      // Für ein Feld, das wir nicht haben, nutzen wir einen Default
      sqlQuery += ` ORDER BY pi.id ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      // Default: nach ID sortieren
      sqlQuery += ` ORDER BY pi.id ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    }

    // Gesamtanzahl der Einträge ermitteln
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM inventory_items WHERE warehouse_id = $1`,
      [warehouseId]
    );
    const total = parseInt(countResult.rows[0]?.count) || 0;

    // Limit und Offset für Paginierung anwenden
    sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit);
    queryParams.push(offset);

    // Abfrage ausführen
    const result = await pool.query(sqlQuery, queryParams);
    const items = result.rows;
    
    // Für jedes Inventar-Item die Batches abrufen
    for (const item of items) {
      const batchesResult = await pool.query(
        `SELECT 
          id,
          batch_number as "batchNumber",
          expiry_date as "expiryDate",
          quantity as "currentQuantity",
          incoming_date as "receivedDate",
          supplier_batch_number as "supplierRef",
          notes,
          CASE 
            WHEN expiry_date IS NOT NULL THEN 
              DATE_PART('day', expiry_date::timestamp - CURRENT_DATE)
            ELSE NULL
          END as "daysUntilExpiry"
        FROM inventory_batches
        WHERE warehouse_id = $1 AND product_id = $2 AND quantity > 0 AND status = 'active'
        ORDER BY expiry_date ASC NULLS LAST`,
        [warehouseId, item.productId]
      );
      item.batches = batchesResult.rows;
    }

    // Ergebnis zurückgeben
    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// ---- MOVEMENTS ROUTES ----

// GET /api/warehouse3/warehouses/:id/movements - Warenbewegungen eines Lagers abrufen
router.get("/warehouses/:id/movements", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }

    // Abfrageparameter für Paginierung und Filterung
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search as string || '';
    const movementType = req.query.movementType as string || null;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : null;
    const sortBy = req.query.sortBy as string || 'performedAt';
    const sortOrder = req.query.sortOrder as string === 'asc' ? 'asc' : 'desc';

    // Basis-SQL erstellen - mit Produktinformationen und Batch-Details
    let sqlQuery = `
      SELECT 
        im.id,
        im.product_id as "productId",
        im.quantity,
        im.movement_type as "movementType",
        im.source_warehouse_id as "sourceWarehouseId",
        im.destination_warehouse_id as "destinationWarehouseId",
        im.direction,
        im.status,
        im.performed_at as "performedAt",
        im.created_at as "createdAt",
        im.previous_stock as "previousStock",
        im.current_stock as "currentStock",
        im.batch_id as "batchId",
        im.reference_type as "referenceType",
        im.reference_id as "referenceId", 
        im.notes,
        COALESCE(p.product_name, 'Unbekanntes Produkt') as "productName",
        p.sku as "productSku",
        pb.batch_number as "batchNumber",
        pb.expiry_date as "expiryDate",
        sw.name as "sourceWarehouseName",
        dw.name as "destinationWarehouseName",
        im.machine_id as "machineId",
        u.username as "performedByName",
        m.machine_name as "machineName"
      FROM inventory_movements im
      LEFT JOIN products p ON im.product_id = p.id
      LEFT JOIN inventory_batches pb ON im.batch_id = pb.id
      LEFT JOIN warehouses sw ON im.source_warehouse_id = sw.id
      LEFT JOIN warehouses dw ON im.destination_warehouse_id = dw.id
      LEFT JOIN users u ON im.performed_by = u.id
      LEFT JOIN machines m ON im.machine_id = m.id
      WHERE (im.source_warehouse_id = $1 OR im.destination_warehouse_id = $1)
      AND im.performed_at >= CURRENT_DATE - INTERVAL '7 days'
    `;

    const queryParams: any[] = [warehouseId];
    let paramIndex = 2;

    // Suchfilter anwenden
    if (search) {
      // TODO: Hier müsste man eigentlich mit der products-Tabelle joinen für Produktnamen
      // sqlQuery += ` AND p.name ILIKE $${paramIndex}`;
      // queryParams.push(`%${search}%`);
      // paramIndex++;
    }

    // Bewegungstyp-Filter anwenden
    if (movementType) {
      sqlQuery += ` AND im.movement_type = $${paramIndex}`;
      queryParams.push(movementType as any);
      paramIndex++;
    }

    // Datumsfilter anwenden
    if (startDate) {
      sqlQuery += ` AND im.performed_at >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      // Setze das Ende des Tages für den Enddate-Filter
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      sqlQuery += ` AND im.performed_at <= $${paramIndex}`;
      queryParams.push(endOfDay);
      paramIndex++;
    }

    // Sortierung anwenden
    if (sortBy === 'performedAt') {
      sqlQuery += ` ORDER BY im.performed_at ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (sortBy === 'quantity') {
      sqlQuery += ` ORDER BY im.quantity ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (sortBy === 'movementType') {
      sqlQuery += ` ORDER BY im.movement_type ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      // Default: nach Datum sortieren
      sqlQuery += ` ORDER BY im.performed_at ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    }

    // Gesamtanzahl der Einträge ermitteln
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM inventory_movements im
       WHERE (im.source_warehouse_id = $1 OR im.destination_warehouse_id = $1)`,
      [warehouseId]
    );
    const total = parseInt(countResult.rows[0]?.count) || 0;

    // Limit und Offset für Paginierung anwenden
    sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit);
    queryParams.push(offset);

    // Abfrage ausführen
    const result = await pool.query(sqlQuery, queryParams);
    const items = result.rows;

    // Ergebnis zurückgeben
    return res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// POST /api/warehouse3/warehouses/:id/batches - Neue Charge erstellen
router.post("/warehouses/:id/batches", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    const { productId, batchNumber, expiryDate, quantity, supplierRef, notes } = req.body;
    
    // Validierung
    if (!productId || !batchNumber || !quantity) {
      return res.status(400).json({ 
        success: false, 
        message: "Produkt-ID, Chargennummer und Menge sind erforderlich" 
      });
    }
    
    // Prüfe ob Charge bereits existiert
    const existingBatch = await pool.query(
      `SELECT id FROM inventory_batches 
       WHERE warehouse_id = $1 AND product_id = $2 AND batch_number = $3`,
      [warehouseId, productId, batchNumber]
    );
    
    if (existingBatch.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Eine Charge mit dieser Nummer existiert bereits für dieses Produkt" 
      });
    }
    
    // Erstelle neue Charge
    const insertResult = await pool.query(
      `INSERT INTO inventory_batches 
       (warehouse_id, product_id, batch_number, expiry_date, quantity, 
        incoming_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [warehouseId, productId, batchNumber, expiryDate, quantity]
    );
    
    const newBatch = insertResult.rows[0];
    
    // Aktualisiere Lagerbestand
    const inventoryCheck = await pool.query(
      `SELECT id, quantity as current_stock FROM inventory_items 
       WHERE warehouse_id = $1 AND product_id = $2`,
      [warehouseId, productId]
    );
    
    let previousStock = 0;
    let currentStock = quantity;
    
    if (inventoryCheck.rows.length > 0) {
      // Aktualisiere existierenden Bestand
      previousStock = inventoryCheck.rows[0].current_stock || 0;
      currentStock = previousStock + quantity;
      
      await pool.query(
        `UPDATE inventory_items 
         SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE warehouse_id = $2 AND product_id = $3`,
        [currentStock, warehouseId, productId]
      );
    } else {
      // Erstelle neuen Inventareintrag
      await pool.query(
        `INSERT INTO inventory_items 
         (warehouse_id, product_id, quantity, min_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [warehouseId, productId, quantity]
      );
    }
    
    // Erstelle Bewegungseintrag
    await pool.query(
      `INSERT INTO inventory_movements 
       (destination_warehouse_id, product_id, batch_id, quantity, 
        movement_type, reference_type, reference_id, previous_stock, current_stock, 
        status, performed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'receipt', 'order', $5, $6, $7, 
        'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [warehouseId, productId, newBatch.id, quantity, 
       `BATCH-${newBatch.id}`, previousStock, currentStock]
    );
    
    return res.status(201).json({
      success: true,
      message: "Charge erfolgreich erstellt",
      batch: newBatch
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// GET /api/warehouse3/warehouses/:id/batches - Alle Chargen eines Lagers abrufen
router.get("/warehouses/:id/batches", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    const productId = req.query.productId ? parseInt(req.query.productId as string) : null;
    
    let sqlQuery = `
      SELECT 
        pb.id,
        pb.product_id as "productId",
        pb.batch_number as "batchNumber",
        pb.expiry_date as "expiryDate",
        pb.quantity as "initialQuantity",
        pb.quantity as "currentQuantity",
        pb.incoming_date as "receivedDate",
        pb.supplier_batch_number as "supplierRef",
        pb.notes,
        p.product_name as "productName",
        p.sku as "productSku",
        CASE 
          WHEN pb.expiry_date IS NOT NULL THEN 
            DATE_PART('day', pb.expiry_date::timestamp - CURRENT_DATE)
          ELSE NULL
        END as "daysUntilExpiry"
      FROM inventory_batches pb
      LEFT JOIN products p ON pb.product_id = p.id
      WHERE pb.warehouse_id = $1 AND pb.quantity > 0
    `;
    
    const queryParams = [warehouseId];
    
    if (productId) {
      sqlQuery += ` AND pb.product_id = $2`;
      queryParams.push(productId);
    }
    
    sqlQuery += ` ORDER BY pb.expiry_date ASC NULLS LAST`;
    
    const result = await pool.query(sqlQuery, queryParams);
    
    return res.json(result.rows);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// GET /api/warehouse3/products/categories - Alle Produktkategorien abrufen
router.get("/products/categories", async (req, res) => {
  try {
    // TODO: Muss angepasst werden, wenn die eigentliche Produkttabelle verwendet wird
    // Beispiel für eine kategorische Antwort
    const categories = [
      "Getränke",
      "Snacks",
      "Süßwaren",
      "Backwaren",
      "Aufstriche",
      "Gerichte im Glas",
      "Regionale Produkte",
      "Saisonale Produkte"
    ];

    return res.json(categories);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// POST /api/warehouse3/warehouses/:id/movements - Manuelle Warenbewegung erstellen
router.post("/warehouses/:id/movements", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    const { 
      productId, 
      quantity, 
      movementType, 
      destinationWarehouseId, 
      batchId,
      reason,
      notes 
    } = req.body;
    
    // Validierung
    if (!productId || !quantity || !movementType) {
      return res.status(400).json({ 
        success: false, 
        message: "Produkt-ID, Menge und Bewegungstyp sind erforderlich" 
      });
    }
    
    // Hole aktuellen Bestand
    const inventoryResult = await pool.query(
      `SELECT quantity as current_stock FROM inventory_items 
       WHERE warehouse_id = $1 AND product_id = $2`,
      [warehouseId, productId]
    );
    
    if (inventoryResult.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Produkt nicht im Lager vorhanden" 
      });
    }
    
    const previousStock = inventoryResult.rows[0].current_stock;
    let currentStock = previousStock;
    let sourceType = 'warehouse';
    let sourceId = warehouseId;
    let destinationType = 'warehouse';
    let destinationId = null;
    let referenceType = 'MANUAL';
    
    // Je nach Bewegungstyp anpassen
    switch (movementType) {
      case 'OUT': // Manuelle Entnahme
        currentStock = previousStock - quantity;
        destinationType = 'disposal';
        break;
        
      case 'TRANSFER': // Lagerumbuchung
        if (!destinationWarehouseId) {
          return res.status(400).json({ 
            success: false, 
            message: "Ziel-Lager-ID erforderlich für Umbuchung" 
          });
        }
        currentStock = previousStock - quantity;
        destinationId = destinationWarehouseId;
        
        // Prüfe ob Ziel-Lager existiert
        const destWarehouse = await pool.query(
          `SELECT id FROM warehouses WHERE id = $1`,
          [destinationWarehouseId]
        );
        if (destWarehouse.rows.length === 0) {
          return res.status(400).json({ 
            success: false, 
            message: "Ziel-Lager nicht gefunden" 
          });
        }
        
        // Aktualisiere Bestand im Ziel-Lager
        const destInventory = await pool.query(
          `SELECT id, quantity as current_stock FROM inventory_items 
           WHERE warehouse_id = $1 AND product_id = $2`,
          [destinationWarehouseId, productId]
        );
        
        if (destInventory.rows.length > 0) {
          await pool.query(
            `UPDATE inventory_items 
             SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP 
             WHERE warehouse_id = $2 AND product_id = $3`,
            [quantity, destinationWarehouseId, productId]
          );
        } else {
          await pool.query(
            `INSERT INTO inventory_items 
             (warehouse_id, product_id, quantity, min_quantity, created_at, updated_at)
             VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [destinationWarehouseId, productId, quantity]
          );
        }
        break;
        
      case 'REFILL': // Refill-Prozess
        currentStock = previousStock - quantity;
        destinationType = 'machine';
        destinationId = 1; // Dummy Maschinen-ID
        referenceType = 'REFILL';
        break;
        
      case 'DISPOSAL': // Entsorgung
        currentStock = previousStock - quantity;
        destinationType = 'disposal';
        referenceType = 'EXPIRY';
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          message: "Ungültiger Bewegungstyp" 
        });
    }
    
    // Prüfe ob genügend Bestand vorhanden
    if (currentStock < 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Nicht genügend Bestand. Verfügbar: ${previousStock}, Angefordert: ${quantity}` 
      });
    }
    
    // Aktualisiere Bestand im Quell-Lager
    await pool.query(
      `UPDATE inventory_items 
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE warehouse_id = $2 AND product_id = $3`,
      [currentStock, warehouseId, productId]
    );
    
    // Erstelle Bewegungseintrag basierend auf Bewegungstyp
    let sourceWarehouseId = null;
    let destWarehouseId = null;
    
    if (movementType === 'TRANSFER') {
      sourceWarehouseId = warehouseId;
      destWarehouseId = destinationWarehouseId || null;
    } else if (movementType === 'REFILL') {
      sourceWarehouseId = warehouseId;
    } else if (movementType === 'DISPOSAL' || movementType === 'REMOVAL') {
      sourceWarehouseId = warehouseId;
    }
    
    const movementResult = await pool.query(
      `INSERT INTO inventory_movements 
       (source_warehouse_id, destination_warehouse_id, product_id, batch_id, 
        quantity, movement_type, reference_type, reference_id, notes, 
        previous_stock, current_stock, status, performed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 
        'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [sourceWarehouseId, destWarehouseId, productId, batchId,
       quantity, movementType, referenceType || 'manual', `MANUAL-${Date.now()}`, notes,
       previousStock, currentStock]
    );
    
    return res.status(201).json({
      success: true,
      message: "Warenbewegung erfolgreich erstellt",
      movement: movementResult.rows[0]
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

export default router;