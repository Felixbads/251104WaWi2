import express from 'express';
import { z } from 'zod';
import { 
  insertNavigationAuditSessionSchema,
  insertNavigationIssueSchema,
  insertTouchTargetMetricSchema,
  insertScrollabilityTestSchema,
  insertNavigationFixSchema,
  insertAuditPerformanceHistorySchema,
  type NavigationAuditSession,
  type NavigationIssue,
  type TouchTargetMetric,
  type ScrollabilityTest,
  type NavigationFix,
  type AuditPerformanceHistory
} from '@shared/schema';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { nanoid } from 'nanoid';

const router = express.Router();

// Validation schemas for API requests
const CreateAuditSessionRequest = z.object({
  auditType: z.enum(['full', 'tabs', 'touch-targets', 'scrollability', 'responsive']),
  deviceType: z.enum(['mobile', 'tablet', 'desktop']),
  viewport: z.object({
    width: z.number(),
    height: z.number()
  }),
  userAgent: z.string(),
  performanceScore: z.number().min(0).max(100).optional(),
  issues: z.array(insertNavigationIssueSchema.omit({ sessionId: true })).optional(),
  touchTargets: z.array(insertTouchTargetMetricSchema.omit({ sessionId: true })).optional(),
  scrollabilityTests: z.array(insertScrollabilityTestSchema.omit({ sessionId: true })).optional()
});

const ApplyFixesRequest = z.object({
  issueIds: z.array(z.number()),
  appliedBy: z.number().optional()
});

const UpdatePerformanceHistoryRequest = insertAuditPerformanceHistorySchema;

// =============================================
// AUDIT SESSION ROUTES
// =============================================

/**
 * POST /api/navigation-audit/sessions
 * Create a new navigation audit session with results
 */
router.post('/sessions', requireAuth, async (req, res) => {
  try {
    const validatedData = CreateAuditSessionRequest.parse(req.body);
    const userId = req.user?.id;

    // Generate unique session ID
    const sessionId = nanoid(12);

    // Calculate metrics from provided data
    const totalIssues = validatedData.issues?.length || 0;
    const criticalIssues = validatedData.issues?.filter(issue => issue.severity === 'critical').length || 0;
    const warningIssues = validatedData.issues?.filter(issue => issue.severity === 'warning').length || 0;
    const testedElements = (validatedData.touchTargets?.length || 0) + (validatedData.scrollabilityTests?.length || 0);
    const passedTouchTargets = validatedData.touchTargets?.filter(target => target.isCompliant).length || 0;
    const passedScrollTests = validatedData.scrollabilityTests?.filter(test => test.issues && test.issues.length === 0).length || 0;
    const passedElements = passedTouchTargets + passedScrollTests;
    const failedElements = testedElements - passedElements;

    // Create audit session
    const session = await storage.createNavigationAuditSession({
      sessionId,
      auditType: validatedData.auditType,
      deviceType: validatedData.deviceType,
      viewport: validatedData.viewport,
      userAgent: validatedData.userAgent,
      performanceScore: validatedData.performanceScore || 0,
      totalIssues,
      criticalIssues,
      warningIssues,
      testedElements,
      passedElements,
      failedElements,
      executionTime: 0, // Will be updated by frontend
      createdBy: userId
    });

    // Create associated issues if provided
    const createdIssues: NavigationIssue[] = [];
    if (validatedData.issues && validatedData.issues.length > 0) {
      for (const issueData of validatedData.issues) {
        const issue = await storage.createNavigationIssue({
          ...issueData,
          sessionId: session.id
        });
        createdIssues.push(issue);
      }
    }

    // Create touch target metrics if provided
    const createdTouchTargets: TouchTargetMetric[] = [];
    if (validatedData.touchTargets && validatedData.touchTargets.length > 0) {
      for (const targetData of validatedData.touchTargets) {
        const target = await storage.createTouchTargetMetric({
          ...targetData,
          sessionId: session.id
        });
        createdTouchTargets.push(target);
      }
    }

    // Create scrollability tests if provided
    const createdScrollTests: ScrollabilityTest[] = [];
    if (validatedData.scrollabilityTests && validatedData.scrollabilityTests.length > 0) {
      for (const testData of validatedData.scrollabilityTests) {
        const test = await storage.createScrollabilityTest({
          ...testData,
          sessionId: session.id
        });
        createdScrollTests.push(test);
      }
    }

    res.status(201).json({
      session,
      issues: createdIssues,
      touchTargets: createdTouchTargets,
      scrollabilityTests: createdScrollTests
    });

  } catch (error) {
    console.error('Error creating audit session:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to create audit session' });
  }
});

/**
 * GET /api/navigation-audit/sessions
 * Get navigation audit sessions with filtering
 */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const {
      deviceType,
      auditType,
      limit = '20',
      offset = '0'
    } = req.query;

    const sessions = await storage.getNavigationAuditSessions({
      deviceType: deviceType as string,
      auditType: auditType as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching audit sessions:', error);
    res.status(500).json({ error: 'Failed to fetch audit sessions' });
  }
});

/**
 * GET /api/navigation-audit/sessions/:id
 * Get a specific audit session with all related data
 */
router.get('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    
    const session = await storage.getNavigationAuditSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Audit session not found' });
    }

    const issues = await storage.getNavigationIssuesBySession(sessionId);
    const touchTargets = await storage.getTouchTargetMetricsBySession(sessionId);
    const scrollabilityTests = await storage.getScrollabilityTestsBySession(sessionId);

    res.json({
      session,
      issues,
      touchTargets,
      scrollabilityTests
    });
  } catch (error) {
    console.error('Error fetching audit session:', error);
    res.status(500).json({ error: 'Failed to fetch audit session' });
  }
});

