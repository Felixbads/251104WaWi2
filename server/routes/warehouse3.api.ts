import express from "express";
import { z } from "zod";
import { db } from "../db";
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
    const allWarehouses = await db.select().from(warehouses).orderBy(warehouses.name);
    return res.json(allWarehouses);
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
    
    const warehouse = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
    
    if (warehouse.length === 0) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    return res.json(warehouse[0]);
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
    const existingWarehouse = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
    if (existingWarehouse.length === 0) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Daten validieren
    const validatedData = insertWarehouseSchema.partial().parse(req.body);
    
    // Lager aktualisieren
    const [updatedWarehouse] = await db.update(warehouses)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(warehouses.id, warehouseId))
      .returning();
    
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

// DELETE /api/warehouse3/warehouses/:id - Lager löschen
router.delete("/warehouses/:id", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Prüfen, ob das Lager existiert
    const existingWarehouse = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
    if (existingWarehouse.length === 0) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // TODO: Prüfen, ob Abhängigkeiten bestehen (Bestand, Bewegungen, etc.)
    // Hier könnte man prüfen, ob es Produkte oder Bewegungen gibt, die auf dieses Lager verweisen
    
    // Lager löschen
    await db.delete(warehouses).where(eq(warehouses.id, warehouseId));
    
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
    const productCount = await db.select({ count: sql<number>`count(*)` })
      .from(productInventory)
      .where(eq(productInventory.warehouseId, warehouseId));
      
    // Produkte mit niedrigem Bestand zählen
    const lowStockCount = await db.select({ count: sql<number>`count(*)` })
      .from(productInventory)
      .where(and(
        eq(productInventory.warehouseId, warehouseId),
        sql`${productInventory.currentStock} < ${productInventory.minimumStock}`
      ));
    
    // Zugewiesene Automaten zählen
    const machineCount = await db.select({ count: sql<number>`count(*)` })
      .from(machineWarehouseAssignments)
      .where(eq(machineWarehouseAssignments.warehouseId, warehouseId));
    
    // Datum der letzten Inventur
    const lastInventory = await db.select()
      .from(inventoryCounts)
      .where(eq(inventoryCounts.warehouseId, warehouseId))
      .orderBy(desc(inventoryCounts.endDate))
      .limit(1);
    
    // Bewegungen der letzten 30 Tage zählen
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const movementCount30Days = await db.select({ count: sql<number>`count(*)` })
      .from(inventoryMovements)
      .where(and(
        sql`${inventoryMovements.sourceType} = 'warehouse' AND ${inventoryMovements.sourceId} = ${warehouseId}`,
        sql`${inventoryMovements.performedAt} >= ${thirtyDaysAgo}`
      ))
      .orWhere(and(
        sql`${inventoryMovements.destinationType} = 'warehouse' AND ${inventoryMovements.destinationId} = ${warehouseId}`,
        sql`${inventoryMovements.performedAt} >= ${thirtyDaysAgo}`
      ));
    
    // Statistiken zusammenstellen
    const stats = {
      productCount: productCount[0]?.count || 0,
      lowStockCount: lowStockCount[0]?.count || 0,
      machineCount: machineCount[0]?.count || 0,
      lastInventoryDate: lastInventory.length > 0 ? lastInventory[0].endDate : null,
      movementCount30Days: movementCount30Days[0]?.count || 0,
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
    
    // Basisabfrage
    let query = db.select({
      id: productInventory.id,
      productId: productInventory.productId,
      currentStock: productInventory.currentStock,
      minimumStock: productInventory.minimumStock,
      location: productInventory.location,
      lastCountDate: productInventory.lastCountDate,
      // TODO: Join mit der products-Tabelle, um Produktdaten zu erhalten
      productName: sql<string>`'Produktname'`, // Platzhalter
      category: sql<string>`'Kategorie'`, // Platzhalter
      // Zusätzliche Felder aus der Batch-Tabelle
      batchId: sql<number>`null`, // Platzhalter
      batchNumber: sql<string>`null`, // Platzhalter
      expiryDate: sql<string>`null`, // Platzhalter
      daysUntilExpiry: sql<number>`null`, // Platzhalter
    })
    .from(productInventory)
    .where(eq(productInventory.warehouseId, warehouseId));
    
    // Suchfilter anwenden
    if (search) {
      // TODO: Hier müsste man eigentlich mit der products-Tabelle joinen
      // query = query.where(like(products.productName, `%${search}%`));
    }
    
    // Kategoriefilter anwenden
    if (category) {
      // TODO: Hier müsste man eigentlich mit der products-Tabelle joinen
      // query = query.where(eq(products.category, category));
    }
    
    // Filter für niedrigen Bestand
    if (lowStock) {
      query = query.where(sql`${productInventory.currentStock} < ${productInventory.minimumStock}`);
    }
    
    // Sortierung anwenden
    // TODO: Hier müsste man die richtige Sortierung basierend auf den Joins implementieren
    if (sortOrder === 'desc') {
      if (sortBy === 'currentStock') {
        query = query.orderBy(desc(productInventory.currentStock));
      } else if (sortBy === 'location') {
        query = query.orderBy(desc(productInventory.location));
      } else if (sortBy === 'expiryDate') {
        // query = query.orderBy(desc(productBatches.expiryDate));
      } else {
        // Default: nach Produktname sortieren
        // query = query.orderBy(desc(products.productName));
      }
    } else {
      if (sortBy === 'currentStock') {
        query = query.orderBy(asc(productInventory.currentStock));
      } else if (sortBy === 'location') {
        query = query.orderBy(asc(productInventory.location));
      } else if (sortBy === 'expiryDate') {
        // query = query.orderBy(asc(productBatches.expiryDate));
      } else {
        // Default: nach Produktname sortieren
        // query = query.orderBy(asc(products.productName));
      }
    }
    
    // Gesamtanzahl der Einträge ermitteln
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(productInventory)
      .where(eq(productInventory.warehouseId, warehouseId));
    
    // Limit und Offset für Paginierung anwenden
    query = query.limit(limit).offset(offset);
    
    // Abfrage ausführen
    const items = await query;
    
    // Ergebnis zurückgeben
    return res.json({
      items,
      total: countResult[0]?.count || 0,
      page,
      limit,
      totalPages: Math.ceil((countResult[0]?.count || 0) / limit),
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
    
    // Basisabfrage für Bewegungen, die dieses Lager betreffen
    let query = db.select({
      id: inventoryMovements.id,
      productId: inventoryMovements.productId,
      quantity: inventoryMovements.quantity,
      movementType: inventoryMovements.movementType,
      sourceType: inventoryMovements.sourceType,
      sourceId: inventoryMovements.sourceId,
      destinationType: inventoryMovements.destinationType,
      destinationId: inventoryMovements.destinationId,
      status: inventoryMovements.status,
      performedAt: inventoryMovements.performedAt,
      createdAt: inventoryMovements.createdAt,
      previousStock: inventoryMovements.previousStock,
      currentStock: inventoryMovements.currentStock,
      batchId: inventoryMovements.batchId,
      referenceType: inventoryMovements.referenceType,
      referenceId: inventoryMovements.referenceId,
      reason: inventoryMovements.reason,
      notes: inventoryMovements.notes,
      // Platzhalter für verknüpfte Daten
      productName: sql<string>`'Produktname'`, // Platzhalter
      batchNumber: sql<string>`null`, // Platzhalter
      machineName: sql<string>`null`, // Platzhalter
      performedByName: sql<string>`null`, // Platzhalter
      sourceName: sql<string>`null`, // Platzhalter
      destinationName: sql<string>`null`, // Platzhalter
    })
    .from(inventoryMovements)
    .where(
      sql`(
        (${inventoryMovements.sourceType} = 'warehouse' AND ${inventoryMovements.sourceId} = ${warehouseId})
        OR
        (${inventoryMovements.destinationType} = 'warehouse' AND ${inventoryMovements.destinationId} = ${warehouseId})
      )`
    );
    
    // Suchfilter anwenden
    if (search) {
      // TODO: Hier müsste man eigentlich mit der products-Tabelle joinen für Produktnamen
    }
    
    // Bewegungstyp-Filter anwenden
    if (movementType) {
      query = query.where(eq(inventoryMovements.movementType, movementType));
    }
    
    // Datumsfilter anwenden
    if (startDate) {
      query = query.where(gte(inventoryMovements.performedAt, startDate));
    }
    
    if (endDate) {
      // Setze das Ende des Tages für den Enddate-Filter
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.where(lte(inventoryMovements.performedAt, endOfDay));
    }
    
    // Sortierung anwenden
    if (sortOrder === 'desc') {
      if (sortBy === 'performedAt') {
        query = query.orderBy(desc(inventoryMovements.performedAt));
      } else if (sortBy === 'quantity') {
        query = query.orderBy(desc(inventoryMovements.quantity));
      } else if (sortBy === 'movementType') {
        query = query.orderBy(desc(inventoryMovements.movementType));
      } else {
        // Default: nach Datum sortieren
        query = query.orderBy(desc(inventoryMovements.performedAt));
      }
    } else {
      if (sortBy === 'performedAt') {
        query = query.orderBy(asc(inventoryMovements.performedAt));
      } else if (sortBy === 'quantity') {
        query = query.orderBy(asc(inventoryMovements.quantity));
      } else if (sortBy === 'movementType') {
        query = query.orderBy(asc(inventoryMovements.movementType));
      } else {
        // Default: nach Datum sortieren
        query = query.orderBy(asc(inventoryMovements.performedAt));
      }
    }
    
    // Gesamtanzahl der Einträge ermitteln
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(inventoryMovements)
      .where(
        sql`(
          (${inventoryMovements.sourceType} = 'warehouse' AND ${inventoryMovements.sourceId} = ${warehouseId})
          OR
          (${inventoryMovements.destinationType} = 'warehouse' AND ${inventoryMovements.destinationId} = ${warehouseId})
        )`
      );
    
    // Limit und Offset für Paginierung anwenden
    query = query.limit(limit).offset(offset);
    
    // Abfrage ausführen
    const items = await query;
    
    // Ergebnis zurückgeben
    return res.json({
      items,
      total: countResult[0]?.count || 0,
      page,
      limit,
      totalPages: Math.ceil((countResult[0]?.count || 0) / limit),
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
      "Regionale Produkte",
      "Saisonale Produkte"
    ];
    
    return res.json(categories);
  } catch (error) {
    return handleServerError(error, res);
  }
});

export default router;