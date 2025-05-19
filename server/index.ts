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
import { pool } from './db';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Konfiguriere den File-Upload-Handler mit angepassten Optionen
app.use(fileUpload());

// Direkter SQL-Endpunkt zum Speichern von Bestellungen für BestellungV3
app.post('/api/create-order-v3', async (req, res) => {
  try {
    const { 
      warehouseId, 
      supplierId, 
      orderItems, 
      expectedDeliveryDate, 
      notes,
      status = 'draft'
    } = req.body;
    
    if (!warehouseId || !supplierId) {
      return res.status(400).json({ 
        error: 'Fehlende Pflichtfelder', 
        message: 'Lager und Lieferant sind erforderlich'
      });
    }
    
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ 
        error: 'Keine Bestellpositionen', 
        message: 'Die Bestellung enthält keine Positionen'
      });
    }
    
    console.log('[v3] Erstelle Bestellung direkt über SQL:', { warehouseId, supplierId, itemCount: orderItems.length });
    
    // Transaktion starten
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Order-Nummer generieren (Datum + Zufallszahl)
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const randomStr = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${dateStr}-${randomStr}`;
      
      // Verwende die korrekten Spaltennamen aus der Datenbankstruktur
      const orderResult = await client.query(`
        INSERT INTO orders (
          location_id, 
          supplier_id, 
          order_number, 
          status, 
          order_date, 
          expected_delivery_date, 
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        warehouseId, 
        supplierId, 
        orderNumber, 
        status, 
        new Date(), 
        expectedDeliveryDate ? new Date(expectedDeliveryDate) : null, 
        notes || ''
      ]);
      
      const newOrder = orderResult.rows[0];
      
      // Bestellpositionen einfügen mit korrekten Spaltennamen
      for (const item of orderItems) {
        await client.query(`
          INSERT INTO order_items (
            order_id, 
            product_id, 
            quantity, 
            unit_price, 
            unit,
            product_name
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          newOrder.id, 
          item.productId, 
          item.quantity, 
          item.price || 0, // price wird als unit_price in der Datenbank gespeichert
          item.unit || 'Stück',
          item.productName || 'Unbekanntes Produkt'
        ]);
      }
      
      // Transaktion abschließen
      await client.query('COMMIT');
      
      console.log(`[v3] Bestellung ${orderNumber} (ID: ${newOrder.id}) erfolgreich erstellt mit ${orderItems.length} Positionen`);
      
      return res.json({
        success: true,
        data: newOrder,
        message: `Bestellung ${orderNumber} erfolgreich erstellt`
      });
      
    } catch (error) {
      // Bei Fehlern Transaktion zurückrollen
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Client freigeben
      client.release();
    }
    
  } catch (error) {
    console.error('[v3] Fehler beim Erstellen der Bestellung:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Erstellen der Bestellung', 
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false
    });
  }
});

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

(async () => {
  // Die neuen Inventory-Routen hinzufügen
  app.use(inventoryApiRouter);
  app.use('/api', inventoryRouter);
  
  // Einfache E-Mail-Route ohne PDF-Anhang
  app.use('/api', simpleEmailRouter); // Vereinfachte E-Mail-Funktion ohne PDF
  
  // E-Mail-Vorlagen-Route hinzufügen
  app.use('/api/mail-templates', mailTemplatesRouter);
  
  // Direkten Datenbank-Zugriff für Bestellung V3 bereitstellen
  app.use('/api', dbDirectRouter);
  
  // Direkten SQL-Zugriff für Bestellungen und andere DB-Abfragen bereitstellen
  app.use('/api', directSqlRouter);
  
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
