import express from 'express';
import { db } from '../db';
import * as schema from '../../shared/schema';
import { eq, and, isNull, count, asc, desc, sql, gt } from 'drizzle-orm';
import { z } from 'zod';

// Tabellen-Referenzen für bessere Lesbarkeit
const {
  inventoryCounts,
  inventoryCountItems,
  inventoryCountBatches,
  inventoryItems,
  warehouses,
  productBatches
} = schema;

const router = express.Router();

// Schema für die Inventuranfrage
const createInventoryCountSchema = z.object({
  warehouseId: z.number()
});

// Erstelle eine neue Inventur und lade automatisch alle Lageritems
router.post('/', async (req, res) => {
  try {
    // Validiere Request-Body
    const validatedData = createInventoryCountSchema.parse(req.body);
    const { warehouseId } = validatedData;

    // Prüfe, ob das Lager existiert
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }

    // Erstelle neue Inventur
    const inventoryCountData = {
      warehouseId,
      date: new Date(),
      status: 'open', // Status: open, completed, cancelled
      createdBy: 1, // Standardmäßig Admin-Benutzer
      notes: `Inventur für ${warehouse.name}`,
    };

    // Füge Inventur in die Datenbank ein
    const [insertedCount] = await db.insert(inventoryCounts).values(inventoryCountData).returning();

    if (!insertedCount) {
      return res.status(500).json({ error: 'Fehler beim Erstellen der Inventur' });
    }

    const inventoryCountId = insertedCount.id;

    // Lade alle aktuellen Lagerbestände für das Lager
    const inventoryItemsList = await db.query.inventoryItems.findMany({
      where: eq(schema.inventoryItems.warehouseId, warehouseId),
      with: {
        product: true
      }
    });
    
    // Lade alle aktiven Chargen für das Lager
    const activeBatches = await db.query.productBatches.findMany({
      where: and(
        eq(schema.productBatches.warehouseId, warehouseId),
        gt(schema.productBatches.currentQuantity, 0)
      ),
      orderBy: [asc(schema.productBatches.expiryDate)]
    });
    
    // Erstelle Map für schnellen Zugriff auf Chargen nach Produkt-ID
    const batchesByProduct = new Map<number, typeof activeBatches>();
    activeBatches.forEach(batch => {
      if (!batchesByProduct.has(batch.productId)) {
        batchesByProduct.set(batch.productId, []);
      }
      batchesByProduct.get(batch.productId)!.push(batch);
    });
    
    // KORRIGIERTE LOGIK: Verwende ENTWEDER inventory_items ODER product_batches, nie beide
    const countItems: any[] = [];
    
    if (inventoryItemsList.length > 0) {
      for (const item of inventoryItemsList) {
        const productBatches = batchesByProduct.get(item.productId);
        
        if (productBatches && productBatches.length > 0) {
          // Produkt hat Chargen: Verwende NUR die Chargen, ignoriere inventory_items
          for (const batch of productBatches) {
            countItems.push({
              inventoryCountId,
              productId: item.productId,
              expectedQuantity: batch.currentQuantity || 0,
              countedQuantity: null,
              notes: `Charge: ${batch.batchNumber || 'Unbekannt'} (MHD: ${batch.expiryDate || 'N/A'})`,
              batchId: batch.id
            });
          }
          // WICHTIG: Hier wird kein inventory_items Eintrag erstellt!
        } else {
          // Produkt hat KEINE Chargen: Verwende normalen inventory_items Eintrag
          countItems.push({
            inventoryCountId,
            productId: item.productId,
            expectedQuantity: item.quantity || 0,
            countedQuantity: null,
            notes: 'Normal inventory (ohne Chargen)',
            batchId: null
          });
        }
      }

      // Füge alle Inventurpositionen in die Datenbank ein
      if (countItems.length > 0) {
        await db.insert(inventoryCountItems).values(countItems);
      }
    }

    // Erfolgreiche Antwort
    return res.status(201).json({ 
      id: inventoryCountId, 
      ...inventoryCountData, 
      warehouseName: warehouse.name
    });
  } catch (error) {
    console.error('Fehler beim Erstellen der Inventur:', error);
    return res.status(400).json({ error: 'Ungültige Anfrage' });
  }
});

