const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Konfiguration für kleine Excel-Datei
const config = {
  // Excel-Konfiguration
  inputExcelFile: './attached_assets/1.xlsx', // Kleine Excel-Datei für Tests
  outputDir: './json_chunks_small',
  chunkSize: 5, // Anzahl der Datensätze pro JSON-Datei
  
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
        // Fallback für ungültiges Datum
        dateTime = new Date();
        console.warn(`Ungültiges Datum in Zeile ${index + 1}: "${row['Date / Time']}", verwende aktuelles Datum.`);
      }
    } catch (e) {
      dateTime = new Date();
      console.warn(`Fehler beim Parsen des Datums in Zeile ${index + 1}: ${e.message}`);
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
        originalRow: index + 1,
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
 * Konvertiert eine Excel-Datei in JSON-Chunks
 */
function convertExcelToJson() {
  try {
    console.log(`Konvertierung der Excel-Datei zu JSON: ${config.inputExcelFile}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Ausgabeverzeichnis erstellen
    createOutputDirIfNeeded();
    
    // Excel-Datei einlesen
    console.log('Lese Excel-Datei...');
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere das Arbeitsblatt in JSON
    const allRows = xlsx.utils.sheet_to_json(worksheet, { raw: true });
    
    console.log(`Excel-Datei erfolgreich gelesen. ${allRows.length} Zeilen gefunden.`);
    
    // Aufteilen in Chunks
    let currentChunk = [];
    let currentChunkNumber = 1;
    let jsonFilesCreated = 0;
    
    for (let i = 0; i < allRows.length; i++) {
      currentChunk.push(allRows[i]);
      
      // Wenn ein Chunk voll ist oder dies die letzte Zeile ist
      if (currentChunk.length >= config.chunkSize || i === allRows.length - 1) {
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
    console.log(`${allRows.length} Zeilen in ${jsonFilesCreated} JSON-Dateien konvertiert.`);
    
    return jsonFilesCreated;
  } catch (error) {
    console.error(`Fehler bei der Excel-Konvertierung:`, error);
    console.error(error.stack);
    return 0;
  }
}

// Starte die Verarbeitung
console.time('Total Processing Time');
const jsonCount = convertExcelToJson();
console.timeEnd('Total Processing Time');
console.log(`Total: ${jsonCount} JSON-Dateien erstellt.`);