import { db } from '../db';
import {
  notificationRecipients,
  notificationSubscriptions,
  notificationSchedules,
  notificationEvents,
  notificationLogs,
  insertNotificationRecipientSchema,
  insertNotificationSubscriptionSchema,
  insertNotificationScheduleSchema,
  insertNotificationEventSchema,
  insertNotificationLogSchema,
  NotificationEventType,
  notificationEventTypes,
  type InsertNotificationRecipient,
  type InsertNotificationSubscription,
  type InsertNotificationSchedule,
  type InsertNotificationEvent,
  type InsertNotificationLog,
  type NotificationRecipient,
  type NotificationSubscription,
  type NotificationSchedule,
  type NotificationEvent,
  type NotificationLog
} from '@shared/schema';
import { eq, and, sql, desc, gte, lte, inArray } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Core Notification Service
 * Handles event recording, deduplication, and notification dispatching
 */
export class NotificationService {
  /**
   * Record a new notification event with deduplication
   * @param eventType - Type of the event
   * @param payload - Event payload data
   * @param dedupeWindow - Deduplication window in seconds (default: 3600)
   * @returns The created event or existing event if deduplicated
   */
  async recordEvent(
    eventType: NotificationEventType,
    payload: Record<string, any>,
    dedupeWindow: number = 3600
  ): Promise<NotificationEvent> {
    // Validate event type
    if (!notificationEventTypes.includes(eventType)) {
      throw new Error(`Invalid event type: ${eventType}`);
    }

    // Create payload hash for deduplication
    const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

    // Check for existing event within dedupe window
    const now = new Date();
    const dedupeThreshold = new Date(now.getTime() - (dedupeWindow * 1000));

    const existingEvent = await db
      .select()
      .from(notificationEvents)
      .where(
        and(
          eq(notificationEvents.eventType, eventType),
          eq(notificationEvents.payloadHash, payloadHash),
          gte(notificationEvents.occurredAt, dedupeThreshold)
        )
      )
      .limit(1);

    if (existingEvent.length > 0) {
      console.log(`Deduplicated event: ${eventType} with hash ${payloadHash}`);
      return existingEvent[0];
    }

    // Create new event
    const eventData = insertNotificationEventSchema.parse({
      eventType,
      payload,
      payloadHash,
      dedupeWindow,
      occurredAt: now
    });

    const [newEvent] = await db
      .insert(notificationEvents)
      .values(eventData)
      .returning();

    console.log(`Recorded new event: ${eventType} with ID ${newEvent.id}`);
    return newEvent;
  }

