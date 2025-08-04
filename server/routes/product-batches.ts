import express, { Request, Response } from 'express';
import { db } from '../db';
import { eq, and, gte, desc, asc, lt, isNull, min, sql } from 'drizzle-orm';
import { productBatches, products, warehouses } from '@shared/schema';

const router = express.Router();

// GET /api/product-batches - Alle Produkt-Batches abrufen
router.get('/', async (req: Request, res: Response) => {
  try {
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const expiringSoon = req.query.expiringSoon === 'true';
    const currentDate = new Date();
    
    // Setzt das Ablaufdatum für "bald ablaufend" auf 14 Tage in der Zukunft
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + 14);
    
    let query = db.select()
      .from(productBatches)
      .leftJoin(products, eq(productBatches.productId, products.id))
      .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id));
    
    // Filter anwenden
    if (productId) {
      query = query.where(eq(productBatches.productId, productId));
    }
    
    if (warehouseId) {
      query = query.where(eq(productBatches.warehouseId, warehouseId));
    }
    
    if (expiringSoon) {
      query = query.where(
        and(
          // Nur Batches mit einem Ablaufdatum
          lt(productBatches.expiryDate, expiryThreshold),
          gte(productBatches.expiryDate, currentDate),
          // Nur Batches mit einer Menge > 0
          gte(productBatches.currentQuantity, 1)
        )
      );
    }
    
    // Nach Ablaufdatum sortieren (aufsteigend = zuerst ablaufende)
    query = query.orderBy(asc(productBatches.expiryDate));
    
    const batches = await query;
    
    // Formatiere das Ergebnis
    const formattedBatches = batches.map((row) => ({
      id: row.product_batches.id,
      batchNumber: row.product_batches.batchNumber,
      productId: row.product_batches.productId,
      warehouseId: row.product_batches.warehouseId,
      initialQuantity: row.product_batches.initialQuantity,
      currentQuantity: row.product_batches.currentQuantity,
      expiryDate: row.product_batches.expiryDate,
      manufacturingDate: row.product_batches.manufacturingDate,
      notes: row.product_batches.notes,
      locationInWarehouse: row.product_batches.locationInWarehouse,
      status: row.product_batches.status,
      createdAt: row.product_batches.createdAt,
      updatedAt: row.product_batches.updatedAt,
      productName: row.products?.productName || null,
      warehouseName: row.warehouses?.name || null
    }));
    
    res.json(formattedBatches);
  } catch (error) {
    console.error('Fehler beim Abrufen der Produkt-Batches:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Produkt-Batches',
      details: (error as Error).message 
    });
  }
});

// GET /api/product-batches/next-expiring - Nächste ablaufende Batches für jedes Produkt oder Lager
router.get('/next-expiring', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    const currentDate = new Date();
    
    // SQL für die Abfrage
    const query = `
      WITH RankedBatches AS (
        SELECT 
          pb.*,
          p.name as product_name,
          ROW_NUMBER() OVER (
            PARTITION BY pb.product_id
            ORDER BY pb.expiry_date ASC NULLS LAST
          ) as row_num
        FROM product_batches pb
        LEFT JOIN products p ON pb.product_id = p.id
        WHERE 
          pb.current_quantity > 0
          AND (pb.expiry_date IS NULL OR pb.expiry_date >= NOW())
          ${warehouseId ? `AND pb.warehouse_id = ${warehouseId}` : ''}
          ${productId ? `AND pb.product_id = ${productId}` : ''}
      )
      SELECT * FROM RankedBatches
      WHERE row_num = 1
      ORDER BY expiry_date ASC NULLS LAST;
    `;
    
    const nextExpiringBatches = await db.execute(query);
    
    // Formatiere das Ergebnis
    const formattedBatches = nextExpiringBatches.map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      initialQuantity: row.initial_quantity,
      currentQuantity: row.current_quantity,
      expiryDate: row.expiry_date,
      manufacturingDate: row.manufacturing_date,
      notes: row.notes,
      locationInWarehouse: row.location_in_warehouse,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      productName: row.product_name || null
    }));
    
    res.json(formattedBatches);
  } catch (error) {
    console.error('Fehler beim Abrufen der nächsten ablaufenden Batches:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der nächsten ablaufenden Batches',
      details: (error as Error).message 
    });
  }
});

