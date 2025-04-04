/**
 * Optimierte Version des JSON-Chunk-Imports für Dateien mit Leerzeichen im Namen
 * Diese Version ist speziell auf den Import von Dateien aus dem json_chunks_large-Verzeichnis optimiert
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Konfiguration
const config = {
  chunksDir: './json_chunks_large',
  statusFile: './json_chunks_import_status.json',
  maxRowsPerChunk: 2000, // Maximale Anzahl von Datensätzen pro Chunk
  maxProcessingTime: 20000, // 20 Sekunden
  batchSize: 500, // Anzahl der Transaktionen pro Batch-Insert
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
 * Status-Verwaltung
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
 * Findet alle JSON-Chunk-Dateien im Verzeichnis
 */
function findChunkFiles() {
  if (!fs.existsSync(config.chunksDir)) {
    log(`Verzeichnis ${config.chunksDir} existiert nicht.`);
    return [];
  }
  
  // Liste alle Dateien im Verzeichnis auf
  const files = fs.readdirSync(config.chunksDir);
  
  // Filtere auf JSON-Dateien
  const jsonFiles = files.filter(file => file.endsWith('.json'));
  
  // Sortiere die Dateien nach ihrem Namen
  return jsonFiles.sort();
}

/**
 * Liest einen JSON-Chunk ein
 */
