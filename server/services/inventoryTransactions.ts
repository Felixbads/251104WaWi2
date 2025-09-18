import { eq, and, desc, sql, count, sum, asc, inArray, gte, lte, min, max } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { 
  orders, 
  orderItems, 
  inventoryItems, 
  productBatches, 
  inventoryMovements, 
  products,
  warehouses,
  suppliers,
  users,
  type Order,
  type OrderItem,
  type InventoryItem,
  type ProductBatch,
  type InventoryMovement,
  type Product,
  type InsertProductBatch,
  type InsertInventoryMovement,
  type InsertInventoryItem
} from '../../shared/schema.js';

// ========================================
// ZOD SCHEMAS FÜR VALIDIERUNG
// ========================================

/**
 * Schema für die Validierung einzelner Wareneingangspositionen
 */
export const receiptLineSchema = z.object({
  orderItemId: z.number().positive("Bestellposition-ID muss positiv sein"),
  productId: z.number().positive("Produkt-ID muss positiv sein"),
  productName: z.string().min(1, "Produktname ist erforderlich"),
  quantityOrdered: z.number().min(0, "Bestellte Menge muss mindestens 0 sein"),
  quantityReceived: z.number().min(0, "Erhaltene Menge muss mindestens 0 sein"),
  
  // Batch und MHD-Informationen
  batchNumber: z.string().min(1, "Chargennummer ist erforderlich").optional(),
  supplierBatchNumber: z.string().optional(),
  expiryDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "MHD muss im Format YYYY-MM-DD sein"),
    z.date()
  ]).transform((val) => {
    if (typeof val === 'string') {
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        throw new Error("Ungültiges MHD-Datum");
      }
      // Validierung: MHD darf nicht vor heute liegen
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        throw new Error("MHD darf nicht in der Vergangenheit liegen");
      }
      return val;
    }
    return val.toISOString().split('T')[0];
  }).optional(),
  
  // Lagerort
  locationInWarehouse: z.string().optional(),
  notes: z.string().optional(),
  
  // Qualitätskontrolle
  qualityStatus: z.enum(["good", "damaged", "partial", "rejected"]).default("good"),
  damageDescription: z.string().optional(),
}).superRefine((data, ctx) => {
  // Wenn MHD angegeben ist, muss Chargennummer vorhanden sein
  if (data.expiryDate && !data.batchNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bei MHD-Angabe ist Chargennummer erforderlich",
      path: ["batchNumber"]
    });
  }
  
  // Bei Schäden muss Beschreibung vorhanden sein
  if (data.qualityStatus === "damaged" && !data.damageDescription) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bei Schäden ist eine Beschreibung erforderlich",
      path: ["damageDescription"]
    });
  }
});

/**
 * Schema für die Validierung der gesamten Wareneingangs-Transaktion
 */
export const receiptTransactionSchema = z.object({
  orderId: z.number().positive("Bestellungs-ID ist erforderlich"),
  warehouseId: z.number().positive("Lager-ID ist erforderlich"),
  deliveryDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Lieferdatum muss im Format YYYY-MM-DD sein"),
    z.date()
  ]).transform((val) => {
    if (typeof val === 'string') {
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        throw new Error("Ungültiges Lieferdatum");
      }
      return val;
    }
    return val.toISOString().split('T')[0];
  }),
  
  // Wareneingangs-Positionen
  receiptLines: z.array(receiptLineSchema).min(1, "Mindestens eine Position ist erforderlich"),
  
  // Zusätzliche Informationen
  deliveryNoteNumber: z.string().optional(),
  notes: z.string().optional(),
  processedBy: z.number().positive("Verarbeiter-ID ist erforderlich"),
  
  // Status-Informationen
  overallQuality: z.enum(["good", "acceptable", "poor"]).default("good"),
  requiresFollowUp: z.boolean().default(false),
});

/**
 * Schema für FIFO-basierte Entnahmen
 */
