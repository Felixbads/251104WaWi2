const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

// Konfiguration für eine kleine Beispieldatei
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/1.xlsx', // Kleinere Testdatei
  
  // API-Konfiguration
  serverUrl: 'http://localhost:8080', // Port, den Replit für Workflows verwendet
  apiEndpoint: '/api/vendon/transactions/import',
  
  // Mapping für Maschinen-IDs
  telemetryToMachineMap: {
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

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
    
    // Erstelle eine eindeutige ID für die Transaktion
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
 * Importiert eine Sammlung von Transaktionen
 */
async function importTransactions(transactions) {
  try {
    console.log(`Importiere ${transactions.length} Transaktionen...`);
    
    const response = await axios.post(config.serverUrl + config.apiEndpoint, {
      transactions: transactions,
      skipExistingCheck: false
    });
    
    return {
      success: true,
      imported: response.data.imported || 0,
      skipped: response.data.skipped || 0
    };
  } catch (error) {
    console.error(`Fehler beim Import: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verarbeitet eine kleine Excel-Datei
 */
async function processExcelFile() {
  try {
    console.log(`Verarbeite Excel-Datei: ${config.inputExcelFile}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Excel-Datei laden
    console.log('Lade Excel-Datei...');
    const workbook = xlsx.readFile(config.inputExcelFile);
    
    // Erstes Arbeitsblatt auswählen
    const sheetName = workbook.SheetNames[0];
    console.log(`Verarbeite Arbeitsblatt: ${sheetName}`);
    
    // Daten als JSON umwandeln
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    console.log(`${data.length} Zeilen geladen.`);
    
    // In Vendon-Format konvertieren
    const vendonTransactions = convertToVendonFormat(data);
    console.log(`${vendonTransactions.length} Transaktionen konvertiert.`);
    
    // Transaktionen importieren
    const importResult = await importTransactions(vendonTransactions);
    
    if (importResult.success) {
      console.log(`Import erfolgreich abgeschlossen! ${importResult.imported} importiert, ${importResult.skipped} übersprungen.`);
    } else {
      console.error(`Import fehlgeschlagen: ${importResult.error}`);
    }
    
    return importResult;
  } catch (error) {
    console.error(`Fehler bei der Verarbeitung: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Starte den Prozess
console.time('Processing Time');
processExcelFile()
  .then(result => {
    console.timeEnd('Processing Time');
    console.log('Prozess abgeschlossen.');
  })
  .catch(error => {
    console.timeEnd('Processing Time');
    console.error(`Unerwarteter Fehler: ${error.message}`);
  });