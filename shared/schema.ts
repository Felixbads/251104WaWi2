import { pgTable, text, serial, integer, boolean, timestamp, real, doublePrecision, unique, primaryKey, date, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

// Sync-Locks Tabelle für den Synchronisierungs-Sperrmechanismus
export const syncLocks = pgTable("sync_locks", {
  id: serial("id").primaryKey(),
  syncType: varchar("sync_type", { length: 50 }).notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  lockedUntil: timestamp("locked_until").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sync-Logs Tabelle für die Protokollierung von Synchronisierungsprozessen
export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  syncType: varchar("sync_type", { length: 50 }).notNull(),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  itemsFound: integer("items_found"),
  itemsSaved: integer("items_saved"),
  itemsUpdated: integer("items_updated"),
  duplicates: integer("duplicates"),
  errors: integer("errors"),
  durationSeconds: real("duration_seconds"),
  syncStatus: varchar("sync_status", { length: 20 }).default("running").notNull(),
  errorMessage: text("error_message"),
  additionalData: text("additional_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  entityType: varchar("entity_type", { length: 50 }).default("unknown"),
});

// Sync-State Tabelle für die Speicherung von Importfortschrittsdaten
export const syncState = pgTable("sync_state", {
  jobName: varchar("job_name", { length: 50 }).primaryKey(), // Name des Import-Jobs (z.B. 'vendon_history_import')
  lastDate: date("last_date").notNull(),                    // Letztes verarbeitetes Datum
  lastOffset: integer("last_offset").notNull(),             // Letzter Offset innerhalb dieses Datums
  lastId: varchar("last_id", { length: 100 }),              // Optional: Letzte verarbeitete ID (für bestimmte Importe)
  additionalState: text("additional_state"),                // Optional: Zusätzliche Zustandsinformationen als JSON
  updatedAt: timestamp("updated_at").defaultNow().notNull(), // Zeitpunkt der letzten Aktualisierung
});

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
  createdAt: true,
  entityType: true,
});

export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;

// Schema für historische Synchronisierungsoptionen
export const historicalSyncOptionsSchema = z.object({
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  batchSize: z.number().min(1).max(100).default(100),
  maxTransactions: z.number().min(100).default(10000),
  syncStep: z.number().min(1).default(30), // Anzahl der Tage pro Synchronisierungsschritt
  forceUpdate: z.boolean().default(false)
});

export type HistoricalSyncOptions = z.infer<typeof historicalSyncOptionsSchema>;

// Updated users table with more fields
// Suppliers table
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country").default("Deutschland"),
  status: text("status").default("active"),
  notes: text("notes"),
  paymentTerms: text("payment_terms"),
  deliveryTerms: text("delivery_terms"),
  minimumOrderValue: real("minimum_order_value"),
  deliveryDays: text("delivery_days"), // JSON array as string ["monday", "wednesday"]
  taxId: text("tax_id"),
  accountNumber: text("account_number"),
  bankDetails: text("bank_details"),
  // Email template fields
  emailTemplate: text("email_template"), // HTML email template for orders
  emailSubjectTemplate: text("email_subject_template"), // Subject line template
  orderEmailRecipient: text("order_email_recipient"), // Primary recipient email
  orderEmailCc: text("order_email_cc"), // CC recipients (comma-separated)
  orderEmailBcc: text("order_email_bcc"), // BCC recipients (comma-separated)
  emailSignature: text("email_signature"), // Custom email signature
  
  // Neue Felder für Beschreibung und Fotos
  shortDescription: text("short_description"), // Kurze Lieferantenbeschreibung
  description: text("description"), // Detaillierte Lieferantenbeschreibung
  photos: text("photos").array(), // Array von Foto-URLs
  
  // Preisanzeige in Bestellungen - Option für Lieferanten
  showPricesInOrders: boolean("show_prices_in_orders").default(true), // Standardmäßig Preise anzeigen
  
  // Bestellungseinstellungen
  hideOrderPrices: boolean("hide_order_prices").default(false), // E-Mails ohne EUR-Werte
  deliveryMethod: text("delivery_method").default("delivery"), // "delivery" or "pickup"
  
  // Bestellungs-Turnus Einstellungen
  orderFrequency: text("order_frequency"), // "weekly", "biweekly", "on_demand"
  orderWeekday: text("order_weekday"), // "monday", "tuesday", etc.
  
  // Lieferungs-/Abholungs-Turnus Einstellungen  
  deliveryFrequency: text("delivery_frequency"), // "weekly", "biweekly", "on_demand"
  deliveryWeekday: text("delivery_weekday"), // "monday", "tuesday", etc.
  
  // Zusätzliche Einkaufsbedingungen-Felder
  preferredDeliveryMethod: text("preferred_delivery_method"), // "delivery", "pickup", etc.
  orderPreferences: text("order_preferences"), // Zusätzliche Bestellpräferenzen
  deliveryPreferences: text("delivery_preferences"), // Zusätzliche Lieferpräferenzen
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupplierSchema = createInsertSchema(suppliers)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, "Lieferantenname ist erforderlich"),
    contactPerson: z.string().optional().nullable().or(z.literal("")),
    phone: z.string().optional().nullable().or(z.literal("")),
    email: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")),
    website: z.string().optional().nullable().or(z.literal("")),
    address: z.string().optional().nullable().or(z.literal("")),
    city: z.string().optional().nullable().or(z.literal("")),
    postalCode: z.string().optional().nullable().or(z.literal("")),
    country: z.string().optional().nullable().or(z.literal("")),
    notes: z.string().optional().nullable().or(z.literal("")),
    paymentTerms: z.string().optional().nullable().or(z.literal("")),
    deliveryTerms: z.string().optional().nullable().or(z.literal("")),
    deliveryDays: z.string().optional().nullable().or(z.literal("")),
    taxId: z.string().optional().nullable().or(z.literal("")),
    accountNumber: z.string().optional().nullable().or(z.literal("")),
    bankDetails: z.string().optional().nullable().or(z.literal("")),
    // Email template fields
    emailTemplate: z.string().optional().nullable().or(z.literal("")),
    emailSubjectTemplate: z.string().optional().nullable().or(z.literal("")),
    orderEmailRecipient: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")),
    orderEmailCc: z.string().optional().nullable().or(z.literal("")),
    orderEmailBcc: z.string().optional().nullable().or(z.literal("")),
    emailSignature: z.string().optional().nullable().or(z.literal("")),
    shortDescription: z.string().optional().nullable().or(z.literal("")),
    description: z.string().optional().nullable().or(z.literal("")),
    photos: z.array(z.string()).optional().nullable(),
    hideOrderPrices: z.boolean().optional(),
    deliveryMethod: z.string().optional().nullable().or(z.literal("")),
    orderFrequency: z.string().optional().nullable().or(z.literal("")),
    orderWeekday: z.string().optional().nullable().or(z.literal("")),
    deliveryFrequency: z.string().optional().nullable().or(z.literal("")),
    deliveryWeekday: z.string().optional().nullable().or(z.literal("")),
  });

export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

// Supplier Email Templates table
export const supplierEmailTemplates = pgTable("supplier_email_templates", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  templateName: text("template_name").notNull(),
  subjectTemplate: text("subject_template").notNull(),
  contentTemplate: text("content_template").notNull(),
  isDefault: boolean("is_default").default(false),
  templateType: text("template_type").default("standard"), // standard, urgent, reorder
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupplierEmailTemplateSchema = createInsertSchema(supplierEmailTemplates)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    templateName: z.string().min(1, "Vorlagenname ist erforderlich"),
    subjectTemplate: z.string().min(1, "Betreff-Vorlage ist erforderlich"),
    contentTemplate: z.string().min(1, "Inhalt-Vorlage ist erforderlich"),
  });

export type InsertSupplierEmailTemplate = z.infer<typeof insertSupplierEmailTemplateSchema>;
export type SupplierEmailTemplate = typeof supplierEmailTemplates.$inferSelect;

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  role: text("role").default("user"),
  approved: boolean("approved").default(false), // Standardmäßig nicht freigeschaltet
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  approved: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Wir verwenden ein In-Memory Token-Store statt einer Token-Tabelle für vereinfachte Implementierung

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

