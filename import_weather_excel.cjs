const { Pool } = require('pg');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Import weather data from Excel files in attached_assets directory
 */
async function importWeatherExcelFiles() {
  console.log('🌤️ Importing weather data from Excel files...');
  
  const assetsDir = path.join(__dirname, 'attached_assets');
  const files = fs.readdirSync(assetsDir);
  
  // Filter for Excel files that contain weather data
  const excelFiles = files.filter(file => 
    file.includes('export') && (file.endsWith('.xlsx') || file.endsWith('.xls'))
  );
  
  console.log(`Found ${excelFiles.length} Excel files to process:`, excelFiles);
  
  let totalRecordsImported = 0;
  
  for (const fileName of excelFiles) {
    try {
      const filePath = path.join(assetsDir, fileName);
      console.log(`\n📊 Processing: ${fileName}`);
      
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet);
      console.log(`📋 Found ${data.length} rows in ${fileName}`);
      
      if (data.length === 0) continue;
      
      // Analyze the first few rows to understand the structure
      console.log('Sample data structure:', data.slice(0, 2));
      
      let recordsProcessed = 0;
      
      for (const row of data) {
        try {
          // Try to extract weather data from the row
          const weatherRecord = await parseWeatherRow(row, fileName);
          
          if (weatherRecord) {
            await insertWeatherRecord(weatherRecord);
            recordsProcessed++;
          }
        } catch (error) {
          console.log(`⚠️ Skipping row due to error:`, error.message);
        }
      }
      
      console.log(`✅ Imported ${recordsProcessed} records from ${fileName}`);
      totalRecordsImported += recordsProcessed;
      
    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error.message);
    }
  }
  
  console.log(`\n🎉 Total weather records imported: ${totalRecordsImported}`);
  
  // Verify the import
  await verifyImport();
}

/**
 * Parse a row from Excel and extract weather data
 */
async function parseWeatherRow(row, fileName) {
  // Look for common weather data fields
  const keys = Object.keys(row);
  
  // Try to find date/time fields
  let date = null;
  let hour = 12; // Default to noon if no hour specified
  
  // Look for date fields
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('date') || lowerKey.includes('datum') || lowerKey.includes('time') || lowerKey.includes('zeit')) {
      const dateValue = row[key];
      if (dateValue) {
        date = parseDate(dateValue);
        break;
      }
    }
  }
  
  // If no date found, skip this row
  if (!date) return null;
  
  // Extract temperature (tavg = average temperature)
  let temp = null;
  if (row.tavg !== undefined) {
    temp = parseFloat(row.tavg);
  } else {
    // Fallback to other temperature fields
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('temp') || lowerKey.includes('temperatur')) {
        temp = parseFloat(row[key]);
        if (!isNaN(temp)) break;
      }
    }
  }
  
  // Extract humidity (not present in this data format, set default)
  let humidity = null;
  if (row.humidity !== undefined) {
    humidity = parseFloat(row.humidity);
  }
  
  // Extract pressure (pres = pressure)
  let pressure = null;
  if (row.pres !== undefined) {
    pressure = parseFloat(row.pres);
  } else {
    // Fallback to other pressure fields
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('press') || lowerKey.includes('druck') || lowerKey.includes('hpa')) {
        pressure = parseFloat(row[key]);
        if (!isNaN(pressure)) break;
      }
    }
  }
  
  // Extract precipitation (prcp = precipitation)
  let precipitation = null;
  if (row.prcp !== undefined) {
    precipitation = parseFloat(row.prcp);
  } else {
    // Fallback to other precipitation fields
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('precip') || lowerKey.includes('rain') || lowerKey.includes('nieder') || lowerKey.includes('regen')) {
        precipitation = parseFloat(row[key]);
        if (!isNaN(precipitation)) break;
      }
    }
  }
  
  // Extract wind speed (wspd = wind speed)
  let windSpeed = null;
  if (row.wspd !== undefined) {
    windSpeed = parseFloat(row.wspd);
  } else {
    // Fallback to other wind fields
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('wind') || lowerKey.includes('speed')) {
        windSpeed = parseFloat(row[key]);
        if (!isNaN(windSpeed)) break;
      }
    }
  }
  
  // Return weather record if we have at least date and temperature
  if (date && temp !== null) {
    // Create timestamp from date and hour
    const timestamp = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`);
    
    return {
      timestamp: timestamp.toISOString(),
      station_name: 'Bad Schandau',
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
  
  return null;
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
 * Insert weather record into database
 */
async function insertWeatherRecord(record) {
  const query = `
    INSERT INTO weather_data (
      timestamp, station_name, date, hour, temp, humidity, pressure, 
      precipitation, wind_speed, source, sync_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (date, hour, station_id) 
    DO UPDATE SET 
      timestamp = EXCLUDED.timestamp,
      temp = EXCLUDED.temp,
      humidity = EXCLUDED.humidity,
      pressure = EXCLUDED.pressure,
      precipitation = EXCLUDED.precipitation,
      wind_speed = EXCLUDED.wind_speed,
      source = EXCLUDED.source,
      sync_status = EXCLUDED.sync_status
  `;
  
  await pool.query(query, [
    record.timestamp,
    record.station_name,
    record.date,
    record.hour,
    record.temp,
    record.humidity,
    record.pressure,
    record.precipitation,
    record.wind_speed,
    record.source,
    record.sync_status
  ]);
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
  
  // Show latest records
  const latestResult = await pool.query(`
    SELECT date, hour, temp, humidity, pressure, source 
    FROM weather_data 
    WHERE station_name = 'Bad Schandau'
    ORDER BY date DESC, hour DESC 
    LIMIT 5
  `);
  
  console.log('\n🕐 Latest weather records:');
  latestResult.rows.forEach(row => {
    console.log(`   ${row.date} ${row.hour}:00 - ${row.temp}°C, ${row.humidity}% humidity (${row.source})`);
  });
}

// Main execution
async function main() {
  try {
    await importWeatherExcelFiles();
  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { importWeatherExcelFiles };