function readChunk(chunkFileName) {
  const chunkFile = path.join(config.chunksDir, chunkFileName);
  
  if (!fs.existsSync(chunkFile)) {
    throw new Error(`Chunk-Datei nicht gefunden: ${chunkFile}`);
  }
  
  log(`Lese Chunk-Datei: ${chunkFileName}`);
  try {
    const content = fs.readFileSync(chunkFile, 'utf8');
    const data = JSON.parse(content);
    
    // Überprüfe, ob die Daten ein Array sind
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
    
    throw new Error('Unerwartetes Datenformat, erwartet wurde ein Array oder ein Objekt mit Array-Eigenschaft');
  } catch (error) {
    log(`Fehler beim Lesen der Chunk-Datei ${chunkFileName}: ${error.message}`);
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
    
    // Verarbeite in Batches, um die Effizienz zu erhöhen
    for (let i = 0; i < transactions.length; i += config.batchSize) {
      const batch = transactions.slice(i, i + config.batchSize);
      log(`Verarbeite Batch ${Math.floor(i / config.batchSize) + 1}/${Math.ceil(transactions.length / config.batchSize)} mit ${batch.length} Transaktionen...`);
      
      // Verarbeite jede Transaktion im Batch
      for (const transaction of batch) {
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
          
          // Log Fortschritt alle 100 Transaktionen
          if (insertedCount % 100 === 0) {
            log(`Fortschritt: ${insertedCount} Transaktionen importiert, ${skippedCount} übersprungen.`);
          }
        } catch (error) {
          log(`Fehler beim Importieren einer Transaktion: ${error.message}`);
          throw error;
        }
      }
      
      // Commit nach jedem Batch für bessere Stabilität
      await client.query('COMMIT');
      await client.query('BEGIN');
      log(`Batch ${Math.floor(i / config.batchSize) + 1} abgeschlossen: ${insertedCount} importiert, ${skippedCount} übersprungen.`);
    }
    
    // Commit der letzten Transaktion
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
 * Importiert einen spezifischen JSON-Chunk
 */
async function importSingleChunk(chunkFileName) {
  try {
    // Chunk einlesen
    log(`Lese Chunk ${chunkFileName}...`);
    const chunkData = readChunk(chunkFileName);
    
    // In Vendon-Format konvertieren
    log(`Konvertiere ${chunkData.length} Einträge...`);
    const transactions = convertToTransactionFormat(chunkData);
    
    // Importiere die Transaktionen
    log(`Importiere Chunk ${chunkFileName} mit ${transactions.length} Transaktionen...`);
    
    const importResult = await importTransactionsToDb(transactions);
    
    if (importResult.success) {
      log(`Chunk ${chunkFileName} erfolgreich importiert: ${importResult.inserted} importiert, ${importResult.skipped} übersprungen.`);
      return {
        success: true,
        inserted: importResult.inserted,
        skipped: importResult.skipped
      };
    } else {
      log(`Fehler beim Importieren von Chunk ${chunkFileName}: ${importResult.error}`);
      return {
        success: false,
        error: importResult.error
      };
    }
  } catch (error) {
    log(`Fehler bei der Verarbeitung von Chunk ${chunkFileName}: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Hauptfunktion zum Importieren der JSON-Chunks
 */
async function importJsonChunks() {
  log('=== STARTE OPTIMIERTEN JSON-CHUNKS IMPORT ===');
  
  const startTime = Date.now();
  
  try {
    // Status initialisieren oder fortsetzen
    const status = getStatus();
    
    if (status.completed) {
      log('Import bereits abgeschlossen.');
      return { success: true, completed: true };
    }
    
    // Alle Chunk-Dateien finden
    const chunkFiles = findChunkFiles();
    
    if (chunkFiles.length === 0) {
      log(`Keine JSON-Chunks im Verzeichnis ${config.chunksDir} gefunden.`);
      return { success: false, error: 'Keine Chunks gefunden' };
    }
    
    // Status aktualisieren, wenn noch nicht initialisiert
    if (status.totalChunks === 0) {
      status.totalChunks = chunkFiles.length;
      log(`${chunkFiles.length} JSON-Chunks gefunden.`);
      saveStatus(status);
    }
    
    // Nächste zu verarbeitende Chunk-Datei
    const nextChunkIndex = status.lastProcessedChunk + 1;
    
    if (nextChunkIndex >= chunkFiles.length) {
      log('Alle Chunks wurden bereits verarbeitet.');
      status.completed = true;
      saveStatus(status);
      return { success: true, completed: true };
    }
    
    // Verarbeite den nächsten Chunk
    const chunkFileName = chunkFiles[nextChunkIndex];
    log(`Verarbeite Chunk ${nextChunkIndex + 1}/${chunkFiles.length}: ${chunkFileName}`);
    
    const importResult = await importSingleChunk(chunkFileName);
    
    if (importResult.success) {
      // Status aktualisieren
      status.importedCount += importResult.inserted;
      status.skippedCount += importResult.skipped;
      status.lastProcessedChunk = nextChunkIndex;
      status.processedChunks++;
      status.lastProcessed = new Date().toISOString();
      
      // Überprüfen, ob alle Chunks verarbeitet wurden
      const allProcessed = nextChunkIndex >= chunkFiles.length - 1;
      status.completed = allProcessed;
      
      saveStatus(status);
      
      if (allProcessed) {
        log(`\n=== IMPORT VOLLSTÄNDIG ABGESCHLOSSEN ===`);
        log(`Insgesamt ${status.processedChunks}/${status.totalChunks} Chunks verarbeitet.`);
        log(`Importergebnis: ${status.importedCount} importiert, ${status.skippedCount} übersprungen.`);
      } else {
        log(`\nTeilimport abgeschlossen. Nächster Durchlauf wird bei Chunk ${nextChunkIndex + 1}/${chunkFiles.length} (${chunkFiles[nextChunkIndex + 1]}) fortgesetzt.`);
        log(`Zwischenstand: ${status.processedChunks}/${status.totalChunks} Chunks (${((status.processedChunks / status.totalChunks) * 100).toFixed(2)}%)`);
        log(`${status.importedCount} importiert, ${status.skippedCount} übersprungen.`);
        
        // Exit-Code 10 bedeutet: Fortsetzung erforderlich
        process.exit(10);
      }
      
      return { 
        success: true, 
        completed: allProcessed,
        processedChunks: 1
      };
    } else {
      // Status als fehlgeschlagen markieren
      status.failed = true;
      status.errorMessage = importResult.error;
      saveStatus(status);
      
      return { 
        success: false, 
        error: importResult.error
      };
    }
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