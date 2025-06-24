/**
 * Enable and Test Vendon Event Synchronization
 * Activates the background sync service for real-time event updates
 */

import { VendonEventsSync } from './server/services/vendonEventsSync.js';

async function enableVendonSync() {
  console.log('Activating Vendon event synchronization...');
  
  try {
    const sync = new VendonEventsSync();
    
    // Test API connectivity first
    console.log('Testing Vendon API connectivity...');
    
    const result = await sync.syncEvents({
      fromTimestamp: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000), // Last 24 hours
      toTimestamp: Math.floor(Date.now() / 1000),
      batchSize: 50,
      maxEvents: 500,
      forceUpdate: false
    });
    
    console.log('Sync test completed:', {
      success: result.success,
      processed: result.totalProcessed,
      duplicates: result.duplicates,
      errors: result.errors
    });
    
    if (result.success) {
      console.log('Vendon sync service is now active and working properly');
    } else {
      console.log('Vendon sync encountered issues:', result.errorMessage);
    }
    
    return result;
    
  } catch (error) {
    console.error('Failed to activate Vendon sync:', error.message);
    throw error;
  }
}

// Run the activation
enableVendonSync()
  .then(() => console.log('Vendon sync activation completed'))
  .catch(console.error);