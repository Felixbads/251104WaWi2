/**
 * Zählt die Anzahl der Zeilen in einer Excel-Datei (optimiert)
 * 
 * Dieses Skript verwendet Einstellungen, um nur begrenzte Teile der Excel-Datei zu laden
 * und so die Speichernutzung zu reduzieren.
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

/**
 * Liest Headerdaten der Excel-Datei
 */
function readExcelHeader(filePath) {
  // Lade nur die ersten paar Zeilen
  const options = {
    type: 'array',
    cellDates: true,
    sheetRows: 2  // Nur Header und erste Zeile laden
  };
  
  const workbook = xlsx.readFile(filePath, options);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Extrahiere den Header
  const headers = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];
  const firstRow = xlsx.utils.sheet_to_json(worksheet, { header: headers })[0];
  
  return { sheetName, headers, firstRow };
}

/**
 * Schätzt die Anzahl der Zeilen in einer Excel-Datei
 * über Stichproben an verschiedenen Stellen
 */
function estimateRowCount(filePath) {
  const fileSize = fs.statSync(filePath).size;
  console.log(`Dateigröße: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);
  
  // Probiere verschiedene Positionen in der Datei
  const samplePoints = [1000, 10000, 50000, 100000, 200000, 300000];
  
  for (const rowLimit of samplePoints) {
    try {
      // Versuche, bis zu dieser Zeile zu lesen
      const options = {
        type: 'array',
        cellDates: false,
        cellNF: false,
        cellText: false,
        sheetRows: rowLimit
      };
      
      console.log(`Versuche ${rowLimit} Zeilen zu lesen...`);
      const workbook = xlsx.readFile(filePath, options);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Prüfe, wie viele Zeilen tatsächlich gelesen wurden
      const range = xlsx.utils.decode_range(worksheet['!ref']);
      const actualRows = range.e.r + 1; // +1 weil xlsx 0-basierte Indizes verwendet
      
      // Wenn weniger Zeilen gelesen wurden als angefordert, haben wir wahrscheinlich alle Zeilen
      if (actualRows < rowLimit) {
        console.log(`Anzahl der Zeilen: ${actualRows}`);
        return actualRows;
      }
      
      console.log(`Mindestens ${actualRows} Zeilen in der Datei...`);
      
    } catch (error) {
      console.log(`Konnte nicht ${rowLimit} Zeilen lesen: ${error.message}`);
      // Wenn der vorherige Versuch erfolgreich war, nehmen wir an, dass wir nahe an der Grenze sind
      if (rowLimit > samplePoints[0]) {
        const previousLimit = samplePoints[samplePoints.indexOf(rowLimit) - 1];
        console.log(`Schätzung: ungefähr ${previousLimit}-${rowLimit} Zeilen`);
        return previousLimit;
      }
      break;
    }
  }
  
  console.log("Konnte die Anzahl der Zeilen nicht zuverlässig bestimmen.");
  return null;
}

try {
  console.log(`Analysiere Excel-Datei: ${filePath}`);
  
  // Header-Informationen auslesen
  const { sheetName, headers, firstRow } = readExcelHeader(filePath);
  
  console.log(`\nSheet-Name: ${sheetName}`);
  console.log(`Anzahl der Spalten: ${headers.length}`);
  
  // Versuch, die Zeilen zu schätzen
  console.log(`\nSchätze Anzahl der Zeilen...`);
  const estimatedRows = estimateRowCount(filePath);
  
  // Spaltenüberschriften ausgeben
  console.log(`\nSpaltenüberschriften:`);
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });
  
  // Beispiel für erste Zeile anzeigen
  if (firstRow) {
    console.log(`\nErste Zeile (Beispiel):`);
    Object.entries(firstRow).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }
  
} catch (error) {
  console.error(`Fehler bei der Analyse: ${error.message}`);
  if (error.stack) {
    console.error(`Stack-Trace: ${error.stack}`);
  }
  process.exit(1);
}