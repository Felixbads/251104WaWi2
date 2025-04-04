/**
 * Importiert die aufgeteilten Excel-Chunks in die Datenbank (limitierte Version)
 * 
 * Begrenzt die Anzahl der verarbeiteten Zeilen pro Chunk, um Timeouts zu vermeiden.
 */

const { Pool } = require('pg');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Konfiguration
const CONFIG = {
  chunksDir: './split_excel_large',
  logFilePath: './import_split_chunks_limited.log',
  statusFilePath: './import_split_chunks_limited_status.json',
  rowsPerRun: 50, // Begrenzung der Zeilen pro Durchlauf
  startPosition: 0 // Startposition innerhalb des aktuellen Chunks
};

// Datenbankverbindung einrichten
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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
    processedChunks: [],
    currentChunk: null,
    currentPosition: 0,
    importedCount: 0,
    skippedCount: 0,
    errorCount: 0,
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

// Lese Excel-Datei und importiere Daten (teilweise)
async function importExcelChunkPartial(filePath, startPosition, maxRows) {
  try {
    log(`Verarbeite Excel-Chunk: ${filePath} (Zeilen ${startPosition + 1} bis ${startPosition + maxRows})`);
    
    // Excel-Datei einlesen
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere zu JSON mit Namen
    const allRows = xlsx.utils.sheet_to_json(worksheet);
    
    log(`Datei enthält insgesamt ${allRows.length} Zeilen, verarbeite Teilmenge von ${maxRows} Zeilen`);
    
    // Begrenzen auf den angeforderten Bereich
    const rows = allRows.slice(startPosition, startPosition + maxRows);
    
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Verarbeite jede Zeile
    for (const row of rows) {
      const result = await importTransaction(row);
      
      if (result.imported) importedCount++;
      if (result.skipped) skippedCount++;
      if (result.error && !result.skipped) errorCount++;
    }
    
    return {
      importedCount,
      skippedCount,
      errorCount,
      processedRows: rows.length,
      totalRows: allRows.length,
      endOfChunk: startPosition + maxRows >= allRows.length
    };
  } catch (error) {
    log(`Fehler beim Importieren der Datei ${filePath}: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    throw error;
  }
}

// Finde alle Chunk-Dateien
function getChunkFiles() {
  try {
    const files = fs.readdirSync(CONFIG.chunksDir)
      .filter(file => file.startsWith('chunk_') && file.endsWith('.xlsx'))
      .sort(); // Sortiert, damit Chunks in der richtigen Reihenfolge verarbeitet werden
    
    return files.map(file => path.join(CONFIG.chunksDir, file));
  } catch (error) {
    log(`Fehler beim Lesen des Chunk-Verzeichnisses: ${error.message}`);
    throw error;
  }
}

// Hauptfunktion
async function main() {
  let status = getStatus();
  
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
    const chunkFiles = getChunkFiles();
    log(`Gefundene Chunk-Dateien: ${chunkFiles.length}`);
    
    if (chunkFiles.length === 0) {
      log('Keine Chunk-Dateien gefunden. Beende Prozess.');
      status.running = false;
      saveStatus(status);
      return;
    }
    
    // Bestimme den zu verarbeitenden Chunk und die Position
    let currentChunkFile;
    let currentPosition;
    
    if (status.currentChunk === null) {
      // Beginne mit dem ersten nicht verarbeiteten Chunk
      for (const filePath of chunkFiles) {
        const fileName = path.basename(filePath);
        if (!status.processedChunks.includes(fileName)) {
          currentChunkFile = filePath;
          currentPosition = 0;
          status.currentChunk = fileName;
          status.currentPosition = 0;
          break;
        }
      }
    } else {
      // Setze die Verarbeitung des aktuellen Chunks fort
      const remainingChunks = chunkFiles.filter(filePath => 
        path.basename(filePath) === status.currentChunk || 
        !status.processedChunks.includes(path.basename(filePath))
      );
      
      if (remainingChunks.length > 0) {
        currentChunkFile = remainingChunks[0];
        currentPosition = status.currentPosition;
      }
    }
    
    if (!currentChunkFile) {
      log('Alle Chunks wurden bereits verarbeitet. Import abgeschlossen.');
      status.completed = true;
      status.running = false;
      saveStatus(status);
      return;
    }
    
    // Verarbeite einen Teil des aktuellen Chunks
    log(`Verarbeite Chunk ${status.currentChunk} ab Position ${currentPosition}`);
    const result = await importExcelChunkPartial(currentChunkFile, currentPosition, CONFIG.rowsPerRun);
    
    // Status aktualisieren
    status.importedCount += result.importedCount;
    status.skippedCount += result.skippedCount;
    status.errorCount += result.errorCount;
    status.lastProcessed = new Date().toISOString();
    
    if (result.endOfChunk) {
      // Chunk komplett verarbeitet
      log(`Chunk ${status.currentChunk} vollständig verarbeitet`);
      status.processedChunks.push(status.currentChunk);
      
      // Wähle den nächsten Chunk
      const remainingChunks = chunkFiles.filter(filePath => 
        !status.processedChunks.includes(path.basename(filePath))
      );
      
      if (remainingChunks.length > 0) {
        status.currentChunk = path.basename(remainingChunks[0]);
        status.currentPosition = 0;
        log(`Nächster zu verarbeitender Chunk: ${status.currentChunk}`);
      } else {
        status.completed = true;
        log('Alle Chunks verarbeitet. Import abgeschlossen!');
      }
    } else {
      // Aktualisiere die Position für den nächsten Durchlauf
      status.currentPosition += result.processedRows;
      log(`Nächste Position für Chunk ${status.currentChunk}: ${status.currentPosition}`);
    }
    
    // Zeige Fortschritt
    const chunksProgress = `${status.processedChunks.length}/${chunkFiles.length}`;
    log(`Fortschritt: ${chunksProgress} Chunks, ${status.importedCount} importiert, ${status.skippedCount} übersprungen, ${status.errorCount} Fehler`);
    
    // Status speichern
    saveStatus(status);
    
  } catch (error) {
    log(`Kritischer Fehler: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
  } finally {
    status.running = false;
    saveStatus(status);
  }
}

// Skript ausführen
main().catch(error => {
  log(`Unbehandelter Fehler: ${error.message}`);
  process.exit(1);
});