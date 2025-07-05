import { Router } from 'express';
import { db } from '../db';
import { products, inventoryItems, inventoryMovements, inventoryBatches, warehouses } from '../../shared/schema';
import { eq, and, sql, gte, desc, asc, inArray, gt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import lodash from 'lodash';

const router = Router();

// Schema zur Validierung einer Produktübertragung
const productTransferSchema = z.object({
  productId: z.union([z.number().positive(), z.string().transform(val => parseInt(val, 10))]).refine(val => val > 0, 'Produkt-ID muss eine positive Zahl sein'),
  quantity: z.number().positive('Menge muss größer als 0 sein')
});

// Schema zur Validierung der Transfer-Anfrage
const transferRequestSchema = z.object({
  sourceWarehouseId: z.number().positive('Quell-Lager-ID ist erforderlich'),
  destinationType: z.enum(['WAREHOUSE', 'EXTERNAL'], 'Zieltyp muss entweder WAREHOUSE oder EXTERNAL sein'),
  destinationWarehouseId: z.number().positive().optional()
    .refine(
      (val, ctx) => ctx.parent.destinationType !== 'WAREHOUSE' || val !== undefined, 
      'Ziel-Lager-ID ist erforderlich, wenn der Zieltyp WAREHOUSE ist'
    ),
  externalDestination: z.string().optional()
    .refine(
      (val, ctx) => ctx.parent.destinationType !== 'EXTERNAL' || (val !== undefined && val.trim() !== ''), 
      'Externes Ziel ist erforderlich, wenn der Zieltyp EXTERNAL ist'
    ),
  products: z.array(productTransferSchema)
    .min(1, 'Mindestens ein Produkt muss angegeben werden'),
  notes: z.string().optional()
});

type TransferRequest = z.infer<typeof transferRequestSchema>;
type ProductTransfer = z.infer<typeof productTransferSchema>;

// Interface für die Bewegungsergebnisse
interface MovementRecord {
  productId: number;
  productName: string;
  quantity: number;
  batches?: Array<{
    batchId: number;
    quantity: number;
    batchNumber?: string;
    expiryDate?: Date;
  }>;
}

// POST /warehouse-movements/transfer - Produkte zwischen Lagern transferieren oder zu externen Zielen
router.post('/transfer', async (req, res) => {
  console.log('Transferanfrage erhalten:', JSON.stringify(req.body, null, 2));
  
  // Validiere die Anfrage mit Zod
  try {
    transferRequestSchema.parse(req.body);
  } catch (validationError) {
    if (validationError instanceof z.ZodError) {
      console.error('Validierungsfehler:', validationError.errors);
      return res.status(400).json({ 
        error: 'Validierungsfehler', 
        details: validationError.errors.map(e => e.message).join(', ') 
      });
    }
    return res.status(400).json({ error: 'Ungültige Anfrage' });
  }
  
  const {
    sourceWarehouseId,
    destinationType,
    destinationWarehouseId,
    externalDestination,
    notes,
    products: productsToTransfer
  } = req.body as TransferRequest;
  
  try {
    // Überprüfen, ob das Quelllager existiert
    const sourceWarehouse = await db.select()
      .from(warehouses)
      .where(eq(warehouses.id, sourceWarehouseId))
      .limit(1);
      
    if (!sourceWarehouse.length) {
      return res.status(400).json({ error: `Quelllager mit ID ${sourceWarehouseId} nicht gefunden` });
    }
    
    // Bei Warehouse-Transfer: Überprüfen, ob das Ziellager existiert
    if (destinationType === 'WAREHOUSE') {
      const destWarehouse = await db.select()
        .from(warehouses)
        .where(eq(warehouses.id, destinationWarehouseId))
        .limit(1);
        
      if (!destWarehouse.length) {
        return res.status(400).json({ error: `Ziellager mit ID ${destinationWarehouseId} nicht gefunden` });
      }
      
      // Selbsttransfer verhindern
      if (sourceWarehouseId === destinationWarehouseId) {
        return res.status(400).json({ error: 'Quell- und Ziellager dürfen nicht identisch sein' });
      }
    }
    
    // Starte eine Datenbank-Transaktion
    return await db.transaction(async (tx) => {
      const now = new Date();
      const moveResults: MovementRecord[] = [];
      
      // Sammle fehlende Inventory-Items, um sie später in Batches einzufügen
      const missingRows: any[] = [];
      
      // Für jedes Produkt in der Liste
      for (const product of productsToTransfer) {
        // 1. Verfügbaren Bestand prüfen
        const inventory = await tx.select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.warehouseId, sourceWarehouseId),
              eq(inventoryItems.productId, product.productId)
            )
          )
          .limit(1);

        if (!inventory.length || inventory[0].quantity === null || inventory[0].quantity < product.quantity) {
          throw new Error(`Nicht genügend Bestand für Produkt ID ${product.productId}. Verfügbar: ${inventory.length ? inventory[0].quantity : 0}`);
        }

        // 2. Produktname abrufen
        const productDetails = await tx.select()
          .from(products)
          .where(eq(products.id, product.productId))
          .limit(1);

        if (!productDetails.length) {
          throw new Error(`Produkt mit ID ${product.productId} nicht gefunden`);
        }

        const productName = productDetails[0].productName;

        // 3. Bei einem Transfer zu einem anderen Lager: Prüfen des Zieleintrags
        if (destinationType === 'WAREHOUSE') {
          const destInventory = await tx.select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.warehouseId, destinationWarehouseId!),
                eq(inventoryItems.productId, product.productId)
              )
            )
            .limit(1);

          // Fehlende Inventareinträge sammeln für späteres Batch-Insert
          if (!destInventory.length) {
            missingRows.push({
              warehouseId: destinationWarehouseId,
              productId: product.productId,
              quantity: 0, // wird später aktualisiert
              minQuantity: 0,
              createdAt: now,
              updatedAt: now
            });
          }
        }

        // 4. Batches im Quelllager verarbeiten (FIFO-Prinzip)
        let remainingQuantity = product.quantity;
        const batches = await tx.select()
          .from(inventoryBatches)
          .where(
            and(
              eq(inventoryBatches.warehouseId, sourceWarehouseId),
              eq(inventoryBatches.productId, product.productId),
              gt(inventoryBatches.quantity, 0)
            )
          )
          .orderBy(asc(inventoryBatches.expiryDate)); // FIFO: Älteste Chargen zuerst verbrauchen

        // Die zu bewegenden Chargen
        const batchMovements = [];

        for (const batch of batches) {
          if (remainingQuantity <= 0) break;

          const quantityFromBatch = Math.min(batch.quantity, remainingQuantity);
          remainingQuantity -= quantityFromBatch;

          // Chargeneintrag für das Quell-Lager aktualisieren
          await tx.update(inventoryBatches)
            .set({
              quantity: batch.quantity - quantityFromBatch,
              updatedAt: now
            })
            .where(eq(inventoryBatches.id, batch.id));

          batchMovements.push({
            batchId: batch.id,
            quantity: quantityFromBatch,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate
          });

          // Bei Warehouse-Transfer: Batch im Ziellager erstellen oder aktualisieren
          if (destinationType === 'WAREHOUSE') {
            const existingBatch = await tx.select()
              .from(inventoryBatches)
              .where(
                and(
                  eq(inventoryBatches.warehouseId, destinationWarehouseId!),
                  eq(inventoryBatches.productId, product.productId),
                  eq(inventoryBatches.batchNumber, batch.batchNumber),
                  eq(inventoryBatches.expiryDate, batch.expiryDate)
                )
              )
              .limit(1);

            if (existingBatch.length) {
              // Bestehende Charge im Ziellager aktualisieren
              await tx.update(inventoryBatches)
                .set({
                  quantity: existingBatch[0].quantity + quantityFromBatch,
                  updatedAt: now
                })
                .where(eq(inventoryBatches.id, existingBatch[0].id));
            } else {
              // Neue Charge im Ziellager anlegen
              await tx.insert(inventoryBatches).values({
                warehouseId: destinationWarehouseId,
                productId: product.productId,
                batchNumber: batch.batchNumber,
                expiryDate: batch.expiryDate,
                quantity: quantityFromBatch,
                incomingDate: new Date(),
                status: 'active',
                createdAt: now,
                updatedAt: now
              });
            }
          }
        }
      }

      // Fehlende Inventory-Items in Batches einfügen, um Datenbanklimits zu vermeiden
      if (missingRows.length > 0) {
        console.log(`Füge ${missingRows.length} fehlende Inventory-Items in Batches ein`);
        
        // Zähle die Inventory-Items vor dem Insert
        const beforeCount = await tx.select({ count: sql`count(*)` })
          .from(inventoryItems)
          .where(eq(inventoryItems.warehouseId, destinationWarehouseId!));
        console.log('Inventareinträge vor dem Insert:', beforeCount[0].count);
        
        // Chunked Insert für große Datenmengen (je 500 Einträge)
        const CHUNK_SIZE = 500;
        const chunks = lodash.chunk(missingRows, CHUNK_SIZE);
        
        try {
          for (const batch of chunks) {
            await tx.insert(inventoryItems).values(batch);
          }
        } catch (e) {
          console.error('Batch-Insert fehlgeschlagen:', e);
          throw e;
        }
        
        // Zähle die Inventory-Items nach dem Insert
        const afterCount = await tx.select({ count: sql`count(*)` })
          .from(inventoryItems)
          .where(eq(inventoryItems.warehouseId, destinationWarehouseId!));
        console.log('Inventareinträge nach dem Insert:', afterCount[0].count);
      }
      
      // Jetzt die eigentlichen Transfers durchführen
      for (const product of productsToTransfer) {
        // 5. Bestand im Quelllager aktualisieren
        const sourceInventory = await tx.select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.warehouseId, sourceWarehouseId),
              eq(inventoryItems.productId, product.productId)
            )
          )
          .limit(1);
          
        const productDetails = await tx.select()
          .from(products)
          .where(eq(products.id, product.productId))
          .limit(1);
          
        const productName = productDetails[0].productName;
          
        await tx.update(inventoryItems)
          .set({
            quantity: sourceInventory[0].quantity - product.quantity,
            updatedAt: now
          })
          .where(
            and(
              eq(inventoryItems.warehouseId, sourceWarehouseId),
              eq(inventoryItems.productId, product.productId)
            )
          );

        // 6. Bei Warehouse-Transfer: Bestand im Ziellager aktualisieren
        if (destinationType === 'WAREHOUSE') {
          const destInventory = await tx.select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.warehouseId, destinationWarehouseId!),
                eq(inventoryItems.productId, product.productId)
              )
            )
            .limit(1);

          const currentQuantity = destInventory.length ? (destInventory[0].quantity || 0) : 0;
          
          await tx.update(inventoryItems)
            .set({
              quantity: currentQuantity + product.quantity,
              updatedAt: now
            })
            .where(
              and(
                eq(inventoryItems.warehouseId, destinationWarehouseId!),
                eq(inventoryItems.productId, product.productId)
              )
            );
        }

        // 7. Warenbewegungseintrag erstellen
        const referenceId = randomUUID();
        const movementValues = {
          productId: product.productId,
          quantity: product.quantity,
          movementType: destinationType === 'WAREHOUSE' ? 'TRANSFER' : 'OUT',
          direction: destinationType === 'WAREHOUSE' ? 'INTERNAL' : 'OUT',
          sourceWarehouseId: sourceWarehouseId,
          destinationWarehouseId: destinationType === 'WAREHOUSE' ? destinationWarehouseId : null,
          referenceType: 'manual_transfer',
          referenceId: referenceId,
          status: 'completed',
          notes: notes ? notes : destinationType === 'EXTERNAL' ? `Transfer zu ${externalDestination}` : `Transfer zu Lager ${destinationWarehouseId}`,
          performedAt: now,
          previousStock: sourceInventory[0].quantity,
          currentStock: sourceInventory[0].quantity - product.quantity,
          createdAt: now,
          updatedAt: now
        };

        try {
          await tx.insert(inventoryMovements).values(movementValues);
        } catch (e) {
          console.error('Fehler beim Einfügen der Warenbewegung:', e);
          throw e;
        }
        
        moveResults.push({
          productId: product.productId,
          productName: productName,
          quantity: product.quantity
        });
      }

      return res.status(200).json({
        success: true,
        message: `Produkte erfolgreich von Lager ${sourceWarehouseId} zu ${destinationType === 'WAREHOUSE' ? `Lager ${destinationWarehouseId}` : externalDestination} transferiert`,
        movements: moveResults
      });
    });
  } catch (error) {
    console.error('Fehler während des Produkttransfers:', error);
    return res.status(500).json({
      error: 'Fehler beim Transferieren von Produkten',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;