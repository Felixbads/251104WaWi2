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
        supplierEmail: suppliers.email,
        supplierId: orders.supplierId,
        supplierName: suppliers.name,
        orderDate: orders.orderDate,
        expectedDeliveryDate: orders.expectedDeliveryDate,
        deliveryType: orders.deliveryType,
        warehouseId: orders.locationId,
        warehouseName: warehouses.name,
        warehouseLocation: warehouses.address
      })
      .from(orders)
      .leftJoin(suppliers, eq(orders.supplierId, suppliers.id))
      .leftJoin(warehouses, eq(orders.locationId, warehouses.id))
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

    // Generate enhanced product table with detailed breakdown
    let productTableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: left;">Produkt</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">Menge</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">Gebindegröße</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">Gesamtmenge</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">Einzelpreis (Netto)</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">Pfand</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">Netto</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">MwSt.</th>
            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: right;">Brutto</th>
          </tr>
        </thead>
        <tbody>
    `;

    let totalNet = 0;
    let totalVat = 0;
    let totalGross = 0;
    let totalPfand = 0;

    for (const item of items) {
      const quantity = item.quantity || 0;
      const unitPrice = item.unitPrice || 0;
      const vatRate = item.vatRate || 19;
      const gebindegroesse = item.packageSize || 1;
      const gesamtmenge = quantity * gebindegroesse;
      const pfandPerUnit = 0; // Set to 0 for now since deposit field doesn't exist
      const pfandTotal = quantity * pfandPerUnit;
      
      const netTotal = quantity * unitPrice;
      const vatAmount = netTotal * (vatRate / 100);
      const grossTotal = netTotal + vatAmount;
      
      totalNet += netTotal;
      totalVat += vatAmount;
      totalGross += grossTotal;
      totalPfand += pfandTotal;
      
      const productDisplayName = item.productName || 'Unbekanntes Produkt';
      
      productTableHtml += `
        <tr>
          <td style="padding: 8px; border: 1px solid #dee2e6;">${productDisplayName}</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${quantity}</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${gebindegroesse}</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${gesamtmenge}</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${unitPrice.toFixed(2)} €</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${pfandTotal.toFixed(2)} €</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${netTotal.toFixed(2)} €</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right;">${vatAmount.toFixed(2)} €</td>
          <td style="padding: 8px; border: 1px solid #dee2e6; text-align: right; font-weight: bold;">${grossTotal.toFixed(2)} €</td>
        </tr>
      `;
    }

    productTableHtml += `
        </tbody>
        <tfoot>
          <tr style="background-color: #f8f9fa; font-weight: bold;">
            <td style="padding: 12px; border: 1px solid #dee2e6;">Summen:</td>
            <td style="padding: 12px; border: 1px solid #dee2e6;"></td>
            <td style="padding: 12px; border: 1px solid #dee2e6;"></td>
            <td style="padding: 12px; border: 1px solid #dee2e6;"></td>
            <td style="padding: 12px; border: 1px solid #dee2e6;"></td>
            <td style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">${totalPfand.toFixed(2)} €</td>
            <td style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">${totalNet.toFixed(2)} €</td>
            <td style="padding: 12px; border: 1px solid #dee2e6; text-align: right;">${totalVat.toFixed(2)} €</td>
            <td style="padding: 12px; border: 1px solid #dee2e6; text-align: right; font-size: 16px;">${totalGross.toFixed(2)} €</td>
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
      
      // Replace placeholders in custom template with safe string replacement
      const replacements = {
        '{orderNumber}': orderData.orderNumber || '',
        '{orderDate}': orderDate,
        '{deliveryDate}': deliveryDate,
        '{deliveryType}': orderData.deliveryType === 'pickup' ? 'Abholung' : 'Anlieferung',
        '{deliveryAddress}': deliveryAddress.replace(/\n/g, '<br>'),
        '{netAmount}': totalNet.toFixed(2),
        '{vatAmount}': totalVat.toFixed(2),
        '{totalAmount}': totalGross.toFixed(2),
        '{pfandAmount}': totalPfand.toFixed(2),
        '{vatRate}': '19',
        '{itemsList}': productTableHtml,
        '{productTable}': productTableHtml,
        '{{orderItems}}': productTableHtml,
        // Additional warehouse info
        '{warehouseAddress}': deliveryAddress.replace(/\n/g, '<br>'),
        '{supplierNumber}': orderData.supplierId?.toString() || ''
      };
      
      // Apply replacements safely using regex to avoid issues with special characters
      for (const [placeholder, value] of Object.entries(replacements)) {
        try {
          const escapedPlaceholder = placeholder.replace(/[{}]/g, '\\$&');
          const regex = new RegExp(escapedPlaceholder, 'g');
          content = content.replace(regex, value || '');
          subject = subject.replace(regex, value || '');
        } catch (error) {
          console.warn(`Failed to replace placeholder ${placeholder}:`, error);
          // Fallback to simple string replacement
          content = content.split(placeholder).join(value || '');
          subject = subject.split(placeholder).join(value || '');
        }
      }
        
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