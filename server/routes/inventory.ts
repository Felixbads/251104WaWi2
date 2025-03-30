import { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { 
  insertWarehouseSchema, 
  insertInventoryItemSchema, 
  insertInventoryMovementSchema,
  insertInventoryCountSchema,
  insertInventoryCountItemSchema,
  insertMachineWarehouseAssignmentSchema
} from "@shared/schema";

// Hilfstypen für Validierung
const idParamSchema = z.object({
  id: z.coerce.number().positive()
});

// Validierung für Warenbewegungen
const inventoryMovementSchema = insertInventoryMovementSchema.extend({
  sourceWarehouseId: z.number().optional(),
  destinationWarehouseId: z.number().optional(),
  machineId: z.number().optional(),
  performedBy: z.number().optional()
});

// Validierung für Lagerbestands-Updates basierend auf Refills
const refillMovementSchema = z.object({
  refillId: z.number().positive(),
  warehouseId: z.number().positive(),
  machineId: z.number().positive(),
  processAll: z.boolean().default(false)
});

/**
 * Lager-Routen registrieren
 */
export function registerInventoryRoutes(app: Express) {
  const apiPrefix = "/api";

  // Lager (Warehouses) Routen
  app.get(`${apiPrefix}/warehouses`, async (req: Request, res: Response) => {
    try {
      const warehouses = await storage.getWarehouses();
      res.json(warehouses);
    } catch (error: any) {
      console.error("Fehler beim Abrufen der Lager:", error);
      res.status(500).json({ error: error.message || "Fehler beim Abrufen der Lager" });
    }
  });

  app.get(`${apiPrefix}/warehouses/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const warehouse = await storage.getWarehouse(id);
      
      if (!warehouse) {
        return res.status(404).json({ error: "Lager nicht gefunden" });
      }
      
      res.json(warehouse);
    } catch (error: any) {
      console.error(`Fehler beim Abrufen des Lagers ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Lager-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Abrufen des Lagers" });
    }
  });

  app.post(`${apiPrefix}/warehouses`, async (req: Request, res: Response) => {
    try {
      const warehouseData = insertWarehouseSchema.parse(req.body);
      const newWarehouse = await storage.createWarehouse(warehouseData);
      res.status(201).json(newWarehouse);
    } catch (error: any) {
      console.error("Fehler beim Erstellen des Lagers:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Lagerdaten", details: error.errors });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Erstellen des Lagers" });
    }
  });

  app.put(`${apiPrefix}/warehouses/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const warehouseData = insertWarehouseSchema.partial().parse(req.body);
      
      const updatedWarehouse = await storage.updateWarehouse(id, warehouseData);
      
      if (!updatedWarehouse) {
        return res.status(404).json({ error: "Lager nicht gefunden" });
      }
      
      res.json(updatedWarehouse);
    } catch (error: any) {
      console.error(`Fehler beim Aktualisieren des Lagers ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Lagerdaten oder ID", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Aktualisieren des Lagers" });
    }
  });

  app.delete(`${apiPrefix}/warehouses/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      
      // Prüfen, ob das Lager noch Artikel oder Verknüpfungen enthält
      const inventoryItems = await storage.getInventoryItemsByWarehouse(id);
      if (inventoryItems.length > 0) {
        return res.status(400).json({ 
          error: "Lager kann nicht gelöscht werden, da es noch Artikel enthält" 
        });
      }
      
      const machineAssignments = await storage.getMachineWarehouseAssignmentsByWarehouse(id);
      if (machineAssignments.length > 0) {
        return res.status(400).json({ 
          error: "Lager kann nicht gelöscht werden, da es noch mit Automaten verknüpft ist" 
        });
      }
      
      const deleted = await storage.deleteWarehouse(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Lager nicht gefunden" });
      }
      
      res.json({ success: true, message: "Lager erfolgreich gelöscht" });
    } catch (error: any) {
      console.error(`Fehler beim Löschen des Lagers ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Lager-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Löschen des Lagers" });
    }
  });

  // Lagerpositionen (Inventory Items) Routen
  app.get(`${apiPrefix}/inventory`, async (req: Request, res: Response) => {
    try {
      const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      const critical = req.query.critical === 'true' ? true : undefined;
      
      const inventoryItems = await storage.getInventoryItems({
        warehouseId,
        productId,
        critical
      });
      
      res.json(inventoryItems);
    } catch (error: any) {
      console.error("Fehler beim Abrufen der Lagerbestände:", error);
      res.status(500).json({ error: error.message || "Fehler beim Abrufen der Lagerbestände" });
    }
  });

  app.get(`${apiPrefix}/inventory/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const inventoryItem = await storage.getInventoryItem(id);
      
      if (!inventoryItem) {
        return res.status(404).json({ error: "Lagerposition nicht gefunden" });
      }
      
      res.json(inventoryItem);
    } catch (error: any) {
      console.error(`Fehler beim Abrufen der Lagerposition ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Lagerpositions-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Abrufen der Lagerposition" });
    }
  });

  app.post(`${apiPrefix}/inventory`, async (req: Request, res: Response) => {
    try {
      const inventoryItemData = insertInventoryItemSchema.parse(req.body);
      
      // Prüfen, ob das Produkt bereits im Lager vorhanden ist
      const existingItem = await storage.getInventoryItemByProductAndWarehouse(
        inventoryItemData.productId, 
        inventoryItemData.warehouseId
      );
      
      if (existingItem) {
        return res.status(400).json({
          error: "Dieses Produkt ist bereits in diesem Lager vorhanden",
          existingItem
        });
      }
      
      const newInventoryItem = await storage.createInventoryItem(inventoryItemData);
      
      // Erzeugen eines Warenbewegungseintrags für die Erstanlage
      if (inventoryItemData.quantity && inventoryItemData.quantity > 0) {
        await storage.createInventoryMovement({
          destinationWarehouseId: inventoryItemData.warehouseId,
          productId: inventoryItemData.productId,
          quantity: inventoryItemData.quantity,
          movementType: "IN",
          referenceType: "MANUAL",
          status: "completed",
          notes: "Initiale Bestandserfassung"
        });
      }
      
      res.status(201).json(newInventoryItem);
    } catch (error: any) {
      console.error("Fehler beim Erstellen der Lagerposition:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Lagerpositionsdaten", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Erstellen der Lagerposition" });
    }
  });

  app.put(`${apiPrefix}/inventory/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const inventoryItemData = insertInventoryItemSchema.partial().parse(req.body);
      
      // Vorherigen Lagerbestand holen, um ggf. eine Warenbewegung zu erzeugen
      const existingItem = await storage.getInventoryItem(id);
      if (!existingItem) {
        return res.status(404).json({ error: "Lagerposition nicht gefunden" });
      }
      
      // Mengenänderung als Warenbewegung erfassen
      if (
        'quantity' in inventoryItemData &&
        inventoryItemData.quantity !== null &&
        inventoryItemData.quantity !== undefined &&
        inventoryItemData.quantity !== existingItem.quantity
      ) {
        const quantityDiff = inventoryItemData.quantity - existingItem.quantity;
        
        await storage.createInventoryMovement({
          sourceWarehouseId: quantityDiff < 0 ? existingItem.warehouseId : undefined,
          destinationWarehouseId: quantityDiff > 0 ? existingItem.warehouseId : undefined,
          productId: existingItem.productId,
          quantity: Math.abs(quantityDiff),
          movementType: quantityDiff > 0 ? "IN" : "OUT",
          referenceType: "MANUAL",
          status: "completed",
          notes: "Manuelle Bestandsanpassung"
        });
      }
      
      const updatedInventoryItem = await storage.updateInventoryItem(id, inventoryItemData);
      
      res.json(updatedInventoryItem);
    } catch (error: any) {
      console.error(`Fehler beim Aktualisieren der Lagerposition ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Lagerpositionsdaten oder ID", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Aktualisieren der Lagerposition" });
    }
  });

  app.delete(`${apiPrefix}/inventory/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      
      // Prüfen, ob noch Bewegungen für diesen Artikel existieren
      const movements = await storage.getInventoryMovementsByInventoryItem(id);
      if (movements.length > 0) {
        return res.status(400).json({ 
          error: "Lagerposition kann nicht gelöscht werden, da bereits Warenbewegungen existieren" 
        });
      }
      
      const deleted = await storage.deleteInventoryItem(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Lagerposition nicht gefunden" });
      }
      
      res.json({ success: true, message: "Lagerposition erfolgreich gelöscht" });
    } catch (error: any) {
      console.error(`Fehler beim Löschen der Lagerposition ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Lagerpositions-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Löschen der Lagerposition" });
    }
  });

  // Warenbewegungen (Inventory Movements) Routen
  app.get(`${apiPrefix}/inventory-movements`, async (req: Request, res: Response) => {
    try {
      const sourceWarehouseId = req.query.sourceWarehouseId ? Number(req.query.sourceWarehouseId) : undefined;
      const destinationWarehouseId = req.query.destinationWarehouseId ? Number(req.query.destinationWarehouseId) : undefined;
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      const machineId = req.query.machineId ? Number(req.query.machineId) : undefined;
      const movementType = req.query.movementType as string | undefined;
      const referenceType = req.query.referenceType as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      
      const movements = await storage.getInventoryMovements({
        sourceWarehouseId,
        destinationWarehouseId,
        productId,
        machineId,
        movementType,
        referenceType,
        limit,
        offset
      });
      
      res.json(movements);
    } catch (error: any) {
      console.error("Fehler beim Abrufen der Warenbewegungen:", error);
      res.status(500).json({ error: error.message || "Fehler beim Abrufen der Warenbewegungen" });
    }
  });

  app.post(`${apiPrefix}/inventory-movements`, async (req: Request, res: Response) => {
    try {
      const movementData = inventoryMovementSchema.parse(req.body);
      
      // Validieren, dass entweder Quelle oder Ziel angegeben ist
      if (!movementData.sourceWarehouseId && !movementData.destinationWarehouseId) {
        return res.status(400).json({ 
          error: "Entweder Quell- oder Ziellager muss angegeben werden" 
        });
      }
      
      // Bei Warenbewegung vom Typ TRANSFER müssen beide angegeben sein
      if (
        movementData.movementType === "TRANSFER" && 
        (!movementData.sourceWarehouseId || !movementData.destinationWarehouseId)
      ) {
        return res.status(400).json({ 
          error: "Für eine Umlagerung (TRANSFER) müssen Quell- und Ziellager angegeben werden" 
        });
      }
      
      // Für OUT-Bewegungen prüfen, ob genug Bestand im Quelllager vorhanden ist
      if (movementData.sourceWarehouseId && movementData.movementType !== "IN") {
        const inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
          movementData.productId, 
          movementData.sourceWarehouseId
        );
        
        if (!inventoryItem) {
          return res.status(400).json({ 
            error: "Das Produkt ist im Quelllager nicht vorhanden" 
          });
        }
        
        if (inventoryItem.quantity < movementData.quantity) {
          return res.status(400).json({ 
            error: "Nicht genügend Bestand im Quelllager",
            available: inventoryItem.quantity,
            requested: movementData.quantity
          });
        }
        
        // Bestand im Quelllager reduzieren
        await storage.updateInventoryItem(inventoryItem.id, {
          quantity: inventoryItem.quantity - movementData.quantity
        });
      }
      
      // Für IN- und TRANSFER-Bewegungen Bestand im Ziellager erhöhen
      if (movementData.destinationWarehouseId && movementData.movementType !== "OUT") {
        let inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
          movementData.productId, 
          movementData.destinationWarehouseId
        );
        
        if (inventoryItem) {
          // Bestand erhöhen, wenn Artikel bereits vorhanden
          await storage.updateInventoryItem(inventoryItem.id, {
            quantity: inventoryItem.quantity + movementData.quantity
          });
        } else {
          // Neuen Artikel anlegen, wenn noch nicht vorhanden
          await storage.createInventoryItem({
            warehouseId: movementData.destinationWarehouseId,
            productId: movementData.productId,
            quantity: movementData.quantity,
            minQuantity: 0
          });
        }
      }
      
      // Warenbewegung speichern
      const newMovement = await storage.createInventoryMovement(movementData);
      
      res.status(201).json(newMovement);
    } catch (error: any) {
      console.error("Fehler beim Erstellen der Warenbewegung:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Warenbewegungsdaten", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Erstellen der Warenbewegung" });
    }
  });

  // Spezielle Route für Warenbewegungen basierend auf Refills
  app.post(`${apiPrefix}/inventory-movements/from-refill`, async (req: Request, res: Response) => {
    try {
      const { refillId, warehouseId, machineId, processAll } = refillMovementSchema.parse(req.body);
      
      // Refill-Daten abrufen
      const refill = await storage.getRefill(refillId);
      if (!refill) {
        return res.status(404).json({ error: "Refill nicht gefunden" });
      }
      
      // Refill-Details abrufen
      const refillDetails = await storage.getRefillDetails(refillId);
      if (refillDetails.length === 0) {
        return res.status(400).json({ error: "Keine Refill-Details gefunden" });
      }
      
      // Überprüfen, ob bereits Warenbewegungen für diesen Refill existieren
      const existingMovements = await storage.getInventoryMovementsByReference("REFILL", refillId);
      if (existingMovements.length > 0 && !processAll) {
        return res.status(400).json({ 
          error: "Für diesen Refill wurden bereits Warenbewegungen erstellt", 
          existingMovements 
        });
      }
      
      // Warenbewegungen für alle Produkte im Refill erstellen
      const createdMovements = [];
      
      for (const detail of refillDetails) {
        // Prüfen, ob für dieses Produkt bereits eine Bewegung existiert
        const existingProductMovement = existingMovements.find(
          m => m.productId === detail.productId
        );
        
        if (existingProductMovement && !processAll) {
          continue; // Überspringen, wenn bereits verarbeitet
        }
        
        // Produkt abrufen um sicherzustellen, dass es existiert
        const product = await storage.getProduct(detail.productId);
        if (!product) {
          return res.status(400).json({ 
            error: `Produkt mit ID ${detail.productId} nicht gefunden` 
          });
        }
        
        // Warenbewegung erstellen (OUT vom Lager)
        const movement = await storage.createInventoryMovement({
          sourceWarehouseId: warehouseId,
          machineId,
          productId: detail.productId,
          quantity: detail.quantity,
          movementType: "OUT",
          referenceType: "REFILL",
          referenceId: refillId,
          status: "completed",
          notes: `Nachfüllung vom ${new Date(refill.createdAt).toLocaleDateString()} für Automat ${refill.machineName || machineId}`
        });
        
        // Bestand im Lager reduzieren
        const inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
          detail.productId,
          warehouseId
        );
        
        if (inventoryItem) {
          const newQuantity = Math.max(0, inventoryItem.quantity - detail.quantity);
          await storage.updateInventoryItem(inventoryItem.id, {
            quantity: newQuantity
          });
        }
        
        createdMovements.push(movement);
      }
      
      res.status(201).json({
        success: true,
        message: `${createdMovements.length} Warenbewegungen für Refill ${refillId} erstellt`,
        movements: createdMovements
      });
    } catch (error: any) {
      console.error("Fehler beim Erstellen der Warenbewegungen aus Refill:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Daten", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: error.message || "Fehler beim Erstellen der Warenbewegungen aus Refill" 
      });
    }
  });

  // Zuordnungen zwischen Automaten und Lagern
  app.get(`${apiPrefix}/machine-warehouse-assignments`, async (req: Request, res: Response) => {
    try {
      const machineId = req.query.machineId ? Number(req.query.machineId) : undefined;
      const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
      
      const assignments = await storage.getMachineWarehouseAssignments({
        machineId,
        warehouseId
      });
      
      res.json(assignments);
    } catch (error: any) {
      console.error("Fehler beim Abrufen der Automaten-Lager-Zuordnungen:", error);
      res.status(500).json({ 
        error: error.message || "Fehler beim Abrufen der Automaten-Lager-Zuordnungen" 
      });
    }
  });

  app.post(`${apiPrefix}/machine-warehouse-assignments`, async (req: Request, res: Response) => {
    try {
      const assignmentData = insertMachineWarehouseAssignmentSchema.parse(req.body);
      
      // Prüfen, ob bereits eine Zuordnung existiert
      const existingAssignment = await storage.getMachineWarehouseAssignmentByMachineAndWarehouse(
        assignmentData.machineId, 
        assignmentData.warehouseId
      );
      
      if (existingAssignment) {
        return res.status(400).json({
          error: "Diese Zuordnung existiert bereits",
          existingAssignment
        });
      }
      
      const newAssignment = await storage.createMachineWarehouseAssignment(assignmentData);
      res.status(201).json(newAssignment);
    } catch (error: any) {
      console.error("Fehler beim Erstellen der Automaten-Lager-Zuordnung:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Zuordnungsdaten", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: error.message || "Fehler beim Erstellen der Automaten-Lager-Zuordnung" 
      });
    }
  });

  app.put(`${apiPrefix}/machine-warehouse-assignments/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const assignmentData = insertMachineWarehouseAssignmentSchema.partial().parse(req.body);
      
      const updatedAssignment = await storage.updateMachineWarehouseAssignment(id, assignmentData);
      
      if (!updatedAssignment) {
        return res.status(404).json({ error: "Zuordnung nicht gefunden" });
      }
      
      res.json(updatedAssignment);
    } catch (error: any) {
      console.error(`Fehler beim Aktualisieren der Zuordnung ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Zuordnungsdaten oder ID", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: error.message || "Fehler beim Aktualisieren der Zuordnung" 
      });
    }
  });

  app.delete(`${apiPrefix}/machine-warehouse-assignments/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      
      const deleted = await storage.deleteMachineWarehouseAssignment(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Zuordnung nicht gefunden" });
      }
      
      res.json({ success: true, message: "Zuordnung erfolgreich gelöscht" });
    } catch (error: any) {
      console.error(`Fehler beim Löschen der Zuordnung ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Zuordnungs-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Löschen der Zuordnung" });
    }
  });

  // Inventuren
  app.get(`${apiPrefix}/inventory-counts`, async (req: Request, res: Response) => {
    try {
      const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
      const status = req.query.status as string | undefined;
      
      const inventoryCounts = await storage.getInventoryCounts({
        warehouseId,
        status
      });
      
      res.json(inventoryCounts);
    } catch (error: any) {
      console.error("Fehler beim Abrufen der Inventuren:", error);
      res.status(500).json({ error: error.message || "Fehler beim Abrufen der Inventuren" });
    }
  });

  app.get(`${apiPrefix}/inventory-counts/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const inventoryCount = await storage.getInventoryCount(id);
      
      if (!inventoryCount) {
        return res.status(404).json({ error: "Inventur nicht gefunden" });
      }
      
      // Inventur-Positionen abrufen
      const inventoryCountItems = await storage.getInventoryCountItems(id);
      
      res.json({
        ...inventoryCount,
        items: inventoryCountItems
      });
    } catch (error: any) {
      console.error(`Fehler beim Abrufen der Inventur ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Inventur-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Abrufen der Inventur" });
    }
  });

  app.post(`${apiPrefix}/inventory-counts`, async (req: Request, res: Response) => {
    try {
      const inventoryCountData = insertInventoryCountSchema.parse(req.body);
      
      // Prüfen, ob es eine offene Inventur für dieses Lager gibt
      const openInventoryCounts = await storage.getInventoryCounts({
        warehouseId: inventoryCountData.warehouseId,
        status: 'open'
      });
      
      if (openInventoryCounts.length > 0) {
        return res.status(400).json({
          error: "Es gibt bereits eine offene Inventur für dieses Lager",
          openInventory: openInventoryCounts[0]
        });
      }
      
      // Neue Inventur anlegen
      const newInventoryCount = await storage.createInventoryCount(inventoryCountData);
      
      // Aktuelle Lagerbestände als Inventurpositionen anlegen
      const inventoryItems = await storage.getInventoryItemsByWarehouse(inventoryCountData.warehouseId);
      
      const inventoryCountItems = [];
      
      for (const item of inventoryItems) {
        const countItem = await storage.createInventoryCountItem({
          inventoryCountId: newInventoryCount.id,
          productId: item.productId,
          expectedQuantity: item.quantity,
          actualQuantity: null // Wird bei der Zählung ausgefüllt
        });
        
        inventoryCountItems.push(countItem);
      }
      
      res.status(201).json({
        ...newInventoryCount,
        items: inventoryCountItems
      });
    } catch (error: any) {
      console.error("Fehler beim Erstellen der Inventur:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Inventurdaten", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Erstellen der Inventur" });
    }
  });

  app.put(`${apiPrefix}/inventory-counts/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const inventoryCountData = insertInventoryCountSchema.partial().parse(req.body);
      
      const existingCount = await storage.getInventoryCount(id);
      if (!existingCount) {
        return res.status(404).json({ error: "Inventur nicht gefunden" });
      }
      
      // Prüfen, ob eine abgeschlossene Inventur wieder geöffnet werden soll
      if (
        existingCount.status === 'completed' && 
        inventoryCountData.status === 'open'
      ) {
        return res.status(400).json({ 
          error: "Eine abgeschlossene Inventur kann nicht wieder geöffnet werden" 
        });
      }
      
      // Wenn die Inventur abgeschlossen wird, Lagerbuchungen vornehmen
      if (
        existingCount.status !== 'completed' && 
        inventoryCountData.status === 'completed'
      ) {
        const inventoryCountItems = await storage.getInventoryCountItems(id);
        
        // Prüfen, ob alle Positionen gezählt wurden
        const uncountedItems = inventoryCountItems.filter(item => item.actualQuantity === null);
        if (uncountedItems.length > 0) {
          return res.status(400).json({ 
            error: "Die Inventur kann nicht abgeschlossen werden, da nicht alle Positionen gezählt wurden",
            uncountedItems
          });
        }
        
        // Bestände aktualisieren
        for (const item of inventoryCountItems) {
          if (item.actualQuantity === item.expectedQuantity) {
            continue; // Keine Anpassung nötig
          }
          
          // Lagerposition finden
          const inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
            item.productId,
            existingCount.warehouseId
          );
          
          if (inventoryItem) {
            // Bestand aktualisieren
            await storage.updateInventoryItem(inventoryItem.id, {
              quantity: item.actualQuantity
            });
            
            // Warenbewegung für die Korrektur erzeugen
            const quantityDiff = item.actualQuantity - item.expectedQuantity;
            
            await storage.createInventoryMovement({
              sourceWarehouseId: quantityDiff < 0 ? existingCount.warehouseId : undefined,
              destinationWarehouseId: quantityDiff > 0 ? existingCount.warehouseId : undefined,
              productId: item.productId,
              quantity: Math.abs(quantityDiff),
              movementType: quantityDiff > 0 ? "IN" : "OUT",
              referenceType: "INVENTORY_COUNT",
              referenceId: id,
              status: "completed",
              notes: `Bestandskorrektur durch Inventur #${id}`
            });
          }
        }
      }
      
      const updatedInventoryCount = await storage.updateInventoryCount(id, inventoryCountData);
      
      // Inventur-Positionen abrufen
      const inventoryCountItems = await storage.getInventoryCountItems(id);
      
      res.json({
        ...updatedInventoryCount,
        items: inventoryCountItems
      });
    } catch (error: any) {
      console.error(`Fehler beim Aktualisieren der Inventur ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Inventurdaten oder ID", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Aktualisieren der Inventur" });
    }
  });

  app.delete(`${apiPrefix}/inventory-counts/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      
      const existingCount = await storage.getInventoryCount(id);
      if (!existingCount) {
        return res.status(404).json({ error: "Inventur nicht gefunden" });
      }
      
      // Prüfen, ob die Inventur abgeschlossen ist
      if (existingCount.status === 'completed') {
        return res.status(400).json({ 
          error: "Eine abgeschlossene Inventur kann nicht gelöscht werden" 
        });
      }
      
      // Zuerst die Inventurpositionen löschen
      await storage.deleteInventoryCountItems(id);
      
      // Dann die Inventur selbst löschen
      const deleted = await storage.deleteInventoryCount(id);
      
      res.json({ success: true, message: "Inventur erfolgreich gelöscht" });
    } catch (error: any) {
      console.error(`Fehler beim Löschen der Inventur ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Inventur-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Löschen der Inventur" });
    }
  });

  // Inventurpositionen aktualisieren
  app.put(`${apiPrefix}/inventory-count-items/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const itemData = insertInventoryCountItemSchema.partial().parse(req.body);
      
      const existingItem = await storage.getInventoryCountItem(id);
      if (!existingItem) {
        return res.status(404).json({ error: "Inventurposition nicht gefunden" });
      }
      
      // Inventur abrufen um zu prüfen, ob sie noch offen ist
      const inventoryCount = await storage.getInventoryCount(existingItem.inventoryCountId);
      if (inventoryCount?.status !== 'open') {
        return res.status(400).json({ 
          error: "Die Inventur ist nicht mehr offen und kann nicht mehr bearbeitet werden" 
        });
      }
      
      const updatedItem = await storage.updateInventoryCountItem(id, itemData);
      
      res.json(updatedItem);
    } catch (error: any) {
      console.error(`Fehler beim Aktualisieren der Inventur-Position ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Inventur-Positionsdaten oder ID", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Aktualisieren der Inventur-Position" });
    }
  });
}