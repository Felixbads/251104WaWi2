/**
 * Hauptskript zur Bereinigung von Vendon-Duplikaten
 * 
 * Dieses Skript führt eine vollständige Bereinigung durch:
 * 1. Bereinigt Produktduplikate
 * 2. Bereinigt Lagerbestand-Duplikate
 * 
 * Anwendung: node scripts/cleanup_vendon_duplicates.js
 */

import 'dotenv/config';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

async function runCleanup() {
  console.log('=============================================');
  console.log('Starte vollständige Vendon-Duplikatbereinigung');
  console.log('=============================================\n');
  
  const startTime = Date.now();
  
  try {
    // 1. Zuerst Produktduplikate bereinigen
    console.log('SCHRITT 1: Produktduplikate bereinigen');
    console.log('--------------------------------------');
    
    const productResult = await execPromise('node scripts/cleanup_product_duplicates.js');
    console.log(productResult.stdout);
    if (productResult.stderr) {
      console.error('FEHLER:', productResult.stderr);
    }
    
    // 2. Dann Lagerbestand-Duplikate bereinigen
    console.log('\n\nSCHRITT 2: Lagerbestand-Duplikate bereinigen');
    console.log('-------------------------------------------');
    
    const stocksResult = await execPromise('node scripts/cleanup_machine_stocks.js');
    console.log(stocksResult.stdout);
    if (stocksResult.stderr) {
      console.error('FEHLER:', stocksResult.stderr);
    }
    
    // 3. Zusammenfassung
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    console.log('\n=============================================');
    console.log('ZUSAMMENFASSUNG DER VENDON-DUPLIKATBEREINIGUNG');
    console.log('=============================================');
    console.log(`Gesamtdauer: ${durationSeconds.toFixed(2)} Sekunden`);
    console.log('Die Bereinigung wurde abgeschlossen.');
    console.log('\nWichtige Hinweise:');
    console.log('- Wenn noch Probleme mit Duplikaten auftreten, führen Sie das Skript erneut aus.');
    console.log('- Die verbesserte syncProducts-Funktion verhindert neue Duplikate.');
    console.log('=============================================');
    
  } catch (error) {
    console.error('Fehler bei der Bereinigung:', error);
  }
}

// Führe die Bereinigung aus
runCleanup().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Unbehandelter Fehler:', err);
  process.exit(1);
});