/**
 * Hochoptimierter Excel-Import für große Vendon-Transaktionsdaten
 * 
 * Dieses Skript ist speziell für die effiziente Verarbeitung sehr großer Vendon-Excel-Dateien 
 * in der Replit-Umgebung optimiert. Es verwendet einen optimierten Ansatz, bei dem die Datei 
 * mit minimaler Speicherbelastung gelesen und direkt in die Datenbank importiert wird.
 */

const fs = require('fs');
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

// Konfiguration
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx', // Große Vendon Excel-Datei
  statusFile: './excel_large_import_status.json',
  logFile: './excel_large_import.log',
  
  // Verarbeitungsoptionen
  batchSize: 10,              // Anzahl der Zeilen pro Datenbank-Batch
  maxProcessingTime: 25000,   // Maximale Verarbeitungszeit in ms
  maxRowsPerRun: 50,          // Maximale Anzahl der Zeilen pro Durchlauf
  
  // Mapping für Maschinen-IDs
  machineMapping: {
    '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
    '866174040097655': 51, // Pfaffendorf
    '866174040098984': 53  // Rathen
  }
};

// Datenbank-Konfiguration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

// Statusinformationen
let status = {
  startRow: 1,
  currentRow: 0,
  totalRows: 0,
  processedRows: 0,
  importedCount: 0,
  skippedCount: 0,
  errorCount: 0,
  lastProcessed: null,
  completed: false,
  failed: false,
  errorMessage: null
};

/**
 * Loggt eine Nachricht und schreibt sie in die Logdatei
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(message);
  
  try {
    fs.appendFileSync(config.logFile, logMessage + '\n');
  } catch (err) {
    console.error(`Fehler beim Schreiben der Logdatei: ${err.message}`);
  }
}

/**
 * Lädt oder initialisiert den Status
 */
function loadStatus() {
  try {
    if (fs.existsSync(config.statusFile)) {
      const statusContent = fs.readFileSync(config.statusFile, 'utf8');
      status = JSON.parse(statusContent);
      log(`Status geladen: Startzeile ${status.startRow}, bisher ${status.importedCount} importiert.`);
    } else {
      log('Keine Status-Datei gefunden. Beginne mit einem neuen Status.');
      status.startRow = 1;
      status.currentRow = 0;
      status.totalRows = 0;
      status.processedRows = 0;
      status.importedCount = 0;
      status.skippedCount = 0;
      status.errorCount = 0;
      status.lastProcessed = null;
      status.completed = false;
      status.failed = false;
      status.errorMessage = null;
      saveStatus();
    }
  } catch (err) {
    log(`Fehler beim Laden des Status: ${err.message}`);
    // Neuen Status erstellen
    status.startRow = 1;
  }
}

/**
 * Speichert den aktuellen Status
 */
function saveStatus() {
  try {
    fs.writeFileSync(config.statusFile, JSON.stringify(status, null, 2));
  } catch (err) {
    log(`Fehler beim Speichern des Status: ${err.message}`);
  }
}

/**
 * Prüft, ob das Zeitlimit überschritten wurde
 */
function isTimeExceeded(startTime) {
  return Date.now() - startTime > config.maxProcessingTime;
}

/**
 * Konvertiert Excel-Daten in das Transaktionsformat
 */
