import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startAutomaticSync } from "./scheduler";
import { reconcileWarehouseProducts } from "./services/warehouseReconciliation";
// Import für Warehouse Storage entfernt, wird derzeit nicht benötigt für den Start
import fileUpload from "express-fileupload";
import WebSocket from 'ws';
import http from 'http';
import inventoryApiRouter from './routes/inventory-api';
import inventoryRouter from './routes/inventory';
import mailTemplatesRouter from './routes/mail-templates';
import simpleEmailRouter from './routes/simple-email';
import dbDirectRouter from './routes/db-direct';
import directSqlRouter from './routes/direct-sql';
import orderV3Router from './routes/order-v3';
import ordersV4Router from './routes/orders-v4';
import inventoryBatchesRouter from './routes/inventory-batches.js';
import inventoryCountBatchesRouter from './routes/inventory-count-batches';
import emailRouter from './routes/email';
import supplierEmailTemplatesRouter from './routes/supplier-email-templates';
import emailTemplateFixRouter from './routes/email-template-fix';
import enhancedEmailRouter from './routes/enhanced-email';
import ordersEmailCompleteFixRouter from './routes/orders-email-complete-fix';
import emailCompleteFixRouter from './routes/email-complete-fix';
import emailWorkingRouter from './routes/email-working';
import emailBypassRouter from './routes/email-bypass';
import emailDebugRouter from './routes/email-debug';
import rawEmailRouter from './routes/raw-email';
import criticalInventoryRouter from './routes/critical-inventory';
import removedProductsRouter from './routes/removed-products';
import criticalInventoryWorkingRouter from './routes/critical-inventory-working';
import criticalInventoryFinalRouter from './routes/critical-inventory-final';
import inventoryHealthRouter from './routes/inventory-health';
import locationAnalysisRouter from './routes/location-analysis';
import weatherRouter from './routes/weather.js';
import supplierAnalyticsRouter from './routes/supplier-analytics';
import { pool } from './db';
import { db } from './db';
import { orders } from '../shared/schema';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Konfiguriere den File-Upload-Handler mit angepassten Optionen
app.use(fileUpload() as any);

// HINWEIS: Der direkte SQL-Endpunkt für BestellungV3 wurde in eine separate Route-Datei verschoben: server/routes/order-v3.ts

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Setze explizit den Content-Type für API-Anfragen
  if (req.path.startsWith('/api')) {
    res.setHeader('Content-Type', 'application/json');
  }

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// UMGEHUNG: Völlig separater Pfad außerhalb von /api
app.get('/orders-data', (req, res) => {
  console.log('🎯 SEPARATE BESTELLUNGSROUTE AUFGERUFEN');
  
  pool.query(`
    SELECT 
      o.id, 
      o.order_number, 
      o.status, 
      o.created_at,
      COALESCE(s.name, 'Kein Lieferant') as supplier_name,
      COALESCE(w.name, 'Kein Lager') as location_name,
      COALESCE(
        (SELECT SUM(oi.quantity * oi.unit_price) 
         FROM order_items oi 
         WHERE oi.order_id = o.id),
        0
      ) as total_amount,
      o.expected_delivery_date
    FROM orders o
    LEFT JOIN suppliers s ON o.supplier_id = s.id
    LEFT JOIN warehouses w ON o.warehouse_id = w.id
    ORDER BY o.id DESC 
    LIMIT 15
  `).then(result => {
    console.log(`🎯 ${result.rows.length} Bestellungen über separate Route`);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(result.rows));
  }).catch(error => {
    console.error('❌ DB-Fehler separate Route:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Datenbankfehler', 
      message: error instanceof Error ? error.message : 'Unbekannt' 
    }));
  });
});

