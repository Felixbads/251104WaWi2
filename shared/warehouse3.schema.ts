import { pgTable, text, serial, integer, boolean, timestamp, real, date, unique, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users, products, warehouses } from './schema';

// ----- WAREHOUSE 3 SCHEMA -----
// Vollständig überarbeitetes Schema für robuste Lagerverwaltung
// Unified schema with stock_batches and stock_movements as required

// Use existing warehouses from main schema
export { warehouses } from './schema';

// Re-export warehouse types from main schema for consistency
export { insertWarehouseSchema, type InsertWarehouse, type Warehouse } from './schema';

// Machine-Warehouse Assignments - Maps to existing machine_warehouse_assignments table
export const machineWarehouseAssignments = pgTable("machine_warehouse_assignments", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(), // Referenz zur machines-Tabelle
  warehouseId: integer("warehouse_id").notNull(),
  isPrimary: boolean("is_primary").default(true),
  assignedBy: integer("assigned_by"), // User ID
  assignedAt: timestamp("assigned_at").defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Ein Automat kann nur einmal einem Lager zugeordnet sein
    machineWarehouseUnique: unique().on(table.machineId, table.warehouseId),
  };
});

export const insertMachineWarehouseAssignmentSchema = createInsertSchema(machineWarehouseAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMachineWarehouseAssignment = z.infer<typeof insertMachineWarehouseAssignmentSchema>;
export type MachineWarehouseAssignment = typeof machineWarehouseAssignments.$inferSelect;

// Product Inventory Table - Bestandsverwaltung pro Produkt und Lager
export const productInventory = pgTable("product_inventory_v3", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  productId: integer("product_id").notNull(), // Referenz zur products-Tabelle
  currentStock: integer("current_stock").default(0),
  minimumStock: integer("minimum_stock").default(0),
  reorderLevel: integer("reorder_level").default(0),
  location: text("location"), // Position im Lager (Regal, Fach)
  lastCountDate: timestamp("last_count_date"),
  lastUpdatedBy: integer("last_updated_by"), // User ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Ein Produkt kann nur einmal pro Lager einen Eintrag haben
    uniqueProductWarehouse: unique().on(table.warehouseId, table.productId)
  };
});

export const insertProductInventorySchema = createInsertSchema(productInventory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductInventory = z.infer<typeof insertProductInventorySchema>;
export type ProductInventory = typeof productInventory.$inferSelect;

// Stock Batches - Maps to existing product_batches table with required fields for FIFO
export const stockBatches = pgTable("product_batches", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  batchNumber: text("batch_number").notNull(),
  supplierBatchNumber: text("supplier_batch_number"),
  initialQuantity: integer("initial_quantity").notNull(),
  currentQuantity: integer("current_quantity").notNull(),
  receivedDate: date("received_date").notNull(),
  manufacturingDate: date("manufacturing_date"),
  expiryDate: date("expiry_date").notNull(), // Required for FIFO
  orderId: integer("order_id"),
  supplierId: integer("supplier_id"),
  status: text("status").notNull().default("active"),
  locationInWarehouse: text("location_in_warehouse"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  version: integer("version").notNull().default(1),
}, (table) => {
  return {
    // FIFO indexing for efficient queries
    fifoIndex: unique().on(table.warehouseId, table.productId, table.expiryDate),
  };
});

export const insertStockBatchSchema = createInsertSchema(stockBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
});

export type InsertStockBatch = z.infer<typeof insertStockBatchSchema>;
export type StockBatch = typeof stockBatches.$inferSelect;

