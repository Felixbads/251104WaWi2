/**
 * Dieses Skript erstellt Einkaufsbedingungen für alle Produkte, 
 * die bereits einem Lieferanten zugeordnet sind
 */

import pg from 'pg';
const { Client } = pg;

async function createPurchaseConditions() {
  // Datenbankverbindung herstellen
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('Mit der Datenbank verbunden');
    
    // Produkte mit zugewiesenen Lieferanten abrufen
    const productResult = await client.query(
      `SELECT p.id, p.product_name, p.price, p.supplier_id 
       FROM products p 
       WHERE p.supplier_id IS NOT NULL 
       ORDER BY p.id`
    );
    
    console.log(`${productResult.rows.length} Produkte mit Lieferanten gefunden`);
    
    // Überprüfen, ob für diese Produkte bereits Einkaufsbedingungen existieren
    const existingConditionsResult = await client.query(
      `SELECT product_id, supplier_id FROM purchase_conditions`
    );
    
    // Erstelle ein Set aus bestehenden Produkt-Lieferanten-Kombinationen
    const existingConditions = new Set();
    existingConditionsResult.rows.forEach(row => {
      existingConditions.add(`${row.product_id}-${row.supplier_id}`);
    });
    
    console.log(`${existingConditionsResult.rows.length} existierende Einkaufsbedingungen gefunden`);
    
    // Einkaufsbedingungen für Produkte erstellen, die noch keine haben
    const createdConditions = [];
    const failedConditions = [];
    
    for (const product of productResult.rows) {
      const key = `${product.id}-${product.supplier_id}`;
      
      // Überprüfen, ob bereits eine Einkaufsbedingung für diese Kombination existiert
      if (!existingConditions.has(key)) {
        try {
          // Einkaufsbedingungen erstellen
          const result = await client.query(
            `INSERT INTO purchase_conditions 
             (product_id, supplier_id, unit_price, tax_rate, is_preferred, created_at, updated_at) 
             VALUES ($1, $2, $3, 19, true, NOW(), NOW()) 
             RETURNING id`,
            [product.id, product.supplier_id, product.price || 0]
          );
          
          createdConditions.push({
            id: result.rows[0].id,
            productId: product.id,
            productName: product.product_name,
            supplierId: product.supplier_id
          });
          
          console.log(`✅ Einkaufsbedingung für ${product.product_name} (ID: ${product.id}) mit Lieferant ID ${product.supplier_id} erstellt`);
        } catch (error) {
          console.error(`❌ Fehler beim Erstellen der Einkaufsbedingung für Produkt ${product.id}:`, error);
          failedConditions.push({
            productId: product.id,
            productName: product.product_name,
            supplierId: product.supplier_id,
            error: error.message
          });
        }
      } else {
        console.log(`⏭️ Einkaufsbedingung für ${product.product_name} (ID: ${product.id}) mit Lieferant ID ${product.supplier_id} existiert bereits`);
      }
    }
    
    console.log('\n=== Zusammenfassung ===');
    console.log(`Gefundene Produkte mit Lieferanten: ${productResult.rows.length}`);
    console.log(`Vorhandene Einkaufsbedingungen: ${existingConditionsResult.rows.length}`);
    console.log(`Neu erstellte Einkaufsbedingungen: ${createdConditions.length}`);
    console.log(`Fehlgeschlagene Einkaufsbedingungen: ${failedConditions.length}`);
    
    if (failedConditions.length > 0) {
      console.log('\n=== Fehlgeschlagene Einkaufsbedingungen ===');
      failedConditions.forEach(fc => {
        console.log(`- ${fc.productName} (ID: ${fc.productId}) mit Lieferant ID ${fc.supplierId}: ${fc.error}`);
      });
    }
    
  } catch (error) {
    console.error('Fehler bei der Ausführung:', error);
  } finally {
    // Datenbankverbindung schließen
    await client.end();
    console.log('Datenbankverbindung geschlossen');
  }
}

// Skript ausführen
createPurchaseConditions().catch(error => {
  console.error('Unbehandelte Ausnahme:', error);
});