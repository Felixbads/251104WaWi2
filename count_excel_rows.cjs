// Skript zur Zählung der Anzahl von Zeilen in einer Excel-Datei
const xlsx = require('xlsx');
const fs = require('fs');

// Funktion zum Zählen der Zeilen in der Excel-Datei
function countExcelRows(filePath) {
  console.log(`Zähle Zeilen in Excel-Datei: ${filePath}`);
  
  try {
    // Excel-Datei lesen mit minimalen Optionen
    const workbook = xlsx.readFile(filePath, { 
      sheetRows: 0 // Nur Metadaten lesen
    });
    
    console.log(`\nWorkbook erfolgreich gelesen. Enthält ${workbook.SheetNames.length} Arbeitsblätter:`);
    console.log(workbook.SheetNames);
    
    // Für jedes Arbeitsblatt die Zeilenanzahl ermitteln
    let totalRows = 0;
    
    for (const sheetName of workbook.SheetNames) {
      // Lese das Arbeitsblatt
      const worksheet = workbook.Sheets[sheetName];
      
      // Ermittle den benutzten Bereich
      if (worksheet['!ref']) {
        const range = xlsx.utils.decode_range(worksheet['!ref']);
        const rowCount = range.e.r + 1; // +1 weil Indizierung bei 0 beginnt
        
        console.log(`Arbeitsblatt '${sheetName}': ${rowCount} Zeilen`);
        totalRows += rowCount;
      } else {
        console.log(`Arbeitsblatt '${sheetName}': Leer oder keine Daten`);
      }
    }
    
    console.log(`\nGesamtanzahl der Zeilen in allen Arbeitsblättern: ${totalRows}`);
    
    // Dateigröße ermitteln
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`Dateigröße: ${fileSizeMB.toFixed(2)} MB`);
    
    return totalRows;
  } catch (error) {
    console.error(`Fehler beim Zählen der Zeilen in der Excel-Datei:`, error);
    return -1;
  }
}

// Hauptfunktion
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node count_excel_rows.cjs <dateipfad>');
    return;
  }
  
  const filePath = args[0];
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  countExcelRows(filePath);
}

// Ausführen der Hauptfunktion
main();