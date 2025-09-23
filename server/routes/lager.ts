/**
 * Lager API Routes V2
 * 
 * Neue, saubere API-Routen für das Lager-Management
 */

import { Router } from 'express';
import { 
  getLagerOverview, 
  getLagerInventory, 
  getLagerNotifications,
  createMovement,
  updateMinStock
} from '../services/lagerService';
import { logDebug, logError } from '../utils/bugTracker';

const router = Router();

/**
 * GET /api/lager/overview
 * Holt Übersicht aller Lager mit Kennzahlen
 */
router.get('/overview', async (req, res) => {
  try {
    logDebug('LagerAPI', 'Fetching lager overview');
    const overview = await getLagerOverview();
    res.json(overview);
  } catch (error) {
    logError('LagerAPI', 'Error fetching lager overview', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Lager-Übersicht',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/lager/inventory/:warehouseId
 * Holt detailliertes Inventar für ein spezifisches Lager
 */
router.get('/inventory/:warehouseId', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }
    
    logDebug('LagerAPI', `Fetching inventory for warehouse ${warehouseId}`);
    const inventory = await getLagerInventory(warehouseId);
    res.json(inventory);
  } catch (error) {
    logError('LagerAPI', 'Error fetching inventory', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden des Inventars',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/lager/notifications
 * Holt aktuelle Benachrichtigungen für alle Lager
 */
router.get('/notifications', async (req, res) => {
  try {
    logDebug('LagerAPI', 'Fetching lager notifications');
    const notifications = await getLagerNotifications();
    res.json(notifications);
  } catch (error) {
    logError('LagerAPI', 'Error fetching notifications', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Benachrichtigungen',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/lager/movement
 * Erstellt eine neue Warenbewegung
 */
router.post('/movement', async (req, res) => {
  try {
    const {
      productId,
      warehouseId,
      quantity,
      type,
      direction,
      batchNumber,
      notes,
      referenceId,
      referenceType
    } = req.body;
    
    // Validation
    if (!productId || !warehouseId || !quantity || !type || !direction) {
      return res.status(400).json({ 
        error: 'Pflichtfelder fehlen: productId, warehouseId, quantity, type, direction' 
      });
    }
    
    if (!['in', 'out'].includes(direction)) {
      return res.status(400).json({ error: 'Direction muss "in" oder "out" sein' });
    }
    
    // TODO: Get user ID from session/auth
    const performedBy = 1; // Dummy user ID for now
    
    const result = await createMovement({
      productId: parseInt(productId),
      warehouseId: parseInt(warehouseId),
      quantity: parseInt(quantity),
      type,
      direction,
      batchNumber,
      notes,
      performedBy,
      referenceId,
      referenceType
    });
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.message 
      });
    }
    
    logDebug('LagerAPI', 'Movement created successfully');
    res.json({ 
      success: true, 
      message: result.message,
      batchesAffected: result.batchesAffected
    });
    
  } catch (error) {
    logError('LagerAPI', 'Error creating movement', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen der Bewegung',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/lager/min-stock
 * Aktualisiert Mindestbestände
 */
router.put('/min-stock', async (req, res) => {
  try {
    const { warehouseId, productId, minQuantity, reorderPoint } = req.body;
    
    if (!warehouseId || !productId || minQuantity === undefined) {
      return res.status(400).json({ 
        error: 'Pflichtfelder fehlen: warehouseId, productId, minQuantity' 
      });
    }
    
    const result = await updateMinStock(
      parseInt(warehouseId),
      parseInt(productId),
      parseInt(minQuantity),
      reorderPoint ? parseInt(reorderPoint) : undefined
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.message 
      });
    }
    
    logDebug('LagerAPI', 'Min stock updated successfully');
    res.json({ 
      success: true, 
      message: result.message 
    });
    
  } catch (error) {
    logError('LagerAPI', 'Error updating min stock', error);
    res.status(500).json({ 
      error: 'Fehler beim Aktualisieren des Mindestbestands',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/lager/warehouses
 * Holt alle aktiven Lager (für Dropdown-Listen etc.)
 */
router.get('/warehouses', async (req, res) => {
  try {
    logDebug('LagerAPI', 'Fetching active warehouses');
    
    // Use consistent db import
    const result = await db.execute(sql`
      SELECT id, name, description, city
      FROM warehouses 
      WHERE status = 'active'
      ORDER BY name
    `);
    
    const warehouses = result.rows.map(row => ({
      id: Number(row.id),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      city: row.city ? String(row.city) : null
    }));
    
    res.json(warehouses);
    
  } catch (error) {
    logError('LagerAPI', 'Error fetching warehouses', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Lager',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;