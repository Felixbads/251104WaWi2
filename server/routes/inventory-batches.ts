import express, { Request, Response } from 'express';
import { db } from '../db';
import { productBatches, products } from '@shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

const router = express.Router();

// GET /api/inventory-batches/product/:productId/warehouse/:warehouseId
// Hole alle Batches für ein Produkt in einem bestimmten Lager
router.get('/product/:productId/warehouse/:warehouseId', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.productId);
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (isNaN(productId) || isNaN(warehouseId)) {
      return res.status(400).json({ 
        error: 'Ungültige Produkt- oder Lager-ID' 
      });
    }
    
    console.log(`Lade Batches für Produkt ${productId} in Lager ${warehouseId}`);
    
    // Lade alle Batches für dieses Produkt und Lager
    const batches = await db
      .select()
      .from(productBatches)
      .where(
        and(
          eq(productBatches.productId, productId),
          eq(productBatches.warehouseId, warehouseId)
        )
      )
      .orderBy(
        desc(productBatches.status), // Aktive Batches zuerst
        desc(productBatches.expiryDate) // Batches mit späterem Ablaufdatum zuerst
      );
    
    console.log(`${batches.length} Batches gefunden`);
    
    // Formatiere die Batches für die Antwort
    const formattedBatches = batches.map(batch => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      productId: batch.productId,
      warehouseId: batch.warehouseId,
      initialQuantity: batch.initialQuantity,
      currentQuantity: batch.currentQuantity,
      expiryDate: batch.expiryDate,
      status: batch.status,
      locationInWarehouse: batch.locationInWarehouse,
      notes: batch.notes
    }));
    
    res.json(formattedBatches);
  } catch (error) {
    console.error("Fehler beim Laden der Batches:", error);
    res.status(500).json({ 
      error: "Fehler beim Laden der Batches", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST /api/inventory-batches
// Erstelle einen neuen Batch für ein Produkt
router.post('/', async (req: Request, res: Response) => {
  try {
    const batchData = req.body;
    
    if (!batchData.productId || !batchData.warehouseId || !batchData.batchNumber) {
      return res.status(400).json({ 
        error: 'Produkt-ID, Lager-ID und Chargennummer sind erforderlich' 
      });
    }
    
    console.log(`Erstelle neue Charge für Produkt ${batchData.productId} in Lager ${batchData.warehouseId}`);
    
    // Überprüfe, ob das Produkt existiert
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, batchData.productId))
      .limit(1);
    
    if (!product) {
      return res.status(404).json({ 
        error: 'Produkt nicht gefunden' 
      });
    }
    
    // Erstelle den neuen Batch
    const [newBatch] = await db
      .insert(productBatches)
      .values({
        productId: batchData.productId,
        warehouseId: batchData.warehouseId,
        batchNumber: batchData.batchNumber,
        initialQuantity: batchData.initialQuantity || 0,
        currentQuantity: batchData.currentQuantity || batchData.initialQuantity || 0,
        expiryDate: batchData.expiryDate || null,
        status: batchData.status || 'active',
        locationInWarehouse: batchData.locationInWarehouse || null,
        notes: batchData.notes || null
      })
      .returning();
    
    console.log(`Neue Charge erstellt: ID ${newBatch.id}`);
    
    res.status(201).json(newBatch);
  } catch (error) {
    console.error("Fehler beim Erstellen der Charge:", error);
    res.status(500).json({ 
      error: "Fehler beim Erstellen der Charge", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// PUT /api/inventory-batches/:id
// Aktualisiere einen bestehenden Batch
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.id);
    const batchData = req.body;
    
    if (isNaN(batchId)) {
      return res.status(400).json({ 
        error: 'Ungültige Batch-ID' 
      });
    }
    
    console.log(`Aktualisiere Charge ${batchId}`);
    
    // Überprüfe, ob der Batch existiert
    const [existingBatch] = await db
      .select()
      .from(productBatches)
      .where(eq(productBatches.id, batchId))
      .limit(1);
    
    if (!existingBatch) {
      return res.status(404).json({ 
        error: 'Charge nicht gefunden' 
      });
    }
    
    // Aktualisiere den Batch
    const [updatedBatch] = await db
      .update(productBatches)
      .set({
        batchNumber: batchData.batchNumber || existingBatch.batchNumber,
        initialQuantity: batchData.initialQuantity !== undefined ? batchData.initialQuantity : existingBatch.initialQuantity,
        currentQuantity: batchData.currentQuantity !== undefined ? batchData.currentQuantity : existingBatch.currentQuantity,
        expiryDate: batchData.expiryDate !== undefined ? batchData.expiryDate : existingBatch.expiryDate,
        status: batchData.status || existingBatch.status,
        locationInWarehouse: batchData.locationInWarehouse !== undefined ? batchData.locationInWarehouse : existingBatch.locationInWarehouse,
        notes: batchData.notes !== undefined ? batchData.notes : existingBatch.notes
      })
      .where(eq(productBatches.id, batchId))
      .returning();
    
    console.log(`Charge ${batchId} aktualisiert`);
    
    res.json(updatedBatch);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Charge:", error);
    res.status(500).json({ 
      error: "Fehler beim Aktualisieren der Charge", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;