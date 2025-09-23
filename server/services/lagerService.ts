/**
 * Lager Service V2 - Komplett neue Implementierung
 * 
 * Robuste Lagerverwaltung mit:
 * - Batch-Verfolgung und FIFO-Management
 * - Vollständige Bewegungsdokumentation
 * - Benachrichtigungen für niedrige Bestände
 * - Ablaufende Chargen-Überwachung
 */

import { db } from '../db';
import { sql, eq, and, desc, asc, gte, lte, lt } from 'drizzle-orm';
import { logDebug, logError } from '../utils/bugTracker';

// Types für das neue Lager-System
export interface LagerOverview {
  warehouseId: number;
  warehouseName: string;
  totalProducts: number;
  criticalItems: number;
  expiringBatches: number;
  totalValue: number;
  lastActivity: string | null;
}

export interface LagerInventoryItem {
  id: number;
  productId: number;
  productName: string;
  currentStock: number;
  minStock: number;
  reorderPoint: number;
  status: 'good' | 'low' | 'critical' | 'out';
  batches: ProductBatch[];
  movements: InventoryMovement[];
}

export interface ProductBatch {
  id: number;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  daysUntilExpiry: number;
  status: 'good' | 'warning' | 'expired';
  receivedDate: string;
  supplierBatchNumber?: string;
}

export interface InventoryMovement {
  id: number;
  type: string;
  quantity: number;
  direction: 'in' | 'out';
  date: string;
  performedBy: string | null;
  notes: string | null;
  batchNumber?: string;
  reference?: string;
}

export interface LagerNotification {
  id: string;
  type: 'low_stock' | 'expiring_batch' | 'expired_batch';
  productId: number;
  productName: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  created: string;
  warehouseId: number;
}

/**
 * Holt eine Übersicht aller Lager mit wichtigen Kennzahlen
 */
export async function getLagerOverview(): Promise<LagerOverview[]> {
  logDebug('LagerService', 'Fetching lager overview');
  
  try {
    const query = sql`
      SELECT 
        w.id as warehouse_id,
        w.name as warehouse_name,
        COUNT(DISTINCT i.product_id) as total_products,
        COUNT(CASE WHEN i.quantity <= COALESCE(i.min_quantity, 0) THEN 1 END) as critical_items,
        COUNT(CASE WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '7 days' 
               AND pb.expiry_date > CURRENT_DATE THEN 1 END) as expiring_batches,
        COALESCE(SUM(i.quantity * COALESCE(p.price, 0)), 0) as total_value,
        MAX(im.performed_at) as last_activity
      FROM warehouses w
      LEFT JOIN inventory_items i ON w.id = i.warehouse_id
      LEFT JOIN products p ON i.product_id = p.id
      LEFT JOIN product_batches pb ON i.warehouse_id = pb.warehouse_id AND i.product_id = pb.product_id
      LEFT JOIN inventory_movements im ON w.id = COALESCE(im.source_warehouse_id, im.destination_warehouse_id)
      WHERE w.status = 'active'
      GROUP BY w.id, w.name
      ORDER BY w.name
    `;
    
    const result = await db.execute(query);
    
    return result.rows.map(row => ({
      warehouseId: Number(row.warehouse_id),
      warehouseName: String(row.warehouse_name),
      totalProducts: Number(row.total_products || 0),
      criticalItems: Number(row.critical_items || 0),
      expiringBatches: Number(row.expiring_batches || 0),
      totalValue: Number(row.total_value || 0),
      lastActivity: row.last_activity ? String(row.last_activity) : null
    }));
    
  } catch (error) {
    logError('LagerService', 'Error fetching lager overview', error);
    throw error;
  }
}

/**
 * Holt detaillierte Inventar-Informationen für ein spezifisches Lager
 */
