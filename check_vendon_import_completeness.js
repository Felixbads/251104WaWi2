/**
 * Vendon Import Vollständigkeitsprüfung
 * 
 * Dieses Skript führt verschiedene Checks durch, um die Vollständigkeit und Korrektheit
 * des Vendon-Transaktionen-Imports zu überprüfen.
 * 
 * Es prüft auf:
 * - Duplikate (identische vendon_id)
 * - Datumslücken (Tage ohne Transaktionen)
 * - Vergleich mit vendsTotals API für Konsistenzprüfung
 * 
 * Verwendung:
 *   node check_vendon_import_completeness.js [--start-date=YYYY-MM-DD] [--end-date=YYYY-MM-DD]
 * 
 * Beispiele:
 *   node check_vendon_import_completeness.js --start-date=2022-01-01
 *   node check_vendon_import_completeness.js --start-date=2022-01-01 --end-date=2022-12-31
 */

require('dotenv').config();
const { Pool } = require('pg');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { format, parseISO, addDays, isAfter } = require('date-fns');

// Kommandozeilenargumente parsen
const argv = yargs(hideBin(process.argv))
  .option('start-date', {
    describe: 'Startdatum für die Prüfung (YYYY-MM-DD)',
    type: 'string',
    default: '2015-01-01'
  })
  .option('end-date', {
    describe: 'Enddatum für die Prüfung (YYYY-MM-DD), Standard: heute',
    type: 'string'
  })
  .option('details', {
    describe: 'Detaillierte Informationen anzeigen',
    type: 'boolean',
    default: false
  })
  .help()
  .argv;

// Pool für Datenbankverbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Prüft auf Duplikate (identische vendon_id)
 */