export const fifoDepleteSchema = z.object({
  warehouseId: z.number().positive("Lager-ID ist erforderlich"),
  productId: z.number().positive("Produkt-ID ist erforderlich"),
  quantityToDeplete: z.number().positive("Entnahmemenge muss positiv sein"),
  
  // Bewegungs-Informationen
  movementType: z.enum(["OUT", "TRANSFER", "ADJUSTMENT"]).default("OUT"),
  referenceType: z.enum(["REFILL", "TRANSFER", "ADJUSTMENT", "MANUAL"]).default("MANUAL"),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
  performedBy: z.number().positive("Benutzer-ID ist erforderlich"),
  
  // Ziel-Informationen (für Transfers)
  destinationWarehouseId: z.number().positive().optional(),
  destinationMachineId: z.number().positive().optional(),
});

// ========================================
// TYPEN FÜR DIE FUNKTIONEN
// ========================================

export type ReceiptLine = z.infer<typeof receiptLineSchema>;
export type ReceiptTransaction = z.infer<typeof receiptTransactionSchema>;
export type FifoDeplete = z.infer<typeof fifoDepleteSchema>;

export interface ReceiptResult {
  success: boolean;
  orderId: number;
  orderStatus: string;
  processedLines: number;
  totalQuantityReceived: number;
  batchesCreated: number;
  movementsCreated: number;
  errors?: string[];
  warnings?: string[];
}

export interface FifoResult {
  success: boolean;
  totalDepleted: number;
  batchesProcessed: BatchDepletionResult[];
  movements: InventoryMovement[];
  remainingQuantity?: number;
  errors?: string[];
}

export interface BatchDepletionResult {
  batchId: number;
  batchNumber: string;
  quantityDepleted: number;
  remainingQuantity: number;
  expiryDate: string;
}

// ========================================
// HAUPT-FUNKTIONEN
// ========================================

/**
 * Vollständige transaktionale Abwicklung des Wareneingangs
 * 
 * Features:
 * - Status-Validierung (nur "sent"/"shipped" erlaubt)
 * - FOR UPDATE Locks zur Vermeidung von Race-Conditions
 * - Automatische Bestandsanpassung in inventory_items
 * - Charge-Management in product_batches mit FIFO-Sortierung
 * - Vollständiger Audit-Trail in inventory_movements
 * - Automatische Bestellstatus-Aktualisierung zu "delivered" oder "partial"
 */
