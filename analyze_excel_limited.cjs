// Skript zum Analysieren einer Excel-Datei mit begrenzter Anzahl von Zeilen
const xlsx = require('xlsx');
const fs = require('fs');

// Funktion zum Analysieren der Excel-Datei
function analyzeExcelFile(filePath, maxRows = 5) {
  console.log(`Analysiere Excel-Datei: ${filePath} (maximale Anzahl Zeilen: ${maxRows})`);
  
  try {
    // Excel-Datei lesen mit minimalen Optionen, um Performance zu verbessern
    const workbook = xlsx.readFile(filePath, { 
      cellDates: true,
      sheetRows: maxRows + 1 // +1 für die Kopfzeile
    });
    
    console.log(`\nWorkbook erfolgreich gelesen. Enthält ${workbook.SheetNames.length} Arbeitsblätter:`);
    console.log(workbook.SheetNames);
    
    // Analysiere jedes Arbeitsblatt
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n=== Analysiere Arbeitsblatt: ${sheetName} ===`);
      
      // Lese das Arbeitsblatt
      const worksheet = workbook.Sheets[sheetName];
      
      // Ermittle den benutzten Bereich
      const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');
      console.log(`Benutzer Bereich: ${worksheet['!ref']}`);
      console.log(`Erste Zelle: A1, Letzte erkannte Zelle: ${xlsx.utils.encode_cell(range.e)}`);
      console.log(`Gesamtzahl der Spalten: ${range.e.c + 1}, Gesamtzahl der Zeilen: ${range.e.r + 1}`);
      
      // Konvertiere in JSON für einfachere Verarbeitung (mit Limitierung)
      const jsonData = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
        range: 0
      });
      
      if (jsonData.length === 0) {
        console.log('Das Arbeitsblatt enthält keine Daten oder nur Überschriften.');
        continue;
      }
      
      // Extrahiere Spaltennamen aus der ersten Zeile
      console.log('\nSpaltenstruktur:');
      const headers = jsonData[0];
      headers.forEach((header, index) => {
        console.log(`- Spalte ${index + 1}: ${header}`);
      });
      
      // Zeige erste Zeilen als Beispiel (begrenzt auf maxRows)
      const rowsToShow = Math.min(maxRows, jsonData.length - 1);
      console.log(`\nBeispieldaten (erste ${rowsToShow} Zeilen):`);
      
      for (let i = 1; i <= rowsToShow; i++) {
        console.log(`\nZeile ${i}:`);
        const row = jsonData[i];
        if (row) {
          row.forEach((cell, index) => {
            if (headers[index]) {
              console.log(`  ${headers[index]}: ${cell}`);
            }
          });
        }
      }
      
      // Zähle die ungefähre Anzahl der Datensätze basierend auf der Bereichsinformation
      console.log(`\nGeschätzte Anzahl der Datensätze im Blatt ${sheetName}: ~${range.e.r}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Fehler beim Analysieren der Excel-Datei:`, error);
    return false;
  }
}

// Hauptfunktion
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node analyze_excel_limited.cjs <dateipfad> [maxRows]');
    return;
  }
  
  const filePath = args[0];
  const maxRows = args[1] ? parseInt(args[1], 10) : 5;
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  analyzeExcelFile(filePath, maxRows);
}

// Ausführen der Hauptfunktion
main();