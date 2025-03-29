import { storage } from "../storage";
import { InsertSyncLog, InsertMachine, InsertTransaction, InsertEvent } from "@shared/schema";

// Mock Vendon API client (would be replaced with actual implementation)
class VendonAPI {
  // This is a mock implementation - in reality, this would connect to the Vendon API
  async getMachines() {
    // In a real implementation, this would fetch machines from the Vendon API
    return [];
  }

  async getTransactions(startDate: string, endDate: string, page = 1, limit = 100) {
    // In a real implementation, this would fetch transactions from the Vendon API
    return { data: [], total: 0, page, limit };
  }

  async getEvents(startDate: string, endDate: string, page = 1, limit = 100) {
    // In a real implementation, this would fetch events from the Vendon API
    return { data: [], total: 0, page, limit };
  }
}

export class VendonSyncService {
  private api: VendonAPI;

  constructor() {
    this.api = new VendonAPI();
  }

  // Format date to API expected format: YYYY-MM-DD
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Synchronize machines
  async syncMachines(): Promise<{ syncLogId: number; status: string; message: string }> {
    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'machines',
      startDate: new Date(),
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Fetch machines from Vendon API
      const machines = await this.api.getMachines();
      
      // Process results
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;

      for (const machine of machines) {
        try {
          // Check if machine already exists
          const existing = await storage.getMachineByVendonId(machine.vendon_id);
          
          if (existing) {
            // Update machine
            await storage.updateMachine(existing.id, {
              machineName: machine.name,
              machineType: machine.type,
              status: machine.status,
              model: machine.model,
              serialNumber: machine.serial_number,
              lastSync: new Date(),
              additionalData: JSON.stringify(machine.additional_data),
              locationId: machine.location_id,
            });
            itemsUpdated++;
          } else {
            // Create new machine
            const newMachine: InsertMachine = {
              vendonId: machine.vendon_id,
              machineName: machine.name,
              machineType: machine.type,
              status: machine.status,
              model: machine.model,
              serialNumber: machine.serial_number,
              lastSync: new Date(),
              additionalData: JSON.stringify(machine.additional_data),
              locationId: machine.location_id,
            };
            await storage.createMachine(newMachine);
            itemsSaved++;
          }
        } catch (error) {
          errors++;
          console.error(`Error processing machine ${machine.vendon_id}:`, error);
        }
      }

      // Update sync log with results
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        itemsFound: machines.length,
        itemsSaved,
        itemsUpdated,
        duplicates,
        errors,
        durationSeconds,
        syncStatus: 'completed',
      });

      return {
        syncLogId,
        status: 'success',
        message: `Synchronized ${machines.length} machines: ${itemsSaved} saved, ${itemsUpdated} updated, ${errors} errors`,
      };
    } catch (error) {
      // Log error and update sync log
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Machine synchronization error:', error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });

      return {
        syncLogId,
        status: 'error',
        message: `Machine synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Synchronize transactions with date range and pagination
  async syncTransactions(
    startDate?: Date,
    endDate?: Date,
    batchSize = 100
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Use current date as end date if not provided
    const effectiveEndDate = endDate || new Date();
    
    // If start date is not provided, use the date of the last transaction or a default date (1 week ago)
    let effectiveStartDate = startDate;
    if (!effectiveStartDate) {
      // Get the latest sync log to determine the last sync date
      const lastSyncLog = await storage.getLatestSyncLog('transactions');
      if (lastSyncLog && lastSyncLog.endDate) {
        effectiveStartDate = new Date(lastSyncLog.endDate);
      } else {
        // Default to 1 week ago if no previous sync
        effectiveStartDate = new Date();
        effectiveStartDate.setDate(effectiveStartDate.getDate() - 7);
      }
    }

    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'transactions',
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Initialize counters
      let itemsFound = 0;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      let page = 1;
      let hasMorePages = true;

      // Format dates for API
      const formattedStartDate = this.formatDate(effectiveStartDate);
      const formattedEndDate = this.formatDate(effectiveEndDate);

      // Process paginated results
      while (hasMorePages) {
        // Fetch transactions from Vendon API
        const result = await this.api.getTransactions(
          formattedStartDate,
          formattedEndDate,
          page,
          batchSize
        );

        const transactions = result.data;
        itemsFound += transactions.length;

        // Process transactions
        for (const transaction of transactions) {
          try {
            // Create transaction object
            const newTransaction: InsertTransaction = {
              vendonId: transaction.id,
              machineId: transaction.machine_id,
              productId: transaction.product_id,
              price: transaction.price,
              datetime: new Date(transaction.datetime),
              productName: transaction.product_name,
              machineName: transaction.machine_name,
              transactionType: transaction.type,
              paymentType: transaction.payment_type,
              paymentMethod: transaction.payment_method,
              status: transaction.status,
              currency: transaction.currency,
              extraData: JSON.stringify(transaction.extra_data),
              locationId: transaction.location_id,
            };

            // Attempt to insert transaction
            await storage.createTransaction(newTransaction);
            itemsSaved++;
          } catch (error) {
            // Check if it's a duplicate error
            if (error instanceof Error && error.message.includes('duplicate')) {
              duplicates++;
            } else {
              errors++;
              console.error(`Error processing transaction ${transaction.id}:`, error);
            }
          }
        }

        // Check if there are more pages
        hasMorePages = transactions.length === batchSize && page * batchSize < result.total;
        page++;

        // Update sync log with progress
        await storage.updateSyncLog(syncLogId, {
          itemsFound,
          itemsSaved,
          itemsUpdated,
          duplicates,
          errors,
        });
      }

      // Update sync log with final results
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        durationSeconds,
        syncStatus: 'completed',
      });

      return {
        syncLogId,
        status: 'success',
        message: `Synchronized ${itemsFound} transactions: ${itemsSaved} saved, ${duplicates} duplicates, ${errors} errors`,
      };
    } catch (error) {
      // Log error and update sync log
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Transaction synchronization error:', error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });

      return {
        syncLogId,
        status: 'error',
        message: `Transaction synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Synchronize events with date range and pagination
  async syncEvents(
    startDate?: Date,
    endDate?: Date,
    batchSize = 100
  ): Promise<{ syncLogId: number; status: string; message: string }> {
    // Use current date as end date if not provided
    const effectiveEndDate = endDate || new Date();
    
    // If start date is not provided, use the date of the last event or a default date (1 week ago)
    let effectiveStartDate = startDate;
    if (!effectiveStartDate) {
      // Get the latest sync log to determine the last sync date
      const lastSyncLog = await storage.getLatestSyncLog('events');
      if (lastSyncLog && lastSyncLog.endDate) {
        effectiveStartDate = new Date(lastSyncLog.endDate);
      } else {
        // Default to 1 week ago if no previous sync
        effectiveStartDate = new Date();
        effectiveStartDate.setDate(effectiveStartDate.getDate() - 7);
      }
    }

    // Start sync log
    const syncLog: InsertSyncLog = {
      syncType: 'events',
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      syncStatus: 'running',
    };

    const logEntry = await storage.createSyncLog(syncLog);
    const syncLogId = logEntry.id;

    try {
      const startTime = Date.now();
      
      // Initialize counters
      let itemsFound = 0;
      let itemsSaved = 0;
      let itemsUpdated = 0;
      let duplicates = 0;
      let errors = 0;
      let page = 1;
      let hasMorePages = true;

      // Format dates for API
      const formattedStartDate = this.formatDate(effectiveStartDate);
      const formattedEndDate = this.formatDate(effectiveEndDate);

      // Process paginated results
      while (hasMorePages) {
        // Fetch events from Vendon API
        const result = await this.api.getEvents(
          formattedStartDate,
          formattedEndDate,
          page,
          batchSize
        );

        const events = result.data;
        itemsFound += events.length;

        // Process events
        for (const event of events) {
          try {
            // Create event object
            const newEvent: InsertEvent = {
              vendonId: event.id,
              eventType: event.type,
              eventName: event.name,
              description: event.description,
              machineId: event.machine_id,
              machineName: event.machine_name,
              datetime: new Date(event.datetime),
              status: event.status,
              resolvedAt: event.resolved_at ? new Date(event.resolved_at) : null,
              severity: event.severity,
              extraData: JSON.stringify(event.extra_data),
            };

            // Attempt to insert event
            await storage.createEvent(newEvent);
            itemsSaved++;
          } catch (error) {
            // Check if it's a duplicate error
            if (error instanceof Error && error.message.includes('duplicate')) {
              duplicates++;
            } else {
              errors++;
              console.error(`Error processing event ${event.id}:`, error);
            }
          }
        }

        // Check if there are more pages
        hasMorePages = events.length === batchSize && page * batchSize < result.total;
        page++;

        // Update sync log with progress
        await storage.updateSyncLog(syncLogId, {
          itemsFound,
          itemsSaved,
          itemsUpdated,
          duplicates,
          errors,
        });
      }

      // Update sync log with final results
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        durationSeconds,
        syncStatus: 'completed',
      });

      return {
        syncLogId,
        status: 'success',
        message: `Synchronized ${itemsFound} events: ${itemsSaved} saved, ${duplicates} duplicates, ${errors} errors`,
      };
    } catch (error) {
      // Log error and update sync log
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Event synchronization error:', error);
      
      await storage.updateSyncLog(syncLogId, {
        endDate: new Date(),
        syncStatus: 'error',
        errorMessage,
      });

      return {
        syncLogId,
        status: 'error',
        message: `Event synchronization failed: ${errorMessage}`,
      };
    }
  }

  // Run a full synchronization of all data types
  async syncAll(): Promise<{ status: string; message: string; results: any }> {
    const results = {
      machines: await this.syncMachines(),
      transactions: await this.syncTransactions(),
      events: await this.syncEvents(),
    };

    // Determine overall status
    const hasErrors = Object.values(results).some(r => r.status === 'error');
    
    return {
      status: hasErrors ? 'partial' : 'success',
      message: hasErrors 
        ? 'Synchronization completed with some errors' 
        : 'All synchronizations completed successfully',
      results,
    };
  }

  // Get sync status summary
  async getSyncStatus(): Promise<{
    machines: { status: string; lastSync: Date | null; count: number };
    transactions: { status: string; lastSync: Date | null; count: number; latest: Date | null };
    events: { status: string; lastSync: Date | null; count: number };
  }> {
    // Get latest sync logs
    const machinesSyncLog = await storage.getLatestSyncLog('machines');
    const transactionsSyncLog = await storage.getLatestSyncLog('transactions');
    const eventsSyncLog = await storage.getLatestSyncLog('events');

    // Count items in database
    const machines = await storage.getMachines(0); // 0 means no limit
    const transactions = await storage.getTransactions(1); // Just get the latest transaction
    const events = await storage.getEvents(0); // 0 means no limit

    return {
      machines: {
        status: machinesSyncLog?.syncStatus || 'never',
        lastSync: machinesSyncLog?.endDate || null,
        count: machines.length,
      },
      transactions: {
        status: transactionsSyncLog?.syncStatus || 'never',
        lastSync: transactionsSyncLog?.endDate || null,
        count: transactionsSyncLog?.itemsFound || 0,
        latest: transactions.length > 0 ? transactions[0].datetime : null,
      },
      events: {
        status: eventsSyncLog?.syncStatus || 'never',
        lastSync: eventsSyncLog?.endDate || null,
        count: eventsSyncLog?.itemsFound || 0,
      },
    };
  }
}

export const vendonSync = new VendonSyncService();
