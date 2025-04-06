import express, { Request, Response } from 'express';
import { storage } from '../storage';

const router = express.Router();

// Debug-Routes für Batch-Funktionalität
router.get('/product-batches', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    
    const batches = await storage.getProductBatches({ 
      limit, 
      offset, 
      warehouseId, 
      productId,
      includeDetails: true
    });
    
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
    
    const movements = await storage.getProductMovementsByBatchId(batchId);
    
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
    
    const inventory = await storage.getWarehouseInventory(warehouseId);
    
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
    
    const movements = await storage.getProductMovements({ 
      limit, 
      offset, 
      warehouseId, 
      productId,
      batchId,
      movementType,
      includeDetails: true
    });
    
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
    
    const newBatch = await storage.createProductBatch({
      productId,
      warehouseId,
      initialQuantity: quantity,
      expirationDate: expirationDate ? new Date(expirationDate) : undefined,
      batchNumber: batchNumber || `TEST-${Date.now()}`
    });
    
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
      fromWarehouseId, 
      toWarehouseId, 
      machineId,
      quantity, 
      movementType, 
      reason,
      notes
    } = req.body;
    
    if (!batchId || !quantity || !movementType) {
      return res.status(400).json({ 
        error: "Missing required fields", 
        required: "batchId, quantity, movementType" 
      });
    }
    
    const movement = await storage.createProductMovement({
      batchId,
      fromWarehouseId,
      toWarehouseId,
      machineId,
      quantity,
      movementType,
      reason,
      notes
    });
    
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