import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orders, orderItems, suppliers, warehouses, products, supplierEmailTemplates } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Enhanced email template generation with proper template loading and tax calculations
router.get('/orders/:id/email-template-enhanced', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestellungs-ID' });
    }

    console.log(`GET /api/orders/${orderId}/email-template-enhanced - Generiere erweiterte E-Mail-Vorlage...`);

    // Load order with supplier details
    const [orderData] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        supplierEmail: orders.supplierEmail,
        supplierId: orders.supplierId,
        supplierName: suppliers.companyName,
        orderDate: orders.orderDate,
        expectedDeliveryDate: orders.expectedDeliveryDate,
        deliveryType: orders.deliveryType,
        warehouseId: orders.warehouseId,
        warehouseName: warehouses.name,
        warehouseLocation: warehouses.location
      })
      .from(orders)
      .leftJoin(suppliers, eq(orders.supplierId, suppliers.id))
      .leftJoin(warehouses, eq(orders.warehouseId, warehouses.id))
      .where(eq(orders.id, orderId));

    if (!orderData) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    console.log('Bestelldaten geladen:', {
      orderNumber: orderData.orderNumber,
      supplierEmail: orderData.supplierEmail,
      supplierId: orderData.supplierId,
      supplierName: orderData.supplierName
    });

    // Load order items with proper pricing
    const items = await db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        unit: orderItems.unit,
        vatRate: orderItems.vatRate,
        packageSize: products.packageSize,
        category: products.category
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));

    console.log('Bestellpositionen geladen:', items.length, 'Artikel');

    // Try to load custom supplier template
    let customTemplate = null;
    if (orderData.supplierId) {
      console.log('Lade lieferantenspezifische Vorlage für Supplier ID:', orderData.supplierId);
      
      const templates = await db
        .select()
        .from(supplierEmailTemplates)
        .where(eq(supplierEmailTemplates.supplierId, orderData.supplierId));
      
      if (templates.length > 0) {
        customTemplate = templates[0];
        console.log('Lieferantenspezifische Vorlage gefunden:', customTemplate.templateName);
      } else {
        console.log('Keine lieferantenspezifische Vorlage gefunden');
      }
    }

    // Generate product table with proper tax calculations
    let productTableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 12px; border: 1px solid #dee2e6; text-align: left;">Menge</th>
            <th style="padding: 12px; border: 1px solid #dee2e6; text-align: left;">Artikel</th>
            <th style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">Einzelpreis (netto)</th>
            <th style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">MwSt</th>
            <th style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">Gesamtpreis (brutto)</th>
          </tr>
        </thead>
        <tbody>
    `;

    let totalNet = 0;
    let totalVat = 0;
    let totalGross = 0;

    for (const item of items) {
      const quantity = item.quantity || 0;
      const unitPrice = item.unitPrice || 0;
      const vatRate = item.vatRate || 19;
      
      const netTotal = quantity * unitPrice;
      const vatAmount = netTotal * (vatRate / 100);
      const grossTotal = netTotal + vatAmount;
      
      totalNet += netTotal;
      totalVat += vatAmount;
      totalGross += grossTotal;
      
      // Include packaging info if available
      let productDisplayName = item.productName || 'Unbekanntes Produkt';
      if (item.packageSize) {
        productDisplayName += ` (Gebinde: ${item.packageSize})`;
      }
      
      productTableHtml += `
        <tr>
          <td style="padding: 8px; border: 1px solid #dee2e6;">${quantity} ${item.unit || 'Stk'}</td>
          <td style="padding: 8px; border: 1px solid #dee2e6;">${productDisplayName}</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${unitPrice.toFixed(2)} €</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${vatRate}% (${vatAmount.toFixed(2)} €)</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${grossTotal.toFixed(2)} €</td>
        </tr>
      `;
    }

    productTableHtml += `
        </tbody>
        <tfoot>
          <tr style="background-color: #f8f9fa; font-weight: bold;">
            <td colspan="2" style="padding: 12px; border: 1px solid #dee2e6;">Summen:</td>
            <td style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">${totalNet.toFixed(2)} €</td>
            <td style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">${totalVat.toFixed(2)} €</td>
            <td style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">${totalGross.toFixed(2)} €</td>
          </tr>
        </tfoot>
      </table>
    `;

    // Format dates
    const orderDate = new Date(orderData.orderDate).toLocaleDateString('de-DE');
    const deliveryDate = orderData.expectedDeliveryDate 
      ? new Date(orderData.expectedDeliveryDate).toLocaleDateString('de-DE')
      : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE');

    // Determine delivery address based on delivery type
    let deliveryAddress = '';
    if (orderData.deliveryType === 'pickup') {
      // Use supplier address for pickup
      deliveryAddress = `${orderData.supplierName}\n[Abholung beim Lieferanten]`;
    } else {
      // Use warehouse address for delivery
      deliveryAddress = `${orderData.warehouseName}\n${orderData.warehouseLocation}`;
    }

    let subject = '';
    let content = '';

    if (customTemplate) {
      // Use custom supplier template
      console.log('Verwende lieferantenspezifische Vorlage:', customTemplate.templateName);
      
      subject = customTemplate.subjectTemplate || `Bestellung ${orderData.orderNumber} – Lieferung am ${deliveryDate}`;
      content = customTemplate.contentTemplate || '';
      
      // Replace placeholders in custom template
      content = content
        .replace(/\{orderNumber\}/g, orderData.orderNumber || '')
        .replace(/\{orderDate\}/g, orderDate)
        .replace(/\{deliveryDate\}/g, deliveryDate)
        .replace(/\{deliveryType\}/g, orderData.deliveryType === 'pickup' ? 'Abholung' : 'Anlieferung')
        .replace(/\{deliveryAddress\}/g, deliveryAddress)
        .replace(/\{netAmount\}/g, totalNet.toFixed(2))
        .replace(/\{vatAmount\}/g, totalVat.toFixed(2))
        .replace(/\{totalAmount\}/g, totalGross.toFixed(2))
        .replace(/\{vatRate\}/g, '19') // Default VAT rate
        .replace(/\{itemsList\}/g, productTableHtml)
        .replace(/\{productTable\}/g, productTableHtml);
        
    } else {
      // Use standard template with user's uploaded text
      console.log('Verwende Standard-Vorlage');
      
      subject = `Bestellung ${orderData.orderNumber} – Lieferung am ${deliveryDate}`;
      content = `Sehr geehrte Damen und Herren,

