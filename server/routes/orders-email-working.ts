import { Router, Request, Response } from 'express';
import { createTransport } from 'nodemailer';
import { db } from '../db';
import { orders, orderItems, suppliers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { createOrderPdf } from '../services/pdfService';

const router = Router();

// Interface for email attachments
interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

// Working email service with corrected SMTP configuration
function createEmailTransporter() {
  return createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // Use STARTTLS instead of SSL
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
      servername: process.env.SMTP_HOST
    }
  });
}

// Format currency as Euro
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

// Format date in German format
function formatDate(date: string | Date | null): string {
  if (!date) return '';
  try {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  } catch (error) {
    console.error('Fehler beim Formatieren des Datums:', error);
    return '';
  }
}

// Create HTML table for order items
function createOrderItemsTable(items: any[]): string {
  if (!items || items.length === 0) {
    return '<p>Keine Positionen in dieser Bestellung.</p>';
  }
  
  let tableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Artikel</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Artikelnummer</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Menge</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Einheit</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Einzelpreis</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Gesamtpreis</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  items.forEach((item) => {
    const unitPrice = item.unitPrice || 0;
    const quantity = item.quantity || 0;
    const totalPrice = unitPrice * quantity;
    
    tableHtml += `
      <tr>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.productName || 'Unbekanntes Produkt'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.sku || item.supplierSku || '-'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${quantity}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px;">${item.unit || 'Stk.'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(unitPrice)}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalPrice)}</td>
      </tr>
    `;
  });
  
  // Calculate totals
  const totalAmount = items.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 0)), 0);
  
  tableHtml += `
      </tbody>
      <tfoot>
        <tr style="font-weight: bold;">
          <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Gesamtbetrag (netto):</td>
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalAmount)}</td>
        </tr>
        <tr style="font-weight: bold;">
          <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">MwSt. (19%):</td>
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalAmount * 0.19)}</td>
        </tr>
        <tr style="font-weight: bold;">
          <td colspan="5" style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Gesamtbetrag (brutto):</td>
          <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${formatCurrency(totalAmount * 1.19)}</td>
        </tr>
      </tfoot>
    </table>
  `;
  
  return tableHtml;
}

// Create email template for an order
function createOrderEmailTemplate(order: any, supplier: any): string {
  const template = `
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Bestellung ${order.orderNumber}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Bestellung ${order.orderNumber}</h2>
          
          <p>Sehr geehrte Damen und Herren,</p>
          
          <p>hiermit bestellen wir folgende Artikel:</p>
          
          {{orderItems}}
          
          <div style="margin-top: 20px;">
            <p><strong>Bestelldetails:</strong></p>
            <ul>
              <li>Bestellnummer: ${order.orderNumber}</li>
              <li>Bestelldatum: ${formatDate(order.orderDate)}</li>
              <li>Lieferant: ${supplier.name || order.supplierName || 'Unbekannt'}</li>
              <li>Erwartetes Lieferdatum: ${formatDate(order.expectedDeliveryDate) || 'Nicht angegeben'}</li>
            </ul>
          </div>
          
          ${supplier.address || supplier.city || supplier.postalCode ? `
          <div style="margin-top: 20px;">
            <p><strong>Lieferantenadresse:</strong></p>
            <address style="font-style: normal; line-height: 1.4;">
              ${supplier.name || order.supplierName || 'Unbekannter Lieferant'}<br>
              ${supplier.address ? `${supplier.address}<br>` : ''}
              ${supplier.postalCode || supplier.city ? `${supplier.postalCode || ''} ${supplier.city || ''}<br>` : ''}
              ${supplier.country ? `${supplier.country}<br>` : ''}
              ${supplier.phone ? `Tel: ${supplier.phone}<br>` : ''}
              ${supplier.email ? `E-Mail: ${supplier.email}` : ''}
            </address>
          </div>
          ` : ''}
          
          <p>Bitte bestätigen Sie den Empfang dieser Bestellung und teilen Sie uns den voraussichtlichen Liefertermin mit.</p>
          
          <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
          
          <p>Mit freundlichen Grüßen<br>
          Ihr Proviantomat Team<br>
          E-Mail: ${process.env.SMTP_FROM || 'einkauf@proviantomat.de'}</p>
        </div>
      </body>
    </html>
  `;
  
  return template;
}

