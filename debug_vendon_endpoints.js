/**
 * Debug Vendon API Endpoints für Refills und Events
 */

import { VendonSync } from './server/services/vendonSync.js';
import dotenv from 'dotenv';

dotenv.config();

async function testVendonEndpoints() {
    const vendonSync = new VendonSync();
    
    console.log('=== VENDON API ENDPOINT TESTS ===');
    
    // Test Timerange: July 1-5, 2025
    const startDate = '2025-07-01';
    const endDate = '2025-07-05';
    
    console.log(`\nTesting Timerange: ${startDate} to ${endDate}`);
    
    // Test 1: Refills Endpoint
    console.log('\n1. Testing REFILLS endpoint...');
    try {
        const refillsResult = await vendonSync.getRefills(startDate, endDate, 1, 50);
        console.log('Refills Result:', {
            total: refillsResult.total,
            dataLength: refillsResult.data?.length || 0,
            firstItem: refillsResult.data?.[0] || 'keine Daten'
        });
    } catch (error) {
        console.error('Refills Error:', error.message);
    }
    
    // Test 2: Events Endpoint  
    console.log('\n2. Testing EVENTS endpoint...');
    try {
        const eventsResult = await vendonSync.getEvents(startDate, endDate, null, 0, 50);
        console.log('Events Result:', {
            total: eventsResult.total,
            dataLength: eventsResult.data?.length || 0,
            firstItem: eventsResult.data?.[0] || 'keine Daten'
        });
    } catch (error) {
        console.error('Events Error:', error.message);
    }
    
    // Test 3: Transactions (working one for comparison)
    console.log('\n3. Testing TRANSACTIONS endpoint (for comparison)...');
    try {
        const transactionsResult = await vendonSync.getTransactions(startDate, endDate, null, 0, 50);
        console.log('Transactions Result:', {
            total: transactionsResult.total,
            dataLength: transactionsResult.data?.length || 0,
            firstItem: transactionsResult.data?.[0] || 'keine Daten'
        });
    } catch (error) {
        console.error('Transactions Error:', error.message);
    }
    
    console.log('\n=== TESTS COMPLETED ===');
}

testVendonEndpoints().catch(console.error);