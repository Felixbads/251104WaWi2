import { Express, Request, Response } from "express";
import { z } from "zod";
import { storage, db } from "../storage";
import { sql, eq, and, or, lt, asc, desc, inArray } from "drizzle-orm";
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
      
      // Lade alle verfügbaren Maschinen
      const machines = await storage.getMachines();
      
      // Produkte aus allen Maschinen zusammensammeln
      const allProducts = new Map<number, { productId: number, productName: string }>();
      
      // Für jede Maschine:
      for (const machine of machines) {
        try {
          // Lade Transaktionen der Maschine um Produkt-IDs zu finden
          const transactions = await storage.getTransactionsByMachine(machine.id, 100);
          
          for (const transaction of transactions) {
            // Keine doppelten Einträge für das gleiche Produkt
            if (transaction.productId && !allProducts.has(transaction.productId)) {
              allProducts.set(transaction.productId, {
                productId: transaction.productId,
                productName: transaction.name || 'Unbekanntes Produkt'
              });
            }
          }
        } catch (error) {
          console.error(`Fehler beim Laden der Produkte für Maschine ${machine.id}:`, error);
          // Ignoriere den Fehler und fahre mit der nächsten Maschine fort
        }
      }
      
      // Produkte zum Lagerbestand hinzufügen
      for (const product of allProducts.values()) {
        try {
          // Prüfe, ob das Produkt in der Datenbank existiert
          const productExists = await storage.getProduct(product.productId);
          
          if (productExists) {
            // Erstelle Inventar-Eintrag mit Menge 0
            await storage.createInventoryItem({
              warehouseId: newWarehouse.id,
              productId: product.productId,
              quantity: 0,
              minQuantity: 0,
              status: "active",
              notes: `Automatisch erstellt bei Lageranlage am ${new Date().toISOString().split('T')[0]}`
            });
          }
        } catch (error) {
          console.error(`Fehler beim Hinzufügen von Produkt ${product.productId} zum Lagerbestand:`, error);
          // Ignoriere den Fehler und fahre mit dem nächsten Produkt fort
        }
      }
      
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
      if (inventoryItemData.quantity > 0) {
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
        return res.status(400).json({ error: "Keine Refill-Details vorhanden" });
      }
      
      // Prüfen, ob bereits Warenbewegungen für diesen Refill erstellt wurden
      const existingMovements = await storage.getInventoryMovementsByReference("REFILL", refillId.toString());
      if (existingMovements.length > 0 && !processAll) {
        return res.status(400).json({ 
          error: "Für diesen Refill wurden bereits Warenbewegungen erstellt",
          existingMovements
        });
      }
      
      // Warenbewegungen für alle Refill-Details erstellen, die eine Entnahme (added > 0) darstellen
      const createdMovements = [];
      
      for (const detail of refillDetails) {
        // Nur Refill-Details mit Hinzufügungen verarbeiten, wenn nicht explizit alle gewünscht
        if (detail.added <= 0 && !processAll) continue;
        
        // Produkt-ID abrufen
        let productId = detail.productId;
        
        // Wenn detail.productId eine Vendon-ID ist (string), entsprechendes Produkt in der DB suchen
        if (typeof detail.productId === 'string') {
          const product = await storage.getProductByVendonId(detail.productId);
          if (!product) {
            console.warn(`Produkt mit Vendon-ID ${detail.productId} nicht gefunden`);
            continue;
          }
          productId = product.id;
        }
        
        // Bei Hinzufügungen (added > 0) eine OUT-Bewegung vom Lager zum Automaten erstellen
        if (detail.added > 0) {
          const movementData = {
            sourceWarehouseId: warehouseId,
            machineId: machineId,
            productId: productId as number,
            quantity: detail.added,
            movementType: "OUT",
            referenceType: "REFILL",
            referenceId: refillId.toString(),
            status: "completed",
            notes: `Automaten-Befüllung: ${refill.machineName}`
          };
          
          // Prüfen, ob genug Bestand im Lager vorhanden ist
          const inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
            productId as number, 
            warehouseId
          );
          
          if (!inventoryItem) {
            console.warn(`Produkt ${productId} ist im Lager ${warehouseId} nicht vorhanden`);
            continue;
          }
          
          if (inventoryItem.quantity < detail.added) {
            console.warn(`Nicht genügend Bestand für Produkt ${productId} im Lager ${warehouseId}`);
            continue;
          }
          
          // Bestand im Lager reduzieren
          await storage.updateInventoryItem(inventoryItem.id, {
            quantity: inventoryItem.quantity - detail.added
          });
          
          // Warenbewegung speichern
          const newMovement = await storage.createInventoryMovement(movementData);
          createdMovements.push(newMovement);
        }
        
        // Bei Entnahmen (removed > 0) und falls processAll aktiv ist, eine IN-Bewegung vom Automaten zum Lager erstellen
        if (processAll && detail.removed > 0) {
          const movementData = {
            destinationWarehouseId: warehouseId,
            machineId: machineId,
            productId: productId as number,
            quantity: detail.removed,
            movementType: "IN",
            referenceType: "REFILL",
            referenceId: refillId.toString(),
            status: "completed",
            notes: `Rücknahme aus Automat: ${refill.machineName}`
          };
          
          // Bestand im Lager erhöhen
          let inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
            productId as number, 
            warehouseId
          );
          
          if (inventoryItem) {
            await storage.updateInventoryItem(inventoryItem.id, {
              quantity: inventoryItem.quantity + detail.removed
            });
          } else {
            // Neuen Artikel anlegen, wenn noch nicht vorhanden
            await storage.createInventoryItem({
              warehouseId: warehouseId,
              productId: productId as number,
              quantity: detail.removed,
              minQuantity: 0
            });
          }
          
          // Warenbewegung speichern
          const newMovement = await storage.createInventoryMovement(movementData);
          createdMovements.push(newMovement);
        }
      }
      
      res.status(201).json({
        success: true,
        message: `${createdMovements.length} Warenbewegungen wurden erstellt`,
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
      
      res.status(500).json({ error: error.message || "Fehler beim Erstellen der Warenbewegungen" });
    }
  });

  // Maschinen-Lager-Zuordnungen
  app.get(`${apiPrefix}/machine-warehouse-assignments`, async (req: Request, res: Response) => {
    try {
      const machineId = req.query.machineId ? Number(req.query.machineId) : undefined;
      const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
      
      console.log('Anfrage nach Maschinen-Lager-Zuordnungen mit Parametern:', { machineId, warehouseId });
      
      // SQL-Debug - Direkte Datenbankabfrage wurde entfernt, da db und sql nicht importiert wurden.
      
      const assignments = await storage.getMachineWarehouseAssignments({
        machineId,
        warehouseId
      });
      
      console.log('Ergebnis der Maschinen-Lager-Zuordnungen:', JSON.stringify(assignments));
      
      res.json(assignments);
    } catch (error: any) {
      console.error("Fehler beim Abrufen der Maschinen-Lager-Zuordnungen:", error);
      res.status(500).json({ error: error.message || "Fehler beim Abrufen der Maschinen-Lager-Zuordnungen" });
    }
  });

  app.post(`${apiPrefix}/machine-warehouse-assignments`, async (req: Request, res: Response) => {
    try {
      console.log('POST Anfrage für neue Maschinen-Lager-Zuordnung mit Daten:', req.body);
      
      const assignmentData = insertMachineWarehouseAssignmentSchema.parse(req.body);
      
      console.log('Validierte Zuordnungsdaten:', assignmentData);
      
      // Prüfen, ob die Maschine und das Lager existieren
      const machine = await storage.getMachine(assignmentData.machineId);
      const warehouse = await storage.getWarehouse(assignmentData.warehouseId);
      
      if (!machine) {
        console.error(`Maschine mit ID ${assignmentData.machineId} existiert nicht`);
        return res.status(404).json({ error: `Maschine mit ID ${assignmentData.machineId} existiert nicht` });
      }
      
      if (!warehouse) {
        console.error(`Lager mit ID ${assignmentData.warehouseId} existiert nicht`);
        return res.status(404).json({ error: `Lager mit ID ${assignmentData.warehouseId} existiert nicht` });
      }
      
      console.log(`Maschine und Lager existieren: ${machine.machineName} / ${warehouse.name}`);
      
      // Prüfen, ob die Zuordnung bereits existiert
      const existingAssignment = await storage.getMachineWarehouseAssignment(
        assignmentData.machineId, 
        assignmentData.warehouseId
      );
      
      if (existingAssignment) {
        console.log('Zuordnung existiert bereits:', existingAssignment);
        return res.status(400).json({
          error: "Diese Maschine ist bereits diesem Lager zugeordnet",
          existingAssignment
        });
      }
      
      // Wenn isPrimary = true, dann andere Zuordnungen auf isPrimary = false setzen
      if (assignmentData.isPrimary) {
        console.log('Setze existierende Primärzuordnungen zurück für Maschine:', assignmentData.machineId);
        await storage.updatePrimaryWarehouseForMachine(assignmentData.machineId);
      }
      
      // Neue Zuordnung erstellen
      console.log('Erstelle neue Zuordnung zwischen Maschine und Lager');
      const newAssignment = await storage.createMachineWarehouseAssignment(assignmentData);
      console.log('Neue Zuordnung erstellt:', newAssignment);
      
      // Produkte der Maschine laden und automatisch zum Lager hinzufügen
      try {
        // Transaktionen der Maschine laden
        const transactions = await storage.getTransactionsByMachine(assignmentData.machineId, 100);
        
        // Map für eindeutige Produkte erstellen
        const uniqueProducts = new Map<number, { productId: number, productName: string }>();
        
        // Aus Transaktionen eindeutige Produkte extrahieren
        for (const transaction of transactions) {
          if (transaction.productId && !uniqueProducts.has(transaction.productId)) {
            uniqueProducts.set(transaction.productId, {
              productId: transaction.productId,
              productName: transaction.name || 'Unbekanntes Produkt'
            });
          }
        }
        
        // Produkte zum Lagerbestand hinzufügen, wenn sie noch nicht vorhanden sind
        for (const product of uniqueProducts.values()) {
          try {
            // Prüfen, ob das Produkt in der Datenbank existiert
            const productExists = await storage.getProduct(product.productId);
            
            if (productExists) {
              // Prüfen, ob das Produkt bereits im Lager vorhanden ist
              const existingInventoryItem = await storage.getInventoryItemByProductAndWarehouse(
                product.productId, 
                assignmentData.warehouseId
              );
              
              // Nur hinzufügen, wenn es noch nicht im Lager ist
              if (!existingInventoryItem) {
                await storage.createInventoryItem({
                  warehouseId: assignmentData.warehouseId,
                  productId: product.productId,
                  quantity: 0,
                  minQuantity: 0,
                  status: "active",
                  notes: `Automatisch erstellt bei Maschinenzuordnung am ${new Date().toISOString().split('T')[0]}`
                });
              }
            }
          } catch (error) {
            console.error(`Fehler beim Hinzufügen von Produkt ${product.productId} zum Lagerbestand:`, error);
            // Ignoriere den Fehler und fahre mit dem nächsten Produkt fort
          }
        }
      } catch (error) {
        console.error(`Fehler beim Laden der Produkte für Maschine ${assignmentData.machineId}:`, error);
        // Wir ignorieren den Fehler, damit die Zuordnung dennoch erstellt wird
      }
      
      res.status(201).json(newAssignment);
    } catch (error: any) {
      console.error("Fehler beim Erstellen der Maschinen-Lager-Zuordnung:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Zuordnungsdaten", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Erstellen der Maschinen-Lager-Zuordnung" });
    }
  });

  app.put(`${apiPrefix}/machine-warehouse-assignments/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const assignmentData = insertMachineWarehouseAssignmentSchema.partial().parse(req.body);
      
      // Wenn isPrimary = true, dann andere Zuordnungen auf isPrimary = false setzen
      if (assignmentData.isPrimary) {
        const assignment = await storage.getMachineWarehouseAssignmentById(id);
        if (assignment) {
          await storage.updatePrimaryWarehouseForMachine(assignment.machineId);
        }
      }
      
      const updatedAssignment = await storage.updateMachineWarehouseAssignment(id, assignmentData);
      
      if (!updatedAssignment) {
        return res.status(404).json({ error: "Zuordnung nicht gefunden" });
      }
      
      res.json(updatedAssignment);
    } catch (error: any) {
      console.error(`Fehler beim Aktualisieren der Maschinen-Lager-Zuordnung ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          error: "Ungültige Zuordnungsdaten oder ID", 
          details: error.errors 
        });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Aktualisieren der Maschinen-Lager-Zuordnung" });
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
      console.error(`Fehler beim Löschen der Maschinen-Lager-Zuordnung ${req.params.id}:`, error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Ungültige Zuordnungs-ID" });
      }
      
      res.status(500).json({ error: error.message || "Fehler beim Löschen der Maschinen-Lager-Zuordnung" });
    }
  });

  // Inventur-Prozesse
  app.get(`${apiPrefix}/inventory-counts`, async (req: Request, res: Response) => {
    try {
      const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      
      const inventoryCounts = await storage.getInventoryCounts({
        warehouseId,
        status,
        limit,
        offset
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
      
      // Inventur-Items abrufen
      const items = await storage.getInventoryCountItems(id);
      
      res.json({
        ...inventoryCount,
        items
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
      
      // Prüfen, ob bereits eine aktive Inventur für dieses Lager existiert
      const existingInventoryCounts = await storage.getInventoryCounts({
        warehouseId: inventoryCountData.warehouseId,
        status: "pending,in_progress"
      });
      
      if (existingInventoryCounts.length > 0) {
        return res.status(400).json({
          error: "Es existiert bereits eine aktive Inventur für dieses Lager",
          existingCount: existingInventoryCounts[0]
        });
      }
      
      // Neue Inventur erstellen
      const newInventoryCount = await storage.createInventoryCount(inventoryCountData);
      
      // Alle Lagerartikel des Lagers abrufen
      const inventoryItems = await storage.getInventoryItemsByWarehouse(inventoryCountData.warehouseId);
      
      // Für jeden Artikel ein Inventur-Item anlegen
      const inventoryCountItems = [];
      
      for (const item of inventoryItems) {
        const countItem = await storage.createInventoryCountItem({
          inventoryCountId: newInventoryCount.id,
          productId: item.productId,
          expectedQuantity: item.quantity,
          status: "pending"
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
      
      // Inventur abrufen
      const inventoryCount = await storage.getInventoryCount(id);
      if (!inventoryCount) {
        return res.status(404).json({ error: "Inventur nicht gefunden" });
      }
      
      // Status-Änderungen behandeln
      if (
        inventoryCountData.status === "completed" && 
        (inventoryCount.status === "pending" || inventoryCount.status === "in_progress")
      ) {
        // Endzeit setzen
        inventoryCountData.endDate = new Date();
        
        // Alle Items checken, ob sie gezählt wurden
        const items = await storage.getInventoryCountItems(id);
        const uncountedItems = items.filter(item => 
          item.status === "pending" || item.actualQuantity === null || item.actualQuantity === undefined
        );
        
        if (uncountedItems.length > 0) {
          return res.status(400).json({
            error: "Es gibt noch ungezählte Artikel in dieser Inventur",
            uncountedItems
          });
        }
        
        // Bestandsdifferenzen in Lagerbeständen anpassen
        for (const item of items) {
          if (item.difference !== 0) {
            // Lagerposition abrufen
            const inventoryItem = await storage.getInventoryItemByProductAndWarehouse(
              item.productId, 
              inventoryCount.warehouseId
            );
            
            if (inventoryItem) {
              // Lagerbestand anpassen
              await storage.updateInventoryItem(inventoryItem.id, {
                quantity: item.actualQuantity,
                lastCountDate: new Date()
              });
              
              // Warenbewegung für die Bestandsanpassung erstellen
              if (item.difference > 0) {
                // Zuwachs: IN-Bewegung
                await storage.createInventoryMovement({
                  destinationWarehouseId: inventoryCount.warehouseId,
                  productId: item.productId,
                  quantity: item.difference,
                  movementType: "IN",
                  referenceType: "INVENTORY_COUNT",
                  referenceId: id.toString(),
                  status: "completed",
                  notes: "Bestandserhöhung durch Inventur"
                });
              } else if (item.difference < 0) {
                // Abnahme: OUT-Bewegung
                await storage.createInventoryMovement({
                  sourceWarehouseId: inventoryCount.warehouseId,
                  productId: item.productId,
                  quantity: Math.abs(item.difference),
                  movementType: "OUT",
                  referenceType: "INVENTORY_COUNT",
                  referenceId: id.toString(),
                  status: "completed",
                  notes: "Bestandsminderung durch Inventur"
                });
              }
            }
          }
        }
      } else if (
        inventoryCountData.status === "in_progress" && 
        inventoryCount.status === "pending"
      ) {
        // Startzeit setzen
        inventoryCountData.startDate = new Date();
      }
      
      const updatedInventoryCount = await storage.updateInventoryCount(id, inventoryCountData);
      
      // Inventur-Items abrufen
      const items = await storage.getInventoryCountItems(id);
      
      res.json({
        ...updatedInventoryCount,
        items
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
      
      // Inventur abrufen
      const inventoryCount = await storage.getInventoryCount(id);
      if (!inventoryCount) {
        return res.status(404).json({ error: "Inventur nicht gefunden" });
      }
      
      // Prüfen, ob die Inventur bereits abgeschlossen oder in Bearbeitung ist
      if (inventoryCount.status !== "pending") {
        return res.status(400).json({
          error: "Nur ausstehende Inventuren können gelöscht werden"
        });
      }
      
      // Alle zugehörigen Inventur-Items löschen
      await storage.deleteInventoryCountItemsByInventoryCount(id);
      
      // Inventur löschen
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

  // Inventur-Items
  app.put(`${apiPrefix}/inventory-count-items/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const itemData = insertInventoryCountItemSchema.partial().parse(req.body);
      
      // Inventur-Item abrufen
      const inventoryCountItem = await storage.getInventoryCountItemById(id);
      if (!inventoryCountItem) {
        return res.status(404).json({ error: "Inventur-Position nicht gefunden" });
      }
      
      // Inventur abrufen
      const inventoryCount = await storage.getInventoryCount(inventoryCountItem.inventoryCountId);
      if (!inventoryCount) {
        return res.status(404).json({ error: "Zugehörige Inventur nicht gefunden" });
      }
      
      // Prüfen, ob die Inventur bereits abgeschlossen ist
      if (inventoryCount.status === "completed" || inventoryCount.status === "cancelled") {
        return res.status(400).json({
          error: "Die Inventur ist bereits abgeschlossen oder storniert"
        });
      }
      
      // Wenn die tatsächliche Menge gesetzt wird, die Differenz berechnen
      if (
        'actualQuantity' in itemData && 
        itemData.actualQuantity !== null && 
        itemData.actualQuantity !== undefined
      ) {
        itemData.difference = itemData.actualQuantity - inventoryCountItem.expectedQuantity;
        itemData.status = "counted";
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