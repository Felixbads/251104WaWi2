import express from 'express';
import { db } from '../db';
import * as schema from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

const router = express.Router();

// VEREINFACHTE INVENTUR-ABSCHLUSS-API
// Robuste, einfache Lösung ohne komplexe Logik

// Status-Update für Inventur (Start/Complete/Save)
router.post('/inventory-counts/:id/simple-action', async (req, res) => {
  try {
    const inventoryCountId = parseInt(req.params.id);
    const { action, notes } = req.body;
    
    console.log(`[SIMPLE-API] ${action} für Inventur ${inventoryCountId}`);
    
    if (!inventoryCountId || isNaN(inventoryCountId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ungültige Inventur-ID' 
      });
    }

    // Prüfe, ob die Inventur existiert
    const inventoryCount = await db.query.inventoryCounts.findFirst({
      where: eq(schema.inventoryCounts.id, inventoryCountId),
      with: {
        warehouse: true
      }
    });

    if (!inventoryCount) {
      return res.status(404).json({ 
        success: false, 
        error: 'Inventur nicht gefunden' 
      });
    }

    let updateData: any = { updatedAt: new Date() };
    let message = '';

    switch (action) {
      case 'start':
        // Status auf 'in_progress' setzen
        updateData.status = 'in_progress';
        updateData.startDate = new Date();
        message = 'Inventur erfolgreich gestartet';
        break;
        
      case 'save':
        // Zwischenspeichern - nur Timestamp aktualisieren
        if (notes) updateData.notes = notes;
        message = 'Inventur erfolgreich zwischengespeichert';
        break;
        
      case 'complete':
        // Inventur abschließen
        updateData.status = 'completed';
        updateData.endDate = new Date();
        updateData.completedBy = 1; // Admin user
        if (notes) updateData.notes = notes;
        message = 'Inventur erfolgreich abgeschlossen';
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Unbekannte Aktion' 
        });
    }

    // Update ausführen
    await db.update(schema.inventoryCounts)
      .set(updateData)
      .where(eq(schema.inventoryCounts.id, inventoryCountId));

    // Einfache, robuste JSON-Antwort
    const warehouse = Array.isArray(inventoryCount.warehouse) 
      ? inventoryCount.warehouse[0] 
      : inventoryCount.warehouse;
      
    return res.status(200).json({
      success: true,
      message,
      data: {
        inventoryCountId,
        warehouseName: warehouse?.name || 'Unbekannt',
        action,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(`[SIMPLE-API] Fehler bei ${req.body.action}:`, error);
    return res.status(500).json({ 
      success: false, 
      error: 'Serverfehler' 
    });
  }
});

// Inventur-Items aktualisieren (vereinfacht)
router.patch('/inventory-count-items/:id/simple', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { countedQuantity, notes } = req.body;
    
    console.log(`[SIMPLE-API] Update Item ${itemId}: Menge=${countedQuantity}`);
    
    if (!itemId || isNaN(itemId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ungültige Item-ID' 
      });
    }

    // Prüfe, ob das Item existiert
    const existingItem = await db.query.inventoryCountItems.findFirst({
      where: eq(schema.inventoryCountItems.id, itemId)
    });

    if (!existingItem) {
      return res.status(404).json({ 
        success: false, 
        error: 'Inventur-Item nicht gefunden' 
      });
    }

    // Update durchführen
    const updateData: any = {};
    if (countedQuantity !== undefined) updateData.countedQuantity = countedQuantity;
    if (notes !== undefined) updateData.notes = notes;

    await db.update(schema.inventoryCountItems)
      .set(updateData)
      .where(eq(schema.inventoryCountItems.id, itemId));

    return res.status(200).json({
      success: true,
      message: 'Item erfolgreich aktualisiert',
      data: {
        itemId,
        countedQuantity,
        notes,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[SIMPLE-API] Fehler beim Item-Update:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Serverfehler beim Item-Update' 
    });
  }
});

export default router;