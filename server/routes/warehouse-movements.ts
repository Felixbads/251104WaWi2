import { Router } from "express";
import { z } from "zod";
import { db, rawDb } from "../db";
import { storage } from "../storage";
import { inventoryItems, inventoryMovements, products, warehouses } from "../../shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

// Validierungsschema für Warentransfers zwischen Lagern
const warehouseTransferSchema = z.object({
  sourceWarehouseId: z.number().positive(),
  targetWarehouseId: z.number().positive(),
  items: z.array(
    z.object({
      productId: z.number().positive(),
      quantity: z.number().positive()
    })
  ),
  notes: z.string().nullable().optional()
});

// Validierungsschema für Warenentnahmen aus dem Lager
const warehouseWithdrawalSchema = z.object({
  warehouseId: z.number().positive(),
  items: z.array(
    z.object({
      productId: z.number().positive(),
      quantity: z.number().positive()
    })
  ),
  reason: z.string(),
  notes: z.string().nullable().optional()
});

// API-Route für Warentransfers zwischen Lagern
router.post("/warehouses/transfer", async (req, res) => {
  try {
    // Validierung der Eingabedaten
    const validationResult = warehouseTransferSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: "Ungültige Eingabedaten",
        errors: validationResult.error.format()
      });
    }
    
    const { sourceWarehouseId, targetWarehouseId, items, notes } = validationResult.data;
    
    // Überprüfen, ob Quell- und Ziellager existieren
    const sourceWarehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, sourceWarehouseId)
    });
    
    const targetWarehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, targetWarehouseId)
    });
    
    if (!sourceWarehouse) {
      return res.status(404).json({
        success: false,
        message: "Quelllager nicht gefunden"
      });
    }
    
    if (!targetWarehouse) {
      return res.status(404).json({
        success: false,
        message: "Ziellager nicht gefunden"
      });
    }
    
    // Überprüfen, ob die Produkte im Quelllager verfügbar sind
    const productsToTransfer = await Promise.all(
      items.map(async (item) => {
        const inventoryItem = await db.query.inventoryItems.findFirst({
          where: and(
            eq(inventoryItems.warehouseId, sourceWarehouseId),
            eq(inventoryItems.productId, item.productId)
          )
        });
        
        if (!inventoryItem) {
          throw new Error(`Produkt mit ID ${item.productId} nicht im Quelllager verfügbar`);
        }
        
        if ((inventoryItem.quantity || 0) < item.quantity) {
          throw new Error(`Nicht genügend Bestand für Produkt ${item.productId}: Verfügbar ${inventoryItem.quantity}, Angefordert ${item.quantity}`);
        }
        
        return {
          productId: item.productId,
          quantity: item.quantity,
          currentQuantity: inventoryItem.quantity || 0
        };
      })
    );
    
    // Transaktion starten, um atomare Operationen zu gewährleisten
    const result = await db.transaction(async (tx) => {
      // Transaktions-ID generieren
      const transactionId = new Date().getTime().toString();
      const timestamp = new Date();
      const performedBy = (req as any).user?.id || null;
      
      // Für jedes Produkt die Bewegung durchführen
      for (const item of productsToTransfer) {
        // 1. Bestand im Quelllager reduzieren
        await tx.update(inventoryItems)
          .set({ 
            quantity: item.currentQuantity - item.quantity,
            updatedAt: timestamp
          })
          .where(and(
            eq(inventoryItems.warehouseId, sourceWarehouseId),
            eq(inventoryItems.productId, item.productId)
          ));
        
        // 2. Im Ziellager suchen oder erstellen
        const targetItem = await tx.query.inventoryItems.findFirst({
          where: and(
            eq(inventoryItems.warehouseId, targetWarehouseId),
            eq(inventoryItems.productId, item.productId)
          )
        });
        
        if (targetItem) {
          // 2a. Bestehenden Bestand erhöhen
          await tx.update(inventoryItems)
            .set({ 
              quantity: (targetItem.quantity || 0) + item.quantity,
              updatedAt: timestamp
            })
            .where(and(
              eq(inventoryItems.warehouseId, targetWarehouseId),
              eq(inventoryItems.productId, item.productId)
            ));
        } else {
          // 2b. Neuen Bestand anlegen
          await tx.insert(inventoryItems)
            .values({
              warehouseId: targetWarehouseId,
              productId: item.productId,
              quantity: item.quantity,
              minQuantity: 0,  // Standardwert, kann später angepasst werden
              createdAt: timestamp,
              updatedAt: timestamp
            });
        }
        
        // 3. Bewegung im Quelllager protokollieren (OUT)
        await tx.insert(inventoryMovements)
          .values({
            productId: item.productId,
            quantity: item.quantity,
            movementType: 'TRANSFER',
            direction: 'OUT',
            notes: notes || null,
            referenceId: transactionId,
            previousStock: item.currentQuantity,
            currentStock: item.currentQuantity - item.quantity,
            performedBy: performedBy,
            sourceWarehouseId: sourceWarehouseId,
            destinationWarehouseId: targetWarehouseId,
            status: 'COMPLETED',
            createdAt: timestamp,
            updatedAt: timestamp
          });
        
        // 4. Bewegung im Ziellager protokollieren (IN)
        const targetCurrentStock = targetItem ? (targetItem.quantity || 0) : 0;
        await tx.insert(inventoryMovements)
          .values({
            productId: item.productId,
            quantity: item.quantity,
            movementType: 'TRANSFER',
            direction: 'IN',
            notes: notes || null,
            referenceId: transactionId,
            previousStock: targetCurrentStock,
            currentStock: targetCurrentStock + item.quantity,
            performedBy: performedBy,
            sourceWarehouseId: sourceWarehouseId,
            destinationWarehouseId: targetWarehouseId,
            status: 'COMPLETED',
            createdAt: timestamp,
            updatedAt: timestamp
          });
      }
      
      return transactionId;
    });
    
    return res.status(200).json({
      success: true,
      message: "Warentransfer erfolgreich durchgeführt",
      transactionId: result
    });
    
  } catch (error) {
    console.error("Fehler beim Warentransfer:", error);
    return res.status(500).json({
      success: false,
      message: "Fehler beim Warentransfer",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// API-Route für Warenentnahmen aus dem Lager
router.post("/warehouses/withdrawal", async (req, res) => {
  try {
    // Validierung der Eingabedaten
    const validationResult = warehouseWithdrawalSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: "Ungültige Eingabedaten",
        errors: validationResult.error.format()
      });
    }
    
    const { warehouseId, items, reason, notes } = validationResult.data;
    
    // Überprüfen, ob das Lager existiert
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, warehouseId)
    });
    
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Lager nicht gefunden"
      });
    }
    
    // Überprüfen, ob die Produkte im Lager verfügbar sind
    const productsToWithdraw = await Promise.all(
      items.map(async (item) => {
        const inventoryItem = await db.query.inventoryItems.findFirst({
          where: and(
            eq(inventoryItems.warehouseId, warehouseId),
            eq(inventoryItems.productId, item.productId)
          )
        });
        
        if (!inventoryItem) {
          throw new Error(`Produkt mit ID ${item.productId} nicht im Lager verfügbar`);
        }
        
        if ((inventoryItem.quantity || 0) < item.quantity) {
          throw new Error(`Nicht genügend Bestand für Produkt ${item.productId}: Verfügbar ${inventoryItem.quantity}, Angefordert ${item.quantity}`);
        }
        
        return {
          productId: item.productId,
          quantity: item.quantity,
          currentQuantity: inventoryItem.quantity || 0
        };
      })
    );
    
    // Transaktion starten, um atomare Operationen zu gewährleisten
    const result = await db.transaction(async (tx) => {
      // Transaktions-ID generieren
      const transactionId = new Date().getTime().toString();
      const timestamp = new Date();
      const performedBy = (req as any).user?.id || null;
      
      // Für jedes Produkt die Entnahme durchführen
      for (const item of productsToWithdraw) {
        // 1. Bestand im Lager reduzieren
        await tx.update(inventoryItems)
          .set({ 
            quantity: item.currentQuantity - item.quantity,
            updatedAt: timestamp
          })
          .where(and(
            eq(inventoryItems.warehouseId, warehouseId),
            eq(inventoryItems.productId, item.productId)
          ));
        
        // 2. Bewegung protokollieren
        await tx.insert(inventoryMovements)
          .values({
            productId: item.productId,
            quantity: item.quantity,
            movementType: 'OUT',
            direction: 'OUT',
            notes: `${reason}${notes ? ': ' + notes : ''}`,
            referenceId: transactionId,
            previousStock: item.currentQuantity,
            currentStock: item.currentQuantity - item.quantity,
            performedBy: performedBy,
            sourceWarehouseId: warehouseId,
            status: 'COMPLETED',
            createdAt: timestamp,
            updatedAt: timestamp
          });
      }
      
      return transactionId;
    });
    
    return res.status(200).json({
      success: true,
      message: "Warenentnahme erfolgreich durchgeführt",
      transactionId: result
    });
    
  } catch (error) {
    console.error("Fehler bei der Warenentnahme:", error);
    return res.status(500).json({
      success: false,
      message: "Fehler bei der Warenentnahme",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Validierungsschema für interne Umlagerungen innerhalb eines Lagers
const internalMovementSchema = z.object({
  warehouseId: z.number().positive(),
  productId: z.number().positive(),
  quantity: z.number().positive(),
  sourceLocation: z.string().min(1, "Quelllagerplatz ist erforderlich"),
  destinationLocation: z.string().min(1, "Ziellagerplatz ist erforderlich"),
  movementType: z.literal('INTERNAL'),
  notes: z.string().nullable().optional(),
});

// API-Route für interne Umlagerungen innerhalb eines Lagers
router.post("/warehouses/movements/internal", async (req, res) => {
  try {
    // Validierung der Eingabedaten
    const validationResult = internalMovementSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: "Ungültige Eingabedaten",
        errors: validationResult.error.format()
      });
    }
    
    const { warehouseId, productId, quantity, sourceLocation, destinationLocation, notes } = validationResult.data;
    
    // Überprüfen, ob das Lager existiert
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, warehouseId)
    });
    
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Lager nicht gefunden"
      });
    }
    
    // Überprüfen, ob das Produkt im Lager verfügbar ist
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.warehouseId, warehouseId),
        eq(inventoryItems.productId, productId)
      )
    });
    
    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        message: "Produkt nicht im Lager verfügbar"
      });
    }
    
    if ((inventoryItem.quantity || 0) < quantity) {
      return res.status(400).json({
        success: false,
        message: `Nicht genügend Bestand: Verfügbar ${inventoryItem.quantity}, Angefordert ${quantity}`
      });
    }
    
    // Transaktion starten, um atomare Operationen zu gewährleisten
    const result = await db.transaction(async (tx) => {
      // Transaktions-ID generieren
      const transactionId = randomUUID();
      const timestamp = new Date();
      const performedBy = (req as any).user?.id || null;
      
      // Wir verändern hier nicht den Gesamtbestand, sondern protokollieren nur die Bewegung innerhalb des Lagers
      
      // Bewegung protokollieren
      await tx.insert(inventoryMovements)
        .values({
          productId: productId,
          quantity: quantity,
          movementType: 'INTERNAL',
          direction: 'INTERNAL',
          notes: notes || `Umlagerung von ${sourceLocation} nach ${destinationLocation}`,
          referenceId: transactionId,
          previousStock: inventoryItem.quantity || 0,
          currentStock: inventoryItem.quantity || 0, // Gesamtbestand bleibt unverändert
          performedBy: performedBy,
          sourceWarehouseId: warehouseId, 
          destinationWarehouseId: warehouseId, // Bei internen Bewegungen ist Quelle = Ziel
          status: 'COMPLETED',
          locationFrom: sourceLocation,
          locationTo: destinationLocation,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      
      return transactionId;
    });
    
    return res.status(200).json({
      success: true,
      message: "Interne Umlagerung erfolgreich durchgeführt",
      transactionId: result
    });
    
  } catch (error) {
    console.error("Fehler bei der internen Umlagerung:", error);
    return res.status(500).json({
      success: false,
      message: "Fehler bei der internen Umlagerung",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;