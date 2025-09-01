import { Router } from "express";
import { storage } from "../storage";
import {
  insertInventoryTransferSchema,
  insertInventoryTransferItemSchema,
  productBatches,
  inventoryItems,
  inventoryMovements
} from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq, and } from "drizzle-orm";

const router = Router();

// Hilfsfunktion für Chargen-basierte Umlagerungen
async function processBatchTransfer(
  sourceWarehouseId: number, 
  targetWarehouseId: number, 
  productId: number, 
  quantity: number, 
  selectedBatchIds: number[]
): Promise<{ success: boolean; message?: string; sourceStock?: number }> {
  try {
    console.log('[BATCH_TRANSFER] Processing batch transfer:', { 
      sourceWarehouseId, targetWarehouseId, productId, quantity, selectedBatchIds 
    });

    // Hole die ausgewählten Chargen
    const batches = await db.select().from(productBatches)
      .where(and(
        eq(productBatches.warehouseId, sourceWarehouseId),
        eq(productBatches.productId, productId)
      ));

    const selectedBatches = batches.filter(batch => selectedBatchIds.includes(batch.id));
    
    // Prüfe verfügbare Menge in den ausgewählten Chargen
    const availableQuantity = selectedBatches.reduce((sum, batch) => sum + (batch.currentQuantity || 0), 0);
    
    if (availableQuantity < quantity) {
      return {
        success: false,
        sourceStock: availableQuantity,
        message: `Insufficient batch stock (available: ${availableQuantity}, requested: ${quantity})`
      };
    }

    // Reduziere die Chargen nach FIFO-Prinzip
    let remainingQuantity = quantity;
    for (const batch of selectedBatches.sort((a, b) => new Date(a.expiryDate || '').getTime() - new Date(b.expiryDate || '').getTime())) {
      if (remainingQuantity <= 0) break;
      
      const batchQuantity = Math.min(batch.currentQuantity || 0, remainingQuantity);
      const newCurrentQuantity = (batch.currentQuantity || 0) - batchQuantity;
      
      // Aktualisiere die Charge
      await db.update(productBatches)
        .set({ 
          currentQuantity: newCurrentQuantity,
          updatedAt: new Date()
        })
        .where(eq(productBatches.id, batch.id));
      
      remainingQuantity -= batchQuantity;
      console.log(`[BATCH_TRANSFER] Updated batch ${batch.batchNumber}: ${batchQuantity} transferred, ${newCurrentQuantity} remaining`);
    }

    // Aktualisiere das Inventar im Ziellager
    const targetItem = await storage.getInventoryItemByProductAndWarehouse(productId, targetWarehouseId);
    
    if (targetItem) {
      // Update existing target inventory
      await db.update(inventoryItems)
        .set({ 
          quantity: (targetItem.quantity || 0) + quantity,
          updatedAt: new Date()
        })
        .where(and(
          eq(inventoryItems.productId, productId),
          eq(inventoryItems.warehouseId, targetWarehouseId)
        ));
    } else {
      // Create new target inventory item
      await db.insert(inventoryItems).values({
        productId,
        warehouseId: targetWarehouseId,
        quantity,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Aktualisiere das Quell-Inventar
    const sourceItem = await storage.getInventoryItemByProductAndWarehouse(productId, sourceWarehouseId);
    if (sourceItem) {
      await db.update(inventoryItems)
        .set({ 
          quantity: (sourceItem.quantity || 0) - quantity,
          updatedAt: new Date()
        })
        .where(and(
          eq(inventoryItems.productId, productId),
          eq(inventoryItems.warehouseId, sourceWarehouseId)
        ));
    }

    // Erstelle Bewegungs-Audit-Trail
    await db.insert(inventoryMovements).values([
      {
        productId,
        sourceWarehouseId,
        destinationWarehouseId: null,
        movementType: 'batch_transfer_out',
        quantity: -quantity,
        referenceType: 'transfer',
        notes: `Batch transfer to warehouse ${targetWarehouseId} (batches: ${selectedBatchIds.join(', ')})`,
        createdAt: new Date(),
        performedAt: new Date(),
        performedBy: null
      },
      {
        productId,
        sourceWarehouseId: null,
        destinationWarehouseId: targetWarehouseId,
        movementType: 'batch_transfer_in',
        quantity: quantity,
        referenceType: 'transfer',
        notes: `Batch transfer from warehouse ${sourceWarehouseId} (batches: ${selectedBatchIds.join(', ')})`,
        createdAt: new Date(),
        performedAt: new Date(),
        performedBy: null
      }
    ]);

    console.log('[BATCH_TRANSFER] Successfully completed batch transfer');
    return { success: true };
  } catch (error) {
    console.error('[BATCH_TRANSFER] Error processing batch transfer:', error);
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

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

// POST /api/inventory-transfers - Neue Warenbewegung erstellen und sofort ausführen
router.post("/", async (req, res) => {
  try {
    console.log("Transfer Request Body:", JSON.stringify(req.body, null, 2));
    
    // Validiere Request-Body
    const { items: itemsData, autoExecute = true, ...transferData } = req.body;
    const validatedTransferData = insertInventoryTransferSchema.parse(transferData);
    
    // Validiere Items zuerst - erweitert um selectedBatchIds
    const itemsSchema = z.array(insertInventoryTransferItemSchema.omit({ transferId: true }).extend({
      selectedBatchIds: z.array(z.number()).optional()
    }));
    const validatedItems = itemsSchema.parse(itemsData);
    
    console.log("Validated transfer data:", validatedTransferData);
    console.log("Validated items:", validatedItems);
    
    // Prüfe Lagerbestände vor der Erstellung
    if (autoExecute) {
      for (const item of validatedItems) {
        const sourceStock = await storage.getInventoryItemByProductAndWarehouse(
          item.productId, 
          validatedTransferData.sourceWarehouseId
        );
        
        if (!sourceStock || (sourceStock.quantity || 0) < item.quantity) {
          return res.status(400).json({
            error: "Insufficient stock",
            details: `Product ${item.productName || item.productId} has insufficient stock in source warehouse (available: ${sourceStock?.quantity || 0}, requested: ${item.quantity})`,
          });
        }
      }
    }
    
    // Speichere Warenbewegung in DB
    const newTransfer = await storage.createInventoryTransfer(validatedTransferData);
    console.log("Created transfer:", newTransfer);
    
    // Füge transferId zu Items hinzu und speichere sie
    if (validatedItems && validatedItems.length > 0) {
      const itemsWithTransferId = validatedItems.map(item => ({
        ...item,
        transferId: newTransfer.id
      }));
      
      await storage.createInventoryTransferItems(itemsWithTransferId);
      console.log("Created transfer items:", itemsWithTransferId.length);
    }
    
    // Wenn autoExecute=true, führe Transfer sofort aus
    if (autoExecute) {
      console.log("Auto-executing transfer...");
      
      // Aktualisiere den Lagerbestand für jedes Item
      for (const item of validatedItems) {
        let result;
        
        // Verwende Chargen-basierte Umlagerung falls Chargen-IDs vorhanden sind
        if (item.selectedBatchIds && item.selectedBatchIds.length > 0) {
          console.log(`Processing batch transfer for product ${item.productId} with batches:`, item.selectedBatchIds);
          result = await processBatchTransfer(
            validatedTransferData.sourceWarehouseId, 
            validatedTransferData.targetWarehouseId, 
            item.productId, 
            item.quantity,
            item.selectedBatchIds
          );
        } else {
          // Standard-Umlagerung ohne spezifische Chargen
          result = await storage.updateInventoryForTransfer(
            validatedTransferData.sourceWarehouseId, 
            validatedTransferData.targetWarehouseId, 
            item.productId, 
            item.quantity
          );
        }
        
        console.log(`Transfer result for product ${item.productId}:`, result);
        
        if (!result.success) {
          // Rollback: Lösche erstellten Transfer
          await storage.deleteInventoryTransfer(newTransfer.id);
          return res.status(400).json({
            error: "Transfer execution failed",
            details: `Product ${item.productName || item.productId}: Ungenügender Bestand`,
          });
        }
      }

      // Setze Transfer auf "completed"
      await storage.updateInventoryTransfer(newTransfer.id, {
        status: "completed",
        completedAt: new Date(),
      });
      
      console.log("Transfer completed successfully");
    }
    
    // Hole die vollständige Warenbewegung mit Items
    const completedTransfer = await storage.getInventoryTransferById(newTransfer.id);
    const items = await storage.getInventoryTransferItems({ transferId: newTransfer.id });
    
    return res.status(201).json({ 
      ...completedTransfer, 
      items,
      executed: autoExecute 
    });
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