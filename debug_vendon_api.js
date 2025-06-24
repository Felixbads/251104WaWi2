/**
 * Debug Vendon API connection and authentication
 */
import https from 'https';

async function debugVendonAPI() {
  console.log('=== VENDON API DEBUG ===\n');
  
  const apiKey = process.env.VENDON_API_KEY;
  console.log(`API Key: ${apiKey ? '****' + apiKey.slice(-4) : 'MISSING'}`);
  
  // Test different authentication methods
  const authMethods = [
    { name: 'Token', header: `Token ${apiKey}` },
    { name: 'Bearer', header: `Bearer ${apiKey}` },
    { name: 'API-Key', header: apiKey }
  ];
  
  for (const auth of authMethods) {
    console.log(`\nTesting ${auth.name} authentication:`);
    
    try {
      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'cloud.vendon.net',
          port: 443,
          path: '/rest/v1.8.0/machines',
          method: 'GET',
          headers: {
            'Authorization': auth.header,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }, (res) => {
          console.log(`  Status: ${res.statusCode}`);
          
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              console.log(`  Code: ${parsed.code}`);
              if (parsed.code === 200) {
                console.log(`  ✓ SUCCESS - Found ${parsed.result?.length || 0} machines`);
              } else {
                console.log(`  ✗ FAILED - ${parsed.result}`);
              }
            } catch (e) {
              console.log(`  Raw: ${data.substring(0, 100)}`);
            }
            resolve();
          });
        });
        
        req.on('error', (error) => {
          console.log(`  ✗ ERROR: ${error.message}`);
          resolve();
        });
        
        req.on('timeout', () => {
          console.log(`  ✗ TIMEOUT`);
          req.destroy();
          resolve();
        });
        
        req.end();
      });
    } catch (error) {
      console.log(`  ✗ EXCEPTION: ${error.message}`);
    }
  }
  
  // Test transaction endpoint with correct timestamp format
  console.log('\nTesting transaction endpoint:');
  const now = Math.floor(Date.now() / 1000);
  const yesterday = now - (24 * 60 * 60);
  
  try {
    await new Promise((resolve, reject) => {
      const path = `/rest/v1.8.0/stats/vends?from_timestamp=${yesterday}&to_timestamp=${now}&limit=5`;
      
      const req = https.request({
        hostname: 'cloud.vendon.net',
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }, (res) => {
        console.log(`  Status: ${res.statusCode}`);
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            console.log(`  Code: ${parsed.code}`);
            if (parsed.code === 200) {
              console.log(`  ✓ SUCCESS - Found ${parsed.result?.length || 0} transactions`);
            } else {
              console.log(`  ✗ FAILED - ${parsed.result}`);
            }
          } catch (e) {
            console.log(`  Raw: ${data.substring(0, 200)}`);
          }
          resolve();
        });
      });
      
      req.on('error', resolve);
      req.on('timeout', () => { req.destroy(); resolve(); });
      req.end();
    });
  } catch (error) {
    console.log(`  ✗ EXCEPTION: ${error.message}`);
  }
  
  console.log('\n=== DEBUG COMPLETE ===');
}

debugVendonAPI().catch(console.error);