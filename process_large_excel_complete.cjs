const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

// Konfiguration
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  outputDir: './json_chunks_smaller',
  statusFile: './import_status.json',
  logFile: './excel_import.log',
  
  // Prozesssteuerung
  chunkSize: 20,           // Anzahl Zeilen pro Chunk
  maxChunksPerBatch: 5,    // Anzahl der Chunks pro Durchlauf
  startRow: -1,            // -1 = automatisch fortsetzen
  maxProcessingTime: 55000, // Maximale Verarbeitungszeit in Millisekunden (55 Sekunden)
  importDelay: 100,        // Verzögerung zwischen Importen in Millisekunden
  serverUrl: 'http://localhost:3000', // Backend-URL
  apiEndpoint: '/api/vendon/transactions/import', // Import-Endpunkt
  
  // Mapping für Maschinen-IDs
  telemetryToMachineMap: {
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

/**
 * Initialisiert oder liest den Status
 */
function getStatus() {
  if (fs.existsSync(config.statusFile)) {
    try {
      const statusContent = fs.readFileSync(config.statusFile, 'utf8');
      return JSON.parse(statusContent);
    } catch (error) {
      console.error(`Fehler beim Lesen der Status-Datei: ${error.message}`);
    }
  }
  
  // Erstelle den Standardstatus
  return {
    startRow: 1, // Beginne bei der ersten Datenzeile (nach dem Header)
    processedRows: 0,
    currentChunkNumber: 1,
    failed: false,
    completed: false,
    lastProcessed: null,
    totalRows: 0,
    totalProcessed: 0,
    errorMessage: null
  };
}

/**
 * Speichert den Status
 */
function saveStatus(status) {
  try {
    fs.writeFileSync(config.statusFile, JSON.stringify(status, null, 2));
    return true;
  } catch (error) {
    console.error(`Fehler beim Speichern des Status: ${error.message}`);
    return false;
  }
}

/**
 * Loggt eine Nachricht in die Logdatei
 */
function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(config.logFile, logEntry);
    return true;
  } catch (error) {
    console.error(`Fehler beim Schreiben der Logdatei: ${error.message}`);
    return false;
  }
}

/**
 * Erstellt das Ausgabeverzeichnis, falls es nicht existiert
 */
