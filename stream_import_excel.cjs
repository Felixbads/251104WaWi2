/**
 * Durchgängiges Skript für den Import von Excel-Dateien in die Datenbank
 * Dieses Skript kombiniert die Konvertierung und den Import in einem Durchlauf
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const axios = require('axios');

// Konfiguration
const CONFIG = {
  sourceFile: null,
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  tempDir: './json_chunks_temp',
  batchSize: 25,
  delayBetweenRequests: 2000, // 2 Sekunden Pause zwischen API-Anfragen
  logFile: './excel_import.log',
  cleanup: true // Temporäre JSON-Dateien nach dem Import löschen
};

// Statistiken
const stats = {
  excelRows: {
    total: 0,
    processed: 0,
    valid: 0,
    invalid: 0
  },
  api: {
    batches: 0,
    successful: 0,
    failed: 0,
    savedRecords: 0,
    duplicates: 0,
    errors: 0
  },
  timings: {
    start: null,
    end: null,
    conversion: {
      start: null,
      end: null
    },
    import: {
      start: null,
      end: null
    }
  }
};

/**
 * Normalisiert und validiert einen Excel-Datensatz
 * @param {Object} row - Rohdaten aus Excel
 * @param {number} index - Zeilenindex im Excel
 * @returns {Object|null} - Normalisierter Datensatz oder null bei ungültigen Daten
 */
function normalizeRow(row, index) {
  try {
    // Fallback für fehlende Werte
    const vendonId = `imported-${new Date().toISOString().replace(/[:.]/g, '-')}-unknown-${index}`;
    const importDate = new Date().toISOString();
    
    // Standardwerte für den normalisierten Datensatz
    const normalizedRow = {
      vendonId: vendonId,
      datetime: importDate,
      machineName: null,
      productId: null,
      productName: null,
      quantity: 1,
      price: 0,
      priceWoVat: null,
      vat: null,
      currency: "EUR",
      source: "excel-import",
      metadata: JSON.stringify({
        importedFromExcel: true,
        importDate: importDate,
        originalRow: index
      }),
      status: "completed",
      processingStatus: "processed",
      syncedAt: importDate,
      createdAt: importDate
    };
    
    // Hier können weitere Felder aus den Excel-Daten extrahiert werden
    // Beispiel: Wenn Excel Spalten für Produkt, Preis usw. enthält
    if (row['Product Name']) {
      normalizedRow.productName = row['Product Name'];
    }
    
    if (row['Price']) {
      const price = parseFloat(row['Price']);
      if (!isNaN(price)) {
        normalizedRow.price = price;
      }
    }
    
    if (row['Machine Name'] || row['Machine']) {
      normalizedRow.machineName = row['Machine Name'] || row['Machine'];
    }
    
    if (row['Transaction Date'] || row['Date']) {
      try {
        // Konvertiere Excel-Datum in ISO-String
        const dateValue = row['Transaction Date'] || row['Date'];
        if (dateValue) {
          let transactionDate;
          
          // Prüfen ob es sich um eine Excel-Seriennummer handelt
          if (typeof dateValue === 'number') {
            transactionDate = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
          } else if (typeof dateValue === 'string') {
            // Versuche, das Datum als String zu parsen
            transactionDate = new Date(dateValue);
          }
          
          if (transactionDate && !isNaN(transactionDate.getTime())) {
            normalizedRow.datetime = transactionDate.toISOString();
            // Aktualisiere auch die Metadaten
            const metadata = JSON.parse(normalizedRow.metadata);
            metadata.originalDate = normalizedRow.datetime;
            normalizedRow.metadata = JSON.stringify(metadata);
          }
        }
      } catch (error) {
        // Bei Fehlern beim Datumsparsen: Behalte den Standard-Zeitstempel
        console.warn(`Warnung: Konnte Datum in Zeile ${index + 1} nicht parsen:`, error.message);
      }
    }
    
    return normalizedRow;
  } catch (error) {
    console.error(`Fehler bei der Normalisierung von Zeile ${index + 1}:`, error.message);
    return null;
  }
}

