import express from 'express';
import { db, rawDb } from '../db';
import { logDebug, logError, logQuery } from '../utils/bugTracker';
import { 
  getWarehouseStatistics,
  getWarehouseInventory,
  getWarehouseMovements,
  syncMachineWithWarehouse
} from '../services/newWarehouseInventory';

/**
 * Synchronize machine inventory with warehouse
 * Uses the improved implementation in newWarehouseInventory service
 */
async function syncMachineInventoryWithWarehouse(machineId: number) {
  logDebug('SyncFunction', `Initiating sync for machine ${machineId} using improved implementation`);
  
  try {
    // Use the new implementation which handles all the needed steps
    const result = await syncMachineWithWarehouse(machineId);
    return result;
  } catch (error) {
    logError('SyncFunction', `Error in machine sync process for machine ${machineId}`, error);
    throw error;
  }
}

const router = express.Router();

/**
 * Allgemeine Fehlerbehandlungsfunktion für API-Routen
 */
const asyncHandler = (fn: Function) => (req: any, res: any, next: express.NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * API-Route für Basisinformationen eines Lagers
 * GET /api/inventory/warehouse/:id/info
 */
router.get('/api/inventory/warehouse/:id/info', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }

  try {
    // Logging zur Fehlersuche
    console.log(`Fetching warehouse info for ID: ${warehouseId}`);

    const query = `
      SELECT 
        w.id, 
        w.name, 
        w.address, 
        w.postal_code, 
        w.city, 
        w.description,
        w.is_active,
        w.created_at,
        w.updated_at
      FROM 
        warehouses w
      WHERE 
        w.id = $1
    `;

    const result = await rawDb.query(query, [warehouseId]);
    
    console.log(`Warehouse query result:`, result.rows);
    
    if (result.rows.length === 0) {
      console.log(`No warehouse found with ID: ${warehouseId}`);
      return res.status(404).json({ message: 'Lager nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching warehouse info:', error);
    return res.status(500).json({ message: 'Fehler beim Abrufen der Lagerinformationen', error: (error as Error).message });
  }
}));

/**
 * API-Route für die Gesamtstatistik über alle Lager im alten Format (für vorhandene Komponenten)
 * GET /warehouses/stats
 */
router.get('/warehouses/stats', asyncHandler(async (req: any, res: any) => {
  // Debug-Ausgabe für unsere Diagnose
  console.log("Executing warehouse stats query...");
  
  try {
    const query = `
      WITH inventory_stats AS (
        SELECT 
          i.warehouse_id,
          COUNT(DISTINCT i.product_id) as product_count,
          SUM(CASE WHEN i.quantity <= COALESCE(i.min_quantity, 0) THEN 1 ELSE 0 END) as critical_item_count,
          SUM(i.quantity * COALESCE(p.price, 0)) as inventory_value
        FROM 
          inventory_items i
        LEFT JOIN
          products p ON i.product_id = p.id
        GROUP BY
          i.warehouse_id
      ),
      machine_counts AS (
        SELECT 
          warehouse_id,
          COUNT(DISTINCT machine_id) as machine_count
        FROM 
          machine_warehouse_assignments
        GROUP BY
          warehouse_id
      )
      SELECT 
        w.id as warehouse_id,
        w.name as warehouse_name,
        COALESCE(i.product_count, 0) as product_count,
        COALESCE(i.critical_item_count, 0) as critical_item_count,
        COALESCE(i.inventory_value, 0) as inventory_value,
        COALESCE(m.machine_count, 0) as machine_count
      FROM 
        warehouses w
      LEFT JOIN
        inventory_stats i ON w.id = i.warehouse_id
      LEFT JOIN
        machine_counts m ON w.id = m.warehouse_id
      WHERE
        w.is_active = true
      ORDER BY
        w.name
    `;

    const result = await rawDb.query(query);
    console.log(`Warehouse stats query returned ${result.rows.length} rows`);
    
    // Normalisiere die Daten in das gewünschte Format für das Frontend
    const stats = result.rows.map((row: any) => ({
      warehouseId: parseInt(row.warehouse_id),
      warehouseName: row.warehouse_name,
      productCount: parseInt(row.product_count) || 0,
      criticalItemCount: parseInt(row.critical_item_count) || 0,
      inventoryValue: parseFloat(row.inventory_value) || 0,
      machineCount: parseInt(row.machine_count) || 0
    }));
    
    // Für Debug-Zwecke
    console.log("Returning warehouse stats data:", stats);
    
    return res.json(stats);
  } catch (error) {
    console.error("Error in warehouse stats API:", error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lagerstatistiken',
      details: (error as Error).message
    });
  }
}));