function createOutputDirIfNeeded() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`Ausgabeverzeichnis erstellt: ${config.outputDir}`);
    logMessage(`Ausgabeverzeichnis erstellt: ${config.outputDir}`);
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
      }
    } catch (e) {
      dateTime = new Date();
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
 * Importiert eine JSON-Datei mit Transaktionen in die Datenbank
 */
async function importTransactions(transactions) {
  try {
    const response = await axios.post(config.serverUrl + config.apiEndpoint, {
      transactions: transactions,
      skipExistingCheck: false
    });
    
    return {
      success: true,
      imported: response.data.imported || 0,
      skipped: response.data.skipped || 0,
      message: response.data.message
    };
  } catch (error) {
    console.error(`Fehler beim Import: ${error.message}`);
    return {
      success: false,
      error: error.message,
      imported: 0,
      skipped: 0
    };
  }
}

/**
 * Verarbeitet eine große Excel-Datei in kleinen Chunks und importiert sie
 */
async function processLargeExcelFile() {
  try {
    // Startzeit für Zeitbegrenzung festlegen
    const startTime = Date.now();
    
    // Hilfsfunktion zur Prüfung, ob Zeitlimit überschritten wurde
    function isTimeExceeded() {
      return config.maxProcessingTime > 0 && 
             (Date.now() - startTime) > config.maxProcessingTime;
    }
    
    // Status lesen oder initialisieren
    const status = getStatus();
    
    // Wenn bereits abgeschlossen, nicht noch einmal verarbeiten
    if (status.completed === true) {
      console.log('Die Verarbeitung wurde bereits abgeschlossen.');
      logMessage('Die Verarbeitung wurde bereits abgeschlossen.');
      return { success: true, completed: true };
    }
    
    console.log('=== Import-Prozess wird fortgesetzt ===');
    logMessage('Import-Prozess wird fortgesetzt');
    
    // Bestimme die Startzeile
    const startRow = config.startRow >= 0 ? config.startRow : status.startRow;
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    console.log(`Analysiere Excel-Datei: ${config.inputExcelFile}`);
    logMessage(`Analysiere Excel-Datei: ${config.inputExcelFile}`);
    
    // Ausgabeverzeichnis erstellen
    createOutputDirIfNeeded();
    
    // Excel-Datei für Low-Memory-Verarbeitung öffnen
    console.log('Öffne Excel-Datei mit optimierten Einstellungen...');
    logMessage('Öffne Excel-Datei mit optimierten Einstellungen...');
    
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,  // Keine Formeln verarbeiten
      cellHTML: false,     // Kein HTML verarbeiten
      cellStyles: false,   // Keine Stile verarbeiten
      cellNF: false,       // Keine Zahlenformate
      cellDates: true,     // Datumsformate beibehalten
      sheetStubs: true,    // Leere Zellen berücksichtigen
      bookDeps: false,     // Keine Abhängigkeiten verfolgen
      bookVBA: false,      // Kein VBA-Code laden
      dense: true,         // Optimierung für große Dateien
      WTF: false           // Weniger Warnungen ausgeben
    });
    
    // Arbeitsblatt auswählen
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich des Arbeitsblatts ermitteln
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const totalRows = range.e.r - range.s.r; // Gesamtanzahl der Zeilen (ohne Header)
    
    console.log(`Arbeitsblatt '${sheetName}' hat ${totalRows} Datenzeilen.`);
    logMessage(`Arbeitsblatt '${sheetName}' hat ${totalRows} Datenzeilen.`);
    
    // Status aktualisieren, falls dies der erste Durchlauf ist
    if (status.totalRows === 0) {
      status.totalRows = totalRows;
      saveStatus(status);
    }
    
    // Spaltenüberschriften aus der ersten Zeile lesen
    const headers = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
      if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
        headers[c] = worksheet[cellAddress].v;
      } else {
        headers[c] = `Column_${c}`;
      }
    }
    
    console.log(`${Object.keys(headers).length} Spalten gefunden.`);
    logMessage(`${Object.keys(headers).length} Spalten gefunden.`);
    
    // Verarbeitung einrichten
    const endRow = Math.min(
      startRow + (config.chunkSize * config.maxChunksPerBatch), 
      range.e.r + 1
    );
    
    console.log(`Verarbeite Zeilen ${startRow} bis ${endRow - 1} (maximal ${config.maxChunksPerBatch} Chunks mit je ${config.chunkSize} Zeilen).`);
    logMessage(`Verarbeite Zeilen ${startRow} bis ${endRow - 1} (maximal ${config.maxChunksPerBatch} Chunks mit je ${config.chunkSize} Zeilen).`);
    
    // Chunks verarbeiten
    let currentChunk = [];
    let currentChunkNumber = status.currentChunkNumber;
    let rowsProcessed = 0;
    let currentRow = startRow;
    let importedCount = 0;
    let skippedCount = 0;
    
    for (let r = startRow; r < endRow; r++) {
      // Prüfe, ob das Zeitlimit überschritten wurde
      if (isTimeExceeded()) {
        console.log(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, unterbreche Verarbeitung.`);
        logMessage(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, unterbreche Verarbeitung.`);
        
        // Status speichern und abbrechen
        status.startRow = currentRow;
        status.processedRows = rowsProcessed;
        status.currentChunkNumber = currentChunkNumber;
        status.totalProcessed += rowsProcessed;
        status.lastProcessed = new Date().toISOString();
        saveStatus(status);
        
        console.log(`Status gespeichert: Nächstes Mal wird bei Zeile ${currentRow} fortgesetzt.`);
        logMessage(`Status gespeichert: Nächstes Mal wird bei Zeile ${currentRow} fortgesetzt.`);
        
        // Mit Exit Code 10 beenden (für das Wrapper-Skript, um zu erkennen, dass der Prozess fortgesetzt werden muss)
        process.exit(10);
      }
      
      currentRow = r;
      
      // Zeile verarbeiten
      const rowData = {};
      let hasData = false;
      
      // Alle Zellen der Zeile lesen
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = xlsx.utils.encode_cell({ r, c });
        if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
          rowData[headers[c]] = worksheet[cellAddress].v;
          hasData = true;
        }
      }
      
      // Nur Zeilen mit Daten hinzufügen
      if (hasData) {
        currentChunk.push(rowData);
        rowsProcessed++;
      }
      
      // Wenn der Chunk voll ist oder wir am Ende sind
      if (currentChunk.length >= config.chunkSize || r === endRow - 1) {
        if (currentChunk.length > 0) {
          // Konvertiere in Vendon-Format
          const vendonTransactions = convertToVendonFormat(currentChunk);
          
          // Importiere die Transaktionen
          console.log(`Importiere Chunk ${currentChunkNumber} (${currentChunk.length} Zeilen)...`);
          logMessage(`Importiere Chunk ${currentChunkNumber} (${currentChunk.length} Zeilen)`);
          
          const importResult = await importTransactions(vendonTransactions);
          
          if (importResult.success) {
            console.log(`Import erfolgreich: ${importResult.imported} importiert, ${importResult.skipped} übersprungen.`);
            logMessage(`Import erfolgreich: ${importResult.imported} importiert, ${importResult.skipped} übersprungen.`);
            
            importedCount += importResult.imported;
            skippedCount += importResult.skipped;
          } else {
            console.error(`Import fehlgeschlagen: ${importResult.error}`);
            logMessage(`Import fehlgeschlagen: ${importResult.error}`);
            
            // Status auf fehlgeschlagen setzen
            status.failed = true;
            status.errorMessage = importResult.error;
            saveStatus(status);
            
            return { 
              success: false, 
              error: importResult.error,
              rowsProcessed
            };
          }
          
          // Zurücksetzen für nächsten Chunk
          currentChunk = [];
          currentChunkNumber++;
          
          // Kurze Pause zwischen den Importen
          if (config.importDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, config.importDelay));
          }
        }
      }
    }
    
    // Nach der Schleife überprüfen, ob alle Daten verarbeitet wurden
    const allProcessed = currentRow >= range.e.r;
    
    // Status aktualisieren
    status.startRow = allProcessed ? 1 : currentRow + 1; // Wenn alles verarbeitet wurde, zurück zum Anfang, sonst die nächste Zeile
    status.processedRows = rowsProcessed;
    status.currentChunkNumber = currentChunkNumber;
    status.totalProcessed += rowsProcessed;
    status.lastProcessed = new Date().toISOString();
    status.completed = allProcessed;
    saveStatus(status);
    
    if (allProcessed) {
      console.log(`\n=== IMPORT VOLLSTÄNDIG ABGESCHLOSSEN ===`);
      console.log(`Insgesamt ${status.totalProcessed} Zeilen verarbeitet.`);
      logMessage(`IMPORT VOLLSTÄNDIG ABGESCHLOSSEN. Insgesamt ${status.totalProcessed} Zeilen verarbeitet.`);
    } else {
      console.log(`\nTeilimport abgeschlossen. Nächster Durchlauf wird bei Zeile ${status.startRow} fortgesetzt.`);
      logMessage(`Teilimport abgeschlossen. Nächster Durchlauf wird bei Zeile ${status.startRow} fortgesetzt.`);
      
      // Mit Exit Code 10 beenden (für das Wrapper-Skript)
      process.exit(10);
    }
    
    return { 
      success: true, 
      completed: allProcessed,
      rowsProcessed,
      importedCount,
      skippedCount
    };
  } catch (error) {
    console.error(`Fehler bei der Excel-Verarbeitung:`, error);
    console.error(error.stack);
    logMessage(`Schwerwiegender Fehler: ${error.message}`);
    
    // Status auf fehlgeschlagen setzen
    const status = getStatus();
    status.failed = true;
    status.errorMessage = error.message;
    saveStatus(status);
    
    return { 
      success: false, 
      error: error.message
    };
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('=== STARTE VERARBEITUNG DER GROSSEN EXCEL-DATEI ===');
  logMessage('=== STARTE VERARBEITUNG DER GROSSEN EXCEL-DATEI ===');
  
  try {
    // Verarbeite die Excel-Datei
    const result = await processLargeExcelFile();
    
    if (result.success) {
      console.log('Verarbeitung erfolgreich abgeschlossen.');
      logMessage('Verarbeitung erfolgreich abgeschlossen.');
      
      if (result.completed) {
        console.log(`Gesamte Datei verarbeitet: ${result.rowsProcessed} Zeilen in diesem Durchlauf.`);
        logMessage(`Gesamte Datei verarbeitet: ${result.rowsProcessed} Zeilen in diesem Durchlauf.`);
      } else {
        console.log(`Teilprozess abgeschlossen: ${result.rowsProcessed} Zeilen in diesem Durchlauf.`);
        logMessage(`Teilprozess abgeschlossen: ${result.rowsProcessed} Zeilen in diesem Durchlauf.`);
      }
      
      if (result.importedCount !== undefined) {
        console.log(`Insgesamt importiert: ${result.importedCount}, übersprungen: ${result.skippedCount}`);
        logMessage(`Insgesamt importiert: ${result.importedCount}, übersprungen: ${result.skippedCount}`);
      }
    } else {
      console.error(`Verarbeitung fehlgeschlagen: ${result.error}`);
      logMessage(`Verarbeitung fehlgeschlagen: ${result.error}`);
    }
  } catch (error) {
    console.error(`Unerwarteter Fehler: ${error.message}`);
    logMessage(`Unerwarteter Fehler: ${error.message}`);
  }
}

// Starte die Hauptfunktion
main();