/**
 * Netzwerk-Diagnose für Vendon API-Verbindungsprobleme
 */
import https from 'https';
import dns from 'dns';

async function diagnoseNetworkIssues() {
  console.log('=== VENDON API NETZWERK-DIAGNOSE ===\n');
  
  // 1. DNS-Auflösung testen
  console.log('1. DNS-Auflösung für cloud.vendon.net:');
  try {
    const addresses = await new Promise((resolve, reject) => {
      dns.resolve4('cloud.vendon.net', (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });
    console.log('✓ DNS erfolgreich:', addresses);
  } catch (error) {
    console.log('✗ DNS-Fehler:', error.message);
    return;
  }
  
  // 2. HTTPS-Verbindung testen
  console.log('\n2. HTTPS-Verbindung zu cloud.vendon.net:443:');
  try {
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'cloud.vendon.net',
        port: 443,
        path: '/rest/v1.8.0/machines',
        method: 'GET',
        headers: {
          'Authorization': `Token ${process.env.VENDON_API_KEY}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }, (res) => {
        console.log('✓ HTTPS-Verbindung erfolgreich, Status:', res.statusCode);
        console.log('  Headers:', Object.keys(res.headers));
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            console.log('  Response Code:', parsed.code);
            console.log('  Response Result:', parsed.result?.length ? `${parsed.result.length} items` : parsed.result);
          } catch (e) {
            console.log('  Raw Response:', data.substring(0, 200));
          }
          resolve();
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));
      req.end();
    });
  } catch (error) {
    console.log('✗ HTTPS-Verbindung fehlgeschlagen:', error.message);
  }
  
  // 3. Port-Überprüfung
  console.log('\n3. Lokale Port-Nutzung:');
  try {
    const { exec } = await import('child_process');
    exec('netstat -tlnp | grep :5000', (error, stdout) => {
      if (stdout) {
        console.log('✓ Port 5000 ist in Verwendung:', stdout.trim());
      } else {
        console.log('✗ Port 5000 nicht gefunden');
      }
    });
  } catch (error) {
    console.log('✗ Port-Check fehlgeschlagen:', error.message);
  }
  
  console.log('\n=== DIAGNOSE ABGESCHLOSSEN ===');
}

diagnoseNetworkIssues().catch(console.error);