/**
 * API-Route für die Gesamtstatistik im Lagerhaltung-Format
 * GET /stats
 */
router.get('/stats', asyncHandler(async (req: any, res: any) => {
  // Debug-Ausgabe für unsere Diagnose
  console.log("Executing inventory stats query for Lagerhaltung page...");
  
  try {
    // Gesamtzahl der Produkte in allen Lagern
    const totalItemsQuery = `
      SELECT 
        COUNT(DISTINCT CONCAT(warehouse_id, '-', product_id)) as total_items 
      FROM 
        inventory_items 
      WHERE 
        quantity > 0
    `;
    
    // Aktive und kritische Chargen
    const batchesQuery = `
      SELECT 
        COUNT(*) as active_batches,
        SUM(CASE WHEN expiry_date <= NOW() + INTERVAL '30 days' AND expiry_date > NOW() THEN 1 ELSE 0 END) as expiring_batches,
        SUM(CASE WHEN expiry_date <= NOW() THEN 1 ELSE 0 END) as expired_batches
      FROM 
        product_batches 
      WHERE 
        current_quantity > 0
    `;
    
    // Kritische Bestände
    const criticalStockQuery = `
      SELECT 
        COUNT(*) as critical_stock 
      FROM 
        inventory_items 
      WHERE 
        quantity <= COALESCE(min_quantity, 0) 
        AND quantity > 0
    `;
    
    // Offene Inventuren
    const openCountsQuery = `
      SELECT 
        COUNT(*) as open_counts 
      FROM 
        inventory_counts 
      WHERE 
        status IN ('pending', 'in_progress')
    `;
    
    // Gesamtzahl der Warnungen
    const totalAlertsQuery = `
      WITH critical_items AS (
        SELECT COUNT(*) as count FROM inventory_items WHERE quantity <= COALESCE(min_quantity, 0) AND quantity > 0
      ),
      expiring_batches AS (
        SELECT COUNT(*) as count FROM product_batches WHERE expiry_date <= NOW() + INTERVAL '30 days' AND expiry_date > NOW() AND current_quantity > 0
      ),
      expired_batches AS (
        SELECT COUNT(*) as count FROM product_batches WHERE expiry_date <= NOW() AND current_quantity > 0
      )
      SELECT 
        (SELECT count FROM critical_items) + 
        (SELECT count FROM expiring_batches) + 
        (SELECT count FROM expired_batches) as total_alerts
    `;
    
    // Parallele Ausführung aller Abfragen
    const [totalItemsResult, batchesResult, criticalStockResult, openCountsResult, totalAlertsResult] = await Promise.all([
      rawDb.query(totalItemsQuery),
      rawDb.query(batchesQuery),
      rawDb.query(criticalStockQuery),
      rawDb.query(openCountsQuery),
      rawDb.query(totalAlertsQuery)
    ]);
    
    // Extrahiere die Werte und setze Defaults für NULL-Werte
    const totalItems = parseInt(totalItemsResult.rows[0]?.total_items) || 0;
    const { active_batches, expiring_batches, expired_batches } = batchesResult.rows[0] || { active_batches: 0, expiring_batches: 0, expired_batches: 0 };
    const criticalStock = parseInt(criticalStockResult.rows[0]?.critical_stock) || 0;
    const openCounts = parseInt(openCountsResult.rows[0]?.open_counts) || 0;
    const totalAlerts = parseInt(totalAlertsResult.rows[0]?.total_alerts) || 0;
    
    // Zusammenfassen der Stats
    const stats = {
      totalItems,
      activeBatches: parseInt(active_batches) || 0,
      expiringBatches: parseInt(expiring_batches) || 0, 
      expiredBatches: parseInt(expired_batches) || 0,
      criticalStock,
      openCounts,
      totalAlerts
    };
    
    // Für Debug-Zwecke
    console.log("Returning inventory stats data for Lagerhaltung page:", stats);
    
    return res.json(stats);
  } catch (error) {
    console.error("Error in inventory stats API for Lagerhaltung:", error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Statistikdaten',
      details: (error as Error).message
    });
  }
}));

/**
 * API-Route für Warnungen und Benachrichtigungen im Lagerhaltung-Format
 * GET /api/inventory/alerts
 */
