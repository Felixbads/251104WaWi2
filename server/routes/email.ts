import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { orders, orderItems, suppliers, warehouses, products } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { sendEmail, generateDefaultEmailTemplate, generateDefaultSubject, formatOrderDate } from '../utils/emailService';

const router = Router();

// Email sending schema
const sendOrderEmailSchema = z.object({
  orderId: z.number(),
  to: z.string().email("Ungültige E-Mail-Adresse"),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().min(1, "Betreff ist erforderlich"),
  htmlContent: z.string().optional(),
  useTemplate: z.boolean().default(true),
  templateId: z.number().optional(),
});

// Send order email endpoint
router.post('/send-order-email', async (req: Request, res: Response) => {
  try {
    const emailData = sendOrderEmailSchema.parse(req.body);
    
    // Get order details with related data
    const [order] = await db.select().from(orders).where(eq(orders.id, emailData.orderId));
    
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    // Get order items with product details
    const items = await db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        vatRate: orderItems.vatRate,
        productName: products.productName,
        packageSize: products.packageSize,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, emailData.orderId));

    // Get supplier details
    let supplier = null;
    if (order.supplierId) {
      [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, order.supplierId));
    }

    // Get warehouse details
    let warehouse = null;
    if (order.locationId) {
      [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, order.locationId));
    }

    // Generate email content
    let htmlContent = emailData.htmlContent;
    
    if (emailData.useTemplate && !htmlContent) {
      // Use selected template if available
      if (emailData.templateId) {
        try {
          const { supplierEmailTemplates } = await import('../../shared/schema');
          const [selectedTemplate] = await db
            .select()
            .from(supplierEmailTemplates)
            .where(eq(supplierEmailTemplates.id, emailData.templateId));
          
          if (selectedTemplate) {
            // Create product table HTML
            const productTableRows = items.map(item => `
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.quantity || 0}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.productName || 'Unbekanntes Produkt'}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${(item.unitPrice || 0).toFixed(2)} €</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${(item.totalPrice || 0).toFixed(2)} €</td>
              </tr>
            `).join('');
            
            const productTable = `
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                  <tr style="background-color: #f5f5f5;">
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Menge</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Artikel</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Einzelpreis</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Gesamtpreis</th>
                  </tr>
                </thead>
                <tbody>
                  ${productTableRows}
                </tbody>
              </table>
            `;
            
            const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
            
            htmlContent = selectedTemplate.contentTemplate
              .replace(/\{orderNumber\}/g, order.orderNumber || order.id.toString())
              .replace(/\{orderDate\}/g, formatOrderDate(new Date(order.orderDate)))
              .replace(/\{deliveryDate\}/g, order.expectedDeliveryDate ? formatOrderDate(new Date(order.expectedDeliveryDate)) : 'Nicht angegeben')
              .replace(/\{supplierName\}/g, supplier?.name || order.supplierName || 'Unbekannter Lieferant')
              .replace(/\{productTable\}/g, productTable)
              .replace(/\{totalAmount\}/g, totalAmount.toFixed(2))
              .replace(/\{warehouseName\}/g, warehouse?.name || 'Nicht angegeben')
              .replace(/\{notes\}/g, order.notes || '');
          }
        } catch (error) {
          console.error('Fehler beim Laden der E-Mail-Vorlage:', error);
        }
      }
      
      // Fallback to default template if no custom template was found
      if (!htmlContent) {
        htmlContent = generateDefaultEmailTemplate({
          order,
          orderItems: items,
          warehouse,
          supplier
        });
      }
    }

    // Default from email
    const fromEmail = 'einkauf@proviantomat.de';
    
    // Default CC emails
    let ccEmails = 'andreas@proviantomat.de,einkauf@proviantomat.de';
    if (emailData.cc) {
      ccEmails = emailData.cc;
    }

    // Send email
    const emailSent = await sendEmail({
      to: emailData.to,
      cc: ccEmails,
      bcc: emailData.bcc,
      from: fromEmail,
      subject: emailData.subject,
      html: htmlContent,
    });

    if (emailSent) {
      // Update order status to indicate email was sent
      await db
        .update(orders)
        .set({ 
          status: 'sent',
          updatedAt: new Date()
        })
        .where(eq(orders.id, emailData.orderId));

      res.json({ 
        success: true, 
        message: 'E-Mail erfolgreich gesendet'
      });
    } else {
      res.status(500).json({ 
        error: 'Fehler beim Senden der E-Mail'
      });
    }

  } catch (error) {
    console.error('Email sending error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Ungültige E-Mail-Daten', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Interner Serverfehler beim Senden der E-Mail',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get email template for supplier
router.get('/supplier-template/:supplierId', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({ error: 'Ungültige Lieferanten-ID' });
    }

    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
    
    if (!supplier) {
      return res.status(404).json({ error: 'Lieferant nicht gefunden' });
    }

    res.json({
      emailTemplate: supplier.emailTemplate || '',
      emailSubjectTemplate: supplier.emailSubjectTemplate || '',
      orderEmailRecipient: supplier.orderEmailRecipient || supplier.email || '',
      orderEmailCc: supplier.orderEmailCc || 'andreas@proviantomat.de,einkauf@proviantomat.de',
      orderEmailBcc: supplier.orderEmailBcc || '',
      emailSignature: supplier.emailSignature || '',
    });

  } catch (error) {
    console.error('Error fetching supplier template:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der E-Mail-Vorlage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Generate default subject with order date
router.post('/generate-subject', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Bestell-ID ist erforderlich' });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const subject = generateDefaultSubject(new Date(order.orderDate));
    
    res.json({ subject });

  } catch (error) {
    console.error('Error generating subject:', error);
    res.status(500).json({ 
      error: 'Fehler beim Generieren des Betreffs',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;