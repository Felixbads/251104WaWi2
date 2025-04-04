/**
 * Excel-Datei in JSON-Chunks aufteilen
 * 
 * Dieses Skript liest eine große Excel-Datei in Chunks und speichert die Daten als
 * JSON-Dateien für die spätere Verarbeitung. Diese Methode ist für die Replit-Umgebung
 * optimiert, um Speicherüberlauf und Timeouts zu vermeiden.
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Konfiguration
const config = {
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  outputDir: './json_chunks_large',
  statusFile: './excel_split_status.json',
  chunkSize: 50,
  maxProcessingTime: 20000, // 20 Sekunden pro Durchlauf
  maxRowsPerRun: 500
};

// Sicherstellen, dass das Ausgabeverzeichnis existiert
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

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
    startRow: 1, // Beginne bei der ersten Datenzeile (nach dem Header)
    currentChunkIndex: 0,
    processedRows: 0,
    failed: false,
    completed: false,
    lastProcessed: null,
    totalRows: 0,
    totalProcessed: 0,
    currentPass: 1,
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
 * Prüft, ob das Zeitlimit überschritten wurde
 */
function isTimeExceeded(startTime) {
  return config.maxProcessingTime > 0 && (Date.now() - startTime) > config.maxProcessingTime;
}

/**
 * Schreibt einen Chunk als JSON-Datei
 */
function writeChunk(data, chunkIndex) {
  const chunkFile = path.join(config.outputDir, `chunk_${chunkIndex.toString().padStart(5, '0')}.json`);
  fs.writeFileSync(chunkFile, JSON.stringify(data, null, 2));
  console.log(`Chunk ${chunkIndex} mit ${data.length} Einträgen gespeichert: ${chunkFile}`);
}

/**
 * Ermittelt die Anzahl der Zeilen in der Excel-Datei
 */