router.get('/api/inventory/alerts', asyncHandler(async (req: any, res: any) => {
  // Debug-Ausgabe für unsere Diagnose
  console.log("Executing inventory alerts query for Lagerhaltung page...");
  
  try {
    // Kritische Bestände abfragen
    const criticalStockQuery = `
      SELECT 
        i.id as item_id,
        i.product_id,
        p.product_name as product_name,
        i.quantity,
        i.min_quantity,
        i.warehouse_id,
        w.name as warehouse_name
      FROM 
        inventory_items i
      JOIN
        products p ON i.product_id = p.id
      JOIN
        warehouses w ON i.warehouse_id = w.id
      WHERE 
        i.quantity <= COALESCE(i.min_quantity, 0) 
        AND i.quantity > 0
    `;
    
    // Ablaufende Chargen abfragen (innerhalb der nächsten 30 Tage)
    const expiringBatchesQuery = `
      SELECT 
        pb.id as batch_id,
        pb.product_id,
        p.product_name as product_name,
        pb.batch_number,
        pb.expiry_date,
        pb.current_quantity as remaining_quantity,
        pb.warehouse_id,
        w.name as warehouse_name
      FROM 
        product_batches pb
      JOIN
        products p ON pb.product_id = p.id
      JOIN
        warehouses w ON pb.warehouse_id = w.id
      WHERE 
        pb.expiry_date <= NOW() + INTERVAL '30 days' 
        AND pb.expiry_date > NOW() 
        AND pb.current_quantity > 0
    `;
    
    // Abgelaufene Chargen abfragen
    const expiredBatchesQuery = `
      SELECT 
        pb.id as batch_id,
        pb.product_id,
        p.product_name as product_name,
        pb.batch_number,
        pb.expiry_date,
        pb.current_quantity as remaining_quantity,
        pb.warehouse_id,
        w.name as warehouse_name
      FROM 
        product_batches pb
      JOIN
        products p ON pb.product_id = p.id
      JOIN
        warehouses w ON pb.warehouse_id = w.id
      WHERE 
        pb.expiry_date <= NOW() 
        AND pb.current_quantity > 0
    `;
    
    // Parallele Ausführung aller Abfragen
    const [criticalStockResult, expiringBatchesResult, expiredBatchesResult] = await Promise.all([
      rawDb.query(criticalStockQuery),
      rawDb.query(expiringBatchesQuery),
      rawDb.query(expiredBatchesQuery)
    ]);
    
    // Alerts aus kritischen Beständen erstellen
    const criticalStockAlerts = criticalStockResult.rows.map((item: any) => ({
      id: `critical-stock-${item.item_id}`,
      type: 'critical',
      title: 'Kritischer Bestand',
      message: `${item.product_name}: Bestand ${item.quantity} unter Mindestbestand ${item.min_quantity}`,
      warehouseName: item.warehouse_name,
      warehouseId: parseInt(item.warehouse_id),
      productId: parseInt(item.product_id),
      itemId: parseInt(item.item_id)
    }));
    
    // Alerts aus ablaufenden Chargen erstellen
    const expiringBatchesAlerts = expiringBatchesResult.rows.map((batch: any) => {
      const expiryDate = new Date(batch.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        id: `expiring-batch-${batch.batch_id}`,
        type: 'warning',
        title: 'Ablaufende Charge',
        message: `${batch.product_name} (${batch.batch_number}): Läuft in ${daysUntilExpiry} Tagen ab`,
        warehouseName: batch.warehouse_name,
        warehouseId: parseInt(batch.warehouse_id),
        productId: parseInt(batch.product_id),
        batchId: parseInt(batch.batch_id),
        expiryDate: batch.expiry_date
      };
    });
    
    // Alerts aus abgelaufenen Chargen erstellen
    const expiredBatchesAlerts = expiredBatchesResult.rows.map((batch: any) => {
      const expiryDate = new Date(batch.expiry_date);
      const daysSinceExpiry = Math.ceil((new Date().getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        id: `expired-batch-${batch.batch_id}`,
        type: 'critical',
        title: 'Abgelaufene Charge',
        message: `${batch.product_name} (${batch.batch_number}): Seit ${daysSinceExpiry} Tagen abgelaufen`,
        warehouseName: batch.warehouse_name,
        warehouseId: parseInt(batch.warehouse_id),
        productId: parseInt(batch.product_id),
        batchId: parseInt(batch.batch_id),
        expiryDate: batch.expiry_date
      };
    });
    
    // Alle Alerts zusammenführen und sortieren (kritische zuerst)
    const allAlerts = [
      ...expiredBatchesAlerts,
      ...criticalStockAlerts,
      ...expiringBatchesAlerts
    ];
    
    // Für Debug-Zwecke
    console.log(`Returning ${allAlerts.length} alerts for Lagerhaltung page`);
    
    return res.json(allAlerts);
  } catch (error) {
    console.error("Error in inventory alerts API for Lagerhaltung:", error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Warnungen',
      details: (error as Error).message
    });
  }
}));

/**
 * API-Route für Lagerstatistik
 * GET /api/inventory/warehouse/:id/stats
 */