// Package Types table - Standardisierte Gebindearten
export const packageTypes = pgTable("package_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // z.B. "Karton", "Stiege", "Kasten", "Kiste"
  description: text("description"), // Beschreibung der Gebindeart
  isActive: boolean("is_active").default(true), // Kann deaktiviert werden
  sortOrder: integer("sort_order").default(0), // Sortierreihenfolge
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPackageTypeSchema = createInsertSchema(packageTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPackageType = z.infer<typeof insertPackageTypeSchema>;
export type PackageType = typeof packageTypes.$inferSelect;

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
  // Lieferanten-Informationen
  supplierId: integer("supplier_id").references(() => suppliers.id),
  supplierName: text("supplier_name"),
  supplierSku: text("supplier_sku"),
  // Neue Zusatzfelder für Lieferanten-Details
  articleSupplier: text("article_supplier"),      // Artikelnummer des Lieferanten
  packageSize: text("package_size"),              // Gebindegröße, z.B. "6x0,5L" oder "24x330ml" (Legacy)
  shelfLifeDays: integer("shelf_life_days"),      // MHD-Haltbarkeit in Tagen ab Lieferung
  minOrderQuantity: integer("min_order_quantity"), // Mindestbestellmenge
  
  // Neue strukturierte Gebinde-Felder
  packageTypeId: integer("package_type_id").references(() => packageTypes.id), // Verweis auf Gebindeart
  packageQuantity: integer("package_quantity").default(1), // Anzahl Einzelprodukte pro Gebinde
  baseUnitName: text("base_unit_name").default("Stück"), // Name der Grundeinheit (Stück, Liter, kg, etc.)
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
  // Eco-Impact Tracking Fields
  carbonFootprint: real("carbon_footprint"), // CO2 equivalent in kg per unit
  waterUsage: real("water_usage"), // Water usage in liters per unit
  packagingType: text("packaging_type"), // glass, plastic, aluminum, biodegradable, etc.
  packagingRecyclable: boolean("packaging_recyclable"),
  transportDistance: real("transport_distance"), // Distance in km from producer
  isOrganic: boolean("is_organic"),
  isLocal: boolean("is_local"), // Within 50km radius
  isVegan: boolean("is_vegan"),
  isVegetarian: boolean("is_vegetarian"),
  isAlcoholic: boolean("isAlcoholic"), // Enthält Alkohol
  sustainabilityScore: real("sustainability_score"), // 0-100 calculated score
  certifications: text("certifications"), // JSON array: ["bio", "fairtrade", "regional"]
  
  // Neue Felder für Beschreibung, Inhaltsstoffe und Allergene
  shortDescription: text("short_description"), // Kurze Produktbeschreibung
  ingredients: text("ingredients"), // Inhaltsstoffe als Text
  allergens: text("allergens"), // Allergene als Text
  nutritionalInfo: text("nutritional_info"), // Nährwertangaben als JSON string
  photos: text("photos").array(), // Array von Foto-URLs
  photoUrl: text("photo_url"), // Haupt-Foto URL für einfachen Zugriff
  
  // Keep the full JSON for reference and backward compatibility
  additionalData: text("additional_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    productName: z.string().min(1, "Produktname ist erforderlich"),
    shortDescription: z.string().optional().nullable().or(z.literal("")),
    ingredients: z.string().optional().nullable().or(z.literal("")),
    allergens: z.string().optional().nullable().or(z.literal("")),
    nutritionalInfo: z.string().optional().nullable().or(z.literal("")),
    photos: z.array(z.string()).optional().nullable(),
  });

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Eco Impact Tracking table - for detailed environmental impact data
export const ecoImpacts = pgTable("eco_impacts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  
  // Carbon footprint breakdown
  productionCo2: real("production_co2"), // kg CO2 from production
  transportCo2: real("transport_co2"), // kg CO2 from transport
  packagingCo2: real("packaging_co2"), // kg CO2 from packaging
  totalCo2: real("total_co2"), // Total carbon footprint
  
  // Water usage breakdown
  productionWater: real("production_water"), // liters for production
  packagingWater: real("packaging_water"), // liters for packaging
  totalWater: real("total_water"), // Total water usage
  
  // Packaging details
  packagingWeight: real("packaging_weight"), // grams
  packagingMaterial: text("packaging_material"), // detailed material description
  recycleInstructions: text("recycle_instructions"),
  
  // Supply chain
  producerName: text("producer_name"),
  producerLocation: text("producer_location"),
  originCountry: text("origin_country"),
  distributionCo2: real("distribution_co2"),
  
  // Certifications and standards
  certificationDetails: text("certification_details"), // JSON with certification info
  sustainabilityRating: text("sustainability_rating"), // A, B, C, D rating
  
  // Lifecycle data
  shelfLifeImpact: real("shelf_life_impact"), // Environmental cost of waste
  endOfLifeOptions: text("end_of_life_options"), // recycling, composting options
  
  // Metadata
  dataSource: text("data_source"), // where data came from
  lastVerified: timestamp("last_verified"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEcoImpactSchema = createInsertSchema(ecoImpacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEcoImpact = z.infer<typeof insertEcoImpactSchema>;
export type EcoImpact = typeof ecoImpacts.$inferSelect;

// User Eco Choices tracking table - for tracking user sustainable choices
export const userEcoChoices = pgTable("user_eco_choices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  
  // Choice tracking
  transactionId: integer("transaction_id").references(() => transactions.id),
  productId: integer("product_id").references(() => products.id),
  machineId: integer("machine_id").references(() => machines.id),
  
  // Impact metrics for this choice
  co2Saved: real("co2_saved"), // compared to average alternative
  waterSaved: real("water_saved"), // compared to average alternative
  wasteReduced: real("waste_reduced"), // packaging waste reduced
  
  // Choice context
  alternativeProducts: text("alternative_products"), // JSON array of alternatives shown
  choiceReason: text("choice_reason"), // eco, price, taste, etc.
  sustainabilityBonus: real("sustainability_bonus"), // points/discount earned
  
  // Metadata
  choiceDate: timestamp("choice_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserEcoChoiceSchema = createInsertSchema(userEcoChoices).omit({
  id: true,
  createdAt: true,
});

export type InsertUserEcoChoice = z.infer<typeof insertUserEcoChoiceSchema>;
export type UserEcoChoice = typeof userEcoChoices.$inferSelect;

// Product Categories table - für vordefinierte Kategorien
export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductCategorySchema = createInsertSchema(productCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type ProductCategory = typeof productCategories.$inferSelect;

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
  paymentType: text("payment_type"),                           // Zahlungstyp (für Legacy-Kompatibilität)
  
  // Metadaten
  source: text("source").default("vendon"),                   // Quelle der Daten (REALTIME, etc.)
  transactionData: text("transaction_data"),                  // Zusätzliche Transaktionsdaten
  note: text("note"),                                         // Notizen
  metadata: text("metadata"),                                 // Metadaten
  extraData: text("extra_data"),                              // Zusätzliche Daten (für Legacy-Kompatibilität)
  amount: real("amount"),                                      // Betrag (für Legacy-Kompatibilität)
  
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
  
  // ===== SAISONALE PROGNOSE-FELDER (Phase 2) =====
  // Kalender-Kontextfelder für saisonale Analyse
  weekOfYear: integer("week_of_year"),                        // Kalenderwoche (1-53)
  dayOfYear: integer("day_of_year"),                          // Tag des Jahres (1-366)
  monthOfYear: integer("month_of_year"),                      // Monat des Jahres (1-12)
  quarterOfYear: integer("quarter_of_year"),                  // Quartal des Jahres (1-4)
  weekdayNumber: integer("weekday_number"),                   // Wochentag (1=Montag, 7=Sonntag)
  season: text("season"),                                     // Jahreszeit: spring, summer, autumn, winter
  
  // Feiertags- und Ferienkontext
  isHoliday: boolean("is_holiday").default(false),           // Ist ein Feiertag
  holidayName: text("holiday_name"),                          // Name des Feiertags
  holidayType: text("holiday_type"),                          // Art des Feiertags (national, regional, religious)
  isVacation: boolean("is_vacation").default(false),         // Sind Schulferien
  vacationType: text("vacation_type"),                        // Art der Ferien (summer, winter, easter, etc.)
  isBridgeDay: boolean("is_bridge_day").default(false),      // Ist ein Brückentag
  
  // Wetter-Kontext (zur Analyse von Wettereinflüssen)
  weatherCondition: text("weather_condition"),               // Wetterbedingung (sunny, rainy, cloudy, etc.)
  temperature: real("temperature"),                           // Temperatur in Celsius
  humidity: real("humidity"),                                 // Luftfeuchtigkeit in %
  precipitation: real("precipitation"),                       // Niederschlag in mm
  windSpeed: real("wind_speed"),                              // Windgeschwindigkeit in km/h
  
  // Event- und Sonderkontext
  eventType: text("event_type"),                              // Besondere Events (festival, market, tourist_season)
  touristSeason: boolean("tourist_season").default(false),   // Ist Touristen-Hochsaison
  schoolInSession: boolean("school_in_session").default(true), // Sind Schulen geöffnet
  
  // Saisonale Enrichment-Metadaten
  seasonalEnrichmentSource: text("seasonal_enrichment_source"), // Quelle der saisonalen Daten
  seasonalEnrichmentDate: timestamp("seasonal_enrichment_date"), // Wann wurden saisonale Daten hinzugefügt
  
  // ===== KOSTEN- UND PROFITABILITÄTS-TRACKING =====
  // Resource-efficient cost calculation fields for immediate evaluation
  unitCost: real("unit_cost"),                                // Kalkulierte Einkaufskosten pro Stück
  totalCost: real("total_cost"),                              // Gesamte Einkaufskosten für diese Transaktion
  supplierDiscountApplied: real("supplier_discount_applied"), // Angewandter Lieferantenrabatt in %
  purchaseConditionId: integer("purchase_condition_id").references(() => purchaseConditions.id), // Verwendete Einkaufsbedingung
  costCalculatedAt: timestamp("cost_calculated_at"),          // Wann wurden die Kosten berechnet
  costCalculationStatus: text("cost_calculation_status").default("pending"), // Status: pending, calculated, fallback
  grossProfit: real("gross_profit"),                          // Bruttogewinn (Umsatz - Kosten)
  profitMargin: real("profit_margin"),                        // Gewinnmarge in %
  
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

// Events table based on vendon_events - erweitert für vollständige API-Abdeckung
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  
  // Basis-Identifikatoren
  vendonId: text("vendon_id").notNull(), // Event ID aus der Vendon API
  
  // Event-Informationen
  eventType: text("event_type"), // Typ des Events
  eventName: text("event_name"), // Name des Events
  baseCode: text("base_code"), // Basis-Code des Events
  originalCode: text("original_code"), // Original-Code des Events
  description: text("description"), // Beschreibung des Events
  name: text("name"), // Event-Name (zusätzlich zu eventName)
  
  // Maschinen-Bezug
  machineId: integer("machine_id").references(() => machines.id),
  machineName: text("machine_name"),
  vendonMachineId: text("vendon_machine_id"), // Original Vendon Machine ID
  
  // Zeitstempel
  eventDatetime: timestamp("event_datetime"), // Zeitpunkt des Events
  receivedAt: timestamp("received_at"), // Wann wurde das Event empfangen
  resolvedAt: timestamp("resolved_at"), // Wann wurde das Event gelöst
  datetime: timestamp("datetime").notNull(), // Haupt-Zeitstempel (für Kompatibilität)
  
  // Status und Zustand
  state: text("state"), // Event-Status (resolved, info, active, unknown)
  status: text("status"), // Allgemeiner Status
  active: text("active"), // Ist das Event aktiv (Y/N)
  ignored: boolean("ignored").default(false), // Ist das Event ignoriert
  
  // Dauer und Metriken
  duration: integer("duration"), // Dauer des Events in Sekunden
  
  // Kategorisierung
  severity: text("severity"), // Schweregrad des Events
  priority: text("priority"), // Priorität des Events
  category: text("category"), // Kategorie des Events
  
  // Tags und Kennzeichnungen
  eventTags: text("event_tags"), // Event-Tags als JSON-Array
  machineTags: text("machine_tags"), // Maschinen-Tags als JSON-Array
  
  // Standort-Informationen
  locationId: integer("location_id").references(() => locations.id),
  locationName: text("location_name"),
  locationType: text("location_type"),
  
  // Client/Account-Informationen
  clientId: integer("client_id"),
  clientName: text("client_name"),
  warehouseId: integer("warehouse_id"),
  warehouseName: text("warehouse_name"),
  
  // Technische Details
  telemetryUnitId: integer("telemetry_unit_id"),
  sensorData: text("sensor_data"), // Sensor-Daten als JSON
  
  // Zusatzdaten und Metadaten
  extraData: text("extra_data"), // Zusätzliche Daten aus der API
  rawApiData: text("raw_api_data"), // Vollständige API-Antwort als JSON
  
  // Verarbeitungs-Tracking
  syncedAt: timestamp("synced_at").defaultNow(),
  lastSync: timestamp("last_sync"),
  processedAt: timestamp("processed_at"),
  processingStatus: text("processing_status").default("pending"),
  processingError: text("processing_error"),
  
  // Datensatz-Tracking
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    vendonIdx: unique().on(table.vendonId), // Eindeutiger Index auf Vendon Event ID
    machineEventIdx: unique().on(table.vendonMachineId, table.eventDatetime), // Index für Maschine + Zeit
  };
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Stock table - Tabelle für Lagerbestand und Produkte im Lager
export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  vendonId: text("vendon_id").notNull(),        // Vendon Stock ID
  productName: text("product_name").notNull(),  // Produktname
  sku: text("sku"),                            // Artikelnummer
  barcode: text("barcode"),                    // Barcode
  price: real("price"),                         // Preis
  vat: real("vat"),                             // Mehrwertsteuer
  status: text("status").default("active"),     // Status
  units: text("units"),                         // Einheiten
  warehouseLocation: text("warehouse_location"), // Lagerort
  description: text("description"),             // Beschreibung
  productType: text("product_type"),            // Produkttyp
  // Machine defaults
  amountMax: integer("amount_max"),             // Maximale Menge
  amountStandard: integer("amount_standard"),   // Standardmenge
  amountCritical: integer("amount_critical"),   // Kritische Menge
  refillUnitSize: integer("refill_unit_size"),  // Größe der Nachfülleinheit
  minRefill: integer("min_refill"),             // Mindestmenge für Nachfüllung
  // Speichere alle Rohdaten als JSON
  rawData: text("raw_data"),                    // Alle Rohdaten der API-Antwort
  lastSync: timestamp("last_sync"),             // Letzte Synchronisation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    vendonIdx: unique().on(table.vendonId),     // Eindeutiger Index auf Vendon-ID
  };
});

export const insertStockSchema = createInsertSchema(stocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStock = z.infer<typeof insertStockSchema>;
export type Stock = typeof stocks.$inferSelect;

// Machine Stock table - Tabelle für den aktuellen Lagerbestand in den Automaten
export const machineStocks = pgTable("machine_stocks", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").references(() => machines.id).notNull(), // Maschinen-ID
  machineVendonId: text("machine_vendon_id").notNull(),         // Vendon Maschinen-ID
  productVendonId: text("product_vendon_id"),                   // Vendon Produkt-ID
  selectionNumber: text("selection_number"),                    // Auswahlnummer in der Maschine
  quantity: integer("quantity").default(0),                      // Aktuelle Menge
  maxQuantity: integer("max_quantity").default(0),               // Maximale Menge (wird bei Nachfüllung erkannt)
  status: text("status").default("active"),                      // Status
  lastFilled: timestamp("last_filled"),                          // Letzte Auffüllung
  // MHD-System: FIFO-Tracking
  expiryDate: date("expiry_date"),                               // MHD von inventory_batches übertragen
  batchId: integer("batch_id").references(() => inventoryBatches.id), // Referenz zur ursprünglichen Charge
  receivedDate: timestamp("received_date"),                      // Wann in Automat eingefüllt (für FIFO)
  // Speichere alle Rohdaten als JSON
  rawData: text("raw_data"),                                     // Alle Rohdaten der API-Antwort
  lastSync: timestamp("last_sync"),                              // Letzte Synchronisation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Maschine + Produkt + Auswahl
    uniqueSelection: unique().on(table.machineId, table.productVendonId, table.selectionNumber),
  };
});

export const insertMachineStockSchema = createInsertSchema(machineStocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMachineStock = z.infer<typeof insertMachineStockSchema>;
export type MachineStock = typeof machineStocks.$inferSelect;

// Note: The sync_logs table is already defined at the top of the file

// Define relations
export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  purchaseConditions: many(purchaseConditions),
  supplierDiscountConditions: many(supplierDiscountConditions),
}));

// Purchase Conditions Tabelle - Beziehungen zwischen Produkten und Lieferanten
export const purchaseConditions = pgTable("purchase_conditions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  unitPrice: real("unit_price").notNull(),
  taxRate: real("tax_rate").default(19), // Standardmäßig 19% MwSt
  grossPrice: real("gross_price"), // Brutto-Preis (berechnet aus unitPrice und taxRate)
  minQuantity: integer("min_quantity").default(0),
  minQuantityUnit: text("min_quantity_unit").default("individual"), // "individual" oder "package" - Mindestmenge bezieht sich auf Einzelprodukte oder Gebinde
  packagingUnit: text("packaging_unit"), // Beschreibung der Verpackungseinheit (z.B. "Karton mit 6 Flaschen")
  packagingQuantity: integer("packaging_quantity").default(1), // Anzahl der Einheiten pro Verpackung
  depositPerUnit: real("deposit_per_unit").default(0), // Pfand je Artikel (steuerfrei)
  deliveryTime: text("delivery_time"), // Lieferzeit (z.B. "2-3 Tage")
  validFrom: timestamp("valid_from"), // Gültigkeit von
  validTo: timestamp("valid_to"), // Gültigkeit bis
  isPreferred: boolean("is_preferred").default(false), // Ist dies der bevorzugte Lieferant für dieses Produkt
  notes: text("notes"), // Notizen zu dieser Einkaufsbedingung
  leadTime: integer("lead_time"), // Vorlaufzeit in Tagen
  packagingType: text("packaging_type"), // Gebindeart (Karton, Kiste, etc.)
  supplierArticleNumber: text("supplier_article_number"), // Lieferanten-Artikelnummer
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Erstellung des Schemas für Einkaufsbedingungen mit Anpassung der Datumsfelder
export const insertPurchaseConditionSchema = createInsertSchema(purchaseConditions)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Erlaube sowohl Date-Objekte als auch ISO-Datums-Strings für validFrom
    validFrom: z.union([
      z.date(),
      z.string().transform((str) => new Date(str))
    ]).optional(),
    // Erlaube sowohl Date-Objekte als auch ISO-Datums-Strings für validTo
    validTo: z.union([
      z.date(),
      z.string().transform((str) => new Date(str))
    ]).optional(),
  });

export type InsertPurchaseCondition = z.infer<typeof insertPurchaseConditionSchema>;
export type PurchaseCondition = typeof purchaseConditions.$inferSelect;

