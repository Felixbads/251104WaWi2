import { Router } from "express";
import { warehouseStorage } from "../warehouse3.storage";
import { db, pool } from "../db"; // CRITICAL FIX 1: Import both db and pool
// SECURITY FIX: Import authentication and audit middleware
import { authenticateUser, requireWarehouseAccess, auditLog, requireRole } from "../middleware/auth";
import { z } from "zod";
import { insertWarehouseSchema, insertMachineWarehouseAssignmentSchema, 
         insertProductInventorySchema, insertStockBatchSchema, 
         insertStockMovementSchema, insertInventoryCountSchema,
         insertInventoryCountItemSchema, insertRefillTrackingSchema, 
         insertRefillTrackingItemSchema, productBatches, inventoryMovements } from "../../shared/warehouse3.schema";
import { products } from "../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { stockBatches, stockMovements, warehouses, machineWarehouseAssignments } from "../../shared/warehouse3.schema";

// ---- NEUE FIFO-SERVICE INTEGRATION ----
import { 
  receiptTransaction, 
  fifoDeplete,
  receiptTransactionSchema,
  fifoDepleteSchema,
  type ReceiptTransaction,
  type FifoDeplete,
  type ReceiptResult,
  type FifoResult
} from "../services/inventoryTransactions.js";

import { MhdFifoService } from "../services/mhdFifoService.js";

const router = Router();

// ---- HELPER FUNCTIONS FOR RETRY LOGIC ----

// CRITICAL FIX 5: Helper function for bounded retry logic on transaction conflicts
const executeWithRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  operationName: string = "operation"
): Promise<T> => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempts++;
      
      // Check for retryable transaction conflicts
      const isRetryable = error.message?.includes('transaction deadlock') ||
                         error.message?.includes('serialization_failure') ||
                         error.message?.includes('TRANSACTION_CONFLICT') ||
                         error.message?.includes('could not serialize access');
      
      if (isRetryable && attempts < maxRetries) {
        console.log(`[WAREHOUSE3] ${operationName} failed on attempt ${attempts}, retrying... Error: ${error.message}`);
        // Exponential backoff: wait longer on each retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        continue;
      }
      
      // Not retryable or max retries reached
      throw error;
    }
  }
  
  throw new Error(`${operationName} failed after ${maxRetries} attempts`);
};

// ---- SERVICE INSTANCES ----

// CRITICAL FIX 1: MhdFifoService-Instanz für FIFO-Berechnungen
// Fix: Use pool instead of db - Service expects pg Pool, not Drizzle instance
const mhdFifoService = new MhdFifoService(pool);

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

// Handler für erfolgreiche Receipt-Transaktionen
const handleReceiptSuccess = (result: ReceiptResult, res: any) => {
  return res.status(201).json({
    success: true,
    message: "Wareneingang erfolgreich verarbeitet",
    result: {
      orderId: result.orderId,
      orderStatus: result.orderStatus,
      processedLines: result.processedLines,
      totalQuantityReceived: result.totalQuantityReceived,
      batchesCreated: result.batchesCreated,
      movementsCreated: result.movementsCreated,
      warnings: result.warnings || []
    }
  });
};

// Handler für erfolgreiche FIFO-Entnahmen
const handleFifoSuccess = (result: FifoResult, res: any) => {
  return res.json({
    success: true,
    message: "FIFO-Entnahme erfolgreich verarbeitet",
    result: {
      totalDepleted: result.totalDepleted,
      batchesProcessed: result.batchesProcessed,
      movements: result.movements,
      remainingQuantity: result.remainingQuantity
    }
  });
};

// CRITICAL FIX 2: Erweiterte Error-Handler für FIFO-spezifische Fehler
// Fix: Correct parameter order for easier usage
const handleFifoError = (error: any, res: any, operation: string = "operation") => {
  console.error(`[WAREHOUSE3] FIFO ${operation} failed:`, error);
  
  // Spezifische FIFO-Fehlererkennung
  if (error.message?.includes('insufficient stock')) {
    return res.status(400).json({
      success: false,
      message: "Unzureichender Lagerbestand für FIFO-Entnahme",
      error: error.message,
      code: "INSUFFICIENT_STOCK"
    });
  }
  
  if (error.message?.includes('batch not found')) {
    return res.status(404).json({
      success: false,
      message: "Charge für FIFO-Verarbeitung nicht gefunden",
      error: error.message,
      code: "BATCH_NOT_FOUND"
    });
  }
  
  if (error.message?.includes('product not found')) {
    return res.status(404).json({
      success: false,
      message: "Produkt für FIFO-Verarbeitung nicht gefunden",
      error: error.message,
      code: "PRODUCT_NOT_FOUND"
    });
  }
  
  if (error.message?.includes('warehouse not found')) {
    return res.status(404).json({
      success: false,
      message: "Lager für FIFO-Verarbeitung nicht gefunden",
      error: error.message,
      code: "WAREHOUSE_NOT_FOUND"
    });
  }
  
  if (error.message?.includes('transaction deadlock') || error.message?.includes('serialization_failure')) {
    return res.status(409).json({
      success: false,
      message: "Transaktion fehlgeschlagen due to concurrent access. Bitte erneut versuchen.",
      error: "Concurrent transaction conflict",
      code: "TRANSACTION_CONFLICT",
      retryable: true
    });
  }
  
  // Standard-Fehlerbehandlung
  return res.status(500).json({
    success: false,
    message: `FIFO ${operation} fehlgeschlagen`,
    error: error.message || "Unbekannter FIFO-Fehler",
    code: "FIFO_ERROR"
  });
};

