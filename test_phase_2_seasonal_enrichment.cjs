/**
 * Phase 2 Test: Seasonal Enrichment Implementation 
 * 
 * Testet die saisonale Datenanreicherung für historische Vendon-Transaktionen
 * mit allen neuen Schema-Feldern und Berechnungen
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testSeasonalEnrichment() {
  console.log('\n🧪 Phase 2 Seasonal Enrichment Test gestartet...\n');

  try {
    // Test 1: Verify seasonal schema fields exist
    console.log('✅ Test 1: Schema-Überprüfung der saisonalen Felder...');
    
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'transactions' 
      AND column_name IN (
        'week_of_year', 'day_of_year', 'month_of_year', 'quarter_of_year', 
        'weekday_number', 'season', 'is_holiday', 'is_vacation', 
        'tourist_season', 'school_in_session', 'seasonal_enrichment_source',
        'seasonal_enrichment_date'
      )
      ORDER BY column_name
    `);
    
    console.log(`   Gefundene saisonale Felder: ${schemaResult.rows.length}`);
    schemaResult.rows.forEach(row => {
      console.log(`   ✓ ${row.column_name} (${row.data_type})`);
    });

    // Test 2: Sample transaction with seasonal calculations
    console.log('\n✅ Test 2: Saisonale Berechnungen für Beispiel-Datum...');
    
    const testDate = new Date('2024-07-15T14:30:00Z'); // Summer Monday
    console.log(`   Test-Datum: ${testDate.toISOString()}`);
    
    // Manual seasonal calculations for verification
    const weekOfYear = getWeekOfYear(testDate);
    const dayOfYear = getDayOfYear(testDate);
    const monthOfYear = testDate.getMonth() + 1;
    const quarterOfYear = Math.ceil(monthOfYear / 3);
    const weekdayNumber = getWeekdayNumber(testDate);
    const season = getSeason(testDate);
    const touristSeason = isTouristSeason(testDate);
    
    console.log(`   ✓ Kalenderwoche: ${weekOfYear}`);
    console.log(`   ✓ Tag des Jahres: ${dayOfYear}`);
    console.log(`   ✓ Monat: ${monthOfYear}, Quartal: ${quarterOfYear}`);
    console.log(`   ✓ Wochentag: ${weekdayNumber} (1=Mo, 7=So)`);
    console.log(`   ✓ Jahreszeit: ${season}`);
    console.log(`   ✓ Tourismussaison: ${touristSeason}`);

    // Test 3: Check existing transactions for seasonal data
    console.log('\n✅ Test 3: Überprüfung bestehender Transaktionen...');
    
    const transactionCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(week_of_year) as with_week,
        COUNT(season) as with_season,
        COUNT(seasonal_enrichment_source) as with_enrichment_source,
        AVG(CASE WHEN week_of_year IS NOT NULL THEN 1.0 ELSE 0.0 END) * 100 as enrichment_percentage
      FROM transactions 
      WHERE datetime >= NOW() - INTERVAL '7 days'
    `);
    
    const stats = transactionCheck.rows[0];
    console.log(`   Transaktionen (letzte 7 Tage): ${stats.total_transactions}`);
    console.log(`   Mit Kalenderwoche: ${stats.with_week}`);
    console.log(`   Mit Jahreszeit: ${stats.with_season}`);
    console.log(`   Mit Anreicherungsquelle: ${stats.with_enrichment_source}`);
    console.log(`   Anreicherungsgrad: ${parseFloat(stats.enrichment_percentage).toFixed(1)}%`);

    // Test 4: Sample seasonal data distribution
    console.log('\n✅ Test 4: Saisonale Datenverteilung...');
    
    const seasonalDistribution = await pool.query(`
      SELECT 
        season,
        COUNT(*) as transaction_count,
        AVG(weekday_number) as avg_weekday,
        SUM(CASE WHEN tourist_season THEN 1 ELSE 0 END) as tourist_season_count
      FROM transactions 
      WHERE season IS NOT NULL
        AND datetime >= NOW() - INTERVAL '30 days'
      GROUP BY season
      ORDER BY transaction_count DESC
    `);
    
    if (seasonalDistribution.rows.length > 0) {
      console.log('   Saisonale Verteilung (letzte 30 Tage):');
      seasonalDistribution.rows.forEach(row => {
        console.log(`   ✓ ${row.season}: ${row.transaction_count} Transaktionen (Ø Wochentag: ${parseFloat(row.avg_weekday).toFixed(1)})`);
      });
    } else {
      console.log('   ⚠️ Keine angereicherten Transaktionen gefunden');
    }

    // Test 5: Seasonal enrichment readiness
    console.log('\n✅ Test 5: Bereitschaft für historische Synchronisation...');
    
    const readinessCheck = await pool.query(`
      SELECT 
        table_name,
        column_name,
        data_type
      FROM information_schema.columns 
      WHERE table_name IN ('holidays', 'weather_data', 'calendar_days')
      ORDER BY table_name, column_name
    `);
    
    const tableGroups = groupBy(readinessCheck.rows, 'table_name');
    Object.entries(tableGroups).forEach(([tableName, columns]) => {
      console.log(`   ✓ ${tableName}: ${columns.length} Felder verfügbar`);
    });

    console.log('\n🎉 Phase 2 Seasonal Enrichment Test abgeschlossen!');
    
    // Final assessment
    const enrichmentReady = schemaResult.rows.length >= 10; // At least 10 seasonal fields
    console.log(`\n📊 Status: ${enrichmentReady ? '✅ BEREIT für historische Synchronisation' : '⚠️ Schema unvollständig'}`);
    
    if (enrichmentReady) {
      console.log('\n🚀 Nächste Schritte:');
      console.log('   1. Historical Backward Sync mit enableSeasonalEnrichment=true starten');
      console.log('   2. Transaktionen ab 2020 rückwärts sammeln und anreichern');
      console.log('   3. Wetterbasierte und feiertags-spezifische Prognosen implementieren');
    }

  } catch (error) {
    console.error('❌ Test-Fehler:', error.message);
    if (error.code === '42P01') {
      console.error('   Tabelle nicht gefunden - Schema-Migration erforderlich');
    }
  } finally {
    await pool.end();
  }
}

// Hilfsfunktionen für saisonale Berechnungen
function getWeekOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function getWeekdayNumber(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day; // Convert Sunday from 0 to 7
}

function getSeason(date) {
  const month = date.getMonth() + 1;
  if (month >= 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'autumn';
}

function isTouristSeason(date) {
  const month = date.getMonth() + 1;
  return month >= 5 && month <= 10;
}

function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const group = groups[item[key]] || [];
    group.push(item);
    groups[item[key]] = group;
    return groups;
  }, {});
}

// Test ausführen
testSeasonalEnrichment();