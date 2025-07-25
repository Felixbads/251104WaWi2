/**
 * WARENEINGANG-SERVICE FÜR WIEDERKEHRENDE BESTELLUNGEN
 * 
 * Verwaltet automatische Wareneingänge für wiederkehrende Bestellungen
 * mit MHD-Integration und Lagerbestandsführung
 */

import { DatabaseClient } from '../storage/database-storage';
import { orders, orderItems, inventoryBatches, inventoryItems } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

interface GoodsReceiptItem {
  orderItemId: number;
  productId: number;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  expiryDate?: string;
  batchNumber?: string;
  notes?: string;
}

interface GoodsReceiptResult {
  success: boolean;
  orderId: number;
  orderNumber: string;
  itemsProcessed: number;
  batchesCreated: number;
  totalValue: number;
  errorMessage?: string;
}

class GoodsReceiptService {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Verarbeitet automatischen Wareneingang für wiederkehrende Bestellungen
   */
  async processAutomaticGoodsReceipt(orderId: number): Promise<GoodsReceiptResult> {
    try {
      console.log(`📦 Verarbeite automatischen Wareneingang für Bestellung ${orderId}`);

      // Hole Bestelldaten
      const [order] = await this.db.drizzle
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));

      if (!order) {
        throw new Error(`Bestellung ${orderId} nicht gefunden`);
      }

      if (order.status !== 'goods_receipt') {
        throw new Error(`Bestellung ${orderId} ist nicht für Wareneingang vorgesehen (Status: ${order.status})`);
      }

      // Hole Bestellpositionen
      const items = await this.db.drizzle
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      if (items.length === 0) {
        throw new Error('Keine Bestellpositionen gefunden');
      }

      const goodsReceiptItems: GoodsReceiptItem[] = items.map(item => ({
        orderItemId: item.id,
        productId: item.productId!,
        productName: item.productName,
        quantityOrdered: item.quantity,
        quantityReceived: item.quantity, // Bei automatischen Wareneingängen: vollständige Lieferung angenommen
        expiryDate: this.calculateDefaultExpiryDate(item.productName),
        batchNumber: this.generateBatchNumber(),
        notes: 'Automatischer Wareneingang aus wiederkehrender Bestellung'
      }));

      const result = await this.processGoodsReceipt(order, goodsReceiptItems);

