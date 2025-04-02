import { Router } from 'express';
import { vendonSync } from '../services/vendonSync';
import { storage } from '../storage';
import { MachineStock } from '@shared/schema';

const router = Router();

/**
 * Route, um eine manuelle Vendon-Synchronisierung zu starten
 */
router.post('/sync', async (req, res) => {
  try {
    const { type, startDate, endDate, batchSize, maxDays } = req.body;
    
    // API-Antwort für Frontend-Anzeige erfassen
    let apiResponse = null;
    
    let result;
    switch(type) {
      case 'transactions':
        // Optional: Konvertiere Datumszeichenfolgen in Date-Objekte
        const startDateObj = startDate ? new Date(startDate) : undefined;
        const endDateObj = endDate ? new Date(endDate) : undefined;
        
        // API-Antwort erfassen
        try {
          const api = vendonSync.getApi();
          const fromTimestamp = Math.floor(startDateObj?.getTime() / 1000 || Date.now() / 1000 - 86400 * 7);
          const toTimestamp = Math.floor(endDateObj?.getTime() / 1000 || Date.now() / 1000);
          
          console.log("API-Anfrage: GET /stats/vends (für Frontend-Anzeige)");
          console.log("Parameter:", { from_timestamp: fromTimestamp, to_timestamp: toTimestamp, offset: 0, limit: batchSize });
          
          apiResponse = await api.getTransactions(fromTimestamp, toTimestamp, undefined, 0, batchSize);
          
          // Bei der eigentlichen Synchronisierung die API-Antwort mitgeben
          // Übergebe die API-Antwort an die syncTransactions Funktion als preloadedData
          // maxTransactions als separater Parameter übergeben
          const maxTransactions = parseInt(req.body.maxTransactions || "1000");
          console.log("Verwende maxTransactions:", maxTransactions);
          
          result = await vendonSync.syncTransactions(startDateObj, endDateObj, batchSize, maxTransactions, apiResponse);
        } catch (apiError) {
          console.error("Fehler beim Abrufen der API-Antwort:", apiError);
          // Die Synchronisierung trotzdem durchführen, auch wenn die API-Antwort nicht erfasst werden konnte
          result = await vendonSync.syncTransactions(startDateObj, endDateObj, batchSize);
        }
        break;
        
      case 'machines':
        try {
          // API-Antwort erfassen
          const api = vendonSync.getApi();
          apiResponse = await api.getMachines();
        } catch (apiError) {
          console.error("Fehler beim Abrufen der Maschinen-API-Antwort:", apiError);
        }
        result = await vendonSync.syncMachines();
        break;
        
      case 'products':
        try {
          // API-Antwort erfassen
          const api = vendonSync.getApi();
          apiResponse = await api.getProducts();
        } catch (apiError) {
          console.error("Fehler beim Abrufen der Produkt-API-Antwort:", apiError);
        }
        result = await vendonSync.syncProducts();
        break;
        
      case 'stocks':
        try {
          // API-Antwort erfassen
          const api = vendonSync.getApi();
          apiResponse = await api.getStockProducts();
        } catch (apiError) {
          console.error("Fehler beim Abrufen der Stock-API-Antwort:", apiError);
        }
        result = await vendonSync.syncStocks();
        break;
        
      case 'events':
        // Optional: Konvertiere Datumszeichenfolgen in Date-Objekte
        const startDateObjEvents = startDate ? new Date(startDate) : undefined;
        const endDateObjEvents = endDate ? new Date(endDate) : undefined;
        
        try {
          // API-Antwort erfassen
          const api = vendonSync.getApi();
          const fromTimestamp = Math.floor(startDateObjEvents?.getTime() / 1000 || Date.now() / 1000 - 86400 * 7);
          const toTimestamp = Math.floor(endDateObjEvents?.getTime() / 1000 || Date.now() / 1000);
          
          apiResponse = await api.getEvents(fromTimestamp, toTimestamp);
        } catch (apiError) {
          console.error("Fehler beim Abrufen der Events-API-Antwort:", apiError);
        }
        
        result = await vendonSync.syncEvents(startDateObjEvents, endDateObjEvents, batchSize);
        break;
        
      case 'refills':
        // Optional: Konvertiere Datumszeichenfolgen in Date-Objekte
        const startDateObjRefills = startDate ? new Date(startDate) : undefined;
        const endDateObjRefills = endDate ? new Date(endDate) : undefined;
        
        try {
          // API-Antwort erfassen
          const api = vendonSync.getApi();
          const fromTimestamp = Math.floor(startDateObjRefills?.getTime() / 1000 || Date.now() / 1000 - 86400 * 7);
          const toTimestamp = Math.floor(endDateObjRefills?.getTime() / 1000 || Date.now() / 1000);
          
          apiResponse = await api.getRefills(fromTimestamp, toTimestamp);
        } catch (apiError) {
          console.error("Fehler beim Abrufen der Refills-API-Antwort:", apiError);
        }
        
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
    
    // Bereite eine Zusammenfassung der Synchronisierung vor
    let syncSummary = '';
    if (result && typeof result === 'object') {
      // Zeige die Anzahl der gefundenen und gespeicherten Einträge
      const itemsFound = result.itemsFound || result.transactions_found || 0;
      const itemsSaved = result.itemsSaved || result.transactions_saved || 0;
      const itemsUpdated = result.itemsUpdated || result.transactions_updated || 0;
      const duplicates = result.duplicates || 0;
      const errors = result.errors || 0;
      
      syncSummary = `\n\n=== SYNCHRONISIERUNGSZUSAMMENFASSUNG ===
Gefundene Einträge: ${itemsFound}
Neu gespeicherte Einträge: ${itemsSaved}
Aktualisierte Einträge: ${itemsUpdated}
Duplikate übersprungen: ${duplicates}
Fehler aufgetreten: ${errors}
`;
    }
    
    // API-Antwort mit Zusammenfassung zum Ergebnis hinzufügen
    let formattedApiResponse = apiResponse ? JSON.stringify(apiResponse, null, 2) : null;
    if (formattedApiResponse) {
      formattedApiResponse += syncSummary;
    }
    
    // Hole den vollständigen SyncLog aus der Datenbank
    let syncLog = null;
    if (result && result.syncLogId) {
      try {
        syncLog = await storage.getSyncLogById(result.syncLogId);
      } catch (error) {
        console.error("Fehler beim Abrufen des SyncLogs:", error);
      }
    }
    
    const response = {
      ...result,
      apiResponse: formattedApiResponse,
      syncLog, // Füge das vollständige SyncLog zur Antwort hinzu
      stats: { // Separate übersichtliche Statistiken
        itemsFound: result.itemsFound || result.transactions_found || 0,
        itemsSaved: result.itemsSaved || result.transactions_saved || 0,
        itemsUpdated: result.itemsUpdated || result.transactions_updated || 0,
        duplicates: result.duplicates || 0,
        errors: result.errors || 0,
      }
    };
    
    return res.json(response);
    
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
 * Route, um alle Produkte von Vendon abzurufen
 */
router.get('/products', async (req, res) => {
  try {
    // Hole alle Produkte ohne Limit und gib sie als Array (nicht als Paginated-Response) zurück
    const products = await storage.getProducts(0); // 0 = kein Limit
    if (Array.isArray(products)) {
      return res.json(products);
    } else if (products && products.data && Array.isArray(products.data)) {
      return res.json(products.data);  // Extrahiere die Daten aus der paginierten Antwort
    } else {
      console.log("Unerwartetes Format der Produktdaten:", products);
      return res.json([]);  // Fallback: Leeres Array zurückgeben
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Produkte:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Produkt-Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * Route, um alle Vendon-Produkte direkt von der API abzurufen
 * Diese Route ruft die Produkte ohne Begrenzung direkt von der API ab
 */
router.get('/vendon/products', async (req, res) => {
  try {
    // Produkte direkt von der Vendon API abrufen
    const api = vendonSync.getApi();
    const products = await api.getProducts();
    return res.json(products);
  } catch (error) {
    console.error("Fehler beim Abrufen der Vendon-Produkte:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Vendon-Produkt-Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
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
 * Route, um alle Lagerbestände (Stocks) abzurufen
 */
router.get('/stocks', async (req, res) => {
  try {
    const stocks = await storage.getStocks(0); // 0 = kein Limit
    return res.json(stocks);
  } catch (error) {
    console.error("Fehler beim Abrufen der Lagerbestände:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Lagerbestand-Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * Route, um Maschinen-Lagerbestände abzurufen
 * Optional: Maschinenfilter mit ?machineId=X
 */
router.get('/machine-stocks', async (req, res) => {
  try {
    const machineId = req.query.machineId ? parseInt(req.query.machineId as string, 10) : undefined;
    
    // Wenn eine MachineID angegeben wurde, hole nur Bestände für diese Maschine
    if (machineId) {
      const machineStocks = await storage.getMachineStocks(machineId);
      return res.json(machineStocks);
    } else {
      // Ansonsten hole alle Maschinen-Bestände für jede Maschine
      const machines = await storage.getMachines(0);
      let allMachineStocks: MachineStock[] = [];
      
      // Hole Bestände für jede Maschine
      for (const machine of machines) {
        const machineStocks = await storage.getMachineStocks(machine.id);
        allMachineStocks = [...allMachineStocks, ...machineStocks];
      }
      return res.json(allMachineStocks);
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Maschinen-Lagerbestände:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Maschinen-Lagerbestand-Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * Route, um Vendon Stock-Daten direkt von der API abzurufen
 */
router.get('/vendon/stocks', async (req, res) => {
  try {
    // Stock-Produkte direkt von der Vendon API abrufen
    const api = vendonSync.getApi();
    const stocks = await api.getStockProducts();
    return res.json(stocks);
  } catch (error) {
    console.error("Fehler beim Abrufen der Vendon-Stock-Produkte:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Vendon-Stock-Produkt-Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * Route, um Vendon Maschinen-Stock-Daten direkt von der API abzurufen
 */
router.get('/vendon/machine-stock/:machineId', async (req, res) => {
  try {
    const { machineId } = req.params;
    
    if (!machineId) {
      return res.status(400).json({
        status: 'error',
        message: 'Keine Maschinen-ID angegeben'
      });
    }
    
    // Maschinen-Stock direkt von der Vendon API abrufen
    const api = vendonSync.getApi();
    const machineStock = await api.getMachineStock(machineId);
    return res.json(machineStock);
  } catch (error) {
    console.error("Fehler beim Abrufen des Vendon-Maschinen-Stocks:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Vendon-Maschinen-Stock-Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
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
      // Aktuelle Anzahl der Transaktionen ermitteln
      const transactionCount = await vendonSync.getTransactionCount();
      
      vendonSync['historicalSyncState'] = {
        inProgress: true,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth(),
        targetDate: new Date(targetYear, targetMonth, 1), // Standard: 1. Januar 2023
        startDate: new Date(),
        batchSize: batchSize,
        totalTransactions: transactionCount,
        completedMonths: [],
        processingStart: Date.now()
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