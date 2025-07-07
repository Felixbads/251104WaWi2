import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orders, orderItems, suppliers, products, warehouses, purchaseConditions, supplierDiscountConditions } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

const router = Router();

interface OrderItemWithDetails {
  id: number;
  productId: number;
  productName: string;
  supplierSku?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxRate: number;
  grossPrice: number;
  vatAmount: number;
  discount?: number;
  discountType?: string;
  finalPrice: number;
}

interface EmailTemplateData {
  order: any;
  supplier: any;
  warehouse: any;
  items: OrderItemWithDetails[];
  totals: {
    netTotal: number;
    grossTotal: number;
    totalVat: number;
    totalDiscount: number;
    finalTotal: number;
  };
}

// Enhanced email template generation with net/gross prices, VAT, and discounts
router.get('/orders/:id/enhanced-email-template', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }

    console.log(`GET /api/orders/${orderId}/enhanced-email-template - Generiere erweiterte E-Mail-Vorlage mit Preisaufschlüsselung...`);

    // Load order with supplier and warehouse details
    const [orderData] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        supplierId: orders.supplierId,
        orderDate: orders.orderDate,
        expectedDeliveryDate: orders.expectedDeliveryDate,
        deliveryType: orders.deliveryType,
        notes: orders.notes,
        status: orders.status,
        // Supplier details
        supplierName: suppliers.name,
        supplierEmail: suppliers.email,
        supplierPhone: suppliers.phone,
        supplierAddress: suppliers.address,
        supplierCity: suppliers.city,
        supplierPostalCode: suppliers.postalCode,
        // Warehouse details
        warehouseName: warehouses.name,
        warehouseAddress: warehouses.address,
        warehouseCity: warehouses.city,
        warehousePostalCode: warehouses.postalCode
      })
      .from(orders)
      .leftJoin(suppliers, eq(orders.supplierId, suppliers.id))
      .leftJoin(warehouses, eq(orders.locationId, warehouses.id))
      .where(eq(orders.id, orderId));

    if (!orderData) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    // Load order items with detailed pricing
    const orderItemsData = await db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        // Product details
        productName: products.productName,
        supplierSku: products.supplierSku,
        vat: products.vat,
        // Purchase condition details
        pcUnitPrice: purchaseConditions.unitPrice,
        pcTaxRate: purchaseConditions.taxRate,
        pcGrossPrice: purchaseConditions.grossPrice
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(purchaseConditions, 
        sql`${purchaseConditions.productId} = ${orderItems.productId} AND ${purchaseConditions.supplierId} = ${orderData.supplierId}`
      )
      .where(eq(orderItems.orderId, orderId));

    // Load applicable discounts for this supplier
    const discountConditions = await db
      .select()
      .from(supplierDiscountConditions)
      .where(
        sql`${supplierDiscountConditions.supplierId} = ${orderData.supplierId} AND 
            ${supplierDiscountConditions.isActive} = true AND
            (${supplierDiscountConditions.validTo} IS NULL OR ${supplierDiscountConditions.validTo} >= NOW())`
      );

    // Process items with detailed pricing calculations
    const processedItems: OrderItemWithDetails[] = orderItemsData.map(item => {
      const taxRate = item.pcTaxRate || item.vat || 19; // Use purchase condition tax rate, fallback to product VAT, default 19%
      const netPrice = item.unitPrice || item.pcUnitPrice || 0;
      const grossPrice = netPrice * (1 + taxRate / 100);
      const vatAmount = netPrice * (taxRate / 100);
      
      // Calculate applicable discounts
      let discount = 0;
      let discountType = '';
      
      for (const discountCondition of discountConditions) {
        if (discountCondition.discountType === 'quantity_scale' && 
            discountCondition.thresholdQuantity && 
            item.quantity >= discountCondition.thresholdQuantity) {
          if (discountCondition.discountPercentage) {
            discount = Math.max(discount, netPrice * (discountCondition.discountPercentage / 100));
            discountType = `Mengenrabatt ${discountCondition.discountPercentage}%`;
          }
        }
        
        if (discountCondition.discountType === 'volume_discount' && 
            discountCondition.thresholdAmount && 
            (netPrice * item.quantity) >= discountCondition.thresholdAmount) {
          if (discountCondition.discountPercentage) {
            discount = Math.max(discount, netPrice * (discountCondition.discountPercentage / 100));
            discountType = `Volumenrabatt ${discountCondition.discountPercentage}%`;
          }
        }
      }
      
      const finalNetPrice = netPrice - discount;
      const finalGrossPrice = finalNetPrice * (1 + taxRate / 100);
      
      return {
        id: item.id,
        productId: item.productId,
        productName: item.productName || `Produkt ${item.productId}`,
        supplierSku: item.supplierSku || '',
        quantity: item.quantity,
        unitPrice: netPrice,
        totalPrice: finalNetPrice * item.quantity,
        taxRate,
        grossPrice: finalGrossPrice,
        vatAmount: finalNetPrice * (taxRate / 100),
        discount,
        discountType,
        finalPrice: finalGrossPrice * item.quantity
      };
    });

    // Calculate totals
    const totals = processedItems.reduce((acc, item) => {
      acc.netTotal += item.totalPrice;
      acc.grossTotal += item.finalPrice;
      acc.totalVat += item.vatAmount * item.quantity;
      acc.totalDiscount += (item.discount || 0) * item.quantity;
      return acc;
    }, {
      netTotal: 0,
      grossTotal: 0,
      totalVat: 0,
      totalDiscount: 0,
      finalTotal: 0
    });
    
    totals.finalTotal = totals.grossTotal;

    // Generate enhanced email template
    const emailTemplate = generateEnhancedEmailTemplate({
      order: orderData,
      supplier: {
        name: orderData.supplierName,
        email: orderData.supplierEmail,
        phone: orderData.supplierPhone,
        address: orderData.supplierAddress,
        city: orderData.supplierCity,
        postalCode: orderData.supplierPostalCode
      },
      warehouse: {
        name: orderData.warehouseName,
        address: orderData.warehouseAddress,
        city: orderData.warehouseCity,
        postalCode: orderData.warehousePostalCode
      },
      items: processedItems,
      totals
    });

    res.json({
      success: true,
      template: emailTemplate,
      data: {
        order: orderData,
        items: processedItems,
        totals,
        itemCount: processedItems.length
      }
    });

  } catch (error) {
    console.error(`Fehler beim Generieren der erweiterten E-Mail-Vorlage für Bestellung ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Fehler beim Generieren der E-Mail-Vorlage', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

function generateEnhancedEmailTemplate(data: EmailTemplateData): string {
  const { order, supplier, warehouse, items, totals } = data;
  
  const orderDate = new Date(order.orderDate).toLocaleDateString('de-DE');
  const deliveryDate = order.expectedDeliveryDate 
    ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE')
    : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE');

  const itemsTable = items.map(item => {
    const discountRow = item.discount && item.discount > 0 
      ? `<tr style="color: #059669; font-size: 0.9em;">
          <td colspan="2" style="padding: 2px 8px; text-align: right;">
            - ${item.discountType}: -${item.discount.toFixed(2)} €
          </td>
        </tr>`
      : '';
    
    return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px 8px; vertical-align: top;">
          <strong>${item.productName}</strong>
          ${item.supplierSku ? `<br><small style="color: #6b7280;">Art.-Nr.: ${item.supplierSku}</small>` : ''}
        </td>
        <td style="padding: 12px 8px; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px 8px; text-align: right;">${item.unitPrice.toFixed(2)} €</td>
        <td style="padding: 12px 8px; text-align: right;">${item.taxRate.toFixed(0)}%</td>
        <td style="padding: 12px 8px; text-align: right;">${item.grossPrice.toFixed(2)} €</td>
        <td style="padding: 12px 8px; text-align: right;"><strong>${item.finalPrice.toFixed(2)} €</strong></td>
      </tr>
      ${discountRow}
    `;
  }).join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: white;">
      <!-- Header -->
      <div style="background: #1f2937; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Bestellung ${order.orderNumber}</h1>
        <p style="margin: 5px 0 0 0;">Elbsandstein Proviant & Quartier GmbH</p>
      </div>

      <!-- Order Details -->
      <div style="padding: 20px; background: #f9fafb;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <h3 style="margin: 0 0 10px 0; color: #374151;">Lieferant</h3>
            <p style="margin: 0; line-height: 1.5;">
              <strong>${supplier.name}</strong><br>
              ${supplier.address || ''}<br>
              ${supplier.postalCode && supplier.city ? `${supplier.postalCode} ${supplier.city}` : supplier.city || ''}<br>
              ${supplier.email ? `E-Mail: ${supplier.email}<br>` : ''}
              ${supplier.phone ? `Tel: ${supplier.phone}` : ''}
            </p>
          </div>
          <div>
            <h3 style="margin: 0 0 10px 0; color: #374151;">Lieferadresse</h3>
            <p style="margin: 0; line-height: 1.5;">
              ${warehouse.name || 'Lager'}<br>
              ${warehouse.address || ''}<br>
              ${warehouse.postalCode && warehouse.city ? `${warehouse.postalCode} ${warehouse.city}` : warehouse.city || ''}
            </p>
          </div>
        </div>
        
        <div style="margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <p style="margin: 0;"><strong>Bestelldatum:</strong> ${orderDate}</p>
            <p style="margin: 5px 0 0 0;"><strong>Gewünschte Lieferung:</strong> ${deliveryDate}</p>
          </div>
          <div>
            <p style="margin: 0;"><strong>Lieferart:</strong> ${order.deliveryType === 'pickup' ? 'Abholung' : 'Lieferung'}</p>
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div style="padding: 20px;">
        <h3 style="margin: 0 0 15px 0; color: #374151;">Bestellpositionen</h3>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #d1d5db;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Artikel</th>
              <th style="padding: 12px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">Menge</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #d1d5db;">Preis (netto)</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #d1d5db;">MwSt.</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #d1d5db;">Preis (brutto)</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #d1d5db;">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            ${itemsTable}
          </tbody>
        </table>
      </div>

      <!-- Totals -->
      <div style="padding: 0 20px 20px 20px;">
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;">
            <div>
              <p style="margin: 0; color: #6b7280;">Nettosumme:</p>
              <p style="margin: 0; color: #6b7280;">Gesamte MwSt.:</p>
              ${totals.totalDiscount > 0 ? `<p style="margin: 0; color: #059669;">Gesamtrabatt:</p>` : ''}
              <p style="margin: 0;"><strong>Bruttosumme:</strong></p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0;">${totals.netTotal.toFixed(2)} €</p>
              <p style="margin: 0;">${totals.totalVat.toFixed(2)} €</p>
              ${totals.totalDiscount > 0 ? `<p style="margin: 0; color: #059669;">-${totals.totalDiscount.toFixed(2)} €</p>` : ''}
              <p style="margin: 0; font-size: 18px;"><strong>${totals.finalTotal.toFixed(2)} €</strong></p>
            </div>
          </div>
        </div>
      </div>

      <!-- Notes -->
      ${order.notes ? `
        <div style="padding: 0 20px 20px 20px;">
          <h3 style="margin: 0 0 10px 0; color: #374151;">Bemerkungen</h3>
          <p style="margin: 0; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            ${order.notes}
          </p>
        </div>
      ` : ''}

      <!-- Footer -->
      <div style="padding: 20px; background: #f3f4f6; text-align: center; border-top: 1px solid #d1d5db;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Vielen Dank für Ihre Zusammenarbeit!<br>
          Elbsandstein Proviant & Quartier GmbH
        </p>
      </div>
    </div>
  `;
}

export default router;