const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = './attached_assets/Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx';

console.log(`Versuche große Excel-Datei zu lesen: ${filePath}`);
console.log(`Datei existiert: ${fs.existsSync(filePath)}`);
console.log(`Dateigröße: ${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB`);

try {
  console.log('Lese Excel-Datei...');
  const workbook = xlsx.readFile(filePath, {
    cellFormula: false,  // Ignoriere Formeln für schnelleres Laden
    cellHTML: false,
    cellStyles: false,
    cellDates: true,     // Konvertiere Daten automatisch
    sheetStubs: true     // Berücksichtige leere Zellen
  });
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Analyse der Arbeitsblattstruktur
  const range = xlsx.utils.decode_range(worksheet['!ref']);
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;
  
  console.log(`Arbeitsblatt: ${sheetName}`);
  console.log(`Anzahl der Zeilen: ${rowCount}`);
  console.log(`Anzahl der Spalten: ${colCount}`);
  
  // Lese die erste Zeile für die Spaltenüberschriften
  console.log('Spaltenüberschriften:');
  for(let c = range.s.c; c <= Math.min(range.s.c + 10, range.e.c); c++) {
    const cellAddress = xlsx.utils.encode_cell({r: range.s.r, c});
    const cell = worksheet[cellAddress];
    if (cell && cell.v) {
      console.log(`  ${c}: ${cell.v}`);
    }
  }
  console.log('... (weitere Spalten gekürzt)');
  
  // Stichprobe von 5 Datensätzen aus der Mitte der Datei
  const sampleSize = 5;
  const sampleStart = Math.floor(rowCount / 2);
  
  console.log(`\nStichprobe von ${sampleSize} Zeilen ab Zeile ${sampleStart}:`);
  
  // Konvertiere einen kleinen Teil des Arbeitsblatts in JSON für die Stichprobe
  const partialRange = {
    s: {r: sampleStart, c: range.s.c},
    e: {r: sampleStart + sampleSize - 1, c: range.e.c}
  };
  
  const partialWorksheet = {};
  for(let r = partialRange.s.r; r <= partialRange.e.r; r++) {
    for(let c = partialRange.s.c; c <= partialRange.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({r, c});
      if(worksheet[cellAddress]) {
        partialWorksheet[cellAddress] = worksheet[cellAddress];
      }
    }
  }
  partialWorksheet['!ref'] = xlsx.utils.encode_range(partialRange);
  
  // Übertrage auch die Header-Zeile
  for(let c = range.s.c; c <= range.e.c; c++) {
    const headerCellAddress = xlsx.utils.encode_cell({r: range.s.r, c});
    if(worksheet[headerCellAddress]) {
      partialWorksheet[headerCellAddress] = worksheet[headerCellAddress];
    }
  }
  
  // Setze '!cols' und andere Metadaten
  if(worksheet['!cols']) partialWorksheet['!cols'] = worksheet['!cols'];
  if(worksheet['!merges']) partialWorksheet['!merges'] = worksheet['!merges'];
  
  const sampleData = xlsx.utils.sheet_to_json(partialWorksheet, { raw: true });
  
  console.log(`${sampleData.length} Stichproben-Zeilen erfolgreich gelesen.`);
  console.log('Erste 2 Stichproben (gekürzt):');
  
  // Zeige nur ausgewählte Felder an
  sampleData.slice(0, 2).forEach((row, idx) => {
    const summary = {
      "Date / Time": row["Date / Time"],
      "Automatenname": row["Automatenname"],
      "Telemetrieeinheit": row["Telemetrieeinheit"],
      "Adresse": row["Adresse"] ? row["Adresse"].substring(0, 50) + '...' : '',
      "Account name": row["Account name"],
      "Produktname": row["Produktname"],
      "Produktnr.": row["Produktnr."],
      "Preis (inkl. MwSt.)": row["Preis (inkl. MwSt.)"],
      "Transaktionstyp": row["Transaktionstyp"]
    };
    console.log(`Stichprobe ${idx + 1}:`, JSON.stringify(summary, null, 2));
  });
  
  console.log('...');
  
  // Zähle die eindeutigen Werte in ausgewählten Spalten
  const uniqueColumns = ['Automatenname', 'Telemetrieeinheit', 'Account name', 'Transaktionstyp'];
  const uniqueValues = {};
  
  uniqueColumns.forEach(column => {
    uniqueValues[column] = new Set();
  });
  
  // Verwende Streaming, um nur die Header und eine Stichprobe von Zeilen zu lesen
  let rowsProcessed = 0;
  const maxSampleRows = 1000;
  const step = Math.max(1, Math.floor(rowCount / maxSampleRows));
  
  for(let r = range.s.r + 1; r <= range.e.r; r += step) {
    if(rowsProcessed >= maxSampleRows) break;
    
    const row = {};
    for(let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({r, c});
      const headerAddress = xlsx.utils.encode_cell({r: range.s.r, c});
      
      if(worksheet[cellAddress] && worksheet[headerAddress]) {
        const columnName = worksheet[headerAddress].v;
        if(uniqueColumns.includes(columnName)) {
          row[columnName] = worksheet[cellAddress].v;
        }
      }
    }
    
    uniqueColumns.forEach(column => {
      if(row[column] !== undefined) {
        uniqueValues[column].add(row[column]);
      }
    });
    
    rowsProcessed++;
  }
  
  console.log('\nEindeutige Werte in ausgewählten Spalten:');
  uniqueColumns.forEach(column => {
    const values = Array.from(uniqueValues[column]).slice(0, 10);
    console.log(`${column}: ${uniqueValues[column].size} eindeutige Werte`);
    console.log(`  Beispiele: ${values.join(', ')}${uniqueValues[column].size > 10 ? '...' : ''}`);
  });
  
} catch (error) {
  console.error(`Fehler beim Lesen der Excel-Datei: ${error.message}`);
  console.error(error.stack);
}