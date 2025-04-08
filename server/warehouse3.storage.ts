import { db } from "./db";
import { sql } from "drizzle-orm";
import { eq, and, or, desc, inArray, gte, lte, like } from "drizzle-orm";
import { products, machines } from "../shared/schema";

// Import warehouse3 schema definitions for type information
import {
  InsertWarehouse,
  InsertMachineWarehouseAssignment,
  InsertProductInventory,
  InsertProductBatch,
  InsertInventoryMovement,
  InsertInventoryCount,
  InsertInventoryCountItem,
  InsertRefillTracking,
  InsertRefillTrackingItem,
} from "../shared/warehouse3.schema";

// Da die Tabellennamen in warehouse3.schema.ts mit "_v3" enden, 
// aber die tatsächlichen Tabellen in der Datenbank ohne dieses Suffix existieren,
// definieren wir hier lokale Tabellennamen, die auf die realen Tabellen verweisen

// Adapter für vorhandene Tabellen - mit gleichen Spalten wie im Schema
import { pgTable } from "drizzle-orm/pg-core";
import { timestamp, integer, text, date, serial, boolean } from "drizzle-orm/pg-core";

// Tabellendefinitionen für die tatsächlich existierenden Tabellen
const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  status: text("status").default("active"),
  notes: text("notes"),
  // created_by spalte existiert nicht in der Datenbank
  // createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Inventory-Items-Tabelle
