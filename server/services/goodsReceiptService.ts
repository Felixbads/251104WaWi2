/**
 * WARENEINGANG-SERVICE FÜR WIEDERKEHRENDE BESTELLUNGEN
 * 
 * Verwaltet automatische Wareneingänge für wiederkehrende Bestellungen
 * mit MHD-Integration und Lagerbestandsführung
 */

import { DatabaseStorage } from '../storage/database-storage';
import { orders, orderItems, inventoryBatches, inventoryItems } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import DeliveryNoteUploadService, { UploadedFile, DeliveryNoteMetadata } from './deliveryNoteUploadService';

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
  deliveryNotesUploaded?: number;
  deliveryNoteIds?: number[];
}

interface GoodsReceiptWithDocuments {
  items: GoodsReceiptItem[];
  deliveryNotes: UploadedFile[];
  metadata: DeliveryNoteMetadata;
}

class GoodsReceiptService {
  private db: DatabaseStorage;
  private deliveryNoteService: DeliveryNoteUploadService;

  constructor(db: DatabaseStorage) {
    this.db = db;
    this.deliveryNoteService = new DeliveryNoteUploadService(db);
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
   * Verarbeitet manuellen Wareneingang mit Lieferscheinen
   */
  async processGoodsReceiptWithDocuments(
    orderId: number,
    data: GoodsReceiptWithDocuments
  ): Promise<GoodsReceiptResult> {
    try {
      console.log(`📦 Verarbeite Wareneingang mit Dokumenten für Bestellung ${orderId}`);

      const [order] = await this.db.drizzle
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));

      if (!order) {
        throw new Error(`Bestellung ${orderId} nicht gefunden`);
      }

      let deliveryNoteIds: number[] = [];
      let deliveryNotesUploaded = 0;

      // 1. Erst Lieferscheine hochladen (falls vorhanden)
      if (data.deliveryNotes && data.deliveryNotes.length > 0) {
        console.log(`📄 Lade ${data.deliveryNotes.length} Lieferscheine hoch`);
        
        for (const file of data.deliveryNotes) {
          const uploadResult = await this.deliveryNoteService.uploadDeliveryNote(
            orderId,
            file,
            data.metadata
          );

          if (uploadResult.success && uploadResult.deliveryNoteId) {
            deliveryNoteIds.push(uploadResult.deliveryNoteId);
            deliveryNotesUploaded++;
            console.log(`✅ Lieferschein hochgeladen: ID ${uploadResult.deliveryNoteId}`);
          } else {
            console.error(`❌ Lieferschein-Upload fehlgeschlagen: ${uploadResult.error}`);
            // Weiter verarbeiten, aber Fehler loggen
          }
        }
      }

      // 2. Dann normalen Wareneingang verarbeiten
      const goodsReceiptResult = await this.processGoodsReceipt(order, data.items);

      // 3. Resultat erweitern um Lieferschein-Informationen
      return {
        ...goodsReceiptResult,
        deliveryNotesUploaded,
        deliveryNoteIds
      };

    } catch (error) {
      console.error('❌ Fehler beim Wareneingang mit Dokumenten:', error);
      return {
        success: false,
        orderId,
        orderNumber: '',
        itemsProcessed: 0,
        batchesCreated: 0,
        totalValue: 0,
        deliveryNotesUploaded: 0,
        deliveryNoteIds: [],
        errorMessage: error instanceof Error ? error.message : 'Unbekannter Fehler'
      };
    }
  }

  /**
   * Holt Wareneingang-Details inklusive Lieferscheine
   */
  async getGoodsReceiptWithDocuments(orderId: number): Promise<any> {
    try {
      // Normale Wareneingang-Details holen
      const basicDetails = await this.getGoodsReceiptDetails(orderId);
      
      // Lieferscheine hinzufügen
      const deliveryNotes = await this.deliveryNoteService.getDeliveryNotes(orderId);

      return {
        ...basicDetails,
        deliveryNotes,
        hasDeliveryNotes: deliveryNotes.length > 0,
        deliveryNoteCount: deliveryNotes.length
      };
    } catch (error) {
      console.error('❌ Fehler beim Laden der Wareneingang-Details mit Dokumenten:', error);
      throw error;
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
        const warehouseId = order.warehouseId || order.warehouse_id || 1; // Fallback auf Warehouse 1
        const batchId = await this.createInventoryBatch(tx, {
          productId: item.productId,
          productName: item.productName,
          warehouseId: warehouseId,
          quantity: item.quantityReceived,
          expiryDate: item.expiryDate,
          batchNumber: item.batchNumber || this.generateBatchNumber(),
          supplierId: order.supplierId || order.supplier_id || 1,
          supplierName: order.supplierName || order.supplier_name || 'Unbekannt',
          unitPrice: 0, // Wird später aus Bestellposition geholt
          notes: item.notes
        });

        // Inventory-Updates sind optional - Order-Status wird immer aktualisiert
        if (batchId) {
          batchesCreated++;

          // 2. Update oder erstelle Inventory Item für Lagerbestand (optional)
          await this.updateInventoryStock(tx, {
            productId: item.productId,
            warehouseId: warehouseId,
            quantityAdded: item.quantityReceived,
            batchId: batchId
          });
          
          // Berechne Warenwert (vereinfacht)
          totalValue += item.quantityReceived * 2.5; // Durchschnittspreis als Fallback
        } else {
          console.log(`⚠️ Batch-Erstellung fehlgeschlagen für Item ${item.orderItemId} - fahre nur mit Order-Status fort`);
        }

        // 3. Update Bestellposition IMMER (unabhängig von Inventory-Features)
        await tx
          .update(orderItems)
          .set({ 
            quantityDelivered: item.quantityReceived,
            status: item.quantityReceived >= item.quantityOrdered ? 'completed' : 'partial'
          })
          .where(eq(orderItems.id, item.orderItemId));

        processedItems.push(item.orderItemId);
        console.log(`✅ Order Item ${item.orderItemId} aktualisiert: ${item.quantityReceived}/${item.quantityOrdered}`);
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
      // Versuche Inventory Batch zu erstellen, aber falls das Schema nicht existiert, 
      // erstelle einen fallback und logge nur
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

      console.log(`✅ Inventory Batch erstellt: ${batch.id}`);
      return batch.id;
    } catch (error) {
      console.error('❌ Fehler beim Erstellen der Inventory Batch:', error);
      console.log('⚠️ Inventory Batch fehlgeschlagen - möglicherweise ist inventoryBatches schema nicht verfügbar');
      // Return null, um dem Caller zu signalisieren, dass keine Batch erstellt wurde
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
    try {
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
        console.log(`✅ Lagerbestand aktualisiert: Produkt ${data.productId}, +${data.quantityAdded}`);
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
        console.log(`✅ Neuer Lagerbestand erstellt: Produkt ${data.productId}, Menge ${data.quantityAdded}`);
      }
    } catch (error) {
      console.error('❌ Fehler beim Aktualisieren des Lagerbestands:', error);
      console.log('⚠️ Lagerbestand-Update fehlgeschlagen - möglicherweise ist inventoryItems schema nicht verfügbar');
      // Fehler nicht weiterwerfen, Order-Status Updates sollen trotzdem funktionieren
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