// Supplier Discount Conditions Tabelle - Lieferantenspezifische Rabatt- und Nachlasslogik
export const supplierDiscountConditions = pgTable("supplier_discount_conditions", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Rabatttyp
  discountType: text("discount_type").notNull(), // 'volume_discount', 'cash_discount', 'quantity_scale', 'order_value'
  
  // Schwellenwerte
  thresholdQuantity: integer("threshold_quantity"), // Ab welcher Stückzahl
  thresholdAmount: real("threshold_amount"), // Ab welchem Bestellwert in EUR
  
  // Rabattkonditionen
  discountPercentage: real("discount_percentage"), // Rabatt in Prozent (z.B. 5.0 für 5%)
  discountAmount: real("discount_amount"), // Fester Rabattbetrag in EUR
  
  // Skonto-spezifische Felder
  paymentTermsDays: integer("payment_terms_days"), // Zahlungsziel in Tagen für Skonto
  skontoPercentage: real("skonto_percentage"), // Skonto-Prozentsatz (z.B. 2.0 für 2%)
  
  // Staffelpreise
  maxQuantity: integer("max_quantity"), // Bis zu welcher Menge gilt dieser Rabatt
  maxAmount: real("max_amount"), // Bis zu welchem Bestellwert gilt dieser Rabatt
  
  // Gültigkeit und Status
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  isActive: boolean("is_active").default(true),
  
  // Zusätzliche Bedingungen
  description: text("description"), // Beschreibung der Rabattbedingung
  minimumOrderQuantity: integer("minimum_order_quantity"), // Mindestbestellmenge für diesen Rabatt
  applicableProductCategories: text("applicable_product_categories"), // JSON Array von Kategorien
  excludedProductIds: text("excluded_product_ids"), // JSON Array von ausgeschlossenen Produkt-IDs
  
  // Kombinierbarkeit
  canCombineWithOtherDiscounts: boolean("can_combine_with_other_discounts").default(false),
  priority: integer("priority").default(0), // Priorität bei mehreren anwendbaren Rabatten
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupplierDiscountConditionSchema = createInsertSchema(supplierDiscountConditions)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    discountType: z.enum(['volume_discount', 'cash_discount', 'quantity_scale', 'order_value']),
    discountPercentage: z.number().min(0).max(100).optional(),
    discountAmount: z.number().min(0).optional(),
    thresholdQuantity: z.number().min(0).optional(),
    thresholdAmount: z.number().min(0).optional(),
    paymentTermsDays: z.number().min(0).optional(),
    skontoPercentage: z.number().min(0).max(100).optional(),
    validFrom: z.union([
      z.date(),
      z.string().transform((str) => new Date(str))
    ]).optional(),
    validTo: z.union([
      z.date(),
      z.string().transform((str) => new Date(str))
    ]).optional(),
  });

export type InsertSupplierDiscountCondition = z.infer<typeof insertSupplierDiscountConditionSchema>;
export type SupplierDiscountCondition = typeof supplierDiscountConditions.$inferSelect;

// Supplier Access Pins Tabelle - PIN-Verifizierung für Lieferantenzugriff
export const supplierAccessPins = pgTable("supplier_access_pins", {
  id: serial("id").primaryKey(),
  
  // Verknüpfung zur Bestellung und Lieferant
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  
  // PIN-Informationen
  pinCode: text("pin_code").notNull(), // Vierstelliger PIN-Code
  accessToken: text("access_token").notNull().unique(), // Eindeutiger Zugangstoken für URL
  
  // Gültigkeit und Status
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validUntil: timestamp("valid_until").notNull(),
  isActive: boolean("is_active").default(true),
  
  // Zugriffsverfolgung
  accessCount: integer("access_count").default(0), // Wie oft wurde der PIN verwendet
  lastAccessAt: timestamp("last_access_at"),
  createdByOrderNumber: text("created_by_order_number"), // Bestellnummer für Referenz
  
  // Session-Management
  sessionToken: text("session_token"), // Temporärer Session-Token nach erfolgreicher PIN-Eingabe
  sessionExpiresAt: timestamp("session_expires_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupplierAccessPinSchema = createInsertSchema(supplierAccessPins)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    accessCount: true,
    lastAccessAt: true,
  })
  .extend({
    pinCode: z.string().length(4, "PIN muss 4-stellig sein").regex(/^\d{4}$/, "PIN muss nur Zahlen enthalten"),
    validUntil: z.union([
      z.date(),
      z.string().transform((str) => new Date(str))
    ]),
  });

export type InsertSupplierAccessPin = z.infer<typeof insertSupplierAccessPinSchema>;
export type SupplierAccessPin = typeof supplierAccessPins.$inferSelect;

// Supplier Feedback Tabelle - Kommentarsystem für Lieferantenrückmeldungen
export const supplierFeedback = pgTable("supplier_feedback", {
  id: serial("id").primaryKey(),
  
  // Verknüpfung
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  accessPinId: integer("access_pin_id").references(() => supplierAccessPins.id, { onDelete: "set null" }),
  
  // Art der Rückmeldung
  feedbackType: text("feedback_type").notNull(), // 'supplier_data', 'product_data', 'order_data', 'general'
  entityType: text("entity_type"), // 'supplier', 'product', 'order'
  entityId: integer("entity_id"), // ID des betroffenen Objekts
  
  // Feldspezifische Rückmeldung
  fieldName: text("field_name"), // Name des Feldes (z.B. 'productName', 'address')
  currentValue: text("current_value"), // Aktueller Wert
  suggestedValue: text("suggested_value"), // Vorgeschlagener neuer Wert
  
  // Kommentar und Details
  comment: text("comment").notNull(), // Hauptkommentar des Lieferanten
  priority: text("priority").default("medium"), // 'low', 'medium', 'high'
  
  // Status-Tracking
  status: text("status").default("pending"), // 'pending', 'reviewed', 'implemented', 'rejected'
  adminResponse: text("admin_response"), // Antwort des Administrators
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  
  // Kontaktinformationen
  contactEmail: text("contact_email"), // E-Mail für Rückfragen
  contactPhone: text("contact_phone"), // Telefon für Rückfragen
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupplierFeedbackSchema = createInsertSchema(supplierFeedback)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    reviewedAt: true,
    reviewedBy: true,
  })
  .extend({
    feedbackType: z.enum(['supplier_data', 'product_data', 'order_data', 'general']),
    entityType: z.enum(['supplier', 'product', 'order']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['pending', 'reviewed', 'implemented', 'rejected']).optional(),
    comment: z.string().min(10, "Kommentar muss mindestens 10 Zeichen lang sein"),
    contactEmail: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal("")),
  });

export type InsertSupplierFeedback = z.infer<typeof insertSupplierFeedbackSchema>;
export type SupplierFeedback = typeof supplierFeedback.$inferSelect;

export const productsRelations = relations(products, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [products.supplierId],
    references: [suppliers.id],
  }),
  packageType: one(packageTypes, {
    fields: [products.packageTypeId],
    references: [packageTypes.id],
  }),
  purchaseConditions: many(purchaseConditions),
}));

export const packageTypesRelations = relations(packageTypes, ({ many }) => ({
  products: many(products),
}));

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