// Working email route for order sending
router.post('/:orderId/send-email-working', async (req: Request, res: Response) => {
  console.log('[WorkingOrderEmail] Order email send request started');
  console.log('[WorkingOrderEmail] Order ID:', req.params.orderId);
  console.log('[WorkingOrderEmail] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const orderId = parseInt(req.params.orderId);
    const { emailAddress, subject, content, usePdf, coverText } = req.body;
    
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Bestell-ID'
      });
    }
    
    if (!emailAddress) {
      return res.status(400).json({
        success: false,
        error: 'Keine E-Mail-Adresse angegeben'
      });
    }
    
    console.log('[WorkingOrderEmail] Fetching order data...');
    
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
    console.log('[WorkingOrderEmail] Order found:', order.orderNumber);
    
    // Fetch supplier data
    let supplier = { name: order.supplierName || 'Unbekannter Lieferant' };
    
    if (order.supplierId) {
      const supplierResult = await db
        .select({
          id: suppliers.id,
          name: suppliers.name,
          address: suppliers.address,
          city: suppliers.city,
          postalCode: suppliers.postalCode,
          country: suppliers.country,
          phone: suppliers.phone,
          email: suppliers.email
        })
        .from(suppliers)
        .where(eq(suppliers.id, order.supplierId))
        .limit(1);
      
      if (supplierResult && supplierResult.length > 0) {
        supplier = supplierResult[0];
      }
    }
    
    // Fetch order items
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    console.log(`[WorkingOrderEmail] Found ${items.length} order items`);
    
    // Create email content and handle PDF attachment
    let emailContent = content;
    let attachments: Attachment[] = [];
    
    if (usePdf) {
      console.log('[WorkingOrderEmail] PDF attachment requested, generating PDF...');
      
      try {
        // Generate PDF
        const pdfBuffer = await createOrderPdf(orderId);
        
        // Add PDF as attachment
        attachments.push({
          filename: `Bestellung_${order.orderNumber || orderId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        });
        
        // Use cover text if provided, otherwise create a simple cover message
        emailContent = coverText || `
          <p>Sehr geehrte Damen und Herren,</p>
          <p>anbei erhalten Sie unsere Bestellung ${order.orderNumber || orderId} als PDF-Anhang.</p>
          <p>Bitte bestätigen Sie den Empfang und teilen Sie uns den voraussichtlichen Liefertermin mit.</p>
          <p>Mit freundlichen Grüßen<br>
          Ihr Proviantomat Team</p>
        `;
        
        console.log('[WorkingOrderEmail] PDF generated and attached successfully');
      } catch (error) {
        console.error('[WorkingOrderEmail] Error generating PDF:', error);
        throw new Error('PDF konnte nicht generiert werden: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
      }
    } else {
      // Standard HTML email content
      if (!emailContent) {
        emailContent = createOrderEmailTemplate(order, supplier);
      }
      
      // Insert order items table
      const itemsTable = createOrderItemsTable(items);
      emailContent = emailContent.replace('{{orderItems}}', itemsTable);
    }
    
    // Create email subject
    let emailSubject = subject;
    
    if (!emailSubject) {
      emailSubject = `Bestellung ${order.orderNumber} - ${order.supplierName || supplier.name}`;
    }
    
    console.log('[WorkingOrderEmail] Creating email transporter...');
    
    // Create transporter and send email
    const transporter = createEmailTransporter();
    
    // Verify SMTP connection
    await transporter.verify();
    console.log('[WorkingOrderEmail] SMTP connection verified');
    
    const mailOptions: any = {
      from: process.env.SMTP_FROM || 'einkauf@proviantomat.de',
      to: emailAddress,
      subject: emailSubject,
      html: emailContent
    };
    
    // Add attachments if present
    if (attachments.length > 0) {
      mailOptions.attachments = attachments.map(attachment => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType
      }));
    }
    
    console.log('[WorkingOrderEmail] Sending email...');
    const result = await transporter.sendMail(mailOptions);
    
    console.log(`[WorkingOrderEmail] Email sent successfully, Message ID: ${result.messageId}`);
    
    return res.json({
      success: true,
      message: 'E-Mail erfolgreich gesendet',
      messageId: result.messageId,
      orderNumber: order.orderNumber
    });
    
  } catch (error: any) {
    console.error('[WorkingOrderEmail] Error sending order email:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler beim Senden der E-Mail'
    });
  }
});

// Test route for SMTP configuration
router.get('/test-smtp', async (req: Request, res: Response) => {
  console.log('[WorkingOrderEmail] SMTP test requested');
  
  try {
    const transporter = createEmailTransporter();
    
    // Test connection
    await transporter.verify();
    console.log('[WorkingOrderEmail] SMTP connection test successful');
    
    return res.json({
      success: true,
      message: 'SMTP-Verbindung erfolgreich getestet',
      configuration: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        from: process.env.SMTP_FROM || 'einkauf@proviantomat.de'
      }
    });
    
  } catch (error: any) {
    console.error('[WorkingOrderEmail] SMTP test failed:', error);
    return res.status(500).json({
      success: false,
      error: `SMTP-Test fehlgeschlagen: ${error.message}`
    });
  }
});

export default router;