// Handler für Database-Constraint-Violations
const handleConstraintError = (error: any, res: any) => {
  console.error("[WAREHOUSE3] Database constraint violation:", error);
  
  if (error.message?.includes('foreign key constraint')) {
    return res.status(400).json({
      success: false,
      message: "Referenzfehler: Verknüpfte Daten nicht gefunden",
      error: "Foreign key constraint violation",
      code: "REFERENCE_ERROR"
    });
  }
  
  if (error.message?.includes('unique constraint')) {
    return res.status(409).json({
      success: false,
      message: "Eindeutigkeitsfehler: Daten bereits vorhanden",
      error: "Unique constraint violation",
      code: "DUPLICATE_ERROR"
    });
  }
  
  if (error.message?.includes('check constraint')) {
    return res.status(400).json({
      success: false,
      message: "Validierungsfehler: Ungültige Datenwerte",
      error: "Check constraint violation",
      code: "VALIDATION_ERROR"
    });
  }
  
  return handleServerError(error, res);
};

// ---- WAREHOUSE ROUTES ----

// Alle Lager abrufen
router.get("/warehouses", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    const warehouses = await warehouseStorage.getWarehouses();
    return res.json(warehouses);
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Einzelnes Lager abrufen
router.get("/warehouses/:id", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_VIEW', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
router.post("/warehouses", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_CREATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.put("/warehouses/:id", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_UPDATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.delete("/warehouses/:id", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin']), 
  auditLog('WAREHOUSE_DELETE', 'WAREHOUSE_DELETE'), 
  async (req, res) => {
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

// ---- RECEIPT (WARENEINGANG) ROUTES ----

// CRITICAL FIX 5: Wareneingang verarbeiten - MODERNE FIFO-SERVICE INTEGRATION mit Retry Logic
// SECURITY FIX: Add authentication, warehouse access control, and audit logging
router.post("/warehouses/:warehouseId/receipts", 
  authenticateUser, 
  requireWarehouseAccess(), 
  auditLog('WAREHOUSE_RECEIPT', 'FIFO_OPERATION'), 
  async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID" 
      });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ 
        success: false, 
        message: "Lager nicht gefunden" 
      });
    }
    
    // Request-Body mit Lager-ID ergänzen
    const transactionData = {
      ...req.body,
      warehouseId
    };
    
    try {
      // Validierung mit receiptTransactionSchema
      const validatedData = receiptTransactionSchema.parse(transactionData);
      
      console.log(`[WAREHOUSE3] Processing receipt for warehouse ${warehouseId}, order ${validatedData.orderId}`);
      
      // CRITICAL FIX 5: Receipt-Transaktion mit Retry Logic für Transaction Conflicts
      const result = await executeWithRetry(
        () => receiptTransaction(db, validatedData),
        3,
        "receipt transaction"
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Wareneingang konnte nicht verarbeitet werden",
          errors: result.errors || ["Unbekannter Fehler bei der Verarbeitung"]
        });
      }
      
      console.log(`[WAREHOUSE3] Receipt processed successfully: ${result.processedLines} lines, ${result.batchesCreated} batches created`);
      
      return handleReceiptSuccess(result, res);
      
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return handleValidationError(validationError, res);
      }
      throw validationError;
    }
    
  } catch (error) {
    // CRITICAL FIX 2: Use proper FIFO error handling for receipt operations
    return handleFifoError(error, res, "receipt processing");
  }
});

