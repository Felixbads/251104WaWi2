// Skript zum Ausführen der Datenbankmigrationen für neue Tabellen
const { drizzle } = require('drizzle-orm/postgres-js');
const { sql } = require('drizzle-orm');
const postgres = require('postgres');

async function main() {
  console.log('Migriere Datenbank-Schema...');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL Umgebungsvariable nicht gefunden!');
    process.exit(1);
  }
  
  // PostgreSQL-Client mit Migrations-Konfiguration erstellen
  const migrationClient = postgres(connectionString, { max: 1 });
  
  try {
    // Drizzle-Instanz für Migrationen initialisieren
    const db = drizzle(migrationClient);
    
    // Schema zur Datenbank "pushen"
    await db.execute(sql`
      -- Tabelle für Lagerchargen
      CREATE TABLE IF NOT EXISTS "inventory_batches" (
        "id" SERIAL PRIMARY KEY,
        "product_id" INTEGER NOT NULL,
        "warehouse_id" INTEGER NOT NULL,
        "batch_number" TEXT NOT NULL,
        "expiry_date" DATE NOT NULL,
        "quantity" INTEGER NOT NULL,
        "status" TEXT DEFAULT 'active',
        "notes" TEXT,
        "incoming_date" DATE DEFAULT CURRENT_DATE,
        "supplier_batch_number" TEXT,
        "location_in_warehouse" TEXT,
        "created_by" INTEGER,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE CASCADE
      );
      
      -- Tabelle für Chargenbewegungen bei Nachfüllungen
      CREATE TABLE IF NOT EXISTS "refill_batch_movements" (
        "id" SERIAL PRIMARY KEY,
        "refill_id" INTEGER NOT NULL,
        "refill_detail_id" INTEGER NOT NULL,
        "batch_id" INTEGER,
        "warehouse_id" INTEGER NOT NULL,
        "product_id" INTEGER NOT NULL,
        "quantity" INTEGER NOT NULL,
        "batch_number" TEXT NOT NULL,
        "expiry_date" DATE,
        "warehouse_before" INTEGER,
        "warehouse_after" INTEGER,
        "movement_type" TEXT NOT NULL,
        "status" TEXT DEFAULT 'completed',
        "notes" TEXT,
        "performed_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("refill_id") REFERENCES "refills" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("refill_detail_id") REFERENCES "refill_details" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE CASCADE
      );
      
      -- Hinzufügen neuer Spalten zur inventory_movements Tabelle für Batch-Tracking
      ALTER TABLE "inventory_movements"
      ADD COLUMN IF NOT EXISTS "batch_id" INTEGER,
      ADD COLUMN IF NOT EXISTS "batch_number" TEXT,
      ADD COLUMN IF NOT EXISTS "expiry_date" DATE;
    `);
    
    console.log('Datenbank-Schema erfolgreich migriert!');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    // Client-Verbindung schließen
    await migrationClient.end();
  }
}

main();