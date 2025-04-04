/**
 * Excel-Datei direkt in Chunks verarbeiten und importieren
 * 
 * Dieses Skript importiert Daten aus einer Excel-Datei direkt in die Datenbank,
 * indem es die Datei in kleinen Abschnitten (Chunks) liest und verarbeitet,
 * um Memory-Probleme zu vermeiden.
 */

const { Pool } = require('pg');
const fs = require('fs');
const xlsx = require('xlsx');

// Datenbankverbindung einrichten
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Konfiguration
const CONFIG = {
  // Große Datei für den Import
  excelFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  startRow: 0,         // Startreihe (0-basiert)
  chunkSize: 5,        // Anzahl der Zeilen pro Chunk (reduziert für große Datei)
  logFilePath: './excel_large_chunk_import.log',
  statusFilePath: './excel_large_chunk_import_status.json',
  maxRowsToRead: 50000 // Maximale Anzahl der zu lesenden Zeilen, um Speicherüberlauf zu verhindern
};

// Status-Management
function getStatus() {
  try {
    if (fs.existsSync(CONFIG.statusFilePath)) {
      return JSON.parse(fs.readFileSync(CONFIG.statusFilePath, 'utf8'));
    }
  } catch (error) {
    log(`Fehler beim Lesen der Status-Datei: ${error.message}`);
  }
  
  return {
    currentRow: CONFIG.startRow,
    totalRows: 0,
    importedCount: 0,
    skippedCount: 0,
    lastProcessed: null,
    running: false,
    completed: false,
    startTime: new Date().toISOString()
  };
}

function saveStatus(status) {
  status.lastUpdate = new Date().toISOString();
  fs.writeFileSync(CONFIG.statusFilePath, JSON.stringify(status, null, 2));
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Überprüfen, ob eine Transaktion bereits existiert
async function transactionExists(transactionId) {
  const query = 'SELECT COUNT(*) FROM transactions WHERE vendon_id = $1';
  const result = await pool.query(query, [transactionId.toString()]);
  return parseInt(result.rows[0].count) > 0;
}

// Extrahiere eine Teilmenge der Excel-Daten
function readExcelChunk(filePath, startRow, numRows) {
  try {
    // Optionen für das Lesen der Excel-Datei
    const options = {
      type: 'array',
      cellDates: true,
      dateNF: 'yyyy-mm-dd',
      cellNF: false,
      cellText: false,
      sheetRows: Math.min(startRow + numRows, CONFIG.maxRowsToRead) // Nur bis zur benötigten Zeile lesen
    };
    
    log(`Lese Excel-Chunk: Zeilen ${startRow + 1} bis ${startRow + numRows}`);
    const workbook = xlsx.readFile(filePath, options);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere zu JSON, aber nur die benötigten Zeilen
    const allData = xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 0 });
    
    // Extrahiere den Header (erste Zeile) für die Spaltennamen
    const header = allData[0];
    
    // Extrahiere die angeforderten Zeilen
    const dataRows = allData.slice(Math.max(1, startRow), Math.min(startRow + numRows, allData.length));
    
    // Verbleibende Zeilen schätzen
    let totalRows;
    if (dataRows.length < numRows) {
      // Wenn weniger Zeilen als angefordert zurückgegeben wurden, haben wir das Ende der Datei erreicht
      totalRows = startRow + dataRows.length;
    } else if (startRow + numRows >= CONFIG.maxRowsToRead) {
      // Wenn wir die maximale Anzahl der zu lesenden Zeilen erreicht haben
      totalRows = CONFIG.maxRowsToRead;
      log(`Maximale Anzahl der zu lesenden Zeilen (${CONFIG.maxRowsToRead}) erreicht.`);
    } else {
      // Ansonsten die Standardberechnung verwenden
      totalRows = allData.length - 1; // Zähle Header-Zeile nicht mit
    }
    
    // Konvertiere Zeilen in Objekte mit benannten Eigenschaften
    const result = dataRows.map(row => {
      const obj = {};
      header.forEach((colName, index) => {
        obj[colName] = row[index];
      });
      return obj;
    });
    
    return {
      data: result,
      totalRows: totalRows
    };
  } catch (error) {
    log(`Fehler beim Lesen der Excel-Chunk: ${error.message}`);
    throw error;
  }
}

