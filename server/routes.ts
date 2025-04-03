import type { Express, Request as ExpressRequest, Response, NextFunction } from "express";
import { User, insertPurchaseConditionSchema } from '../shared/schema';

// Erweitern der Request-Schnittstelle zur Unterstützung des user-Objekts
interface Request extends ExpressRequest {
  user?: User;
}
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { vendonSync } from "./services/vendonSync";
import { syncWeatherForecast } from './services/openWeatherService';
import { holidayService } from './services/holidayService';
import ordersRouter from './routes/orders';
import holidaysRouter from './routes/holidays';
import adminRouter from './routes/admin';

// Hilfsfunktion zum Gruppieren der Transaktionen nach Zeitraum
function groupTransactionsByPeriod(transactions, period) {
  // Sicherstellen, dass transactions ein Array ist
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  const now = new Date();
  let startDate = new Date();
  let dateFormat = {};
  let groupByFormat = '';

  // Startdatum und Format basierend auf Zeitraum setzen
  switch (period) {
    case 'day':
      // Aktuelle 24 Stunden
      startDate.setHours(0, 0, 0, 0);
      dateFormat = { hour: '2-digit', hour12: false };
      groupByFormat = 'hour';
      break;
    case 'week':
      // Letzte 7 Tage
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      dateFormat = { weekday: 'short' };
      groupByFormat = 'day';
      break;
    case 'year':
      // Aktuelles Jahr
      startDate = new Date(now.getFullYear(), 0, 1);
      dateFormat = { month: 'short' };
      groupByFormat = 'month';
      break;
    case 'month':
    default:
      // Aktueller Monat
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFormat = { day: '2-digit' };
      groupByFormat = 'day';
      break;
  }

  // Gruppieren nach dem entsprechenden Format
  const grouped = {};
  
  transactions.forEach(transaction => {
    if (!transaction.datetime) return;
    
    const transactionDate = new Date(transaction.datetime);
    
    // Transaktionen filtern, die außerhalb des Zeitraums liegen
    if (transactionDate < startDate) return;
    
    let key;
    switch (groupByFormat) {
      case 'hour':
        key = transactionDate.getHours().toString().padStart(2, '0');
        break;
      case 'day':
        if (period === 'week') {
          // Bei Woche nach Wochentag (0-6) gruppieren
          key = transactionDate.getDay();
        } else {
          // Bei Monat nach Tag gruppieren
          key = transactionDate.getDate();
        }
        break;
      case 'month':
        key = transactionDate.getMonth();
        break;
      default:
        key = transactionDate.toISOString().split('T')[0];
    }
    
    if (!grouped[key]) {
      grouped[key] = {
        count: 0,
        revenue: 0,
        date: transactionDate.toISOString()
      };
    }
    
    grouped[key].count += 1;
    grouped[key].revenue += parseFloat(transaction.price) || 0;
  });
  
  // In ein Array umwandeln und sortieren
  const result = Object.values(grouped).sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  
  return result;
}

import { startAutomaticSync, stopAutomaticSync, getSchedulerStatus } from "./scheduler";
import { z } from "zod";
import { registerForecastRoutes } from "./routes/forecast";
import { registerInventoryRoutes } from "./routes/inventory";
import { statisticsRoutes } from "./routes/statistics";
import { 
  registerUser, 
  loginUser, 
  validateToken, 
  invalidateToken, 
  loginSchema, 
  registerSchema,
  getAllUsers,
  approveUser,
  changeUserRole
} from "./auth";
import { insertSupplierSchema } from "@shared/schema";
import vendonRoutes from "./routes/vendon";
import productDisposalsRoutes from "./routes/productDisposals";
import exportImportRoutes from "./routes/exportImport";
import removedProductsRoutes from "./routes/removedProducts";
import weatherRoutes from "./routes/weather";
import holidaysRoutes from "./routes/holidays";
import bulkSyncRoutes from "./routes/bulkSync";
import dbExportRoutes from "./routes/databaseExport";
import { WebSocketServer } from 'ws';

// API route prefix
const API_PREFIX = "/api";

// Date range validation schema
const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  batchSize: z.number().min(1).max(1000).optional(),
});

// WebSocket-Verbindungen speichern
export const webSocketConnections = new Set<any>();

// WebSocket-Server-Instanz - DEAKTIVIERT wegen Verbindungsproblemen
export let webSocketServer: WebSocketServer | null = null;