export async function getLagerInventory(warehouseId: number): Promise<LagerInventoryItem[]> {
  logDebug('LagerService', `Fetching inventory for warehouse ${warehouseId}`);
  
  try {
    // Hauptabfrage für Inventar-Items
    const inventoryQuery = sql`
      SELECT 
        i.id,
        i.product_id,
        COALESCE(p.product_name, 'Produkt ID ' || i.product_id) as product_name,
        i.quantity as current_stock,
        COALESCE(i.min_quantity, 0) as min_stock,
        COALESCE(i.reorder_point, i.min_quantity, 0) as reorder_point,
        CASE 
          WHEN i.quantity <= 0 THEN 'out'
          WHEN i.quantity <= COALESCE(i.min_quantity, 0) THEN 'critical'
          WHEN i.quantity <= COALESCE(i.reorder_point, i.min_quantity * 1.5, 0) THEN 'low'
          ELSE 'good'
        END as status
      FROM inventory_items i
      LEFT JOIN products p ON i.product_id = p.id
      WHERE i.warehouse_id = ${warehouseId}
      ORDER BY product_name
    `;
    
    const inventoryResult = await db.execute(inventoryQuery);
    
    // Für jedes Inventar-Item die Batches und Bewegungen laden
    const inventoryItems: LagerInventoryItem[] = [];
    
    for (const item of inventoryResult.rows) {
      // Batches laden
      const batchesQuery = sql`
        SELECT 
          id,
          batch_number,
          current_quantity as quantity,
          expiry_date,
          (expiry_date - CURRENT_DATE) as days_until_expiry,
          CASE 
            WHEN expiry_date < CURRENT_DATE THEN 'expired'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'warning'
            ELSE 'good'
          END as status,
          received_date,
          supplier_ref as supplier_batch_number
        FROM product_batches
        WHERE warehouse_id = ${warehouseId} 
          AND product_id = ${item.product_id}
          AND current_quantity > 0
        ORDER BY expiry_date ASC
      `;
      
      const batchesResult = await db.execute(batchesQuery);
      
      // Letzte Bewegungen laden
      const movementsQuery = sql`
        SELECT 
          im.id,
          im.movement_type as type,
          im.quantity,
          CASE 
            WHEN im.destination_warehouse_id = ${warehouseId} THEN 'in'
            ELSE 'out'
          END as direction,
          im.performed_at as date,
          u.name as performed_by,
          im.notes,
          im.batch_number,
          im.reference_id as reference
        FROM inventory_movements im
        LEFT JOIN users u ON im.performed_by = u.id
        WHERE im.product_id = ${item.product_id}
          AND (im.source_warehouse_id = ${warehouseId} OR im.destination_warehouse_id = ${warehouseId})
        ORDER BY im.performed_at DESC
        LIMIT 10
      `;
      
      const movementsResult = await db.execute(movementsQuery);
      
      inventoryItems.push({
        id: Number(item.id),
        productId: Number(item.product_id),
        productName: String(item.product_name),
        currentStock: Number(item.current_stock || 0),
        minStock: Number(item.min_stock || 0),
        reorderPoint: Number(item.reorder_point || 0),
        status: item.status as 'good' | 'low' | 'critical' | 'out',
        batches: batchesResult.rows.map(batch => ({
          id: Number(batch.id),
          batchNumber: String(batch.batch_number),
          quantity: Number(batch.quantity),
          expiryDate: String(batch.expiry_date),
          daysUntilExpiry: Number(batch.days_until_expiry || 0),
          status: batch.status as 'good' | 'warning' | 'expired',
          receivedDate: String(batch.received_date),
          supplierBatchNumber: batch.supplier_batch_number ? String(batch.supplier_batch_number) : undefined
        })),
        movements: movementsResult.rows.map(movement => ({
          id: Number(movement.id),
          type: String(movement.type),
          quantity: Number(movement.quantity),
          direction: movement.direction as 'in' | 'out',
          date: String(movement.date),
          performedBy: movement.performed_by ? String(movement.performed_by) : null,
          notes: movement.notes ? String(movement.notes) : null,
          batchNumber: movement.batch_number ? String(movement.batch_number) : undefined,
          reference: movement.reference ? String(movement.reference) : undefined
        }))
      });
    }
    
    return inventoryItems;
    
  } catch (error) {
    logError('LagerService', `Error fetching inventory for warehouse ${warehouseId}`, error);
    throw error;
  }
}

/**
 * Holt aktuelle Benachrichtigungen für alle Lager
 */
