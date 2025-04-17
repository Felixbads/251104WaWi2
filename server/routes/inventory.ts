import express from 'express';
import { db } from '../db';
import * as schema from '../../shared/schema';
import { eq, and, isNull, count, asc, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

// Tabellen-Referenzen für bessere Lesbarkeit
const {
  inventoryCounts,
  inventoryCountItems,
  inventoryCountBatches,
  inventoryItems,
  warehouses
} = schema;

const router = express.Router();

// Schema für die Inventuranfrage
const createInventoryCountSchema = z.object({
  warehouseId: z.number()
});

// Erstelle eine neue Inventur und lade automatisch alle Lageritems
router.post('/inventory-counts', async (req, res) => {
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
    
    // Erstelle für jeden Lagerbestand einen Inventurpositionseintrag
    if (inventoryItemsList.length > 0) {
      const countItems = inventoryItemsList.map(item => ({
        inventoryCountId,
        productId: item.productId,
        expectedQuantity: item.quantity || 0, // In der Datenbank könnte es currentQuantity oder quantity heißen
        countedQuantity: null, // Wird erst bei der Zählung erfasst
        notes: '',
      }));

      // Füge alle Inventurpositionen in die Datenbank ein
      await db.insert(inventoryCountItems).values(countItems);
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
router.get('/inventory-counts/:id', async (req, res) => {
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

    // Erfolgreiche Antwort
    return res.status(200).json(inventoryCount);
  } catch (error) {
    console.error('Fehler beim Laden der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Lade Inventurpositionen für eine Inventur
router.get('/inventory-counts/:id/items', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Lade alle Inventurpositionen für diese Inventur
    const items = await db.query.inventoryCountItems.findMany({
      where: eq(schema.inventoryCountItems.inventoryCountId, inventoryCountId),
      with: {
        product: true
      }
    });

    // Erfolgreiche Antwort
    return res.status(200).json(items);
  } catch (error) {
    console.error('Fehler beim Laden der Inventurpositionen:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update einer Inventurposition
router.patch('/inventory-count-items/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { countedQuantity, notes } = req.body;
    
    // Prüfe, ob die Inventurposition existiert
    const existingItem = await db.query.inventoryCountItems.findFirst({
      where: eq(schema.inventoryCountItems.id, itemId)
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Inventurposition nicht gefunden' });
    }

    // Update der Inventurposition
    const [updatedItem] = await db.update(inventoryCountItems)
      .set({ 
        countedQuantity: countedQuantity !== undefined ? countedQuantity : existingItem.countedQuantity,
        notes: notes !== undefined ? notes : existingItem.notes
      })
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
    
    if (!Array.isArray(batches) || batches.length === 0) {
      return res.status(400).json({ error: 'Batch-Informationen fehlen oder sind ungültig' });
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

    // Bereite Batch-Daten vor
    const batchData = batches.map(batch => ({
      inventoryCountItemId: itemId,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
      quantity: batch.quantity,
    }));

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

    // Erfolgreiche Antwort
    return res.status(201).json({ 
      message: 'Batches erfolgreich gespeichert',
      batches: insertedBatches,
      totalQuantity: totalBatchQuantity
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
router.post('/inventory-counts/:id/complete', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventur existiert und noch nicht abgeschlossen ist
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: and(
        eq(schema.inventoryCounts.id, inventoryCountId),
        eq(schema.inventoryCounts.status, 'open')
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
        batches: true
      }
    });

    // Hier könnte eine Transaktion beginnen für die sichere Aktualisierung aller Daten
    // Das vollständige FIFO-Handling würde an dieser Stelle implementiert werden

    // Setze die Inventur auf "completed"
    await db.update(inventoryCounts)
      .set({ 
        status: 'completed', 
        completedAt: new Date(),
        completedBy: 1 // Alternativ können Sie auch completedBy verwenden
      })
      .where(eq(schema.inventoryCounts.id, inventoryCountId));

    // Erfolgreiche Antwort
    return res.status(200).json({ 
      message: 'Inventur erfolgreich abgeschlossen',
      inventoryCountId,
      warehouseName: inventoryCount.warehouse?.name
    });
  } catch (error) {
    console.error('Fehler beim Abschließen der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Löschen einer Inventur
router.delete('/inventory-counts/:id', async (req, res) => {
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
    return res.status(200).json({ 
      message: 'Inventur erfolgreich gelöscht',
      inventoryCountId,
      warehouseName: inventoryCount.warehouse?.name
    });
  } catch (error) {
    console.error('Fehler beim Löschen der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Speichere Inventur (Zwischenstand)
router.post('/inventory-counts/:id/save', async (req, res) => {
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
    return res.status(200).json({ 
      message: 'Inventur erfolgreich gespeichert',
      inventoryCountId,
      warehouseName: inventoryCount.warehouse?.name,
      savedAt: new Date()
    });
  } catch (error) {
    console.error('Fehler beim Speichern der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

// Starte Inventur (Wechsel von 'pending' zu 'in_progress')
router.post('/inventory-counts/:id/start', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    
    // Prüfe, ob die Inventur existiert und im Status 'pending' ist
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: and(
        eq(schema.inventoryCounts.id, inventoryCountId),
        eq(schema.inventoryCounts.status, 'pending')
      ),
      with: {
        warehouse: true
      }
    });

    if (!inventoryCount) {
      return res.status(404).json({ 
        error: 'Inventur nicht gefunden oder nicht im Status "Geplant"'
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
    return res.status(200).json({ 
      message: 'Inventur erfolgreich gestartet',
      inventoryCountId,
      warehouseName: inventoryCount.warehouse?.name,
      startedAt: new Date()
    });
  } catch (error) {
    console.error('Fehler beim Starten der Inventur:', error);
    return res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;