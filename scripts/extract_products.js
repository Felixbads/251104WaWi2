/**
 * Skript zum Extrahieren von Produkten aus Transaktionen
 * Dieses Skript liest alle Transaktionen aus und erstellt automatisch Produkte 
 * basierend auf den Namen in den Transaktionen.
 */

import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function query(text, params) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Datenbankfehler:', error);
    throw error;
  }
}

// Funktion zur Normalisierung von Produktnamen 
function normalizeProductName(name) {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')  // Mehrfache Leerzeichen zu einem zusammenfassen
    .toLowerCase();
}

async function extractProductsFromTransactions() {
  console.log("STARTE PRODUKT-EXTRAKTION AUS TRANSAKTIONEN...");
  console.log("==============================================");
  
  try {
    // 1. Datenbankverbindung prüfen
    console.log("Prüfe Datenbankverbindung...");
    await query('SELECT 1');
    console.log("✅ Datenbankverbindung erfolgreich hergestellt\n");
    
    // 2. Prüfen, ob bereits Produkte existieren
    const existingProductsResult = await query('SELECT COUNT(*) FROM products');
    const existingCount = parseInt(existingProductsResult.rows[0].count, 10);
    
    console.log(`Aktuell ${existingCount} Produkte in der Datenbank`);
    
    // 3. Alle Transaktionen laden
    console.log("Lade Transaktionen...");
    const transactionsResult = await query(`
      SELECT 
        id, 
        vendon_id, 
        machine_id, 
        machine_name, 
        product_id, 
        product_name, 
        article,
        price
      FROM transactions 
      WHERE product_name IS NOT NULL AND product_name != ''
    `);
    
    const transactions = transactionsResult.rows;
    console.log(`${transactions.length} Transaktionen mit Produktnamen gefunden.`);
    
    // 4. Produkte extrahieren
    console.log("Extrahiere einzigartige Produkte aus Transaktionen...");
    
    // Map zum Speichern einzigartiger Produkte
    const uniqueProducts = new Map();
    
    for (const transaction of transactions) {
      const productName = transaction.product_name;
      
      if (!productName) continue;
      
      // Normalisierter Produktname als Schlüssel für Deduplizierung
      const normalizedName = normalizeProductName(productName);
      
      // Wenn wir dieses Produkt noch nicht haben, füge es hinzu
      if (!uniqueProducts.has(normalizedName)) {
        uniqueProducts.set(normalizedName, {
          productName: productName,
          transactions: 1,
          price: transaction.price,
          // Wenn Vendon product_id vorhanden ist, verwende diese
          vendonId: transaction.product_id || null,
          articleNumber: transaction.article || null,
          machineId: transaction.machine_id,
          machineName: transaction.machine_name,
          // Zusätzliche Felder aus dem Produktnamen extrahieren
          source: 'transaction_extract'
        });
      } else {
        // Update Transaktionszähler
        const existingProduct = uniqueProducts.get(normalizedName);
        existingProduct.transactions += 1;
        
        // Verwende die höchste Anzahl von Transaktionen, um das "beste" Produkt zu finden
        if (!existingProduct.vendonId && transaction.product_id) {
          existingProduct.vendonId = transaction.product_id;
        }
        
        if (!existingProduct.articleNumber && transaction.article) {
          existingProduct.articleNumber = transaction.article;
        }
      }
    }
    
    const uniqueProductList = Array.from(uniqueProducts.values());
    console.log(`${uniqueProductList.length} einzigartige Produkte extrahiert.`);
    
    // 5. Produkte in Datenbank speichern
    console.log("Speichere Produkte in Datenbank...");
    
    let savedCount = 0;
    let skippedCount = 0;
    
    for (const product of uniqueProductList) {
      try {
        // Prüfen, ob Produkt bereits existiert (nach Vendon-ID oder normalisiertem Namen)
        let existingProduct = null;
        
        if (product.vendonId) {
          const vendonIdResult = await query('SELECT id FROM products WHERE vendon_id = $1', [product.vendonId]);
          if (vendonIdResult.rows.length > 0) {
            existingProduct = vendonIdResult.rows[0];
          }
        }
        
        if (!existingProduct) {
          const normalizedName = normalizeProductName(product.productName);
          const nameResult = await query(
            'SELECT id FROM products WHERE LOWER(product_name) = $1', 
            [normalizedName]
          );
          
          if (nameResult.rows.length > 0) {
            existingProduct = nameResult.rows[0];
          }
        }
        
        if (existingProduct) {
          console.log(`Überspringe existierendes Produkt: ${product.productName}`);
          skippedCount++;
          continue;
        }
        
        // Erzeuge SKU basierend auf dem Produktnamen
        const sku = normalizeProductName(product.productName)
          .replace(/[^a-z0-9]/g, '-')
          .substring(0, 20) + '-' + Math.floor(Math.random() * 1000);
        
        // Kategorien und Hersteller aus Produktnamen extrahieren (wenn in Klammern)
        let category = 'Sonstiges';
        let supplierName = null;
        
        // Nach Text in eckigen Klammern suchen für Kategorie: [Kategorie]
        const categoryMatch = product.productName.match(/\[(.*?)\]/);
        if (categoryMatch && categoryMatch[1]) {
          category = categoryMatch[1].trim();
        }
        
        // Nach Text in runden Klammern suchen für Hersteller: (Hersteller)
        const manufacturerMatch = product.productName.match(/\((.*?)\)/);
        if (manufacturerMatch && manufacturerMatch[1]) {
          supplierName = manufacturerMatch[1].trim();
        }
        
        // Speichere Produkt
        // Wir müssen sicherstellen, dass vendon_id einen Wert hat - im Notfall verwenden wir die interne ID
        const vendonId = product.vendonId || `AUTO-${Math.floor(Math.random() * 1000000)}`;
        
        const insertResult = await query(`
          INSERT INTO products (
            product_name, 
            sku, 
            description, 
            vendon_id,
            category,
            supplier_name, 
            price,
            article,
            status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING id
        `, [
          product.productName,
          sku,
          `Automatisch extrahiert aus ${product.transactions} Transaktionen`,
          vendonId,
          category,
          supplierName,
          product.price,
          product.articleNumber,
          'active'
        ]);
        
        console.log(`✅ Produkt gespeichert: "${product.productName}" (ID: ${insertResult.rows[0].id})`);
        savedCount++;
        
      } catch (error) {
        console.error(`Fehler beim Speichern von Produkt "${product.productName}":`, error.message);
      }
    }
    
    console.log(`\nErgebnis der Produktextraktion:`);
    console.log(`- ${savedCount} neue Produkte angelegt`);
    console.log(`- ${skippedCount} existierende Produkte übersprungen`);
    
    // 6. Produktbeziehungen zu Transaktionen herstellen
    console.log("\nAktualisiere Transaktionen mit Produkt-IDs...");
    
    let transactionUpdateCount = 0;
    
    // Aktualisiere Transaktionen mit den neuesten Produkt-IDs
    const updateQuery = `
      UPDATE transactions t
      SET product_id = p.id
      FROM products p
      WHERE t.product_name = p.product_name AND t.product_id IS NULL
    `;
    
    const updateResult = await query(updateQuery);
    transactionUpdateCount = updateResult.rowCount;
    
    console.log(`${transactionUpdateCount} Transaktionen mit Produkt-IDs aktualisiert.`);
    
    console.log("\n🎉 PRODUKT-EXTRAKTION ERFOLGREICH ABGESCHLOSSEN! 🎉");
    
  } catch (error) {
    console.error("KRITISCHER FEHLER:", error);
  } finally {
    await pool.end();
  }
}

// Skript ausführen
extractProductsFromTransactions().catch(console.error);