export async function getLagerNotifications(): Promise<LagerNotification[]> {
  logDebug('LagerService', 'Fetching lager notifications');
  
  try {
    const notifications: LagerNotification[] = [];
    
    // Niedrige Bestände
    const lowStockQuery = sql`
      SELECT 
        i.warehouse_id,
        i.product_id,
        COALESCE(p.product_name, 'Produkt ID ' || i.product_id) as product_name,
        i.quantity,
        i.min_quantity
      FROM inventory_items i
      LEFT JOIN products p ON i.product_id = p.id
      WHERE i.quantity <= COALESCE(i.min_quantity, 0)
      ORDER BY i.warehouse_id, product_name
    `;
    
    const lowStockResult = await db.execute(lowStockQuery);
    
    for (const item of lowStockResult.rows) {
      notifications.push({
        id: `low_stock_${item.warehouse_id}_${item.product_id}`,
        type: 'low_stock',
        productId: Number(item.product_id),
        productName: String(item.product_name),
        message: `Niedriger Bestand: ${item.quantity} (Min: ${item.min_quantity})`,
        severity: Number(item.quantity) <= 0 ? 'critical' : 'warning',
        created: new Date().toISOString(),
        warehouseId: Number(item.warehouse_id)
      });
    }
    
    // Ablaufende Chargen (nächste 7 Tage)
    const expiringBatchesQuery = sql`
      SELECT 
        pb.warehouse_id,
        pb.product_id,
        COALESCE(p.product_name, 'Produkt ID ' || pb.product_id) as product_name,
        pb.batch_number,
        pb.expiry_date,
        pb.current_quantity,
        (pb.expiry_date - CURRENT_DATE) as days_until_expiry
      FROM product_batches pb
      LEFT JOIN products p ON pb.product_id = p.id
      WHERE pb.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
        AND pb.expiry_date > CURRENT_DATE
        AND pb.current_quantity > 0
      ORDER BY pb.expiry_date ASC
    `;
    
    const expiringResult = await db.execute(expiringBatchesQuery);
    
    for (const batch of expiringResult.rows) {
      const daysUntilExpiry = Number(batch.days_until_expiry || 0);
      notifications.push({
        id: `expiring_batch_${batch.warehouse_id}_${batch.product_id}_${batch.batch_number}`,
        type: 'expiring_batch',
        productId: Number(batch.product_id),
        productName: String(batch.product_name),
        message: `Charge läuft in ${daysUntilExpiry} Tag${daysUntilExpiry !== 1 ? 'en' : ''} ab: ${batch.batch_number}`,
        severity: daysUntilExpiry <= 1 ? 'critical' : daysUntilExpiry <= 3 ? 'warning' : 'info',
        created: new Date().toISOString(),
        warehouseId: Number(batch.warehouse_id)
      });
    }
    
    // Abgelaufene Chargen
    const expiredBatchesQuery = sql`
      SELECT 
        pb.warehouse_id,
        pb.product_id,
        COALESCE(p.product_name, 'Produkt ID ' || pb.product_id) as product_name,
        pb.batch_number,
        pb.expiry_date,
        pb.current_quantity
      FROM product_batches pb
      LEFT JOIN products p ON pb.product_id = p.id
      WHERE pb.expiry_date < CURRENT_DATE
        AND pb.current_quantity > 0
      ORDER BY pb.expiry_date DESC
    `;
    
    const expiredResult = await db.execute(expiredBatchesQuery);
    
    for (const batch of expiredResult.rows) {
      notifications.push({
        id: `expired_batch_${batch.warehouse_id}_${batch.product_id}_${batch.batch_number}`,
        type: 'expired_batch',
        productId: Number(batch.product_id),
        productName: String(batch.product_name),
        message: `Abgelaufene Charge: ${batch.batch_number} (${batch.current_quantity} Stück)`,
        severity: 'critical',
        created: new Date().toISOString(),
        warehouseId: Number(batch.warehouse_id)
      });
    }
    
    return notifications;
    
  } catch (error) {
    logError('LagerService', 'Error fetching lager notifications', error);
    throw error;
  }
}

/**
 * Erstellt eine neue Warenbewegung mit vollständiger FIFO-Dokumentation
 */