// Neue Tabelle für die Protokollierung von Refill-Batch-Bewegungen
export const refillBatchMovements = pgTable("refill_batch_movements", {
  id: serial("id").primaryKey(),
  refillId: integer("refill_id").references(() => refills.id).notNull(),
  refillDetailId: integer("refill_detail_id").references(() => refillDetails.id).notNull(),
  batchId: integer("batch_id").references(() => inventoryBatches.id).notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  batchNumber: text("batch_number").notNull(),
  expiryDate: date("expiry_date").notNull(),
  warehouseBefore: integer("warehouse_before").notNull(),
  warehouseAfter: integer("warehouse_after").notNull(),
  movementType: text("movement_type").default("REFILL").notNull(),
  status: text("status").default("completed").notNull(),
  performedBy: integer("performed_by").references(() => users.id),
  performedAt: timestamp("performed_at").defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRefillBatchMovementSchema = createInsertSchema(refillBatchMovements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRefillBatchMovement = z.infer<typeof insertRefillBatchMovementSchema>;
export type RefillBatchMovement = typeof refillBatchMovements.$inferSelect;

export const refillDetailsRelations = relations(refillDetails, ({ one, many }) => ({
  refill: one(refills, {
    fields: [refillDetails.refillId],
    references: [refills.id],
  }),
  batchMovements: many(refillBatchMovements),
  // Entfernt Relation zu product, da productId jetzt ein Text ist und kein direkter Verweis auf products.id mehr existiert
}));

// Relationen für refillBatchMovements definieren
export const refillBatchMovementsRelations = relations(refillBatchMovements, ({ one }) => ({
  refill: one(refills, {
    fields: [refillBatchMovements.refillId],
    references: [refills.id],
  }),
  refillDetail: one(refillDetails, {
    fields: [refillBatchMovements.refillDetailId],
    references: [refillDetails.id],
  }),
  batch: one(inventoryBatches, {
    fields: [refillBatchMovements.batchId],
    references: [inventoryBatches.id],
  }),
  warehouse: one(warehouses, {
    fields: [refillBatchMovements.warehouseId],
    references: [warehouses.id],
  }),
  product: one(products, {
    fields: [refillBatchMovements.productId],
    references: [products.id],
  }),
  performer: one(users, {
    fields: [refillBatchMovements.performedBy],
    references: [users.id],
  }),
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

// Stock- und MachineStock-Relationen
export const machineStocksRelations = relations(machineStocks, ({ one }) => ({
  machine: one(machines, {
    fields: [machineStocks.machineId],
    references: [machines.id],
  }),
}));

// Wetterdaten-Tabelle für historische und zukünftige Daten (Meteostat-basiert)
export const weatherData = pgTable("weather_data", {
  id: serial("id").primaryKey(),
  // Zeitstempel für den Datenpunkt
  timestamp: timestamp("timestamp").notNull(),
  // Datum (nur Tag)
  date: date("date").notNull(),
  // Stunde (0-23)
  hour: integer("hour").notNull(),
  // Temperatur in Celsius
  temp: real("temp"),
  // Gefühlte Temperatur in Celsius
  feels_like: real("feels_like"),
  // Minimale Temperatur
  temp_min: real("temp_min"),
  // Maximale Temperatur
  temp_max: real("temp_max"),
  // Druck auf Meereshöhe, hPa
  pressure: integer("pressure"),
  // Luftfeuchtigkeit, %
  humidity: integer("humidity"),
  // Windgeschwindigkeit, meter/sec
  wind_speed: real("wind_speed"),
  // Windrichtung, Grad (meteorologisch)
  wind_deg: integer("wind_deg"),
  // Windböe, m/s
  wind_gust: real("wind_gust"),
  // Wolkigkeit, %
  clouds: integer("clouds"),
  // Sichtweite, Meter
  visibility: integer("visibility"),
  // Niederschlagsmenge letzte Stunde, mm
  precipitation: real("precipitation"),
  // Regenvolumen letzte Stunde, mm
  rain_1h: real("rain_1h"),
  // Schneevolumen letzte Stunde, mm
  snow_1h: real("snow_1h"),
  // Wetterbedingung-ID
  weather_id: integer("weather_id"),
  // Wetterbedingung-Hauptkategorie
  weather_main: text("weather_main"),
  // Wetterbedingung-Beschreibung
  weather_description: text("weather_description"),
  // Wetterbedingung-Symbol
  weather_icon: text("weather_icon"),
  // Datenquelle (historisch, vorhersage, aktuell)
  source: text("source").notNull().default("historical"),
  // Station ID
  station_id: text("station_id"),
  // Station Name
  station_name: text("station_name"),
  // Land
  country: text("country"),
  // Weitere Metadaten im JSON-Format
  metadata: text("metadata"),
  // Synchronisations-Status
  sync_status: text("sync_status").default("pending"),
  // Zeitpunkt der Erstellung
  created_at: timestamp("created_at").defaultNow(),
  // Zeitpunkt der letzten Aktualisierung
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Datum, Stunde und Station
    datetimeIdx: unique().on(table.date, table.hour, table.station_id),
  };
});

export const insertWeatherDataSchema = createInsertSchema(weatherData).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertWeatherData = z.infer<typeof insertWeatherDataSchema>;
export type WeatherData = typeof weatherData.$inferSelect;

// Wettervorhersage-Tabelle (OpenWeather-basiert)
export const weatherForecasts = pgTable("weather_forecasts", {
  id: serial("id").primaryKey(),
  // Datum
  date: date("date").notNull(),
  // Stunde im Format "HH:00"
  hour: text("hour").notNull(),
  // Typ (current, forecast)
  type: text("type").notNull(),
  // Temperatur in Celsius
  temp: real("temp"),
  // Gefühlte Temperatur in Celsius
  feels_like: real("feels_like"),
  // Luftdruck auf Meereshöhe, hPa
  pressure: integer("pressure"),
  // Luftfeuchtigkeit, %
  humidity: integer("humidity"),
  // Taupunkt
  dew_point: real("dew_point"),
  // Wolkigkeit, %
  clouds: integer("clouds"),
  // UV-Index
  uvi: real("uvi"),
  // Sichtweite, Meter
  visibility: integer("visibility"),
  // Windgeschwindigkeit, m/s
  wind_speed: real("wind_speed"),
  // Windrichtung, Grad (meteorologisch)
  wind_deg: integer("wind_deg"),
  // Windböe, m/s
  wind_gust: real("wind_gust"),
  // Wetterbedingung-ID
  weather_id: integer("weather_id"),
  // Wetterbedingung-Hauptkategorie
  weather_main: text("weather_main"),
  // Wetterbedingung-Beschreibung
  weather_description: text("weather_description"),
  // Wetterbedingung-Symbol
  weather_icon: text("weather_icon"),
  // Niederschlagswahrscheinlichkeit (0-1)
  pop: real("pop"),
  // Regenvolumen letzte Stunde, mm
  rain_1h: real("rain_1h"),
  // Schneevolumen letzte Stunde, mm
  snow_1h: real("snow_1h"),
  // UNIX-Timestamp
  timestamp: integer("timestamp"),
  // Sonnenaufgang (UNIX-Timestamp)
  sunrise: integer("sunrise"),
  // Sonnenuntergang (UNIX-Timestamp)
  sunset: integer("sunset"),
  // Mondaufgang (UNIX-Timestamp)
  moonrise: integer("moonrise"),
  // Monduntergang (UNIX-Timestamp)
  moonset: integer("moonset"),
  // Mondphase (0-1)
  moon_phase: real("moon_phase"),
  // Datenquelle
  source: text("source").notNull(),
  // Breitengrad
  lat: real("lat"),
  // Längengrad
  lon: real("lon"),
  // Zeitzone
  timezone: text("timezone"),
  // Zeitzonenverschiebung in Sekunden
  timezone_offset: integer("timezone_offset"),
  // Weitere Metadaten im JSON-Format
  metadata: text("metadata"),
  // Zeitpunkt der Erstellung
  created_at: timestamp("created_at").defaultNow(),
  // Zeitpunkt der letzten Aktualisierung
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Datum, Stunde und Typ
    datetimeTypeIdx: unique().on(table.date, table.hour, table.type),
  };
});

export const insertWeatherForecastSchema = createInsertSchema(weatherForecasts).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertWeatherForecast = z.infer<typeof insertWeatherForecastSchema>;
export type WeatherForecast = typeof weatherForecasts.$inferSelect;

// Historische Wetterdaten-Tabelle (OpenWeather-basiert)
export const weatherHistorical = pgTable("weather_historical", {
  id: serial("id").primaryKey(),
  // Datum
  date: date("date").notNull(),
  // Stunde im Format "HH:00"
  hour: text("hour").notNull(),
  // Temperatur in Celsius
  temp: real("temp"),
  // Gefühlte Temperatur in Celsius
  feels_like: real("feels_like"),
  // Luftdruck auf Meereshöhe, hPa
  pressure: integer("pressure"),
  // Luftfeuchtigkeit, %
  humidity: integer("humidity"),
  // Taupunkt
  dew_point: real("dew_point"),
  // Wolkigkeit, %
  clouds: integer("clouds"),
  // Sichtweite, Meter
  visibility: integer("visibility"),
  // Windgeschwindigkeit, m/s
  wind_speed: real("wind_speed"),
  // Windrichtung, Grad (meteorologisch)
  wind_deg: integer("wind_deg"),
  // Windböe, m/s
  wind_gust: real("wind_gust"),
  // Wetterbedingung-ID
  weather_id: integer("weather_id"),
  // Wetterbedingung-Hauptkategorie
  weather_main: text("weather_main"),
  // Wetterbedingung-Beschreibung
  weather_description: text("weather_description"),
  // Wetterbedingung-Symbol
  weather_icon: text("weather_icon"),
  // Regenvolumen letzte Stunde, mm
  rain_1h: real("rain_1h"),
  // Schneevolumen letzte Stunde, mm
  snow_1h: real("snow_1h"),
  // UNIX-Timestamp
  timestamp: integer("timestamp"),
  // Sonnenaufgang (UNIX-Timestamp)
  sunrise: integer("sunrise"),
  // Sonnenuntergang (UNIX-Timestamp)
  sunset: integer("sunset"),
  // Datenquelle
  source: text("source").notNull(),
  // Breitengrad
  lat: real("lat"),
  // Längengrad
  lon: real("lon"),
  // Zeitzone
  timezone: text("timezone"),
  // Zeitzonenverschiebung in Sekunden
  timezone_offset: integer("timezone_offset"),
  // Weitere Metadaten im JSON-Format
  metadata: text("metadata"),
  // Zeitpunkt der Erstellung
  created_at: timestamp("created_at").defaultNow(),
  // Zeitpunkt der letzten Aktualisierung
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Datum und Stunde
    datetimeIdx: unique().on(table.date, table.hour),
  };
});

export const insertWeatherHistoricalSchema = createInsertSchema(weatherHistorical).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertWeatherHistorical = z.infer<typeof insertWeatherHistoricalSchema>;
export type WeatherHistorical = typeof weatherHistorical.$inferSelect;

// Feiertage- und Urlaube-Tabelle
// Erweiterte Kalendertage-Tabelle für tägliche Statusübersicht
export const calendarDays = pgTable("calendar_days", {
  id: serial("id").primaryKey(),
  // Datum des Kalendertags
  date: date("date").notNull(),
  // Wochentag als Zahl (1-7, wobei 1=Montag)
  day_of_week: integer("day_of_week").notNull(),
  // Wochentag als Name (z.B. "Montag", "Dienstag")
  day_name: text("day_name").notNull(),
  // Ist es ein Wochenendtag?
  is_weekend: boolean("is_weekend").notNull(),
  // Ist es ein Schulferientag?
  is_school_holiday: boolean("is_school_holiday").default(false),
  // Ist es ein gesetzlicher Feiertag?
  is_public_holiday: boolean("is_public_holiday").default(false),
  // Kategorisierung (normal, weekend, school_holiday, public_holiday)
  day_type: text("day_type").notNull(),
  // Bundesland (für Feiertags- und Ferienrelevanz)
  state: text("state").notNull(),
  // Name des Feiertags/Ferientags (falls zutreffend)
  holiday_name: text("holiday_name"),
  // Land (Standard: Deutschland)
  country: text("country").default("DE"),
  // Jahr
  year: integer("year").notNull(),
  // Monat (1-12)
  month: integer("month").notNull(),
  // Tag des Monats (1-31)
  day: integer("day").notNull(),
  // Kalenderwoche
  week: integer("week"),
  // Weitere Metadaten (für spezielle Ereignisse)
  metadata: text("metadata"),
  // Zeitpunkt der Erstellung
  created_at: timestamp("created_at").defaultNow(),
  // Zeitpunkt der letzten Aktualisierung
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Datum und Bundesland
    dateStateIdx: unique().on(table.date, table.state),
  };
});

// Neue Kalender-Übersicht Tabelle mit einer Spalte pro Bundesland
// Diese Tabelle zeigt für jeden Tag den Status in allen Bundesländern an
export const calendarOverview = pgTable("calendar_overview", {
  id: serial("id").primaryKey(),
  // Datum des Kalendertags
  date: date("date").notNull(),
  // Wochentag als Zahl (1-7, wobei 1=Montag)
  day_of_week: integer("day_of_week").notNull(),
  // Kalenderwoche des Jahres
  week_of_year: integer("week_of_year").notNull(),
  // Ist es ein Wochenendtag?
  is_weekend: boolean("is_weekend").notNull(),
  // Jahr
  year: integer("year").notNull(),
  // Monat (1-12)
  month: integer("month").notNull(),
  // Kalenderwoche
  week: integer("week"),
  
  // Status für jedes Bundesland
  // Baden-Württemberg
  bw_status: text("bw_status").default("WORKDAY"),
  bw_holiday_name: text("bw_holiday_name"),
  bw_is_school_holiday: boolean("bw_is_school_holiday").default(false),
  bw_is_public_holiday: boolean("bw_is_public_holiday").default(false),
  
  // Bayern
  by_status: text("by_status").default("WORKDAY"),
  by_holiday_name: text("by_holiday_name"),
  by_is_school_holiday: boolean("by_is_school_holiday").default(false),
  by_is_public_holiday: boolean("by_is_public_holiday").default(false),
  
  // Berlin
  be_status: text("be_status").default("WORKDAY"),
  be_holiday_name: text("be_holiday_name"),
  be_is_school_holiday: boolean("be_is_school_holiday").default(false),
  be_is_public_holiday: boolean("be_is_public_holiday").default(false),
  
  // Brandenburg
  bb_status: text("bb_status").default("WORKDAY"),
  bb_holiday_name: text("bb_holiday_name"),
  bb_is_school_holiday: boolean("bb_is_school_holiday").default(false),
  bb_is_public_holiday: boolean("bb_is_public_holiday").default(false),
  
  // Bremen
  hb_status: text("hb_status").default("WORKDAY"),
  hb_holiday_name: text("hb_holiday_name"),
  hb_is_school_holiday: boolean("hb_is_school_holiday").default(false),
  hb_is_public_holiday: boolean("hb_is_public_holiday").default(false),
  
  // Hamburg
  hh_status: text("hh_status").default("WORKDAY"),
  hh_holiday_name: text("hh_holiday_name"),
  hh_is_school_holiday: boolean("hh_is_school_holiday").default(false),
  hh_is_public_holiday: boolean("hh_is_public_holiday").default(false),
  
  // Hessen
  he_status: text("he_status").default("WORKDAY"),
  he_holiday_name: text("he_holiday_name"),
  he_is_school_holiday: boolean("he_is_school_holiday").default(false),
  he_is_public_holiday: boolean("he_is_public_holiday").default(false),
  
  // Mecklenburg-Vorpommern
  mv_status: text("mv_status").default("WORKDAY"),
  mv_holiday_name: text("mv_holiday_name"),
  mv_is_school_holiday: boolean("mv_is_school_holiday").default(false),
  mv_is_public_holiday: boolean("mv_is_public_holiday").default(false),
  
  // Niedersachsen
  ni_status: text("ni_status").default("WORKDAY"),
  ni_holiday_name: text("ni_holiday_name"),
  ni_is_school_holiday: boolean("ni_is_school_holiday").default(false),
  ni_is_public_holiday: boolean("ni_is_public_holiday").default(false),
  
  // Nordrhein-Westfalen
  nw_status: text("nw_status").default("WORKDAY"),
  nw_holiday_name: text("nw_holiday_name"),
  nw_is_school_holiday: boolean("nw_is_school_holiday").default(false),
  nw_is_public_holiday: boolean("nw_is_public_holiday").default(false),
  
  // Rheinland-Pfalz
  rp_status: text("rp_status").default("WORKDAY"),
  rp_holiday_name: text("rp_holiday_name"),
  rp_is_school_holiday: boolean("rp_is_school_holiday").default(false),
  rp_is_public_holiday: boolean("rp_is_public_holiday").default(false),
  
  // Saarland
  sl_status: text("sl_status").default("WORKDAY"),
  sl_holiday_name: text("sl_holiday_name"),
  sl_is_school_holiday: boolean("sl_is_school_holiday").default(false),
  sl_is_public_holiday: boolean("sl_is_public_holiday").default(false),
  
  // Sachsen
  sn_status: text("sn_status").default("WORKDAY"),
  sn_holiday_name: text("sn_holiday_name"),
  sn_is_school_holiday: boolean("sn_is_school_holiday").default(false),
  sn_is_public_holiday: boolean("sn_is_public_holiday").default(false),
  
  // Sachsen-Anhalt
  st_status: text("st_status").default("WORKDAY"),
  st_holiday_name: text("st_holiday_name"),
  st_is_school_holiday: boolean("st_is_school_holiday").default(false),
  st_is_public_holiday: boolean("st_is_public_holiday").default(false),
  
  // Schleswig-Holstein
  sh_status: text("sh_status").default("WORKDAY"),
  sh_holiday_name: text("sh_holiday_name"),
  sh_is_school_holiday: boolean("sh_is_school_holiday").default(false),
  sh_is_public_holiday: boolean("sh_is_public_holiday").default(false),
  
  // Thüringen
  th_status: text("th_status").default("WORKDAY"),
  th_holiday_name: text("th_holiday_name"),
  th_is_school_holiday: boolean("th_is_school_holiday").default(false),
  th_is_public_holiday: boolean("th_is_public_holiday").default(false),
  
  // Zeitpunkt der Erstellung
  created_at: timestamp("created_at").defaultNow(),
  // Zeitpunkt der letzten Aktualisierung
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Datum
    dateIdx: unique().on(table.date),
  };
});

export const insertCalendarDaySchema = createInsertSchema(calendarDays).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertCalendarDay = z.infer<typeof insertCalendarDaySchema>;
export type CalendarDay = typeof calendarDays.$inferSelect;

// Definiere Enum für Tagestypen
export enum DayType {
  WORKDAY = "WORKDAY",
  WEEKEND = "WEEKEND",
  SCHOOL_HOLIDAY = "SCHOOL_HOLIDAY",
  PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY"
}

export const insertCalendarOverviewSchema = createInsertSchema(calendarOverview).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertCalendarOverview = z.infer<typeof insertCalendarOverviewSchema>;
export type CalendarOverview = typeof calendarOverview.$inferSelect;

// Ursprüngliche Feiertags-Tabelle (beibehalten für Kompatibilität)
export const holidays = pgTable("holidays", {
  id: serial("id").primaryKey(),
  // Datum des Feiertags
  date: date("date").notNull(),
  // Name des Feiertags
  name: text("name").notNull(),
  // Beschreibung
  description: text("description"),
  // Art des Feiertags (federal, state, regional, school, public)
  type: text("type").notNull(),
  // Ist es ein offizieller Feiertag?
  is_official: boolean("is_official").default(true),
  // Land
  country: text("country").default("DE"),
  // Bundesland
  state: text("state"),
  // Region/Stadt (für lokale Feiertage)
  region: text("region"),
  // Jahr
  year: integer("year").notNull(),
  // Trimester (1-4)
  trimester: integer("trimester"),
  // Monat (1-12)
  month: integer("month").notNull(),
  // Tag (1-31)
  day: integer("day").notNull(),
  // Wochentag (1-7, wobei 1=Montag)
  weekday: integer("weekday"),
  // Name des Wochentags (z.B. "Montag", "Dienstag")
  weekday_name: text("weekday_name"),
  // Woche des Jahres (1-52)
  week: integer("week"),
  // Weitere Metadaten im JSON-Format
  metadata: text("metadata"),
  // Zeitpunkt der Erstellung
  created_at: timestamp("created_at").defaultNow(),
  // Zeitpunkt der letzten Aktualisierung
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Datum und Land/Staat
    dateRegionIdx: unique().on(table.date, table.country, table.state),
  };
});

export const insertHolidaySchema = createInsertSchema(holidays).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Holiday = typeof holidays.$inferSelect;

