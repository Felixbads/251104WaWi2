/**
 * WARENEINGANG-SERVICE FÜR WIEDERKEHRENDE BESTELLUNGEN
 * 
 * Verwaltet automatische Wareneingänge für wiederkehrende Bestellungen
 * mit MHD-Integration und Lagerbestandsführung
 */

import { DatabaseStorage } from '../storage/database-storage';
import { 
  orders, orderItems, inventoryBatches, inventoryItems,
  goodsReceiptDataSchema, goodsReceiptItemSchema, 
  goodsReceiptBatchCreateSchema, goodsReceiptInventoryUpdateSchema,
  type GoodsReceiptData, type GoodsReceiptItem, type GoodsReceiptBatchCreate,
  type GoodsReceiptInventoryUpdate
} from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import DeliveryNoteUploadService, { UploadedFile, DeliveryNoteMetadata } from './deliveryNoteUploadService';

// Legacy interface für Rückwärtskompatibilität
interface LegacyGoodsReceiptItem {
  orderItemId: number;
  productId: number;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  qualityStatus?: 'good' | 'damaged' | 'partial' | 'rejected';
  warehouseId?: number;
  expiryDate?: string;
  batchNumber?: string;
  supplierBatchNumber?: string;
  locationInWarehouse?: string;
  damageDescription?: string;
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
  validationErrors?: string[];
  warningMessages?: string[];
  deliveryDate?: string;
  warehouseId?: number;
  requiresFollowUp?: boolean;
}

interface GoodsReceiptWithDocuments {
  items: LegacyGoodsReceiptItem[];
  deliveryNotes: UploadedFile[];
  metadata: DeliveryNoteMetadata;
}

// Enhanced interface für erweiterte Features
interface EnhancedGoodsReceiptWithDocuments {
  goodsReceiptData: GoodsReceiptData;
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
        qualityStatus: 'good' as const,
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

      // 2. Dann normalen Wareneingang verarbeiten (convert Legacy items to GoodsReceiptItem format)
      const convertedItems: GoodsReceiptItem[] = data.items.map(item => ({
        ...item,
        qualityStatus: item.qualityStatus || 'good'
      }));
      const goodsReceiptResult = await this.processGoodsReceipt(order, convertedItems);

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
    
    // Hole alle orderItems für Preisberechnung
    const allOrderItems = await this.db.drizzle
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

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
          unitPrice: allOrderItems.find(oi => oi.id === item.orderItemId)?.unitPrice || 0,
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
          
