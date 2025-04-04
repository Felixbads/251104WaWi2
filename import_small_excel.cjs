const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

const config = {
  excelFilePath: './attached_assets/1.xlsx',
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  delayBetweenRequests: 1000  // 1 Sekunde zwischen den Anfragen
};

// Funktion zum Konvertieren von Excel-Daten in das Vendon-Transaktionsformat
function convertToVendonFormat(excelData) {
  return excelData.map((row, index) => {
    // Datum im ISO-Format konvertieren
    const dateTime = new Date(row['Date / Time']);
    const isoDate = dateTime.toISOString();
    
    // Erstelle eine eindeutige ID für die Transaktion
    const vendonId = `imported-excel-1-${index}-${Date.now()}`;
    
    // Maschinen-ID aus der Telemetrieeinheit zuordnen
    let machineId = null;
    const telemetryUnit = row['Telemetrieeinheit'];
    if (telemetryUnit === 869951034402721) {
      // Bahnhof Bad Schandau, Nationalparkbahnhof
      machineId = 52;
    }
    
    return {
      vendonId: vendonId,
      datetime: isoDate,
      machineName: row['Automatenname'],
      machineId: machineId,
      productId: row['Produktnr.'].toString(),
      productName: row['Produktname'],
      quantity: row['Menge'],
      price: row['Preis (inkl. MwSt.)'],
      priceWoVat: row['Preis (ohne MwSt.)'],
      vat: row['MwSt. %'],
      currency: row['Währung'],
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

// Funktion zum Importieren von Transaktionen über die API
async function importTransactions(transactions) {
  try {
    console.log(`Importiere ${transactions.length} Transaktionen...`);
    
    const requestBody = {
      transactions: transactions,
      skipExistingCheck: false
    };
    
    const response = await axios.post(config.apiEndpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Import abgeschlossen. Status: ${response.status}`);
    console.log(`Ergebnis: ${JSON.stringify(response.data, null, 2)}`);
    
    return {
      success: true,
      result: response.data
    };
  } catch (error) {
    console.error(`Fehler beim Importieren der Transaktionen:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Hauptfunktion zum Verarbeiten der Excel-Datei
async function processExcelFile() {
  try {
    console.log(`Verarbeite Excel-Datei: ${config.excelFilePath}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.excelFilePath)) {
      throw new Error(`Die Datei ${config.excelFilePath} existiert nicht.`);
    }
    
    // Excel-Datei einlesen
    const workbook = xlsx.readFile(config.excelFilePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere das Arbeitsblatt in JSON
    const excelData = xlsx.utils.sheet_to_json(worksheet, { raw: true });
    
    console.log(`Excel-Datei erfolgreich gelesen. ${excelData.length} Zeilen gefunden.`);
    
    // Konvertiere die Excel-Daten in das Vendon-Format
    const vendonTransactions = convertToVendonFormat(excelData);
    
    // Importiere die Transaktionen
    const importResult = await importTransactions(vendonTransactions);
    
    if (importResult.success) {
      console.log('Import erfolgreich abgeschlossen!');
    } else {
      console.error('Import fehlgeschlagen.');
    }
    
  } catch (error) {
    console.error(`Fehler bei der Verarbeitung:`, error.message);
  }
}

// Starte die Verarbeitung
processExcelFile().catch(error => {
  console.error('Unerwarteter Fehler:', error);
});