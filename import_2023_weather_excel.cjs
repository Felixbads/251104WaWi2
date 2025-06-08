/**
 * Import 2023 Weather Data from Excel
 * Imports weather data from the provided Excel file for Bad Schandau
 */

const XLSX = require('xlsx');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

console.log('2023 Weather Data Import - Bad Schandau');

async function connectToDatabase() {
  await client.connect();
  console.log('Database connected');
}

async function analyzeExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    
    console.log(`Excel file contains ${sheetNames.length} sheet(s):`);
    sheetNames.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });
    
    // Analyze the first sheet
    const firstSheet = workbook.Sheets[sheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    
    console.log(`\nFirst sheet "${sheetNames[0]}" contains ${data.length} rows`);
    
    if (data.length > 0) {
      console.log('\nFirst 5 rows:');
      data.slice(0, 5).forEach((row, index) => {
        console.log(`Row ${index + 1}:`, row);
      });
      
      // Show headers if they exist
      if (data[0]) {
        console.log('\nColumn headers (Row 1):', data[0]);
      }
    }
    
    return { workbook, sheetNames, data };
  } catch (error) {
    console.error('Error analyzing Excel file:', error.message);
    return null;
  }
}

async function processWeatherData(excelData) {
  const { workbook, sheetNames, data } = excelData;
  
  // Look for relevant sheets
  let weatherSheet = null;
  let weatherData = null;
  
  for (const sheetName of sheetNames) {
    if (sheetName.toLowerCase().includes('wetter') || 
        sheetName.toLowerCase().includes('weather') ||
        sheetName.toLowerCase().includes('2023')) {
      weatherSheet = workbook.Sheets[sheetName];
      weatherData = XLSX.utils.sheet_to_json(weatherSheet, { header: 1 });
      console.log(`\nUsing sheet: "${sheetName}" with ${weatherData.length} rows`);
      break;
    }
  }
  
  // If no specific weather sheet found, use the first sheet
  if (!weatherData) {
    weatherData = data;
    console.log('\nUsing first sheet for weather data');
  }
  
  if (weatherData.length < 2) {
    console.log('Not enough data rows found');
    return 0;
  }
  
  const headers = weatherData[0];
  console.log('\nDetected columns:', headers);
  
  // Find relevant column indices
  const columnMap = {};
  headers.forEach((header, index) => {
    const headerLower = header?.toString().toLowerCase() || '';
    
    if (headerLower.includes('datum') || headerLower.includes('date')) {
      columnMap.date = index;
    } else if (headerLower.includes('zeit') || headerLower.includes('time') || headerLower.includes('hour')) {
      columnMap.time = index;
    } else if (headerLower.includes('temp') && !headerLower.includes('max') && !headerLower.includes('min')) {
      columnMap.temperature = index;
    } else if (headerLower.includes('luftfeucht') || headerLower.includes('humidity')) {
      columnMap.humidity = index;
    } else if (headerLower.includes('druck') || headerLower.includes('pressure')) {
      columnMap.pressure = index;
    } else if (headerLower.includes('wind')) {
      columnMap.windSpeed = index;
    } else if (headerLower.includes('niederschlag') || headerLower.includes('rain') || headerLower.includes('precipitation')) {
      columnMap.precipitation = index;
    }
  });
  
  console.log('\nColumn mapping:', columnMap);
  
  if (!columnMap.date) {
    console.log('No date column found - cannot proceed');
    return 0;
  }
  
  let importedCount = 0;
  const dataRows = weatherData.slice(1); // Skip header row
  
  console.log(`\nProcessing ${dataRows.length} data rows...`);
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    
    if (!row || row.length === 0) continue;
    
    try {
      // Extract date
      let dateValue = row[columnMap.date];
      if (!dateValue) continue;
      
      // Handle different date formats
      let parsedDate;
      if (typeof dateValue === 'number') {
        // Excel date serial number
        parsedDate = XLSX.SSF.parse_date_code(dateValue);
        if (parsedDate) {
          dateValue = `${parsedDate.y}-${parsedDate.m.toString().padStart(2, '0')}-${parsedDate.d.toString().padStart(2, '0')}`;
        }
      } else if (typeof dateValue === 'string') {
        // Try to parse string date
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          dateValue = date.toISOString().split('T')[0];
        }
      }
      
      if (!dateValue || dateValue.toString().length < 8) continue;
      
      // Extract time/hour
      let hour = 12; // Default to noon if no time specified
      if (columnMap.time !== undefined && row[columnMap.time]) {
        const timeValue = row[columnMap.time];
        if (typeof timeValue === 'number') {
          hour = Math.floor(timeValue * 24);
        } else if (typeof timeValue === 'string') {
          const timeParts = timeValue.split(':');
          if (timeParts.length > 0) {
            hour = parseInt(timeParts[0]) || 12;
          }
        }
      }
      
      // Extract weather values
      const temperature = columnMap.temperature !== undefined ? parseFloat(row[columnMap.temperature]) : null;
      const humidity = columnMap.humidity !== undefined ? parseFloat(row[columnMap.humidity]) : null;
      const pressure = columnMap.pressure !== undefined ? parseFloat(row[columnMap.pressure]) : null;
      const windSpeed = columnMap.windSpeed !== undefined ? parseFloat(row[columnMap.windSpeed]) : null;
      const precipitation = columnMap.precipitation !== undefined ? parseFloat(row[columnMap.precipitation]) : null;
      
      // Skip rows without any valid weather data
      if (!temperature && !humidity && !pressure) continue;
      
      // Create timestamp
      const timestamp = new Date(`${dateValue}T${hour.toString().padStart(2, '0')}:00:00Z`);
      
      // Insert into database
      const insertQuery = `
        INSERT INTO weather_data (
          timestamp, date, hour, temp, feels_like, temp_min, temp_max, 
          pressure, humidity, wind_speed, wind_deg, wind_gust, clouds, 
          visibility, precipitation, rain_1h, snow_1h, weather_id, 
          weather_main, weather_description, weather_icon, source, 
          station_id, station_name, country, metadata, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        ON CONFLICT (date, hour, station_name) DO NOTHING
      `;
      
      await client.query(insertQuery, [
        timestamp,
        dateValue,
        hour,
        temperature || 0,
        temperature || 0, // feels_like = temp if not available
        temperature || 0, // temp_min = temp if not available
        temperature || 0, // temp_max = temp if not available
        pressure || 1013,
        humidity || 50,
        windSpeed || 0,
        0, // wind_deg
        0, // wind_gust
        50, // clouds (default)
        10000, // visibility (default)
        precipitation || 0,
        precipitation || 0, // rain_1h
        0, // snow_1h
        800, // weather_id (clear sky default)
        'Clear', // weather_main
        'clear sky', // weather_description
        '01d', // weather_icon
        'excel_import_2023',
        'bad_schandau',
        'Bad Schandau',
        'DE',
        JSON.stringify({ 
          excel_import: true, 
          row_number: i + 2,
          original_data: {
            temperature,
            humidity,
            pressure,
            windSpeed,
            precipitation
          }
        }),
        'completed'
      ]);
      
      importedCount++;
      
      if (importedCount % 100 === 0) {
        console.log(`Imported ${importedCount} records...`);
      }
      
    } catch (error) {
      console.log(`Error processing row ${i + 2}:`, error.message);
    }
  }
  
  return importedCount;
}

