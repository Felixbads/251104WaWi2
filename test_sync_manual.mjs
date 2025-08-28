import axios from 'axios';

const API_KEY = process.env.VENDON_API_KEY || 'e5o9SSU4n2XQp9XmShtbIOK1rStoQvoB';
const BASE_URL = 'https://cloud.vendon.net/rest/v1.8.0';

async function testTransactionSync() {
  console.log('🧪 Testing Manual Transaction Sync...\n');
  
  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Token ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 30000
  });

  // Get last 10 transactions
  console.log('📋 Fetching recent transactions from Vendon API...');
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const params = {
      from_timestamp: Math.floor(oneHourAgo.getTime() / 1000),
      to_timestamp: Math.floor(now.getTime() / 1000),
      limit: 10
    };
    
    const response = await client.get('/stats/vends', { params });
    
    if (response.data.result && Array.isArray(response.data.result)) {
      console.log(`✅ Found ${response.data.result.length} transactions\n`);
      
      // Import the services
      const { getDuplicatePreventionServiceInstance } = await import('./server/services/DuplicatePreventionService.js');
      const duplicateService = getDuplicatePreventionServiceInstance();
      
      // Process the transactions
      console.log('🔄 Processing transactions with DuplicatePreventionService...');
      const result = await duplicateService.processTransactionBatch(response.data.result, false);
      
      console.log('\n📊 Processing Results:');
      console.log(`✅ Saved: ${result.saved} new transactions`);
      console.log(`🔄 Updated: ${result.updated} existing transactions`);
      console.log(`⏭️ Duplicates skipped: ${result.duplicates}`);
      
      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(error => console.log(`  - ${error}`));
      }
      
      // Check if transactions were saved to database
      if (result.saved > 0) {
        console.log('\n✅ SUCCESS: New transactions saved to database!');
      } else if (result.duplicates > 0) {
        console.log('\n⚠️ All transactions were duplicates (already in database)');
      } else {
        console.log('\n⚠️ No new transactions were saved');
      }
      
    } else {
      console.log('⚠️ No transactions found in the API response');
    }
  } catch (error) {
    console.error('❌ Error:', error.response ? error.response.data : error.message);
  }
}

testTransactionSync().catch(console.error);