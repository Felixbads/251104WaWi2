#!/usr/bin/env node

import fetch from 'node-fetch';

const VENDON_API_URL = 'https://cloud.vendon.net/rest/v1.8.0';
const apiKey = process.env.VENDON_API_KEY || 'gfQPgkMCS73tK2lBshREP7YVdWX5jGrA';

async function testWithTimestamps() {
  console.log('Testing Vendon API with proper timestamps...\n');
  
  // Create date range for last 2 hours
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (2 * 60 * 60 * 1000)); // 2 hours ago
  
  const fromTimestamp = Math.floor(startDate.getTime() / 1000);
  const toTimestamp = Math.floor(endDate.getTime() / 1000);
  
  console.log('Date Range:', {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    from_timestamp: fromTimestamp,
    to_timestamp: toTimestamp
  });
  
  const params = new URLSearchParams({
    from_timestamp: fromTimestamp.toString(),
    to_timestamp: toTimestamp.toString(),
    limit: '10',
    offset: '0'
  });
  
  const url = `${VENDON_API_URL}/stats/vends?${params}`;
  
  console.log('\nFetching from:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Enhanced-Vendon-Client/1.0'
      }
    });
    
    console.log('\n=== RESPONSE DETAILS ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Content-Type:', response.headers.get('content-type'));
    
    const text = await response.text();
    
    try {
      const json = JSON.parse(text);
      console.log('\n=== PARSED JSON ===');
      console.log('Type:', typeof json);
      
      if (json && typeof json === 'object') {
        console.log('Keys:', Object.keys(json));
        
        if ('result' in json) {
          console.log('Result type:', typeof json.result);
          
          if (Array.isArray(json.result)) {
            console.log('Result is Array: true');
            console.log('Number of transactions:', json.result.length);
            
            if (json.result.length > 0) {
              console.log('\nFirst transaction:');
              console.log(JSON.stringify(json.result[0], null, 2));
            }
          } else {
            console.log('Result is Array: false');
            console.log('Result value:', json.result);
          }
        }
        
        if ('code' in json) {
          console.log('Response code:', json.code);
        }
      }
    } catch (e) {
      console.log('\n❌ Failed to parse as JSON:', e.message);
      console.log('Raw response (first 500 chars):', text.substring(0, 500));
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testWithTimestamps();