// Stock Movements - Maps to existing inventory_movements table with required fields
export const stockMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  
  // Core movement information
  movementType: text("movement_type").notNull(), // "RECEIPT", "FILL", "ADJUST"
  productId: integer("product_id").notNull(),
  warehouseId: integer("source_warehouse_id"), // Use existing source_warehouse_id field
  batchId: integer("batch_id"),
  
  // Required fields for audit trail as per requirements
  qtyDelta: integer("quantity").notNull(), // Maps to quantity field
  beforeQty: integer("previous_stock"), // Maps to previous_stock
  afterQty: integer("current_stock"), // Maps to current_stock
  actorUserId: integer("performed_by"), // Maps to performed_by - REQUIRED per requirements
  
  // Optional machine and order references
  machineId: integer("machine_id"),
  orderId: integer("destination_warehouse_id"), // Repurpose for order_id when needed
  
  // Timestamps and metadata
  occurredAt: timestamp("performed_at").defaultNow(),
  source: text("reference_type"), // Maps to reference_type for source tracking
  
  // Existing fields we need to maintain
  direction: text("direction"),
  referenceId: text("reference_id"),
  status: text("status"),
  notes: text("notes"),
  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date"),
  locationFrom: text("location_from"),
  locationTo: text("location_to"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

// Inventory Count - Inventur
export const inventoryCounts = pgTable("inventory_counts_v3", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  status: text("status").default("pending"), // "pending", "in_progress", "completed", "cancelled"
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  initiatedBy: integer("initiated_by"), // User ID
  completedBy: integer("completed_by"), // User ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventoryCountSchema = createInsertSchema(inventoryCounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryCount = z.infer<typeof insertInventoryCountSchema>;
export type InventoryCount = typeof inventoryCounts.$inferSelect;

// Inventory Count Items - Einzelne Zählpositionen bei einer Inventur
export const inventoryCountItems = pgTable("inventory_count_items_v3", {
  id: serial("id").primaryKey(),
  countId: integer("count_id").notNull().references(() => inventoryCounts.id),
  productId: integer("product_id").notNull(), // Referenz zur products-Tabelle
  batchId: integer("batch_id").references(() => productBatches.id),
  expectedQuantity: integer("expected_quantity").default(0),
  actualQuantity: integer("actual_quantity"),
  discrepancy: integer("discrepancy"),
  notes: text("notes"),
  countedBy: integer("counted_by"), // User ID
  countedAt: timestamp("counted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventoryCountItemSchema = createInsertSchema(inventoryCountItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryCountItem = z.infer<typeof insertInventoryCountItemSchema>;
export type InventoryCountItem = typeof inventoryCountItems.$inferSelect;

// Refill Tracking - Nachverfolgung von Automaten-Auffüllungen
export const refillTrackings = pgTable("refill_trackings_v3", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(), // Referenz zur machines-Tabelle
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  refillDate: timestamp("refill_date").defaultNow(),
  status: text("status").default("completed"), // "pending", "in_progress", "completed", "cancelled"
  notes: text("notes"),
  performedBy: integer("performed_by"), // User ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRefillTrackingSchema = createInsertSchema(refillTrackings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRefillTracking = z.infer<typeof insertRefillTrackingSchema>;
export type RefillTracking = typeof refillTrackings.$inferSelect;

// Refill Tracking Items - Einzelne Produkte in einer Auffüllung
export const refillTrackingItems = pgTable("refill_tracking_items_v3", {
  id: serial("id").primaryKey(),
  refillId: integer("refill_id").notNull().references(() => refillTrackings.id),
  productId: integer("product_id").notNull(), // Referenz zur products-Tabelle
  batchId: integer("batch_id").references(() => productBatches.id),
  quantity: integer("quantity").notNull(),
  stockBefore: integer("stock_before"),
  stockAfter: integer("stock_after"),
  expectedMachineStockAfter: integer("expected_machine_stock_after"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRefillTrackingItemSchema = createInsertSchema(refillTrackingItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRefillTrackingItem = z.infer<typeof insertRefillTrackingItemSchema>;
export type RefillTrackingItem = typeof refillTrackingItems.$inferSelect;

// ---- RELATIONEN ----

// Warehouse Relations - Updated to use unified schema
export const warehouseRelations = relations(warehouses, ({ many }) => ({
  inventory: many(productInventory),
  batches: many(stockBatches),
  movements: many(stockMovements, { relationName: "warehouse_movements" }),
  counts: many(inventoryCounts),
  machineAssignments: many(machineWarehouseAssignments),
  refills: many(refillTrackings),
}));

// Product Inventory Relations - Updated to use unified schema
export const productInventoryRelations = relations(productInventory, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [productInventory.warehouseId],
    references: [warehouses.id],
  }),
  batches: many(stockBatches),
}));

// Inventory Count Relations
export const inventoryCountRelations = relations(inventoryCounts, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [inventoryCounts.warehouseId],
    references: [warehouses.id],
  }),
  items: many(inventoryCountItems),
}));

// Inventory Count Item Relations
export const inventoryCountItemRelations = relations(inventoryCountItems, ({ one }) => ({
  count: one(inventoryCounts, {
    fields: [inventoryCountItems.countId],
    references: [inventoryCounts.id],
  }),
  batch: one(productBatches, {
    fields: [inventoryCountItems.batchId],
    references: [productBatches.id],
  }),
}));

// Refill Tracking Relations
export const refillTrackingRelations = relations(refillTrackings, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [refillTrackings.warehouseId],
    references: [warehouses.id],
  }),
  items: many(refillTrackingItems),
}));

// Movement Type Enum for consistent movement logging
export const MovementTypeEnum = {
  RECEIPT: 'RECEIPT' as const,
  FILL: 'FILL' as const,
  ADJUST: 'ADJUST' as const,
} as const;

export type MovementType = typeof MovementTypeEnum[keyof typeof MovementTypeEnum];

// Relations for the unified schema
export const stockBatchRelations = relations(stockBatches, ({ one, many }) => ({
  product: one(products, {
    fields: [stockBatches.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [stockBatches.warehouseId],
    references: [warehouses.id],
  }),
  movements: many(stockMovements),
  createdByUser: one(users, {
    fields: [stockBatches.createdBy],
    references: [users.id],
  }),
}));

export const stockMovementRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  batch: one(stockBatches, {
    fields: [stockMovements.batchId],
    references: [stockBatches.id],
  }),
  actor: one(users, {
    fields: [stockMovements.actorUserId],
    references: [users.id],
  }),
}));

export const machineWarehouseAssignmentRelations = relations(machineWarehouseAssignments, ({ one }) => ({
  warehouse: one(warehouses, {
    fields: [machineWarehouseAssignments.warehouseId],
    references: [warehouses.id],
  }),
  assignedByUser: one(users, {
    fields: [machineWarehouseAssignments.assignedBy],
    references: [users.id],
  }),
}));

// Export legacy compatibility aliases
export const productBatches = stockBatches; // For backward compatibility
export const inventoryMovements = stockMovements; // For backward compatibility
export type ProductBatch = StockBatch;
export type InventoryMovement = StockMovement;
export const insertProductBatchSchema = insertStockBatchSchema;
export const insertInventoryMovementSchema = insertStockMovementSchema;