(async () => {

  // SQL-Direktzugriff-Endpunkte für Datenbankabfragen
  app.get('/api/sql-orders', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      return res.json(result.rows);
    } catch (error) {
      console.error('Fehler beim SQL-Abrufen der Bestellungen:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });

  app.get('/api/sql-warehouses', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM warehouses WHERE is_active = true ORDER BY name');
      return res.json(result.rows);
    } catch (error) {
      console.error('Fehler beim SQL-Abrufen der Lager:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });
  
  app.get('/api/sql-orders', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      return res.json(result.rows);
    } catch (error) {
      console.error('Fehler beim SQL-Abrufen der Bestellungen:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });
  
  app.get('/api/sql-suppliers', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM suppliers WHERE is_active = true ORDER BY name');
      return res.json(result.rows);
    } catch (error) {
      console.error('Fehler beim SQL-Abrufen der Lieferanten:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });

  // Orders-Data Endpunkt für die Bestellungsübersicht mit vollständigen Daten
  app.get('/orders-data', async (req, res) => {
    try {
      console.log('GET /orders-data - Lade alle Bestellungen mit vollständigen Daten...');
      
      const result = await pool.query(`
        SELECT 
          o.*,
          s.name as supplier_name,
          s.email as supplier_email,
          s.phone as supplier_phone,
          s.address as supplier_address,
          w.name as warehouse_name,
          w.address as warehouse_address,
          COALESCE(
            (SELECT SUM(oi.total_price) FROM order_items oi WHERE oi.order_id = o.id),
            0
          ) as calculated_total_amount
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        LEFT JOIN warehouses w ON o.warehouse_id = w.id
        ORDER BY o.created_at DESC
      `);
      
      // Format data for frontend consumption with proper field mapping
      const formattedData = result.rows.map(order => ({
        ...order,
        // Ensure both camelCase and snake_case fields are available for compatibility
        supplierName: order.supplier_name || 'Unbekannter Lieferant',
        supplier_name: order.supplier_name || 'Unbekannter Lieferant',
        supplierEmail: order.supplier_email || '',
        supplier_email: order.supplier_email || '',
        warehouseName: order.warehouse_name || 'Unbekanntes Lager',
        warehouse_name: order.warehouse_name || 'Unbekanntes Lager',
        totalAmount: order.calculated_total_amount || order.total_amount || 0,
        total_amount: order.calculated_total_amount || order.total_amount || 0,
        // Format dates for display
        orderDate: order.order_date || order.created_at,
        order_date: order.order_date || order.created_at,
        expectedDeliveryDate: order.expected_delivery_date,
        expected_delivery_date: order.expected_delivery_date
      }));
      
      console.log(`${formattedData.length} Bestellungen mit vollständigen Daten geladen`);
      return res.json(formattedData);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellungsdaten:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });

  // Order Items Endpunkt mit korrekten Preisdaten
  app.get('/api/orders/:id/items', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      console.log(`GET /api/orders/${orderId}/items - Lade Bestellpositionen mit korrekten Preisen...`);
      
      const result = await pool.query(`
        SELECT 
          oi.*,
          p.product_name,
          p.units as product_unit,
          COALESCE(oi.unit_price, 0) as unit_price,
          COALESCE(oi.total_price, oi.quantity * COALESCE(oi.unit_price, 0)) as total_price
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `, [orderId]);
      
      // Format data for frontend consumption with proper field mapping
      const formattedItems = result.rows.map(item => ({
        ...item,
        // Ensure both camelCase and snake_case fields are available
        productName: item.product_name || `Produkt-ID ${item.product_id}`,
        product_name: item.product_name || `Produkt-ID ${item.product_id}`,
        unitPrice: parseFloat(item.unit_price || 0),
        unit_price: parseFloat(item.unit_price || 0),
        totalPrice: parseFloat(item.total_price || 0),
        total_price: parseFloat(item.total_price || 0),
        unit: item.product_unit || item.unit || 'Stk'
      }));
      
      console.log(`${formattedItems.length} Bestellpositionen mit Preisdaten geladen`);
      return res.json(formattedItems);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellpositionen:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });

  // Email Template Endpunkt mit echten Lieferantendaten
  app.get('/api/orders/:id/email-template', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const templateType = req.query.type || 'standard';
      console.log(`GET /api/orders/${orderId}/email-template - Generiere E-Mail-Vorlage...`);
      
      // Bestellung mit Lieferantendaten laden
      const orderResult = await pool.query(`
        SELECT 
          o.*,
          s.name as supplier_name,
          s.email as supplier_email,
          s.phone as supplier_phone,
          s.address as supplier_address
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        WHERE o.id = $1
      `, [orderId]);
      
      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Bestellung nicht gefunden' });
      }
      
      const order = orderResult.rows[0];
      
      // Bestellpositionen mit korrekten Preisen laden
      const itemsResult = await pool.query(`
        SELECT 
          oi.*,
          p.product_name,
          p.units as product_unit,
          COALESCE(oi.unit_price, 0) as unit_price,
          COALESCE(oi.total_price, oi.quantity * COALESCE(oi.unit_price, 0)) as total_price
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `, [orderId]);
      
      // E-Mail-Vorlage basierend auf Typ generieren
      let subject = '';
      let content = '';
      
      const supplierName = order.supplier_name || 'Sehr geehrte Damen und Herren';
      const orderNumber = order.order_number || `#${order.id}`;
      const orderDate = new Date(order.created_at).toLocaleDateString('de-DE');
      const deliveryDate = order.expected_delivery_date ? 
        new Date(order.expected_delivery_date).toLocaleDateString('de-DE') : 
        'Noch nicht festgelegt';
      
      // Bestellpositionen formatieren
      let itemsList = '';
      let totalAmount = 0;
      
      itemsResult.rows.forEach(item => {
        const unitPrice = parseFloat(item.unit_price || 0);
        const quantity = parseInt(item.quantity || 1);
        const itemTotal = quantity * unitPrice;
        totalAmount += itemTotal;
        
        const productName = item.product_name || `Produkt-ID ${item.product_id}`;
        const unit = item.product_unit || item.unit || 'Stk';
        
        itemsList += `• ${quantity} ${unit} ${productName} (${unitPrice.toFixed(2)} € je ${unit} = ${itemTotal.toFixed(2)} €)\n`;
      });
      
      // Template-spezifische Inhalte
      switch (templateType) {
        case 'urgent':
        case 'dringend':
          subject = `DRINGEND: Bestellung ${orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
          content = `Sehr geehrter ${supplierName},

DRINGENDE BESTELLUNG - Bitte um bevorzugte Bearbeitung!

hiermit bestellen wir dringend folgende Artikel:

${itemsList}

Bestellnummer: ${orderNumber}
Bestelldatum: ${orderDate}
Gewünschter Liefertermin: ${deliveryDate}
Gesamtwert: ${totalAmount.toFixed(2)} €

Wir benötigen die Lieferung so schnell wie möglich. Bitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns den voraussichtlichen Liefertermin mit.

Bei Rückfragen erreichen Sie uns jederzeit.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`;
          break;
          
        case 'reorder':
        case 'nachbestellung':
          subject = `Nachbestellung ${orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
          content = `Sehr geehrter ${supplierName},

hiermit bestellen wir erneut nach:

${itemsList}

Bestellnummer: ${orderNumber}
Bestelldatum: ${orderDate}
Gewünschter Liefertermin: ${deliveryDate}
Gesamtwert: ${totalAmount.toFixed(2)} €

Bitte liefern Sie die aufgeführten Artikel gemäß unserer üblichen Konditionen.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`;
          break;
          
        default: // standard
          subject = `Bestellung ${orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
          content = `Sehr geehrter ${supplierName},

hiermit bestellen wir folgende Artikel:

${itemsList}

Bestellnummer: ${orderNumber}
Bestelldatum: ${orderDate}
Gewünschter Liefertermin: ${deliveryDate}
Gesamtwert: ${totalAmount.toFixed(2)} €

Bitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns mit, wann wir mit der Lieferung rechnen können.

Mit freundlichen Grüßen
Elbsandstein Proviant & Quartier GmbH`;
      }
      
      return res.json({
        subject,
        content,
        supplierEmail: order.supplier_email || '',
        orderDetails: {
          orderNumber,
          orderDate,
          deliveryDate,
          totalAmount: totalAmount.toFixed(2),
          itemsCount: itemsResult.rows.length,
          supplierName: order.supplier_name
        }
      });
    } catch (error) {
      console.error('Fehler beim Generieren der E-Mail-Vorlage:', error);
      return res.status(500).json({ 
        error: 'Fehler beim Generieren der E-Mail-Vorlage', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });
  
  // FINAL EMAIL FIX - Direct endpoint to bypass all routing conflicts
  app.post('/api/send-email-simple/:id', async (req, res) => {
    console.log(`[DirectEmailFix] ROUTE HIT - /api/send-email-simple/${req.params.id}`);
    console.log(`[DirectEmailFix] Request body:`, req.body);
    
    try {
      const orderId = parseInt(req.params.id);
      const { to, cc, bcc, subject, content } = req.body;

      if (!to || !subject || !content) {
        return res.status(400).json({
          success: false,
          error: 'Fehlende erforderliche Felder: to, subject, content'
        });
      }

      // Load order data
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Bestellung nicht gefunden'
        });
      }

      // Create transporter using proper SMTP secrets
      console.log('[DirectEmailFix] SMTP Configuration:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER,
        passExists: !!process.env.SMTP_PASS
      });
      
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: false,
        ignoreTLS: true, // Ignore TLS entirely for testing
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      // Send email with proper sender format - use a valid email address
      const mailOptions = {
        from: `"Proviantomat" <einkauf@proviantomat.de>`,
        to: to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: subject,
        html: content
      };

      console.log(`[DirectEmailFix] Sending email to ${to}...`);
      const result = await transporter.sendMail(mailOptions);
      
      console.log(`[DirectEmailFix] Email sent successfully, Message ID: ${result.messageId}`);
      
      // Update order status to 'sent' after successful email
      await db.update(orders)
        .set({ 
          status: 'sent'
        })
        .where(eq(orders.id, orderId));
      
      console.log(`[DirectEmailFix] Order ${orderId} status updated to 'sent'`);
      
      return res.json({
        success: true,
        message: 'E-Mail erfolgreich gesendet',
        messageId: result.messageId,
        orderNumber: order.orderNumber
      });
      
    } catch (error: any) {
      console.error('[DirectEmailFix] Error sending email:', error);
      return res.status(500).json({
        success: false,
        error: 'Fehler beim Senden der E-Mail',
        details: error.message
      });
    }
  });

  // Mount simple email router BEFORE registerRoutes to avoid conflicts
  console.log('[SERVER] Mounting simple email router at /api');
  app.use('/api', simpleEmailRouter);
  console.log('[SERVER] Simple email router mounted successfully');
  
  // Mount bulk orders router BEFORE Vite middleware to ensure proper API routing
  const bulkOrdersRouter = (await import('./routes/bulk-orders')).default;
  app.use('/api/bulk-orders', bulkOrdersRouter);
  console.log('[SERVER] Bulk orders router mounted successfully');
  
  const server = await registerRoutes(app);

  // Direct email endpoint that bypasses all routing conflicts
  app.post('/email-send-direct/:orderId', async (req, res) => {
    console.log('[DirectEmailBypass] Direct email route hit - bypassing all middleware');
    console.log('[DirectEmailBypass] Order ID:', req.params.orderId);
    console.log('[DirectEmailBypass] Request body:', JSON.stringify(req.body, null, 2));
    
    try {
      const orderId = parseInt(req.params.orderId);
      const { emailAddress, subject, content } = req.body;
      
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
      
      console.log('[DirectEmailBypass] Creating SMTP transporter...');
      
      // Import nodemailer and create transporter
      const { createTransport } = await import('nodemailer');
      const transporter = createTransport({
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
      
      // Verify SMTP connection
      await transporter.verify();
      console.log('[DirectEmailBypass] SMTP connection verified');
      
      // Fetch order data using direct SQL
      const orderQuery = `
        SELECT o.*, s.name as supplier_name
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        WHERE o.id = $1
      `;
      
      const orderResult = await pool.query(orderQuery, [orderId]);
      
      if (!orderResult.rows || orderResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Bestellung nicht gefunden'
        });
      }
      
      const order = orderResult.rows[0];
      console.log('[DirectEmailBypass] Order found:', order.order_number);
      
      // Fetch order items using direct SQL
      const itemsQuery = `
        SELECT oi.*, p.product_name
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `;
      
      const itemsResult = await pool.query(itemsQuery, [orderId]);
      const items = itemsResult.rows || [];
      
      console.log(`[DirectEmailBypass] Found ${items.length} order items`);
      
      // Create email content
      let emailContent = content;
      
      if (!emailContent) {
        // Create formatted HTML email template
        const itemsList = items.map((item, index) => 
          `<tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${item.product_name || 'Unbekanntes Produkt'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity || 0}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(item.unit_price || 0).toFixed(2)}€</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${((item.unit_price || 0) * (item.quantity || 0)).toFixed(2)}€</td>
          </tr>`
        ).join('');
        
        const totalAmount = items.reduce((sum, item) => sum + ((item.unit_price || 0) * (item.quantity || 0)), 0);
        const vatAmount = totalAmount * 0.19;
        const totalWithVat = totalAmount * 1.19;
        
        emailContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bestellung ${order.order_number}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Bestellung ${order.order_number}</h2>
    
    <p>Sehr geehrte Damen und Herren,</p>
    
    <p>hiermit bestellen wir bei Ihnen folgende Artikel:</p>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="font-weight: bold;">Bestellnummer:</td>
                <td>${order.order_number}</td>
            </tr>
            <tr>
                <td style="font-weight: bold;">Lieferant:</td>
                <td>${order.supplier_name || 'Unbekannt'}</td>
            </tr>
            <tr>
                <td style="font-weight: bold;">Bestelldatum:</td>
                <td>${new Date(order.created_at).toLocaleDateString('de-DE')}</td>
            </tr>
            ${order.expected_delivery_date ? `
            <tr>
                <td style="font-weight: bold;">Erwartetes Lieferdatum:</td>
                <td>${new Date(order.expected_delivery_date).toLocaleDateString('de-DE')}</td>
            </tr>` : ''}
        </table>
    </div>
    
    <h3 style="color: #2563eb; margin-top: 30px;">Bestellpositionen:</h3>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
            <tr style="background-color: #f1f5f9;">
                <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Nr.</th>
                <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Artikel</th>
                <th style="border: 1px solid #ddd; padding: 10px; text-align: right;">Menge</th>
                <th style="border: 1px solid #ddd; padding: 10px; text-align: right;">Einzelpreis</th>
                <th style="border: 1px solid #ddd; padding: 10px; text-align: right;">Gesamtpreis</th>
            </tr>
        </thead>
        <tbody>
            ${itemsList}
        </tbody>
        <tfoot>
            <tr style="background-color: #f8f9fa; font-weight: bold;">
                <td colspan="4" style="border: 1px solid #ddd; padding: 10px; text-align: right;">Nettosumme:</td>
                <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${totalAmount.toFixed(2)}€</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
                <td colspan="4" style="border: 1px solid #ddd; padding: 10px; text-align: right;">zzgl. 19% MwSt.:</td>
                <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${vatAmount.toFixed(2)}€</td>
            </tr>
            <tr style="background-color: #e2e8f0; font-weight: bold; font-size: 1.1em;">
                <td colspan="4" style="border: 1px solid #ddd; padding: 12px; text-align: right;">Gesamtbetrag (brutto):</td>
                <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">${totalWithVat.toFixed(2)}€</td>
            </tr>
        </tfoot>
    </table>
    
    <div style="margin-top: 30px; padding: 15px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 5px 5px 0;">
        <p style="margin: 0; font-weight: bold;">Bitte bestätigen Sie uns den Erhalt dieser Bestellung sowie den geplanten Liefertermin.</p>
    </div>
    
    <p style="margin-top: 30px;">Für Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
    
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0;">Mit freundlichen Grüßen</p>
        <p style="margin: 5px 0 0 0; font-weight: bold;">Ihr Proviantomat Team</p>
        <p style="margin: 15px 0 0 0; font-size: 0.9em; color: #6b7280;">
            E-Mail: ${process.env.SMTP_FROM || 'einkauf@proviantomat.de'}
        </p>
    </div>
</body>
</html>
        `;
      }
      
      // Create email subject
      let emailSubject = subject;
      if (!emailSubject) {
        emailSubject = `Bestellung ${order.order_number} - ${order.supplier_name || order.supplier_name}`;
      }
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'einkauf@proviantomat.de',
        to: emailAddress,
        subject: emailSubject,
        html: emailContent
      };
      
      console.log('[DirectEmailBypass] Sending email...');
      const result = await transporter.sendMail(mailOptions);
      
      console.log(`[DirectEmailBypass] Email sent successfully, Message ID: ${result.messageId}`);
      
      return res.json({
        success: true,
        message: 'E-Mail erfolgreich gesendet',
        messageId: result.messageId,
        orderNumber: order.order_number
      });
      
    } catch (error: any) {
      console.error('[DirectEmailBypass] Error sending order email:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Unbekannter Fehler beim Senden der E-Mail'
      });
    }
  });

  // Complete email fix router with proper HTML formatting and CC support (FIRST PRIORITY)
  app.use('/api/orders', ordersEmailCompleteFixRouter);
  
  // Email routes mounted AFTER registerRoutes to override any conflicts
  const directEmailRouter = (await import('./routes/direct-email-send')).default;
  app.use('/api/direct-email', directEmailRouter);
  
  const ordersEmailFixRouter = (await import('./routes/orders-email-fix')).default;
  app.use('/api/orders-email-fix', ordersEmailFixRouter);
  
  // Working email router with corrected SMTP configuration
  const ordersEmailWorkingRouter = (await import('./routes/orders-email-working')).default;
  app.use('/api/orders-email-working', ordersEmailWorkingRouter);
  
  app.use('/api/enhanced-email', enhancedEmailRouter);
  
  app.use('/api/supplier-email-templates', supplierEmailTemplatesRouter);
  
  app.use('/api', emailTemplateFixRouter);
  
  app.use('/api', emailCompleteFixRouter);
  app.use('/api', emailWorkingRouter);
  app.use('/api', emailBypassRouter);
  app.use('/api', emailDebugRouter);
  app.use('/api/orders', rawEmailRouter);

  // Register inventory-count-batches router
  app.use('/api/inventory-counts', inventoryCountBatchesRouter);
  
  // Register removed products router
  app.use('/api/removed-products', removedProductsRouter);
  
  // Register location analysis router
  app.use('/api/location-analysis', locationAnalysisRouter);
  
  // Register weather data router
  app.use('/api/weather', weatherRouter);
  
  // Register supplier analytics router
  app.use('/api/suppliers', supplierAnalyticsRouter);
  
  // Direct machine locations endpoint for Standort-Analyse dropdown
  app.get('/api/machine-locations', async (req, res) => {
    try {
      console.log('Fetching machine locations for dropdown...');
      const result = await pool.query(`
        SELECT DISTINCT location_name 
        FROM machines 
        WHERE location_name IS NOT NULL 
        AND location_name != ''
        ORDER BY location_name
      `);
      
      const locations = result.rows.map(row => row.location_name);
      console.log(`Found ${locations.length} machine locations:`, locations.slice(0, 5));
      
      res.json(locations);
    } catch (error) {
      console.error('Error fetching machine locations:', error);
      res.status(500).json({ error: 'Failed to fetch machine locations' });
    }
  });

  // Fehlende API-Routen für den Bestellprozess hinzufügen
  
  // Direkte Lieferanten-API für Bestellprozess
  app.get('/api/db-direct/suppliers', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM suppliers 
        WHERE status = 'active' OR status IS NULL
        ORDER BY name
      `);
      
      console.log(`${result.rows.length} Lieferanten direkt aus der Datenbank geladen`);
      
      return res.json({
        rows: result.rows,
        success: true
      });
    } catch (error) {
      console.error('Fehler beim Laden der Lieferanten:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler',
        success: false
      });
    }
  });

  // Direkte Bestelldaten-API (einzelne Bestellung)
  app.get('/api/orders-direct/:id', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      if (isNaN(orderId)) {
        return res.status(400).json({
          error: 'Ungültige Bestellungs-ID',
          message: 'Die angegebene Bestellungs-ID ist ungültig'
        });
      }
      
      console.log(`Lade Bestellung mit ID ${orderId} direkt aus der Datenbank...`);
      
      // Bestellung mit JOIN für Lieferanten- und Lagerdaten
      const orderResult = await pool.query(`
        SELECT 
          o.*,
          s.name as supplier_name,
          s.email as supplier_email,
          w.name as warehouse_name,
          w.address as warehouse_location
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        LEFT JOIN warehouses w ON o.warehouse_id = w.id
        WHERE o.id = $1
      `, [orderId]);
      
      if (orderResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Bestellung nicht gefunden',
          message: `Keine Bestellung mit ID ${orderId} gefunden`
        });
      }
      
      // Bestellpositionen laden mit Gebindegrößen und MwSt-Daten
      const itemsResult = await pool.query(`
        SELECT 
          oi.*,
          p.product_name, 
          p.sku, 
          p.category,
          p.package_size,
          p.units,
          p.vat,
          COALESCE(oi.unit_price, 0) as unit_price,
          COALESCE(oi.total_price, 0) as total_price,
          COALESCE(oi.quantity, 1) as quantity,
          COALESCE(oi.vat_rate, p.vat, 19) as vat_rate,
          -- Berechne Gebinde-basierte Mengen
          CASE 
            WHEN p.package_size IS NOT NULL AND p.package_size::integer > 0 
            THEN CEIL(COALESCE(oi.quantity, 1)::float / p.package_size::integer) * p.package_size::integer
            ELSE COALESCE(oi.quantity, 1)
          END as package_quantity,
          -- Berechne MwSt-Beträge
          ROUND(
            (COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 1) * COALESCE(oi.vat_rate, p.vat, 19) / 100)::numeric, 
            2
          ) as vat_amount
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `, [orderId]);
      
      const orderData = {
        ...orderResult.rows[0],
        items: itemsResult.rows,
        warehouseId: orderResult.rows[0].warehouse_id,
        warehouseName: orderResult.rows[0].warehouse_name || 'Unbekanntes Lager',
        supplierName: orderResult.rows[0].supplier_name || 'Unbekannter Lieferant',
        supplierEmail: orderResult.rows[0].supplier_email || ''
      };
      
      return res.json(orderData);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellung:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  // Direkte Bestellpositionen-API
  app.get('/api/order-items-direct/:orderId', async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Ungültige Bestell-ID' });
      }

      const result = await pool.query(`
        SELECT oi.*, p.product_name, p.sku, p.category
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `, [orderId]);
      
      return res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('Fehler beim Laden der Bestellpositionen:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  // Direkte Bestellerstellungs-API (Workaround für HTML-Response-Problem)
  app.post('/api/orders-direct', async (req, res) => {
    try {
      console.log("Direkte Bestellerstellung mit Daten:", JSON.stringify(req.body).substring(0, 200));
      
      res.setHeader('Content-Type', 'application/json');
      
      const {
        warehouseId,
        supplierId,
        expectedDeliveryDate,
        priority = 'normal',
        notes = '',
        items,
        orderItems
      } = req.body;
      
      // Support both 'items' and 'orderItems' field names
      const actualItems = items || orderItems || [];
      
      // Validierung
      if (!warehouseId || !supplierId) {
        return res.status(400).json({ error: 'Lager und Lieferant müssen angegeben werden' });
      }
      
      if (!actualItems || !Array.isArray(actualItems) || actualItems.length === 0) {
        return res.status(400).json({ 
          error: 'Mindestens ein Artikel muss bestellt werden',
          debug: {
            items: !!items,
            orderItems: !!orderItems,
            actualItemsLength: actualItems.length,
            bodyKeys: Object.keys(req.body)
          }
        });
      }

      // Bestellnummer generieren
      const today = new Date();
      const dateString = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
      
      const latestOrderQuery = await pool.query(`
        SELECT order_number FROM orders 
        WHERE order_number LIKE 'ORD-${dateString}-%'
        ORDER BY order_number DESC 
        LIMIT 1
      `);
      
      let sequenceNumber = 1;
      if (latestOrderQuery.rows.length > 0) {
        const latestOrderNumber = latestOrderQuery.rows[0].order_number;
        const match = latestOrderNumber.match(/ORD-\d{8}-(\d+)/);
        if (match) {
          sequenceNumber = parseInt(match[1]) + 1;
        }
      }
      
      const orderNumber = `ORD-${dateString}-${sequenceNumber.toString().padStart(3, '0')}`;
      
      // Bestellung erstellen
      const orderResult = await pool.query(`
        INSERT INTO orders (
          order_number, warehouse_id, supplier_id, status, 
          expected_delivery_date, priority, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, 'draft', $4, $5, $6, NOW(), NOW())
        RETURNING *
      `, [orderNumber, warehouseId, supplierId, expectedDeliveryDate, priority, notes]);
      
      const order = orderResult.rows[0];
      
      // Bestellpositionen erstellen  
      for (const item of actualItems) {
        // Sicherheitsprüfung für productId
        if (!item.productId || isNaN(Number(item.productId))) {
          console.error(`Ungültige Produkt-ID: ${item.productId}`);
          continue;
        }
        
        // Produktname direkt mit sicherem Fallback
        let productName = `Produkt-ID ${item.productId}`;
        let unit = 'Stk';
        
        try {
          const productResult = await pool.query(`
            SELECT product_name, unit 
            FROM products 
            WHERE id = $1
          `, [Number(item.productId)]);
          
          if (productResult.rows.length > 0) {
            if (productResult.rows[0].product_name) {
              productName = productResult.rows[0].product_name;
            }
            if (productResult.rows[0].unit) {
              unit = productResult.rows[0].unit;
            }
          }
        } catch (productError) {
          console.warn(`Produktabfrage fehlgeschlagen für ID ${item.productId}:`, productError);
        }
        
        console.log(`Erstelle Bestellposition: ID ${item.productId}, Name: "${productName}"`);
        
        await pool.query(`
          INSERT INTO order_items (
            order_id, product_id, product_name, quantity, unit, unit_price, total_price, 
            quantity_delivered, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'pending', NOW(), NOW())
        `, [
          order.id,
          Number(item.productId),
          productName,  // Garantiert nicht null
          Number(item.quantity) || 1,
          unit,
          Number(item.price) || 0,
          (Number(item.quantity) || 1) * (Number(item.price) || 0)
        ]);
      }
      
      return res.json({
        success: true,
        order: order,
        message: 'Bestellung erfolgreich erstellt'
      });
      
    } catch (error) {
      console.error('Fehler bei direkter Bestellerstellung:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  // POST endpoint für Bestellungsdetails (Frontend-Kompatibilität)
  app.post('/api/orders/:id', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      if (isNaN(orderId)) {
        return res.status(400).json({
          error: 'Ungültige Bestellungs-ID',
          message: 'Die angegebene Bestellungs-ID ist ungültig'
        });
      }
      
      console.log(`POST /api/orders/${orderId} - Lade Bestelldetails...`);
      
      // Bestellung mit JOIN für Lieferanten- und Lagerdaten
      const orderResult = await pool.query(`
        SELECT 
          o.*,
          s.name as supplier_name,
          s.email as supplier_email,
          w.name as warehouse_name,
          w.address as warehouse_location
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        LEFT JOIN warehouses w ON o.warehouse_id = w.id
        WHERE o.id = $1
      `, [orderId]);
      
      if (orderResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Bestellung nicht gefunden',
          message: `Keine Bestellung mit ID ${orderId} gefunden`
        });
      }
      
      // Bestellpositionen laden
      const itemsResult = await pool.query(`
        SELECT oi.*, p.product_name, p.sku, p.category
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `, [orderId]);
      
      const orderData = {
        ...orderResult.rows[0],
        items: itemsResult.rows,
        warehouseId: orderResult.rows[0].warehouse_id,
        warehouseName: orderResult.rows[0].warehouse_name || 'Unbekanntes Lager',
        supplierName: orderResult.rows[0].supplier_name || 'Unbekannter Lieferant',
        supplierEmail: orderResult.rows[0].supplier_email || ''
      };
      
      return res.json(orderData);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellung via POST:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  // Wareneingang buchen (Frontend-Kompatibilität)
  app.post('/api/orders/:id/receipt', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { deliveryDate, notes, items } = req.body;
      
      if (isNaN(orderId)) {
        return res.status(400).json({
          error: 'Ungültige Bestellungs-ID',
          message: 'Die angegebene Bestellungs-ID ist ungültig'
        });
      }
      
      console.log(`POST /api/orders/${orderId}/receipt - Buche Wareneingang...`);
      
      // Bestellung als geliefert markieren
      const updateResult = await pool.query(`
        UPDATE orders 
        SET status = 'delivered', 
            actual_delivery_date = $1,
            notes = COALESCE(notes, '') || CASE WHEN notes IS NOT NULL AND notes != '' THEN '\n' ELSE '' END || $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [deliveryDate || new Date(), notes || 'Wareneingang gebucht', orderId]);
      
      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Bestellung nicht gefunden',
          message: `Keine Bestellung mit ID ${orderId} gefunden`
        });
      }
      
      // Bestellpositionen als geliefert markieren, falls Items übermittelt wurden
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (item.id && item.deliveredQuantity !== undefined) {
            await pool.query(`
              UPDATE order_items 
              SET quantity_delivered = $1,
                  status = CASE WHEN $1 >= quantity THEN 'delivered' ELSE 'partial' END,
                  updated_at = NOW()
              WHERE id = $2 AND order_id = $3
            `, [item.deliveredQuantity, item.id, orderId]);
          }
        }
      }
      
      return res.json({
        success: true,
        message: 'Wareneingang erfolgreich gebucht',
        order: updateResult.rows[0]
      });
    } catch (error) {
      console.error('Fehler beim Buchen des Wareneingangs via POST:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  // Wareneingang buchen mit vollständiger Chargen-Verfolgung
  app.post('/api/orders/:id/goods-receipt-batches', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { deliveryDate, notes, items } = req.body;
      
      if (isNaN(orderId)) {
        return res.status(400).json({
          error: 'Ungültige Bestellungs-ID',
          message: 'Die angegebene Bestellungs-ID ist ungültig'
        });
      }
      
      console.log(`Buche Wareneingang mit Chargen-Verfolgung für Bestellung ${orderId}`);
      
      // Bestellung als geliefert markieren
      const updateResult = await pool.query(`
        UPDATE orders 
        SET status = 'delivered', 
            actual_delivery_date = $1,
            notes = $2,
            updated_at = NOW()
        WHERE id = $3 
        RETURNING *
      `, [deliveryDate || new Date(), notes || 'Wareneingang mit Chargen-Verfolgung gebucht', orderId]);
      
      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Bestellung nicht gefunden',
          message: `Keine Bestellung mit ID ${orderId} gefunden`
        });
      }
      
      const createdBatches = [];
      
      // Bestellpositionen verarbeiten und Chargen erstellen
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (item.id && item.deliveredQuantity !== undefined) {
            // Bestellposition aktualisieren
            await pool.query(`
              UPDATE order_items 
              SET quantity_delivered = $1,
                  status = CASE WHEN $1 >= quantity THEN 'delivered' ELSE 'partial' END,
                  updated_at = NOW()
              WHERE id = $2 AND order_id = $3
            `, [item.deliveredQuantity, item.id, orderId]);

            // Produktinformationen für Batch-Erstellung abrufen
            const orderItemResult = await pool.query(`
              SELECT oi.product_id, oi.quantity_delivered, o.warehouse_id, o.supplier_id, p.product_name
              FROM order_items oi
              JOIN orders o ON oi.order_id = o.id
              JOIN products p ON oi.product_id = p.id
              WHERE oi.id = $1
            `, [item.id]);

            if (orderItemResult.rows.length > 0) {
              const { product_id, quantity_delivered, warehouse_id, supplier_id, product_name } = orderItemResult.rows[0];
              
              // Batch-Nummer generieren
              const batchNumber = `BAT-${orderId}-${item.id}-${Date.now()}`;
              
              // Product Batch erstellen mit MHD-Tracking
              const batchResult = await pool.query(`
                INSERT INTO product_batches (
                  product_id, warehouse_id, batch_number, 
                  initial_quantity, current_quantity, 
                  received_date, expiry_date, order_id, supplier_id,
                  status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
                RETURNING *
              `, [
                product_id, warehouse_id, batchNumber,
                quantity_delivered, quantity_delivered,
                deliveryDate || new Date(),
                item.expiryDate || null,
                orderId, supplier_id,
                'active'
              ]);

              const createdBatch = batchResult.rows[0];
              createdBatches.push({
                batchId: createdBatch.id,
                batchNumber: createdBatch.batch_number,
                productId: product_id,
                productName: product_name,
                quantity: quantity_delivered,
                expiryDate: item.expiryDate,
                warehouseId: warehouse_id
              });

              console.log(`✅ Batch ${batchNumber} erstellt für Produkt ${product_name}, Menge: ${quantity_delivered}, MHD: ${item.expiryDate || 'nicht angegeben'}`);
            }
          }
        }
      }
      
      return res.json({
        success: true,
        message: `Wareneingang erfolgreich gebucht - ${createdBatches.length} Chargen erstellt`,
        order: updateResult.rows[0],
        batchesCreated: createdBatches
      });
    } catch (error) {
      console.error('Fehler beim Wareneingang mit Chargen-Verfolgung:', error);
      return res.status(500).json({
        error: 'Serverfehler',
        message: 'Beim Buchen des Wareneingangs ist ein Fehler aufgetreten'
      });
    }
  });

  // Wareneingang buchen - Bestellung als geliefert markieren
  app.post('/api/orders-direct/:id/receive', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { deliveryDate, notes, items } = req.body;
      
      if (isNaN(orderId)) {
        return res.status(400).json({
          error: 'Ungültige Bestellungs-ID',
          message: 'Die angegebene Bestellungs-ID ist ungültig'
        });
      }
      
      console.log(`Buche Wareneingang für Bestellung ${orderId}`);
      
      // Bestellung als geliefert markieren
      const updateResult = await pool.query(`
        UPDATE orders 
        SET status = 'delivered', 
            actual_delivery_date = $1,
            notes = COALESCE(notes, '') || CASE WHEN notes IS NOT NULL AND notes != '' THEN '\n' ELSE '' END || $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [deliveryDate || new Date(), notes || 'Wareneingang gebucht', orderId]);
      
      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Bestellung nicht gefunden',
          message: `Keine Bestellung mit ID ${orderId} gefunden`
        });
      }
      
      // Bestellpositionen als geliefert markieren, falls Items übermittelt wurden
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (item.id && item.deliveredQuantity !== undefined) {
            await pool.query(`
              UPDATE order_items 
              SET quantity_delivered = $1,
                  status = CASE WHEN $1 >= quantity THEN 'delivered' ELSE 'partial' END,
                  updated_at = NOW()
              WHERE id = $2 AND order_id = $3
            `, [item.deliveredQuantity, item.id, orderId]);
          }
        }
      }
      
      return res.json({
        success: true,
        message: 'Wareneingang erfolgreich gebucht',
        order: updateResult.rows[0]
      });
    } catch (error) {
      console.error('Fehler beim Buchen des Wareneingangs:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error("Serverfehler:", err);
    res.status(status).json({ message });
    // Der "throw err" wurde entfernt, da es dazu führen würde, dass der Server abstürzt
  });

  // Eco-Impact Tracker API endpoints (moved to avoid route conflicts)
  app.get('/api/eco/products', async (req, res) => {
    try {
      console.log('API: Lade Produkte mit Nachhaltigkeitsdaten...');
      
      const result = await pool.query(`
        SELECT 
          id,
          product_name as "productName",
          price,
          category,
          carbon_footprint as "carbonFootprint",
          water_usage as "waterUsage",
          packaging_type as "packagingType",
          packaging_recyclable as "packagingRecyclable",
          transport_distance as "transportDistance",
          is_organic as "isOrganic",
          is_local as "isLocal",
          is_vegan as "isVegan",
          is_vegetarian as "isVegetarian",
          sustainability_score as "sustainabilityScore",
          certifications
        FROM products 
        WHERE price IS NOT NULL
        ORDER BY sustainability_score DESC NULLS LAST
      `);
      
      console.log(`${result.rows.length} Produkte mit Nachhaltigkeitsdaten geladen`);
      res.json(result.rows);
    } catch (error) {
      console.error('Fehler beim Laden der Nachhaltigkeitsdaten:', error);
      res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  app.get('/api/eco/statistics', async (req, res) => {
    try {
      console.log('API: Berechne Nachhaltigkeitsstatistiken...');
      
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_products,
          COUNT(CASE WHEN sustainability_score >= 70 THEN 1 END) as sustainable_products,
          AVG(carbon_footprint) as avg_carbon_footprint,
          AVG(water_usage) as avg_water_usage,
          AVG(sustainability_score) as avg_sustainability_score
        FROM products 
        WHERE price IS NOT NULL
      `);
      
      const categoryResult = await pool.query(`
        SELECT 
          category,
          AVG(sustainability_score) as avg_score,
          COUNT(*) as product_count
        FROM products 
        WHERE category IS NOT NULL 
          AND sustainability_score IS NOT NULL
          AND price IS NOT NULL
        GROUP BY category
        ORDER BY avg_score DESC
        LIMIT 5
      `);
      
      const stats = {
        totalProducts: parseInt(statsResult.rows[0].total_products),
        sustainableProducts: parseInt(statsResult.rows[0].sustainable_products),
        avgCarbonFootprint: parseFloat(statsResult.rows[0].avg_carbon_footprint || 0),
        avgWaterUsage: parseFloat(statsResult.rows[0].avg_water_usage || 0),
        avgSustainabilityScore: parseFloat(statsResult.rows[0].avg_sustainability_score || 0),
        topCategories: categoryResult.rows.map(row => ({
          category: row.category,
          score: parseFloat(row.avg_score),
          count: parseInt(row.product_count)
        }))
      };
      
      console.log('Nachhaltigkeitsstatistiken berechnet:', stats);
      res.json(stats);
    } catch (error) {
      console.error('Fehler beim Berechnen der Nachhaltigkeitsstatistiken:', error);
      res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  app.post('/api/eco/track-choice', async (req, res) => {
    try {
      const { userId, productId, machineId, alternativeProducts, choiceReason } = req.body;
      
      console.log('API: Verfolge nachhaltige Produktwahl...', { userId, productId, machineId });
      
      // Get product eco data for impact calculation
      const productResult = await pool.query(`
        SELECT carbon_footprint, water_usage, sustainability_score
        FROM products 
        WHERE id = $1
      `, [productId]);
      
      if (productResult.rows.length === 0) {
        return res.status(404).json({ error: 'Produkt nicht gefunden' });
      }
      
      const product = productResult.rows[0];
      
      // Calculate average impact of alternatives for comparison
      let co2Saved = 0;
      let waterSaved = 0;
      
      if (alternativeProducts && alternativeProducts.length > 0) {
        const avgResult = await pool.query(`
          SELECT 
            AVG(carbon_footprint) as avg_carbon,
            AVG(water_usage) as avg_water
          FROM products 
          WHERE id = ANY($1)
        `, [alternativeProducts]);
        
        if (avgResult.rows.length > 0) {
          const avgCarbon = parseFloat(avgResult.rows[0].avg_carbon || 0);
          const avgWater = parseFloat(avgResult.rows[0].avg_water || 0);
          
          co2Saved = Math.max(0, avgCarbon - (product.carbon_footprint || 0));
          waterSaved = Math.max(0, avgWater - (product.water_usage || 0));
        }
      }
      
      // Calculate sustainability bonus points
      const sustainabilityBonus = (product.sustainability_score || 0) >= 70 ? 10 : 0;
      
      // Insert eco choice tracking record
      const insertResult = await pool.query(`
        INSERT INTO user_eco_choices (
          user_id, product_id, machine_id, co2_saved, water_saved, 
          alternative_products, choice_reason, sustainability_bonus
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId, productId, machineId, co2Saved, waterSaved,
        JSON.stringify(alternativeProducts || []), choiceReason, sustainabilityBonus
      ]);
      
      console.log('Nachhaltige Produktwahl erfolgreich verfolgt');
      res.json({
        success: true,
        choice: insertResult.rows[0],
        impact: {
          co2Saved,
          waterSaved,
          sustainabilityBonus
        }
      });
    } catch (error) {
      console.error('Fehler beim Verfolgen der nachhaltigen Produktwahl:', error);
      res.status(500).json({ 
        error: 'Datenbankfehler', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  // Register critical inventory routes
  app.use('/api/critical-inventory', criticalInventoryRouter);
  app.use('/api', criticalInventoryWorkingRouter);
  app.use('/api', criticalInventoryFinalRouter);
  app.use('/api', inventoryHealthRouter);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // PERFORMANCE FIX: Intensive automatic synchronization disabled to improve application responsiveness
    // This was causing hundreds of database queries on startup, making the app slow and unresponsive
    // Synchronization can be run manually via API endpoints when needed
    log('Automatische Synchronisierung ist für bessere Performance deaktiviert.');
    log('Bei Bedarf kann die Synchronisierung manuell über API-Endpunkte gestartet werden.');
  });
})();
