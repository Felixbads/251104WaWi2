/**
 * Simplified Enhanced Forecast API Routes
 */

import express from 'express';
import { z } from 'zod';
import * as simplifiedEnhancedForecast from '../services/simplifiedEnhancedForecast';

const router = express.Router();

// Validation schemas
const machineProductSchema = z.object({
  machineId: z.number().int().positive(),
  productName: z.string().min(1),
  days: z.number().int().min(1).max(30).optional().default(7)
});

const dashboardSchema = z.object({
  warehouseId: z.number().int().positive().optional()
});

/**
 * POST /api/simplified-enhanced-forecast
 * Creates enhanced forecast with explanations for a specific machine and product
 */
router.post('/', async (req, res) => {
  try {
    const validatedData = machineProductSchema.parse(req.body);
    
    const result = await simplifiedEnhancedForecast.createEnhancedForecast(
      validatedData.machineId,
      validatedData.productName,
      validatedData.days
    );

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
 * GET /api/simplified-enhanced-forecast/dashboard
 * Gets comprehensive forecast dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const validatedData = dashboardSchema.parse(req.query);
    
    const result = await simplifiedEnhancedForecast.getForecastDashboard(
      validatedData.warehouseId
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
 * GET /api/simplified-enhanced-forecast/machine/:machineId
 * Gets forecast history for a specific machine
 */
router.get('/machine/:machineId', async (req, res) => {
  try {
    const machineId = parseInt(req.params.machineId);
    
    if (isNaN(machineId)) {
      return res.status(400).json({
        success: false,
        message: 'Ungültige Maschinen-ID'
      });
    }
    
    const result = await simplifiedEnhancedForecast.getMachineForecastHistory(machineId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting machine forecast history:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Fehler beim Laden der Maschinenprognosen'
    });
  }
});

export default router;