router.get('/api/inventory/warehouse/:id/stats', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }

  try {
    // Verwende den neuen verbesserten Service für die Lagerstatistik
    logDebug('WarehouseStatsAPI', `Fetching statistics for warehouse ${warehouseId} using new service`);
    const formattedStats = await getWarehouseStatistics(warehouseId);
    
    // Protokollierung für Diagnose
    logDebug('WarehouseStatsAPI', `Statistics data for warehouse ${warehouseId}:`, formattedStats);
    
    return res.json(formattedStats);
  } catch (error) {
    logError('WarehouseStatsAPI', `Error fetching stats for warehouse ${warehouseId}`, error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lagerstatistiken',
      details: (error as Error).message
    });
  }
}));

/**
 * API-Route für Lagerbestand
 * GET /api/inventory/warehouse/:id
 */
router.get('/api/inventory/warehouse/:id', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }

  // Detaillierte Protokollierung hinzufügen
  logDebug('InventoryAPI', `Bestandsabfrage für Lager ID ${warehouseId} mit neuem Service`);

  try {
    // Verwende den neuen verbesserten Service für den Lagerbestand
    const inventory = await getWarehouseInventory(warehouseId);
    
    // Protokollierung für Diagnose
    logDebug('InventoryAPI', `Lagerbestand für Lager ${warehouseId} geladen: ${inventory.length} Einträge gefunden`);
    
    if (inventory.length > 0) {
      logDebug('InventoryAPI', `Beispiel-Eintrag:`, inventory[0]);
    }
    
    return res.json(inventory);
  } catch (error) {
    logError('InventoryAPI', `Fehler beim Abrufen des Lagerbestands (ID: ${warehouseId})`, error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen des Lagerbestands',
      details: (error as Error).message,
      warehouseId
    });
  }
}));

/**
 * API-Route für Bestandsbewegungen eines Lagers
 * GET /api/inventory/warehouse/:id/movements
 */
router.get('/api/inventory/warehouse/:id/movements', asyncHandler(async (req: any, res: any) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) {
    return res.status(400).json({ message: 'Ungültige Lager-ID' });
  }
  
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  // Detaillierte Protokollierung hinzufügen
  logDebug('MovementsAPI', `Warenbewegungen für Lager ID ${warehouseId} abrufen mit neuem Service, Limit: ${limit}, Offset: ${offset}`);

  try {
    // Verwende den neuen verbesserten Service für Warenbewegungen
    const movements = await getWarehouseMovements(warehouseId, limit, offset);
    
    // Protokollierung für Diagnose
    logDebug('MovementsAPI', `Warenbewegungen für Lager ${warehouseId} geladen: ${movements.length} Einträge gefunden`);
    
    if (movements.length > 0) {
      logDebug('MovementsAPI', `Beispiel-Eintrag:`, movements[0]);
    }
    
    return res.json(movements);
  } catch (error) {
    logError('MovementsAPI', `Fehler beim Abrufen der Warenbewegungen (ID: ${warehouseId})`, error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Warenbewegungen',
      details: (error as Error).message,
      warehouseId
    });
  }
}));

/**
 * API-Route zum Synchronisieren des Lagerbestands mit einem Automaten
 * POST /api/inventory/sync-machine/:id
 */
router.post('/api/inventory/sync-machine/:id', asyncHandler(async (req: any, res: any) => {
  const machineId = parseInt(req.params.id);
  if (isNaN(machineId)) {
    logError('SyncAPI', `Ungültige Automaten-ID angegeben: ${req.params.id}`, new Error('Invalid machine ID'));
    return res.status(400).json({ message: 'Ungültige Automaten-ID' });
  }

  // Detaillierte Protokollierung hinzufügen
  logDebug('SyncAPI', `Bestandsabgleich für Automaten ID ${machineId} gestartet mit verbessertem Service`);

  try {
    // Startzeit für Performance-Messung
    const startTime = Date.now();
    
    logDebug('SyncAPI', `Führe Synchronisierungsprozess mit neuem Service für Automat ${machineId} aus`);
    const result = await syncMachineWithWarehouse(machineId);
    
    const duration = Date.now() - startTime;
    logDebug('SyncAPI', `Abgleich abgeschlossen in ${duration}ms`);
    logDebug('SyncAPI', `Ergebnis:`, result);
    
    return res.json({
      success: true,
      machineId,
      message: 'Bestandsabgleich erfolgreich durchgeführt',
      details: result,
      duration: `${duration}ms`
    });
  } catch (error: any) {
    logError('SyncAPI', `Fehler beim Bestandsabgleich (Automat ID: ${machineId})`, error);
    return res.status(500).json({ 
      success: false,
      message: 'Fehler beim Bestandsabgleich', 
      error: error.message,
      machineId
    });
  }
}));

export default router;