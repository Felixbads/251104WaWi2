import { Router } from "express";
import { storage } from "../storage";
import {
  insertInventoryTransferSchema,
  insertInventoryTransferItemSchema,
} from "@shared/schema";
import { z } from "zod";

const router = Router();

// GET /api/inventory-transfers - Hole alle Warenbewegungen
router.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const warehouseId = req.query.warehouseId as string | undefined;
    
    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (warehouseId) filter.warehouseId = warehouseId;

    const transfers = await storage.getInventoryTransfers(filter);
    return res.json(transfers);
  } catch (error) {
    console.error("Error fetching inventory transfers:", error);
    return res.status(500).json({
      error: "Failed to fetch inventory transfers",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /api/inventory-transfers/:id - Hole Details einer Warenbewegung
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const transfer = await storage.getInventoryTransferById(id);
    if (!transfer) {
      return res.status(404).json({ error: "Inventory transfer not found" });
    }

    // Hole die zugehörigen Items
    const items = await storage.getInventoryTransferItems({ transferId: id });
    return res.json({ ...transfer, items });
  } catch (error) {
    console.error(`Error fetching inventory transfer with ID ${req.params.id}:`, error);
    return res.status(500).json({
      error: "Failed to fetch inventory transfer",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /api/inventory-transfers - Neue Warenbewegung erstellen
router.post("/", async (req, res) => {
  try {
    // Validiere Request-Body
    const { items: itemsData, ...transferData } = req.body;
    const validatedTransferData = insertInventoryTransferSchema.parse(transferData);
    
    // Speichere Warenbewegung in DB
    const newTransfer = await storage.createInventoryTransfer(validatedTransferData);
    
    // Validiere Items
    const itemsSchema = z.array(insertInventoryTransferItemSchema);
    const validatedItems = itemsSchema.parse(itemsData);
    
    // Füge transferId zu Items hinzu und speichere sie
    if (validatedItems && validatedItems.length > 0) {
      const itemsWithTransferId = validatedItems.map(item => ({
        ...item,
        transferId: newTransfer.id
      }));
      
      await storage.createInventoryTransferItems(itemsWithTransferId);
    }
    
    // Hole die vollständige Warenbewegung mit Items
    const completedTransfer = await storage.getInventoryTransferById(newTransfer.id);
    const items = await storage.getInventoryTransferItems({ transferId: newTransfer.id });
    
    return res.status(201).json({ ...completedTransfer, items });
  } catch (error) {
    console.error("Error creating inventory transfer:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    return res.status(500).json({
      error: "Failed to create inventory transfer",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /api/inventory-transfers/:id/items - Items zu einer Warenbewegung hinzufügen
router.post("/:id/items", async (req, res) => {
  try {
    const transferId = parseInt(req.params.id, 10);
    if (isNaN(transferId)) {
      return res.status(400).json({ error: "Invalid transfer ID format" });
    }

    // Prüfe, ob die Warenbewegung existiert
    const transfer = await storage.getInventoryTransferById(transferId);
    if (!transfer) {
      return res.status(404).json({ error: "Inventory transfer not found" });
    }

    // Validiere Request-Body (Array von Items)
    const itemsSchema = z.array(insertInventoryTransferItemSchema);
    const validatedItems = itemsSchema.parse(req.body);

    // Füge transferId zu jedem Item hinzu
    const itemsWithTransferId = validatedItems.map(item => ({
      ...item,
      transferId
    }));

    // Speichere Items in DB
    const createdItems = await storage.createInventoryTransferItems(itemsWithTransferId);

    return res.status(201).json(createdItems);
  } catch (error) {
    console.error(`Error adding items to inventory transfer with ID ${req.params.id}:`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    return res.status(500).json({
      error: "Failed to add items to inventory transfer",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /api/inventory-transfers/:id/status - Status einer Warenbewegung aktualisieren
router.put("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const statusSchema = z.object({
      status: z.enum(["pending", "completed", "cancelled"]),
    });

    const { status } = statusSchema.parse(req.body);

    // Hole die aktuelle Warenbewegung
    const transfer = await storage.getInventoryTransferById(id);
    if (!transfer) {
      return res.status(404).json({ error: "Inventory transfer not found" });
    }

    // Wenn Status auf "completed" geändert wird, aktualisiere Lagerbestand
    if (status === "completed" && transfer.status !== "completed") {
      // Hole die Items dieser Warenbewegung
      const items = await storage.getInventoryTransferItems({ transferId: id });
      
      // Aktualisiere den Lagerbestand für jedes Item
      for (const item of items) {
        const result = await storage.updateInventoryForTransfer(
          transfer.sourceWarehouseId, 
          transfer.targetWarehouseId, 
          item.productId, 
          item.quantity
        );
        
        if (!result.success) {
          return res.status(400).json({
            error: "Insufficient stock",
            details: `Product ${item.productId} has insufficient stock in warehouse ${transfer.sourceWarehouseId} (available: ${result.sourceStock}, requested: ${item.quantity})`,
          });
        }
      }

      // Setze completedAt auf aktuelle Zeit
      const updatedTransfer = await storage.updateInventoryTransfer(id, {
        status,
        completedAt: new Date(),
      });
      
      return res.json(updatedTransfer);
    } else {
      // Einfaches Status-Update ohne Lagerbestandsänderung
      const updatedTransfer = await storage.updateInventoryTransfer(id, { status });
      return res.json(updatedTransfer);
    }
  } catch (error) {
    console.error(`Error updating inventory transfer status with ID ${req.params.id}:`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    return res.status(500).json({
      error: "Failed to update inventory transfer status",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;