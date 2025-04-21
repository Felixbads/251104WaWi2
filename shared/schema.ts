import { InferSelectModel, sql } from 'drizzle-orm';
import { 
  text, 
  pgTable, 
  serial, 
  integer, 
  timestamp, 
  boolean,
  varchar,
  date,
  numeric,
  uniqueIndex,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Haupttabellen

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull(),
  email: text('email').notNull(),
  password: text('password').notNull(),
  role: text('role').default('user').notNull(),
  approved: boolean('approved').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sku: text('sku'),
  description: text('description'),
  category: text('category'),
  price: numeric('price', { precision: 10, scale: 2 }),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  vendonId: text('vendon_id'),
  normalizedName: text('normalized_name'),
  imageUrl: text('image_url'),
  barcode: text('barcode'),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const warehouses = pgTable('warehouses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location'),
  description: text('description'),
  managerId: integer('manager_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const machines = pgTable('machines', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }),
  description: text('description'),
  type: varchar('type', { length: 50 }),
  status: varchar('status', { length: 50 }).default('active'),
  warehouseId: integer('warehouse_id').references(() => warehouses.id),
  vendonId: varchar('vendon_id', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inventory_items = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  warehouseId: integer('warehouse_id').notNull().references(() => warehouses.id),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').default(0).notNull(),
  minQuantity: integer('min_quantity').default(0),
  maxQuantity: integer('max_quantity').default(0),
  location: text('location'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const statusEnum = pgEnum('status', [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'open',
]);

export const inventory_counts = pgTable('inventory_counts', {
  id: serial('id').primaryKey(),
  warehouseId: integer('warehouse_id').notNull().references(() => warehouses.id),
  userId: integer('user_id').references(() => users.id),
  name: text('name'),
  notes: text('notes'),
  status: statusEnum('status').default('pending').notNull(),
  startDate: timestamp('start_date').defaultNow(),
  endDate: timestamp('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inventory_count_items = pgTable('inventory_count_items', {
  id: serial('id').primaryKey(),
  inventoryCountId: integer('inventory_count_id').notNull().references(() => inventory_counts.id),
  productId: integer('product_id').notNull().references(() => products.id),
  expectedQuantity: integer('expected_quantity').default(0),
  actualQuantity: integer('actual_quantity'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inventory_batches = pgTable('inventory_batches', {
  id: serial('id').primaryKey(),
  inventoryCountId: integer('inventory_count_id').notNull().references(() => inventory_counts.id),
  productId: integer('product_id').notNull().references(() => products.id),
  batchNumber: text('batch_number'),
  expiryDate: date('expiry_date'),
  quantity: integer('quantity').default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inventory_transactions = pgTable('inventory_transactions', {
  id: serial('id').primaryKey(),
  warehouseId: integer('warehouse_id').notNull().references(() => warehouses.id),
  productId: integer('product_id').notNull().references(() => products.id),
  batchId: integer('batch_id').references(() => product_batches.id),
  quantity: integer('quantity').notNull(),
  type: text('type').notNull(), // 'in', 'out', 'adjustment'
  notes: text('notes'),
  performedBy: integer('performed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const product_batches = pgTable('product_batches', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  warehouseId: integer('warehouse_id').references(() => warehouses.id),
  batchNumber: text('batch_number'),
  initialQuantity: integer('initial_quantity').default(0),
  currentQuantity: integer('current_quantity').default(0),
  expiryDate: date('expiry_date'),
  receivedDate: date('received_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tabelle zur Erfassung von Produktbewegungen in die Automaten
export const product_movements = pgTable('product_movements', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  machineId: integer('machine_id').notNull().references(() => machines.id),
  batchId: integer('batch_id').references(() => product_batches.id),
  warehouseId: integer('warehouse_id').references(() => warehouses.id),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Ereignisse/Events aus Vendon (oder anderen externen Systemen)
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull(),
  machineId: text('machine_id'),
  type: text('type'),
  severity: text('severity'),
  message: text('message'),
  timestamp: timestamp('timestamp'),
  rawData: text('raw_data'),
  processed: boolean('processed').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const machine_products = pgTable('machine_products', {
  id: serial('id').primaryKey(),
  machineId: integer('machine_id').notNull().references(() => machines.id),
  productId: integer('product_id').notNull().references(() => products.id),
  position: integer('position'),
  quantity: integer('quantity').default(0),
  maxQuantity: integer('max_quantity').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vendon_transactions = pgTable('vendon_transactions', {
  id: serial('id').primaryKey(),
  transactionId: text('transaction_id').notNull(),
  machineId: text('machine_id'),
  productId: integer('product_id').references(() => products.id),
  productName: text('product_name'),
  timestamp: timestamp('timestamp'),
  price: numeric('price', { precision: 10, scale: 2 }),
  status: text('status'),
  rawData: text('raw_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Procurement management

export const purchase_orders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  warehouseId: integer('warehouse_id').references(() => warehouses.id),
  orderDate: date('order_date').defaultNow().notNull(),
  expectedDeliveryDate: date('expected_delivery_date'),
  deliveryDate: date('delivery_date'),
  status: text('status').default('draft').notNull(), // draft, submitted, received, cancelled
  notes: text('notes'),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const purchase_order_items = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  purchaseOrderId: integer('purchase_order_id').notNull().references(() => purchase_orders.id),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }),
  receivedQuantity: integer('received_quantity').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const purchase_conditions = pgTable('purchase_conditions', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  productId: integer('product_id').notNull().references(() => products.id),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }),
  minOrderQuantity: integer('min_order_quantity').default(1),
  leadTime: integer('lead_time'), // in days
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Forecast models

export const forecast_models = pgTable('forecast_models', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(), // 'prophet', 'arima', etc.
  config: text('config'), // JSON configuration
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const forecast_results = pgTable('forecast_results', {
  id: serial('id').primaryKey(),
  modelId: integer('model_id').notNull().references(() => forecast_models.id),
  productId: integer('product_id').references(() => products.id),
  machineId: integer('machine_id').references(() => machines.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  forecastData: text('forecast_data'), // JSON with forecast values
  accuracy: numeric('accuracy', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Holiday calendar
export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  name: text('name').notNull(),
  region: text('region').default('DE-SN'), // Default to Saxony
  isNationalHoliday: boolean('is_national_holiday').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Define schemas with zod
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true });
export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true });
export const insertMachineSchema = createInsertSchema(machines).omit({ id: true });
export const insertInventoryItemSchema = createInsertSchema(inventory_items).omit({ id: true });
export const insertInventoryCountSchema = createInsertSchema(inventory_counts).omit({ id: true });
export const insertInventoryCountItemSchema = createInsertSchema(inventory_count_items).omit({ id: true });
export const insertProductBatchSchema = createInsertSchema(product_batches).omit({ id: true });
export const insertProductMovementSchema = createInsertSchema(product_movements).omit({ id: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export const insertPurchaseConditionSchema = createInsertSchema(purchase_conditions).omit({ id: true });

// Define select types
export type User = InferSelectModel<typeof users>;
export type Product = InferSelectModel<typeof products>;
export type Supplier = InferSelectModel<typeof suppliers>;
export type Warehouse = InferSelectModel<typeof warehouses>;
export type Machine = InferSelectModel<typeof machines>;
export type InventoryItem = InferSelectModel<typeof inventory_items>;
export type InventoryCount = InferSelectModel<typeof inventory_counts>;
export type ProductBatch = InferSelectModel<typeof product_batches>;
export type ProductMovement = InferSelectModel<typeof product_movements>;

// Define insert types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InsertInventoryCount = z.infer<typeof insertInventoryCountSchema>;
export type InsertProductBatch = z.infer<typeof insertProductBatchSchema>;
export type InsertProductMovement = z.infer<typeof insertProductMovementSchema>;