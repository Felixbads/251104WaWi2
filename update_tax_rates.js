/**
 * Dieses Skript aktualisiert die MwSt-Sätze für Produkte basierend auf ihren Kategorien
 * 
 * Lebensmittel (inkl. Milch, Käse, Brot, Wasser, Eier) bekommen 7% MwSt
 * Alkoholische Getränke und sonstige Waren bekommen 19% MwSt
 * 
 * Verwendung: node update_tax_rates.js
 */

import 'dotenv/config';
import pg from 'pg';

// Datenbankverbindung herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updateTaxRates() {
  const client = await pool.connect();
  
  try {
    // Starte Transaktion
    await client.query('BEGIN');
    
    console.log('Updating tax rates for products...');
    
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
    `);
    
    console.log(`Found ${foodProducts.rows.length} food products that should have 7% tax rate`);
    
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
      
      console.log(`Updated ${updateResult.rows.length} purchase conditions to 7% tax rate`);
      
      // Zeige aktualisierte Einkaufsbedingungen an
      for (const row of updateResult.rows) {
        const productName = foodProducts.rows.find(p => p.id === row.product_id)?.product_name;
        console.log(`- Updated ID ${row.id}: ${productName} to ${row.tax_rate}% tax rate`);
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
      console.log(`\nFound ${remainingConditions.rows.length} purchase conditions with missing tax rate, setting to 19%:`);
      
      // Setze MwSt-Rate auf Standardsatz 19% für alle, die nicht aktualisiert wurden
      const updateDefaultResult = await client.query(`
        UPDATE purchase_conditions 
        SET tax_rate = 19
        WHERE tax_rate IS NULL OR tax_rate = 0
        RETURNING id, product_id
      `);
      
      console.log(`Updated ${updateDefaultResult.rows.length} purchase conditions to default 19% tax rate`);
    }
    
    // 4. Zeige zusammenfassende Statistik
    const stats = await client.query(`
      SELECT tax_rate, COUNT(*) 
      FROM purchase_conditions 
      GROUP BY tax_rate 
      ORDER BY tax_rate
    `);
    
    console.log('\nSummary of tax rates in database:');
    stats.rows.forEach(row => {
      console.log(`- ${row.tax_rate}%: ${row.count} purchase conditions`);
    });
    
    // Commit der Änderungen
    await client.query('COMMIT');
    console.log('\nAll tax rates updated successfully!');
    
  } catch (err) {
    // Bei Fehler Rollback durchführen
    await client.query('ROLLBACK');
    console.error('Error updating tax rates:', err);
  } finally {
    // Client freigeben
    client.release();
  }
}

// Führe die Funktion aus
updateTaxRates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });