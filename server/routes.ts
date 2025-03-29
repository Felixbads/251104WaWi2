import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { vendonSync } from "./services/vendonSync";
import { syncWeatherForecast } from './services/openWeatherService';
import { syncMissingHolidays } from './services/holidayService';
import { startAutomaticSync, stopAutomaticSync, getSchedulerStatus } from "./scheduler";
import { z } from "zod";
import { registerForecastRoutes } from "./routes/forecast";

// API route prefix
const API_PREFIX = "/api";

// Date range validation schema
const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  batchSize: z.number().min(1).max(1000).optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);

  // API Health Check
  app.get(`${API_PREFIX}/health`, (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
          // Synchronisiere Wetterprognosen für Bad Schandau
          result = await syncWeatherForecast("Bad Schandau");
          break;
        case "holidays":
          // Synchronisiere Feiertage
          const currentYear = new Date().getFullYear();
          result = await syncMissingHolidays(currentYear - 1, currentYear + 1, undefined, true);
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
      const logs = await storage.getSyncLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({ 
        error: "Failed to fetch sync logs", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get transactions
  app.get(`${API_PREFIX}/transactions`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
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
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      
      const transactions = await storage.getTransactionsByDateRange(
        new Date(startDate as string),
        new Date(endDate as string),
        limit ? parseInt(limit as string) : 25
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

  // Get products
  app.get(`${API_PREFIX}/products`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
      const products = await storage.getProducts(limit);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ 
        error: "Failed to fetch products", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get machines
  app.get(`${API_PREFIX}/machines`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
      
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

  // Get events
  app.get(`${API_PREFIX}/events`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
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
        limit ? parseInt(limit as string) : 25
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
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

  // Registriere die Forecast-, Wetter- und Feiertags-Routen
  registerForecastRoutes(app);

  return httpServer;
}
