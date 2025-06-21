
# Integration-Anleitung für die Service-Plattform

## Übersicht
Diese Anleitung erklärt, wie Sie Ihre Service-Plattform-Anwendung mit der Wawi-Proviantomat API verbinden können, um sicher auf Lieferanten- und Produktdaten zuzugreifen.

## 🔧 Schritt 1: Secrets konfigurieren

### Erforderliche Umgebungsvariablen
Fügen Sie diese Secrets in Ihrer Replit-Anwendung hinzu (Tools → Secrets):

```bash
INTER_APP_SECRET=ihr-starker-geheimer-schluessel-hier
API_SECRET_KEY=ihr-api-schluessel-hier
```

**WICHTIG:** Diese Werte müssen IDENTISCH mit denen in der Wawi-Proviantomat Anwendung sein!

### Wie Sie die Secrets-Werte erhalten:
1. Kontaktieren Sie den Administrator der Wawi-Proviantomat Anwendung
2. Oder verwenden Sie diese Testwerte (nur für Entwicklung):
   ```bash
   INTER_APP_SECRET=test-secret-key-123-very-secure
   API_SECRET_KEY=test-api-key-456-secure
   ```

## 🌐 Schritt 2: URL-Konfiguration

### Basis-URL der Wawi-Proviantomat API:
```
https://[WAWI-REPLIT-NAME].replit.app
```

Ersetzen Sie `[WAWI-REPLIT-NAME]` durch den tatsächlichen Namen der Wawi-Anwendung.

### Verfügbare Endpunkte:
- `/api/inter-app/health` - API-Gesundheitscheck
- `/api/inter-app/suppliers` - Alle Lieferanten
- `/api/inter-app/suppliers/:id` - Einzelner Lieferant
- `/api/inter-app/products` - Alle Produkte
- `/api/inter-app/products/:id` - Einzelnes Produkt
- `/api/inter-app/warehouses` - Alle Lager
- `/api/inter-app/data-completeness` - Daten-Vollständigkeitsanalyse

## 🔐 Schritt 3: HMAC-Authentifizierung implementieren

### Installation erforderlicher Pakete:
```bash
npm install crypto axios
```

### Inter-App Client erstellen:

Erstellen Sie eine Datei `utils/inter-app-client.js`:

