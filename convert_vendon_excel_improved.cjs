/**
 * Verbesserte Version für die Konvertierung von Vendon Excel-Dateien in optimierte JSON-Chunks
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Konfiguration
const CONFIG = {
  sourceFile: null,
  targetDir: './json_chunks_small',
  maxItemsPerChunk: 25, // Kleine Chunks für zuverlässigere API-Anfragen
  logFile: './excel_conversion.log'
};

// Statistiken
const stats = {
  totalRows: 0,
  processedRows: 0,
  validRows: 0,
  invalidRows: 0,
  chunks: 0,
  startTime: null,
  endTime: null
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
 * Schreibt einen JSON-Chunk in das Zielverzeichnis
 * @param {string} fileName - Name für die Zieldatei
 * @param {Array} data - Zu schreibende Daten
 * @returns {boolean} - Erfolg der Operation
 */
function writeJsonChunk(fileName, data) {
  try {
    const targetPath = path.join(CONFIG.targetDir, fileName);
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Fehler beim Schreiben von ${fileName}:`, error.message);
    return false;
  }
}

/**
 * Konvertiert eine Excel-Datei in JSON-Chunks
 * @param {string} excelFile - Pfad zur Excel-Datei
 * @returns {number} - Anzahl der erstellten Chunks
 */
function convertExcelToJsonChunks(excelFile) {
  console.log(`Konvertiere Excel-Datei: ${excelFile}`);
  console.log('Lese Excel-Datei...');
  
  try {
    // Excel-Datei laden
    const workbook = XLSX.readFile(excelFile);
    const sheetName = workbook.SheetNames[0]; // Erste Arbeitsmappe
    const worksheet = workbook.Sheets[sheetName];
    
    // In JSON konvertieren
    const rows = XLSX.utils.sheet_to_json(worksheet);
    stats.totalRows = rows.length;
    
    console.log(`Excel-Datei geladen: ${stats.totalRows} Zeilen gefunden`);
    
    // Konvertierungsstartzeit
    const conversionStartTime = new Date();
    console.log(`Konvertierung gestartet: ${conversionStartTime.toISOString()}`);
    
    // Arrays für die normalisierten Daten
    let normalizedData = [];
    let chunkIndex = 1;
    
    // Fortschrittsbalken initialisieren
    const totalBatches = Math.ceil(stats.totalRows / 1000);
    let currentBatch = 0;
    
    // Verarbeite die Daten in Batches für besseres Memory-Management
    for (let i = 0; i < rows.length; i += 1000) {
      currentBatch++;
      const batchEnd = Math.min(i + 1000, rows.length);
      console.log(`Verarbeite Batch ${currentBatch}/${totalBatches} (Zeilen ${i+1}-${batchEnd})...`);
      
      // Verarbeite jede Zeile im Batch
      for (let j = i; j < batchEnd; j++) {
        const row = rows[j];
        stats.processedRows++;
        
        // Normalisiere und validiere die Zeile
        const normalizedRow = normalizeRow(row, j);
        
        if (normalizedRow) {
          stats.validRows++;
          normalizedData.push(normalizedRow);
          
          // Wenn genügend Daten für einen Chunk vorhanden sind, schreibe den Chunk
          if (normalizedData.length >= CONFIG.maxItemsPerChunk) {
            const baseName = path.basename(excelFile, path.extname(excelFile));
            const chunkFileName = `${baseName}_small_chunk${chunkIndex}.json`;
            
            if (writeJsonChunk(chunkFileName, normalizedData)) {
              stats.chunks++;
              console.log(`Chunk ${chunkIndex} gespeichert: ${normalizedData.length} Einträge`);
            }
            
            // Zurücksetzen für den nächsten Chunk
            normalizedData = [];
            chunkIndex++;
          }
        } else {
          stats.invalidRows++;
        }
      }
      
      // Fortschritt anzeigen
      const progress = (stats.processedRows / stats.totalRows * 100).toFixed(2);
      console.log(`Fortschritt: ${progress}% (${stats.processedRows}/${stats.totalRows} Zeilen)`);
    }
    
    // Verbleibende Daten als letzten Chunk speichern, falls vorhanden
    if (normalizedData.length > 0) {
      const baseName = path.basename(excelFile, path.extname(excelFile));
      const chunkFileName = `${baseName}_small_chunk${chunkIndex}.json`;
      
      if (writeJsonChunk(chunkFileName, normalizedData)) {
        stats.chunks++;
        console.log(`Letzter Chunk ${chunkIndex} gespeichert: ${normalizedData.length} Einträge`);
      }
    }
    
    // Konvertierungsendzeit
    const conversionEndTime = new Date();
    const durationMs = conversionEndTime - conversionStartTime;
    const durationSec = (durationMs / 1000).toFixed(2);
    
    console.log(`\nKonvertierung abgeschlossen in ${durationSec} Sekunden`);
    console.log(`- Gesamtzeilen: ${stats.totalRows}`);
    console.log(`- Verarbeitete Zeilen: ${stats.processedRows}`);
    console.log(`- Gültige Zeilen: ${stats.validRows}`);
    console.log(`- Ungültige Zeilen: ${stats.invalidRows}`);
    console.log(`- Erstellte Chunks: ${stats.chunks}`);
    
    // Schreibe Ergebnisse in Log-Datei
    fs.appendFileSync(CONFIG.logFile, `\n----- Konvertierungsergebnisse für ${excelFile} -----\n`);
    fs.appendFileSync(CONFIG.logFile, `Start: ${conversionStartTime.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Ende: ${conversionEndTime.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Dauer: ${durationSec} Sekunden\n`);
    fs.appendFileSync(CONFIG.logFile, `Gesamtzeilen: ${stats.totalRows}\n`);
    fs.appendFileSync(CONFIG.logFile, `Verarbeitete Zeilen: ${stats.processedRows}\n`);
    fs.appendFileSync(CONFIG.logFile, `Gültige Zeilen: ${stats.validRows}\n`);
    fs.appendFileSync(CONFIG.logFile, `Ungültige Zeilen: ${stats.invalidRows}\n`);
    fs.appendFileSync(CONFIG.logFile, `Erstellte Chunks: ${stats.chunks}\n`);
    
    return stats.chunks;
  } catch (error) {
    console.error('Fehler bei der Excel-Konvertierung:', error.message);
    console.error(error.stack);
    
    fs.appendFileSync(CONFIG.logFile, `\n----- FEHLER bei ${excelFile} -----\n`);
    fs.appendFileSync(CONFIG.logFile, `${error.message}\n`);
    fs.appendFileSync(CONFIG.logFile, `${error.stack}\n`);
    
    return 0;
  }
}

/**
 * Hauptfunktion für die Konvertierung
 */
function main() {
  stats.startTime = new Date();
  console.log(`Excel-zu-JSON-Konvertierung gestartet: ${stats.startTime.toISOString()}`);
  
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
  
  // Stelle sicher, dass das Zielverzeichnis existiert
  if (!fs.existsSync(CONFIG.targetDir)) {
    fs.mkdirSync(CONFIG.targetDir, { recursive: true });
    console.log(`Zielverzeichnis erstellt: ${CONFIG.targetDir}`);
  }
  
  // Initialisiere Log-Datei
  fs.writeFileSync(CONFIG.logFile, `Excel-zu-JSON-Konvertierung gestartet: ${stats.startTime.toISOString()}\n`);
  fs.appendFileSync(CONFIG.logFile, `Quelldatei: ${CONFIG.sourceFile}\n`);
  fs.appendFileSync(CONFIG.logFile, `Zielverzeichnis: ${CONFIG.targetDir}\n`);
  fs.appendFileSync(CONFIG.logFile, `Max. Einträge pro Chunk: ${CONFIG.maxItemsPerChunk}\n`);
  
  try {
    // Führe die Konvertierung durch
    const chunksCreated = convertExcelToJsonChunks(CONFIG.sourceFile);
    
    // Erfasse Endzeit und Dauer
    stats.endTime = new Date();
    const durationMs = stats.endTime - stats.startTime;
    const durationMin = (durationMs / 60000).toFixed(2);
    
    console.log('\n----- KONVERTIERUNG ABGESCHLOSSEN -----');
    console.log(`Dauer: ${durationMin} Minuten`);
    console.log(`Excel-Datei: ${CONFIG.sourceFile}`);
    console.log(`Verarbeitete Zeilen: ${stats.processedRows}/${stats.totalRows}`);
    console.log(`Erstellte JSON-Chunks: ${chunksCreated}`);
    console.log(`Zielverzeichnis: ${CONFIG.targetDir}`);
    
    // Schreibe Zusammenfassung in Log-Datei
    fs.appendFileSync(CONFIG.logFile, '\n----- ZUSAMMENFASSUNG -----\n');
    fs.appendFileSync(CONFIG.logFile, `Start: ${stats.startTime.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Ende: ${stats.endTime.toISOString()}\n`);
    fs.appendFileSync(CONFIG.logFile, `Dauer: ${durationMin} Minuten\n`);
    fs.appendFileSync(CONFIG.logFile, `Excel-Datei: ${CONFIG.sourceFile}\n`);
    fs.appendFileSync(CONFIG.logFile, `Verarbeitete Zeilen: ${stats.processedRows}/${stats.totalRows}\n`);
    fs.appendFileSync(CONFIG.logFile, `Erstellte JSON-Chunks: ${chunksCreated}\n`);
    fs.appendFileSync(CONFIG.logFile, `Zielverzeichnis: ${CONFIG.targetDir}\n`);
    
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
  } else if (arg.startsWith('--target=')) {
    CONFIG.targetDir = arg.split('=')[1];
  } else if (arg.startsWith('--max-items=')) {
    CONFIG.maxItemsPerChunk = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--log=')) {
    CONFIG.logFile = arg.split('=')[1];
  } else if (arg === '--help') {
    console.log('Verwendung: node convert_vendon_excel_improved.cjs [Optionen]');
    console.log('Optionen:');
    console.log('  --source=pfad/zur/datei.xlsx  Pfad zur Excel-Quelldatei (erforderlich)');
    console.log('  --target=verzeichnis         Zielverzeichnis für JSON-Chunks (Standard: ./json_chunks_small)');
    console.log('  --max-items=25               Maximale Anzahl von Einträgen pro Chunk (Standard: 25)');
    console.log('  --log=datei.log              Pfad zur Log-Datei (Standard: ./excel_conversion.log)');
    console.log('  --help                       Zeigt diese Hilfe an');
    process.exit(0);
  }
}

main();