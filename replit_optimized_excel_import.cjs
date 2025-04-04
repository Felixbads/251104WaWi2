/**
 * Hochoptimierter Excel-Import für sehr große Dateien in der Replit-Umgebung
 * 
 * Dieses Skript implementiert einen noch effizienteren Ansatz für den Import 
 * von sehr großen Excel-Dateien in die Datenbank, der speziell für die 
 * Ressourcenbeschränkungen in der Replit-Umgebung optimiert ist.
 */

const fs = require('fs');
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

// Datenbank-Konfiguration für direkten Zugriff
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

// Konfiguration für den Import
const config = {
  // Datei-Konfiguration
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  statusFile: './excel_import_status_optimized.json',
  logFile: './excel_import_optimized.log',
  
  // Replit-optimierte Prozesssteuerung
  chunkSize: 10,           // Kleinere Chunks für bessere Speicherauslastung
  maxProcessingTime: 20000, // Kürzere Durchläufe, aber mehr davon
  maxStreamRowsBeforeBreak: 1000, // Maximale Anzahl Zeilen pro Streaming-Durchlauf
  
  // Mapping für Maschinen-IDs
  machineMapping: {
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
    importedCount: 0,
    skippedCount: 0,
    failed: false,
    completed: false,
    lastProcessed: null,
    totalRows: 0,
    totalProcessed: 0,
    currentPass: 1,
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
 * Importiert Transaktionen direkt in die Datenbank
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
 * Verbesserte Funktion zum Lesen der Gesamtzahl der Zeilen in einer Excel-Datei
 */
function getExcelRowCount() {
  try {
    log(`Öffne Excel-Datei für Zeilenanalyse: ${config.inputExcelFile}`);
    
    // Erstelle Dateistream-Objekt für effiziente Analyse
    const stats = fs.statSync(config.inputExcelFile);
    log(`Dateigröße: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    
    // Lese die erste Zeile und ermittle die Gesamtzahl der Zeilen aus der Excel-Datei
    // Wir verwenden ein anderes Verfahren für große Dateien
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellStyles: false,
      cellNF: false,
      cellHTML: false,
      cellFormula: false,
      dense: true,
      raw: true,
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Extrahiere die Bereichsinformation
    if (worksheet['!ref']) {
      const range = xlsx.utils.decode_range(worksheet['!ref']);
      const rowCount = range.e.r;
      log(`Excel-Datei hat ${rowCount} Zeilen (0-basierter Index)`);
      return rowCount;
    } else {
      log('Konnte keinen gültigen Bereich in der Excel-Datei finden.');
      return 100000; // Fallback: Eine vernünftige Standardanzahl für Vendon-Berichte
    }
  } catch (error) {
    log(`Fehler beim Ermitteln der Zeilenanzahl: ${error.message}`);
    log(`Verwende Standardwert für Zeilenanzahl.`);
    return 100000; // Fallback für Fehlerfall
  }
}

/**
 * Hauptfunktion - Hochoptimierte Version
 */
async function main() {
  log('=== STARTE OPTIMIERTEN EXCEL-IMPORT ===');
  
  // Startzeit für Zeitbegrenzung festlegen
  const startTime = Date.now();
  
  try {
    // Status initialisieren/laden
    const status = getStatus();
    
    // Überprüfe, ob bereits abgeschlossen
    if (status.completed === true) {
      log('Import bereits abgeschlossen.');
      return;
    }
    
    // Wenn noch keine Zeilenanzahl bekannt ist, erste Analyse durchführen
    if (status.totalRows === 0) {
      log('Analysiere Excel-Datei für Zeilenanzahl...');
      const rowCount = getExcelRowCount();
      status.totalRows = rowCount;
      log(`Excel-Datei enthält insgesamt ${rowCount} Zeilen.`);
      saveStatus(status);
    }
    
    log(`Beginne/setze Import fort ab Zeile ${status.startRow}.`);
    log(`Fortschritt: ${status.totalProcessed}/${status.totalRows} Zeilen (${((status.totalProcessed / status.totalRows) * 100).toFixed(2)}%)`);
    
    // Lese Daten im Stream-Modus, um Arbeitsspeicher zu sparen
    log('Öffne Excel-Datei im Stream-Modus...');
    
    // Optimierte Optionen fürs Lesen
    const options = {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      cellDates: true,
      sheetStubs: false,
      sheetRows: status.startRow + config.maxStreamRowsBeforeBreak,
      sheets: [0],
      dense: true,
      raw: true
    };
    
    const workbook = xlsx.readFile(config.inputExcelFile, options);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Extrahiere Header aus der ersten Zeile
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const headers = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
      if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
        headers[c] = worksheet[cellAddress].v;
      } else {
        headers[c] = `Column_${c}`;
      }
    }
    
    log(`${Object.keys(headers).length} Spalten gefunden.`);
    
    // Verarbeite nur einen begrenzten Bereich in diesem Durchlauf
    const startRow = status.startRow;
    const endRow = Math.min(range.e.r + 1, startRow + config.maxStreamRowsBeforeBreak);
    
    log(`Verarbeite Zeilen ${startRow} bis ${endRow - 1} in diesem Durchlauf...`);
    
    let batchData = [];
    let rowsProcessed = 0;
    let currentRow = startRow;
    
    // Daten verarbeiten
    for (let r = startRow; r < endRow; r++) {
      // Prüfe Zeitbegrenzung
      if (config.maxProcessingTime > 0 && (Date.now() - startTime) > config.maxProcessingTime) {
        log(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, unterbreche Verarbeitung.`);
        break;
      }
      
      currentRow = r;
      
      // Daten einer Zeile lesen
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
        batchData.push(rowData);
        rowsProcessed++;
      }
      
      // Wenn ein Chunk voll ist oder wir am Ende sind, verarbeiten
      if (batchData.length >= config.chunkSize || r === endRow - 1) {
        if (batchData.length > 0) {
          // In Vendon-Format konvertieren
          const transactions = convertToTransactionFormat(batchData);
          
          // Importiere die Transaktionen
          log(`Importiere Batch mit ${transactions.length} Transaktionen...`);
          
          const importResult = await importTransactionsToDb(transactions);
          
          if (importResult.success) {
            log(`Batch-Import erfolgreich: ${importResult.inserted} importiert, ${importResult.skipped} übersprungen.`);
            status.importedCount += importResult.inserted;
            status.skippedCount += importResult.skipped;
            saveStatus(status);
          } else {
            log(`Batch-Import fehlgeschlagen: ${importResult.error}`);
            
            // Status auf fehlgeschlagen setzen
            status.failed = true;
            status.errorMessage = importResult.error;
            saveStatus(status);
            
            return;
          }
          
          // Zurücksetzen für nächsten Batch
          batchData = [];
        }
      }
    }
    
    // Nach der Schleife überprüfen, ob alle Daten verarbeitet wurden
    const allProcessed = currentRow >= status.totalRows;
    
    // Status aktualisieren
    status.startRow = allProcessed ? 1 : currentRow + 1;
    status.processedRows = rowsProcessed;
    status.totalProcessed += rowsProcessed;
    status.lastProcessed = new Date().toISOString();
    status.completed = allProcessed;
    status.currentPass++;
    saveStatus(status);
    
    if (allProcessed) {
      log(`\n=== IMPORT VOLLSTÄNDIG ABGESCHLOSSEN ===`);
      log(`Insgesamt ${status.totalProcessed} Zeilen verarbeitet.`);
      log(`Gesamtergebnis: ${status.importedCount} importiert, ${status.skippedCount} übersprungen.`);
    } else {
      log(`\nTeilimport abgeschlossen. Nächster Durchlauf wird bei Zeile ${status.startRow} fortgesetzt.`);
      log(`Zwischenstand: Durchlauf ${status.currentPass}, ${status.totalProcessed}/${status.totalRows} Zeilen (${((status.totalProcessed / status.totalRows) * 100).toFixed(2)}%)`);
      log(`${status.importedCount} importiert, ${status.skippedCount} übersprungen.`);
      
      // Exit mit Code 10, damit Wrapper-Script weiß, dass es fortsetzen soll
      process.exit(10);
    }
    
  } catch (error) {
    log(`Fehler im Hauptprozess: ${error.message}`);
    console.error(error.stack);
    
    // Status als fehlgeschlagen markieren
    const status = getStatus();
    status.failed = true;
    status.errorMessage = error.message;
    saveStatus(status);
  }
}

// Starte Hauptprozess
console.time('Processing Time');
main()
  .then(() => {
    console.timeEnd('Processing Time');
  })
  .catch(error => {
    console.timeEnd('Processing Time');
    log(`Kritischer Fehler: ${error.message}`);
  });