const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Konfiguration
const config = {
  // Datei-Konfiguration
  jsonDir: './json_chunks_small',
  jsonPattern: /^chunk_(\d+)\.json$/, // Regex-Muster für die JSON-Dateien
  startFromChunk: 1, // Beginne mit diesem Chunk (1-basiert)
  maxChunks: 2, // Maximale Anzahl von zu importierenden Chunks (0 für alle)
  
  // API-Konfiguration
  apiEndpoint: 'http://localhost:5000/api/vendon/import/json',
  delayBetweenRequests: 2000, // Wartezeit zwischen API-Anfragen in Millisekunden
  
  // Logging
  logFile: './import_results.log'
};

/**
 * Erzeugt eine Zeitangabe im Format [HH:MM:SS]
 */
function getTimeString() {
  const now = new Date();
  return `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
}

/**
 * Schreibt eine Nachricht in die Log-Datei und auf die Konsole
 */
function log(message, silent = false) {
  const logMessage = `${getTimeString()} ${message}\n`;
  
  if (!silent) {
    console.log(message);
  }
  
  fs.appendFileSync(config.logFile, logMessage);
}

/**
 * Verzögerungsfunktion für asynchrones Warten
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Findet alle JSON-Dateien, die dem Muster entsprechen
 */
function findJsonFiles() {
  // Manuell die Dateien im Verzeichnis auflisten
  const files = fs.readdirSync(config.jsonDir)
    .filter(file => config.jsonPattern.test(file))
    .map(file => path.join(config.jsonDir, file));
  
  // Sortiere die Dateien nach Chunk-Nummer
  return files.sort((a, b) => {
    const fileNameA = path.basename(a);
    const fileNameB = path.basename(b);
    const numA = parseInt(fileNameA.match(/chunk_(\d+)\.json/)[1]);
    const numB = parseInt(fileNameB.match(/chunk_(\d+)\.json/)[1]);
    return numA - numB;
  });
}

/**
 * Importiert eine JSON-Datei über die API
 */
async function importJsonFile(filePath, chunkIndex) {
  try {
    log(`Importiere JSON-Datei: ${filePath} (Chunk ${chunkIndex})`);
    
    // JSON-Datei lesen
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    // Anzahl der Transaktionen ausgeben
    const transactionCount = jsonData.transactions ? jsonData.transactions.length : 0;
    log(`Datei enthält ${transactionCount} Transaktionen.`);
    
    // API-Aufruf durchführen
    const response = await axios.post(config.apiEndpoint, jsonData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    log(`Import von Chunk ${chunkIndex} abgeschlossen. Status: ${response.status}`);
    log(`Ergebnis: ${JSON.stringify(response.data.stats)}`);
    
    return {
      success: true,
      stats: response.data.stats,
      chunkIndex,
      transactionCount
    };
  } catch (error) {
    log(`Fehler beim Importieren von ${filePath}:`, error.message);
    log(error.stack);
    
    return {
      success: false,
      error: error.message,
      chunkIndex,
      transactionCount: 0
    };
  }
}

/**
 * Importiert alle gefundenen JSON-Dateien
 */
async function importAllJsonFiles() {
  try {
    // Log-Datei initialisieren
    fs.writeFileSync(config.logFile, `--- Import-Protokoll gestartet am ${new Date().toLocaleString()} ---\n\n`);
    
    // JSON-Dateien finden
    const jsonFiles = findJsonFiles();
    
    if (jsonFiles.length === 0) {
      log(`Keine JSON-Dateien gefunden in ${config.jsonDir}`);
      return;
    }
    
    log(`${jsonFiles.length} JSON-Dateien gefunden.`);
    
    // Bestimme die zu importierenden Dateien basierend auf der Konfiguration
    const startIndex = config.startFromChunk - 1;
    const endIndex = config.maxChunks > 0 
      ? Math.min(startIndex + config.maxChunks, jsonFiles.length) 
      : jsonFiles.length;
    
    const filesToImport = jsonFiles.slice(startIndex, endIndex);
    
    log(`Importiere Dateien ${startIndex + 1} bis ${endIndex} von ${jsonFiles.length}.`);
    
    // Statistik initialisieren
    const stats = {
      totalFiles: filesToImport.length,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      totalTransactions: 0,
      savedTransactions: 0,
      duplicates: 0,
      errors: 0
    };
    
    // Verarbeite jede Datei sequentiell
    for (let i = 0; i < filesToImport.length; i++) {
      const filePath = filesToImport[i];
      const chunkIndex = startIndex + i + 1;
      
      // Importiere die Datei
      const result = await importJsonFile(filePath, chunkIndex);
      stats.processedFiles++;
      
      if (result.success) {
        stats.successfulFiles++;
        stats.totalTransactions += result.transactionCount;
        
        if (result.stats) {
          stats.savedTransactions += result.stats.saved || 0;
          stats.duplicates += result.stats.duplicates || 0;
          stats.errors += result.stats.errors || 0;
        }
      } else {
        stats.failedFiles++;
      }
      
      // Fortschritt anzeigen
      const progress = ((stats.processedFiles / stats.totalFiles) * 100).toFixed(2);
      log(`Fortschritt: ${progress}% (${stats.processedFiles}/${stats.totalFiles})`);
      
      // Warte zwischen den Anfragen, falls es nicht die letzte Datei ist
      if (i < filesToImport.length - 1) {
        log(`Warte ${config.delayBetweenRequests}ms vor dem nächsten Import...`);
        await sleep(config.delayBetweenRequests);
      }
    }
    
    // Gesamtstatistik anzeigen
    log(`\nImport abgeschlossen!`);
    log(`Gesamtstatistik:
      - Verarbeitete Dateien: ${stats.processedFiles}/${stats.totalFiles}
      - Erfolgreiche Importe: ${stats.successfulFiles}
      - Fehlgeschlagene Importe: ${stats.failedFiles}
      - Verarbeitete Transaktionen: ${stats.totalTransactions}
      - Gespeicherte Transaktionen: ${stats.savedTransactions}
      - Duplikate: ${stats.duplicates}
      - Fehler: ${stats.errors}
    `);
    
    return stats;
  } catch (error) {
    log(`Kritischer Fehler bei der Verarbeitung:`, error.message);
    log(error.stack);
    return null;
  }
}

// Starte die Verarbeitung
console.time('Total Import Time');

importAllJsonFiles()
  .then(stats => {
    log('Import-Prozess abgeschlossen.');
    console.timeEnd('Total Import Time');
  })
  .catch(error => {
    log(`Unerwarteter Fehler: ${error.message}`);
    log(error.stack);
    console.timeEnd('Total Import Time');
  });