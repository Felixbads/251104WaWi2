/**
 * Produkt-Synchronisierungs-Routen
 * 
 * Bietet Endpunkte zur Steuerung der Produktsynchronisierung mit der Vendon API
 */

import express, { Request as ExpressRequest } from 'express';
import { productSyncService } from '../services/productSyncService';
import { z } from 'zod';
import { User } from '../../shared/schema';
import { vendonAPI } from '../services/vendonAPI';

// Erweitern der Request-Schnittstelle für Storage-Zugriff
interface Request extends ExpressRequest {
  user?: User;
  storage: any; // Typ aus storage.ts
}

const router = express.Router();

/**
 * @route GET /api/product-sync/status
 * @desc Abrufen des aktuellen Status der Produktsynchronisierung
 */
router.get('/status', async (req: Request, res) => {
  try {
    // Hier würde man normalerweise den Status der letzten Synchronisierung abrufen
    // Da wir keine spezifische Methode dafür haben, verwenden wir eine Hilfslösung
    const syncLogs = await req.storage.getSyncLogsByType('products', 1);
    
    if (syncLogs.length === 0) {
      return res.json({
        lastSync: null,
        status: 'never_run',
        message: 'Keine Produktsynchronisierung gefunden'
      });
    }
    
    const lastSync = syncLogs[0];
    return res.json({
      lastSync: {
        id: lastSync.id,
        startDate: lastSync.startDate,
        endDate: lastSync.endDate,
        status: lastSync.syncStatus,
        itemsFound: lastSync.itemsFound,
        itemsSaved: lastSync.itemsSaved,
        errors: lastSync.errors,
        durationSeconds: lastSync.durationSeconds
      },
      status: lastSync.syncStatus,
      message: lastSync.errorMessage || 'OK'
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Produktsynchronisierungsstatus:', error);
    return res.status(500).json({
      error: 'Fehler beim Abrufen des Produktsynchronisierungsstatus',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route POST /api/product-sync/sync-all
 * @desc Startet eine vollständige Synchronisierung aller Produkte
 */
router.post('/sync-all', async (req, res) => {
  try {
    // Starte die Synchronisierung asynchron, damit die Anfrage nicht blockiert wird
    const syncPromise = productSyncService.syncAllProducts();
    
    // Antworte sofort mit einer Bestätigung
    res.json({
      status: 'started',
      message: 'Produktsynchronisierung gestartet'
    });
    
    // Logge das Ergebnis der Synchronisierung, wenn sie abgeschlossen ist
    syncPromise
      .then(result => {
        console.log('Produktsynchronisierung erfolgreich abgeschlossen:', result);
      })
      .catch(error => {
        console.error('Fehler bei der Produktsynchronisierung:', error);
      });
    
  } catch (error) {
    console.error('Fehler beim Starten der Produktsynchronisierung:', error);
    return res.status(500).json({
      error: 'Fehler beim Starten der Produktsynchronisierung',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route POST /api/product-sync/sync-product/:id
 * @desc Synchronisiert ein einzelnes Produkt anhand seiner Vendon-ID
 */
router.post('/sync-product/:id', async (req, res) => {
  try {
    const schema = z.object({
      id: z.string().min(1, 'Produkt-ID ist erforderlich')
    });
    
    const { id } = schema.parse(req.params);
    
    const product = await productSyncService.syncProductById(id);
    
    return res.json({
      status: 'success',
      message: `Produkt ${id} erfolgreich synchronisiert`,
      product
    });
  } catch (error) {
    console.error(`Fehler beim Synchronisieren des Produkts:`, error);
    return res.status(500).json({
      error: 'Fehler beim Synchronisieren des Produkts',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @route GET /api/product-sync/debug
 * @desc Debug-Endpunkt für die Vendon API-Verbindung und Produktsynchronisierung
 */
// Direkt importieren statt dynamisch oder mit require
import { vendonAPI } from '../services/vendonAPI';

router.get('/debug', async (req, res) => {
  try {
    console.log('Starting product sync debug test...');
    
    // 1. Direkt den importierten vendonAPI verwenden
    console.log('Testing Vendon API connection...');
    
    // Prüfen ob API-Key und Base-URL konfiguriert sind
    const configuredApiKey = process.env.VENDON_API_KEY || '';
    const apiBaseUrl = process.env.VENDON_API_BASE_URL || 'https://api.vendon.net/v1';
    
    // 2. Versuche, die Produkte abzurufen - fange spezifisch Netzwerkfehler ab
    let vendonProducts: any[] = [];
    let networkError = null;
    let apiError = null;
    
    try {
      console.log('Fetching products from Vendon API...');
      vendonProducts = await vendonAPI.getProducts();
      console.log(`Vendon API returned ${vendonProducts?.length || 0} products`);
    } catch (apiErr) {
      console.error('Error fetching products:', apiErr);
      apiError = apiErr;
      
      // Netzwerkfehler abfangen
      if (apiErr instanceof Error && apiErr.cause && typeof apiErr.cause === 'object') {
        const cause = apiErr.cause as any;
        if (cause.code === 'ENOTFOUND' || cause.code === 'ETIMEDOUT') {
          networkError = {
            code: cause.code,
            hostname: cause.hostname,
            syscall: cause.syscall,
            message: `Netzwerkfehler: ${cause.code} für ${cause.hostname}`
          };
        }
      }
    }
    
    // 3. Prüfe vorhandene Produkte in der Datenbank
    const dbProducts = await req.storage.getProducts(1000, 0);
    const dbProductCount = dbProducts?.length || 0;
    
    // 4. Sammle Debug-Informationen über die Vendon API-Verbindung
    return res.json({
      status: networkError ? 'error' : (vendonProducts.length > 0 ? 'success' : 'warning'),
      apiConnection: networkError ? 'failed' : (vendonProducts.length > 0 ? 'connected' : 'no_data'),
      vendonProductCount: vendonProducts?.length || 0,
      databaseProductCount: dbProductCount,
      vendonApiKey: configuredApiKey ? 'configured' : 'missing',
      apiBaseUrl,
      sampleVendonProduct: vendonProducts?.length > 0 ? {
        id: vendonProducts[0].id,
        name: vendonProducts[0].name,
        price: vendonProducts[0].price
      } : null,
      networkError,
      error: apiError instanceof Error ? apiError.message : null
    });
  } catch (error) {
    console.error('Debug API error:', error);
    
    return res.status(500).json({
      status: 'error',
      apiConnection: 'failed',
      vendonProductCount: 0,
      databaseProductCount: 0,
      vendonApiKey: process.env.VENDON_API_KEY ? 'configured' : 'missing',
      apiBaseUrl: process.env.VENDON_API_BASE_URL || 'https://api.vendon.net/v1',
      sampleVendonProduct: null,
      networkError: null,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

export default router;