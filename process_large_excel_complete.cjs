const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

// Konfiguration für die vollständige Verarbeitung
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx', // Große Excel-Datei
  outputDir: './json_chunks_large',
  chunkSize: 25, // Kleinere Chunks für stabileren Import
  batchSize: 10, // Anzahl der Chunks pro Verarbeitungsdurchlauf
  
  // Zeitlimits und Prozesssteuerung
  maxProcessingTime: 90000, // 1,5 Minuten maximale Verarbeitungszeit pro Durchlauf
  delayBetweenRequests: 1500, // Wartezeit zwischen API-Anfragen
  
  // API-Konfiguration
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  
  // Logging
  logFile: './excel_import_full.log',
  
  // Status-Datei
  statusFile: './import_status.json',
  
  // Mapping für Maschinen-IDs
  telemetryToMachineMap: {
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

// Status-Tracking
let processingStatus = {
  totalRowsInFile: 0,
  processedRows: 0,
  currentChunk: 0,
  chunksCreated: 0,
  jsonFilesCreated: 0,
  jsonFilesImported: 0,
  totalTransactions: 0,
  savedTransactions: 0,
  duplicateTransactions: 0,
  errors: 0,
  completed: false,
  lastProcessed: null,
  startTime: new Date().toISOString()
};

/**
 * Verzögerungsfunktion für asynchrones Warten
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Schreibt eine Nachricht in die Log-Datei und auf die Konsole
 */
function log(message, silent = false) {
  const now = new Date();
  const timeString = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
  const logMessage = `${timeString} ${message}\n`;
  
  if (!silent) {
    console.log(message);
  }
  
  fs.appendFileSync(config.logFile, logMessage);
}

/**
 * Lädt den Verarbeitungsstatus, falls vorhanden
 */
function loadStatus() {
  try {
    if (fs.existsSync(config.statusFile)) {
      const statusContent = fs.readFileSync(config.statusFile, 'utf8');
      const savedStatus = JSON.parse(statusContent);
      
      // Status aktualisieren, aber startTime beibehalten, wenn Prozess fortgesetzt wird
      processingStatus = {
        ...savedStatus,
        lastProcessed: new Date().toISOString()
      };
      
      log(`Status geladen: ${processingStatus.processedRows} von ${processingStatus.totalRowsInFile} Zeilen verarbeitet, ${processingStatus.jsonFilesImported} JSON-Dateien importiert.`);
      return true;
    }
  } catch (error) {
    log(`Fehler beim Laden des Status: ${error.message}`);
  }
  
  // Initialisiere eine neue Status-Datei, wenn keine vorhanden oder fehlerhaft
  saveStatus();
  return false;
}

/**
 * Speichert den aktuellen Verarbeitungsstatus
 */
function saveStatus() {
  try {
    processingStatus.lastProcessed = new Date().toISOString();
    fs.writeFileSync(config.statusFile, JSON.stringify(processingStatus, null, 2));
  } catch (error) {
    log(`Fehler beim Speichern des Status: ${error.message}`);
  }
}

/**
 * Erstellt das Ausgabeverzeichnis, falls es nicht existiert
 */
function createOutputDirIfNeeded() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    log(`Ausgabeverzeichnis erstellt: ${config.outputDir}`);
  }
}

/**
 * Konvertiert Excel-Daten in das Vendon-Transaktionsformat
 */
