/**
 * Weather Data API Routes
 * 
 * Provides comprehensive weather data management for Bad Schandau station:
 * - Import historical data from MeteoStat API 
 * - Coverage statistics and data quality reports
 * - Real-time import status monitoring
 */

import { Router } from 'express';
import { z } from 'zod';
import { meteostatService } from '../services/meteostatService.js';
import { db } from '../db.js';
import { weatherData } from '@shared/schema';
import { desc, eq, and, gte, lte, sql } from 'drizzle-orm';

const router = Router();

// Schema for import requests
const importRequestSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  fillMissingOnly: z.boolean().default(false),
  batchSize: z.number().min(1).max(100).default(30)
});

// Schema for coverage requests
const coverageRequestSchema = z.object({
  year: z.number().optional(),
  detailed: z.boolean().default(false)
});

/**
 * POST /api/weather/import
 * Import historical weather data from MeteoStat
 */
router.post('/import', async (req, res) => {
  try {
    const body = importRequestSchema.parse(req.body);
    
    console.log('Starting MeteoStat weather import for Bad Schandau:', body);
    
    let result;
    if (body.startDate && body.endDate) {
      // Import specific date range
      result = await meteostatService.importDateRange(body.startDate, body.endDate);
    } else {
      // Import complete historical data with options
      result = await meteostatService.importCompleteHistoricalData({
        startYear: 2022,
        endYear: new Date().getFullYear(),
        fillMissingOnly: body.fillMissingOnly,
        batchSizeDays: body.batchSize,
        progressCallback: (progress) => {
          console.log(`Import progress: ${progress.processedDays}/${progress.totalDays} days`);
        }
      });
    }
    
    res.json({
      success: true,
      recordsImported: result,
      message: `Successfully imported ${result} weather records for Bad Schandau`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Weather import error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Import failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/weather/import/today
 * Import today's weather data for real-time updates
 */
router.post('/import/today', async (req, res) => {
  try {
    console.log('Importing today\'s weather data for Bad Schandau');
    
    const result = await meteostatService.importTodayData();
    
    res.json({
      success: true,
      recordsImported: result,
      message: `Successfully imported ${result} hourly records for today`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Today weather import error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Today import failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/weather/coverage
 * Get comprehensive data coverage statistics
 */
router.get('/coverage', async (req, res) => {
  try {
    const query = coverageRequestSchema.parse(req.query);
    
    console.log('Getting weather data coverage for Bad Schandau:', query);
    
    const coverage = await meteostatService.getDataCoverage();
    
    res.json({
      success: true,
      coverage,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Coverage check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Coverage check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/weather/stats
 * Get basic weather data statistics
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('Getting weather data statistics');
    
    // Get total record count
    const totalResult = await db.select({ 
      count: sql<number>`COUNT(*)` 
    }).from(weatherData);
    const totalRecords = totalResult[0]?.count || 0;
    
    // Get date range
    const rangeResult = await db.select({
      minDate: sql<string>`MIN(date)`,
      maxDate: sql<string>`MAX(date)`
    }).from(weatherData);
    const range = rangeResult[0];
    
    // Get latest records
    const latestRecords = await db.select()
      .from(weatherData)
      .orderBy(desc(weatherData.date), desc(weatherData.hour))
      .limit(5);
    
    res.json({
      success: true,
      stats: {
        totalRecords,
        dateRange: {
          start: range?.minDate || null,
          end: range?.maxDate || null
        },
        latestRecords: latestRecords.map(record => ({
          date: record.date,
          hour: record.hour,
          temp: record.temp,
          humidity: record.humidity,
          precipitation: record.precipitation
        }))
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Weather stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Stats retrieval failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/weather/data
 * Get weather data for specific date range
 */
router.get('/data', async (req, res) => {
  try {
    const { startDate, endDate, limit = '100' } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }
    
    console.log(`Getting weather data from ${startDate} to ${endDate}`);
    
    const records = await db.select()
      .from(weatherData)
      .where(
        and(
          gte(weatherData.date, startDate as string),
          lte(weatherData.date, endDate as string)
        )
      )
      .orderBy(desc(weatherData.date), desc(weatherData.hour))
      .limit(parseInt(limit as string));
    
    res.json({
      success: true,
      data: records,
      count: records.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Weather data retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Data retrieval failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/weather/fill-missing
 * Fill missing data for specific months/years
 */
router.post('/fill-missing', async (req, res) => {
  try {
    const { year, months } = req.body;
    
    if (!year || !Array.isArray(months)) {
      return res.status(400).json({
        success: false,
        error: 'year (number) and months (array) are required'
      });
    }
    
    console.log(`Filling missing weather data for ${year}, months: ${months.join(', ')}`);
    
    const result = await meteostatService.fillMissingMonths(year, months);
    
    res.json({
      success: true,
      recordsImported: result,
      message: `Successfully filled ${result} missing records for ${year}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Fill missing data error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Fill missing failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/weather/overview
 * Get overall weather data statistics and overview
 */
router.get('/overview', async (req, res) => {
  try {
    console.log('Getting weather data overview');
    
    // Get comprehensive statistics
    const overviewData = await db.select({
      totalDataPoints: sql<number>`COUNT(*)`,
      avgTemperature: sql<number>`AVG(temp)`,
      totalPrecipitation: sql<number>`SUM(precipitation)`,
      minDate: sql<string>`MIN(date)`,
      maxDate: sql<string>`MAX(date)`,
      uniqueDays: sql<number>`COUNT(DISTINCT date)`
    }).from(weatherData);
    
    const overview = overviewData[0];
    
    // Calculate years covered
    let yearsCovered = 0;
    if (overview.minDate && overview.maxDate) {
      const startYear = new Date(overview.minDate).getFullYear();
      const endYear = new Date(overview.maxDate).getFullYear();
      yearsCovered = endYear - startYear + 1;
    }
    
    res.json({
      success: true,
      totalDataPoints: overview.totalDataPoints || 0,
      avgTemperature: overview.avgTemperature || null,
      totalPrecipitation: overview.totalPrecipitation || null,
      yearsCovered,
      earliestDate: overview.minDate,
      latestDate: overview.maxDate,
      uniqueDays: overview.uniqueDays || 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Weather overview error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Overview retrieval failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/weather/yearly-stats/:state
 * Get yearly statistics for a specific state (for Bad Schandau, state will be 'SN')
 */
router.get('/yearly-stats/:state', async (req, res) => {
  try {
    const { state } = req.params;
    console.log(`Getting yearly weather stats for state: ${state}`);
    
    // For Bad Schandau (Saxony), get yearly aggregated data
    const yearlyStats = await db.select({
      year: sql<number>`EXTRACT(YEAR FROM date::date)`,
      dataPoints: sql<number>`COUNT(*)`,
      avgTemperature: sql<number>`AVG(temp)`,
      avgHumidity: sql<number>`AVG(humidity)`,
      totalPrecipitation: sql<number>`SUM(precipitation)`,
      coverage: sql<number>`COUNT(DISTINCT date) * 100.0 / 365`
    })
    .from(weatherData)
    .where(eq(weatherData.station_name, 'Bad Schandau'))
    .groupBy(sql`EXTRACT(YEAR FROM date::date)`)
    .orderBy(sql`EXTRACT(YEAR FROM date::date)`);
    
    res.json(yearlyStats.map(stat => ({
      ...stat,
      state: 'SN'
    })));
    
  } catch (error) {
    console.error('Yearly stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Yearly stats retrieval failed'
    });
  }
});

/**
 * GET /api/weather/daily-coverage/:state/:year
 * Get daily data coverage for a specific state and year
 */
router.get('/daily-coverage/:state/:year', async (req, res) => {
  try {
    const { state, year } = req.params;
    console.log(`Getting daily coverage for ${state} in ${year}`);
    
    const dailyCoverage = await db.select({
      date: weatherData.date,
      dataPoints: sql<number>`COUNT(*)`,
      coverage: sql<number>`COUNT(*) * 1.0 / 24` // Assuming 24 hourly readings per day
    })
    .from(weatherData)
    .where(
      and(
        eq(weatherData.station_name, 'Bad Schandau'),
        sql`EXTRACT(YEAR FROM date::date) = ${parseInt(year)}`
      )
    )
    .groupBy(weatherData.date)
    .orderBy(weatherData.date);
    
    res.json(dailyCoverage);
    
  } catch (error) {
    console.error('Daily coverage error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Daily coverage retrieval failed'
    });
  }
});

/**
 * GET /api/weather/hourly/:state/:date
 * Get hourly weather data for a specific state and date
 */
router.get('/hourly/:state/:date', async (req, res) => {
  try {
    const { state, date } = req.params;
    console.log(`Getting hourly data for ${state} on ${date}`);
    
    const hourlyData = await db.select()
      .from(weatherData)
      .where(
        and(
          eq(weatherData.station_name, 'Bad Schandau'),
          eq(weatherData.date, date)
        )
      )
      .orderBy(weatherData.hour);
    
    res.json(hourlyData);
    
  } catch (error) {
    console.error('Hourly data error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Hourly data retrieval failed'
    });
  }
});

export default router;