import { Router } from "express";
import { warehouseStorage } from "../warehouse3.storage";
import { db } from "../db";
import { z } from "zod";
import { insertWarehouseSchema, insertMachineWarehouseAssignmentSchema, 
         insertProductInventorySchema, insertProductBatchSchema, 
         insertInventoryMovementSchema, insertInventoryCountSchema,
         insertInventoryCountItemSchema, insertRefillTrackingSchema, 
         insertRefillTrackingItemSchema } from "../../shared/warehouse3.schema";
import { products } from "../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { productBatches, inventoryMovements, warehouses } from "../../shared/warehouse3.schema";

const router = Router();

// ---- HELPER FUNCTIONS ----

// Handler für Validierungsfehler
const handleValidationError = (error: any, res: any) => {
  console.error("Validation error:", error);
  return res.status(400).json({
    success: false,
    message: "Eingabefehler",
    errors: error.errors || error.message,
  });
};

// Handler für Server-Fehler
const handleServerError = (error: any, res: any) => {
  console.error("Server error:", error);
  return res.status(500).json({
    success: false,
    message: "Serverfehler",
    error: error.message,
  });
};

// ---- WAREHOUSE ROUTES ----

// Alle Lager abrufen
router.get("/warehouses", async (req, res) => {
  try {
    const warehouses = await warehouseStorage.getWarehouses();
    return res.json(warehouses);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Einzelnes Lager abrufen
router.get("/warehouses/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    const warehouse = await warehouseStorage.getWarehouse(id);
    if (!warehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    return res.json(warehouse);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Neues Lager erstellen
router.post("/warehouses", async (req, res) => {
  try {
    // Validierung
    const validatedData = insertWarehouseSchema.parse(req.body);
    
    // Lager erstellen
    const newWarehouse = await warehouseStorage.createWarehouse(validatedData);
    
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

// Lager aktualisieren
router.put("/warehouses/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(id);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Validierung
    const validatedData = insertWarehouseSchema.partial().parse(req.body);
    
    // Lager aktualisieren
    const updatedWarehouse = await warehouseStorage.updateWarehouse(id, validatedData);
    
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

// Lager löschen
router.delete("/warehouses/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(id);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    const success = await warehouseStorage.deleteWarehouse(id);
    
    return res.json({
      success,
      message: success ? "Lager erfolgreich gelöscht" : "Lager konnte nicht gelöscht werden",
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// ---- MACHINE-WAREHOUSE ASSIGNMENT ROUTES ----

// Automaten einem Lager zuordnen
router.post("/warehouses/:warehouseId/machines", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Daten mit Lager-ID ergänzen
    const assignmentData = {
      ...req.body,
      warehouseId
    };
    
    // Validierung
    const validatedData = insertMachineWarehouseAssignmentSchema.parse(assignmentData);
    
    // Zuordnung erstellen
    const newAssignment = await warehouseStorage.assignMachineToWarehouse(validatedData);
    
    return res.status(201).json({
      success: true,
      message: "Automat erfolgreich dem Lager zugeordnet",
      assignment: newAssignment,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Automatenzuordnung zu einem Lager aufheben
router.delete("/warehouses/:warehouseId/machines/:machineId", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const machineId = parseInt(req.params.machineId);
    
    if (isNaN(warehouseId) || isNaN(machineId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Automaten-ID" 
      });
    }
    
    const success = await warehouseStorage.unassignMachineFromWarehouse(machineId, warehouseId);
    
    return res.json({
      success,
      message: success 
        ? "Automatenzuordnung erfolgreich aufgehoben" 
        : "Automatenzuordnung konnte nicht aufgehoben werden",
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Zugeordnete Automaten für ein Lager abrufen
router.get("/warehouses/:warehouseId/machines", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    const assignments = await warehouseStorage.getWarehouseAssignments(warehouseId);
    
    return res.json(assignments);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// ---- INVENTORY MANAGEMENT ROUTES ----

// Produktbestand eines Lagers abrufen
router.get("/warehouses/:warehouseId/inventory", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Filter für die Abfrage
    const filters: any = {};
    if (req.query.productName) filters.productName = req.query.productName.toString();
    if (req.query.category) filters.category = req.query.category.toString();
    if (req.query.lowStock === "true") filters.lowStock = true;
    
    const inventory = await warehouseStorage.getProductInventory(warehouseId, filters);

    // Produkt-Details hinzufügen
    const inventoryWithProducts = await Promise.all(inventory.map(async (item) => {
      // Produktinformationen abrufen
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId));
      
      return {
        ...item,
        product
      };
    }));
    
    return res.json(inventoryWithProducts);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Spezifischen Produktbestand abrufen
router.get("/warehouses/:warehouseId/inventory/:productId", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const productId = parseInt(req.params.productId);
    
    if (isNaN(warehouseId) || isNaN(productId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Produkt-ID" 
      });
    }
    
    const inventoryItem = await warehouseStorage.getProductInventoryItem(warehouseId, productId);
    
    if (!inventoryItem) {
      return res.status(404).json({ 
        success: false, 
        message: "Produkt nicht im Lager gefunden" 
      });
    }
    
    return res.json(inventoryItem);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Produktbestand anlegen oder aktualisieren
router.post("/warehouses/:warehouseId/inventory", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Daten mit Lager-ID ergänzen
    const inventoryData = {
      ...req.body,
      warehouseId
    };
    
    // Validierung
    const validatedData = insertProductInventorySchema.parse(inventoryData);
    
    // Überprüfen, ob bereits ein Eintrag für dieses Produkt existiert
    const existingItem = await warehouseStorage.getProductInventoryItem(
      warehouseId, 
      validatedData.productId
    );
    
    let result;
    
    if (existingItem) {
      // Bestand aktualisieren
      result = await warehouseStorage.updateProductInventory(existingItem.id, validatedData);
      
      return res.json({
        success: true,
        message: "Produktbestand erfolgreich aktualisiert",
        inventory: result,
      });
    } else {
      // Neuen Bestand anlegen
      result = await warehouseStorage.createProductInventory(validatedData);
      
      return res.status(201).json({
        success: true,
        message: "Produktbestand erfolgreich angelegt",
        inventory: result,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Produktbestand manuell anpassen
router.post("/warehouses/:warehouseId/inventory/:productId/adjust", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const productId = parseInt(req.params.productId);
    
    if (isNaN(warehouseId) || isNaN(productId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Produkt-ID" 
      });
    }
    
    // Validierung der Eingabe
    const schema = z.object({
      quantityChange: z.number(),
      reason: z.string(),
      notes: z.string().optional(),
      batchId: z.number().optional(),
      performedBy: z.number().optional()
    });
    
    const { quantityChange, reason, notes, batchId, performedBy } = schema.parse(req.body);
    
    // Bewegungstyp basierend auf der Quantität
    const movementType = quantityChange >= 0 ? "IN" : "OUT";
    
    // Inventarbewegung erstellen
    const movementData = {
      sourceType: movementType === "IN" ? "supplier" : "warehouse",
      sourceId: movementType === "IN" ? null : warehouseId,
      destinationType: movementType === "IN" ? "warehouse" : "disposal",
      destinationId: movementType === "IN" ? warehouseId : null,
      productId,
      batchId,
      quantity: Math.abs(quantityChange),
      movementType,
      referenceType: "ADJUST",
      referenceId: null,
      reason,
      notes,
      performedBy
    };
    
    // Bewegung in der Datenbank erstellen
    const movement = await warehouseStorage.createInventoryMovement(movementData);
    
    // Bestand aktualisieren
    const updatedInventory = await warehouseStorage.updateProductStock(
      warehouseId, 
      productId, 
      quantityChange
    );
    
    // Batch-Bestand aktualisieren, falls anwendbar
    if (batchId) {
      await warehouseStorage.updateBatchStock(batchId, quantityChange);
    }
    
    return res.json({
      success: true,
      message: "Produktbestand erfolgreich angepasst",
      inventory: updatedInventory,
      movement
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// ---- BATCH MANAGEMENT ROUTES ----

// Chargen für ein Produkt in einem Lager abrufen
router.get("/warehouses/:warehouseId/batches", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    let productId: number | undefined;
    if (req.query.productId) {
      productId = parseInt(req.query.productId.toString());
      if (isNaN(productId)) {
        return res.status(400).json({ success: false, message: "Ungültige Produkt-ID" });
      }
    }
    
    const batches = await warehouseStorage.getProductBatches(warehouseId, productId);
    
    return res.json(batches);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Charge anlegen
router.post("/warehouses/:warehouseId/batches", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Daten mit Lager-ID ergänzen
    const batchData = {
      ...req.body,
      warehouseId
    };
    
    // Validierung
    const validatedData = insertProductBatchSchema.parse(batchData);
    
    // Charge erstellen
    const newBatch = await warehouseStorage.createProductBatch(validatedData);
    
    return res.status(201).json({
      success: true,
      message: "Charge erfolgreich angelegt",
      batch: newBatch,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Charge aktualisieren
router.put("/warehouses/:warehouseId/batches/:batchId", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const batchId = parseInt(req.params.batchId);
    
    if (isNaN(warehouseId) || isNaN(batchId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Chargen-ID" 
      });
    }
    
    // Überprüfen, ob die Charge existiert
    const existingBatch = await warehouseStorage.getProductBatch(batchId);
    if (!existingBatch || existingBatch.warehouseId !== warehouseId) {
      return res.status(404).json({ 
        success: false, 
        message: "Charge nicht gefunden oder gehört nicht zu diesem Lager" 
      });
    }
    
    // Validierung
    const validatedData = insertProductBatchSchema.partial().parse(req.body);
    
    // Charge aktualisieren
    const updatedBatch = await warehouseStorage.updateProductBatch(batchId, validatedData);
    
    return res.json({
      success: true,
      message: "Charge erfolgreich aktualisiert",
      batch: updatedBatch,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// ---- INVENTORY MOVEMENT ROUTES ----

// Warenbewegungen eines Lagers abrufen
// Warenbewegungen für ein bestimmtes Produkt abrufen
router.get("/inventory/movements", async (req, res) => {
  try {
    const productId = req.query.productId ? parseInt(req.query.productId.toString()) : undefined;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId.toString()) : undefined;
    
    if ((productId && isNaN(productId)) || (warehouseId && isNaN(warehouseId))) {
      return res.status(400).json({ success: false, message: "Ungültige Produkt-ID oder Lager-ID" });
    }
    
    // Filter für die Abfrage
    const filters: any = {};
    if (productId) filters.productId = productId;
    if (warehouseId) filters.warehouseId = warehouseId;
    if (req.query.batchId) filters.batchId = parseInt(req.query.batchId.toString());
    if (req.query.startDate) filters.startDate = new Date(req.query.startDate.toString());
    if (req.query.endDate) filters.endDate = new Date(req.query.endDate.toString());
    if (req.query.type) filters.movementType = req.query.type.toString();
    
    // Abrufen der Warenbewegungen mit detaillierten Informationen
    const movements = await warehouseStorage.getInventoryMovements(filters);
    
    return res.json(movements);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Alle Warenbewegungen eines Lagers abrufen
router.get("/warehouses/:warehouseId/movements", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Filter aus Query-Parametern
    const filters: any = { warehouseId };
    
    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate.toString());
    }
    
    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate.toString());
    }
    
    if (req.query.productId) {
      const productId = parseInt(req.query.productId.toString());
      if (!isNaN(productId)) {
        filters.productId = productId;
      }
    }
    
    if (req.query.movementType) {
      filters.movementType = req.query.movementType.toString();
    }
    
    if (req.query.referenceType) {
      filters.referenceType = req.query.referenceType.toString();
    }
    
    if (req.query.limit) {
      filters.limit = parseInt(req.query.limit.toString());
    }
    
    if (req.query.offset) {
      filters.offset = parseInt(req.query.offset.toString());
    }
    
    const movements = await warehouseStorage.getInventoryMovements(filters);
    
    return res.json(movements);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Eine neue Warenbewegung erstellen
router.post("/warehouses/:warehouseId/movements", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Die Rolle des Lagers in der Bewegung ermitteln (Quelle oder Ziel)
    let movementData = { ...req.body };
    
    if (movementData.type === "IN") {
      movementData = {
        ...movementData,
        sourceType: "supplier",
        sourceId: null,
        destinationType: "warehouse",
        destinationId: warehouseId,
        movementType: "IN"
      };
    } else if (movementData.type === "OUT") {
      movementData = {
        ...movementData,
        sourceType: "warehouse",
        sourceId: warehouseId,
        destinationType: "disposal",
        destinationId: null,
        movementType: "OUT"
      };
    } else if (movementData.type === "TRANSFER") {
      // Für Transfers muss explizit die Quelle und das Ziel angegeben werden
      if (!movementData.sourceId && !movementData.destinationId) {
        return res.status(400).json({ 
          success: false, 
          message: "Für Transfers muss eine Quelle oder ein Ziel angegeben werden" 
        });
      }
      
      if (!movementData.sourceId) {
        movementData.sourceType = "warehouse";
        movementData.sourceId = warehouseId;
      }
      
      if (!movementData.destinationId) {
        movementData.destinationType = "warehouse";
        movementData.destinationId = warehouseId;
      }
      
      movementData.movementType = "TRANSFER";
    }
    
    // Validierung
    const validatedData = insertInventoryMovementSchema.parse(movementData);
    
    // Warenbewegung erstellen
    const newMovement = await warehouseStorage.createInventoryMovement(validatedData);
    
    // Bestand aktualisieren
    if (validatedData.sourceType === "warehouse" && validatedData.sourceId) {
      // Bei Ausgang den Bestand reduzieren
      await warehouseStorage.updateProductStock(
        validatedData.sourceId, 
        validatedData.productId, 
        -validatedData.quantity
      );
      
      // Batch-Bestand aktualisieren, falls anwendbar
      if (validatedData.batchId) {
        await warehouseStorage.updateBatchStock(validatedData.batchId, -validatedData.quantity);
      }
    }
    
    if (validatedData.destinationType === "warehouse" && validatedData.destinationId) {
      // Bei Eingang den Bestand erhöhen
      await warehouseStorage.updateProductStock(
        validatedData.destinationId, 
        validatedData.productId, 
        validatedData.quantity
      );
      
      // Bei Transfers für das Ziel keinen Batch-Bestand anpassen, 
      // da die Charge bereits im Quell-Lager aktualisiert wurde
    }
    
    return res.status(201).json({
      success: true,
      message: "Warenbewegung erfolgreich erstellt",
      movement: newMovement,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// ---- INVENTORY COUNT ROUTES ----

// Inventuren eines Lagers abrufen
router.get("/warehouses/:warehouseId/counts", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    const countsResult = await rawDb.query(`
      SELECT 
        ic.*,
        w.name as warehouse_name
      FROM inventory_counts ic
      LEFT JOIN warehouses w ON ic.warehouse_id = w.id
      WHERE ic.warehouse_id = $1
      ORDER BY ic.created_at DESC
    `, [warehouseId]);
    const counts = countsResult.rows;
    
    return res.json(counts);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Inventur erstellen
router.post("/warehouses/:warehouseId/counts", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Daten mit Lager-ID ergänzen
    const countData = {
      ...req.body,
      warehouseId
    };
    
    // Validierung
    const validatedData = insertInventoryCountSchema.parse(countData);
    
    // Inventur erstellen
    const newCount = await warehouseStorage.createInventoryCount(validatedData);
    
    return res.status(201).json({
      success: true,
      message: "Inventur erfolgreich erstellt",
      count: newCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Inventur aktualisieren
router.put("/warehouses/:warehouseId/counts/:countId", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const countId = parseInt(req.params.countId);
    
    if (isNaN(warehouseId) || isNaN(countId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Inventur-ID" 
      });
    }
    
    // Überprüfen, ob die Inventur existiert
    const existingCount = await warehouseStorage.getInventoryCount(countId);
    if (!existingCount || existingCount.warehouseId !== warehouseId) {
      return res.status(404).json({ 
        success: false, 
        message: "Inventur nicht gefunden oder gehört nicht zu diesem Lager" 
      });
    }
    
    // Validierung
    const validatedData = insertInventoryCountSchema.partial().parse(req.body);
    
    // Inventur aktualisieren
    const updatedCount = await warehouseStorage.updateInventoryCount(countId, validatedData);
    
    return res.json({
      success: true,
      message: "Inventur erfolgreich aktualisiert",
      count: updatedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Detaillierte Informationen zu einer Inventur abrufen
router.get("/warehouses/:warehouseId/counts/:countId", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const countId = parseInt(req.params.countId);
    
    if (isNaN(warehouseId) || isNaN(countId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Inventur-ID" 
      });
    }
    
    const count = await warehouseStorage.getInventoryCount(countId);
    
    if (!count || count.warehouseId !== warehouseId) {
      return res.status(404).json({ 
        success: false, 
        message: "Inventur nicht gefunden oder gehört nicht zu diesem Lager" 
      });
    }
    
    // Items der Inventur abfragen
    const items = await warehouseStorage.getInventoryCountItems(countId);
    
    return res.json({
      ...count,
      items
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Zählelement zu einer Inventur hinzufügen
router.post("/warehouses/:warehouseId/counts/:countId/items", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const countId = parseInt(req.params.countId);
    
    if (isNaN(warehouseId) || isNaN(countId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Inventur-ID" 
      });
    }
    
    // Überprüfen, ob die Inventur existiert
    const existingCount = await warehouseStorage.getInventoryCount(countId);
    if (!existingCount || existingCount.warehouseId !== warehouseId) {
      return res.status(404).json({ 
        success: false, 
        message: "Inventur nicht gefunden oder gehört nicht zu diesem Lager" 
      });
    }
    
    // Daten mit Inventur-ID ergänzen
    const itemData = {
      ...req.body,
      countId
    };
    
    // Validierung
    const validatedData = insertInventoryCountItemSchema.parse(itemData);
    
    // Aktuelle Bestandsmenge für dieses Produkt im Lager abfragen
    const inventoryItem = await warehouseStorage.getProductInventoryItem(
      warehouseId, 
      validatedData.productId
    );
    
    // Erwartete Menge setzen, falls nicht explizit angegeben
    if (validatedData.expectedQuantity === undefined) {
      validatedData.expectedQuantity = inventoryItem?.currentStock || 0;
    }
    
    // Diskrepanz berechnen, falls aktuelle Menge angegeben wurde
    if (validatedData.actualQuantity !== undefined && validatedData.actualQuantity !== null) {
      // Stelle sicher, dass expectedQuantity einen Wert hat
      const expectedQty = validatedData.expectedQuantity !== null && validatedData.expectedQuantity !== undefined ? 
                          validatedData.expectedQuantity : 0;
      
      validatedData.discrepancy = validatedData.actualQuantity - expectedQty;
    }
    
    // Zählelement erstellen
    const newItem = await warehouseStorage.createInventoryCountItem(validatedData);
    
    return res.status(201).json({
      success: true,
      message: "Zählelement erfolgreich hinzugefügt",
      item: newItem,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Zählelement aktualisieren
router.put("/warehouses/:warehouseId/counts/:countId/items/:itemId", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const countId = parseInt(req.params.countId);
    const itemId = parseInt(req.params.itemId);
    
    if (isNaN(warehouseId) || isNaN(countId) || isNaN(itemId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID, Inventur-ID oder Item-ID" 
      });
    }
    
    // Validierung
    const validatedData = insertInventoryCountItemSchema.partial().parse(req.body);
    
    // Wenn aktuelle Menge geändert wurde, Diskrepanz neu berechnen
    if (validatedData.actualQuantity !== undefined && validatedData.actualQuantity !== null) {
      const items = await warehouseStorage.getInventoryCountItems(countId);
      const existingItem = items.find(item => item.id === itemId);
      
      if (existingItem) {
        const expectedQty = existingItem.expectedQuantity !== null && existingItem.expectedQuantity !== undefined ?
                           existingItem.expectedQuantity : 0;
        
        validatedData.discrepancy = validatedData.actualQuantity - expectedQty;
      }
    }
    
    // Zählelement aktualisieren
    const updatedItem = await warehouseStorage.updateInventoryCountItem(itemId, validatedData);
    
    return res.json({
      success: true,
      message: "Zählelement erfolgreich aktualisiert",
      item: updatedItem,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// ---- REFILL TRACKING ROUTES ----

// Refills eines Lagers abrufen
router.get("/warehouses/:warehouseId/refills", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    const refills = await warehouseStorage.getRefillTrackings(warehouseId);
    
    return res.json(refills);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Refill erstellen
router.post("/warehouses/:warehouseId/refills", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Daten mit Lager-ID ergänzen
    const refillData = {
      ...req.body,
      warehouseId
    };
    
    // Validierung
    const validatedData = insertRefillTrackingSchema.parse(refillData);
    
    // Refill erstellen
    const newRefill = await warehouseStorage.createRefillTracking(validatedData);
    
    return res.status(201).json({
      success: true,
      message: "Auffüllung erfolgreich erstellt",
      refill: newRefill,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// Detaillierte Informationen zu einem Refill abrufen
router.get("/warehouses/:warehouseId/refills/:refillId", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const refillId = parseInt(req.params.refillId);
    
    if (isNaN(warehouseId) || isNaN(refillId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Refill-ID" 
      });
    }
    
    const refill = await warehouseStorage.getRefillTracking(refillId);
    
    if (!refill || refill.warehouseId !== warehouseId) {
      return res.status(404).json({ 
        success: false, 
        message: "Auffüllung nicht gefunden oder gehört nicht zu diesem Lager" 
      });
    }
    
    return res.json(refill);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Produkt zu einem Refill hinzufügen
router.post("/warehouses/:warehouseId/refills/:refillId/items", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const refillId = parseInt(req.params.refillId);
    
    if (isNaN(warehouseId) || isNaN(refillId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID oder Refill-ID" 
      });
    }
    
    // Überprüfen, ob der Refill existiert
    const existingRefill = await warehouseStorage.getRefillTracking(refillId);
    if (!existingRefill || existingRefill.warehouseId !== warehouseId) {
      return res.status(404).json({ 
        success: false, 
        message: "Auffüllung nicht gefunden oder gehört nicht zu diesem Lager" 
      });
    }
    
    // Daten mit Refill-ID ergänzen
    const itemData = {
      ...req.body,
      refillId
    };
    
    // Validierung
    const validatedData = insertRefillTrackingItemSchema.parse(itemData);
    
    // Item erstellen
    const newItem = await warehouseStorage.createRefillTrackingItem(validatedData);
    
    return res.status(201).json({
      success: true,
      message: "Produkt erfolgreich zur Auffüllung hinzugefügt",
      item: newItem,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    return handleServerError(error, res);
  }
});

// ---- EXPIRED PRODUCTS ROUTES ----

// Abgelaufene Produkte/Chargen für alle oder ein bestimmtes Lager abrufen
router.get("/warehouses/expired-products", async (req, res) => {
  try {
    // Optional: Filterung nach Lager
    let warehouseId: number | undefined;
    if (req.query.warehouseId) {
      warehouseId = parseInt(req.query.warehouseId.toString());
      if (isNaN(warehouseId)) {
        return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
      }
    }

    // Aktuelles Datum zur Filterung der abgelaufenen Chargen
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Bedingungen für die Abfrage erstellen
    const conditions = [
      // Bestandsmenge ist 0 (ausgebucht)
      eq(productBatches.currentQuantity, 0),
      // Ablaufdatum ist in der Vergangenheit
      sql`${productBatches.expiryDate} <= ${today.toISOString().substring(0, 10)}`
    ];
    
    // Wenn eine Lager-ID angegeben wurde, diese Bedingung hinzufügen
    if (warehouseId) {
      conditions.push(eq(productBatches.warehouseId, warehouseId));
    }
      
      // Abfrage mit allen Bedingungen ausführen
      const expiredBatches = await db.select({
        batch: productBatches,
        warehouse: warehouses,
        product: products
      })
      .from(productBatches)
      .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
      .leftJoin(products, eq(productBatches.productId, products.id))
      .where(and(...conditions))
      .orderBy(desc(productBatches.expiryDate));
      
      // Bewegungen für die Ausbuchungen abfragen
      const expiredBatchesWithMovements = await Promise.all(
        expiredBatches.map(async ({ batch, warehouse, product }) => {
        // Suche nach der Ausbuchungsbewegung
        const movements = await db
          .select()
          .from(inventoryMovements)
          .where(and(
            eq(inventoryMovements.batchId, batch.id),
            eq(inventoryMovements.referenceType, "EXPIRY")
          ))
          .orderBy(desc(inventoryMovements.performedAt))
          .limit(1);

        // Originalbestand vor der Ausbuchung finden
        const originalQuantity = movements.length > 0 ? movements[0].quantity : 0;
        const removedAt = movements.length > 0 ? movements[0].performedAt : null;

        return {
          ...batch,
          warehouseName: warehouse?.name || 'Unbekanntes Lager',
          productName: product?.productName || 'Unbekanntes Produkt',
          sku: product?.sku || '',
          category: product?.category || '',
          originalQuantity,
          removedAt
        };
      })
    );

    return res.json(expiredBatchesWithMovements);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// ---- WAREHOUSE RECONCILIATION ----

/**
 * Route zum manuellen Synchronisieren der Produkte von zugeordneten Automaten mit einem Lager
 * Dies fügt automatisch alle Produkte der Automaten dem Lager hinzu, wenn sie nicht bereits existieren
 */
router.post("/warehouses/:warehouseId/reconcile", async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Überprüfen, ob das Lager existiert
    const warehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!warehouse) {
      return res.status(404).json({ success: false, message: "Lager nicht gefunden" });
    }
    
    // Synchronisierung durchführen
    const result = await warehouseStorage.syncAllMachinesForWarehouse(warehouseId);
    
    return res.json({
      success: true,
      message: `Synchronisierung abgeschlossen: ${result.totalProductsAdded} Produkte von ${result.machineCount} Automaten hinzugefügt`,
      result
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

export default router;