function convertToVendonFormat(excelData) {
  return excelData.map((row, index) => {
    // Datum im ISO-Format konvertieren
    let dateTime;
    try {
      dateTime = new Date(row['Date / Time']);
      if (isNaN(dateTime.getTime())) {
        dateTime = new Date();
        log(`Ungültiges Datum in Zeile: "${row['Date / Time']}", verwende aktuelles Datum.`, true);
      }
    } catch (e) {
      dateTime = new Date();
      log(`Fehler beim Parsen des Datums: ${e.message}`, true);
    }
    
    const isoDate = dateTime.toISOString();
    
    // Erstelle eine eindeutige ID für die Transaktion basierend auf mehreren Feldern
    const uniqueId = `${dateTime.getTime()}-${row['Produktnr.'] || '000'}-${row['Telemetrieeinheit'] || '0'}-${index}`;
    const vendonId = `imported-excel-${uniqueId}`;
    
    // Maschinen-ID aus der Telemetrieeinheit zuordnen
    let machineId = null;
    const telemetryUnit = row['Telemetrieeinheit'];
    if (telemetryUnit && config.telemetryToMachineMap[telemetryUnit]) {
      machineId = config.telemetryToMachineMap[telemetryUnit];
    }
    
    return {
      vendonId: vendonId,
      datetime: isoDate,
      machineName: row['Automatenname'] || 'Unbekannt',
      machineId: machineId,
      productId: row['Produktnr.'] ? row['Produktnr.'].toString() : '0',
      productName: row['Produktname'] || 'Unbekanntes Produkt',
      quantity: row['Menge'] || 1,
      price: row['Preis (inkl. MwSt.)'] || 0,
      priceWoVat: row['Preis (ohne MwSt.)'] || 0,
      vat: row['MwSt. %'] || 0,
      currency: row['Währung'] || 'EUR',
      source: "excel-import",
      metadata: JSON.stringify({
        importedFromExcel: true,
        importDate: new Date().toISOString(),
        telemetryUnit: telemetryUnit,
        address: row['Adresse'],
        transactionType: row['Transaktionstyp']
      }),
      status: "completed",
      processingStatus: "processed",
      syncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
  });
}

/**
 * Analysiert die Excel-Datei, um die Gesamtzahl der Zeilen zu ermitteln
 */
function analyzeExcelFile() {
  try {
    log(`Analysiere Excel-Datei: ${config.inputExcelFile}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Excel-Datei öffnen und nur Metadaten laden
    const workbook = xlsx.readFile(config.inputExcelFile, {
      sheetRows: 0, // Keine Zeilen laden, nur Metadaten
      bookVBA: false,
      bookDeps: false,
      cellStyles: false,
      cellHTML: false,
      cellFormula: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich des Arbeitsblatts ermitteln
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const totalRows = range.e.r - range.s.r; // Gesamtanzahl der Zeilen (ohne Header)
    
    log(`Excel-Datei analysiert: Insgesamt ${totalRows} Datenzeilen gefunden.`);
    
    // Status aktualisieren
    processingStatus.totalRowsInFile = totalRows;
    saveStatus();
    
    return totalRows;
  } catch (error) {
    log(`Fehler bei der Analyse der Excel-Datei: ${error.message}`);
    log(error.stack);
    return 0;
  }
}

/**
 * Importiert eine JSON-Datei über die API
 */
async function importJsonFile(filePath, chunkIndex) {
  try {
    log(`Importiere JSON-Datei: ${filePath} (Chunk ${chunkIndex})`);
    
    // JSON-Datei lesen
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    // Anzahl der Transaktionen ausgeben
    const transactionCount = jsonData.transactions ? jsonData.transactions.length : 0;
    log(`Datei enthält ${transactionCount} Transaktionen.`);
    
    // API-Aufruf durchführen
    const response = await axios.post(config.apiEndpoint, jsonData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    log(`Import von Chunk ${chunkIndex} abgeschlossen. Status: ${response.status}`);
    log(`Ergebnis: ${JSON.stringify(response.data.stats)}`);
    
    // Status aktualisieren
    processingStatus.jsonFilesImported++;
    processingStatus.totalTransactions += transactionCount;
    
    if (response.data && response.data.stats) {
      processingStatus.savedTransactions += response.data.stats.saved || 0;
      processingStatus.duplicateTransactions += response.data.stats.duplicates || 0;
      processingStatus.errors += response.data.stats.errors || 0;
    }
    
    saveStatus();
    
    return {
      success: true,
      stats: response.data.stats,
      chunkIndex,
      transactionCount
    };
  } catch (error) {
    log(`Fehler beim Importieren von ${filePath}:`, error.message);
    
    // Status aktualisieren
    processingStatus.errors++;
    saveStatus();
    
    return {
      success: false,
      error: error.message,
      chunkIndex,
      transactionCount: 0
    };
  }
}

/**
 * Findet alle JSON-Dateien, die dem Muster entsprechen
 */
function findJsonFiles() {
  // Manuell die Dateien im Verzeichnis auflisten
  const files = fs.readdirSync(config.outputDir)
    .filter(file => /^chunk_(\d+)\.json$/.test(file))
    .map(file => path.join(config.outputDir, file));
  
  // Sortiere die Dateien nach Chunk-Nummer
  return files.sort((a, b) => {
    const fileNameA = path.basename(a);
    const fileNameB = path.basename(b);
    const numA = parseInt(fileNameA.match(/chunk_(\d+)\.json/)[1]);
    const numB = parseInt(fileNameB.match(/chunk_(\d+)\.json/)[1]);
    return numA - numB;
  });
}

/**
 * Importiert eine Batch von JSON-Dateien
 */
async function importJsonBatch(startChunk, endChunk) {
  try {
    log(`\n=== Import von JSON-Batch (Chunks ${startChunk} bis ${endChunk}) ===`);
    
    // JSON-Dateien finden
    const allJsonFiles = findJsonFiles();
    
    if (allJsonFiles.length === 0) {
      log(`Keine JSON-Dateien gefunden in ${config.outputDir}`);
      return;
    }
    
    log(`${allJsonFiles.length} JSON-Dateien insgesamt gefunden.`);
    
    // Bestimme die zu importierenden Dateien
    const startIndex = startChunk - 1;
    const endIndex = Math.min(endChunk, allJsonFiles.length);
    
    if (startIndex >= allJsonFiles.length) {
      log(`Startindex (${startIndex}) außerhalb des verfügbaren Bereichs.`);
      return;
    }
    
    const filesToImport = allJsonFiles.slice(startIndex, endIndex);
    
    log(`Importiere ${filesToImport.length} Dateien (${startChunk} bis ${endIndex}).`);
    
    // Verarbeite jede Datei sequentiell
    for (let i = 0; i < filesToImport.length; i++) {
      const filePath = filesToImport[i];
      const chunkIndex = startIndex + i + 1;
      
      // Importiere die Datei
      const result = await importJsonFile(filePath, chunkIndex);
      
      // Warte zwischen den Anfragen, falls es nicht die letzte Datei ist
      if (i < filesToImport.length - 1) {
        log(`Warte ${config.delayBetweenRequests}ms vor dem nächsten Import...`);
        await sleep(config.delayBetweenRequests);
      }
    }
    
    log(`\nBatch-Import abgeschlossen!`);
    
    return endIndex;
  } catch (error) {
    log(`Kritischer Fehler bei der Batch-Verarbeitung: ${error.message}`);
    log(error.stack);
    return null;
  }
}

/**
 * Verarbeitet einen Chunk der Excel-Datei und konvertiert ihn in JSON
 */
async function processExcelChunk(startRow, endRow, headerRow, worksheet, headers) {
  try {
    // Startzeit für Zeitlimit
    const startTime = Date.now();
    const chunkNumber = processingStatus.chunksCreated + 1;
    
    log(`Verarbeite Excel-Chunk ${chunkNumber}: Zeilen ${startRow} bis ${endRow}`);
    
    // Hilfsfunktion zur Prüfung des Zeitlimits
    function isTimeExceeded() {
      return config.maxProcessingTime > 0 && 
             (Date.now() - startTime) > config.maxProcessingTime;
    }
    
    // Daten aus den Zeilen extrahieren
    const rows = [];
    let rowsProcessed = 0;
    
    for (let r = startRow; r <= endRow; r++) {
      // Zeitlimit prüfen
      if (isTimeExceeded()) {
        log(`Zeitlimit überschritten, breche Verarbeitung ab nach ${rowsProcessed} Zeilen.`);
        break;
      }
      
      // Zeile verarbeiten
      const rowData = {};
      let hasData = false;
      
      // Alle Zellen der Zeile lesen
      for (let c in headers) {
        const cellAddress = xlsx.utils.encode_cell({ r, c: parseInt(c) });
        if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
          rowData[headers[c]] = worksheet[cellAddress].v;
          hasData = true;
        }
      }
      
      // Zeile nur hinzufügen, wenn sie Daten enthält
      if (hasData) {
        rows.push(rowData);
        rowsProcessed++;
      }
    }
    
    if (rows.length === 0) {
      log(`Keine Daten in den Zeilen ${startRow} bis ${endRow} gefunden.`);
      return 0;
    }
    
    // Konvertiere in Vendon-Format
    const vendonTransactions = convertToVendonFormat(rows);
    
    // Speichere als JSON
    const outputPath = path.join(config.outputDir, `chunk_${chunkNumber}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      transactions: vendonTransactions,
      skipExistingCheck: false
    }, null, 2));
    
    log(`JSON-Chunk ${chunkNumber} geschrieben: ${outputPath} (${rows.length} Zeilen)`);
    
    // Status aktualisieren
    processingStatus.chunksCreated++;
    processingStatus.jsonFilesCreated++;
    processingStatus.processedRows += rowsProcessed;
    processingStatus.currentChunk = chunkNumber;
    saveStatus();
    
    return rows.length;
  } catch (error) {
    log(`Fehler bei der Verarbeitung des Excel-Chunks: ${error.message}`);
    log(error.stack);
    return 0;
  }
}