// Prognosemodell-Tabelle für zukünftige Verkäufe
export const forecastModels = pgTable("forecast_models", {
  id: serial("id").primaryKey(),
  // Name des Modells
  name: text("name").notNull(),
  // Beschreibung
  description: text("description"),
  // Modell-Typ (regression, time_series, machine_learning)
  model_type: text("model_type").notNull(),
  // Modell-Konfiguration im JSON-Format
  configuration: text("configuration").notNull(),
  // Trainings-Parameter im JSON-Format
  training_parameters: text("training_parameters"),
  // Trainings-Zeitraum Start
  training_period_start: date("training_period_start"),
  // Trainings-Zeitraum Ende
  training_period_end: date("training_period_end"),
  // Modell-Genauigkeit (0-1)
  accuracy: real("accuracy"),
  // Modell-Status (training, ready, deprecated)
  status: text("status").default("training"),
  // Basiert auf Maschinendaten?
  uses_machine_data: boolean("uses_machine_data").default(true),
  // Basiert auf Wetterdaten?
  uses_weather_data: boolean("uses_weather_data").default(true),
  // Basiert auf Urlaubsdaten?
  uses_holiday_data: boolean("uses_holiday_data").default(true),
  // Version des Modells
  version: text("version").default("1.0"),
  // Erstellt von
  created_by: text("created_by"),
  // Speicherort des Modells (Pfad oder URL)
  model_path: text("model_path"),
  // Erstellt am
  created_at: timestamp("created_at").defaultNow(),
  // Aktualisiert am
  updated_at: timestamp("updated_at").defaultNow(),
  // Zuletzt verwendet am
  last_used_at: timestamp("last_used_at"),
});

export const insertForecastModelSchema = createInsertSchema(forecastModels).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertForecastModel = z.infer<typeof insertForecastModelSchema>;
export type ForecastModel = typeof forecastModels.$inferSelect;

// Vorhersage-Tabelle für einzelne Prognosen
export const forecasts = pgTable("forecasts", {
  id: serial("id").primaryKey(),
  // Fremdschlüssel zum Modell
  model_id: integer("model_id").references(() => forecastModels.id).notNull(),
  // Datum der Vorhersage (für welches Datum gilt die Vorhersage)
  forecast_date: date("forecast_date").notNull(),
  // Stunde der Vorhersage (0-23, optional für stündliche Vorhersagen)
  forecast_hour: integer("forecast_hour"),
  // Fremdschlüssel zum Produkt
  product_id: text("product_id"), 
  // Fremdschlüssel zur Maschine
  machine_id: integer("machine_id").references(() => machines.id),
  // Standort-ID
  location_id: integer("location_id").references(() => locations.id),
  // Prognostizierte Menge
  predicted_quantity: real("predicted_quantity").notNull(),
  // Prognosegenauigkeit (0-1)
  confidence: real("confidence"),
  // Untere Grenze des Konfidenzintervalls
  lower_bound: real("lower_bound"),
  // Obere Grenze des Konfidenzintervalls
  upper_bound: real("upper_bound"),
  // Tatsächliche Menge (wird später gefüllt, wenn bekannt)
  actual_quantity: real("actual_quantity"),
  // Fehler (tatsächlich - vorhergesagt)
  error: real("error"),
  // Wetterinformationen für diesen Zeitpunkt (zusammengefasst)
  weather_summary: text("weather_summary"),
  // Ist es ein Feiertag/Urlaub?
  is_holiday: boolean("is_holiday").default(false),
  // Name des Feiertags/Urlaubs
  holiday_name: text("holiday_name"),
  // Feiertagstyp
  holiday_type: text("holiday_type"),
  // Zusätzliche Faktoren, die in die Vorhersage eingeflossen sind
  features: text("features"),
  // Erstellt am
  created_at: timestamp("created_at").defaultNow(),
  // Aktualisiert am
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertForecastSchema = createInsertSchema(forecasts).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertForecast = z.infer<typeof insertForecastSchema>;
export type Forecast = typeof forecasts.$inferSelect;

// Daten-Abdeckungs-Tabelle (für die Frontend-Anzeige der verfügbaren Daten)
export const dataCoverage = pgTable("data_coverage", {
  id: serial("id").primaryKey(),
  // Datentyp (weather, holiday, transaction)
  data_type: text("data_type").notNull(),
  // Frühestes verfügbares Datum
  earliest_date: date("earliest_date"),
  // Spätestes verfügbares Datum
  latest_date: date("latest_date"),
  // Anzahl der Datenpunkte
  data_points: integer("data_points").default(0),
  // Datenqualität (0-100%)
  data_quality: integer("data_quality"),
  // Abdeckung in Prozent (0-100%)
  coverage_percentage: integer("coverage_percentage"),
  // Letzte Synchronisation
  last_sync: timestamp("last_sync"),
  // Erstellt am
  created_at: timestamp("created_at").defaultNow(),
  // Aktualisiert am
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Datentyp
    dataTypeIdx: unique().on(table.data_type),
  };
});

export const insertDataCoverageSchema = createInsertSchema(dataCoverage).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertDataCoverage = z.infer<typeof insertDataCoverageSchema>;
export type DataCoverage = typeof dataCoverage.$inferSelect;

// Beziehungen für die neuen Tabellen
export const forecastModelsRelations = relations(forecastModels, ({ many }) => ({
  forecasts: many(forecasts),
}));

export const forecastsRelations = relations(forecasts, ({ one }) => ({
  model: one(forecastModels, {
    fields: [forecasts.model_id],
    references: [forecastModels.id],
  }),
  machine: one(machines, {
    fields: [forecasts.machine_id],
    references: [machines.id],
  }),
  location: one(locations, {
    fields: [forecasts.location_id],
    references: [locations.id],
  }),
}));

// ================================ Bestellungen ================================

// Bestellungen-Tabelle
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  
  // Allgemeine Bestellinformationen
  orderNumber: text("order_number").notNull(), // Bestellnummer (z.B. ORD-YYYY-MM-DD-XXXX)
  supplierId: integer("supplier_id").references(() => suppliers.id), // Lieferant
  supplierName: text("supplier_name"), // Name des Lieferanten (für Redundanz)
  
  // Ziel & Empfänger
  locationId: integer("location_id").references(() => locations.id), // Ziel-Lagerstandort
  locationName: text("location_name"), // Name des Standorts (für Redundanz)
  deliveryLocation: text("delivery_location"), // Überschreibbarer Lieferort (aus Stammdaten übernommen, aber änderbar)
  
  // Status und Termine
  status: text("status").notNull().default("open"), // Status: open, ordered, delivered, canceled, etc.
  orderDate: timestamp("order_date").notNull().defaultNow(), // Datum der Bestellung
  expectedDeliveryDate: timestamp("expected_delivery_date"), // Erwartetes Lieferdatum
  actualDeliveryDate: timestamp("actual_delivery_date"), // Tatsächliches Lieferdatum
  
  // Finanzen
  totalAmount: real("total_amount").notNull().default(0), // Gesamtbetrag
  currency: text("currency").default("EUR"), // Währung (EUR)
  vatAmount: real("vat_amount").default(0), // MwSt-Betrag
  discountAmount: real("discount_amount").default(0), // Rabattbetrag
  shippingCost: real("shipping_cost").default(0), // Versandkosten
  
  // Zahlungsinformationen
  paymentTerms: text("payment_terms"), // Zahlungsbedingungen
  paymentStatus: text("payment_status").default("pending"), // Zahlungsstatus: pending, paid, partial, etc.
  paymentDate: timestamp("payment_date"), // Zahlungsdatum
  paymentMethod: text("payment_method"), // Zahlungsmethode
  
  // Zuständigkeiten
  createdById: integer("created_by_id").references(() => users.id), // Erstellt von (Benutzer-ID)
  createdByName: text("created_by_name"), // Erstellt von (Name)
  lastModifiedById: integer("last_modified_by_id").references(() => users.id), // Zuletzt geändert von (Benutzer-ID)
  lastModifiedByName: text("last_modified_by_name"), // Zuletzt geändert von (Name)
  
  // Notizen und Kommentare
  notes: text("notes"), // Notizen zur Bestellung
  internalNotes: text("internal_notes"), // Interne Notizen
  
  // Dokumente
  documents: text("documents"), // Dokumente als JSON-Array (Pfade/URLs zu Bestellformularen, Lieferscheinen, etc.)
  
  // Statusverlauf
  statusHistory: text("status_history"), // Verlauf der Statusänderungen als JSON-Array
  
  // Audit
  createdAt: timestamp("created_at").notNull().defaultNow(), // Erstellungsdatum
  updatedAt: timestamp("updated_at").notNull().defaultNow(), // Aktualisierungsdatum
  
  // Lieferart und Adresse
  deliveryType: text("delivery_type").default("delivery"), // delivery (Anlieferung) oder pickup (Abholung)
  deliveryAddress: text("delivery_address"), // Vollständige Lieferadresse für Anlieferung
  pickupLocation: text("pickup_location"), // Abholort für Abholung
  
  // Automatisierung und Intelligenz
  isAutoGenerated: boolean("is_auto_generated").default(false), // Automatisch generierte Bestellung?
  forecastId: integer("forecast_id").references(() => forecastModels.id), // Referenz zur Prognose
  priority: text("priority").default("normal"), // Priorität: low, normal, high, urgent
  
  // Enhanced ordering process features
  showPricesInEmail: boolean("show_prices_in_email").default(true), // Steuerung der Preisanzeige in E-Mails
  forecastPeriodDays: integer("forecast_period_days").default(7), // Prognosezeitraum in Tagen (für Prognose-Bestellungen)
  emailContent: text("email_content"), // Anpassbare E-Mail-Inhalte vor dem Versenden
  cartData: text("cart_data"), // JSON-Daten des Warenkorbs für die Bestellung
  orderMode: text("order_mode").default("standard") // Bestellmodus: standard, forecast, copy
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalAmount: true // wird aus den Positionen berechnet
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Bestellpositionen-Tabelle
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  
  // Zuordnung zur Bestellung
  orderId: integer("order_id").notNull().references(() => orders.id), // Bestellungs-ID
  
  // Produkt-Informationen
  productId: integer("product_id").references(() => products.id), // Produkt-ID (kann null sein bei manuellen Einträgen)
  productName: text("product_name").notNull(), // Produktname (notwendig, auch wenn Produkt-ID vorhanden)
  sku: text("sku"), // Artikelnummer
  supplierSku: text("supplier_sku"), // Lieferanten-Artikelnummer
  orderArticleNumber: text("order_article_number"), // Bestellartikelnummer (wenn abweichend von SKU)
  
  // Gebinde-Informationen (Package Logic)
  packageTypeId: integer("package_type_id").references(() => packageTypes.id), // Verweis auf Gebindeart
  packageTypeName: text("package_type_name"), // Name der Gebindeart (z.B. "Kiste", "Karton", "Stiege")
  packageQuantity: integer("package_quantity").default(1), // Anzahl Einzelprodukte pro Gebinde
  baseUnitName: text("base_unit_name").default("Stück"), // Name der Grundeinheit (Stück, Liter, kg, etc.)
  packageCount: integer("package_count").default(1), // Anzahl bestellter Gebinde
  
  // Mengen
  quantity: integer("quantity").notNull().default(1), // Gesamtmenge (packageCount * packageQuantity)
  unit: text("unit").default("stk"), // Einheit (Legacy-Feld für Kompatibilität)
  quantityDelivered: integer("quantity_delivered").default(0), // Tatsächlich gelieferte Menge
  
  // Preise
  unitPrice: real("unit_price").notNull(), // Einzelpreis
  totalPrice: real("total_price").notNull(), // Gesamtpreis (Menge * Einzelpreis)
  vatRate: real("vat_rate").default(19), // MwSt-Satz (in Prozent)
  vatAmount: real("vat_amount"), // MwSt-Betrag
  discount: real("discount").default(0), // Rabatt (in Prozent)
  discountAmount: real("discount_amount").default(0), // Rabattbetrag

  // Position und Status
  positionNumber: integer("position_number"), // Position in der Bestellung (1, 2, 3, ...)
  status: text("status").default("pending"), // Status: pending, delivered, partial, backordered, etc.
  
  // Notizen
  notes: text("notes"), // Notizen zur Position
  itemComment: text("item_comment"), // Kommentar pro Position (für besondere Wünsche)
  deliveryComment: text("delivery_comment"), // Kommentar bei Lieferung
  
  // Lager und Maschinen
  targetMachineId: integer("target_machine_id").references(() => machines.id), // Ziel-Automat
  targetMachineName: text("target_machine_name"), // Name des Ziel-Automaten
  
  // Audit
  createdAt: timestamp("created_at").notNull().defaultNow(), // Erstellungsdatum
  updatedAt: timestamp("updated_at").notNull().defaultNow(), // Aktualisierungsdatum
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalPrice: true, // wird automatisch berechnet
  vatAmount: true, // wird automatisch berechnet
  discountAmount: true // wird automatisch berechnet
});

export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// Order - OrderItems Relation
export const orderRelations = relations(orders, ({ many, one }) => ({
  orderItems: many(orderItems),
  supplier: one(suppliers, {
    fields: [orders.supplierId],
    references: [suppliers.id],
  }),
  location: one(locations, {
    fields: [orders.locationId],
    references: [locations.id],
  }),
  creator: one(users, {
    fields: [orders.createdById],
    references: [users.id],
  }),
  lastModifier: one(users, {
    fields: [orders.lastModifiedById],
    references: [users.id],
  }),
  forecast: one(forecastModels, {
    fields: [orders.forecastId],
    references: [forecastModels.id],
  }),
}));

// OrderItem - Order Relation
export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  targetMachine: one(machines, {
    fields: [orderItems.targetMachineId],
    references: [machines.id],
  }),
}));

