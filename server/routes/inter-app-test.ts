import { Router, Request, Response } from 'express';
import { InterAppClient, createInterAppClient, InterAppError } from '../utils/inter-app-client';

const router = Router();

// Temporärer Test-Client
let testClient: InterAppClient | null = null;

/**
 * POST /api/inter-app-test/configure
 * Konfiguriert die Verbindung zur zweiten Anwendung
 */
router.post('/configure', async (req: Request, res: Response) => {
  try {
    const { targetURL, appName } = req.body;
    
    if (!targetURL) {
      return res.status(400).json({
        success: false,
        error: 'Ziel-URL ist erforderlich'
      });
    }

    // URL validieren
    try {
      new URL(targetURL);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Ungültige URL angegeben'
      });
    }

    // Client erstellen
    testClient = createInterAppClient(targetURL, appName || 'test-client');
    
    // Verbindung testen
    const connectionTest = await testClient.testConnection();
    
    res.json({
      success: true,
      connectionTest,
      configuration: {
        targetURL,
        appName: appName || 'test-client'
      }
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Konfigurationsfehler:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Konfiguration',
      details: error.message
    });
  }
});

/**
 * GET /api/inter-app-test/health
 * Testet die Verbindung zur konfigurierten Anwendung
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    if (!testClient) {
      return res.status(400).json({
        success: false,
        error: 'Keine Verbindung konfiguriert. Verwende POST /configure zuerst.'
      });
    }

    const health = await testClient.healthCheck();
    const testResult = await testClient.testConnection();
    
    res.json({
      success: true,
      health,
      connectionDetails: testResult
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Health Check Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Health Check fehlgeschlagen',
      details: error.message
    });
  }
});

/**
 * GET /api/inter-app-test/suppliers
 * Testet das Abrufen von Lieferanten
 */
router.get('/suppliers', async (req: Request, res: Response) => {
  try {
    if (!testClient) {
      return res.status(400).json({
        success: false,
        error: 'Keine Verbindung konfiguriert'
      });
    }

    const suppliers = await testClient.getSuppliers();
    
    res.json({
      success: true,
      data: suppliers,
      count: suppliers.length,
      sample: suppliers.slice(0, 3) // Erste 3 als Beispiel
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Suppliers Test Fehler:', error);
    const interAppError = InterAppError.fromAxiosError(error);
    res.status(interAppError.statusCode || 500).json({
      success: false,
      error: 'Fehler beim Abrufen der Lieferanten',
      code: interAppError.code,
      details: interAppError.details
    });
  }
});

/**
 * GET /api/inter-app-test/products
 * Testet das Abrufen von Produkten
 */
router.get('/products', async (req: Request, res: Response) => {
  try {
    if (!testClient) {
      return res.status(400).json({
        success: false,
        error: 'Keine Verbindung konfiguriert'
      });
    }

    const { supplier_id, limit = 10 } = req.query;
    
    const result = await testClient.getProducts({
      supplierId: supplier_id ? parseInt(supplier_id as string) : undefined,
      limit: parseInt(limit as string)
    });
    
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      sample: result.data.slice(0, 3) // Erste 3 als Beispiel
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Products Test Fehler:', error);
    const interAppError = InterAppError.fromAxiosError(error);
    res.status(interAppError.statusCode || 500).json({
      success: false,
      error: 'Fehler beim Abrufen der Produkte',
      code: interAppError.code,
      details: interAppError.details
    });
  }
});

/**
 * GET /api/inter-app-test/data-completeness
 * Testet die Vollständigkeitsanalyse
 */
router.get('/data-completeness', async (req: Request, res: Response) => {
  try {
    if (!testClient) {
      return res.status(400).json({
        success: false,
        error: 'Keine Verbindung konfiguriert'
      });
    }

    const completeness = await testClient.getDataCompleteness();
    
    res.json({
      success: true,
      data: completeness
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Completeness Test Fehler:', error);
    const interAppError = InterAppError.fromAxiosError(error);
    res.status(interAppError.statusCode || 500).json({
      success: false,
      error: 'Fehler bei der Vollständigkeitsanalyse',
      code: interAppError.code,
      details: interAppError.details
    });
  }
});

/**
 * GET /api/inter-app-test/warehouses
 * Testet das Abrufen von Lagern
 */
router.get('/warehouses', async (req: Request, res: Response) => {
  try {
    if (!testClient) {
      return res.status(400).json({
        success: false,
        error: 'Keine Verbindung konfiguriert'
      });
    }

    const warehouses = await testClient.getWarehouses();
    
    res.json({
      success: true,
      data: warehouses,
      count: warehouses.length
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Warehouses Test Fehler:', error);
    const interAppError = InterAppError.fromAxiosError(error);
    res.status(interAppError.statusCode || 500).json({
      success: false,
      error: 'Fehler beim Abrufen der Lager',
      code: interAppError.code,
      details: interAppError.details
    });
  }
});

/**
 * POST /api/inter-app-test/custom-request
 * Ermöglicht benutzerdefinierte Anfragen
 */
router.post('/custom-request', async (req: Request, res: Response) => {
  try {
    if (!testClient) {
      return res.status(400).json({
        success: false,
        error: 'Keine Verbindung konfiguriert'
      });
    }

    const { method = 'GET', path = '/', data } = req.body;
    
    if (!path.startsWith('/api/inter-app/')) {
      return res.status(400).json({
        success: false,
        error: 'Nur Inter-App API Pfade sind erlaubt (/api/inter-app/...)'
      });
    }

    let result;
    if (method.toUpperCase() === 'GET') {
      result = await testClient.get(path);
    } else if (method.toUpperCase() === 'POST') {
      result = await testClient.post(path, data);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Nur GET und POST Methoden sind unterstützt'
      });
    }
    
    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Custom Request Fehler:', error);
    const interAppError = InterAppError.fromAxiosError(error);
    res.status(interAppError.statusCode || 500).json({
      success: false,
      error: 'Fehler bei der benutzerdefinierten Anfrage',
      code: interAppError.code,
      details: interAppError.details
    });
  }
});

/**
 * DELETE /api/inter-app-test/disconnect
 * Trennt die Verbindung
 */
router.delete('/disconnect', async (req: Request, res: Response) => {
  try {
    testClient = null;
    
    res.json({
      success: true,
      message: 'Verbindung getrennt'
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Disconnect Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Trennen der Verbindung'
    });
  }
});

/**
 * GET /api/inter-app-test/status
 * Zeigt den aktuellen Verbindungsstatus
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isConnected = testClient !== null;
    let connectionDetails = null;
    
    if (isConnected && testClient) {
      try {
        connectionDetails = await testClient.testConnection();
      } catch (error) {
        connectionDetails = {
          success: false,
          error: error.message
        };
      }
    }
    
    res.json({
      success: true,
      connected: isConnected,
      connectionDetails
    });

  } catch (error) {
    console.error('[INTER-APP-TEST] Status Check Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Status Check'
    });
  }
});

export default router;