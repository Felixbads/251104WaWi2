#!/usr/bin/env npx tsx

/**
 * Vendon Historical Backfill CLI
 * 
 * Kommandozeilen-Tool für die historische Synchronisation von Vendon-Transaktionen
 * Implementiert alle Anforderungen aus der Spezifikation für sichere, wiederaufsetzbare
 * und beobachtbare historische Datensynchronisation.
 * 
 * Beispiele:
 * npm run backfill -- --machine-id=123 --from=1640995200 --to=1672531200 --dry-run
 * npm run backfill -- --machine-id=all --from=1640995200 --to=1672531200 --chunk=7 --concurrency=3
 * npm run backfill -- --machine-id=123 --from=1640995200 --to=1672531200 --limit=1000
 */

import { Command } from 'commander';
const program = new Command();
import { historicalBackfillService } from '../services/historicalBackfillService';
import { backfillOptionsSchema, type BackfillOptions } from '@shared/schema';

interface CliOptions {
  machineId: string;
  from: string;
  to: string;
  chunk?: string;
  limit?: string;
  dryRun?: boolean;
  concurrency?: string;
  maxPagesPerWindow?: string;
}

/**
 * Validiert und konvertiert CLI-Parameter
 */
function validateAndConvertOptions(options: CliOptions): { isValid: boolean; error?: string; backfillOptions?: BackfillOptions } {
  try {
    // Konvertiere String-Parameter zu Zahlen
    const fromTs = parseInt(options.from);
    const toTs = parseInt(options.to);
    const chunkDays = options.chunk ? parseInt(options.chunk) : 14;
    const pageSize = options.limit ? parseInt(options.limit) : 500;
    const maxPagesPerWindow = options.maxPagesPerWindow ? parseInt(options.maxPagesPerWindow) : 100;

    // Validiere Zeitstempel
    if (isNaN(fromTs) || isNaN(toTs)) {
      return { isValid: false, error: 'From und To müssen gültige Unix-Timestamps sein' };
    }

    if (fromTs >= toTs) {
      return { isValid: false, error: 'From-Timestamp muss kleiner als To-Timestamp sein' };
    }

    // Validiere andere Parameter
    if (isNaN(chunkDays) || chunkDays < 1 || chunkDays > 31) {
      return { isValid: false, error: 'Chunk muss zwischen 1 und 31 Tagen liegen' };
    }

    if (isNaN(pageSize) || pageSize < 1 || pageSize > 1000) {
      return { isValid: false, error: 'Limit muss zwischen 1 und 1000 liegen' };
    }

    if (isNaN(maxPagesPerWindow) || maxPagesPerWindow < 1) {
      return { isValid: false, error: 'Max-pages-per-window muss mindestens 1 sein' };
    }

    // Erstelle BackfillOptions für Einzelmaschine
    if (options.machineId !== 'all') {
      const backfillOptions: BackfillOptions = {
        machineId: options.machineId,
        fromTs,
        toTs,
        chunkDays,
        pageSize,
        dryRun: options.dryRun || false,
        maxPagesPerWindow
      };

      // Validiere mit Zod-Schema
      const validation = backfillOptionsSchema.safeParse(backfillOptions);
      if (!validation.success) {
        return { isValid: false, error: `Validierungsfehler: ${validation.error.message}` };
      }

      return { isValid: true, backfillOptions: validation.data };
    }

    // Für 'all' Modus geben wir base options ohne machineId zurück
    return { 
      isValid: true, 
      backfillOptions: {
        machineId: '', // Wird später gesetzt
        fromTs,
        toTs,
        chunkDays,
        pageSize,
        dryRun: options.dryRun || false,
        maxPagesPerWindow
      }
    };

  } catch (error) {
    return { isValid: false, error: `Fehler beim Verarbeiten der Parameter: ${error}` };
  }
}

/**
 * Druckt eine übersichtliche Zusammenfassung am Ende
 */
