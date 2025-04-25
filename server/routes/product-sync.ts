/**
 * Produkt-Synchronisierungs-Routen
 * 
 * Bietet Endpunkte zur Steuerung der Produktsynchronisierung mit der Vendon API
 */

import express from 'express';
import { productSyncService } from '../services/productSyncService';
import { z } from 'zod';

const router = express.Router();

/**
 * @route GET /api/product-sync/status
 * @desc Abrufen des aktuellen Status der Produktsynchronisierung
 */
router.get('/status', async (req, res) => {
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

export default router;