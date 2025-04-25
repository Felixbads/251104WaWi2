/**
 * Produkt-Synchronisierungs-Routen
 * 
 * Bietet Endpunkte zur Steuerung der Produktsynchronisierung mit der Vendon API
 */

import express, { Request as ExpressRequest, Response } from 'express';
import { productSyncService } from '../services/productSyncService';
import { z } from 'zod';
import { User } from '../../shared/schema';
import { VendonAPI } from '../services/vendonAPI';

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
router.get('/status', async (req: Request, res: Response) => {
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
router.post('/sync-all', async (req: Request, res: Response) => {
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
router.post('/sync-product/:id', async (req: Request, res: Response) => {
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
router.get('/debug', async (req: Request, res: Response) => {
  try {
    console.log('Starting product sync debug test...');
    
    // Importiere die VendonAPI aus services/vendonAPI.ts
    const { vendonAPI } = await import('../services/vendonAPI');
    const apiKey = process.env.VENDON_API_KEY || '';
    const baseUrl = vendonAPI.apiBaseUrl || 'https://cloud.vendon.net/rest/v1.8.0';
    
    // Initialisierung der Variablen
    let products = [];
    let dbProducts = [];
    let apiError = null;
    let networkError = null;
    
    // Verwende die aktualisierte VendonAPI-Klasse
    try {
      console.log('Abrufen von Produkten über die aktualisierte VendonAPI...');
      products = await vendonAPI.getProducts();
      
      if (Array.isArray(products)) {
        console.log(`Vendon API gab ${products.length} Produkte zurück`);
      } else {
        console.warn('Unerwartetes API-Antwortformat: Keine Array-Antwort');
        products = [];
      }
    } catch (err) {
      console.error('Fehler beim API-Zugriff mit VendonAPI:', err);
      apiError = err;
    }
    
    // Datenbank-Produkte abrufen
    try {
      // Verwende storage vom Express Request
      if (req.storage) {
        dbProducts = await req.storage.getProducts({limit: 1000, offset: 0});
        if (Array.isArray(dbProducts)) {
          console.log(`Erfolgreich ${dbProducts.length} Produkte aus der Datenbank geladen`);
        } else if (dbProducts && typeof dbProducts === 'object' && dbProducts.data) {
          dbProducts = dbProducts.data;
          console.log(`Erfolgreich ${dbProducts.length} Produkte aus dem Datenbank-Objekt geladen`);
        } else {
          console.warn('Datenbank gab ein ungültiges Format zurück');
          dbProducts = [];
        }
      } else {
        console.error('req.storage ist nicht verfügbar');
      }
    } catch (dbErr) {
      console.error('Fehler beim Laden der Datenbankprodukte:', dbErr);
    }
    
    // Status-JSON mit detaillierten Informationen zurückgeben
    return res.json({
      status: apiError ? 'error' : (products.length > 0 ? 'success' : 'warning'),
      apiConnection: apiError ? 'failed' : (products.length > 0 ? 'connected' : 'no_data'),
      vendonProductCount: products.length,
      databaseProductCount: dbProducts.length,
      vendonApiKey: apiKey ? 'configured' : 'missing',
      apiBaseUrl: baseUrl,
      sampleVendonProduct: products.length > 0 ? {
        id: products[0].id,
        name: products[0].name,
        price: products[0].price
      } : null,
      networkError,
      error: apiError instanceof Error ? apiError.message : null,
      apiImplementation: 'Using updated VendonAPI class with Stock API endpoint'
    });
  } catch (error) {
    console.error('Debug API error:', error);
    
    return res.status(500).json({
      status: 'error',
      apiConnection: 'failed',
      vendonProductCount: 0,
      databaseProductCount: 0,
      vendonApiKey: process.env.VENDON_API_KEY ? 'configured' : 'missing',
      apiBaseUrl: 'https://cloud.vendon.net/rest/v1.8.0',
      sampleVendonProduct: null,
      networkError: null,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

export default router;