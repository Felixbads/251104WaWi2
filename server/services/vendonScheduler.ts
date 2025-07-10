/**
 * VENDON SYNCHRONIZATION SCHEDULER
 * Ensures continuous, reliable synchronization with automatic recovery
 */

import { ultraRobustVendonSync } from './ultraRobustVendonSync';
import { vendonSync } from './vendonSync';

class VendonScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastSyncTime: Date | null = null;
  private failureCount = 0;
  private readonly maxFailures = 3;

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

    // Schedule regular syncs every 5 minutes
    this.intervalId = setInterval(() => {
      this.performSync();
    }, 5 * 60 * 1000); // 5 minutes

    console.log('Vendon Scheduler started - syncing every 5 minutes');
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
      nextSyncIn: this.intervalId ? '5 minutes' : 'Not scheduled'
    };
  }

  /**
   * Forces an immediate sync
   */
  async triggerImmediateSync() {
    console.log('Triggering immediate Vendon sync...');
    await this.performSync();
  }
}

// Export singleton instance
export const vendonScheduler = new VendonScheduler();

// Auto-start the scheduler
vendonScheduler.start();