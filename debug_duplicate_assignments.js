
/**
 * DEBUG SCRIPT: Analyse doppelter Automaten-Lager-Zuordnungen
 * 
 * Dieser Script analysiert und behebt das Problem mit mehrfachen/doppelten 
 * Standorten bei Automaten-Lager-Zuordnungen.
 */

import { db } from './server/db.js';
import { machineWarehouseAssignments, machines, warehouses } from './shared/schema.js';
import { eq, and, or, sql } from 'drizzle-orm';

/**
 * 1. PROBLEM-ANALYSE: Warum entstehen doppelte Zuordnungen?
 */
async function analyzeDuplicateAssignments() {
  console.log('🔍 ANALYSE: Doppelte Automaten-Lager-Zuordnungen');
  console.log('='.repeat(60));

  // 1. Finde Automaten mit mehrfachen Zuordnungen
  const duplicateMachineAssignments = await db
    .select({
      machineId: machineWarehouseAssignments.machineId,
      count: sql`COUNT(*)`
    })
    .from(machineWarehouseAssignments)
    .groupBy(machineWarehouseAssignments.machineId)
    .having(sql`COUNT(*) > 1`);

  console.log(`❌ Automaten mit mehrfachen Zuordnungen: ${duplicateMachineAssignments.length}`);

  for (const duplicate of duplicateMachineAssignments) {
    // Hole Details zu den Duplikaten
    const assignments = await db
      .select({
        assignment: machineWarehouseAssignments,
        machine: machines,
        warehouse: warehouses
      })
      .from(machineWarehouseAssignments)
      .leftJoin(machines, eq(machineWarehouseAssignments.machineId, machines.id))
      .leftJoin(warehouses, eq(machineWarehouseAssignments.warehouseId, warehouses.id))
      .where(eq(machineWarehouseAssignments.machineId, duplicate.machineId));

    console.log(`\n🤖 Automat ID ${duplicate.machineId}:`);
    console.log(`   Name: ${assignments[0]?.machine?.machineName || 'Unbekannt'}`);
    console.log(`   Standort: ${assignments[0]?.machine?.locationName || 'Unbekannt'}`);
    console.log(`   Anzahl Zuordnungen: ${duplicate.count}`);
    
    assignments.forEach((assignment, index) => {
      console.log(`   Zuordnung ${index + 1}:`);
      console.log(`     - Lager: ${assignment.warehouse?.name || 'Unbekannt'}`);
      console.log(`     - Primary: ${assignment.assignment.isPrimary}`);
      console.log(`     - Erstellt: ${assignment.assignment.createdAt}`);
      console.log(`     - ID: ${assignment.assignment.id}`);
    });
  }

  // 2. Finde Lager-Automat Kombinationen, die mehrfach existieren
  const duplicateWarehouseMachineCombo = await db
    .select({
      machineId: machineWarehouseAssignments.machineId,
      warehouseId: machineWarehouseAssignments.warehouseId,
      count: sql`COUNT(*)`
    })
    .from(machineWarehouseAssignments)
    .groupBy(machineWarehouseAssignments.machineId, machineWarehouseAssignments.warehouseId)
    .having(sql`COUNT(*) > 1`);

  console.log(`\n❌ Exakt gleiche Lager-Automat-Kombinationen: ${duplicateWarehouseMachineCombo.length}`);

  // 3. Analysiere warum Duplikate entstehen
  console.log('\n📋 URSACHEN-ANALYSE:');
  console.log('1. Mehrfache Ausführung von warehouseReconciliation.ts');
  console.log('2. Fehlende UNIQUE-Constraints in der Datenbank');
  console.log('3. Race Conditions bei parallelen Zuordnungen');
  console.log('4. Nicht aufgeräumte Test-/Demo-Daten');

  return { duplicateMachineAssignments, duplicateWarehouseMachineCombo };
}

/**
 * 2. AUTOMATISCHE BEREINIGUNG
 */
async function cleanupDuplicateAssignments() {
  console.log('\n🧹 BEREINIGUNG: Entferne doppelte Zuordnungen');
  console.log('='.repeat(60));

  let cleanedCount = 0;

  // Finde alle Automaten mit mehrfachen Zuordnungen
  const duplicates = await db
    .select({
      machineId: machineWarehouseAssignments.machineId,
      warehouseId: machineWarehouseAssignments.warehouseId,
      count: sql`COUNT(*)`,
      ids: sql`ARRAY_AGG(id ORDER BY created_at ASC)`
    })
    .from(machineWarehouseAssignments)
    .groupBy(machineWarehouseAssignments.machineId, machineWarehouseAssignments.warehouseId)
    .having(sql`COUNT(*) > 1`);

  for (const duplicate of duplicates) {
    // Behalte nur die neueste Zuordnung, entferne alle älteren
    const idsToDelete = duplicate.ids.slice(0, -1); // Alle außer dem letzten (neuesten)
    
    if (idsToDelete.length > 0) {
      await db
        .delete(machineWarehouseAssignments)
        .where(sql`id = ANY(${idsToDelete})`);
      
      console.log(`✅ Entfernt ${idsToDelete.length} Duplikate für Automat ${duplicate.machineId} -> Lager ${duplicate.warehouseId}`);
      cleanedCount += idsToDelete.length;
    }
  }

  console.log(`\n🎉 Bereinigung abgeschlossen! ${cleanedCount} Duplikate entfernt.`);
  return cleanedCount;
}

