/**
 * Enhanced Forecast API Routes
 * 
 * Provides endpoints for advanced forecasting with transparent explanations,
 * stockout compensation, and weather/holiday integration
 */

import express from 'express';
import { z } from 'zod';
import { eq, and, between, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { machines, locations, forecastModels, forecasts } from '@shared/schema';
import * as enhancedForecastService from '../services/enhancedForecastService';

const router = express.Router();

// Validation schemas
const createForecastSchema = z.object({
  machineId: z.number().int().positive(),
  productId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  state: z.string().optional().default('SN')
});

const dashboardSchema = z.object({
  warehouseId: z.number().int().positive().optional(),
  dateRange: z.number().int().min(1).max(30).optional().default(7)
});

const stockoutAnalysisSchema = z.object({
  machineId: z.number().int().positive(),
  productId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const locationProfileSchema = z.object({
  locationId: z.number().int().positive()
});

/**
 * POST /api/enhanced-forecast
 * Creates an enhanced forecast with detailed explanations
 */
router.post('/', async (req, res) => {
  try {
    const validatedData = createForecastSchema.parse(req.body);
    
    const result = await enhancedForecastService.createEnhancedForecast(
      validatedData.machineId,
      validatedData.productId,
      validatedData.startDate,
      validatedData.endDate,
      validatedData.state
    );

    // Save to database if we have a model
    try {
      const defaultModel = await db.query.forecastModels.findFirst({
        where: eq(forecastModels.status, 'ready'),
        orderBy: desc(forecastModels.created_at)
      });

      if (defaultModel) {
        await enhancedForecastService.saveEnhancedForecast(defaultModel.id, result);
      }
    } catch (saveError) {
      console.warn('Could not save forecast to database:', saveError);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating enhanced forecast:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Erstellen der Prognose'
    });
  }
});

/**
 * GET /api/enhanced-forecast/dashboard
 * Gets comprehensive forecast dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const validatedData = dashboardSchema.parse(req.query);
    
    const result = await enhancedForecastService.getForecastDashboard(
      validatedData.warehouseId,
      validatedData.dateRange
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting forecast dashboard:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Laden des Dashboards'
    });
  }
});

/**
 * POST /api/enhanced-forecast/stockout-analysis
 * Analyzes stockout patterns for demand loss calculation
 */
router.post('/stockout-analysis', async (req, res) => {
  try {
    const validatedData = stockoutAnalysisSchema.parse(req.body);
    
    const result = await enhancedForecastService.analyzeStockoutPatterns(
      validatedData.machineId,
      validatedData.productId,
      validatedData.startDate,
      validatedData.endDate
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error analyzing stockout patterns:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler bei der Ausverkauf-Analyse'
    });
  }
});

/**
 * GET /api/enhanced-forecast/location-profile/:locationId
 * Gets location profile with weather and holiday sensitivity
 */
router.get('/location-profile/:locationId', async (req, res) => {
  try {
    const locationId = parseInt(req.params.locationId);
    if (isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültige Standort-ID'
      });
    }
    
    const result = await enhancedForecastService.getLocationProfile(locationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting location profile:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Laden des Standortprofils'
    });
  }
});

/**
 * GET /api/enhanced-forecast/weather-impact/:date
 * Gets weather impact factor for a specific date
 */
router.get('/weather-impact/:date', async (req, res) => {
  try {
    const date = req.params.date;
    const locationId = parseInt(req.query.locationId as string);
    
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiges Datumsformat (YYYY-MM-DD erwartet)'
      });
    }

    if (isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        message: 'Standort-ID erforderlich'
      });
    }

    const locationProfile = await enhancedForecastService.getLocationProfile(locationId);
    const result = await enhancedForecastService.getWeatherImpactFactor(date, locationProfile);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting weather impact:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Berechnen des Wettereinflusses'
    });
  }
});

/**
 * GET /api/enhanced-forecast/holiday-impact/:date
 * Gets holiday impact factor for a specific date
 */
router.get('/holiday-impact/:date', async (req, res) => {
  try {
    const date = req.params.date;
    const locationId = parseInt(req.query.locationId as string);
    const state = (req.query.state as string) || 'SN';
    
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültiges Datumsformat (YYYY-MM-DD erwartet)'
      });
    }

    if (isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        message: 'Standort-ID erforderlich'
      });
    }

    const locationProfile = await enhancedForecastService.getLocationProfile(locationId);
    const result = await enhancedForecastService.getHolidayImpactFactor(date, locationProfile, state);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting holiday impact:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Berechnen des Feiertagseinflusses'
    });
  }
});

/**
 * GET /api/enhanced-forecast/machines-with-forecasts
 * Gets list of machines with recent forecast data
 */
router.get('/machines-with-forecasts', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT 
        m.id,
        m.name as machine_name,
        m.location_id,
        l.name as location_name,
        COUNT(f.id) as forecast_count,
        MAX(f.created_at) as latest_forecast
      FROM machines m
      LEFT JOIN locations l ON m.location_id = l.id
      LEFT JOIN forecasts f ON m.id = f.machine_id 
        AND f.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY m.id, m.name, m.location_id, l.name
      ORDER BY forecast_count DESC, m.name
    `;

    const result = await db.execute(sql.raw(query));

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting machines with forecasts:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Maschinen mit Prognosen'
    });
  }
});

/**
 * GET /api/enhanced-forecast/recent/:machineId
 * Gets recent forecasts for a specific machine with explanations
 */
router.get('/recent/:machineId', async (req, res) => {
  try {
    const machineId = parseInt(req.params.machineId);
    const days = parseInt(req.query.days as string) || 7;
    
    if (isNaN(machineId)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültige Maschinen-ID'
      });
    }

    const query = `
      SELECT 
        f.*,
        m.name as machine_name,
        l.name as location_name
      FROM forecasts f
      JOIN machines m ON f.machine_id = m.id
      LEFT JOIN locations l ON f.location_id = l.id
      WHERE f.machine_id = $1
        AND f.forecast_date >= CURRENT_DATE
        AND f.forecast_date <= CURRENT_DATE + INTERVAL '${days} days'
      ORDER BY f.forecast_date, f.product_id
    `;

    const result = await db.execute(sql.raw(query, [machineId]));
    
    // Parse features JSON for each forecast
    const forecasts = result.rows.map(row => ({
      ...row,
      features: row.features ? JSON.parse(row.features) : null
    }));

    res.json({
      success: true,
      data: forecasts
    });
  } catch (error) {
    console.error('Error getting recent forecasts:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der aktuellen Prognosen'
    });
  }
});

export default router;