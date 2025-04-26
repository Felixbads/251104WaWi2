/**
 * Dieses Skript aktualisiert die MwSt-Sätze für Produkte basierend auf ihren Kategorien
 * 
 * Lebensmittel (inkl. Milch, Käse, Brot, Wasser, Eier) bekommen 7% MwSt
 * Alkoholische Getränke und sonstige Waren bekommen 19% MwSt
 * 
 * Verwendung: node update_tax_rates.cjs
 */

// Umgebungsvariablen laden
require('dotenv').config();
const { Pool } = require('pg');

// Datenbankverbindung herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updateTaxRates() {
  const client = await pool.connect();
  
  try {
    // Starte Transaktion
    await client.query('BEGIN');
    
    console.log('Aktualisierung der MwSt-Sätze für Produkte...');
    
    // 1. Produkte identifizieren, die mit 7% besteuert werden sollten (grundlegende Lebensmittel)
    const foodProducts = await client.query(`
      SELECT id, product_name 
      FROM products 
      WHERE product_name ILIKE '%milch%' 
         OR product_name ILIKE '%joghurt%'
         OR product_name ILIKE '%käse%'
         OR product_name ILIKE '%brot%'
         OR product_name ILIKE '%saft%'
         OR product_name ILIKE '%eier%'
         OR product_name ILIKE '%fleisch%'
         OR product_name ILIKE '%wurst%'
         OR product_name ILIKE '%knacker%'
         OR product_name ILIKE '%wiener%'
         OR product_name ILIKE '%bockwurst%'
         OR product_name ILIKE '%salami%'
         OR product_name ILIKE '%wasser%'
         OR product_name ILIKE '%obst%'
         OR product_name ILIKE '%gemüse%'
         OR product_name ILIKE '%quark%'
         OR product_name ILIKE '%pudding%'
         OR product_name ILIKE '%butter%'
    `);
    
    console.log(`Gefunden: ${foodProducts.rows.length} Lebensmittelprodukte, die 7% MwSt haben sollten`);
    
    // 2. Aktualisiere die MwSt-Rate für alle aktiven Einkaufsbedingungen dieser Produkte
    if (foodProducts.rows.length > 0) {
      // Erstelle Liste der Produkt-IDs
      const foodProductIds = foodProducts.rows.map(product => product.id);
      
      // Aktualisiere aktive Einkaufsbedingungen
      const updateResult = await client.query(`
        UPDATE purchase_conditions 
        SET tax_rate = 7
        WHERE product_id = ANY($1)
        RETURNING id, product_id, tax_rate
      `, [foodProductIds]);
      
      console.log(`Aktualisiert: ${updateResult.rows.length} Einkaufsbedingungen auf 7% MwSt`);
      
      // Zeige aktualisierte Einkaufsbedingungen an
      for (const row of updateResult.rows) {
        const productInfo = foodProducts.rows.find(p => p.id === row.product_id);
        if (productInfo) {
          console.log(`- Aktualisiert ID ${row.id}: ${productInfo.product_name} auf ${row.tax_rate}% MwSt`);
        }
      }
    }
    
    // 3. Prüfe, ob es Einkaufsbedingungen gibt, die nicht aktualisiert wurden und noch den Standardsatz haben
    const remainingConditions = await client.query(`
      SELECT pc.id, p.product_name, pc.tax_rate
      FROM purchase_conditions pc
      JOIN products p ON pc.product_id = p.id
      WHERE pc.tax_rate IS NULL OR pc.tax_rate = 0
    `);
    
    if (remainingConditions.rows.length > 0) {
      console.log(`\nGefunden: ${remainingConditions.rows.length} Einkaufsbedingungen ohne MwSt, setze auf 19%:`);
      
      // Setze MwSt-Rate auf Standardsatz 19% für alle, die nicht aktualisiert wurden
      const updateDefaultResult = await client.query(`
        UPDATE purchase_conditions 
        SET tax_rate = 19
        WHERE tax_rate IS NULL OR tax_rate = 0
        RETURNING id, product_id
      `);
      
      console.log(`Aktualisiert: ${updateDefaultResult.rows.length} Einkaufsbedingungen auf Standard 19% MwSt`);
    }
    
    // 4. Zeige zusammenfassende Statistik
    const stats = await client.query(`
      SELECT tax_rate, COUNT(*) 
      FROM purchase_conditions 
      GROUP BY tax_rate 
      ORDER BY tax_rate
    `);
    
    console.log('\nZusammenfassung der MwSt-Sätze in der Datenbank:');
    stats.rows.forEach(row => {
      console.log(`- ${row.tax_rate}%: ${row.count} Einkaufsbedingungen`);
    });
    
    // Commit der Änderungen
    await client.query('COMMIT');
    console.log('\nAlle MwSt-Sätze erfolgreich aktualisiert!');
    
  } catch (err) {
    // Bei Fehler Rollback durchführen
    await client.query('ROLLBACK');
    console.error('Fehler bei der Aktualisierung der MwSt-Sätze:', err);
  } finally {
    // Client freigeben
    client.release();
    pool.end();
  }
}

// Führe die Funktion aus
updateTaxRates()
  .then(() => {
    console.log('Skript erfolgreich abgeschlossen.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fataler Fehler:', err);
    process.exit(1);
  });