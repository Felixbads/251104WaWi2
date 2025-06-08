/**
 * Direct Weather Excel Import - Bad Schandau
 * Specifically imports weather data from the provided Excel files
 */

const XLSX = require('xlsx');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function connectDatabase() {
  await client.connect();
  console.log('Database connected');
}

async function importWeatherExcel(filePath, source) {
  console.log(`\nImporting weather data from: ${filePath}`);
  
  try {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${jsonData.length} rows of data`);
    
    if (jsonData.length === 0) return 0;
    
    // Show sample data structure
    console.log('Sample row:', Object.keys(jsonData[0]));
    
    let importedCount = 0;
    
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      
      try {
        // Extract date
        let date = null;
        let hour = 0;
        
        if (row.date) {
          const dateStr = row.date.toString();
          if (dateStr.includes('2025') || dateStr.includes('2024') || dateStr.includes('2023')) {
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate)) {
              date = parsedDate.toISOString().split('T')[0];
              hour = parsedDate.getHours();
            }
          }
        }
        
        // Skip if no valid date
        if (!date) continue;
        
        // Extract weather values with fallbacks
        const temp = parseFloat(row.tavg) || parseFloat(row.temp) || 0;
        const tempMin = parseFloat(row.tmin) || temp;
        const tempMax = parseFloat(row.tmax) || temp;
        const humidity = parseFloat(row.humidity) || 50;
        const pressure = parseFloat(row.pres) || parseFloat(row.pressure) || 1013;
        const windSpeed = parseFloat(row.wspd) || parseFloat(row.wind_speed) || 0;
        const windDir = parseFloat(row.wdir) || parseFloat(row.wind_dir) || 0;
        const precipitation = parseFloat(row.prcp) || parseFloat(row.rain) || 0;
        const snow = parseFloat(row.snow) || 0;
        
        const insertQuery = `
          INSERT INTO weather_data (
            timestamp, date, hour, temp, feels_like, temp_min, temp_max, 
            pressure, humidity, wind_speed, wind_deg, wind_gust, clouds, 
            visibility, precipitation, rain_1h, snow_1h, weather_id, 
            weather_main, weather_description, weather_icon, source, 
            station_id, station_name, country, metadata, sync_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
          ON CONFLICT (date, hour, station_name) DO UPDATE SET
            temp = EXCLUDED.temp,
            temp_min = EXCLUDED.temp_min,
            temp_max = EXCLUDED.temp_max,
            humidity = EXCLUDED.humidity,
            pressure = EXCLUDED.pressure,
            wind_speed = EXCLUDED.wind_speed,
            wind_deg = EXCLUDED.wind_deg,
            precipitation = EXCLUDED.precipitation,
            snow_1h = EXCLUDED.snow_1h,
            source = EXCLUDED.source,
            metadata = EXCLUDED.metadata
        `;
        
        const timestamp = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`);
        
        await client.query(insertQuery, [
          timestamp, date, hour,
          temp, temp, tempMin, tempMax,
          pressure, humidity,
          windSpeed, windDir, 0, 50, 10000,
          precipitation, precipitation, snow,
          800, 'Clear', 'clear sky', '01d',
          source,
          'bad_schandau', 'Bad Schandau', 'DE',
          JSON.stringify({ 
            excel_weather_import: true,
            tavg: temp,
            tmin: tempMin,
            tmax: tempMax,
            pressure: pressure,
            humidity: humidity,
            wind_speed: windSpeed,
            precipitation: precipitation,
            snow: snow,
            original_file: filePath
          }),
          'completed'
        ]);
        
        importedCount++;
        
      } catch (error) {
        console.log(`Row ${i}: ${error.message}`);
      }
    }
    
    return importedCount;
    
  } catch (error) {
    console.error(`Error importing ${filePath}: ${error.message}`);
    return 0;
  }
}

async function main() {
  try {
    await connectDatabase();
    
    const files = [
      { path: 'attached_assets/export – Kopie 2_1749368635633.xlsx', source: 'excel_weather_2025_1' },
      { path: 'attached_assets/export – Kopie 3_1749368635633.xlsx', source: 'excel_weather_2025_2' }
    ];
    
    let totalImported = 0;
    
    for (const file of files) {
      const imported = await importWeatherExcel(file.path, file.source);
      console.log(`Imported ${imported} records from ${file.path}`);
      totalImported += imported;
    }
    
    console.log(`\nTotal weather records imported: ${totalImported}`);
    
    // Final summary
    const stats = await client.query(`
      SELECT 
        source,
        COUNT(*) as records, 
        COUNT(DISTINCT date) as days,
        MIN(date) as earliest,
        MAX(date) as latest,
        AVG(temp)::NUMERIC(5,1) as avg_temp
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY records DESC
    `);
    
    console.log('\nBad Schandau Weather Database Summary:');
    let total = 0;
    let totalDays = 0;
    
    for (const row of stats.rows) {
      console.log(`${row.source}: ${row.records} records (${row.days} days) | ${row.earliest} to ${row.latest} | Avg: ${row.avg_temp}°C`);
      total += parseInt(row.records);
    }
    
    const overallStats = await client.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT date) as total_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp)::NUMERIC(5,1) as overall_avg_temp
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
    `);
    
    const overall = overallStats.rows[0];
    console.log(`\nOVERALL: ${overall.total_records} records | ${overall.total_days} unique days | ${overall.earliest_date} to ${overall.latest_date} | Avg: ${overall.overall_avg_temp}°C`);
    
  } catch (error) {
    console.error('Import failed:', error.message);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

main();