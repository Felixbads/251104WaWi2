/**
 * Teilt eine große Excel-Datei in mehrere kleinere Dateien auf
 * 
 * Dieses Skript liest eine große Excel-Datei und teilt sie in mehrere
 * kleinere Dateien auf, die dann separat verarbeitet werden können.
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Konfiguration
const CONFIG = {
  sourceFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  outputDir: './split_excel',
  maxRowsPerFile: 1000,    // Maximale Anzahl Zeilen pro Datei
  logFilePath: './split_excel.log'
};

// Hilfsfunktionen
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(CONFIG.logFilePath, logMessage);
}

// Prüft, ob ein Verzeichnis existiert, und erstellt es ggf.
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log(`Verzeichnis erstellt: ${dirPath}`);
  }
}

// Excel-Datei teilen
function splitExcelFile() {
  try {
    // Prüfen, ob die Quelldatei existiert
    if (!fs.existsSync(CONFIG.sourceFilePath)) {
      log(`Quelldatei nicht gefunden: ${CONFIG.sourceFilePath}`);
      return;
    }
    
    // Ausgabeverzeichnis sicherstellen
    ensureDirectoryExists(CONFIG.outputDir);
    
    // Datei-Größe ermitteln
    const stats = fs.statSync(CONFIG.sourceFilePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log(`Quelldatei: ${CONFIG.sourceFilePath} (${fileSizeMB} MB)`);
    
    // Excel-Datei lesen
    log('Lese Excel-Datei...');
    const workbook = xlsx.readFile(CONFIG.sourceFilePath);
    log('Excel-Datei gelesen.');
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Daten in ein JSON-Array konvertieren
    log('Konvertiere Daten zu JSON...');
    const data = xlsx.utils.sheet_to_json(worksheet);
    log(`Datei enthält ${data.length} Zeilen.`);
    
    // Berechnen, wie viele Dateien erstellt werden müssen
    const fileCount = Math.ceil(data.length / CONFIG.maxRowsPerFile);
    log(`Teile Datei in ${fileCount} Teile auf (max. ${CONFIG.maxRowsPerFile} Zeilen pro Datei).`);
    
    // Datei teilen
    for (let i = 0; i < fileCount; i++) {
      const startRow = i * CONFIG.maxRowsPerFile;
      const endRow = Math.min((i + 1) * CONFIG.maxRowsPerFile, data.length);
      const chunkData = data.slice(startRow, endRow);
      
      log(`Verarbeite Teil ${i+1}/${fileCount}: Zeilen ${startRow+1} bis ${endRow} (${chunkData.length} Zeilen)...`);
      
      // Neue Arbeitsmappe erstellen
      const newWorkbook = xlsx.utils.book_new();
      const newWorksheet = xlsx.utils.json_to_sheet(chunkData);
      xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
      
      // Speichern als neue Datei
      const outputFilePath = path.join(CONFIG.outputDir, `part_${i+1}_of_${fileCount}.xlsx`);
      xlsx.writeFile(newWorkbook, outputFilePath);
      
      // Dateigröße bestimmen
      const outStats = fs.statSync(outputFilePath);
      const outFileSizeMB = (outStats.size / (1024 * 1024)).toFixed(2);
      
      log(`Teil ${i+1} gespeichert: ${outputFilePath} (${outFileSizeMB} MB)`);
    }
    
    log(`Excel-Datei erfolgreich in ${fileCount} Teile aufgeteilt.`);
    
    // Ausgabe von Informationen zu den erzeugten Dateien
    log('\n=== ERZEUGTE DATEIEN ===');
    const files = fs.readdirSync(CONFIG.outputDir)
      .filter(file => file.startsWith('part_') && file.endsWith('.xlsx'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/part_(\d+)_of/)[1]);
        const numB = parseInt(b.match(/part_(\d+)_of/)[1]);
        return numA - numB;
      });
    
    files.forEach(file => {
      const filePath = path.join(CONFIG.outputDir, file);
      const fileStats = fs.statSync(filePath);
      const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
      log(`- ${file} (${fileSizeMB} MB)`);
    });
    
    return {
      sourceFile: CONFIG.sourceFilePath,
      outputDir: CONFIG.outputDir,
      fileCount,
      totalRows: data.length,
      files
    };
    
  } catch (error) {
    log(`Fehler beim Teilen der Excel-Datei: ${error.message}`);
    if (error.stack) {
      log(`Stack-Trace: ${error.stack}`);
    }
    throw error;
  }
}

// Hauptfunktion
function main() {
  log('=== EXCEL-DATEI TEILEN ===');
  
  try {
    const result = splitExcelFile();
    
    log('\n=== ZUSAMMENFASSUNG ===');
    log(`Quelldatei: ${result.sourceFile}`);
    log(`Ausgabeverzeichnis: ${result.outputDir}`);
    log(`Anzahl der erzeugten Dateien: ${result.fileCount}`);
    log(`Gesamtzahl der Zeilen: ${result.totalRows}`);
    log(`Durchschnittliche Zeilen pro Datei: ${Math.floor(result.totalRows / result.fileCount)}`);
    
    log('\n=== PROZESS ABGESCHLOSSEN ===');
    
  } catch (error) {
    log(`Kritischer Fehler: ${error.message}`);
    process.exit(1);
  }
}

// Skript ausführen
main();