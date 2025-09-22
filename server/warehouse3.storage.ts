import { db } from "./db";
import { sql } from "drizzle-orm";
import { eq, and, or, desc, asc, inArray, gte, lte, gt, like } from "drizzle-orm";
import { products, machines, purchaseConditions, users } from "../shared/schema";

// Import warehouse3 schema definitions for type information
import {
  InsertWarehouse,
  InsertMachineWarehouseAssignment,
  InsertProductInventory,
  InsertStockBatch,
  InsertStockMovement,
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
// Dieser Alias wurde entfernt, da wir direkt auf inventoryItems zugreifen

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
  
  // Quelle und Ziel (tatsächliche Datenbankstruktur)
  sourceWarehouseId: integer("source_warehouse_id"),
  destinationWarehouseId: integer("destination_warehouse_id"),
  
  // Produkt und Mengeninformationen
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  movementType: text("movement_type").notNull(),
  direction: text("direction"),
  
  // Referenzen
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  
  // Metadaten
  status: text("status").default("completed"),
  notes: text("notes"),
  
  // Wer hat die Bewegung durchgeführt
  performedBy: integer("performed_by"),
  performedAt: timestamp("performed_at").defaultNow(),
  
  // Machine und Batch-Informationen
  machineId: integer("machine_id"),
  batchId: integer("batch_id"),
  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date"),
  
  // Standort-Informationen
  locationFrom: text("location_from"),
  locationTo: text("location_to"),
  
  // Bestandsinformationen für Audit-Trail
  previousStock: integer("previous_stock"),
  currentStock: integer("current_stock"),
  
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

// Definition für die machineProducts-Tabelle
const machineProducts = pgTable("machine_products", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(),
  productId: integer("product_id").notNull(),
  slotNumber: integer("slot_number"),
  maxCapacity: integer("max_capacity"),
  currentStock: integer("current_stock").default(0),
  status: text("status").default("active"),
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
  
  // Enhanced Search Methods
  
  // Inventory Management
  getProductInventory(warehouseId: number, filters?: any): Promise<any[]>;
  searchProducts(filters?: any): Promise<{items: any[], total: number}>;
  getProductCategories(warehouseId?: number): Promise<string[]>;
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
  
  // FIFO Batch Selection
  selectFIFOBatches(warehouseId: number, productId: number, requestedQuantity: number): Promise<{batches: any[], totalAvailable: number}>;
  
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
      // Eindeutige Produktzählung über UNION ALL und DISTINCT für alle Lager
      const [uniqueProductCount] = await db
        .select({
          count: sql<number>`COUNT(DISTINCT product_id)`
        })
        .from(
          sql`(
            SELECT product_id FROM inventory_items WHERE warehouse_id = ${warehouse.id}
            UNION
            SELECT product_id FROM product_batches WHERE warehouse_id = ${warehouse.id}
          ) AS combined_products`
        );
      
      // Kritische Artikel (niedrigerer Bestand als Mindestbestand)
      const [criticalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.warehouseId, warehouse.id),
          sql`${inventoryItems.quantity} <= ${inventoryItems.minQuantity}`,
          sql`${inventoryItems.minQuantity} > 0` // Nur wenn ein Mindestbestand gesetzt ist
        ));
      
      // Verwende die genaue Zählung unique Produkte
      const totalProductCount = uniqueProductCount?.count || 0;
      
      return {
        ...warehouse,
        productCount: totalProductCount,
        criticalItemCount: criticalCount?.count || 0
      };
    }));
    
    return warehousesWithDetails;
  }
  
  async getWarehouse(id: number): Promise<any | null> {
    try {
      const [result] = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, id));
      
      if (!result) return null;
      
      // Direktabfrage für Produkte im Lager mit SQL-Abfrage für bessere Kompatibilität
      const [inventoryCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(sql`inventory_items`)
        .where(sql`warehouse_id = ${id}`);
      
      // Zählt alle Produkte aus Batches
      const [batchesCount] = await db
        .select({ 
          count: sql<number>`COUNT(DISTINCT product_id)` 
        })
        .from(sql`product_batches`)
        .where(sql`warehouse_id = ${id}`);
      
      // Eindeutige Produktzählung mit SQL-Direktabfrage
      const [uniqueProductCount] = await db
        .select({
          count: sql<number>`COUNT(DISTINCT product_id)`
        })
        .from(
          sql`(
            SELECT product_id FROM inventory_items WHERE warehouse_id = ${id}
            UNION
            SELECT product_id FROM product_batches WHERE warehouse_id = ${id}
          ) AS combined_products`
        );
      
      // Kritische Artikel (Bestand <= Mindestbestand)
      const [criticalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(sql`inventory_items`)
        .where(sql`
          warehouse_id = ${id} AND
          quantity <= min_quantity AND
          min_quantity > 0
        `);
      
      // Anzahl der zugeordneten Automaten
      const [machineCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(machineWarehouseAssignments)
        .where(eq(machineWarehouseAssignments.warehouseId, id));
      
      // Verwende die eindeutige Produktzählung
      const productCountValue = uniqueProductCount?.count || 0;
      
      console.log(`Lagerdetails für ID ${id}: Produkte in inventory_items=${inventoryCount?.count || 0}, in Batches=${batchesCount?.count || 0}, Eindeutige Produkte=${productCountValue}`);
      
      return {
        ...result,
        productCount: productCountValue,
        criticalItemCount: criticalCount?.count || 0,
        machineCount: machineCount?.count || 0
      };
    } catch (error) {
      console.error(`Fehler beim Abrufen der Lagerinformationen für ID ${id}:`, error);
      // Rückgabe mit Standardwerten im Fehlerfall
      return { 
        id: id,
        name: "Fehler beim Laden",
        status: "error",
        productCount: 0, 
        criticalItemCount: 0, 
        machineCount: 0, 
        error: true 
      };
    }
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
    
    try {
      // Automatisch Produkte aus dem Automaten ins Lager synchronisieren
      console.log(`Führe automatischen Produkt-Import für Automat ${data.machineId} in Lager ${data.warehouseId} durch...`);
      const syncResult = await this.syncMachineProductsToWarehouse(data.machineId, data.warehouseId);
      console.log(`Automatischer Produkt-Import abgeschlossen: ${syncResult.added} Produkte hinzugefügt, ${syncResult.existing} bereits vorhanden.`);
      
      // Ergebnis um Synchronisierungsinformationen erweitern
      return {
        ...result,
        syncResult: {
          productsAdded: syncResult.added,
          productsExisting: syncResult.existing
        }
      };
    } catch (error) {
      console.error(`Fehler beim automatischen Produkt-Import von Automat ${data.machineId} zu Lager ${data.warehouseId}:`, error);
      // Die Zuordnung wurde trotzdem erstellt, also geben wir das Ergebnis zurück
      return {
        ...result,
        syncResult: {
          productsAdded: 0,
          productsExisting: 0,
          error: error.message || 'Unbekannter Fehler bei der Produktsynchronisierung'
        }
      };
    }
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
      
      // Produktname-Filter (unterstützt Teilstring-Suche)
      if (filters.productName) {
        baseConditions.push(like(products.productName, `%${filters.productName}%`));
      }
      
      // SKU-Filter (unterstützt Teilstring-Suche)
      if (filters.sku) {
        baseConditions.push(like(products.sku, `%${filters.sku}%`));
      }
      
      // Kategorie-Filter (exakte Übereinstimmung)
      if (filters.category) {
        baseConditions.push(eq(products.category, filters.category));
      }
      
      // Bestandsfilter (mindestens/höchstens)
      if (filters.minQuantity !== undefined) {
        baseConditions.push(gte(inventoryItems.quantity, filters.minQuantity));
      }
      if (filters.maxQuantity !== undefined) {
        baseConditions.push(lte(inventoryItems.quantity, filters.maxQuantity));
      }
      
      // Status-Filter
      if (filters.status) {
        baseConditions.push(eq(inventoryItems.status, filters.status));
      }
    }
    
    // Basisabfrage mit allen Bedingungen erstellen
    let query = db
      .select({
        inventory: inventoryItems,
        product: products
      })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .where(and(...baseConditions));
    
    // Sortierung hinzufügen
    if (filters && filters.sortBy) {
      switch (filters.sortBy) {
        case 'productName':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.productName))
            : query.orderBy(products.productName);
          break;
        case 'category':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.category))
            : query.orderBy(products.category);
          break;
        case 'quantity':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(inventoryItems.quantity))
            : query.orderBy(inventoryItems.quantity);
          break;
        case 'sku':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.sku))
            : query.orderBy(products.sku);
          break;
        default:
          query = query.orderBy(products.productName); // Standard-Sortierung
      }
    } else {
      query = query.orderBy(products.productName); // Standard-Sortierung
    }
    
    // Paginierung hinzufügen
    if (filters) {
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.offset(filters.offset);
      }
    }
    
    // Abfrage ausführen
    const results = await query;
    
    // Batch-Informationen für jedes Inventarelement hinzufügen
    const inventoryWithBatches = await Promise.all(results.map(async ({ inventory, product }) => {
      const batches = await db
        .select()
        .from(productBatches)
        .where(and(
          eq(productBatches.warehouseId, inventory.warehouseId),
          eq(productBatches.productId, inventory.productId)
        ))
        .orderBy(asc(productBatches.expiryDate)); // FIFO: Älteste Batches zuerst
      
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
  
  /**
   * Erweiterte Produktsuche über alle oder spezifische Lager
   */
  async searchProducts(filters?: {
    searchTerm?: string;
    category?: string;
    warehouseId?: number;
    minQuantity?: number;
    maxQuantity?: number;
    inStock?: boolean;
    sortBy?: 'productName' | 'category' | 'sku' | 'quantity';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<{items: any[], total: number}> {
    const conditions: any[] = [];
    
    // Grundlegende Bedingungen
    if (filters?.warehouseId) {
      conditions.push(eq(inventoryItems.warehouseId, filters.warehouseId));
    }
    
    // Suchterm (Produktname oder SKU)
    if (filters?.searchTerm) {
      conditions.push(
        or(
          like(products.productName, `%${filters.searchTerm}%`),
          like(products.sku, `%${filters.searchTerm}%`)
        )
      );
    }
    
    // Kategorie-Filter
    if (filters?.category) {
      conditions.push(eq(products.category, filters.category));
    }
    
    // Bestandsfilter
    if (filters?.minQuantity !== undefined) {
      conditions.push(gte(inventoryItems.quantity, filters.minQuantity));
    }
    if (filters?.maxQuantity !== undefined) {
      conditions.push(lte(inventoryItems.quantity, filters.maxQuantity));
    }
    if (filters?.inStock === true) {
      conditions.push(sql`${inventoryItems.quantity} > 0`);
    } else if (filters?.inStock === false) {
      conditions.push(eq(inventoryItems.quantity, 0));
    }
    
    // Zählung für Paginierung
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const [{ count: total }] = await countQuery;
    
    // Hauptabfrage
    let query = db
      .select({
        inventory: inventoryItems,
        product: products,
        warehouse: {
          id: sql`w.id`,
          name: sql`w.name`
        }
      })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .leftJoin(sql`warehouses w`, sql`${inventoryItems.warehouseId} = w.id`)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Sortierung
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'productName':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.productName))
            : query.orderBy(products.productName);
          break;
        case 'category':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.category))
            : query.orderBy(products.category);
          break;
        case 'quantity':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(inventoryItems.quantity))
            : query.orderBy(inventoryItems.quantity);
          break;
        case 'sku':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.sku))
            : query.orderBy(products.sku);
          break;
        default:
          query = query.orderBy(products.productName);
      }
    } else {
      query = query.orderBy(products.productName);
    }
    
    // Paginierung
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }
    
    const items = await query;
    
    return { items, total };
  }
  
  /**
   * Alle verfügbaren Produktkategorien abrufen
   */
  async getProductCategories(warehouseId?: number): Promise<string[]> {
    let query = db
      .select({ category: products.category })
      .from(products)
      .where(sql`${products.category} IS NOT NULL AND ${products.category} != ''`);
    
    // Nur Kategorien von Produkten in einem bestimmten Lager
    if (warehouseId) {
      query = query
        .innerJoin(inventoryItems, eq(products.id, inventoryItems.productId))
        .where(and(
          eq(inventoryItems.warehouseId, warehouseId),
          sql`${products.category} IS NOT NULL AND ${products.category} != ''`
        ));
    }
    
    const result = await query
      .groupBy(products.category)
      .orderBy(products.category);
    
    return result.map(r => r.category).filter(Boolean);
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
  
  async createProductInventory(data: any): Promise<any> {
    // Anpassung der Felder für das Drizzle-Schema (sie werden automatisch auf DB-Felder gemappt)
    const mappedData: any = {
      warehouseId: data.warehouseId,
      productId: data.productId,
      quantity: data.quantity || 0,
      minQuantity: data.minQuantity || 0,
      status: "active",
      notes: data.notes || "",
      lastCountDate: data.lastCountDate || new Date()
    };
    
    const [result] = await db.insert(inventoryItems).values(mappedData).returning();
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
      if (quantityChange < 0) {
        throw new Error(`BESTANDSFEHLER: Produkt ${productId} nicht im Lager ${warehouseId} gefunden. Abgang von ${Math.abs(quantityChange)} nicht möglich.`);
      }
      
      const [newInventory] = await db
        .insert(inventoryItems)
        .values({
          warehouseId: warehouseId,
          productId: productId,
          quantity: quantityChange, // Positiver Zugang erlaubt
          minQuantity: 0,
          lastCountDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return newInventory;
    }
    
    // KRITISCHE BESTANDSPRÜFUNG bei Abgängen
    const currentStock = currentInventory.quantity || 0;
    if (quantityChange < 0 && currentStock + quantityChange < 0) {
      throw new Error(`UNTERBESTAND: Produkt ${productId} in Lager ${warehouseId}. Verfügbar: ${currentStock}, Abgang: ${Math.abs(quantityChange)}. Fehlende Menge: ${Math.abs(currentStock + quantityChange)}`);
    }
    
    const newStock = currentStock + quantityChange;
    
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
    
    // KRITISCHE BESTANDSPRÜFUNG bei Batch-Abgängen
    const currentQuantity = batch.currentQuantity || 0;
    if (quantityChange < 0 && currentQuantity + quantityChange < 0) {
      throw new Error(`BATCH-UNTERBESTAND: Batch ${batch.batchNumber || batchId} hat nur ${currentQuantity} Stück, Abgang: ${Math.abs(quantityChange)}. Fehlende Menge: ${Math.abs(currentQuantity + quantityChange)}`);
    }
    
    const newQuantity = currentQuantity + quantityChange;
    
    // Charge aktualisieren
    const [updatedBatch] = await db
      .update(productBatches)
      .set({
        currentQuantity: newQuantity,
        updatedAt: new Date()
      })
      .where(eq(productBatches.id, batchId))
      .returning();
    
    // FIXED: Batch-Updates sollen nicht automatisch Normal-Bestand ändern
    // await this.updateProductStock(batch.warehouseId, batch.productId, quantityChange);
    
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

  /**
   * FIFO-Batch-Auswahl: Wählt automatisch die ältesten verfügbaren Batches
   * für eine gegebene Menge aus (First In, First Out)
   */
  async selectFIFOBatches(warehouseId: number, productId: number, requestedQuantity: number): Promise<{batches: any[], totalAvailable: number}> {
    // Alle verfügbaren Batches des Produkts abrufen, sortiert nach Ablaufdatum (FIFO)
    const availableBatches = await db
      .select()
      .from(productBatches)
      .where(and(
        eq(productBatches.warehouseId, warehouseId),
        eq(productBatches.productId, productId),
        gt(productBatches.currentQuantity, 0) // Nur Batches mit Bestand
      ))
      .orderBy(asc(productBatches.expiryDate)); // FIFO: Älteste zuerst

    let remainingQuantity = requestedQuantity;
    let totalAvailable = 0;
    const selectedBatches = [];

    // Gesamtverfügbare Menge berechnen
    for (const batch of availableBatches) {
      totalAvailable += batch.currentQuantity;
    }

    // Batches auswählen bis die gewünschte Menge erreicht ist
    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;

      const quantityFromThisBatch = Math.min(remainingQuantity, batch.currentQuantity);
      
      selectedBatches.push({
        ...batch,
        allocatedQuantity: quantityFromThisBatch
      });

      remainingQuantity -= quantityFromThisBatch;
    }

    return {
      batches: selectedBatches,
      totalAvailable
    };
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
            
          // BESTANDSPRÜFUNG bei Bewegungen
          const currentItemStock = inventoryItem.quantity || 0;
          if (isOutbound && currentItemStock - data.quantity < 0) {
            throw new Error(`BEWEGUNGS-UNTERBESTAND: Lager ${warehouseId}, Produkt ${data.productId}. Verfügbar: ${currentItemStock}, Bewegung: ${data.quantity}`);
          }
          
          const newStock = isOutbound
            ? currentItemStock - data.quantity
            : currentItemStock + data.quantity;
            
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
    console.log(`[DEBUG] getInventoryMovements called with filters:`, filters);
    
    let allMovements: any[] = [];
    
    // ERWEITERTE LÖSUNG: Kombiniere inventory_movements UND refill_details für ALLE Lager
    console.log(`[DEBUG] Fetching movements for warehouse ${filters?.warehouseId || 'ALL'}`);

    // 1. Hole normale Inventory-Bewegungen
    const conditions: any[] = [];
    
    // Filter anwenden
    if (filters) {
      if (filters.warehouseId) {
        conditions.push(
          or(
            eq(inventoryMovements.sourceWarehouseId, filters.warehouseId),
            eq(inventoryMovements.destinationWarehouseId, filters.warehouseId)
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
    
    // Abfrage für inventory_movements
    let query = db.select().from(inventoryMovements);
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    query = query.orderBy(desc(inventoryMovements.performedAt));
    
    const normalMovements = await query;
    console.log(`[DEBUG] Found ${normalMovements.length} normal inventory movements`);

    // 2. NEUE LOGIC: Hole Refill-Details mit Produktinformationen
    let refillMovements: any[] = [];
    
    if (filters?.warehouseId) {
      // Erweiterte Refill-Abfrage mit Produktdetails
      const refillDetailsQuery = `
        SELECT 
          r.id as refill_id,
          r.machine_id,
          r.machine_name,
          r.datetime as performed_at,
          r.operator,
          r.refill_type,
          r.notes as refill_notes,
          r.refill_number,
          rd.product_id,
          rd.quantity,
          rd.product_name as refill_product_name,
          p.product_name,
          p.sku,
          p.category,
          p.price
        FROM refills r
        JOIN machine_warehouse_assignments mwa ON r.machine_id = mwa.machine_id
        LEFT JOIN refill_details rd ON r.id = rd.refill_id
        LEFT JOIN products p ON rd.product_id::int = p.id
        WHERE mwa.warehouse_id = $1
        ${filters.productId ? 'AND rd.product_id::int = $3' : ''}
        ${filters.startDate ? 'AND r.datetime >= $4' : ''}
        ${filters.endDate ? 'AND r.datetime <= $5' : ''}
        ORDER BY r.datetime DESC
        LIMIT $2
      `;
      
      const limit = filters.limit || 50;
      const queryParams = [filters.warehouseId, limit];
      
      if (filters.productId) queryParams.push(filters.productId);
      if (filters.startDate) queryParams.push(filters.startDate.toISOString());
      if (filters.endDate) queryParams.push(filters.endDate.toISOString());
      
      console.log(`[DEBUG] Executing enhanced refill details query for warehouse ${filters.warehouseId}`);
      console.log(`[DEBUG] Query params:`, queryParams);
      
      const refillResults = await db.execute(sql.raw(refillDetailsQuery, queryParams));
      console.log(`[DEBUG] Found ${refillResults.rows.length} refill detail entries`);
      
      // Konvertiere zu Movement-Format
      refillMovements = refillResults.rows
        .filter((refill: any) => refill.product_id) // Nur Entries mit Produktdaten
        .map((refill: any) => ({
          id: `refill_${refill.refill_id}_${refill.product_id}`,
          productId: parseInt(refill.product_id),
          quantity: parseInt(refill.quantity) || 0,
          movementType: 'REFILL',
          sourceWarehouseId: filters.warehouseId,
          destinationWarehouseId: null,
          direction: 'OUT',
          status: 'completed',
          performedAt: new Date(refill.performed_at),
          createdAt: new Date(refill.performed_at),
          machineId: refill.machine_id,
          referenceType: 'REFILL',
          referenceId: refill.refill_number,
          notes: `Refill: ${refill.quantity}x ${refill.product_name || refill.refill_product_name} → ${refill.machine_name}`,
          productName: refill.product_name || refill.refill_product_name || 'Unbekanntes Produkt',
          productSku: refill.sku || '',
          sourceName: 'Lager',
          destinationName: refill.machine_name,
          machineName: refill.machine_name,
          performedByName: refill.operator || 'Unbekannt',
          // Zusätzliche Refill-Details
          refillType: refill.refill_type,
          isRefillMovement: true
        }));
      
      console.log(`[DEBUG] Converted ${refillMovements.length} refill movements with product details`);
    }

    // 3. Kombiniere normale Movements und Refill-Movements
    allMovements = [...normalMovements, ...refillMovements];
    console.log(`[DEBUG] Total movements: ${allMovements.length} (${normalMovements.length} normal + ${refillMovements.length} refills)`);

    // Sortiere alle Bewegungen nach Datum
    allMovements.sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());

    // Wende Limit an, falls gesetzt
    if (filters?.limit) {
      allMovements = allMovements.slice(0, filters.limit);
    }
    
    // Nur normale Bewegungen erweitern (Refill-Bewegungen sind bereits vollständig verarbeitet)
    const enhancedMovements = await Promise.all(allMovements.map(async (movement) => {
      // Refill-Bewegungen sind bereits vollständig und brauchen keine weitere Verarbeitung
      if (movement.isRefillMovement) {
        return movement;
      }

      // Nur normale Inventory-Bewegungen erweitern
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
      
      // User-Daten abfragen (falls vorhanden)
      let performedByName = null;
      if (movement.performedBy) {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, movement.performedBy));
        
        performedByName = user?.username || user?.email || 'Unbekannter Benutzer';
      }
      
      // Quell- und Zieldetails abfragen
      let sourceDetails = {};
      let destinationDetails = {};
      
      if (movement.sourceWarehouseId) {
        const [warehouse] = await db
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, movement.sourceWarehouseId));
        
        sourceDetails = {
          sourceName: warehouse?.name || 'Unbekanntes Lager',
          sourceLocation: warehouse?.city || ''
        };
      } else {
        sourceDetails = {
          sourceName: 'Externer Lieferant'
        };
      }
      
      if (movement.destinationWarehouseId) {
        const [warehouse] = await db
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, movement.destinationWarehouseId));
        
        destinationDetails = {
          destinationName: warehouse?.name || 'Unbekanntes Lager',
          destinationLocation: warehouse?.city || ''
        };
      } else {
        destinationDetails = {
          destinationName: 'Externer Empfänger'
        };
      }
      
      return {
        ...movement,
        productName: product?.productName || 'Unbekanntes Produkt',
        productSku: product?.sku || '',
        ...sourceDetails,
        ...destinationDetails,
        batchNumber: batch?.batchNumber || '',
        expiryDate: batch?.expiryDate || null,
        performedByName: performedByName
      };
    }));
    
    console.log(`[DEBUG] Final enhanced movements count: ${enhancedMovements.length}`);
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
    
    // User-Daten abfragen (falls vorhanden)
    let performedByName = null;
    if (movement.performedBy) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, movement.performedBy));
      
      performedByName = user?.username || user?.email || 'Unbekannter Benutzer';
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
      expiryDate: batch?.expiryDate || null,
      performedByName: performedByName
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
      .where(eq(inventoryCountItems.inventoryCountId, id));
    
    // Berechnung der Diskrepanzen
    const [discrepancySum] = await db
      .select({ sum: sql<number>`sum(abs(${inventoryCountItems.discrepancy}))` })
      .from(inventoryCountItems)
      .where(eq(inventoryCountItems.inventoryCountId, id));
    
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
        batch: productBatches,
        purchaseCondition: purchaseConditions
      })
      .from(inventoryCountItems)
      .leftJoin(products, eq(inventoryCountItems.productId, products.id))
      .leftJoin(productBatches, eq(inventoryCountItems.batchId, productBatches.id))
      .leftJoin(purchaseConditions, eq(purchaseConditions.productId, inventoryCountItems.productId))
      .where(eq(inventoryCountItems.inventoryCountId, countId));
    
    return items.map(({ item, product, batch, purchaseCondition }) => ({
      ...item,
      product: product ? {
        id: product.id,
        productName: product.product_name || 'Unbekanntes Produkt',
        sku: product.sku || '',
        category: product.category || '',
        price: product.price || 0,
        packageSize: product.package_size || null,
        packageQuantity: product.package_quantity || null,
        unit: product.units || 'Stk.',
        // Einkaufsbedingungen hinzufügen
        packagingQuantity: purchaseCondition?.packagingQuantity || null,
        packagingUnit: purchaseCondition?.packagingUnit || null
      } : null,
      batch: batch ? {
        id: batch.id,
        batchNumber: batch.batchNumber || null,
        expiryDate: batch.expiryDate || null
      } : null
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
      .leftJoin(inventoryCounts, eq(inventoryCountItems.inventoryCountId, inventoryCounts.id))
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
    
    // Konstante für Hauptlager (Bahnhof)
    const MAIN_WAREHOUSE_ID = 3;
    
    // Lagerbestand vor der Entnahme abrufen
    const [inventory] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, refill.warehouseId),
        eq(inventoryItems.productId, data.productId)
      ));
    
    const stockBefore = inventory?.quantity || 0;
    let totalMovements = [];
    
    // ENHANCED: Verfügbare Batch-Bestände prüfen
    const fifoResult = await this.selectFIFOBatches(refill.warehouseId, data.productId, data.quantity);
    const totalAvailableInBatches = fifoResult.totalAvailable;
    const totalAvailableStock = stockBefore + totalAvailableInBatches;
    
    console.log(`Bestandsprüfung für Produkt ${data.productId} in Lager ${refill.warehouseId}:`);
    console.log(`- Normal-Bestand: ${stockBefore}`);
    console.log(`- Batch-Bestand: ${totalAvailableInBatches}`);
    console.log(`- Gesamt verfügbar: ${totalAvailableStock}`);
    console.log(`- Benötigt: ${data.quantity}`);
    
    // Überprüfen, ob genügend Bestand im zugeordneten Lager vorhanden ist (inkl. Batches)
    if (totalAvailableStock < data.quantity) {
      const shortage = data.quantity - stockBefore;
      
      console.log(`Nicht genügend Bestand im Lager ${refill.warehouseId}. Benötigt: ${data.quantity}, Verfügbar: ${stockBefore}, Fehlmenge: ${shortage}`);
      
      // Versuche, die fehlende Menge aus dem Hauptlager zu entnehmen
      if (refill.warehouseId !== MAIN_WAREHOUSE_ID) {
        const [mainInventory] = await db
          .select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.warehouseId, MAIN_WAREHOUSE_ID),
            eq(inventoryItems.productId, data.productId)
          ));
        
        const mainStock = mainInventory?.quantity || 0;
        
        if (mainStock >= shortage) {
          console.log(`Entnehme ${shortage} Einheiten aus Hauptlager (Bahnhof)`);
          
          // Bestand aus Hauptlager reduzieren
          await this.updateProductStock(MAIN_WAREHOUSE_ID, data.productId, -shortage);
          
          // Bewegung vom Hauptlager zum Automaten erstellen
          await this.createInventoryMovement({
            sourceType: "warehouse",
            sourceId: MAIN_WAREHOUSE_ID,
            destinationType: "machine",
            destinationId: refill.machineId,
            productId: data.productId,
            batchId: data.batchId,
            quantity: shortage,
            movementType: "OUT",
            referenceType: "REFILL",
            referenceId: `refill-${data.refillId}-main`,
            reason: "Automaten-Auffüllung (Hauptlager-Fallback)",
            notes: `Fallback-Entnahme aus Hauptlager: ${shortage} Einheiten`,
            performedBy: refill.performedBy
          });
          
          totalMovements.push({
            source: "Hauptlager (Bahnhof)",
            quantity: -shortage // NEGATIVE für OUT-Bewegung
          });
        } else {
          console.warn(`Auch im Hauptlager nicht genügend Bestand. Verfügbar: ${mainStock}, Benötigt: ${shortage}`);
        }
      }
      
      // Verfügbaren Bestand aus zugeordnetem Lager entnehmen (wenn vorhanden)
      if (stockBefore > 0) {
        await this.updateProductStock(refill.warehouseId, data.productId, -stockBefore);
        
        totalMovements.push({
          source: `Zugeordnetes Lager (${refill.warehouseId})`,
          quantity: -stockBefore // NEGATIVE für OUT-Bewegung
        });
      }
    } else {
      // Vollständige Entnahme möglich - verwende FIFO-Batches zuerst
      let remainingQuantity = data.quantity;
      
      // 1. Zuerst aus verfügbaren Batches entnehmen (FIFO)
      if (fifoResult.batches.length > 0) {
        console.log(`Verwende FIFO-Batches für ${remainingQuantity} Einheiten`);
        
        for (const batch of fifoResult.batches) {
          const quantityFromBatch = Math.min(remainingQuantity, batch.allocatedQuantity);
          
          await this.updateBatchStock(batch.id, -quantityFromBatch);
          
          console.log(`FIFO: Entnahme von ${quantityFromBatch} aus Batch ${batch.batchNumber} (MHD: ${batch.expiryDate})`);
          
          totalMovements.push({
            source: `Batch ${batch.batchNumber} (${refill.warehouseId})`,
            quantity: -quantityFromBatch, // NEGATIVE für OUT-Bewegung
            batchId: batch.id,
            expiryDate: batch.expiryDate
          });
          
          remainingQuantity -= quantityFromBatch;
          
          if (remainingQuantity <= 0) break;
        }
      }
      
      // 2. Restliche Menge aus Normal-Bestand entnehmen (falls nötig)
      if (remainingQuantity > 0 && stockBefore > 0) {
        const quantityFromNormal = Math.min(remainingQuantity, stockBefore);
        
        await this.updateProductStock(refill.warehouseId, data.productId, -quantityFromNormal);
        
        totalMovements.push({
          source: `Normal-Bestand (${refill.warehouseId})`,
          quantity: -quantityFromNormal // NEGATIVE für OUT-Bewegung
        });
        
        console.log(`Entnahme von ${quantityFromNormal} aus Normal-Bestand`);
      }
    }
    
    // FIFO-Logik wurde bereits oben in der Entnahmelogik verarbeitet
    
    // Aktuellen Bestand nach der Änderung abrufen
    const [updatedInventory] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, refill.warehouseId),
        eq(inventoryItems.productId, data.productId)
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
    
    // Hauptbewegung erstellen (vom zugeordneten Lager, wenn Bestand vorhanden war)
    if (stockBefore > 0) {
      const quantityFromAssigned = Math.min(stockBefore, data.quantity);
      
      await this.createInventoryMovement({
        sourceType: "warehouse",
        sourceId: refill.warehouseId,
        destinationType: "machine",
        destinationId: refill.machineId,
        productId: data.productId,
        batchId: data.batchId,
        quantity: quantityFromAssigned,
        previousStock: stockBefore,
        currentStock: stockAfter,
        movementType: "OUT",
        referenceType: "REFILL",
        referenceId: `refill-${data.refillId}`,
        reason: "Automaten-Auffüllung",
        notes: `Auffüllung des Automaten: ${quantityFromAssigned} Einheiten aus zugeordnetem Lager`,
        performedBy: refill.performedBy
      });
    }
    
    return {
      ...result,
      movements: totalMovements
    };
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
      product: product ? {
        id: product.id,
        productName: product.productName || product.product_name || 'Unbekanntes Produkt',
        sku: product.sku || '',
        category: product.category || '',
        price: product.price || 0,
        packageSize: product.packageSize || product.package_size || null,
        packageQuantity: product.packageQuantity || product.package_quantity || null,
        unit: product.unit || 'Stk.'
      } : null,
      batch: batch ? {
        id: batch.id,
        batchNumber: batch.batchNumber || null,
        expiryDate: batch.expiryDate || null
      } : null
    }));
  }
  
  // ---- WAREHOUSE RECONCILIATION ----
  
  /**
   * Synchronisiert Produkte von einem Automaten zu einem Lager
   * Diese Methode stellt sicher, dass alle Produkte eines Automaten auch im zugehörigen Lager vorhanden sind
   */
  async syncMachineProductsToWarehouse(machineId: number, warehouseId: number): Promise<{
    added: number,
    existing: number,
    error?: any
  }> {
    try {
      console.log(`Synchronisiere Produkte von Automat ${machineId} mit Lager ${warehouseId}...`);
      
      // Verwende die vorhandene Hilfsmethode, um Produkte des Automaten abzurufen
      const machineProductItems = await this.getMachineProducts(machineId);
      
      if (!machineProductItems.length) {
        console.log(`Keine Produkte in Automat ${machineId} gefunden.`);
        return { added: 0, existing: 0 };
      }
      
      console.log(`Gefundene Produkte in Automat ${machineId}: ${machineProductItems.length}`);
      
      // Existierende Lagerbestände abrufen (Optimiert: direkte Produktabfrage statt Inventory-Items)
      // Hier verwenden wir eine direkte Abfrage mit UNION für alle Produkte im Lager
      const [existingProducts] = await db
        .select({
          productIds: sql<number[]>`ARRAY_AGG(DISTINCT product_id)`
        })
        .from(
          sql`(
            SELECT product_id FROM inventory_items WHERE warehouse_id = ${warehouseId}
            UNION
            SELECT product_id FROM product_batches WHERE warehouse_id = ${warehouseId}
          ) AS combined_products`
        );
      
      const existingProductIds = new Set(existingProducts?.productIds || []);
      console.log(`Existierende Produkt-IDs im Lager ${warehouseId}: ${existingProductIds.size}`);
      
      let added = 0;
      let existing = 0;
      
      // Für jedes Produkt im Automaten:
      for (const machineProduct of machineProductItems) {
        // Überspringe Produkte ohne Namen oder ID
        if (!machineProduct.productId || !machineProduct.productName) continue;
        
        // Prüfen, ob das Produkt bereits im Lager existiert (mit Produkt-ID)
        if (existingProductIds.has(machineProduct.productId)) {
          console.log(`Produkt "${machineProduct.productName}" (ID: ${machineProduct.productId}) bereits im Lager ${warehouseId} vorhanden`);
          existing++;
          continue;
        }
        
        // Produkt zum Lagerbestand hinzufügen
        console.log(`Füge Produkt "${machineProduct.productName}" (ID: ${machineProduct.productId}) zu Lager ${warehouseId} hinzu...`);
        
        // Anpassen der Parameter für die inventory_items Tabelle statt product_inventory_v3
        const newInventoryItem = await this.createProductInventory({
          warehouseId,
          productId: machineProduct.productId,
          // Anpassung für die inventory_items Tabelle (statt minimumStock und currentStock)
          minQuantity: 0, // Standardwert für Mindestbestand
          quantity: 0, // Anfangsbestand ist 0
          notes: "Automatisch von Automat synchronisiert"
        });
        
        console.log(`Produkt "${machineProduct.productName}" zu Lager ${warehouseId} hinzugefügt`);
        added++;
      }
      
      return { added, existing };
    } catch (error) {
      console.error("Fehler beim Synchronisieren von Produkten zum Lager:", error);
      return { added: 0, existing: 0, error };
    }
  }
  
  /**
   * Hilfsmethode zum Abrufen aller Produkte eines Automaten
   */
  private async getMachineProducts(machineId: number): Promise<any[]> {
    try {
      // Abfrage der Produkte aus der machine_products Tabelle
      const machineProductsResult = await db
        .select({
          machineProduct: machineProducts,
          product: products
        })
        .from(machineProducts)
        .leftJoin(products, eq(machineProducts.productId, products.id))
        .where(eq(machineProducts.machineId, machineId));
      
      // Typen-sicheres Mapping der Ergebnisse
      return machineProductsResult.map((row: any) => ({
        ...row.machineProduct,
        productName: row.product?.productName || null
      }));
    } catch (error) {
      console.error(`Fehler beim Abrufen der Produkte für Automat ${machineId}:`, error);
      return [];
    }
  }
  
  /**
   * Synchronisiert alle Automaten, die einem Lager zugeordnet sind
   */
  async syncAllMachinesForWarehouse(warehouseId: number): Promise<{
    machineCount: number,
    totalProductsAdded: number,
    errors: any[]
  }> {
    try {
      // Alle Automaten abrufen, die diesem Lager zugeordnet sind
      const assignments = await this.getWarehouseAssignments(warehouseId);
      console.log(`${assignments.length} Automaten sind dem Lager ${warehouseId} zugeordnet.`);
      
      let totalProductsAdded = 0;
      const errors = [];
      
      // Für jeden Automaten Synchronisierung durchführen
      for (const assignment of assignments) {
        try {
          console.log(`Synchronisiere Automat ${assignment.machineId} mit Lager ${warehouseId}...`);
          const result = await this.syncMachineProductsToWarehouse(assignment.machineId, warehouseId);
          
          console.log(`Synchronisierung für Automat ${assignment.machineId} abgeschlossen. ` +
                     `${result.added} Produkte hinzugefügt, ${result.existing} bereits vorhanden.`);
          
          totalProductsAdded += result.added;
        } catch (error) {
          console.error(`Fehler bei der Synchronisierung von Automat ${assignment.machineId}:`, error);
          errors.push({
            machineId: assignment.machineId,
            error: error.message || 'Unbekannter Fehler'
          });
        }
      }
      
      return {
        machineCount: assignments.length,
        totalProductsAdded,
        errors
      };
    } catch (error) {
      console.error(`Fehler bei der Synchronisierung des Lagers ${warehouseId}:`, error);
      return {
        machineCount: 0,
        totalProductsAdded: 0,
        errors: [error]
      };
    }
  }
  
  // ---- ERWEITERTE SUCHFUNKTIONEN ----
  
  /**
   * Erweiterte Produktsuche über alle oder spezifische Lager
   */
  async searchProducts(filters?: {
    searchTerm?: string;
    category?: string;
    warehouseId?: number;
    minQuantity?: number;
    maxQuantity?: number;
    inStock?: boolean;
    sortBy?: 'productName' | 'category' | 'sku' | 'quantity';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<{items: any[], total: number}> {
    const conditions: any[] = [];
    
    // Grundlegende Bedingungen
    if (filters?.warehouseId) {
      conditions.push(eq(inventoryItems.warehouseId, filters.warehouseId));
    }
    
    // Suchterm (Produktname oder SKU)
    if (filters?.searchTerm) {
      conditions.push(
        or(
          like(products.productName, `%${filters.searchTerm}%`),
          like(products.sku, `%${filters.searchTerm}%`)
        )
      );
    }
    
    // Kategorie-Filter
    if (filters?.category) {
      conditions.push(eq(products.category, filters.category));
    }
    
    // Bestandsfilter
    if (filters?.minQuantity !== undefined) {
      conditions.push(gte(inventoryItems.quantity, filters.minQuantity));
    }
    if (filters?.maxQuantity !== undefined) {
      conditions.push(lte(inventoryItems.quantity, filters.maxQuantity));
    }
    if (filters?.inStock === true) {
      conditions.push(sql`${inventoryItems.quantity} > 0`);
    } else if (filters?.inStock === false) {
      conditions.push(eq(inventoryItems.quantity, 0));
    }
    
    // Zählung für Paginierung
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const [{ count: total }] = await countQuery;
    
    // Hauptabfrage
    let query = db
      .select({
        inventory: inventoryItems,
        product: products,
        warehouse: {
          id: sql`w.id`,
          name: sql`w.name`
        }
      })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .leftJoin(sql`warehouses w`, sql`${inventoryItems.warehouseId} = w.id`)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Sortierung
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'productName':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.productName))
            : query.orderBy(products.productName);
          break;
        case 'category':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.category))
            : query.orderBy(products.category);
          break;
        case 'quantity':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(inventoryItems.quantity))
            : query.orderBy(inventoryItems.quantity);
          break;
        case 'sku':
          query = filters.sortOrder === 'desc' 
            ? query.orderBy(desc(products.sku))
            : query.orderBy(products.sku);
          break;
        default:
          query = query.orderBy(products.productName);
      }
    } else {
      query = query.orderBy(products.productName);
    }
    
    // Paginierung
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }
    
    const items = await query;
    
    return { items, total };
  }
  
  /**
   * Alle verfügbaren Produktkategorien abrufen
   */
  async getProductCategories(warehouseId?: number): Promise<string[]> {
    let query = db
      .select({ category: products.category })
      .from(products)
      .where(sql`${products.category} IS NOT NULL AND ${products.category} != ''`);
    
    // Nur Kategorien von Produkten in einem bestimmten Lager
    if (warehouseId) {
      query = query
        .innerJoin(inventoryItems, eq(products.id, inventoryItems.productId))
        .where(and(
          eq(inventoryItems.warehouseId, warehouseId),
          sql`${products.category} IS NOT NULL AND ${products.category} != ''`
        ));
    }
    
    const result = await query
      .groupBy(products.category)
      .orderBy(products.category);
    
    return result.map(r => r.category).filter(Boolean);
  }
}

// Singleton-Instance erstellen und exportieren
export const warehouseStorage = new DrizzleWarehouseStorage();