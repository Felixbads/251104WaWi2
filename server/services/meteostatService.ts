/**
 * MeteoStat Weather Data Service
 * 
 * Imports comprehensive hourly weather data for Dresden from MeteoStat API
 * Covers every year, every day, and every hour since 2022
 * 
 * MeteoStat provides free historical weather data with excellent coverage
 * Dresden Station ID: 10488 (Dresden-Klotzsche)
 */

import { db } from '../db.js';
import { weatherData, insertWeatherDataSchema } from '@shared/schema';
import { eq, and, between, gte, lte, sql } from 'drizzle-orm';
import { format, parseISO, addHours, startOfYear, endOfYear, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
import axios from 'axios';

// Bad Schandau weather station configuration (closest official station)
const BAD_SCHANDAU_STATION = {
  id: '10488', // Dresden-Klotzsche (beste verfügbare Station für Sächsische Schweiz)
  name: 'Bad Schandau',
  lat: 50.9167,
  lon: 14.1500
};

const METEOSTAT_API_BASE = 'https://meteostat.p.rapidapi.com';
const METEOSTAT_API_KEY = process.env.METEOSTAT_API_KEY || process.env.RAPIDAPI_KEY;

interface MeteostatHourlyData {
  time: string;
  temp: number;
  dwpt?: number;
  rhum?: number;
  prcp?: number;
  snow?: number;
  wdir?: number;
  wspd?: number;
  wpgt?: number;
  pres?: number;
  tsun?: number;
  coco?: number;
}

interface ImportProgress {
  totalDays: number;
  processedDays: number;
  totalRecords: number;
  errors: string[];
  startDate: string;
  endDate: string;
}

export class MeteostatService {

  /**
   * Import complete historical weather data for Dresden
   */
  async importCompleteHistoricalData(options: {
    startYear?: number;
    endYear?: number;
    batchSize?: number;
  }): Promise<ImportProgress> {
    const startYear = options.startYear || 2022;
    const endYear = options.endYear || new Date().getFullYear();
    const batchSize = options.batchSize || 7; // Process 7 days at a time
    
    console.log(`Starting complete weather data import for Dresden: ${startYear}-${endYear}`);
    
    const progress: ImportProgress = {
      totalDays: 0,
      processedDays: 0,
      totalRecords: 0,
      errors: [],
      startDate: `${startYear}-01-01`,
      endDate: `${endYear}-12-31`
    };

    try {
      // Generate all days to process
      const allDays = [];
      for (let year = startYear; year <= endYear; year++) {
        const yearStart = startOfYear(new Date(year, 0, 1));
        const yearEnd = year === new Date().getFullYear() 
          ? new Date() // Only up to today for current year
          : endOfYear(new Date(year, 0, 1));
        
        const yearDays = eachDayOfInterval({ start: yearStart, end: yearEnd });
        allDays.push(...yearDays);
      }
      
      progress.totalDays = allDays.length;
      console.log(`Total days to process: ${progress.totalDays}`);

      // Process in batches
      for (let i = 0; i < allDays.length; i += batchSize) {
        const batch = allDays.slice(i, i + batchSize);
        const batchStart = format(batch[0], 'yyyy-MM-dd');
        const batchEnd = format(batch[batch.length - 1], 'yyyy-MM-dd');
        
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allDays.length/batchSize)}: ${batchStart} to ${batchEnd}`);
        
        try {
          const batchRecords = await this.importDateRange(batchStart, batchEnd);
          progress.totalRecords += batchRecords;
          progress.processedDays += batch.length;
          
          // Add delay to respect API rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          const errorMsg = `Batch ${batchStart}-${batchEnd} failed: ${error}`;
          console.error(errorMsg);
          progress.errors.push(errorMsg);
        }
      }

      console.log(`Import completed. Total records: ${progress.totalRecords}, Errors: ${progress.errors.length}`);
      return progress;

    } catch (error) {
      console.error('Failed to import historical weather data:', error);
      progress.errors.push(`Global error: ${error}`);
      return progress;
    }
  }

  /**
   * Import weather data for a specific date range
   */
  async importDateRange(startDate: string, endDate: string): Promise<number> {
    if (!METEOSTAT_API_KEY) {
      throw new Error('MeteoStat API key not configured. Please set METEOSTAT_API_KEY or RAPIDAPI_KEY environment variable.');
    }

    try {
      const response = await axios.get(`${METEOSTAT_API_BASE}/stations/hourly`, {
        params: {
          station: BAD_SCHANDAU_STATION.id,
          start: startDate,
          end: endDate
        },
        headers: {
          'X-RapidAPI-Key': METEOSTAT_API_KEY,
          'X-RapidAPI-Host': 'meteostat.p.rapidapi.com'
        },
        timeout: 30000
      });

      if (!response.data || !response.data.data) {
        console.warn(`No data returned for ${startDate} to ${endDate}`);
        return 0;
      }

      const hourlyData: MeteostatHourlyData[] = response.data.data;
      console.log(`Retrieved ${hourlyData.length} hourly records for ${startDate} to ${endDate}`);

      let insertedCount = 0;
      const batchInserts = [];

      for (const hourData of hourlyData) {
        try {
          const dateTime = parseISO(hourData.time);
          if (!dateTime || isNaN(dateTime.getTime())) {
            continue;
          }

          const weatherRecord = {
            timestamp: dateTime,
            date: format(dateTime, 'yyyy-MM-dd'),
            hour: dateTime.getHours(),
            temp: hourData.temp || null,
            humidity: Math.round(hourData.rhum || 0),
            pressure: Math.round(hourData.pres || 0),
            wind_speed: hourData.wspd || null,
            wind_deg: Math.round(hourData.wdir || 0),
            clouds: Math.round(hourData.coco || 0),
            visibility: 10000,
            precipitation: hourData.prcp || null,
            station_name: BAD_SCHANDAU_STATION.name,
            created_at: new Date(),
            updated_at: new Date()
          };

          // Validate with schema
          const validatedRecord = insertWeatherDataSchema.parse(weatherRecord);
          batchInserts.push(validatedRecord);

        } catch (validationError) {
          console.warn(`Validation failed for record ${hourData.time}:`, validationError);
        }
      }

      // Batch insert to database
      if (batchInserts.length > 0) {
        try {
          await db.insert(weatherData)
            .values(batchInserts)
            .onConflictDoUpdate({
              target: [weatherData.date, weatherData.hour, weatherData.station_name],
              set: {
                temp: weatherData.temp,
                humidity: weatherData.humidity,
                pressure: weatherData.pressure,
                wind_speed: weatherData.wind_speed,
                wind_deg: weatherData.wind_deg,
                precipitation: weatherData.precipitation,
                clouds: weatherData.clouds,
                updated_at: new Date()
              }
            });
          
          insertedCount = batchInserts.length;
          console.log(`Successfully inserted/updated ${insertedCount} weather records`);
          
        } catch (dbError) {
          console.error('Database insertion failed:', dbError);
          throw dbError;
        }
      }

      return insertedCount;

    } catch (error) {
      console.error(`Failed to fetch weather data for ${startDate} to ${endDate}:`, error);
      throw error;
    }
  }

  /**
   * Import weather data for today (for real-time updates)
   */
  async importTodayData(): Promise<number> {
    const today = format(new Date(), 'yyyy-MM-dd');
    return this.importDateRange(today, today);
  }

  /**
   * Import missing data for specific months
   */
  async fillMissingMonths(year: number, months: number[]): Promise<number> {
    let totalRecords = 0;
    
    for (const month of months) {
      const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
      const monthEnd = format(new Date(year, month, 0), 'yyyy-MM-dd'); // Last day of month
      
      console.log(`Filling missing data for ${year}-${month.toString().padStart(2, '0')}`);
      
      try {
        const records = await this.importDateRange(monthStart, monthEnd);
        totalRecords += records;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Failed to fill ${year}-${month}:`, error);
      }
    }
    
    return totalRecords;
  }

  /**
   * Get data coverage statistics
   */
  async getDataCoverage(): Promise<{
    totalRecords: number;
    dateRange: { start: string; end: string };
    yearCoverage: { year: number; records: number; percentage: number }[];
    missingDays: string[];
  }> {
    try {
      // Get total records
      const totalResult = await db.select({ 
        count: sql<number>`COUNT(*)` 
      }).from(weatherData)
        .where(eq(weatherData.station_name, BAD_SCHANDAU_STATION.name));
      const totalRecords = totalResult[0]?.count || 0;

      // Get date range
      const rangeResult = await db.select({
        startDate: sql<string>`MIN(date)`,
        endDate: sql<string>`MAX(date)`
      }).from(weatherData)
        .where(eq(weatherData.station_name, BAD_SCHANDAU_STATION.name));
      const range = rangeResult[0];
      
      // Get yearly coverage using raw SQL for complex aggregation
      const yearlyResult = await db.execute(sql`
        SELECT 
          EXTRACT(YEAR FROM date) as year,
          COUNT(*) as records,
          ROUND(COUNT(*) / 8760.0 * 100, 2) as percentage
        FROM weather_data 
        WHERE station_name = ${BAD_SCHANDAU_STATION.name}
        GROUP BY EXTRACT(YEAR FROM date)
        ORDER BY year
      `);
      
      const yearCoverage = (yearlyResult.rows || yearlyResult).map((row: any) => ({
        year: parseInt(row.year),
        records: parseInt(row.records),
        percentage: parseFloat(row.percentage)
      }));

      return {
        totalRecords,
        dateRange: {
          start: range?.startDate || '',
          end: range?.endDate || ''
        },
        yearCoverage,
        missingDays: [] // Could implement gap detection here
      };

    } catch (error) {
      console.error('Failed to get coverage statistics:', error);
      throw error;
    }
  }
}

export const meteostatService = new MeteostatService();