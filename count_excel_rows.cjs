/**
 * Zählt die Anzahl der Zeilen in einer Excel-Datei
 */

const xlsx = require('xlsx');
const fs = require('fs');

// Befehlszeilenargumente verarbeiten
const args = process.argv.slice(2);
const filePath = args[0] || './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx';

if (!fs.existsSync(filePath)) {
  console.error(`Fehler: Die Datei "${filePath}" existiert nicht.`);
  process.exit(1);
}

try {
  console.log(`Analysiere Excel-Datei: ${filePath}`);
  console.log(`Dateigröße: ${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB`);
  
  // Excel-Datei einlesen
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Alle Zeilenköpfe ermitteln
  const headers = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];
  
  // Alle Daten als JSON umwandeln (aber nur die Header)
  const allData = xlsx.utils.sheet_to_json(worksheet);
  
  console.log(`\nErgebnis:`);
  console.log(`- Sheet-Name: ${sheetName}`);
  console.log(`- Anzahl der Spalten: ${headers.length}`);
  console.log(`- Anzahl der Zeilen (inklusive Header): ${allData.length + 1}`);
  console.log(`- Anzahl der Datensätze: ${allData.length}`);
  
  // Spaltenüberschriften ausgeben
  console.log(`\nSpaltenüberschriften:`);
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });
  
  // Beispieldaten aus den ersten 3 Zeilen anzeigen
  console.log(`\nBeispieldaten (erste 3 Zeilen):`);
  
  const sampleData = allData.slice(0, 3);
  sampleData.forEach((row, rowIndex) => {
    console.log(`\nZeile ${rowIndex + 1}:`);
    Object.entries(row).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  });
  
} catch (error) {
  console.error(`Fehler bei der Analyse: ${error.message}`);
  if (error.stack) {
    console.error(`Stack-Trace: ${error.stack}`);
  }
  process.exit(1);
}