      console.log(`✅ Automatischer Wareneingang erfolgreich verarbeitet: ${result.itemsProcessed} Artikel`);
      return result;

    } catch (error) {
      console.error('❌ Fehler beim automatischen Wareneingang:', error);
      return {
        success: false,
        orderId,
        orderNumber: '',
        itemsProcessed: 0,
        batchesCreated: 0,
        totalValue: 0,
        errorMessage: error instanceof Error ? error.message : 'Unbekannter Fehler'
      };
    }
  }

  /**
   * Verarbeitet manuellen Wareneingang mit benutzerdefinierten Mengen
   */
  async processManualGoodsReceipt(
    orderId: number, 
    items: GoodsReceiptItem[]
  ): Promise<GoodsReceiptResult> {
    try {
      console.log(`📦 Verarbeite manuellen Wareneingang für Bestellung ${orderId}`);

      const [order] = await this.db.drizzle
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));

      if (!order) {
        throw new Error(`Bestellung ${orderId} nicht gefunden`);
      }

      return await this.processGoodsReceipt(order, items);

    } catch (error) {
      console.error('❌ Fehler beim manuellen Wareneingang:', error);
      return {
        success: false,
        orderId,
        orderNumber: '',
        itemsProcessed: 0,
        batchesCreated: 0,
        totalValue: 0,
        errorMessage: error instanceof Error ? error.message : 'Unbekannter Fehler'
      };
    }
  }

  /**
   * Kern-Wareneingang-Verarbeitung
   */
  private async processGoodsReceipt(
    order: any, 
    items: GoodsReceiptItem[]
  ): Promise<GoodsReceiptResult> {
    let batchesCreated = 0;
    let totalValue = 0;
    const processedItems: number[] = [];

    // Starte Transaktion für konsistente Datenverarbeitung
    await this.db.drizzle.transaction(async (tx) => {
      for (const item of items) {
        if (item.quantityReceived <= 0) continue;

        // 1. Erstelle Inventory Batch für MHD-Tracking
        const batchId = await this.createInventoryBatch(tx, {
          productId: item.productId,
          productName: item.productName,
          warehouseId: order.warehouseId,
          quantity: item.quantityReceived,
          expiryDate: item.expiryDate,
          batchNumber: item.batchNumber || this.generateBatchNumber(),
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          unitPrice: 0, // Wird später aus Bestellposition geholt
          notes: item.notes
        });

        if (batchId) {
          batchesCreated++;

          // 2. Update oder erstelle Inventory Item für Lagerbestand
          await this.updateInventoryStock(tx, {
            productId: item.productId,
            warehouseId: order.warehouseId,
            quantityAdded: item.quantityReceived,
            batchId: batchId
          });

          // 3. Update Bestellposition mit gelieferter Menge
          await tx
            .update(orderItems)
            .set({ 
              quantityDelivered: item.quantityReceived,
              status: item.quantityReceived >= item.quantityOrdered ? 'completed' : 'partial'
            })
            .where(eq(orderItems.id, item.orderItemId));

          processedItems.push(item.orderItemId);
          
          // Berechne Warenwert (vereinfacht)
          totalValue += item.quantityReceived * 2.5; // Durchschnittspreis als Fallback
        }
      }

      // 4. Update Bestellstatus
      const allItemsCompleted = items.every(item => 
        item.quantityReceived >= item.quantityOrdered
      );

      const newStatus = allItemsCompleted ? 'received' : 'partially_received';
      
      await tx
        .update(orders)
        .set({ 
          status: newStatus,
          actualDeliveryDate: new Date()
        })
        .where(eq(orders.id, order.id));
    });

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      itemsProcessed: processedItems.length,
      batchesCreated,
      totalValue
    };
  }

  /**
   * Erstellt Inventory Batch für MHD-Tracking
   */
  private async createInventoryBatch(tx: any, data: {
    productId: number;
    productName: string;
    warehouseId: number;
    quantity: number;
    expiryDate?: string;
    batchNumber: string;
    supplierId: number;
    supplierName: string;
    unitPrice: number;
    notes?: string;
  }): Promise<number | null> {
    try {
      const [batch] = await tx
        .insert(inventoryBatches)
        .values({
          warehouseId: data.warehouseId,
          productId: data.productId,
          productName: data.productName,
          batchNumber: data.batchNumber,
          quantity: data.quantity,
          remainingQuantity: data.quantity,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          receivedDate: new Date(),
          supplierId: data.supplierId,
          supplierName: data.supplierName,
          unitPrice: data.unitPrice,
          totalValue: data.unitPrice * data.quantity,
          status: 'active',
          notes: data.notes
        })
        .returning({ id: inventoryBatches.id });

      return batch.id;
    } catch (error) {
      console.error('Fehler beim Erstellen der Inventory Batch:', error);
      return null;
    }
  }

  /**
   * Aktualisiert Lagerbestand
   */
  private async updateInventoryStock(tx: any, data: {
    productId: number;
    warehouseId: number;
    quantityAdded: number;
    batchId: number;
  }): Promise<void> {
    // Prüfe ob bereits Inventory Item existiert
    const existingItem = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.productId, data.productId),
          eq(inventoryItems.warehouseId, data.warehouseId)
        )
      )
      .limit(1);

    if (existingItem.length > 0) {
      // Update existierender Bestand
      await tx
        .update(inventoryItems)
        .set({
          currentStock: existingItem[0].currentStock + data.quantityAdded,
          lastUpdated: new Date()
        })
        .where(eq(inventoryItems.id, existingItem[0].id));
    } else {
      // Erstelle neuen Bestand
      await tx
        .insert(inventoryItems)
        .values({
          warehouseId: data.warehouseId,
          productId: data.productId,
          currentStock: data.quantityAdded,
          minimumStock: 0,
          maximumStock: 1000,
          reorderPoint: 10,
          lastUpdated: new Date(),
          notes: 'Automatisch erstellt durch Wareneingang'
        });
    }
  }

  /**
   * Berechnet Standard-MHD basierend auf Produkttyp
   */
  private calculateDefaultExpiryDate(productName: string): string {
    const now = new Date();
    let daysToAdd = 30; // Standard: 30 Tage

    // Produktspezifische MHD-Berechnung
    const lowerName = productName.toLowerCase();
    
    if (lowerName.includes('milch') || lowerName.includes('joghurt')) {
      daysToAdd = 14; // Milchprodukte: 2 Wochen
    } else if (lowerName.includes('brot') || lowerName.includes('gebäck')) {
      daysToAdd = 3; // Backwaren: 3 Tage
    } else if (lowerName.includes('obst') || lowerName.includes('gemüse')) {
      daysToAdd = 7; // Frische Produkte: 1 Woche
    } else if (lowerName.includes('fleisch') || lowerName.includes('wurst')) {
      daysToAdd = 5; // Fleischprodukte: 5 Tage
    } else if (lowerName.includes('käse')) {
      daysToAdd = 21; // Käse: 3 Wochen
    } else if (lowerName.includes('konserve') || lowerName.includes('dose')) {
      daysToAdd = 365; // Konserven: 1 Jahr
    }

    now.setDate(now.getDate() + daysToAdd);
    return now.toISOString().split('T')[0];
  }

  /**
   * Generiert eindeutige Batch-Nummer
   */
  private generateBatchNumber(): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BATCH-${date}-${random}`;
  }

  /**
   * Holt ausstehende Wareneingänge
   */
  async getPendingGoodsReceipts(): Promise<any[]> {
    const pendingOrders = await this.db.drizzle
      .select()
      .from(orders)
      .where(eq(orders.status, 'goods_receipt'))
      .orderBy(orders.orderDate);

    return pendingOrders;
  }

  /**
   * Holt Wareneingang-Details für eine Bestellung
   */
  async getGoodsReceiptDetails(orderId: number): Promise<any> {
    const [order] = await this.db.drizzle
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) {
      throw new Error(`Bestellung ${orderId} nicht gefunden`);
    }

    const items = await this.db.drizzle
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    return {
      order,
      items,
      canProcess: order.status === 'goods_receipt',
      totalItems: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0)
    };
  }
}

export default GoodsReceiptService;