```javascript
const crypto = require('crypto');
const axios = require('axios');

class InterAppClient {
  constructor(baseURL, appSource = 'service-platform') {
    this.baseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    this.appSource = appSource;
    this.interAppSecret = process.env.INTER_APP_SECRET;
    this.apiSecretKey = process.env.API_SECRET_KEY;

    if (!this.interAppSecret || !this.apiSecretKey) {
      throw new Error('Fehlende Umgebungsvariablen: INTER_APP_SECRET und API_SECRET_KEY sind erforderlich');
    }

    // Axios-Client mit Timeout
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `ServicePlatform/${this.appSource}`
      }
    });

    // Request-Interceptor für automatische Signierung
    this.client.interceptors.request.use((config) => {
      const method = (config.method || 'GET').toUpperCase();
      const path = config.url || '/';
      const body = config.data || null;
      
      const authData = this.createSignature(method, path, body);
      
      config.headers = {
        ...config.headers,
        ...authData.headers
      };
      
      console.log(`[INTER-APP-CLIENT] ${method} ${path} - Anfrage signiert`);
      return config;
    });

    // Response-Interceptor für Logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[INTER-APP-CLIENT] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      (error) => {
        const status = error.response?.status || 'NETWORK_ERROR';
        const url = error.config?.url || 'unknown';
        console.error(`[INTER-APP-CLIENT] ${error.config?.method?.toUpperCase()} ${url} - ${status}:`, 
          error.response?.data || error.message);
        throw error;
      }
    );
  }

  createSignature(method, path, body = null) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    
    const payload = `${method}:${path}:${bodyStr}:${timestamp}:${this.appSource}`;
    const signature = crypto
      .createHmac('sha256', this.interAppSecret)
      .update(payload)
      .digest('hex');

    return {
      signature,
      timestamp,
      headers: {
        'Authorization': `Bearer ${signature}`,
        'X-Timestamp': timestamp,
        'X-App-Source': this.appSource,
        'X-API-Key': this.apiSecretKey,
        'Content-Type': 'application/json'
      }
    };
  }

  // API-Methoden
  async healthCheck() {
    try {
      const response = await this.client.get('/api/inter-app/health');
      return response.data;
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Health Check fehlgeschlagen:', error.message);
      throw error;
    }
  }

  async getSuppliers() {
    try {
      const response = await this.client.get('/api/inter-app/suppliers');
      return response.data?.data || [];
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen der Lieferanten:', error.message);
      throw error;
    }
  }

  async getSupplier(id) {
    try {
      const response = await this.client.get(`/api/inter-app/suppliers/${id}`);
      return response.data?.data || null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen des Lieferanten:', error.message);
      throw error;
    }
  }

  async getProducts(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.supplierId) params.append('supplier_id', options.supplierId.toString());
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
      
      const path = `/api/inter-app/products${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.client.get(path);
      return response.data;
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen der Produkte:', error.message);
      throw error;
    }
  }

  async getProduct(id) {
    try {
      const response = await this.client.get(`/api/inter-app/products/${id}`);
      return response.data?.data || null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen des Produkts:', error.message);
      throw error;
    }
  }

  async getWarehouses() {
    try {
      const response = await this.client.get('/api/inter-app/warehouses');
      return response.data?.data || [];
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler beim Abrufen der Lager:', error.message);
      throw error;
    }
  }

  async getDataCompleteness() {
    try {
      const response = await this.client.get('/api/inter-app/data-completeness');
      return response.data?.data || {};
    } catch (error) {
      console.error('[INTER-APP-CLIENT] Fehler bei Vollständigkeitsanalyse:', error.message);
      throw error;
    }
  }

  // Verbindungstest
  async testConnection() {
    try {
      const health = await this.healthCheck();
      
      if (!health.success) {
        return {
          success: false,
          details: null,
          error: 'Health Check fehlgeschlagen'
        };
      }

      const [suppliers, products, completeness] = await Promise.all([
        this.getSuppliers().catch(() => []),
        this.getProducts({ limit: 5 }).catch(() => ({ data: [], pagination: {} })),
        this.getDataCompleteness().catch(() => ({}))
      ]);

      return {
        success: true,
        details: {
          health,
          supplierCount: suppliers.length,
          productCount: products.data?.length || 0,
          hasCompleteness: Object.keys(completeness).length > 0
        }
      };
    } catch (error) {
      return {
        success: false,
        details: null,
        error: error.message
      };
    }
  }
}

module.exports = InterAppClient;
```

## 🧪 Schritt 4: Integration testen

### Einfacher Test erstellen:

Erstellen Sie eine Datei `test-integration.js`:

```javascript
const InterAppClient = require('./utils/inter-app-client');