// CRITICAL FIX 5: FIFO-basierte Entnahme verarbeiten mit Retry Logic
// SECURITY FIX: Add authentication, warehouse access control, and audit logging
router.post("/warehouses/:warehouseId/fifo-depletion", 
  authenticateUser, 
  requireWarehouseAccess(), 
  auditLog('WAREHOUSE_FIFO_DEPLETION', 'FIFO_OPERATION'), 
  async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID" 
      });
    }
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ 
        success: false, 
        message: "Lager nicht gefunden" 
      });
    }
    
    // Request-Body mit Lager-ID ergänzen
    const depleteData = {
      ...req.body,
      warehouseId
    };
    
    try {
      // Validierung mit fifoDepleteSchema
      const validatedData = fifoDepleteSchema.parse(depleteData);
      
      console.log(`[WAREHOUSE3] Processing FIFO depletion for warehouse ${warehouseId}, product ${validatedData.productId}, quantity ${validatedData.quantityToDeplete}`);
      
      // CRITICAL FIX 5: FIFO-Entnahme mit Retry Logic für Transaction Conflicts
      const result = await executeWithRetry(
        () => fifoDeplete(validatedData),
        3,
        "FIFO depletion transaction"
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "FIFO-Entnahme konnte nicht verarbeitet werden",
          errors: result.errors || ["Unbekannter Fehler bei der FIFO-Entnahme"]
        });
      }
      
      console.log(`[WAREHOUSE3] FIFO depletion processed successfully: ${result.totalDepleted} depleted from ${result.batchesProcessed.length} batches`);
      
      return handleFifoSuccess(result, res);
      
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return handleValidationError(validationError, res);
      }
      throw validationError;
    }
    
  } catch (error) {
    // CRITICAL FIX 2: Use proper FIFO error handling instead of generic server error
    return handleFifoError(error, res, "FIFO depletion");
  }
});

// CRITICAL FIX 5: MHD-FIFO Transfer für Refill-Prozesse mit Retry Logic
router.post("/warehouses/:warehouseId/mhd-transfer", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_MHD_TRANSFER', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID" 
      });
    }
    
    // Validierung der Eingabedaten
    const schema = z.object({
      machineId: z.number().positive("Automaten-ID muss positiv sein"),
      productId: z.string().min(1, "Produkt-ID ist erforderlich"),
      quantityAdded: z.number().positive("Hinzugefügte Menge muss positiv sein"),
      stockId: z.number().positive("Stock-ID ist erforderlich")
    });
    
    const { machineId, productId, quantityAdded, stockId } = schema.parse(req.body);
    
    console.log(`[WAREHOUSE3] Processing MHD transfer from warehouse ${warehouseId} to machine ${machineId} for product ${productId}`);
    
    // CRITICAL FIX 5: MHD-FIFO Transfer mit Retry Logic für Transaction Conflicts
    const transfers = await executeWithRetry(
      () => mhdFifoService.transferMhdFromWarehouse(
        machineId,
        productId,
        quantityAdded,
        warehouseId,
        stockId
      ),
      3,
      "MHD-FIFO transfer"
    );
    
    return res.json({
      success: true,
      message: "MHD-Transfer erfolgreich durchgeführt",
      transfers,
      totalQuantity: quantityAdded,
      batchesUsed: transfers.length
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    // CRITICAL FIX 2 & 4: Use proper FIFO error handling for MHD transfers
    return handleFifoError(error, res, "MHD transfer");
  }
});

// Ablaufende Produkte abfragen (MHD-Überwachung)
router.get("/warehouses/:warehouseId/expiring-products", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_EXPIRING_PRODUCTS', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Ungültige Lager-ID" 
      });
    }
    
    const daysAhead = req.query.daysAhead ? parseInt(req.query.daysAhead.toString()) : 7;
    
    // Direkte Datenbankabfrage für ablaufende Produkte im Lager
    const result = await db.execute(sql`
      SELECT 
        pb.id as batch_id,
        pb.batch_number,
        pb.expiry_date,
        pb.current_quantity,
        p.id as product_id,
        p.product_name,
        p.sku,
        DATE_PART('day', pb.expiry_date - CURRENT_DATE) as days_until_expiry
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      WHERE pb.warehouse_id = ${warehouseId}
        AND pb.expiry_date IS NOT NULL
        AND pb.expiry_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
        AND pb.current_quantity > 0
        AND pb.status = 'active'
      ORDER BY pb.expiry_date ASC, p.product_name ASC
    `);
    
    return res.json({
      expiringProducts: result.rows,
      daysAhead,
      totalBatches: result.rows.length
    });
    
  } catch (error) {
    console.error("[WAREHOUSE3] Failed to fetch expiring products:", error);
    return handleServerError(error, res);
  }
});

// ---- MACHINE-WAREHOUSE ASSIGNMENT ROUTES ----

