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
    const updateValues = [warehouseId]; // Erste Parameter-Position ist für die ID
    let paramPosition = 2; // Beginne mit Position 2 für die Update-Werte

    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== undefined) {
        updateFields.push(`${snakeCaseKey(key)} = $${paramPosition}`);
        updateValues.push(value);
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
function snakeCaseKey(key) {
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
      `SELECT COUNT(*) FROM product_inventory 
       WHERE warehouse_id = $1 AND current_stock < minimum_stock`,
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

    // Basis-SQL erstellen
    let sqlQuery = `
      SELECT 
        pi.id,
        pi.product_id as "productId",
        pi.current_stock as "currentStock",
        pi.minimum_stock as "minimumStock",
        pi.location,
        pi.last_count_date as "lastCountDate",
        'Produktname' as "productName",
        'Kategorie' as "category",
        null as "batchId",
        null as "batchNumber",
        null as "expiryDate",
        null as "daysUntilExpiry"
      FROM product_inventory pi
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
      sqlQuery += ` AND pi.current_stock < pi.minimum_stock`;
    }

    // Sortierung anwenden
    if (sortBy === 'currentStock') {
      sqlQuery += ` ORDER BY pi.current_stock ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (sortBy === 'location') {
      sqlQuery += ` ORDER BY pi.location ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (sortBy === 'expiryDate') {
      // Für ein Feld, das wir nicht haben, nutzen wir einen Default
      sqlQuery += ` ORDER BY pi.id ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      // Default: nach ID sortieren
      sqlQuery += ` ORDER BY pi.id ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    }

    // Gesamtanzahl der Einträge ermitteln
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM product_inventory WHERE warehouse_id = $1`,
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

    // Basis-SQL erstellen
    let sqlQuery = `
      SELECT 
        im.id,
        im.product_id as "productId",
        im.quantity,
        im.movement_type as "movementType",
        im.source_type as "sourceType",
        im.source_id as "sourceId",
        im.destination_type as "destinationType",
        im.destination_id as "destinationId",
        im.status,
        im.performed_at as "performedAt",
        im.created_at as "createdAt",
        im.previous_stock as "previousStock",
        im.current_stock as "currentStock",
        im.batch_id as "batchId",
        im.reference_type as "referenceType",
        im.reference_id as "referenceId", 
        im.reason,
        im.notes,
        'Produktname' as "productName",
        null as "batchNumber",
        null as "machineName",
        null as "performedByName",
        null as "sourceName",
        null as "destinationName"
      FROM inventory_movements im
      WHERE ((im.source_type = 'warehouse' AND im.source_id = $1)
           OR (im.destination_type = 'warehouse' AND im.destination_id = $1))
    `;

    const queryParams = [warehouseId];
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
      queryParams.push(movementType);
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
       WHERE ((im.source_type = 'warehouse' AND im.source_id = $1)
              OR (im.destination_type = 'warehouse' AND im.destination_id = $1))`,
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

export default router;