async function testIntegration() {
  console.log('🚀 Starte Inter-App Integration Test...\n');

  // Client erstellen (ersetzen Sie die URL!)
  const client = new InterAppClient('https://ihre-wawi-anwendung.replit.app');

  try {
    // 1. Verbindungstest
    console.log('1. 🔍 Teste Verbindung...');
    const connectionTest = await client.testConnection();
    console.log('   Verbindung:', connectionTest.success ? '✅ Erfolgreich' : '❌ Fehlgeschlagen');
    if (connectionTest.error) {
      console.log('   Fehler:', connectionTest.error);
      return;
    }
    console.log('   Details:', connectionTest.details);

    // 2. Lieferanten abrufen
    console.log('\n2. 📦 Lade Lieferanten...');
    const suppliers = await client.getSuppliers();
    console.log(`   ✅ ${suppliers.length} Lieferanten geladen`);
    if (suppliers.length > 0) {
      console.log('   Erster Lieferant:', suppliers[0].name);
    }

    // 3. Produkte abrufen
    console.log('\n3. 🛒 Lade Produkte...');
    const products = await client.getProducts({ limit: 10 });
    console.log(`   ✅ ${products.data.length} Produkte geladen`);
    if (products.data.length > 0) {
      console.log('   Erstes Produkt:', products.data[0].name);
    }

    // 4. Vollständigkeitsanalyse
    console.log('\n4. 📊 Lade Daten-Vollständigkeit...');
    const completeness = await client.getDataCompleteness();
    console.log('   ✅ Vollständigkeitsanalyse geladen');
    console.log('   Lieferanten-Vollständigkeit:', completeness.suppliers?.completeness);

    console.log('\n🎉 Integration erfolgreich getestet!');

  } catch (error) {
    console.error('\n❌ Integration-Test fehlgeschlagen:', error.message);
    
    // Hilfreiche Debug-Informationen
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
    
    // Häufige Fehlerursachen
    console.log('\n🔧 Mögliche Lösungen:');
    console.log('   1. Überprüfen Sie die INTER_APP_SECRET und API_SECRET_KEY');
    console.log('   2. Stellen Sie sicher, dass beide Apps die gleichen Secrets haben');
    console.log('   3. Überprüfen Sie die Basis-URL der Wawi-Anwendung');
    console.log('   4. Stellen Sie sicher, dass die Wawi-Anwendung läuft');
  }
}

// Test ausführen
testIntegration();
```

### Test ausführen:
```bash
node test-integration.js
```

## 🏗️ Schritt 5: In Ihre Anwendung integrieren

### Beispiel für Express.js Route:

```javascript
const express = require('express');
const InterAppClient = require('./utils/inter-app-client');

const router = express.Router();
const wawiClient = new InterAppClient('https://ihre-wawi-anwendung.replit.app');

// Lieferanten-Endpunkt
router.get('/api/suppliers', async (req, res) => {
  try {
    const suppliers = await wawiClient.getSuppliers();
    res.json({ success: true, data: suppliers });
  } catch (error) {
    console.error('Fehler beim Abrufen der Lieferanten:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Fehler beim Abrufen der Lieferanten' 
    });
  }
});

// Produkte-Endpunkt mit Filterung
router.get('/api/products', async (req, res) => {
  try {
    const { supplier_id, limit = 50, offset = 0 } = req.query;
    
    const products = await wawiClient.getProducts({
      supplierId: supplier_id,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({ success: true, ...products });
  } catch (error) {
    console.error('Fehler beim Abrufen der Produkte:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Fehler beim Abrufen der Produkte' 
    });
  }
});

// Gesundheitscheck
router.get('/api/wawi-health', async (req, res) => {
  try {
    const health = await wawiClient.healthCheck();
    res.json({ success: true, wawi: health });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Wawi-Verbindung fehlgeschlagen' 
    });
  }
});

module.exports = router;
```

## 🎨 Schritt 6: Frontend-Integration

### React-Beispiel:

```javascript
import React, { useState, useEffect } from 'react';

