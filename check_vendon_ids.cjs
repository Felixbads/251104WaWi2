/**
 * Überprüft die Vendon-IDs in der Excel-Datei auf Duplikate
 */

const fs = require('fs');
const xlsx = require('xlsx');

// Konfiguration
const CONFIG = {
  excelFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  logFilePath: './check_vendon_ids.log'
};

// Logging-Funktion
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Duplikate in einer Excel-Datei analysieren
function analyzeDuplicates(filePath) {
  log(`Analysiere Datei: ${filePath}`);
  
  // Excel-Datei laden
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Konvertiere in JSON
  const data = xlsx.utils.sheet_to_json(worksheet);
  
  log(`Gefundene Zeilen: ${data.length}`);
  
  // Log Spaltennamen des ersten Datensatzes zur Überprüfung
  if (data.length > 0) {
    log(`Spalten des ersten Datensatzes: ${JSON.stringify(Object.keys(data[0]))}`);
  }
  
  // Zähle Vendon IDs
  const vendonIdMap = new Map();
  const vendonIdDateMap = new Map();
  
  // Zählen der Duplikate
  data.forEach(row => {
    const vendonId = row['Vendon ID']?.toString() || '';
    const dateTime = row['Date / Time'] || '';
    
    // Vendon ID zählen
    if (vendonId) {
      const count = vendonIdMap.get(vendonId) || 0;
      vendonIdMap.set(vendonId, count + 1);
      
      // Vendon ID + Datum
      const compositeKey = `${vendonId}-${dateTime}`;
      const dateCount = vendonIdDateMap.get(compositeKey) || 0;
      vendonIdDateMap.set(compositeKey, dateCount + 1);
    }
  });
  
  // Analysiere Ergebnisse
  log(`Eindeutige Vendon IDs: ${vendonIdMap.size}`);
  
  // Finde häufigste Duplikate
  const sortedVendonIds = [...vendonIdMap.entries()]
    .sort((a, b) => b[1] - a[1]);
  
  log(`\nTop 5 häufigste Vendon IDs:`);
  sortedVendonIds.slice(0, 5).forEach(([id, count]) => {
    log(`- ID ${id}: ${count} Vorkommen`);
  });
  
  // Analysiere Kombinationen aus Vendon ID + Datum
  log(`\nEindeutige Kombinationen von Vendon ID + Datum: ${vendonIdDateMap.size}`);
  
  // Finde Kombinations-Duplikate
  const combinationDuplicates = [...vendonIdDateMap.entries()]
    .filter(([_, count]) => count > 1);
    
  if (combinationDuplicates.length > 0) {
    log(`\nWarnung: ${combinationDuplicates.length} Kombinationen aus Vendon ID + Datum kommen mehrfach vor`);
    combinationDuplicates.slice(0, 5).forEach(([key, count]) => {
      log(`- ${key}: ${count} Vorkommen`);
    });
  } else {
    log(`\nKeine Duplikate in der Kombination Vendon ID + Datum gefunden.`);
  }
  
  // Prüfe, ob die Kombination aus Vendon ID + Datum eindeutig ist
  if (data.length === vendonIdDateMap.size) {
    log(`\nErgebnis: Die Kombination aus Vendon ID + Datum ist eindeutig.`);
  } else {
    log(`\nErgebnis: Die Kombination aus Vendon ID + Datum ist NICHT eindeutig.`);
    log(`  - Zeilen gesamt: ${data.length}`);
    log(`  - Eindeutige Kombinationen: ${vendonIdDateMap.size}`);
    log(`  - Differenz: ${data.length - vendonIdDateMap.size}`);
  }
  
  return {
    totalRows: data.length,
    uniqueVendonIds: vendonIdMap.size,
    uniqueCombinations: vendonIdDateMap.size,
    topDuplicates: sortedVendonIds.slice(0, 5)
  };
}

// Hauptfunktion
function main() {
  try {
    log('=== ANALYSE DER VENDON IDs ===');
    const results = analyzeDuplicates(CONFIG.excelFilePath);
    log('\nAnalyse abgeschlossen.');
  } catch (error) {
    log(`Fehler bei der Analyse: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
  }
}

// Skript ausführen
main();