function getExcelRowCount() {
  try {
    console.log(`Öffne Excel-Datei für Zeilenanalyse: ${config.inputExcelFile}`);
    
    // Dateigröße ermitteln
    const stats = fs.statSync(config.inputExcelFile);
    console.log(`Dateigröße: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    
    // Optimiertes Lesen nur für die Bereichsanalyse
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellStyles: false,
      cellNF: false,
      cellHTML: false,
      cellFormula: false,
      cellDates: true,
      dense: true,
      raw: true
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich extrahieren
    if (worksheet['!ref']) {
      const range = xlsx.utils.decode_range(worksheet['!ref']);
      const rowCount = range.e.r;
      console.log(`Excel-Datei hat ${rowCount} Zeilen (0-basierter Index)`);
      return rowCount;
    }
    
    console.log('Konnte keinen gültigen Bereich in der Excel-Datei finden.');
    return 100000; // Fallback-Wert
  } catch (error) {
    console.error(`Fehler beim Ermitteln der Zeilenanzahl: ${error.message}`);
    return 100000; // Fallback-Wert
  }
}

/**
 * Hauptfunktion zur Verarbeitung der Excel-Datei in Chunks
 */
async function processExcelToJsonChunks() {
  console.log('=== STARTE EXCEL-DATEI AUFTEILUNG IN JSON-CHUNKS ===');
  
  const startTime = Date.now();
  
  try {
    // Status initialisieren oder fortsetzen
    const status = getStatus();
    
    if (status.completed) {
      console.log('Aufteilung bereits abgeschlossen.');
      return { success: true, completed: true };
    }
    
    // Wenn noch keine Zeilenanzahl bekannt ist, erste Analyse durchführen
    if (status.totalRows === 0) {
      console.log('Analysiere Excel-Datei für Zeilenanzahl...');
      const rowCount = getExcelRowCount();
      status.totalRows = rowCount;
      console.log(`Excel-Datei enthält insgesamt ${rowCount} Zeilen.`);
      saveStatus(status);
    }
    
    console.log(`Setze Verarbeitung fort ab Zeile ${status.startRow}.`);
    console.log(`Fortschritt: ${status.totalProcessed}/${status.totalRows} Zeilen (${((status.totalProcessed / status.totalRows) * 100).toFixed(2)}%)`);
    
    // Optimierte Optionen fürs Lesen
    const options = {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      cellDates: true,
      sheetStubs: false,
      sheets: [0],
      dense: true,
      raw: true
    };
    
    // Begrenzung der Zeilen für diesen Durchlauf
    const maxRow = Math.min(status.startRow + config.maxRowsPerRun, status.totalRows + 1);
    
    console.log(`Lese Excel-Zeilen ${status.startRow} bis ${maxRow - 1}...`);
    options.sheetRows = maxRow;
    
    // Excel-Datei öffnen
    const workbook = xlsx.readFile(config.inputExcelFile, options);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich extrahieren
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    
    // Header aus der ersten Zeile ermitteln
    const headers = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
      if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
        headers[c] = worksheet[cellAddress].v;
      } else {
        headers[c] = `Column_${c}`;
      }
    }
    
    console.log(`${Object.keys(headers).length} Spalten gefunden.`);
    
    // Daten verarbeiten
    let chunkData = [];
    let rowsProcessed = 0;
    let currentRow = status.startRow;
    
    // Nur Datenzeilen verarbeiten (nicht die Header-Zeile)
    for (let r = status.startRow; r < maxRow; r++) {
      // Zeitlimit überprüfen
      if (isTimeExceeded(startTime)) {
        console.log(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, unterbreche Verarbeitung.`);
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
        chunkData.push(rowData);
        rowsProcessed++;
      }
      
      // Wenn ein Chunk voll ist oder wir am Ende sind, speichern
      if (chunkData.length >= config.chunkSize || r === maxRow - 1) {
        if (chunkData.length > 0) {
          writeChunk(chunkData, status.currentChunkIndex);
          status.currentChunkIndex++;
          chunkData = [];
          
          // Status speichern
          status.totalProcessed += chunkData.length;
          status.lastProcessed = new Date().toISOString();
          saveStatus(status);
        }
      }
    }
    
    // Restliche Daten speichern, falls vorhanden
    if (chunkData.length > 0) {
      writeChunk(chunkData, status.currentChunkIndex);
      status.currentChunkIndex++;
      status.totalProcessed += chunkData.length;
    }
    
    // Überprüfen, ob alle Daten verarbeitet wurden
    const allProcessed = currentRow >= status.totalRows;
    
    // Status aktualisieren
    status.startRow = currentRow + 1;
    status.processedRows = rowsProcessed;
    status.lastProcessed = new Date().toISOString();
    status.completed = allProcessed;
    status.currentPass++;
    saveStatus(status);
    
    if (allProcessed) {
      console.log(`\n=== AUFTEILUNG VOLLSTÄNDIG ABGESCHLOSSEN ===`);
      console.log(`Insgesamt ${status.totalProcessed} Zeilen in ${status.currentChunkIndex} Chunks verarbeitet.`);
    } else {
      console.log(`\nTeilaufteilung abgeschlossen. Nächster Durchlauf wird bei Zeile ${status.startRow} fortgesetzt.`);
      console.log(`Zwischenstand: ${status.totalProcessed}/${status.totalRows} Zeilen (${((status.totalProcessed / status.totalRows) * 100).toFixed(2)}%)`);
      
      // Exit-Code 10 bedeutet: Fortsetzung erforderlich
      process.exit(10);
    }
    
    return { 
      success: true, 
      completed: allProcessed,
      processedRows: rowsProcessed,
      totalChunks: status.currentChunkIndex
    };
  } catch (error) {
    console.error(`Fehler bei der Verarbeitung: ${error.message}`);
    console.error(error.stack);
    
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
processExcelToJsonChunks()
  .then((result) => {
    console.timeEnd('Processing Time');
    if (result.success) {
      console.log('Verarbeitung erfolgreich.');
    } else {
      console.error(`Verarbeitung fehlgeschlagen: ${result.error}`);
    }
  })
  .catch((error) => {
    console.timeEnd('Processing Time');
    console.error(`Unerwarteter Fehler: ${error.message}`);
  });