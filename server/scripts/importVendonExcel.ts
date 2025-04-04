/**
 * Dieses Skript importiert Vendon-Transaktionsdaten aus einer Excel-Datei
 * 
 * Verwendung:
 * npx tsx server/scripts/importVendonExcel.ts <dateipfad> [--sheet=<blattname>] [--skip=<anzahl>]
 */

import * as fs from 'fs';
import * as path from 'path';
import { vendonExcelImporter } from '../services/vendonExcelImport';

async function main() {
  console.log('Vendon Excel-Import-Tool');
  console.log('=======================');
  
  // Kommandozeilenargumente parsen
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Fehler: Bitte geben Sie einen Dateipfad an.');
    console.log('Verwendung: npx tsx server/scripts/importVendonExcel.ts <dateipfad> [--sheet=<blattname>] [--skip=<anzahl>]');
    process.exit(1);
  }
  
  const filePath = args[0];
  
  // Optionen parsen
  const options: Record<string, any> = {};
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--sheet=')) {
      options.sheetName = arg.replace('--sheet=', '');
    } else if (arg.startsWith('--skip=')) {
      options.skipRows = parseInt(arg.replace('--skip=', ''), 10);
    } else if (arg.startsWith('--limit=')) {
      options.maxRows = parseInt(arg.replace('--limit=', ''), 10);
    }
  }
  
  console.log(`Datei: ${filePath}`);
  console.log(`Optionen: ${JSON.stringify(options)}`);
  
  try {
    // Prüfen, ob die Datei existiert
    if (!fs.existsSync(filePath)) {
      console.error(`Fehler: Die Datei '${filePath}' existiert nicht.`);
      process.exit(1);
    }
    
    // Datei lesen
    const fileBuffer = fs.readFileSync(filePath);
    
    console.log(`Datei gelesen (${fileBuffer.length} Bytes)`);
    
    // Import starten
    console.log('Starte Import...');
    const startTime = new Date();
    
    const importResults = await vendonExcelImporter.importTransactionsFromExcel(fileBuffer, options);
    
    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    
    console.log('Import abgeschlossen!');
    console.log(`Dauer: ${durationSeconds.toFixed(2)} Sekunden`);
    console.log(`Gesamt: ${importResults.total} Transaktionen verarbeitet`);
    console.log(`- ${importResults.saved} neue Transaktionen gespeichert`);
    console.log(`- ${importResults.duplicates} Duplikate übersprungen`);
    console.log(`- ${importResults.errors} Fehler bei der Verarbeitung`);
    
    if (importResults.errorDetails.length > 0) {
      console.log('\nFehlerdetails:');
      for (let i = 0; i < Math.min(10, importResults.errorDetails.length); i++) {
        console.log(`Fehler ${i + 1}: ${JSON.stringify(importResults.errorDetails[i])}`);
      }
      
      if (importResults.errorDetails.length > 10) {
        console.log(`... und ${importResults.errorDetails.length - 10} weitere Fehler.`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Fehler beim Importieren der Excel-Datei:');
    console.error(error);
    process.exit(1);
  }
}

// Starte das Skript
main().catch(error => {
  console.error('Unerwarteter Fehler:');
  console.error(error);
  process.exit(1);
});