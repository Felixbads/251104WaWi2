#!/usr/bin/env node

/**
 * Test script for Enhanced Inter-App API
 * Tests all enhanced endpoints with proper authentication
 */

const crypto = require('crypto');
const fetch = require('node-fetch');

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
 * Make authenticated API request
 */
async function apiRequest(method, path, body = null) {
  const auth = createSignature(method, path, body);
  
  const options = {
    method,
    headers: auth.headers
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  
  const url = `${BASE_URL}${path}`;
  console.log(`\n🔄 ${method} ${path}`);
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      console.log(`❌ Status: ${response.status}`);
      console.log(`   Error: ${JSON.stringify(data, null, 2)}`);
      return null;
    }
    
    console.log(`✅ Status: ${response.status}`);
    return data;
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    return null;
  }
}

/**
 * Test all API endpoints
 */
async function testEnhancedAPI() {
  console.log('🚀 Testing Enhanced Inter-App API');
  console.log('=====================================');
  
  // 1. Health Check
  console.log('\n📋 1. Health Check');
  const health = await apiRequest('GET', '/api/inter-app/health');
  if (health) {
    console.log(`   ✓ API Status: ${health.status}`);
    console.log(`   ✓ Database: ${health.database}`);
  }
  
  // 2. Suppliers List
  console.log('\n👥 2. Suppliers List');
  const suppliers = await apiRequest('GET', '/api/inter-app/suppliers?limit=3');
  if (suppliers && suppliers.data) {
    console.log(`   ✓ Found ${suppliers.data.length} suppliers`);
    console.log(`   ✓ Total suppliers: ${suppliers.total}`);
    
    if (suppliers.data.length > 0) {
      const supplier = suppliers.data[0];
      console.log(`   ✓ Sample supplier: ${supplier.name}`);
      console.log(`   ✓ Address completeness: ${supplier.completeness?.hasCompleteAddress ? 'Yes' : 'No'}`);
      console.log(`   ✓ Products: ${supplier.productCount}`);
    }
  }
  
  // 3. Single Supplier
  if (suppliers && suppliers.data && suppliers.data.length > 0) {
    console.log('\n🏢 3. Single Supplier');
    const supplierId = suppliers.data[0].id;
    const supplier = await apiRequest('GET', `/api/inter-app/suppliers/${supplierId}`);
    
    if (supplier && supplier.data) {
      console.log(`   ✓ Supplier: ${supplier.data.name}`);
      console.log(`   ✓ Email: ${supplier.data.email || 'Not provided'}`);
      console.log(`   ✓ Address: ${supplier.data.address || 'Not provided'}`);
      console.log(`   ✓ Associated products: ${supplier.data.products?.length || 0}`);
    }
  }
  
  // 4. Products List
  console.log('\n📦 4. Products List');
  const products = await apiRequest('GET', '/api/inter-app/products?limit=3');
  if (products && products.data) {
    console.log(`   ✓ Found ${products.data.length} products`);
    console.log(`   ✓ Total products: ${products.total}`);
    
    if (products.data.length > 0) {
      const product = products.data[0];
      console.log(`   ✓ Sample product: ${product.productName || product.name}`);
      console.log(`   ✓ Category: ${product.category || 'Not categorized'}`);
      console.log(`   ✓ Has description: ${product.shortDescription ? 'Yes' : 'No'}`);
      console.log(`   ✓ Supplier: ${product.supplierName || 'Not assigned'}`);
    }
  }
  
  // 5. Single Product
  if (products && products.data && products.data.length > 0) {
    console.log('\n📋 5. Single Product');
    const productId = products.data[0].id;
    const product = await apiRequest('GET', `/api/inter-app/products/${productId}`);
    
    if (product && product.data) {
      console.log(`   ✓ Product: ${product.data.productName || product.data.name}`);
      console.log(`   ✓ Short Description: ${product.data.shortDescription || 'Not provided'}`);
      console.log(`   ✓ Ingredients: ${product.data.ingredients || 'Not provided'}`);
      console.log(`   ✓ Allergens: ${product.data.allergens || 'Not provided'}`);
      console.log(`   ✓ Nutritional Info: ${product.data.nutritionalInfo ? 'Available' : 'Not provided'}`);
      console.log(`   ✓ Photos: ${product.data.photos?.length || 0} available`);
    }
  }
  
  console.log('\n🎉 API Test Complete!');
  console.log('=====================================');
}

// Check if required environment variables are set
if (!process.env.INTER_APP_SECRET || !process.env.API_SECRET_KEY) {
  console.log('⚠️  Warning: INTER_APP_SECRET or API_SECRET_KEY not set in environment');
  console.log('   Using default values for testing (not secure for production)');
}

// Run tests
testEnhancedAPI().catch(console.error);