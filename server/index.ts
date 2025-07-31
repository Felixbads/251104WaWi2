import express, { type Request, Response, NextFunction } from "express";
import path from "path";
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
import supportTicketsRouter from './routes/support-tickets';
import productsRouter from './routes/products';
import { pool } from './db';
import { db } from './db';
import { orders } from '../shared/schema';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { uploadPhotos } from './middleware/fileUpload';
import { startPhotoServer } from './photoServer';
import interAppApiRouter from './routes/inter-app-api';
import { sendEmail } from './utils/emailService';
import suppliersFastRouter from './routes/suppliers-fast';
import suppliersSimpleRouter from './routes/suppliers-simple';
import suppliersProductsForConditionsRouter from './routes/suppliers-products-for-conditions';
import supplierDiscountsRouter from './routes/supplier-discounts';
import locationStatusRouter from './routes/location-status-ultra-fast';
import weatherCorrectionRouter from './routes/weather-correction';
import { retroactiveWeatherService } from './services/retroactiveWeatherCorrection';
import enhancedOrdersRouter from './routes/enhanced-orders';
import enhancedEmailTemplatesRouter from './routes/enhanced-email-templates';
import profitabilityRouter from './routes/profitability-simple';
import locationCostsRouter from './routes/location-costs';
import enhancedProfitabilityRouter from './routes/enhanced-profitability';
import { recurringOrdersRouter } from './routes/recurring-orders';
import { recurringOrderCronService } from './services/recurringOrderCron';
import RecurringOrderScheduler from './services/recurringOrderScheduler';
import weeklyReportRouter from './routes/weekly-report';
import { weeklyReportCron } from './services/weeklyReportCron';
import syncRouter from './routes/sync';
import inventoryItemsUnassignedRouter from './routes/inventory-items-unassigned';
import stockRatiosRouter from './routes/stock-ratios';
import inventorySimpleRouter from './routes/inventory-simple';
import { SupplierAnalyticsCache } from './services/supplierAnalyticsCache';
import supplierFavoritesRouter from './routes/supplier-favorites';

const app = express();

// DEBUG: Portal-Route-Logging vor allen anderen Middlewares
app.use((req, res, next) => {
  if (req.path.includes('/lieferant/')) {
    console.log('[SERVER-DEBUG] Portal route accessed:', {
      path: req.path,
      originalUrl: req.originalUrl,
      method: req.method,
      accept: req.headers.accept
    });
  }
  next();
});

// Optimized location status route with authentic database data will be registered below

// INTER-APP API ENDPOINTS - MUST BE FIRST TO BYPASS ALL MIDDLEWARE
// Health Check für externe Apps (OHNE Authentifizierung)
app.get('/api/inter-app/health', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    console.log('[INTER-APP] Health check request received');
    
    const dbTest = await pool.query('SELECT 1 as test');
    
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      message: 'Wawi-Proviantomat API verfügbar'
    });
  } catch (error) {
    console.error('[INTER-APP] Health Check Fehler:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: 'Datenbankverbindung fehlgeschlagen',
      timestamp: new Date().toISOString()
    });
  }
});

// Mount enhanced inter-app API routes (MIT Authentifizierung)
app.use('/api/inter-app', interAppApiRouter);