const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id"),
  productId: integer("product_id"),
  quantity: integer("quantity").default(0),
  minQuantity: integer("min_quantity").default(0),
  status: text("status").default("active"),
  lastCountDate: timestamp("last_count_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Aliase für alte Tabellennamen, die wir in den Storage-Methoden verwenden
const productInventory = inventoryItems;

// Beibehalten der ursprünglichen Namen für die Tabellen, die wir unverändert verwenden
const machineWarehouseAssignments = pgTable("machine_warehouse_assignments", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(), 
  warehouseId: integer("warehouse_id").notNull(),
  isPrimary: boolean("is_primary").default(true),
  assignedBy: integer("assigned_by"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const productBatches = pgTable("product_batches", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull(),
  productId: integer("product_id").notNull(), 
  batchNumber: text("batch_number").notNull(),
  expiryDate: date("expiry_date"),
  initialQuantity: integer("initial_quantity").notNull(),
  currentQuantity: integer("current_quantity").notNull(),
  receivedDate: timestamp("received_date").defaultNow(),
  supplierRef: text("supplier_batch_number"),
  status: text("status").default("active"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  
  // Quelle und Ziel
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id"),
  destinationType: text("destination_type").notNull(),
  destinationId: integer("destination_id"),
  
  // Produkt und Mengeninformationen
  productId: integer("product_id").notNull(),
  batchId: integer("batch_id"),
  quantity: integer("quantity").notNull(),
  
  // Bestandsinformationen für Audit-Trail
  previousStock: integer("previous_stock"),
  currentStock: integer("current_stock"),
  
  // Bewegungstyp und Referenzen
  movementType: text("movement_type").notNull(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  
  // Metadaten
  reason: text("reason"),
  notes: text("notes"),
  status: text("status").default("completed"),
  
  // Wer hat die Bewegung durchgeführt
  performedBy: integer("performed_by"),
  performedAt: timestamp("performed_at").defaultNow(),
  
  // Zeitstempel
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Für die Konsistenz mit den anderen Tabellen
const inventoryCounts = pgTable("inventory_counts", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull(),
  status: text("status").default("pending"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  initiatedBy: integer("initiated_by"),
  completedBy: integer("completed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const inventoryCountItems = pgTable("inventory_count_items", {
  id: serial("id").primaryKey(),
  countId: integer("count_id").notNull(),
  productId: integer("product_id").notNull(),
  batchId: integer("batch_id"),
  expectedQuantity: integer("expected_quantity").default(0),
  actualQuantity: integer("actual_quantity"),
  discrepancy: integer("discrepancy"),
  notes: text("notes"),
  countedBy: integer("counted_by"),
  countedAt: timestamp("counted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const refillTrackings = pgTable("refill_trackings", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  refillDate: timestamp("refill_date").defaultNow(),
  status: text("status").default("completed"),
  notes: text("notes"),
  performedBy: integer("performed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const refillTrackingItems = pgTable("refill_tracking_items", {
  id: serial("id").primaryKey(),
  refillId: integer("refill_id").notNull(),
  productId: integer("product_id").notNull(),
  batchId: integer("batch_id"),
  quantity: integer("quantity").notNull(),
  stockBefore: integer("stock_before"),
  stockAfter: integer("stock_after"),
  expectedMachineStockAfter: integer("expected_machine_stock_after"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export interface WarehouseStorage {
  // Warehouse Management
  getWarehouses(): Promise<any[]>;
  getWarehouse(id: number): Promise<any | null>;
  createWarehouse(data: InsertWarehouse): Promise<any>;
  updateWarehouse(id: number, data: Partial<InsertWarehouse>): Promise<any>;
  deleteWarehouse(id: number): Promise<boolean>;
  
  // Machine-Warehouse Assignments
  assignMachineToWarehouse(data: InsertMachineWarehouseAssignment): Promise<any>;
  unassignMachineFromWarehouse(machineId: number, warehouseId: number): Promise<boolean>;
  getWarehouseAssignments(warehouseId: number): Promise<any[]>;
  getMachineAssignments(machineId: number): Promise<any[]>;
  
  // Inventory Management
  getProductInventory(warehouseId: number, filters?: any): Promise<any[]>;
  getProductInventoryItem(warehouseId: number, productId: number): Promise<any | null>;
  createProductInventory(data: InsertProductInventory): Promise<any>;
  updateProductInventory(id: number, data: Partial<InsertProductInventory>): Promise<any>;
  updateProductStock(warehouseId: number, productId: number, quantityChange: number): Promise<any>;
  
  // Batch Management
  getProductBatches(warehouseId: number, productId?: number): Promise<any[]>;
  getProductBatch(batchId: number): Promise<any | null>;
  createProductBatch(data: InsertProductBatch): Promise<any>;
  updateProductBatch(id: number, data: Partial<InsertProductBatch>): Promise<any>;
  updateBatchStock(batchId: number, quantityChange: number): Promise<any>;
  getExpiredBatches(): Promise<any[]>;
  removeExpiredBatches(): Promise<void>;
  
  // Inventory Movements
  createInventoryMovement(data: InsertInventoryMovement): Promise<any>;
  getInventoryMovements(filters?: any): Promise<any[]>;
  getInventoryMovement(id: number): Promise<any | null>;
  
  // Inventory Counts
  createInventoryCount(data: InsertInventoryCount): Promise<any>;
  getInventoryCounts(warehouseId: number): Promise<any[]>;
  getInventoryCount(id: number): Promise<any | null>;
  updateInventoryCount(id: number, data: Partial<InsertInventoryCount>): Promise<any>;
  
  // Inventory Count Items
  createInventoryCountItem(data: InsertInventoryCountItem): Promise<any>;
  getInventoryCountItems(countId: number): Promise<any[]>;
  updateInventoryCountItem(id: number, data: Partial<InsertInventoryCountItem>): Promise<any>;
  
  // Refill Tracking
  createRefillTracking(data: InsertRefillTracking): Promise<any>;
  getRefillTrackings(warehouseId: number): Promise<any[]>;
  getRefillTracking(id: number): Promise<any | null>;
  createRefillTrackingItem(data: InsertRefillTrackingItem): Promise<any>;
  getRefillTrackingItems(refillId: number): Promise<any[]>;
}

export class DrizzleWarehouseStorage implements WarehouseStorage {
  // ---- WAREHOUSE MANAGEMENT ----
  
  async getWarehouses(): Promise<any[]> {
    const result = await db.select().from(warehouses);
    
    // Erweiterte Informationen (Produktzahlen, etc.) hinzufügen
    const warehousesWithDetails = await Promise.all(result.map(async (warehouse) => {
      // 1. Produkte aus inventory_items zählen
      const [inventoryCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(inventoryItems)
        .where(eq(inventoryItems.warehouseId, warehouse.id));
      
      // 2. Produkte aus productBatches zählen (mit Gruppierung nach Produkt-ID)
      const [batchesCount] = await db
        .select({ 
          count: sql<number>`COUNT(DISTINCT ${productBatches.productId})` 
        })
        .from(productBatches)
        .where(
          and(
            eq(productBatches.warehouseId, warehouse.id),
            eq(productBatches.status, 'active'),
            sql`${productBatches.currentQuantity} > 0`
          )
        );
      
      const [criticalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.warehouseId, warehouse.id),
          sql`${inventoryItems.quantity} <= ${inventoryItems.minQuantity}`,
          sql`${inventoryItems.minQuantity} > 0` // Nur wenn ein Mindestbestand gesetzt ist
        ));
      
      // Gesamtzahl der Produkte berechnen (aus beiden Quellen)
      const totalProductCount = (inventoryCount?.count || 0) + (batchesCount?.count || 0);
      
      return {
        ...warehouse,
        productCount: totalProductCount,
        criticalItemCount: criticalCount?.count || 0
      };
    }));
    
    return warehousesWithDetails;
  }
  
  async getWarehouse(id: number): Promise<any | null> {
    const [result] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, id));
    
    if (!result) return null;
    
    // 1. Produkte aus inventory_items zählen
    const [inventoryCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(eq(inventoryItems.warehouseId, id));
    
    // 2. Produkte aus productBatches zählen (mit Gruppierung nach Produkt-ID)
    const [batchesCount] = await db
      .select({ 
        count: sql<number>`COUNT(DISTINCT ${productBatches.productId})` 
      })
      .from(productBatches)
      .where(
        and(
          eq(productBatches.warehouseId, id),
          sql`${productBatches.currentQuantity} > 0`
        )
      );
    
    // Kritische Artikel (niedrigerer Bestand als Mindestbestand)
    const [criticalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, id),
        sql`${inventoryItems.quantity} <= ${inventoryItems.minQuantity}`,
        sql`${inventoryItems.minQuantity} > 0` // Nur wenn ein Mindestbestand gesetzt ist
      ));
    
    // Anzahl der zugeordneten Automaten
    const [machineCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(machineWarehouseAssignments)
      .where(eq(machineWarehouseAssignments.warehouseId, id));
    
    // Gesamtzahl der Produkte berechnen (aus beiden Quellen)
    // Anmerkung: Hier ist eine Überschneidung möglich - idealerweise würden wir eine UNION für
    // die exakte Zählung verwenden, aber für diese Korrektur reicht eine einfache Summe
    const totalProductCount = (inventoryCount?.count || 0) + (batchesCount?.count || 0);
    
    console.log(`Lagerdetails für ID ${id}: Produkte in inventory_items=${inventoryCount?.count || 0}, in Batches=${batchesCount?.count || 0}, Gesamtzahl=${totalProductCount}`);
    
    return {
      ...result,
      productCount: totalProductCount,
      criticalItemCount: criticalCount?.count || 0,
      machineCount: machineCount?.count || 0
    };
  }
  
  async createWarehouse(data: InsertWarehouse): Promise<any> {
    const [result] = await db.insert(warehouses).values(data).returning();
    return result;
  }
  
  async updateWarehouse(id: number, data: Partial<InsertWarehouse>): Promise<any> {
    const [result] = await db
      .update(warehouses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(warehouses.id, id))
      .returning();
    
    return result;
  }
  
  async deleteWarehouse(id: number): Promise<boolean> {
    try {
      await db.delete(warehouses).where(eq(warehouses.id, id));
      return true;
    } catch (error) {
      console.error("Fehler beim Löschen des Lagers:", error);
      return false;
    }
  }
  
  // ---- MACHINE-WAREHOUSE ASSIGNMENTS ----
  
  async assignMachineToWarehouse(data: InsertMachineWarehouseAssignment): Promise<any> {
    // Überprüfen, ob der Automat bereits einem Lager zugeordnet ist
    if (data.isPrimary) {
      // Wenn es sich um die primäre Zuordnung handelt, alle anderen primären Zuordnungen deaktivieren
      await db
        .update(machineWarehouseAssignments)
        .set({ isPrimary: false })
        .where(eq(machineWarehouseAssignments.machineId, data.machineId));
    }
    
    // Neue Zuordnung erstellen
    const [result] = await db
      .insert(machineWarehouseAssignments)
      .values(data)
      .returning();
    
    return result;
  }
  
  async unassignMachineFromWarehouse(machineId: number, warehouseId: number): Promise<boolean> {
    try {
      await db
        .delete(machineWarehouseAssignments)
        .where(and(
          eq(machineWarehouseAssignments.machineId, machineId),
          eq(machineWarehouseAssignments.warehouseId, warehouseId)
        ));
      
      return true;
    } catch (error) {
      console.error("Fehler beim Entfernen der Automatenzuordnung:", error);
      return false;
    }
  }
  
  async getWarehouseAssignments(warehouseId: number): Promise<any[]> {
    // Holt Zuordnungen und erweitert sie mit Maschineninformationen
    const assignments = await db
      .select({
        assignment: machineWarehouseAssignments,
        machine: machines
      })
      .from(machineWarehouseAssignments)
      .leftJoin(machines, eq(machineWarehouseAssignments.machineId, machines.id))
      .where(eq(machineWarehouseAssignments.warehouseId, warehouseId));
    
    return assignments.map(({ assignment, machine }) => ({
      ...assignment,
      machineName: machine?.machineName || 'Unbekannter Automat',
      machineModel: machine?.model || '',
      machineSerialNumber: machine?.serialNumber || '',
      machineStatus: machine?.status || 'unknown'
    }));
  }
  
  async getMachineAssignments(machineId: number): Promise<any[]> {
    // Holt Zuordnungen und erweitert sie mit Lagerinformationen
    const assignments = await db
      .select({
        assignment: machineWarehouseAssignments,
        warehouse: warehouses
      })
      .from(machineWarehouseAssignments)
      .leftJoin(warehouses, eq(machineWarehouseAssignments.warehouseId, warehouses.id))
      .where(eq(machineWarehouseAssignments.machineId, machineId));
    
    return assignments.map(({ assignment, warehouse }) => ({
      ...assignment,
      warehouseName: warehouse?.name || 'Unbekanntes Lager',
      warehouseLocation: warehouse?.city || '',
      warehouseStatus: warehouse?.status || 'unknown'
    }));
  }
  
  // ---- INVENTORY MANAGEMENT ----
  
  async getProductInventory(warehouseId: number, filters?: any): Promise<any[]> {
    // Definiere die Filter für die Basisabfrage
    const baseConditions = [eq(inventoryItems.warehouseId, warehouseId)];
    
    // Erweitere die Bedingungen basierend auf Filtern
    if (filters) {
      if (filters.lowStock) {
        baseConditions.push(sql`${inventoryItems.quantity} <= ${inventoryItems.minQuantity}`);
      }
    }
    
    // Basisabfrage mit allen Bedingungen
    let query = db
      .select({
        inventory: inventoryItems,
        product: products
      })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .where(and(...baseConditions));
    
    // Weitere Filter, die separate Abfragen erfordern
    let results = await query;
    
    // Nach dem Abrufen der Daten weitere Filter anwenden
    if (filters) {
      if (filters.productName) {
        results = results.filter(
          item => item.product && item.product.productName && 
          item.product.productName.toLowerCase().includes(filters.productName.toLowerCase())
        );
      }
      
      if (filters.category) {
        results = results.filter(
          item => item.product && item.product.category === filters.category
        );
      }
    }
    
    // Batch-Informationen für jedes Inventarelement hinzufügen
    const inventoryWithBatches = await Promise.all(results.map(async ({ inventory, product }) => {
      const batches = await db
        .select()
        .from(productBatches)
        .where(and(
          eq(productBatches.warehouseId, inventory.warehouseId),
          eq(productBatches.productId, inventory.productId)
        ))
        .orderBy(desc(productBatches.expiryDate));
      
      return {
        ...inventory,
        productName: product?.productName || 'Unbekanntes Produkt',
        category: product?.category || '',
        price: product?.price || 0,
        sku: product?.sku || '',
        barcode: product?.barcode || '',
        batches: batches
      };
    }));
    
    return inventoryWithBatches;
  }
  
  async getProductInventoryItem(warehouseId: number, productId: number): Promise<any | null> {
    const [inventoryItem] = await db
      .select({
        inventory: inventoryItems,
        product: products
      })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .where(and(
        eq(inventoryItems.warehouseId, warehouseId),
        eq(inventoryItems.productId, productId)
      ));
    
    if (!inventoryItem) return null;
    
    // Batches hinzufügen
    const batches = await db
      .select()
      .from(productBatches)
      .where(and(
        eq(productBatches.warehouseId, warehouseId),
        eq(productBatches.productId, productId)
      ))
      .orderBy(desc(productBatches.expiryDate));
    
    return {
      ...inventoryItem.inventory,
      productName: inventoryItem.product?.productName || 'Unbekanntes Produkt',
      category: inventoryItem.product?.category || '',
      price: inventoryItem.product?.price || 0,
      sku: inventoryItem.product?.sku || '',
      barcode: inventoryItem.product?.barcode || '',
      batches: batches
    };
  }
  
  async createProductInventory(data: InsertProductInventory): Promise<any> {
    const [result] = await db.insert(inventoryItems).values(data).returning();
    return result;
  }
  
  async updateProductInventory(id: number, data: Partial<InsertProductInventory>): Promise<any> {
    const [result] = await db
      .update(inventoryItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    
    return result;
  }
  
  async updateProductStock(warehouseId: number, productId: number, quantityChange: number): Promise<any> {
    // Aktuellen Bestand holen
    const [currentInventory] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, warehouseId),
        eq(inventoryItems.productId, productId)
      ));
    
    if (!currentInventory) {
      // Wenn kein Eintrag existiert, einen neuen erstellen
      const [newInventory] = await db
        .insert(inventoryItems)
        .values({
          warehouseId: warehouseId,
          productId: productId,
          quantity: Math.max(0, quantityChange), // Bestand darf nicht negativ sein
          lastCountDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return newInventory;
    }
    
    // Bestand aktualisieren (niemals unter 0)
    const currentStock = currentInventory.quantity || 0;
    const newStock = Math.max(0, currentStock + quantityChange);
    
    const [updatedInventory] = await db
      .update(inventoryItems)
      .set({
        quantity: newStock,
        updatedAt: new Date()
      })
      .where(and(
        eq(inventoryItems.warehouseId, warehouseId),
        eq(inventoryItems.productId, productId)
      ))
      .returning();
    
    return updatedInventory;
  }
  
  // ---- BATCH MANAGEMENT ----
  
  async getProductBatches(warehouseId: number, productId?: number): Promise<any[]> {
    // Definiere die Filter für die Basisabfrage
    const conditions = [eq(productBatches.warehouseId, warehouseId)];
    
    // Füge Produkt-ID als Filter hinzu, wenn angegeben
    if (productId) {
      conditions.push(eq(productBatches.productId, productId));
    }
    
    // Einzelne Abfrage mit allen Bedingungen
    const query = db
      .select({
        batch: productBatches,
        product: products
      })
      .from(productBatches)
      .leftJoin(products, eq(productBatches.productId, products.id))
      .where(and(...conditions))
      .orderBy(desc(productBatches.expiryDate));
    
    const results = await query;
    
    return results.map(({ batch, product }) => ({
      ...batch,
      productName: product?.productName || 'Unbekanntes Produkt',
      category: product?.category || '',
      sku: product?.sku || ''
    }));
  }
  
  async getProductBatch(batchId: number): Promise<any | null> {
    const [result] = await db
      .select({
        batch: productBatches,
        product: products
      })
      .from(productBatches)
      .leftJoin(products, eq(productBatches.productId, products.id))
      .where(eq(productBatches.id, batchId));
    
    if (!result) return null;
    
    return {
      ...result.batch,
      productName: result.product?.productName || 'Unbekanntes Produkt',
      category: result.product?.category || '',
      sku: result.product?.sku || ''
    };
  }
  
  async createProductBatch(data: InsertProductBatch): Promise<any> {
    // Batch erstellen
    const [result] = await db.insert(productBatches).values(data).returning();
    
    // Lagerbestand aktualisieren
    await this.updateProductStock(data.warehouseId, data.productId, data.initialQuantity);
    
    // Bewegung für neue Charge erstellen
    await this.createInventoryMovement({
      sourceType: "supplier",
      sourceId: null,
      destinationType: "warehouse",
      destinationId: data.warehouseId,
      productId: data.productId,
      batchId: result.id,
      quantity: data.initialQuantity,
      previousStock: null, // Wird automatisch im Movement-Handler gesetzt
      currentStock: null,  // Wird automatisch im Movement-Handler gesetzt
      movementType: "IN",
      referenceType: "BATCH",
      referenceId: `batch-${result.id}`,
      reason: "Neue Charge",
      notes: `Neue Charge ${data.batchNumber} mit Ablaufdatum ${data.expiryDate}`,
      performedBy: data.createdBy
    });
    
    return result;
  }
  
  async updateProductBatch(id: number, data: Partial<InsertProductBatch>): Promise<any> {
    // Charge vor der Aktualisierung abrufen
    const [existingBatch] = await db
      .select()
      .from(productBatches)
      .where(eq(productBatches.id, id));
    
    if (!existingBatch) {
      throw new Error(`Batch mit ID ${id} nicht gefunden`);
    }
    
    // Mengenänderung berechnen (wenn vorhanden)
    if (data.currentQuantity !== undefined && data.currentQuantity !== existingBatch.currentQuantity) {
      const quantityChange = data.currentQuantity - existingBatch.currentQuantity;
      
      // Lagerbestand aktualisieren
      await this.updateProductStock(existingBatch.warehouseId, existingBatch.productId, quantityChange);
      
      // Bewegung für Mengenänderung erstellen
      await this.createInventoryMovement({
        sourceType: quantityChange < 0 ? "warehouse" : "supplier",
        sourceId: quantityChange < 0 ? existingBatch.warehouseId : null,
        destinationType: quantityChange < 0 ? "disposal" : "warehouse",
        destinationId: quantityChange < 0 ? null : existingBatch.warehouseId,
        productId: existingBatch.productId,
        batchId: id,
        quantity: Math.abs(quantityChange),
        previousStock: null, // Wird automatisch im Movement-Handler gesetzt
        currentStock: null,  // Wird automatisch im Movement-Handler gesetzt
        movementType: quantityChange < 0 ? "OUT" : "IN",
        referenceType: "ADJUST",
        referenceId: `batch-adjust-${id}`,
        reason: "Batch-Anpassung",
        notes: `Manuelle Bestandsanpassung der Charge ${existingBatch.batchNumber}`,
        performedBy: data.createdBy
      });
    }
    
    // Batch aktualisieren
    const [result] = await db
      .update(productBatches)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productBatches.id, id))
      .returning();
    
    return result;
  }
  
  async updateBatchStock(batchId: number, quantityChange: number): Promise<any> {
    // Bestehende Charge abrufen
    const [batch] = await db
      .select()
      .from(productBatches)
      .where(eq(productBatches.id, batchId));
    
    if (!batch) {
      throw new Error(`Batch mit ID ${batchId} nicht gefunden`);
    }
    
    // Neuer Bestand berechnen (nicht unter 0)
    const newQuantity = Math.max(0, batch.currentQuantity + quantityChange);
    
    // Charge aktualisieren
    const [updatedBatch] = await db
      .update(productBatches)
      .set({
        currentQuantity: newQuantity,
        updatedAt: new Date()
      })
      .where(eq(productBatches.id, batchId))
      .returning();
    
    // Lagerbestand aktualisieren
    await this.updateProductStock(batch.warehouseId, batch.productId, quantityChange);
    
    return updatedBatch;
  }
  
  // Holt die Chargen, die bereits abgelaufen sind
  async getExpiredBatches(): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Setze auf Beginn des Tages
    
    // Hole alle Chargen, deren Ablaufdatum vor dem heutigen Tag liegt und die noch Bestand haben
    const expiredBatches = await db
      .select({
        batch: productBatches,
        product: products,
        warehouse: warehouses
      })
      .from(productBatches)
      .leftJoin(products, eq(productBatches.productId, products.id))
      .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
      .where(and(
        // Ablaufdatum ist in der Vergangenheit
        sql`${productBatches.expiryDate} <= ${today.toISOString().substring(0, 10)}`,
        // Charge hat noch Bestand
        sql`${productBatches.currentQuantity} > 0`
      ))
      .orderBy(desc(productBatches.expiryDate));
    
    return expiredBatches.map(({ batch, product, warehouse }) => ({
      ...batch,
      productName: product?.productName || 'Unbekanntes Produkt',
      warehouseName: warehouse?.name || 'Unbekanntes Lager',
      category: product?.category || '',
      sku: product?.sku || ''
    }));
  }
  
  // Automatisches Ausbuchen abgelaufener Chargen
  async removeExpiredBatches(): Promise<void> {
    try {
      // Hole abgelaufene Chargen
      const expiredBatches = await this.getExpiredBatches();
      
      if (expiredBatches.length === 0) {
        console.log("Keine abgelaufenen Chargen gefunden.");
        return;
      }
      
      console.log(`${expiredBatches.length} abgelaufene Chargen werden ausgebucht...`);
      
      // Buche jede abgelaufene Charge aus
      for (const batch of expiredBatches) {
        try {
          // Erstelle eine Ausgangs-Bewegung für die abgelaufene Charge
          await this.createInventoryMovement({
            sourceType: "warehouse",
            sourceId: batch.warehouseId,
            destinationType: "disposal",
            destinationId: null,
            productId: batch.productId,
            batchId: batch.id,
            quantity: batch.currentQuantity,
            previousStock: null, // Wird automatisch im Movement-Handler gesetzt
            currentStock: null,  // Wird automatisch im Movement-Handler gesetzt
            movementType: "OUT",
            referenceType: "EXPIRY",
            referenceId: `batch-${batch.id}`,
            reason: "Ablaufdatum erreicht",
            notes: `Automatisch ausgebucht wegen Ablaufdatum (${new Date(batch.expiryDate).toLocaleDateString('de-DE')})`,
            performedBy: null
          });
          
          // Aktualisiere den Batch auf Menge 0
          await db
            .update(productBatches)
            .set({
              currentQuantity: 0,
              updatedAt: new Date()
            })
            .where(eq(productBatches.id, batch.id));
          
          console.log(`Charge #${batch.id} (${batch.productName}, Menge: ${batch.currentQuantity}) erfolgreich ausgebucht.`);
        } catch (error) {
          console.error(`Fehler beim Ausbuchen der Charge #${batch.id}:`, error);
        }
      }
      
      console.log("Ausbuchen abgelaufener Chargen abgeschlossen.");
    } catch (error) {
      console.error("Fehler beim Ausbuchen abgelaufener Chargen:", error);
    }
  }
  
  // ---- INVENTORY MOVEMENTS ----
  
  async createInventoryMovement(data: InsertInventoryMovement): Promise<any> {
    // Vorherigen und neuen Bestand ermitteln und dokumentieren (für Audit-Trail)
    let previousStock: number | null = data.previousStock || null;
    let currentStock: number | null = data.currentStock || null;
    
    // Wenn Lagerbestand betroffen ist und keine Werte angegeben wurden, die aktuellen Werte ermitteln
    if ((data.sourceType === 'warehouse' || data.destinationType === 'warehouse') && 
        (previousStock === null || currentStock === null)) {
      
      let warehouseId: number | null = null;
      
      if (data.sourceType === 'warehouse' && data.sourceId) {
        warehouseId = data.sourceId;
      } else if (data.destinationType === 'warehouse' && data.destinationId) {
        warehouseId = data.destinationId;
      }
      
      if (warehouseId && data.productId) {
        // Aktuellen Bestand ermitteln
        const [inventoryItem] = await db
          .select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.warehouseId, warehouseId),
            eq(inventoryItems.productId, data.productId)
          ));
        
        if (inventoryItem) {
          // Vorherigen Bestand dokumentieren
          previousStock = inventoryItem.quantity || 0;
          
          // Neuen Bestand berechnen und dokumentieren
          const isOutbound = 
            (data.sourceType === 'warehouse' && data.sourceId === warehouseId) || 
            data.movementType === "OUT";
            
          const newStock = isOutbound
            ? Math.max(0, (inventoryItem.quantity || 0) - data.quantity)
            : ((inventoryItem.quantity || 0) + data.quantity);
            
          currentStock = newStock;
        }
      }
    }
    
    // Bewegung erstellen
    const [result] = await db
      .insert(inventoryMovements)
      .values({
        ...data,
        previousStock,
        currentStock
      })
      .returning();
    
    return result;
  }
  
  async getInventoryMovements(filters?: any): Promise<any[]> {
    // Basis-Bedingungen sammeln
    const conditions: any[] = [];
    
    // Filter anwenden
    if (filters) {
      if (filters.warehouseId) {
        conditions.push(
          or(
            and(
              eq(inventoryMovements.sourceType, 'warehouse'),
              eq(inventoryMovements.sourceId, filters.warehouseId)
            ),
            and(
              eq(inventoryMovements.destinationType, 'warehouse'),
              eq(inventoryMovements.destinationId, filters.warehouseId)
            )
          )
        );
      }
      
      if (filters.productId) {
        conditions.push(eq(inventoryMovements.productId, filters.productId));
      }
      
      if (filters.movementType) {
        conditions.push(eq(inventoryMovements.movementType, filters.movementType));
      }
      
      if (filters.startDate) {
        conditions.push(gte(inventoryMovements.performedAt, filters.startDate));
      }
      
      if (filters.endDate) {
        conditions.push(lte(inventoryMovements.performedAt, filters.endDate));
      }
      
      if (filters.referenceType) {
        conditions.push(eq(inventoryMovements.referenceType, filters.referenceType));
      }
      
      if (filters.batchId) {
        conditions.push(eq(inventoryMovements.batchId, filters.batchId));
      }
    }
    
    // Abfrage erstellen
    let query = db.select().from(inventoryMovements);
    
    // Wenn Bedingungen vorhanden sind, diese anwenden
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Sortierung
    query = query.orderBy(desc(inventoryMovements.performedAt));
    
    // Limit und Offset
    if (filters?.limit && typeof filters.limit === 'number') {
      query = query.limit(filters.limit);
    }
    
    if (filters?.offset && typeof filters.offset === 'number') {
      query = query.offset(filters.offset);
    }
    
    const movements = await query;
    
    // Bewegungen mit Produkt- und Batchinformationen erweitern
    const enhancedMovements = await Promise.all(movements.map(async (movement) => {
      // Produktdaten abfragen
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, movement.productId));
      
      // Batch-Daten abfragen (falls vorhanden)
      let batch = null;
      if (movement.batchId) {
        const [batchData] = await db
          .select()
          .from(productBatches)
          .where(eq(productBatches.id, movement.batchId));
        
        batch = batchData;
      }
      
      // Quell- und Zieldetails abfragen
      let sourceDetails = {};
      if (movement.sourceType === 'warehouse' && movement.sourceId) {
        const [warehouse] = await db
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, movement.sourceId));
        
        sourceDetails = {
          sourceName: warehouse?.name || 'Unbekanntes Lager',
          sourceLocation: warehouse?.city || ''
        };
      } else if (movement.sourceType === 'machine' && movement.sourceId) {
        const [machine] = await db
          .select()
          .from(machines)
          .where(eq(machines.id, movement.sourceId));
        
        sourceDetails = {
          sourceName: machine?.machineName || 'Unbekannter Automat',
          sourceLocation: machine?.locationName || ''
        };
      } else {
        sourceDetails = {
          sourceName: movement.sourceType === 'supplier' ? 'Lieferant' : 
                     (movement.sourceType === 'disposal' ? 'Entsorgung' : movement.sourceType)
        };
      }
      
      let destinationDetails = {};
      if (movement.destinationType === 'warehouse' && movement.destinationId) {
        const [warehouse] = await db
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, movement.destinationId));
        
        destinationDetails = {
          destinationName: warehouse?.name || 'Unbekanntes Lager',
          destinationLocation: warehouse?.city || ''
        };
      } else if (movement.destinationType === 'machine' && movement.destinationId) {
        const [machine] = await db
          .select()
          .from(machines)
          .where(eq(machines.id, movement.destinationId));
        
        destinationDetails = {
          destinationName: machine?.machineName || 'Unbekannter Automat',
          destinationLocation: machine?.locationName || ''
        };
      } else {
        destinationDetails = {
          destinationName: movement.destinationType === 'customer' ? 'Kunde' : 
                          (movement.destinationType === 'disposal' ? 'Entsorgung' : movement.destinationType)
        };
      }
      
      return {
        ...movement,
        productName: product?.productName || 'Unbekanntes Produkt',
        productSku: product?.sku || '',
        ...sourceDetails,
        ...destinationDetails,
        batchNumber: batch?.batchNumber || '',
        expiryDate: batch?.expiryDate || null
      };
    }));
    
    return enhancedMovements;
  }
  
  async getInventoryMovement(id: number): Promise<any | null> {
    const [movement] = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, id));
    
    if (!movement) return null;
    
    // Erweiterte Informationen hinzufügen (Produkt, Batch, etc.)
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, movement.productId));
    
    let batch = null;
    if (movement.batchId) {
      const [batchData] = await db
        .select()
        .from(productBatches)
        .where(eq(productBatches.id, movement.batchId));
      
      batch = batchData;
    }
    
    // Quell- und Zielinformationen hinzufügen
    let sourceDetails = {};
    if (movement.sourceType === 'warehouse' && movement.sourceId) {
      const [warehouse] = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, movement.sourceId));
      
      sourceDetails = {
        sourceName: warehouse?.name || 'Unbekanntes Lager',
        sourceLocation: warehouse?.city || ''
      };
    } else if (movement.sourceType === 'machine' && movement.sourceId) {
      const [machine] = await db
        .select()
        .from(machines)
        .where(eq(machines.id, movement.sourceId));
      
      sourceDetails = {
        sourceName: machine?.machineName || 'Unbekannter Automat',
        sourceLocation: machine?.locationName || ''
      };
    }
    
    let destinationDetails = {};
    if (movement.destinationType === 'warehouse' && movement.destinationId) {
      const [warehouse] = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, movement.destinationId));
      
      destinationDetails = {
        destinationName: warehouse?.name || 'Unbekanntes Lager',
        destinationLocation: warehouse?.city || ''
      };
    } else if (movement.destinationType === 'machine' && movement.destinationId) {
      const [machine] = await db
        .select()
        .from(machines)
        .where(eq(machines.id, movement.destinationId));
      
      destinationDetails = {
        destinationName: machine?.machineName || 'Unbekannter Automat',
        destinationLocation: machine?.locationName || ''
      };
    }
    
    return {
      ...movement,
      productName: product?.productName || 'Unbekanntes Produkt',
      productSku: product?.sku || '',
      ...sourceDetails,
      ...destinationDetails,
      batchNumber: batch?.batchNumber || '',
      expiryDate: batch?.expiryDate || null
    };
  }
  
  // ---- INVENTORY COUNTS ----
  
  async createInventoryCount(data: InsertInventoryCount): Promise<any> {
    const [result] = await db.insert(inventoryCounts).values(data).returning();
    return result;
  }
  
  async getInventoryCounts(warehouseId: number): Promise<any[]> {
    const counts = await db
      .select()
      .from(inventoryCounts)
      .where(eq(inventoryCounts.warehouseId, warehouseId))
      .orderBy(desc(inventoryCounts.createdAt));
    
    return counts;
  }
  
  async getInventoryCount(id: number): Promise<any | null> {
    const [count] = await db
      .select()
      .from(inventoryCounts)
      .where(eq(inventoryCounts.id, id));
    
    if (!count) return null;
    
    // Anzahl der gezählten Artikel
    const [itemCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryCountItems)
      .where(eq(inventoryCountItems.countId, id));
    
    // Berechnung der Diskrepanzen
    const [discrepancySum] = await db
      .select({ sum: sql<number>`sum(abs(${inventoryCountItems.discrepancy}))` })
      .from(inventoryCountItems)
      .where(eq(inventoryCountItems.countId, id));
    
    return {
      ...count,
      itemCount: itemCount?.count || 0,
      discrepancySum: discrepancySum?.sum || 0
    };
  }
  
  async updateInventoryCount(id: number, data: Partial<InsertInventoryCount>): Promise<any> {
    const [result] = await db
      .update(inventoryCounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inventoryCounts.id, id))
      .returning();
    
    return result;
  }
  
  // ---- INVENTORY COUNT ITEMS ----
  
  async createInventoryCountItem(data: InsertInventoryCountItem): Promise<any> {
    const [result] = await db.insert(inventoryCountItems).values(data).returning();
    
    // Wenn die Zählung abgeschlossen ist und eine Diskrepanz besteht,
    // automatisch eine Bestandsanpassung vornehmen
    const [countInfo] = await db
      .select()
      .from(inventoryCounts)
      .where(eq(inventoryCounts.id, data.countId));
    
    // Stelle sicher, dass die Diskrepanz definiert ist und nicht 0
    const discrepancy = data.discrepancy || 0;
    
    if (countInfo && countInfo.status === 'completed' && discrepancy !== 0) {
      // Warenbewegung für die Inventuranpassung erstellen
      const [inventoryItem] = await db
        .select()
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.warehouseId, countInfo.warehouseId),
          eq(inventoryItems.productId, data.productId)
        ));
      
      if (inventoryItem) {
        // Sicherstellen, dass quantity definiert ist
        const currentStock = inventoryItem.quantity || 0;
        
        // Bewegungstyp basierend auf Diskrepanzrichtung
        const movementType = discrepancy > 0 ? "IN" : "OUT";
        
        // Bewegung erstellen
        await this.createInventoryMovement({
          sourceType: movementType === "OUT" ? "warehouse" : "supplier",
          sourceId: movementType === "OUT" ? countInfo.warehouseId : null,
          destinationType: movementType === "IN" ? "warehouse" : "disposal",
          destinationId: movementType === "IN" ? countInfo.warehouseId : null,
          productId: data.productId,
          batchId: data.batchId,
          quantity: Math.abs(discrepancy),
          previousStock: currentStock,
          currentStock: currentStock + discrepancy,
          movementType,
          referenceType: "COUNT",
          referenceId: `count-${data.countId}`,
          reason: "Inventuranpassung",
          notes: `Anpassung nach Inventur #${data.countId}`,
          performedBy: data.countedBy
        });
        
        // Lagerbestand aktualisieren
        await this.updateProductStock(
          countInfo.warehouseId,
          data.productId,
          discrepancy
        );
        
        // Batch-Bestand aktualisieren (falls anwendbar)
        if (data.batchId) {
          await this.updateBatchStock(data.batchId, discrepancy);
        }
      }
    }
    
    return result;
  }
  
  async getInventoryCountItems(countId: number): Promise<any[]> {
    const items = await db
      .select({
        item: inventoryCountItems,
        product: products,
        batch: productBatches
      })
      .from(inventoryCountItems)
      .leftJoin(products, eq(inventoryCountItems.productId, products.id))
      .leftJoin(productBatches, eq(inventoryCountItems.batchId, productBatches.id))
      .where(eq(inventoryCountItems.countId, countId));
    
    return items.map(({ item, product, batch }) => ({
      ...item,
      productName: product?.productName || 'Unbekanntes Produkt',
      sku: product?.sku || '',
      category: product?.category || '',
      batchNumber: batch?.batchNumber || null,
      expiryDate: batch?.expiryDate || null
    }));
  }
  
  async updateInventoryCountItem(id: number, data: Partial<InsertInventoryCountItem>): Promise<any> {
    // Vorherigen Eintrag abrufen
    const [previousItem] = await db
      .select({
        item: inventoryCountItems,
        count: inventoryCounts
      })
      .from(inventoryCountItems)
      .leftJoin(inventoryCounts, eq(inventoryCountItems.countId, inventoryCounts.id))
      .where(eq(inventoryCountItems.id, id));
    
    if (!previousItem || !previousItem.count) {
      throw new Error(`Zähleintrag mit ID ${id} nicht gefunden`);
    }
    
    // Wenn die Diskrepanz geändert wurde und die Zählung abgeschlossen ist
    if (data.discrepancy !== undefined && 
        data.discrepancy !== previousItem.item.discrepancy && 
        previousItem.count.status === 'completed') {
      
      // Differenz zwischen alter und neuer Diskrepanz
      const discrepancyDifference = data.discrepancy - (previousItem.item.discrepancy || 0);
      
      if (discrepancyDifference !== 0) {
        // Lagerbestand aktualisieren
        await this.updateProductStock(
          previousItem.count.warehouseId,
          previousItem.item.productId,
          discrepancyDifference
        );
        
        // Batch-Bestand aktualisieren (falls anwendbar)
        if (previousItem.item.batchId) {
          await this.updateBatchStock(previousItem.item.batchId, discrepancyDifference);
        }
        
        // Bewegung für die Anpassung erstellen
        await this.createInventoryMovement({
          sourceType: discrepancyDifference < 0 ? "warehouse" : "supplier",
          sourceId: discrepancyDifference < 0 ? previousItem.count.warehouseId : null,
          destinationType: discrepancyDifference > 0 ? "warehouse" : "disposal",
          destinationId: discrepancyDifference > 0 ? previousItem.count.warehouseId : null,
          productId: previousItem.item.productId,
          batchId: previousItem.item.batchId,
          quantity: Math.abs(discrepancyDifference),
          movementType: discrepancyDifference > 0 ? "IN" : "OUT",
          referenceType: "COUNT",
          referenceId: `count-update-${previousItem.count.id}`,
          reason: "Korrigierte Inventuranpassung",
          notes: `Korrektur der Inventuranpassung #${previousItem.count.id}`,
          performedBy: data.countedBy || previousItem.item.countedBy
        });
      }
    }
    
    // Eintrag aktualisieren
    const [result] = await db
      .update(inventoryCountItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inventoryCountItems.id, id))
      .returning();
    
    return result;
  }
  
  // ---- REFILL TRACKING ----
  
  async createRefillTracking(data: InsertRefillTracking): Promise<any> {
    const [result] = await db.insert(refillTrackings).values(data).returning();
    return result;
  }
  
  async getRefillTrackings(warehouseId: number): Promise<any[]> {
    const refills = await db
      .select({
        refill: refillTrackings,
        machine: machines
      })
      .from(refillTrackings)
      .leftJoin(machines, eq(refillTrackings.machineId, machines.id))
      .where(eq(refillTrackings.warehouseId, warehouseId))
      .orderBy(desc(refillTrackings.refillDate));
    
    // Anzahl der Produkte pro Refill abfragen
    const refillsWithCounts = await Promise.all(refills.map(async ({ refill, machine }) => {
      const [itemCount] = await db
        .select({ count: sql<number>`count(*)`, totalQuantity: sql<number>`sum(${refillTrackingItems.quantity})` })
        .from(refillTrackingItems)
        .where(eq(refillTrackingItems.refillId, refill.id));
      
      return {
        ...refill,
        machineName: machine?.machineName || 'Unbekannter Automat',
        machineModel: machine?.model || '',
        machineLocation: machine?.locationName || '',
        itemCount: itemCount?.count || 0,
        totalQuantity: itemCount?.totalQuantity || 0
      };
    }));
    
    return refillsWithCounts;
  }
  
  async getRefillTracking(id: number): Promise<any | null> {
    const [refill] = await db
      .select({
        refill: refillTrackings,
        machine: machines
      })
      .from(refillTrackings)
      .leftJoin(machines, eq(refillTrackings.machineId, machines.id))
      .where(eq(refillTrackings.id, id));
    
    if (!refill) return null;
    
    // Items abfragen
    const items = await this.getRefillTrackingItems(id);
    
    return {
      ...refill.refill,
      machineName: refill.machine?.machineName || 'Unbekannter Automat',
      machineModel: refill.machine?.model || '',
      machineLocation: refill.machine?.locationName || '',
      items
    };
  }
  
  async createRefillTrackingItem(data: InsertRefillTrackingItem): Promise<any> {
    // Refill-Informationen abrufen
    const [refill] = await db
      .select()
      .from(refillTrackings)
      .where(eq(refillTrackings.id, data.refillId));
    
    if (!refill) {
      throw new Error(`Refill mit ID ${data.refillId} nicht gefunden`);
    }
    
    // Lagerbestand vor der Entnahme abrufen
    const [inventory] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, refill.warehouseId),
        eq(inventoryItems.productId, data.productId)
      ));
    
    const stockBefore = inventory?.quantity || 0;
    
    // Lagerbestand reduzieren
    await this.updateProductStock(refill.warehouseId, data.productId, -data.quantity);
    
    // Batch-Bestand reduzieren (falls anwendbar)
    if (data.batchId) {
      await this.updateBatchStock(data.batchId, -data.quantity);
    }
    
    // Aktuellen Bestand nach der Änderung abrufen
    const [updatedInventory] = await db
      .select()
      .from(productInventory)
      .where(and(
        eq(productInventory.warehouseId, refill.warehouseId),
        eq(productInventory.productId, data.productId)
      ));
    
    const stockAfter = updatedInventory?.quantity || 0;
    
    // Refill-Item mit Bestandsinformationen speichern
    const [result] = await db
      .insert(refillTrackingItems)
      .values({
        ...data,
        stockBefore,
        stockAfter
      })
      .returning();
    
    // Bewegung erstellen
    await this.createInventoryMovement({
      sourceType: "warehouse",
      sourceId: refill.warehouseId,
      destinationType: "machine",
      destinationId: refill.machineId,
      productId: data.productId,
      batchId: data.batchId,
      quantity: data.quantity,
      previousStock: stockBefore,
      currentStock: stockAfter,
      movementType: "OUT",
      referenceType: "REFILL",
      referenceId: `refill-${data.refillId}`,
      reason: "Automaten-Auffüllung",
      notes: `Auffüllung des Automaten mit ${data.quantity} Einheiten`,
      performedBy: refill.performedBy
    });
    
    return result;
  }
  
  async getRefillTrackingItems(refillId: number): Promise<any[]> {
    const items = await db
      .select({
        item: refillTrackingItems,
        product: products,
        batch: productBatches
      })
      .from(refillTrackingItems)
      .leftJoin(products, eq(refillTrackingItems.productId, products.id))
      .leftJoin(productBatches, eq(refillTrackingItems.batchId, productBatches.id))
      .where(eq(refillTrackingItems.refillId, refillId));
    
    return items.map(({ item, product, batch }) => ({
      ...item,
      productName: product?.productName || 'Unbekanntes Produkt',
      sku: product?.sku || '',
      category: product?.category || '',
      price: product?.price || 0,
      batchNumber: batch?.batchNumber || null,
      expiryDate: batch?.expiryDate || null
    }));
  }
}

// Singleton-Instance erstellen und exportieren
export const warehouseStorage = new DrizzleWarehouseStorage();