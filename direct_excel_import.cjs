const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');

// Konfiguration für den Datenbankzugriff
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

// Konfiguration für den Import
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/1.xlsx', // Kleinere Testdatei zuerst verwenden
  logFile: './excel_import.log',
  
  // Prozesssteuerung
  machineMapping: {
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

/**
 * Loggt eine Nachricht
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(message);
  
  try {
    fs.appendFileSync(config.logFile, logEntry);
  } catch (error) {
    console.error(`Fehler beim Schreiben der Logdatei: ${error.message}`);
  }
}

/**
 * Konvertiert Excel-Daten in das Transaktionsformat
 */
function convertToTransactionFormat(excelData) {
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
    if (telemetryUnit && config.machineMapping[telemetryUnit]) {
      machineId = config.machineMapping[telemetryUnit];
    }
    
    // Metadaten erstellen
    const metadata = JSON.stringify({
      importedFromExcel: true,
      importDate: new Date().toISOString(),
      telemetryUnit: telemetryUnit,
      address: row['Adresse'],
      transactionType: row['Transaktionstyp']
    });
    
    return {
      vendonId,
      datetime: isoDate,
      machineName: row['Automatenname'] || 'Unbekannt',
      machineId,
      productId: row['Produktnr.'] ? row['Produktnr.'].toString() : '0',
      productName: row['Produktname'] || 'Unbekanntes Produkt',
      quantity: row['Menge'] || 1,
      price: row['Preis (inkl. MwSt.)'] || 0,
      priceWoVat: row['Preis (ohne MwSt.)'] || 0,
      vat: row['MwSt. %'] || 0,
      currency: row['Währung'] || 'EUR',
      source: "excel-import",
      metadata,
      status: "completed",
      processingStatus: "processed",
      syncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
  });
}

/**
 * Importiert eine Sammlung von Transaktionen direkt in die Datenbank
 */
async function importTransactionsToDb(transactions) {
  let client = null;
  const pool = new Pool(dbConfig);
  
  try {
    log(`Stelle Verbindung zur Datenbank her...`);
    client = await pool.connect();
    
    log(`Importiere ${transactions.length} Transaktionen...`);
    
    // Starte eine Transaktion
    await client.query('BEGIN');
    
    // Zähler initialisieren
    let insertedCount = 0;
    let skippedCount = 0;
    
    // Verarbeite jede Transaktion einzeln
    for (const transaction of transactions) {
      try {
        // Prüfe zuerst, ob die Transaktion bereits existiert
        const checkQuery = `
          SELECT id FROM transactions 
          WHERE vendon_id = $1 OR 
            (datetime = $2 AND machine_id = $3 AND product_name = $4 AND price = $5)
        `;
        
        const checkParams = [
          transaction.vendonId,
          transaction.datetime,
          transaction.machineId,
          transaction.productName,
          transaction.price
        ];
        
        const existingResult = await client.query(checkQuery, checkParams);
        
        if (existingResult.rows.length > 0) {
          log(`Transaktion existiert bereits: ${transaction.vendonId}`);
          skippedCount++;
          continue;
        }
        
        // Füge die Transaktion ein
        const insertQuery = `
          INSERT INTO transactions (
            vendon_id, datetime, machine_name, machine_id, product_id, product_name,
            quantity, price, price_wo_vat, vat, currency, source, metadata,
            status, processing_status, synced_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id
        `;
        
        const insertParams = [
          transaction.vendonId,
          transaction.datetime,
          transaction.machineName,
          transaction.machineId,
          transaction.productId,
          transaction.productName,
          transaction.quantity,
          transaction.price,
          transaction.priceWoVat,
          transaction.vat,
          transaction.currency,
          transaction.source,
          transaction.metadata,
          transaction.status,
          transaction.processingStatus,
          transaction.syncedAt,
          transaction.createdAt
        ];
        
        const insertResult = await client.query(insertQuery, insertParams);
        log(`Transaktion importiert mit ID: ${insertResult.rows[0].id}`);
        insertedCount++;
      } catch (error) {
        log(`Fehler beim Importieren einer Transaktion: ${error.message}`);
        throw error; // Löse den Fehler aus, um die Transaktion zurückzusetzen
      }
    }
    
    // Commit der Transaktion
    await client.query('COMMIT');
    
    log(`Import abgeschlossen. ${insertedCount} Transaktionen importiert, ${skippedCount} übersprungen.`);
    
    return {
      success: true,
      inserted: insertedCount,
      skipped: skippedCount
    };
  } catch (error) {
    // Rollback im Fehlerfall
    if (client) {
      await client.query('ROLLBACK');
    }
    
    log(`Datenbankfehler beim Import: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Verbindung freigeben
    if (client) {
      client.release();
    }
    
    // Pool schließen
    await pool.end();
  }
}

/**
 * Verarbeitet eine Excel-Datei und importiert die Daten
 */
async function processExcelFile() {
  try {
    log(`=== STARTE EXCEL-IMPORT ===`);
    log(`Verarbeite Excel-Datei: ${config.inputExcelFile}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Excel-Datei laden
    log('Lade Excel-Datei...');
    const workbook = xlsx.readFile(config.inputExcelFile);
    
    // Erstes Arbeitsblatt auswählen
    const sheetName = workbook.SheetNames[0];
    log(`Verarbeite Arbeitsblatt: ${sheetName}`);
    
    // Daten als JSON umwandeln
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    log(`${data.length} Zeilen geladen.`);
    
    // In Transaktionsformat konvertieren
    const transactions = convertToTransactionFormat(data);
    log(`${transactions.length} Transaktionen konvertiert.`);
    
    // Transaktionen in die Datenbank importieren
    const importResult = await importTransactionsToDb(transactions);
    
    if (importResult.success) {
      log(`Import erfolgreich abgeschlossen! ${importResult.inserted} importiert, ${importResult.skipped} übersprungen.`);
    } else {
      log(`Import fehlgeschlagen: ${importResult.error}`);
    }
    
    return importResult;
  } catch (error) {
    log(`Fehler bei der Verarbeitung: ${error.message}`);
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
    log('Prozess abgeschlossen.');
  })
  .catch(error => {
    console.timeEnd('Processing Time');
    log(`Unerwarteter Fehler: ${error.message}`);
  });