/**
 * Synchronisiert alle fehlenden Transaktionen vom 12.-17. Juni 2025
 */
import axios from 'axios';

async function syncMissingTransactions() {
  const VENDON_API_KEY = process.env.VENDON_API_KEY;
  const BASE_URL = "https://cloud.vendon.net/rest/v1.8.0";
  
  if (!VENDON_API_KEY) {
    console.error('VENDON_API_KEY not found');
    return;
  }
  
  console.log('Starting transaction sync for missing days...');
  
  // Synchronisiere jeden Tag einzeln
  const dates = [
    '2025-06-12',
    '2025-06-13', 
    '2025-06-14',
    '2025-06-15',
    '2025-06-16',
    '2025-06-17'
  ];
  
  for (const date of dates) {
    try {
      console.log(`Syncing transactions for ${date}...`);
      
      const response = await axios.post('http://localhost:5000/api/sync/transactions', {
        startDate: date,
        endDate: date,
        force: true
      }, {
        timeout: 60000
      });
      
      console.log(`✓ ${date}: ${response.data?.count || 0} transactions synced`);
      
      // Kurze Pause zwischen den Anfragen
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`✗ ${date}: Error -`, error.message);
    }
  }
  
  console.log('Transaction sync completed');
}

syncMissingTransactions().catch(console.error);