// =============================================
// ISSUES ROUTES
// =============================================

/**
 * GET /api/navigation-audit/issues
 * Get navigation issues with filtering
 */
router.get('/issues', requireAuth, async (req, res) => {
  try {
    const {
      sessionId,
      severity,
      component,
      isFixed,
      limit = '50'
    } = req.query;

    const issues = await storage.getNavigationIssues({
      sessionId: sessionId ? parseInt(sessionId as string) : undefined,
      severity: severity as string,
      component: component as string,
      isFixed: isFixed ? isFixed === 'true' : undefined,
      limit: parseInt(limit as string)
    });

    res.json({ issues });
  } catch (error) {
    console.error('Error fetching navigation issues:', error);
    res.status(500).json({ error: 'Failed to fetch navigation issues' });
  }
});

/**
 * POST /api/navigation-audit/issues/:id/fix
 * Mark an issue as fixed
 */
router.post('/issues/:id/fix', requireAuth, async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const issue = await storage.markNavigationIssueAsFixed(issueId, userId);
    
    res.json({ issue });
  } catch (error) {
    console.error('Error marking issue as fixed:', error);
    res.status(500).json({ error: 'Failed to mark issue as fixed' });
  }
});

/**
 * GET /api/navigation-audit/issues/critical
 * Get all unfixed critical issues
 */
router.get('/issues/critical', requireAuth, async (req, res) => {
  try {
    const issues = await storage.getUnfixedCriticalIssues();
    res.json({ issues });
  } catch (error) {
    console.error('Error fetching critical issues:', error);
    res.status(500).json({ error: 'Failed to fetch critical issues' });
  }
});

// =============================================
// AUTOMATED FIXES ROUTES
// =============================================

/**
 * POST /api/navigation-audit/fixes/apply
 * Apply automated fixes to multiple issues
 */
router.post('/fixes/apply', requireAuth, async (req, res) => {
  try {
    const validatedData = ApplyFixesRequest.parse(req.body);
    const userId = req.user?.id || validatedData.appliedBy;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const fixes = await storage.bulkApplyAutomaticFixes(validatedData.issueIds, userId);
    
    res.json({ fixes });
  } catch (error) {
    console.error('Error applying automatic fixes:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to apply automatic fixes' });
  }
});

/**
 * GET /api/navigation-audit/fixes/available
 * Get all auto-fixable issues
 */
router.get('/fixes/available', requireAuth, async (req, res) => {
  try {
    const issues = await storage.getAutoFixableIssues();
    res.json({ issues });
  } catch (error) {
    console.error('Error fetching auto-fixable issues:', error);
    res.status(500).json({ error: 'Failed to fetch auto-fixable issues' });
  }
});

// =============================================
// PERFORMANCE METRICS ROUTES
// =============================================

/**
 * GET /api/navigation-audit/performance
 * Get audit performance history
 */
router.get('/performance', requireAuth, async (req, res) => {
  try {
    const {
      deviceType,
      dateFrom,
      dateTo
    } = req.query;

    const history = await storage.getAuditPerformanceHistory({
      deviceType: deviceType as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    res.json({ history });
  } catch (error) {
    console.error('Error fetching performance history:', error);
    res.status(500).json({ error: 'Failed to fetch performance history' });
  }
});

/**
 * POST /api/navigation-audit/performance
 * Update audit performance history
 */
router.post('/performance', requireAuth, async (req, res) => {
  try {
    const validatedData = UpdatePerformanceHistoryRequest.parse(req.body);
    
    const history = await storage.upsertAuditPerformanceHistory(validatedData);
    
    res.json({ history });
  } catch (error) {
    console.error('Error updating performance history:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to update performance history' });
  }
});

// =============================================
// ANALYTICS AND REPORTING ROUTES
// =============================================

/**
 * GET /api/navigation-audit/analytics/summary
 * Get comprehensive audit summary statistics
 */
router.get('/analytics/summary', requireAuth, async (req, res) => {
  try {
    const {
      deviceType,
      dateFrom,
      dateTo
    } = req.query;

    const stats = await storage.getAuditSummaryStats({
      deviceType: deviceType as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    res.json({ stats });
  } catch (error) {
    console.error('Error fetching audit summary:', error);
    res.status(500).json({ error: 'Failed to fetch audit summary' });
  }
});

/**
 * GET /api/navigation-audit/analytics/touch-targets
 * Get touch target compliance statistics
 */
router.get('/analytics/touch-targets', requireAuth, async (req, res) => {
  try {
    const { deviceType } = req.query;
    
    const stats = await storage.getTouchTargetComplianceStats(deviceType as string);
    
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching touch target stats:', error);
    res.status(500).json({ error: 'Failed to fetch touch target stats' });
  }
});

/**
 * GET /api/navigation-audit/analytics/scrollability
 * Get scrollability compliance statistics
 */
router.get('/analytics/scrollability', requireAuth, async (req, res) => {
  try {
    const { deviceType } = req.query;
    
    const stats = await storage.getScrollabilityComplianceStats(deviceType as string);
    
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching scrollability stats:', error);
    res.status(500).json({ error: 'Failed to fetch scrollability stats' });
  }
});

// =============================================
// HEALTH CHECK ROUTE
// =============================================

/**
 * GET /api/navigation-audit/health
 * Health check for the audit system
 */
router.get('/health', async (req, res) => {
  try {
    // Basic health check - could be expanded with more detailed checks
    const recentSessions = await storage.getNavigationAuditSessions({ limit: 1 });
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      hasRecentActivity: recentSessions.length > 0,
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime()
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;