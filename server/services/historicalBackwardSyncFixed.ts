/**
 * Historical Backward Sync Service - Fixed TypeScript Version
 * 
 * Systematische Rückwärts-Synchronisation von Vendon-Transaktionen
 * für vollständige historische Datensammlung seit 2020
 */

import pkg from 'pg';
const { Pool } = pkg;
import axios, { AxiosInstance } from 'axios';
import { format, subDays, subMonths, startOfMonth, endOfMonth, isAfter, isBefore } from 'date-fns';

export interface BackwardSyncConfig {
  targetStartYear: number;
  batchSize: number;
  requestDelay: number;
  retryDelay: number;
  maxRetries: number;
  enableSeasonalEnrichment: boolean;
  adaptiveTimeWindows: boolean;
  logLevel: 'minimal' | 'detailed' | 'debug';
}

export interface BackwardSyncStats {
  totalRequests: number;
  totalTransactions: number;
  savedTransactions: number;
  duplicateTransactions: number;
  errorCount: number;
  startTime: Date;
  currentDate: Date;
  estimatedCompletion: Date | null;
  monthsRemaining: number;
  successRate: number;
}

export interface MonthSyncResult {
  month: string;
  transactionCount: number;
  savedCount: number;
  duplicateCount: number;
  errorCount: number;
  duration: number;
  success: boolean;
}

