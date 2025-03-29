import { pgTable, text, serial, integer, boolean, timestamp, real, doublePrecision, unique, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Original users table (kept for reference)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Locations table
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;

// Machines table based on vendon_machines
export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  vendonId: text("vendon_id").notNull(),
  machineName: text("machine_name").notNull(),
  machineType: text("machine_type"),
  status: text("status"),
  model: text("model"),
  serialNumber: text("serial_number"),
  lastSync: timestamp("last_sync"),
  additionalData: text("additional_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  locationId: integer("location_id").references(() => locations.id),
});

export const insertMachineSchema = createInsertSchema(machines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;

// Products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  vendonId: text("vendon_id").notNull(),
  productName: text("product_name").notNull(),
  price: real("price"),
  category: text("category"),
  description: text("description"),
  status: text("status"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Transactions table based on vendon_transactions
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  vendonId: text("vendon_id"),
  machineId: integer("machine_id").references(() => machines.id),
  productId: integer("product_id").references(() => products.id),
  price: real("price"),
  datetime: timestamp("datetime").notNull(),
  productName: text("product_name"),
  machineName: text("machine_name"),
  transactionType: text("transaction_type"),
  paymentType: text("payment_type"),
  paymentMethod: text("payment_method"),
  status: text("status"),
  currency: text("currency"),
  source: text("source").default("vendon"),
  extraData: text("extra_data"),
  locationId: integer("location_id").references(() => locations.id),
}, (table) => {
  return {
    vendonIdx: unique().on(table.vendonId, table.machineId, table.productId, table.datetime),
  };
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// Refills table based on vendon_refills
export const refills = pgTable("refills", {
  id: serial("id").primaryKey(),
  vendonId: text("vendon_id").notNull(),
  machineId: integer("machine_id").references(() => machines.id),
  machineName: text("machine_name"),
  datetime: timestamp("datetime").notNull(),
  operator: text("operator"),
  status: text("status"),
  extraData: text("extra_data"),
  source: text("source").default("vendon"),
  locationId: integer("location_id").references(() => locations.id),
  totalAmount: real("total_amount").default(0),
}, (table) => {
  return {
    vendonIdx: unique().on(table.vendonId, table.machineId, table.datetime),
  };
});

export const insertRefillSchema = createInsertSchema(refills).omit({
  id: true,
});

export type InsertRefill = z.infer<typeof insertRefillSchema>;
export type Refill = typeof refills.$inferSelect;

// Refill details table based on vendon_refill_details
export const refillDetails = pgTable("refill_details", {
  id: serial("id").primaryKey(),
  refillId: integer("refill_id").references(() => refills.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name"),
  quantity: integer("quantity"),
  price: real("price"),
  datetime: timestamp("datetime"),
  extraData: text("extra_data"),
});

export const insertRefillDetailSchema = createInsertSchema(refillDetails).omit({
  id: true,
});

export type InsertRefillDetail = z.infer<typeof insertRefillDetailSchema>;
export type RefillDetail = typeof refillDetails.$inferSelect;

// Events table based on vendon_events
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  vendonId: text("vendon_id").notNull(),
  eventType: text("event_type"),
  eventName: text("event_name"),
  description: text("description"),
  machineId: integer("machine_id").references(() => machines.id),
  machineName: text("machine_name"),
  datetime: timestamp("datetime").notNull(),
  status: text("status"),
  resolvedAt: timestamp("resolved_at"),
  severity: text("severity"),
  extraData: text("extra_data"),
}, (table) => {
  return {
    vendonIdx: unique().on(table.vendonId, table.machineId, table.datetime),
  };
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Sync log table based on vendon_sync_log
export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  syncType: text("sync_type").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  itemsFound: integer("items_found").default(0),
  itemsSaved: integer("items_saved").default(0),
  itemsUpdated: integer("items_updated").default(0),
  duplicates: integer("duplicates").default(0),
  errors: integer("errors").default(0),
  durationSeconds: real("duration_seconds").default(0),
  syncStatus: text("sync_status").default("running"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;

// Define relations
export const machinesRelations = relations(machines, ({ one }) => ({
  location: one(locations, {
    fields: [machines.locationId],
    references: [locations.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  machine: one(machines, {
    fields: [transactions.machineId],
    references: [machines.id],
  }),
  product: one(products, {
    fields: [transactions.productId],
    references: [products.id],
  }),
  location: one(locations, {
    fields: [transactions.locationId],
    references: [locations.id],
  }),
}));

export const refillsRelations = relations(refills, ({ one, many }) => ({
  machine: one(machines, {
    fields: [refills.machineId],
    references: [machines.id],
  }),
  location: one(locations, {
    fields: [refills.locationId],
    references: [locations.id],
  }),
  details: many(refillDetails),
}));

export const refillDetailsRelations = relations(refillDetails, ({ one }) => ({
  refill: one(refills, {
    fields: [refillDetails.refillId],
    references: [refills.id],
  }),
  product: one(products, {
    fields: [refillDetails.productId],
    references: [products.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  machine: one(machines, {
    fields: [events.machineId],
    references: [machines.id],
  }),
}));
