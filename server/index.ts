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
import { pool } from './db';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Konfiguriere den File-Upload-Handler mit angepassten Optionen
app.use(fileUpload());

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
      o.total_amount,
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
  
  const server = await registerRoutes(app);

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
      
      return res.json(result.rows);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellpositionen:', error);
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
    
    // Starte die automatische Synchronisierung
    log('Initialisiere automatisches Synchronisierungssystem...');
    startAutomaticSync();
    
    // Führen wir einen initialen Lagerabgleich beim Start durch
    try {
      log('Starte initialen Lagerabgleich beim Serverstart (NUR Produkte aus zugewiesenen Automaten)...');
      reconcileWarehouseProducts(undefined, false, true).then(result => {
        log(`Initialer Lagerabgleich abgeschlossen: 
        - ${result.productsAdded} neue Produkte aus Automaten zu ${result.warehousesChecked} Lagern hinzugefügt
        - Keine zusätzlichen Produkte aus dem Gesamtportfolio hinzugefügt, um Duplikate zu vermeiden`);
      }).catch(error => {
        log(`Fehler beim initialen Lagerabgleich: ${error.message}`);
      });
    } catch (error) {
      log(`Fehler beim Starten des initialen Lagerabgleichs: ${error.message}`);
    }
    
    log('Automatischer täglicher Lagerabgleich ist aktiviert und erfolgt alle 24 Stunden.');
  });
})();