export async function receiptTransaction(
  db: PgDatabase<any>,
  transaction: ReceiptTransaction
): Promise<ReceiptResult> {
  
  return await db.transaction(async (tx) => {
    try {
      // 1. Validierung der Eingabedaten
      const validatedData = receiptTransactionSchema.parse(transaction);
      
      // 2. Bestellung mit FOR UPDATE Lock laden
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, validatedData.orderId))
        .for('update');
      
      if (!order) {
        throw new Error(`Bestellung mit ID ${validatedData.orderId} nicht gefunden`);
      }
      
      // 3. Status-Validierung - nur "sent" oder "shipped" erlaubt
      if (!['sent', 'shipped'].includes(order.status)) {
        throw new Error(`Wareneingang nur für Bestellungen mit Status 'sent' oder 'shipped' möglich. Aktueller Status: ${order.status}`);
      }
      
      // 4. Bestellpositionen mit FOR UPDATE Lock laden
      const orderItemsData = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, validatedData.orderId))
        .for('update');
      
      if (orderItemsData.length === 0) {
        throw new Error(`Keine Bestellpositionen für Bestellung ${validatedData.orderId} gefunden`);
      }
      
      // 5. Validierung der Wareneingangs-Positionen
      const orderItemMap = new Map(orderItemsData.map(item => [item.id, item]));
      for (const line of validatedData.receiptLines) {
        if (!orderItemMap.has(line.orderItemId)) {
          throw new Error(`Bestellposition ${line.orderItemId} nicht gefunden`);
        }
      }
      
      const results = {
        success: true,
        orderId: validatedData.orderId,
        orderStatus: 'delivered',
        processedLines: 0,
        totalQuantityReceived: 0,
        batchesCreated: 0,
        movementsCreated: 0,
        errors: [] as string[],
        warnings: [] as string[]
      };
      
      // 6. Verarbeitung jeder Wareneingangs-Position
      for (const line of validatedData.receiptLines) {
        try {
          const orderItem = orderItemMap.get(line.orderItemId)!;
          
          if (line.quantityReceived > 0) {
            // 6a. Quality-Status bestimmen BEVOR Bestandsanpassung
            let batchStatus = 'active';
            if (line.qualityStatus === 'damaged') {
              batchStatus = 'quarantine';
            } else if (line.qualityStatus === 'rejected') {
              batchStatus = 'blocked';
            }
            
            // 6b. Bestandsanpassung in inventory_items NUR für aktive Chargen
            const existingInventory = await tx
              .select()
              .from(inventoryItems)
              .where(
                and(
                  eq(inventoryItems.warehouseId, validatedData.warehouseId),
                  eq(inventoryItems.productId, line.productId)
                )
              )
              .for('update')
              .limit(1);
            
            let previousStock = 0;
            let currentStock = 0;
            let quantityToAddToInventory = 0;
            
            // NUR aktive Chargen erhöhen den verfügbaren Bestand
            if (batchStatus === 'active') {
              quantityToAddToInventory = line.quantityReceived;
            }
            
            if (existingInventory.length > 0) {
              previousStock = existingInventory[0].quantity || 0;
              currentStock = previousStock + quantityToAddToInventory;
              
              // Bestand aktualisieren (nur bei aktiven Chargen erhöhen)
              if (quantityToAddToInventory > 0) {
                await tx
                  .update(inventoryItems)
                  .set({
                    quantity: currentStock,
                    updatedAt: new Date()
                  })
                  .where(eq(inventoryItems.id, existingInventory[0].id));
              }
            } else if (quantityToAddToInventory > 0) {
              previousStock = 0;
              currentStock = quantityToAddToInventory;
              
              // Neuen Bestand erstellen (nur für aktive Chargen)
              await tx.insert(inventoryItems).values({
                warehouseId: validatedData.warehouseId,
                productId: line.productId,
                quantity: quantityToAddToInventory,
                status: 'active'
              });
            } else {
              // Für nicht-aktive Chargen: Bestand bleibt unverändert
              previousStock = existingInventory.length > 0 ? existingInventory[0].quantity || 0 : 0;
              currentStock = previousStock;
            }
            
            // 6c. Charge erstellen/aktualisieren - IMMER eine Batch erstellen (synthetic batches für charge-lose Eingänge)
            let batchId: number | undefined;
            let previousBatchQuantity = 0;
            let currentBatchQuantity = line.quantityReceived;
            
            // Synthetic batch Daten generieren wenn nicht vorhanden (Option A: Synthetic Batches)
            const effectiveBatchNumber = line.batchNumber || `UNTRACKED-${Date.now()}-${line.productId}`;
            const effectiveExpiryDate = line.expiryDate || '2099-12-31'; // Weit in der Zukunft für unverfolgte Chargen
            const isSyntheticBatch = !line.batchNumber;
            
            // Bestehende Charge mit GLEICHER Qualität suchen (niemals verschiedene Qualitäten mergen!)
            const existingBatch = await tx
              .select()
              .from(productBatches)
              .where(
                and(
                  eq(productBatches.productId, line.productId),
                  eq(productBatches.warehouseId, validatedData.warehouseId),
                  eq(productBatches.batchNumber, effectiveBatchNumber),
                  eq(productBatches.expiryDate, effectiveExpiryDate),
                  eq(productBatches.status, batchStatus) // NUR gleiche Qualität!
                )
              )
              .for('update')
              .limit(1);
            
            if (existingBatch.length > 0) {
              // Bestehende Charge derselben Qualität aktualisieren
              previousBatchQuantity = existingBatch[0].currentQuantity || 0;
              currentBatchQuantity = previousBatchQuantity + line.quantityReceived;
              
              await tx
                .update(productBatches)
                .set({
                  currentQuantity: currentBatchQuantity,
                  supplierBatchNumber: line.supplierBatchNumber || existingBatch[0].supplierBatchNumber,
                  locationInWarehouse: line.locationInWarehouse || existingBatch[0].locationInWarehouse,
                  notes: line.notes ? `${existingBatch[0].notes || ''} | ${line.notes}` : existingBatch[0].notes,
                  updatedAt: new Date()
                })
                .where(eq(productBatches.id, existingBatch[0].id));
              
              batchId = existingBatch[0].id;
            } else {
              // Neue Charge erstellen (getrennt für verschiedene Qualitäten) - IMMER, auch für synthetic batches
              previousBatchQuantity = 0;
              
              const batchNotes = isSyntheticBatch 
                ? `Synthetic batch for untracked receipt${line.notes ? ` - ${line.notes}` : ''}` 
                : line.notes;
              
              const [newBatch] = await tx
                .insert(productBatches)
                .values({
                  productId: line.productId,
                  warehouseId: validatedData.warehouseId,
                  batchNumber: effectiveBatchNumber,
                  supplierBatchNumber: line.supplierBatchNumber,
                  initialQuantity: line.quantityReceived,
                  currentQuantity: line.quantityReceived,
                  receivedDate: validatedData.deliveryDate,
                  expiryDate: effectiveExpiryDate,
                  orderId: validatedData.orderId,
                  status: batchStatus,
                  locationInWarehouse: line.locationInWarehouse,
                  notes: batchNotes,
                  createdBy: validatedData.processedBy
                })
                .returning({ id: productBatches.id });
              
              batchId = newBatch.id;
              results.batchesCreated++;
            }
            
            // 6d. Kumulierte receivedQuantity in orderItems aktualisieren
            await tx
              .update(orderItems)
              .set({
                quantityDelivered: sql`${orderItems.quantityDelivered} + ${line.quantityReceived}`,
                status: 'partial', // wird später korrekt berechnet
                updatedAt: new Date()
              })
              .where(eq(orderItems.id, line.orderItemId));
            
            // 6e. Lagerbewegung mit vollständigem Audit-Trail (inkl. Batch-Änderungen)
            const batchChangeNote = batchId ? `Batch: ${previousBatchQuantity} → ${currentBatchQuantity}, ` : '';
            const inventoryChangeNote = quantityToAddToInventory > 0 ? `Inventar: ${previousStock} → ${currentStock}, ` : `Inventar: ${currentStock} (unverändert), `;
            const qualityNote = line.qualityStatus !== 'good' ? `Qualität: ${line.qualityStatus} (${batchStatus}), ` : '';
            const syntheticNote = isSyntheticBatch ? 'Synthetic Batch, ' : '';
            
            await tx.insert(inventoryMovements).values({
              sourceWarehouseId: null, // Eingang von extern
              destinationWarehouseId: validatedData.warehouseId,
              productId: line.productId,
              quantity: line.quantityReceived,
              movementType: 'IN',
              direction: 'IN',
              referenceType: 'ORDER',
              referenceId: validatedData.orderId.toString(),
              status: 'completed',
              notes: `Wareneingang - Bestellung ${order.orderNumber} - ${syntheticNote}${batchChangeNote}${inventoryChangeNote}${qualityNote}${line.notes ? `Notiz: ${line.notes}` : ''}`,
              performedBy: validatedData.processedBy,
              performedAt: new Date(),
              batchId: batchId,
              batchNumber: effectiveBatchNumber, // Use effective (possibly synthetic) batch number
              expiryDate: effectiveExpiryDate  // Use effective (possibly synthetic) expiry date
            });
            
            results.movementsCreated++;
          }
          
          results.processedLines++;
          results.totalQuantityReceived += line.quantityReceived;
          
          // Warnung bei erheblicher Abweichung von bestellter Menge
          if (orderItem.quantity > 0 && line.quantityReceived > 0) {
            const deviation = Math.abs(line.quantityReceived - orderItem.quantity) / orderItem.quantity;
            if (deviation > 0.1) {
              results.warnings!.push(
                `Position ${line.productName}: Erhaltene Menge (${line.quantityReceived}) weicht um ${Math.round(deviation * 100)}% von bestellter Menge (${orderItem.quantity}) ab`
              );
            }
          }
          
        } catch (error) {
          results.errors!.push(`Fehler bei Position ${line.productName}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
        }
      }
      
      // 7. Bestellstatus basierend auf kumulierter Lieferung aktualisieren
      // Alle Bestellpositionen neu laden um quantityDelivered zu prüfen
      const updatedOrderItems = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, validatedData.orderId));
      
      let allFullyDelivered = true;
      let anyPartiallyDelivered = false;
      
      for (const item of updatedOrderItems) {
        const quantityDelivered = item.quantityDelivered || 0;
        const quantity = item.quantity || 0;
        
        if (quantityDelivered < quantity) {
          allFullyDelivered = false;
        }
        if (quantityDelivered > 0) {
          anyPartiallyDelivered = true;
        }
        
        // Status der einzelnen Position aktualisieren
        const itemStatus = quantityDelivered >= quantity ? 'delivered' : 
                          quantityDelivered > 0 ? 'partial' : 'pending';
        
        await tx
          .update(orderItems)
          .set({
            status: itemStatus,
            updatedAt: new Date()
          })
          .where(eq(orderItems.id, item.id));
      }
      
      // Gesamtstatus der Bestellung bestimmen
      const newStatus = allFullyDelivered ? 'delivered' : 
                       anyPartiallyDelivered ? 'partial' : 'open';
      results.orderStatus = newStatus;
      
      await tx
        .update(orders)
        .set({
          status: newStatus,
          actualDeliveryDate: allFullyDelivered ? new Date() : order.actualDeliveryDate,
          updatedAt: new Date()
        })
        .where(eq(orders.id, validatedData.orderId));
      
      // 8. Fehler-Behandlung
      if (results.errors!.length > 0) {
        results.success = false;
        throw new Error(`Wareneingang unvollständig: ${results.errors!.join(', ')}`);
      }
      
      return results;
      
    } catch (error) {
      console.error('Fehler bei Wareneingang-Transaktion:', error);
      throw error;
    }
  });
}

/**
 * FIFO-basierte Bestandsentnahme basierend auf Verfallsdatum
 * 
 * Features:
 * - FIFO-Sortierung nach Verfallsdatum (älteste zuerst)
 * - Transaktionale Sicherheit mit Rollback bei Fehlern
 * - Vollständige Bewegungsprotokollierung
 * - Unterstützung für Transfers und Anpassungen
 */
export async function fifoDeplete(
  db: PgDatabase<any>,
  depletion: FifoDeplete
): Promise<FifoResult> {
  
  return await db.transaction(async (tx) => {
    try {
      // 1. Validierung der Eingabedaten
      const validatedData = fifoDepleteSchema.parse(depletion);
      
      // 2. Inventar-Items mit FOR UPDATE Lock laden (Stock-Konsistenz-Sicherheit)
      const [inventoryItem] = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.warehouseId, validatedData.warehouseId),
            eq(inventoryItems.productId, validatedData.productId)
          )
        )
        .for('update')
        .limit(1);
        
      if (!inventoryItem) {
        throw new Error(`Kein Inventar-Eintrag für Produkt ${validatedData.productId} im Lager ${validatedData.warehouseId} gefunden`);
      }
      
      const currentInventoryQuantity = inventoryItem.quantity || 0;
      
      if (currentInventoryQuantity < validatedData.quantityToDeplete) {
        throw new Error(`Nicht genügend Bestand verfügbar. Benötigt: ${validatedData.quantityToDeplete}, Verfügbar: ${currentInventoryQuantity}`);
      }
      
      const previousInventoryStock = currentInventoryQuantity;
      
      // 2b. Verfügbare Chargen mit FOR UPDATE Lock laden (FIFO-Sortierung)
      const availableBatches = await tx
        .select()
        .from(productBatches)
        .where(
          and(
            eq(productBatches.warehouseId, validatedData.warehouseId),
            eq(productBatches.productId, validatedData.productId),
            eq(productBatches.status, 'active'),
            gte(productBatches.currentQuantity, 1)
          )
        )
        .orderBy(asc(productBatches.expiryDate), asc(productBatches.receivedDate))
        .for('update');
      
      if (availableBatches.length === 0) {
        throw new Error(`Keine verfügbaren Chargen für Produkt ${validatedData.productId} im Lager ${validatedData.warehouseId}`);
      }
      
      // 3. Gesamtverfügbare Menge prüfen
      const totalAvailable = availableBatches.reduce((sum, batch) => sum + batch.currentQuantity, 0);
      if (totalAvailable < validatedData.quantityToDeplete) {
        throw new Error(`Nicht genügend Bestand verfügbar. Benötigt: ${validatedData.quantityToDeplete}, Verfügbar: ${totalAvailable}`);
      }
      
      const results: FifoResult = {
        success: true,
        totalDepleted: 0,
        batchesProcessed: [],
        movements: [],
        errors: []
      };
      
      let remainingToDeplete = validatedData.quantityToDeplete;
      
      // 4. FIFO-Entnahme durch die Chargen
      for (const batch of availableBatches) {
        if (remainingToDeplete <= 0) break;
        
        const quantityFromThisBatch = Math.min(remainingToDeplete, batch.currentQuantity);
        const newBatchQuantity = batch.currentQuantity - quantityFromThisBatch;
        
        // 4a. Charge aktualisieren
        await tx
          .update(productBatches)
          .set({
            currentQuantity: newBatchQuantity,
            status: newBatchQuantity === 0 ? 'consumed' : 'active',
            updatedAt: new Date()
          })
          .where(eq(productBatches.id, batch.id));
        
        // 4b. Lagerbewegung mit before/after Audit-Trail erstellen
        const currentInventoryStock = (previousInventoryStock || 0) - results.totalDepleted - quantityFromThisBatch;
        const [movement] = await tx
          .insert(inventoryMovements)
          .values({
            sourceWarehouseId: validatedData.warehouseId,
            destinationWarehouseId: validatedData.destinationWarehouseId || null,
            productId: validatedData.productId,
            quantity: quantityFromThisBatch,
            movementType: validatedData.movementType,
            direction: 'OUT',
            referenceType: validatedData.referenceType,
            referenceId: validatedData.referenceId || null,
            status: 'completed',
            notes: `FIFO-Entnahme aus Charge ${batch.batchNumber} - Batch: ${batch.currentQuantity} → ${newBatchQuantity}, Inventar: ${(previousInventoryStock || 0) - results.totalDepleted} → ${currentInventoryStock}${validatedData.notes ? ` - ${validatedData.notes}` : ''}`,
            performedBy: validatedData.performedBy,
            performedAt: new Date(),
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate,
            machineId: validatedData.destinationMachineId || null
          })
          .returning();
        
        results.movements.push(movement);
        
        // 4c. Ergebnis-Tracking
        results.batchesProcessed.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantityDepleted: quantityFromThisBatch,
          remainingQuantity: newBatchQuantity,
          expiryDate: batch.expiryDate
        });
        
        results.totalDepleted += quantityFromThisBatch;
        remainingToDeplete -= quantityFromThisBatch;
      }
      
      // 5. Gesamtbestand in inventory_items mit bereits gelocktem Eintrag aktualisieren
      const finalInventoryStock = previousInventoryStock - results.totalDepleted;
      await tx
        .update(inventoryItems)
        .set({
          quantity: finalInventoryStock,
          updatedAt: new Date()
        })
        .where(eq(inventoryItems.id, inventoryItem.id));
      
      // 6. Verbleibendes Tracking
      if (remainingToDeplete > 0) {
        results.remainingQuantity = remainingToDeplete;
        results.errors!.push(`${remainingToDeplete} Einheiten konnten nicht entnommen werden`);
      }
      
      return results;
      
    } catch (error) {
      console.error('Fehler bei FIFO-Entnahme:', error);
      throw error;
    }
  });
}

// ========================================
// HILFSFUNKTIONEN
// ========================================

/**
 * Prüft den verfügbaren Bestand für ein Produkt in einem Lager
 */
export async function getAvailableStock(
  db: PgDatabase<any>,
  warehouseId: number,
  productId: number
): Promise<{
  totalQuantity: number;
  batchCount: number;
  oldestExpiryDate?: string;
  newestExpiryDate?: string;
}> {
  const result = await db
    .select({
      totalQuantity: sum(productBatches.currentQuantity),
      batchCount: count(productBatches.id),
      oldestExpiry: min(productBatches.expiryDate),
      newestExpiry: max(productBatches.expiryDate)
    })
    .from(productBatches)
    .where(
      and(
        eq(productBatches.warehouseId, warehouseId),
        eq(productBatches.productId, productId),
        eq(productBatches.status, 'active'),
        gte(productBatches.currentQuantity, 1)
      )
    );
  
  return {
    totalQuantity: Number(result[0]?.totalQuantity || 0),
    batchCount: Number(result[0]?.batchCount || 0),
    oldestExpiryDate: result[0]?.oldestExpiry || undefined,
    newestExpiryDate: result[0]?.newestExpiry || undefined
  };
}

/**
 * Gibt eine Liste aller aktiven Chargen für ein Produkt zurück (FIFO-sortiert)
 */
export async function getProductBatchesFifo(
  db: PgDatabase<any>,
  warehouseId: number,
  productId: number
): Promise<ProductBatch[]> {
  return await db
    .select()
    .from(productBatches)
    .where(
      and(
        eq(productBatches.warehouseId, warehouseId),
        eq(productBatches.productId, productId),
        eq(productBatches.status, 'active'),
        gte(productBatches.currentQuantity, 1)
      )
    )
    .orderBy(asc(productBatches.expiryDate), asc(productBatches.receivedDate));
}

/**
 * Erstellt einen Audit-Trail-Eintrag für Lagerbewegungen
 */
export async function createMovementAuditTrail(
  db: PgDatabase<any>,
  movement: Omit<InsertInventoryMovement, 'id' | 'createdAt' | 'updatedAt'>
): Promise<InventoryMovement> {
  const [result] = await db
    .insert(inventoryMovements)
    .values({
      ...movement,
      performedAt: movement.performedAt || new Date()
    })
    .returning();
  
  return result;
}

/**
 * Validiert, ob eine Bestellung für Wareneingang berechtigt ist
 */
export async function validateOrderForReceipt(
  db: PgDatabase<any>,
  orderId: number
): Promise<{ valid: boolean; message?: string; order?: Order }> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId));
  
  if (!order) {
    return { valid: false, message: `Bestellung mit ID ${orderId} nicht gefunden` };
  }
  
  if (!['sent', 'shipped'].includes(order.status)) {
    return { 
      valid: false, 
      message: `Wareneingang nur für Bestellungen mit Status 'sent' oder 'shipped' möglich. Aktueller Status: ${order.status}`,
      order 
    };
  }
  
  return { valid: true, order };
}

export default {
  receiptTransaction,
  fifoDeplete,
  getAvailableStock,
  getProductBatchesFifo,
  createMovementAuditTrail,
  validateOrderForReceipt,
  
  // Schema-Exports
  receiptLineSchema,
  receiptTransactionSchema,
  fifoDepleteSchema
};