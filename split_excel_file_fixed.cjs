const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Konfiguration
const config = {
  inputExcelFile: './attached_assets/1.xlsx', // Wir starten mit der kleinen Datei für Tests
  outputDir: './split_excel',
  chunkSize: 5, // Anzahl der Datensätze pro Datei
  maxChunks: 5, // Maximale Anzahl von Chunks, -1 für alle
  skipFirstRows: 0 // Anzahl der Zeilen, die übersprungen werden sollen (außer Header)
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
 * Teilt eine Excel-Datei in mehrere kleine Dateien auf
 */
function splitExcelFile() {
  try {
    console.log(`Splitting Excel-Datei: ${config.inputExcelFile}`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(config.inputExcelFile)) {
      throw new Error(`Die Datei ${config.inputExcelFile} existiert nicht.`);
    }
    
    // Ausgabeverzeichnis erstellen
    createOutputDirIfNeeded();
    
    // Excel-Datei einlesen
    console.log('Lese Excel-Datei...');
    const workbook = xlsx.readFile(config.inputExcelFile, {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere das Arbeitsblatt in JSON
    const allRows = xlsx.utils.sheet_to_json(worksheet, { raw: true });
    
    console.log(`Excel-Datei erfolgreich gelesen. ${allRows.length} Zeilen gefunden.`);
    
    // Überspringen der ersten Zeilen, falls konfiguriert
    const startIndex = config.skipFirstRows;
    const excelData = allRows.slice(startIndex);
    
    console.log(`Verarbeite ${excelData.length} Zeilen nach Überspringen von ${startIndex} Zeilen.`);
    
    // Aufteilen in Chunks
    const chunks = [];
    let currentChunk = [];
    
    for (let i = 0; i < excelData.length; i++) {
      currentChunk.push(excelData[i]);
      
      // Wenn ein Chunk voll ist oder dies die letzte Zeile ist, erstelle eine neue Datei
      if (currentChunk.length >= config.chunkSize || i === excelData.length - 1) {
        if (currentChunk.length > 0) {
          chunks.push([...currentChunk]);
          currentChunk = [];
          
          // Stoppe, wenn die maximale Anzahl von Chunks erreicht ist
          if (config.maxChunks > 0 && chunks.length >= config.maxChunks) {
            break;
          }
        }
      }
    }
    
    console.log(`${chunks.length} Chunks erstellt.`);
    
    // Chunks in separate Excel-Dateien schreiben
    chunks.forEach((chunk, index) => {
      // Erstelle ein neues Arbeitsblatt
      const newWorksheet = xlsx.utils.json_to_sheet(chunk);
      const newWorkbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Data');
      
      // Definiere den Ausgabepfad
      const outputPath = path.join(config.outputDir, `chunk_${index + 1}.xlsx`);
      
      // Schreibe die neue Excel-Datei
      xlsx.writeFile(newWorkbook, outputPath);
      
      console.log(`Chunk ${index + 1} geschrieben: ${outputPath} (${chunk.length} Zeilen)`);
    });
    
    console.log(`\nAufteilen abgeschlossen! ${chunks.length} Excel-Dateien erstellt.`);
    return chunks.length;
    
  } catch (error) {
    console.error(`Fehler beim Aufteilen der Excel-Datei:`, error);
    return 0;
  }
}

// Starte die Verarbeitung
const chunkCount = splitExcelFile();
console.log(`Total: ${chunkCount} Chunks erstellt.`);