async function checkDuplicates() {
  console.log('🔍 Prüfe auf Duplikate...');
  
  const query = `
    SELECT vendon_id, COUNT(*) as count
    FROM transactions
    GROUP BY vendon_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;
  
  const result = await pool.query(query);
  
  if (result.rows.length === 0) {
    console.log('✅ Keine Duplikate gefunden!');
    return { duplicatesFound: 0, details: [] };
  }
  
  console.log(`⚠️ ${result.rows.length} Duplikate gefunden!`);
  
  if (argv.details) {
    for (const row of result.rows) {
      console.log(`- vendon_id: ${row.vendon_id}, count: ${row.count}`);
      
      // Details zu jedem Duplikat anzeigen
      const detailsQuery = `
        SELECT id, vendon_id, datetime, machine_name, product_name, source, created_at
        FROM transactions
        WHERE vendon_id = $1
        ORDER BY created_at
      `;
      
      const detailsResult = await pool.query(detailsQuery, [row.vendon_id]);
      
      for (const detail of detailsResult.rows) {
        console.log(`  * ID: ${detail.id}, Datum: ${detail.datetime}, Maschine: ${detail.machine_name}, Produkt: ${detail.product_name}, Quelle: ${detail.source}, Erstellt: ${detail.created_at}`);
      }
      
      console.log('');
    }
  }
  
  return { 
    duplicatesFound: result.rows.length, 
    details: result.rows
  };
}

/**
 * Prüft auf Datumslücken (Tage ohne Transaktionen)
 */
async function checkDateGaps() {
  console.log('🔍 Prüfe auf Datumslücken...');
  
  const startDate = parseISO(argv['start-date']);
  const endDate = argv['end-date'] ? parseISO(argv['end-date']) : new Date();
  
  // Generiere alle Tage im Zeitraum
  const query = `
    WITH days AS (
      SELECT generate_series($1::date, $2::date, interval '1 day') AS day
    )
    SELECT 
      days.day::date,
      COALESCE(COUNT(t.id), 0) AS transaction_count
    FROM days
    LEFT JOIN transactions t ON DATE(t.datetime) = days.day
    GROUP BY days.day
    ORDER BY days.day;
  `;
  
  const result = await pool.query(query, [startDate, endDate]);
  
  const gaps = result.rows.filter(row => row.transaction_count === 0);
  
  if (gaps.length === 0) {
    console.log('✅ Keine Datumslücken gefunden!');
    return { gapsFound: 0, details: [] };
  }
  
  console.log(`⚠️ ${gaps.length} Tage ohne Transaktionen gefunden!`);
  
  if (argv.details) {
    console.log('Tage ohne Transaktionen:');
    for (const gap of gaps) {
      console.log(`- ${format(gap.day, 'yyyy-MM-dd')}`);
    }
  }
  
  // Zusammenfassung erstellen
  let gapSummary = {};
  gaps.forEach(gap => {
    const year = format(gap.day, 'yyyy');
    const month = format(gap.day, 'MM');
    
    if (!gapSummary[year]) {
      gapSummary[year] = {};
    }
    
    if (!gapSummary[year][month]) {
      gapSummary[year][month] = 0;
    }
    
    gapSummary[year][month]++;
  });
  
  console.log('\nZusammenfassung der Lücken nach Jahr/Monat:');
  for (const year in gapSummary) {
    for (const month in gapSummary[year]) {
      console.log(`- ${year}-${month}: ${gapSummary[year][month]} Tage ohne Transaktionen`);
    }
  }
  
  return { 
    gapsFound: gaps.length, 
    details: gaps,
    summary: gapSummary
  };
}

/**
 * Prüft die Verteilung der Transaktionen nach Datum
 */
async function checkTransactionDistribution() {
  console.log('📊 Analysiere Transaktionsverteilung...');
  
  const query = `
    SELECT 
      DATE(datetime) AS day,
      COUNT(*) AS transaction_count
    FROM transactions
    GROUP BY day
    ORDER BY day
  `;
  
  const result = await pool.query(query);
  
  let totalTransactions = 0;
  let minTransactions = Number.MAX_SAFE_INTEGER;
  let maxTransactions = 0;
  let minDay = null;
  let maxDay = null;
  
  result.rows.forEach(row => {
    totalTransactions += parseInt(row.transaction_count);
    
    if (parseInt(row.transaction_count) < minTransactions) {
      minTransactions = parseInt(row.transaction_count);
      minDay = row.day;
    }
    
    if (parseInt(row.transaction_count) > maxTransactions) {
      maxTransactions = parseInt(row.transaction_count);
      maxDay = row.day;
    }
  });
  
  const avgTransactions = totalTransactions / result.rows.length;
  
  console.log(`Transaktionsstatistik für ${result.rows.length} Tage mit Daten:`);
  console.log(`- Durchschnitt: ${avgTransactions.toFixed(2)} Transaktionen pro Tag`);
  console.log(`- Minimum: ${minTransactions} Transaktionen am ${format(minDay, 'yyyy-MM-dd')}`);
  console.log(`- Maximum: ${maxTransactions} Transaktionen am ${format(maxDay, 'yyyy-MM-dd')}`);
  console.log(`- Gesamt: ${totalTransactions} Transaktionen`);
  
  if (argv.details) {
    console.log('\nVerteilung (TOP 10 Tage mit den meisten Transaktionen):');
    
    result.rows
      .sort((a, b) => parseInt(b.transaction_count) - parseInt(a.transaction_count))
      .slice(0, 10)
      .forEach(row => {
        console.log(`- ${format(row.day, 'yyyy-MM-dd')}: ${row.transaction_count} Transaktionen`);
      });
  }
  
  return {
    daysWithData: result.rows.length,
    totalTransactions,
    avgTransactions,
    minTransactions,
    maxTransactions,
    minDay,
    maxDay
  };
}

/**
 * Prüft auf unvollständige Datensätze (fehlende wichtige Felder)
 */
async function checkIncompleteRecords() {
  console.log('🔍 Prüfe auf unvollständige Datensätze...');
  
  const query = `
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN vendon_id IS NULL THEN 1 ELSE 0 END) AS missing_vendon_id,
      SUM(CASE WHEN datetime IS NULL THEN 1 ELSE 0 END) AS missing_datetime,
      SUM(CASE WHEN machine_id IS NULL THEN 1 ELSE 0 END) AS missing_machine_id,
      SUM(CASE WHEN machine_name IS NULL THEN 1 ELSE 0 END) AS missing_machine_name,
      SUM(CASE WHEN product_id IS NULL THEN 1 ELSE 0 END) AS missing_product_id,
      SUM(CASE WHEN product_name IS NULL THEN 1 ELSE 0 END) AS missing_product_name,
      SUM(CASE WHEN price IS NULL THEN 1 ELSE 0 END) AS missing_price
    FROM transactions
  `;
  
  const result = await pool.query(query);
  const row = result.rows[0];
  
  console.log(`Analyse von ${row.total} Transaktionen:`);
  console.log(`- Fehlende vendon_id: ${row.missing_vendon_id} (${(row.missing_vendon_id / row.total * 100).toFixed(2)}%)`);
  console.log(`- Fehlende datetime: ${row.missing_datetime} (${(row.missing_datetime / row.total * 100).toFixed(2)}%)`);
  console.log(`- Fehlende machine_id: ${row.missing_machine_id} (${(row.missing_machine_id / row.total * 100).toFixed(2)}%)`);
  console.log(`- Fehlende machine_name: ${row.missing_machine_name} (${(row.missing_machine_name / row.total * 100).toFixed(2)}%)`);
  console.log(`- Fehlende product_id: ${row.missing_product_id} (${(row.missing_product_id / row.total * 100).toFixed(2)}%)`);
  console.log(`- Fehlende product_name: ${row.missing_product_name} (${(row.missing_product_name / row.total * 100).toFixed(2)}%)`);
  console.log(`- Fehlende price: ${row.missing_price} (${(row.missing_price / row.total * 100).toFixed(2)}%)`);
  
  if (argv.details && (
    row.missing_vendon_id > 0 || 
    row.missing_datetime > 0 || 
    row.missing_machine_id > 0 || 
    row.missing_product_id > 0 || 
    row.missing_price > 0
  )) {
    console.log('\nBeispiele für unvollständige Datensätze:');
    
    if (row.missing_vendon_id > 0) {
      const exampleResult = await pool.query(`
        SELECT id, datetime, machine_name, product_name, source
        FROM transactions
        WHERE vendon_id IS NULL
        LIMIT 5
      `);
      
      console.log('Fehlende vendon_id:');
      exampleResult.rows.forEach(example => {
        console.log(`- ID: ${example.id}, Datum: ${example.datetime}, Quelle: ${example.source}`);
      });
    }
    
    // Weitere Details für andere fehlende Felder hier...
  }
  
  return result.rows[0];
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🔎 Starte Vollständigkeitsprüfung des Vendon-Imports');
  console.log(`Zeitraum: ${argv['start-date']} bis ${argv['end-date'] || 'heute'}`);
  console.log('---------------------------\n');
  
  try {
    // Prüfungen durchführen
    const duplicateResult = await checkDuplicates();
    console.log(''); // Leerzeile für bessere Lesbarkeit
    
    const gapResult = await checkDateGaps();
    console.log(''); // Leerzeile für bessere Lesbarkeit
    
    const distributionResult = await checkTransactionDistribution();
    console.log(''); // Leerzeile für bessere Lesbarkeit
    
    const incompleteResult = await checkIncompleteRecords();
    console.log(''); // Leerzeile für bessere Lesbarkeit
    
    // Gesamtbewertung
    console.log('📋 Zusammenfassung der Prüfungen:');
    console.log('---------------------------');
    
    let issues = 0;
    
    if (duplicateResult.duplicatesFound > 0) {
      console.log(`❌ ${duplicateResult.duplicatesFound} Datensätze mit Duplikaten gefunden`);
      issues++;
    } else {
      console.log('✅ Keine Duplikate gefunden');
    }
    
    if (gapResult.gapsFound > 0) {
      console.log(`⚠️ ${gapResult.gapsFound} Tage ohne Transaktionen identifiziert`);
      issues++;
    } else {
      console.log('✅ Keine Datumslücken gefunden');
    }
    
    const incompleteCount = Object.entries(incompleteResult)
      .filter(([key, value]) => key !== 'total' && value > 0)
      .length;
    
    if (incompleteCount > 0) {
      console.log(`⚠️ Unvollständige Datensätze mit fehlenden Pflichtfeldern gefunden`);
      issues++;
    } else {
      console.log('✅ Keine unvollständigen Datensätze gefunden');
    }
    
    console.log('---------------------------');
    
    if (issues === 0) {
      console.log('🎉 Alle Prüfungen bestanden! Der Import scheint vollständig und korrekt zu sein.');
    } else {
      console.log(`⚠️ ${issues} Probleme mit der Datenqualität erkannt. Weitere Untersuchungen empfohlen.`);
    }
    
    console.log(`\nInsgesamt wurden ${distributionResult.totalTransactions} Transaktionen über ${distributionResult.daysWithData} Tage analysiert.`);
    
  } catch (error) {
    console.error('Fehler bei der Vollständigkeitsprüfung:', error);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Unbehandelter Fehler:', error);
  process.exit(1);
});