/**
 * 3. PRÄVENTIVE MASSNAHMEN
 */
async function implementPreventiveMeasures() {
  console.log('\n🛡️ PRÄVENTIVE MASSNAHMEN');
  console.log('='.repeat(60));

  // 1. Füge UNIQUE Constraint hinzu (falls noch nicht vorhanden)
  try {
    await db.execute(sql`
      ALTER TABLE machine_warehouse_assignments_v3 
      ADD CONSTRAINT unique_machine_warehouse 
      UNIQUE (machine_id, warehouse_id)
    `);
    console.log('✅ UNIQUE Constraint hinzugefügt');
  } catch (error) {
    console.log('ℹ️ UNIQUE Constraint bereits vorhanden oder Fehler:', error.message);
  }

  // 2. Erstelle Index für bessere Performance
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_machine_warehouse_assignments_machine_id 
      ON machine_warehouse_assignments_v3 (machine_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_machine_warehouse_assignments_warehouse_id 
      ON machine_warehouse_assignments_v3 (warehouse_id)
    `);
    console.log('✅ Performance-Indizes erstellt');
  } catch (error) {
    console.log('⚠️ Index-Erstellung fehlgeschlagen:', error.message);
  }

  console.log('\n📋 EMPFOHLENE CODE-ÄNDERUNGEN:');
  console.log('1. warehouseReconciliation.ts: Prüfung auf existierende Zuordnungen vor Erstellung');
  console.log('2. machine-warehouse-assignments.ts: Verwendung von UPSERT statt INSERT');
  console.log('3. Implementierung von Locking-Mechanismen bei kritischen Operationen');
}

/**
 * 4. VOLLSTÄNDIGE DIAGNOSE UND BEREINIGUNG
 */
async function runCompleteDiagnostic() {
  try {
    console.log('🚀 STARTE VOLLSTÄNDIGE DIAGNOSE UND BEREINIGUNG');
    console.log('='.repeat(80));

    // Schritt 1: Analysiere das Problem
    const analysis = await analyzeDuplicateAssignments();
    
    // Schritt 2: Bereinige Duplikate
    const cleanedCount = await cleanupDuplicateAssignments();
    
    // Schritt 3: Implementiere präventive Maßnahmen
    await implementPreventiveMeasures();
    
    // Schritt 4: Finale Validierung
    console.log('\n✅ FINALE VALIDIERUNG');
    console.log('='.repeat(60));
    const finalAnalysis = await analyzeDuplicateAssignments();
    
    if (finalAnalysis.duplicateMachineAssignments.length === 0 && 
        finalAnalysis.duplicateWarehouseMachineCombo.length === 0) {
      console.log('🎉 ERFOLG: Keine Duplikate mehr gefunden!');
    } else {
      console.log('⚠️ WARNUNG: Noch Duplikate vorhanden, manuelle Überprüfung nötig');
    }

    return {
      duplicatesFound: analysis.duplicateMachineAssignments.length + analysis.duplicateWarehouseMachineCombo.length,
      duplicatesCleaned: cleanedCount,
      success: finalAnalysis.duplicateMachineAssignments.length === 0
    };

  } catch (error) {
    console.error('❌ Fehler bei der Diagnose:', error);
    throw error;
  }
}

// Wenn direkt ausgeführt
if (import.meta.url === `file://${process.argv[1]}`) {
  runCompleteDiagnostic()
    .then(result => {
      console.log('\n📊 ZUSAMMENFASSUNG:');
      console.log(`   Duplikate gefunden: ${result.duplicatesFound}`);
      console.log(`   Duplikate bereinigt: ${result.duplicatesCleaned}`);
      console.log(`   Erfolgreich: ${result.success ? 'JA' : 'NEIN'}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Kritischer Fehler:', error);
      process.exit(1);
    });
}

export { 
  analyzeDuplicateAssignments, 
  cleanupDuplicateAssignments, 
  implementPreventiveMeasures, 
  runCompleteDiagnostic 
};
