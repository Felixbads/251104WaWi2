import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orders, suppliers, supplierEmailTemplates, orderItems, products, warehouses, locations } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Get complete order data with supplier email information
router.get('/:orderId/email-data', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestell-ID' });
    }

    // Get order with supplier data
    const orderResult = await db
      .select({
        // Order fields
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        expectedDeliveryDate: orders.expectedDeliveryDate,
        deliveryType: orders.deliveryType,
        deliveryAddress: orders.deliveryAddress,
        notes: orders.notes,
        totalAmount: orders.totalAmount,
        
        // Supplier fields
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        supplierEmail: suppliers.email,
        orderEmailRecipient: suppliers.orderEmailRecipient,
        orderEmailCc: suppliers.orderEmailCc,
        orderEmailBcc: suppliers.orderEmailBcc,
        emailSignature: suppliers.emailSignature,
        
        // Location/Warehouse fields
        locationId: orders.locationId,
        locationName: orders.locationName,
        warehouseName: warehouses.name,
        warehouseAddress: warehouses.address,
      })
      .from(orders)
      .leftJoin(suppliers, eq(orders.supplierId, suppliers.id))
      .leftJoin(warehouses, eq(orders.locationId, warehouses.locationId))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (orderResult.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const order = orderResult[0];

    // Get order items with product details
    const items = await db
      .select({
        id: orderItems.id,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        unit: orderItems.unit,
        category: products.category,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));

    // Get supplier email templates if supplier exists
    let emailTemplates: any[] = [];
    if (order.supplierId) {
      emailTemplates = await db
        .select()
        .from(supplierEmailTemplates)
        .where(eq(supplierEmailTemplates.supplierId, order.supplierId))
        .orderBy(supplierEmailTemplates.isDefault, supplierEmailTemplates.templateName);
    }

    // Determine correct email address
    const emailAddress = order.orderEmailRecipient || order.supplierEmail || '';

    // Format delivery date
    const deliveryDate = order.expectedDeliveryDate 
      ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE')
      : 'schnellstmöglich';

    // Calculate totals
    const netTotal = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const vatAmount = netTotal * 0.19;
    const grossTotal = netTotal + vatAmount;

    res.json({
      success: true,
      order: {
        id: order.orderId,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate ? new Date(order.orderDate).toLocaleDateString('de-DE') : '',
        deliveryDate,
        deliveryType: order.deliveryType,
        deliveryAddress: order.deliveryAddress,
        notes: order.notes,
        netTotal: netTotal.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        grossTotal: grossTotal.toFixed(2),
        warehouseName: order.warehouseName,
        warehouseAddress: order.warehouseAddress,
      },
      supplier: {
        id: order.supplierId,
        name: order.supplierName,
        email: emailAddress,
        ccEmails: order.orderEmailCc || 'andreas@proviantomat.de,einkauf@proviantomat.de',
        bccEmails: order.orderEmailBcc || '',
        signature: order.emailSignature || '',
      },
      items,
      emailTemplates: (emailTemplates as any[]).map(template => ({
        id: template.id,
        name: template.templateName,
        subject: template.subjectTemplate,
        body: template.contentTemplate,
        isDefault: template.isDefault,
        templateType: template.templateType,
      })),
    });

  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Daten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der E-Mail-Daten',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Generate email content with template variables replaced
router.post('/:orderId/generate-email', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { templateId, templateType = 'standard' } = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestell-ID' });
    }

    // Get email data first
    const emailDataResponse = await fetch(`http://localhost:5000/api/orders/${orderId}/email-data`);
    if (!emailDataResponse.ok) {
      throw new Error('Fehler beim Laden der E-Mail-Daten');
    }
    
    const emailData = await emailDataResponse.json();
    const { order, supplier, items } = emailData;

    // Get the template
    let template = null;
    if (templateId) {
      const templateResult = await db
        .select()
        .from(supplierEmailTemplates)
        .where(eq(supplierEmailTemplates.id, templateId))
        .limit(1);
      
      if (templateResult.length > 0) {
        template = templateResult[0];
      }
    }

    // Use default template if none found
    if (!template) {
      template = {
        subjectTemplate: 'Bestellung {orderNumber} – Lieferung am {deliveryDate}',
        contentTemplate: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere aktuelle Bestellung {orderNumber} mit geplantem {deliveryType} am {deliveryDate} für unseren Lagerstandort {warehouseAddress}.

Bestellinformationen:
Bestellnummer: {orderNumber}
Bestelldatum: {orderDate}
Bearbeiter: Felix Zschoge
E-Mail für Rückfragen: felix@proviantomat.de
Bestelltyp: Standardbestellung

{deliveryAddress}

Rechnungsadresse:
Elbsandstein Proviant & Quartier GmbH
Seifhennersdorfer Straße 14
01099 Dresden

Bestellte Artikel:
{itemsList}

Kostenübersicht:
Nettosumme: {netAmount} €
zzgl. 19% MwSt.: {vatAmount} €
Gesamtsumme brutto: {totalAmount} €

Bitte bestätigen Sie uns den Erhalt dieser Bestellung sowie den geplanten {deliveryType}.

Für Rückfragen stehen wir jederzeit zur Verfügung.

Mit freundlichen Grüßen
Felix Zschoge

Elbsandstein Proviant & Quartier GmbH
Seifhennersdorfer Straße 14
01099 Dresden
Tel.: +49 173 4385330
E-Mail: felix@proviantomat.de

Unternehmensdaten:
USt-IdNr.: DE353967134
Steuernummer: 202/108/12994`
      };
    }

    // Create items list
    const itemsList = items.map((item: any, index: number) => 
      `${index + 1}. ${item.productName || 'Unbekanntes Produkt'} - ${item.quantity || 1} ${item.unit || 'Stk'} à ${(item.unitPrice || 0).toFixed(2)} € = ${(item.totalPrice || 0).toFixed(2)} €`
    ).join('\n');

    // Replace template variables
    let subject = template.subjectTemplate
      .replace(/{orderNumber}/g, order.orderNumber || '')
      .replace(/{deliveryDate}/g, order.deliveryDate || '')
      .replace(/{supplierName}/g, supplier.name || '');

    let content = template.contentTemplate
      .replace(/{orderNumber}/g, order.orderNumber || '')
      .replace(/{orderDate}/g, order.orderDate || '')
      .replace(/{deliveryDate}/g, order.deliveryDate || '')
      .replace(/{deliveryType}/g, order.deliveryType === 'pickup' ? 'Abholung' : 'Anlieferung')
      .replace(/{deliveryAddress}/g, order.deliveryAddress || `${order.warehouseName}\n${order.warehouseAddress}`)
      .replace(/{warehouseAddress}/g, order.warehouseAddress || '')
      .replace(/{warehouseName}/g, order.warehouseName || '')
      .replace(/{itemsList}/g, itemsList)
      .replace(/{netAmount}/g, order.netTotal || '0.00')
      .replace(/{vatAmount}/g, order.vatAmount || '0.00')
      .replace(/{totalAmount}/g, order.grossTotal || '0.00')
      .replace(/{supplierName}/g, supplier.name || '');

    res.json({
      success: true,
      subject,
      content,
      supplierEmail: supplier.email,
      ccEmails: supplier.ccEmails,
      bccEmails: supplier.bccEmails,
    });

  } catch (error) {
    console.error('Fehler beim Generieren der E-Mail:', error);
    res.status(500).json({ 
      error: 'Fehler beim Generieren der E-Mail',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;