/**
 * Dieses Skript wird regelmäßig ausgeführt, um abgelaufene Chargen automatisch auszubuchen.
 * Es sollte über einen Cron-Job oder einen ähnlichen Mechanismus einmal täglich ausgeführt werden.
 */

import { warehouseStorage } from "../warehouse3.storage";

async function main() {
  console.log("=== Automatische Ausbuchung abgelaufener Chargen ===");
  console.log(`Prüfung gestartet: ${new Date().toISOString()}`);
  
  try {
    // Hole alle abgelaufenen Chargen
    const expiredBatches = await warehouseStorage.getExpiredBatches();
    
    if (expiredBatches.length === 0) {
      console.log("Keine abgelaufenen Chargen gefunden.");
      return;
    }
    
    console.log(`${expiredBatches.length} abgelaufene Chargen gefunden:`);
    
    // Ausgabe der abgelaufenen Chargen
    expiredBatches.forEach(batch => {
      console.log(`- ID: ${batch.id}, Produkt: ${batch.productName}, Menge: ${batch.currentQuantity}, MHD: ${new Date(batch.expiryDate).toLocaleDateString('de-DE')}, Lager: ${batch.warehouseName}`);
    });
    
    // Ausbuchen der abgelaufenen Chargen
    await warehouseStorage.removeExpiredBatches();
    
    console.log("Ausbuchung abgeschlossen.");
  } catch (error) {
    console.error("Fehler bei der Ausbuchung abgelaufener Chargen:", error);
  }
}

// Direkte Ausführung, wenn das Skript direkt aufgerufen wird
if (require.main === module) {
  main()
    .then(() => {
      console.log("Prozess erfolgreich abgeschlossen.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fehler beim Ausführen des Prozesses:", error);
      process.exit(1);
    });
}

export default main;