/**
 * Importiert einen Batch von Transaktionen über die API
 * @param {Array} transactions - Array von Transaktionsobjekten
 * @param {number} batchNumber - Batch-Nummer für die Protokollierung
 * @returns {Promise<Object>} - Ergebnisobjekt mit Status und Statistiken
 */
async function importBatch(transactions, batchNumber) {
  try {
    console.log(`Importiere Batch ${batchNumber} mit ${transactions.length} Transaktionen...`);
    
    // API-Anfrage senden
    const response = await axios.post(CONFIG.apiEndpoint, {
      transactions,
      validate: true,
      allowDuplicates: false
    });
    
    // Ergebnis verarbeiten
    const result = response.data || {};
    const saved = result.saved || 0;
    const duplicates = result.duplicates || 0;
    const errors = result.errors || 0;
    
    console.log(`Batch ${batchNumber} importiert: ${saved} gespeichert, ${duplicates} Duplikate, ${errors} Fehler`);
    
    // Statistiken aktualisieren
    stats.api.successful++;
    stats.api.savedRecords += saved;
    stats.api.duplicates += duplicates;
    stats.api.errors += errors;
    
    // Log-Eintrag
    fs.appendFileSync(CONFIG.logFile, `\n----- Batch ${batchNumber} -----\n`);
    fs.appendFileSync(CONFIG.logFile, `Status: Erfolgreich\n`);
    fs.appendFileSync(CONFIG.logFile, `Transaktionen: ${transactions.length}\n`);
    fs.appendFileSync(CONFIG.logFile, `Gespeichert: ${saved}\n`);
    fs.appendFileSync(CONFIG.logFile, `Duplikate: ${duplicates}\n`);
    fs.appendFileSync(CONFIG.logFile, `Fehler: ${errors}\n`);
    
    return { success: true, saved, duplicates, errors };
  } catch (error) {
    console.error(`Fehler beim Import von Batch ${batchNumber}:`);
    
    stats.api.failed++;
    
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Fehler: ${JSON.stringify(error.response.data)}`);
      
      // Log-Eintrag
      fs.appendFileSync(CONFIG.logFile, `\n----- Batch ${batchNumber} -----\n`);
      fs.appendFileSync(CONFIG.logFile, `Status: Fehler (HTTP ${error.response.status})\n`);
      fs.appendFileSync(CONFIG.logFile, `Fehler: ${JSON.stringify(error.response.data)}\n`);
    } else {
      console.error(`  Fehler: ${error.message}`);
      
      // Log-Eintrag
      fs.appendFileSync(CONFIG.logFile, `\n----- Batch ${batchNumber} -----\n`);
      fs.appendFileSync(CONFIG.logFile, `Status: Fehler\n`);
      fs.appendFileSync(CONFIG.logFile, `Fehler: ${error.message}\n`);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Liest eine Excel-Datei, konvertiert die Daten und importiert sie direkt
 * @returns {Promise<void>}
 */
async function streamExcelImport() {
  console.log(`Verarbeite Excel-Datei: ${CONFIG.sourceFile}`);
  
  // Startzeit für die Konvertierung
  stats.timings.conversion.start = new Date();
  console.log(`Excel-Konvertierung gestartet: ${stats.timings.conversion.start.toISOString()}`);
  
  try {
    // Excel-Datei laden
    console.log('Lese Excel-Datei...');
    const workbook = XLSX.readFile(CONFIG.sourceFile);
    const sheetName = workbook.SheetNames[0]; // Erste Arbeitsmappe
    const worksheet = workbook.Sheets[sheetName];
    
    // In JSON konvertieren
    const rows = XLSX.utils.sheet_to_json(worksheet);
    stats.excelRows.total = rows.length;
    
    console.log(`Excel-Datei geladen: ${stats.excelRows.total} Zeilen gefunden`);
    
    // Endezeit für die Konvertierung
    stats.timings.conversion.end = new Date();
    const conversionDurationSec = ((stats.timings.conversion.end - stats.timings.conversion.start) / 1000).toFixed(2);
    console.log(`Excel-Datei in ${conversionDurationSec} Sekunden geladen.`);
    
    // Startzeit für den Import
    stats.timings.import.start = new Date();
    console.log(`Datenbankimport gestartet: ${stats.timings.import.start.toISOString()}`);
    
    // Arrays für Batches
    let currentBatch = [];
    let batchNumber = 1;
    
    // Log-Eintrag für den Import
    fs.appendFileSync(CONFIG.logFile, `\n===== IMPORT GESTARTET =====\n`);
    fs.appendFileSync(CONFIG.logFile, `Zeitstempel: ${stats.timings.import.start.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Excel-Zeilen: ${stats.excelRows.total}\n`);
    fs.appendFileSync(CONFIG.logFile, `Batch-Größe: ${CONFIG.batchSize}\n`);
    fs.appendFileSync(CONFIG.logFile, `API-Endpunkt: ${CONFIG.apiEndpoint}\n`);
    
    // Fortschrittsbalken
    const totalBatches = Math.ceil(stats.excelRows.total / 1000);
    let currentBatchGroup = 0;
    
    // Verarbeite die Daten in Gruppen für besseres Memory-Management
    for (let i = 0; i < rows.length; i += 1000) {
      currentBatchGroup++;
      const batchGroupEnd = Math.min(i + 1000, rows.length);
      console.log(`Verarbeite Batch-Gruppe ${currentBatchGroup}/${totalBatches} (Zeilen ${i+1}-${batchGroupEnd})...`);
      
      // Verarbeite jede Zeile in der Gruppe
      for (let j = i; j < batchGroupEnd; j++) {
        const row = rows[j];
        stats.excelRows.processed++;
        
        // Normalisiere und validiere die Zeile
        const normalizedRow = normalizeRow(row, j);
        
        if (normalizedRow) {
          stats.excelRows.valid++;
          currentBatch.push(normalizedRow);
          
          // Wenn der Batch voll ist, importiere ihn
          if (currentBatch.length >= CONFIG.batchSize) {
            stats.api.batches++;
            
            // Importiere den Batch
            await importBatch(currentBatch, batchNumber);
            
            // Warte vor dem nächsten Import
            if (j < rows.length - 1) {
              console.log(`Warte ${CONFIG.delayBetweenRequests / 1000} Sekunden vor dem nächsten Batch...`);
              await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
            }
            
            // Zurücksetzen für den nächsten Batch
            currentBatch = [];
            batchNumber++;
          }
        } else {
          stats.excelRows.invalid++;
        }
      }
      
      // Fortschritt anzeigen
      const progress = (stats.excelRows.processed / stats.excelRows.total * 100).toFixed(2);
      console.log(`Fortschritt: ${progress}% (${stats.excelRows.processed}/${stats.excelRows.total} Zeilen)`);
    }
    
    // Verbleibende Daten als letzten Batch importieren, falls vorhanden
    if (currentBatch.length > 0) {
      stats.api.batches++;
      await importBatch(currentBatch, batchNumber);
    }
    
    // Endezeit für den Import
    stats.timings.import.end = new Date();
    const importDurationSec = ((stats.timings.import.end - stats.timings.import.start) / 1000).toFixed(2);
    
    console.log(`\nDatenbankimport abgeschlossen in ${importDurationSec} Sekunden`);
    console.log(`- Verarbeitete Batches: ${stats.api.batches}`);
    console.log(`- Erfolgreiche Importe: ${stats.api.successful}`);
    console.log(`- Fehlgeschlagene Importe: ${stats.api.failed}`);
    console.log(`- Gespeicherte Datensätze: ${stats.api.savedRecords}`);
    console.log(`- Duplikate: ${stats.api.duplicates}`);
    console.log(`- Fehler: ${stats.api.errors}`);
    
    // Log-Eintrag
    fs.appendFileSync(CONFIG.logFile, `\n===== IMPORT ABGESCHLOSSEN =====\n`);
    fs.appendFileSync(CONFIG.logFile, `Zeitstempel: ${stats.timings.import.end.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Dauer: ${importDurationSec} Sekunden\n`);
    fs.appendFileSync(CONFIG.logFile, `Verarbeitete Batches: ${stats.api.batches}\n`);
    fs.appendFileSync(CONFIG.logFile, `Erfolgreiche Importe: ${stats.api.successful}\n`);
    fs.appendFileSync(CONFIG.logFile, `Fehlgeschlagene Importe: ${stats.api.failed}\n`);
    fs.appendFileSync(CONFIG.logFile, `Gespeicherte Datensätze: ${stats.api.savedRecords}\n`);
    fs.appendFileSync(CONFIG.logFile, `Duplikate: ${stats.api.duplicates}\n`);
    fs.appendFileSync(CONFIG.logFile, `Fehler: ${stats.api.errors}\n`);
    
  } catch (error) {
    console.error('Fehler bei der Excel-Verarbeitung:');
    console.error(error);
    
    fs.appendFileSync(CONFIG.logFile, `\n===== KRITISCHER FEHLER =====\n`);
    fs.appendFileSync(CONFIG.logFile, `Zeitstempel: ${new Date().toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Fehler: ${error.message}\n`);
    fs.appendFileSync(CONFIG.logFile, `Stack: ${error.stack}\n`);
    
    throw error; // Weitergabe des Fehlers
  }
}

/**
 * Hauptfunktion für den Import
 */
async function main() {
  stats.timings.start = new Date();
  console.log(`Excel-Import gestartet: ${stats.timings.start.toISOString()}`);
  
  // Prüfe, ob eine Quelldatei angegeben wurde
  if (!CONFIG.sourceFile) {
    console.error('Keine Excel-Quelldatei angegeben. Verwende --source=pfad/zur/datei.xlsx');
    process.exit(1);
  }
  
  // Prüfe, ob die Quelldatei existiert
  if (!fs.existsSync(CONFIG.sourceFile)) {
    console.error(`Die angegebene Quelldatei existiert nicht: ${CONFIG.sourceFile}`);
    process.exit(1);
  }
  
  // Prüfe, ob es sich um eine Excel-Datei handelt
  const fileExt = path.extname(CONFIG.sourceFile).toLowerCase();
  if (fileExt !== '.xlsx' && fileExt !== '.xls') {
    console.error(`Die angegebene Datei ist keine Excel-Datei: ${CONFIG.sourceFile}`);
    process.exit(1);
  }
  
  // Initialisiere Log-Datei
  fs.writeFileSync(CONFIG.logFile, `Excel-zu-Datenbank-Import gestartet: ${stats.timings.start.toISOString()}\n`);
  fs.appendFileSync(CONFIG.logFile, `Quelldatei: ${CONFIG.sourceFile}\n`);
  fs.appendFileSync(CONFIG.logFile, `API-Endpunkt: ${CONFIG.apiEndpoint}\n`);
  fs.appendFileSync(CONFIG.logFile, `Batch-Größe: ${CONFIG.batchSize}\n`);
  fs.appendFileSync(CONFIG.logFile, `Verzögerung zwischen Anfragen: ${CONFIG.delayBetweenRequests}ms\n`);
  
  try {
    // Import durchführen
    await streamExcelImport();
    
    // Endezeit erfassen und Dauer berechnen
    stats.timings.end = new Date();
    const durationMs = stats.timings.end - stats.timings.start;
    const durationMin = (durationMs / 60000).toFixed(2);
    
    console.log('\n----- GESAMTVORGANG ABGESCHLOSSEN -----');
    console.log(`Gesamtdauer: ${durationMin} Minuten`);
    console.log(`Excel-Datei: ${CONFIG.sourceFile}`);
    console.log(`Excel-Zeilen: ${stats.excelRows.total}`);
    console.log(`Verarbeitete Zeilen: ${stats.excelRows.processed}`);
    console.log(`Gültige Zeilen: ${stats.excelRows.valid}`);
    console.log(`Ungültige Zeilen: ${stats.excelRows.invalid}`);
    console.log(`Gespeicherte Datensätze: ${stats.api.savedRecords}`);
    console.log(`Duplikate: ${stats.api.duplicates}`);
    console.log(`Fehler: ${stats.api.errors}`);
    
    // Schreibe Zusammenfassung in Log-Datei
    fs.appendFileSync(CONFIG.logFile, '\n----- ZUSAMMENFASSUNG -----\n');
    fs.appendFileSync(CONFIG.logFile, `Start: ${stats.timings.start.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Ende: ${stats.timings.end.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Gesamtdauer: ${durationMin} Minuten\n`);
    fs.appendFileSync(CONFIG.logFile, `Excel-Datei: ${CONFIG.sourceFile}\n`);
    fs.appendFileSync(CONFIG.logFile, `Excel-Zeilen: ${stats.excelRows.total}\n`);
    fs.appendFileSync(CONFIG.logFile, `Verarbeitete Zeilen: ${stats.excelRows.processed}\n`);
    fs.appendFileSync(CONFIG.logFile, `Gültige Zeilen: ${stats.excelRows.valid}\n`);
    fs.appendFileSync(CONFIG.logFile, `Ungültige Zeilen: ${stats.excelRows.invalid}\n`);
    fs.appendFileSync(CONFIG.logFile, `Gespeicherte Datensätze: ${stats.api.savedRecords}\n`);
    fs.appendFileSync(CONFIG.logFile, `Duplikate: ${stats.api.duplicates}\n`);
    fs.appendFileSync(CONFIG.logFile, `Fehler: ${stats.api.errors}\n`);
    
    console.log(`\nAusführliches Protokoll in: ${CONFIG.logFile}`);
    process.exit(0);
  } catch (error) {
    console.error('Kritischer Fehler bei der Verarbeitung:');
    console.error(error);
    
    fs.appendFileSync(CONFIG.logFile, '\n----- KRITISCHER FEHLER -----\n');
    fs.appendFileSync(CONFIG.logFile, `${error.message}\n`);
    fs.appendFileSync(CONFIG.logFile, `${error.stack}\n`);
    
    process.exit(1);
  }
}

// Verarbeite Befehlszeilenargumente
const args = process.argv.slice(2);

for (const arg of args) {
  if (arg.startsWith('--source=')) {
    CONFIG.sourceFile = arg.split('=')[1];
  } else if (arg.startsWith('--endpoint=')) {
    CONFIG.apiEndpoint = arg.split('=')[1];
  } else if (arg.startsWith('--batch=')) {
    CONFIG.batchSize = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--delay=')) {
    CONFIG.delayBetweenRequests = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--log=')) {
    CONFIG.logFile = arg.split('=')[1];
  } else if (arg === '--no-cleanup') {
    CONFIG.cleanup = false;
  } else if (arg === '--help') {
    console.log('Verwendung: node stream_import_excel.cjs [Optionen]');
    console.log('Optionen:');
    console.log('  --source=pfad/zur/datei.xlsx  Pfad zur Excel-Quelldatei (erforderlich)');
    console.log('  --endpoint=url               API-Endpunkt (Standard: http://localhost:5000/api/vendon/import/json)');
    console.log('  --batch=25                   Batch-Größe für API-Anfragen (Standard: 25)');
    console.log('  --delay=2000                 Verzögerung zwischen API-Anfragen in ms (Standard: 2000)');
    console.log('  --log=datei.log              Pfad zur Log-Datei (Standard: ./excel_import.log)');
    console.log('  --no-cleanup                 Temporäre Dateien nicht löschen');
    console.log('  --help                       Zeigt diese Hilfe an');
    process.exit(0);
  }
}

main();