import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// Get all Bad Schandau weather data
router.get('/bad-schandau-data', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        date,
        hour,
        temp,
        temp_min,
        temp_max,
        precipitation,
        rain_1h,
        snow_1h,
        humidity,
        pressure,
        wind_speed,
        clouds,
        weather_main,
        weather_description,
        source,
        sync_status
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      ORDER BY date ASC, hour ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching Bad Schandau weather data:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// Get daily aggregated weather data for visualization
router.get('/daily-aggregated', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        date,
        COUNT(*) as record_count,
        AVG(temp)::NUMERIC(5,1) as avg_temp,
        MIN(temp)::NUMERIC(5,1) as min_temp,
        MAX(temp)::NUMERIC(5,1) as max_temp,
        SUM(precipitation)::NUMERIC(6,2) as total_precipitation,
        AVG(humidity)::NUMERIC(5,1) as avg_humidity,
        AVG(pressure)::NUMERIC(6,1) as avg_pressure,
        AVG(wind_speed)::NUMERIC(5,1) as avg_wind_speed,
        AVG(clouds)::NUMERIC(5,1) as avg_clouds,
        -- Calculate sunshine hours from cloud cover (100% - avg_clouds)/100 * daylight_hours
        CASE 
          WHEN AVG(clouds) IS NOT NULL THEN 
            GREATEST(0, ((100 - AVG(clouds)) / 100.0) * 12)::NUMERIC(4,1)
          ELSE 0 
        END as sunshine_hours
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY date
      ORDER BY date ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching daily aggregated weather data:', error);
    res.status(500).json({ error: 'Failed to fetch aggregated weather data' });
  }
});

// Get weather data overview statistics
router.get('/overview', async (req, res) => {
  try {
    const overviewResult = await pool.query(`
      SELECT 
        COUNT(*) as total_data_points,
        COUNT(DISTINCT date) as unique_days,
        COUNT(DISTINCT EXTRACT(YEAR FROM date::date)) as years_covered,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        AVG(temp)::NUMERIC(5,1) as overall_avg_temp,
        MIN(temp)::NUMERIC(5,1) as overall_min_temp,
        MAX(temp)::NUMERIC(5,1) as overall_max_temp,
        SUM(precipitation)::NUMERIC(6,2) as total_precipitation
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
    `);

    const sourceBreakdown = await pool.query(`
      SELECT 
        source,
        COUNT(*) as records,
        COUNT(DISTINCT date) as days,
        AVG(temp)::NUMERIC(5,1) as avg_temp
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY source
      ORDER BY records DESC
    `);

    res.json({
      success: true,
      overview: overviewResult.rows[0],
      sources: sourceBreakdown.rows
    });
  } catch (error) {
    console.error('Error fetching weather overview:', error);
    res.status(500).json({ error: 'Failed to fetch weather overview' });
  }
});

// Get yearly statistics
router.get('/yearly-stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        EXTRACT(YEAR FROM date::date) as year,
        COUNT(*) as records,
        COUNT(DISTINCT date) as days,
        AVG(temp)::NUMERIC(5,1) as avg_temp,
        MIN(temp)::NUMERIC(5,1) as min_temp,
        MAX(temp)::NUMERIC(5,1) as max_temp,
        SUM(precipitation)::NUMERIC(6,2) as total_precipitation
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
      GROUP BY EXTRACT(YEAR FROM date::date)
      ORDER BY year
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching yearly weather stats:', error);
    res.status(500).json({ error: 'Failed to fetch yearly stats' });
  }
});

// Get daily coverage for specific date range
router.get('/daily-coverage', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        date,
        COUNT(*) as hourly_records,
        AVG(temp)::NUMERIC(5,1) as avg_temp,
        SUM(precipitation)::NUMERIC(6,2) as total_precipitation,
        source
      FROM weather_data 
      WHERE station_name = 'Bad Schandau'
    `;
    
    const params = [];
    if (startDate) {
      params.push(startDate);
      query += ` AND date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND date <= $${params.length}`;
    }
    
    query += ` GROUP BY date, source ORDER BY date DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching daily coverage:', error);
    res.status(500).json({ error: 'Failed to fetch daily coverage' });
  }
});

// Get hourly data for specific date
router.get('/hourly/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    const result = await pool.query(`
      SELECT 
        hour,
        temp,
        feels_like,
        humidity,
        pressure,
        wind_speed,
        precipitation,
        weather_main,
        weather_description,
        clouds,
        source
      FROM weather_data 
      WHERE station_name = 'Bad Schandau' AND date = $1
      ORDER BY hour ASC
    `, [date]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching hourly weather data:', error);
    res.status(500).json({ error: 'Failed to fetch hourly data' });
  }
});

export default router;