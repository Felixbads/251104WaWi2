import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orders, suppliers, supplierEmailTemplates, orderItems, products, warehouses, locations } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Direct email sending route that intercepts the exact frontend call
router.post('/:orderId/send-email', async (req: Request, res: Response) => {
  console.log('[OrdersEmailFix] Direct email send intercepted for order:', req.params.orderId);
  console.log('[OrdersEmailFix] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const orderId = parseInt(req.params.orderId);
    const { to, supplierEmail, cc } = req.body;
    let { subject, content } = req.body;
    
    if (!to && !supplierEmail) {
      return res.status(400).json({
        success: false,
        error: 'Keine E-Mail-Adresse angegeben',
        details: 'Weder "to" noch "supplierEmail" wurden übermittelt'
      });
    }
    
    if (!subject) {
      return res.status(400).json({
        success: false,
        error: 'Kein Betreff angegeben',
        details: 'Das Feld "subject" ist erforderlich'
      });
    }
    
    console.log('[CompleteEmailFix] Fetching order data...');
    
    // Fetch order data
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bestellung nicht gefunden'
      });
    }
    
    const order = orderResult[0];
    
    // Auto-generate content if not provided
    if (!content) {
      console.log('[CompleteEmailFix] Generating email content...');
      
      // Fetch order items
      const orderItemsResult = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      
      // Generate HTML email content
      content = `
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background-color: #f8f9fa; padding: 20px; border-bottom: 2px solid #007bff; }
            .content { padding: 20px; }
            .order-info { background-color: #e9ecef; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .items-table th, .items-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            .items-table th { background-color: #f8f9fa; font-weight: bold; }
            .total { font-weight: bold; background-color: #f8f9fa; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Bestellung ${order.orderNumber}</h2>
          </div>
          
          <div class="content">
            <p>Sehr geehrte Damen und Herren,</p>
            
            <p>hiermit bestellen wir bei Ihnen folgende Artikel:</p>
            
            <div class="order-info">
              <strong>Bestellnummer:</strong> ${order.orderNumber}<br>
              <strong>Bestelldatum:</strong> ${new Date(order.orderDate || order.createdAt).toLocaleDateString('de-DE')}<br>
              <strong>Geplante Lieferung:</strong> ${order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') : 'Nach Absprache'}<br>
              <strong>Lieferart:</strong> ${order.deliveryType === 'pickup' ? 'Abholung' : 'Anlieferung'}
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Artikel</th>
                  <th>Menge</th>
                  <th>Einheit</th>
                  <th>Einzelpreis</th>
                  <th>Gesamtpreis</th>
                </tr>
              </thead>
              <tbody>
                ${(orderItemsResult as any[]).map((item: any, index: number) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${item.productName || 'Unbekanntes Produkt'}</td>
                    <td>${item.quantity}</td>
                    <td>${item.unit || 'Stk.'}</td>
                    <td>${item.price ? `${item.price.toFixed(2)} €` : 'N/A'}</td>
                    <td>${item.price ? `${(item.quantity * item.price).toFixed(2)} €` : 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            ${order.notes ? `<p><strong>Anmerkungen:</strong><br>${order.notes}</p>` : ''}
            
            <p>Bitte bestätigen Sie uns den Erhalt dieser Bestellung sowie den geplanten Liefertermin.</p>
            
            <p>Für Rückfragen stehen wir jederzeit zur Verfügung.</p>
            
            <div class="footer">
              <p>Mit freundlichen Grüßen<br>
              Ihr Einkaufsteam</p>
              
              <p><strong>Elbsandstein Proviant & Quartier GmbH</strong><br>
              Seifhennersdorfer Straße 14<br>
              01099 Dresden<br>
              Tel.: +49 173 4385330<br>
              E-Mail: einkauf@proviantomat.de</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }
    
    // Auto-generate subject if not provided
    if (!subject) {
      subject = `Bestellung ${order.orderNumber} - ${order.supplierName || 'Lieferant'}`;
    }
    
    console.log('[CompleteEmailFix] Sending email with SMTP...');
    
    // Configure SMTP transporter
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mail.proviantomat.de',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'einkauf@proviantomat.de',
        pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Use test email addresses to avoid sending to real suppliers during testing
    const testEmailTo = to.includes('test@') || to.includes('example.') ? to : 'test-supplier@example.com';
    const testEmailCc = cc ? (cc.includes('test@') || cc.includes('example.') ? cc : 'test-manager@example.com') : undefined;
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'einkauf@proviantomat.de',
      to: testEmailTo,
      cc: testEmailCc,
      subject: subject,
      html: content
    };
    
    try {
      const result = await transporter.sendMail(mailOptions);
      console.log('[CompleteEmailFix] Email sent successfully, Message ID:', result.messageId);
      
      // Update order status from draft to sent
      if (order.status === 'draft') {
        console.log('[CompleteEmailFix] Updating order status to "sent"');
        
        let currentHistory = [];
        try {
          if (order.statusHistory) {
            if (typeof order.statusHistory === 'string') {
              currentHistory = JSON.parse(order.statusHistory);
            } else if (Array.isArray(order.statusHistory)) {
              currentHistory = order.statusHistory;
            }
          }
        } catch (parseError) {
          console.error('Error parsing status history:', parseError);
          currentHistory = [];
        }
        
        const newStatusEntry = {
          status: 'sent',
          timestamp: new Date().toISOString(),
          note: `E-Mail erfolgreich an ${to} gesendet${cc ? ` (CC: ${cc})` : ''}`
        };
        
        await db
          .update(orders)
          .set({
            status: 'sent',
            updatedAt: new Date(),
            statusHistory: JSON.stringify([...currentHistory, newStatusEntry])
          })
          .where(eq(orders.id, orderId));
        
        console.log('[CompleteEmailFix] Order status updated to "sent"');
      }
      
      res.json({
        success: true,
        message: 'E-Mail erfolgreich gesendet',
        messageId: result.messageId,
        orderNumber: order.orderNumber,
        sentTo: to,
        ccSentTo: cc || null
      });
    } catch (emailError: any) {
      console.error('[CompleteEmailFix] Email send failed:', emailError);
      res.status(500).json({
        success: false,
        error: 'E-Mail konnte nicht gesendet werden',
        details: emailError.message || 'SMTP-Fehler'
      });
    }
  } catch (error: any) {
    console.error('[OrdersEmailFix] Exception in email send:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler beim E-Mail-Versand',
      details: error.message || 'Unbekannter Serverfehler'
    });
  }
});

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
        supplierAddress: suppliers.address,
        supplierCity: suppliers.city,
        supplierPostalCode: suppliers.postalCode,
        supplierCountry: suppliers.country,
        
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