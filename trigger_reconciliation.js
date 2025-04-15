const https = require('https');
const http = require('http');

// Funktion zum Auslösen des Warehouse-Reconciliation-Prozesses
async function triggerWarehouseReconciliation() {
  console.log('Starte Warehouse-Reconciliation-Prozess...');
  
  // Die Daten, die wir senden möchten
  const data = JSON.stringify({
    warehouseId: null,
    syncAllProducts: true,
    forceCreateInventoryItems: true
  });
  
  // Optionen für die HTTP-Anfrage (zunächst für HTTP auf Port 3000)
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/warehouse-reconciliation',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  // Versuche unterschiedliche Ports
  tryRequest(options, data, () => {
    // Wenn der erste Versuch fehlschlägt, probiere Port 8080
    options.port = 8080;
    tryRequest(options, data, () => {
      // Wenn der zweite Versuch fehlschlägt, probiere Port 4444
      options.port = 4444;
      tryRequest(options, data, () => {
        // Wenn der dritte Versuch fehlschlägt, probiere Port 5000
        options.port = 5000;
        tryRequest(options, data, () => {
          // Wenn der vierte Versuch fehlschlägt, probiere HTTPS
          console.log('Keine Verbindung über HTTP gefunden. Versuche HTTPS...');
          tryHttpsRequest(data, (error) => {
            if (error) {
              console.log('Alle Verbindungsversuche fehlgeschlagen.');
            }
          });
        });
      });
    });
  });
}

// Funktion zum Ausprobieren einer HTTP-Anfrage
function tryRequest(options, data, onError) {
  console.log(`Versuche Verbindung auf Port ${options.port}...`);
  
  const req = http.request(options, (res) => {
    console.log(`Status-Code: ${res.statusCode}`);
    
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log('Antwort erhalten:');
      try {
        const parsedData = JSON.parse(responseData);
        console.log(JSON.stringify(parsedData, null, 2));
      } catch (e) {
        console.log(responseData);
      }
    });
  });
  
  req.on('error', (error) => {
    console.log(`Fehler bei der Anfrage auf Port ${options.port}:`, error.message);
    if (onError) onError(error);
  });
  
  req.write(data);
  req.end();
}

// Funktion zum Ausprobieren einer HTTPS-Anfrage
function tryHttpsRequest(data, onError) {
  // Hier könnten wir HTTPS-Anfragen mit verschiedenen Konfigurationen versuchen
  const httpsOptions = {
    hostname: 'localhost',
    port: 443,
    path: '/api/warehouse-reconciliation',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    },
    rejectUnauthorized: false // Für selbst-signierte Zertifikate
  };
  
  console.log('Versuche HTTPS-Verbindung...');
  
  const req = https.request(httpsOptions, (res) => {
    console.log(`HTTPS Status-Code: ${res.statusCode}`);
    
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log('HTTPS-Antwort erhalten:');
      try {
        const parsedData = JSON.parse(responseData);
        console.log(JSON.stringify(parsedData, null, 2));
      } catch (e) {
        console.log(responseData);
      }
    });
  });
  
  req.on('error', (error) => {
    console.log('Fehler bei der HTTPS-Anfrage:', error.message);
    if (onError) onError(error);
  });
  
  req.write(data);
  req.end();
}

// Führe die Funktion aus
triggerWarehouseReconciliation();