/**
 * Konvertiert die nächste Batch aus der Excel-Datei in JSON-Dateien
 */
async function convertNextExcelBatch() {
  try {
    // Startzeit für Zeitlimit
    const startTime = Date.now();
    
    // Hilfsfunktion zur Prüfung des Zeitlimits
    function isTimeExceeded() {
      return config.maxProcessingTime > 0 && 
             (Date.now() - startTime) > config.maxProcessingTime;
    }
    
    log(`\n=== Konvertieren des nächsten Excel-Batches in JSON ===`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Ausgabeverzeichnis erstellen
    createOutputDirIfNeeded();
    
    // Excel-Datei öffnen
    log('Öffne Excel-Datei...');
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellDates: true,
      sheetStubs: true,
      bookDeps: false,
      bookVBA: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich des Arbeitsblatts ermitteln
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    
    if (processingStatus.totalRowsInFile === 0) {
      processingStatus.totalRowsInFile = range.e.r - range.s.r;
    }
    
    // Spaltenüberschriften aus der ersten Zeile lesen
    const headerRow = range.s.r;
    const headers = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: headerRow, c });
      if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
        headers[c] = worksheet[cellAddress].v;
      } else {
        headers[c] = `Column_${c}`;
      }
    }
    
    // Verarbeitung einrichten
    const startRow = headerRow + 1 + processingStatus.processedRows; // Header + bereits verarbeitete Zeilen
    
    // Wenn wir alle Zeilen verarbeitet haben, sind wir fertig
    if (startRow > range.e.r) {
      log('Alle Zeilen wurden bereits verarbeitet.');
      processingStatus.completed = true;
      saveStatus();
      return 0;
    }
    
    // Bestimme die Anzahl der zu verarbeitenden Chunks
    const remainingRows = range.e.r - startRow + 1;
    const chunksToProcess = Math.min(
      config.batchSize,
      Math.ceil(remainingRows / config.chunkSize)
    );
    
    log(`Starte Verarbeitung ab Zeile ${startRow}, noch ${remainingRows} Zeilen ausstehend.`);
    log(`Verarbeite bis zu ${chunksToProcess} Chunks in diesem Durchlauf.`);
    
    // Verarbeite jeden Chunk
    let chunksCreated = 0;
    let totalRowsProcessed = 0;
    
    for (let i = 0; i < chunksToProcess; i++) {
      // Zeitlimit prüfen
      if (isTimeExceeded()) {
        log('Zeitlimit für diesen Durchlauf überschritten, beende Verarbeitung.');
        break;
      }
      
      const chunkStartRow = startRow + (i * config.chunkSize);
      const chunkEndRow = Math.min(chunkStartRow + config.chunkSize - 1, range.e.r);
      
      const rowsProcessed = await processExcelChunk(chunkStartRow, chunkEndRow, headerRow, worksheet, headers);
      
      if (rowsProcessed > 0) {
        chunksCreated++;
        totalRowsProcessed += rowsProcessed;
      }
      
      // Wenn wir am Ende des Dokuments angekommen sind
      if (chunkEndRow >= range.e.r) {
        break;
      }
    }
    
    log(`Batch-Konvertierung abgeschlossen: ${chunksCreated} Chunks mit insgesamt ${totalRowsProcessed} Zeilen erstellt.`);
    
    // Wenn wir alle Daten konvertiert haben
    if (processingStatus.processedRows >= processingStatus.totalRowsInFile) {
      log('Konvertierung der gesamten Excel-Datei abgeschlossen!');
    }
    
    return chunksCreated;
  } catch (error) {
    log(`Fehler bei der Excel-Konvertierung: ${error.message}`);
    log(error.stack);
    return 0;
  }
}

