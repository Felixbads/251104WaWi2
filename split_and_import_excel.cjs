const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

// Konfiguration
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/1.xlsx', // Kleine Datei zum Testen
  outputDir: './split_excel_new',
  chunkSize: 5, // Anzahl der Datensätze pro Chunk-Datei
  
  // API-Konfiguration
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  delayBetweenRequests: 1000, // Wartezeit zwischen API-Anfragen in Millisekunden
  
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
 * Verzögerungsfunktion für asynchrones Warten
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Teilt eine Excel-Datei in mehrere Chunks auf und gibt die Chunks zurück
 */
function splitExcelFile() {
  try {
    console.log(`Splitting Excel-Datei: ${config.inputExcelFile}`);
    
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
    const chunks = [];
    let currentChunk = [];
    
    for (let i = 0; i < allRows.length; i++) {
      currentChunk.push(allRows[i]);
      
      // Wenn ein Chunk voll ist oder dies die letzte Zeile ist, speichern
      if (currentChunk.length >= config.chunkSize || i === allRows.length - 1) {
        if (currentChunk.length > 0) {
          chunks.push([...currentChunk]);
          currentChunk = [];
        }
      }
    }
    
    console.log(`${chunks.length} Chunks erstellt.`);
    return chunks;
    
  } catch (error) {
    console.error(`Fehler beim Aufteilen der Excel-Datei:`, error);
    return [];
  }
}

/**
 * Schreibt Chunks in separate Excel-Dateien
 */
function writeChunksToFiles(chunks) {
  try {
    console.log(`Schreibe ${chunks.length} Chunks in separate Excel-Dateien...`);
    
    chunks.forEach((chunk, index) => {
      // Erstelle ein neues Arbeitsblatt
      const newWorksheet = xlsx.utils.json_to_sheet(chunk);
      const newWorkbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Data');
      
      // Definiere den Ausgabepfad
      const outputPath = path.join(config.outputDir, `chunk_${index + 1}.xlsx`);
      
      // Schreibe die neue Excel-Datei
      xlsx.writeFile(newWorkbook, outputPath);
      
      console.log(`Chunk ${index + 1} geschrieben: ${outputPath} (${chunk.length} Zeilen)`);
    });
    
    console.log(`Aufteilen abgeschlossen! ${chunks.length} Excel-Dateien erstellt.`);
    return chunks.length;
  } catch (error) {
    console.error(`Fehler beim Schreiben der Chunk-Dateien:`, error);
    return 0;
  }
}

/**
 * Konvertiert Excel-Daten in das Vendon-Transaktionsformat
 */
function convertToVendonFormat(excelData) {
  return excelData.map((row, index) => {
    // Datum im ISO-Format konvertieren
    const dateTime = new Date(row['Date / Time']);
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
 * Importiert einen Chunk von Transaktionen über die API
 */
async function importTransactionChunk(transactions, chunkIndex) {
  try {
    console.log(`Importiere Chunk ${chunkIndex} mit ${transactions.length} Transaktionen...`);
    
    const requestBody = {
      transactions: transactions,
      skipExistingCheck: false
    };
    
    const response = await axios.post(config.apiEndpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Import von Chunk ${chunkIndex} abgeschlossen. Status: ${response.status}`);
    console.log(`Ergebnis: ${JSON.stringify(response.data.stats)}`);
    
    return {
      success: true,
      result: response.data,
      chunkIndex
    };
  } catch (error) {
    console.error(`Fehler beim Importieren von Chunk ${chunkIndex}:`, error.message);
    return {
      success: false,
      error: error.message,
      chunkIndex
    };
  }
}

/**
 * Importiert alle Chunks direkt ohne Speichern als Excel-Dateien
 */
async function importAllChunks(chunks) {
  try {
    console.log(`Starte Import von ${chunks.length} Chunks...`);
    
    // Statistik initialisieren
    const stats = {
      totalChunks: chunks.length,
      processedChunks: 0,
      successfulChunks: 0,
      failedChunks: 0,
      totalRows: 0,
      savedTransactions: 0,
      duplicates: 0,
      errors: 0
    };
    
    // Verarbeite jeden Chunk sequentiell
    for (let i = 0; i < chunks.length; i++) {
      const chunkData = chunks[i];
      
      // Konvertiere in Vendon-Format
      const vendonTransactions = convertToVendonFormat(chunkData);
      
      // Importiere die Daten
      const result = await importTransactionChunk(vendonTransactions, i + 1);
      stats.processedChunks++;
      
      if (result.success) {
        stats.successfulChunks++;
        if (result.result && result.result.stats) {
          stats.savedTransactions += result.result.stats.saved || 0;
          stats.duplicates += result.result.stats.duplicates || 0;
          stats.errors += result.result.stats.errors || 0;
          stats.totalRows += result.result.stats.total || 0;
        }
      } else {
        stats.failedChunks++;
      }
      
      // Warte zwischen den Anfragen
      if (i < chunks.length - 1) {
        console.log(`Warte ${config.delayBetweenRequests}ms vor dem nächsten Chunk...`);
        await sleep(config.delayBetweenRequests);
      }
      
      // Fortschritt anzeigen
      const progress = ((stats.processedChunks / stats.totalChunks) * 100).toFixed(2);
      console.log(`Fortschritt: ${progress}% (${stats.processedChunks}/${stats.totalChunks} Chunks)`);
    }
    
    // Gesamtstatistik anzeigen
    console.log(`\nImport abgeschlossen!`);
    console.log(`Gesamtstatistik:
      - Verarbeitete Chunks: ${stats.processedChunks}/${stats.totalChunks}
      - Erfolgreiche Chunks: ${stats.successfulChunks}
      - Fehlgeschlagene Chunks: ${stats.failedChunks}
      - Verarbeitete Zeilen: ${stats.totalRows}
      - Gespeicherte Transaktionen: ${stats.savedTransactions}
      - Duplikate: ${stats.duplicates}
      - Fehler: ${stats.errors}
    `);
    
    return stats;
  } catch (error) {
    console.error(`Kritischer Fehler bei der Verarbeitung:`, error);
    console.error(error.stack);
    return null;
  }
}

/**
 * Hauptfunktion, die den gesamten Prozess steuert
 */
async function processExcelImport() {
  console.time('Total Processing Time');
  
  try {
    // 1. Excel-Datei in Chunks aufteilen
    const chunks = splitExcelFile();
    
    if (chunks.length === 0) {
      console.error('Keine Chunks erstellt. Beende Verarbeitung.');
      return;
    }
    
    // 2. Chunks in separate Excel-Dateien schreiben (optional)
    writeChunksToFiles(chunks);
    
    // 3. Chunks importieren (ohne Speichern als Excel-Dateien)
    await importAllChunks(chunks);
    
  } catch (error) {
    console.error('Unerwarteter Fehler während der Verarbeitung:', error);
  } finally {
    console.timeEnd('Total Processing Time');
  }
}

// Starte die Verarbeitung
processExcelImport().catch(error => {
  console.error('Unerwarteter Fehler:', error);
});