// Lieferanten-API für externe Apps
app.get('/api/inter-app/suppliers', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    console.log('[INTER-APP] Lieferanten-Anfrage von externer App');
    
    const suppliersQuery = `
      SELECT 
        s.id,
        s.name,
        s.contact_person as "contactPerson",
        s.phone,
        s.email,
        s.website,
        s.address,
        s.city,
        s.postal_code as "postalCode",
        s.country,
        s.status,
        s.notes,
        s.payment_terms as "paymentTerms",
        s.delivery_terms as "deliveryTerms",
        s.minimum_order_value as "minimumOrderValue",
        s.delivery_days as "deliveryDays",
        s.created_at as "createdAt",
        s.updated_at as "updatedAt",
        COUNT(p.id) as product_count
      FROM suppliers s
      LEFT JOIN products p ON s.id = p.supplier_id AND p.status = 'active'
      WHERE s.status = 'active'
      GROUP BY s.id
      ORDER BY s.name
    `;
    
    const result = await pool.query(suppliersQuery);
    
    const suppliersWithCompleteness = result.rows.map(supplier => ({
      ...supplier,
      productCount: parseInt(supplier.product_count) || 0,
      completeness: {
        hasDescription: !!(supplier.notes && supplier.notes.length >= 30),
        hasWebsite: !!supplier.website,
        hasCompleteAddress: !!(supplier.address && supplier.city && supplier.postalCode),
        hasContact: !!(supplier.email || supplier.phone)
      }
    }));
    
    res.json({
      success: true,
      data: suppliersWithCompleteness,
      total: suppliersWithCompleteness.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[INTER-APP] Fehler beim Abrufen der Lieferanten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Lieferanten',
      code: 'SUPPLIERS_FETCH_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// Produkte-API für externe Apps
app.get('/api/inter-app/products', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    
    const { supplier_id, limit = '100', offset = '0' } = req.query;
    console.log('[INTER-APP] Produkte-Anfrage von externer App', { supplier_id, limit, offset });
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = parseInt(offset as string) || 0;
    
    let productsQuery = `
      SELECT 
        p.id,
        p.product_name as name,
        p.description,
        p.price,
        p.status,
        p.barcode as ean,
        p.category,
        p.supplier_id as "supplierId",
        p.created_at as "createdAt",
        s.name as "supplierName",
        s.email as "supplierEmail",
        s.website as "supplierWebsite"
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.status = 'active'
    `;
    
    const params = [];
    
    if (supplier_id && !isNaN(parseInt(supplier_id as string))) {
      productsQuery += ` AND p.supplier_id = $${params.length + 1}`;
      params.push(parseInt(supplier_id as string));
    }
    
    productsQuery += ` ORDER BY p.product_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offsetNum);
    
    const result = await pool.query(productsQuery, params);
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE p.status = 'active'
    `;
    
    const countParams = [];
    if (supplier_id && !isNaN(parseInt(supplier_id as string))) {
      countQuery += ` AND p.supplier_id = $${countParams.length + 1}`;
      countParams.push(parseInt(supplier_id as string));
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total) || 0;
    
    const productsWithCompleteness = result.rows.map(product => ({
      ...product,
      completeness: {
        hasDescription: !!(product.description && product.description.length >= 10),
        hasPrice: !!(product.price && product.price > 0),
        hasEan: !!product.ean,
        hasSupplier: !!product.supplierId
      }
    }));
    
    res.json({
      success: true,
      data: productsWithCompleteness,
      pagination: {
        total: total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (offsetNum + limitNum) < total
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[INTER-APP] Fehler beim Abrufen der Produkte:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Produkte',
      code: 'PRODUCTS_FETCH_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// Removed express-fileupload middleware - using multiparty for photo uploads instead

// Remove global error handler - no longer needed with dedicated photo upload handling

// Allow JSON body parsing for all routes (including Cloudinary photo uploads)
// The old multipart photo upload system has been replaced with Cloudinary base64 uploads

// Increase upload limits for photo uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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
        (SELECT SUM(oi.quantity * COALESCE(oi.unit_price, 0)) 
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

  // Direct order API routes to bypass frontend routing - ENHANCED with JOINs
  app.get('/api/orders/:id', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      console.log(`Loading order ${orderId} with enhanced details`);
      
      // Erweiterte Abfrage mit JOINs für Lieferanten- und Lagerdaten
      const result = await pool.query(`
        SELECT 
          o.*,
          o.order_number as orderNumber,
          s.name as supplier_name,
          s.name as supplierName,
          s.email as supplier_email,
          w.name as warehouse_name,
          w.name as warehouseName,
          w.address as warehouse_address,
          w.location as warehouse_location
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        LEFT JOIN warehouses w ON o.warehouse_id = w.id OR o.location_id = w.id
        WHERE o.id = $1
      `, [orderId]);
      
      if (result.rows.length === 0) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const orderData = result.rows[0];
      console.log(`Order found: ${orderData.order_number || orderData.orderNumber} with supplier: ${orderData.supplier_name} and warehouse: ${orderData.warehouse_name}`);
      
      res.setHeader('Content-Type', 'application/json');
      res.json(orderData);
    } catch (error) {
      console.error('Error loading order:', error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Database error', details: error.message });
    }
  });

  app.get('/api/orders/:id/items', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      console.log(`Loading items for order ${orderId}`);
      const result = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
      
      console.log(`${result.rows.length} items loaded`);
      res.setHeader('Content-Type', 'application/json');
      res.json(result.rows);
    } catch (error) {
      console.error('Error loading order items:', error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/orders/:id/copy', async (req, res) => {
    try {
      const sourceOrderId = parseInt(req.params.id);
      if (isNaN(sourceOrderId)) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      // Get source order
      const sourceOrderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [sourceOrderId]);
      if (sourceOrderResult.rows.length === 0) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({ error: 'Source order not found' });
      }
      
      const sourceOrder = sourceOrderResult.rows[0];
      
      // Get source items
      const sourceItemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [sourceOrderId]);
      
      // Generate new order number
      const today = new Date();
      const dateString = today.toISOString().slice(0, 10).replace(/-/g, '');
      const sequenceResult = await pool.query(
        `SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1`,
        [`ORD-${dateString}-%`]
      );
      
      let sequenceNumber = 1;
      if (sequenceResult.rows.length > 0) {
        const match = sequenceResult.rows[0].order_number.match(/ORD-\d{8}-(\d+)/);
        if (match) {
          sequenceNumber = parseInt(match[1]) + 1;
        }
      }
      
      const newOrderNumber = `ORD-${dateString}-${sequenceNumber.toString().padStart(3, '0')}`;
      
      // Create new order
      const newOrderResult = await pool.query(`
        INSERT INTO orders (
          order_number, warehouse_id, supplier_id, supplier_name, 
          location_name, status, order_date, expected_delivery_date, 
          total_amount, currency, priority, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        newOrderNumber,
        sourceOrder.warehouse_id,
        sourceOrder.supplier_id,
        sourceOrder.supplier_name,
        sourceOrder.location_name,
        today,
        sourceOrder.expected_delivery_date,
        sourceOrder.total_amount,
        sourceOrder.currency || 'EUR',
        sourceOrder.priority || 'normal',
        `Kopie von ${sourceOrder.order_number}`,
        today,
        today
      ]);
      
      const newOrder = newOrderResult.rows[0];
      
      // Copy items
      const newItems = [];
      for (const item of sourceItemsResult.rows) {
        const newItemResult = await pool.query(`
          INSERT INTO order_items (
            order_id, product_id, product_name, sku, supplier_sku,
            quantity, unit, unit_price, total_price, vat_rate,
            status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12)
          RETURNING *
        `, [
          newOrder.id,
          item.product_id,
          item.product_name,
          item.sku,
          item.supplier_sku,
          item.quantity,
          item.unit,
          item.unit_price,
          item.total_price,
          item.vat_rate,
          today,
          today
        ]);
        newItems.push(newItemResult.rows[0]);
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.status(201).json({
        success: true,
        message: 'Order copied successfully',
        order: {
          ...newOrder,
          items: newItems
        }
      });
    } catch (error) {
      console.error('Error copying order:', error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Failed to copy order' });
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

  // Bulk Update für Bestellpositionen - VOLLSTÄNDIGE SYNCHRONISATION (inkl. Löschung)
  app.put('/api/orders/:id/items', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { items } = req.body;
      
      console.log(`PUT /api/orders/${orderId}/items - VOLLSTÄNDIGE Synchronisation für ${items?.length || 0} Bestellpositionen...`);
      
      if (isNaN(orderId) || !items || !Array.isArray(items)) {
        return res.status(400).json({ 
          error: 'Ungültige Daten', 
          message: 'Bestell-ID oder Items-Array ist ungültig' 
        });
      }
      
      // Start transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // 1. Alle bestehenden Items für diese Bestellung abrufen
        const existingItemsResult = await client.query(`
          SELECT id FROM order_items WHERE order_id = $1
        `, [orderId]);
        
        const existingItemIds = existingItemsResult.rows.map(row => row.id);
        const newItemIds = items
          .filter(item => item.id && !isNaN(parseInt(item.id)))
          .map(item => parseInt(item.id));
        
        console.log(`Bestehende Items: [${existingItemIds.join(', ')}]`);
        console.log(`Neue Items: [${newItemIds.join(', ')}]`);
        
        // 2. Items identifizieren, die gelöscht werden sollen
        const itemsToDelete = existingItemIds.filter(id => !newItemIds.includes(id));
        
        if (itemsToDelete.length > 0) {
          console.log(`🗑️ Lösche ${itemsToDelete.length} Items: [${itemsToDelete.join(', ')}]`);
          await client.query(`
            DELETE FROM order_items 
            WHERE id = ANY($1) AND order_id = $2
          `, [itemsToDelete, orderId]);
        }
        
        // 3. Verbleibende Items aktualisieren
        let updatedCount = 0;
        for (const item of items) {
          const { id, quantity, unitPrice, totalPrice } = item;
          
          if (!id || isNaN(parseInt(id))) {
            console.warn(`Überspringe Item ohne gültige ID:`, item);
            continue;
          }
          
          const result = await client.query(`
            UPDATE order_items 
            SET 
              quantity = $1,
              unit_price = $2,
              total_price = $3,
              updated_at = NOW()
            WHERE id = $4 AND order_id = $5
          `, [
            quantity || 1,
            unitPrice || 0,
            totalPrice || (quantity || 1) * (unitPrice || 0),
            parseInt(id),
            orderId
          ]);
          
          if ((result.rowCount ?? 0) > 0) {
            console.log(`✅ Updated item ${id}: ${quantity} @ ${unitPrice} = ${totalPrice}`);
            updatedCount++;
          } else {
            console.warn(`⚠️ Item ${id} not found for update`);
          }
        }
        
        await client.query('COMMIT');
        console.log(`🎉 VOLLSTÄNDIGE Synchronisation für Bestellung ${orderId} erfolgreich:`);
        console.log(`   - ${itemsToDelete.length} Items gelöscht`);
        console.log(`   - ${updatedCount} Items aktualisiert`);
        
        return res.json({ 
          success: true, 
          message: `Synchronisation erfolgreich: ${itemsToDelete.length} gelöscht, ${updatedCount} aktualisiert`,
          deletedItems: itemsToDelete.length,
          updatedItems: updatedCount,
          totalItems: items.length
        });
        
      } catch (updateError) {
        await client.query('ROLLBACK');
        throw updateError;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Fehler bei der vollständigen Synchronisation der Bestellpositionen:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler bei der Synchronisation', 
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
      
      // Bestellung mit vollständigen Lieferanten- und Lagerdaten laden
      const orderResult = await pool.query(`
        SELECT 
          o.*,
          s.name as supplier_name,
          s.email as supplier_email,
          s.phone as supplier_phone,
          s.address as supplier_address,
          s.postal_code as supplier_postal_code,
          s.city as supplier_city,
          s.country as supplier_country,
          s.contact_person as supplier_contact,
          s.payment_terms as supplier_payment_terms,
          w.name as warehouse_name,
          w.address as warehouse_address
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        LEFT JOIN warehouses w ON o.warehouse_id = w.id
        WHERE o.id = $1
      `, [orderId]);
      
      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Bestellung nicht gefunden' });
      }
      
      const order = orderResult.rows[0];
      
      // Bestellpositionen mit korrekten Preisen UND GEBINDE-INFORMATIONEN laden
      // CRITICAL FIX: DISTINCT ON (oi.id) eliminiert Duplikate durch mehrfache purchase_conditions
      const itemsResult = await pool.query(`
        SELECT DISTINCT ON (oi.id)
          oi.*,
          p.product_name,
          p.units as product_unit,
          COALESCE(oi.unit_price, 0) as unit_price,
          COALESCE(oi.total_price, oi.quantity * COALESCE(oi.unit_price, 0)) as total_price,
          -- GEBINDE-INFORMATIONEN KORREKT AUS PURCHASE_CONDITIONS LADEN
          CASE 
            WHEN pc.packaging_quantity > 1 THEN FLOOR(oi.quantity::float / pc.packaging_quantity)
            ELSE COALESCE(oi.package_count, 1)
          END as package_count,
          COALESCE(pc.packaging_quantity, oi.package_quantity, 1) as package_quantity,
          COALESCE(pc.packaging_unit, oi.package_type_name, 'Stück') as package_type_name,
          COALESCE(oi.base_unit_name, 'Stück') as base_unit_name
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN purchase_conditions pc ON oi.product_id = pc.product_id 
          AND pc.supplier_id = (SELECT supplier_id FROM orders WHERE id = $1)
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
      
      // Bestellpositionen formatieren - RESPEKTIERT show_prices_in_email FLAG
      let itemsList = '';
      let totalAmount = 0;
      const showPrices = order.show_prices_in_email !== false;
      
      console.log(`E-Mail-Template für Bestellung ${orderId}: showPricesInEmail = ${showPrices}`);
      
      // Hilfsfunktion für professionelle HTML-Template-Generierung (11-Punkte-Struktur)
      const generateComprehensiveHtmlTemplate = (order: any, items: any[], showPrices: boolean, orderNumber: string, orderDate: string, deliveryDate: string, isPickup: boolean, paymentTerms: string, isUrgent: boolean = false, orderType: string = 'Standard') => {
        let totalAmount = 0;
        
        // Bestellpositionen-Tabelle erstellen
        let itemsTableRows = '';
        items.forEach((item: any, index: number) => {
          const unitPrice = parseFloat(item.unit_price || 0);
          const quantity = parseInt(item.quantity || 1);
          const itemTotal = quantity * unitPrice;
          totalAmount += itemTotal;
          
          const productName = item.product_name || `Produkt-ID ${item.product_id}`;
          const unit = item.product_unit || item.unit || 'Stk';
          
          // Nur echte Artikelnummer verwenden oder leer lassen
          const supplierSku = item.supplier_sku || '';
          
          // GEBINDE-INFORMATIONEN BERECHNEN UND ANZEIGEN - MIT SQL-KORREKTEN WERTEN
          const packageCount = parseInt(item.package_count || 1);
          const packageQuantity = parseInt(item.package_quantity || 1);
          const packageTypeName = item.package_type_name || 'Stück';
          const baseUnitName = item.base_unit_name || 'Stück';
          
          console.log(`SQL PACKAGE VALUES für ${productName}:`, {
            rawPackageCount: item.package_count,
            rawPackageQuantity: item.package_quantity,
            rawPackageTypeName: item.package_type_name,
            parsedPackageCount: packageCount,
            parsedPackageQuantity: packageQuantity,
            quantity
          });
          
          console.log(`PACKAGE DEBUG für ${productName}:`, {
            packageCount, packageQuantity, packageTypeName, baseUnitName, quantity,
            originalItem: { package_count: item.package_count, package_quantity: item.package_quantity, package_type_name: item.package_type_name }
          });
          
          // Gebinde-Darstellung: "18 Kisten × 20 Stück = 360 Stück" (MIT KORREKTEN SQL-WERTEN)
          let quantityDisplay = '';
          
          // KRITISCHER FIX: Verwende packageCount DIREKT aus SQL-Query statt zu berechnen
          if (packageQuantity > 1 && packageCount > 1) {
            // Verwende packageCount direkt aus SQL-Query (bereits korrekt berechnet)
            quantityDisplay = `${packageCount} ${packageTypeName} × ${packageQuantity} ${baseUnitName} = ${quantity} ${baseUnitName}`;
            console.log(`PACKAGE DISPLAY für ${productName}: "${quantityDisplay}"`);
          } else if (packageQuantity > 1 && quantity >= packageQuantity) {
            // Fallback: Berechne falls packageCount nicht korrekt ist
            const calculatedPackageCount = Math.floor(quantity / packageQuantity);
            if (calculatedPackageCount > 1) {
              quantityDisplay = `${calculatedPackageCount} ${packageTypeName} × ${packageQuantity} ${baseUnitName} = ${quantity} ${baseUnitName}`;
              console.log(`PACKAGE DISPLAY FALLBACK für ${productName}: "${quantityDisplay}"`);
            } else {
              quantityDisplay = `${quantity} ${baseUnitName}`;
            }
          } else {
            quantityDisplay = `${quantity} ${unit}`;
          }
          
          itemsTableRows += `
            <tr>
              <td style="padding: 8px; text-align: left;">${index + 1}</td>
              <td style="padding: 8px; text-align: left;">${item.product_id || ''}</td>
              <td style="padding: 8px; text-align: left;">${productName}</td>
              <td style="padding: 8px; text-align: left;">${supplierSku}</td>
              <td style="padding: 8px; text-align: center;"><strong>${quantityDisplay}</strong></td>
              <td style="padding: 8px; text-align: center;">${unit}</td>
              ${showPrices ? `<td style="padding: 8px; text-align: right;">${itemTotal.toFixed(2)} €</td>` : ''}
            </tr>
          `;
        });
        
        // Summenblock (nur bei Preisanzeige)
        let summenBlock = '';
        if (showPrices) {
          const nettoTotal = totalAmount;
          const vatAmount = nettoTotal * 0.19; // 19% MwSt
          const bruttoTotal = nettoTotal + vatAmount;
          
          summenBlock = `
            <!-- 10. SUMMENBLOCK -->
            <div style="margin: 30px 0; padding: 20px; border: 1px solid #000;">
              <h3 style="margin: 0 0 15px 0; color: #000; border-bottom: 1px solid #000; padding-bottom: 5px;">Summenblock</h3>
              <table style="width: 100%; max-width: 400px; margin-left: auto;">
                <tr><td style="padding: 5px; border-bottom: 1px solid #000;"><strong>Zwischensumme netto:</strong></td>
                    <td style="padding: 5px; text-align: right; border-bottom: 1px solid #000;">${nettoTotal.toFixed(2)} €</td></tr>
                <tr><td style="padding: 5px; border-bottom: 1px solid #000;">Umsatzsteuer (19%):</td>
                    <td style="padding: 5px; text-align: right; border-bottom: 1px solid #000;">${vatAmount.toFixed(2)} €</td></tr>
                <tr style="background: #000; color: white;"><td style="padding: 8px; font-weight: bold;">Gesamtsumme brutto:</td>
                    <td style="padding: 8px; text-align: right; font-weight: bold;">${bruttoTotal.toFixed(2)} €</td></tr>
              </table>
            </div>
          `;
        }
        
        return `
          <div style="font-family: 'Skog', Arial, sans-serif; font-size: 10pt; line-height: 1.3; color: #000; max-width: 800px; padding: 20px;">
            
            <!-- HEADER wie im PDF -->
            <table style="width: 100%; margin-bottom: 30px; border-collapse: collapse;">
              <tr>
                <td style="width: 65%; vertical-align: top;">
                  <p style="margin: 0; font-size: 9pt;">Elbsandstein Proviant & Quartier GmbH | Seifhennersdorfer Str. 14 | 01099 Dresden</p>
                  <div style="margin: 20px 0 30px 0;">
                    <p style="margin: 0; font-weight: bold;">${order.supplier_name || 'Unbekannter Lieferant'}</p>
                    ${order.supplier_address || order.address ? `<p style="margin: 0;">${order.supplier_address || order.address}</p>` : ''}
                    ${order.supplier_postal_code || order.postalCode || order.supplier_city || order.city ? `<p style="margin: 0;">${order.supplier_postal_code || order.postalCode || ''} ${order.supplier_city || order.city || ''}</p>` : ''}
                    ${order.supplier_country || order.country ? `<p style="margin: 0;">${order.supplier_country || order.country}</p>` : ''}
                  </div>
                </td>
                <td style="width: 35%; vertical-align: top; text-align: right;">
                  <div style="text-align: right;">
                    <p style="margin: 0; font-weight: bold;">Elbsandstein Proviant & Quartier GmbH</p>
                    <p style="margin: 0;">Seifhennersdorfer Str. 14</p>
                    <p style="margin: 0;">01099 Dresden</p>
                    <p style="margin: 10px 0 0 0;">Telefon: +49173 4385330</p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- BESTELLHEADER -->
            <h1 style="margin: 30px 0 20px 0; font-family: 'Skog', Arial, sans-serif; font-size: 16pt; font-weight: bold;">${isUrgent ? 'DRINGENDE BESTELLUNG' : 'Bestellung'} ${orderNumber}</h1>

            <!-- BESTELLDETAILS TABELLE -->
            <table style="width: 100%; margin-bottom: 30px; border-collapse: collapse;">
              <tr>
                <td style="width: 50%; vertical-align: top; padding-right: 30px;">
                  <table style="width: 100%; font-size: 10pt;">
                    <tr><td style="padding: 2px 0; width: 40%;"><strong>Lieferanten-Nr.:</strong></td><td>${order.supplier_id}</td></tr>
                    <tr><td style="padding: 2px 0;"><strong>Bestell-Typ:</strong></td><td>${isPickup ? 'Abholauftrag' : 'Standardbestellung'}</td></tr>
                  </table>
                </td>
                <td style="width: 50%; vertical-align: top;">
                  <table style="width: 100%; font-size: 10pt;">
                    <tr><td style="padding: 2px 0; width: 40%;"><strong>Bestelldatum:</strong></td><td>${orderDate}</td></tr>
                    <tr><td style="padding: 2px 0;"><strong>Bearbeiter:</strong></td><td>Felix Zschoge</td></tr>
                    <tr><td style="padding: 2px 0;"><strong>E-Mail:</strong></td><td>felix@proviantomat.de</td></tr>
                    <tr><td style="padding: 2px 0;"><strong>Geplantes Lieferdatum:</strong></td><td>${deliveryDate}</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- ADRESSEN -->
            <p style="margin: 20px 0; font-size: 10pt;"><strong>Rechnungsadresse:</strong> Elbsandstein Proviant & Quartier GmbH | Am Bahnhof 5 | 01814 Bad Schandau</p>
            <p style="margin: 0 0 30px 0; font-size: 10pt;"><strong>Lieferadresse:</strong> ${isPickup ? 'Abholung durch Auftraggeber' : 'Elbsandstein Proviant & Quartier GmbH | Am Bahnhof 5 | 01814 Bad Schandau'}</p>

            <!-- BESTELLPOSITIONEN TABELLE -->
            <table style="width: 100%; border-collapse: collapse; margin: 30px 0;">
              <thead>
                <tr>
                  <th style="padding: 8px; border-bottom: 1px solid #000; text-align: left; font-weight: bold;">Pos.</th>
                  <th style="padding: 8px; border-bottom: 1px solid #000; text-align: left; font-weight: bold;">Art.-Nr.</th>
                  <th style="padding: 8px; border-bottom: 1px solid #000; text-align: left; font-weight: bold;">Bezeichnung</th>
                  <th style="padding: 8px; border-bottom: 1px solid #000; text-align: left; font-weight: bold;">Art.-Nr. Lieferant</th>
                  <th style="padding: 8px; border-bottom: 1px solid #000; text-align: center; font-weight: bold;">Menge</th>
                  <th style="padding: 8px; border-bottom: 1px solid #000; text-align: center; font-weight: bold;">Einheit</th>
                  ${showPrices ? `<th style="padding: 8px; border-bottom: 1px solid #000; text-align: right; font-weight: bold;">Preis</th>` : ''}
                </tr>
              </thead>
              <tbody>
                ${itemsTableRows}
              </tbody>
            </table>

            ${summenBlock}

            ${isUrgent ? '<p style="margin: 20px 0; font-weight: bold;">DRINGENDE BESTELLUNG: Wir benötigen die Lieferung so schnell wie möglich.</p>' : ''}
            ${order.notes ? `<p style="margin: 20px 0;"><strong>Besondere Hinweise:</strong> ${order.notes}</p>` : ''}

            <!-- FOOTER -->
            <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #000; text-align: center; font-size: 9pt;">
              <p style="margin: 0;"><strong>Proviantomat • Elbsandstein Proviant & Quartier GmbH • Seifhennersdorfer Str. 14 • 01099 Dresden</strong></p>
              <p style="margin: 5px 0 0 0;">Umsatzssteuernr. DE353367134 • Steuernr. 202/108/12394</p>
            </div>
          </div>
        `;
      }
      
      // Bestellpositionen verarbeiten und Gesamtsumme berechnen  
      itemsResult.rows.forEach(item => {
        const unitPrice = parseFloat(item.unit_price || 0);
        const quantity = parseInt(item.quantity || 1);
        const itemTotal = quantity * unitPrice;
        totalAmount += itemTotal;
      });
      
      // Basis-Daten für neue professionelle Struktur
      const isPickup = order.delivery_type === 'pickup';
      const paymentTerms = order.supplier_payment_terms || '14 Tage netto';
      
      // Template-spezifische Generierung
      switch (templateType) {
        case 'urgent':
        case 'dringend':
          subject = `DRINGEND: Bestellung ${orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
          content = generateComprehensiveHtmlTemplate(order, itemsResult.rows, showPrices, orderNumber, orderDate, deliveryDate, isPickup, paymentTerms, true);
          break;
          
        case 'reorder':
        case 'nachbestellung':
          subject = `Nachbestellung ${orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
          content = generateComprehensiveHtmlTemplate(order, itemsResult.rows, showPrices, orderNumber, orderDate, deliveryDate, isPickup, paymentTerms, false, 'Nachbestellung');
          break;
          
        default: // standard
          subject = `Bestellung ${orderNumber} - Elbsandstein Proviant & Quartier GmbH`;
          content = generateComprehensiveHtmlTemplate(order, itemsResult.rows, showPrices, orderNumber, orderDate, deliveryDate, isPickup, paymentTerms, false);
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

  // Direct email test endpoint - mounted early to avoid Vite conflicts
  app.post('/test-email-direct', async (req, res) => {
    console.log('[DirectEmailTest] Email test requested');
    
    try {
      const { to, subject, content } = req.body;
      
      if (!to || !subject || !content) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: to, subject, content'
        });
      }

      const result = await sendEmail({
        to,
        from: process.env.SMTP_FROM || 'einkauf@proviantomat.de',
        subject,
        html: content,
        text: content.replace(/<[^>]*>/g, '') // Strip HTML for text version
      });

      if (result) {
        console.log('[DirectEmailTest] Email sent successfully');
        return res.json({
          success: true,
          message: 'E-Mail erfolgreich gesendet',
          to,
          subject,
          timestamp: new Date().toISOString()
        });
      } else {
        console.error('[DirectEmailTest] Email sending failed');
        return res.status(500).json({
          success: false,
          error: 'Fehler beim Senden der E-Mail'
        });
      }
      
    } catch (error) {
      console.error('[DirectEmailTest] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Serverfehler beim E-Mail-Versand',
        details: error instanceof Error ? error.message : 'Unbekannt'
      });
    }
  });

  // NEUE PRODUKTLISTEN-API FÜR KOREKTE NAMEN
  app.get('/api/suppliers/:supplierId/products-fixed', async (req, res) => {
    console.log('[PRODUCTS-FIXED] Fetching products with correct names for supplier:', req.params.supplierId);
    
    try {
      const supplierId = parseInt(req.params.supplierId);
      
      if (isNaN(supplierId)) {
        return res.status(400).json({ error: 'Invalid supplier ID' });
      }

      // DIREKTE SQL-ABFRAGE FÜR AUTHENTISCHE PRODUKTNAMEN
      const query = `
        SELECT 
          p.id,
          p.product_name,
          p.category,
          p.price,
          p.units,
          p.package_size,
          p.short_description,
          p.vendon_id,
          p.status,
          pc.unit_price as purchase_price,
          pc.packaging_unit,
          pc.packaging_quantity,
          pc.deposit_per_unit,
          pc.min_quantity
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = $1
        WHERE (pc.supplier_id = $1 OR p.supplier_id = $1)
          AND p.product_name IS NOT NULL 
          AND p.product_name != ''
          AND p.status = 'active'
        ORDER BY p.product_name ASC
      `;
      
      const result = await pool.query(query, [supplierId]);
      
      // SICHERE DATENKONVERTIERUNG
      const products = result.rows.map(product => ({
        id: product.id,
        productName: product.product_name,
        name: product.product_name,
        category: product.category || 'Ohne Kategorie',
        price: product.price || 0,
        purchasePrice: product.purchase_price || 0,
        units: product.units || 'Stück',
        packageSize: product.package_size || '',
        packagingUnit: product.packaging_unit || 'Stück',
        packagingQuantity: product.packaging_quantity || 1,
        depositPerUnit: product.deposit_per_unit || 0,
        minQuantity: product.min_quantity || 0,
        shortDescription: product.short_description || '',
        vendonId: product.vendon_id || '',
        status: product.status || 'active'
      }));
      
      console.log(`[PRODUCTS-FIXED] SUCCESS: Found ${products.length} products with names:`, 
        products.slice(0, 3).map(p => ({ id: p.id, name: p.productName })));
      
      res.json({
        success: true,
        data: products,
        count: products.length,
        supplierId: supplierId
      });
      
    } catch (error) {
      console.error('[PRODUCTS-FIXED] Error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch products',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 🚨 KRITISCHE ROUTE: Vollständige Synchronisation für Order Items - ALLERERSTE PRIORITÄT!
  app.put('/api/orders/:id/items', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { items } = req.body;
      
      console.log(`🔄 PUT /api/orders/${orderId}/items - VOLLSTÄNDIGE Synchronisation für ${items?.length || 0} Bestellpositionen...`);
      
      if (isNaN(orderId) || !items || !Array.isArray(items)) {
        return res.status(400).json({ 
          error: 'Ungültige Daten', 
          message: 'Bestell-ID oder Items-Array ist ungültig' 
        });
      }
      
      // Start transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // 1. Alle bestehenden Items für diese Bestellung abrufen
        const existingItemsResult = await client.query(`
          SELECT id FROM order_items WHERE order_id = $1
        `, [orderId]);
        
        const existingItemIds = existingItemsResult.rows.map(row => row.id);
        const newItemIds = items
          .filter(item => item.id && !isNaN(parseInt(item.id)))
          .map(item => parseInt(item.id));
        
        console.log(`📋 Bestehende Items: [${existingItemIds.join(', ')}]`);
        console.log(`📋 Neue Items: [${newItemIds.join(', ')}]`);
        
        // 2. Items identifizieren, die gelöscht werden sollen
        const itemsToDelete = existingItemIds.filter(id => !newItemIds.includes(id));
        
        if (itemsToDelete.length > 0) {
          console.log(`🗑️ Lösche ${itemsToDelete.length} Items: [${itemsToDelete.join(', ')}]`);
          await client.query(`
            DELETE FROM order_items 
            WHERE id = ANY($1) AND order_id = $2
          `, [itemsToDelete, orderId]);
        }
        
        // 3. Verbleibende Items aktualisieren
        let updatedCount = 0;
        for (const item of items) {
          const { id, quantity, unitPrice, totalPrice } = item;
          
          if (!id || isNaN(parseInt(id))) {
            console.warn(`⚠️ Überspringe Item ohne gültige ID:`, item);
            continue;
          }
          
          const result = await client.query(`
            UPDATE order_items 
            SET 
              quantity = $1,
              unit_price = $2,
              total_price = $3,
              updated_at = NOW()
            WHERE id = $4 AND order_id = $5
          `, [
            quantity || 1,
            unitPrice || 0,
            totalPrice || (quantity || 1) * (unitPrice || 0),
            parseInt(id),
            orderId
          ]);
          
          if (result.rowCount && result.rowCount > 0) {
            console.log(`✅ Updated item ${id}: ${quantity} @ ${unitPrice} = ${totalPrice}`);
            updatedCount++;
          } else {
            console.warn(`⚠️ Item ${id} not found for update`);
          }
        }
        
        await client.query('COMMIT');
        console.log(`🎉 VOLLSTÄNDIGE Synchronisation für Bestellung ${orderId} erfolgreich:`);
        console.log(`   - ${itemsToDelete.length} Items gelöscht`);
        console.log(`   - ${updatedCount} Items aktualisiert`);
        
        return res.json({ 
          success: true, 
          message: `Synchronisation erfolgreich: ${itemsToDelete.length} gelöscht, ${updatedCount} aktualisiert`,
          deletedItems: itemsToDelete.length,
          updatedItems: updatedCount,
          totalItems: items.length
        });
        
      } catch (updateError) {
        await client.query('ROLLBACK');
        throw updateError;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Fehler bei der vollständigen Synchronisation der Bestellpositionen:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler bei der Synchronisation', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });
  console.log('[SERVER] 🚨 KRITISCHE ROUTE: Order Items vollständige Synchronisation mounted ALLERERSTE PRIORITÄT');

  // Mount supplier portal router FIRST to prevent Vite middleware conflicts
  const supplierPortalRouter = (await import('./routes/supplier-portal')).default;
  app.use('/api/supplier-portal', supplierPortalRouter);
  console.log('[SERVER] Supplier portal router mounted successfully (FIRST PRIORITY)');

  // Mount simple email router BEFORE registerRoutes to avoid conflicts
  console.log('[SERVER] Mounting simple email router at /api');
  app.use('/api', simpleEmailRouter);
  console.log('[SERVER] Simple email router mounted successfully');
  


  // Mount bulk orders router BEFORE Vite middleware to ensure proper API routing
  const bulkOrdersRouter = (await import('./routes/bulk-orders')).default;
  app.use('/api/bulk-orders', bulkOrdersRouter);
  console.log('[SERVER] Bulk orders router mounted successfully');
  
  // Mount forecast factors router for working holiday/weather data
  const forecastFactorsRouter = (await import('./routes/forecast-factors-simple')).default;
  app.use('/api/bulk-orders/forecast-factors', forecastFactorsRouter);
  console.log('[SERVER] Forecast factors router mounted successfully');
  
  // 🚨 KRITISCHE ROUTE: Vollständige Synchronisation für Order Items - MUSS VOR ordersRouter stehen!
  app.put('/api/orders/:id/items', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { items } = req.body;
      
      console.log(`🔄 PUT /api/orders/${orderId}/items - VOLLSTÄNDIGE Synchronisation für ${items?.length || 0} Bestellpositionen...`);
      
      if (isNaN(orderId) || !items || !Array.isArray(items)) {
        return res.status(400).json({ 
          error: 'Ungültige Daten', 
          message: 'Bestell-ID oder Items-Array ist ungültig' 
        });
      }
      
      // Start transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // 1. Alle bestehenden Items für diese Bestellung abrufen
        const existingItemsResult = await client.query(`
          SELECT id FROM order_items WHERE order_id = $1
        `, [orderId]);
        
        const existingItemIds = existingItemsResult.rows.map(row => row.id);
        const newItemIds = items
          .filter(item => item.id && !isNaN(parseInt(item.id)))
          .map(item => parseInt(item.id));
        
        console.log(`📋 Bestehende Items: [${existingItemIds.join(', ')}]`);
        console.log(`📋 Neue Items: [${newItemIds.join(', ')}]`);
        
        // 2. Items identifizieren, die gelöscht werden sollen
        const itemsToDelete = existingItemIds.filter(id => !newItemIds.includes(id));
        
        if (itemsToDelete.length > 0) {
          console.log(`🗑️ Lösche ${itemsToDelete.length} Items: [${itemsToDelete.join(', ')}]`);
          await client.query(`
            DELETE FROM order_items 
            WHERE id = ANY($1) AND order_id = $2
          `, [itemsToDelete, orderId]);
        }
        
        // 3. Verbleibende Items aktualisieren
        let updatedCount = 0;
        for (const item of items) {
          const { id, quantity, unitPrice, totalPrice } = item;
          
          if (!id || isNaN(parseInt(id))) {
            console.warn(`⚠️ Überspringe Item ohne gültige ID:`, item);
            continue;
          }
          
          const result = await client.query(`
            UPDATE order_items 
            SET 
              quantity = $1,
              unit_price = $2,
              total_price = $3,
              updated_at = NOW()
            WHERE id = $4 AND order_id = $5
          `, [
            quantity || 1,
            unitPrice || 0,
            totalPrice || (quantity || 1) * (unitPrice || 0),
            parseInt(id),
            orderId
          ]);
          
          if ((result.rowCount ?? 0) > 0) {
            console.log(`✅ Updated item ${id}: ${quantity} @ ${unitPrice} = ${totalPrice}`);
            updatedCount++;
          } else {
            console.warn(`⚠️ Item ${id} not found for update`);
          }
        }
        
        await client.query('COMMIT');
        console.log(`🎉 VOLLSTÄNDIGE Synchronisation für Bestellung ${orderId} erfolgreich:`);
        console.log(`   - ${itemsToDelete.length} Items gelöscht`);
        console.log(`   - ${updatedCount} Items aktualisiert`);
        
        return res.json({ 
          success: true, 
          message: `Synchronisation erfolgreich: ${itemsToDelete.length} gelöscht, ${updatedCount} aktualisiert`,
          deletedItems: itemsToDelete.length,
          updatedItems: updatedCount,
          totalItems: items.length
        });
        
      } catch (updateError) {
        await client.query('ROLLBACK');
        throw updateError;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Fehler bei der vollständigen Synchronisation der Bestellpositionen:', error);
      return res.status(500).json({ 
        error: 'Datenbankfehler bei der Synchronisation', 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });
  console.log('[SERVER] 🚨 KRITISCHE ROUTE: Order Items vollständige Synchronisation mounted FIRST PRIORITY');
  
  // Mount orders router BEFORE registerRoutes to bypass Vite wildcard routing
  const ordersRouter = (await import('./routes/orders')).default;
  app.use('/api/orders', ordersRouter);
  console.log('[SERVER] Orders router mounted successfully');
  
  // Mount enhanced orders router BEFORE registerRoutes for enhanced ordering functionality
  app.use('/api/enhanced-orders', enhancedOrdersRouter);
  app.use('/api/enhanced-email-templates', enhancedEmailTemplatesRouter);
  console.log('[SERVER] Enhanced orders router mounted successfully');
  
  // Mount profitability analysis router for economic evaluation
  app.use('/api/profitability', profitabilityRouter);
  console.log('[SERVER] Profitability analysis router mounted successfully');

  // Mount modern profitability dashboard for visual analytics
  const modernProfitabilityRouter = (await import('./routes/profitability-modern')).default;
  app.use('/api/profitability-modern', modernProfitabilityRouter);
  console.log('[SERVER] Modern profitability dashboard router mounted successfully');
  
  // Mount enhanced profitability analysis router with fixed cost allocation
  // app.use('/api/enhanced-profitability', enhancedProfitabilityRouter);
  // console.log('[SERVER] Enhanced profitability analysis router mounted successfully');
  
  // Register location status router BEFORE registerRoutes to prevent conflicts
  app.use('/api/location-status', locationStatusRouter);
  
  // Umsatz-Ergebnis-Overview API (BOTH VERSIONS)
  const { getUmsatzErgebnisOverview } = await import('./routes/umsatz-ergebnis-overview-fast');
  const authenticRouter = (await import('./routes/umsatz-ergebnis-overview-authentic')).default;
  
  app.get('/api/umsatz-ergebnis-overview', getUmsatzErgebnisOverview);
  app.get('/api/umsatz-ergebnis-overview-fast', getUmsatzErgebnisOverview);
  app.use('/api/umsatz-ergebnis-overview-authentic', authenticRouter);
  console.log('[SERVER] Location status router mounted BEFORE registerRoutes');
  
  // Mount Simplified Enhanced Prophet router BEFORE registerRoutes for Phase 4 implementation
  const enhancedProphetSimplifiedRouter = (await import('./routes/enhancedProphetSimplified')).default;
  app.use('/api/enhanced-prophet', enhancedProphetSimplifiedRouter);
  console.log('[SERVER] Simplified Enhanced Prophet router mounted successfully');
  
  // Mount products router BEFORE registerRoutes for refill-history and purchase-conditions APIs
  app.use('/api/products', productsRouter);
  console.log('[SERVER] Products router mounted successfully');
  
  // Mount recurring orders router BEFORE registerRoutes for automated recurring orders functionality
  app.use('/api/recurring-orders', recurringOrdersRouter);
  console.log('[SERVER] Recurring orders router mounted successfully');
  
  // Mount weekly report router BEFORE registerRoutes for automated weekly email reports
  app.use('/api/weekly-reports', weeklyReportRouter);
  console.log('[SERVER] Weekly report router mounted successfully');
  
  // Mount sync router BEFORE registerRoutes for Vendon sync functionality
  app.use('/api/sync', syncRouter);
  console.log('[SERVER] Sync router mounted at /api/sync BEFORE registerRoutes');
  
  // Mount suppliers-products-for-conditions router BEFORE registerRoutes for purchase conditions dropdown functionality
  app.use('/api/suppliers', suppliersProductsForConditionsRouter);
  console.log('[SERVER] Suppliers-products-for-conditions router mounted at /api/suppliers BEFORE registerRoutes');
  
  // Mount machine stock router BEFORE registerRoutes for database-backed stock queries
  const machineStockRouter = (await import('./routes/machine-stock')).default;
  app.use('/api/machine-stock', machineStockRouter);
  console.log('[SERVER] Machine stock router mounted at /api/machine-stock BEFORE registerRoutes');
  
  // Mount machine stock sync router BEFORE registerRoutes for background sync management
  const machineStockSyncRouter = (await import('./routes/machine-stock-sync')).default;
  app.use('/api/machine-stock-sync', machineStockSyncRouter);
  console.log('[SERVER] Machine stock sync router mounted at /api/machine-stock-sync BEFORE registerRoutes');
  
  // Mount cleanup router for draft orders and inventory cleanup
  const cleanupRouter = (await import('./routes/cleanup')).default;
  app.use('/api/cleanup', cleanupRouter);
  console.log('[SERVER] Cleanup router mounted at /api/cleanup BEFORE registerRoutes');
  
  // Supplier Analytics Router  
  const supplierAnalyticsRouter = (await import('./routes/supplier-analytics')).default;
  app.use('/api/supplier-analytics', supplierAnalyticsRouter);
  console.log('[SERVER] Supplier analytics router mounted at /api/supplier-analytics BEFORE registerRoutes');
  
  app.use('/api/supplier-favorites', supplierFavoritesRouter);
  console.log('[SERVER] Supplier favorites router mounted at /api/supplier-favorites BEFORE registerRoutes');
  
  // Mount retroactive inventory router BEFORE registerRoutes for retroactive inventory count functionality
  const retroactiveInventoryRouter = (await import('./routes/retroactive-inventory')).default;
  app.use('/api/retroactive-inventory', retroactiveInventoryRouter);
  console.log('[SERVER] Retroactive inventory router mounted at /api/retroactive-inventory BEFORE registerRoutes');
  
  // Location Costs Router for German cost categories and profitability analysis (SIMPLIFIED VERSION)
  const locationCostsSimpleRouter = (await import('./routes/location-costs-simple')).default;
  app.use('/api/location-costs', locationCostsSimpleRouter);
  console.log('[SERVER] Simplified location costs router mounted at /api/location-costs BEFORE registerRoutes');
  
  // Enhanced Profitability Router for detailed monthly financial analysis
  const enhancedProfitabilityRouter = (await import('./routes/enhanced-profitability')).default;
  app.use('/api/enhanced-profitability', enhancedProfitabilityRouter);
  console.log('[SERVER] Enhanced profitability router mounted at /api/enhanced-profitability BEFORE registerRoutes');
  
  // Product Cost and Revenue Analysis Router for transparent cost breakdown
  const productCostRevenueAnalysisRouter = (await import('./routes/product-cost-revenue-analysis')).default;
  app.use('/api/product-analysis', productCostRevenueAnalysisRouter);
  console.log('[SERVER] Product cost and revenue analysis router mounted at /api/product-analysis BEFORE registerRoutes');
  
  // Eggs Profitability Router for accurate Vendon-price-based calculations
  const eggsProfitabilityRouter = (await import('./routes/eggs-profitability')).default;
  app.use('/api/eggs-profitability', eggsProfitabilityRouter);
  console.log('[SERVER] Eggs profitability router mounted at /api/eggs-profitability BEFORE registerRoutes');

  // Product profitability router - mount before registerRoutes
  const productProfitabilityRouter = (await import('./routes/product-profitability')).default;
  app.use('/api/products', productProfitabilityRouter);
  console.log('[SERVER] Product profitability router mounted at /api/products BEFORE registerRoutes');

  // Product margin calculation router - mount before registerRoutes
  const productMarginCalculationRouter = (await import('./routes/product-margin-calculation')).default;
  app.use('/api', productMarginCalculationRouter);
  console.log('[SERVER] Product margin calculation router mounted at /api BEFORE registerRoutes');

  // Performance netto router - mount before registerRoutes
  const performanceNettoRouter = (await import('./routes/performance-netto')).default;
  app.use('/api/performance-netto', performanceNettoRouter);
  console.log('[SERVER] Performance netto router mounted at /api/performance-netto BEFORE registerRoutes');

  // Modern profitability router already mounted at /api/profitability-modern above
  
  // Inventory router - mount BEFORE registerRoutes for save/start/complete operations
  const inventoryRouter = (await import('./routes/inventory')).default;
  app.use('/api/inventory-counts', inventoryRouter);
  
  // Simple inventory router for robust operations
  const inventorySimpleRouter = (await import('./routes/inventory-simple')).default;
  app.use('/api/inventory-simple', inventorySimpleRouter);
  console.log('[SERVER] Inventory routers mounted at /api/inventory-counts and /api/inventory-simple BEFORE registerRoutes');
  
  // CRITICAL: Register API routes FIRST before any static/wildcard routes
  console.log('[SERVER] Registering API routes BEFORE Vite middleware...');
  const server = await registerRoutes(app);

  // Register weather correction service AFTER registerRoutes
  app.use('/api/weather-correction', weatherCorrectionRouter);
  console.log('[SERVER] Weather correction service registered');
  
  // Start daily weather correction cron job
  retroactiveWeatherService.scheduleDailyCorrection();
  console.log('[SERVER] Daily weather correction cron job started (6:00 AM)');
  
  // Start recurring orders cron service for automated order generation
  recurringOrderCronService.start();
  console.log('[SERVER] Recurring orders cron service started (daily 6:00 AM)');
  
  // CRITICAL FIX: Start the RecurringOrderScheduler that the API endpoints actually use
  // Import and start the same scheduler instance that the routes use
  const { getRecurringOrderSchedulerInstance } = await import('./routes/recurring-orders');
  const recurringOrderScheduler = getRecurringOrderSchedulerInstance();
  recurringOrderScheduler.start();
  console.log('[SERVER] RecurringOrderScheduler (API) started - automation now active');
  
  // Start weekly report cron service for automated weekly email reports
  weeklyReportCron.start();
  console.log('[SERVER] Weekly report cron service started (Monday 6:00 AM)');
  
  // IMMEDIATE TEST EMAIL ROUTE - Direct SMTP test to resolve authentication failure
  app.post('/api/test-email-immediate', async (req, res) => {
    console.log('[IMMEDIATE_TEST] Test email route hit');
    
    try {
      const { to, subject, content } = req.body;
      
      // Default values for testing
      const testTo = to || 'felix@proviantomat.de';
      const testSubject = subject || 'Test Email - Proviantomat System';
      const testContent = content || `
        <h2>Test Email - Proviantomat System</h2>
        <p>Diese E-Mail wurde um ${new Date().toLocaleString('de-DE')} gesendet.</p>
        <p>Wenn Sie diese E-Mail erhalten, funktioniert das SMTP-System korrekt.</p>
        <p>System-Status: Aktiv</p>
      `;
      
      console.log('[IMMEDIATE_TEST] Creating SMTP transporter...');
      
      // Import and configure nodemailer
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // Use STARTTLS
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false // Allow self-signed certificates
        },
        debug: true, // Enable debug logging
        logger: true // Enable logging
      });
      
      console.log('[IMMEDIATE_TEST] SMTP Configuration:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        passwordSet: !!process.env.SMTP_PASS
      });
      
      // Test connection
      console.log('[IMMEDIATE_TEST] Testing SMTP connection...');
      await transporter.verify();
      console.log('[IMMEDIATE_TEST] SMTP connection verified successfully');
      
      // Send email
      const mailOptions = {
        from: 'proviantomat@proviantomat.de',
        to: testTo,
        subject: testSubject,
        html: testContent
      };
      
      console.log('[IMMEDIATE_TEST] Sending email...');
      const result = await transporter.sendMail(mailOptions);
      
      console.log('[IMMEDIATE_TEST] Email sent successfully:', result.messageId);
      
      res.json({
        success: true,
        message: 'Test-E-Mail erfolgreich gesendet',
        messageId: result.messageId,
        to: testTo,
        subject: testSubject,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('[IMMEDIATE_TEST] SMTP Error:', error);
      res.status(500).json({
        success: false,
        error: 'SMTP-Fehler beim Senden der Test-E-Mail',
        details: error.message,
        code: error.code || 'UNKNOWN'
      });
    }
  });

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

  // Register inventory-count-batches router - FIX: separate path to avoid conflict with inventoryRouter
  app.use('/api/inventory-count-batches', inventoryCountBatchesRouter);
  

  
  // Register inventory-items-unassigned router
  app.use('/api/inventory-items', inventoryItemsUnassignedRouter);
  
  // Register removed products router
  app.use('/api/removed-products', removedProductsRouter);
  
  // Register location analysis router
  app.use('/api/location-analysis', locationAnalysisRouter);
  
  // Register weather data router
  app.use('/api/weather', weatherRouter);
  
  // Register supplier discount conditions router
  app.use('/api/supplier-discounts', supplierDiscountsRouter);
  
  // Register enhanced forecasting router
  const simpleEnhancedForecastRouter = (await import('./routes/simple-enhanced-forecast')).default;
  app.use('/api/enhanced-forecast', simpleEnhancedForecastRouter);
  
  // Register stock ratios router for filling level calculations
  app.use('/api/stock-ratios', stockRatiosRouter);
  console.log('[SERVER] Stock ratios router mounted successfully');
  

  
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
          -- Berechne Gebinde-basierte Mengen (sicher für Text-Package-Sizes)
          CASE 
            WHEN p.package_size IS NOT NULL AND p.package_size ~ '^[0-9]+$' AND p.package_size::integer > 0 
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

  // DIRECT PERFORMANCE API ENDPOINTS - BYPASS ROUTING CONFLICTS
  app.get('/api/statistics/today', async (req, res) => {
    try {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const result = await pool.query(`
        SELECT 
          COUNT(*)::integer as count,
          COALESCE(SUM(price), 0)::numeric as revenue
        FROM transactions
        WHERE datetime >= $1 AND datetime <= $2
      `, [startOfToday, endOfToday]);

      const data = {
        count: parseInt(result.rows[0]?.count || '0'),
        revenue: parseFloat(result.rows[0]?.revenue || '0'),
        date: today.toISOString().split('T')[0]
      };

      res.json(data);
    } catch (error) {
      console.error('Fehler beim Abrufen der heutigen Performance-Daten:', error);
      res.status(500).json({ 
        error: 'Fehler beim Abrufen der Performance-Daten',
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });

  // DIRECT HOLIDAYS API ENDPOINT - BYPASS ROUTING CONFLICTS  
  app.get('/api/holidays', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      let query = `SELECT * FROM holidays WHERE 1=1`;
      const params = [];
      
      if (startDate) {
        query += ` AND date >= $${params.length + 1}`;
        params.push(startDate);
      }
      
      if (endDate) {
        query += ` AND date <= $${params.length + 1}`;
        params.push(endDate);
      }
      
      query += ` ORDER BY date ASC`;
      
      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Fehler beim Abrufen der Feiertage:', error);
      res.status(500).json({ 
        success: false,
        error: 'Fehler beim Abrufen der Feiertage',
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });

  // COMPREHENSIVE DEBUGGING ENDPOINT FOR LOCATION STATUS DATA
  app.get('/api/debug/location-status/:location', async (req, res) => {
    try {
      const location = req.params.location;
      console.log(`🔍 DEBUGGING location status for: ${location}`);
      
      const debug: any = {
        location,
        timestamp: new Date().toISOString(),
        queries: {}
      };

      // 1. Check recent transactions
      const transactionsResult = await pool.query(`
        SELECT 
          datetime,
          product_name,
          price
        FROM transactions 
        WHERE location_name = $1 
          AND datetime >= NOW() - INTERVAL '7 days'
        ORDER BY datetime DESC
        LIMIT 10
      `, [location]);
      
      debug.queries.recentTransactions = {
        count: transactionsResult.rows.length,
        latest: transactionsResult.rows[0]?.datetime,
        data: transactionsResult.rows
      };

      // 2. Check cashless sales specifically
      const cashlessResult = await pool.query(`
        SELECT 
          datetime,
          payment_method
        FROM transactions 
        WHERE location_name = $1 
          AND payment_method != 'CASH'
          AND datetime >= NOW() - INTERVAL '7 days'
        ORDER BY datetime DESC
        LIMIT 5
      `, [location]);
      
      debug.queries.cashlessSales = {
        count: cashlessResult.rows.length,
        latest: cashlessResult.rows[0]?.datetime,
        data: cashlessResult.rows
      };

      // 3. Check door events (multiple possible field names)
      const doorEventsResult = await pool.query(`
        SELECT 
          event_datetime,
          event_type,
          event_name,
          machine_id
        FROM events 
        WHERE machine_id IN (
          SELECT id FROM machines WHERE location_name = $1
        )
        AND (event_type = 'A' OR event_name LIKE '%door%' OR event_name LIKE '%open%')
        AND event_datetime >= NOW() - INTERVAL '7 days'
        ORDER BY event_datetime DESC
        LIMIT 10
      `, [location]);
      
      debug.queries.doorEvents = {
        count: doorEventsResult.rows.length,
        latest: doorEventsResult.rows[0]?.event_datetime,
        data: doorEventsResult.rows
      };

      // 4. Check refills
      const refillsResult = await pool.query(`
        SELECT 
          datetime as refill_datetime,
          machine_id
        FROM refills 
        WHERE machine_id IN (
          SELECT id FROM machines WHERE location_name = $1
        )
        AND datetime >= NOW() - INTERVAL '7 days'
        ORDER BY datetime DESC
        LIMIT 10
      `, [location]);
      
      debug.queries.refills = {
        count: refillsResult.rows.length,
        latest: refillsResult.rows[0]?.refill_datetime,
        data: refillsResult.rows
      };

      // 5. Check machines for this location
      const machinesResult = await pool.query(`
        SELECT id, machine_name, location_name, status 
        FROM machines 
        WHERE location_name = $1
      `, [location]);
      
      debug.queries.machines = {
        count: machinesResult.rows.length,
        data: machinesResult.rows
      };

      console.log(`🔍 Debug results for ${location}:`, JSON.stringify(debug, null, 2));
      
      res.json({
        success: true,
        debug
      });
    } catch (error) {
      console.error('Debug location status error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Debug failed',
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // COMPREHENSIVE DEBUGGING ENDPOINT FOR PHOTO UPLOAD FUNCTIONALITY
  app.get('/api/debug/photo-upload', async (req, res) => {
    try {
      console.log('🔍 DEBUGGING photo upload functionality');
      
      const debug: any = {
        timestamp: new Date().toISOString(),
        uploads: {},
        database: {},
        filesystem: {}
      };

      // Check uploads directory
      const fs = await import('fs/promises');
      try {
        const uploadsStats = await fs.stat('uploads');
        debug.filesystem.uploadsDir = {
          exists: true,
          isDirectory: uploadsStats.isDirectory(),
          permissions: uploadsStats.mode.toString(8)
        };
        
        const uploadsContents = await fs.readdir('uploads', { withFileTypes: true });
        debug.filesystem.uploadsContents = uploadsContents.map(item => ({
          name: item.name,
          isFile: item.isFile(),
          isDirectory: item.isDirectory()
        }));
      } catch (fsError) {
        debug.filesystem.uploadsDir = {
          exists: false,
          error: fsError instanceof Error ? fsError.message : 'Unknown filesystem error'
        };
      }

      // Check products with photos in database
      const productsWithPhotosResult = await pool.query(`
        SELECT 
          id,
          product_name,
          photo_url,
          updated_at
        FROM products 
        WHERE photo_url IS NOT NULL 
          AND photo_url != ''
        ORDER BY updated_at DESC
        LIMIT 10
      `);
      
      debug.database.productsWithPhotos = {
        count: productsWithPhotosResult.rows.length,
        data: productsWithPhotosResult.rows
      };

      // Check recent photo upload attempts (if logs exist)
      try {
        const recentUploads = await pool.query(`
          SELECT 
            product_id,
            filename,
            upload_time,
            success
          FROM upload_logs 
          WHERE upload_time >= NOW() - INTERVAL '1 day'
          ORDER BY upload_time DESC
          LIMIT 10
        `);
        
        debug.database.recentUploads = {
          count: recentUploads.rows.length,
          data: recentUploads.rows
        };
      } catch (logError) {
        debug.database.recentUploads = {
          error: 'Upload logs table not found or accessible'
        };
      }

      // Check static file serving path
      debug.uploads.staticPath = `/uploads (served from ${path.join(process.cwd(), 'uploads')})`;
      debug.uploads.expectedPhotoPath = 'Example: /uploads/products/productId_timestamp.jpg';

      console.log('🔍 Photo upload debug results:', JSON.stringify(debug, null, 2));
      
      res.json({
        success: true,
        debug
      });
    } catch (error) {
      console.error('Debug photo upload error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Photo upload debug failed',
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });



  // Register supplier analytics router BEFORE Vite to prevent routing conflicts
  app.use('/api/supplier-analytics', supplierAnalyticsRouter);
  app.use('/api/suppliers-fast', suppliersFastRouter);
  app.use('/api/support-tickets', supportTicketsRouter);
  
  // Location status router already registered above before registerRoutes
  // app.use('/api/location-status', locationStatusRouter); // MOVED ABOVE

  // Register enhanced order copy router
  const enhancedOrderCopyRouter = (await import('./routes/enhanced-order-copy')).default;
  app.use('/api/enhanced-order-copy', enhancedOrderCopyRouter);

  // Register critical inventory routes
  app.use('/api/critical-inventory', criticalInventoryRouter);
  app.use('/api', criticalInventoryWorkingRouter);
  app.use('/api', criticalInventoryFinalRouter);
  app.use('/api', inventoryHealthRouter);
  
  // Register direct SQL router
  app.use('/api', directSqlRouter);

  // Serve static files for uploads (CRITICAL for photo upload functionality)
  const uploadsPath = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath));
  console.log('✓ Static file serving for uploads configured at /uploads');


  
  // Legacy endpoint for backward compatibility
  app.get('/api/product-categories', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT name FROM product_categories WHERE is_active = true ORDER BY sort_order ASC, name ASC
      `);
      res.json(result.rows.map(row => row.name));
    } catch (error) {
      console.error('Fehler beim Laden der Produktkategorien:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Produktkategorien' });
    }
  });

  // COMPREHENSIVE PHOTO UPLOAD WITH IMAGE PROCESSING
  app.post('/api/photos/upload', async (req, res) => {
    try {
      console.log('Photo upload request received');
      console.log('Files:', req.files);
      console.log('Body:', req.body);
      console.log('Content-Type:', req.headers['content-type']);
      
      if (!req.files) {
        return res.status(400).json({
          success: false,
          error: 'Keine Dateien hochgeladen'
        });
      }
      
      const { imageProcessor } = await import('./services/imageProcessor');
      const uploadedPhotos = [];
      
      // Handle different file field scenarios
      const files: any[] = [];
      
      // Check for 'photos' field (array or single)
      if ((req.files as any).photos) {
        const photosField = (req.files as any).photos;
        if (Array.isArray(photosField)) {
          files.push(...photosField);
        } else {
          files.push(photosField);
        }
      }
      
      // Check for 'photo' field (single file)
      if ((req.files as any).photo) {
        const photoField = (req.files as any).photo;
        if (Array.isArray(photoField)) {
          files.push(...photoField);
        } else {
          files.push(photoField);
        }
      }
      
      // Check for any other file fields
      if (files.length === 0) {
        for (const [fieldName, fileData] of Object.entries(req.files)) {
          console.log(`Found file field: ${fieldName}`);
          if (Array.isArray(fileData)) {
            files.push(...fileData);
          } else {
            files.push(fileData);
          }
        }
      }
      
      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Keine gültigen Bilddateien gefunden',
          debug: {
            filesReceived: req.files,
            fieldsFound: Object.keys(req.files)
          }
        });
      }
      
      console.log(`Processing ${files.length} files`);
      
      for (const file of files) {
        try {
          // Validate file type
          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
          if (!allowedTypes.includes(file.mimetype)) {
            console.warn(`Skipping invalid file type: ${file.mimetype}`);
            continue;
          }
          
          // Process image with multiple sizes
          const processedImages = await imageProcessor.processImage(
            file.data,
            file.name,
            {
              maxWidth: 1200,
              maxHeight: 1200,
              quality: 85,
              format: 'webp',
              sizes: [
                { suffix: '_thumb', width: 150, height: 150 },
                { suffix: '_medium', width: 400, height: 400 },
                { suffix: '_large', width: 800, height: 800 }
              ]
            }
          );
          
          // Store main image info
          const mainImage = processedImages[0];
          uploadedPhotos.push({
            filename: mainImage.filename,
            originalname: file.name,
            url: mainImage.url,
            size: mainImage.size,
            width: mainImage.width,
            height: mainImage.height,
            format: mainImage.format,
            variants: processedImages.slice(1).map(img => ({
              suffix: img.filename.includes('_thumb') ? '_thumb' : 
                      img.filename.includes('_medium') ? '_medium' : '_large',
              url: img.url,
              width: img.width,
              height: img.height
            }))
          });
          
        } catch (fileError) {
          console.error(`Error processing file ${file.name}:`, fileError);
        }
      }
      
      if (uploadedPhotos.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Keine Bilder konnten verarbeitet werden'
        });
      }
      
      console.log(`Successfully processed ${uploadedPhotos.length} photos`);
      
      res.json({
        success: true,
        message: `${uploadedPhotos.length} Foto(s) erfolgreich hochgeladen und verarbeitet`,
        uploadedPhotos: uploadedPhotos,
        photos: uploadedPhotos.map(photo => ({
          url: photo.url,
          filename: photo.filename
        }))
      });
      
    } catch (error) {
      console.error('Photo upload error:', error);
      res.status(500).json({
        success: false,
        error: 'Fehler beim Hochladen der Fotos',
        message: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

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

    // Start Supplier Analytics Cache Background Service
    const supplierAnalyticsCache = SupplierAnalyticsCache.getInstance();
    log('🔄 Starting Supplier Analytics Cache Background Service...');
    
    // Initial cache population
    try {
      await supplierAnalyticsCache.updateCache();
      log('✅ Initial Supplier Analytics Cache populated');
    } catch (error) {
      console.error('❌ Error populating initial Supplier Analytics Cache:', error);
    }
    
    // Set up hourly cache refresh
    setInterval(async () => {
      try {
        log('🔄 Hourly Supplier Analytics Cache refresh...');
        await supplierAnalyticsCache.updateCache();
        log('✅ Supplier Analytics Cache refreshed');
      } catch (error) {
        console.error('❌ Error refreshing Supplier Analytics Cache:', error);
      }
    }, 60 * 60 * 1000); // 1 hour in milliseconds
  });
})();
