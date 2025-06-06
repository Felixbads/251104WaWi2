import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import nodemailer from 'nodemailer';

const router = Router();

// Enhanced email template generator with proper variable replacement
router.get('/orders/:id/email-template-complete', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    console.log(`🔧 Generiere vollständige E-Mail-Vorlage für Bestellung ${orderId}`);

    // Get complete order data with all related information
    const orderResult = await pool.query(`
      SELECT 
        o.*,
        s.name as supplier_name,
        s.email as supplier_email,
        s.contact_person,
        s.phone,
        w.name as warehouse_name,
        w.address as warehouse_address,
        w.city as warehouse_city,
        w.postal_code as warehouse_postal_code
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN warehouses w ON o.warehouse_id = w.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const orderData = orderResult.rows[0];
    console.log('📋 Bestellungsdaten:', {
      orderNumber: orderData.order_number,
      supplierId: orderData.supplier_id,
      supplierName: orderData.supplier_name,
      supplierEmail: orderData.supplier_email
    });

    // Get order items with complete product information
    const itemsResult = await pool.query(`
      SELECT 
        oi.*,
        p.product_name,
        p.unit_size,
        p.package_size,
        p.deposit_per_unit,
        p.purchase_price,
        p.vat_rate as product_vat_rate
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      ORDER BY oi.position_number, oi.id
    `, [orderId]);

    const items = itemsResult.rows;
    console.log(`📦 ${items.length} Bestellpositionen gefunden`);

    // Load supplier-specific email template
    let customTemplate = null;
    if (orderData.supplier_id) {
      try {
        const templateResult = await pool.query(`
          SELECT * FROM supplier_email_templates
          WHERE supplier_id = $1 AND is_default = true AND template_type = 'standard'
          ORDER BY updated_at DESC
          LIMIT 1
        `, [orderData.supplier_id]);
        
        if (templateResult.rows.length > 0) {
          customTemplate = templateResult.rows[0];
          console.log('📧 Lieferantenspezifische Vorlage gefunden:', customTemplate.template_name);
        }
      } catch (error) {
        console.warn('⚠️ Fehler beim Laden der Lieferantenvorlage:', error);
      }
    }

    // Calculate totals with proper tax handling
    let totalNet = 0;
    let totalVat = 0;
    let totalPfand = 0;

    const processedItems = items.map(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const vatRate = parseFloat(item.vat_rate || item.product_vat_rate) || 19;
      const depositPerUnit = parseFloat(item.deposit_per_unit) || 0;
      
      const lineTotal = quantity * unitPrice;
      const lineVat = lineTotal * (vatRate / 100);
      const lineDeposit = quantity * depositPerUnit;
      
      totalNet += lineTotal;
      totalVat += lineVat;
      totalPfand += lineDeposit;

      return {
        ...item,
        calculated: {
          quantity,
          unitPrice,
          lineTotal,
          lineVat,
          lineDeposit,
          vatRate
        }
      };
    });

    const totalGross = totalNet + totalVat;

    // Generate comprehensive product table
    const productTableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f5f5f5; border-bottom: 2px solid #ddd;">
            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Artikel</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Menge</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Einheit</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Einzelpreis</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Gesamt</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">MwSt.</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Pfand</th>
          </tr>
        </thead>
        <tbody>
          ${processedItems.map(item => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; border: 1px solid #ddd;">${item.product_name || item.product_name || 'Unbekanntes Produkt'}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${item.calculated.quantity}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${item.unit || 'Stk'}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.calculated.unitPrice.toFixed(2)} €</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.calculated.lineTotal.toFixed(2)} €</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.calculated.lineVat.toFixed(2)} €</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.calculated.lineDeposit.toFixed(2)} €</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background-color: #f9f9f9; font-weight: bold; border-top: 2px solid #ddd;">
            <td colspan="4" style="padding: 12px; border: 1px solid #ddd;">Summe Netto:</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${totalNet.toFixed(2)} €</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${totalVat.toFixed(2)} €</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${totalPfand.toFixed(2)} €</td>
          </tr>
          <tr style="background-color: #e8f4fd; font-weight: bold;">
            <td colspan="6" style="padding: 12px; border: 1px solid #ddd;">Gesamtsumme Brutto:</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${totalGross.toFixed(2)} €</td>
          </tr>
        </tfoot>
      </table>
    `;

    // Format dates
    const orderDate = new Date(orderData.order_date || orderData.created_at).toLocaleDateString('de-DE');
    const deliveryDate = orderData.expected_delivery_date 
      ? new Date(orderData.expected_delivery_date).toLocaleDateString('de-DE')
      : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE');

    // Build delivery address
    let deliveryAddress = '';
    if (orderData.delivery_type === 'pickup') {
      deliveryAddress = `${orderData.supplier_name || 'Lieferant'}\n[Abholung beim Lieferanten]`;
    } else {
      const addressParts = [
        orderData.warehouse_name || 'Lager',
        orderData.warehouse_address,
        orderData.warehouse_postal_code && orderData.warehouse_city ? 
          `${orderData.warehouse_postal_code} ${orderData.warehouse_city}` : 
          orderData.warehouse_city
      ].filter(Boolean);
      deliveryAddress = addressParts.join('\n');
    }

    let subject = '';
    let content = '';

    if (customTemplate) {
      // Use supplier-specific template with comprehensive variable replacement
      console.log('📧 Verwende lieferantenspezifische Vorlage');
      
      subject = customTemplate.subject_template || customTemplate.subjectTemplate || '';
      content = customTemplate.content_template || customTemplate.contentTemplate || '';
      
      // Define all possible template variables with safe fallbacks
      const templateVars = {
        // Order information
        '{orderNumber}': orderData.order_number || '',
        '{orderDate}': orderDate,
        '{deliveryDate}': deliveryDate,
        '{deliveryType}': orderData.delivery_type === 'pickup' ? 'Abholung' : 'Anlieferung',
        
        // Financial totals
        '{netAmount}': totalNet.toFixed(2),
        '{vatAmount}': totalVat.toFixed(2),
        '{totalAmount}': totalGross.toFixed(2),
        '{pfandAmount}': totalPfand.toFixed(2),
        '{vatRate}': '19',
        
        // Product information
        '{itemsList}': productTableHtml,
        '{productTable}': productTableHtml,
        '{{orderItems}}': productTableHtml,
        
        // Address information
        '{deliveryAddress}': deliveryAddress.replace(/\n/g, '<br>'),
        '{warehouseAddress}': deliveryAddress.replace(/\n/g, '<br>'),
        
        // Supplier information
        '{supplierName}': orderData.supplier_name || '',
        '{supplierNumber}': orderData.supplier_id?.toString() || '',
        
        // Company information
        '{companyName}': 'Elbsandstein Proviant & Quartier GmbH',
        '{companyAddress}': 'Seifhennersdorfer Straße 14<br>01099 Dresden',
        '{taxNumber}': 'DE353967134'
      };

      // Apply variable replacements with proper error handling
      for (const [placeholder, value] of Object.entries(templateVars)) {
        try {
          // Use regex for safe replacement
          const escapedPlaceholder = placeholder.replace(/[{}]/g, '\\$&');
          const regex = new RegExp(escapedPlaceholder, 'g');
          content = content.replace(regex, value || '');
          subject = subject.replace(regex, value || '');
        } catch (error) {
          console.warn(`⚠️ Template variable replacement failed for ${placeholder}:`, error);
          // Fallback to simple string replacement
          content = content.split(placeholder).join(value || '');
          subject = subject.split(placeholder).join(value || '');
        }
      }
    } else {
      // Use standard template
      console.log('📧 Verwende Standard-Vorlage');
      
      subject = `Bestellung ${orderData.order_number} – Lieferung am ${deliveryDate}`;
      content = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <h2>Bestellung ${orderData.order_number}</h2>
          
          <p>Sehr geehrte Damen und Herren,</p>
          
          <p>hiermit bestellen wir folgende Artikel:</p>
          
          <div style="margin: 20px 0;">
            <strong>Bestelldetails:</strong><br>
            Bestellnummer: ${orderData.order_number}<br>
            Bestelldatum: ${orderDate}<br>
            Gewünschter Liefertermin: ${deliveryDate}<br>
            Lieferart: ${orderData.delivery_type === 'pickup' ? 'Abholung' : 'Anlieferung'}
          </div>
          
          <div style="margin: 20px 0;">
            <strong>Lieferadresse:</strong><br>
            ${deliveryAddress.replace(/\n/g, '<br>')}
          </div>
          
          ${productTableHtml}
          
          <div style="margin: 20px 0;">
            <strong>Rechnungsadresse:</strong><br>
            Elbsandstein Proviant & Quartier GmbH<br>
            Seifhennersdorfer Straße 14<br>
            01099 Dresden<br>
            USt-IdNr.: DE353967134
          </div>
          
          <p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
          
          <p>Mit freundlichen Grüßen<br>
          Elbsandstein Proviant & Quartier GmbH</p>
        </div>
      `;
    }

    const response = {
      success: true,
      subject,
      content,
      supplierEmail: orderData.supplier_email || '',
      orderDetails: {
        orderNumber: orderData.order_number,
        orderDate,
        deliveryDate,
        totalAmount: totalGross.toFixed(2),
        netAmount: totalNet.toFixed(2),
        vatAmount: totalVat.toFixed(2),
        pfandAmount: totalPfand.toFixed(2),
        itemsCount: items.length,
        supplierName: orderData.supplier_name,
        warehouseName: orderData.warehouse_name
      },
      template: customTemplate ? {
        id: customTemplate.id,
        name: customTemplate.template_name,
        type: customTemplate.template_type
      } : null
    };

    console.log('✅ E-Mail-Vorlage erfolgreich generiert');
    res.json(response);

  } catch (error) {
    console.error('❌ Fehler beim Generieren der E-Mail-Vorlage:', error);
    res.status(500).json({ 
      error: 'Fehler beim Generieren der E-Mail-Vorlage',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Send email with complete template processing and status update
router.post('/orders/:id/send-email-complete', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const { to, cc, bcc, subject, content } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: 'Erforderliche E-Mail-Felder fehlen' });
    }

    console.log(`📧 Sende E-Mail für Bestellung ${orderId} an ${to}`);

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Prepare email options
    const mailOptions = {
      from: `"Elbsandstein Proviant & Quartier" <${process.env.SMTP_USER}>`,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      html: content,
      text: content.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    // Send email
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ E-Mail erfolgreich gesendet:', result.messageId);

    // Update order status from "draft" to "sent"
    await pool.query(`
      UPDATE orders 
      SET 
        status = CASE 
          WHEN status = 'draft' THEN 'sent'
          ELSE status
        END,
        updated_at = NOW()
      WHERE id = $1
    `, [orderId]);

    console.log(`✅ Bestellstatus für Bestellung ${orderId} aktualisiert`);

    res.json({
      success: true,
      message: 'E-Mail erfolgreich gesendet',
      messageId: result.messageId,
      statusUpdated: true
    });

  } catch (error) {
    console.error('❌ Fehler beim Senden der E-Mail:', error);
    res.status(500).json({ 
      error: 'Fehler beim Senden der E-Mail',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;