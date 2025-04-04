/**
 * Zählt Zeilen in einer Excel-Datei und gibt die ersten Datensätze zurück
 */

const fs = require('fs');
const xlsx = require('xlsx');

// Konfiguration
const CONFIG = {
  excelFilePath: './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx'
};

// Hauptfunktion
async function main() {
  console.log(`Analysiere Datei: ${CONFIG.excelFilePath}`);
  
  try {
    // Excel-Datei laden
    const workbook = xlsx.readFile(CONFIG.excelFilePath, { sheetRows: 10 }); // Lade nur die ersten 10 Zeilen
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Konvertiere in JSON
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    console.log(`Stichprobe (erste ${data.length} Zeilen):`);
    
    // Spalten des ersten Datensatzes anzeigen
    if (data.length > 0) {
      console.log('\nSpaltennamen:');
      console.log(JSON.stringify(Object.keys(data[0]), null, 2));
      
      // Beispiel des ersten Datensatzes
      console.log('\nErster Datensatz:');
      console.log(JSON.stringify(data[0], null, 2));
    }
    
    // Zähle die tatsächliche Anzahl der Zeilen (kann langsam sein bei großen Dateien)
    console.log('\nZähle alle Zeilen (dies kann bei großen Dateien einige Zeit dauern)...');
    const fullWorkbook = xlsx.readFile(CONFIG.excelFilePath);
    const fullWorksheet = fullWorkbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(fullWorksheet['!ref']);
    const rowCount = range.e.r;
    
    console.log(`Die Datei enthält insgesamt ${rowCount} Zeilen (${rowCount - 1} Datensätze + Kopfzeile).`);
    
  } catch (error) {
    console.error(`Fehler bei der Analyse: ${error.message}`);
  }
}

// Skript ausführen
main();