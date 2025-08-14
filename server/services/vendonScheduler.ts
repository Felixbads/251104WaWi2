/**
 * VENDON SYNCHRONIZATION SCHEDULER
 * Ensures continuous, reliable synchronization with automatic recovery
 */

import { ultraRobustVendonSync } from './ultraRobustVendonSync';
import { vendonSync } from './vendonSync';
import { vendonHistoryImporter } from './vendonHistoryImporter';

class VendonScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastSyncTime: Date | null = null;
  private failureCount = 0;
  private readonly maxFailures = 3;
  private historicalBackfillCompleted = false;

  constructor() {
    console.log('Vendon Scheduler initialized');
  }

  /**
   * Starts the automatic synchronization scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('Vendon Scheduler already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Vendon Scheduler...');

    // Run initial sync immediately
    this.performSync();

    // Schedule regular syncs every 10 minutes
    this.intervalId = setInterval(() => {
      this.performSync();
    }, 10 * 60 * 1000); // 10 minutes

    console.log('Vendon Scheduler started - syncing every 10 minutes');

    // Start historical backfill in the background (only once)
    if (!this.historicalBackfillCompleted) {
      this.performHistoricalBackfill().catch(error => {
        console.error('Historical backfill failed:', error);
      });
    }
  }

  /**
   * Stops the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Vendon Scheduler stopped');
  }

  /**
   * Performs a single synchronization attempt
   */
  private async performSync() {
    try {
      console.log('Starting scheduled Vendon sync...');

      // 1. Sync transactions - nur letzte 6 Stunden für aktuelle Daten
      const transactionResult = await vendonSync.syncTransactions(
        new Date(Date.now() - 6 * 60 * 60 * 1000), // nur letzte 6 Stunden
        new Date(), // jetzt
        200, // kleinere Batch-Größe für aktuellere Synchronisierung
        1000, // weniger Transaktionen pro Durchlauf
        false // forceUpdate
      );

      console.log('Transaction sync completed:', transactionResult.message);

      // 2. Sync events (for door openings) - nur letzte 2 Stunden
      try {
        const eventsResult = await vendonSync.syncEvents(
          new Date(Date.now() - 2 * 60 * 60 * 1000), // nur letzte 2 Stunden
          new Date(), // jetzt
          50 // kleinere Batch-Größe
        );
        console.log('Events sync completed:', eventsResult.message);
      } catch (eventsError) {
        console.error('Events sync failed:', eventsError);
      }

      // 3. Sync refills (for refill data) - nur letzte 4 Stunden
      try {
        const refillsResult = await vendonSync.syncRefills(
          new Date(Date.now() - 4 * 60 * 60 * 1000), // nur letzte 4 Stunden
          new Date(), // jetzt
          50 // kleinere Batch-Größe
        );
        console.log('Refills sync completed:', refillsResult.message);
      } catch (refillsError) {
        console.error('Refills sync failed:', refillsError);
      }

      // Reset failure count on success
      this.failureCount = 0;
      this.lastSyncTime = new Date();

      // If we got very few transactions, try ultra-robust sync
      if (transactionResult.message.includes('0 neu') || transactionResult.message.includes('0 new')) {
        console.log('No new transactions found, trying ultra-robust sync...');
        
        try {
          const ultraResult = await ultraRobustVendonSync.performCompleteSync();
          console.log('Ultra-robust sync result:', ultraResult.message);
        } catch (ultraError) {
          console.error('Ultra-robust sync failed:', ultraError);
        }
      }

    } catch (error) {
      this.failureCount++;
      console.error(`Scheduled sync failed (attempt ${this.failureCount}/${this.maxFailures}):`, error);

      // If we've failed too many times, try the ultra-robust sync
      if (this.failureCount >= this.maxFailures) {
        console.log('Multiple failures detected, attempting ultra-robust recovery...');
        
        try {
          const recoveryResult = await ultraRobustVendonSync.performCompleteSync();
          console.log('Recovery sync completed:', recoveryResult.message);
          this.failureCount = 0; // Reset on successful recovery
        } catch (recoveryError) {
          console.error('Recovery sync also failed:', recoveryError);
        }
      }
    }
  }

  /**
   * Returns the current scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      failureCount: this.failureCount,
      nextSyncIn: this.intervalId ? '10 minutes' : 'Not scheduled',
      historicalBackfillCompleted: this.historicalBackfillCompleted
    };
  }

  /**
   * Forces an immediate sync
   */
  async triggerImmediateSync() {
    console.log('Triggering immediate Vendon sync...');
    await this.performSync();
  }

  /**
   * Performs historical backfill for the last 3 months
   */
  private async performHistoricalBackfill() {
    try {
      console.log('🕒 Starting historical backfill for the last 3 months...');
      
      // Calculate 3 months ago
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      const today = new Date();
      
      const options = {
        startDate: threeMonthsAgo.toISOString(),
        endDate: today.toISOString(),
        batchSize: 100,
        maxTransactions: 50000, // Reasonable limit for background task
        syncStep: 7, // Process 7 days at a time
        forceUpdate: false
      };
      
      console.log(`Historical backfill: Processing from ${threeMonthsAgo.toISOString()} to ${today.toISOString()}`);
      
      const result = await vendonHistoryImporter.startImport(options);
      
      console.log('✅ Historical backfill completed:', result);
      this.historicalBackfillCompleted = true;
      
      // Schedule daily task for ongoing historical gaps
      this.scheduleDailyHistoricalCheck();
      
    } catch (error) {
      console.error('❌ Historical backfill failed:', error);
      // Retry after 1 hour
      setTimeout(() => {
        this.performHistoricalBackfill().catch(retryError => {
          console.error('Historical backfill retry also failed:', retryError);
        });
      }, 60 * 60 * 1000); // 1 hour
    }
  }

  /**
   * Schedules a daily task to check for and fill historical gaps
   */
  private scheduleDailyHistoricalCheck() {
    // Run daily at 02:00 AM to check for gaps
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0); // 2 AM
    
    const msUntilTomorrow = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      // Check for gaps in the last 7 days and fill them
      this.fillRecentGaps();
      
      // Schedule to run every 24 hours
      setInterval(() => {
        this.fillRecentGaps();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilTomorrow);
    
    console.log(`📅 Daily historical gap check scheduled for ${tomorrow.toISOString()}`);
  }

  /**
   * Fills gaps in the last 7 days
   */
  private async fillRecentGaps() {
    try {
      console.log('🔍 Checking for gaps in the last 7 days...');
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const options = {
        startDate: sevenDaysAgo.toISOString(),
        endDate: new Date().toISOString(),
        batchSize: 100,
        maxTransactions: 10000,
        syncStep: 1, // Process day by day
        forceUpdate: true // Force update to fill gaps
      };
      
      await vendonHistoryImporter.startImport(options);
      console.log('✅ Recent gaps check completed');
      
    } catch (error) {
      console.error('❌ Recent gaps check failed:', error);
    }
  }
}

// Export singleton instance
export const vendonScheduler = new VendonScheduler();

// CRITICAL FIX: TEMPORARILY DISABLED DUE TO DATABASE CONSTRAINT ERRORS
// Auto-start the scheduler
// vendonScheduler.start();