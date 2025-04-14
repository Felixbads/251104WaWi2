/**
 * Direkte Datenbankbereinigung für Produktduplikate
 * 
 * Dieses Skript verwendet native PostgreSQL-Abfragen, um alle Schritte
 * der Duplikatbereinigung und Referenzaktualisierung durchzuführen.
 * 
 * Anwendung: npx tsx scripts/direct_cleanup.ts
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

/**
 * Hauptfunktion für die direkte Datenbankbereinigung
 */
async function directCleanup() {
  console.log('=====================================================');
  console.log('DIREKTE DATENBANKBEREINIGUNG FÜR PRODUKTDUPLIKATE');
  console.log('=====================================================');
  console.log('\nStarte direkte Bereinigung mit nativen SQL-Abfragen...');
  
  const startTime = Date.now();
  
  try {
    // 1. Identifiziere Duplikatgruppen
    console.log('\n1. IDENTIFIZIERE PRODUKTDUPLIKATE');
    console.log('----------------------------------');

    const duplicateGroupsResult = await db.execute(sql`
      WITH normalized_products AS (
        SELECT 
          id, 
          product_name,
          vendon_id,
          LOWER(TRIM(product_name)) as normalized_name
        FROM products
        WHERE product_name IS NOT NULL
      )
      SELECT 
        normalized_name,
        COUNT(*) as count,
        STRING_AGG(id::TEXT, ',') as product_ids,
        MAX(CASE WHEN vendon_id IS NOT NULL THEN id ELSE 0 END) as primary_with_vendon,
        MAX(id) as max_id
      FROM normalized_products
      GROUP BY normalized_name
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 15
    `);
    
    const dupGroups = duplicateGroupsResult.rows;
    console.log(`${dupGroups.length} Duplikatgruppen zur Verarbeitung ausgewählt.`);
    
    for (const group of dupGroups) {
      const normName = group.normalized_name;
      const count = parseInt(group.count);
      const productIds = group.product_ids.split(',').map(id => parseInt(id.trim()));
      
      // Wähle das primäre Produkt aus (bevorzugt mit vendon_id)
      let primaryId = parseInt(group.primary_with_vendon);
      if (primaryId === 0) {
        // Wenn kein Produkt vendon_id hat, nimm das mit der höchsten ID
        primaryId = parseInt(group.max_id);
      }
      
      const duplicateIds = productIds.filter(id => id !== primaryId);
      
      console.log(`\nProdukt "${normName}" (Primär-ID: ${primaryId}):`);
      console.log(`  - ${duplicateIds.length} von ${count} Duplikaten werden konsolidiert`);

      // 2. Aktualisiere alle Referenzen
      console.log('  - Aktualisiere Referenzen in allen Tabellen...');
      
      try {
        // Aktualisiere inventory_items
        const updatedItemsResult = await db.execute(sql`
          WITH moved_items AS (
            UPDATE inventory_items 
            SET product_id = ${primaryId}
            WHERE product_id IN (${sql.join(duplicateIds)})
            RETURNING id, product_id, warehouse_id, quantity
          )
          SELECT COUNT(*) as count FROM moved_items
        `);
        
        const itemsUpdated = parseInt(updatedItemsResult.rows[0].count);
        console.log(`  - ${itemsUpdated} inventory_items Referenzen aktualisiert`);
      } catch (error) {
        console.error(`  - Fehler beim Aktualisieren von inventory_items:`, error);
      }
      
      try {
        // Aktualisiere inventory_count_items
        const updatedCountItemsResult = await db.execute(sql`
          WITH moved_items AS (
            UPDATE inventory_count_items 
            SET product_id = ${primaryId}
            WHERE product_id IN (${sql.join(duplicateIds)})
            RETURNING id
          )
          SELECT COUNT(*) as count FROM moved_items
        `);
        
        const countItemsUpdated = parseInt(updatedCountItemsResult.rows[0].count);
        console.log(`  - ${countItemsUpdated} inventory_count_items Referenzen aktualisiert`);
      } catch (error) {
        console.error(`  - Fehler beim Aktualisieren von inventory_count_items:`, error);
      }
      
      try {
        // Konvertiere product_id zu Strings für machine_stocks
        const stringDuplicateIds = duplicateIds.map(id => id.toString());
        
        // Aktualisiere machine_stocks 
        const updatedStocksResult = await db.execute(sql`
          WITH moved_stocks AS (
            UPDATE machine_stocks 
            SET product_vendon_id = ${primaryId.toString()}
            WHERE product_vendon_id IN (${sql.join(stringDuplicateIds)})
            RETURNING id
          )
          SELECT COUNT(*) as count FROM moved_stocks
        `);
        
        const stocksUpdated = parseInt(updatedStocksResult.rows[0].count);
        console.log(`  - ${stocksUpdated} machine_stocks Referenzen aktualisiert`);
      } catch (error) {
        console.error(`  - Fehler beim Aktualisieren von machine_stocks:`, error);
      }
      
      // Aktualisiere purchase_conditions (mit korrekter SQL-Syntax)
      try {
        const updatedPCResult = await db.execute(sql`
          WITH moved_pc AS (
            UPDATE purchase_conditions 
            SET product_id = ${primaryId}
            WHERE product_id IN (${sql.join(duplicateIds)})
            RETURNING id
          )
          SELECT COUNT(*) as count FROM moved_pc
        `);
        
        const pcUpdated = parseInt(updatedPCResult.rows[0].count);
        console.log(`  - ${pcUpdated} purchase_conditions Referenzen aktualisiert`);
      } catch (error) {
        console.error(`  - Fehler beim Aktualisieren von purchase_conditions:`, error);
      }
      
      // Aktualisiere order_items, wenn es existiert
      try {
        const updatedOrderItemsResult = await db.execute(sql`
          WITH moved_items AS (
            UPDATE order_items 
            SET product_id = ${primaryId}
            WHERE product_id IN (${sql.join(duplicateIds)})
            RETURNING id
          )
          SELECT COUNT(*) as count FROM moved_items
        `);
        
        const orderItemsUpdated = parseInt(updatedOrderItemsResult.rows[0].count);
        console.log(`  - ${orderItemsUpdated} order_items Referenzen aktualisiert`);
      } catch (error) {
        // Ignorieren, da die Tabelle möglicherweise nicht existiert
      }
      
      // Identifiziere alle verbleibenden Fremdschlüsselreferenzen für Produkte
      try {
        const fkResult = await db.execute(sql`
          SELECT 
            tc.table_name, 
            kcu.column_name
          FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
          WHERE 
            tc.constraint_type = 'FOREIGN KEY' 
            AND ccu.table_name = 'products'
            AND tc.table_name NOT IN ('inventory_items', 'inventory_count_items', 'machine_stocks', 'purchase_conditions', 'order_items')
            AND tc.table_schema = 'public'
        `);
        
        // Aktualisiere die verbleibenden Tabellen dynamisch
        for (const fk of fkResult.rows) {
          const tableName = fk.table_name;
          const columnName = fk.column_name;
          
          try {
            const updateQuery = sql`
              WITH moved_refs AS (
                UPDATE "${tableName}" 
                SET "${columnName}" = ${primaryId}
                WHERE "${columnName}" IN (${sql.join(duplicateIds)})
                RETURNING id
              )
              SELECT COUNT(*) as count FROM moved_refs
            `;
            
            const updatedRefsResult = await db.execute(updateQuery);
            const refsUpdated = parseInt(updatedRefsResult.rows[0].count);
            
            if (refsUpdated > 0) {
              console.log(`  - ${refsUpdated} ${tableName} Referenzen aktualisiert`);
            }
          } catch (updateError) {
            console.error(`  - Fehler beim Aktualisieren von ${tableName}:`, updateError.message);
          }
        }
      } catch (fkError) {
        console.error(`  - Fehler beim Identifizieren weiterer Tabellen:`, fkError.message);
      }
      
      // 3. Lösche die Duplikate
      try {
        const deleteResult = await db.execute(sql`
          DELETE FROM products 
          WHERE id IN (${sql.join(duplicateIds)})
          RETURNING id
        `);
        
        const deletedCount = deleteResult.rowCount;
        console.log(`  - ${deletedCount} duplizierte Produkte erfolgreich gelöscht`);
      } catch (deleteError) {
        console.error(`  - Fehler beim Löschen der Duplikate:`, deleteError);
        
        // Versuche das einzelne Löschen, um zu sehen, welche Produkte Probleme bereiten
        console.log(`  - Versuche einzelnes Löschen, um problematische IDs zu identifizieren...`);
        
        let singleDeleteSuccess = 0;
        let singleDeleteFailure = 0;
        
        for (const id of duplicateIds) {
          try {
            await db.execute(sql`DELETE FROM products WHERE id = ${id}`);
            singleDeleteSuccess++;
          } catch (singleError) {
            singleDeleteFailure++;
            console.error(`  - Konnte Produkt ID ${id} nicht löschen: ${singleError.message}`);
            
            // Prüfe, ob es noch Referenzen gibt und zeige diese an
            try {
              const checkRefsQuery = sql`
                SELECT 
                  tc.table_name, 
                  kcu.column_name
                FROM 
                  information_schema.table_constraints AS tc 
                  JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                  JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE 
                  tc.constraint_type = 'FOREIGN KEY' 
                  AND ccu.table_name = 'products'
                  AND tc.table_schema = 'public'
              `;
              
              const refsResult = await db.execute(checkRefsQuery);
              
              for (const ref of refsResult.rows) {
                const refTable = ref.table_name;
                const refColumn = ref.column_name;
                
                const checkRefQuery = sql`
                  SELECT COUNT(*) as count 
                  FROM "${refTable}" 
                  WHERE "${refColumn}" = ${id}
                `;
                
                const refCountResult = await db.execute(checkRefQuery);
                const refCount = parseInt(refCountResult.rows[0].count);
                
                if (refCount > 0) {
                  console.log(`    * ${refCount} Referenzen in ${refTable}.${refColumn} verhindern Löschung`);
                }
              }
            } catch (refCheckError) {
              console.error(`  - Fehler beim Prüfen der Referenzen:`, refCheckError.message);
            }
          }
        }
        
        console.log(`  - Einzelnes Löschen: ${singleDeleteSuccess} erfolgreich, ${singleDeleteFailure} fehlgeschlagen`);
      }
    }
    
    // 4. Konsolidiere doppelte Lagerbestandseinträge
    console.log('\n2. KONSOLIDIERE DOPPELTE LAGERBESTANDSEINTRÄGE');
    console.log('---------------------------------------------');
    
    const duplicateInventoryResult = await db.execute(sql`
      WITH inventory_groups AS (
        SELECT 
          product_id, 
          warehouse_id,
          COUNT(*) as count,
          STRING_AGG(id::TEXT, ',') as inventory_ids,
          MAX(id) as primary_id
        FROM inventory_items
        GROUP BY product_id, warehouse_id
        HAVING COUNT(*) > 1
      )
      SELECT * FROM inventory_groups
      ORDER BY count DESC
      LIMIT 10
    `);
    
    const invGroups = duplicateInventoryResult.rows;
    console.log(`${invGroups.length} Gruppen mit doppelten Lagerbestandseinträgen gefunden.`);
    
    let totalInventoryDuplicatesRemoved = 0;
    
    for (const group of invGroups) {
      const productId = parseInt(group.product_id);
      const warehouseId = parseInt(group.warehouse_id);
      const count = parseInt(group.count);
      const primaryId = parseInt(group.primary_id);
      const allIds = group.inventory_ids.split(',').map(id => parseInt(id.trim()));
      const duplicateIds = allIds.filter(id => id !== primaryId);
      
      console.log(`\nKonsolidiere Lagerbestand für Produkt ${productId} in Lager ${warehouseId}:`);
      console.log(`  - ${count} Einträge werden zu einem zusammengeführt`);
      
      try {
        // Aktualisiere den primären Eintrag
        const updateResult = await db.execute(sql`
          UPDATE inventory_items
          SET quantity = (
            SELECT SUM(quantity)
            FROM inventory_items
            WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
          )
          WHERE id = ${primaryId}
          RETURNING quantity
        `);
        
        const newQuantity = updateResult.rows[0].quantity;
        console.log(`  - Primärer Eintrag (ID: ${primaryId}) aktualisiert mit Gesamtmenge ${newQuantity}`);
        
        // Lösche die Duplikate
        const deleteResult = await db.execute(sql`
          DELETE FROM inventory_items
          WHERE id IN (${sql.join(duplicateIds)})
          RETURNING id
        `);
        
        const deletedCount = deleteResult.rowCount;
        console.log(`  - ${deletedCount} doppelte Lagerbestandseinträge erfolgreich gelöscht`);
        
        totalInventoryDuplicatesRemoved += deletedCount;
      } catch (error) {
        console.error(`  - Fehler bei der Konsolidierung:`, error);
      }
    }
    
    // 5. Zusammenfassung
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    // Hole die aktuellen Anzahlen
    const finalProductsResult = await db.execute(sql`SELECT COUNT(*) as count FROM products`);
    const finalItemsResult = await db.execute(sql`SELECT COUNT(*) as count FROM inventory_items`);
    const dupGroupsResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM (
        SELECT 
          LOWER(TRIM(product_name)) as normalized_name,
          COUNT(*)
        FROM products
        WHERE product_name IS NOT NULL
        GROUP BY LOWER(TRIM(product_name))
        HAVING COUNT(*) > 1
      ) as dups
    `);
    
    const finalProductCount = parseInt(finalProductsResult.rows[0].count);
    const finalInventoryCount = parseInt(finalItemsResult.rows[0].count);
    const remainingDupGroups = parseInt(dupGroupsResult.rows[0].count);
    
    console.log('\n=== ZUSAMMENFASSUNG DER DIREKTEN BEREINIGUNG ===');
    console.log(`Aktuelle Anzahl Produkte: ${finalProductCount}`);
    console.log(`Aktuelle Anzahl Lagerbestandseinträge: ${finalInventoryCount}`);
    console.log(`Verbleibende Duplikatgruppen: ${remainingDupGroups}`);
    console.log(`Lagerbestandsduplikate entfernt: ${totalInventoryDuplicatesRemoved}`);
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);
    
    console.log('\nDie direkte Bereinigung wurde abgeschlossen!');
    console.log('Führen Sie dieses Skript erneut aus, um weitere Duplikate zu bereinigen.');
    
  } catch (error) {
    console.error('\nUnerwarteter Fehler bei der Bereinigung:', error);
  }
}

// Führe die Funktion aus
directCleanup().then(() => {
  console.log('Bereinigung abgeschlossen. Beende Programm...');
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});