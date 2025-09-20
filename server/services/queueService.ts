import PgBoss from 'pg-boss';
import { notificationService } from './notificationService';
import { NotificationEventType } from '@shared/schema';

/**
 * Queue Service using pg-boss for PostgreSQL-based job scheduling
 * Handles notification dispatching and email sending queues
 */
export class QueueService {
  private boss: PgBoss | null = null;
  private isInitialized = false;

  /**
   * Initialize pg-boss with database connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for queue service');
    }

    this.boss = new PgBoss({
      connectionString,
      application_name: 'proviantomat-notifications',
      // Archive jobs after 24 hours
      archiveCompletedAfterSeconds: 24 * 60 * 60,
      // Delete archived jobs after 7 days  
      deleteAfterHours: 7 * 24,
      // Retry failed jobs with exponential backoff
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      // Maintenance runs every hour
      maintenanceIntervalSeconds: 60 * 60,
    });

    // Initialize the database schema
    await this.boss.start();

    // Set up job handlers
    await this.setupJobHandlers();

    this.isInitialized = true;
    console.log('Queue service initialized successfully');
  }

  /**
   * Set up job handlers for different queue types
   */
  private async setupJobHandlers(): Promise<void> {
    if (!this.boss) throw new Error('Queue service not initialized');

    // Handler for checking and dispatching scheduled notifications
    await this.boss.work('dispatch-notifications', {
      batchSize: 1,
    }, async (jobs) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      console.log('Processing dispatch-notifications job:', job.id);
      await this.processDispatchNotifications(job.data);
    });

