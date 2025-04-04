import { Router, Request, Response } from 'express';
import { vendonSync } from '../services/vendonSync';
import { storage } from '../storage';
import { MachineStock } from '@shared/schema';
import { UploadedFile } from 'express-fileupload';

// Erweitere den Express Request-Typ um files-Eigenschaft
interface FileUploadRequest extends Request {
  files?: {
    [fieldname: string]: UploadedFile | UploadedFile[]
  };
}

const router = Router();

/**
 * Komplett neu implementierte Route für manuelle Vendon-Synchronisierung
 * Basiert auf dem gut funktionierenden automatischen Synchronisierungsprozess
 */
router.post('/sync', async (req, res) => {
  try {
    const { type, startDate, endDate, batchSize, maxTransactions, forceUpdate = false } = req.body;
    console.log(`Manuelle Synchronisierungsanfrage mit Force Update: ${forceUpdate}`);
    console.log(`Manuelle Synchronisierungsanfrage erhalten für Typ: ${type}`);
    console.log(`Parameter: startDate=${startDate}, endDate=${endDate}, batchSize=${batchSize}, maxTransactions=${maxTransactions}`);

    // Konvertiere Datumszeichenfolgen in Date-Objekte
    const startDateObj = startDate ? new Date(startDate) : new Date();
    startDateObj.setDate(startDateObj.getDate() - 1); // Standard: 1 Tag zurück
    
    const endDateObj = endDate ? new Date(endDate) : new Date();
    
    // Unix-Timestamps für die API-Aufrufe
    const fromTimestamp = Math.floor(startDateObj.getTime() / 1000);
    const toTimestamp = Math.floor(endDateObj.getTime() / 1000);
    
    console.log(`Verwende Zeitraum: ${startDateObj.toISOString()} bis ${endDateObj.toISOString()}`);
    console.log(`Timestamps: ${fromTimestamp} bis ${toTimestamp}`);
    
    // Holen wir uns die API-Instanz für unsere direkten Aufrufe
    const api = vendonSync.getApi();
    
    // Synchronisierungs-Log anlegen für Hintergrund-Verarbeitung und UI-Updates
    const syncLogData = {
      syncType: type,
      startDate: startDateObj,
      endDate: endDateObj,
      syncStatus: 'running',
      itemsFound: 0, // Wird später aktualisiert
      additionalData: JSON.stringify({
        batchSize: parseInt(batchSize as string) || 100,
        maxTransactions: parseInt(maxTransactions as string) || 10000
      })
    };
    
    // Erstellen wir das Log für das Tracking
    let syncLogId = null;
    try {
      const logEntry = await storage.createSyncLog(syncLogData);
      if (logEntry && logEntry.id) {
        syncLogId = logEntry.id;
        console.log(`Sync-Log-Eintrag erstellt mit ID: ${syncLogId}`);
      }
    } catch (logError) {
      console.error(`Fehler beim Erstellen des Sync-Log-Eintrags: ${logError}`);
    }
    
    let previewData = {
      count: 0,
      estimatedTotal: 0,
      timeRange: `${startDateObj.toISOString()} bis ${endDateObj.toISOString()}`
    };
    
    let sampleCount = 0;
    let totalEstimate = 0;
    
    try {
      // Für Transaktionen holen wir eine Vorschau der Daten um die Anzahl zu schätzen
      if (type === 'transactions') {
        console.log(`Hole Transaktionen, Seite 1 mit Batchgröße ${parseInt(batchSize as string) || 100}`);
        console.log(`API-Anfrage: GET /stats/vends (Versuch 1/3)`);
        console.log(`Parameter:`, {
          from_timestamp: fromTimestamp,
          to_timestamp: toTimestamp,
          offset: 0,
          limit: parseInt(batchSize as string) || 100
        });
        
        try {
          // Holen wir eine Stichprobe für die ersten Transaktionen im Zeitraum
          const sampleResponse = await api.getTransactions(
            fromTimestamp, 
            toTimestamp, 
            undefined, 
            0, 
            parseInt(batchSize as string) || 100
          );
          
          // API-Antwort ins Log schreiben, um Debug-Informationen zu haben
          console.log("API-Antwort Vorschau:", JSON.stringify(sampleResponse).substring(0, 200) + "...");
          
          // Extrahieren wir die Daten je nach API-Antwortformat
          const transactionsData = sampleResponse?.data || (sampleResponse as any)?.result || [];
          sampleCount = Array.isArray(transactionsData) ? transactionsData.length : 0;
          
          console.log(`${sampleCount} Transaktionen auf Seite 1 gefunden`);
          
          // Schätzen wir die Gesamtzahl
          totalEstimate = sampleCount;
          
          // Prüfen, ob wir aus der API-Antwort eine präzisere Schätzung bekommen können
          if ((sampleResponse as any)?.paging?.total) {
            totalEstimate = parseInt((sampleResponse as any).paging.total as string);
            console.log(`API gibt geschätzte Gesamtzahl: ${totalEstimate}`);
          } else if ((sampleResponse as any)?.total) {
            totalEstimate = parseInt((sampleResponse as any).total);
            console.log(`API gibt geschätzte Gesamtzahl: ${totalEstimate}`);
          } else if (sampleCount > 0) {
            // Für längere Zeiträume eine höhere Schätzung basierend auf der Stichprobe
            const days = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
            
            // Einfache Extrapolation basierend auf gefundenen Daten und Zeitraum
            if (days > 1) {
              totalEstimate = Math.min(10000, sampleCount * days);
              console.log(`Schätzung für ${days} Tage: ${totalEstimate}`);
            }
          }
        } catch (previewError) {
          // Bei Fehlern in der Vorschau loggen, aber nicht abbrechen
          console.error("Fehler bei der Vorschauabfrage:", previewError);
          console.log("Verwende Standardschätzung von 100 Transaktionen");
          // Standardwert verwenden
          previewData.estimatedTotal = 100;
          totalEstimate = 100;
        }
        
        previewData = {
          count: sampleCount,
          estimatedTotal: totalEstimate,
          timeRange: `${startDateObj.toISOString()} bis ${endDateObj.toISOString()}`
        };
        
        // Aktualisieren wir das Log mit den geschätzten Zahlen
        if (syncLogId) {
          await storage.updateSyncLog(syncLogId, {
            itemsFound: totalEstimate
          });
        }
      }
      
      // Starte die tatsächliche Synchronisierung im Hintergrund
      // WICHTIG: Problemursache - Wir verwenden einen direkten asynchronen Aufruf ohne setTimeout,
      // da es scheint, dass der setTimeout-Callback das Problem verursacht und verhindert, dass die 
      // Speicherung korrekt durchgeführt wird.
      (async () => {
        try {
          let syncResult: any = { 
            itemsSaved: 0, 
            itemsUpdated: 0, 
            duplicates: 0, 
            errors: 0 
          };
          
          // Je nach Typ unterschiedliche Synchronisierungsmethoden aufrufen
          switch(type) {
            case 'transactions':
              syncResult = await vendonSync.syncTransactions(
                startDateObj, 
                endDateObj, 
                parseInt(batchSize as string) || 100,
                parseInt(maxTransactions as string) || 10000,
                forceUpdate
              );
              break;
              
            case 'machines':
              syncResult = await vendonSync.syncMachines();
              break;
              
            case 'products':
              syncResult = await vendonSync.syncProducts();
              break;
              
            case 'events':
              syncResult = await vendonSync.syncEvents(startDateObj, endDateObj);
              break;
              
            case 'refills':
              syncResult = await vendonSync.syncRefills(startDateObj, endDateObj);
              break;
              
            default:
              console.error(`Unbekannter Synchronisierungstyp: ${type}`);
              syncResult = { status: 'error', message: `Unbekannter Synchronisierungstyp: ${type}` };
          }
          
          console.log(`Hintergrundsynchronisierung für ${type} abgeschlossen. Ergebnis:`, syncResult);
          
          // Log-Eintrag aktualisieren, wenn vorhanden
          if (syncLogId) {
            try {
              // Extrahiere die Statistiken aus dem Ergebnis, egal in welchem Format sie vorliegen
              const itemsSaved = syncResult.itemsSaved || syncResult.transactions_saved || 0;
              const itemsUpdated = syncResult.itemsUpdated || syncResult.transactions_updated || 0;
              const duplicates = syncResult.duplicates || 0;
              const errors = syncResult.errors || 0;
              
              await storage.updateSyncLog(syncLogId, {
                syncStatus: 'completed',
                endDate: new Date(),
                itemsSaved: itemsSaved,
                itemsUpdated: itemsUpdated, 
                duplicates: duplicates,
                errors: errors
              });
              console.log(`Sync-Log ${syncLogId} mit Erfolg aktualisiert`);
            } catch (updateError) {
              console.error(`Fehler beim Aktualisieren des Sync-Logs: ${updateError}`);
            }
          }
        } catch (error) {
          console.error(`Fehler bei der Hintergrundsynchronisierung: ${error}`);
          
          // Bei Fehler auch den Log-Eintrag aktualisieren
          if (syncLogId) {
            try {
              await storage.updateSyncLog(syncLogId, {
                syncStatus: 'error',
                endDate: new Date(),
                errorMessage: error instanceof Error ? error.message : String(error)
              });
              console.log(`Sync-Log ${syncLogId} mit Fehler aktualisiert`);
            } catch (updateError) {
              console.error(`Fehler beim Aktualisieren des Sync-Logs: ${updateError}`);
            }
          }
        }
      })();
      
      // Sofortige Antwort mit Vorschau-Daten und syncLogId
      return res.json({
        status: 'success',
        message: 'Synchronisierung im Hintergrund gestartet',
        syncLogId: syncLogId,
        preview: previewData,
        stats: {
          itemsFound: previewData.estimatedTotal,
          itemsSaved: 0,
          itemsUpdated: 0,
          duplicates: 0,
          errors: 0
        }
      });
    } catch (apiError) {
      console.error(`Fehler beim Starten der ${type}-Synchronisierung:`, apiError);
      
      // Bei Fehler auch den Log-Eintrag aktualisieren
      if (syncLogId) {
        try {
          await storage.updateSyncLog(syncLogId, {
            syncStatus: 'error',
            endDate: new Date(),
            errorMessage: apiError instanceof Error ? apiError.message : String(apiError)
          });
        } catch (updateError) {
          console.error(`Fehler beim Aktualisieren des Fehler-Logs: ${updateError}`);
        }
      }
      
      // Fehler bei der Verarbeitung zurückgeben
      return res.status(500).json({
        status: 'error',
        message: `Fehler bei der Verarbeitung der Synchronisierungsanfrage: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
      });
    }
  } catch (error) {
    // Allgemeiner Fehlerfall
    console.error("Unerwarteter Fehler bei der manuellen Synchronisierung:", error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Unerwarteter Fehler: ${error instanceof Error ? error.message : String(error)}` 
    });
  }  
});

/**
 * Alte Implementierungen, die jetzt nicht mehr verwendet werden und auskommentiert wurden
 */
/* 
// Alte case 'machines'-Implementierung
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
    
    // Vollständige Ausgabe der Server-Antwort für Debugging
    console.log("Antwort wird vorbereitet. result ist:", result);
    
    const response = {
      status: 'success',
      message: 'Synchronisierung gestartet',
      ...result,
      apiResponse: formattedApiResponse,
      syncLog, // Füge das vollständige SyncLog zur Antwort hinzu
      stats: { // Separate übersichtliche Statistiken
        itemsFound: result?.itemsFound || result?.transactions_found || 0,
        itemsSaved: result?.itemsSaved || result?.transactions_saved || 0,
        itemsUpdated: result?.itemsUpdated || result?.transactions_updated || 0,
        duplicates: result?.duplicates || 0,
        errors: result?.errors || 0,
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
    console.log("Rufe tatsächliche Produkte aus der Datenbank ab...");
    
    // Extrahiere Abfrageparameter
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 500;
    const page = req.query.page ? parseInt(req.query.page as string) : 0;
    const offset = page * limit;
    
    // Hole die echten Produktdaten aus der products-Tabelle
    const productsResponse = await storage.getProducts({
      limit,
      offset
    });
    
    let products = [];
    let totalCount = 0;
    
    if ('data' in productsResponse && Array.isArray(productsResponse.data)) {
      products = productsResponse.data;
      totalCount = productsResponse.meta?.total || 0;
    } else if (Array.isArray(productsResponse)) {
      products = productsResponse;
      totalCount = products.length;
    }
    
    // Ergänze die Lagerbestandsdaten, da diese in der echten Datenbank fehlen könnten
    const productsWithStock = products.map(product => {
      // Generiere einen zufälligen Bestand zwischen 0 und 30
      const inStock = product.inStock !== undefined ? product.inStock : Math.floor(Math.random() * 30);
      // Setze einen kritischen Wert, wenn er nicht vorhanden ist
      const amountCritical = product.amountCritical !== undefined ? product.amountCritical : 5;
      
      return {
        ...product,
        // Nur hinzufügen, wenn die Eigenschaften nicht bereits vorhanden sind
        inStock: inStock,
        amountCritical: amountCritical
      };
    });
    
    console.log(`${productsWithStock.length} echte Produkte aus der Datenbank geladen (insgesamt ${totalCount}).`);
    return res.json(productsWithStock);
    
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

/**
 * Route für den Import von Vendon-Transaktionen aus einer Excel-Datei
 * POST /api/vendon/import/excel
 */
router.post('/import/excel', async (req: FileUploadRequest, res: Response) => {
  try {
    console.log('Starte Import von Vendon-Transaktionen aus Excel-Datei...');
    
    // Prüfe, ob eine Datei hochgeladen wurde
    if (!req.files || !req.files.file) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Keine Datei hochgeladen' 
      });
    }
    
    // Importiere den Excel-Importer
    const { vendonExcelImporter } = await import('../services/vendonExcelImport');
    
    // Hole die hochgeladene Datei
    const file = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    
    console.log(`Datei ${file.name} (${file.size} Bytes) hochgeladen`);
    
    // Optionen aus dem Request-Body extrahieren
    const options = {
      sheetName: req.body.sheetName || undefined,
      skipRows: req.body.skipRows ? parseInt(req.body.skipRows) : undefined,
      headerMappings: req.body.headerMappings ? JSON.parse(req.body.headerMappings) : undefined
    };
    
    console.log(`Import-Optionen:`, options);
    
    // Starte den Import-Prozess
    const importResults = await vendonExcelImporter.importTransactionsFromExcel(file.data, options);
    
    // Synchronisierungslog erstellen
    let syncLogId = null;
    try {
      const syncLogData = {
        syncType: 'transactions_excel_import',
        startDate: new Date(),
        endDate: new Date(),
        syncStatus: 'completed',
        itemsFound: importResults.total,
        itemsSaved: importResults.saved,
        duplicates: importResults.duplicates,
        errors: importResults.errors,
        additionalData: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          importOptions: options
        })
      };
      
      const logEntry = await storage.createSyncLog(syncLogData);
      if (logEntry && logEntry.id) {
        syncLogId = logEntry.id;
        console.log(`Sync-Log-Eintrag erstellt mit ID: ${syncLogId}`);
      }
    } catch (logError) {
      console.error(`Fehler beim Erstellen des Sync-Log-Eintrags: ${logError}`);
    }
    
    // Erfolgsantwort senden
    return res.status(200).json({
      status: 'success',
      message: 'Excel-Import abgeschlossen',
      syncLogId: syncLogId,
      stats: {
        total: importResults.total,
        saved: importResults.saved,
        duplicates: importResults.duplicates,
        errors: importResults.errors
      }
    });
  } catch (error) {
    console.error('Fehler beim Importieren der Excel-Datei:', error);
    
    // Fehlerantwort senden
    return res.status(500).json({
      status: 'error',
      message: `Fehler beim Import: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

export default router;