async function main() {
  try {
    await connectToDatabase();
    
    const filePath = 'attached_assets/export – Kopie_1749367157307.xlsx';
    console.log(`Analyzing Excel file: ${filePath}`);
    
    const excelData = await analyzeExcelFile(filePath);
    if (!excelData) {
      console.log('Failed to analyze Excel file');
      return;
    }
    
    const startTime = Date.now();
    const importedCount = await processWeatherData(excelData);
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`\n2023 Weather Data Import completed:`);
    console.log(`  Records imported: ${importedCount}`);
    console.log(`  Duration: ${duration}s`);
    
    // Show final statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records, 
        COUNT(DISTINCT date) as unique_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp) as avg_temp,
        source,
        COUNT(DISTINCT date) as days_count
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY total_records DESC
    `;
    
    const stats = await client.query(statsQuery);
    
    console.log('\nUpdated Database Summary:');
    let totalRecords = 0;
    let totalDays = 0;
    
    for (const row of stats.rows) {
      console.log(`${row.source}: ${row.total_records} records (${row.days_count} days)`);
      totalRecords += parseInt(row.total_records);
      totalDays += parseInt(row.days_count);
    }
    
    console.log(`\nOverall Total: ${totalRecords} records covering ${totalDays} unique days`);
    
    // Check 2023 specific coverage
    const coverage2023Query = `
      SELECT 
        COUNT(*) as records_2023,
        COUNT(DISTINCT date) as days_2023,
        MIN(date) as earliest_2023,
        MAX(date) as latest_2023
      FROM weather_data 
      WHERE station_name = 'Bad Schandau' 
      AND date >= '2023-01-01' 
      AND date <= '2023-12-31'
    `;
    
    const coverage2023 = await client.query(coverage2023Query);
    const data2023 = coverage2023.rows[0];
    
    console.log(`\n2023 Coverage: ${data2023.records_2023} records covering ${data2023.days_2023} days`);
    if (data2023.earliest_2023) {
      console.log(`2023 Range: ${data2023.earliest_2023} to ${data2023.latest_2023}`);
    }
    
  } catch (error) {
    console.error('Import failed:', error.message);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

main();