const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Konfiguration für einen schnellen Durchlauf
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  outputDir: './json_chunks_smaller',
  chunkSize: 20, // Kleiner für schnellere Verarbeitung
  maxChunks: 5, // Nur 5 Chunks pro Durchlauf
  
  // Prozesssteuerung
  maxProcessingTime: 60000, // 1 Minute maximale Verarbeitungszeit
  
  // Mapping für Maschinen-IDs
  telemetryToMachineMap: {
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

/**
 * Erstellt das Ausgabeverzeichnis, falls es nicht existiert
 */
function createOutputDirIfNeeded() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`Ausgabeverzeichnis erstellt: ${config.outputDir}`);
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
 * Teilt eine große Excel-Datei in JSON-Chunks auf
 */
function splitExcelToJson() {
  try {
    // Startzeit für Zeitbegrenzung festlegen
    const startTime = Date.now();
    
    // Hilfsfunktion zur Prüfung, ob Zeitlimit überschritten wurde
    function isTimeExceeded() {
      return config.maxProcessingTime > 0 && 
             (Date.now() - startTime) > config.maxProcessingTime;
    }
    
    console.log(`Konvertierung der Excel-Datei zu JSON: ${config.inputExcelFile}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Ausgabeverzeichnis erstellen
    createOutputDirIfNeeded();
    
    // Excel-Datei für Low-Memory-Verarbeitung öffnen
    console.log('Öffne Excel-Datei mit optimierten Einstellungen...');
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
    
    // Verarbeitung einrichten
    const rows = range.s.r + 1; // Beginne bei erster Datenzeile (nach Header)
    const maxRow = config.maxChunks > 0 
      ? Math.min(rows + (config.chunkSize * config.maxChunks), range.e.r + 1)
      : range.e.r + 1;
    
    console.log(`Verarbeite Zeilen ${rows} bis ${maxRow - 1} (maximal ${config.maxChunks} Chunks mit je ${config.chunkSize} Zeilen).`);
    
    // Chunks verarbeiten
    let currentChunk = [];
    let currentChunkNumber = 1;
    let rowsProcessed = 0;
    let jsonFilesCreated = 0;
    
    for (let r = rows; r < maxRow; r++) {
      // Prüfe, ob das Zeitlimit überschritten wurde
      if (isTimeExceeded()) {
        console.log(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, breche Verarbeitung ab.`);
        break;
      }
      
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
      if (currentChunk.length >= config.chunkSize || r === maxRow - 1) {
        if (currentChunk.length > 0) {
          // Konvertiere in Vendon-Format
          const vendonTransactions = convertToVendonFormat(currentChunk);
          
          // Definiere den Ausgabepfad für die JSON-Datei
          const outputPath = path.join(config.outputDir, `chunk_${currentChunkNumber}.json`);
          
          // Schreibe die neue JSON-Datei
          fs.writeFileSync(outputPath, JSON.stringify({
            transactions: vendonTransactions,
            skipExistingCheck: false
          }, null, 2));
          
          console.log(`JSON-Chunk ${currentChunkNumber} geschrieben: ${outputPath} (${currentChunk.length} Zeilen)`);
          jsonFilesCreated++;
          
          // Zurücksetzen für nächsten Chunk
          currentChunk = [];
          currentChunkNumber++;
        }
      }
    }
    
    console.log(`\nKonvertierung abgeschlossen!`);
    console.log(`${rowsProcessed} Zeilen in ${jsonFilesCreated} JSON-Dateien konvertiert.`);
    
    return jsonFilesCreated;
  } catch (error) {
    console.error(`Fehler bei der Excel-Konvertierung:`, error);
    console.error(error.stack);
    return 0;
  }
}

// Starte die Verarbeitung
console.time('Total Processing Time');
const jsonCount = splitExcelToJson();
console.timeEnd('Total Processing Time');
console.log(`Total: ${jsonCount} JSON-Dateien erstellt.`);