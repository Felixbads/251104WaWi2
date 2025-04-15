/**
 * Hauptskript zur vollständigen Bereinigung der Produktdatenbank
 * Führt die folgenden Schritte aus:
 * 1. Verbessert die Produkttabelle mit normalisierten Namen
 * 2. Bereinigt bestehende Duplikate
 */

import { rawDb } from "../server/db";
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runFullProductCleanup() {
  console.log("=============================================================");
  console.log("STARTE VOLLSTÄNDIGE PRODUKTDATENBANK-BEREINIGUNG");
  console.log("=============================================================");
  
  try {
    // 1. Führe duplicate_prevention.ts aus (Datenbankverbesserung)
    console.log("\n----- SCHRITT 1: DATENBANK-VERBESSERUNGEN -----");
    
    const preventionScript = path.join(__dirname, 'duplicate_prevention.ts');
    console.log(`Führe aus: ${preventionScript}`);
    
    try {
      const { stdout: preventionOutput } = await execAsync(`npx tsx ${preventionScript}`);
      console.log(preventionOutput);
    } catch (preventionError: any) {
      console.error("Fehler bei Datenbank-Verbesserungen:", preventionError.message);
      console.error(preventionError.stderr);
      return;
    }
    
    // 2. Führe cleanup_duplicates.ts aus (Duplikatbereinigung)
    console.log("\n----- SCHRITT 2: DUPLIKATBEREINIGUNG -----");
    
    const cleanupScript = path.join(__dirname, 'cleanup_duplicates.ts');
    console.log(`Führe aus: ${cleanupScript}`);
    
    try {
      const { stdout: cleanupOutput } = await execAsync(`npx tsx ${cleanupScript}`);
      console.log(cleanupOutput);
    } catch (cleanupError: any) {
      console.error("Fehler bei Duplikatbereinigung:", cleanupError.message);
      console.error(cleanupError.stderr);
      return;
    }
    
    // 3. Aktualisiere die Produktzähler in der Datenbank
    console.log("\n----- SCHRITT 3: PRODUKTSTATISTIKEN AKTUALISIEREN -----");
    
    const updateStatsQuery = `
      UPDATE system_stats 
      SET value = (SELECT COUNT(*) FROM products), 
          last_updated = NOW() 
      WHERE key = 'products_count'
    `;
    
    await rawDb.query(updateStatsQuery);
    console.log("✅ Produktstatistiken erfolgreich aktualisiert");
    
    // 4. Abschließende Statistiken zeigen
    console.log("\n----- ABSCHLUSSBERICHT -----");
    
    const productCountQuery = `SELECT COUNT(*) FROM products`;
    const uniqueNamesQuery = `
      SELECT COUNT(DISTINCT normalized_name) 
      FROM products 
      WHERE normalized_name IS NOT NULL
    `;
    
    const [countResult, uniqueResult] = await Promise.all([
      rawDb.query(productCountQuery),
      rawDb.query(uniqueNamesQuery)
    ]);
    
    const totalProducts = parseInt(countResult.rows[0].count);
    const uniqueProducts = parseInt(uniqueResult.rows[0].count);
    
    console.log(`Gesamtzahl Produkte in der Datenbank: ${totalProducts}`);
    console.log(`Anzahl eindeutiger Produktnamen: ${uniqueProducts}`);
    
    if (totalProducts === uniqueProducts) {
      console.log("\n✅✅✅ ERFOLG: Es wurden alle Duplikate entfernt! ✅✅✅");
    } else {
      console.log(`\n⚠️ HINWEIS: Es gibt noch ${totalProducts - uniqueProducts} Duplikate in der Datenbank.`);
      console.log("Möglicherweise waren einige Duplikate nicht vollständig normalisierbar.");
      console.log("Sie können das Skript erneut ausführen, um weitere Versuche zu unternehmen.");
    }
    
    console.log("\n=============================================================");
    console.log("PRODUKTDATENBANK-BEREINIGUNG ABGESCHLOSSEN");
    console.log("=============================================================");
    
  } catch (error: any) {
    console.error("Kritischer Fehler bei der Produktbereinigung:", error.message);
  }
}

// Skript ausführen
runFullProductCleanup().then(() => {
  console.log("Prozess beendet.");
  process.exit(0);
}).catch(err => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});