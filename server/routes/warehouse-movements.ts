import express from 'express';
import { db } from '../db';
import { products, inventory_items as inventoryItems, inventory_movements } from '@shared/schema';

// Temporäre Definition für inventoryBatches bis die Schema-Migration vollständig ist
const inventoryBatches = {
  id: { name: 'id' },
  warehouseId: { name: 'warehouse_id' },
  productId: { name: 'product_id' },
  batchNumber: { name: 'batch_number' },
  quantity: { name: 'quantity' },
  expiryDate: { name: 'expiry_date' },
  manufacturingDate: { name: 'manufacturing_date' },
  createdAt: { name: 'created_at' },
  updatedAt: { name: 'updated_at' },
  status: { name: 'status' },
  notes: { name: 'notes' },
  incomingDate: { name: 'incoming_date' }
};
import { eq, and, sql, gte, desc, asc, inArray, gt } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const router = express.Router();

// POST /warehouse-movements/transfer - Produkte zwischen Lagern transferieren oder ausbuchen
router.post('/transfer', async (req, res) => {
  const {
    sourceWarehouseId,
    destinationType,
    destinationWarehouseId,
    externalDestination,
    notes,
    products: productsToTransfer
  } = req.body;

  // Validierung der Eingabe
  if (!sourceWarehouseId) {
    return res.status(400).json({ error: 'Source warehouse ID is required' });
  }

  if (!productsToTransfer || !Array.isArray(productsToTransfer) || productsToTransfer.length === 0) {
    return res.status(400).json({ error: 'At least one product is required' });
  }

  if (destinationType === 'WAREHOUSE' && !destinationWarehouseId) {
    return res.status(400).json({ error: 'Destination warehouse ID is required for warehouse transfers' });
  }

  if (destinationType === 'EXTERNAL' && !externalDestination) {
    return res.status(400).json({ error: 'External destination is required for external transfers' });
  }

  try {
    // Transaktion starten
    return await db.transaction(async (tx) => {
      const now = new Date();
      const moveResults = [];

      // Für jedes Produkt in der Liste
      for (const product of productsToTransfer) {
        if (!product.productId || product.quantity <= 0) {
          continue; // Ungültige Produkte überspringen
        }

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

        const productName = productDetails[0].name;

        // 3. Bei einem Transfer zu einem anderen Lager: Prüfen und ggf. anlegen des Zieleintrags
        if (destinationType === 'WAREHOUSE') {
          const destInventory = await tx.select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.warehouseId, destinationWarehouseId),
                eq(inventoryItems.productId, product.productId)
              )
            )
            .limit(1);

          if (!destInventory.length) {
            // Eintrag im Ziellager anlegen
            await tx.insert(inventoryItems).values({
              warehouseId: destinationWarehouseId,
              productId: product.productId,
              quantity: 0, // wird später aktualisiert
              minQuantity: 0
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
              quantity: batch.quantity - quantityFromBatch
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
                  eq(inventoryBatches.warehouseId, destinationWarehouseId),
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
                  quantity: existingBatch[0].quantity + quantityFromBatch
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
                status: 'active'
              });
            }
          }
        }

        // 5. Bestand im Quelllager aktualisieren
        await tx.update(inventoryItems)
          .set({
            quantity: inventory[0].quantity - product.quantity,
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
                eq(inventoryItems.warehouseId, destinationWarehouseId),
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
                eq(inventoryItems.warehouseId, destinationWarehouseId),
                eq(inventoryItems.productId, product.productId)
              )
            );
        }

        // 7. Warenbewegungseintrag erstellen
        const movementValues = {
          productId: product.productId,
          quantity: -product.quantity, // Negative Menge für den Ausgang
          movementType: destinationType === 'WAREHOUSE' ? 'TRANSFER' : 'OUT',
          sourceType: 'warehouse',
          sourceId: sourceWarehouseId,
          destinationType: destinationType === 'WAREHOUSE' ? 'warehouse' : 'external',
          destinationId: destinationType === 'WAREHOUSE' ? destinationWarehouseId : null,
          status: 'completed',
          notes: `${notes || ''} ${destinationType === 'EXTERNAL' ? `[${externalDestination}]` : ''}`.trim(),
          performedAt: now,
          referenceId: randomUUID(),
          referenceType: 'manual_transfer'
        };

        const moveResult = await tx.insert(inventory_movements).values(movementValues);
        
        moveResults.push({
          productId: product.productId,
          productName: productName,
          quantity: product.quantity,
          batches: batchMovements
        });
      }

      return res.status(200).json({
        success: true,
        message: `Successfully transferred products from warehouse ${sourceWarehouseId}`,
        movements: moveResults
      });
    });
  } catch (error) {
    console.error('Error during product transfer:', error);
    return res.status(500).json({
      error: 'Failed to transfer products',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;