export async function createMovement(movement: {
  productId: number;
  warehouseId: number;
  quantity: number;
  type: string;
  direction: 'in' | 'out';
  batchNumber?: string;
  notes?: string;
  performedBy: number;
  referenceId?: string;
  referenceType?: string;
}): Promise<{ success: boolean; message: string; batchesAffected?: string[] }> {
  logDebug('LagerService', 'Creating movement with FIFO logic', movement);
  
  try {
    // Start transaction
    await db.execute(sql`BEGIN`);
    
    if (movement.direction === 'out') {
      // FIFO: Prüfe verfügbaren Bestand und verwende älteste Chargen zuerst
      const availableBatchesQuery = sql`
        SELECT id, batch_number, current_quantity, expiry_date
        FROM product_batches
        WHERE warehouse_id = ${movement.warehouseId} 
          AND product_id = ${movement.productId}
          AND current_quantity > 0
          AND status = 'active'
        ORDER BY expiry_date ASC, received_date ASC
      `;
      
      const availableBatches = await db.execute(availableBatchesQuery);
      
      const totalAvailable = availableBatches.rows.reduce((sum, batch) => 
        sum + Number(batch.current_quantity), 0);
      
      if (totalAvailable < movement.quantity) {
        await db.execute(sql`ROLLBACK`);
        return {
          success: false,
          message: `Nicht genügend Bestand verfügbar. Verfügbar: ${totalAvailable}, Benötigt: ${movement.quantity}`
        };
      }
      
      // FIFO: Entnahme aus ältesten Chargen
      let remainingQuantity = movement.quantity;
      const batchesAffected: string[] = [];
      
      for (const batch of availableBatches.rows) {
        if (remainingQuantity <= 0) break;
        
        const batchQuantity = Number(batch.current_quantity);
        const takeFromBatch = Math.min(remainingQuantity, batchQuantity);
        
        // Update Batch-Bestand
        await db.execute(sql`
          UPDATE product_batches 
          SET current_quantity = current_quantity - ${takeFromBatch},
              updated_at = NOW()
          WHERE id = ${batch.id}
        `);
        
        // Bewegung für diese Charge dokumentieren
        await db.execute(sql`
          INSERT INTO inventory_movements (
            product_id, quantity, movement_type, direction,
            source_warehouse_id, batch_number, batch_id,
            notes, performed_by, reference_id, reference_type,
            performed_at
          ) VALUES (
            ${movement.productId}, ${takeFromBatch}, ${movement.type}, 'out',
            ${movement.warehouseId}, ${batch.batch_number}, ${batch.id},
            ${movement.notes || null}, ${movement.performedBy},
            ${movement.referenceId || null}, ${movement.referenceType || null},
            NOW()
          )
        `);
        
        batchesAffected.push(String(batch.batch_number));
        remainingQuantity -= takeFromBatch;
      }
      
      // Inventar-Gesamtbestand aktualisieren
      await db.execute(sql`
        UPDATE inventory_items 
        SET quantity = quantity - ${movement.quantity}, updated_at = NOW()
        WHERE warehouse_id = ${movement.warehouseId} AND product_id = ${movement.productId}
      `);
      
      await db.execute(sql`COMMIT`);
      
      return {
        success: true,
        message: `${movement.quantity} Stück erfolgreich entnommen (FIFO)`,
        batchesAffected
      };
      
    } else {
      // Eingang: Neue Charge oder bestehende Charge auffüllen
      if (movement.batchNumber) {
        // Bestehende Charge auffüllen
        const existingBatchQuery = sql`
          SELECT id, current_quantity 
          FROM product_batches
          WHERE warehouse_id = ${movement.warehouseId} 
            AND product_id = ${movement.productId}
            AND batch_number = ${movement.batchNumber}
        `;
        
        const existingBatch = await db.execute(existingBatchQuery);
        
        if (existingBatch.rows.length > 0) {
          // Bestehende Charge aktualisieren
          await db.execute(sql`
            UPDATE product_batches 
            SET current_quantity = current_quantity + ${movement.quantity},
                updated_at = NOW()
            WHERE id = ${existingBatch.rows[0].id}
          `);
        } else {
          // Neue Charge erstellen (vereinfacht für Demo)
          await db.execute(sql`
            INSERT INTO product_batches (
              warehouse_id, product_id, batch_number,
              initial_quantity, current_quantity,
              received_date, expiry_date, status
            ) VALUES (
              ${movement.warehouseId}, ${movement.productId}, ${movement.batchNumber},
              ${movement.quantity}, ${movement.quantity},
              CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'active'
            )
          `);
        }
      }
      
      // Bewegung dokumentieren
      await db.execute(sql`
        INSERT INTO inventory_movements (
          product_id, quantity, movement_type, direction,
          destination_warehouse_id, batch_number,
          notes, performed_by, reference_id, reference_type,
          performed_at
        ) VALUES (
          ${movement.productId}, ${movement.quantity}, ${movement.type}, 'in',
          ${movement.warehouseId}, ${movement.batchNumber || null},
          ${movement.notes || null}, ${movement.performedBy},
          ${movement.referenceId || null}, ${movement.referenceType || null},
          NOW()
        )
      `);
      
      // Inventar-Gesamtbestand aktualisieren
      await db.execute(sql`
        UPDATE inventory_items 
        SET quantity = quantity + ${movement.quantity}, updated_at = NOW()
        WHERE warehouse_id = ${movement.warehouseId} AND product_id = ${movement.productId}
      `);
      
      await db.execute(sql`COMMIT`);
      
      return {
        success: true,
        message: `${movement.quantity} Stück erfolgreich hinzugefügt`,
        batchesAffected: movement.batchNumber ? [movement.batchNumber] : []
      };
    }
    
  } catch (error) {
    await db.execute(sql`ROLLBACK`);
    logError('LagerService', 'Error creating movement', error);
    throw error;
  }
}

