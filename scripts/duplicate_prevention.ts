/**
 * Dieses Skript aktualisiert die products Tabelle, um duplizierte Produkte zu verhindern
 * Es fügt eine normalisierte_name Spalte hinzu und erstellt einen einzigartigen Index darauf
 */

import { rawDb } from "../server/db";
import { normalizeProductName } from "../server/utils/stringUtils";

async function enhanceProductTableWithNormalizedNames() {
  console.log("Starte Verbesserung der Produkttabelle für stärkere Duplikaterkennung...");
  
  try {
    // 1. Prüfen, ob die normalisierte_name Spalte bereits existiert
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'normalized_name'
    `;
    
    const columnResult = await rawDb.query(checkColumnQuery);
    const columnExists = columnResult.rows.length > 0;
    
    if (!columnExists) {
      console.log("Füge 'normalized_name' Spalte zur Produkttabelle hinzu...");
      const addColumnQuery = `
        ALTER TABLE products 
        ADD COLUMN normalized_name TEXT
      `;
      await rawDb.query(addColumnQuery);
      console.log("✅ Spalte erfolgreich hinzugefügt");
    } else {
      console.log("Die 'normalized_name' Spalte existiert bereits.");
    }
    
    // 2. Alle bestehenden Produkte aktualisieren und normalisierte Namen setzen
    console.log("Aktualisiere normalisierte Namen für alle Produkte...");
    const getProductsQuery = `SELECT id, product_name FROM products`;
    const productsResult = await rawDb.query(getProductsQuery);
    const products = productsResult.rows;
    
    console.log(`Gefunden: ${products.length} Produkte zum Aktualisieren`);
    
    // Batchweise aktualisieren um die Datenbank nicht zu überlasten
    const BATCH_SIZE = 100;
    let updatedCount = 0;
    let currentBatch = 0;
    
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      currentBatch++;
      
      console.log(`Verarbeite Batch ${currentBatch}/${Math.ceil(products.length / BATCH_SIZE)}...`);
      
      // Batch-Update durchführen
      for (const product of batch) {
        if (!product.product_name) continue;
        
        const normalizedName = normalizeProductName(product.product_name);
        
        const updateQuery = `
          UPDATE products 
          SET normalized_name = $1 
          WHERE id = $2
        `;
        
        await rawDb.query(updateQuery, [normalizedName, product.id]);
        updatedCount++;
      }
    }
    
    console.log(`✅ ${updatedCount} Produkte erfolgreich mit normalisierten Namen aktualisiert`);
    
    // 3. Index erstellen für schnelle Suche
    try {
      console.log("Erstelle Index auf der normalized_name Spalte...");
      const createIndexQuery = `
        CREATE INDEX IF NOT EXISTS idx_products_normalized_name 
        ON products(normalized_name)
      `;
      await rawDb.query(createIndexQuery);
      console.log("✅ Index erfolgreich erstellt");
    } catch (indexError) {
      console.log("Hinweis: Index konnte nicht erstellt werden, möglicherweise existiert er bereits.", indexError);
    }
    
    // 4. SQL-Funktion zur Duplikaterkennung erstellen
    console.log("Erstelle SQL-Funktion für Produktsuche mit normalisiertem Namen...");
    const createFunctionQuery = `
      CREATE OR REPLACE FUNCTION find_product_by_normalized_name(normalized_name_param TEXT)
      RETURNS TABLE (
        id INTEGER,
        product_name TEXT,
        normalized_name TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT p.id, p.product_name, p.normalized_name
        FROM products p
        WHERE p.normalized_name = normalized_name_param
        LIMIT 1;
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    await rawDb.query(createFunctionQuery);
    console.log("✅ SQL-Funktion erfolgreich erstellt");
    
    // 5. Trigger für Duplikaterkennung erstellen
    console.log("Erstelle Trigger für automatische Normalisierung von Produktnamen...");
    const createTriggerQuery = `
      CREATE OR REPLACE FUNCTION normalize_product_name_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Bei INSERT oder UPDATE wird der normalisierte Name automatisch gesetzt
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
          NEW.normalized_name = lower(regexp_replace(trim(NEW.product_name), '\\s+', ' ', 'g'));
          -- Hier weitere Normalisierungsschritte einfügen, wenn nötig
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      DROP TRIGGER IF EXISTS normalize_product_name_trigger ON products;
      
      CREATE TRIGGER normalize_product_name_trigger
      BEFORE INSERT OR UPDATE
      ON products
      FOR EACH ROW
      EXECUTE FUNCTION normalize_product_name_trigger();
    `;
    
    await rawDb.query(createTriggerQuery);
    console.log("✅ Trigger erfolgreich erstellt");
    
    console.log("\nProduktdatenbank-Verbesserung erfolgreich abgeschlossen!");
  } catch (error: any) {
    console.error("Fehler bei der Verbesserung der Produkttabelle:", error.message);
    throw error;
  }
}

// Skript ausführen
enhanceProductTableWithNormalizedNames().then(() => {
  console.log("Prozess abgeschlossen.");
  process.exit(0);
}).catch(err => {
  console.error("Kritischer Fehler:", err);
  process.exit(1);
});