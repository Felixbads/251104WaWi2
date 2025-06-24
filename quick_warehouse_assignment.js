/**
 * Schnelle Lager-Automat-Zuordnung
 * Dieses Skript ordnet Automaten basierend auf ihrer geografischen Nähe zu Lagern zu
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { machines, warehouses, machineWarehouseAssignments } from './shared/schema.ts';
import { eq, and, notExists } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL Umgebungsvariable nicht gesetzt');
  process.exit(1);
}

const sql = postgres(connectionString);
const db = drizzle(sql);

/**
 * Einfache Zuordnung basierend auf Maschinennamen zu Lagerstandorten
 */
const locationMappings = {
  // Bahnhof Lager (ID: 3)
  'bahnhof': 3,
  'dresden': 3,
  'pirna': 3,
  
  // Stolpen Lager (ID: 4) 
  'stolpen': 4,
  'papstdorf': 4,
  'struppen': 4,
  
  // Bad Gottleuba Lager (ID: 5)
  'gottleuba': 5,
  'bad gottleuba': 5,
  'berggießhübel': 5,
  
  // Hohenstein Lager (ID: 6)
  'hohenstein': 6,
  'hohnstein': 6,
  'rathmannsdorf': 6
};

/**
 * Ordnet einen Automaten einem Lager basierend auf dem Standortnamen zu
 */
function assignWarehouseByLocation(machineName, locationName) {
  const searchText = `${machineName} ${locationName}`.toLowerCase();
  
  for (const [keyword, warehouseId] of Object.entries(locationMappings)) {
    if (searchText.includes(keyword)) {
      return warehouseId;
    }
  }
  
  // Standardzuordnung zu Bahnhof Lager
  return 3;
}

/**
 * Führt die schnelle Zuordnung durch
 */
async function performQuickAssignment() {
  try {
    console.log('Lade alle Automaten...');
    
    // Lade alle Automaten
    const allMachines = await db.select().from(machines);
    console.log(`Gefunden: ${allMachines.length} Automaten`);
    
    // Lade alle Lager
    const allWarehouses = await db.select().from(warehouses);
    console.log(`Verfügbare Lager: ${allWarehouses.length}`);
    allWarehouses.forEach(w => console.log(`- ${w.name} (ID: ${w.id})`));
    
    let assignmentCount = 0;
    let skippedCount = 0;
    
    for (const machine of allMachines) {
      // Prüfe, ob bereits eine Zuordnung existiert
      const existingAssignment = await db.select()
        .from(machineWarehouseAssignments)
        .where(eq(machineWarehouseAssignments.machineId, machine.id))
        .limit(1);
      
      if (existingAssignment.length > 0) {
        skippedCount++;
        continue;
      }
      
      // Bestimme Lagerzuordnung
      const warehouseId = assignWarehouseByLocation(
        machine.machineName || '', 
        machine.locationName || ''
      );
      
      // Erstelle Zuordnung
      await db.insert(machineWarehouseAssignments).values({
        machineId: machine.id,
        warehouseId: warehouseId,
        assignedAt: new Date(),
        assignedBy: 1, // Admin-Benutzer
        status: 'active'
      });
      
      console.log(`✓ Automat "${machine.machineName}" (${machine.locationName}) → Lager ${warehouseId}`);
      assignmentCount++;
    }
    
    console.log(`\nZuordnung abgeschlossen:`);
    console.log(`- ${assignmentCount} neue Zuordnungen erstellt`);
    console.log(`- ${skippedCount} bereits zugeordnete Automaten übersprungen`);
    
    // Zeige finale Statistik
    const finalStats = await db.select({
      warehouseId: warehouses.id,
      warehouseName: warehouses.name,
      machineCount: sql`COUNT(${machineWarehouseAssignments.machineId})::int`
    })
    .from(warehouses)
    .leftJoin(machineWarehouseAssignments, eq(warehouses.id, machineWarehouseAssignments.warehouseId))
    .groupBy(warehouses.id, warehouses.name)
    .orderBy(warehouses.id);
    
    console.log('\nFinale Lagerstatistik:');
    finalStats.forEach(stat => {
      console.log(`- ${stat.warehouseName}: ${stat.machineCount} Automaten`);
    });
    
  } catch (error) {
    console.error('Fehler bei der Zuordnung:', error);
  } finally {
    await sql.end();
  }
}

// Führe Zuordnung aus
performQuickAssignment();