// Lade Details einer Inventur
router.get('/:id', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventur existiert
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: eq(schema.inventoryCounts.id, inventoryCountId),
      with: {
        warehouse: true
      }
    });

    if (!inventoryCount) {
      return res.status(404).json({ error: 'Inventur nicht gefunden' });
    }

    // Transform to camelCase
    const warehouse = Array.isArray(inventoryCount.warehouse) ? inventoryCount.warehouse[0] : inventoryCount.warehouse;
    const transformedCount = {
      id: inventoryCount.id,
      warehouseId: inventoryCount.warehouseId,
      warehouseName: warehouse?.name || 'Unbekanntes Lager',
      status: inventoryCount.status,
      startDate: inventoryCount.startDate,
      endDate: inventoryCount.endDate,
      notes: inventoryCount.notes,
      createdAt: inventoryCount.createdAt,
      updatedAt: inventoryCount.updatedAt,
      initiatedBy: inventoryCount.initiatedBy,
      completedBy: inventoryCount.completedBy,
      warehouse: warehouse ? {
        id: warehouse.id,
        name: warehouse.name
      } : null
    };

    // Erfolgreiche Antwort
    return res.status(200).json(transformedCount);
  } catch (error) {
    console.error('Fehler beim Laden der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Lade Inventurpositionen für eine Inventur
router.get('/:id/items', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Lade alle Inventurpositionen für diese Inventur mit Batch-Informationen
    const items = await db.query.inventoryCountItems.findMany({
      where: eq(schema.inventoryCountItems.inventoryCountId, inventoryCountId),
      with: {
        product: true,
        batch: true // Batch-Informationen mit einbeziehen
      }
    });

    // Transform all items to camelCase
    const transformedItems = items.map(item => {
      const product = Array.isArray(item.product) ? item.product[0] : item.product;
      const batch = Array.isArray(item.batch) ? item.batch[0] : item.batch;
      
      return {
        id: item.id,
        inventoryCountId: item.inventoryCountId,
        productId: item.productId,
        expectedQuantity: item.expectedQuantity,
        countedQuantity: item.countedQuantity,
        notes: item.notes,
        batchId: item.batchId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        product: product ? {
          id: product.id,
          productName: product.productName,
          category: product.category,
          price: product.price,
          packageSize: product.packageSize,
          packageQuantity: product.packageQuantity,
          sku: product.sku,
          units: product.units,
          vendonId: product.vendonId
        } : null,
        batch: batch ? {
          id: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          currentQuantity: batch.currentQuantity,
          receivedDate: batch.receivedDate,
          notes: batch.notes
        } : null
      };
    });

    // Erfolgreiche Antwort
    return res.status(200).json(transformedItems);
  } catch (error) {
    console.error('Fehler beim Laden der Inventurpositionen:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Schema für die Validierung von Inventurpositions-Updates
const updateInventoryCountItemSchema = z.object({
  countedQuantity: z.number()
    .int('Die gezählte Menge muss eine ganze Zahl sein')
    .min(0, 'Die gezählte Menge darf nicht negativ sein')
    .nullable()
    .optional(),
  notes: z.string().optional(),
  expectedQuantity: z.number()
    .int('Die erwartete Menge muss eine ganze Zahl sein')
    .min(0, 'Die erwartete Menge darf nicht negativ sein')
    .optional()
});

// Update einer Inventurposition
router.patch('/inventory-count-items/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    
    // Validiere Request-Body
    const validationResult = updateInventoryCountItemSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Ungültige Eingabedaten',
        details: validationResult.error.flatten().fieldErrors
      });
    }
    
    const { countedQuantity, notes, expectedQuantity } = validationResult.data;
    
    // Prüfe, ob die Inventurposition existiert
    const existingItem = await db.query.inventoryCountItems.findFirst({
      where: eq(schema.inventoryCountItems.id, itemId)
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Inventurposition nicht gefunden' });
    }

    // KORRIGIERT: Setze auch countedAt und countedBy wenn countedQuantity gesetzt wird
    const updateData: any = {
      countedQuantity: countedQuantity !== undefined ? countedQuantity : existingItem.countedQuantity,
      notes: notes !== undefined ? notes : existingItem.notes,
      expectedQuantity: expectedQuantity !== undefined ? expectedQuantity : existingItem.expectedQuantity
    };

    // Wenn countedQuantity gesetzt wird (auch auf 0), markiere als gezählt
    if (countedQuantity !== undefined) {
      updateData.countedAt = new Date();
      updateData.countedBy = 1; // Default admin user - in Zukunft aus req.user nehmen
      updateData.status = 'counted'; // Status auf gezählt setzen
    }

    const [updatedItem] = await db.update(inventoryCountItems)
      .set(updateData)
      .where(eq(schema.inventoryCountItems.id, itemId))
      .returning();

    // Erfolgreiche Antwort
    return res.status(200).json(updatedItem);
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Inventurposition:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Speichern von Batch-Informationen für eine Inventurposition
router.post('/inventory-count-items/:id/batches', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const batches = req.body.batches;
    
    console.log(`🔄 POST /inventory-count-items/${itemId}/batches`);
    console.log(`📦 Request Body:`, JSON.stringify(req.body, null, 2));
    
    if (!Array.isArray(batches) || batches.length === 0) {
      console.error(`❌ Batch-Validation fehlgeschlagen:`, { batches, isArray: Array.isArray(batches), length: batches?.length });
      return res.status(400).json({ 
        error: 'Batch-Informationen fehlen oder sind ungültig',
        received: { batches, isArray: Array.isArray(batches), length: batches?.length }
      });
    }
    
    // Validiere jeden Batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch.batchNumber) {
        console.error(`❌ Batch ${i} fehlt batchNumber:`, batch);
        return res.status(400).json({ 
          error: `Batch ${i}: batchNumber ist erforderlich`,
          batch: batch
        });
      }
      
      const quantity = batch.quantity || batch.initialQuantity || batch.currentQuantity;
      if (!quantity || quantity <= 0) {
        console.error(`❌ Batch ${i} fehlt gültige Menge:`, batch);
        return res.status(400).json({ 
          error: `Batch ${i}: Gültige Menge (quantity/initialQuantity/currentQuantity) ist erforderlich`,
          batch: batch
        });
      }
    }

    // Prüfe, ob die Inventurposition existiert
    const existingItem = await db.query.inventoryCountItems.findFirst({
      where: eq(schema.inventoryCountItems.id, itemId),
      with: {
        inventoryCount: true
      }
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Inventurposition nicht gefunden' });
    }

    // Lösche vorhandene Batches für dieses Item
    await db.delete(inventoryCountBatches)
      .where(eq(schema.inventoryCountBatches.inventoryCountItemId, itemId));

    // Bereite Batch-Daten vor - akzeptiere verschiedene Feldnamen für Kompatibilität
    const batchData = batches.map((batch, index) => {
      const quantity = batch.quantity || batch.initialQuantity || batch.currentQuantity || 0;
      
      // Parse expiryDate sicher als Date oder null
      let parsedExpiryDate = null;
      if (batch.expiryDate) {
        try {
          // Akzeptiere verschiedene Datumsformate
          if (typeof batch.expiryDate === 'string') {
            parsedExpiryDate = new Date(batch.expiryDate);
            // Prüfe ob das Datum gültig ist
            if (isNaN(parsedExpiryDate.getTime())) {
              console.warn(`⚠️  Ungültiges expiryDate für Batch ${index}: ${batch.expiryDate}`);
              parsedExpiryDate = null;
            }
          } else if (batch.expiryDate instanceof Date) {
            parsedExpiryDate = batch.expiryDate;
          }
        } catch (error) {
          console.warn(`⚠️  Fehler beim Parsen von expiryDate für Batch ${index}:`, error);
          parsedExpiryDate = null;
        }
      }
      
      const processedBatch = {
        inventoryCountItemId: itemId,
        batchNumber: batch.batchNumber,
        expiryDate: parsedExpiryDate,
        quantity: quantity,
      };
      
      console.log(`📋 Batch ${index} verarbeitet:`, processedBatch);
      return processedBatch;
    });

    // Speichere neue Batches
    const insertedBatches = await db.insert(inventoryCountBatches)
      .values(batchData)
      .returning();

    // Stelle sicher, dass die Gesamtmenge der Batches mit der gezählten Menge übereinstimmt
    const totalBatchQuantity = batchData.reduce((sum, batch) => sum + batch.quantity, 0);
    
    // Aktualisiere die gezählte Menge des Items
    await db.update(inventoryCountItems)
      .set({ countedQuantity: totalBatchQuantity })
      .where(eq(schema.inventoryCountItems.id, itemId));

    console.log(`✅ ${insertedBatches.length} Batches erfolgreich gespeichert für Item ${itemId}`);
    console.log(`📊 Gesamtmenge: ${totalBatchQuantity}`);
    
    // Erfolgreiche Antwort mit detaillierten Informationen
    return res.status(201).json({ 
      success: true,
      message: 'Batches erfolgreich gespeichert',
      itemId: itemId,
      batchesCreated: insertedBatches.length,
      batches: insertedBatches,
      totalQuantity: totalBatchQuantity,
      originalRequest: {
        batchesReceived: batches.length,
        inputBatches: batches
      }
    });
  } catch (error) {
    console.error('Fehler beim Speichern der Batch-Informationen:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Lade Batch-Informationen für eine Inventurposition
router.get('/inventory-count-items/:id/batches', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventurposition existiert
    const existingItem = await db.query.inventoryCountItems.findFirst({
      where: eq(schema.inventoryCountItems.id, itemId)
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Inventurposition nicht gefunden' });
    }

    // Lade alle Batches für diese Inventurposition
    const batches = await db.query.inventoryCountBatches.findMany({
      where: eq(schema.inventoryCountBatches.inventoryCountItemId, itemId)
    });

    // Erfolgreiche Antwort
    return res.status(200).json(batches);
  } catch (error) {
    console.error('Fehler beim Laden der Batch-Informationen:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Abschließen einer Inventur und Übertragen der Daten in den Lagerbestand
router.post('/:id/complete', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventur existiert und noch nicht abgeschlossen ist
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: and(
        eq(schema.inventoryCounts.id, inventoryCountId),
        sql`status IN ('open', 'pending', 'in_progress')`
      ),
      with: {
        warehouse: true
      }
    });

    if (!inventoryCount) {
      return res.status(404).json({ 
        error: 'Inventur nicht gefunden oder bereits abgeschlossen'
      });
    }

    // Lade alle Inventurpositionen mit ihren Batches
    const items = await db.query.inventoryCountItems.findMany({
      where: eq(schema.inventoryCountItems.inventoryCountId, inventoryCountId),
      with: {
        product: true,
        batch: true
      }
    });

    // Beginne Transaktion für sichere Aktualisierung aller Daten
    await db.transaction(async (tx) => {
      console.log(`Beginne Inventurabschluss für Inventur ${inventoryCountId}`);
      
      // Verarbeite jedes Inventurelement
      for (const item of items) {
        // Überspringe Elemente ohne gezählte Menge
        if (item.countedQuantity === null || item.countedQuantity === undefined) {
          console.log(`Überspringe Item ${item.id} - keine gezählte Menge`);
          continue;
        }
        
        const difference = item.countedQuantity - (item.expectedQuantity || 0);
        console.log(`Verarbeite Produkt ${item.productId}: Erwartet=${item.expectedQuantity}, Gezählt=${item.countedQuantity}, Differenz=${difference}`);
        
        // KORRIGIERTE LOGIK: Aktualisiere ENTWEDER inventory_items ODER product_batches, nie beide!
        if (item.batchId && item.batch) {
          // *** BATCH-PRODUKT: Aktualisiere die Charge SOFORT ***
          await tx.update(schema.productBatches)
            .set({
              currentQuantity: item.countedQuantity,
              updatedAt: new Date()
            })
            .where(eq(schema.productBatches.id, item.batchId));
            
          console.log(`✅ BATCH-KRITISCH: Batch ${item.batchId} aktualisiert: neue Menge = ${item.countedQuantity}`);
        } else {
          // *** NORMALES PRODUKT: Nur inventory_items aktualisieren ***
          const existingInventoryItem = await tx.query.inventoryItems.findFirst({
            where: and(
              eq(schema.inventoryItems.warehouseId, inventoryCount.warehouseId),
              eq(schema.inventoryItems.productId, item.productId)
            )
          });
          
          if (existingInventoryItem) {
            // Aktualisiere existierenden Bestand
            await tx.update(schema.inventoryItems)
              .set({ 
                quantity: item.countedQuantity,
                updatedAt: new Date()
              })
              .where(eq(schema.inventoryItems.id, existingInventoryItem.id));
              
            console.log(`Inventar-Item ${existingInventoryItem.id} aktualisiert: neue Menge = ${item.countedQuantity}`);
          } else if (item.countedQuantity > 0) {
            // Erstelle neuen Bestandseintrag wenn noch nicht vorhanden
            await tx.insert(schema.inventoryItems)
              .values({
                warehouseId: inventoryCount.warehouseId,
                productId: item.productId,
                quantity: item.countedQuantity,
                minQuantity: 0,
                maxQuantity: null,
                reorderPoint: 0,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date()
              });
              
            console.log(`Neues Inventar-Item für Produkt ${item.productId} erstellt: Menge = ${item.countedQuantity}`);
          }
        }
        
        // Erstelle Bewegungsprotokoll für die Anpassung
        if (difference !== 0) {
          await tx.insert(schema.inventoryMovements)
            .values({
              productId: item.productId,
              sourceWarehouseId: difference < 0 ? inventoryCount.warehouseId : null,
              destinationWarehouseId: difference > 0 ? inventoryCount.warehouseId : null,
              quantity: Math.abs(difference),
              movementType: 'inventory_adjustment',
              reason: `Inventuranpassung #${inventoryCountId}`,
              notes: `Inventur abgeschlossen: Differenz von ${difference} Einheiten`,
              performedBy: req.body.userId || 1,
              performedAt: new Date(),
              referenceType: 'inventory_count',
              referenceId: inventoryCountId.toString(),
              batchId: item.batchId || null,
              createdAt: new Date(),
              updatedAt: new Date()
            });
            
          console.log(`Bewegungsprotokoll erstellt für Produkt ${item.productId}: ${Math.abs(difference)} Einheiten ${difference > 0 ? 'hinzugefügt' : 'entfernt'}`);
        }
        
        // Batch-Aktualisierung bereits oben in der if-Bedingung erledigt - keine redundante Logik mehr
      }
      
      // Setze die Inventur auf "completed"
      await tx.update(inventoryCounts)
        .set({ 
          status: 'completed', 
          endDate: new Date(),
          completedBy: req.body.userId || 1,
          updatedAt: new Date()
        })
        .where(eq(schema.inventoryCounts.id, inventoryCountId));
        
      console.log(`Inventur ${inventoryCountId} erfolgreich abgeschlossen`);
    });

    // Erfolgreiche Antwort
    const warehouse = Array.isArray(inventoryCount.warehouse) ? inventoryCount.warehouse[0] : inventoryCount.warehouse;
    return res.status(200).json({ 
      message: 'Inventur erfolgreich abgeschlossen und Lagerbestände aktualisiert',
      inventoryCountId,
      warehouseName: warehouse?.name,
      itemsProcessed: items.filter(i => i.countedQuantity !== null).length
    });
  } catch (error) {
    console.error('Fehler beim Abschließen der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler beim Abschließen der Inventur' });
  }
});

// Löschen einer Inventur
router.delete('/:id', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventur existiert
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: eq(schema.inventoryCounts.id, inventoryCountId),
      with: {
        warehouse: true
      }
    });

    if (!inventoryCount) {
      return res.status(404).json({ error: 'Inventur nicht gefunden' });
    }

    // Lösche alle zugehörigen Batches
    await db.delete(inventoryCountBatches)
      .where(
        eq(
          inventoryCountBatches.inventoryCountItemId,
          sql`ANY(SELECT id FROM ${inventoryCountItems} WHERE inventory_count_id = ${inventoryCountId})`
        )
      );

    // Lösche alle Inventurpositionen
    await db.delete(inventoryCountItems)
      .where(eq(schema.inventoryCountItems.inventoryCountId, inventoryCountId));

    // Lösche die Inventur selbst
    await db.delete(inventoryCounts)
      .where(eq(schema.inventoryCounts.id, inventoryCountId));

    // Erfolgreiche Antwort
    const warehouse = Array.isArray(inventoryCount.warehouse) ? inventoryCount.warehouse[0] : inventoryCount.warehouse;
    return res.status(200).json({ 
      message: 'Inventur erfolgreich gelöscht',
      inventoryCountId,
      warehouseName: warehouse?.name
    });
  } catch (error) {
    console.error('Fehler beim Löschen der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Speichere Inventur (Zwischenstand)
router.post('/:id/save', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventur existiert
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: eq(schema.inventoryCounts.id, inventoryCountId),
      with: {
        warehouse: true
      }
    });

    if (!inventoryCount) {
      return res.status(404).json({ error: 'Inventur nicht gefunden' });
    }

    // Aktualisiere den Zeitstempel der Inventur
    await db.update(inventoryCounts)
      .set({ 
        updatedAt: new Date(),
        notes: req.body.notes || inventoryCount.notes 
      })
      .where(eq(schema.inventoryCounts.id, inventoryCountId));

    // Erfolgreiche Antwort
    const warehouse = Array.isArray(inventoryCount.warehouse) ? inventoryCount.warehouse[0] : inventoryCount.warehouse;
    return res.status(200).json({ 
      message: 'Inventur erfolgreich gespeichert',
      inventoryCountId,
      warehouseName: warehouse?.name,
      savedAt: new Date()
    });
  } catch (error) {
    console.error('Fehler beim Speichern der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Starte Inventur (Wechsel von 'open' oder 'pending' zu 'in_progress')
router.post('/:id/start', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventur existiert und im Status 'open' oder 'pending' ist
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: and(
        eq(schema.inventoryCounts.id, inventoryCountId),
        sql`status IN ('open', 'pending')`
      ),
      with: {
        warehouse: true
      }
    });

    if (!inventoryCount) {
      return res.status(404).json({ 
        error: 'Inventur nicht gefunden oder nicht startbar (Status muss "Offen" oder "Geplant" sein)'
      });
    }

    // Aktualisiere den Status auf 'in_progress' und setze startDate
    await db.update(inventoryCounts)
      .set({ 
        status: 'in_progress',
        startDate: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(schema.inventoryCounts.id, inventoryCountId));

    // Erfolgreiche Antwort
    const warehouse = Array.isArray(inventoryCount.warehouse) ? inventoryCount.warehouse[0] : inventoryCount.warehouse;
    return res.status(200).json({ 
      message: 'Inventur erfolgreich gestartet',
      inventoryCountId,
      warehouseName: warehouse?.name,
      startedAt: new Date()
    });
  } catch (error) {
    console.error('Fehler beim Starten der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Lade Lager-Informationen für eine spezifische Warehouse-ID
router.get('/warehouse/:id/info', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Lade Lager-Informationen
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Das angeforderte Lager konnte nicht gefunden werden.' });
    }

    // Erfolgreiche Antwort
    return res.status(200).json(warehouse);
  } catch (error) {
    console.error('Fehler beim Laden der Lager-Informationen:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden der Lager-Informationen' });
  }
});