// GET /api/product-batches/:id - Einen Batch anhand seiner ID abrufen
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Batch-ID' });
    }
    
    const batch = await db.select()
      .from(productBatches)
      .leftJoin(products, eq(productBatches.productId, products.id))
      .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
      .where(eq(productBatches.id, id))
      .limit(1);
    
    if (batch.length === 0) {
      return res.status(404).json({ error: 'Batch nicht gefunden' });
    }
    
    // Formatiere das Ergebnis
    const formattedBatch = {
      id: batch[0].product_batches.id,
      batchNumber: batch[0].product_batches.batchNumber,
      productId: batch[0].product_batches.productId,
      warehouseId: batch[0].product_batches.warehouseId,
      initialQuantity: batch[0].product_batches.initialQuantity,
      currentQuantity: batch[0].product_batches.currentQuantity,
      expiryDate: batch[0].product_batches.expiryDate,
      manufacturingDate: batch[0].product_batches.manufacturingDate,
      notes: batch[0].product_batches.notes,
      locationInWarehouse: batch[0].product_batches.locationInWarehouse,
      status: batch[0].product_batches.status,
      createdAt: batch[0].product_batches.createdAt,
      updatedAt: batch[0].product_batches.updatedAt,
      productName: batch[0].products?.productName || null,
      warehouseName: batch[0].warehouses?.name || null
    };
    
    res.json(formattedBatch);
  } catch (error) {
    console.error(`Fehler beim Abrufen des Batches mit ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: `Fehler beim Abrufen des Batches mit ID ${req.params.id}`,
      details: (error as Error).message 
    });
  }
});

// Seed-Route zum Erstellen von Beispiel-Batch-Daten (nur für Entwicklungszwecke)
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const existingProducts = await db.select().from(products).limit(20);
    const existingWarehouses = await db.select().from(warehouses);
    
    if (existingProducts.length === 0 || existingWarehouses.length === 0) {
      return res.status(400).json({ error: 'Keine Produkte oder Lager gefunden' });
    }
    
    const batchesToCreate = [];
    const currentDate = new Date();
    
    for (const product of existingProducts) {
      // Zufälliges Lager auswählen
      const randomWarehouse = existingWarehouses[Math.floor(Math.random() * existingWarehouses.length)];
      
      // Batch mit baldigem Ablaufdatum (innerhalb der nächsten 14 Tage)
      const soonExpiryDate = new Date();
      soonExpiryDate.setDate(currentDate.getDate() + Math.floor(Math.random() * 14));
      
      batchesToCreate.push({
        batchNumber: `B${Math.floor(Math.random() * 10000)}`,
        productId: product.id,
        warehouseId: randomWarehouse.id,
        initialQuantity: Math.floor(Math.random() * 50) + 1,
        currentQuantity: Math.floor(Math.random() * 50) + 1,
        receivedDate: new Date(currentDate.getTime() - (Math.floor(Math.random() * 30) + 1) * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: soonExpiryDate.toISOString(),
        manufacturingDate: new Date(soonExpiryDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 Tage vor Ablauf
        locationInWarehouse: `Regal ${String.fromCharCode(65 + Math.floor(Math.random() * 10))}-${Math.floor(Math.random() * 10) + 1}`,
        status: 'active',
        notes: Math.random() > 0.7 ? 'Besondere Anweisungen für diesen Batch' : null
      });
      
      // Batch mit normalem Ablaufdatum (innerhalb der nächsten 1-6 Monate)
      const normalExpiryDate = new Date();
      normalExpiryDate.setDate(currentDate.getDate() + 14 + Math.floor(Math.random() * 150));
      
      batchesToCreate.push({
        batchNumber: `B${Math.floor(Math.random() * 10000)}`,
        productId: product.id,
        warehouseId: randomWarehouse.id,
        initialQuantity: Math.floor(Math.random() * 100) + 20,
        currentQuantity: Math.floor(Math.random() * 100) + 20,
        receivedDate: new Date(currentDate.getTime() - (Math.floor(Math.random() * 30) + 1) * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: normalExpiryDate.toISOString(),
        manufacturingDate: new Date(normalExpiryDate.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 Tage vor Ablauf
        locationInWarehouse: `Regal ${String.fromCharCode(65 + Math.floor(Math.random() * 10))}-${Math.floor(Math.random() * 10) + 1}`,
        status: 'active',
        notes: null
      });
    }
    
    // Batches in der Datenbank erstellen
    const createdBatches = await db.insert(productBatches).values(batchesToCreate).returning();
    
    res.status(201).json({ 
      message: `${createdBatches.length} Beispiel-Batches erfolgreich erstellt`,
      batches: createdBatches 
    });
  } catch (error) {
    console.error('Fehler beim Erstellen von Beispiel-Batches:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen von Beispiel-Batches',
      details: (error as Error).message 
    });
  }
});

// POST /api/product-batches/create-demo-movements - Erstellt Demo-Warenbewegungen für vorhandene Batches
router.post('/create-demo-movements', async (req: Request, res: Response) => {
  try {
    // Vorhandene Batches abrufen
    const existingBatches = await db.select()
      .from(productBatches)
      .where(gte(productBatches.currentQuantity, 5)); // Nur Batches mit genügend Bestand
    
    if (existingBatches.length === 0) {
      return res.status(400).json({ error: 'Keine Batches mit ausreichendem Bestand gefunden' });
    }
    
    const movements = [];
    const currentDate = new Date();
    
    // Für jeden Batch einige Warenbewegungen erstellen
    for (const batch of existingBatches.slice(0, 10)) { // Begrenze auf 10 Batches
      const movementTypes = ['Wareneingang', 'Warenausgang', 'Inventur', 'Rücksendung', 'Umbuchung'];
      const numMovements = Math.floor(Math.random() * 3) + 1; // 1-3 Bewegungen pro Batch
      
      for (let i = 0; i < numMovements; i++) {
        const movementType = movementTypes[Math.floor(Math.random() * movementTypes.length)];
        const quantity = Math.floor(Math.random() * 5) + 1; // 1-5 Einheiten
        const movementDate = new Date(currentDate.getTime() - (Math.floor(Math.random() * 30) + 1) * 24 * 60 * 60 * 1000);
        
        // Batch-Bestand aktualisieren
        let newQuantity = batch.currentQuantity;
        if (movementType === 'Wareneingang' || movementType === 'Rücksendung') {
          newQuantity += quantity;
        } else if (movementType === 'Warenausgang') {
          newQuantity = Math.max(0, newQuantity - quantity);
        }
        
        // Batches aktualisieren
        await db.update(productBatches)
          .set({ 
            currentQuantity: newQuantity,
            updatedAt: new Date()
          })
          .where(eq(productBatches.id, batch.id));
        
        movements.push({
          batchId: batch.id,
          productId: batch.productId,
          warehouseId: batch.warehouseId,
          movementType,
          quantity,
          movementDate: movementDate.toISOString(),
          notes: Math.random() > 0.7 ? `Demo ${movementType} für Batch ${batch.batchNumber}` : null
        });
      }
    }
    
    res.status(200).json({
      message: `${movements.length} Demo-Warenbewegungen erfolgreich erstellt`,
      movements
    });
  } catch (error) {
    console.error('Fehler beim Erstellen von Demo-Warenbewegungen:', error);
    res.status(500).json({
      error: 'Fehler beim Erstellen von Demo-Warenbewegungen',
      details: (error as Error).message
    });
  }
});

// GET /api/product-batches/product/:productId/warehouse/:warehouseId - Alle Batches für ein Produkt in einem Lager abrufen
router.get('/product/:productId/warehouse/:warehouseId', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.productId);
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (isNaN(productId) || isNaN(warehouseId)) {
      return res.status(400).json({ error: "Ungültige Produkt-ID oder Lager-ID" });
    }
    
    // Hole alle Batches des Produkts im Lager
    const batches = await db.select()
      .from(productBatches)
      .leftJoin(products, eq(productBatches.productId, products.id))
      .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
      .where(
        and(
          eq(productBatches.productId, productId),
          eq(productBatches.warehouseId, warehouseId),
          // Nur Batches mit Bestand > 0
          gte(productBatches.currentQuantity, 0)
        )
      )
      // Sortiere nach Ablaufdatum (FIFO-Prinzip)
      .orderBy(asc(productBatches.expiryDate));
    
    if (!batches || batches.length === 0) {
      return res.json([]);
    }
    
    // Formatiere Batches für die Antwort
    const formattedBatches = batches.map(batch => {
      return {
        id: batch.product_batches.id,
        batchNumber: batch.product_batches.batchNumber,
        productId: batch.product_batches.productId,
        warehouseId: batch.product_batches.warehouseId,
        initialQuantity: batch.product_batches.initialQuantity,
        currentQuantity: batch.product_batches.currentQuantity,
        receivedDate: batch.product_batches.receivedDate,
        manufacturingDate: batch.product_batches.manufacturingDate,
        expiryDate: batch.product_batches.expiryDate,
        locationInWarehouse: batch.product_batches.locationInWarehouse,
        status: batch.product_batches.status,
        notes: batch.product_batches.notes,
        createdAt: batch.product_batches.createdAt,
        updatedAt: batch.product_batches.updatedAt,
        productName: batch.products?.productName || 'Unbekanntes Produkt',
        warehouseName: batch.warehouses?.name || 'Unbekanntes Lager'
      };
    });
    
    // Sende die Antwort
    res.json(formattedBatches);
    
  } catch (error) {
    console.error("Fehler beim Abrufen der Produkt-Batches:", error);
    res.status(500).json({ 
      error: "Fehler beim Abrufen der Produkt-Batches", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// PUT /api/product-batches/:id - Update a batch (quantity, expiry date, etc.)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Batch-ID' });
    }
    
    const { currentQuantity, expiryDate, notes, locationInWarehouse, status } = req.body;
    
    // Validate input
    if (currentQuantity !== undefined && (isNaN(currentQuantity) || currentQuantity < 0)) {
      return res.status(400).json({ error: 'Ungültige Mengenangabe' });
    }
    
    // Check if batch exists
    const existingBatch = await db.select()
      .from(productBatches)
      .where(eq(productBatches.id, id))
      .limit(1);
    
    if (existingBatch.length === 0) {
      return res.status(404).json({ error: 'Batch nicht gefunden' });
    }
    
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (currentQuantity !== undefined) updateData.currentQuantity = currentQuantity;
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (locationInWarehouse !== undefined) updateData.locationInWarehouse = locationInWarehouse;
    if (status !== undefined) updateData.status = status;
    
    // Update the batch
    const updatedBatch = await db.update(productBatches)
      .set(updateData)
      .where(eq(productBatches.id, id))
      .returning();
    
    if (updatedBatch.length === 0) {
      return res.status(500).json({ error: 'Fehler beim Aktualisieren des Batches' });
    }
    
    // Log the quantity change if currentQuantity was updated
    if (currentQuantity !== undefined && currentQuantity !== existingBatch[0].currentQuantity) {
      console.log(`Batch ${id} Mengenänderung: ${existingBatch[0].currentQuantity} → ${currentQuantity}`);
      // Here you could add inventory movement logging if needed
    }
    
    res.json({
      message: 'Batch erfolgreich aktualisiert',
      batch: updatedBatch[0]
    });
    
  } catch (error) {
    console.error(`Fehler beim Aktualisieren des Batches ${req.params.id}:`, error);
    res.status(500).json({ 
      error: `Fehler beim Aktualisieren des Batches`,
      details: (error as Error).message 
    });
  }
});

// DELETE /api/product-batches/:id - Delete a batch
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Batch-ID' });
    }
    
    // Check if batch exists
    const existingBatch = await db.select()
      .from(productBatches)
      .where(eq(productBatches.id, id))
      .limit(1);
    
    if (existingBatch.length === 0) {
      return res.status(404).json({ error: 'Batch nicht gefunden' });
    }
    
    // Delete the batch
    const deletedBatch = await db.delete(productBatches)
      .where(eq(productBatches.id, id))
      .returning();
    
    if (deletedBatch.length === 0) {
      return res.status(500).json({ error: 'Fehler beim Löschen des Batches' });
    }
    
    console.log(`Batch ${id} (${existingBatch[0].batchNumber}) erfolgreich gelöscht`);
    
    res.json({
      message: `Batch ${existingBatch[0].batchNumber} erfolgreich gelöscht`,
      deletedBatch: deletedBatch[0]
    });
    
  } catch (error) {
    console.error(`Fehler beim Löschen des Batches ${req.params.id}:`, error);
    res.status(500).json({ 
      error: `Fehler beim Löschen des Batches`,
      details: (error as Error).message 
    });
  }
});

// GET /api/product-batches/warehouse/:warehouseId - Get all batches for a warehouse with deduplication option
router.get('/warehouse/:warehouseId', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const groupByName = req.query.groupByName === 'true';
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }
    
    const batches = await db.select()
      .from(productBatches)
      .leftJoin(products, eq(productBatches.productId, products.id))
      .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
      .where(eq(productBatches.warehouseId, warehouseId))
      .orderBy(asc(productBatches.expiryDate));
    
    let formattedBatches = batches.map((row) => ({
      id: row.product_batches.id,
      batchNumber: row.product_batches.batchNumber,
      productId: row.product_batches.productId,
      warehouseId: row.product_batches.warehouseId,
      initialQuantity: row.product_batches.initialQuantity,
      currentQuantity: row.product_batches.currentQuantity,
      expiryDate: row.product_batches.expiryDate,
      manufacturingDate: row.product_batches.manufacturingDate,
      notes: row.product_batches.notes,
      locationInWarehouse: row.product_batches.locationInWarehouse,
      status: row.product_batches.status,
      createdAt: row.product_batches.createdAt,
      updatedAt: row.product_batches.updatedAt,
      productName: row.products?.productName || null,
      warehouseName: row.warehouses?.name || null
    }));
    
    if (groupByName) {
      // Group batches by product name to avoid showing duplicates
      const groupedBatches = new Map();
      
      formattedBatches.forEach(batch => {
        const productName = batch.productName || 'Unbekanntes Produkt';
        
        if (!groupedBatches.has(productName)) {
          groupedBatches.set(productName, {
            productName,
            batches: [],
            totalQuantity: 0,
            productIds: new Set()
          });
        }
        
        const group = groupedBatches.get(productName);
        group.batches.push(batch);
        group.totalQuantity += batch.currentQuantity || 0;
        group.productIds.add(batch.productId);
      });
      
      // Convert to array format
      const result = Array.from(groupedBatches.values()).map(group => ({
        productName: group.productName,
        totalQuantity: group.totalQuantity,
        batchCount: group.batches.length,
        productIdCount: group.productIds.size,
        batches: group.batches.sort((a, b) => 
          new Date(a.expiryDate || '9999-12-31').getTime() - 
          new Date(b.expiryDate || '9999-12-31').getTime()
        )
      }));
      
      return res.json(result);
    }
    
    res.json(formattedBatches);
  } catch (error) {
    console.error('Fehler beim Abrufen der Lager-Batches:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lager-Batches',
      details: (error as Error).message 
    });
  }
});

export default router;