// Importiere eine einzelne Transaktion in die Datenbank
async function importTransaction(row) {
  try {
    const transactionData = {
      transaction_id: parseInt(row['Telemetrieeinheit']) || null,
      datetime: new Date(row['Date / Time']).toISOString(),
      machine_id: 52, // Bad Schandau Bahnhof
      machine_name: row['Automatenname'] || '',
      price: parseFloat(row['Preis (inkl. MwSt.)']) || 0,
      name: row['Produktname'] || '',
      payment_method: row['Transaktionstyp'] || '',
      quantity: parseInt(row['Menge']) || 1
    };
    
    // Wenn keine gültige transaction_id vorhanden ist, überspringen
    if (!transactionData.transaction_id) {
      log(`Überspringe Zeile ohne gültige Transaktions-ID`);
      return { imported: false, skipped: true, error: 'Keine gültige Transaktions-ID' };
    }
    
    // Überprüfen, ob die Transaktion bereits existiert
    const exists = await transactionExists(transactionData.transaction_id);
    if (exists) {
      log(`Überspringe Transaktion ${transactionData.transaction_id}: Bereits in der Datenbank vorhanden`);
      return { imported: false, skipped: true };
    }
    
    // Einfügen in die Datenbank
    const insertQuery = `
      INSERT INTO transactions (
        vendon_id, datetime, machine_id, machine_name, 
        price, product_name, payment_method, quantity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    
    const values = [
      transactionData.transaction_id.toString(), // vendon_id ist ein Text-Feld
      transactionData.datetime,
      transactionData.machine_id,
      transactionData.machine_name,
      transactionData.price,
      transactionData.name,                      // product_name statt name
      transactionData.payment_method,
      transactionData.quantity
    ];
    
    const result = await pool.query(insertQuery, values);
    log(`Transaktion ${transactionData.transaction_id} (ID: ${result.rows[0].id}) importiert`);
    return { imported: true, skipped: false };
    
  } catch (error) {
    log(`Fehler beim Importieren: ${error.message}`);
    return { imported: false, skipped: false, error: error.message };
  }
}

// Hauptfunktion: Verarbeite einen Chunk der Excel-Datei
async function processExcelChunk() {
  let status = getStatus();
  
  // Wenn der Prozess bereits läuft oder abgeschlossen ist, abbrechen
  if (status.running) {
    log('Ein anderer Prozess läuft bereits. Abbruch.');
    return;
  }
  
  if (status.completed) {
    log('Der Import wurde bereits abgeschlossen. Verwenden Sie --reset, um neu zu starten.');
    return;
  }
  
  status.running = true;
  saveStatus(status);
  
  try {
    log(`Verarbeite Excel-Datei: ${CONFIG.excelFilePath}, Startzeile: ${status.currentRow}, Chunkgröße: ${CONFIG.chunkSize}`);
    
    // Lese den aktuellen Chunk aus der Excel-Datei
    const { data, totalRows } = readExcelChunk(CONFIG.excelFilePath, status.currentRow, CONFIG.chunkSize);
    
    // Aktualisiere die Gesamtzahl der Zeilen, falls nötig
    if (status.totalRows === 0) {
      status.totalRows = totalRows;
      saveStatus(status);
      log(`Excel-Datei enthält insgesamt ${totalRows} Zeilen.`);
    }
    
    // Wenn keine Daten mehr zu verarbeiten sind, markiere als abgeschlossen
    if (data.length === 0) {
      log('Keine weiteren Daten zu verarbeiten. Import abgeschlossen.');
      status.running = false;
      status.completed = true;
      saveStatus(status);
      return;
    }
    
    log(`Verarbeite Chunk: Zeilen ${status.currentRow + 1} bis ${status.currentRow + data.length} von ${status.totalRows}`);
    
    let chunkImported = 0;
    let chunkSkipped = 0;
    
    // Verarbeite jede Zeile im Chunk
    for (const row of data) {
      const result = await importTransaction(row);
      
      if (result.imported) chunkImported++;
      if (result.skipped) chunkSkipped++;
    }
    
    // Status aktualisieren
    status.currentRow += data.length;
    status.importedCount += chunkImported;
    status.skippedCount += chunkSkipped;
    status.lastProcessed = new Date().toISOString();
    
    // Prüfen, ob alle Zeilen verarbeitet wurden
    if (status.currentRow >= status.totalRows) {
      status.completed = true;
      log('Alle Zeilen wurden verarbeitet. Import abgeschlossen!');
    }
    
    const progress = ((status.currentRow / status.totalRows) * 100).toFixed(2);
    log(`Chunk abgeschlossen. ${chunkImported} importiert, ${chunkSkipped} übersprungen.`);
    log(`Fortschritt: ${status.currentRow}/${status.totalRows} (${progress}%)`);
    
  } catch (error) {
    log(`Kritischer Fehler: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
  } finally {
    // In jedem Fall den Laufstatus zurücksetzen
    status.running = false;
    saveStatus(status);
  }
}

// Hauptfunktion
async function main() {
  try {
    await processExcelChunk();
  } catch (error) {
    log(`Unbehandelter Fehler: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Skript ausführen
main();