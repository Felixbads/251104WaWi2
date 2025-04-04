/**
 * Teilt eine große Excel-Datei in kleinere Dateien auf
 * 
 * Dieses Skript verarbeitet eine große Excel-Datei in kleinen Chunks und
 * speichert Teile der Daten in separaten Excel-Dateien, um Speicherprobleme zu vermeiden.
 */

const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Konfiguration
const CONFIG = {
  sourceFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  outputDir: './split_excel_large',
  rowsPerChunk: 1000,
  maxChunks: 50,
  logFilePath: './split_excel.log'
};

// Sicherstellen, dass das Ausgabeverzeichnis existiert
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

// Logging-Funktion
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

/**
 * Liest einen Chunk aus der Excel-Datei
 */
function readExcelChunk(filePath, startRow, numRows) {
  try {
    log(`Lese Chunk aus ${filePath}: Zeilen ${startRow + 1} bis ${startRow + numRows}`);
    
    // Optionen für das Lesen der Excel-Datei
    const options = {
      type: 'array',
      cellDates: true,
      dateNF: 'yyyy-mm-dd',
      cellNF: false,
      cellText: false,
      sheetRows: startRow + numRows // Nur bis zur benötigten Zeile lesen
    };
    
    const workbook = xlsx.readFile(filePath, options);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere zu JSON mit Header
    const allData = xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 0 });
    
    // Extrahiere den Header (erste Zeile)
    const header = allData[0];
    
    // Extrahiere die angeforderten Zeilen
    const dataRows = allData.slice(Math.max(1, startRow), Math.min(startRow + numRows, allData.length));
    
    log(`Gelesene Zeilen: ${dataRows.length}`);
    
    return {
      header,
      data: dataRows,
      endOfFile: dataRows.length < numRows || allData.length <= startRow + numRows
    };
  } catch (error) {
    log(`Fehler beim Lesen der Excel-Chunk: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Schreibt einen Chunk in eine neue Excel-Datei
 */
function writeExcelChunk(header, data, chunkIndex) {
  try {
    const outputFilePath = path.join(CONFIG.outputDir, `chunk_${chunkIndex.toString().padStart(3, '0')}.xlsx`);
    log(`Schreibe ${data.length} Zeilen in ${outputFilePath}`);
    
    // Neues Workbook erstellen
    const newWorkbook = xlsx.utils.book_new();
    
    // Alle Daten (Header + Datenzeilen) in einem Array kombinieren
    const allRows = [header, ...data];
    
    // Array in ein Worksheet umwandeln
    const newWorksheet = xlsx.utils.aoa_to_sheet(allRows);
    
    // Worksheet zum Workbook hinzufügen
    xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Sheet1');
    
    // Als Excel-Datei speichern
    xlsx.writeFile(newWorkbook, outputFilePath);
    
    log(`Chunk ${chunkIndex} gespeichert: ${outputFilePath}`);
    return outputFilePath;
  } catch (error) {
    log(`Fehler beim Schreiben der Excel-Chunk: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Hauptfunktion zum Aufteilen der Excel-Datei
 */
async function splitExcelFile() {
  log(`Starte Aufteilen der Excel-Datei: ${CONFIG.sourceFilePath}`);
  log(`Ausgabeverzeichnis: ${CONFIG.outputDir}`);
  log(`Zeilen pro Chunk: ${CONFIG.rowsPerChunk}`);
  
  let currentRow = 0;
  let chunkIndex = 0;
  let header = null;
  let endOfFile = false;
  
  const stats = fs.statSync(CONFIG.sourceFilePath);
  log(`Dateigröße: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  
  // Excel-Datei in Chunks lesen und in separate Dateien schreiben
  while (!endOfFile && chunkIndex < CONFIG.maxChunks) {
    try {
      // Chunk lesen
      const result = readExcelChunk(CONFIG.sourceFilePath, currentRow, CONFIG.rowsPerChunk);
      
      // Beim ersten Durchlauf den Header speichern
      if (chunkIndex === 0) {
        header = result.header;
      }
      
      // Wenn Daten vorhanden sind, in eine neue Datei schreiben
      if (result.data.length > 0) {
        const outputFilePath = writeExcelChunk(header, result.data, chunkIndex);
        log(`Fortschritt: Chunk ${chunkIndex + 1} abgeschlossen, ${result.data.length} Zeilen verarbeitet`);
        
        // Nächster Chunk
        currentRow += result.data.length;
        chunkIndex++;
      }
      
      // Prüfen, ob wir das Ende der Datei erreicht haben
      endOfFile = result.endOfFile;
      
      if (endOfFile) {
        log(`Ende der Datei erreicht nach ${currentRow} Zeilen.`);
      }
      
      // Kurze Pause, um Speicherprobleme zu vermeiden
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      log(`Fehler beim Verarbeiten von Chunk ${chunkIndex}: ${error.message}`);
      if (chunkIndex > 0) {
        log(`Beende Verarbeitung nach ${chunkIndex} erfolgreichen Chunks.`);
        break;
      } else {
        throw error; // Wenn der erste Chunk fehlschlägt, ist das ein kritischer Fehler
      }
    }
  }
  
  log(`Aufteilung abgeschlossen. ${chunkIndex} Chunks erstellt mit insgesamt ${currentRow} Zeilen.`);
  return {
    chunks: chunkIndex,
    totalRows: currentRow,
    outputDir: CONFIG.outputDir
  };
}

// Skript ausführen
async function main() {
  try {
    if (!fs.existsSync(CONFIG.sourceFilePath)) {
      log(`Fehler: Die Quelldatei ${CONFIG.sourceFilePath} existiert nicht.`);
      process.exit(1);
    }
    
    const result = await splitExcelFile();
    log(`Zusammenfassung:`);
    log(`- Anzahl der erstellten Chunks: ${result.chunks}`);
    log(`- Insgesamt verarbeitete Zeilen: ${result.totalRows}`);
    log(`- Ausgabeverzeichnis: ${result.outputDir}`);
    
  } catch (error) {
    log(`Kritischer Fehler: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Skript starten
main();