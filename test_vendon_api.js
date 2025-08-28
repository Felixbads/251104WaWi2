const axios = require('axios');

const API_KEY = process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
const BASE_URL = 'https://cloud.vendon.net/rest/v1.8.0';

async function testVendonAPI() {
  console.log('🧪 Testing Vendon API...');
  
  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Token ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 30000
  });

  // Test 1: Get Machines
  console.log('\n1. Testing /machines endpoint...');
  try {
    const machinesResponse = await client.get('/machines');
    console.log('✅ Machines Response Status:', machinesResponse.status);
    console.log('📊 Response Type:', typeof machinesResponse.data);
    console.log('🔑 Response Keys:', Object.keys(machinesResponse.data));
    
    if (machinesResponse.data.result && Array.isArray(machinesResponse.data.result)) {
      console.log(`📦 Found ${machinesResponse.data.result.length} machines`);
      if (machinesResponse.data.result.length > 0) {
        console.log('\n🔍 First Machine Structure:');
        const firstMachine = machinesResponse.data.result[0];
        console.log(JSON.stringify(firstMachine, null, 2));
        console.log('\n🔑 Machine Keys:', Object.keys(firstMachine));
      }
    } else {
      console.log('⚠️ Unexpected response structure:', JSON.stringify(machinesResponse.data).substring(0, 500));
    }
  } catch (error) {
    console.error('❌ Machines API Error:', error.response ? error.response.data : error.message);
  }

  // Test 2: Get Transactions for last hour
  console.log('\n2. Testing /stats/vends endpoint...');
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const params = {
      from_timestamp: Math.floor(oneHourAgo.getTime() / 1000),
      to_timestamp: Math.floor(now.getTime() / 1000),
      limit: 10
    };
    
    console.log('📋 Request params:', params);
    
    const transactionsResponse = await client.get('/stats/vends', { params });
    console.log('✅ Transactions Response Status:', transactionsResponse.status);
    console.log('📊 Response Type:', typeof transactionsResponse.data);
    console.log('🔑 Response Keys:', Object.keys(transactionsResponse.data));
    
    if (transactionsResponse.data.result && Array.isArray(transactionsResponse.data.result)) {
      console.log(`📦 Found ${transactionsResponse.data.result.length} transactions`);
      if (transactionsResponse.data.result.length > 0) {
        console.log('\n🔍 First Transaction Structure:');
        const firstTransaction = transactionsResponse.data.result[0];
        console.log(JSON.stringify(firstTransaction, null, 2));
      }
    } else if (Array.isArray(transactionsResponse.data)) {
      console.log(`📦 Found ${transactionsResponse.data.length} transactions (direct array)`);
      if (transactionsResponse.data.length > 0) {
        console.log('\n🔍 First Transaction Structure:');
        console.log(JSON.stringify(transactionsResponse.data[0], null, 2));
      }
    } else {
      console.log('⚠️ Unexpected response structure:', JSON.stringify(transactionsResponse.data).substring(0, 500));
    }
  } catch (error) {
    console.error('❌ Transactions API Error:', error.response ? error.response.data : error.message);
  }
}

testVendonAPI().catch(console.error);