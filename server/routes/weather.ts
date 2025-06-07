/**
 * Weather Data API Routes
 * 
 * Provides endpoints for weather data visualization and hourly access
 */

import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/weather/overview
 * Get overall weather data statistics
 */
router.get('/overview', async (req, res) => {
  try {
    const overviewQuery = sql`
      SELECT 
        COUNT(*) as "totalDataPoints",
        AVG(temperature) as "avgTemperature",
        SUM(precipitation) as "totalPrecipitation",
        COUNT(DISTINCT EXTRACT(YEAR FROM date)) as "yearsCovered"
      FROM weather_data
    `;
    
    const result = await db.execute(overviewQuery);
    const overview = result[0] || {};
    
    res.json({
      totalDataPoints: parseInt(overview.totalDataPoints || '0'),
      avgTemperature: parseFloat(overview.avgTemperature || '0'),
      totalPrecipitation: parseFloat(overview.totalPrecipitation || '0'),
      yearsCovered: parseInt(overview.yearsCovered || '0')
    });
  } catch (error) {
    console.error('Error fetching weather overview:', error);
    res.status(500).json({ error: 'Failed to fetch weather overview' });
  }
});

/**
 * GET /api/weather/yearly-stats
 * Get yearly weather statistics for a specific state
 */
router.get('/yearly-stats', async (req, res) => {
  try {
    const { state = 'SN' } = req.query;
    
    const statsQuery = sql`
      SELECT 
        EXTRACT(YEAR FROM date) as year,
        state,
        COUNT(*) as "dataPoints",
        AVG(temperature) as "avgTemperature",
        AVG(humidity) as "avgHumidity",
        SUM(precipitation) as "totalPrecipitation",
        (COUNT(*) * 100.0 / (365 * 24)) as coverage
      FROM weather_data
      WHERE state = ${state as string}
      GROUP BY EXTRACT(YEAR FROM date), state
      ORDER BY year
    `;
    
    const result = await db.execute(statsQuery);
    
    const stats = result.map(row => ({
      year: parseInt(row.year as string),
      state: row.state,
      dataPoints: parseInt(row.dataPoints as string),
      avgTemperature: parseFloat(row.avgTemperature as string || '0'),
      avgHumidity: parseFloat(row.avgHumidity as string || '0'),
      totalPrecipitation: parseFloat(row.totalPrecipitation as string || '0'),
      coverage: parseFloat(row.coverage as string || '0')
    }));
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching yearly weather stats:', error);
    res.status(500).json({ error: 'Failed to fetch yearly weather statistics' });
  }
});

/**
 * GET /api/weather/daily-coverage
 * Get daily weather data coverage for a specific state and year
 */
router.get('/daily-coverage', async (req, res) => {
  try {
    const { state = 'SN', year = new Date().getFullYear() } = req.query;
    
    const coverageQuery = sql`
      SELECT 
        date,
        COUNT(*) as "hourlyCount",
        (COUNT(*) * 1.0 / 24) as coverage
      FROM weather_data
      WHERE state = ${state as string}
        AND EXTRACT(YEAR FROM date) = ${parseInt(year as string)}
      GROUP BY date
      ORDER BY date
    `;
    
    const result = await db.execute(coverageQuery);
    
    const coverage = result.map(row => ({
      date: row.date,
      hourlyCount: parseInt(row.hourlyCount as string),
      coverage: parseFloat(row.coverage as string || '0')
    }));
    
    res.json(coverage);
  } catch (error) {
    console.error('Error fetching daily coverage:', error);
    res.status(500).json({ error: 'Failed to fetch daily weather coverage' });
  }
});

/**
 * GET /api/weather/hourly
 * Get hourly weather data for a specific state and date
 */
router.get('/hourly', async (req, res) => {
  try {
    const { state = 'SN', date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }
    
    const hourlyQuery = sql`
      SELECT 
        id,
        state,
        date,
        hour,
        temperature,
        humidity,
        pressure,
        wind_speed as "windSpeed",
        wind_direction as "windDirection",
        visibility,
        cloud_cover as "cloudCover",
        precipitation,
        conditions
      FROM weather_data
      WHERE state = ${state as string}
        AND date = ${date as string}
      ORDER BY hour
    `;
    
    const result = await db.execute(hourlyQuery);
    
    const hourlyData = result.map(row => ({
      id: row.id,
      state: row.state,
      date: row.date,
      hour: parseInt(row.hour as string || '0'),
      temperature: parseFloat(row.temperature as string || '0'),
      humidity: parseFloat(row.humidity as string || '0'),
      pressure: parseFloat(row.pressure as string || '0'),
      windSpeed: parseFloat(row.windSpeed as string || '0'),
      windDirection: parseFloat(row.windDirection as string || '0'),
      visibility: parseFloat(row.visibility as string || '0'),
      cloudCover: parseFloat(row.cloudCover as string || '0'),
      precipitation: parseFloat(row.precipitation as string || '0'),
      conditions: row.conditions || 'Unknown'
    }));
    
    res.json(hourlyData);
  } catch (error) {
    console.error('Error fetching hourly weather data:', error);
    res.status(500).json({ error: 'Failed to fetch hourly weather data' });
  }
});

export default router;