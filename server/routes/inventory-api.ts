import express from 'express';
import { db } from '../db';

// Funktion für die Synchronisierung von Automaten-Beständen mit dem Lager
async function syncMachineInventoryWithWarehouse(machineId: number) {
  console.log(`Synchronisiere Automaten ${machineId} mit Warenbestand...`);
  
  try {
    // 1. Zugewiesenes Lager für die Maschine ermitteln
    const assignmentQuery = `
      SELECT warehouse_id FROM machine_warehouse_assignments 
      WHERE machine_id = $1 AND is_active = true
      LIMIT 1
    `;
    const assignmentResult = await db.query(assignmentQuery, [machineId]);
    
    if (assignmentResult.rows.length === 0) {
      throw new Error(`Keine aktive Lager-Zuweisung für Automaten ${machineId} gefunden`);
    }
    
    const warehouseId = assignmentResult.rows[0].warehouse_id;
    console.log(`Automat ${machineId} ist Lager ${warehouseId} zugewiesen`);
    
    // 2. Aktuelle Bestandsdaten des Automaten abrufen
    const machineStockQuery = `
      SELECT 
        ms.product_id,
        p.name as product_name,
        ms.quantity as machine_quantity,
        COALESCE(i.quantity, 0) as warehouse_quantity
      FROM 
        machine_stock ms
      JOIN 
        products p ON ms.product_id = p.id
      LEFT JOIN 
        inventory_items i ON ms.product_id = i.product_id AND i.warehouse_id = $1
      WHERE 
        ms.machine_id = $2
    `;
    
    const stockResult = await db.query(machineStockQuery, [warehouseId, machineId]);
    console.log(`${stockResult.rows.length} Produkte im Automaten gefunden`);
    
    // 3. Für jedes Produkt abgleichen und Warenbewegungen erzeugen
    const results = {
      updatedProducts: 0,
      newProducts: 0,
      movements: 0,
      errors: 0,
      details: [] as any[]
    };
    
    for (const item of stockResult.rows) {
      try {
        // Bestandskorrektur - Maschine wird als "korrekt" angesehen
        // Lagerbestand wird entsprechend der Differenz angepasst
        const machineQty = parseInt(item.machine_quantity);
        const warehouseQty = parseInt(item.warehouse_quantity);
        
        // Inventareintrag für das Produkt suchen oder erstellen
        let inventoryItem = await db.query(
          `SELECT id FROM inventory_items WHERE warehouse_id = $1 AND product_id = $2`,
          [warehouseId, item.product_id]
        );
        
        if (inventoryItem.rows.length === 0) {
          // Neuen Inventareintrag erstellen
          await db.query(
            `INSERT INTO inventory_items (warehouse_id, product_id, quantity, min_quantity) 
             VALUES ($1, $2, 0, 0)`,
            [warehouseId, item.product_id]
          );
          
          inventoryItem = await db.query(
            `SELECT id FROM inventory_items WHERE warehouse_id = $1 AND product_id = $2`,
            [warehouseId, item.product_id]
          );
          
          results.newProducts++;
          console.log(`Neuer Lagerbestandseintrag für Produkt ${item.product_id} (${item.product_name}) erstellt`);
        }
        
        // Bewegung erstellen und Bestand aktualisieren
        const movementType = machineQty > warehouseQty ? 'OUT' : 'IN';
        const diffQuantity = Math.abs(machineQty - warehouseQty);
        
        // Nur Bewegung erstellen, wenn tatsächlich eine Differenz besteht
        if (diffQuantity > 0) {
          // Warenbewegung eintragen
          await db.query(
            `INSERT INTO inventory_movements (
              product_id, quantity, movement_type, 
              source_type, source_id, 
              destination_type, destination_id,
              reference_type, reference_id, 
              reason, performed_at, notes
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11
            )`,
            [
              item.product_id, 
              diffQuantity, 
              movementType,
              movementType === 'OUT' ? 'warehouse' : 'machine',
              movementType === 'OUT' ? warehouseId : machineId,
              movementType === 'OUT' ? 'machine' : 'warehouse',
              movementType === 'OUT' ? machineId : warehouseId,
              'SYNC', 
              `machine-${machineId}`,
              'Bestandskorrektur durch Automatenabgleich',
              `Automatenabgleich: Bestandsdifferenz von ${diffQuantity} für ${item.product_name}`
            ]
          );
          
          // Lagerbestand aktualisieren
          await db.query(
            `UPDATE inventory_items 
             SET quantity = $1, updated_at = NOW()
             WHERE warehouse_id = $2 AND product_id = $3`,
            [machineQty, warehouseId, item.product_id]
          );
          
          results.movements++;
          results.updatedProducts++;
          
          // Details zur Bewegung erfassen
          results.details.push({
            productId: item.product_id,
            productName: item.product_name,
            machineQuantity: machineQty,
            prevWarehouseQuantity: warehouseQty,
            newWarehouseQuantity: machineQty,
            movementType,
            diffQuantity
          });
          
          console.log(
            `Bestandskorrektur für ${item.product_name}: ${warehouseQty} -> ${machineQty} (${movementType} ${diffQuantity})`
          );
        }
      } catch (error) {
        results.errors++;
        console.error(`Fehler beim Abgleich von Produkt ${item.product_id}:`, error);
      }
    }
    
    console.log(`Automatenabgleich abgeschlossen: ${results.updatedProducts} Produkte aktualisiert, ${results.movements} Bewegungen erstellt`);
    return results;
  } catch (error) {
    console.error(`Fehler beim Automatenabgleich:`, error);
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

    const result = await db.query(query, [warehouseId]);
    
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
 * GET /api/inventory/warehouses/stats
 */
router.get('/api/inventory/warehouses/stats', asyncHandler(async (req: any, res: any) => {
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

    const result = await db.query(query);
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
 * GET /api/inventory/stats
 */
router.get('/api/inventory/stats', asyncHandler(async (req: any, res: any) => {
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
      db.query(totalItemsQuery),
      db.query(batchesQuery),
      db.query(criticalStockQuery),
      db.query(openCountsQuery),
      db.query(totalAlertsQuery)
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
        p.name as product_name,
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
        p.name as product_name,
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
        p.name as product_name,
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
      db.query(criticalStockQuery),
      db.query(expiringBatchesQuery),
      db.query(expiredBatchesQuery)
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
    // Debug-Log für Diagnose
    console.log(`Fetching stats for warehouse ID: ${warehouseId}`);

    const query = `
      WITH inventory_stats AS (
        SELECT 
          COUNT(DISTINCT i.product_id) as product_count,
          SUM(CASE WHEN i.quantity <= COALESCE(i.min_quantity, 0) THEN 1 ELSE 0 END) as critical_item_count,
          SUM(i.quantity * COALESCE(p.price, 0)) as inventory_value
        FROM 
          inventory_items i
        LEFT JOIN
          products p ON i.product_id = p.id
        WHERE 
          i.warehouse_id = $1
      ),
      machine_count AS (
        SELECT 
          COUNT(DISTINCT machine_id) as machine_count
        FROM 
          machine_warehouse_assignments
        WHERE 
          warehouse_id = $1
      )
      SELECT 
        COALESCE(i.product_count, 0) as product_count,
        COALESCE(i.critical_item_count, 0) as critical_item_count,
        COALESCE(i.inventory_value, 0) as inventory_value,
        COALESCE(m.machine_count, 0) as machine_count
      FROM 
        (SELECT 1) dummy
      LEFT JOIN inventory_stats i ON true
      LEFT JOIN machine_count m ON true
    `;

    const result = await db.query(query, [warehouseId]);
    console.log(`Warehouse stats query result:`, result.rows[0]);
    
    const defaultStats = {
      productCount: 0,
      criticalItemCount: 0,
      inventoryValue: 0,
      machineCount: 0
    };
    
    if (result.rows.length === 0) {
      console.log(`No stats found for warehouse ID: ${warehouseId}, returning defaults`);
      return res.json(defaultStats);
    }

    const stats = result.rows[0];
    
    const formattedStats = {
      productCount: parseInt(stats.product_count) || 0,
      criticalItemCount: parseInt(stats.critical_item_count) || 0,
      inventoryValue: parseFloat(stats.inventory_value) || 0,
      machineCount: parseInt(stats.machine_count) || 0
    };
    
    console.log(`Returning formatted stats:`, formattedStats);
    return res.json(formattedStats);
  } catch (error) {
    console.error(`Error fetching warehouse stats for ID ${warehouseId}:`, error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lagerstatistik',
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

  const query = `
    SELECT 
      i.id,
      i.product_id,
      p.name as product_name,
      p.sku,
      p.category,
      i.quantity,
      i.min_quantity,
      (SELECT COUNT(*) FROM product_batches WHERE product_id = i.product_id AND warehouse_id = i.warehouse_id) as batch_count,
      p.price,
      i.updated_at
    FROM 
      inventory_items i
    JOIN
      products p ON i.product_id = p.id
    WHERE 
      i.warehouse_id = $1
    ORDER BY
      p.name ASC
  `;

  const result = await db.query(query, [warehouseId]);
  res.json(result.rows);
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

  const query = `
    SELECT 
      m.id,
      m.product_id,
      p.name as product_name,
      m.quantity,
      m.movement_type,
      m.source_type,
      m.source_id,
      m.destination_type,
      m.destination_id,
      m.reference_type,
      m.reference_id,
      m.reason,
      m.performed_at,
      m.performed_by,
      m.notes
    FROM 
      inventory_movements m
    JOIN
      products p ON m.product_id = p.id
    WHERE 
      (m.source_type = 'warehouse' AND m.source_id = $1) OR
      (m.destination_type = 'warehouse' AND m.destination_id = $1)
    ORDER BY
      m.performed_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await db.query(query, [warehouseId, limit, offset]);
  res.json(result.rows);
}));

/**
 * API-Route zum Synchronisieren des Lagerbestands mit einem Automaten
 * POST /api/inventory/sync-machine/:id
 */
router.post('/api/inventory/sync-machine/:id', asyncHandler(async (req: any, res: any) => {
  const machineId = parseInt(req.params.id);
  if (isNaN(machineId)) {
    return res.status(400).json({ message: 'Ungültige Automaten-ID' });
  }

  try {
    const result = await syncMachineInventoryWithWarehouse(machineId);
    
    res.json({
      success: true,
      machineId,
      message: 'Bestandsabgleich erfolgreich durchgeführt',
      details: result
    });
  } catch (error: any) {
    console.error('Fehler beim Bestandsabgleich:', error);
    res.status(500).json({ 
      success: false,
      message: 'Fehler beim Bestandsabgleich', 
      error: error.message 
    });
  }
}));

export default router;