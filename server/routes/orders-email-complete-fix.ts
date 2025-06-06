import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { db } from '../db';
import { orders, orderItems, suppliers } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Configure SMTP transporter with STARTTLS
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.proviantomat.de',
  port: 587,
  secure: false, // Use STARTTLS
  requireTLS: true, // Force STARTTLS
  auth: {
    user: process.env.SMTP_USER || 'einkauf@proviantomat.de',
    pass: process.env.SMTP_PASS || 'EinkaufProviant2024!'
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

// Complete email sending route with all fixes
router.post('/:orderId/send-email', async (req: Request, res: Response) => {
  console.log('[CompleteEmailFix] Processing order email send request');
  console.log('[CompleteEmailFix] Order ID:', req.params.orderId);
  console.log('[CompleteEmailFix] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const orderId = parseInt(req.params.orderId);
    const { to, subject, content, cc } = req.body;
    
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Bestell-ID'
      });
    }
    
    if (!to || !to.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Keine gültige E-Mail-Adresse angegeben'
      });
    }
    
    // Content is optional - we'll generate if not provided
    
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
    console.log('[CompleteEmailFix] Order found:', order.orderNumber);
    
    // Fetch order items
    const itemsResult = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    
    const items = itemsResult || [];
    console.log('[CompleteEmailFix] Found', items.length, 'order items');
    
    // Create professional HTML email content
    const itemsList = items.map((item, index) => 
      `<tr>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">${index + 1}</td>
        <td style="border: 1px solid #ddd; padding: 12px;">${item.productName || 'Unbekanntes Produkt'}</td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">${item.quantity || 0}</td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${(item.unitPrice || 0).toFixed(2)} €</td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: right; font-weight: bold;">${((item.unitPrice || 0) * (item.quantity || 0)).toFixed(2)} €</td>
      </tr>`
    ).join('');
    
    const totalAmount = items.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 0)), 0);
    const vatRate = 19; // 19% VAT
    const vatAmount = totalAmount * (vatRate / 100);
    const totalWithVat = totalAmount + vatAmount;
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bestellung ${order.orderNumber}</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container { 
            background: white; 
            padding: 30px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header { 
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
            color: white; 
            padding: 20px; 
            border-radius: 8px 8px 0 0; 
            margin: -30px -30px 30px -30px;
        }
        .header h1 { 
            margin: 0; 
            font-size: 24px; 
            font-weight: 600;
        }
        .info-box { 
            background-color: #f1f5f9; 
            padding: 20px; 
            border-radius: 6px; 
            margin: 25px 0; 
            border-left: 4px solid #2563eb;
        }
        .info-table { 
            width: 100%; 
            border-collapse: collapse; 
        }
        .info-table td { 
            padding: 8px 0; 
            vertical-align: top;
        }
        .info-table td:first-child { 
            font-weight: 600; 
            width: 180px; 
            color: #374151;
        }
        .items-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 25px 0; 
            font-size: 14px;
        }
        .items-table th { 
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); 
            padding: 15px 12px; 
            text-align: left; 
            font-weight: 600; 
            color: #374151; 
            border: 1px solid #d1d5db;
        }
        .items-table td { 
            padding: 12px; 
            border: 1px solid #d1d5db;
        }
        .items-table tr:nth-child(even) { 
            background-color: #f9fafb;
        }
        .totals-section { 
            margin-top: 30px; 
            padding: 20px; 
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); 
            border-radius: 6px; 
            border: 1px solid #e2e8f0;
        }
        .total-row { 
            display: flex; 
            justify-content: space-between; 
            margin: 8px 0; 
            font-size: 16px;
        }
        .total-row.final { 
            font-weight: bold; 
            font-size: 18px; 
            color: #1f2937; 
            padding-top: 12px; 
            border-top: 2px solid #2563eb; 
            margin-top: 15px;
        }
        .note-box { 
            background: #fef3c7; 
            border: 1px solid #f59e0b; 
            padding: 18px; 
            border-radius: 6px; 
            margin: 25px 0;
        }
        .note-box p { 
            margin: 0; 
            font-weight: 600; 
            color: #92400e;
        }
        .footer { 
            margin-top: 40px; 
            padding-top: 25px; 
            border-top: 2px solid #e5e7eb; 
            color: #6b7280; 
            font-size: 14px;
        }
        .company-info { 
            margin-top: 20px; 
            font-weight: 600; 
            color: #374151;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Bestellung ${order.orderNumber}</h1>
        </div>
        
        <p style="font-size: 16px; margin-bottom: 25px;">Sehr geehrte Damen und Herren,</p>
        
        <p style="font-size: 16px; margin-bottom: 25px;">hiermit bestellen wir bei Ihnen folgende Artikel:</p>
        
        <div class="info-box">
            <table class="info-table">
                <tr>
                    <td>Bestellnummer:</td>
                    <td><strong>${order.orderNumber}</strong></td>
                </tr>
                <tr>
                    <td>Lieferant:</td>
                    <td><strong>${order.supplierName || 'Nicht angegeben'}</strong></td>
                </tr>
                <tr>
                    <td>Bestelldatum:</td>
                    <td><strong>${new Date(order.createdAt).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></td>
                </tr>
                ${order.expectedDeliveryDate ? `
                <tr>
                    <td>Gewünschte Lieferung:</td>
                    <td><strong>${new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></td>
                </tr>` : ''}
                <tr>
                    <td>Lieferart:</td>
                    <td><strong>Anlieferung</strong></td>
                </tr>
            </table>
        </div>
        
        <h3 style="color: #2563eb; margin-top: 35px; margin-bottom: 20px; font-size: 20px;">Bestellpositionen:</h3>
        
        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 60px; text-align: center;">Pos.</th>
                    <th>Artikel</th>
                    <th style="width: 80px; text-align: center;">Menge</th>
                    <th style="width: 100px; text-align: right;">Einzelpreis</th>
                    <th style="width: 120px; text-align: right;">Gesamtpreis</th>
                </tr>
            </thead>
            <tbody>
                ${itemsList}
            </tbody>
        </table>
        
        <div class="totals-section">
            <h4 style="margin-top: 0; color: #374151; font-size: 18px;">Kostenübersicht:</h4>
            <div class="total-row">
                <span>Nettosumme:</span>
                <span><strong>${totalAmount.toFixed(2)} €</strong></span>
            </div>
            <div class="total-row">
                <span>zzgl. ${vatRate}% MwSt.:</span>
                <span><strong>${vatAmount.toFixed(2)} €</strong></span>
            </div>
            <div class="total-row final">
                <span>Gesamtbetrag (brutto):</span>
                <span>${totalWithVat.toFixed(2)} €</span>
            </div>
        </div>
        
        <div class="note-box">
            <p>Bitte bestätigen Sie uns den Erhalt dieser Bestellung sowie den geplanten Liefertermin.</p>
        </div>
        
        <p style="font-size: 16px; margin-top: 30px;">Für Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
        
        <div class="footer">
            <p style="margin: 0;">Mit freundlichen Grüßen</p>
            <div class="company-info">
                <p style="margin: 10px 0 0 0;">Ihr Proviantomat Team</p>
                <p style="margin: 5px 0;">Elbsandstein Proviant & Quartier GmbH</p>
                <p style="margin: 5px 0;">Seifhennersdorfer Straße 14, 01099 Dresden</p>
                <p style="margin: 5px 0;">E-Mail: ${process.env.SMTP_FROM || 'einkauf@proviantomat.de'}</p>
            </div>
        </div>
    </div>
</body>
</html>`;
    
    // Setup email options with CC support
    const mailOptions: any = {
      from: process.env.SMTP_FROM || 'einkauf@proviantomat.de',
      to: to,
      subject: subject || `Bestellung ${order.orderNumber} - ${order.supplierName || 'Lieferant'}`,
      html: htmlContent
    };
    
    // Add CC if provided
    if (cc && cc.includes('@')) {
      mailOptions.cc = cc;
      console.log('[CompleteEmailFix] Adding CC recipient:', cc);
    }
    
    console.log('[CompleteEmailFix] Sending email with HTML content...');
    const result = await transporter.sendMail(mailOptions);
    console.log('[CompleteEmailFix] Email sent successfully, Message ID:', result.messageId);
    
    // Update order status to "sent" if currently "draft"
    if (order.status === 'draft') {
      console.log('[CompleteEmailFix] Updating order status to "sent"...');
      
      // Parse existing status history
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
        console.error("Fehler beim Parsen der Statushistorie:", parseError);
        currentHistory = [];
      }
      
      // Add new status entry
      const newStatusEntry = {
        status: "sent",
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
      recipient: to,
      cc: cc || null,
      statusUpdated: order.status === 'draft'
    });
    
  } catch (error: any) {
    console.error('[CompleteEmailFix] Error sending email:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden der E-Mail',
      details: error.message || 'Unbekannter Fehler'
    });
  }
});

export default router;