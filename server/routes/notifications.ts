import { Router } from 'express';
import { z } from 'zod';
import { notificationService } from '../services/notificationService';
import { queueService } from '../services/queueService';
import {
  insertNotificationRecipientSchema,
  insertNotificationSubscriptionSchema,
  insertNotificationScheduleSchema,
  notificationEventTypes,
  NotificationEventType
} from '@shared/schema';

// Import proper authentication middleware
import { enhancedAuthMiddleware, requireAdmin } from '../auth/enhanced-auth';

// Import trigger services
import { coinLowTrigger } from '../services/triggers/coinLowTrigger';
import { cashHighTrigger } from '../services/triggers/cashHighTrigger';
import { mhdSoonTrigger } from '../services/triggers/mhdSoonTrigger';
import { stockLowTrigger } from '../services/triggers/stockLowTrigger';
import { salesYesterdayTrigger } from '../services/triggers/salesYesterdayTrigger';
import { salesWeeklyTrigger } from '../services/triggers/salesWeeklyTrigger';
import { marginReportTrigger } from '../services/triggers/marginReportTrigger';
import { forecastWeekTrigger } from '../services/triggers/forecastWeekTrigger';

const router = Router();

// Apply proper authentication and admin middleware to all notification routes
router.use(enhancedAuthMiddleware);
router.use(requireAdmin);

// ========================================
// RECIPIENTS ENDPOINTS
// ========================================

/**
 * GET /api/notifications/recipients
 * Get all notification recipients
 */
router.get('/recipients', async (req, res) => {
  try {
    const recipients = await notificationService.getRecipients();
    res.json(recipients);
  } catch (error) {
    console.error('Error getting recipients:', error);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

/**
 * GET /api/notifications/recipients/:id
 * Get specific recipient
 */
router.get('/recipients/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid recipient ID' });
    }

    const recipient = await notificationService.getRecipient(id);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    res.json(recipient);
  } catch (error) {
    console.error('Error getting recipient:', error);
    res.status(500).json({ error: 'Failed to fetch recipient' });
  }
});

/**
 * POST /api/notifications/recipients
 * Create new recipient
 */
router.post('/recipients', async (req, res) => {
  try {
    const validatedData = insertNotificationRecipientSchema.parse(req.body);
    const recipient = await notificationService.createRecipient(validatedData);
    res.status(201).json(recipient);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating recipient:', error);
    res.status(500).json({ error: 'Failed to create recipient' });
  }
});

/**
 * PUT /api/notifications/recipients/:id
 * Update recipient
 */
router.put('/recipients/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid recipient ID' });
    }

    const validatedData = insertNotificationRecipientSchema.partial().parse(req.body);
    const recipient = await notificationService.updateRecipient(id, validatedData);
    
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    res.json(recipient);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating recipient:', error);
    res.status(500).json({ error: 'Failed to update recipient' });
  }
});

/**
 * DELETE /api/notifications/recipients/:id
 * Delete recipient
 */
router.delete('/recipients/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid recipient ID' });
    }

    const deleted = await notificationService.deleteRecipient(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting recipient:', error);
    res.status(500).json({ error: 'Failed to delete recipient' });
  }
});

// ========================================
// SUBSCRIPTIONS ENDPOINTS
// ========================================

/**
 * GET /api/notifications/subscriptions
 * Get subscriptions (optionally filtered by recipient)
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const recipientId = req.query.recipientId ? parseInt(req.query.recipientId as string) : undefined;
    const subscriptions = await notificationService.getSubscriptions(recipientId);
    res.json(subscriptions);
  } catch (error) {
    console.error('Error getting subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * GET /api/notifications/subscriptions/:id
 * Get specific subscription
 */