// Lager (Warehouses) table
export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country").default("Deutschland"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  isActive: boolean("is_active").default(true),
  status: text("status").default("active"),
  type: text("type").default("main"), // main, branch, temporary, etc.
  notes: text("notes"),
  locationId: integer("location_id").references(() => locations.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Warehouse = typeof warehouses.$inferSelect;

// Inventory Items table
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").default(0),
  minQuantity: integer("min_quantity").default(0),
  maxQuantity: integer("max_quantity"),
  reorderPoint: integer("reorder_point").default(0),
  reorderQuantity: integer("reorder_quantity"),
  locationInWarehouse: text("location_in_warehouse"),
  status: text("status").default("active"), // active, inactive, discontinued
  lastCountDate: timestamp("last_count_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    // Eindeutiger Index für Lager + Produkt Kombination
    uniqueProductWarehouse: unique().on(table.warehouseId, table.productId)
  };
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

// Produktchargen (Product Batches) table - verbesserte Tabelle für Chargen und MHD-Verwaltung
export const productBatches = pgTable("product_batches", {
  id: serial("id").primaryKey(),
  // Produkt- und Lagerinformationen
  productId: integer("product_id").notNull().references(() => products.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  
  // Chargeninformationen
  batchNumber: text("batch_number").notNull(), // Eindeutige Chargennummer innerhalb des Systems
  supplierBatchNumber: text("supplier_batch_number"), // Chargennummer des Lieferanten (optional)
  
  // Mengen und Bestand
  initialQuantity: integer("initial_quantity").notNull(), // Ursprüngliche Menge bei Eingang
  currentQuantity: integer("current_quantity").notNull(), // Aktuelle Menge nach Entnahmen
  
  // Zeitliche Informationen
  receivedDate: date("received_date").notNull().defaultNow(), // Eingangsdatum
  manufacturingDate: date("manufacturing_date"), // Herstellungsdatum
  expiryDate: date("expiry_date").notNull(), // Mindesthaltbarkeitsdatum
  
  // Zusätzliche Informationen
  orderId: integer("order_id").references(() => orders.id), // Bestellung, durch die die Charge eingegangen ist
  supplierId: integer("supplier_id").references(() => suppliers.id), // Lieferant
  
  // Status und Lagerort
  status: text("status").default("active").notNull(), // active, consumed, expired, quarantine, reserved
  locationInWarehouse: text("location_in_warehouse"), // Lagerort im Lager (Regal, Fach, etc.)
  notes: text("notes"), // Anmerkungen zur Charge
  
  // Metadaten
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    batchProductWarehouseIdx: unique().on(table.batchNumber, table.productId, table.warehouseId),
  };
});

export const insertProductBatchSchema = createInsertSchema(productBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductBatch = z.infer<typeof insertProductBatchSchema>;
export type ProductBatch = typeof productBatches.$inferSelect;

// Ursprüngliche Inventory Batches Tabelle für Kompatibilität beibehalten
export const inventoryBatches = pgTable("inventory_batches", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").default(0).notNull(),
  batchNumber: text("batch_number").notNull(), // Chargennummer
  expiryDate: date("expiry_date").notNull(), // MHD-Datum
  incomingDate: date("incoming_date").defaultNow().notNull(), // Eingangsdatum
  status: text("status").default("active").notNull(), // active, consumed, expired, quarantine
  supplierBatchNumber: text("supplier_batch_number"), // Charge des Lieferanten (optional)
  notes: text("notes"),
  locationInWarehouse: text("location_in_warehouse"), // Lagerort im Lager
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    batchProductWarehouseIdx: unique().on(table.batchNumber, table.productId, table.warehouseId),
  };
});

