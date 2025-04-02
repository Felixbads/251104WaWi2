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
    
    // API-Antwort für Frontend-Anzeige erfassen (nur zum Anzeigen in der UI)
    let apiResponse = null;
    
    let result;
    switch(type) {
      case 'transactions':
        // Konvertiere Datumszeichenfolgen in Date-Objekte
        const startDateObj = startDate ? new Date(startDate) : undefined;
        const endDateObj = endDate ? new Date(endDate) : undefined;
        
        console.log(`Manueller Sync für Transaktionen im Zeitraum ${startDateObj?.toISOString() || 'unbekannt'} bis ${endDateObj?.toISOString() || 'unbekannt'}`);
        
        try {
          // Nur für die Anzeige in der UI die aktuelle API-Antwort abrufen
          const api = vendonSync.getApi();
          const fromTimestamp = Math.floor(startDateObj?.getTime() / 1000 || Date.now() / 1000 - 86400 * 7);
          const toTimestamp = Math.floor(endDateObj?.getTime() / 1000 || Date.now() / 1000);
          
          console.log("API-Anfrage: GET /stats/vends (für Frontend-Anzeige)");
          console.log("Parameter:", { from_timestamp: fromTimestamp, to_timestamp: toTimestamp, offset: 0, limit: batchSize });
          
          // Diese API-Antwort ist nur für die Frontend-Anzeige
          apiResponse = await api.getTransactions(fromTimestamp, toTimestamp, undefined, 0, batchSize);
          
          const transactionsData = apiResponse?.result || apiResponse?.data || [];
          const transactionsCount = Array.isArray(transactionsData) ? transactionsData.length : 0;
          console.log(`Frontend erhält ${transactionsCount} Transaktionen als Vorschau`);
          
          // Verarbeite die tatsächliche Synchronisierung direkt, nicht asynchron
          
          const maxTransactions = parseInt(req.body.maxTransactions || "10000");
          console.log("Verwende maxTransactions:", maxTransactions);
          
          // Wichtig: Hier den korrekten API-Aufruf durchführen mit expliziten Parametern
          console.log("Starte manuelle Synchronisierung mit Parametern:", {
            startDate: startDateObj,
            endDate: endDateObj,
            batchSize,
            maxTransactions
          });
          
          // Führe die Synchronisierung direkt durch
          result = await vendonSync.syncTransactions(startDateObj, endDateObj, batchSize, maxTransactions);
          
          // Wir erhalten jetzt ein direktes Ergebnis mit allen Informationen
          console.log("Synchronisierung abgeschlossen mit Ergebnis:", result);
          
        } catch (error) {
          console.error("Fehler bei der manuellen Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;
        
      case 'machines':
        try {
          // Für die UI-Anzeige die API-Antwort erfassen
          const api = vendonSync.getApi();
          apiResponse = await api.getMachines();
          
          // Führe die eigentliche Synchronisierung durch
          console.log("Manueller Sync für Maschinen gestartet");
          result = await vendonSync.syncMachines();
          console.log("Maschinen-Synchronisierung abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler bei der Maschinen-Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Maschinen-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;
        
      case 'products':
        try {
          // Für die UI-Anzeige die API-Antwort erfassen
          const api = vendonSync.getApi();
          apiResponse = await api.getProducts();
          
          // Führe die eigentliche Synchronisierung durch
          console.log("Manueller Sync für Produkte gestartet");
          result = await vendonSync.syncProducts();
          console.log("Produkt-Synchronisierung abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler bei der Produkt-Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Produkt-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;
        
      case 'stocks':
        try {
          // Für die UI-Anzeige die API-Antwort erfassen
          const api = vendonSync.getApi();
          apiResponse = await api.getStockProducts();
          
          // Führe die eigentliche Synchronisierung durch
          console.log("Manueller Sync für Lagerbestände gestartet");
          result = await vendonSync.syncStocks();
          console.log("Lagerbestand-Synchronisierung abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler bei der Lagerbestand-Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Lagerbestand-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;
        
      case 'events':
        try {
          // Konvertiere Datumszeichenfolgen in Date-Objekte
          const startDateObjEvents = startDate ? new Date(startDate) : undefined;
          const endDateObjEvents = endDate ? new Date(endDate) : undefined;
          
          console.log(`Manueller Sync für Events im Zeitraum ${startDateObjEvents?.toISOString() || 'unbekannt'} bis ${endDateObjEvents?.toISOString() || 'unbekannt'}`);
          
          // Für die UI-Anzeige die API-Antwort erfassen
          const api = vendonSync.getApi();
          const fromTimestamp = Math.floor(startDateObjEvents?.getTime() / 1000 || Date.now() / 1000 - 86400 * 7);
          const toTimestamp = Math.floor(endDateObjEvents?.getTime() / 1000 || Date.now() / 1000);
          apiResponse = await api.getEvents(fromTimestamp, toTimestamp);
          
          // Führe die eigentliche Synchronisierung durch
          result = await vendonSync.syncEvents(startDateObjEvents, endDateObjEvents, batchSize);
          console.log("Event-Synchronisierung abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler bei der Event-Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Event-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;
        
      case 'refills':
        try {
          // Konvertiere Datumszeichenfolgen in Date-Objekte
          const startDateObjRefills = startDate ? new Date(startDate) : undefined;
          const endDateObjRefills = endDate ? new Date(endDate) : undefined;
          
          console.log(`Manueller Sync für Refills im Zeitraum ${startDateObjRefills?.toISOString() || 'unbekannt'} bis ${endDateObjRefills?.toISOString() || 'unbekannt'}`);
          
          // Für die UI-Anzeige die API-Antwort erfassen
          const api = vendonSync.getApi();
          const fromTimestamp = Math.floor(startDateObjRefills?.getTime() / 1000 || Date.now() / 1000 - 86400 * 7);
          const toTimestamp = Math.floor(endDateObjRefills?.getTime() / 1000 || Date.now() / 1000);
          apiResponse = await api.getRefills(fromTimestamp, toTimestamp);
          
          // Führe die eigentliche Synchronisierung durch
          result = await vendonSync.syncRefills(startDateObjRefills, endDateObjRefills, batchSize);
          console.log("Refill-Synchronisierung abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler bei der Refill-Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Refill-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;
        
      case 'all':
        try {
          // Führe die eigentliche Synchronisierung durch
          console.log("Manueller Sync für ALLE Daten gestartet");
          result = await vendonSync.syncAll();
          console.log("Komplette Synchronisierung abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler bei der kompletten Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Komplette Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;
        
      case 'historical_transactions':
        try {
          // Führe die eigentliche Synchronisierung durch
          console.log("Manueller Sync für historische Transaktionen gestartet");
          result = await vendonSync.syncHistoricalTransactions(batchSize, maxDays);
          console.log("Historische Transaktionen-Synchronisierung abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler bei der historischen Transaktionen-Synchronisierung:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Historische Transaktionen-Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
        break;

      case 'historical_batch':
        try {
          // Führe die eigentliche Synchronisierung durch
          console.log("Manueller Sync für historischen Batch gestartet");
          result = await vendonSync.syncHistoricalBatch();
          console.log("Historischer Batch abgeschlossen mit Ergebnis:", result);
        } catch (error) {
          console.error("Fehler beim historischen Batch:", error);
          return res.status(500).json({ 
            status: 'error', 
            message: `Historischer Batch fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error.stack : String(error)
          });
        }
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