router.get('/subscriptions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    const subscription = await notificationService.getSubscription(id);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error getting subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * POST /api/notifications/subscriptions
 * Create new subscription
 */
router.post('/subscriptions', async (req, res) => {
  try {
    const validatedData = insertNotificationSubscriptionSchema.parse(req.body);
    const subscription = await notificationService.createSubscription(validatedData);
    res.status(201).json(subscription);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * PUT /api/notifications/subscriptions/:id
 * Update subscription
 */
router.put('/subscriptions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    const validatedData = insertNotificationSubscriptionSchema.partial().parse(req.body);
    const subscription = await notificationService.updateSubscription(id, validatedData);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json(subscription);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

/**
 * DELETE /api/notifications/subscriptions/:id
 * Delete subscription
 */
router.delete('/subscriptions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    const deleted = await notificationService.deleteSubscription(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

// ========================================
// SCHEDULES ENDPOINTS
// ========================================

/**
 * GET /api/notifications/schedules
 * Get schedules (optionally filtered by subscription)
 */
router.get('/schedules', async (req, res) => {
  try {
    const subscriptionId = req.query.subscriptionId ? parseInt(req.query.subscriptionId as string) : undefined;
    const schedules = await notificationService.getSchedules(subscriptionId);
    res.json(schedules);
  } catch (error) {
    console.error('Error getting schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * GET /api/notifications/schedules/:id
 * Get specific schedule
 */
router.get('/schedules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }

    const schedule = await notificationService.getSchedule(id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    console.error('Error getting schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

/**
 * POST /api/notifications/schedules
 * Create new schedule
 */
router.post('/schedules', async (req, res) => {
  try {
    const validatedData = insertNotificationScheduleSchema.parse(req.body);
    const schedule = await notificationService.createSchedule(validatedData);
    res.status(201).json(schedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

/**
 * PUT /api/notifications/schedules/:id
 * Update schedule
 */
router.put('/schedules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }

    const validatedData = insertNotificationScheduleSchema.partial().parse(req.body);
    const schedule = await notificationService.updateSchedule(id, validatedData);
    
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

/**
 * DELETE /api/notifications/schedules/:id
 * Delete schedule
 */
router.delete('/schedules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }

    const deleted = await notificationService.deleteSchedule(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// ========================================
// EVENTS & LOGS ENDPOINTS
// ========================================

/**
 * GET /api/notifications/events
 * Get notification events with optional filtering
 */
router.get('/events', async (req, res) => {
  try {
    const eventType = req.query.eventType as NotificationEventType;
    const processed = req.query.processed === 'true' ? true : req.query.processed === 'false' ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const events = await notificationService.getEvents({
      eventType,
      processed,
      limit,
      offset
    });

    res.json(events);
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/notifications/logs
 * Get notification logs with optional filtering
 */
router.get('/logs', async (req, res) => {
  try {
    const recipientId = req.query.recipientId ? parseInt(req.query.recipientId as string) : undefined;
    const eventType = req.query.eventType as NotificationEventType;
    const status = req.query.status as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const logs = await notificationService.getNotificationLogs({
      recipientId,
      eventType,
      status,
      limit,
      offset
    });

    res.json(logs);
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ========================================
// TRIGGER ENDPOINTS
// ========================================

/**
 * POST /api/notifications/triggers/manual
 * Manually trigger checks for all event types
 */
router.post('/triggers/manual', async (req, res) => {
  try {
    const eventTypes = req.body.eventTypes as NotificationEventType[] || notificationEventTypes;
    const results: Record<string, any> = {};

    for (const eventType of eventTypes) {
      try {
        switch (eventType) {
          case 'coin_low':
            results[eventType] = await coinLowTrigger.triggerManualCheck();
            break;
          case 'cash_high':
            results[eventType] = await cashHighTrigger.triggerManualCheck();
            break;
          case 'mhd_soon':
            results[eventType] = await mhdSoonTrigger.triggerManualCheck();
            break;
          case 'stock_low':
            results[eventType] = await stockLowTrigger.triggerManualCheck();
            break;
          case 'sales_yesterday':
            results[eventType] = await salesYesterdayTrigger.triggerManualReport();
            break;
          case 'sales_weekly':
            results[eventType] = await salesWeeklyTrigger.triggerManualReport();
            break;
          case 'margin_report':
            results[eventType] = await marginReportTrigger.triggerManualReport();
            break;
          case 'forecast_week':
            results[eventType] = await forecastWeekTrigger.triggerManualForecast();
            break;
          default:
            results[eventType] = { error: 'Unknown event type' };
        }
      } catch (error) {
        console.error(`Error triggering ${eventType}:`, error);
        results[eventType] = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Error in manual trigger:', error);
    res.status(500).json({ error: 'Failed to trigger manual checks' });
  }
});

/**
 * POST /api/notifications/triggers/:eventType
 * Manually trigger check for specific event type
 */
router.post('/triggers/:eventType', async (req, res) => {
  try {
    const eventType = req.params.eventType as NotificationEventType;
    
    if (!notificationEventTypes.includes(eventType)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    let result;
    switch (eventType) {
      case 'coin_low':
        result = await coinLowTrigger.triggerManualCheck();
        break;
      case 'cash_high':
        result = await cashHighTrigger.triggerManualCheck();
        break;
      case 'mhd_soon':
        result = await mhdSoonTrigger.triggerManualCheck();
        break;
      case 'stock_low':
        result = await stockLowTrigger.triggerManualCheck();
        break;
      case 'sales_yesterday':
        result = await salesYesterdayTrigger.triggerManualReport();
        break;
      case 'sales_weekly':
        result = await salesWeeklyTrigger.triggerManualReport();
        break;
      case 'margin_report':
        result = await marginReportTrigger.triggerManualReport();
        break;
      case 'forecast_week':
        result = await forecastWeekTrigger.triggerManualForecast();
        break;
      default:
        return res.status(400).json({ error: 'Unsupported event type' });
    }

    res.json({ eventType, result });
  } catch (error) {
    console.error(`Error triggering ${req.params.eventType}:`, error);
    res.status(500).json({ error: 'Failed to trigger check' });
  }
});

// ========================================
// QUEUE STATUS ENDPOINTS
// ========================================

/**
 * GET /api/notifications/queue/status
 * Get queue status and statistics
 */
router.get('/queue/status', async (req, res) => {
  try {
    const status = await queueService.getQueueStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

// ========================================
// SYSTEM STATUS ENDPOINTS
// ========================================

/**
 * GET /api/notifications/status
 * Get overall notification system status
 */
router.get('/status', async (req, res) => {
  try {
    const [
      recipients,
      subscriptions,
      unprocessedEvents,
      recentLogs,
      queueStatus
    ] = await Promise.all([
      notificationService.getRecipients(),
      notificationService.getSubscriptions(),
      notificationService.getEvents({ processed: false, limit: 50 }),
      notificationService.getNotificationLogs({ limit: 20 }),
      queueService.getQueueStatus()
    ]);

    const status = {
      system: {
        healthy: true,
        timestamp: new Date().toISOString()
      },
      counts: {
        recipients: recipients.length,
        activeRecipients: recipients.filter(r => r.active).length,
        subscriptions: subscriptions.length,
        activeSubscriptions: subscriptions.filter(s => s.active).length,
        unprocessedEvents: unprocessedEvents.length,
        recentLogs: recentLogs.length
      },
      eventTypes: notificationEventTypes.map(type => ({
        type,
        subscriptions: subscriptions.filter(s => s.eventType === type).length,
        recentEvents: unprocessedEvents.filter(e => e.eventType === type).length
      })),
      queue: queueStatus,
      lastActivity: {
        lastEvent: unprocessedEvents[0]?.occurredAt || null,
        lastLog: recentLogs[0]?.createdAt || null
      }
    };

    res.json(status);
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

/**
 * GET /api/notifications/event-types
 * Get available event types
 */
router.get('/event-types', (req, res) => {
  const eventTypesWithDescriptions = notificationEventTypes.map(type => ({
    type,
    description: getEventTypeDescription(type)
  }));
  
  res.json(eventTypesWithDescriptions);
});

// Helper function to get event type descriptions
function getEventTypeDescription(eventType: NotificationEventType): string {
  switch (eventType) {
    case 'coin_low': return 'Münzbestand niedrig - Wechselgeld wird knapp';
    case 'cash_high': return 'Zu viel Bargeld - Abholung erforderlich';
    case 'mhd_soon': return 'MHD bald erreicht - Produkte laufen ab';
    case 'stock_low': return 'Lagerbestand niedrig - Nachfüllung erforderlich';
    case 'sales_yesterday': return 'Gestrige Umsätze - Täglicher Verkaufsbericht';
    case 'sales_weekly': return 'Wöchentliche Umsätze - Wöchentlicher Verkaufsbericht';
    case 'margin_report': return 'Ergebnis & Marge - Rentabilitätsbericht';
    case 'forecast_week': return 'Prognose 7 Tage - Erwartete Auslastung';
    default: return 'Unbekannter Ereignistyp';
  }
}

export default router;