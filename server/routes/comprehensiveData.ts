/**
 * Comprehensive Data API Routes
 * 
 * Handles weather and holiday data synchronization for all German federal states
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { comprehensiveDataService } from '../services/comprehensiveDataService';

const router = Router();

// Schema for sync request validation
const syncRequestSchema = z.object({
  startYear: z.number().min(2020).max(2030).optional().default(2022),
  endYear: z.number().min(2020).max(2030).optional().default(new Date().getFullYear() + 1),
  includeWeather: z.boolean().optional().default(true),
  includeHolidays: z.boolean().optional().default(true),
  states: z.array(z.string().length(2)).optional(),
  force: z.boolean().optional().default(false)
});

/**
 * POST /api/comprehensive-data/sync
 * Synchronize all weather and holiday data
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    console.log('Starting comprehensive data sync with request:', req.body);
    
    const validatedData = syncRequestSchema.parse(req.body);
    
    const result = await comprehensiveDataService.syncAllData({
      startYear: validatedData.startYear,
      endYear: validatedData.endYear,
      includeWeather: validatedData.includeWeather,
      includeHolidays: validatedData.includeHolidays,
      states: validatedData.states
    });
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        errors: result.errors
      });
    }
  } catch (error) {
    console.error('Error in comprehensive data sync route:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request parameters',
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during comprehensive data sync',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/comprehensive-data/sync-holidays
 * Synchronize only holiday data
 */
router.post('/sync-holidays', async (req: Request, res: Response) => {
  try {
    const validatedData = syncRequestSchema.parse({
      ...req.body,
      includeWeather: false,
      includeHolidays: true
    });
    
    const result = await comprehensiveDataService.syncAllData({
      startYear: validatedData.startYear,
      endYear: validatedData.endYear,
      includeWeather: false,
      includeHolidays: true,
      states: validatedData.states
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error in holiday sync route:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request parameters',
        errors: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during holiday sync',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/comprehensive-data/sync-weather
 * Synchronize only weather data
 */
router.post('/sync-weather', async (req: Request, res: Response) => {
  try {
    const validatedData = syncRequestSchema.parse({
      ...req.body,
      includeWeather: true,
      includeHolidays: false
    });
    
    const result = await comprehensiveDataService.syncAllData({
      startYear: validatedData.startYear,
      endYear: validatedData.endYear,
      includeWeather: true,
      includeHolidays: false,
      states: validatedData.states
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error in weather sync route:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request parameters',
        errors: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during weather sync',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/comprehensive-data/status
 * Get synchronization status and coverage information
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await comprehensiveDataService.getSyncStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error getting sync status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/comprehensive-data/sync-all-states
 * Quick endpoint to sync all 16 German states for a specific year range
 */
router.post('/sync-all-states', async (req: Request, res: Response) => {
  try {
    const { startYear = 2022, endYear = new Date().getFullYear() + 1 } = req.body;
    
    console.log(`Starting sync for all German states from ${startYear} to ${endYear}`);
    
    const result = await comprehensiveDataService.syncAllData({
      startYear,
      endYear,
      includeWeather: true,
      includeHolidays: true,
      states: ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']
    });
    
    res.json({
      success: result.success,
      message: `Sync completed for all 16 German states (${startYear}-${endYear})`,
      data: result.data,
      errors: result.errors
    });
  } catch (error) {
    console.error('Error in sync all states route:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during all states sync',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;