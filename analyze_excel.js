// Skript zum Analysieren einer Excel-Datei und Anzeigen der Struktur
const xlsx = require('xlsx');
const fs = require('fs');

// Funktion zum Analysieren der Excel-Datei
function analyzeExcelFile(filePath) {
  console.log(`Analysiere Excel-Datei: ${filePath}`);
  
  try {
    // Excel-Datei lesen
    const workbook = xlsx.readFile(filePath, { 
      cellDates: true, // Konvertiere Datumswerte in JavaScript Date-Objekte
      dateNF: 'yyyy-mm-dd'
    });
    
    console.log(`\nWorkbook erfolgreich gelesen. Enthält ${workbook.SheetNames.length} Arbeitsblätter:`);
    console.log(workbook.SheetNames);
    
    // Analysiere jedes Arbeitsblatt
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n=== Analysiere Arbeitsblatt: ${sheetName} ===`);
      
      // Lese das Arbeitsblatt
      const worksheet = workbook.Sheets[sheetName];
      
      // Konvertiere in JSON für einfachere Verarbeitung
      const jsonData = xlsx.utils.sheet_to_json(worksheet);
      
      if (jsonData.length === 0) {
        console.log('Das Arbeitsblatt enthält keine Daten oder nur Überschriften.');
        continue;
      }
      
      // Extrahiere Spaltennamen aus dem ersten Datensatz
      console.log('\nSpaltenstruktur:');
      const headers = Object.keys(jsonData[0]);
      headers.forEach(header => {
        console.log(`- ${header}`);
      });
      
      // Zeige erste 3 Zeilen als Beispiel
      console.log('\nBeispieldaten (erste 3 Zeilen):');
      const sampleData = jsonData.slice(0, 3);
      sampleData.forEach((row, index) => {
        console.log(`\nZeile ${index + 1}:`);
        Object.entries(row).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
      });
      
      // Zähle die Anzahl der Datensätze
      console.log(`\nAnzahl der Datensätze im Blatt ${sheetName}: ${jsonData.length}`);
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
    console.log('Verwendung: node analyze_excel.js <dateipfad>');
    return;
  }
  
  const filePath = args[0];
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  analyzeExcelFile(filePath);
}

// Ausführen der Hauptfunktion
main();