    // Handler for processing event-based notifications
    await this.boss.work('process-events', {
      batchSize: 5,
    }, async (jobs) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      console.log('Processing process-events job:', job.id);
      await this.processEventNotifications(job.data);
    });

    // Handler for sending individual emails
    await this.boss.work('send-email', {
      batchSize: 10,
    }, async (jobs) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      console.log('Processing send-email job:', job.id);
      await this.processSendEmail(job.data);
    });

    // Handler for generating and sending reports
    await this.boss.work('generate-report', {
      batchSize: 2,
    }, async (jobs) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      console.log('Processing generate-report job:', job.id);
      await this.processGenerateReport(job.data);
    });

    console.log('Job handlers set up successfully');
  }

  /**
   * Schedule recurring job to check for due notifications
   */
  async scheduleDispatchJob(): Promise<void> {
    if (!this.boss) throw new Error('Queue service not initialized');

    // Run every minute to check for due notifications
    await this.boss.schedule('dispatch-notifications', '*/1 * * * *', {}, {
      tz: 'Europe/Berlin'
    });

    console.log('Dispatch notifications job scheduled');
  }

  /**
   * Schedule recurring job to process unprocessed events
   */
  async scheduleEventProcessingJob(): Promise<void> {
    if (!this.boss) throw new Error('Queue service not initialized');

    // Run every 30 seconds to process events
    await this.boss.schedule('process-events', '*/30 * * * * *', {}, {
      tz: 'Europe/Berlin'
    });

    console.log('Event processing job scheduled');
  }

  /**
   * Add a job to send an email
   */
  async queueEmail(data: {
    recipientId: number;
    eventId?: number;
    subscriptionId?: number;
    eventType: NotificationEventType;
    recipient: string;
    subject: string;
    templateName: string;
    templateData: Record<string, any>;
  }): Promise<string | null> {
    if (!this.boss) throw new Error('Queue service not initialized');

    const jobId = await this.boss.send('send-email', data, {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true
    });

    console.log(`Queued email job ${jobId} for ${data.recipient}`);
    return jobId;
  }

  /**
   * Add a job to generate a report
   */
  async queueReport(data: {
    eventType: NotificationEventType;
    reportData: Record<string, any>;
    recipients: Array<{
      recipientId: number;
      subscriptionId: number;
      email: string;
    }>;
  }): Promise<string | null> {
    if (!this.boss) throw new Error('Queue service not initialized');

    const jobId = await this.boss.send('generate-report', data, {
      retryLimit: 2,
      retryDelay: 120
    });

    console.log(`Queued report generation job ${jobId} for ${data.eventType}`);
    return jobId;
  }

  /**
   * Process scheduled notifications that are due
   */
  private async processDispatchNotifications(jobData: any): Promise<void> {
    try {
      const currentTime = new Date();
      const dueNotifications = await notificationService.getDueNotifications(currentTime);

      console.log(`Found ${dueNotifications.length} due notifications`);

      for (const { subscription, recipient, schedule } of dueNotifications) {
        // For scheduled notifications, we need to generate the appropriate data
        let templateData: Record<string, any> = {};
        let subject = '';

        switch (subscription.eventType) {
          case 'sales_yesterday':
            // This will be implemented by trigger services
            await this.queueReport({
              eventType: subscription.eventType,
              reportData: { date: new Date(currentTime.getTime() - 24 * 60 * 60 * 1000) },
              recipients: [{
                recipientId: recipient.id,
                subscriptionId: subscription.id,
                email: recipient.email
              }]
            });
            break;

          case 'sales_weekly':
            await this.queueReport({
              eventType: subscription.eventType,
              reportData: { 
                endDate: currentTime,
                startDate: new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000)
              },
              recipients: [{
                recipientId: recipient.id,
                subscriptionId: subscription.id,
                email: recipient.email
              }]
            });
            break;

          case 'margin_report':
          case 'forecast_week':
            await this.queueReport({
              eventType: subscription.eventType,
              reportData: { date: currentTime },
              recipients: [{
                recipientId: recipient.id,
                subscriptionId: subscription.id,
                email: recipient.email
              }]
            });
            break;

          default:
            console.log(`Skipping scheduled notification for event type: ${subscription.eventType}`);
        }
      }
    } catch (error) {
      console.error('Error processing dispatch notifications:', error);
      throw error;
    }
  }

  /**
   * Process unprocessed events for event-based notifications
   */
  private async processEventNotifications(jobData: any): Promise<void> {
    try {
      const eventsWithSubscriptions = await notificationService.getUnprocessedEvents();
      const processedEventIds: number[] = [];

      console.log(`Processing ${eventsWithSubscriptions.length} unprocessed events`);

      for (const { event, subscriptions } of eventsWithSubscriptions) {
        for (const { subscription, recipient } of subscriptions) {
          // Queue email for each subscription
          await this.queueEmail({
            recipientId: recipient.id,
            eventId: event.id,
            subscriptionId: subscription.id,
            eventType: event.eventType,
            recipient: recipient.email,
            subject: this.generateSubject(event.eventType, event.payload),
            templateName: event.eventType,
            templateData: event.payload
          });
        }

        processedEventIds.push(event.id);
      }

      // Mark events as processed
      if (processedEventIds.length > 0) {
        await notificationService.markEventsProcessed(processedEventIds);
        console.log(`Marked ${processedEventIds.length} events as processed`);
      }
    } catch (error) {
      console.error('Error processing event notifications:', error);
      throw error;
    }
  }

  /**
   * Process individual email sending
   */
  private async processSendEmail(data: {
    recipientId: number;
    eventId?: number;
    subscriptionId?: number;
    eventType: NotificationEventType;
    recipient: string;
    subject: string;
    templateName: string;
    templateData: Record<string, any>;
  }): Promise<void> {
    try {
      // This will be implemented when we create the mailer service
      console.log(`Sending email to ${data.recipient} for event ${data.eventType}`);
      
      // For now, just log the notification
      await notificationService.logNotification({
        subscriptionId: data.subscriptionId,
        eventId: data.eventId,
        recipientId: data.recipientId,
        eventType: data.eventType,
        status: 'sent',
        channel: 'email',
        recipient: data.recipient,
        subject: data.subject,
        sentAt: new Date(),
        retryCount: 0
      });

      console.log(`Email sent successfully to ${data.recipient}`);
    } catch (error) {
      console.error('Error sending email:', error);
      
      // Log the failure
      await notificationService.logNotification({
        subscriptionId: data.subscriptionId,
        eventId: data.eventId,
        recipientId: data.recipientId,
        eventType: data.eventType,
        status: 'failed',
        channel: 'email',
        recipient: data.recipient,
        subject: data.subject,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date(),
        retryCount: 0
      });

      throw error;
    }
  }

  /**
   * Process report generation
   */
  private async processGenerateReport(data: {
    eventType: NotificationEventType;
    reportData: Record<string, any>;
    recipients: Array<{
      recipientId: number;
      subscriptionId: number;
      email: string;
    }>;
  }): Promise<void> {
    try {
      console.log(`Generating report for ${data.eventType}`);
      
      // This will be implemented by trigger services
      // For now, queue individual emails for each recipient
      for (const recipient of data.recipients) {
        await this.queueEmail({
          recipientId: recipient.recipientId,
          subscriptionId: recipient.subscriptionId,
          eventType: data.eventType,
          recipient: recipient.email,
          subject: this.generateSubject(data.eventType, data.reportData),
          templateName: data.eventType,
          templateData: data.reportData
        });
      }

      console.log(`Report generated and queued for ${data.recipients.length} recipients`);
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Generate email subject based on event type and payload
   */
  private generateSubject(eventType: NotificationEventType, payload: Record<string, any>): string {
    switch (eventType) {
      case 'coin_low':
        return `🪙 Münzbestand niedrig - ${payload.machineName || 'Automat'}`;
      case 'cash_high':
        return `💰 Bargeldabholung erforderlich - ${payload.machineName || 'Automat'}`;
      case 'mhd_soon':
        return `⏰ MHD-Warnung - ${payload.productName || 'Produkte'} ablaufend`;
      case 'stock_low':
        return `📦 Lagerbestand niedrig - ${payload.productName || 'Produkte'}`;
      case 'sales_yesterday':
        return `📊 Gestrige Umsätze - ${new Date().toLocaleDateString('de-DE')}`;
      case 'sales_weekly':
        return `📈 Wochenumsätze - KW ${Math.ceil((new Date()).getDate() / 7)}`;
      case 'margin_report':
        return `💹 Ergebnis & Marge - ${new Date().toLocaleDateString('de-DE')}`;
      case 'forecast_week':
        return `🔮 Prognose für 7 Tage - ${new Date().toLocaleDateString('de-DE')}`;
      default:
        return `Proviantomat Benachrichtigung - ${eventType}`;
    }
  }

  /**
   * Get queue status and statistics
   */
  async getQueueStatus(): Promise<any> {
    if (!this.boss) throw new Error('Queue service not initialized');

    const [
      dispatchStats,
      eventStats,
      emailStats,
      reportStats
    ] = await Promise.all([
      this.boss.getQueueSize('dispatch-notifications'),
      this.boss.getQueueSize('process-events'), 
      this.boss.getQueueSize('send-email'),
      this.boss.getQueueSize('generate-report')
    ]);

    return {
      'dispatch-notifications': dispatchStats,
      'process-events': eventStats,
      'send-email': emailStats,
      'generate-report': reportStats
    };
  }

  /**
   * Gracefully shutdown the queue service
   */
  async shutdown(): Promise<void> {
    if (this.boss) {
      await this.boss.stop();
      this.boss = null;
      this.isInitialized = false;
      console.log('Queue service stopped');
    }
  }
}

// Export singleton instance
export const queueService = new QueueService();