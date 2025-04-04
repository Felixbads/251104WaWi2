const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Konfiguration für das große Excel-File
const config = {
  inputExcelFile: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx',
  outputDir: './split_excel_large',
  chunkSize: 50,
  maxChunks: 2,  // Begrenzt auf 2 Chunks für Tests, um Timeouts zu vermeiden
  memoryMode: 'low', // 'low' für speichereffiziente Verarbeitung großer Dateien
  maxProcessingTime: 60000 // Maximale Verarbeitungszeit in Millisekunden (60 Sekunden)
};

/**
 * Erstellt das Ausgabeverzeichnis, falls es nicht existiert
 */
function createOutputDirIfNeeded() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`Ausgabeverzeichnis erstellt: ${config.outputDir}`);
  }
}

/**
 * Zeigt die Dateigröße in lesbarem Format an
 */
function getReadableFileSize(filePath) {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats.size;
  const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
  return fileSizeInMB.toFixed(2) + ' MB';
}

/**
 * Teilt eine große Excel-Datei in kleinere Chunks mit geringem Speicherverbrauch
 */
function splitLargeExcelFile() {
  try {
    // Startzeit für Zeitbegrenzung festlegen
    const startTime = Date.now();
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    console.log(`Splitting große Excel-Datei: ${config.inputExcelFile}`);
    console.log(`Dateigröße: ${getReadableFileSize(config.inputExcelFile)}`);
    
    // Ausgabeverzeichnis erstellen
    createOutputDirIfNeeded();
    
    // Hilfsfunktion zur Prüfung, ob Zeitlimit überschritten wurde
    function isTimeExceeded() {
      return config.maxProcessingTime > 0 && 
             (Date.now() - startTime) > config.maxProcessingTime;
    }
    
    // Excel-Datei für Low-Memory-Verarbeitung öffnen
    console.log('Öffne Excel-Datei...');
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,  // Keine Formeln verarbeiten
      cellHTML: false,     // Kein HTML verarbeiten
      cellStyles: false,   // Keine Stile verarbeiten
      cellNF: false,       // Keine Zahlenformate
      cellDates: true,     // Datumsformate beibehalten
      sheetStubs: true,    // Leere Zellen berücksichtigen
      bookDeps: false,     // Keine Abhängigkeiten verfolgen
      bookVBA: false,      // Kein VBA-Code laden
      dense: true,         // Optimierung für große Dateien
      WTF: false           // Weniger Warnung ausgeben
    });
    
    // Arbeitsblatt auswählen
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Bereich des Arbeitsblatts ermitteln
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const totalRows = range.e.r - range.s.r; // Gesamtanzahl der Zeilen (ohne Header)
    
    console.log(`Arbeitsblatt '${sheetName}' hat ${totalRows} Datenzeilen.`);
    
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
    
    console.log(`${Object.keys(headers).length} Spalten gefunden.`);
    
    // Verarbeitung einrichten
    const rows = range.s.r + 1; // Beginne bei erster Datenzeile (nach Header)
    const maxRow = config.maxChunks > 0 
      ? Math.min(rows + (config.chunkSize * config.maxChunks), range.e.r + 1)
      : range.e.r + 1;
    
    console.log(`Verarbeite Zeilen ${rows} bis ${maxRow - 1} (maximal ${config.maxChunks} Chunks mit je ${config.chunkSize} Zeilen).`);
    
    // Chunks verarbeiten
    let currentChunk = [];
    let currentChunkNumber = 1;
    let rowsProcessed = 0;
    
    for (let r = rows; r < maxRow; r++) {
      // Prüfe, ob das Zeitlimit überschritten wurde
      if (isTimeExceeded()) {
        console.log(`Zeitlimit von ${config.maxProcessingTime}ms überschritten, breche Verarbeitung ab.`);
        break;
      }
      
      // Zeile verarbeiten
      const rowData = {};
      let hasData = false;
      
      // Alle Zellen der Zeile lesen
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = xlsx.utils.encode_cell({ r, c });
        if (worksheet[cellAddress] && worksheet[cellAddress].v !== undefined) {
          rowData[headers[c]] = worksheet[cellAddress].v;
          hasData = true;
        }
      }
      
      // Nur Zeilen mit Daten hinzufügen
      if (hasData) {
        currentChunk.push(rowData);
        rowsProcessed++;
      }
      
      // Wenn der Chunk voll ist oder wir am Ende sind
      if (currentChunk.length >= config.chunkSize || r === maxRow - 1) {
        if (currentChunk.length > 0) {
          // Erstelle ein neues Arbeitsblatt für den Chunk
          const newWorksheet = xlsx.utils.json_to_sheet(currentChunk);
          const newWorkbook = xlsx.utils.book_new();
          xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Data');
          
          // Definiere den Ausgabepfad
          const outputPath = path.join(config.outputDir, `chunk_${currentChunkNumber}.xlsx`);
          
          // Schreibe die neue Excel-Datei
          xlsx.writeFile(newWorkbook, outputPath);
          
          console.log(`Chunk ${currentChunkNumber} geschrieben: ${outputPath} (${currentChunk.length} Zeilen)`);
          
          // Zurücksetzen für nächsten Chunk
          currentChunk = [];
          currentChunkNumber++;
        }
      }
    }
    
    console.log(`\nAufteilen abgeschlossen!`);
    console.log(`${rowsProcessed} Zeilen in ${currentChunkNumber - 1} Excel-Dateien geschrieben.`);
    
    return currentChunkNumber - 1;
  } catch (error) {
    console.error(`Fehler beim Aufteilen der Excel-Datei:`, error);
    console.error(error.stack);
    return 0;
  }
}

// Starte die Verarbeitung
console.time('Processing Time');
const chunkCount = splitLargeExcelFile();
console.timeEnd('Processing Time');
console.log(`Total: ${chunkCount} Chunks erstellt.`);