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
  
  // Order V3 Router für die neue Bestellungsversion
  app.use('/api', orderV3Router);
  
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

  // Try different ports to avoid conflicts
  // We'll attempt to use ports in this order: 5000, 5001, 5002, 5003, 5004, 5005
  const attemptListen = (ports: number[], index = 0) => {
    if (index >= ports.length) {
      log(`Failed to bind to any port after trying all options`);
      process.exit(1);
      return;
    }
    
    const port = ports[index];
    log(`Attempting to listen on port ${port}...`);
    
    try {
      const s = server.listen({
        port,
        host: "0.0.0.0",
      });
      
      s.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          log(`Port ${port} is already in use, trying next port...`);
          s.close();
          attemptListen(ports, index + 1);
        } else {
          log(`Server error: ${err.message}`);
          process.exit(1);
        }
      });
      
      s.on('listening', async () => {
        log(`Server successfully started on port ${port}`);
        
        // Starte die automatische Synchronisierung
        log('Initialisiere automatisches Synchronisierungssystem...');
        startAutomaticSync();
        
        // Führen wir einen initialen Lagerabgleich beim Start durch
        try {
          log('Starte initialen Lagerabgleich beim Serverstart (NUR Produkte aus zugewiesenen Automaten)...');
          reconcileWarehouseProducts(undefined, false, true)
            .then((result) => {
              log(`Initialer Lagerabgleich abgeschlossen: 
              - ${result.productsAdded} neue Produkte aus Automaten zu ${result.warehousesChecked} Lagern hinzugefügt
              - Keine zusätzlichen Produkte aus dem Gesamtportfolio hinzugefügt`);
            })
            .catch((err) => {
              log(`Fehler beim initialen Lagerabgleich: ${err instanceof Error ? err.message : String(err)}`);
            });
        } catch (err) {
          log(`Fehler beim Starten des initialen Lagerabgleichs: ${err instanceof Error ? err.message : String(err)}`);
        }
        
        log('Automatischer täglicher Lagerabgleich ist aktiviert und erfolgt alle 24 Stunden.');
      });
    } catch (err) {
      log(`Fatal error starting server: ${err instanceof Error ? err.message : String(err)}`);
      attemptListen(ports, index + 1);
    }
  };
  
  // Start with these port options
  attemptListen([5000, 5001, 5002, 5003, 5004, 5005]);
})();
