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
  telemetryUnitId: integer("telemetry_unit_id"),
  power: boolean("power"),
  powerStatus: text("power_status"),
  currency: text("currency"),
  description: text("description"),
  lastSync: timestamp("last_sync"),
  additionalData: text("additional_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  locationId: integer("location_id").references(() => locations.id),
  locationName: text("location_name"),
  locationAddress: text("location_address"),
  lastPing: timestamp("last_ping"),
  lastVend: timestamp("last_vend"),
  extraData: text("extra_data"),
});

export const insertMachineSchema = createInsertSchema(machines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;

// Products table - Schema aktualisiert für text vendonId
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  vendonId: text("vendon_id").notNull(),
  productName: text("product_name").notNull(),
  price: real("price"),
  category: text("category"),
  description: text("description"),
  status: text("status"),
  // Weitere Felder für Produktdetails
  sku: text("sku"),
  barcode: text("barcode"),
  // Extracted from additionalData
  vat: real("vat"),
  depositPrice: real("deposit_price"),
  depositVat: real("deposit_vat"),
  productType: text("product_type"),
  article: text("article"),
  tags: text("tags"), // JSON array as string
  units: text("units"),
  recipe: text("recipe"),
  costPrice: real("cost_price"),
  warehouseLocation: text("warehouse_location"),
  vendonUpdatedAt: timestamp("vendon_updated_at"),
  accountId: integer("account_id"),
  accountName: text("account_name"),
  accountTimezone: text("account_timezone"),
  // Machine defaults
  amountMax: integer("amount_max"),
  amountStandard: integer("amount_standard"),
  amountCritical: integer("amount_critical"),
  refillUnitSize: integer("refill_unit_size"),
  minRefill: integer("min_refill"),
  critical: boolean("critical"),
  // Keep the full JSON for reference and backward compatibility
  additionalData: text("additional_data"),
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

// Transactions table - neu strukturiert basierend auf der Vendon API
export const transactions = pgTable("transactions", {
  // Primärschlüssel und Referenzen
  id: serial("id").primaryKey(),
  
  // Vendon API Basis-Felder
  vendonId: text("vendon_id").notNull(), // transaction_id aus der API
  machineId: integer("machine_id").references(() => machines.id),
  machineName: text("machine_name"),
  
  // Datum und Zeit
  datetime: timestamp("datetime").notNull(),                   // In ISO-Format konvertiert
  transactionDt: timestamp("transaction_dt"),                  // In ISO-Format konvertiert
  registeredDt: timestamp("registered_dt"),                    // In ISO-Format konvertiert
  updatedAt: timestamp("updated_at"),                          // In ISO-Format konvertiert
  
  // Produkt-Details
  productId: text("product_id"),                               // Optional: Artikel-ID
  productName: text("product_name"),                           // Name des Produkts
  selection: integer("selection"),                             // Auswahlnummer
  
  // Lager-Details
  stockId: integer("stock_id"),                                // Lager-ID
  article: text("article"),                                    // Artikel (normalerweise null)
  
  // Mengen und Preis-Informationen
  quantity: integer("quantity").default(1),                    // Menge
  price: real("price").notNull(),                              // Preis
  priceVat: real("price_vat"),                                 // Mehrwertsteuer-Betrag
  priceWoVat: real("price_wo_vat"),                            // Preis ohne Mehrwertsteuer
  vat: real("vat"),                                            // Mehrwertsteuersatz in Prozent
  currency: text("currency"),                                  // Währung
  
  // Rabatt-Informationen
  discountCode: text("discount_code"),                         // Rabattcode
  discountAmount: real("discount_amount"),                     // Rabattbetrag
  
  // Zahlungsinformationen
  paymentMethod: text("payment_method"),                       // Zahlungsmethode (CASH, CASHLESS, etc.)
  
  // Metadaten
  source: text("source").default("vendon"),                   // Quelle der Daten (REALTIME, etc.)
  transactionData: text("transaction_data"),                  // Zusätzliche Transaktionsdaten
  note: text("note"),                                         // Notizen
  metadata: text("metadata"),                                 // Metadaten
  
  // Standort-Zuordnung
  locationId: integer("location_id").references(() => locations.id),
  locationName: text("location_name"),
  
  // Weitere Felder für die Anwendungslogik
  transactionType: text("transaction_type"),                  // Transaktionstyp
  status: text("status").default("completed"),                // Status der Transaktion
  coinCredit: real("coin_credit").default(0),                 // Münz-Guthaben
  cardCredit: real("card_credit").default(0),                 // Karten-Guthaben
  cashlessCredit: real("cashless_credit").default(0),         // Bargeldloses Guthaben
  isTest: boolean("is_test").default(false),                  // Ist dies eine Test-Transaktion
  
  // Verarbeitungs-Tracking
  syncedAt: timestamp("synced_at").defaultNow(),              // Wann wurde die Transaktion synchronisiert
  lastSync: timestamp("last_sync"),                           // Letzte Synchronisation
  processedAt: timestamp("processed_at"),                     // Wann wurde die Transaktion verarbeitet
  processingStatus: text("processing_status").default("pending"), // Verarbeitungsstatus: pending, processed, error
  processingError: text("processing_error"),                   // Fehlermeldung bei der Verarbeitung
  
  // Datensatz-Tracking
  createdAt: timestamp("created_at").defaultNow(),            // Wann wurde der Datensatz erstellt
}, (table) => {
  return {
    vendonIdx: unique().on(table.vendonId),                   // Eindeutiger Index auf Vendon-ID
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
  machineId: integer("machine_id").notNull().references(() => machines.id), // Maschinen-ID muss vorhanden sein
  machineName: text("machine_name").default(''), // Default-Wert für machineName
  datetime: timestamp("datetime").notNull(), // Datum/Uhrzeit muss vorhanden sein
  operator: text("operator").default(''), // Operator kann leer sein, Standardwert ist leerer String
  status: text("status").default('completed'), // Status kann leer sein, Standardwert ist 'completed'
  // Zusätzliche Felder basierend auf der API-Dokumentation und Implementierung
  refillType: text("refill_type").default(''),        // Typ der Nachfüllung mit Standardwert
  plannedAmount: integer("planned_amount").default(0), // Geplante Menge mit Standardwert 0
  actualAmount: integer("actual_amount").default(0),   // Tatsächliche Menge mit Standardwert 0
  totalProducts: integer("total_products").default(0), // Anzahl der Produkte mit Standardwert 0
  notes: text("notes").default(''),                    // Notizen mit Standardwert
  refillNumber: text("refill_number").default(''),     // Refill-Nummer mit Standardwert
  accountId: integer("account_id").default(0),         // Konto-ID mit Standardwert 0
  accountName: text("account_name").default(''),       // Kontoname mit Standardwert
  timezone: text("timezone").default(''),              // Zeitzone mit Standardwert
  createdBy: text("created_by").default(''),           // Erstellt von mit Standardwert
  lastModifiedBy: text("last_modified_by").default(''), // Zuletzt geändert von mit Standardwert
  vendonCreatedAt: timestamp("vendon_created_at").defaultNow(), // Erstellt am mit aktuellem Datum als Standardwert
  vendonUpdatedAt: timestamp("vendon_updated_at").defaultNow(), // Aktualisiert am mit aktuellem Datum als Standardwert
  extraData: text("extra_data").default('{}'),         // JSON mit allen zusätzlichen Daten, Standardwert leeres JSON
  source: text("source").default("vendon"),            // Quelle der Daten
  locationId: integer("location_id").references(() => locations.id), // Standort-ID
  totalAmount: real("total_amount").default(0),        // Gesamtbetrag mit Standardwert 0
  processedAt: timestamp("processed_at"),              // Wann wurde der Refill verarbeitet
  processStatus: text("process_status").default("pending"), // Verarbeitungsstatus: pending, processed, failed
  errorMessage: text("error_message").default(''),     // Fehlermeldung bei der Verarbeitung
  createdAt: timestamp("created_at").defaultNow(),     // Wann wurde der Datensatz erstellt
  updatedAt: timestamp("updated_at").defaultNow(),     // Wann wurde der Datensatz aktualisiert
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
  productId: text("product_id"), // Text statt Integer, kein direkter Verweis auf products.id mehr
  productName: text("product_name").default(''),
  quantity: integer("quantity").default(0),
  price: real("price").default(0),
  datetime: timestamp("datetime").defaultNow(),
  // Felder für hinzugefügte und entfernte Produkte
  added: integer("added").default(0),                      // Anzahl der hinzugefügten Produkte
  removed: integer("removed").default(0),                  // Anzahl der entfernten Produkte
  // Zusätzliche Felder für detaillierte Produktinformationen in einer Nachfüllung
  vendonProductId: text("vendon_product_id").default(''),   // Vendon Produkt-ID
  position: text("position").default(''),                   // Position im Automaten (z.B. A1, B3)
  planogramPosition: text("planogram_position").default(''), // Planogramm-Position
  productSku: text("product_sku").default(''),              // Produkt-SKU
  productBarcode: text("product_barcode").default(''),      // Produkt-Barcode
  productCategory: text("product_category").default(''),    // Produkt-Kategorie
  vat: real("vat").default(0),                              // Mehrwertsteuer
  depositPrice: real("deposit_price").default(0),           // Pfandpreis
  depositVat: real("deposit_vat").default(0),               // Mehrwertsteuer auf Pfand
  previousStock: integer("previous_stock").default(0),      // Vorheriger Bestand
  currentStock: integer("current_stock").default(0),        // Aktueller Bestand
  amountMax: integer("amount_max").default(0),              // Maximale Menge
  amountStandard: integer("amount_standard").default(0),    // Standardmenge
  amountCritical: integer("amount_critical").default(0),    // Kritische Menge
  refillUnitSize: integer("refill_unit_size").default(0),   // Größe der Nachfülleinheit
  minRefill: integer("min_refill").default(0),              // Mindestmenge für Nachfüllung
  critical: boolean("critical").default(false),             // Kritischer Bestand?
  extraData: text("extra_data").default('{}'),              // JSON mit allen zusätzlichen Daten
  createdAt: timestamp("created_at").defaultNow(),          // Erstellungsdatum
  updatedAt: timestamp("updated_at").defaultNow(),          // Aktualisierungsdatum
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
  locationId: integer("location_id").references(() => locations.id),
  locationName: text("location_name"),
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
  additionalData: text("additional_data"),
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
  // Entfernt Relation zu product, da productId jetzt ein Text ist und kein direkter Verweis auf products.id mehr existiert
}));

export const eventsRelations = relations(events, ({ one }) => ({
  machine: one(machines, {
    fields: [events.machineId],
    references: [machines.id],
  }),
  location: one(locations, {
    fields: [events.locationId],
    references: [locations.id],
  }),
}));
