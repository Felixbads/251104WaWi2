/**
 * Dieses Skript bereinigt und synchronisiert alle Lager im System neu.
 * Es nutzt das clean_and_resync_warehouse.js Skript für die eigentliche Arbeit.
 */

const { Pool } = require('pg');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

dotenv.config();

// Datenbankverbindung herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Holt eine Liste aller aktiven Lager aus der Datenbank
 */
async function getAllWarehouses() {
  try {
    const result = await pool.query(
      "SELECT id, name FROM warehouses WHERE status = 'active' ORDER BY id"
    );
    return result.rows;
  } catch (error) {
    console.error('Fehler beim Abrufen der Lager:', error);
    return [];
  }
}

/**
 * Bereinigt und synchronisiert ein einzelnes Lager neu
 */
function cleanAndResyncWarehouse(warehouseId) {
  console.log(`\nStarte Bereinigung und Neusynchronisierung für Lager ${warehouseId}...`);
  try {
    // Das einzelne Lager-Skript aufrufen
    const output = execSync(`node clean_and_resync_warehouse.js ${warehouseId}`, { encoding: 'utf8' });
    console.log(output);
    return true;
  } catch (error) {
    console.error(`Fehler bei der Verarbeitung von Lager ${warehouseId}:`, error.message);
    return false;
  }
}

/**
 * Hauptfunktion, die alle Lager bereinigt und neu synchronisiert
 */
async function cleanAndResyncAllWarehouses() {
  try {
    console.log('=== Bereinigung und Neusynchronisierung aller Lager ===');
    
    // Alle Lager abrufen
    const warehouses = await getAllWarehouses();
    console.log(`${warehouses.length} aktive Lager gefunden.`);
    
    if (warehouses.length === 0) {
      console.log('Keine Lager zum Bereinigen gefunden.');
      return;
    }
    
    // Statistik für die Zusammenfassung
    let successCount = 0;
    let failureCount = 0;
    
    // Jedes Lager einzeln verarbeiten
    for (const warehouse of warehouses) {
      console.log(`\n----- Verarbeite Lager ${warehouse.id}: ${warehouse.name} -----`);
      const success = cleanAndResyncWarehouse(warehouse.id);
      
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
    
    // Zusammenfassung ausgeben
    console.log('\n=== Zusammenfassung ===');
    console.log(`Gesamt: ${warehouses.length} Lager`);
    console.log(`Erfolgreiche Bereinigungen: ${successCount}`);
    console.log(`Fehlgeschlagene Bereinigungen: ${failureCount}`);
    console.log('Bereinigung und Neusynchronisierung aller Lager abgeschlossen.');
    
  } catch (error) {
    console.error('Unerwarteter Fehler:', error);
  } finally {
    // Verbindung schließen
    await pool.end();
  }
}

// Programm ausführen
cleanAndResyncAllWarehouses().catch(error => {
  console.error('Schwerwiegender Fehler:', error);
  process.exit(1);
});