function printSummary(
  startTime: number, 
  machineId: string, 
  results: any,
  dryRun: boolean
): void {
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 BACKFILL ZUSAMMENFASSUNG');
  console.log('='.repeat(60));
  
  if (machineId === 'all') {
    const machines = Object.keys(results);
    const totalStats = machines.reduce((acc, machineId) => {
      const result = results[machineId];
      return {
        fetched: acc.fetched + result.totalFetched,
        upserted: acc.upserted + result.totalUpserted,
        skipped: acc.skipped + result.totalSkipped,
        errors: acc.errors + result.errors.length,
        success: acc.success + (result.success ? 1 : 0)
      };
    }, { fetched: 0, upserted: 0, skipped: 0, errors: 0, success: 0 });

    console.log(`🎯 Maschinen: ${machines.length} verarbeitet, ${totalStats.success} erfolgreich`);
    console.log(`📈 Transaktionen: ${totalStats.fetched} abgerufen, ${totalStats.upserted} ${dryRun ? 'würden gespeichert' : 'gespeichert'}`);
    console.log(`⚠️  Fehler: ${totalStats.errors} aufgetreten`);
    console.log(`⏱️  Gesamtdauer: ${Math.round(duration / 1000)}s`);
    
    if (totalStats.errors > 0) {
      console.log('\n❌ FEHLERHAFTE MASCHINEN:');
      machines.forEach(machineId => {
        const result = results[machineId];
        if (!result.success) {
          console.log(`   ${machineId}: ${result.errors.join(', ')}`);
        }
      });
    }
  } else {
    console.log(`🎯 Maschine: ${machineId}`);
    console.log(`📈 Fetched: ${results.totalFetched} Transaktionen`);
    console.log(`💾 ${dryRun ? 'Würden gespeichert' : 'Upserted'}: ${results.totalUpserted} Transaktionen`);
    console.log(`⏭️  Übersprungen: ${results.totalSkipped} Transaktionen`);
    console.log(`⏱️  Dauer: ${Math.round(duration / 1000)}s`);
    console.log(`✅ Status: ${results.success ? 'Erfolgreich' : 'Fehlgeschlagen'}`);
    
    if (results.errors.length > 0) {
      console.log(`❌ Fehler: ${results.errors.join(', ')}`);
    }
  }
  
  console.log('='.repeat(60));
}

/**
 * Hauptfunktion des CLI-Tools
 */
async function main(): Promise<void> {
  // Kommandozeilen-Interface definieren
  program
    .name('vendon-backfill')
    .description('Historischer Backfill für Vendon-Transaktionen')
    .version('1.0.0')
    .requiredOption('--machine-id <id>', 'Maschinen-ID oder "all" für alle Maschinen')
    .requiredOption('--from <timestamp>', 'Start-Timestamp (Unix UTC)')
    .requiredOption('--to <timestamp>', 'End-Timestamp (Unix UTC)')
    .option('--chunk <days>', 'Zeit-Chunk-Größe in Tagen', '14')
    .option('--limit <size>', 'Page-Size für API-Requests', '500')
    .option('--dry-run', 'Führe einen Dry-Run durch (keine Schreibvorgänge)', false)
    .option('--concurrency <count>', 'Anzahl paralleler Maschinen bei --machine-id=all', '2')
    .option('--max-pages-per-window <count>', 'Safety Valve: Max Seiten pro Zeit-Fenster', '100')
    .parse();

  const options = program.opts<CliOptions>();
  const startTime = Date.now();

  // Parameter validieren
  console.log('🔍 Validiere Parameter...');
  const validation = validateAndConvertOptions(options);
  
  if (!validation.isValid) {
    console.error(`❌ Validierungsfehler: ${validation.error}`);
    process.exit(1);
  }

  const backfillOptions = validation.backfillOptions!;

  // Zeige Konfiguration an
  console.log('\n🚀 VENDON HISTORICAL BACKFILL');
  console.log('-'.repeat(40));
  console.log(`📅 Zeitraum: ${new Date(backfillOptions.fromTs * 1000).toISOString()} bis ${new Date(backfillOptions.toTs * 1000).toISOString()}`);
  console.log(`🎯 Maschine(n): ${options.machineId}`);
  console.log(`⚙️  Chunk-Größe: ${backfillOptions.chunkDays} Tage`);
  console.log(`📄 Page-Size: ${backfillOptions.pageSize}`);
  console.log(`🔒 Safety Valve: ${backfillOptions.maxPagesPerWindow} Seiten/Fenster`);
  console.log(`🧪 Dry-Run: ${backfillOptions.dryRun ? 'Ja' : 'Nein'}`);
  
  if (options.machineId === 'all') {
    const concurrency = parseInt(options.concurrency || '2');
    console.log(`⚡ Concurrency: ${concurrency} parallele Maschinen`);
  }
  
  console.log('-'.repeat(40));

  try {
    let results: any;

    if (options.machineId === 'all') {
      // Backfill für alle Maschinen
      const concurrency = parseInt(options.concurrency || '2');
      const baseOptions = { ...backfillOptions };
      delete (baseOptions as any).machineId; // Entferne machineId für all-mode
      
      console.log(`🚀 Starte Backfill für alle Maschinen...`);
      results = await historicalBackfillService.runBackfillForAllMachines(baseOptions, concurrency);
    } else {
      // Backfill für einzelne Maschine
      console.log(`🚀 Starte Backfill für Maschine ${options.machineId}...`);
      results = await historicalBackfillService.runBackfill(backfillOptions);
    }

    // Zusammenfassung drucken
    printSummary(startTime, options.machineId, results, backfillOptions.dryRun);

    // Exit-Code setzen
    const hasErrors = options.machineId === 'all' 
      ? Object.values(results).some((result: any) => !result.success)
      : !results.success;

    process.exit(hasErrors ? 1 : 0);

  } catch (error) {
    console.error('\n❌ KRITISCHER FEHLER:');
    console.error(error);
    process.exit(1);
  }
}

// CLI ausführen wenn direkt aufgerufen
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unbehandelter Fehler:', error);
    process.exit(1);
  });
}

export { main };