// Lade Lagerstatistiken für eine spezifische Warehouse-ID
router.get('/warehouse/:id/stats', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Prüfe, ob das Lager existiert
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }

    // Berechne Lagerstatistiken
    const statsQuery = await db.select({
      totalProducts: count(schema.inventoryItems.id),
      totalQuantity: sql<number>`COALESCE(SUM(${schema.inventoryItems.quantity}), 0)`,
      lowStockItems: sql<number>`COUNT(CASE WHEN ${schema.inventoryItems.quantity} <= ${schema.inventoryItems.reorderPoint} THEN 1 END)`,
      outOfStockItems: sql<number>`COUNT(CASE WHEN ${schema.inventoryItems.quantity} = 0 THEN 1 END)`
    })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.warehouseId, warehouseId));

    const stats = statsQuery[0] || {
      totalProducts: 0,
      totalQuantity: 0,
      lowStockItems: 0,
      outOfStockItems: 0
    };

    // Erfolgreiche Antwort
    return res.status(200).json({
      warehouseId,
      warehouseName: warehouse.name,
      ...stats
    });
  } catch (error) {
    console.error('Fehler beim Laden der Lagerstatistiken:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden der Lagerstatistiken' });
  }
});

// Lade Lagerbestand für eine spezifische Warehouse-ID
router.get('/warehouse/:id/inventory', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Prüfe, ob das Lager existiert
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }

    // Lade Lagerbestand mit Produktdetails
    const inventoryItems = await db.query.inventoryItems.findMany({
      where: eq(schema.inventoryItems.warehouseId, warehouseId),
      with: {
        product: true
      },

    });

    // Formatiere die Antwort mit korrekten Produktnamen
    const formattedInventory = inventoryItems.map(item => {
      const product = Array.isArray(item.product) ? item.product[0] : item.product;
      return {
        id: item.id,
        warehouseId: item.warehouseId,
        productId: item.productId,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        reorderPoint: item.reorderPoint,
        locationInWarehouse: item.locationInWarehouse,
        updatedAt: item.updatedAt,
        productName: product?.productName || 'Unbekanntes Produkt',
        sku: product?.sku || '',
        price: product?.price || 0,
        category: product?.category || '',
        unit: product?.unit || 'Stk.'
      };
    });

    // Erfolgreiche Antwort
    return res.status(200).json(formattedInventory);
  } catch (error) {
    console.error('Fehler beim Laden des Lagerbestands:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden des Lagerbestands' });
  }
});