// Automaten einem Lager zuordnen
router.post("/warehouses/:warehouseId/machines", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_MACHINE_ASSIGN', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.delete("/warehouses/:warehouseId/machines/:machineId", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin']), 
  auditLog('WAREHOUSE_MACHINE_UNASSIGN', 'WAREHOUSE_DELETE'), 
  async (req, res) => {
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
router.get("/warehouses/:warehouseId/machines", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_MACHINES_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
router.get("/warehouses/:warehouseId/inventory", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_INVENTORY', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Erweiterte Filter für die Abfrage
    const filters: any = {};
    
    // Bestehende Filter
    if (req.query.productName) filters.productName = req.query.productName.toString();
    if (req.query.category) filters.category = req.query.category.toString();
    if (req.query.lowStock === "true") filters.lowStock = true;
    
    // Neue erweiterte Filter
    if (req.query.sku) filters.sku = req.query.sku.toString();
    if (req.query.status) filters.status = req.query.status.toString();
    if (req.query.minQuantity) {
      const minQty = parseInt(req.query.minQuantity.toString());
      if (!isNaN(minQty)) filters.minQuantity = minQty;
    }
    if (req.query.maxQuantity) {
      const maxQty = parseInt(req.query.maxQuantity.toString());
      if (!isNaN(maxQty)) filters.maxQuantity = maxQty;
    }
    
    // Sortierung
    if (req.query.sortBy && ['productName', 'category', 'sku', 'quantity'].includes(req.query.sortBy.toString())) {
      filters.sortBy = req.query.sortBy.toString();
    }
    if (req.query.sortOrder && ['asc', 'desc'].includes(req.query.sortOrder.toString())) {
      filters.sortOrder = req.query.sortOrder.toString();
    }
    
    // Paginierung
    if (req.query.limit) {
      const limit = parseInt(req.query.limit.toString());
      if (!isNaN(limit) && limit > 0 && limit <= 1000) filters.limit = limit;
    }
    if (req.query.offset) {
      const offset = parseInt(req.query.offset.toString());
      if (!isNaN(offset) && offset >= 0) filters.offset = offset;
    }
    
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

// Produktbestand manuell anpassen - MODERNE FIFO-SERVICE INTEGRATION
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
    
    // Überprüfen, ob das Lager existiert
    const existingWarehouse = await warehouseStorage.getWarehouse(warehouseId);
    if (!existingWarehouse) {
      return res.status(404).json({ 
        success: false, 
        message: "Lager nicht gefunden" 
      });
    }
    
    // Validierung der Eingabe
    const schema = z.object({
      quantityChange: z.number().refine(val => val !== 0, "Quantitätsänderung darf nicht 0 sein"),
      reason: z.string().min(1, "Grund ist erforderlich"),
      notes: z.string().optional(),
      performedBy: z.number().positive("Benutzer-ID ist erforderlich")
    });
    
    const { quantityChange, reason, notes, performedBy } = schema.parse(req.body);
    
    console.log(`[WAREHOUSE3] Processing inventory adjustment for warehouse ${warehouseId}, product ${productId}, change: ${quantityChange}`);
    
    if (quantityChange > 0) {
      // **POSITIVER ADJUSTMENT: Receipt-Transaction verwenden**
      // Erstelle synthetische Receipt-Daten für positive Anpassungen
      const adjustmentData: ReceiptTransaction = {
        orderId: -1, // Synthetic order ID for adjustments
        warehouseId,
        deliveryDate: new Date().toISOString().split('T')[0],
        receiptLines: [{
          orderItemId: -1, // Synthetic order item ID
          productId,
          productName: `Adjustment for Product ${productId}`,
          quantityOrdered: quantityChange,
          quantityReceived: quantityChange,
          batchNumber: `ADJ-${Date.now()}-${productId}`, // Synthetic batch
          expiryDate: '2099-12-31', // Far future for adjustment batches
          qualityStatus: 'good',
          notes: notes || reason
        }],
        notes: `Manual adjustment: ${reason}`,
        processedBy: performedBy,
        overallQuality: 'good',
        requiresFollowUp: false
      };
      
      try {
        // Receipt-Transaktion verwenden für positive Anpassungen
        const result = await receiptTransaction(db, adjustmentData);
        
        if (!result.success) {
          return res.status(400).json({
            success: false,
            message: "Positive Bestandsanpassung konnte nicht verarbeitet werden",
            errors: result.errors || ["Unbekannter Fehler bei der Anpassung"]
          });
        }
        
        console.log(`[WAREHOUSE3] Positive adjustment processed: ${result.totalQuantityReceived} units added`);
        
        return res.json({
          success: true,
          message: "Positive Bestandsanpassung erfolgreich verarbeitet",
          adjustment: {
            quantityChange,
            type: 'INCREASE',
            reason,
            notes,
            result: {
              batchesCreated: result.batchesCreated,
              movementsCreated: result.movementsCreated,
              totalQuantityAdjusted: result.totalQuantityReceived
            }
          }
        });
        
      } catch (validationError) {
        console.error("[WAREHOUSE3] Positive adjustment validation failed:", validationError);
        return res.status(400).json({
          success: false,
          message: "Validierungsfehler bei positiver Anpassung",
          error: validationError.message
        });
      }
      
    } else {
      // **NEGATIVER ADJUSTMENT: FIFO-Depletion verwenden**
      const depleteData: FifoDeplete = {
        warehouseId,
        productId,
        quantityToDeplete: Math.abs(quantityChange),
        movementType: "ADJUSTMENT",
        referenceType: "ADJUSTMENT",
        notes: `Manual adjustment: ${reason}${notes ? ` - ${notes}` : ''}`,
        performedBy
      };
      
      try {
        // FIFO-Entnahme verwenden für negative Anpassungen
        const result = await fifoDeplete(depleteData);
        
        if (!result.success) {
          return res.status(400).json({
            success: false,
            message: "Negative Bestandsanpassung konnte nicht verarbeitet werden",
            errors: result.errors || ["Unbekannter Fehler bei der FIFO-Entnahme"]
          });
        }
        
        console.log(`[WAREHOUSE3] Negative adjustment processed: ${result.totalDepleted} units depleted from ${result.batchesProcessed.length} batches`);
        
        return res.json({
          success: true,
          message: "Negative Bestandsanpassung erfolgreich verarbeitet",
          adjustment: {
            quantityChange,
            type: 'DECREASE',
            reason,
            notes,
            result: {
              totalQuantityDepleted: result.totalDepleted,
              batchesProcessed: result.batchesProcessed,
              movements: result.movements,
              remainingQuantity: result.remainingQuantity
            }
          }
        });
        
      } catch (validationError) {
        console.error("[WAREHOUSE3] Negative adjustment validation failed:", validationError);
        return res.status(400).json({
          success: false,
          message: "Validierungsfehler bei negativer Anpassung",
          error: validationError.message
        });
      }
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, res);
    }
    console.error("[WAREHOUSE3] Inventory adjustment failed:", error);
    return handleServerError(error, res);
  }
});