/**
 * Hauptfunktion zur Verarbeitung der großen Excel-Datei
 */
async function processLargeExcel() {
  try {
    log('=== STARTE VERARBEITUNG DER GROSSEN EXCEL-DATEI ===');
    
    // Log-Datei initialisieren, falls neu
    if (!fs.existsSync(config.logFile)) {
      fs.writeFileSync(config.logFile, `--- Excel-Import gestartet am ${new Date().toLocaleString()} ---\n\n`);
    } else {
      log('\n=== Import-Prozess wird fortgesetzt ===');
    }
    
    // Status laden oder initialisieren
    const resuming = loadStatus();
    
    // Wenn kein Status vorhanden ist, starte Analyse der Datei
    if (!resuming && processingStatus.totalRowsInFile === 0) {
      analyzeExcelFile();
    }
    
    log(`Datei enthält insgesamt ${processingStatus.totalRowsInFile} Datenzeilen, davon wurden ${processingStatus.processedRows} bereits verarbeitet.`);
    
    // Konvertiere den nächsten Batch aus der Excel-Datei
    if (processingStatus.processedRows < processingStatus.totalRowsInFile) {
      await convertNextExcelBatch();
    }
    
    // Importiere eine Batch von JSON-Dateien, beginnend nach der letzten importierten
    if (processingStatus.jsonFilesImported < processingStatus.jsonFilesCreated) {
      const startChunk = processingStatus.jsonFilesImported + 1;
      const endChunk = startChunk + config.batchSize - 1;
      
      await importJsonBatch(startChunk, endChunk);
    }
    
    // Prüfe, ob der Prozess abgeschlossen ist
    const complete = processingStatus.processedRows >= processingStatus.totalRowsInFile &&
                   processingStatus.jsonFilesImported >= processingStatus.jsonFilesCreated;
    
    if (complete) {
      processingStatus.completed = true;
      saveStatus();
      
      const endTime = new Date();
      const startTime = new Date(processingStatus.startTime);
      const totalTimeMs = endTime - startTime;
      const totalTimeMinutes = Math.floor(totalTimeMs / 60000);
      const totalTimeSeconds = Math.floor((totalTimeMs % 60000) / 1000);
      
      log('\n=== VERARBEITUNG ABGESCHLOSSEN ===');
      log(`Gesamtstatistik:
        - Verarbeitete Zeilen: ${processingStatus.processedRows}/${processingStatus.totalRowsInFile}
        - Erstellte JSON-Dateien: ${processingStatus.jsonFilesCreated}
        - Importierte JSON-Dateien: ${processingStatus.jsonFilesImported}
        - Verarbeitete Transaktionen: ${processingStatus.totalTransactions}
        - Gespeicherte Transaktionen: ${processingStatus.savedTransactions}
        - Duplikate: ${processingStatus.duplicateTransactions}
        - Fehler: ${processingStatus.errors}
        - Gesamtzeit: ${totalTimeMinutes} Minuten, ${totalTimeSeconds} Sekunden
      `);
      
      return true;
    } else {
      log('\n=== FORTSCHRITT ===');
      log(`Konvertierung: ${processingStatus.processedRows}/${processingStatus.totalRowsInFile} Zeilen (${Math.round(processingStatus.processedRows / processingStatus.totalRowsInFile * 100)}%)`);
      log(`Import: ${processingStatus.jsonFilesImported}/${processingStatus.jsonFilesCreated} JSON-Dateien (${processingStatus.jsonFilesCreated > 0 ? Math.round(processingStatus.jsonFilesImported / processingStatus.jsonFilesCreated * 100) : 0}%)`);
      
      // Berechne, wie viel noch zu tun ist
      const rowsLeft = processingStatus.totalRowsInFile - processingStatus.processedRows;
      const chunksLeft = Math.ceil(rowsLeft / config.chunkSize);
      const filesLeft = processingStatus.jsonFilesCreated - processingStatus.jsonFilesImported;
      
      log(`Noch zu tun:
        - Ca. ${chunksLeft} Chunks zu konvertieren
        - ${filesLeft} JSON-Dateien zu importieren
      `);
      
      log('\nUm den Prozess fortzusetzen, führen Sie erneut "node process_large_excel_complete.cjs" aus.\n');
      
      return false;
    }
  } catch (error) {
    log(`Kritischer Fehler bei der Verarbeitung: ${error.message}`);
    log(error.stack);
    return false;
  }
}

// Starte die Verarbeitung
console.time('Processing Time');

processLargeExcel()
  .then(completed => {
    console.timeEnd('Processing Time');
    console.log(`\nDurchlauf ${completed ? 'vollständig abgeschlossen' : 'teilweise abgeschlossen, muss fortgesetzt werden'}.`);
    
    // Exit mit einem entsprechenden Code, um Skript-Verkettung zu ermöglichen
    process.exit(completed ? 0 : 10);
  })
  .catch(error => {
    console.timeEnd('Processing Time');
    console.error(`\nUnerwarteter Fehler bei der Verarbeitung: ${error.message}`);
    
    // Exit mit Fehlercode
    process.exit(1);
  });