#!/usr/bin/env node

/**
 * Simple test for Enhanced Inter-App API using curl
 */

const crypto = require('crypto');
const { execSync } = require('child_process');

// Load environment variables
require('dotenv').config();

const BASE_URL = 'http://localhost:5000';
const INTER_APP_SECRET = process.env.INTER_APP_SECRET || 'default-secret-key-change-in-production';
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'default-api-key-change-in-production';

/**
 * Create HMAC signature for inter-app authentication
 */
function createSignature(method, path, body = null, source = 'test-client') {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  
  const signaturePayload = `${method}:${path}:${bodyStr}:${timestamp}:${source}`;
  const signature = crypto
    .createHmac('sha256', INTER_APP_SECRET)
    .update(signaturePayload)
    .digest('hex');

  return {
    signature,
    timestamp,
    headers: {
      'Authorization': `Bearer ${signature}`,
      'X-Timestamp': timestamp,
      'X-App-Source': source,
      'X-API-Key': API_SECRET_KEY,
      'Content-Type': 'application/json'
    }
  };
}

/**
 * Make authenticated API request using curl
 */
function apiRequest(method, path, body = null) {
  const auth = createSignature(method, path, body);
  const url = `${BASE_URL}${path}`;
  
  const headers = Object.entries(auth.headers)
    .map(([key, value]) => `-H "${key}: ${value}"`)
    .join(' ');
  
  const cmd = `curl -s ${headers} -X ${method} "${url}"`;
  
  try {
    console.log(`\n🔄 Testing ${method} ${path}`);
    const result = execSync(cmd, { encoding: 'utf8' });
    const data = JSON.parse(result);
    
    console.log(`✅ Success: ${data.success ? 'true' : 'false'}`);
    return data;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

/**
 * Test Enhanced API
 */
function testEnhancedAPI() {
  console.log('🚀 Testing Enhanced Inter-App API');
  console.log('=====================================');
  
  // 1. Health Check
  const health = apiRequest('GET', '/api/inter-app/health');
  if (health && health.success) {
    console.log(`   Database: ${health.database}`);
  }
  
  // 2. Suppliers List
  const suppliers = apiRequest('GET', '/api/inter-app/suppliers?limit=2');
  if (suppliers && suppliers.data) {
    console.log(`   Found ${suppliers.data.length} suppliers of ${suppliers.total} total`);
    
    if (suppliers.data.length > 0) {
      const supplier = suppliers.data[0];
      console.log(`   Sample: ${supplier.name}`);
      console.log(`   Products: ${supplier.productCount}`);
    }
  }
  
  // 3. Products List
  const products = apiRequest('GET', '/api/inter-app/products?limit=2');
  if (products && products.data) {
    console.log(`   Found ${products.data.length} products of ${products.total} total`);
    
    if (products.data.length > 0) {
      const product = products.data[0];
      console.log(`   Sample: ${product.productName || product.name}`);
      console.log(`   Supplier: ${product.supplierName || 'Not assigned'}`);
    }
  }
  
  console.log('\n🎉 API Test Complete!');
}

// Run test
testEnhancedAPI();