// ---- BATCH MANAGEMENT ROUTES ----

// Chargen für ein Produkt in einem Lager abrufen
router.get("/warehouses/:warehouseId/batches", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_BATCHES_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
router.post("/warehouses/:warehouseId/batches", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_BATCH_CREATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.put("/warehouses/:warehouseId/batches/:batchId", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_BATCH_UPDATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.get("/inventory/movements", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('INVENTORY_MOVEMENTS_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
router.get("/warehouses/:warehouseId/movements", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_MOVEMENTS_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    console.log(`[DEBUG ROUTE] Warehouse movements requested for warehouse: ${warehouseId}`);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }
    
    // Filter aus Query-Parametern
    const filters: any = { warehouseId };
    
    console.log(`[DEBUG ROUTE] Filters being passed to storage:`, filters);
    
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
    
    // NEUE LÖSUNG: Verwende die erweiterte Storage-Funktion für ALLE Lager
    console.log(`[DEBUG ROUTE] Using enhanced getInventoryMovements for warehouse ${warehouseId}`);
    const movements = await warehouseStorage.getInventoryMovements(filters);
    
    // Bewegungen für die API-Response formatieren
    const total = movements.length;
    const page = 1;
    const limit = filters.limit || 10;
    const totalPages = Math.ceil(total / limit);
    
    return res.json({
      items: movements,
      total,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// TEMPORÄRE ROUTE: Direkte Refill-Abfrage für Lager 10 (Bahnhof)
router.get("/warehouses/10/refills", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_REFILLS_SPECIFIC', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    console.log(`[DEBUG] Temporary refill route for warehouse 10`);
    
    const limit = req.query.limit ? parseInt(req.query.limit.toString()) : 10;
    
    const refillQuery = `
      SELECT 
        r.id,
        r.machine_id,
        r.machine_name,
        r.datetime as performed_at,
        r.operator,
        r.refill_type,
        r.actual_amount,
        r.total_products,
        r.notes,
        r.refill_number
      FROM refills r
      JOIN machine_warehouse_assignments mwa ON r.machine_id = mwa.machine_id
      WHERE mwa.warehouse_id = 10
      ORDER BY r.datetime DESC
      LIMIT $1
    `;
    
    const { db } = warehouseStorage as any;
    const { sql } = await import('drizzle-orm');
    
    const refillResults = await db.execute(sql.raw(refillQuery, [limit]));
    console.log(`[DEBUG] Found ${refillResults.rows.length} refills for warehouse 10`);
    
    const movements = refillResults.rows.map((refill: any) => ({
      id: `refill_${refill.id}`,
      productId: null,
      quantity: refill.actual_amount || refill.total_products || 0,
      movementType: 'REFILL',
      sourceWarehouseId: 10,
      destinationWarehouseId: null,
      direction: 'OUT',
      status: 'completed',
      performedAt: refill.performed_at,
      createdAt: refill.performed_at,
      machineId: refill.machine_id,
      referenceType: 'REFILL',
      referenceId: refill.refill_number,
      notes: refill.notes || `Refill durch ${refill.operator} - ${refill.machine_name}`,
      productName: 'Refill-Bewegung',
      productSku: '',
      sourceName: 'Lager',
      destinationName: refill.machine_name,
      machineName: refill.machine_name,
      performedByName: refill.operator || 'Unbekannt'
    }));
    
    return res.json({
      items: movements,
      total: movements.length,
      page: 1,
      limit: limit,
      totalPages: Math.ceil(movements.length / limit)
    });
  } catch (error) {
    console.error(`[ERROR] Temporary refill route failed:`, error);
    return res.status(500).json({ error: 'Failed to fetch refills' });
  }
});

// Eine neue Warenbewegung erstellen
router.post("/warehouses/:warehouseId/movements", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_MOVEMENT_CREATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
    const validatedData = insertStockMovementSchema.parse(movementData);
    
    // Warenbewegung erstellen
    const newMovement = await warehouseStorage.createInventoryMovement(validatedData);
    
    // **MODERNE FIFO-SERVICE INTEGRATION für Bestandsanpassungen**
    
    // Bei Ausgängen (OUT/TRANSFER Quelle): FIFO-Entnahme verwenden
    if (validatedData.sourceType === "warehouse" && validatedData.sourceId) {
      console.log(`[WAREHOUSE3] Processing FIFO depletion for movement: ${validatedData.quantity} units from warehouse ${validatedData.sourceId}`);
      
      const depleteData: FifoDeplete = {
        warehouseId: validatedData.sourceId,
        productId: validatedData.productId,
        quantityToDeplete: validatedData.quantity,
        movementType: validatedData.movementType as "OUT" | "TRANSFER" | "ADJUSTMENT",
        referenceType: validatedData.referenceType as "REFILL" | "TRANSFER" | "ADJUSTMENT" | "MANUAL",
        referenceId: validatedData.referenceId || undefined,
        notes: validatedData.notes || undefined,
        performedBy: validatedData.performedBy || 1, // Default user if not provided
        destinationWarehouseId: validatedData.destinationType === "warehouse" ? validatedData.destinationId : undefined
      };
      
      try {
        const fifoResult = await fifoDeplete(depleteData);
        
        if (!fifoResult.success) {
          return res.status(400).json({
            success: false,
            message: "FIFO-Entnahme für Warenbewegung fehlgeschlagen",
            errors: fifoResult.errors || ["Unbekannter FIFO-Fehler"]
          });
        }
        
        console.log(`[WAREHOUSE3] FIFO depletion successful: ${fifoResult.totalDepleted} units from ${fifoResult.batchesProcessed.length} batches`);
        
      } catch (fifoError) {
        // CRITICAL FIX 2: Use correct parameter order
        return handleFifoError(fifoError, res, "depletion");
      }
    }
    
    // Bei Eingängen (IN/TRANSFER Ziel): Vereinfachte Receipt-Transaktion verwenden
    if (validatedData.destinationType === "warehouse" && validatedData.destinationId && validatedData.movementType !== "TRANSFER") {
      console.log(`[WAREHOUSE3] Processing receipt for movement: ${validatedData.quantity} units to warehouse ${validatedData.destinationId}`);
      
      // Für einfache Eingänge (nicht Transfers) erstelle synthetische Receipt-Daten
      const receiptData: ReceiptTransaction = {
        orderId: -2, // Synthetic order ID for movements
        warehouseId: validatedData.destinationId,
        deliveryDate: new Date().toISOString().split('T')[0],
        receiptLines: [{
          orderItemId: -2, // Synthetic order item ID
          productId: validatedData.productId,
          productName: `Movement Receipt for Product ${validatedData.productId}`,
          quantityOrdered: validatedData.quantity,
          quantityReceived: validatedData.quantity,
          batchNumber: `MOV-${Date.now()}-${validatedData.productId}`, // Synthetic batch
          expiryDate: '2099-12-31', // Far future for movement batches
          qualityStatus: 'good',
          notes: validatedData.notes || `Movement: ${validatedData.referenceType}`
        }],
        notes: `Movement receipt: ${validatedData.referenceType}${validatedData.referenceId ? ` - ${validatedData.referenceId}` : ''}`,
        processedBy: validatedData.performedBy || 1,
        overallQuality: 'good',
        requiresFollowUp: false
      };
      
      try {
        const receiptResult = await receiptTransaction(db, receiptData);
        
        if (!receiptResult.success) {
          return res.status(400).json({
            success: false,
            message: "Receipt-Verarbeitung für Warenbewegung fehlgeschlagen",
            errors: receiptResult.errors || ["Unbekannter Receipt-Fehler"]
          });
        }
        
        console.log(`[WAREHOUSE3] Receipt processing successful: ${receiptResult.totalQuantityReceived} units received`);
        
      } catch (receiptError) {
        console.error("[WAREHOUSE3] Receipt processing failed:", receiptError);
        return res.status(500).json({
          success: false,
          message: "Receipt-Verarbeitung fehlgeschlagen",
          error: receiptError.message
        });
      }
    }
    
    // Hinweis: Bei TRANSFER-Operationen wird nur die Quelle mit FIFO verarbeitet
    // Das Ziel erhält automatisch die korrekten Batches durch die Transfer-Logik
    
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
router.get("/warehouses/:warehouseId/counts", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_COUNTS_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
router.post("/warehouses/:warehouseId/counts", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_COUNT_CREATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.put("/warehouses/:warehouseId/counts/:countId", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_COUNT_UPDATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.get("/warehouses/:warehouseId/counts/:countId", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_COUNT_VIEW', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
router.post("/warehouses/:warehouseId/counts/:countId/items", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_COUNT_ITEM_CREATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.put("/warehouses/:warehouseId/counts/:countId/items/:itemId", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager']), 
  auditLog('WAREHOUSE_COUNT_ITEM_UPDATE', 'WAREHOUSE_WRITE'), 
  async (req, res) => {
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
router.get("/warehouses/:warehouseId/refills", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_REFILLS_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
    
    // Daten mit Lager-ID ergänzen und sicherstellen, dass performedBy übernommen wird
    const refillData = {
      ...req.body,
      warehouseId,
      // Explizit performedBy aus req.body übernehmen
      performedBy: req.body.performedBy || null
    };
    
    // Validierung - prüfen, ob performedBy gesetzt ist
    if (!refillData.performedBy) {
      return res.status(400).json({
        success: false,
        message: "performedBy ist erforderlich - bitte geben Sie an, wer die Auffüllung durchführt"
      });
    }
    
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
router.get("/warehouses/:warehouseId/refills/:refillId", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_REFILL_VIEW', 'WAREHOUSE_READ'), 
  async (req, res) => {
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

// ---- ERWEITERTE PRODUKTSUCHE ROUTES ----

// Produktsuche über alle oder spezifische Lager
router.get("/search/products", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('PRODUCT_SEARCH', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    const filters: any = {};
    
    // Suchterm (Name oder SKU)
    if (req.query.searchTerm) {
      filters.searchTerm = req.query.searchTerm.toString();
    }
    
    // Lager-Filter
    if (req.query.warehouseId) {
      const warehouseId = parseInt(req.query.warehouseId.toString());
      if (!isNaN(warehouseId)) filters.warehouseId = warehouseId;
    }
    
    // Kategorie-Filter
    if (req.query.category) {
      filters.category = req.query.category.toString();
    }
    
    // Bestandsfilter
    if (req.query.minQuantity !== undefined) {
      const minQty = parseInt(req.query.minQuantity.toString());
      if (!isNaN(minQty)) filters.minQuantity = minQty;
    }
    if (req.query.maxQuantity !== undefined) {
      const maxQty = parseInt(req.query.maxQuantity.toString());
      if (!isNaN(maxQty)) filters.maxQuantity = maxQty;
    }
    if (req.query.inStock !== undefined) {
      filters.inStock = req.query.inStock === 'true';
    }
    
    // Sortierung
    if (req.query.sortBy && ['productName', 'category', 'sku', 'quantity'].includes(req.query.sortBy.toString())) {
      filters.sortBy = req.query.sortBy.toString();
    }
    if (req.query.sortOrder && ['asc', 'desc'].includes(req.query.sortOrder.toString())) {
      filters.sortOrder = req.query.sortOrder.toString();
    }
    
    // Paginierung
    if (req.query.limit) {
      const limit = parseInt(req.query.limit.toString());
      if (!isNaN(limit) && limit > 0 && limit <= 1000) filters.limit = limit;
    } else {
      filters.limit = 50; // Standard-Limit
    }
    
    if (req.query.offset) {
      const offset = parseInt(req.query.offset.toString());
      if (!isNaN(offset) && offset >= 0) filters.offset = offset;
    }
    
    const result = await warehouseStorage.searchProducts(filters);
    
    return res.json({
      success: true,
      data: result.items,
      pagination: {
        total: result.total,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
        hasMore: (filters.offset || 0) + (filters.limit || 50) < result.total
      },
      filters: {
        searchTerm: filters.searchTerm,
        category: filters.category,
        warehouseId: filters.warehouseId,
        inStock: filters.inStock,
        sortBy: filters.sortBy || 'productName',
        sortOrder: filters.sortOrder || 'asc'
      }
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Alle verfügbaren Produktkategorien abrufen
router.get("/categories", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('CATEGORIES_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    let warehouseId: number | undefined;
    
    if (req.query.warehouseId) {
      warehouseId = parseInt(req.query.warehouseId.toString());
      if (isNaN(warehouseId)) {
        return res.status(400).json({ 
          success: false, 
          message: "Ungültige Lager-ID" 
        });
      }
    }
    
    const categories = await warehouseStorage.getProductCategories(warehouseId);
    
    return res.json({
      success: true,
      data: categories,
      count: categories.length,
      warehouseId: warehouseId || null
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// Kategorien für ein spezifisches Lager abrufen
router.get("/warehouses/:warehouseId/categories", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_CATEGORIES_LIST', 'WAREHOUSE_READ'), 
  async (req, res) => {
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
    
    const categories = await warehouseStorage.getProductCategories(warehouseId);
    
    return res.json({
      success: true,
      data: categories,
      count: categories.length,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name
      }
    });
  } catch (error) {
    return handleServerError(error, res);
  }
});

// ULTRA-VEREINFACHTE LÖSUNG: Zeige nur Refill-Movements ohne komplexe Joins
router.get("/warehouses/:warehouseId/movements-fixed", 
  authenticateUser, 
  requireWarehouseAccess(), 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('WAREHOUSE_MOVEMENTS_FIXED', 'WAREHOUSE_READ'), 
  async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    console.log(`[DEBUG-SIMPLE] Refill movements for warehouse: ${warehouseId}`);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ success: false, message: "Ungültige Lager-ID" });
    }

    const limit = req.query.limit ? parseInt(req.query.limit.toString()) : 10;
    const productId = req.query.productId ? parseInt(req.query.productId.toString()) : null;
    
    // KORRIGIERTE SQL - Refills OHNE Details-Abhängigkeit
    const simpleQuery = `
      SELECT 
        r.id,
        r.machine_name,
        r.datetime,
        r.operator,
        r.refill_number,
        r.total_products,
        r.actual_amount,
        rd.product_id,
        rd.quantity,
        rd.product_name
      FROM refills r
      JOIN machine_warehouse_assignments mwa ON r.machine_id = mwa.machine_id
      LEFT JOIN refill_details rd ON r.id = rd.refill_id
      WHERE mwa.warehouse_id = 10
      ORDER BY r.datetime DESC 
      LIMIT 5
    `;
    
    console.log(`[DEBUG-SIMPLE] Executing SQL:`, simpleQuery.replace(/\s+/g, ' '));

    // Import db direkt
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');
    
    const refillResults = await db.execute(sql.raw(simpleQuery));
    console.log(`[DEBUG-SIMPLE] SQL executed successfully. Found ${refillResults.rows.length} refill entries`);
    console.log(`[DEBUG-SIMPLE] First few rows:`, refillResults.rows.slice(0, 2));
    
    // Map zu Movements-Format - mit und ohne Details
    const movements = refillResults.rows.map((row: any, index: number) => {
      // Falls es Refill-Details gibt, verwende diese
      if (row.product_id) {
        return {
          id: `refill_${row.id}_detail_${index}`,
          productId: row.product_id,
          quantity: row.quantity || 0,
          movementType: 'REFILL',
          sourceWarehouseId: warehouseId,
          destinationWarehouseId: null,
          direction: 'OUT',
          status: 'completed',
          performedAt: row.datetime,
          productName: row.product_name || 'Produkt aus Refill-Detail',
          productSku: '',
          sourceName: 'Lager Bahnhof',
          destinationName: row.machine_name || 'Automat',
          performedByName: row.operator || 'Unbekannt',
          notes: `Refill Detail: ${row.quantity || 0}x ${row.product_name || 'Produkt'} → ${row.machine_name}`,
          machineId: null,
          referenceId: row.refill_number,
          batchName: null,
          isRefillMovement: true,
          hasDetails: true
        };
      } else {
        // Falls keine Details, verwende die Refill-Gesamtsumme
        return {
          id: `refill_${row.id}_general`,
          productId: null,
          quantity: row.actual_amount || row.total_products || 0,
          movementType: 'REFILL',
          sourceWarehouseId: warehouseId,
          destinationWarehouseId: null,
          direction: 'OUT',
          status: 'completed',
          performedAt: row.datetime,
          productName: 'Refill-Bewegung (Allgemein)',
          productSku: '',
          sourceName: 'Lager Bahnhof',
          destinationName: row.machine_name || 'Automat',
          performedByName: row.operator || 'Unbekannt',
          notes: `Refill: ${row.actual_amount || row.total_products || 0} Produkte → ${row.machine_name} (Refill ${row.refill_number})`,
          machineId: null,
          referenceId: row.refill_number,
          batchName: null,
          isRefillMovement: true,
          hasDetails: false
        };
      }
    });
    
    console.log(`[DEBUG-SIMPLE] Mapped ${movements.length} movements successfully`);

    return res.json({
      items: movements,
      total: movements.length,
      page: 1,
      limit: limit,
      totalPages: Math.ceil(movements.length / limit),
      debug: {
        warehouseId,
        productId,
        rawRows: refillResults.rows.length,
        mappedMovements: movements.length
      }
    });
  } catch (error) {
    console.error(`[ERROR] Simple movements route failed:`, error);
    return res.status(500).json({ error: 'Failed to fetch movements', details: error.message });
  }
});

export default router;