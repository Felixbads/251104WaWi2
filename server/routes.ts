import type { Express, Request as ExpressRequest, Response, NextFunction } from "express";
import { User, insertPurchaseConditionSchema, insertInventoryCountItemSchema, machines, transactions } from '../shared/schema';

// Erweitern der Request-Schnittstelle zur Unterstützung des user-Objekts
interface Request extends ExpressRequest {
  user?: User;
}
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, rawDb, rawSql } from "./db";
import { sql, eq, desc, and, gte, lte } from "drizzle-orm";
import { vendonSync } from "./services/vendonSync";
import { syncWeatherForecast } from './services/openWeatherService';
import { holidayService } from './services/holidayService';
import ordersRouter from './routes/orders';
import holidaysRouter from './routes/holidays';
import calendarRoutes from './routes/calendar';
import calendarOverviewRoutes from './routes/calendarOverview';
import adminRouter from './routes/admin';
import inventoryRouter from './routes/inventory';
import warehouseInventoryRouter from './routes/warehouse-inventory';
import machineWarehouseAssignmentsRouter from './routes/machine-warehouse-assignments';
import warehouseMachineAssignmentsRouter from './routes/warehouse-machine-assignments';
import productBatchesRouter from './routes/product-batches';
import inventoryBatchesRouter from './routes/inventory-batches';
import warehouse3Router from './routes/warehouse3.routes';
import warehouse3ApiRouter from './routes/warehouse3.api';
import warehouseMovementsRouter from './routes/warehouse-movements';
import warehouseLocationsRouter from './routes/warehouse-locations';
import inventoryCountBatchesRouter from './routes/inventory-count-batches';
import warehousesRouter from './routes/warehouses';
import emailRouter from './routes/email';
import { criticalInventoryRouter } from './routes/critical-inventory';
import productSyncRouter from './routes/product-sync';
import vendonImportStatsRouter from './routes/vendonImportStats';
import vendonHistoricalImportRouter from './routes/vendonHistoricalImport';
import eventsRouter from './routes/events';
import locationStatusRouter from './routes/location-status';

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
import inventoryTransfersRoutes from "./routes/inventoryTransfers";
import exportImportRoutes from "./routes/exportImport";
import removedProductsRoutes from "./routes/removedProducts";
import weatherRoutes from "./routes/weather";
import holidaysRoutes from "./routes/holidays";
import bulkSyncRoutes from "./routes/bulkSync";
import dbExportRoutes from "./routes/databaseExport";
import databaseViewerRoutes from "./routes/database-viewer";
import emailRoutes from "./routes/email";
import refillsRoutes from "./routes/refills";
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
  // HTTP-Server für Express erstellen
  const httpServer = createServer(app);
  
  // Middleware für Content-Type-Header für alle API-Antworten
  app.use(`${API_PREFIX}`, (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });
  // GET /warehouses - Liste aller Lager
  app.get(`${API_PREFIX}/warehouses`, async (_req: Request, res: Response) => {
    try {
      console.log("Versuche, Warehouses abzurufen...");
      // Verwende storage.getWarehouses statt direkter SQL-Abfrage
      const warehouses = await storage.getWarehouses();
      console.log("Warehouses erfolgreich abgerufen:", warehouses.length);
      res.json(warehouses);
    } catch (error) {
      console.error("Error fetching warehouses:", error);
      res.status(500).json({ 
        error: "Failed to fetch warehouses", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // GET /inventory-movements - Warenbewegungen abrufen
  app.get(`${API_PREFIX}/inventory-movements`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
      const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
      const productName = req.query.productName as string | undefined;
      const movementType = req.query.movementType as string | undefined;
      const startDateStr = req.query.startDate as string | undefined;
      const endDateStr = req.query.endDate as string | undefined;
      
      // Datum-Parameter verarbeiten
      const startDate = startDateStr ? new Date(startDateStr) : undefined;
      const endDate = endDateStr ? new Date(endDateStr) : undefined;
      
      console.log(`Warenbewegungen abfragen für Lager ${warehouseId || 'alle'}, ` +
        `Zeitraum: ${startDate?.toISOString() || 'unbegrenzt'} bis ${endDate?.toISOString() || 'jetzt'}, ` + 
        `Produkt: ${productName || productId || 'alle'}, Typ: ${movementType || 'alle'}`);
      
      // Für eine Lagerhausbewegung muss entweder das Quell- oder Ziellager das gesuchte sein
      // Wir suchen also nach Bewegungen, die dieses Lager betreffen
      const movements = await storage.getInventoryMovements({
        limit,
        offset,
        ...(warehouseId ? { sourceWarehouseId: warehouseId } : {}),
        ...(productId ? { productId } : {}),
        ...(movementType ? { movementType } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {})
      });
      
      // Wenn ein warehouseId angegeben wurde, müssen wir auch nach Bewegungen suchen,
      // bei denen dieses Lager das Ziellager ist
      let destMovements: any[] = [];
      if (warehouseId) {
        destMovements = await storage.getInventoryMovements({
          limit,
          offset,
          destinationWarehouseId: warehouseId,
          ...(productId ? { productId } : {}),
          ...(movementType ? { movementType } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {})
        });
      }
      
      // Kombiniere beide Listen und sortiere nach Datum (neueste zuerst)
      const combinedMovements = [...movements, ...destMovements].sort((a, b) => {
        const dateA = new Date(a.performedAt || a.createdAt);
        const dateB = new Date(b.performedAt || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Wenn nach Produktname gefiltert wird, filtern wir die Liste
      let filteredMovements = combinedMovements;
      if (productName) {
        filteredMovements = combinedMovements.filter(item => 
          item.productName && item.productName.toLowerCase().includes(productName.toLowerCase())
        );
      }
      
      // Transformiere die Daten für die Frontendanzeige
      const formattedMovements = filteredMovements.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        type: item.sourceWarehouseId === warehouseId ? 'OUT' : 'IN',
        movementType: item.movementType,
        referenceType: item.referenceType,
        referenceId: item.referenceId,
        source: item.referenceType === 'vendon' ? 'vendon' : 'manual',
        machineId: item.machineId,
        machineName: item.machineName,
        notes: item.notes,
        createdAt: item.createdAt,
        performedAt: item.performedAt,
        performedBy: item.performedBy,
        performedByName: item.performedByName,
        sourceWarehouseId: item.sourceWarehouseId,
        sourceWarehouseName: item.sourceWarehouseName,
        destinationWarehouseId: item.destinationWarehouseId,
        destinationWarehouseName: item.destinationWarehouseName,
        quantityBefore: item.quantityBefore,
        quantityAfter: item.quantityAfter,
        unit: item.unit
      }));
      
      res.json(formattedMovements);
    } catch (error) {
      console.error("Error fetching inventory movements:", error);
      res.status(500).json({ 
        error: "Failed to fetch inventory movements", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // GET /warehouses/:id/movements - Warenbewegungen für ein bestimmtes Lager abrufen
  app.get(`${API_PREFIX}/warehouses/:id/movements`, async (req: Request, res: Response) => {
    try {
      const warehouseId = parseInt(req.params.id);
      if (isNaN(warehouseId)) {
        return res.status(400).json({ error: "Ungültige Lager-ID" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
      const productName = req.query.productName as string | undefined;
      const movementType = req.query.movementType as string | undefined;
      const startDateStr = req.query.startDate as string | undefined;
      const endDateStr = req.query.endDate as string | undefined;
      
      // Datum-Parameter verarbeiten
      const startDate = startDateStr ? new Date(startDateStr) : undefined;
      const endDate = endDateStr ? new Date(endDateStr) : undefined;
      
      console.log(`[DEBUG] Warenbewegungen abfragen für Lager ${warehouseId}, ` +
        `Zeitraum: ${startDate?.toISOString() || 'unbegrenzt'} bis ${endDate?.toISOString() || 'jetzt'}, ` + 
        `Produkt: ${productName || productId || 'alle'}, Typ: ${movementType || 'alle'}`);
      
      // 1. Hole alle Warenbewegungen, bei denen dieses Lager als Quelle definiert ist
      const sourceMovements = await storage.getInventoryMovements({
        sourceWarehouseId: warehouseId,
        ...(productId ? { productId } : {}),
        ...(movementType ? { movementType } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        limit,
        offset
      });
      
      console.log(`[DEBUG] Gefundene Quelltransaktionen für Lager ${warehouseId}: ${sourceMovements.length}`);
      
      // 2. Hole alle Warenbewegungen, bei denen dieses Lager als Ziel definiert ist
      const destMovements = await storage.getInventoryMovements({
        destinationWarehouseId: warehouseId,
        ...(productId ? { productId } : {}),
        ...(movementType ? { movementType } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        limit,
        offset
      });
      
      console.log(`[DEBUG] Gefundene Zieltransaktionen für Lager ${warehouseId}: ${destMovements.length}`);
      
      // Ermittle den Namen des Lagers
      const warehouse = await storage.getWarehouse(warehouseId);
      const warehouseName = warehouse?.name || `Lager ${warehouseId}`;
      
      // 3. Jetzt die Automaten dieses Lagers ermitteln
      const assignments = await storage.getMachineWarehouseAssignments({ warehouseId });
      const machineIds = assignments.map(a => a.machineId);
      
      console.log(`[DEBUG] Gefundene Automaten für Lager ${warehouseId}: ${machineIds.length}`);
      
      // Wenn keine Automaten zugewiesen sind, können wir die leeren Ergebnisse zurückgeben
      if (machineIds.length === 0) {
        console.log(`[DEBUG] Keine Automaten für Lager ${warehouseId} zugewiesen.`);
        return res.json([]);
      }
      
      // 4. Für jeden zugewiesenen Automaten die Refill-Daten abrufen
      const refillDetails = [];
      
      // Abfragebedingung für Refills nach Datum
      const refillQueryOptions = {
        machineIds: machineIds, 
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        limit: 500 // Wir holen mehr Refills, um genügend Daten zu haben
      };
      
      // Wir holen direkt aus der Datenbank alle Refills für die zugewiesenen Automaten
      // Limit auf 50 reduziert, um die Ladezeit zu verbessern
      const refillQuery = `
        SELECT r.*, m.machine_name as "machineName" 
        FROM refills r
        LEFT JOIN machines m ON r.machine_id = m.id
        WHERE r.machine_id = ANY($1)
        ${startDate ? `AND r.datetime >= $2` : ''}
        ${endDate ? `AND r.datetime <= ${startDate ? '$3' : '$2'}` : ''}
        ORDER BY r.datetime DESC 
        LIMIT 50
      `;
      
      // Parameter für die Abfrage vorbereiten
      const queryParams = [machineIds];
      if (startDate) queryParams.push(startDate.toISOString());
      if (endDate) queryParams.push(endDate.toISOString());
      
      // Ausführung der Abfrage
      const refillsResult = await rawDb.query(refillQuery, queryParams);
      const refillsQuery = refillsResult.rows;
      
      console.log(`[DEBUG] Gefundene Refills für Lager ${warehouseId}: ${refillsQuery.length}`);
      
      // Für jedes Refill die Details abrufen
      for (const refill of refillsQuery) {
        const details = await storage.getRefillDetails(refill.id);
        
        if (details && details.length > 0) {
          console.log(`[DEBUG] Gefundene Refill-Details für Refill ${refill.id}: ${details.length}`);
          
          // Jedes Detail in eine Warenbewegung umwandeln
          for (const detail of details) {
            // Produkt filtern, wenn ein Produktname angegeben wurde
            if (productName && 
                !(detail.productName || "").toLowerCase().includes(productName.toLowerCase())) {
              continue; // Dieses Produkt überspringen, wenn es nicht dem Filter entspricht
            }
            
            // Wenn ein Produkt zu diesem Refill existiert, fügen wir es als Bewegung hinzu
            refillDetails.push({
              id: `refill-${refill.id}-${detail.id}`,
              productId: detail.productId || null,
              productName: detail.productName || "Unbekanntes Produkt",
              quantity: -(detail.removed || detail.quantity || 0), // Negativ für Entnahmen
              movementType: 'REFILL',
              referenceType: 'refill',
              referenceId: refill.id.toString(),
              machineId: refill.machineId,
              machineName: refill.machineName,
              notes: `Auffüllung ${refill.machineName}: ${detail.productName}`,
              createdAt: refill.createdAt || refill.datetime,
              performedAt: refill.datetime,
              performedBy: null,
              performedByName: refill.operator,
              sourceWarehouseId: warehouseId,
              sourceWarehouseName: warehouseName,
              destinationWarehouseId: null,
              destinationWarehouseName: null,
              unit: 'Stück',
              type: 'OUT', // Refills sind immer Ausgänge
              previousStock: detail.previousStock,
              currentStock: detail.currentStock,
              vendonId: refill.vendonId,
              position: detail.position
            });
          }
        } else {
          console.log(`[DEBUG] Keine Details für Refill ${refill.id} gefunden`);
        }
      }
      
      console.log(`[DEBUG] Aufgelöste Refill-Details als Bewegungen: ${refillDetails.length}`);
      
      // Alle Bewegungen kombinieren und nach Datum sortieren (neueste zuerst)
      const combinedMovements = [...sourceMovements, ...destMovements, ...refillDetails].sort((a, b) => {
        const dateA = new Date(a.performedAt || a.createdAt);
        const dateB = new Date(b.performedAt || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`[DEBUG] Gesamtzahl kombinierter Bewegungen: ${combinedMovements.length}`);
      
      // Wenn nach Bewegungstyp gefiltert wird, filtern wir die Liste
      let filteredMovements = combinedMovements;
      if (movementType) {
        filteredMovements = combinedMovements.filter(item => 
          item.movementType === movementType
        );
        console.log(`[DEBUG] Nach Bewegungstyp ${movementType} gefiltert: ${filteredMovements.length} Ergebnisse`);
      }
      
      // Transformieren für die Frontend-Anzeige
      const formattedMovements = filteredMovements.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        type: item.type || (item.sourceWarehouseId === warehouseId ? 'OUT' : 'IN'),
        movementType: item.movementType,
        referenceType: item.referenceType,
        referenceId: item.referenceId,
        source: item.referenceType === 'refill' || item.source === 'vendon' ? 'vendon' : 'manual',
        machineId: item.machineId,
        machineName: item.machineName,
        notes: item.notes,
        createdAt: item.createdAt,
        performedAt: item.performedAt,
        performedBy: item.performedBy,
        performedByName: item.performedByName,
        sourceWarehouseId: item.sourceWarehouseId,
        sourceWarehouseName: item.sourceWarehouseName,
        destinationWarehouseId: item.destinationWarehouseId,
        destinationWarehouseName: item.destinationWarehouseName,
        unit: item.unit || 'Stück',
        quantityBefore: item.previousStock,
        quantityAfter: item.currentStock
      }));
      
      console.log(`[DEBUG] Sende ${formattedMovements.length} Warenbewegungen zurück`);
      
      // Gesamte Ergebnismenge zurückgeben
      res.json(formattedMovements);
    } catch (error) {
      console.error(`Error fetching warehouse movements for warehouse ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to fetch warehouse movements', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // GET /machine-warehouse-assignments - Automaten-Lager-Zuordnungen abrufen
  app.get(`${API_PREFIX}/machine-warehouse-assignments`, async (req: Request, res: Response) => {
    try {
      const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
      const machineId = req.query.machineId ? parseInt(req.query.machineId as string) : undefined;
      
      const assignments = await storage.getMachineWarehouseAssignments({ warehouseId, machineId });
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching machine-warehouse assignments:", error);
      res.status(500).json({ 
        error: "Failed to fetch machine-warehouse assignments", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // GET /inventory-counts - Inventurzählungen abrufen
  app.get(`${API_PREFIX}/inventory-counts`, async (req: Request, res: Response) => {
    try {
      const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
      const status = req.query.status as string | undefined;
      
      const counts = await storage.getInventoryCounts({ warehouseId, status });
      res.json(counts);
    } catch (error) {
      console.error("Error fetching inventory counts:", error);
      res.status(500).json({ 
        error: "Failed to fetch inventory counts", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // GET /inventory-counts/:id - Einzelne Inventurzählung abrufen
  app.get(`${API_PREFIX}/inventory-counts/:id`, async (req: Request, res: Response) => {
    try {
      const inventoryCountId = parseInt(req.params.id);
      
      if (!inventoryCountId) {
        return res.status(400).json({ error: "Inventory Count ID is required" });
      }
      
      const count = await storage.getInventoryCount(inventoryCountId);
      
      if (!count) {
        return res.status(404).json({ error: "Inventory Count not found" });
      }
      
      // Hole auch zusätzliche Informationen zum zugehörigen Lager
      const warehouse = await storage.getWarehouse(count.warehouseId);
      
      // Füge Lagername zur Antwort hinzu
      const result = {
        ...count,
        warehouseName: warehouse?.name
      };
      
      res.status(200).json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen der Inventurzählung:", error);
      res.status(500).json({ error: "Failed to retrieve inventory count" });
    }
  });

  // GET /inventory-counts/:id/items - Inventurzählungselemente abrufen
  app.get(`${API_PREFIX}/inventory-counts/:id/items`, async (req: Request, res: Response) => {
    try {
      const inventoryCountId = parseInt(req.params.id);
      
      if (!inventoryCountId) {
        return res.status(400).json({ error: "Inventory Count ID is required" });
      }
      
      const items = await storage.getInventoryCountItems(inventoryCountId);
      
      // Hole detaillierte Produktinformationen für jedes Item
      const enrichedItems = await Promise.all(items.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          product
        };
      }));
      
      res.status(200).json(enrichedItems);
    } catch (error) {
      console.error("Fehler beim Abrufen der Inventurzählungselemente:", error);
      res.status(500).json({ error: "Failed to retrieve inventory count items" });
    }
  });

  // GET /inventory-counts/:id/available-items - Verfügbare Produkte für Inventurzählung abrufen
  app.get(`${API_PREFIX}/inventory-counts/:id/available-items`, async (req: Request, res: Response) => {
    try {
      const inventoryCountId = parseInt(req.params.id);
      
      if (!inventoryCountId) {
        return res.status(400).json({ error: "Inventory Count ID is required" });
      }
      
      // Überprüfe, ob die Inventurzählung existiert
      const count = await storage.getInventoryCount(inventoryCountId);
      if (!count) {
        return res.status(404).json({ error: "Inventory Count not found" });
      }
      
      // Hole das Lager ID von der Inventurzählung
      const warehouseId = count.warehouseId;
      
      // Hole alle Produkte im Lager
      const inventoryItems = await storage.getInventoryItems({ 
        warehouseId,
        includeZeroStock: true // Wichtig: Auch Produkte mit Bestand 0 einschließen
      });
      
      // Hole bereits in der Inventur existierende Elemente
      const existingItems = await storage.getInventoryCountItems(inventoryCountId);
      const existingProductIds = new Set(existingItems.map(item => item.productId));
      
      // Filtere nur die Produkte, die noch nicht in der Inventur sind
      const availableItems = inventoryItems.filter(item => !existingProductIds.has(item.productId || 0));
      
      // Hole detaillierte Produktinformationen
      const productsWithDetails = await Promise.all(availableItems.map(async (item) => {
        const product = await storage.getProduct(item.productId || 0);
        return {
          ...item,
          product
        };
      }));
      
      res.status(200).json({
        items: productsWithDetails,
        total: productsWithDetails.length
      });
    } catch (error) {
      console.error("Fehler beim Abrufen der verfügbaren Produkte:", error);
      res.status(500).json({ error: "Failed to retrieve available items" });
    }
  });

  // POST /inventory-counts - Neue Inventurzählung erstellen
  app.post(`${API_PREFIX}/inventory-counts`, async (req: Request, res: Response) => {
    try {
      const { warehouseId, notes, status } = req.body;
      
      console.log(`Erstelle neue Inventurzählung für Lager ${warehouseId} mit Status ${status || 'pending'}`);
      
      if (!warehouseId) {
        return res.status(400).json({ error: "Warehouse ID is required" });
      }
      
      // Validiere warehouseId
      const warehouse = await storage.getWarehouse(warehouseId);
      if (!warehouse) {
        console.error(`Lager mit ID ${warehouseId} nicht gefunden!`);
        return res.status(404).json({ error: "Warehouse not found" });
      }
      
      console.log(`Lager gefunden: ${warehouse.name} (ID: ${warehouse.id})`);
      
      // Erstelle neue Inventurzählung
      const inventoryCount = await storage.createInventoryCount({
        warehouseId,
        notes,
        status: status || 'pending',
        startDate: new Date()
      });
      
      console.log(`Neue Inventurzählung erstellt: ID ${inventoryCount.id} für Lager ${warehouse.name} (${warehouseId})`);
      console.log(`Warehouse Name in Response: ${inventoryCount.warehouseName || 'Nicht gesetzt'}`);
      
      // Füge automatisch alle Produkte aus dem Lager zur Inventur hinzu
      try {
        console.log(`Füge automatisch alle Produkte für neue Inventur ${inventoryCount.id} hinzu...`);
        
        // Hole direkt die inventory_items für das Lager
        const inventoryItems = await storage.getInventoryItemsByWarehouse(warehouseId);
        
        console.log(`${inventoryItems.length} Lagerprodukte gefunden in inventory_items für Lager ${warehouseId}`);
        
        if (inventoryItems && inventoryItems.length > 0) {
          // Speichere alle gefundenen Produkte in der Inventur
          const savedItems = [];
          console.log(`Beginne mit dem Hinzufügen von ${inventoryItems.length} Produkten zur Inventur ${inventoryCount.id}`);
          
          // Für jedes Lagerprodukt ein Inventurelement erstellen
          for (const item of inventoryItems) {
            if (!item.productId) {
              console.warn(`Überspringe Eintrag ohne Produkt-ID:`, item);
              continue;
            }
            
            console.log(`Füge Produkt ${item.productId} mit Bestand ${item.quantity || 0} zur Inventur hinzu`);
            try {
              const savedItem = await storage.createInventoryCountItem({
                inventoryCountId: inventoryCount.id,
                productId: item.productId,
                expectedQuantity: item.quantity || 0,
                actualQuantity: null,
                status: 'pending'
              });
              
              savedItems.push(savedItem);
            } catch (itemError) {
              console.error(`Fehler beim Hinzufügen von Produkt ${item.productId}:`, itemError);
            }
          }
          
          console.log(`✅ ${savedItems.length} Produkte automatisch zur Inventur ${inventoryCount.id} hinzugefügt`);
        } else {
          console.warn(`Keine Lagerprodukte für Lager ${warehouseId} gefunden!`);
        }
      } catch (addError) {
        console.error("Fehler beim automatischen Hinzufügen der Produkte:", addError);
        // Wir lassen die Inventur trotzdem erstellen, selbst wenn das Hinzufügen fehlschlägt
      }
      
      res.status(201).json(inventoryCount);
    } catch (error) {
      console.error("Error creating inventory count:", error);
      res.status(500).json({ 
        error: "Failed to create inventory count", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // POST /inventory-counts/:id/items - Inventurzählungselemente hinzufügen
  app.post(`${API_PREFIX}/inventory-counts/:id/items`, async (req: Request, res: Response) => {
    try {
      const inventoryCountId = parseInt(req.params.id);
      const { items } = req.body;
      
      if (!inventoryCountId) {
        return res.status(400).json({ error: "Inventory Count ID is required" });
      }
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items array is required and must not be empty" });
      }
      
      // Überprüfe, ob die Inventurzählung existiert
      const count = await storage.getInventoryCount(inventoryCountId);
      if (!count) {
        return res.status(404).json({ error: "Inventory Count not found" });
      }
      
      // Speichere alle Items
      const savedItems = [];
      for (const item of items) {
        const savedItem = await storage.createInventoryCountItem({
          inventoryCountId,
          productId: item.productId,
          expectedQuantity: item.currentQuantity || 0,
          actualQuantity: item.countedQuantity || 0,
          difference: (item.countedQuantity || 0) - (item.currentQuantity || 0),
          status: 'counted'
        });
        savedItems.push(savedItem);
      }
      
      console.log(`${savedItems.length} Inventurzählungselemente für ID ${inventoryCountId} gespeichert`);
      res.status(201).json(savedItems);
    } catch (error) {
      console.error("Error saving inventory count items:", error);
      res.status(500).json({ 
        error: "Failed to save inventory count items", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // PATCH /inventory-count-items/:id - Inventurzählungselement aktualisieren
  app.patch(`${API_PREFIX}/inventory-count-items/:id`, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      if (!itemId) {
        return res.status(400).json({ error: "Item ID is required" });
      }
      
      // Hole das zu aktualisierende Element
      const countItem = await storage.getInventoryCountItemById(itemId);
      if (!countItem) {
        return res.status(404).json({ error: "Inventory count item not found" });
      }
      
      console.log(`Inventurzählungselement ${itemId} gefunden, aktualisiere mit Daten:`, req.body);
      
      // Validiere die Anfragedaten mit einem angepassten Schema, da das Frontend countedQuantity sendet
      // aber das Backend actualQuantity erwartet
      const validationSchema = z.object({
        countedQuantity: z.number().optional(),
        notes: z.string().optional(),
        status: z.string().optional(),
        countedBy: z.number().optional(),
        countedAt: z.date().optional()
      });
      
      const validatedInput = validationSchema.parse(req.body);
      
      // Erstelle das tatsächliche Update-Objekt
      const updateData: Partial<InsertInventoryCountItem> = {};
      
      // Wenn countedQuantity geändert wurde, berechnen wir die Differenz neu
      if (validatedInput.countedQuantity !== undefined) {
        // In der Anfrage heißt es countedQuantity, aber im Schema actualQuantity
        updateData.actualQuantity = validatedInput.countedQuantity;
        
        const expectedQty = countItem.expectedQuantity !== null && countItem.expectedQuantity !== undefined ? 
                            countItem.expectedQuantity : 0;
        
        updateData.difference = updateData.actualQuantity - expectedQty;
        updateData.status = 'counted';
        updateData.countedAt = new Date();
      }
      
      // Weitere Felder übernehmen, wenn vorhanden
      if (validatedInput.notes !== undefined) updateData.notes = validatedInput.notes;
      if (validatedInput.status !== undefined) updateData.status = validatedInput.status;
      if (validatedInput.countedBy !== undefined) updateData.countedBy = validatedInput.countedBy;
      
      // Aktualisiere das Element
      const updatedItem = await storage.updateInventoryCountItem(itemId, updateData);
      
      console.log(`Inventurzählungselement ${itemId} erfolgreich aktualisiert mit actualQuantity: ${updateData.actualQuantity}`);
      return res.json(updatedItem);
    } catch (error) {
      console.error("Error updating inventory count item:", error);
      res.status(500).json({ 
        error: "Failed to update inventory count item", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // POST /inventory-counts/:id/complete - Inventurzählung abschließen
  app.post(`${API_PREFIX}/inventory-counts/:id/complete`, async (req: Request, res: Response) => {
    try {
      const inventoryCountId = parseInt(req.params.id);
      
      if (!inventoryCountId) {
        return res.status(400).json({ error: "Inventory Count ID is required" });
      }
      
      // Überprüfe, ob die Inventurzählung existiert
      const count = await storage.getInventoryCount(inventoryCountId);
      if (!count) {
        return res.status(404).json({ error: "Inventory Count not found" });
      }
      
      // Hole alle Zählungselemente
      const items = await storage.getInventoryCountItems(inventoryCountId);
      
      // Aktualisiere den Bestand basierend auf den Zählungsergebnissen
      for (const item of items) {
        if (item.actualQuantity !== undefined && item.productId) {
          // Hole aktuellen Bestand
          const inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
            item.productId, 
            count.warehouseId
          );
          
          if (inventoryItem) {
            // Berechne die Differenz
            const difference = item.actualQuantity - (inventoryItem.quantity || 0);
            
            // Erstelle eine Bewegung für die Inventuranpassung
            await storage.createInventoryMovement({
              productId: item.productId,
              warehouseId: count.warehouseId,
              quantity: difference,
              type: difference >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
              reason: 'INVENTORY_COUNT',
              notes: `Inventuranpassung aus Zählung #${inventoryCountId}`,
              previousStock: inventoryItem.quantity || 0,
              currentStock: item.actualQuantity,
            });
            
            // Aktualisiere den Bestand
            await storage.updateInventoryItem(inventoryItem.id, {
              quantity: item.actualQuantity
            });
          }
        }
      }
      
      // Aktualisiere den Status der Inventurzählung
      const updatedCount = await storage.updateInventoryCount(inventoryCountId, {
        status: 'completed',
        endDate: new Date()
      });
      
      console.log(`Inventurzählung ${inventoryCountId} abgeschlossen`);
      res.json(updatedCount);
    } catch (error) {
      console.error("Error completing inventory count:", error);
      res.status(500).json({ 
        error: "Failed to complete inventory count", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // POST /inventory-counts/:id/cancel - Inventurzählung abbrechen
  app.post(`${API_PREFIX}/inventory-counts/:id/cancel`, async (req: Request, res: Response) => {
    try {
      const inventoryCountId = parseInt(req.params.id);
      
      if (!inventoryCountId) {
        return res.status(400).json({ error: "Inventory Count ID is required" });
      }
      
      // Überprüfe, ob die Inventurzählung existiert
      const count = await storage.getInventoryCount(inventoryCountId);
      if (!count) {
        return res.status(404).json({ error: "Inventory Count not found" });
      }
      
      // Aktualisiere den Status der Inventurzählung
      const updatedCount = await storage.updateInventoryCount(inventoryCountId, {
        status: 'cancelled',
        endDate: new Date()
      });
      
      console.log(`Inventurzählung ${inventoryCountId} abgebrochen`);
      res.json(updatedCount);
    } catch (error) {
      console.error("Error cancelling inventory count:", error);
      res.status(500).json({ 
        error: "Failed to cancel inventory count", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // POST /inventory-counts/:id/add-all-products - Fügt automatisch alle Lagerprodukte zur Inventur hinzu
  app.post(`${API_PREFIX}/inventory-counts/:id/add-all-products`, async (req: Request, res: Response) => {
    try {
      const inventoryCountId = parseInt(req.params.id);
      
      if (!inventoryCountId) {
        return res.status(400).json({ error: "Inventory Count ID is required" });
      }
      
      console.log(`Füge automatisch alle Produkte für Inventur ${inventoryCountId} hinzu...`);
      
      // Überprüfe, ob die Inventurzählung existiert
      const count = await storage.getInventoryCount(inventoryCountId);
      if (!count) {
        console.error(`Inventurzählung ${inventoryCountId} nicht gefunden!`);
        return res.status(404).json({ error: "Inventory Count not found" });
      }
      
      // Hole alle Inventurelemente des Lagers
      const warehouseId = count.warehouseId;
      console.log(`Lager-ID aus Inventurzählung: ${warehouseId}`);
      
      // Hole Lagerinformation zur Überprüfung
      const warehouse = await storage.getWarehouse(warehouseId);
      if (!warehouse) {
        console.error(`Lager mit ID ${warehouseId} existiert nicht!`);
        return res.status(404).json({ error: "Warehouse not found" });
      }
      
      console.log(`Lager gefunden: ${warehouse.name} (ID: ${warehouseId})`);
      
      // Synchronisiere zuerst alle Automatenprodukte mit dem Lager
      console.log(`Synchronisiere alle Automaten-Produkte mit Lager ${warehouseId} vor dem Hinzufügen zur Inventur...`);
      // Verwende den Service statt der nicht existierenden Methode in storage
      const { reconcileWarehouseProducts } = require('./services/warehouseReconciliation');
      await reconcileWarehouseProducts(warehouseId, true, true);
      
      // Jetzt holen wir die Lagerprodukte direkt aus der inventory_items Tabelle
      const inventoryItems = await storage.getInventoryItemsByWarehouse(warehouseId);
      
      console.log(`${inventoryItems.length} Lagerprodukte gefunden nach Synchronisierung`);
      
      // Extra Debugging der gefundenen Produkte
      for (const item of inventoryItems) {
        console.log(`Lagerprodukt für Hinzufügung zur Inventur: ${item.productName} (ID: ${item.productId}), Bestand: ${item.quantity}`);
      }
      
      if (!inventoryItems || inventoryItems.length === 0) {
        console.warn(`Keine Lagerprodukte für Lager ${warehouseId} gefunden!`);
        return res.status(404).json({ 
          error: "No inventory items found for this warehouse",
          warehouseId 
        });
      }
      
      // Überprüfe, ob bereits Elemente für diese Inventurzählung existieren
      const existingItems = await storage.getInventoryCountItems(inventoryCountId);
      const existingProductIds = new Set(existingItems.map(item => item.productId));
      console.log(`${existingItems.length} Produkte bereits in der Inventur`);
      
      // Speichere nur die Produkte, die noch nicht hinzugefügt wurden
      const savedItems = [];
      let skippedItems = 0;
      
      for (const item of inventoryItems) {
        // Überspringe, wenn das Produkt bereits in der Inventur ist
        if (existingProductIds.has(item.productId || 0)) {
          skippedItems++;
          continue;
        }
        
        const savedItem = await storage.createInventoryCountItem({
          inventoryCountId,
          productId: item.productId || 0,
          expectedQuantity: item.quantity || 0,
          // Initially, we set countedQuantity to null to indicate it hasn't been counted
          actualQuantity: null,
          status: 'pending'
        });
        
        savedItems.push(savedItem);
      }
      
      console.log(`${savedItems.length} neue Inventurelemente für ID ${inventoryCountId} gespeichert, ${skippedItems} übersprungen`);
      
      res.status(201).json({
        success: true,
        addedItems: savedItems.length,
        skippedItems,
        totalItems: savedItems.length + skippedItems
      });
    } catch (error) {
      console.error("Error adding all products to inventory count:", error);
      res.status(500).json({ 
        error: "Failed to add all products to inventory count", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // WebSocket wurde deaktiviert, um Verbindungsprobleme zu vermeiden
  // Wir verwenden stattdessen einen normalen Polling-Ansatz für Updates
  // WebSocket wurde deaktiviert, um Verbindungsprobleme zu vermeiden

  // GET /machines/:id/daily-stats - Tägliche KPIs für einen Automaten abrufen
  app.get(`${API_PREFIX}/machines/:id/daily-stats`, async (req: Request, res: Response) => {
    try {
      // Die ID als Zahl parsen, da es sich um die interne Maschinen-ID handelt
      const machineId = parseInt(req.params.id);
      
      if (isNaN(machineId)) {
        return res.status(400).json({ error: "Ungültige Automaten-ID, muss eine Zahl sein" });
      }

      console.log(`[INFO] Abrufen von täglichen KPIs für Maschine mit ID ${machineId}`);
      
      // Als Nummer an die Storage-Methode übergeben
      try {
        const stats = await storage.getMachineDailyStats(machineId);
        console.log(`[DEBUG] Statistiken für Maschine ${machineId} abgerufen:`, JSON.stringify(stats));
        
        // Füge spezifisches Debug-Log für lastSale hinzu
        if (stats.lastSale) {
          console.log(`[DEBUG] lastSale für Maschine ${machineId} gefunden:`, 
            typeof stats.lastSale === 'object' ? 
              (stats.lastSale.datetime ? new Date(stats.lastSale.datetime).toISOString() : "Kein datetime-Feld") : 
              "Kein Objekt");
        } else {
          console.log(`[DEBUG] Kein lastSale für Maschine ${machineId} gefunden!`);
        }
        
        res.json(stats);
      } catch (storageError) {
        // Detaillierter Fehler-Log der Storage-Methode
        console.error(`[ERROR] Storage-Fehler für Maschine ${machineId}:`, storageError);
        console.error(`Stack Trace:`, storageError instanceof Error ? storageError.stack : 'Kein Stack Trace verfügbar');
        
        // Fallback für Fehlerfall: Leere Statistik-Struktur
        res.json({
          todayTransactions: 0,
          todayRevenue: 0,
          lastSale: null,
          lastCashlessSale: null,
          alcoholSales: {
            today: 0, 
            weekAvg: 0,
            monthAvg: 0
          }
        });
      }
    } catch (error) {
      console.error(`[ERROR] Fehler beim Abrufen der KPIs für Maschine ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Fehler beim Abrufen der Automaten-KPIs", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

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
      
      console.log("[DEBUG] /api/products - Query parameters:", { 
        limit, offset, category, search, supplierId, 
        rawSupplierId: req.query.supplierId
      });
      
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

  // Get machine status overview for dashboard
  app.get(`${API_PREFIX}/machines/status-overview`, async (req: Request, res: Response) => {
    try {
      const machineStatusData = await storage.getMachineStatusOverview();
      res.json(machineStatusData);
    } catch (error) {
      console.error("Error fetching machine status overview:", error);
      res.status(500).json({ 
        error: "Failed to fetch machine status overview", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get location status data for location status page
  app.get(`${API_PREFIX}/location-status`, async (req: Request, res: Response) => {
    try {
      const locationStatusData = await storage.getLocationStatusData();
      res.json(locationStatusData);
    } catch (error) {
      console.error("Error fetching location status data:", error);
      res.status(500).json({ 
        error: "Failed to fetch location status data", 
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
  
  // Die Route für tägliche Statistiken wurde konsolidiert und befindet sich weiter oben
  // Siehe die Route für `/api/machines/:id/daily-stats` weiter oben in dieser Datei
  
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
      // Hilfsfunktionen für Konvertierung und Verarbeitung
      const formatDate = (date: Date | null): string | null => {
        if (!date) return null;
        return date.toISOString();
      };
      
      const parseCount = (countValue: any): number => {
        if (typeof countValue === 'number') return countValue;
        if (typeof countValue === 'string') return parseInt(countValue) || 0;
        if (countValue && typeof countValue === 'object' && 'count' in countValue) {
          return parseCount(countValue.count);
        }
        return 0;
      };

      // Daten sammeln
      const [
        baseStats, 
        transactionStats, 
        weatherStats,
        syncLogs,
        forecastModels,
        holidays
      ] = await Promise.all([
        storage.getDatabaseStats(),
        storage.getTransactionStatistics(),
        storage.getWeatherStatistics().catch(() => ({ count: 0, earliest_date: null, latest_date: null, coverage_percentage: 0 })),
        db.select({ count: count() }).from(syncLogs),
        db.select({ count: count() }).from(sql`forecast_models`).catch(() => [{ count: 0 }]),
        db.select({ count: count() }).from(sql`holidays`).catch(() => [{ count: 0 }])
      ]);
      
      // Erweiterte Statistiken erstellen
      const formattedStats = {
        // Grundlegende Tabellenzahlen
        transactions: {
          count: parseCount(baseStats.transactions.count),
          latest: formatDate(baseStats.transactions.latest)
        },
        machines: {
          count: parseCount(baseStats.machines.count),
          latest: formatDate(baseStats.machines.latest)
        },
        refills: {
          count: parseCount(baseStats.refills.count),
          latest: formatDate(baseStats.refills.latest)
        },
        events: {
          count: parseCount(baseStats.events.count),
          latest: formatDate(baseStats.events.latest)
        },
        products: {
          count: parseCount(baseStats.products.count),
          latest: formatDate(baseStats.products.latest)
        },
        
        // Erweiterte Statistiken
        transactionStats: {
          earliest: transactionStats.earliest_date,
          latest: transactionStats.latest_date,
          count: parseCount(transactionStats.count),
          coverage: Math.round(transactionStats.coverage_percentage || 0) 
        },
        
        // Wetterdaten
        weatherForecasts: 0, // Wird später gefüllt
        weatherHistorical: parseCount(weatherStats.count),
        
        // Zusätzliche Statistiken
        holidays: parseCount(holidays[0]?.count),
        syncLogs: parseCount(syncLogs[0]?.count),
        forecastModels: parseCount(forecastModels[0]?.count)
      };
      
      // Hier fügen wir noch speziell die Anzahl der Wettervorhersagen hinzu
      try {
        const forecastsResult = await db.select({ count: count() }).from(sql`weather_forecasts`);
        formattedStats.weatherForecasts = parseCount(forecastsResult[0]?.count);
      } catch (error) {
        console.log("Wettervorhersagen-Tabelle existiert möglicherweise nicht:", error);
      }
      
      res.json(formattedStats);
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

  // Location Status API für das Dashboard
  app.get(`${API_PREFIX}/location-status`, authenticate, async (req: Request, res: Response) => {
    try {
      console.log('Location-Status-Daten werden abgerufen...');
      
      // Alle Automaten mit ihren Lagern abrufen
      const machines = await db.select({
        id: machines.id,
        name: machines.name,
        location: machines.location,
        warehouseId: machines.warehouseId
      }).from(machines);
      
      const machineStatusData = [];
      
      for (const machine of machines) {
        // Heutiger Umsatz
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        
        const todayRevenue = await db.select({
          total: sql`SUM(${transactions.price})`
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.machineId, machine.id),
            gte(transactions.datetime, todayStart),
            lte(transactions.datetime, todayEnd)
          )
        );
        
        // Letzter Verkauf
        const lastSale = await db.select({
          datetime: transactions.datetime,
          productName: transactions.productName
        })
        .from(transactions)
        .where(eq(transactions.machineId, machine.id))
        .orderBy(desc(transactions.datetime))
        .limit(1);
        
        // Letzte bargeldlose Zahlung
        const lastCashlessSale = await db.select({
          datetime: transactions.datetime,
          paymentMethod: transactions.paymentMethod
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.machineId, machine.id),
            eq(transactions.paymentMethod, 'CASHLESS')
          )
        )
        .orderBy(desc(transactions.datetime))
        .limit(1);
        
        // Letzte 3 Transaktionen
        const recentTransactions = await db.select({
          datetime: transactions.datetime,
          productName: transactions.productName,
          price: transactions.price
        })
        .from(transactions)
        .where(eq(transactions.machineId, machine.id))
        .orderBy(desc(transactions.datetime))
        .limit(3);
        
        // Tage seit letztem Verkauf berechnen
        const now = new Date();
        const lastSaleDate = lastSale[0]?.datetime;
        const daysSinceLastSale = lastSaleDate 
          ? Math.floor((now.getTime() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        const lastCashlessSaleDate = lastCashlessSale[0]?.datetime;
        const daysSinceLastCashless = lastCashlessSaleDate
          ? Math.floor((now.getTime() - new Date(lastCashlessSaleDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        // Status bewerten
        let status = 'ok';
        const warnings = [];
        
        if (daysSinceLastSale > 2) {
          status = 'warning';
          warnings.push('Keine Verkäufe seit über 2 Tagen');
        }
        
        if (daysSinceLastSale > 5) {
          status = 'error';
          warnings.push('Keine Verkäufe seit über 5 Tagen');
        }
        
        machineStatusData.push({
          id: machine.id,
          machineName: machine.name,
          location: machine.location,
          lastRefill: null, // TODO: Füllungsdaten implementieren
          lastSale: lastSale[0] ? {
            datetime: lastSale[0].datetime,
            daysAgo: daysSinceLastSale
          } : null,
          lastCashlessSale: lastCashlessSale[0] ? {
            datetime: lastCashlessSale[0].datetime,
            paymentMethod: lastCashlessSale[0].paymentMethod,
            daysAgo: daysSinceLastCashless
          } : null,
          lastDoorOpen: null, // TODO: Event-Daten implementieren
          todayRevenue: parseFloat(todayRevenue[0]?.total || '0'),
          recentTransactions: recentTransactions.map(t => ({
            datetime: t.datetime,
            productName: t.productName,
            amount: parseFloat(t.price?.toString() || '0')
          })),
          status,
          warnings
        });
      }
      
      console.log(`Location-Status für ${machineStatusData.length} Automaten abgerufen`);
      res.json(machineStatusData);
      
    } catch (error) {
      console.error('Fehler beim Abrufen der Location-Status-Daten:', error);
      res.status(500).json({ 
        error: 'Fehler beim Abrufen der Location-Status-Daten',
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  registerForecastRoutes(app);
  statisticsRoutes(app);
  
  // Registriere Vendon-API-Routen
  app.use(`${API_PREFIX}/vendon`, vendonRoutes);
  app.use(`${API_PREFIX}/vendon/historical-import`, vendonHistoricalImportRouter);
  app.use(`${API_PREFIX}/events`, eventsRouter);
  app.use(`${API_PREFIX}/product-disposals`, productDisposalsRoutes);
  app.use(`${API_PREFIX}/inventory-transfers`, inventoryTransfersRoutes);
  app.use(`${API_PREFIX}/removed-products`, removedProductsRoutes);
  app.use(`${API_PREFIX}/weather`, weatherRoutes);
  app.use(`${API_PREFIX}/holidays`, holidaysRoutes);
  app.use(`${API_PREFIX}/calendar`, calendarRoutes);
  app.use(`${API_PREFIX}/calendar/overview`, calendarOverviewRoutes);
  app.use(`${API_PREFIX}/bulk`, bulkSyncRoutes);
  app.use(`${API_PREFIX}/db`, dbExportRoutes);
  app.use(`${API_PREFIX}/email`, emailRoutes);
  app.use(`${API_PREFIX}/refills`, refillsRoutes);
  app.use(`${API_PREFIX}/database-viewer`, databaseViewerRoutes);
  app.use(`${API_PREFIX}/admin`, adminRouter);
  app.use(`${API_PREFIX}/location-status`, locationStatusRouter);
  
  // Erste Version der Warehouse-Stats-API entfernt, um Duplikate zu vermeiden.
  // Die unten definierte Version (Zeile 2483) wird stattdessen verwendet.
  
  // Registriere Bestellungs-Routen
  app.use(`${API_PREFIX}/orders`, ordersRouter);
  
  // Neue Bestellungen V4
  const ordersV4Router = await import('./routes/orders-v4');
  app.use(`${API_PREFIX}/orders-v4`, ordersV4Router.default);
  
  // Registriere Inventar-Endpunkte (sowohl unter /api/inventory als auch unter /api/debug für Abwärtskompatibilität)
  app.use(`${API_PREFIX}/inventory`, warehouseInventoryRouter); // Nutze den neuen warehouseInventoryRouter für /api/inventory
  app.use(`${API_PREFIX}/debug`, inventoryRouter);
  app.use(`${API_PREFIX}/machine-warehouse-assignments`, machineWarehouseAssignmentsRouter);
  app.use(`${API_PREFIX}/warehouse-machine-assignments`, warehouseMachineAssignmentsRouter);
  app.use(`${API_PREFIX}/product-batches`, productBatchesRouter);
  app.use(`${API_PREFIX}/inventory-batches`, inventoryBatchesRouter);
  app.use(`${API_PREFIX}/inventory-counts`, inventoryCountBatchesRouter);
  app.use(`${API_PREFIX}/warehouse-movements`, warehouseMovementsRouter);
  app.use(`${API_PREFIX}/warehouses`, warehousesRouter); // Neue Route für /api/warehouses
  
  // Direkte Route für die Batch-Verknüpfung hinzufügen - mit ausführlicher Debug-Ausgabe
  app.patch(`${API_PREFIX}/inventory-counts/items/:itemId/batch`, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      // Versuche die batchId sowohl als Objekt-Attribut als auch als direkten Wert zu lesen
      let batchId = null;
      
      // Komplexe Fehlerbehandlung für verschiedene Body-Formate
      console.log("[DEBUG] Vollständiger Request-Body:", req.body);
      
      if (req.body && typeof req.body === 'object') {
        if ('batchId' in req.body) {
          // Normaler JSON-Objekt Fall
          batchId = req.body.batchId;
        } else if (Object.keys(req.body).length === 1) {
          // Fall, wenn das Frontend ein einfaches Objekt ohne Schlüssel sendet
          const firstKey = Object.keys(req.body)[0];
          try {
            // Versuche, es als JSON zu parsen, falls es eine Zeichenkette ist
            const possibleJson = JSON.parse(firstKey);
            if (possibleJson && typeof possibleJson === 'object' && 'batchId' in possibleJson) {
              batchId = possibleJson.batchId;
            }
          } catch (e) {
            // Kein gültiges JSON, versuchen wir den direkten Wert
            console.log("[DEBUG] Versuch direkte Extraktion:", firstKey);
          }
        }
      }
      
      // Validiere, dass wir eine batchId haben
      if (batchId === undefined || batchId === null) {
        // Fallback: Versuche Rohtext zu parsen (für Fälle, in denen der Content-Type falsch gesetzt ist)
        if (typeof req.body === 'string') {
          try {
            const bodyObj = JSON.parse(req.body);
            if (bodyObj && 'batchId' in bodyObj) {
              batchId = bodyObj.batchId;
            }
          } catch (e) {
            console.log("[ERROR] Konnte String-Body nicht parsen:", e);
          }
        }
      }
      
      // Ausführlicher Debug-Log
      console.log(`[DEBUG] PATCH /api/inventory-counts/items/${itemId}/batch:`, { 
        itemId, 
        batchId, 
        body: req.body,
        bodyType: typeof req.body,
        rawBody: req.body ? JSON.stringify(req.body).substring(0, 200) : 'none',
        path: req.path,
        url: req.url,
        headers: req.headers,
        ip: req.ip,
        method: req.method
      });
      
      if (!itemId) {
        console.log(`[ERROR] Ungültige Item-ID: ${itemId}`);
        return res.status(400).json({ error: "Inventory Count Item ID is required" });
      }
      
      if (batchId === undefined) {
        console.log(`[ERROR] Batch-ID fehlt: ${JSON.stringify(req.body)}`);
        return res.status(400).json({ error: "Batch ID is required" });
      }
      
      // Überprüfe, ob das Item existiert, bevor ein Update versucht wird
      const checkResult = await rawDb.query(
        `SELECT * FROM inventory_count_items WHERE id = $1`,
        [itemId]
      );
      
      if (!checkResult.rows || checkResult.rows.length === 0) {
        console.log(`[ERROR] Item mit ID ${itemId} existiert nicht`);
        return res.status(404).json({ error: "Inventory Count Item not found" });
      }
      
      console.log(`[DEBUG] Item gefunden:`, checkResult.rows[0]);
      
      // Wenn wir eine Batch-ID haben, überprüfe optional, ob diese Batch existiert
      if (batchId !== null) {
        const batchCheck = await rawDb.query(
          `SELECT * FROM product_batches WHERE id = $1`,
          [batchId]
        );
        
        if (!batchCheck.rows || batchCheck.rows.length === 0) {
          console.log(`[WARN] Batch mit ID ${batchId} existiert nicht - Update wird trotzdem ausgeführt`);
        } else {
          console.log(`[DEBUG] Batch gefunden:`, batchCheck.rows[0]);
        }
      }
      
      // Aktualisiere das Inventurzählungselement mit der Batch-ID
      const result = await rawDb.query(
        `UPDATE inventory_count_items 
         SET batch_id = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [batchId, itemId]
      );
      
      // Verifiziere das Update-Ergebnis
      console.log(`[DEBUG] UPDATE-Ergebnis:`, result.rows);
      
      if (!result.rows || result.rows.length === 0) {
        console.error(`[ERROR] Item konnte nicht aktualisiert werden: ${itemId}`);
        return res.status(500).json({ error: "Failed to update inventory count item" });
      }
      
      // Hole das aktualisierte Item mit Batch-Informationen
      const updatedItem = result.rows[0];
      
      // Hole Batch-Informationen, wenn eine Batch-ID gesetzt wurde
      if (batchId) {
        const batchResult = await rawDb.query(
          `SELECT * FROM product_batches WHERE id = $1`,
          [batchId]
        );
        
        console.log(`[DEBUG] Batch-Daten:`, batchResult.rows);
        
        if (batchResult.rows && batchResult.rows.length > 0) {
          updatedItem.batch = batchResult.rows[0];
        }
      }
      
      console.log("[SUCCESS] Batch erfolgreich mit Item verknüpft:", { 
        item_id: updatedItem.id,
        batch_id: updatedItem.batch_id,
        product_id: updatedItem.product_id
      });
      
      // Erfolgsantwort senden
      res.status(200).json(updatedItem);
    } catch (error) {
      console.error("[ERROR] Fehler beim Aktualisieren der Batch-ID:", error);
      res.status(500).json({ 
        error: "Failed to update batch ID", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app.use(`${API_PREFIX}`, warehouseLocationsRouter);
  app.use(`${API_PREFIX}`, criticalInventoryRouter); // Route für kritische Inventarposten
  // Diese Route ist doppelt definiert und bereits oben implementiert
  
  // Warehouse stats API endpoint
  app.get(`${API_PREFIX}/warehouses/stats`, async (req: Request, res: Response) => {
    try {
      // Hole alle Lager zum Berechnen der Statistiken
      const warehousesQuery = `SELECT * FROM warehouses WHERE is_active = true ORDER BY name ASC`;
      const warehousesResult = await rawDb.query(warehousesQuery);
      const warehouses = warehousesResult.rows;
      
      console.log(`Berechne Statistiken für ${warehouses.length} Lager...`);
      
      // Erzeuge Statistik-Objekt
      const warehouseStats: Record<string, any> = {};
      
      for (const warehouse of warehouses) {
        // Hole Inventardaten für dieses Lager
        const inventoryQuery = `
          SELECT 
            i.*, 
            p.name as product_name,
            p.min_quantity as product_min_quantity
          FROM 
            inventory_items i
          JOIN 
            products p ON i.product_id = p.id
          WHERE 
            i.warehouse_id = $1
        `;
        const inventoryResult = await rawDb.query(inventoryQuery, [warehouse.id]);
        const inventoryItems = inventoryResult.rows;
        
        // Berechne Statistiken
        const totalItems = inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const totalProducts = inventoryItems.length;
        const criticalStock = inventoryItems.filter(item => 
          (item.quantity || 0) <= (item.product_min_quantity || 0) && (item.product_min_quantity || 0) > 0
        ).length;
        
        // Speichere Statistiken
        warehouseStats[warehouse.id] = {
          totalProducts,
          totalItems,
          lowStock: 0, // Für Abwärtskompatibilität
          criticalStock,
          expiringBatches: 0, // Diese müssten aus den Chargen berechnet werden
          totalBatches: 0
        };
      }
      
      res.json(warehouseStats);
    } catch (error) {
      console.error("Error fetching warehouse stats:", error);
      res.status(500).json({ 
        error: "Failed to fetch warehouse stats", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Einzelnes Lager anhand der ID abrufen
  app.get(`${API_PREFIX}/warehouses/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const query = `SELECT * FROM warehouses WHERE id = $1`;
      const result = await rawDb.query(query, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Warehouse not found" });
      }
      
      console.log("Warehouse mit ID", id, "abgerufen:", result.rows[0]);
      res.json(result.rows[0]);
    } catch (error) {
      console.error(`Error fetching warehouse with ID ${req.params.id}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch warehouse", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  app.use(`${API_PREFIX}/warehouse3`, warehouse3Router); // Bestehende Implementierung
  
  // Route zum Zurücksetzen des Lagerinventars
  app.post(`${API_PREFIX}/reset-warehouse-inventory`, async (req: Request, res: Response) => {
    try {
      const { warehouseId = 0 } = req.body; // 0 bedeutet alle Lager
      
      // SQL-Abfrage zum Löschen der Inventareinträge
      let deleteInventoryQuery;
      let queryParams = [];
      
      if (warehouseId === 0) {
        console.log('Lösche Inventareinträge aus ALLEN Lagern...');
        deleteInventoryQuery = `DELETE FROM inventory_items`;
      } else {
        console.log(`Lösche Inventareinträge aus Lager ${warehouseId}...`);
        deleteInventoryQuery = `DELETE FROM inventory_items WHERE warehouse_id = $1`;
        queryParams.push(warehouseId);
      }
      
      // Führe die Löschung aus
      await rawDb.query(deleteInventoryQuery, queryParams);
      
      // Optional: Lösche auch die Batch-Einträge
      let deleteBatchesQuery;
      let batchParams = [];
      
      if (warehouseId === 0) {
        deleteBatchesQuery = `DELETE FROM product_batches`;
      } else {
        deleteBatchesQuery = `DELETE FROM product_batches WHERE warehouse_id = $1`;
        batchParams.push(warehouseId);
      }
      
      await rawDb.query(deleteBatchesQuery, batchParams);
      
      // Starte den Lagerabgleich, um alle Produkte neu zu laden
      const { reconcileWarehouseProducts } = await import('./services/warehouseReconciliation');
      
      let result;
      if (warehouseId === 0) {
        // Abfrage ohne ORM, da wir in server/routes.ts keine vollständige Importstruktur haben
        const warehousesResult = await rawDb.query(
          'SELECT * FROM warehouses WHERE is_active = true',
          []
        );
        
        console.log(`Starte Lagerabgleich für ${warehousesResult.rows.length} aktive Lager...`);
        const results = [];
        
        for (const warehouse of warehousesResult.rows) {
          const warehouseResult = await reconcileWarehouseProducts(warehouse.id, true);
          results.push({ warehouseId: warehouse.id, ...warehouseResult });
        }
        
        result = { warehouseResults: results };
      } else {
        result = await reconcileWarehouseProducts(Number(warehouseId), true);
      }
      
      return res.json({
        success: true,
        message: `Lagerbestand erfolgreich zurückgesetzt und neu initialisiert`,
        result
      });
    } catch (error) {
      console.error("Fehler beim Zurücksetzen des Lagerinventars:", error);
      return res.status(500).json({
        success: false,
        message: "Fehler beim Zurücksetzen des Lagerinventars",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Route für manuellen Lagerabgleich
  app.post(`${API_PREFIX}/warehouse-reconciliation`, async (req: Request, res: Response) => {
    try {
      const { warehouseId, syncAllProducts = true } = req.body;
      
      if (!warehouseId) {
        return res.status(400).json({ 
          success: false, 
          message: "Lager-ID ist erforderlich" 
        });
      }
      
      console.log(`Manueller Lagerabgleich für Lager ${warehouseId} gestartet...${syncAllProducts ? ' (inkl. aller Produkte aus dem Portfolio)' : ' (nur Automatenprodukte)'}`);
      // Import mit ES Module Syntax statt require
      const { reconcileWarehouseProducts } = await import('./services/warehouseReconciliation');
      const result = await reconcileWarehouseProducts(Number(warehouseId), syncAllProducts);
      
      return res.json({
        success: true,
        message: `Lagerabgleich abgeschlossen: ${result.productsAdded} neue Produkte aus Automaten und ${result.allProductsAdded} aus dem Gesamtportfolio hinzugefügt`,
        result
      });
    } catch (error) {
      console.error("Fehler beim manuellen Lagerabgleich:", error);
      return res.status(500).json({ 
        success: false, 
        message: "Lagerabgleich fehlgeschlagen", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app.use(`${API_PREFIX}/warehouse3-api`, warehouse3ApiRouter); // Neue Lagerverwaltung API (Version 3)
  
  // Lagerplätze API einbinden
  // Entferne diese doppelte Registrierung, da die Route bereits oben registriert wurde
  // app.use(`${API_PREFIX}`, warehouseLocationsRouter);
  
  // Registriere Export/Import-Routen
  app.use(`${API_PREFIX}`, exportImportRoutes);
  
  // Registriere Produkt-Synchronisierung Routen
  app.use(`${API_PREFIX}/product-sync`, productSyncRouter);
  
  // Registriere Vendon Import-Statistiken Routen
  app.use(`${API_PREFIX}/vendon/import`, vendonImportStatsRouter);
  
  // Registriere Vendon historischer Import Routen
  app.use(`${API_PREFIX}/vendon/historical-import`, vendonHistoricalImportRouter);
  
  // Registriere E-Mail-Routen (CRITICAL FIX: Das war bisher nicht registriert!)
  app.use(`${API_PREFIX}`, emailRouter);

  return httpServer;
}