hiermit bestellen wir folgende Artikel:

${productTableHtml}

Liefertermin: ${deliveryDate}
Bestellnummer: ${orderData.orderNumber}

Lieferanschrift:
Elbsandstein Proviant & Quartier GmbH
Bahnhofstraße 10
01796 Pirna

Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH
USt-IdNr.: DE353967134`;
    }

    const response = {
      subject,
      content,
      supplierEmail: orderData.supplierEmail,
      orderDetails: {
        orderNumber: orderData.orderNumber,
        orderDate,
        deliveryDate,
        totalAmount: totalGross.toFixed(2),
        netAmount: totalNet.toFixed(2),
        vatAmount: totalVat.toFixed(2),
        itemsCount: items.length,
        supplierName: orderData.supplierName,
        deliveryType: orderData.deliveryType,
        templateUsed: customTemplate ? customTemplate.templateName : 'Standard-Vorlage'
      }
    };

    console.log('E-Mail-Vorlage generiert:', {
      subject,
      supplierEmail: orderData.supplierEmail,
      templateUsed: response.orderDetails.templateUsed,
      totalGross: totalGross.toFixed(2)
    });

    res.json(response);
  } catch (error) {
    console.error('Fehler beim Generieren der E-Mail-Vorlage:', error);
    res.status(500).json({ error: 'Fehler beim Generieren der E-Mail-Vorlage' });
  }
});

export default router;