          // Berechne Warenwert mit echten Preisen aus orderItems
          const orderItem = allOrderItems.find(oi => oi.id === item.orderItemId);
          const unitPrice = orderItem?.unitPrice || 0;
          totalValue += item.quantityReceived * unitPrice;
        } else {
          console.log(`⚠️ Batch-Erstellung fehlgeschlagen für Item ${item.orderItemId} - fahre nur mit Order-Status fort`);
        }

        // 3. Update Bestellposition IMMER (unabhängig von Inventory-Features)
        // Hole aktuellen quantityDelivered Wert für Akkumulation
        const [currentOrderItem] = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.id, item.orderItemId))
          .limit(1);
        
        const currentQuantityDelivered = currentOrderItem?.quantityDelivered || 0;
        const newQuantityDelivered = currentQuantityDelivered + item.quantityReceived;
        
        await tx
          .update(orderItems)
          .set({ 
            quantityDelivered: newQuantityDelivered,
            status: newQuantityDelivered >= item.quantityOrdered ? 'completed' : 'partial'
          })
          .where(eq(orderItems.id, item.orderItemId));

        processedItems.push(item.orderItemId);
        console.log(`✅ Order Item ${item.orderItemId} aktualisiert: ${item.quantityReceived}/${item.quantityOrdered}`);
      }

      // 4. Update Bestellstatus - hole alle orderItems aus DB für korrekte Berechnung
      const allOrderItemsFromDB = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      
      const allItemsCompleted = allOrderItemsFromDB.every(orderItem => {
        const delivered = orderItem.quantityDelivered || 0;
        return delivered >= orderItem.quantity;
      });

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
   * NEUE ERWEITERTE METHODEN FÜR ENHANCED GOODS RECEIPT
   */

  /**
   * Validiert Wareneingang-Daten mit Zod-Schemas
   */
  async validateGoodsReceiptData(data: any): Promise<{
    isValid: boolean;
    validatedData?: GoodsReceiptData;
    errors: string[];
    warnings: string[];
  }> {
    try {
      console.log('📋 Validiere Wareneingang-Daten mit erweiterten Schemas');
      
      const errors: string[] = [];
      const warnings: string[] = [];

      // 1. Schema-Validierung mit goodsReceiptDataSchema
      const validationResult = goodsReceiptDataSchema.safeParse(data);
      
      if (!validationResult.success) {
        const validationErrors = validationResult.error.errors.map(err => {
          const path = err.path.join('.');
          return `${path ? `${path}: ` : ''}${err.message}`;
        });
        errors.push(...validationErrors);
        
        console.error('❌ Schema-Validierung fehlgeschlagen:', validationErrors);
        return {
          isValid: false,
          errors,
          warnings
        };
      }

      const validatedData = validationResult.data;

      // 2. Zusätzliche Business-Logic-Validierungen
      
      // Prüfe ob Bestellung existiert und Status korrekt ist
      const [order] = await this.db.drizzle
        .select()
        .from(orders)
        .where(eq(orders.id, validatedData.orderId));

      if (!order) {
        errors.push(`Bestellung ${validatedData.orderId} nicht gefunden`);
      } else if (order.status !== 'goods_receipt' && order.status !== 'shipped') {
        warnings.push(`Bestellung hat Status '${order.status}' - normalerweise sollte Status 'goods_receipt' oder 'shipped' sein`);
      }

      // Prüfe Warehouse-Zuordnung
      if (validatedData.warehouseId) {
        const warehouseValid = await this.validateWarehouseAccess(validatedData.warehouseId);
        if (!warehouseValid) {
          errors.push(`Lager ${validatedData.warehouseId} ist nicht verfügbar oder ungültig`);
        }
      }

      // Prüfe Lieferdatum (nicht zu weit in der Zukunft)
      const deliveryDate = new Date(validatedData.deliveryDate);
      const maxFutureDate = new Date();
      maxFutureDate.setDate(maxFutureDate.getDate() + 7); // Max 7 Tage in der Zukunft
      
      if (deliveryDate > maxFutureDate) {
        warnings.push('Lieferdatum liegt mehr als 7 Tage in der Zukunft');
      }

      // Prüfe Items auf Vollständigkeit und Konsistenz
      if (order) {
        const orderItemsForOrder = await this.db.drizzle
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        for (const item of validatedData.items) {
          const orderItem = orderItemsForOrder.find(oi => oi.id === item.orderItemId);
          if (!orderItem) {
            errors.push(`Bestellposition ${item.orderItemId} nicht in Bestellung ${order.id} gefunden`);
          } else {
            // Prüfe ob Produktdaten übereinstimmen
            if (orderItem.productId !== item.productId) {
              errors.push(`Produkt-ID ${item.productId} stimmt nicht mit Bestellposition überein`);
            }
            
            // Warnung bei großer Mengenabweichung
            if (item.quantityReceived > item.quantityOrdered * 1.2) {
              warnings.push(`Artikel '${item.productName}': Erhaltene Menge (${item.quantityReceived}) ist 20% höher als bestellt (${item.quantityOrdered})`);
            }
          }
        }
      }

      console.log(`✅ Validierung abgeschlossen: ${errors.length} Fehler, ${warnings.length} Warnungen`);
      
      return {
        isValid: errors.length === 0,
        validatedData: errors.length === 0 ? validatedData : undefined,
        errors,
        warnings
      };

    } catch (error) {
      console.error('❌ Fehler bei der Wareneingang-Validierung:', error);
      return {
        isValid: false,
        errors: [`Unerwarteter Validierungsfehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`],
        warnings: []
      };
    }
  }

  /**
   * Verarbeitet erweiterten Wareneingang mit neuen Features
   */
  async processEnhancedGoodsReceipt(data: GoodsReceiptData): Promise<GoodsReceiptResult> {
    try {
      console.log(`📦 Verarbeite erweiterten Wareneingang für Bestellung ${data.orderId}`);
      console.log(`📅 Lieferdatum: ${data.deliveryDate}, Lager: ${data.warehouseId}`);

      // 1. Validierung der Eingabedaten
      const validation = await this.validateGoodsReceiptData(data);
      if (!validation.isValid || !validation.validatedData) {
        return {
          success: false,
          orderId: data.orderId,
          orderNumber: '',
          itemsProcessed: 0,
          batchesCreated: 0,
          totalValue: 0,
          validationErrors: validation.errors,
          warningMessages: validation.warnings,
          errorMessage: 'Validierung fehlgeschlagen: ' + validation.errors.join(', ')
        };
      }

      const validatedData = validation.validatedData;

      // 2. Hole Bestelldaten
      const [order] = await this.db.drizzle
        .select()
        .from(orders)
        .where(eq(orders.id, validatedData.orderId));

      if (!order) {
        throw new Error(`Bestellung ${validatedData.orderId} nicht gefunden`);
      }

      // 3. Verarbeite mit erweiterten Features
      const result = await this.processEnhancedGoodsReceiptTransaction(order, validatedData);

      // 4. Erweitere Ergebnis mit Validierungsinfo
      return {
        ...result,
        validationErrors: validation.errors,
        warningMessages: validation.warnings,
        deliveryDate: validatedData.deliveryDate,
        warehouseId: validatedData.warehouseId,
        requiresFollowUp: validatedData.requiresFollowUp
      };

    } catch (error) {
      console.error('❌ Fehler beim erweiterten Wareneingang:', error);
      return {
        success: false,
        orderId: data.orderId,
        orderNumber: '',
        itemsProcessed: 0,
        batchesCreated: 0,
        totalValue: 0,
        errorMessage: error instanceof Error ? error.message : 'Unbekannter Fehler'
      };
    }
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
   * Erweiterte Transaktion für Enhanced Goods Receipt
   */
  private async processEnhancedGoodsReceiptTransaction(
    order: any, 
    data: GoodsReceiptData
  ): Promise<GoodsReceiptResult> {
    let batchesCreated = 0;
    let totalValue = 0;
    const processedItems: number[] = [];
    const warnings: string[] = [];
    
    // Hole alle orderItems für Preisberechnung
    const allOrderItemsEnhanced = await this.db.drizzle
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    // Starte erweiterte Transaktion
    await this.db.drizzle.transaction(async (tx) => {
      for (const item of data.items) {
        if (item.quantityReceived <= 0) continue;

        // 1. Verwende explizite Lager-ID oder Fallback
        const warehouseId = item.warehouseId || data.warehouseId || order.warehouseId || order.warehouse_id || 1;

        // 2. Erstelle erweiterte Inventory Batch mit neuen Feldern
        const batchId = await this.createEnhancedInventoryBatch(tx, {
          productId: item.productId,
          productName: item.productName,
          warehouseId: warehouseId,
          quantity: item.quantityReceived,
          expiryDate: item.expiryDate,
          batchNumber: item.batchNumber || this.generateBatchNumber(),
          supplierBatchNumber: item.supplierBatchNumber,
          supplierId: data.supplierId || order.supplierId || order.supplier_id || 1,
          supplierName: data.supplierName || order.supplierName || order.supplier_name || 'Unbekannt',
          unitPrice: allOrderItemsEnhanced.find(oi => oi.id === item.orderItemId)?.unitPrice || 0,
          locationInWarehouse: item.locationInWarehouse,
          qualityStatus: item.qualityStatus || 'good',
          damageDescription: item.damageDescription,
          receivedDate: data.deliveryDate,
          notes: item.notes,
          orderId: order.id
        });

        if (batchId) {
          batchesCreated++;

          // 3. Update Inventory mit erweiterten Informationen
          await this.updateEnhancedInventoryStock(tx, {
            productId: item.productId,
            warehouseId: warehouseId,
            quantityAdded: item.quantityReceived,
            batchId: batchId,
            movementType: 'IN',
            referenceType: 'GOODS_RECEIPT',
            referenceId: `GR-${order.orderNumber}-${new Date().toISOString()}`,
            notes: `Wareneingang vom ${data.deliveryDate}: ${item.quantityReceived} Stück`
          });
          
          // Berechne Warenwert mit echten Preisen aus orderItems
          const orderItemEnhanced = allOrderItemsEnhanced.find(oi => oi.id === item.orderItemId);
          const unitPriceEnhanced = orderItemEnhanced?.unitPrice || 0;
          totalValue += item.quantityReceived * unitPriceEnhanced;
        } else {
          console.log(`⚠️ Enhanced Batch-Erstellung fehlgeschlagen für Item ${item.orderItemId}`);
          warnings.push(`Batch-Erstellung für '${item.productName}' fehlgeschlagen - Lagerbestand nicht aktualisiert`);
        }

        // 4. Update Bestellposition mit erweiterten Feldern
        // Hole aktuellen quantityDelivered Wert für Akkumulation
        const [currentOrderItemEnhanced] = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.id, item.orderItemId))
          .limit(1);
        
        const currentQuantityDeliveredEnhanced = currentOrderItemEnhanced?.quantityDelivered || 0;
        const newQuantityDeliveredEnhanced = currentQuantityDeliveredEnhanced + item.quantityReceived;
        
        await tx
          .update(orderItems)
          .set({ 
            quantityDelivered: newQuantityDeliveredEnhanced,
            status: newQuantityDeliveredEnhanced >= item.quantityOrdered ? 'completed' : 'partial',
            // Weitere Felder falls verfügbar
            notes: item.notes
          })
          .where(eq(orderItems.id, item.orderItemId));

        processedItems.push(item.orderItemId);
        console.log(`✅ Enhanced Order Item ${item.orderItemId} verarbeitet: ${item.quantityReceived}/${item.quantityOrdered}`);
      }

      // 5. Update Bestellstatus mit deliveryDate - hole alle orderItems aus DB für korrekte Berechnung
      const allOrderItemsFromDBEnhanced = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      
      const allItemsCompleted = allOrderItemsFromDBEnhanced.every(orderItem => {
        const delivered = orderItem.quantityDelivered || 0;
        return delivered >= orderItem.quantity;
      });

      const newStatus = allItemsCompleted ? 'received' : 'partially_received';
      
      await tx
        .update(orders)
        .set({ 
          status: newStatus,
          actualDeliveryDate: new Date(data.deliveryDate),
          // Weitere Felder falls verfügbar
          notes: data.notes
        })
        .where(eq(orders.id, order.id));
    });

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      itemsProcessed: processedItems.length,
      batchesCreated,
      totalValue,
      warningMessages: warnings
    };
  }

  /**
   * Validiert Lager-Zugang
   */
  private async validateWarehouseAccess(warehouseId: number): Promise<boolean> {
    try {
      // Vereinfachte Validierung - prüft ob Warehouse-ID positiv und reasonable ist
      // In einer echten Implementierung würde hier die Warehouses-Tabelle geprüft
      if (warehouseId <= 0 || warehouseId > 1000) {
        return false;
      }
      
      // Weitere Validierungen könnten hier hinzugefügt werden:
      // - Prüfung ob Warehouse existiert
      // - Prüfung ob User Zugriff auf Warehouse hat
      // - Prüfung ob Warehouse aktiv ist
      
      console.log(`✅ Lager-Zugang validiert: Warehouse ${warehouseId}`);
      return true;
    } catch (error) {
      console.error('❌ Fehler bei Lager-Validierung:', error);
      return false;
    }
  }

  /**
   * Holt verfügbare Lager für eine Bestellung
   */
  async getWarehousesForOrder(orderId: number): Promise<any[]> {
    try {
      console.log(`📦 Lade verfügbare Lager für Bestellung ${orderId}`);
      
      // Vereinfachte Implementierung - in echter Anwendung aus Warehouses-Tabelle
      const defaultWarehouses = [
        {
          id: 1,
          name: 'Hauptlager',
          location: 'Zentrale',
          isActive: true,
          allowsGoodsReceipt: true
        },
        {
          id: 2,
          name: 'Nebenlager',
          location: 'Filiale Nord',
          isActive: true,
          allowsGoodsReceipt: true
        },
        {
          id: 3,
          name: 'Kühlhaus',
          location: 'Speziallager',
          isActive: true,
          allowsGoodsReceipt: true
        }
      ];

      // Filter aktive Lager mit Wareneingang-Berechtigung
      const availableWarehouses = defaultWarehouses.filter(w => 
        w.isActive && w.allowsGoodsReceipt
      );

      console.log(`✅ ${availableWarehouses.length} Lager verfügbar für Bestellung ${orderId}`);
      return availableWarehouses;

    } catch (error) {
      console.error('❌ Fehler beim Laden der Lager:', error);
      return [{
        id: 1,
        name: 'Hauptlager (Fallback)',
        location: 'Standard',
        isActive: true,
        allowsGoodsReceipt: true
      }];
    }
  }

  /**
   * Erweiterte Inventory Batch mit neuen Feldern
   */
  private async createEnhancedInventoryBatch(tx: any, data: {
    productId: number;
    productName: string;
    warehouseId: number;
    quantity: number;
    expiryDate?: string;
    batchNumber: string;
    supplierBatchNumber?: string;
    supplierId: number;
    supplierName: string;
    unitPrice: number;
    locationInWarehouse?: string;
    qualityStatus?: string;
    damageDescription?: string;
    receivedDate: string;
    notes?: string;
    orderId?: number;
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
          receivedDate: new Date(data.receivedDate),
          supplierId: data.supplierId,
          supplierName: data.supplierName,
          unitPrice: data.unitPrice,
          totalValue: data.unitPrice * data.quantity,
          status: data.qualityStatus === 'rejected' ? 'rejected' : 'active',
          notes: [
            data.notes,
            data.supplierBatchNumber ? `Lieferanten-Charge: ${data.supplierBatchNumber}` : null,
            data.locationInWarehouse ? `Lagerplatz: ${data.locationInWarehouse}` : null,
            data.qualityStatus !== 'good' ? `Qualität: ${data.qualityStatus}` : null,
            data.damageDescription ? `Schaden: ${data.damageDescription}` : null
          ].filter(Boolean).join(' | ') || data.notes
        })
        .returning({ id: inventoryBatches.id });

      console.log(`✅ Enhanced Inventory Batch erstellt: ${batch.id} (${data.qualityStatus || 'good'})`);
      return batch.id;
    } catch (error) {
      console.error('❌ Fehler beim Erstellen der Enhanced Inventory Batch:', error);
      return null;
    }
  }

  /**
   * Erweiterte Lagerbestand-Aktualisierung
   */
  private async updateEnhancedInventoryStock(tx: any, data: {
    productId: number;
    warehouseId: number;
    quantityAdded: number;
    batchId: number;
    movementType: 'IN' | 'OUT' | 'ADJUSTMENT';
    referenceType: string;
    referenceId: string;
    notes?: string;
  }): Promise<void> {
    try {
      // Standard Inventory Update (wie vorher)
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
        await tx
          .update(inventoryItems)
          .set({
            currentStock: existingItem[0].currentStock + data.quantityAdded,
            lastUpdated: new Date()
          })
          .where(eq(inventoryItems.id, existingItem[0].id));
      } else {
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
            notes: 'Automatisch erstellt durch Enhanced Wareneingang'
          });
      }

      console.log(`✅ Enhanced Lagerbestand aktualisiert: Produkt ${data.productId}, ${data.movementType} ${data.quantityAdded}`);
    } catch (error) {
      console.error('❌ Fehler beim Enhanced Lagerbestand-Update:', error);
    }
  }

  /**
   * ZUSÄTZLICHE HELPER-METHODEN FÜR ERWEITERTE FUNKTIONALITÄT
   */

  /**
   * Verbesserte MHD-Validierung mit produktspezifischen Regeln
   */
  validateExpiryDate(productName: string, expiryDate: string): {
    isValid: boolean;
    warnings: string[];
    recommendedDate?: string;
  } {
    const warnings: string[] = [];
    const expiry = new Date(expiryDate);
    const today = new Date();
    const lowerName = productName.toLowerCase();

    // Basis-Validierung
    if (isNaN(expiry.getTime())) {
      return { isValid: false, warnings: ['Ungültiges MHD-Format'] };
    }

    if (expiry < today) {
      return { isValid: false, warnings: ['MHD liegt in der Vergangenheit'] };
    }

    // Produktspezifische MHD-Prüfungen
    const daysDiff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    let expectedMinDays = 1;
    let expectedMaxDays = 365;

    if (lowerName.includes('milch') || lowerName.includes('joghurt')) {
      expectedMinDays = 1;
      expectedMaxDays = 21; // Milchprodukte: 1-21 Tage
    } else if (lowerName.includes('brot') || lowerName.includes('gebäck')) {
      expectedMinDays = 1;
      expectedMaxDays = 7; // Backwaren: 1-7 Tage
    } else if (lowerName.includes('obst') || lowerName.includes('gemüse')) {
      expectedMinDays = 1;
      expectedMaxDays = 14; // Frische Produkte: 1-14 Tage
    } else if (lowerName.includes('fleisch') || lowerName.includes('wurst')) {
      expectedMinDays = 1;
      expectedMaxDays = 10; // Fleischprodukte: 1-10 Tage
    }

    if (daysDiff < expectedMinDays) {
      warnings.push(`MHD für ${productName} ist sehr kurz (${daysDiff} Tage) - prüfen Sie das Datum`);
    } else if (daysDiff > expectedMaxDays) {
      warnings.push(`MHD für ${productName} ist ungewöhnlich lang (${daysDiff} Tage) - prüfen Sie das Datum`);
    }

    // Warnung wenn MHD in weniger als 3 Tagen abläuft
    if (daysDiff <= 3) {
      warnings.push(`⚠️ MHD läuft in ${daysDiff} Tag(en) ab - sofortiger Verkauf empfohlen`);
    }

    return {
      isValid: true,
      warnings,
      recommendedDate: daysDiff > expectedMaxDays ? this.calculateDefaultExpiryDate(productName) : undefined
    };
  }

  /**
   * Generiert intelligente Batch-Nummer mit Kontext
   */
  generateEnhancedBatchNumber(productName: string, supplierBatchNumber?: string): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    
    // Produkttyp-Kürzel
    const lowerName = productName.toLowerCase();
    let productCode = 'GEN'; // General
    
    if (lowerName.includes('milch') || lowerName.includes('joghurt')) {
      productCode = 'MLK';
    } else if (lowerName.includes('brot') || lowerName.includes('gebäck')) {
      productCode = 'BRD';
    } else if (lowerName.includes('obst') || lowerName.includes('gemüse')) {
      productCode = 'FRS';
    } else if (lowerName.includes('fleisch') || lowerName.includes('wurst')) {
      productCode = 'MET';
    } else if (lowerName.includes('käse')) {
      productCode = 'CHS';
    }

    const baseBatch = `${productCode}-${date}-${random}`;
    
    if (supplierBatchNumber) {
      return `${baseBatch}-${supplierBatchNumber.substring(0, 4).toUpperCase()}`;
    }
    
    return baseBatch;
  }

  /**
   * Qualitätskontrolle und Schadensbewertung
   */
  assessItemQuality(item: GoodsReceiptItem): {
    qualityScore: number;
    qualityStatus: 'good' | 'acceptable' | 'damaged' | 'rejected';
    recommendations: string[];
    requiresFollowUp: boolean;
  } {
    const recommendations: string[] = [];
    let qualityScore = 100;
    let requiresFollowUp = false;

    // Mengenabweichung bewerten
    const quantityDeviation = Math.abs(item.quantityReceived - item.quantityOrdered) / item.quantityOrdered;
    if (quantityDeviation > 0.1) {
      qualityScore -= 20;
      recommendations.push(`Mengenabweichung: ${(quantityDeviation * 100).toFixed(1)}% - Lieferant kontaktieren`);
      requiresFollowUp = true;
    }

    // MHD bewerten
    if (item.expiryDate) {
      const validation = this.validateExpiryDate(item.productName, item.expiryDate);
      if (validation.warnings.length > 0) {
        qualityScore -= 15;
        recommendations.push(...validation.warnings);
      }
    }

    // Explizite Qualitätsstatus bewerten
    if (item.qualityStatus) {
      switch (item.qualityStatus) {
        case 'damaged':
          qualityScore -= 40;
          requiresFollowUp = true;
          recommendations.push('⚠️ Schaden dokumentiert - Lieferant informieren');
          break;
        case 'partial':
          qualityScore -= 25;
          recommendations.push('Teilweise beschädigt - separates Handling erforderlich');
          break;
        case 'rejected':
          qualityScore = 0;
          requiresFollowUp = true;
          recommendations.push('🚨 Artikel abgelehnt - Rücksendung oder Gutschrift erforderlich');
          break;
      }
    }

    // Qualitätsstatus basierend auf Score bestimmen
    let finalStatus: 'good' | 'acceptable' | 'damaged' | 'rejected' = 'good';
    
    if (qualityScore >= 80) {
      finalStatus = 'good';
    } else if (qualityScore >= 60) {
      finalStatus = 'acceptable';
      recommendations.push('Akzeptabel - regelmäßige Kontrolle empfohlen');
    } else if (qualityScore >= 30) {
      finalStatus = 'damaged';
      requiresFollowUp = true;
    } else {
      finalStatus = 'rejected';
      requiresFollowUp = true;
    }

    return {
      qualityScore,
      qualityStatus: finalStatus,
      recommendations,
      requiresFollowUp
    };
  }

  /**
   * Status-Tracking und Follow-up Management
   */
  async trackGoodsReceiptStatus(orderId: number): Promise<{
    overallStatus: 'completed' | 'partial' | 'requires_attention' | 'rejected';
    itemsCompleted: number;
    itemsPending: number;
    itemsWithIssues: number;
    followUpRequired: boolean;
    nextActions: string[];
  }> {
    try {
      const orderItemsForTracking = await this.db.drizzle
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      let itemsCompleted = 0;
      let itemsPending = 0;
      let itemsWithIssues = 0;
      let followUpRequired = false;
      const nextActions: string[] = [];

      for (const item of orderItemsForTracking) {
        const delivered = item.quantityDelivered || 0;
        const ordered = item.quantity;

        if (delivered >= ordered) {
          itemsCompleted++;
        } else if (delivered > 0) {
          itemsWithIssues++;
          nextActions.push(`${item.productName}: ${ordered - delivered} Stück noch ausstehend`);
        } else {
          itemsPending++;
          nextActions.push(`${item.productName}: Vollständige Lieferung ausstehend`);
        }
      }

      if (itemsWithIssues > 0 || itemsPending > 0) {
        followUpRequired = true;
      }

      let overallStatus: 'completed' | 'partial' | 'requires_attention' | 'rejected' = 'completed';
      
      if (itemsPending === orderItemsForTracking.length) {
        overallStatus = 'requires_attention';
      } else if (itemsWithIssues > 0 || itemsPending > 0) {
        overallStatus = 'partial';
      } else if (itemsCompleted === orderItemsForTracking.length) {
        overallStatus = 'completed';
      }

      console.log(`📊 Status-Tracking für Bestellung ${orderId}: ${overallStatus} (${itemsCompleted}/${orderItemsForTracking.length})`);

      return {
        overallStatus,
        itemsCompleted,
        itemsPending,
        itemsWithIssues,
        followUpRequired,
        nextActions
      };

    } catch (error) {
      console.error('❌ Fehler beim Status-Tracking:', error);
      return {
        overallStatus: 'requires_attention',
        itemsCompleted: 0,
        itemsPending: 0,
        itemsWithIssues: 0,
        followUpRequired: true,
        nextActions: ['Fehler beim Status-Tracking - manuelle Prüfung erforderlich']
      };
    }
  }

  /**
   * Deutsche Fehlermeldungen und Validierungs-Feedback
   */
  formatGermanErrorMessage(error: any): string {
    const errorMessage = error.message || error.toString();
    
    // Häufige Fehler übersetzen
    const translations: { [key: string]: string } = {
      'not found': 'nicht gefunden',
      'invalid date': 'ungültiges Datum',
      'required field': 'Pflichtfeld',
      'must be positive': 'muss positiv sein',
      'warehouse not found': 'Lager nicht gefunden',
      'product not found': 'Produkt nicht gefunden',
      'order not found': 'Bestellung nicht gefunden',
      'quantity too high': 'Menge zu hoch',
      'expiry date invalid': 'MHD ungültig',
      'batch number required': 'Chargennummer erforderlich'
    };

    let germanMessage = errorMessage;
    
    for (const [english, german] of Object.entries(translations)) {
      germanMessage = germanMessage.replace(new RegExp(english, 'gi'), german);
    }

    // Kontext-spezifische Verbesserungen
    if (germanMessage.includes('validation')) {
      germanMessage = `Validierungsfehler: ${germanMessage.replace(/validation/gi, '')}`;
    }
    
    if (germanMessage.includes('database')) {
      germanMessage = `Datenbankfehler: ${germanMessage.replace(/database/gi, 'Datenbank')}`;
    }

    return germanMessage.charAt(0).toUpperCase() + germanMessage.slice(1);
  }

  /**
   * Erweiterte Wareneingang-Details mit allen neuen Features
   */
  async getEnhancedGoodsReceiptDetails(orderId: number): Promise<any> {
    try {
      // Basis-Details holen
      const basicDetails = await this.getGoodsReceiptDetails(orderId);
      
      // Status-Tracking hinzufügen
      const statusTracking = await this.trackGoodsReceiptStatus(orderId);
      
      // Verfügbare Lager laden
      const availableWarehouses = await this.getWarehousesForOrder(orderId);
      
      // Items mit Qualitätsbewertung erweitern
      const enhancedItems = basicDetails.items.map((item: any) => {
        const goodsReceiptItem: GoodsReceiptItem = {
          orderItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          quantityOrdered: item.quantity,
          quantityReceived: item.quantityDelivered || 0,
          qualityStatus: 'good',
          expiryDate: item.expiryDate,
          batchNumber: item.batchNumber
        };
        
        const qualityAssessment = this.assessItemQuality(goodsReceiptItem);
        
        return {
          ...item,
          qualityAssessment,
          recommendedBatchNumber: this.generateEnhancedBatchNumber(item.productName),
          recommendedExpiryDate: this.calculateDefaultExpiryDate(item.productName)
        };
      });

      return {
        ...basicDetails,
        items: enhancedItems,
        statusTracking,
        availableWarehouses,
        enhancedFeatures: true,
        recommendations: {
          overallQuality: statusTracking.overallStatus === 'completed' ? 'good' : 'requires_attention',
          nextActions: statusTracking.nextActions,
          followUpRequired: statusTracking.followUpRequired
        }
      };

    } catch (error) {
      console.error('❌ Fehler beim Laden der erweiterten Wareneingang-Details:', error);
      throw new Error(this.formatGermanErrorMessage(error));
    }
  }

  /**
   * Holt Wareneingang-Details für eine Bestellung (Legacy-Kompatibilität)
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