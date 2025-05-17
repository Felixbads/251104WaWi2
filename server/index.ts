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
import emailRouter from './routes/email';
import mailTemplatesRouter from './routes/mail-templates';
import pdfRouter from './routes/pdf';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Konfiguriere den File-Upload-Handler mit angepassten Optionen
app.use(fileUpload());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

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
  
  // E-Mail-Route für PDF-Vorschau und Versand hinzufügen
  app.use('/api', emailRouter);
  
  // E-Mail-Vorlagen-Route hinzufügen
  app.use('/api/mail-templates', mailTemplatesRouter);
  
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
