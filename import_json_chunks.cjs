/**
 * Import der JSON-Chunks in die Datenbank
 * 
 * Dieses Skript verarbeitet die zuvor erstellten JSON-Chunks und importiert
 * die darin enthaltenen Daten in die Datenbank. Es ist für die Replit-Umgebung
 * optimiert und gewährleistet einen zuverlässigen Import auch bei großen Datenmengen.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Konfiguration
const config = {
  chunksDir: './json_chunks_large',
  statusFile: './json_import_status.json',
  maxChunksPerRun: 5,
  maxProcessingTime: 20000, // 20 Sekunden pro Durchlauf
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

/**
 * Status-Management
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
    lastProcessedChunk: -1, // -1 bedeutet, noch kein Chunk verarbeitet
    processedChunks: 0,
    importedCount: 0,
    skippedCount: 0,
    failed: false,
    completed: false,
    lastProcessed: null,
    totalChunks: 0,
    errorMessage: null
  };
}

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
 * Loggt eine Nachricht mit Zeitstempel
 */
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Prüft, ob das Zeitlimit überschritten wurde
 */
function isTimeExceeded(startTime) {
  return config.maxProcessingTime > 0 && (Date.now() - startTime) > config.maxProcessingTime;
}

/**
 * Zählt die Anzahl der verfügbaren Chunks
 */
function countChunks() {
  if (!fs.existsSync(config.chunksDir)) {
    return 0;
  }
  
  const files = fs.readdirSync(config.chunksDir);
  return files.filter(file => file.endsWith('.json')).length;
}

/**
 * Findet die JSON-Chunk-Dateien im Verzeichnis
 */
function findChunkFiles() {
  if (!fs.existsSync(config.chunksDir)) {
    return [];
  }
  
  const files = fs.readdirSync(config.chunksDir);
  return files.filter(file => file.endsWith('.json')).sort();
}

/**
 * Liest einen JSON-Chunk ein
 */