/**
 * Aktualisiert Mindestbestände für ein Produkt mit Validierung
 */
export async function updateMinStock(
  warehouseId: number,
  productId: number,
  minQuantity: number,
  reorderPoint?: number
): Promise<{ success: boolean; message: string }> {
  logDebug('LagerService', `Updating min stock for product ${productId} in warehouse ${warehouseId}`);
  
  try {
    // Validierung
    if (minQuantity < 0) {
      return {
        success: false,
        message: 'Mindestbestand kann nicht negativ sein'
      };
    }
    
    if (minQuantity > 10000) {
      return {
        success: false,
        message: 'Mindestbestand darf nicht größer als 10.000 sein'
      };
    }
    
    // Prüfe ob das Inventar-Element existiert
    const checkQuery = sql`
      SELECT id, quantity 
      FROM inventory_items 
      WHERE warehouse_id = ${warehouseId} 
        AND product_id = ${productId}
    `;
    
    const checkResult = await db.execute(checkQuery);
    
    if (checkResult.rows.length === 0) {
      return {
        success: false,
        message: 'Inventar-Element nicht gefunden'
      };
    }
    
    const currentStock = Number(checkResult.rows[0].quantity);
    const finalReorderPoint = reorderPoint || minQuantity;
    
    const updateQuery = sql`
      UPDATE inventory_items 
      SET 
        min_quantity = ${minQuantity},
        reorder_point = ${finalReorderPoint},
        updated_at = NOW()
      WHERE warehouse_id = ${warehouseId} 
        AND product_id = ${productId}
    `;
    
    const result = await db.execute(updateQuery);
    
    if (result.rowCount === 0) {
      return {
        success: false,
        message: 'Fehler beim Aktualisieren des Mindestbestands'
      };
    }
    
    // Log für Audit-Trail
    await db.execute(sql`
      INSERT INTO inventory_movements (
        product_id, quantity, movement_type, direction,
        source_warehouse_id, notes, performed_by,
        performed_at
      ) VALUES (
        ${productId}, 0, 'min_stock_update', 'config',
        ${warehouseId}, 
        ${'Mindestbestand: ' + minQuantity + ', Nachbestellpunkt: ' + finalReorderPoint},
        1, NOW()
      )
    `);
    
    let warningMessage = '';
    if (currentStock <= minQuantity) {
      warningMessage = ` Warnung: Aktueller Bestand (${currentStock}) liegt unter dem neuen Mindestbestand!`;
    }
    
    logDebug('LagerService', 'Min stock updated successfully');
    
    return {
      success: true,
      message: `Mindestbestand auf ${minQuantity} aktualisiert.${warningMessage}`
    };
    
  } catch (error) {
    logError('LagerService', 'Error updating min stock', error);
    return {
      success: false,
      message: 'Fehler beim Aktualisieren des Mindestbestands'
    };
  }
}