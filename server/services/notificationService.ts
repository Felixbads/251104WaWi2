import { db } from '../db';
import {
  notificationRecipients,
  notificationSubscriptions,
  notificationSchedules,
  notificationEvents,
  notificationLogs,
  emailTemplates,
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
  type NotificationLog,
  type EmailTemplates
} from '@shared/schema';
import { eq, and, sql, desc, gte, lte, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { sendEmail } from './emailService';
import * as fs from 'fs';
import * as path from 'path';
import handlebars from 'handlebars';
import stringify from 'fast-stable-stringify';

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

    // Create payload hash for deduplication using deterministic deep serialization
    const payloadString = stringify(payload);
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
   * Get due notifications based on schedules with window-based scheduling for robustness
   * Handles cross-hour boundaries for scheduling tolerance
   * @param currentTime - Current time to check against schedules
   * @param windowMinutes - Time window in minutes for scheduling tolerance
   * @returns Array of subscriptions that are due for notification
   */
  async getDueNotifications(currentTime: Date = new Date(), windowMinutes: number = 5): Promise<Array<{
    subscription: NotificationSubscription;
    recipient: NotificationRecipient;
    schedule: NotificationSchedule;
  }>> {
    const berlinTime = new Date(currentTime.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const currentHour = berlinTime.getHours();
    const currentMinute = berlinTime.getMinutes();
    const currentWeekday = berlinTime.getDay() === 0 ? 7 : berlinTime.getDay(); // Convert Sunday from 0 to 7
    
    // Calculate window boundaries with cross-hour support
    const windowStartMinute = currentMinute - windowMinutes;
    const windowEndMinute = currentMinute + windowMinutes;
    
    const hoursToCheck = [];
    const minuteConditions = [];

    // Handle current hour
    hoursToCheck.push(currentHour);
    minuteConditions.push({
      hour: currentHour,
      minMinute: Math.max(0, windowStartMinute),
      maxMinute: Math.min(59, windowEndMinute)
    });

    // Handle previous hour if window goes back
    if (windowStartMinute < 0) {
      const prevHour = currentHour === 0 ? 23 : currentHour - 1;
      hoursToCheck.push(prevHour);
      minuteConditions.push({
        hour: prevHour,
        minMinute: 60 + windowStartMinute, // windowStartMinute is negative
        maxMinute: 59
      });
    }

    // Handle next hour if window goes forward
    if (windowEndMinute > 59) {
      const nextHour = currentHour === 23 ? 0 : currentHour + 1;
      hoursToCheck.push(nextHour);
      minuteConditions.push({
        hour: nextHour,
        minMinute: 0,
        maxMinute: windowEndMinute - 60
      });
    }

    const allSubscriptions = [];

    // Check each hour condition for daily notifications
    for (const condition of minuteConditions) {
      const dailySubscriptions = await db
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
            eq(notificationSubscriptions.channel, 'email'),
            eq(notificationSchedules.frequency, 'daily'),
            eq(notificationSchedules.hour, condition.hour),
            gte(notificationSchedules.minute, condition.minMinute),
            lte(notificationSchedules.minute, condition.maxMinute)
          )
        );

      // Check weekly notifications for the same hour condition
      const weeklySubscriptions = await db
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
            eq(notificationSubscriptions.channel, 'email'),
            eq(notificationSchedules.frequency, 'weekly'),
            eq(notificationSchedules.weekday, currentWeekday),
            eq(notificationSchedules.hour, condition.hour),
            gte(notificationSchedules.minute, condition.minMinute),
            lte(notificationSchedules.minute, condition.maxMinute)
          )
        );

      allSubscriptions.push(...dailySubscriptions, ...weeklySubscriptions);
    }

    // Remove duplicates based on subscription ID
    const seen = new Set();
    return allSubscriptions.filter(sub => {
      const key = sub.subscription.id;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get unprocessed events for event-based notifications with optimized queries
   * @param limit Maximum number of events to process in one batch
   * @returns Array of unprocessed events with their subscriptions
   */
  async getUnprocessedEvents(limit: number = 100): Promise<Array<{
    event: NotificationEvent;
    subscriptions: Array<{
      subscription: NotificationSubscription;
      recipient: NotificationRecipient;
    }>;
  }>> {
    // Get unprocessed events with limit for batching
    const events = await db
      .select()
      .from(notificationEvents)
      .where(eq(notificationEvents.processed, false))
      .orderBy(notificationEvents.occurredAt)
      .limit(limit);

    if (events.length === 0) {
      return [];
    }

    // Get all event types for efficient lookup
    const eventTypes = [...new Set(events.map(e => e.eventType))];
    
    // Get all subscriptions for these event types in one query to avoid N+1
    const allSubscriptions = await db
      .select({
        subscription: notificationSubscriptions,
        recipient: notificationRecipients,
        eventType: notificationSubscriptions.eventType
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
          inArray(notificationSubscriptions.eventType, eventTypes),
          eq(notificationSubscriptions.active, true),
          eq(notificationRecipients.active, true),
          eq(notificationSchedules.active, true),
          eq(notificationSubscriptions.channel, 'email'),
          eq(notificationSchedules.frequency, 'event')
        )
      );

    // Group subscriptions by event type for efficient lookup
    const subscriptionsByEventType = new Map<string, Array<{
      subscription: NotificationSubscription;
      recipient: NotificationRecipient;
    }>>();

    for (const sub of allSubscriptions) {
      const eventType = sub.eventType;
      if (!subscriptionsByEventType.has(eventType)) {
        subscriptionsByEventType.set(eventType, []);
      }
      subscriptionsByEventType.get(eventType)!.push({
        subscription: sub.subscription,
        recipient: sub.recipient
      });
    }

    // Build result with events that have subscriptions
    const eventsWithSubscriptions = [];
    for (const event of events) {
      const subscriptions = subscriptionsByEventType.get(event.eventType) || [];
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

    return (result.rowCount ?? 0) > 0;
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

    return (result.rowCount ?? 0) > 0;
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

    return (result.rowCount ?? 0) > 0;
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
    
    const conditions = [];
    if (recipientId) conditions.push(eq(notificationLogs.recipientId, recipientId));
    if (eventType) conditions.push(eq(notificationLogs.eventType, eventType));
    if (status) conditions.push(eq(notificationLogs.status, status));
    
    if (conditions.length > 0) {
      return await db
        .select()
        .from(notificationLogs)
        .where(and(...conditions))
        .orderBy(desc(notificationLogs.createdAt))
        .limit(limit)
        .offset(offset);
    }
    
    return await db
      .select()
      .from(notificationLogs)
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
    
    const conditions = [];
    if (eventType) conditions.push(eq(notificationEvents.eventType, eventType));
    if (processed !== undefined) conditions.push(eq(notificationEvents.processed, processed));
    
    if (conditions.length > 0) {
      return await db
        .select()
        .from(notificationEvents)
        .where(and(...conditions))
        .orderBy(desc(notificationEvents.occurredAt))
        .limit(limit)
        .offset(offset);
    }
    
    return await db
      .select()
      .from(notificationEvents)
      .orderBy(desc(notificationEvents.occurredAt))
      .limit(limit)
      .offset(offset);
  }

  // ========================================
  // Email Notification Functions
  // ========================================

  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.registerHandlebarsHelpers();
  }

  /**
   * Registers custom Handlebars helpers for templates
   */
  private registerHandlebarsHelpers() {
    // Date formatting helper
    handlebars.registerHelper('formatDate', function(date: Date | string, format: string) {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (!d || isNaN(d.getTime())) return 'Ungültiges Datum';
      
      const options: Intl.DateTimeFormatOptions = {};
      
      if (format.includes('DD.MM.YYYY')) {
        options.day = '2-digit';
        options.month = '2-digit';
        options.year = 'numeric';
      }
      
      if (format.includes('HH:mm')) {
        options.hour = '2-digit';
        options.minute = '2-digit';
      }
      
      return d.toLocaleDateString('de-DE', options) + (format.includes('HH:mm') ? ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');
    });

    // Comparison helpers
    handlebars.registerHelper('gt', function(a: number, b: number) {
      return a > b;
    });

    handlebars.registerHelper('gte', function(a: number, b: number) {
      return a >= b;
    });

    handlebars.registerHelper('lt', function(a: number, b: number) {
      return a < b;
    });

    handlebars.registerHelper('lte', function(a: number, b: number) {
      return a <= b;
    });

    // Math helpers
    handlebars.registerHelper('subtract', function(a: number, b: number) {
      return a - b;
    });

    handlebars.registerHelper('add', function(a: number, b: number) {
      return a + b;
    });
  }

  /**
   * Loads and compiles a Handlebars template from file system with proper cache invalidation
   */
  private async loadFileTemplate(templateType: NotificationEventType): Promise<HandlebarsTemplateDelegate> {
    // Sanitize template name to prevent path traversal
    const sanitizedType = templateType.replace(/[^a-zA-Z0-9_-]/g, '');
    if (sanitizedType !== templateType) {
      throw new Error(`Invalid template type: ${templateType}`);
    }

    // Construct and validate template path
    const baseDir = path.resolve(__dirname, '../templates/notifications');
    const templatePath = path.join(baseDir, `${sanitizedType}.hbs`);
    const resolvedPath = path.resolve(templatePath);
    
    // Ensure the resolved path is within the base directory
    if (!resolvedPath.startsWith(baseDir)) {
      throw new Error(`Template path outside allowed directory: ${templateType}`);
    }
    
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Template nicht gefunden: ${templateType}`);
    }

    // Get current file stats
    const stats = fs.statSync(resolvedPath);
    const currentMtime = stats.mtime.getTime();

    // Check cache with proper invalidation
    const cacheKey = `fs:${templateType}`;
    const cachedTemplate = this.templateCache.get(cacheKey);
    const cachedMtime = this.templateCache.get(`${cacheKey}:mtime`) as any as number;
    
    // Return cached template if file hasn't changed
    if (cachedTemplate && cachedMtime && cachedMtime >= currentMtime) {
      return cachedTemplate;
    }

    // File changed or not cached, recompile
    const templateSource = fs.readFileSync(resolvedPath, 'utf8');
    const compiledTemplate = handlebars.compile(templateSource);
    
    // Update cache with new template and mtime
    this.templateCache.set(cacheKey, compiledTemplate);
    this.templateCache.set(`${cacheKey}:mtime`, currentMtime as any);
    
    console.log(`Compiled template ${templateType} (mtime: ${currentMtime})`);
    return compiledTemplate;
  }

  /**
   * Gets template for event type (either from database or file system)
   */
  private async getTemplate(eventType: NotificationEventType): Promise<EmailTemplates | null> {
    try {
      // Load fresh template from database
      const [dbTemplate] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.type, eventType))
        .limit(1);

      return dbTemplate || null;
    } catch (error) {
      console.error('Fehler beim Laden des Templates:', error);
      return null;
    }
  }

  /**
   * Gets compiled templates with proper caching for database templates
   */
  private async getCompiledDbTemplates(eventType: NotificationEventType): Promise<{
    subject: HandlebarsTemplateDelegate;
    html: HandlebarsTemplateDelegate;
    text?: HandlebarsTemplateDelegate;
  } | null> {
    const cacheKey = `db:${eventType}`;
    
    // Get current template from database to check updates
    const dbTemplate = await this.getTemplate(eventType);
    if (!dbTemplate) {
      return null;
    }

    const currentUpdatedAt = dbTemplate.updatedAt ? new Date(dbTemplate.updatedAt).getTime() : 0;
    
    // Check cache with proper invalidation
    const cachedSubject = this.templateCache.get(`${cacheKey}:subject`);
    const cachedHtml = this.templateCache.get(`${cacheKey}:html`);
    const cachedText = this.templateCache.get(`${cacheKey}:text`);
    const cachedUpdatedAt = this.templateCache.get(`${cacheKey}:updatedAt`) as any as number;
    
    // Return cached compiled templates if DB template hasn't changed
    if (cachedSubject && cachedHtml && cachedUpdatedAt && cachedUpdatedAt >= currentUpdatedAt) {
      return {
        subject: cachedSubject,
        html: cachedHtml,
        text: cachedText || undefined
      };
    }

    // Template changed or not cached, recompile using correct field names
    const compiledSubject = handlebars.compile(dbTemplate.subject_template || dbTemplate.name);
    const compiledHtml = handlebars.compile(dbTemplate.html_template);
    let compiledText: HandlebarsTemplateDelegate | undefined;
    
    if (dbTemplate.text_template) {
      compiledText = handlebars.compile(dbTemplate.text_template);
    }
    
    // Store compiled templates in cache
    this.templateCache.set(`${cacheKey}:subject`, compiledSubject);
    this.templateCache.set(`${cacheKey}:html`, compiledHtml);
    if (compiledText) {
      this.templateCache.set(`${cacheKey}:text`, compiledText);
    }
    this.templateCache.set(`${cacheKey}:updatedAt`, currentUpdatedAt as any);
    
    console.log(`Compiled DB template ${eventType} (updatedAt: ${currentUpdatedAt})`);
    return {
      subject: compiledSubject,
      html: compiledHtml,
      text: compiledText
    };
  }

  /**
   * Renders template from database using cached compiled Handlebars templates
   */
  private async renderDatabaseTemplate(template: EmailTemplates, payload: Record<string, any>, eventType: NotificationEventType): Promise<{ subject: string; html: string; text?: string }> {
    const templateData = {
      ...payload,
      sentAt: new Date()
    };

    // Use cached compiled templates for better performance
    const compiledTemplates = await this.getCompiledDbTemplates(eventType);
    
    if (!compiledTemplates) {
      throw new Error(`Failed to compile database template for ${eventType}`);
    }

    // Render using cached compiled templates
    const subject = compiledTemplates.subject(templateData);
    const html = compiledTemplates.html(templateData);
    const text = compiledTemplates.text ? compiledTemplates.text(templateData) : undefined;

    return { subject, html, text };
  }

  /**
   * Renders template from file system
   */
  private async renderFileTemplate(eventType: NotificationEventType, payload: Record<string, any>): Promise<{ subject: string; html: string; text?: string }> {
    const compiledTemplate = await this.loadFileTemplate(eventType);
    
    const templateData = {
      ...payload,
      sentAt: new Date()
    };

    const html = compiledTemplate(templateData);
    
    // Extract title from HTML for subject
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const subject = titleMatch ? titleMatch[1] : `[${eventType}] Benachrichtigung`;

    return { subject, html };
  }

  /**
   * Triggers a notification event and sends emails to subscribed recipients
   */
  async triggerNotification(eventType: NotificationEventType, payload: Record<string, any>): Promise<{
    success: boolean;
    notificationsSent: number;
    errors: string[];
  }> {
    console.log(`📧 Triggering notification: ${eventType}`);
    
    const result = {
      success: false,
      notificationsSent: 0,
      errors: [] as string[]
    };

    try {
      // 1. Create notification event
      const event = await this.recordEvent(eventType, payload);

      // 2. Get subscribed recipients for this event type
      const subscribers = await this.getEventSubscribers(eventType);
      
      if (subscribers.length === 0) {
        console.log(`ℹ️ No subscribers for event type: ${eventType}`);
        result.success = true;
        return result;
      }

      // 3. Load template
      const template = await this.getTemplate(eventType);

      // 4. Send notifications to all subscribers
      for (const subscriber of subscribers) {
        try {
          const success = await this.sendNotificationToRecipient(
            subscriber,
            eventType,
            payload,
            template,
            event.id
          );
          
          if (success) {
            result.notificationsSent++;
          } else {
            result.errors.push(`Fehler beim Senden an ${subscriber.email}`);
          }
        } catch (error) {
          const errorMsg = `Fehler beim Senden an ${subscriber.email}: ${error}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      // Mark event as processed
      await this.markEventsProcessed([event.id]);

      result.success = result.notificationsSent > 0;
      
      console.log(`✅ Notification ${eventType} completed: ${result.notificationsSent} sent`);
      
    } catch (error) {
      const errorMsg = `Fehler beim Verarbeiten der Benachrichtigung ${eventType}: ${error}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * Gets subscribers for a specific event type with proper schedule filtering
   */
  private async getEventSubscribers(eventType: NotificationEventType): Promise<NotificationRecipient[]> {
    try {
      const subscribers = await db
        .select()
        .from(notificationRecipients)
        .innerJoin(notificationSubscriptions, eq(notificationSubscriptions.recipientId, notificationRecipients.id))
        .innerJoin(notificationSchedules, eq(notificationSubscriptions.id, notificationSchedules.subscriptionId))
        .where(
          and(
            eq(notificationSubscriptions.eventType, eventType),
            eq(notificationSubscriptions.active, true),
            eq(notificationRecipients.active, true),
            eq(notificationSchedules.active, true),
            eq(notificationSubscriptions.channel, 'email'),
            eq(notificationSchedules.frequency, 'event')
          )
        );

      return subscribers.map(sub => sub.notification_recipients);
    } catch (error) {
      console.error('Fehler beim Laden der Event-Subscriber:', error);
      return [];
    }
  }

  /**
   * Sends notification to a single recipient
   */
  private async sendNotificationToRecipient(
    recipient: NotificationRecipient,
    eventType: NotificationEventType,
    payload: Record<string, any>,
    template: EmailTemplates | null,
    eventId: number
  ): Promise<boolean> {
    try {
      let emailContent: { subject: string; html: string; text?: string };

      if (template) {
        // Use database template with Handlebars
        emailContent = await this.renderDatabaseTemplate(template, payload, eventType);
      } else {
        // Use file system template
        emailContent = await this.renderFileTemplate(eventType, payload);
      }

      // Send email
      const success = await sendEmail({
        to: recipient.email,
        from: process.env.FROM_EMAIL || 'noreply@warenwirtschaft.de',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });

      // Log notification
      await this.logNotification({
        recipientId: recipient.id,
        eventId,
        eventType,
        status: success ? 'sent' : 'failed',
        channel: 'email',
        recipient: recipient.email,
        subject: emailContent.subject,
        retryCount: 0
      });

      return success;

    } catch (error) {
      console.error(`Fehler beim Senden an ${recipient.email}:`, error);
      
      await this.logNotification({
        recipientId: recipient.id,
        eventId,
        eventType,
        status: 'failed',
        channel: 'email',
        recipient: recipient.email,
        subject: `[${eventType}] Notification`,
        errorMessage: String(error),
        retryCount: 0
      });

      return false;
    }
  }

  /**
   * Sends a test notification to validate configuration
   */
  async sendTestNotification(
    recipientEmail: string,
    eventType: NotificationEventType,
    testPayload?: Record<string, any>
  ): Promise<boolean> {
    console.log(`📧 Sending test notification: ${eventType} to ${recipientEmail}`);

    // Create test payload
    const payload: Record<string, any> = {
      machineName: 'Test Automat',
      location: 'Test Standort',
      vendonId: 'TEST001',
      timestamp: new Date(),
      currentCash: 500,
      maxThreshold: 400,
      currentCoins: 10,
      minThreshold: 50,
      productName: 'Test Produkt',
      currentStock: 2,
      mhdDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      dailyRevenue: 150.50,
      weeklyRevenue: 1250.00,
      ...testPayload
    };

    try {
      // Load template
      const template = await this.getTemplate(eventType);
      let emailContent: { subject: string; html: string; text?: string };

      if (template) {
        emailContent = await this.renderDatabaseTemplate(template, payload, eventType);
      } else {
        emailContent = await this.renderFileTemplate(eventType, payload);
      }

      // Add test prefix to subject
      emailContent.subject = `[TEST] ${emailContent.subject}`;

      // Send email
      const success = await sendEmail({
        to: recipientEmail,
        from: process.env.FROM_EMAIL || 'noreply@warenwirtschaft.de',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });

      return success;

    } catch (error) {
      console.error(`Fehler beim Senden der Test-Benachrichtigung: ${error}`);
      return false;
    }
  }

  /**
   * Processes scheduled notifications (called by cron job)
   */
  async processScheduledNotifications(): Promise<void> {
    console.log('📅 Processing scheduled notifications...');

    try {
      // Process event-based notifications
      const unprocessedEvents = await this.getUnprocessedEvents();
      
      for (const eventData of unprocessedEvents) {
        const { event, subscriptions } = eventData;
        
        for (const subData of subscriptions) {
          await this.sendNotificationToRecipient(
            subData.recipient,
            event.eventType as NotificationEventType,
            typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
            null,
            event.id
          );
        }
        
        // Mark event as processed
        await this.markEventsProcessed([event.id]);
      }

      // Process time-based notifications
      const dueNotifications = await this.getDueNotifications();
      
      for (const notificationData of dueNotifications) {
        // For scheduled notifications, we might need to aggregate data
        // This would be specific to the business logic
        console.log(`Processing due notification for ${notificationData.recipient.email}`);
      }

    } catch (error) {
      console.error('Fehler beim Verarbeiten der geplanten Benachrichtigungen:', error);
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();