  /**
   * Get due notifications based on schedules
   * @param currentTime - Current time to check against schedules
   * @returns Array of subscriptions that are due for notification
   */
  async getDueNotifications(currentTime: Date = new Date()): Promise<Array<{
    subscription: NotificationSubscription;
    recipient: NotificationRecipient;
    schedule: NotificationSchedule;
  }>> {
    const berlinTime = new Date(currentTime.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const currentHour = berlinTime.getHours();
    const currentMinute = berlinTime.getMinutes();
    const currentWeekday = berlinTime.getDay() === 0 ? 7 : berlinTime.getDay(); // Convert Sunday from 0 to 7

    // Get subscriptions with schedules that are due
    const dueSubscriptions = await db
      .select({
        subscription: notificationSubscriptions,
        recipient: notificationRecipients,
        schedule: notificationSchedules
      })
      .from(notificationSubscriptions)
      .innerJoin(
        notificationRecipients,
        eq(notificationSubscriptions.recipientId, notificationRecipients.id)
      )
      .innerJoin(
        notificationSchedules,
        eq(notificationSubscriptions.id, notificationSchedules.subscriptionId)
      )
      .where(
        and(
          eq(notificationSubscriptions.active, true),
          eq(notificationRecipients.active, true),
          eq(notificationSchedules.active, true),
          // Check schedule conditions
          sql`(
            (${notificationSchedules.frequency} = 'daily' AND 
             ${notificationSchedules.hour} = ${currentHour} AND 
             ${notificationSchedules.minute} = ${currentMinute})
            OR 
            (${notificationSchedules.frequency} = 'weekly' AND 
             ${notificationSchedules.weekday} = ${currentWeekday} AND
             ${notificationSchedules.hour} = ${currentHour} AND 
             ${notificationSchedules.minute} = ${currentMinute})
          )`
        )
      );

    return dueSubscriptions;
  }

  /**
   * Get unprocessed events for event-based notifications
   * @returns Array of unprocessed events with their subscriptions
   */
  async getUnprocessedEvents(): Promise<Array<{
    event: NotificationEvent;
    subscriptions: Array<{
      subscription: NotificationSubscription;
      recipient: NotificationRecipient;
    }>;
  }>> {
    // Get unprocessed events
    const events = await db
      .select()
      .from(notificationEvents)
      .where(eq(notificationEvents.processed, false))
      .orderBy(notificationEvents.occurredAt);

    const eventsWithSubscriptions = [];

    for (const event of events) {
      // Get subscriptions for this event type
      const subscriptions = await db
        .select({
          subscription: notificationSubscriptions,
          recipient: notificationRecipients
        })
        .from(notificationSubscriptions)
        .innerJoin(
          notificationRecipients,
          eq(notificationSubscriptions.recipientId, notificationRecipients.id)
        )
        .innerJoin(
          notificationSchedules,
          eq(notificationSubscriptions.id, notificationSchedules.subscriptionId)
        )
        .where(
          and(
            eq(notificationSubscriptions.eventType, event.eventType),
            eq(notificationSubscriptions.active, true),
            eq(notificationRecipients.active, true),
            eq(notificationSchedules.frequency, 'event')
          )
        );

      if (subscriptions.length > 0) {
        eventsWithSubscriptions.push({
          event,
          subscriptions
        });
      }
    }

    return eventsWithSubscriptions;
  }

  /**
   * Mark events as processed
   * @param eventIds - Array of event IDs to mark as processed
   */
  async markEventsProcessed(eventIds: number[]): Promise<void> {
    if (eventIds.length === 0) return;

    await db
      .update(notificationEvents)
      .set({
        processed: true,
        processedAt: new Date()
      })
      .where(inArray(notificationEvents.id, eventIds));
  }

  /**
   * Log a notification send attempt
   * @param logData - Notification log data
   * @returns The created log entry
   */
  async logNotification(logData: InsertNotificationLog): Promise<NotificationLog> {
    const validatedData = insertNotificationLogSchema.parse(logData);
    
    const [log] = await db
      .insert(notificationLogs)
      .values(validatedData)
      .returning();

    return log;
  }

  // ========================================
  // CRUD Operations for Recipients
  // ========================================

  async createRecipient(data: InsertNotificationRecipient): Promise<NotificationRecipient> {
    const validatedData = insertNotificationRecipientSchema.parse(data);
    
    const [recipient] = await db
      .insert(notificationRecipients)
      .values(validatedData)
      .returning();

    return recipient;
  }

  async getRecipients(): Promise<NotificationRecipient[]> {
    return await db
      .select()
      .from(notificationRecipients)
      .orderBy(notificationRecipients.displayName);
  }

  async getRecipient(id: number): Promise<NotificationRecipient | null> {
    const [recipient] = await db
      .select()
      .from(notificationRecipients)
      .where(eq(notificationRecipients.id, id))
      .limit(1);

    return recipient || null;
  }

  async updateRecipient(id: number, data: Partial<InsertNotificationRecipient>): Promise<NotificationRecipient | null> {
    const [recipient] = await db
      .update(notificationRecipients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationRecipients.id, id))
      .returning();

    return recipient || null;
  }

  async deleteRecipient(id: number): Promise<boolean> {
    const result = await db
      .delete(notificationRecipients)
      .where(eq(notificationRecipients.id, id));

    return result.rowCount > 0;
  }