export class HistoricalBackwardSync {
  private pool: any;
  private apiClient: AxiosInstance;
  private config: BackwardSyncConfig;
  private stats: BackwardSyncStats;
  private syncLogId: number | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<BackwardSyncConfig> = {}) {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Initialize API client
    this.apiClient = axios.create({
      baseURL: 'https://cloud.vendon.net/rest/v1.8.0',
      headers: {
        'Authorization': `Token ${process.env.VENDON_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Default configuration
    this.config = {
      targetStartYear: config.targetStartYear || 2020,
      batchSize: Math.min(config.batchSize || 100, 100), // API limit
      requestDelay: config.requestDelay || 1000,
      retryDelay: config.retryDelay || 5000,
      maxRetries: config.maxRetries || 3,
      enableSeasonalEnrichment: config.enableSeasonalEnrichment || true,
      adaptiveTimeWindows: config.adaptiveTimeWindows || true,
      logLevel: config.logLevel || 'detailed'
    };

    // Initialize statistics
    this.stats = {
      totalRequests: 0,
      totalTransactions: 0,
      savedTransactions: 0,
      duplicateTransactions: 0,
      errorCount: 0,
      startTime: new Date(),
      currentDate: new Date(),
      estimatedCompletion: null,
      monthsRemaining: 0,
      successRate: 0
    };
  }

  /**
   * Start the backward synchronization process
   */
  async startBackwardSync(): Promise<BackwardSyncStats> {
    if (this.isRunning) {
      throw new Error('Backward sync is already running');
    }

    this.isRunning = true;
    this.log('🚀 Starting Historical Backward Synchronization');
    this.log(`Target Start Year: ${this.config.targetStartYear}`);
    this.log(`Seasonal Enrichment: ${this.config.enableSeasonalEnrichment ? 'Enabled' : 'Disabled'}`);

    try {
      // Initialize sync log
      await this.initializeSyncLog();
      
      // Check for existing data and determine start point
      const startPoint = await this.determineStartPoint();
      
      // Perform backward sync
      await this.performBackwardSync(startPoint);
      
      // Complete sync
      await this.completeSyncLog();
      
      this.log('✅ Historical Backward Synchronization completed successfully');
      return this.stats;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`❌ Backward sync failed: ${errorMessage}`, 'error');
      await this.handleSyncError(error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the backward synchronization process
   */
  async stopBackwardSync(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.log('🛑 Stopping Historical Backward Synchronization...');
    this.isRunning = false;
    
    if (this.syncLogId) {
      await this.pool.query(
        'UPDATE sync_logs SET sync_status = $1, end_date = NOW() WHERE id = $2',
        ['stopped', this.syncLogId]
      );
    }
  }

  /**
   * Get current synchronization status
   */
  getStatus(): BackwardSyncStats & { isRunning: boolean } {
    return {
      ...this.stats,
      isRunning: this.isRunning
    };
  }

  /**
   * Initialize sync log entry
   */
  private async initializeSyncLog(): Promise<void> {
    const result = await this.pool.query(`
      INSERT INTO sync_logs (
        sync_type, sync_status, start_date, 
        sync_config, items_total, items_saved
      ) VALUES (
        'historical_backward_sync', 'running', NOW(),
        $1, 0, 0
      ) RETURNING id
    `, [JSON.stringify(this.config)]);
    
    this.syncLogId = result.rows[0].id;
    this.log(`📊 Initialized sync log ID: ${this.syncLogId}`);
  }

  /**
   * Determine the optimal starting point for backward sync
   */
  private async determineStartPoint(): Promise<Date> {
    // Check for the most recent transaction in database
    const result = await this.pool.query(`
      SELECT MAX(datetime) as latest_transaction
      FROM transactions
      WHERE source = 'vendon_api'
    `);

    const latestTransaction = result.rows[0]?.latest_transaction;
    
    if (latestTransaction) {
      const startDate = new Date(latestTransaction);
      this.log(`📅 Found latest transaction: ${format(startDate, 'yyyy-MM-dd HH:mm:ss')}`);
      this.log(`🔄 Starting backward sync from this point`);
      return startDate;
    } else {
      const startDate = new Date();
      this.log(`📅 No existing transactions found, starting from today: ${format(startDate, 'yyyy-MM-dd')}`);
      return startDate;
    }
  }

  /**
   * Perform the actual backward synchronization
   */
  private async performBackwardSync(startDate: Date): Promise<void> {
    let currentDate = startDate;
    const targetDate = new Date(this.config.targetStartYear, 0, 1);

    // Calculate total months for progress tracking
    const totalMonths = this.getMonthsDifference(targetDate, currentDate);
    this.stats.monthsRemaining = totalMonths;

    this.log(`🎯 Target range: ${format(targetDate, 'yyyy-MM-dd')} to ${format(currentDate, 'yyyy-MM-dd')}`);
    this.log(`📊 Estimated months to process: ${totalMonths}`);

    while (isAfter(currentDate, targetDate) && this.isRunning) {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);

      // Don't go beyond target date
      if (isBefore(monthStart, targetDate)) {
        monthStart.setTime(targetDate.getTime());
      }

      this.log(`📅 Processing month: ${format(monthStart, 'yyyy-MM')}`, 'detailed');
      this.stats.currentDate = monthStart;

      try {
        const monthResult = await this.syncMonth(monthStart, monthEnd);
        this.updateProgressStats(monthResult);
        
        this.log(`✅ Month completed: ${monthResult.transactionCount} transactions, ${monthResult.savedCount} saved`, 'detailed');
        
      } catch (error: unknown) {
        this.stats.errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`❌ Month sync failed: ${errorMessage}`, 'error');
        
        // Continue with next month on error
      }

      // Move to previous month
      currentDate = subMonths(monthStart, 1);
      this.stats.monthsRemaining--;
      
      // Update estimated completion
      this.updateEstimatedCompletion();
      
      // Rate limiting
      await this.delay(this.config.requestDelay);
    }
  }

  /**
   * Synchronize a specific month
   */
  private async syncMonth(monthStart: Date, monthEnd: Date): Promise<MonthSyncResult> {
    const startTime = Date.now();
    let totalTransactions = 0;
    let savedTransactions = 0;
    let duplicateTransactions = 0;
    let errorCount = 0;

    // Determine optimal time window for this month
    const timeWindowHours = this.config.adaptiveTimeWindows 
      ? await this.getOptimalTimeWindow(monthStart)
      : 24;

    let currentTime = monthEnd;
    
    while (isAfter(currentTime, monthStart) && this.isRunning) {
      const windowStart = new Date(currentTime);
      windowStart.setHours(windowStart.getHours() - timeWindowHours);
      
      // Don't go before month start
      if (isBefore(windowStart, monthStart)) {
        windowStart.setTime(monthStart.getTime());
      }

      try {
        const windowResult = await this.syncTimeWindow(windowStart, currentTime);
        
        totalTransactions += windowResult.transactionCount;
        savedTransactions += windowResult.savedCount;
        duplicateTransactions += windowResult.duplicateCount;
        
        // Handle API limit scenario
        if (windowResult.transactionCount === this.config.batchSize) {
          this.log(`⚠️ API limit reached in window, using timestamp-based continuation`, 'debug');
          currentTime = new Date(windowResult.lastTimestamp! * 1000);
        } else {
          currentTime = windowStart;
        }
        
      } catch (error: unknown) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`❌ Time window sync failed: ${errorMessage}`, 'debug');
        
        // Continue with next window
        currentTime = windowStart;
      }

      await this.delay(this.config.requestDelay);
    }

    const duration = Date.now() - startTime;
    
    return {
      month: format(monthStart, 'yyyy-MM'),
      transactionCount: totalTransactions,
      savedCount: savedTransactions,
      duplicateCount: duplicateTransactions,
      errorCount,
      duration,
      success: errorCount === 0
    };
  }

  /**
   * Synchronize a specific time window
   */
  private async syncTimeWindow(startTime: Date, endTime: Date): Promise<{
    transactionCount: number;
    savedCount: number;
    duplicateCount: number;
    lastTimestamp?: number;
  }> {
    const startTimestamp = Math.floor(startTime.getTime() / 1000);
    const endTimestamp = Math.floor(endTime.getTime() / 1000);

    this.log(`🔍 Fetching window: ${format(startTime, 'yyyy-MM-dd HH:mm')} to ${format(endTime, 'yyyy-MM-dd HH:mm')}`, 'debug');

    // Fetch data from Vendon API
    const transactions = await this.fetchVendonTransactions(startTimestamp, endTimestamp);
    this.stats.totalRequests++;

    if (transactions.length === 0) {
      this.log(`📭 No transactions in window`, 'debug');
      return { transactionCount: 0, savedCount: 0, duplicateCount: 0 };
    }

    // Sort transactions by timestamp for proper continuation
    const sortedTransactions = transactions.sort((a, b) => a.datetime - b.datetime);
    const lastTimestamp = sortedTransactions[sortedTransactions.length - 1].datetime;

    // Save transactions to database
    let savedCount = 0;
    let duplicateCount = 0;

    for (const transaction of sortedTransactions) {
      try {
        const enrichedTransaction = this.config.enableSeasonalEnrichment
          ? await this.enrichTransactionWithSeasonalData(transaction)
          : transaction;

        const saved = await this.saveTransaction(enrichedTransaction);
        
        if (saved) {
          savedCount++;
        } else {
          duplicateCount++;
        }
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`❌ Failed to save transaction ${transaction.transaction_id}: ${errorMessage}`, 'debug');
        this.stats.errorCount++;
      }
    }

    this.log(`💾 Saved ${savedCount} transactions, ${duplicateCount} duplicates`, 'debug');

    return {
      transactionCount: transactions.length,
      savedCount,
      duplicateCount,
      lastTimestamp
    };
  }

  /**
   * Fetch transactions from Vendon API
   */
  private async fetchVendonTransactions(startTimestamp: number, endTimestamp: number, retryCount = 0): Promise<any[]> {
    try {
      const response = await this.apiClient.get('/stats/vends', {
        params: {
          from_timestamp: startTimestamp,
          to_timestamp: endTimestamp,
          limit: this.config.batchSize
        }
      });

      if (response.data && response.data.code === 200 && Array.isArray(response.data.result)) {
        return response.data.result;
      } else {
        this.log(`⚠️ Unexpected API response: ${JSON.stringify(response.data)}`, 'debug');
        return [];
      }
      
    } catch (error: unknown) {
      if (retryCount < this.config.maxRetries) {
        this.log(`🔄 Retrying API request (attempt ${retryCount + 1}/${this.config.maxRetries})`, 'debug');
        await this.delay(this.config.retryDelay);
        return this.fetchVendonTransactions(startTimestamp, endTimestamp, retryCount + 1);
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`API request failed after ${this.config.maxRetries} retries: ${errorMessage}`);
    }
  }

  /**
   * Enrich transaction with seasonal data
   */
  private async enrichTransactionWithSeasonalData(transaction: any): Promise<any> {
    const datetime = new Date(transaction.datetime * 1000);
    
    // Calculate seasonal fields
    const seasonalData = {
      week_of_year: this.getWeekOfYear(datetime),
      day_of_year: this.getDayOfYear(datetime),
      season: this.getSeason(datetime),
      is_holiday: await this.isHoliday(datetime),
      is_vacation: await this.isVacation(datetime)
    };
    
    return {
      ...transaction,
      ...seasonalData
    };
  }

  /**
   * Save transaction to database
   */
  private async saveTransaction(transaction: any): Promise<boolean> {
    const query = `
      INSERT INTO transactions (
        vendon_id, machine_id, machine_name, datetime, transaction_dt, registered_dt,
        product_name, selection, stock_id, quantity, price, price_vat, currency,
        payment_method, payment_type, source, extra_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      ON CONFLICT (vendon_id) DO NOTHING
      RETURNING id
    `;

    const values = [
      transaction.transaction_id?.toString(),
      transaction.machine_id,
      transaction.machine_name,
      new Date(transaction.datetime * 1000),
      transaction.transaction_dt ? new Date(transaction.transaction_dt * 1000) : null,
      transaction.registered_dt ? new Date(transaction.registered_dt * 1000) : null,
      transaction.name || transaction.product_name,
      transaction.selection,
      transaction.stock_id,
      transaction.quantity || 1,
      transaction.price || 0,
      transaction.price_vat || 0,
      transaction.currency || 'EUR',
      transaction.payment_method,
      transaction.payment_type,
      'historical_backward_sync',
      JSON.stringify(transaction)
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows.length > 0;
    } catch (error: unknown) {
      // Check if it's a unique constraint violation (duplicate)
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return false; // Duplicate
      }
      throw error;
    }
  }

  /**
   * Get optimal time window based on historical transaction density
   */
  private async getOptimalTimeWindow(monthDate: Date): Promise<number> {
    // Query average transaction density for this month in previous years
    const result = await this.pool.query(`
      SELECT AVG(daily_count) as avg_daily_transactions
      FROM (
        SELECT DATE(datetime) as day, COUNT(*) as daily_count
        FROM transactions
        WHERE EXTRACT(month FROM datetime) = $1
          AND EXTRACT(year FROM datetime) < $2
        GROUP BY DATE(datetime)
      ) daily_stats
    `, [monthDate.getMonth() + 1, monthDate.getFullYear()]);

    const avgDaily = parseFloat(result.rows[0]?.avg_daily_transactions || '50');
    
    // Adaptive time window based on density
    if (avgDaily > 200) return 1;   // 1 hour for high density
    if (avgDaily > 100) return 4;   // 4 hours for medium density
    if (avgDaily > 50) return 12;   // 12 hours for low density
    return 24;                      // 24 hours for very low density
  }

  /**
   * Utility functions for seasonal data
   */
  private getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (24 * 60 * 60 * 1000));
  }

  private getSeason(date: Date): string {
    const month = date.getMonth() + 1;
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn';
  }

  private async isHoliday(date: Date): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT COUNT(*) > 0 as is_holiday FROM holidays WHERE date = $1',
      [format(date, 'yyyy-MM-dd')]
    );
    return result.rows[0]?.is_holiday || false;
  }

  private async isVacation(date: Date): Promise<boolean> {
    // This would check against vacation/school holiday data
    // Implementation depends on your vacation data structure
    return false;
  }

  /**
   * Update progress statistics
   */
  private updateProgressStats(monthResult: MonthSyncResult): void {
    this.stats.totalTransactions += monthResult.transactionCount;
    this.stats.savedTransactions += monthResult.savedCount;
    this.stats.duplicateTransactions += monthResult.duplicateCount;
    this.stats.errorCount += monthResult.errorCount;
    
    // Calculate success rate
    this.stats.successRate = this.stats.totalRequests > 0 
      ? (this.stats.totalRequests - this.stats.errorCount) / this.stats.totalRequests * 100
      : 0;
  }

  /**
   * Update estimated completion time
   */
  private updateEstimatedCompletion(): void {
    if (this.stats.monthsRemaining > 0) {
      const elapsed = Date.now() - this.stats.startTime.getTime();
      const monthsProcessed = this.getMonthsDifference(this.stats.startTime, this.stats.currentDate);
      
      if (monthsProcessed > 0) {
        const avgTimePerMonth = elapsed / monthsProcessed;
        const remainingTime = avgTimePerMonth * this.stats.monthsRemaining;
        this.stats.estimatedCompletion = new Date(Date.now() + remainingTime);
      }
    }
  }

  /**
   * Calculate months difference between two dates
   */
  private getMonthsDifference(startDate: Date, endDate: Date): number {
    return (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
           (endDate.getMonth() - startDate.getMonth());
  }

  /**
   * Complete sync log
   */
  private async completeSyncLog(): Promise<void> {
    if (this.syncLogId) {
      await this.pool.query(`
        UPDATE sync_logs SET 
          sync_status = 'completed',
          end_date = NOW(),
          items_found = $1,
          items_saved = $2,
          duplicates = $3,
          errors = $4,
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - start_date))
        WHERE id = $5
      `, [
        this.stats.totalTransactions,
        this.stats.savedTransactions,
        this.stats.duplicateTransactions,
        this.stats.errorCount,
        this.syncLogId
      ]);
    }
  }

  /**
   * Handle sync error
   */
  private async handleSyncError(error: unknown): Promise<void> {
    if (this.syncLogId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.pool.query(`
        UPDATE sync_logs SET 
          sync_status = 'failed',
          end_date = NOW(),
          error_message = $1,
          items_found = $2,
          items_saved = $3,
          errors = $4
        WHERE id = $5
      `, [
        errorMessage,
        this.stats.totalTransactions,
        this.stats.savedTransactions,
        this.stats.errorCount,
        this.syncLogId
      ]);
    }
  }

  /**
   * Logging function with different levels
   */
  private log(message: string, level: 'info' | 'detailed' | 'debug' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const logLevels = { minimal: 0, detailed: 1, debug: 2 };
    const messageLevels = { info: 0, detailed: 1, debug: 2, error: 0 };

    if (messageLevels[level] <= logLevels[this.config.logLevel] || level === 'error') {
      console.log(`[${timestamp}] [BACKWARD-SYNC] ${message}`);
    }
  }

  /**
   * Delay function for rate limiting
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}