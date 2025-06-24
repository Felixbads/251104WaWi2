/**
 * Test script for Inter-App API endpoints
 */

const BASE_URL = 'http://localhost:5000';

async function testInterAppAPI() {
  console.log('Testing Inter-App API endpoints...\n');

  // Test 1: Health Check (without auth - should fail)
  try {
    console.log('1. Testing health check without authentication...');
    const response = await fetch(`${BASE_URL}/api/inter-app/health`);
    console.log(`   Status: ${response.status}`);
    const data = await response.json();
    console.log(`   Response: ${JSON.stringify(data)}\n`);
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  // Test 2: Suppliers endpoint (without auth - should fail)
  try {
    console.log('2. Testing suppliers endpoint without authentication...');
    const response = await fetch(`${BASE_URL}/api/inter-app/suppliers`);
    console.log(`   Status: ${response.status}`);
    const data = await response.json();
    console.log(`   Response: ${JSON.stringify(data)}\n`);
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  // Test 3: Test client status
  try {
    console.log('3. Testing inter-app test client status...');
    const response = await fetch(`${BASE_URL}/api/inter-app-test/status`);
    console.log(`   Status: ${response.status}`);
    const data = await response.json();
    console.log(`   Response: ${JSON.stringify(data, null, 2)}\n`);
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  console.log('Testing complete!');
}

testInterAppAPI().catch(console.error);