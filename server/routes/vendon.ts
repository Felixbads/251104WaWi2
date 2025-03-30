import { Router } from 'express';
import { vendonSync } from '../services/vendonSync';

const router = Router();

/**
 * Route, um eine manuelle Vendon-Synchronisierung zu starten
 */
router.post('/sync', async (req, res) => {
  try {
    const { type, startDate, endDate, batchSize, maxDays } = req.body;
    
    let result;
    switch(type) {
      case 'transactions':
        // Optional: Konvertiere Datumszeichenfolgen in Date-Objekte
        const startDateObj = startDate ? new Date(startDate) : undefined;
        const endDateObj = endDate ? new Date(endDate) : undefined;
        result = await vendonSync.syncTransactions(startDateObj, endDateObj, batchSize);
        break;
        
      case 'machines':
        result = await vendonSync.syncMachines();
        break;
        
      case 'products':
        result = await vendonSync.syncProducts();
        break;
        
      case 'events':
        // Optional: Konvertiere Datumszeichenfolgen in Date-Objekte
        const startDateObjEvents = startDate ? new Date(startDate) : undefined;
        const endDateObjEvents = endDate ? new Date(endDate) : undefined;
        result = await vendonSync.syncEvents(startDateObjEvents, endDateObjEvents, batchSize);
        break;
        
      case 'refills':
        // Optional: Konvertiere Datumszeichenfolgen in Date-Objekte
        const startDateObjRefills = startDate ? new Date(startDate) : undefined;
        const endDateObjRefills = endDate ? new Date(endDate) : undefined;
        result = await vendonSync.syncRefills(startDateObjRefills, endDateObjRefills, batchSize);
        break;
        
      case 'all':
        result = await vendonSync.syncAll();
        break;
        
      case 'historical_transactions':
        result = await vendonSync.syncHistoricalTransactions(batchSize, maxDays);
        break;

      case 'historical_batch':
        result = await vendonSync.syncHistoricalBatch();
        break;
        
      default:
        return res.status(400).json({ 
          status: 'error', 
          message: `Unbekannter Synchronisationstyp: ${type}` 
        });
    }
    
    return res.json(result);
    
  } catch (error) {
    console.error("Fehler bei der manuellen Synchronisierung:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * Route, um den Status der Vendon-Synchronisierung abzurufen
 */
router.get('/status', async (req, res) => {
  try {
    const status = await vendonSync.getSyncStatus();
    return res.json(status);
  } catch (error) {
    console.error("Fehler beim Abrufen des Synchronisationsstatus:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Status-Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * Route, um bestehende Transaktion mit erweiterten Daten zu aktualisieren
 */
router.post('/update-transactions', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.body;
    
    const result = await vendonSync.updateExistingTransactions(limit, offset);
    return res.json(result);
  } catch (error) {
    console.error("Fehler bei der Aktualisierung von Transaktionen:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Aktualisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * Route, um die historische Synchronisierung seit 2023 manuell zu starten oder zu stoppen
 */
router.post('/historical-sync', async (req, res) => {
  try {
    const { action, targetYear = 2023, targetMonth = 0, batchSize = 100 } = req.body;
    
    if (action === 'start') {
      // Starte manuell die historische Synchronisierung durch Initialisierung des Status
      vendonSync['historicalSyncState'] = {
        inProgress: true,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth(),
        targetDate: new Date(targetYear, targetMonth, 1), // Standard: 1. Januar 2023
        startDate: new Date(),
        batchSize: batchSize
      };
      
      // Führe einen ersten Batch durch
      const result = await vendonSync.syncHistoricalBatch();
      return res.json({
        status: 'success',
        message: 'Historische Synchronisierung gestartet',
        result
      });
    } else if (action === 'stop') {
      // Stoppe die historische Synchronisierung
      vendonSync['historicalSyncState'].inProgress = false;
      
      return res.json({
        status: 'success',
        message: 'Historische Synchronisierung gestoppt'
      });
    } else {
      return res.status(400).json({
        status: 'error',
        message: `Ungültige Aktion: ${action}. Erlaubt sind 'start' oder 'stop'.`
      });
    }
  } catch (error) {
    console.error("Fehler bei der historischen Synchronisierung:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Historische Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

export default router;