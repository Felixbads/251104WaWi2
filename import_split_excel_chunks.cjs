const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

// Konfiguration
const config = {
  chunksDir: './split_excel',
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  delayBetweenRequests: 1000, // 1 Sekunde Wartezeit zwischen API-Anfragen
  telemetryToMachineMap: {
    // Bekannte Telemetriegeräte zu Maschinen-ID Zuordnungen
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

/**
 * Verzögerungsfunktion für asynchrones Warten
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 * Verarbeitet eine einzelne Excel-Datei und importiert die Daten
 */
async function processChunkFile(filePath, chunkIndex) {
  try {
    console.log(`Verarbeite Chunk-Datei: ${filePath}`);
    
    // Excel-Datei einlesen
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere das Arbeitsblatt in JSON
    const excelData = xlsx.utils.sheet_to_json(worksheet, { raw: true });
    
    console.log(`Chunk-Datei enthält ${excelData.length} Datensätze.`);
    
    // Konvertiere in Vendon-Format
    const vendonTransactions = convertToVendonFormat(excelData);
    
    // Importiere die Daten
    return await importTransactionChunk(vendonTransactions, chunkIndex);
    
  } catch (error) {
    console.error(`Fehler bei der Verarbeitung von ${filePath}:`, error.message);
    return {
      success: false,
      error: error.message,
      chunkIndex
    };
  }
}

/**
 * Hauptfunktion zum Verarbeiten aller Chunk-Dateien
 */
async function processAllChunks() {
  try {
    console.log(`Suche nach Chunk-Dateien in: ${config.chunksDir}`);
    
    // Prüfe, ob das Verzeichnis existiert
    if (!fs.existsSync(config.chunksDir)) {
      throw new Error(`Das Verzeichnis ${config.chunksDir} existiert nicht.`);
    }
    
    // Alle Excel-Dateien im Verzeichnis auflisten
    const files = fs.readdirSync(config.chunksDir)
      .filter(file => file.endsWith('.xlsx'))
      .map(file => path.join(config.chunksDir, file))
      .sort(); // Sortieren, um die Reihenfolge zu gewährleisten
    
    console.log(`${files.length} Chunk-Dateien gefunden.`);
    
    // Statistik initialisieren
    const stats = {
      totalChunks: files.length,
      processedChunks: 0,
      successfulChunks: 0,
      failedChunks: 0,
      totalRows: 0,
      savedTransactions: 0,
      duplicates: 0,
      errors: 0
    };
    
    // Verarbeite jede Datei sequentiell
    for (let i = 0; i < files.length; i++) {
      const result = await processChunkFile(files[i], i + 1);
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
      if (i < files.length - 1) {
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

// Starte die Verarbeitung
processAllChunks().catch(error => {
  console.error('Unerwarteter Fehler:', error);
});