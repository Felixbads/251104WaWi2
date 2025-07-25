/**
 * PURCHASE PRICE SERVICE
 * 
 * Zentraler Service für Einkaufspreis-Management mit automatischer
 * Historisierung und Weclapp-Integration (Vorbereitung)
 */

import { db } from '../db';
import { purchaseConditions, purchasePriceHistory, products, suppliers } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export class PurchasePriceService {
  
  /**
   * Aktualisiert Einkaufspreis mit automatischer Historisierung
   */
  async updatePurchasePrice(
    productId: number,
    supplierId: number,
    newPrice: number,
    changeReason: string = 'manual_update',
    orderId?: number,
    invoiceReference?: string,
    userId?: number
  ): Promise<{ success: boolean; message: string; priceHistoryId?: number }> {
    try {
      console.log(`💰 Aktualisiere Einkaufspreis: Produkt ${productId}, Lieferant ${supplierId}, Neuer Preis: ${newPrice}€`);

      // 1. Suche bestehende Purchase Condition
      const [existingCondition] = await db
        .select()
        .from(purchaseConditions)
        .where(
          and(
            eq(purchaseConditions.productId, productId),
            eq(purchaseConditions.supplierId, supplierId)
          )
        )
        .limit(1);

      if (!existingCondition) {
        return {
          success: false,
          message: `Keine Einkaufsbedingung für Produkt ${productId} und Lieferant ${supplierId} gefunden`
        };
      }

      const oldPrice = existingCondition.unitPrice;

      // 2. Prüfe ob Preisänderung wirklich notwendig
      if (oldPrice === newPrice) {
        return {
          success: true,
          message: 'Kein Preisupdate erforderlich - Preis unverändert'
        };
      }

      // 3. Starte Transaktion für konsistente Updates
      const result = await db.transaction(async (tx) => {
        // 3a. Update Purchase Condition
        await tx
          .update(purchaseConditions)
          .set({
            unitPrice: newPrice,
            grossPrice: newPrice * (1 + (existingCondition.taxRate || 19) / 100),
            updatedAt: new Date()
          })
          .where(eq(purchaseConditions.id, existingCondition.id));

        // 3b. Speichere Preishistorie
        const [historyEntry] = await tx
          .insert(purchasePriceHistory)
          .values({
            purchaseConditionId: existingCondition.id,
            oldUnitPrice: oldPrice,
            newUnitPrice: newPrice,
            changeReason,
            orderId,
            invoiceReference,
            createdBy: userId,
            automaticUpdate: changeReason !== 'manual_update',
            notes: `Preisänderung: ${oldPrice}€ → ${newPrice}€ (${changeReason})`
          })
          .returning({ id: purchasePriceHistory.id });

        return historyEntry.id;
      });

      console.log(`✅ Preis erfolgreich aktualisiert: ${oldPrice}€ → ${newPrice}€`);
      return {
        success: true,
        message: `Preis erfolgreich von ${oldPrice}€ auf ${newPrice}€ aktualisiert`,
        priceHistoryId: result
      };

    } catch (error) {
      console.error('Fehler beim Aktualisieren des Einkaufspreises:', error);
      return {
        success: false,
        message: `Fehler beim Preisupdate: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  /**
   * Holt aktuellen Einkaufspreis für Produkt und Lieferant
   */
  async getCurrentPurchasePrice(productId: number, supplierId: number): Promise<number | null> {
    try {
      const [condition] = await db
        .select({ unitPrice: purchaseConditions.unitPrice })
        .from(purchaseConditions)
        .where(
          and(
            eq(purchaseConditions.productId, productId),
            eq(purchaseConditions.supplierId, supplierId)
          )
        )
        .limit(1);

      return condition?.unitPrice || null;
    } catch (error) {
      console.error('Fehler beim Abrufen des aktuellen Preises:', error);
      return null;
    }
  }

  /**
   * Holt Preishistorie für ein Produkt
   */
  async getPriceHistory(productId: number, limit: number = 10): Promise<any[]> {
    try {
      const history = await db
        .select({
          id: purchasePriceHistory.id,
          oldPrice: purchasePriceHistory.oldUnitPrice,
          newPrice: purchasePriceHistory.newUnitPrice,
          changeDate: purchasePriceHistory.changeDate,
          changeReason: purchasePriceHistory.changeReason,
          automaticUpdate: purchasePriceHistory.automaticUpdate,
          supplierName: suppliers.name
        })
        .from(purchasePriceHistory)
        .innerJoin(purchaseConditions, eq(purchasePriceHistory.purchaseConditionId, purchaseConditions.id))
        .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
        .where(eq(purchaseConditions.productId, productId))
        .orderBy(desc(purchasePriceHistory.changeDate))
        .limit(limit);

      return history;
    } catch (error) {
      console.error('Fehler beim Abrufen der Preishistorie:', error);
      return [];
    }
  }

  /**
   * WECLAPP INTEGRATION (Vorbereitung)
   * Importiert Preise aus Weclapp Rechnungen
   */
  async importPricesFromWeclappInvoice(invoiceData: any): Promise<{ success: boolean; updatedProducts: number }> {
    try {
      console.log('🔄 Importiere Preise aus Weclapp-Rechnung:', invoiceData.invoiceNumber);
      
      let updatedProducts = 0;

      // Für jede Rechnungsposition
      for (const lineItem of invoiceData.lineItems || []) {
        if (lineItem.articleId && lineItem.quantity > 0) {
          const unitPrice = lineItem.totalAmount / lineItem.quantity;
          
          // Suche entsprechendes Produkt in unserem System
          const [product] = await db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.productName, lineItem.articleName))
            .limit(1);

          if (product) {
            const updateResult = await this.updatePurchasePrice(
              product.id,
              invoiceData.supplierId,
              unitPrice,
              'weclapp_sync',
              undefined,
              invoiceData.invoiceNumber
            );

            if (updateResult.success) {
              updatedProducts++;
            }
          }
        }
      }

      console.log(`✅ Weclapp-Import abgeschlossen: ${updatedProducts} Produkte aktualisiert`);
      return { success: true, updatedProducts };

    } catch (error) {
      console.error('Fehler beim Weclapp-Import:', error);
      return { success: false, updatedProducts: 0 };
    }
  }

  /**
   * Berechnet Margen basierend auf aktuellen Einkaufspreisen
   */
  async calculateProductMargins(productId: number): Promise<any> {
    try {
      // Hole alle Purchase Conditions für das Produkt
      const conditions = await db
        .select({
          supplierId: purchaseConditions.supplierId,
          supplierName: suppliers.name,
          unitPrice: purchaseConditions.unitPrice,
          isPreferred: purchaseConditions.isPreferred
        })
        .from(purchaseConditions)
        .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
        .where(eq(purchaseConditions.productId, productId));

      // Hole Verkaufspreis des Produkts
      const [product] = await db
        .select({ price: products.price, productName: products.productName })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product || !product.price) {
        return { error: 'Produkt oder Verkaufspreis nicht gefunden' };
      }

      // Berechne Margen für alle Lieferanten
      const margins = conditions.map(condition => {
        const margin = product.price - condition.unitPrice;
        const marginPercent = (margin / product.price) * 100;

        return {
          supplierId: condition.supplierId,
          supplierName: condition.supplierName,
          purchasePrice: condition.unitPrice,
          sellingPrice: product.price,
          marginAbsolute: margin,
          marginPercent: marginPercent,
          isPreferred: condition.isPreferred
        };
      });

      return {
        productId,
        productName: product.productName,
        sellingPrice: product.price,
        suppliers: margins,
        bestMargin: margins.reduce((best, current) => 
          current.marginPercent > best.marginPercent ? current : best
        , margins[0])
      };

    } catch (error) {
      console.error('Fehler bei der Margenberechnung:', error);
      return { error: 'Fehler bei der Margenberechnung' };
    }
  }
}

// Singleton-Instanz für globale Verwendung
export const purchasePriceService = new PurchasePriceService();