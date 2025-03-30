import { Router } from "express";
import { storage } from "../storage";
import {
  insertProductDisposalSchema,
  insertProductDisposalItemSchema,
} from "@shared/schema";
import { z } from "zod";

const router = Router();

// GET /api/product-disposals - Hole alle Warenentnahmen
router.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const warehouseId = req.query.warehouseId as string | undefined;
    
    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (warehouseId) filter.warehouseId = warehouseId;

    const disposals = await storage.getProductDisposals(filter);
    return res.json(disposals);
  } catch (error) {
    console.error("Error fetching product disposals:", error);
    return res.status(500).json({
      error: "Failed to fetch product disposals",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /api/product-disposals/:id - Hole Details einer Warenentnahme
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const disposal = await storage.getProductDisposalById(id);
    if (!disposal) {
      return res.status(404).json({ error: "Product disposal not found" });
    }

    // Hole die zugehörigen Items
    const items = await storage.getProductDisposalItems({ disposalId: id });

    return res.json({ ...disposal, items });
  } catch (error) {
    console.error(`Error fetching product disposal with ID ${req.params.id}:`, error);
    return res.status(500).json({
      error: "Failed to fetch product disposal",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /api/product-disposals - Neue Warenentnahme erstellen
router.post("/", async (req, res) => {
  try {
    // Validiere Request-Body
    const { items: itemsData, ...disposalData } = req.body;
    const validatedDisposalData = insertProductDisposalSchema.parse(disposalData);
    
    // Speichere Warenentnahme in DB
    const newDisposal = await storage.createProductDisposal(validatedDisposalData);

    // Speichere die Items, falls vorhanden
    let items = [];
    if (Array.isArray(itemsData) && itemsData.length > 0) {
      // Erstelle angepasstes Schema ohne disposalId-Erfordernis
      const disposalItemWithoutIdSchema = z.object({
        productId: z.string(),
        productName: z.string(),
        quantity: z.number().int().positive(),
        reason: z.string().optional(),
        previousStock: z.number().int().optional(),
        currentStock: z.number().int().optional()
      });
      
      const itemsSchema = z.array(disposalItemWithoutIdSchema);
      const validatedItems = itemsSchema.parse(itemsData);
      
      // Füge disposalId zu jedem Item hinzu
      const itemsWithDisposalId = validatedItems.map(item => ({
        ...item,
        disposalId: newDisposal.id
      }));
      
      // Speichere Items in DB
      items = await storage.createProductDisposalItems(itemsWithDisposalId);
    }

    return res.status(201).json({ ...newDisposal, items });
  } catch (error) {
    console.error("Error creating product disposal:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    return res.status(500).json({
      error: "Failed to create product disposal",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /api/product-disposals/:id/items - Items zu einer Warenentnahme hinzufügen
router.post("/:id/items", async (req, res) => {
  try {
    const disposalId = parseInt(req.params.id, 10);
    if (isNaN(disposalId)) {
      return res.status(400).json({ error: "Invalid disposal ID format" });
    }

    // Prüfe, ob die Warenentnahme existiert
    const disposal = await storage.getProductDisposalById(disposalId);
    if (!disposal) {
      return res.status(404).json({ error: "Product disposal not found" });
    }

    // Validiere Request-Body (Array von Items)
    const itemsSchema = z.array(insertProductDisposalItemSchema);
    const validatedItems = itemsSchema.parse(req.body);

    // Füge disposalId zu jedem Item hinzu
    const itemsWithDisposalId = validatedItems.map(item => ({
      ...item,
      disposalId
    }));

    // Speichere Items in DB
    const createdItems = await storage.createProductDisposalItems(itemsWithDisposalId);

    return res.status(201).json(createdItems);
  } catch (error) {
    console.error(`Error adding items to product disposal with ID ${req.params.id}:`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    return res.status(500).json({
      error: "Failed to add items to product disposal",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /api/product-disposals/:id/status - Status einer Warenentnahme aktualisieren
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

    // Hole die aktuelle Warenentnahme
    const disposal = await storage.getProductDisposalById(id);
    if (!disposal) {
      return res.status(404).json({ error: "Product disposal not found" });
    }

    // Wenn Status auf "completed" geändert wird, aktualisiere Lagerbestand
    if (status === "completed" && disposal.status !== "completed") {
      // Hole die Items dieser Warenentnahme
      const items = await storage.getProductDisposalItems({ disposalId: id });
      
      // Aktualisiere den Lagerbestand für jedes Item
      for (const item of items) {
        await storage.updateInventoryForDisposal(
          disposal.warehouseId, 
          item.productId, 
          item.quantity
        );
      }

      // Setze completedAt auf aktuelle Zeit
      const updatedDisposal = await storage.updateProductDisposal(id, {
        status,
        completedAt: new Date().toISOString(),
      });

      return res.json(updatedDisposal);
    } else {
      // Einfache Statusänderung ohne Lagerbestandsanpassung
      const updatedDisposal = await storage.updateProductDisposal(id, { status });
      return res.json(updatedDisposal);
    }
  } catch (error) {
    console.error(`Error updating status of product disposal with ID ${req.params.id}:`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }
    return res.status(500).json({
      error: "Failed to update product disposal status",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// DELETE /api/product-disposals/:id - Eine Warenentnahme löschen (nur im Status "pending")
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    // Hole die Warenentnahme
    const disposal = await storage.getProductDisposalById(id);
    if (!disposal) {
      return res.status(404).json({ error: "Product disposal not found" });
    }

    // Erlaube Löschen nur, wenn Status "pending" ist
    if (disposal.status !== "pending") {
      return res.status(400).json({
        error: "Cannot delete product disposal",
        details: "Only pending product disposals can be deleted",
      });
    }

    // Lösche zuerst alle Items
    await storage.deleteProductDisposalItems({ disposalId: id });
    
    // Dann lösche die Warenentnahme selbst
    await storage.deleteProductDisposal(id);

    return res.status(204).end();
  } catch (error) {
    console.error(`Error deleting product disposal with ID ${req.params.id}:`, error);
    return res.status(500).json({
      error: "Failed to delete product disposal",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;