// Lade Lagerbestand für eine spezifische Warehouse-ID (alternativer Endpunkt)
router.get('/warehouse/:id', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Prüfe, ob das Lager existiert
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(schema.warehouses.id, warehouseId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }

    // Lade Lagerbestand mit Produktdetails
    const inventoryItems = await db.query.inventoryItems.findMany({
      where: eq(schema.inventoryItems.warehouseId, warehouseId),
      with: {
        product: true
      }
    });

    // Lade alle aktiven Batches für dieses Lager - für Chargen und MHD-Informationen
    const activeBatches = await db.select({
      id: productBatches.id,
      productId: productBatches.productId,
      batchNumber: productBatches.batchNumber,
      currentQuantity: productBatches.currentQuantity,
      expiryDate: productBatches.expiryDate,
      manufacturingDate: productBatches.manufacturingDate,
      locationInWarehouse: productBatches.locationInWarehouse
    })
    .from(productBatches)
    .where(
      and(
        eq(productBatches.warehouseId, warehouseId),
        gt(productBatches.currentQuantity, 0)
      )
    )
    .orderBy(productBatches.expiryDate);
    
    // Erstelle Map für Batch-Daten nach Produkt-ID
    const batchesByProduct = new Map();
    activeBatches.forEach(batch => {
      if (!batchesByProduct.has(batch.productId)) {
        batchesByProduct.set(batch.productId, []);
      }
      batchesByProduct.get(batch.productId).push(batch);
    });

    console.log(`[INVENTORY_WAREHOUSE] Found ${inventoryItems.length} inventory items and ${activeBatches.length} batches for warehouse ${warehouseId}`);
    
    // Formatiere die Antwort mit korrekten Produktnamen + Batch-Informationen
    const formattedInventory = inventoryItems.map(item => {
      const product = Array.isArray(item.product) ? item.product[0] : item.product;
      const batches = batchesByProduct.get(item.productId) || [];
      
      // Bestimme die nächste Ablaufzeit und Gesamtmenge aus Batches
      const nextExpiryDate = batches.length > 0 ? batches[0].expiryDate : null;
      const batchQuantity = batches.length > 0 ? batches.reduce((sum, batch) => sum + (batch.currentQuantity || 0), 0) : 0;
      
      // Erstelle detaillierte Batch-Strings ähnlich wie in der direkten Query
      const batchNumbers = batches.length > 0 ? 
        batches.map(batch => `${batch.batchNumber} (MHD: ${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('de-DE') : 'N/A'}, Menge: ${batch.currentQuantity})`).join(', ') 
        : null;
      
      return {
        id: item.id,
        warehouseId: item.warehouseId,
        productId: item.productId,
        quantity: batchQuantity > 0 ? batchQuantity : item.quantity, // Verwende Batch-Menge wenn verfügbar
        minQuantity: item.minQuantity,
        reorderPoint: item.reorderPoint,
        locationInWarehouse: item.locationInWarehouse,
        updatedAt: item.updatedAt,
        productName: product?.productName || 'Unbekanntes Produkt',
        sku: product?.sku || '',
        price: product?.price || 0,
        category: product?.category || '',
        unit: product?.unit || 'Stk.',
        // NEUE Batch-Informationen - wie bei /refill-tracking  
        nextExpiryDate: nextExpiryDate,
        batchNumber: batchNumbers, // Für Frontend-Kompatibilität
        batchQuantity: batchQuantity, 
        batches: batches.map(batch => ({
          id: batch.id,
          batchNumber: batch.batchNumber,
          currentQuantity: batch.currentQuantity,
          expiryDate: batch.expiryDate,
          manufacturingDate: batch.manufacturingDate,
          locationInWarehouse: batch.locationInWarehouse
        }))
      };
    });

    // Debug-Output für die ersten paar Einträge
    console.log(`[INVENTORY_WAREHOUSE] Sample formatted results:`, formattedInventory.slice(0, 3).map(item => ({
      productName: item.productName,
      quantity: item.quantity,
      nextExpiryDate: item.nextExpiryDate,
      batchNumber: item.batchNumber
    })));


    // Erfolgreiche Antwort
    return res.status(200).json(formattedInventory);
  } catch (error) {
    console.error('Fehler beim Laden des Lagerbestands:', error);
    return res.status(500).json({ error: 'Serverfehler beim Laden des Lagerbestands' });
  }
});


export default router;