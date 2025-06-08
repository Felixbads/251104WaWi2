const { Pool } = require('pg');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Bulk import weather data from Excel files with proper conflict handling
 */
async function bulkImportWeatherData() {
  console.log('🌤️ Starting bulk import of Bad Schandau weather data...');
  
  const assetsDir = path.join(__dirname, 'attached_assets');
  const files = fs.readdirSync(assetsDir);
  
  // Filter for Excel files that contain weather data
  const excelFiles = files.filter(file => 
    file.includes('export') && (file.endsWith('.xlsx') || file.endsWith('.xls'))
  ).sort(); // Sort to process in consistent order
  
  console.log(`Found ${excelFiles.length} Excel files to process`);
  
  // Clear existing Excel import data first
  await clearExistingExcelData();
  
  let totalRecordsImported = 0;
  const allWeatherRecords = [];
  
  for (const fileName of excelFiles) {
    try {
      const filePath = path.join(assetsDir, fileName);
      console.log(`📊 Processing: ${fileName}`);
      
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      console.log(`📋 Found ${data.length} rows in ${fileName}`);
      
      if (data.length === 0) continue;
      
      // Process all rows and collect valid weather records
      for (const row of data) {
        const weatherRecord = parseWeatherRowOptimized(row, fileName);
        if (weatherRecord) {
          allWeatherRecords.push(weatherRecord);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error.message);
    }
  }
  
  console.log(`📊 Total valid weather records to import: ${allWeatherRecords.length}`);
  
  // Bulk insert all records
  if (allWeatherRecords.length > 0) {
    await bulkInsertWeatherRecords(allWeatherRecords);
    totalRecordsImported = allWeatherRecords.length;
  }
  
  console.log(`🎉 Total weather records imported: ${totalRecordsImported}`);
  
  // Verify the import
  await verifyImport();
}

/**
 * Clear existing Excel import data to avoid conflicts
 */
async function clearExistingExcelData() {
  console.log('🧹 Clearing existing Excel import data...');
  
  const deleteQuery = `
    DELETE FROM weather_data 
    WHERE source LIKE 'excel_import_%'
  `;
  
  const result = await pool.query(deleteQuery);
  console.log(`🗑️ Removed ${result.rowCount} existing Excel import records`);
}

/**
 * Optimized weather row parsing
 */
function parseWeatherRowOptimized(row, fileName) {
  // Parse date
  let date = null;
  if (row.date) {
    date = parseDate(row.date);
  }
  
  if (!date) return null;
  
  // Extract temperature (tavg = average temperature)
  let temp = null;
  if (row.tavg !== undefined && row.tavg !== null) {
    temp = parseFloat(row.tavg);
    if (isNaN(temp)) temp = null;
  }
  
  if (temp === null) return null; // Skip if no temperature
  
  // Extract other fields
  let humidity = null;
  let pressure = null;
  let precipitation = null;
  let windSpeed = null;
  
  if (row.pres !== undefined && row.pres !== null) {
    pressure = parseFloat(row.pres);
    if (isNaN(pressure)) pressure = null;
  }
  
  if (row.prcp !== undefined && row.prcp !== null) {
    precipitation = parseFloat(row.prcp);
    if (isNaN(precipitation)) precipitation = null;
  }
  
  if (row.wspd !== undefined && row.wspd !== null) {
    windSpeed = parseFloat(row.wspd);
    if (isNaN(windSpeed)) windSpeed = null;
  }
  
  // Create timestamp for noon (12:00) of the day
  const hour = 12;
  const timestamp = new Date(`${date}T12:00:00Z`);
  
  return {
    timestamp: timestamp.toISOString(),
    station_name: 'Bad Schandau',
    station_id: 'bad_schandau',
    date: date,
    hour: hour,
    temp: temp,
    humidity: humidity,
    pressure: pressure,
    precipitation: precipitation,
    wind_speed: windSpeed,
    source: `excel_import_${fileName}`,
    sync_status: 'completed'
  };
}

/**
 * Parse various date formats
 */
function parseDate(dateValue) {
  if (!dateValue) return null;
  
  // If it's already a Date object
  if (dateValue instanceof Date) {
    return dateValue.toISOString().split('T')[0];
  }
  
  // If it's a string, try to parse it
  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  
  // If it's a number (Excel serial date)
  if (typeof dateValue === 'number') {
    // Excel date serial number (days since 1900-01-01)
    const excelEpoch = new Date('1900-01-01');
    const date = new Date(excelEpoch.getTime() + (dateValue - 1) * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

/**
 * Bulk insert weather records using batch processing
 */
async function bulkInsertWeatherRecords(records) {
  console.log('💾 Starting bulk insert...');
  
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    // Create values string for bulk insert
    const values = [];
    const params = [];
    let paramIndex = 1;
    
    for (const record of batch) {
      values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`);
      params.push(
        record.timestamp,
        record.station_name,
        record.station_id,
        record.date,
        record.hour,
        record.temp,
        record.humidity,
        record.pressure,
        record.precipitation,
        record.wind_speed,
        record.source
      );
      paramIndex += 11;
    }
    
    const query = `
      INSERT INTO weather_data (
        timestamp, station_name, station_id, date, hour, temp, 
        humidity, pressure, precipitation, wind_speed, source
      ) VALUES ${values.join(', ')}
      ON CONFLICT (date, hour, station_id) DO UPDATE SET
        timestamp = EXCLUDED.timestamp,
        temp = EXCLUDED.temp,
        humidity = EXCLUDED.humidity,
        pressure = EXCLUDED.pressure,
        precipitation = EXCLUDED.precipitation,
        wind_speed = EXCLUDED.wind_speed,
        source = EXCLUDED.source
    `;
    
    try {
      await pool.query(query, params);
      inserted += batch.length;
      console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} (${inserted} total)`);
    } catch (error) {
      console.error(`❌ Error inserting batch:`, error.message);
    }
  }
  
  console.log(`💾 Bulk insert completed. Total records: ${inserted}`);
}

/**
 * Verify the import results
 */
async function verifyImport() {
  console.log('\n📊 Verifying import results...');
  
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT date) as unique_days,
      MIN(date) as earliest_date,
      MAX(date) as latest_date,
      AVG(temp)::NUMERIC(5,1) as avg_temp,
      COUNT(DISTINCT source) as data_sources
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
  `);
  
  const stats = result.rows[0];
  console.log('📈 Bad Schandau Weather Data Summary:');
  console.log(`   Total Records: ${stats.total_records}`);
  console.log(`   Unique Days: ${stats.unique_days}`);
  console.log(`   Date Range: ${stats.earliest_date} to ${stats.latest_date}`);
  console.log(`   Average Temperature: ${stats.avg_temp}°C`);
  console.log(`   Data Sources: ${stats.data_sources}`);
  
  // Show Excel import specific data
  const excelResult = await pool.query(`
    SELECT 
      source,
      COUNT(*) as records,
      MIN(date) as start_date,
      MAX(date) as end_date
    FROM weather_data 
    WHERE station_name = 'Bad Schandau' AND source LIKE 'excel_import_%'
    GROUP BY source
    ORDER BY source
  `);
  
  console.log('\n📋 Excel Import Summary:');
  excelResult.rows.forEach(row => {
    console.log(`   ${row.source}: ${row.records} records (${row.start_date} to ${row.end_date})`);
  });
  
  // Show latest records
  const latestResult = await pool.query(`
    SELECT date, hour, temp, humidity, pressure, source 
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
    ORDER BY date DESC, hour DESC 
    LIMIT 10
  `);
  
  console.log('\n🕐 Latest weather records:');
  latestResult.rows.forEach(row => {
    console.log(`   ${row.date} ${row.hour}:00 - ${row.temp}°C, ${row.humidity || 'N/A'}% humidity (${row.source})`);
  });
}

// Main execution
async function main() {
  try {
    await bulkImportWeatherData();
  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { bulkImportWeatherData };