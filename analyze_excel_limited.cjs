/**
 * Skript zur Analyse einer Excel-Datei ohne vollständiges Laden des Inhalts
 * Vermeidet Timeout-Probleme durch stichprobenartige Analyse
 */

const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Analysiert eine Excel-Datei und liefert detaillierte Informationen zur Struktur,
 * ohne den gesamten Inhalt zu laden
 * 
 * @param {string} filePath - Pfad zur Excel-Datei
 */
function analyzeExcelFileLimited(filePath) {
  console.log(`Analysiere Excel-Datei: ${filePath}`);
  
  try {
    // Dateiinformationen
    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    
    console.log(`Dateiname: ${path.basename(filePath)}`);
    console.log(`Dateigröße: ${fileSizeKB} KB`);
    
    // Optimierter Ansatz: Erst mit begrenzten Optionen laden
    console.log('\nLese Excel-Datei mit eingeschränkten Optionen...');
    
    // Neue XLSX Optionen: Range-basiertes Lesen, um nur die ersten 50 Zeilen zu lesen
    // Definiere einen Zellenbereich: A1:Z50 (bis zu 50 Zeilen, Spalten A bis Z)
    const range = 'A1:Z50';
    const options = {
      range: range,
      cellDates: true,
      raw: false
    };
    
    // Lese die Datei mit maximalen Einschränkungen um Timeouts zu vermeiden
    const workbook = xlsx.readFile(filePath, { 
      cellDates: true,
      dateNF: 'yyyy-mm-dd',
      cellFormula: false, // Keine Formeln laden
      bookSheets: true,  // Nur Arbeitsblattinformationen laden
      sheetRows: 50      // Maximale Anzahl der zu lesenden Zeilen
    });
    
    // Arbeitsblätter analysieren
    console.log('\nArbeitsblätter:');
    if (workbook.SheetNames && workbook.SheetNames.length > 0) {
      workbook.SheetNames.forEach((sheetName, index) => {
        console.log(`  ${index + 1}. ${sheetName}`);
      });
      
      // Bei großen Dateien nur das erste Arbeitsblatt und begrenzte Anzahl von Zeilen analysieren
      const sheetName = workbook.SheetNames[0];
      console.log(`\nAnalysiere erste 50 Zeilen von Arbeitsblatt: ${sheetName}`);
      
      // Arbeitsblatt aus dem Workbook holen
      const worksheet = workbook.Sheets[sheetName];
      
      // Prüfe, ob das Arbeitsblatt existiert
      if (!worksheet) {
        console.log(`WARNUNG: Arbeitsblatt '${sheetName}' existiert, aber seine Inhalte konnten nicht geladen werden.`);
        console.log('Dies deutet auf ein Problem mit der Dateistruktur oder extreme Größe hin.');
        
        // Erstelle ein leeres Arbeitsblatt zur Weiterverarbeitung
        workbook.Sheets[sheetName] = { '!ref': 'A1:A1' };
      }
    } else {
      console.log('WARNUNG: Keine Arbeitsblätter in der Datei gefunden oder die Datei ist beschädigt.');
      console.log('Breche Analyse ab.');
      return;
    }
    
    // Erneut das Arbeitsblatt holen (nach möglicher Initialisierung)
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Wenn die Datei zu groß ist, zeige nur die Zellenreferenzen ohne Inhalt
    if (stats.size > 1024 * 1024) { // Größer als 1 MB
      console.log('\nDatei ist groß (>1MB). Zeige nur Zellenreferenzen für den Bereich:');
      
      const refs = Object.keys(worksheet).filter(key => 
        key[0] !== '!' && // Filtere Metadaten wie '!ref'
        // Beschränke auf erste 50 Zeilen
        parseInt(key.replace(/[^0-9]/g, '')) <= 50
      );
      
      console.log(`Anzahl der Zellen in den ersten 50 Zeilen: ${refs.length}`);
      
      // Zeige die ersten und letzten 5 Zellenreferenzen
      if (refs.length > 0) {
        console.log('Erste 5 Zellenreferenzen:');
        refs.slice(0, 5).forEach(ref => console.log(`  ${ref}`));
        
        if (refs.length > 10) {
          console.log('Letzte 5 Zellenreferenzen:');
          refs.slice(-5).forEach(ref => console.log(`  ${ref}`));
        }
      }
    }
    
    // Konvertiere ausgewählte Zeilen in JSON
    console.log('\nKonvertiere ersten 10 Zeilen in JSON-Format...');
    try {
      // Versuche bis zu 10 Zeilen zu konvertieren
      const limitedRange = 'A1:Z11'; // Kopfzeile + 10 Datenzeilen
      const jsonData = xlsx.utils.sheet_to_json(worksheet, {
        range: limitedRange,
        defval: null, // Leere Zellen als null
        blankrows: false // Leere Zeilen überspringen
      });
      
      // Zeige Anzahl der geladenen Zeilen
      console.log(`Erfolgreich ${jsonData.length} Zeilen geladen`);
      
      // Zeige die Spaltenüberschriften
      if (jsonData.length > 0) {
        console.log('\nSpaltennamen:');
        const columns = Object.keys(jsonData[0]);
        columns.forEach((column, idx) => {
          console.log(`  ${idx + 1}. ${column}`);
        });
        
        // Zeige die erste Zeile als Beispiel
        console.log('\nErste Datenzeile als Beispiel:');
        const firstRow = jsonData[0];
        for (const [key, value] of Object.entries(firstRow)) {
          console.log(`  ${key}: ${value}`);
        }
      }
    } catch (error) {
      console.error(`Fehler beim Konvertieren in JSON: ${error.message}`);
    }
    
    // Versuche, die Zeilenzahl zu ermitteln, ohne alles zu laden
    console.log('\nVersuche Gesamtzeilenzahl zu ermitteln (Schätzung)...');
    try {
      // Prüfe den Referenzbereich des Arbeitsblatts
      const ref = worksheet['!ref'];
      if (ref) {
        const [start, end] = ref.split(':');
        const endRow = end.replace(/[A-Z]/g, '');
        console.log(`Geschätzte Gesamtzeilenzahl (basierend auf !ref): ${endRow}`);
      } else {
        console.log('Keine Referenzinformation (!ref) verfügbar.');
      }
    } catch (error) {
      console.error(`Fehler bei der Zeilenzahlermittlung: ${error.message}`);
    }
    
    // Schätze Zeilen- und Spaltenanzahl (ohne alles zu laden)
    try {
      // Alternativ: Lade nur das Ref-Objekt
      const range = xlsx.utils.decode_range(worksheet['!ref']);
      console.log(`\nArbeitsblattbereich: ${worksheet['!ref']}`);
      console.log(`Erste Zeile: ${range.s.r}, Letzte Zeile: ${range.e.r}`);
      console.log(`Erste Spalte: ${range.s.c}, Letzte Spalte: ${range.e.c}`);
      console.log(`Geschätzte Zeilenanzahl: ${range.e.r - range.s.r + 1}`);
      console.log(`Geschätzte Spaltenanzahl: ${range.e.c - range.s.c + 1}`);
      
      // Wenn die Zeilenanzahl sehr hoch ist, ist das der Grund für das Timeout
      if (range.e.r > 10000) {
        console.log(`\nWARNUNG: Diese Datei enthält mehr als 10.000 Zeilen (${range.e.r}), was zu Timeout-Problemen führen kann.`);
      }
    } catch (error) {
      console.error(`Fehler bei der Bereichsermittlung: ${error.message}`);
    }
    
    console.log('\nAnalyse abgeschlossen');
    
    // Empfehlungen basierend auf der Analyse
    console.log('\nEmpfehlungen:');
    if (stats.size > 1024 * 1024 || (worksheet['!ref'] && parseInt(worksheet['!ref'].replace(/[^0-9]/g, '')) > 10000)) {
      console.log('1. Verwenden Sie ein Stream-basiertes Verarbeitungsmodell');
      console.log('2. Teilen Sie die Datei in kleinere Teile auf');
      console.log('3. Verwenden Sie spezialisierte Tools für große Excel-Dateien');
    } else {
      console.log('Diese Datei sollte mit Standard-Methoden verarbeitet werden können.');
      console.log('Versuchen Sie:');
      console.log('1. Verwenden Sie {rawNumbers: true} und {cellDates: true} als Optionen');
      console.log('2. Setzen Sie Timeout-Werte für die Verarbeitung höher');
    }
    
  } catch (error) {
    console.error(`Fehler bei der Analyse der Excel-Datei: ${error.message}`);
    console.error(error.stack);
  }
}

// Hauptfunktion
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Bitte geben Sie den Pfad zur Excel-Datei an.');
    console.log('Verwendung: node analyze_excel_limited.cjs <dateipfad>');
    return;
  }
  
  const filePath = args[0];
  
  if (!fs.existsSync(filePath)) {
    console.error(`Die Datei ${filePath} existiert nicht.`);
    return;
  }
  
  console.log(`Datei gefunden: ${filePath}`);
  analyzeExcelFileLimited(filePath);
}

// Ausführen der Hauptfunktion
main();