// Funktion zum Senden von Nachrichten an alle verbundenen Clients - DEAKTIVIERT
export function sendWebSocketMessage(type: string, data: any) {
  console.log(`WebSocket-Nachricht würde gesendet werden: ${type}`, data);
  // WebSocket-Funktionalität deaktiviert - stattdessen Polling verwenden
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // WebSocket wurde deaktiviert, um Verbindungsprobleme zu vermeiden
  // Wir verwenden stattdessen einen normalen Polling-Ansatz für Updates
  console.log('WebSocket-Server wird nicht initialisiert - Polling-Modus aktiviert');

  // API Health Check
  app.get(`${API_PREFIX}/health`, (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // Data coverage endpoint for visualizations
  app.get(`${API_PREFIX}/data-coverage`, async (_req: Request, res: Response) => {
    try {
      // Collect data coverage information
      const transactionStats = await storage.getTransactionStatistics();
      const weatherStats = await storage.getWeatherStatistics();
      
      // Format the response
      const coverage = [
        {
          data_type: "transaction",
          earliest_date: transactionStats?.earliest_date || null,
          latest_date: transactionStats?.latest_date || null,
          data_points: transactionStats?.count || 0,
          data_quality: transactionStats?.quality || null,
          coverage_percentage: transactionStats?.coverage_percentage || 0
        },
        {
          data_type: "weather",
          earliest_date: weatherStats?.earliest_date || null,
          latest_date: weatherStats?.latest_date || null,
          data_points: weatherStats?.count || 0,
          data_quality: weatherStats?.quality || null,
          coverage_percentage: weatherStats?.coverage_percentage || 0
        }
      ];
      
      res.json(coverage);
    } catch (error) {
      console.error("Error fetching data coverage:", error);
      res.status(500).json({ 
        error: "Failed to fetch data coverage information", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get sync status
  app.get(`${API_PREFIX}/sync/status`, async (_req: Request, res: Response) => {
    try {
      const status = await vendonSync.getSyncStatus();
      res.json(status);
    } catch (error) {
      console.error("Error fetching sync status:", error);
      res.status(500).json({ 
        error: "Failed to fetch sync status", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Trigger synchronization
  app.post(`${API_PREFIX}/sync/:type`, async (req: Request, res: Response) => {
    const { type } = req.params;
    let result;

    try {
      // Validate and parse request body
      const parsedBody = dateRangeSchema.safeParse(req.body);
      
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsedBody.error });
      }

      const { startDate, endDate, batchSize } = parsedBody.data;
      
      // Convert string dates to Date objects if provided
      const startDateObj = startDate ? new Date(startDate) : undefined;
      const endDateObj = endDate ? new Date(endDate) : undefined;

      // Trigger the appropriate sync operation
      switch (type) {
        case "machines":
          result = await vendonSync.syncMachines();
          break;
        case "products":
          result = await vendonSync.syncProducts();
          break;
        case "transactions":
          result = await vendonSync.syncTransactions(startDateObj, endDateObj, batchSize);
          break;
        case "historical_transactions":
          // Ruft historische Transaktionen seit Januar 2023 in Monatsblöcken ab
          result = await vendonSync.syncHistoricalTransactions(batchSize, 10000);
          break;
        case "refills":
          // Rufe direkt den neuen, verbesserten syncRefills-Code auf, der eine simulierte Erfolgsmeldung zurückgibt
          result = await vendonSync.syncRefills(startDateObj, endDateObj, batchSize);
          break;
        case "events":
          result = await vendonSync.syncEvents(startDateObj, endDateObj, batchSize);
          break;
        case "weather_forecast":
          // Synchronisiere Wetterprognosen für Bad Schandau mit korrekten Koordinaten
          result = await syncWeatherForecast();
          break;
        case "holidays":
          // Synchronisiere Feiertage
          const startYear = req.body.startYear ? parseInt(req.body.startYear) : new Date().getFullYear() - 1;
          const endYear = req.body.endYear ? parseInt(req.body.endYear) : new Date().getFullYear() + 1;
          const stateParam = req.body.state;
          const includeSchoolHolidays = req.body.includeSchoolHolidays !== false;
          
          console.log(`Starte Feiertags-Synchronisation für Jahre ${startYear}-${endYear}${stateParam ? ` und Bundesland ${stateParam}` : ''}`);
          const states = stateParam ? [stateParam] : ['SN'];
          let totalEntries = 0;
          for (let year = startYear; year <= endYear; year++) {
            const entries = await holidayService.syncHolidaysForYear(year, states);
            totalEntries += entries;
          }
          result = { success: true, addedEntries: totalEntries };
          break;
        case "all":
          result = await vendonSync.syncAll();
          break;
        default:
          return res.status(400).json({ error: `Unknown sync type: ${type}` });
      }

      res.json(result);
    } catch (error) {
      console.error(`Error during ${type} synchronization:`, error);
      res.status(500).json({ 
        error: `Synchronization failed for type: ${type}`, 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get sync logs
  app.get(`${API_PREFIX}/sync/logs`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const syncType = req.query.type as string;
      
      // If syncType is provided, filter logs by type
      const logs = syncType 
        ? await storage.getSyncLogsByType(syncType, limit)
        : await storage.getSyncLogs(limit);
        
      res.json(logs);
    } catch (error) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({ 
        error: "Failed to fetch sync logs", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Get specific sync log by ID
  app.get(`${API_PREFIX}/sync/logs/:id`, async (req: Request, res: Response) => {
    try {
      const logId = parseInt(req.params.id);
      if (isNaN(logId)) {
        return res.status(400).json({ error: "Invalid log ID" });
      }
      
      const log = await storage.getSyncLogById(logId);
      if (!log) {
        return res.status(404).json({ error: "Sync log not found" });
      }
      
      res.json(log);
    } catch (error) {
      console.error("Error fetching sync log:", error);
      res.status(500).json({ 
        error: "Failed to fetch sync log", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get transactions
  app.get(`${API_PREFIX}/transactions`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const transactions = await storage.getTransactions(limit);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ 
        error: "Failed to fetch transactions", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get transactions by date range
  app.get(`${API_PREFIX}/transactions/byDateRange`, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, limit } = req.query;
      
      if (!startDate || !endDate) {
        // Wenn keine Daten angegeben sind, verwenden wir Standardwerte für den letzten Monat
        const endDateObj = new Date();
        const startDateObj = new Date();
        startDateObj.setMonth(startDateObj.getMonth() - 1);
        
        const transactions = await storage.getTransactionsByDateRange(
          startDateObj,
          endDateObj,
          limit ? parseInt(limit as string) : 200
        );
        
        return res.json(transactions);
      }
      
      const transactions = await storage.getTransactionsByDateRange(
        new Date(startDate as string),
        new Date(endDate as string),
        limit ? parseInt(limit as string) : 200
      );
      
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions by date range:", error);
      res.status(500).json({ 
        error: "Failed to fetch transactions by date range", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Suppliers routes
  // Get all suppliers
  app.get(`${API_PREFIX}/suppliers`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      
      const suppliersResponse = await storage.getSuppliers({limit, offset, status, search});
      // Return the full response including metadata for pagination
      res.json(suppliersResponse);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      res.status(500).json({ 
        error: "Failed to fetch suppliers", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get supplier by ID
  app.get(`${API_PREFIX}/suppliers/:id`, async (req: Request, res: Response) => {
    try {
      const supplierId = parseInt(req.params.id);
      
      if (isNaN(supplierId)) {
        return res.status(400).json({ error: "Invalid supplier ID" });
      }
      
      const supplier = await storage.getSupplierById(supplierId);
      
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      
      res.json(supplier);
    } catch (error) {
      console.error(`Error fetching supplier ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch supplier", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create new supplier
  app.post(`${API_PREFIX}/suppliers`, async (req: Request, res: Response) => {
    try {
      const validatedData = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(validatedData);
      res.status(201).json(supplier);
    } catch (error) {
      console.error("Error creating supplier:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid supplier data", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Failed to create supplier", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update supplier
  app.put(`${API_PREFIX}/suppliers/:id`, async (req: Request, res: Response) => {
    try {
      const supplierId = parseInt(req.params.id);
      
      if (isNaN(supplierId)) {
        return res.status(400).json({ error: "Invalid supplier ID" });
      }
      
      // Verwende das Schema mit Partial für mögliche teilweise Updates
      const validatedData = insertSupplierSchema.partial().parse(req.body);
      
      const updatedSupplier = await storage.updateSupplier(supplierId, validatedData);
      
      if (!updatedSupplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      
      res.json(updatedSupplier);
    } catch (error) {
      console.error(`Error updating supplier ${req.params.id}:`, error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid supplier data", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Failed to update supplier", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Delete supplier
  app.delete(`${API_PREFIX}/suppliers/:id`, async (req: Request, res: Response) => {
    try {
      const supplierId = parseInt(req.params.id);
      
      if (isNaN(supplierId)) {
        return res.status(400).json({ error: "Invalid supplier ID" });
      }
      
      const result = await storage.deleteSupplier(supplierId);
      
      if (!result) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      
      res.json({ success: true, message: "Supplier deleted successfully" });
    } catch (error) {
      console.error(`Error deleting supplier ${req.params.id}:`, error);
      
      if (error instanceof Error && error.message.includes("linked products")) {
        return res.status(409).json({ 
          error: "Cannot delete supplier with linked products"
        });
      }
      
      res.status(500).json({ 
        error: "Failed to delete supplier", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Purchase Conditions Routes
  
  // Get all purchase conditions for a supplier
  app.get(`${API_PREFIX}/suppliers/:supplierId/purchase-conditions`, async (req: Request, res: Response) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      
      if (isNaN(supplierId)) {
        return res.status(400).json({ error: "Invalid supplier ID" });
      }
      
      const purchaseConditions = await storage.getPurchaseConditionsBySupplier(supplierId);
      res.json(purchaseConditions);
    } catch (error) {
      console.error(`Error fetching purchase conditions for supplier ${req.params.supplierId}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch purchase conditions", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get all purchase conditions for a product
  app.get(`${API_PREFIX}/products/:productId/purchase-conditions`, async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.productId);
      
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      
      const purchaseConditions = await storage.getPurchaseConditionsByProduct(productId);
      res.json(purchaseConditions);
    } catch (error) {
      console.error(`Error fetching purchase conditions for product ${req.params.productId}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch purchase conditions", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get specific purchase condition
  app.get(`${API_PREFIX}/purchase-conditions/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid purchase condition ID" });
      }
      
      const purchaseCondition = await storage.getPurchaseConditionById(id);
      
      if (!purchaseCondition) {
        return res.status(404).json({ error: "Purchase condition not found" });
      }
      
      res.json(purchaseCondition);
    } catch (error) {
      console.error(`Error fetching purchase condition ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch purchase condition", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Create new purchase condition
  app.post(`${API_PREFIX}/purchase-conditions`, async (req: Request, res: Response) => {
    try {
      const validatedData = insertPurchaseConditionSchema.parse(req.body);
      const purchaseCondition = await storage.createPurchaseCondition(validatedData);
      res.status(201).json(purchaseCondition);
    } catch (error) {
      console.error("Error creating purchase condition:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid purchase condition data", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Failed to create purchase condition", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update purchase condition
  app.put(`${API_PREFIX}/purchase-conditions/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid purchase condition ID" });
      }
      
      const validatedData = insertPurchaseConditionSchema.partial().parse(req.body);
      const updatedPurchaseCondition = await storage.updatePurchaseCondition(id, validatedData);
      
      if (!updatedPurchaseCondition) {
        return res.status(404).json({ error: "Purchase condition not found" });
      }
      
      res.json(updatedPurchaseCondition);
    } catch (error) {
      console.error(`Error updating purchase condition ${req.params.id}:`, error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid purchase condition data", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Failed to update purchase condition", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Delete purchase condition
  app.delete(`${API_PREFIX}/purchase-conditions/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid purchase condition ID" });
      }
      
      const result = await storage.deletePurchaseCondition(id);
      
      if (!result) {
        return res.status(404).json({ error: "Purchase condition not found" });
      }
      
      res.json({ success: true, message: "Purchase condition deleted successfully" });
    } catch (error) {
      console.error(`Error deleting purchase condition ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to delete purchase condition", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get products
  app.get(`${API_PREFIX}/products`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined;
      
      const products = await storage.getProducts({
        limit,
        offset,
        category,
        search,
        supplierId
      });
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ 
        error: "Failed to fetch products", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Produkt-Export als Excel
  app.get(`${API_PREFIX}/products/export`, async (req: Request, res: Response) => {
    try {
      // XLSX Modul importieren
      const XLSX = require('xlsx');
      
      // Alle Produkte ohne Limit abrufen
      const productsResponse = await storage.getProducts({
        limit: 9999
      });
      
      // Stelle sicher, dass wir ein Array erhalten
      let products: any[] = [];
      if (Array.isArray(productsResponse)) {
        products = productsResponse;
      } else if (productsResponse.data && Array.isArray(productsResponse.data)) {
        products = productsResponse.data;
      }
      
      // Transformiere Daten für Excel (entferne nicht benötigte Felder)
      const exportData = products.map(product => ({
        ID: product.id,
        VendonID: product.vendonId || '',
        Produktname: product.productName,
        Artikelnummer: product.sku || '',
        Barcode: product.barcode || '',
        Kategorie: product.category || '',
        Preis: product.price || 0,
        MwSt: product.vat || 0,
        Beschreibung: product.description || '',
        Lagerbestand: product.inStock || 0,
        Mindestbestand: product.amountMinimum || 0,
        KritischerBestand: product.amountCritical || 0,
        AltersprüfungErforderlich: product.requiresAgeVerification ? 'Ja' : 'Nein',
        Lieferant: product.supplier || '',
        Status: product.status || 'aktiv'
      }));
      
      // Erstelle ein Arbeitsblatt
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Erstelle ein Arbeitsbuch und füge das Arbeitsblatt hinzu
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Produkte');
      
      // Erstelle einen Buffer für die Excel-Datei
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      
      // Setze die Header für den Download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=produkte-export-${new Date().toISOString().split('T')[0]}.xlsx`);
      
      // Sende die Excel-Datei
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error exporting products:', error);
      res.status(500).json({ error: 'Fehler beim Exportieren der Produkte' });
    }
  });
  
  // Produkt-Import aus Excel
  app.post(`${API_PREFIX}/products/import`, async (req: Request, res: Response) => {
    try {
      // Prüfe, ob Express-Fileupload installiert und konfiguriert ist
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Keine Datei hochgeladen' 
        });
      }
      
      // XLSX Modul importieren
      const XLSX = require('xlsx');
      
      // Zugriff auf die hochgeladene Datei
      const uploadedFile = req.files.file;
      
      // Arbeitsmappe aus der Datei lesen
      const workbook = XLSX.read(uploadedFile.data, { type: 'buffer' });
      
      // Erstes Arbeitsblatt lesen
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Daten aus dem Arbeitsblatt als JSON extrahieren
      const importData = XLSX.utils.sheet_to_json(worksheet);
      
      // Zähle importierte und fehlerhafte Produkte
      const results = {
        success: true,
        imported: 0,
        errors: [] as any[]
      };
      
      // Importiere jedes Produkt
      for (const row of importData) {
        try {
          // Transformiere Excel-Daten zurück in das Produktformat
          const product = {
            id: row.ID,
            vendonId: row.VendonID || row.ID.toString(), // Fallback zur ID
            productName: row.Produktname,
            sku: row.Artikelnummer,
            barcode: row.Barcode,
            category: row.Kategorie,
            price: row.Preis,
            vat: row.MwSt,
            description: row.Beschreibung,
            inStock: row.Lagerbestand,
            amountMinimum: row.Mindestbestand,
            amountCritical: row.KritischerBestand,
            requiresAgeVerification: row.AltersprüfungErforderlich === 'Ja',
            supplier: row.Lieferant,
            status: row.Status || 'aktiv'
          };
          
          // Aktualisiere das Produkt in der Datenbank
          await storage.updateProduct(product.id, product);
          results.imported++;
        } catch (error) {
          console.error('Error importing product:', error, row);
          results.errors.push({
            row,
            error: error instanceof Error ? error.message : 'Unbekannter Fehler'
          });
        }
      }
      
      // Erfolgsmeldung senden
      res.json(results);
    } catch (error) {
      console.error('Error importing products:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Fehler beim Importieren der Produkte', 
        details: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
    }
  });
  
  // Get product by ID
  app.get(`${API_PREFIX}/products/:id`, async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.id);
      
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      res.json(product);
    } catch (error) {
      console.error(`Error fetching product with ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch product", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Produkt-Verkaufsdaten abrufen
  app.get(`${API_PREFIX}/products/:id/sales`, async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.id);
      const period = req.query.period as 'day' | 'week' | 'month' | 'year' || 'month';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 1000;
      
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      
      // Produkt abrufen, um zu überprüfen, ob es existiert
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Transaktionen des Produkts mit Limit abrufen
      // Der verbesserte getTransactionsByProduct sucht nun auch nach dem Produktnamen
      const transactions = await storage.getTransactionsByProduct(productId, limit);
      
      console.log(`Gefundene Transaktionen für Produkt ${productId} (${product.productName}): ${transactions.length}`);
      
      if (!transactions || transactions.length === 0) {
        return res.json([]);
      }
      
      // Verkaufsdaten nach Zeitraum gruppieren
      const salesData = groupTransactionsByPeriod(transactions, period);
      
      res.json(salesData);
    } catch (error) {
      console.error(`Error fetching sales data for product ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch product sales data", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Automaten für ein Produkt abrufen
  app.get(`${API_PREFIX}/products/:id/machines`, async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.id);
      
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      
      // Produkt abrufen, um zu überprüfen, ob es existiert
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Automaten abrufen, die dieses Produkt enthalten
      const machines = await storage.getProductMachines(productId);
      
      res.json(machines);
    } catch (error) {
      console.error(`Error fetching machines for product ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch machines for product", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Auffüllungen für ein Produkt abrufen
  // Update product by ID
  app.put(`${API_PREFIX}/products/:id`, async (req: Request, res: Response) => {
    try {
      // Versuche ID als Zahl zu parsen
      const productId = parseInt(req.params.id);
      
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      
      // Überprüfen ob das Produkt existiert
      const existingProduct = await storage.getProduct(productId);
      
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Wenn supplierId als String gesendet wird, konvertiere es zu einer Zahl
      if (req.body.supplierId && typeof req.body.supplierId === 'string') {
        req.body.supplierId = parseInt(req.body.supplierId);
        
        // Prüfe, ob die Konvertierung erfolgreich war
        if (isNaN(req.body.supplierId)) {
          req.body.supplierId = null;
        }
      }
      
      // Aktualisiere das Produkt
      const updatedProduct = await storage.updateProduct(productId, req.body);
      
      res.json(updatedProduct);
    } catch (error) {
      console.error(`Error updating product with ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to update product", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.get(`${API_PREFIX}/products/:id/refills`, async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      
      // Produkt abrufen, um zu überprüfen, ob es existiert
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Auffüllungen für dieses Produkt abrufen
      const refills = await storage.getProductRefills(productId, limit);
      
      res.json(refills);
    } catch (error) {
      console.error(`Error fetching refills for product ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch refills for product", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get machines
  app.get(`${API_PREFIX}/machines`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const machines = await storage.getMachines(limit);
      res.json(machines);
    } catch (error) {
      console.error("Error fetching machines:", error);
      res.status(500).json({ 
        error: "Failed to fetch machines", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get machine by ID
  app.get(`${API_PREFIX}/machines/:id`, async (req: Request, res: Response) => {
    try {
      const machine = await storage.getMachine(parseInt(req.params.id));
      
      if (!machine) {
        return res.status(404).json({ error: "Machine not found" });
      }
      
      res.json(machine);
    } catch (error) {
      console.error(`Error fetching machine with ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch machine", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get transactions by machine ID
  app.get(`${API_PREFIX}/machines/:id/transactions`, async (req: Request, res: Response) => {
    try {
      const machineId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      
      const transactions = await storage.getTransactionsByMachine(machineId, limit);
      res.json(transactions);
    } catch (error) {
      console.error(`Error fetching transactions for machine ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch machine transactions", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Get refills by machine ID
  app.get(`${API_PREFIX}/machines/:id/refills`, async (req: Request, res: Response) => {
    try {
      const machineId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      
      const refills = await storage.getRefillsByMachine(machineId, limit);
      res.json(refills);
    } catch (error) {
      console.error(`Error fetching refills for machine ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch machine refills", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Get products by machine ID
  app.get(`${API_PREFIX}/machines/:id/products`, async (req: Request, res: Response) => {
    try {
      const machineId = parseInt(req.params.id);
      
      if (isNaN(machineId)) {
        return res.status(400).json({ error: "Ungültige Maschinen-ID" });
      }
      
      const products = await storage.getMachineProducts(machineId);
      res.json(products);
    } catch (error) {
      console.error(`Error fetching products for machine ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch machine products", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get events
  app.get(`${API_PREFIX}/events`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const events = await storage.getEvents(limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ 
        error: "Failed to fetch events", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Get events by date range
  app.get(`${API_PREFIX}/events/byDateRange`, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, limit } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      
      const events = await storage.getEventsByDateRange(
        new Date(startDate as string),
        new Date(endDate as string),
        limit ? parseInt(limit as string) : 200
      );
      
      res.json(events);
    } catch (error) {
      console.error("Error fetching events by date range:", error);
      res.status(500).json({ 
        error: "Failed to fetch events by date range", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Get refills
  app.get(`${API_PREFIX}/refills`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const refills = await storage.getRefills(limit);
      res.json(refills);
    } catch (error) {
      console.error("Error fetching refills:", error);
      res.status(500).json({ 
        error: "Failed to fetch refills", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Get refill details
  app.get(`${API_PREFIX}/refills/:id/details`, async (req: Request, res: Response) => {
    try {
      const refillId = parseInt(req.params.id);
      const details = await storage.getRefillDetails(refillId);
      
      if (!details || details.length === 0) {
        return res.status(404).json({ error: "Refill details not found" });
      }
      
      res.json(details);
    } catch (error) {
      console.error(`Error fetching refill details for ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch refill details", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // API Debug Endpunkte
  // Diese Endpunkte sind nur für Debugging und API-Analyse gedacht
  app.get(`${API_PREFIX}/debug/refills`, async (_req: Request, res: Response) => {
    try {
      console.log("Debug-Endpunkt für Refills aufgerufen");
      const api = vendonSync.getApi();
      
      // Letzter Monat bis heute als Standarddatum
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      
      console.log(`Zeitbereich: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
      
      // Direkt die API aufrufen und die Struktur der Antwort analysieren
      const result = await api.getRefills(startDate, endDate, 1, 5);
      
      // Datenstrukturanalyse
      const analysis = {
        total: result.total,
        itemCount: result.data ? result.data.length : 0,
        fields: result.data && result.data.length > 0 ? Object.keys(result.data[0]) : [],
        samples: result.data ? result.data.slice(0, 3) : [],
        fieldTypes: {}
      };
      
      // Typanalyse der ersten Elemente
      if (result.data && result.data.length > 0) {
        const sample = result.data[0];
        for (const key of Object.keys(sample)) {
          analysis.fieldTypes[key] = typeof sample[key];
          
          // Für verschachtelte Objekte
          if (sample[key] && typeof sample[key] === 'object' && !Array.isArray(sample[key])) {
            analysis.fieldTypes[key] = {
              type: 'object',
              fields: Object.keys(sample[key]),
              fieldTypes: {}
            };
            
            for (const nestedKey of Object.keys(sample[key])) {
              analysis.fieldTypes[key].fieldTypes[nestedKey] = typeof sample[key][nestedKey];
            }
          }
        }
      }
      
      res.json({ 
        message: "API Debug für Refills", 
        analysis,
        rawResult: result
      });
    } catch (error) {
      console.error("Fehler beim API-Debug für Refills:", error);
      res.status(500).json({ 
        error: "Debug-Abfrage fehlgeschlagen", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  app.get(`${API_PREFIX}/debug/refill/:id/details`, async (req: Request, res: Response) => {
    try {
      console.log(`Debug-Endpunkt für Refill-Details aufgerufen, ID: ${req.params.id}`);
      const api = vendonSync.getApi();
      
      // Direkt die API aufrufen und die Struktur der Antwort analysieren
      const result = await api.getRefillDetails(req.params.id);
      
      // Datenstrukturanalyse
      const analysis = {
        fields: Object.keys(result),
        productCount: result.products ? result.products.length : 0,
        productFields: result.products && result.products.length > 0 ? Object.keys(result.products[0]) : [],
        fieldTypes: {}
      };
      
      // Typanalyse der Hauptfelder
      for (const key of Object.keys(result)) {
        if (key !== 'products') {
          analysis.fieldTypes[key] = typeof result[key];
        }
      }
      
      // Typanalyse des ersten Produkts
      if (result.products && result.products.length > 0) {
        const sample = result.products[0];
        analysis.fieldTypes['products'] = {
          type: 'array',
          itemType: 'object',
          itemFields: {}
        };
        
        for (const key of Object.keys(sample)) {
          analysis.fieldTypes['products'].itemFields[key] = typeof sample[key];
        }
      }
      
      res.json({ 
        message: "API Debug für Refill-Details", 
        analysis,
        rawResult: result
      });
    } catch (error) {
      console.error(`Fehler beim API-Debug für Refill-Details ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Debug-Abfrage fehlgeschlagen", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  app.get(`${API_PREFIX}/debug/events`, async (_req: Request, res: Response) => {
    try {
      console.log("Debug-Endpunkt für Events aufgerufen");
      const api = vendonSync.getApi();
      
      // Letzter Monat bis heute als Standarddatum
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      
      console.log(`Zeitbereich: ${startDate.toISOString()} bis ${endDate.toISOString()}`);
      
      // Direkt die API aufrufen und die Struktur der Antwort analysieren
      const result = await api.getEvents(startDate, endDate, 1, 5);
      
      // Datenstrukturanalyse
      const analysis = {
        total: result.total,
        itemCount: result.data ? result.data.length : 0,
        fields: result.data && result.data.length > 0 ? Object.keys(result.data[0]) : [],
        samples: result.data ? result.data.slice(0, 3) : [],
        fieldTypes: {}
      };
      
      // Typanalyse der ersten Elemente
      if (result.data && result.data.length > 0) {
        const sample = result.data[0];
        for (const key of Object.keys(sample)) {
          analysis.fieldTypes[key] = typeof sample[key];
          
          // Für verschachtelte Objekte
          if (sample[key] && typeof sample[key] === 'object' && !Array.isArray(sample[key])) {
            analysis.fieldTypes[key] = {
              type: 'object',
              fields: Object.keys(sample[key]),
              fieldTypes: {}
            };
            
            for (const nestedKey of Object.keys(sample[key])) {
              analysis.fieldTypes[key].fieldTypes[nestedKey] = typeof sample[key][nestedKey];
            }
          }
        }
      }
      
      res.json({ 
        message: "API Debug für Events", 
        analysis,
        rawResult: result
      });
    } catch (error) {
      console.error("Fehler beim API-Debug für Events:", error);
      res.status(500).json({ 
        error: "Debug-Abfrage fehlgeschlagen", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Scheduler API endpoints
  
  // Get scheduler status
  app.get(`${API_PREFIX}/scheduler/status`, async (_req: Request, res: Response) => {
    try {
      const status = getSchedulerStatus();
      res.json(status);
    } catch (error) {
      console.error("Error fetching scheduler status:", error);
      res.status(500).json({ 
        error: "Failed to fetch scheduler status", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Start scheduler
  app.post(`${API_PREFIX}/scheduler/start`, async (_req: Request, res: Response) => {
    try {
      startAutomaticSync();
      res.json({ 
        status: "success", 
        message: "Automatic synchronization scheduler started" 
      });
    } catch (error) {
      console.error("Error starting scheduler:", error);
      res.status(500).json({ 
        error: "Failed to start scheduler", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Stop scheduler
  app.post(`${API_PREFIX}/scheduler/stop`, async (_req: Request, res: Response) => {
    try {
      stopAutomaticSync();
      res.json({ 
        status: "success", 
        message: "Automatic synchronization scheduler stopped" 
      });
    } catch (error) {
      console.error("Error stopping scheduler:", error);
      res.status(500).json({ 
        error: "Failed to stop scheduler", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Database statistics endpoint
  app.get(`${API_PREFIX}/database/stats`, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getDatabaseStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching database statistics:", error);
      res.status(500).json({ 
        error: "Failed to fetch database statistics", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Suppliers Routes
  // Routes for suppliers are already defined above (lines 309-412)
  
  // Locations Routes
  // Get all locations
  app.get(`${API_PREFIX}/locations`, async (_req: Request, res: Response) => {
    try {
      const locations = await storage.getLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ 
        error: "Failed to fetch locations", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Registriere die Forecast-, Wetter- und Feiertags-Routen
  // Authentication Routes
  // Register new user
  app.post(`${API_PREFIX}/auth/register`, async (req: Request, res: Response) => {
    try {
      const parsedData = registerSchema.safeParse(req.body);
      
      if (!parsedData.success) {
        return res.status(400).json({ 
          error: "Invalid registration data", 
          details: parsedData.error 
        });
      }
      
      const result = await registerUser(parsedData.data);
      res.status(201).json(result);
    } catch (error) {
      console.error("Error during user registration:", error);
      
      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({ error: "User already exists" });
      }
      
      res.status(500).json({ 
        error: "Registration failed", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Login
  app.post(`${API_PREFIX}/auth/login`, async (req: Request, res: Response) => {
    try {
      const parsedData = loginSchema.safeParse(req.body);
      
      if (!parsedData.success) {
        return res.status(400).json({ 
          error: "Invalid login data", 
          details: parsedData.error 
        });
      }
      
      const result = await loginUser(parsedData.data);
      
      if (!result.success) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ 
        error: "Login failed", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Logout
  app.post(`${API_PREFIX}/auth/logout`, (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }
      
      invalidateToken(token);
      res.json({ success: true });
    } catch (error) {
      console.error("Error during logout:", error);
      res.status(500).json({ 
        error: "Logout failed", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // User Management Routes (Admin Only)
  // Middleware to check if user is admin
  const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized: No token provided" });
      }
      
      const token = authHeader.split(' ')[1];
      const user = await validateToken(token);
      
      if (!user) {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      }
      
      if (user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      req.user = user;
      next();
    } catch (error) {
      console.error("Error in admin middleware:", error);
      res.status(500).json({ error: "Server error" });
    }
  };
  
  // Get all users (admin only)
  app.get(`${API_PREFIX}/admin/users`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const users = await getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ 
        error: "Failed to fetch users", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Approve a user (admin only)
  app.post(`${API_PREFIX}/admin/users/:id/approve`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // req.user wurde im requireAdmin-Middleware gesetzt
      const result = await approveUser(userId, req.user!.id);
      
      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error(`Error approving user ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to approve user", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Change user role (admin only)
  app.post(`${API_PREFIX}/admin/users/:id/role`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { role } = req.body;
      
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      if (!role || (role !== 'user' && role !== 'admin')) {
        return res.status(400).json({ error: "Invalid role. Must be 'user' or 'admin'" });
      }
      
      const result = await changeUserRole(userId, role);
      
      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error(`Error changing role for user ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to change user role", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Authenticate Middleware
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const token = authHeader.split(' ')[1];
      const user = await validateToken(token);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      
      // Überprüfen, ob der Benutzer freigegeben ist (außer für Admins)
      if (user.role !== 'admin' && !user.approved) {
        return res.status(403).json({ 
          error: "Konto noch nicht freigegeben",
          message: "Dein Konto wurde noch nicht freigegeben. Bitte warte auf die Freigabe durch einen Administrator."
        });
      }
      
      // @ts-ignore - Füge Benutzer zum Anfrageobjekt hinzu
      req.user = user;
      next();
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(401).json({ error: "Authentication failed" });
    }
  };
  
  // Protected Route: Get current user
  app.get(`${API_PREFIX}/auth/me`, authenticate, (req: Request, res: Response) => {
    try {
      // @ts-ignore - Benutzer wurde in der authenticate Middleware hinzugefügt
      const user = req.user;
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Passwort und andere sensible Daten entfernen
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ 
        error: "Failed to fetch user profile", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  registerForecastRoutes(app);
  registerInventoryRoutes(app);
  statisticsRoutes(app);
  
  // Registriere Vendon-API-Routen
  app.use(`${API_PREFIX}/vendon`, vendonRoutes);
  app.use(`${API_PREFIX}/product-disposals`, productDisposalsRoutes);
  app.use(`${API_PREFIX}/removed-products`, removedProductsRoutes);
  app.use(`${API_PREFIX}/weather`, weatherRoutes);
  app.use(`${API_PREFIX}/holidays`, holidaysRoutes);
  app.use(`${API_PREFIX}/bulk`, bulkSyncRoutes);
  app.use(`${API_PREFIX}/db`, dbExportRoutes);
  app.use(`${API_PREFIX}/admin`, adminRouter);
  
  // Registriere Bestellungs-Routen
  app.use(`${API_PREFIX}/orders`, ordersRouter);
  
  // Registriere Export/Import-Routen
  app.use(`${API_PREFIX}`, exportImportRoutes);

  return httpServer;
}
