import express, { Request, Response } from 'express';
import { storage } from '../storage';

const router = express.Router();

// GET /inventory-count-detail?id=1 - Abrufen einer spezifischen Inventurzählung nach ID
router.get('/inventory-count-detail', async (req: Request, res: Response) => {
  try {
    const inventoryCountId = req.query.id ? parseInt(req.query.id as string) : null;
    
    if (!inventoryCountId || isNaN(inventoryCountId)) {
      return res.status(400).json({ error: "Ungültige oder fehlende Inventurzählungs-ID" });
    }
    
    // Verwende getInventoryCountById, um die Inventurzählung mit allen Details abzurufen
    const count = await storage.getInventoryCountById(inventoryCountId);
    
    if (!count) {
      return res.status(404).json({ error: "Inventurzählung nicht gefunden" });
    }
    
    res.json(count);
  } catch (error) {
    console.error(`Error fetching inventory count with ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: "Failed to fetch inventory count", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Debug-Routes für Batch-Funktionalität
router.get('/product-batches', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    
    // TypeScript berücksichtigt hier nicht alle möglichen Parameter des Interfaces,
    // daher müssen wir die Parameter manuell filtern
    const filter: any = {
      includeDetails: true
    };
    
    if (limit) filter.limit = limit;
    if (offset) filter.offset = offset;
    if (warehouseId) filter.warehouseId = warehouseId;
    if (productId) filter.productId = productId;
    
    const batches = await storage.getProductBatches(filter);
    
    res.json(batches);
  } catch (error) {
    console.error("Error fetching product batches:", error);
    res.status(500).json({ 
      error: "Failed to fetch product batches", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Hole einen bestimmten Batch anhand der ID
router.get('/product-batches/:id', async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.id);
    
    if (isNaN(batchId)) {
      return res.status(400).json({ error: "Invalid batch ID" });
    }
    
    const batch = await storage.getProductBatchById(batchId);
    
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    res.json(batch);
  } catch (error) {
    console.error(`Error fetching batch with ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: "Failed to fetch batch", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Hole Bewegungen für einen bestimmten Batch
router.get('/product-batches/:id/movements', async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.id);
    
    if (isNaN(batchId)) {
      return res.status(400).json({ error: "Invalid batch ID" });
    }
    
    // Verwende getProductMovements mit einem Filter für die Batch-ID
    const movements = await storage.getProductMovements({
      productBatchId: batchId
    });
    
    res.json(movements);
  } catch (error) {
    console.error(`Error fetching movements for batch ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: "Failed to fetch batch movements", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Lade Bestandsübersicht für ein Lager
router.get('/warehouse-inventory/:warehouseId', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: "Invalid warehouse ID" });
    }
    
    // Use das allgemeinere getInventoryItems mit einem Filter für das Lager
    const inventory = await storage.getInventoryItems({ 
      warehouseId: warehouseId 
    });
    
    res.json(inventory);
  } catch (error) {
    console.error(`Error fetching inventory for warehouse ID ${req.params.warehouseId}:`, error);
    res.status(500).json({ 
      error: "Failed to fetch warehouse inventory", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Produktbewegungen abfragen
router.get('/product-movements', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    const batchId = req.query.batchId ? parseInt(req.query.batchId as string) : undefined;
    const movementType = req.query.movementType as string | undefined;
    
    // Erstelle ein Filterobjekt mit nur den gültigen Parametern
    const filter: any = {
      limit,
      offset,
      includeDetails: true
    };
    
    // Füge die spezifischen Filter hinzu, wenn sie definiert sind
    if (productId) filter.productId = productId;
    if (batchId) filter.productBatchId = batchId;
    if (movementType) filter.movementType = movementType;
    
    // warehouseId ist im Interface möglicherweise nicht definiert,
    // aber wir fügen es hinzu, da storage.getProductMovements damit umgehen kann
    if (warehouseId) filter.sourceId = warehouseId;
    
    const movements = await storage.getProductMovements(filter);
    
    res.json(movements);
  } catch (error) {
    console.error("Error fetching product movements:", error);
    res.status(500).json({ 
      error: "Failed to fetch product movements", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Erstelle einen Debug-Batch für Testzwecke
router.post('/create-test-batch', async (req: Request, res: Response) => {
  try {
    const { productId, warehouseId, quantity, expirationDate, batchNumber } = req.body;
    
    if (!productId || !warehouseId || !quantity) {
      return res.status(400).json({ 
        error: "Missing required fields", 
        required: "productId, warehouseId, quantity" 
      });
    }
    
    // TypeScript berücksichtigt hier nicht alle Feldnamen, daher verwenden wir any
    const batchData: any = {
      productId,
      warehouseId,
      initialQuantity: quantity,
      batchNumber: batchNumber || `TEST-${Date.now()}`
    };
    
    // Füge expirationDate hinzu, wenn es definiert ist
    if (expirationDate) {
      // Die Eigenschaft heißt im Interface möglicherweise anders
      batchData.expiryDate = new Date(expirationDate).toISOString().split('T')[0];
    }
    
    const newBatch = await storage.createProductBatch(batchData);
    
    res.status(201).json(newBatch);
  } catch (error) {
    console.error("Error creating test batch:", error);
    res.status(500).json({ 
      error: "Failed to create test batch", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Führe eine Produktbewegung durch (für Tests)
router.post('/product-movement', async (req: Request, res: Response) => {
  try {
    const { 
      batchId, 
      productId,
      fromWarehouseId, 
      toWarehouseId, 
      machineId,
      quantity, 
      movementType, 
      reason,
      notes
    } = req.body;
    
    if ((!batchId && !productId) || !quantity || !movementType) {
      return res.status(400).json({ 
        error: "Missing required fields", 
        required: "batchId or productId, quantity, movementType" 
      });
    }
    
    // TypeScript berücksichtigt hier nicht alle Feldnamen, daher verwenden wir any
    const movementData: any = {
      quantity,
      movementType
    };
    
    // Füge die optionalen Felder hinzu
    if (batchId) movementData.productBatchId = batchId;
    if (productId) movementData.productId = productId;
    if (fromWarehouseId) {
      movementData.sourceType = 'warehouse';
      movementData.sourceId = fromWarehouseId;
    }
    if (toWarehouseId) {
      movementData.destinationType = 'warehouse';
      movementData.destinationId = toWarehouseId;
    }
    if (machineId) {
      movementData.destinationType = 'machine';
      movementData.destinationId = machineId;
    }
    if (reason) movementData.reason = reason;
    if (notes) movementData.notes = notes;
    
    const movement = await storage.createProductMovement(movementData);
    
    res.status(201).json(movement);
  } catch (error) {
    console.error("Error creating product movement:", error);
    res.status(500).json({ 
      error: "Failed to create product movement", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;