function convertToTransactionFormat(rowData, rowIndex) {
  // Datum im ISO-Format konvertieren
  let dateTime;
  try {
    dateTime = new Date(rowData['Date / Time']);
    if (isNaN(dateTime.getTime())) {
      dateTime = new Date();
    }
  } catch (e) {
    dateTime = new Date();
  }
  
  const isoDate = dateTime.toISOString();
  
  // Erstelle eine eindeutige ID für die Transaktion
  const uniqueId = `${dateTime.getTime()}-${rowData['Produktnr.'] || '000'}-${rowData['Telemetrieeinheit'] || '0'}-${rowIndex}`;
  const vendonId = `imported-excel-${uniqueId}`;
  
  // Maschinen-ID aus der Telemetrieeinheit zuordnen
  let machineId = null;
  const telemetryUnit = rowData['Telemetrieeinheit'];
  if (telemetryUnit && config.machineMapping[telemetryUnit]) {
    machineId = config.machineMapping[telemetryUnit];
  }
  
  // Metadaten erstellen
  const metadata = JSON.stringify({
    importedFromExcel: true,
    importDate: new Date().toISOString(),
    telemetryUnit: telemetryUnit,
    address: rowData['Adresse'],
    transactionType: rowData['Transaktionstyp']
  });
  
  return {
    vendonId,
    datetime: isoDate,
    machineName: rowData['Automatenname'] || 'Unbekannt',
    machineId,
    productId: rowData['Produktnr.'] ? rowData['Produktnr.'].toString() : '0',
    productName: rowData['Produktname'] || 'Unbekanntes Produkt',
    quantity: rowData['Menge'] || 1,
    price: rowData['Preis (inkl. MwSt.)'] || 0,
    priceWoVat: rowData['Preis (ohne MwSt.)'] || 0,
    vat: rowData['MwSt. %'] || 0,
    currency: rowData['Währung'] || 'EUR',
    source: "excel-import-direct",
    metadata,
    status: "completed",
    processingStatus: "processed",
    syncedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
}

/**
 * Importiert Transaktionen in die Datenbank
 */
async function importTransactionsToDb(transactions) {
  if (transactions.length === 0) {
    return { success: true, inserted: 0, skipped: 0 };
  }
  
  let client = null;
  const pool = new Pool(dbConfig);
  
  try {
    client = await pool.connect();
    log(`Verbindung zur Datenbank hergestellt für ${transactions.length} Transaktionen.`);
    
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
 * Hauptfunktion zum Verarbeiten der Excel-Datei
 */
async function processExcelFile() {
  log('=== STARTE OPTIMIERTEN EXCEL-IMPORT ===');
  
  const startTime = Date.now();
  
  try {
    // Status laden
    loadStatus();
    
    // Prüfen, ob die Verarbeitung bereits abgeschlossen ist
    if (status.completed) {
      log('Import bereits abgeschlossen.');
      return { success: true, completed: true };
    }
    
    // Öffne Excel-Datei mit optimierten Einstellungen
    log(`Öffne Excel-Datei: ${config.inputExcelFile}`);
    
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      cellDates: true,
      sheetStubs: false,
      dense: true,
      raw: true
    });
    
    // Arbeitsblatt auswählen
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich ermitteln
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    
    // Wenn noch keine Gesamtzeilenanzahl bekannt ist, aktualisieren
    if (status.totalRows === 0) {
      status.totalRows = range.e.r;
      log(`Gesamtanzahl Zeilen: ${status.totalRows}`);
      saveStatus();
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
    
    log(`${Object.keys(headers).length} Spalten gefunden`);
    
    // Verarbeite Zeilen in Batches
    const endRow = Math.min(status.startRow + config.maxRowsPerRun, range.e.r + 1);
    log(`Verarbeite Zeilen ${status.startRow} bis ${endRow - 1}`);
    
    let batch = [];
    let rowsProcessed = 0;
    let currentRow = status.startRow;
    
    for (let r = status.startRow; r < endRow; r++) {
      // Prüfe, ob das Zeitlimit überschritten wurde
      if (isTimeExceeded(startTime)) {
        log(`Zeitlimit überschritten nach ${rowsProcessed} Zeilen.`);
        break;
      }
      
      currentRow = r;
      
      // Zeile verarbeiten
      const rowData = {};
      let hasData = false;
      
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = xlsx.utils.encode_cell({ r, c });
        if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
          rowData[headers[c]] = worksheet[cellAddress].v;
          hasData = true;
        }
      }
      
      // Nur Zeilen mit Daten hinzufügen
      if (hasData) {
        // Konvertiere in das Transaktionsformat
        const transaction = convertToTransactionFormat(rowData, r);
        batch.push(transaction);
        rowsProcessed++;
      }
      
      // Wenn der Batch voll ist oder wir am Ende sind, importieren
      if (batch.length >= config.batchSize || r === endRow - 1) {
        if (batch.length > 0) {
          log(`Importiere Batch mit ${batch.length} Transaktionen...`);
          
          const importResult = await importTransactionsToDb(batch);
          
          if (importResult.success) {
            status.importedCount += importResult.inserted;
            status.skippedCount += importResult.skipped;
            status.processedRows += batch.length;
            status.lastProcessed = new Date().toISOString();
            saveStatus();
          } else {
            log(`Fehler beim Importieren des Batches: ${importResult.error}`);
            status.failed = true;
            status.errorMessage = importResult.error;
            saveStatus();
            return { success: false, error: importResult.error };
          }
          
          // Zurücksetzen für nächsten Batch
          batch = [];
        }
      }
    }
    
    // Nach der Schleife überprüfen, ob alle Daten verarbeitet wurden
    const allProcessed = currentRow >= range.e.r;
    
    // Status aktualisieren
    status.startRow = currentRow + 1;
    status.currentRow = currentRow;
    status.lastProcessed = new Date().toISOString();
    status.completed = allProcessed;
    saveStatus();
    
    if (allProcessed) {
      log('=== IMPORT VOLLSTÄNDIG ABGESCHLOSSEN ===');
      log(`Insgesamt ${status.processedRows} Zeilen verarbeitet.`);
      log(`${status.importedCount} importiert, ${status.skippedCount} übersprungen.`);
      return { success: true, completed: true };
    } else {
      log(`=== TEILIMPORT ABGESCHLOSSEN ===`);
      log(`Fortschritt: ${status.processedRows}/${status.totalRows} Zeilen (${((status.processedRows / status.totalRows) * 100).toFixed(2)}%)`);
      log(`Nächste Zeile: ${status.startRow}`);
      
      // Exit-Code 10 bedeutet: Fortsetzung erforderlich
      process.exit(10);
    }
  } catch (error) {
    log(`Fehler bei der Verarbeitung: ${error.message}`);
    console.error(error.stack);
    
    status.failed = true;
    status.errorMessage = error.message;
    saveStatus();
    
    return { success: false, error: error.message };
  }
}

// Hauptfunktion ausführen
processExcelFile()
  .then(result => {
    if (result.success) {
      log('Verarbeitung erfolgreich abgeschlossen.');
    } else {
      log(`Verarbeitung fehlgeschlagen: ${result.error}`);
    }
  })
  .catch(error => {
    log(`Unerwarteter Fehler: ${error.message}`);
  });