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

// Tabellen für Legacy-Datenmodelle, die noch in Verwendung sind
// aber nicht mehr als primäre Datenstrukturen verwendet werden sollen

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  transactionId: text('transaction_id').notNull(),
  machineId: text('machine_id'),
  productId: text('product_id'),
  productName: text('product_name'),
  datetime: timestamp('datetime'),
  price: numeric('price', { precision: 10, scale: 2 }),
  status: text('status'),
  rawData: text('raw_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const refills = pgTable('refills', {
  id: serial('id').primaryKey(),
  vendonId: text('vendon_id').notNull(),
  machineId: text('machine_id'),
  machineName: text('machine_name'),
  datetime: timestamp('datetime'),
  status: text('status'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const refillDetails = pgTable('refill_details', {
  id: serial('id').primaryKey(),
  refillId: integer('refill_id').references(() => refills.id),
  vendonProductId: text('vendon_product_id'),
  productName: text('product_name'),
  quantity: integer('quantity'),
  added: integer('added'),
  removed: integer('removed'),
  previousStock: integer('previous_stock'),
  currentStock: integer('current_stock'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const syncLogs = pgTable('sync_logs', {
  id: serial('id').primaryKey(),
  syncType: text('sync_type').notNull(),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  syncStatus: text('sync_status').default('pending'),
  itemsFound: integer('items_found').default(0),
  itemsSaved: integer('items_saved').default(0),
  duplicates: integer('duplicates').default(0),
  errors: integer('errors').default(0),
  durationSeconds: integer('duration_seconds'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stocks = pgTable('stocks', {
  id: serial('id').primaryKey(),
  vendorId: text('vendor_id'),
  productId: text('product_id'),
  productName: text('product_name'),
  quantity: integer('quantity'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const machineStocks = pgTable('machine_stocks', {
  id: serial('id').primaryKey(),
  machineId: text('machine_id'),
  machineName: text('machine_name'),
  vendonProductId: text('vendon_product_id'),
  productName: text('product_name'),
  quantity: integer('quantity'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  latitude: numeric('latitude', { precision: 10, scale: 6 }),
  longitude: numeric('longitude', { precision: 10, scale: 6 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Define types
export type Transaction = InferSelectModel<typeof transactions>;
export type Refill = InferSelectModel<typeof refills>;
export type RefillDetail = InferSelectModel<typeof refillDetails>;
export type SyncLog = InferSelectModel<typeof syncLogs>;
export type Stock = InferSelectModel<typeof stocks>;
export type MachineStock = InferSelectModel<typeof machineStocks>;
export type Location = InferSelectModel<typeof locations>;

// Define insert types
export type InsertTransaction = typeof transactions.$inferInsert;
export type InsertRefill = typeof refills.$inferInsert;
export type InsertRefillDetail = typeof refillDetails.$inferInsert;
export type InsertSyncLog = typeof syncLogs.$inferInsert;
export type InsertStock = typeof stocks.$inferInsert;
export type InsertMachineStock = typeof machineStocks.$inferInsert;
export type InsertLocation = typeof locations.$inferInsert;