export const insertInventoryBatchSchema = createInsertSchema(inventoryBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryBatch = z.infer<typeof insertInventoryBatchSchema>;
export type InventoryBatch = typeof inventoryBatches.$inferSelect;

// Verbesserte Inventory Movements Tabelle mit Unterstützung für Produktchargen und Batch-basiertes Tracking
export const productMovements = pgTable("product_movements", {
  id: serial("id").primaryKey(),
  
  // Quelle und Ziel - jetzt flexible Zuordnung zu Lager oder Automat
  sourceType: text("source_type"), // "warehouse" oder "machine"
  sourceId: integer("source_id"),  // ID des Quell-Lagers oder -Automaten
  destinationType: text("destination_type"), // "warehouse" oder "machine"
  destinationId: integer("destination_id"), // ID des Ziel-Lagers oder -Automaten
  
  // Produkt- und Mengeninformationen
  productId: integer("product_id").notNull().references(() => products.id),
  productBatchId: integer("product_batch_id").references(() => productBatches.id), // Neue Tabelle für Produktchargen
  quantity: integer("quantity").notNull(),
  
  // Bewegungstyp und Referenz
  movementType: text("movement_type").notNull(), // IN, OUT, TRANSFER, ADJUSTMENT, REFILL
  referenceType: text("reference_type"), // ORDER, REFILL, INVENTORY_COUNT, MANUAL
  referenceId: text("reference_id"), // ID der Bestellung, Auffüllung, etc.
  
  // Bestandsdokumentation für Audit-Trail
  previousStock: integer("previous_stock"), // Vorheriger Lagerbestand
  currentStock: integer("current_stock"), // Aktueller Lagerbestand nach der Entnahme
  
  // Status und Metadaten
  status: text("status").default("completed"),
  notes: text("notes"),
  performedBy: integer("performed_by").references(() => users.id),
  performedAt: timestamp("performed_at").defaultNow(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductMovementSchema = createInsertSchema(productMovements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductMovement = z.infer<typeof insertProductMovementSchema>;
export type ProductMovement = typeof productMovements.$inferSelect;

// Ursprüngliche Tabelle für Kompatibilität beibehalten
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  sourceWarehouseId: integer("source_warehouse_id").references(() => warehouses.id),
  destinationWarehouseId: integer("destination_warehouse_id").references(() => warehouses.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  movementType: text("movement_type").notNull(), // IN, OUT, TRANSFER, ADJUSTMENT, REFILL, INTERNAL
  direction: text("direction"), // IN, OUT, INTERNAL
  referenceType: text("reference_type"), // ORDER, REFILL, INVENTORY_COUNT, MANUAL
  referenceId: text("reference_id"), // ID of the order, refill, etc.
  status: text("status").default("completed"),
  notes: text("notes"),
  performedBy: integer("performed_by").references(() => users.id),
  performedAt: timestamp("performed_at").defaultNow(),
  machineId: integer("machine_id").references(() => machines.id),
  
  // Neue Felder für Chargen- und MHD-Tracking
  batchId: integer("batch_id").references(() => inventoryBatches.id),
  batchNumber: text("batch_number"), // Kopie der Chargen-Nummer für einfache Abfragen
  expiryDate: date("expiry_date"),   // MHD-Datum für diese Bewegung
  
  // Neue Felder für interne Umlagerungen
  locationFrom: text("location_from"), // Ursprünglicher Lagerplatz innerhalb des Lagers
  locationTo: text("location_to"),     // Ziel-Lagerplatz innerhalb des Lagers
  previousStock: integer("previous_stock"), // Bestand vor der Bewegung
  currentStock: integer("current_stock"),   // Bestand nach der Bewegung
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;

// Inventory Count table
export const inventoryCounts = pgTable("inventory_counts", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  status: text("status").default("pending"), // pending, in_progress, completed, cancelled
  scheduledDate: timestamp("scheduled_date"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  initiatedBy: integer("initiated_by").references(() => users.id),
  completedBy: integer("completed_by").references(() => users.id),
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

// Inventory Count Items table
export const inventoryCountItems = pgTable("inventory_count_items", {
  id: serial("id").primaryKey(),
  inventoryCountId: integer("inventory_count_id").notNull().references(() => inventoryCounts.id),
  productId: integer("product_id").notNull().references(() => products.id),
  batchId: integer("batch_id").references(() => productBatches.id), // Hinzugefügt: Referenz zur Batch-Tabelle
  expectedQuantity: integer("expected_quantity").default(0),
  actualQuantity: integer("actual_quantity"),
  countedQuantity: integer("counted_quantity"), // Gezählte Menge, die vom Benutzer eingegeben wurde
  difference: integer("difference"),
  notes: text("notes"),
  status: text("status").default("pending"), // pending, counted, adjusted, skipped
  countedBy: integer("counted_by").references(() => users.id),
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

// Inventurchargen - Verbindet Inventurpositionen mit Chargen und MHD
export const inventoryCountBatches = pgTable("inventory_count_batches", {
  id: serial("id").primaryKey(),
  inventoryCountItemId: integer("inventory_count_item_id")
    .notNull()
    .references(() => inventoryCountItems.id),
  batchNumber: text("batch_number").notNull(),
  expiryDate: date("expiry_date"), // MHD-Datum (optional)
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  status: text("status").default("pending"), // pending, counted, adjusted, transferred
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventoryCountBatchSchema = createInsertSchema(inventoryCountBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryCountBatch = z.infer<typeof insertInventoryCountBatchSchema>;
export type InventoryCountBatch = typeof inventoryCountBatches.$inferSelect;

// Machine-Warehouse Assignment table
export const machineWarehouseAssignments = pgTable("machine_warehouse_assignments", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull().references(() => machines.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  isPrimary: boolean("is_primary").default(true),
  notes: text("notes"),
  assignedBy: integer("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
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

// Define relations
export const warehouseRelations = relations(warehouses, ({ one, many }) => ({
  location: one(locations, {
    fields: [warehouses.locationId],
    references: [locations.id],
  }),
  inventoryItems: many(inventoryItems),
  inventoryBatches: many(inventoryBatches),
  machineAssignments: many(machineWarehouseAssignments),
  disposals: many(productDisposals),
}));

export const inventoryItemRelations = relations(inventoryItems, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [inventoryItems.warehouseId],
    references: [warehouses.id],
  }),
  product: one(products, {
    fields: [inventoryItems.productId],
    references: [products.id],
  }),
  movements: many(inventoryMovements),
}));

// Neue Relationen für inventoryBatches
export const inventoryBatchRelations = relations(inventoryBatches, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [inventoryBatches.warehouseId],
    references: [warehouses.id],
  }),
  product: one(products, {
    fields: [inventoryBatches.productId],
    references: [products.id],
  }),
  movements: many(inventoryMovements, { relationName: "batch_movements" }),
}));

export const inventoryMovementRelations = relations(inventoryMovements, ({ one }) => ({
  sourceWarehouse: one(warehouses, {
    fields: [inventoryMovements.sourceWarehouseId],
    references: [warehouses.id],
    relationName: "source_warehouse",
  }),
  destinationWarehouse: one(warehouses, {
    fields: [inventoryMovements.destinationWarehouseId],
    references: [warehouses.id],
    relationName: "destination_warehouse",
  }),
  product: one(products, {
    fields: [inventoryMovements.productId],
    references: [products.id],
  }),
  machine: one(machines, {
    fields: [inventoryMovements.machineId],
    references: [machines.id],
  }),
  batch: one(inventoryBatches, {
    fields: [inventoryMovements.batchId],
    references: [inventoryBatches.id],
    relationName: "batch_movements",
  }),
}));

export const machineWarehouseAssignmentRelations = relations(machineWarehouseAssignments, ({ one }) => ({
  machine: one(machines, {
    fields: [machineWarehouseAssignments.machineId],
    references: [machines.id],
  }),
  warehouse: one(warehouses, {
    fields: [machineWarehouseAssignments.warehouseId],
    references: [warehouses.id],
  }),
}));

export const inventoryCountRelations = relations(inventoryCounts, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [inventoryCounts.warehouseId],
    references: [warehouses.id],
  }),
  items: many(inventoryCountItems),
}));

export const inventoryCountItemRelations = relations(inventoryCountItems, ({ one, many }) => ({
  inventoryCount: one(inventoryCounts, {
    fields: [inventoryCountItems.inventoryCountId],
    references: [inventoryCounts.id],
  }),
  product: one(products, {
    fields: [inventoryCountItems.productId],
    references: [products.id],
  }),
  batch: one(productBatches, {
    fields: [inventoryCountItems.batchId],
    references: [productBatches.id],
  }),
  batches: many(inventoryCountBatches),
}));

export const inventoryCountBatchRelations = relations(inventoryCountBatches, ({ one }) => ({
  inventoryCountItem: one(inventoryCountItems, {
    fields: [inventoryCountBatches.inventoryCountItemId],
    references: [inventoryCountItems.id],
  }),
}));

// Product Disposals (Warenentnahme) schema
export const productDisposals = pgTable("product_disposals", {
  id: serial("id").primaryKey(),
  warehouseId: varchar("warehouse_id", { length: 50 }).notNull(), // ID des Lagers
  warehouseName: varchar("warehouse_name", { length: 255 }).notNull(), // Name des Lagers
  reason: varchar("reason", { length: 50 }).notNull(), // Grund der Entnahme (z.B. "expired", "damaged", "quality_issues")
  description: text("description"), // Optionale Beschreibung
  status: varchar("status", { length: 20 }).default("pending").notNull(), // Status (pending, completed, cancelled)
  createdById: integer("created_by_id"), // User ID, der die Entnahme erstellt hat
  createdByName: varchar("created_by_name", { length: 100 }), // Username, der die Entnahme erstellt hat
  completedAt: timestamp("completed_at"), // Wann wurde die Entnahme abgeschlossen
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productDisposalItems = pgTable("product_disposal_items", {
  id: serial("id").primaryKey(),
  disposalId: integer("disposal_id").notNull().references(() => productDisposals.id),
  productId: varchar("product_id", { length: 50 }).notNull(), // Produkt-ID
  productName: varchar("product_name", { length: 255 }).notNull(), // Produktname
  quantity: integer("quantity").notNull(), // Menge der entnommenen Produkte
  reason: varchar("reason", { length: 100 }), // Spezifischer Grund für dieses Produkt (optional)
  previousStock: integer("previous_stock"), // Vorheriger Lagerbestand
  currentStock: integer("current_stock"), // Aktueller Lagerbestand nach der Entnahme
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Disposals relations
export const productDisposalsRelations = relations(productDisposals, ({ many, one }) => ({
  items: many(productDisposalItems),
  warehouse: one(warehouses, {
    fields: [productDisposals.warehouseId],
    references: [warehouses.id],
  }),
}));

export const productDisposalItemsRelations = relations(productDisposalItems, ({ one }) => ({
  disposal: one(productDisposals, {
    fields: [productDisposalItems.disposalId],
    references: [productDisposals.id],
  }),
}));

// ---- INVENTORY TRANSFERS ----

// Inventory Transfers table
export const inventoryTransfers = pgTable("inventory_transfers", {
  id: serial("id").primaryKey(),
  sourceWarehouseId: integer("source_warehouse_id").notNull().references(() => warehouses.id),
  targetWarehouseId: integer("target_warehouse_id").notNull().references(() => warehouses.id),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  notes: varchar("notes", { length: 500 }),
  createdBy: integer("created_by"),
  completedAt: timestamp("completed_at"), // Wann wurde die Umlagerung abgeschlossen
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Inventory Transfer Items table
export const inventoryTransferItems = pgTable("inventory_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull().references(() => inventoryTransfers.id),
  productId: integer("product_id").notNull().references(() => products.id), 
  productName: varchar("product_name", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull(),
  reason: varchar("reason", { length: 100 }),
  previousSourceStock: integer("previous_source_stock"),
  currentSourceStock: integer("current_source_stock"),
  previousTargetStock: integer("previous_target_stock"),
  currentTargetStock: integer("current_target_stock"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Inventory Transfers relations
export const inventoryTransfersRelations = relations(inventoryTransfers, ({ many, one }) => ({
  items: many(inventoryTransferItems),
  sourceWarehouse: one(warehouses, {
    fields: [inventoryTransfers.sourceWarehouseId],
    references: [warehouses.id],
  }),
  targetWarehouse: one(warehouses, {
    fields: [inventoryTransfers.targetWarehouseId],
    references: [warehouses.id],
  }),
}));

export const inventoryTransferItemsRelations = relations(inventoryTransferItems, ({ one }) => ({
  transfer: one(inventoryTransfers, {
    fields: [inventoryTransferItems.transferId],
    references: [inventoryTransfers.id],
  }),
}));

// Insert schemas for inventory transfers
export const insertInventoryTransferSchema = createInsertSchema(inventoryTransfers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertInventoryTransferItemSchema = createInsertSchema(inventoryTransferItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  previousSourceStock: true,
  currentSourceStock: true,
  previousTargetStock: true,
  currentTargetStock: true,
}).extend({
  productId: z.number().int().positive(), // Direkt als Integer validieren
});

// Types for inventory transfers
export type InsertInventoryTransfer = z.infer<typeof insertInventoryTransferSchema>;
export type InventoryTransfer = typeof inventoryTransfers.$inferSelect;
export type InsertInventoryTransferItem = z.infer<typeof insertInventoryTransferItemSchema>;
export type InventoryTransferItem = typeof inventoryTransferItems.$inferSelect;

export const insertProductDisposalSchema = createInsertSchema(productDisposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertProductDisposalItemSchema = createInsertSchema(productDisposalItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductDisposal = z.infer<typeof insertProductDisposalSchema>;
export type ProductDisposal = typeof productDisposals.$inferSelect;

export type InsertProductDisposalItem = z.infer<typeof insertProductDisposalItemSchema>;
export type ProductDisposalItem = typeof productDisposalItems.$inferSelect;

// Relationen für purchaseConditions definieren
export const purchaseConditionsRelations = relations(purchaseConditions, ({ one }) => ({
  product: one(products, {
    fields: [purchaseConditions.productId],
    references: [products.id],
  }),
  supplier: one(suppliers, {
    fields: [purchaseConditions.supplierId],
    references: [suppliers.id],
  }),
}));

// Relationen für supplierDiscountConditions definieren
export const supplierDiscountConditionsRelations = relations(supplierDiscountConditions, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierDiscountConditions.supplierId],
    references: [suppliers.id],
  }),
}));

// Add warehouse relations to existing relations object
// Relationen für die neuen Chargen- und Bewegungstabellen
export const productBatchRelations = relations(productBatches, ({ one, many }) => ({
  product: one(products, {
    fields: [productBatches.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [productBatches.warehouseId],
    references: [warehouses.id],
  }),
  supplier: one(suppliers, {
    fields: [productBatches.supplierId],
    references: [suppliers.id],
  }),
  order: one(orders, {
    fields: [productBatches.orderId],
    references: [orders.id],
  }),
  movements: many(productMovements),
}));

export const productMovementRelations = relations(productMovements, ({ one }) => ({
  product: one(products, {
    fields: [productMovements.productId],
    references: [products.id],
  }),
  productBatch: one(productBatches, {
    fields: [productMovements.productBatchId],
    references: [productBatches.id],
  }),
}));

// Support Tickets Tabelle
export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull().unique(),
  
  // Kundendaten
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  customerCompany: text("customer_company"),
  
  // Ticket-Details
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  category: text("category").notNull(), // technical, billing, general, etc.
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  
  // System-Informationen
  affectedSystem: text("affected_system"), // welches System betroffen ist
  errorMessage: text("error_message"), // Fehlermeldung falls vorhanden
  stepsToReproduce: text("steps_to_reproduce"), // Schritte zur Reproduktion
  expectedBehavior: text("expected_behavior"), // erwartetes Verhalten
  actualBehavior: text("actual_behavior"), // tatsächliches Verhalten
  
  // Zusätzliche Informationen
  browserInfo: text("browser_info"), // Browser-Informationen
  deviceInfo: text("device_info"), // Geräteinformationen
  additionalNotes: text("additional_notes"), // zusätzliche Notizen
  attachmentUrls: text("attachment_urls").array(), // URLs zu Anhängen
  
  // Status und Bearbeitung
  status: text("status").notNull().default("open"), // open, in_progress, resolved, closed
  assignedTo: text("assigned_to"), // zugewiesener Bearbeiter
  adminNotes: text("admin_notes"), // interne Notizen
  resolutionNotes: text("resolution_notes"), // Lösungsnotizen
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  ticketNumber: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
});

export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

// ========================== STANDORTKOSTEN ===========================

// Standortkosten-Tabelle für laufende Betriebskosten pro Standort/Automat
export const locationCosts = pgTable("location_costs", {
  id: serial("id").primaryKey(),
  
  // Standort/Maschine
  locationId: integer("location_id").references(() => locations.id),
  machineId: integer("machine_id").references(() => machines.id),
  locationName: text("location_name").notNull(), // Redundante Speicherung für Performance
  machineName: text("machine_name"), // Redundante Speicherung für Performance
  
  // Kostenart
  costType: text("cost_type").notNull(), // z.B. "strom", "miete", "telemetrie", "kartenzahlung", "wartung"
  costName: text("cost_name").notNull(), // Bezeichnung der Kostenart (z.B. "Stromkosten", "Standortmiete")
  
  // Betrag
  amountNet: real("amount_net").notNull(), // Netto-Betrag
  amountGross: real("amount_gross").notNull(), // Brutto-Betrag
  vatRate: real("vat_rate").default(19), // MwSt-Satz in Prozent
  currency: text("currency").default("EUR"), // Währung
  
  // Zeitraum
  validFrom: date("valid_from").notNull(), // Gültig ab
  validTo: date("valid_to"), // Gültig bis (null = unbefristet)
  billingCycle: text("billing_cycle").default("monthly"), // "monthly", "quarterly", "yearly", "one_time"
  
  // Beschreibung und Kategorisierung
  category: text("category"), // Kategorie (optional für Gruppierung)
  description: text("description"), // Beschreibung
  isActive: boolean("is_active").default(true), // Ist aktiv?
  notes: text("notes"), // Zusätzliche Notizen
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertLocationCostSchema = createInsertSchema(locationCosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLocationCost = z.infer<typeof insertLocationCostSchema>;
export type LocationCost = typeof locationCosts.$inferSelect;

// Relation für Standortkosten
export const locationCostRelations = relations(locationCosts, ({ one }) => ({
  location: one(locations, {
    fields: [locationCosts.locationId],
    references: [locations.id],
  }),
  machine: one(machines, {
    fields: [locationCosts.machineId], 
    references: [machines.id],
  }),
  creator: one(users, {
    fields: [locationCosts.createdBy],
    references: [users.id],
  }),
}));

// ================================ Wiederkehrende Bestellungen ================================

// Wiederkehrende Bestellungen-Konfigurationstabelle
export const recurringOrders = pgTable("recurring_orders", {
  id: serial("id").primaryKey(),
  
  // Identifikation und Benennung
  name: text("name").notNull(), // Name der wiederkehrenden Bestellung (z.B. "Bäckerei Montag")
  description: text("description"), // Beschreibung
  
  // Lieferant und Lager
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id), // Lieferant
  supplierName: text("supplier_name").notNull(), // Name des Lieferanten (für Redundanz)
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id), // Ziel-Lager
  warehouseName: text("warehouse_name").notNull(), // Name des Lagers (für Redundanz)
  
  // Intervall-Konfiguration
  interval: text("interval").notNull(), // "weekly", "biweekly", "triweekly", "monthly"
  intervalValue: integer("interval_value").default(1), // z.B. 1 = jede Woche, 2 = alle 2 Wochen
  weekday: text("weekday"), // "monday", "tuesday", etc. (für wöchentliche Bestellungen)
  dayOfMonth: integer("day_of_month"), // Tag des Monats (für monatliche Bestellungen)
  
  // Zeitraum
  startDate: date("start_date").notNull(), // Startdatum der wiederkehrenden Bestellung
  endDate: date("end_date"), // Enddatum (optional, null = unbegrenzt)
  nextExecutionDate: date("next_execution_date").notNull(), // Nächster Ausführungstermin
  
  // Status und Steuerung
  isActive: boolean("is_active").default(true), // Ist die wiederkehrende Bestellung aktiv
  isAutoGenerate: boolean("is_auto_generate").default(true), // Automatische Generierung aktiviert
  
  // Kategorie und Filterung
  category: text("category"), // Kategorie (z.B. "Milchprodukte", "Obst") für Filterung
  tags: text("tags"), // JSON-Array von Tags für bessere Organisation
  
  // Bestelltyp-Konfiguration
  orderType: text("order_type").notNull().default("shipping"), // "shipping" (Versandbestellung) oder "goods_receipt" (Wareneingangsbestellung)
  
  // Bestelleinstellungen
  priority: text("priority").default("normal"), // "low", "normal", "high", "urgent"
  deliveryType: text("delivery_type").default("delivery"), // "delivery" oder "pickup"
  deliveryLocation: text("delivery_location"), // Lieferort (überschreibbar)
  
  // Lieferlogik
  deliveryLogic: text("delivery_logic").default("fixed"), // "fixed" (feste Lieferwoche) oder "days_after_order" (X Tage nach Bestellung)
  deliveryOffsetDays: integer("delivery_offset_days").default(0), // Anzahl Tage nach Bestellung (bei days_after_order)
  
  // Prognose-Integration
  forecastEnabled: boolean("forecast_enabled").default(false), // Automatische Mengenberechnung durch Prognose
  forecastPeriodDays: integer("forecast_period_days").default(14), // Prognosezeitraum in Tagen (7 oder 14 Tage)
  
  // E-Mail-Benachrichtigungen
  emailNotifications: text("email_notifications"), // JSON Array von E-Mail-Adressen für Entwurfs-Benachrichtigungen
  emailTemplate: text("email_template"), // Individuelle E-Mail-Vorlage (optional)
  
  // Automatisierung
  autoCreateInGoods: boolean("auto_create_in_goods").default(true), // Automatisch in Wareneingang erstellen
  requiresApproval: boolean("requires_approval").default(false), // Benötigt Genehmigung vor Generierung
  
  // Statistiken
  totalExecutions: integer("total_executions").default(0), // Anzahl der Ausführungen
  lastExecutionDate: date("last_execution_date"), // Letzte Ausführung
  lastOrderId: integer("last_order_id").references(() => orders.id), // Letzte generierte Bestellung
  
  // Metadaten
  notes: text("notes"), // Notizen
  createdBy: integer("created_by").notNull().references(() => users.id), // Erstellt von
  createdByName: text("created_by_name").notNull(), // Name des Erstellers
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRecurringOrderSchema = createInsertSchema(recurringOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalExecutions: true,
  lastExecutionDate: true,
  lastOrderId: true,
});

export type InsertRecurringOrder = z.infer<typeof insertRecurringOrderSchema>;
export type RecurringOrder = typeof recurringOrders.$inferSelect;

// Wiederkehrende Bestellpositionen-Tabelle
export const recurringOrderItems = pgTable("recurring_order_items", {
  id: serial("id").primaryKey(),
  
  // Zuordnung zur wiederkehrenden Bestellung
  recurringOrderId: integer("recurring_order_id").notNull().references(() => recurringOrders.id),
  
  // Produkt-Informationen
  productId: integer("product_id").notNull().references(() => products.id), // Produkt-ID
  productName: text("product_name").notNull(), // Produktname (für Redundanz)
  sku: text("sku"), // Artikelnummer
  supplierSku: text("supplier_sku"), // Lieferanten-Artikelnummer
  
  // Mengen und Einheiten
  quantity: integer("quantity").notNull().default(1), // Standard-Bestellmenge
  unit: text("unit").default("stk"), // Einheit (Stück, Kiste, Palette, etc.)
  
  // Preise (können sich ändern, daher Snapshot)
  unitPrice: real("unit_price"), // Einzelpreis (optional, für Kalkulation)
  totalPrice: real("total_price"), // Gesamtpreis (Menge * Einzelpreis)
  
  // Position und Status
  positionNumber: integer("position_number"), // Position in der Bestellung (1, 2, 3, ...)
  isActive: boolean("is_active").default(true), // Ist diese Position aktiv
  
  // Notizen
  notes: text("notes"), // Notizen zur Position
  itemComment: text("item_comment"), // Kommentar pro Position
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRecurringOrderItemSchema = createInsertSchema(recurringOrderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalPrice: true, // wird automatisch berechnet
});

export type InsertRecurringOrderItem = z.infer<typeof insertRecurringOrderItemSchema>;
export type RecurringOrderItem = typeof recurringOrderItems.$inferSelect;

// Ausführungsprotokoll für wiederkehrende Bestellungen
export const recurringOrderExecutions = pgTable("recurring_order_executions", {
  id: serial("id").primaryKey(),
  
  // Referenzen
  recurringOrderId: integer("recurring_order_id").notNull().references(() => recurringOrders.id),
  orderId: integer("order_id").references(() => orders.id), // Generierte Bestellung (kann null sein bei Fehlern)
  
  // Ausführung
  scheduledDate: date("scheduled_date").notNull(), // Geplantes Datum der Ausführung
  executedAt: timestamp("executed_at"), // Tatsächlicher Ausführungszeitpunkt
  nextScheduledDate: date("next_scheduled_date"), // Nächster geplanter Ausführungstermin
  
  // Status
  status: text("status").notNull().default("pending"), // "pending", "success", "failed", "skipped"
  executionType: text("execution_type").default("automatic"), // "automatic", "manual", "retry"
  
  // Ergebnis
  success: boolean("success").default(false), // War die Ausführung erfolgreich
  errorMessage: text("error_message"), // Fehlermeldung bei gescheiterten Ausführungen
  orderNumber: text("order_number"), // Bestellnummer der generierten Bestellung
  
  // Statistiken
  itemCount: integer("item_count").default(0), // Anzahl der Bestellpositionen
  totalAmount: real("total_amount").default(0), // Gesamtbetrag der generierten Bestellung
  
  // Verarbeitung
  processingDurationMs: integer("processing_duration_ms"), // Verarbeitungsdauer in Millisekunden
  retryCount: integer("retry_count").default(0), // Anzahl der Wiederholungsversuche
  
  // Metadaten
  metadata: text("metadata"), // JSON-Metadaten (für erweiterte Informationen)
  notes: text("notes"), // Notizen zur Ausführung
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRecurringOrderExecutionSchema = createInsertSchema(recurringOrderExecutions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRecurringOrderExecution = z.infer<typeof insertRecurringOrderExecutionSchema>;
export type RecurringOrderExecution = typeof recurringOrderExecutions.$inferSelect;

// Relationen für wiederkehrende Bestellungen
export const recurringOrderRelations = relations(recurringOrders, ({ many, one }) => ({
  items: many(recurringOrderItems),
  executions: many(recurringOrderExecutions),
  supplier: one(suppliers, {
    fields: [recurringOrders.supplierId],
    references: [suppliers.id],
  }),
  warehouse: one(warehouses, {
    fields: [recurringOrders.warehouseId],
    references: [warehouses.id],
  }),
  creator: one(users, {
    fields: [recurringOrders.createdBy],
    references: [users.id],
  }),
  lastOrder: one(orders, {
    fields: [recurringOrders.lastOrderId],
    references: [orders.id],
  }),
}));

export const recurringOrderItemRelations = relations(recurringOrderItems, ({ one }) => ({
  recurringOrder: one(recurringOrders, {
    fields: [recurringOrderItems.recurringOrderId],
    references: [recurringOrders.id],
  }),
  product: one(products, {
    fields: [recurringOrderItems.productId],
    references: [products.id],
  }),
}));

export const recurringOrderExecutionRelations = relations(recurringOrderExecutions, ({ one }) => ({
  recurringOrder: one(recurringOrders, {
    fields: [recurringOrderExecutions.recurringOrderId],
    references: [recurringOrders.id],
  }),
  order: one(orders, {
    fields: [recurringOrderExecutions.orderId],
    references: [orders.id],
  }),
}));

// ==========================================
// RETROAKTIVES INVENTARSYSTEM
// ==========================================

// Retroaktive Inventurzählungen - Haupttabelle für vergangene Stichtage
export const retroactiveInventoryCounts = pgTable("retroactive_inventory_counts", {
  id: serial("id").primaryKey(),
  
  // Grunddaten
  countName: text("count_name").notNull(), // Name der Inventur, z.B. "Quartalsabschluss Q2 2025"
  countDate: date("count_date").notNull(), // Stichtag der Inventur (vergangenes Datum)
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  warehouseName: text("warehouse_name").notNull(), // Redundant für Audit-Sicherheit
  
  // Status und Verarbeitung
  status: text("status").notNull().default("draft"), // "draft", "finalized", "processed", "cancelled"
  isProcessed: boolean("is_processed").default(false), // Wurden Anpassungen bereits berechnet
  processingDate: timestamp("processing_date"), // Wann wurde die Verarbeitung durchgeführt
  
  // Auswirkungen
  totalItemsCount: integer("total_items_count").default(0), // Anzahl der gezählten Artikel
  totalDiscrepancies: integer("total_discrepancies").default(0), // Anzahl der Abweichungen
  totalAdjustmentValue: real("total_adjustment_value").default(0), // Gesamtwert der Anpassungen
  hasNegativeStock: boolean("has_negative_stock").default(false), // Warnung bei negativen Beständen
  
  // Metadaten und Notizen
  description: text("description"), // Beschreibung der Inventur
  notes: text("notes"), // Zusätzliche Notizen
  reasonForRetroactiveCount: text("reason_for_retroactive_count"), // Grund für nachträgliche Inventur
  
  // Audit und Revisionssicherheit
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdByName: text("created_by_name").notNull(), // Name des Erstellers
  processedBy: integer("processed_by").references(() => users.id), // Wer hat die Verarbeitung durchgeführt
  processedByName: text("processed_by_name"), // Name des Verarbeiters
  
  // Zeitstempel
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRetroactiveInventoryCountSchema = createInsertSchema(retroactiveInventoryCounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalItemsCount: true,
  totalDiscrepancies: true,
  totalAdjustmentValue: true,
  hasNegativeStock: true,
  isProcessed: true,
  processingDate: true,
  processedBy: true,
  processedByName: true,
});

export type InsertRetroactiveInventoryCount = z.infer<typeof insertRetroactiveInventoryCountSchema>;
export type RetroactiveInventoryCount = typeof retroactiveInventoryCounts.$inferSelect;

// Einzelne Zählpositionen der retroaktiven Inventur
export const retroactiveInventoryCountItems = pgTable("retroactive_inventory_count_items", {
  id: serial("id").primaryKey(),
  
  // Zuordnung zur Inventur
  countId: integer("count_id").notNull().references(() => retroactiveInventoryCounts.id, { onDelete: "cascade" }),
  
  // Produktdaten
  productId: integer("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(), // Redundant für Audit-Sicherheit
  productSku: text("product_sku"), // SKU zum Zeitpunkt der Inventur
  
  // Mengen
  countedQuantity: integer("counted_quantity").notNull(), // Tatsächlich gezählte Menge
  systemQuantity: integer("system_quantity"), // Systemmenge zum Count-Date (wird berechnet)
  discrepancy: integer("discrepancy"), // Abweichung (countedQuantity - systemQuantity)
  discrepancyPercentage: real("discrepancy_percentage"), // Abweichung in Prozent
  
  // Bewertung und Kosten
  unitCost: real("unit_cost"), // Stückkosten zum Count-Date
  totalDiscrepancyValue: real("total_discrepancy_value"), // Wert der Abweichung
  
  // Batch-/MHD-Informationen (optional)
  batchId: text("batch_id"), // Charge, falls spezifisch gezählt
  expiryDate: date("expiry_date"), // MHD, falls relevant
  
  // Status und Validierung
  isValidated: boolean("is_validated").default(false), // Wurde die Zählung validiert
  hasConflict: boolean("has_conflict").default(false), // Führt zu negativen Beständen
  requiresAttention: boolean("requires_attention").default(false), // Benötigt manuelle Prüfung
  
  // Notizen
  notes: text("notes"), // Notizen zur Position
  countingRemarks: text("counting_remarks"), // Bemerkungen beim Zählen
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRetroactiveInventoryCountItemSchema = createInsertSchema(retroactiveInventoryCountItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  systemQuantity: true,
  discrepancy: true,
  discrepancyPercentage: true,
  totalDiscrepancyValue: true,
  hasConflict: true,
});

export type InsertRetroactiveInventoryCountItem = z.infer<typeof insertRetroactiveInventoryCountItemSchema>;
export type RetroactiveInventoryCountItem = typeof retroactiveInventoryCountItems.$inferSelect;

// Berechnete Anpassungen für die aktuellen Bestände
export const retroactiveInventoryAdjustments = pgTable("retroactive_inventory_adjustments", {
  id: serial("id").primaryKey(),
  
  // Zuordnung
  countId: integer("count_id").notNull().references(() => retroactiveInventoryCounts.id, { onDelete: "cascade" }),
  countItemId: integer("count_item_id").notNull().references(() => retroactiveInventoryCountItems.id, { onDelete: "cascade" }),
  
  // Produktdaten
  productId: integer("product_id").notNull().references(() => products.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  
  // Berechnungen
  originalQuantity: integer("original_quantity").notNull(), // Ursprüngliche Systemmenge
  adjustedQuantity: integer("adjusted_quantity").notNull(), // Neue berechnete Menge
  adjustmentAmount: integer("adjustment_amount").notNull(), // Änderungsbetrag
  
  // Zwischenbewegungen (vom Count-Date bis heute)
  movementsSinceCount: integer("movements_since_count").default(0), // Summe aller Bewegungen seit Count-Date
  salesSinceCount: integer("sales_since_count").default(0), // Verkäufe seit Count-Date
  refillsSinceCount: integer("refills_since_count").default(0), // Nachfüllungen seit Count-Date
  otherMovements: integer("other_movements").default(0), // Andere Bewegungen
  
  // Auswirkungen
  currentSystemQuantity: integer("current_system_quantity").notNull(), // Aktuelle Systemmenge vor Anpassung
  newCalculatedQuantity: integer("new_calculated_quantity").notNull(), // Neue berechnete aktuelle Menge
  finalAdjustment: integer("final_adjustment").notNull(), // Endgültige Anpassung
  
  // Validierung und Konflikte
  wouldCauseNegativeStock: boolean("would_cause_negative_stock").default(false),
  confidenceLevel: real("confidence_level").default(1.0), // Vertrauensniveau der Berechnung (0-1)
  hasDataGaps: boolean("has_data_gaps").default(false), // Fehlende Bewegungsdaten
  
  // Status
  status: text("status").default("calculated"), // "calculated", "applied", "rejected", "pending_review"
  appliedAt: timestamp("applied_at"), // Wann wurde die Anpassung angewendet
  appliedBy: integer("applied_by").references(() => users.id), // Wer hat die Anpassung angewendet
  appliedByName: text("applied_by_name"), // Name des Anwenders
  
  // Metadaten
  calculationDetails: text("calculation_details"), // JSON mit Details der Berechnung
  validationNotes: text("validation_notes"), // Notizen zur Validierung
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRetroactiveInventoryAdjustmentSchema = createInsertSchema(retroactiveInventoryAdjustments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  appliedAt: true,
  appliedBy: true,
  appliedByName: true,
});

export type InsertRetroactiveInventoryAdjustment = z.infer<typeof insertRetroactiveInventoryAdjustmentSchema>;
export type RetroactiveInventoryAdjustment = typeof retroactiveInventoryAdjustments.$inferSelect;

// Relationen für das retroaktive Inventarsystem
export const retroactiveInventoryCountRelations = relations(retroactiveInventoryCounts, ({ many, one }) => ({
  items: many(retroactiveInventoryCountItems),
  adjustments: many(retroactiveInventoryAdjustments),
  warehouse: one(warehouses, {
    fields: [retroactiveInventoryCounts.warehouseId],
    references: [warehouses.id],
  }),
  creator: one(users, {
    fields: [retroactiveInventoryCounts.createdBy],
    references: [users.id],
  }),
  processor: one(users, {
    fields: [retroactiveInventoryCounts.processedBy],
    references: [users.id],
  }),
}));

export const retroactiveInventoryCountItemRelations = relations(retroactiveInventoryCountItems, ({ one }) => ({
  count: one(retroactiveInventoryCounts, {
    fields: [retroactiveInventoryCountItems.countId],
    references: [retroactiveInventoryCounts.id],
  }),
  product: one(products, {
    fields: [retroactiveInventoryCountItems.productId],
    references: [products.id],
  }),
}));

export const retroactiveInventoryAdjustmentRelations = relations(retroactiveInventoryAdjustments, ({ one }) => ({
  count: one(retroactiveInventoryCounts, {
    fields: [retroactiveInventoryAdjustments.countId],
    references: [retroactiveInventoryCounts.id],
  }),
  countItem: one(retroactiveInventoryCountItems, {
    fields: [retroactiveInventoryAdjustments.countItemId],
    references: [retroactiveInventoryCountItems.id],
  }),
  product: one(products, {
    fields: [retroactiveInventoryAdjustments.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [retroactiveInventoryAdjustments.warehouseId],
    references: [warehouses.id],
  }),
  appliedByUser: one(users, {
    fields: [retroactiveInventoryAdjustments.appliedBy],
    references: [users.id],
  }),
}));

export const allRelations = {
  orderRelations,
  orderItemRelations,
  warehouseRelations,
  inventoryItemRelations,
  inventoryBatchRelations,
  inventoryMovementRelations,
  machineWarehouseAssignmentRelations,
  inventoryCountRelations,
  inventoryCountItemRelations,
  inventoryCountBatchRelations,
  productDisposalsRelations,
  productDisposalItemsRelations,
  purchaseConditionsRelations,
  refillDetailsRelations,
  refillBatchMovementsRelations,
  productBatchRelations,
  productMovementRelations,
  locationCostRelations,
  recurringOrderRelations,
  recurringOrderItemRelations,
  recurringOrderExecutionRelations,
  retroactiveInventoryCountRelations,
  retroactiveInventoryCountItemRelations,
  retroactiveInventoryAdjustmentRelations,
};