function SupplierList() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadSuppliers() {
      try {
        const response = await fetch('/api/suppliers');
        const data = await response.json();
        
        if (data.success) {
          setSuppliers(data.data);
        } else {
          setError('Fehler beim Laden der Lieferanten');
        }
      } catch (err) {
        setError('Netzwerkfehler: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    loadSuppliers();
  }, []);

  if (loading) return <div>Laden...</div>;
  if (error) return <div>Fehler: {error}</div>;

  return (
    <div>
      <h2>Lieferanten aus Wawi-System</h2>
      <ul>
        {suppliers.map(supplier => (
          <li key={supplier.id}>
            <strong>{supplier.name}</strong>
            <br />
            {supplier.email && <span>Email: {supplier.email}</span>}
            <br />
            Produkte: {supplier.productCount}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SupplierList;
```

## 🔧 Schritt 7: Fehlerbehandlung

### Häufige Fehlercodes und Lösungen:

| Fehlercode | Bedeutung | Lösung |
|------------|-----------|---------|
| `MISSING_AUTH_HEADER` | Authorization Header fehlt | Client-Implementierung prüfen |
| `INVALID_SIGNATURE` | Falsche HMAC-Signatur | Secrets überprüfen |
| `TIMESTAMP_EXPIRED` | Request zu alt (>5 Min) | Systemzeit synchronisieren |
| `RATE_LIMIT_EXCEEDED` | Zu viele Anfragen | Anfragerate reduzieren |
| `INVALID_API_KEY` | Falscher API-Schlüssel | API_SECRET_KEY prüfen |

### Error-Handler hinzufügen:

```javascript
function handleInterAppError(error) {
  if (error.response?.data?.code) {
    const code = error.response.data.code;
    
    switch (code) {
      case 'INVALID_SIGNATURE':
        console.error('🔐 Authentifizierungsfehler: Überprüfen Sie die Secrets');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        console.error('🚫 Rate Limit erreicht: Warten Sie bis zum Reset');
        break;
      case 'TIMESTAMP_EXPIRED':
        console.error('⏰ Timestamp abgelaufen: Synchronisieren Sie die Systemzeit');
        break;
      default:
        console.error('❌ Unbekannter Fehler:', code);
    }
  }
  
  return {
    success: false,
    error: error.response?.data?.error || error.message,
    code: error.response?.data?.code || 'UNKNOWN_ERROR'
  };
}
```

## 📊 Schritt 8: Monitoring und Logging

### Logging-Setup:

```javascript
class InterAppLogger {
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [INTER-APP] [${level}] ${message}`;
    
    console.log(logEntry);
    if (data) {
      console.log('   Data:', JSON.stringify(data, null, 2));
    }
  }

  static info(message, data) {
    this.log('INFO', message, data);
  }

  static error(message, data) {
    this.log('ERROR', message, data);
  }

  static warn(message, data) {
    this.log('WARN', message, data);
  }
}

// Verwendung im Client:
InterAppLogger.info('Verbindung zur Wawi-API hergestellt');
InterAppLogger.error('Fehler beim Abrufen der Produkte', error);
```

## 🚀 Schritt 9: Deployment

### Produktionsüberlegungen:

1. **Secrets sicher verwalten:**
   ```bash
   # Starke, eindeutige Secrets generieren
   INTER_APP_SECRET=$(openssl rand -hex 32)
   API_SECRET_KEY=$(openssl rand -hex 16)
   ```

2. **Rate Limiting beachten:**
   - Maximal 200 Anfragen pro Minute
   - Implementieren Sie Client-seitiges Caching

3. **Error Recovery:**
   ```javascript
   async function robustApiCall(apiMethod, retries = 3) {
     for (let i = 0; i < retries; i++) {
       try {
         return await apiMethod();
       } catch (error) {
         if (i === retries - 1) throw error;
         
         const delay = Math.pow(2, i) * 1000; // Exponential backoff
         await new Promise(resolve => setTimeout(resolve, delay));
       }
     }
   }
   ```

## ✅ Schritt 10: Checkliste vor Go-Live

- [ ] Secrets korrekt konfiguriert (beide Apps identisch)
- [ ] Verbindungstest erfolgreich
- [ ] Fehlerbehandlung implementiert
- [ ] Rate Limiting berücksichtigt
- [ ] Logging aktiviert
- [ ] Frontend-Integration getestet
- [ ] Produktions-URL konfiguriert

## 🆘 Support und Troubleshooting

### Bei Problemen:

1. **Überprüfen Sie die Logs beider Anwendungen**
2. **Testen Sie zuerst ohne Authentifizierung:**
   ```bash
   curl https://ihre-wawi-anwendung.replit.app/api/inter-app/debug
   ```
3. **Validieren Sie die Secrets:**
   ```bash
   curl https://ihre-wawi-anwendung.replit.app/api/inter-app/config-check
   ```

### Kontakt:
Bei weiteren Fragen kontaktieren Sie das Wawi-Proviantomat Team oder erstellen Sie ein Issue in der entsprechenden Replit-Anwendung.

---

**🎉 Herzlichen Glückwunsch! Ihre Service-Plattform ist jetzt bereit für die sichere Integration mit dem Wawi-Proviantomat System.**