  // ========================================
  // CRUD Operations for Subscriptions
  // ========================================

  async createSubscription(data: InsertNotificationSubscription): Promise<NotificationSubscription> {
    const validatedData = insertNotificationSubscriptionSchema.parse(data);
    
    const [subscription] = await db
      .insert(notificationSubscriptions)
      .values(validatedData)
      .returning();

    return subscription;
  }

  async getSubscriptions(recipientId?: number): Promise<NotificationSubscription[]> {
    const query = db.select().from(notificationSubscriptions);
    
    if (recipientId) {
      query.where(eq(notificationSubscriptions.recipientId, recipientId));
    }
    
    return await query.orderBy(notificationSubscriptions.eventType);
  }

  async getSubscription(id: number): Promise<NotificationSubscription | null> {
    const [subscription] = await db
      .select()
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.id, id))
      .limit(1);

    return subscription || null;
  }

  async updateSubscription(id: number, data: Partial<InsertNotificationSubscription>): Promise<NotificationSubscription | null> {
    const [subscription] = await db
      .update(notificationSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationSubscriptions.id, id))
      .returning();

    return subscription || null;
  }

  async deleteSubscription(id: number): Promise<boolean> {
    const result = await db
      .delete(notificationSubscriptions)
      .where(eq(notificationSubscriptions.id, id));

    return result.rowCount > 0;
  }

  // ========================================
  // CRUD Operations for Schedules
  // ========================================

  async createSchedule(data: InsertNotificationSchedule): Promise<NotificationSchedule> {
    const validatedData = insertNotificationScheduleSchema.parse(data);
    
    const [schedule] = await db
      .insert(notificationSchedules)
      .values(validatedData)
      .returning();

    return schedule;
  }

  async getSchedules(subscriptionId?: number): Promise<NotificationSchedule[]> {
    const query = db.select().from(notificationSchedules);
    
    if (subscriptionId) {
      query.where(eq(notificationSchedules.subscriptionId, subscriptionId));
    }
    
    return await query.orderBy(notificationSchedules.frequency);
  }

  async getSchedule(id: number): Promise<NotificationSchedule | null> {
    const [schedule] = await db
      .select()
      .from(notificationSchedules)
      .where(eq(notificationSchedules.id, id))
      .limit(1);

    return schedule || null;
  }

  async updateSchedule(id: number, data: Partial<InsertNotificationSchedule>): Promise<NotificationSchedule | null> {
    const [schedule] = await db
      .update(notificationSchedules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationSchedules.id, id))
      .returning();

    return schedule || null;
  }

  async deleteSchedule(id: number): Promise<boolean> {
    const result = await db
      .delete(notificationSchedules)
      .where(eq(notificationSchedules.id, id));

    return result.rowCount > 0;
  }

  // ========================================
  // Query Operations
  // ========================================

  /**
   * Get notification logs with optional filtering
   */
  async getNotificationLogs(options: {
    recipientId?: number;
    eventType?: NotificationEventType;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<NotificationLog[]> {
    const { recipientId, eventType, status, limit = 100, offset = 0 } = options;
    
    let query = db.select().from(notificationLogs);
    
    const conditions = [];
    if (recipientId) conditions.push(eq(notificationLogs.recipientId, recipientId));
    if (eventType) conditions.push(eq(notificationLogs.eventType, eventType));
    if (status) conditions.push(eq(notificationLogs.status, status));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query
      .orderBy(desc(notificationLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get events with optional filtering
   */
  async getEvents(options: {
    eventType?: NotificationEventType;
    processed?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<NotificationEvent[]> {
    const { eventType, processed, limit = 100, offset = 0 } = options;
    
    let query = db.select().from(notificationEvents);
    
    const conditions = [];
    if (eventType) conditions.push(eq(notificationEvents.eventType, eventType));
    if (processed !== undefined) conditions.push(eq(notificationEvents.processed, processed));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query
      .orderBy(desc(notificationEvents.occurredAt))
      .limit(limit)
      .offset(offset);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();