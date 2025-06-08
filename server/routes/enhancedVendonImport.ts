/**
 * Enhanced Vendon Import API Routes
 * 
 * Provides API endpoints for the enhanced historical transaction import system
 * with comprehensive monitoring, control, and status tracking capabilities.
 */

import { Router, Request, Response } from 'express';
import { EnhancedVendonHistoryImporter } from '../services/enhancedVendonHistoryImporter';
import { db, rawDb } from '../db';
import { syncLogs, syncState } from '@shared/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// Validation schemas
const importRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  timeIntervalHours: z.number().min(1).max(24).optional(),
  batchSize: z.number().min(1).max(100).optional(),
  requestDelayMs: z.number().min(0).max(10000).optional(),
  retryDelayMs: z.number().min(1000).max(60000).optional(),
  maxRetries: z.number().min(1).max(10).optional()
});

/**
 * POST /api/enhanced-vendon-import/start
 * Start enhanced historical transaction import
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    console.log('Enhanced import request received:', req.body);

    // Validate request body
    const validationResult = importRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }

    const options = validationResult.data;

    // Additional validation for date range
    const startDate = new Date(options.startDate);
    const endDate = options.endDate ? new Date(options.endDate) : new Date();

    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date'
      });
    }

    // Check if an import is already running
    const runningImports = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.syncType, 'enhanced_history_import'),
          eq(syncLogs.syncStatus, 'running')
        )
      )
      .limit(1);

    if (runningImports.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An enhanced import is already running',
        runningImport: runningImports[0]
      });
    }

    // Create new importer instance
    globalEnhancedImporter = new EnhancedVendonHistoryImporter();

    // Start the import process asynchronously with date range
    const importStartDate = options.startDate || '2022-01-01';
    const importEndDate = options.endDate || new Date().toISOString().split('T')[0];
    
    console.log(`Starting enhanced import from ${importStartDate} to ${importEndDate}`);
    
    const importPromise = globalEnhancedImporter.startImport();

    // Don't wait for completion, return immediately with status
    res.json({
      success: true,
      message: 'Enhanced historical import started',
      startDate: options.startDate,
      endDate: options.endDate || endDate.toISOString().split('T')[0],
      estimatedDuration: 'Will depend on data volume and API response times'
    });

    // Handle the import result asynchronously
    importPromise.catch((error: any) => {
      console.error('Enhanced import failed:', error);
    });

  } catch (error: any) {
    console.error('Error starting enhanced import:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start enhanced import',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/enhanced-vendon-import/status
 * Get current import status and progress
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Get the most recent enhanced import log
    const recentImport = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.syncType, 'enhanced_history_import'))
      .orderBy(desc(syncLogs.startDate))
      .limit(1);

    if (recentImport.length === 0) {
      return res.json({
        success: true,
        status: 'never_run',
        message: 'No enhanced imports have been executed'
      });
    }

    const importLog = recentImport[0];

    // Get sync state for detailed progress
    const syncStateData = await db
      .select()
      .from(syncState)
      .where(eq(syncState.jobName, 'enhanced_vendon_history_import'))
      .limit(1);

    // Calculate progress if running
    let progressPercentage = null;
    let estimatedRemaining = null;

    if (importLog.syncStatus === 'running' && syncStateData.length > 0) {
      const state = syncStateData[0];
      const startDate = new Date(importLog.startDate!);
      const endDate = new Date(importLog.endDate!);
      const currentDate = state.lastDate ? new Date(state.lastDate) : startDate;

      const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const completedDays = (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      
      progressPercentage = Math.min(100, Math.max(0, (completedDays / totalDays) * 100));

      // Estimate remaining time based on current progress
      if (progressPercentage > 0 && importLog.startDate) {
        const elapsedMs = Date.now() - new Date(importLog.startDate).getTime();
        const totalEstimatedMs = (elapsedMs / progressPercentage) * 100;
        estimatedRemaining = Math.max(0, totalEstimatedMs - elapsedMs);
      }
    }

    res.json({
      success: true,
      status: importLog.syncStatus,
      importLog: {
        id: importLog.id,
        startDate: importLog.startDate,
        endDate: importLog.endDate,
        syncStatus: importLog.syncStatus,
        itemsFound: importLog.itemsFound,
        itemsSaved: importLog.itemsSaved,
        duplicates: importLog.duplicates,
        errors: importLog.errors,
        durationSeconds: importLog.durationSeconds,
        errorMessage: importLog.errorMessage,
        additionalData: importLog.additionalData
      },
      progress: {
        percentage: progressPercentage,
        estimatedRemainingMs: estimatedRemaining,
        lastProcessedDate: syncStateData.length > 0 ? syncStateData[0].lastDate : null,
        lastProcessedTimestamp: syncStateData.length > 0 ? syncStateData[0].lastOffset : null
      }
    });

  } catch (error) {
    console.error('Error getting enhanced import status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get import status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/enhanced-vendon-import/history
 * Get import history with pagination
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const imports = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.syncType, 'enhanced_history_import'))
      .orderBy(desc(syncLogs.startDate))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalResult = await rawDb.query(
      `SELECT COUNT(*) as total FROM sync_logs WHERE sync_type = 'enhanced_history_import'`
    );
    const total = totalResult.rows[0]?.total || 0;

    res.json({
      success: true,
      data: imports,
      pagination: {
        page,
        limit,
        total: parseInt(total),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error getting import history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get import history',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/enhanced-vendon-import/stop
 * Stop currently running import (if possible)
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    // Find running imports
    const runningImports = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.syncType, 'enhanced_history_import'),
          eq(syncLogs.syncStatus, 'running')
        )
      );

    if (runningImports.length === 0) {
      return res.json({
        success: true,
        message: 'No running imports to stop'
      });
    }

    // Mark the running import as stopped
    // Note: This won't immediately stop the actual process, but will mark it as stopped
    for (const importLog of runningImports) {
      await rawDb.query(
        `UPDATE sync_logs SET 
          sync_status = 'stopped',
          error_message = 'Manually stopped by user',
          updated_at = NOW()
         WHERE id = $1`,
        [importLog.id]
      );
    }

    res.json({
      success: true,
      message: `Marked ${runningImports.length} import(s) as stopped`,
      stoppedImports: runningImports.map(log => log.id)
    });

  } catch (error) {
    console.error('Error stopping import:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop import',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/enhanced-vendon-import/statistics
 * Get comprehensive import statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    // Get overall statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_imports,
        COUNT(CASE WHEN sync_status = 'completed' THEN 1 END) as completed_imports,
        COUNT(CASE WHEN sync_status = 'running' THEN 1 END) as running_imports,
        COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed_imports,
        SUM(COALESCE(items_found, 0)) as total_items_found,
        SUM(COALESCE(items_saved, 0)) as total_items_saved,
        SUM(COALESCE(duplicates, 0)) as total_duplicates,
        SUM(COALESCE(errors, 0)) as total_errors,
        AVG(COALESCE(duration_seconds, 0)) as avg_duration_seconds,
        MIN(start_date) as earliest_import,
        MAX(start_date) as latest_import
      FROM sync_logs 
      WHERE sync_type = 'enhanced_history_import'
    `;

    const statsResult = await rawDb.query(statsQuery);
    const stats = statsResult.rows[0];

    // Get recent performance metrics
    const recentPerformanceQuery = `
      SELECT 
        start_date,
        items_saved,
        duration_seconds,
        CASE 
          WHEN duration_seconds > 0 THEN items_saved::float / duration_seconds 
          ELSE 0 
        END as transactions_per_second
      FROM sync_logs 
      WHERE sync_type = 'enhanced_history_import' 
        AND sync_status = 'completed'
        AND duration_seconds > 0
      ORDER BY start_date DESC 
      LIMIT 10
    `;

    const performanceResult = await rawDb.query(recentPerformanceQuery);

    res.json({
      success: true,
      statistics: {
        totalImports: parseInt(stats.total_imports) || 0,
        completedImports: parseInt(stats.completed_imports) || 0,
        runningImports: parseInt(stats.running_imports) || 0,
        failedImports: parseInt(stats.failed_imports) || 0,
        totalItemsFound: parseInt(stats.total_items_found) || 0,
        totalItemsSaved: parseInt(stats.total_items_saved) || 0,
        totalDuplicates: parseInt(stats.total_duplicates) || 0,
        totalErrors: parseInt(stats.total_errors) || 0,
        averageDurationSeconds: parseFloat(stats.avg_duration_seconds) || 0,
        earliestImport: stats.earliest_import,
        latestImport: stats.latest_import
      },
      recentPerformance: performanceResult.rows.map(row => ({
        date: row.start_date,
        itemsSaved: parseInt(row.items_saved),
        durationSeconds: parseFloat(row.duration_seconds),
        transactionsPerSecond: parseFloat(row.transactions_per_second)
      }))
    });

  } catch (error) {
    console.error('Error getting import statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get import statistics',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;