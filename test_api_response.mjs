#!/usr/bin/env node

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const VENDON_API_URL = process.env.VENDON_API_URL || 'https://cloud.vendon.net/rest/v1.8.0';
const apiKey = process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';

async function testVendonAPI() {
  console.log('Testing Vendon API Response...');
  console.log('API URL:', VENDON_API_URL);
  
  const endpoint = '/stats/vends';
  const url = `${VENDON_API_URL}${endpoint}`;
  
  console.log('\nFetching from:', url);
  console.log('Headers:', {
    'Authorization': 'Token ' + apiKey.substring(0, 20) + '...',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  });
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Enhanced-Vendon-Client/1.0'
      },
      redirect: 'follow'
    });
    
    console.log('\n=== RESPONSE DETAILS ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('\n=== RAW RESPONSE ===');
    console.log('Response length:', text.length);
    console.log('First 500 characters:', text.substring(0, 500));
    
    // Try to parse as JSON
    try {
      const json = JSON.parse(text);
      console.log('\n=== PARSED JSON ===');
      console.log('Type:', typeof json);
      console.log('Is Array:', Array.isArray(json));
      
      if (json && typeof json === 'object') {
        console.log('Keys:', Object.keys(json));
        
        if ('result' in json) {
          console.log('Result type:', typeof json.result);
          console.log('Result is Array:', Array.isArray(json.result));
          if (Array.isArray(json.result)) {
            console.log('Result length:', json.result.length);
            if (json.result.length > 0) {
              console.log('First item:', JSON.stringify(json.result[0], null, 2));
            }
          }
        }
      }
    } catch (e) {
      console.log('\n❌ Failed to parse as JSON:', e.message);
      console.log('Response appears to be:', text.includes('<!DOCTYPE') ? 'HTML' : 'Unknown format');
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testVendonAPI();