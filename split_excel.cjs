// Skript zum Aufteilen einer großen Excel-Datei in mehrere kleinere Dateien
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Funktion zum Aufteilen der Excel-Datei
function splitExcelFile(filePath, rowsPerFile = 1000, outputDir = './split_files') {
  console.log(`Teile Excel-Datei auf: ${filePath}`);
  console.log(`Zeilen pro Datei: ${rowsPerFile}`);
  console.log(`Ausgabeverzeichnis: ${outputDir}`);
  
  try {
    // Erstelle das Ausgabeverzeichnis, falls es nicht existiert
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Ausgabeverzeichnis erstellt: ${outputDir}`);
    }
    
    // Excel-Datei lesen mit Datumswerten als JavaScript Date-Objekte
    console.log('Lese Excel-Datei...');
    const workbook = xlsx.readFile(filePath, { 
      cellDates: true,
      dateNF: 'yyyy-mm-dd'
    });
    
    // Name des ersten Arbeitsblatts
    const firstSheetName = workbook.SheetNames[0];
    console.log(`Verwende Arbeitsblatt: ${firstSheetName}`);
    
    // Lese das Arbeitsblatt
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Konvertiere in JSON für einfachere Verarbeitung
    console.log('Konvertiere Daten in JSON-Format...');
    const jsonData = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,  // Verwende die erste Zeile als Überschriften
      raw: false, // Konvertiere Werte in native Typen
      dateNF: 'yyyy-mm-dd'
    });
    
    const totalRows = jsonData.length;
    console.log(`Insgesamt ${totalRows} Zeilen gefunden (inklusive Kopfzeile)`);
    
    if (totalRows <= 1) {
      console.log('Keine Daten zum Aufteilen gefunden.');
      return;
    }
    
    // Extrahiere die Kopfzeile
    const headers = jsonData[0];
    console.log(`${headers.length} Spalten gefunden`);
    
    // Bestimme die Anzahl der benötigten Dateien
    const dataRows = totalRows - 1; // Ohne Kopfzeile
    const numFiles = Math.ceil(dataRows / rowsPerFile);
    console.log(`Datei wird in ${numFiles} Teile aufgeteilt`);
    
    // Basename der Originaldatei ohne Erweiterung für die Benennung der Ausgabedateien
    const originalBaseName = path.basename(filePath, path.extname(filePath));
    
    // Teile die Daten auf und erstelle separate Excel-Dateien
    for (let fileIndex = 0; fileIndex < numFiles; fileIndex++) {
      // Startzeile für diesen Teil (ohne Kopfzeile)
      const startRow = fileIndex * rowsPerFile + 1;
      // Endzeile für diesen Teil (oder das Ende der Daten)
      const endRow = Math.min(startRow + rowsPerFile, totalRows);
      
      console.log(`\nErstelle Teil ${fileIndex + 1}/${numFiles} mit Zeilen ${startRow} bis ${endRow - 1}`);
      
      // Kopiere die Kopfzeile und die entsprechenden Datenzeilen
      const partData = [
        headers,  // Kopfzeile
        ...jsonData.slice(startRow, endRow)  // Datenzeilen für diesen Teil
      ];
      
      // Erstelle ein neues Arbeitsblatt aus den Teildaten
      const partWorksheet = xlsx.utils.aoa_to_sheet(partData);
      
      // Erstelle ein neues Workbook und füge das Arbeitsblatt hinzu
      const partWorkbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(partWorkbook, partWorksheet, firstSheetName);
      
      // Ausgabedateiname
      const outputFileName = `${originalBaseName}_part${fileIndex + 1}of${numFiles}.xlsx`;
      const outputFilePath = path.join(outputDir, outputFileName);
      
      // Speichere die Teildatei
      xlsx.writeFile(partWorkbook, outputFilePath);
      console.log(`Teildatei gespeichert: ${outputFilePath}`);
      
      // Zeige Beispieldaten für den ersten Teil
      if (fileIndex === 0) {
        console.log('\nBeispieldaten aus dem ersten Teil:');
        // Zeige bis zu 3 Zeilen als Beispiel
        const sampleRows = Math.min(3, partData.length - 1);
        for (let i = 1; i <= sampleRows; i++) {
          console.log(`\nZeile ${i}:`);
          const headerValues = {};
          for (let j = 0; j < headers.length; j++) {
            if (partData[i] && partData[i][j] !== undefined) {
              headerValues[headers[j]] = partData[i][j];
            }
          }
          // Begrenze die Ausgabe auf einige wichtige Felder
          const importantFields = [
            'Date / Time', 'Automatenname', 'Automaten-ID', 'Telemetrieeinheit', 
            'Produktname', 'Produktnr.', 'Menge', 'Preis (inkl. MwSt.)', 'Transaktionstyp'
          ];
          for (const field of importantFields) {
            if (headerValues[field] !== undefined) {
              console.log(`  ${field}: ${headerValues[field]}`);
            }
          }
        }
      }
    }
    
    console.log(`\nAufteilung abgeschlossen. ${numFiles} Teildateien wurden erstellt im Verzeichnis ${outputDir}`);
    return numFiles;
  } catch (error) {
    console.error(`Fehler beim Aufteilen der Excel-Datei:`, error);
    return 0;
  }
}

// Hauptfunktion
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node split_excel.cjs <dateipfad> [zeilen_pro_datei] [ausgabeverzeichnis]');
    return;
  }
  
  const filePath = args[0];
  // Standardwert: 1000 Zeilen pro Datei
  const rowsPerFile = args[1] ? parseInt(args[1], 10) : 1000;
  // Standardwert: Unterverzeichnis 'split_files' im aktuellen Verzeichnis
  const outputDir = args[2] || './split_files';
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  splitExcelFile(filePath, rowsPerFile, outputDir);
}

// Ausführen der Hauptfunktion
main();