function readChunk(chunkIndex) {
  // Alle Chunk-Dateien im Verzeichnis finden
  const chunkFiles = findChunkFiles();
  
  if (chunkFiles.length === 0 || chunkIndex >= chunkFiles.length) {
    throw new Error(`Chunk-Datei nicht gefunden für Index: ${chunkIndex}`);
  }
  
  // Verwende die sortierte Liste, um den richtigen Chunk zu bekommen
  const chunkFile = path.join(config.chunksDir, chunkFiles[chunkIndex]);
  
  if (!fs.existsSync(chunkFile)) {
    throw new Error(`Chunk-Datei nicht gefunden: ${chunkFile}`);
  }
  
  log(`Lese Chunk-Datei: ${chunkFile}`);
  try {
    const content = fs.readFileSync(chunkFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(`Fehler beim Lesen der Chunk-Datei ${chunkFile}: ${error.message}`);
    // Versuche als JSON-Array zu parsen, wenn der Inhalt kein Array ist
    try {
      const content = fs.readFileSync(chunkFile, 'utf8');
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        return data;
      } else if (typeof data === 'object') {
        // Versuche, Daten aus einem Objekt zu extrahieren
        for (const key in data) {
          if (Array.isArray(data[key])) {
            log(`Verwende Array aus Schlüssel '${key}' mit ${data[key].length} Einträgen`);
            return data[key];
          }
        }
        // Wenn kein Array gefunden wurde, erstelle ein Array mit dem Objekt
        log('Erstelle Array aus einzelnem Objekt');
        return [data];
      }
    } catch (parseError) {
      log(`Fehler beim erneuten Parsen: ${parseError.message}`);
    }
    throw error;
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
 * Importiert Transaktionen in die Datenbank
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
 * Hauptfunktion zum Importieren der JSON-Chunks
 */
async function importJsonChunks() {
  log('=== STARTE JSON-CHUNKS IMPORT ===');
  
  const startTime = Date.now();
  
  try {
    // Status initialisieren oder fortsetzen
    const status = getStatus();
    
    if (status.completed) {
      log('Import bereits abgeschlossen.');
      return { success: true, completed: true };
    }
    
    // Zähle verfügbare Chunks
    if (status.totalChunks === 0) {
      const chunkCount = countChunks();
      status.totalChunks = chunkCount;
      log(`${chunkCount} JSON-Chunks gefunden.`);
      saveStatus(status);
      
      if (chunkCount === 0) {
        log('Keine Chunks zum Importieren gefunden. Bitte führen Sie zuerst die Aufteilung durch.');
        return { success: false, error: 'Keine Chunks gefunden' };
      }
    }
    
    // Nächster zu verarbeitender Chunk
    const startChunk = status.lastProcessedChunk + 1;
    const endChunk = Math.min(startChunk + config.maxChunksPerRun - 1, status.totalChunks - 1);
    
    log(`Verarbeite Chunks ${startChunk} bis ${endChunk}...`);
    
    let processedChunks = 0;
    let currentChunk = startChunk;
    
    // Chunks verarbeiten
    for (let i = startChunk; i <= endChunk; i++) {
      // Zeitlimit überprüfen
      if (isTimeExceeded(startTime)) {
        log(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, unterbreche Verarbeitung.`);
        break;
      }
      
      currentChunk = i;
      
      try {
        // Chunk einlesen
        log(`Lese Chunk ${i}...`);
        const chunkData = readChunk(i);
        
        // In Vendon-Format konvertieren
        log(`Konvertiere ${chunkData.length} Einträge...`);
        const transactions = convertToTransactionFormat(chunkData);
        
        // Importiere die Transaktionen
        log(`Importiere Chunk ${i} mit ${transactions.length} Transaktionen...`);
        
        const importResult = await importTransactionsToDb(transactions);
        
        if (importResult.success) {
          log(`Chunk ${i} erfolgreich importiert: ${importResult.inserted} importiert, ${importResult.skipped} übersprungen.`);
          status.importedCount += importResult.inserted;
          status.skippedCount += importResult.skipped;
          status.lastProcessedChunk = i;
          status.processedChunks++;
          status.lastProcessed = new Date().toISOString();
          saveStatus(status);
          processedChunks++;
        } else {
          log(`Fehler beim Importieren von Chunk ${i}: ${importResult.error}`);
          
          // Status auf fehlgeschlagen setzen
          status.failed = true;
          status.errorMessage = importResult.error;
          saveStatus(status);
          
          return { 
            success: false, 
            error: importResult.error
          };
        }
      } catch (error) {
        log(`Fehler bei der Verarbeitung von Chunk ${i}: ${error.message}`);
        
        // Status auf fehlgeschlagen setzen
        status.failed = true;
        status.errorMessage = error.message;
        saveStatus(status);
        
        return { 
          success: false, 
          error: error.message
        };
      }
    }
    
    // Überprüfen, ob alle Chunks verarbeitet wurden
    const allProcessed = currentChunk >= status.totalChunks - 1;
    
    // Status aktualisieren
    status.completed = allProcessed;
    saveStatus(status);
    
    if (allProcessed) {
      log(`\n=== IMPORT VOLLSTÄNDIG ABGESCHLOSSEN ===`);
      log(`Insgesamt ${status.processedChunks} Chunks verarbeitet.`);
      log(`Importergebnis: ${status.importedCount} importiert, ${status.skippedCount} übersprungen.`);
    } else {
      log(`\nTeilimport abgeschlossen. Nächster Durchlauf wird bei Chunk ${currentChunk + 1} fortgesetzt.`);
      log(`Zwischenstand: ${status.processedChunks}/${status.totalChunks} Chunks (${((status.processedChunks / status.totalChunks) * 100).toFixed(2)}%)`);
      log(`${status.importedCount} importiert, ${status.skippedCount} übersprungen.`);
      
      // Exit-Code 10 bedeutet: Fortsetzung erforderlich
      process.exit(10);
    }
    
    return { 
      success: true, 
      completed: allProcessed,
      processedChunks
    };
  } catch (error) {
    log(`Fehler im Hauptprozess: ${error.message}`);
    console.error(error.stack);
    
    // Status als fehlgeschlagen markieren
    const status = getStatus();
    status.failed = true;
    status.errorMessage = error.message;
    saveStatus(status);
    
    return { 
      success: false, 
      error: error.message
    };
  }
}

// Hauptfunktion ausführen
console.time('Processing Time');
importJsonChunks()
  .then((result) => {
    console.timeEnd('Processing Time');
    if (result.success) {
      log('JSON-Import erfolgreich.');
    } else {
      log(`JSON-Import fehlgeschlagen: ${result.error}`);
    }
  })
  .catch((error) => {
    console.timeEnd('Processing Time');
    log(`Unerwarteter Fehler: ${error.message}`);
  });