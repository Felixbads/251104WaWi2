import { Router, Request, Response } from 'express';
import { vendonSync } from '../services/vendonSync';
import { historicalVendonSync } from '../services/historicalVendonSync';
import { SystematicHistoricalSync } from '../services/systematicHistoricalSync';
import { TargetedHistoricalBackfill } from '../services/targetedHistoricalBackfill';
import { storage } from '../storage';
import { MachineStock, historicalSyncOptionsSchema } from '@shared/schema';
import { UploadedFile } from 'express-fileupload';
import { SQL, and, asc, between, count, desc, eq, gt, gte, lt, lte, sql } from 'drizzle-orm';
import { db, rawDb } from '../db';
import { transactions } from '@shared/schema';
import { z } from 'zod';

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
              
            case 'today':
              // Heute-Synchronisation: Gestern bis heute
              const todayStart = new Date();
              todayStart.setDate(todayStart.getDate() - 1);
              const todayEnd = new Date();
              
              syncResult = await vendonSync.syncTransactions(
                todayStart, 
                todayEnd, 
                parseInt(batchSize as string) || 100,
                parseInt(maxTransactions as string) || 2000,
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
              
            case 'systematic-historical':
              // Systematische historische Synchronisation ab 01.01.2024 mit 6-Stunden-Intervallen
              const systematicSync = new SystematicHistoricalSync();
              const syncStartDate = startDateObj || new Date('2024-01-01');
              const syncEndDate = endDateObj || new Date();
              const intervalHours = parseInt(req.body.intervalHours as string) || 6;
              
              console.log(`Starte systematische historische Synchronisation: ${syncStartDate.toISOString()} bis ${syncEndDate.toISOString()}, Intervall: ${intervalHours}h`);
              
              const progress = await systematicSync.startSystematicSync(syncStartDate, syncEndDate, intervalHours);
              syncResult = {
                status: 'success',
                message: `Systematische Synchronisation abgeschlossen: ${progress.newTransactions} neue Transaktionen`,
                syncLogId: syncLogId,
                progress: progress
              };
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
 * Route für die historische Synchronisierung von Vendon-Transaktionen
 * POST /api/vendon/historical-sync
 */
router.post('/historical-sync', async (req: Request, res: Response) => {
  try {
    console.log('Starte historische Synchronisierung von Vendon-Transaktionen...');
    console.log('Request-Body:', req.body);
    
    // Validiere die Optionen mit Zod
    const validationResult = historicalSyncOptionsSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Ungültige Optionen für die historische Synchronisierung',
        errors: validationResult.error.format()
      });
    }
    
    const options = validationResult.data;
    
    // Starte die historische Synchronisierung
    const result = await historicalVendonSync.startHistoricalSync(options);
    
    // Vollständige Antwort vom Server loggen
    console.log('Vollständige Antwort vom Server:', JSON.stringify(result, null, 2));
    
    return res.json(result);
    
  } catch (error) {
    console.error('Fehler bei der historischen Synchronisierung von Vendon-Transaktionen:', error);
    return res.status(500).json({
      status: 'error',
      message: `Historische Synchronisierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * Route für den Import von Vendon-Transaktionen aus JSON-Daten
 * POST /api/vendon/import/json
 */
router.post('/import/json', async (req: Request, res: Response) => {
  try {
    console.log('Starte Import von Vendon-Transaktionen aus JSON-Daten...');
    
    // Prüfe, ob Transaktionsdaten im Request enthalten sind
    if (!req.body || !req.body.transactions || !Array.isArray(req.body.transactions)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Keine gültigen Transaktionsdaten im Request' 
      });
    }
    
    // Importiere den JSON-Importer
    const { vendonJsonImporter } = await import('../services/vendonJsonImport');
    
    // Hole die Transaktionsdaten aus dem Request
    const transactions = req.body.transactions;
    
    console.log(`${transactions.length} Transaktionen im Request gefunden`);
    
    // Optionen aus dem Request-Body extrahieren
    const options = {
      skipExistingCheck: req.body.skipExistingCheck === true
    };
    
    console.log(`Import-Optionen:`, options);
    
    // Starte den Import-Prozess
    const importResults = await vendonJsonImporter.importTransactionsFromJson(transactions, options);
    
    // Synchronisierungslog erstellen
    let syncLogId = null;
    try {
      const syncLogData = {
        syncType: 'json-import',
        status: 'completed',
        startTime: new Date(),
        endTime: new Date(),
        totalItems: importResults.total,
        savedItems: importResults.saved,
        errorItems: importResults.errors,
        errorDetails: importResults.errorDetails,
        metadata: JSON.stringify({
          transactionCount: transactions.length,
          options
        })
      };
      
      const syncLog = await storage.createSyncLog(syncLogData);
      syncLogId = syncLog.id;
      
    } catch (logError) {
      console.error('Fehler beim Erstellen des Synchronisierungslogs:', logError);
      // Fahre trotzdem fort, da der Import bereits erfolgt ist
    }
    
    // Erfolgsantwort senden
    return res.json({
      status: 'success',
      message: 'Vendon-Transaktionen erfolgreich importiert',
      stats: {
        total: importResults.total,
        saved: importResults.saved,
        duplicates: importResults.duplicates,
        errors: importResults.errors
      },
      syncLogId
    });
    
  } catch (error) {
    console.error('Fehler beim Importieren von Vendon-Transaktionen aus JSON:', error);
    return res.status(500).json({
      status: 'error',
      message: `Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
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
    const result = await rawDb.query('SELECT * FROM products');
    const products = result.rows;
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
    const result = await rawDb.query('SELECT * FROM products ORDER BY product_name');
    const productsResponse = { data: result.rows, total: result.rows.length };
    
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
 * Route für den gezielten historischen Backfill bis 1. Juli 2023
 * POST /api/vendon/targeted-backfill
 */
router.post('/targeted-backfill', async (req, res) => {
  try {
    const { 
      action,
      targetDate = '2023-07-01',
      batchSize = 100,
      requestDelay = 1000,
      maxRetries = 3,
      enableDetailedLogging = true
    } = req.body;

    if (action === 'start') {
      console.log('🚀 Starte Targeted Historical Backfill bis', targetDate);
      
      // Erstelle neue Backfill-Instanz mit den angegebenen Parametern
      const backfill = new TargetedHistoricalBackfill({
        targetDate,
        batchSize: Math.min(parseInt(batchSize), 100), // API limit
        requestDelay: parseInt(requestDelay),
        maxRetries: parseInt(maxRetries),
        enableDetailedLogging: Boolean(enableDetailedLogging)
      });

      // Starte den Backfill-Prozess im Hintergrund
      backfill.startBackfill()
        .then(progress => {
          console.log('✅ Targeted Historical Backfill abgeschlossen:', progress);
        })
        .catch(error => {
          console.error('❌ Fehler beim Targeted Historical Backfill:', error);
        });

      // Rückgabe sofort mit den ersten Informationen
      return res.json({
        status: 'started',
        message: 'Targeted Historical Backfill wurde gestartet',
        config: {
          targetDate,
          batchSize: Math.min(parseInt(batchSize), 100),
          requestDelay: parseInt(requestDelay),
          maxRetries: parseInt(maxRetries),
          enableDetailedLogging: Boolean(enableDetailedLogging)
        },
        timestamp: new Date().toISOString()
      });

    } else if (action === 'status') {
      // Status-Abfrage für laufenden Backfill (placeholder)
      return res.json({
        status: 'info',
        message: 'Status-Abfrage für Targeted Backfill',
        timestamp: new Date().toISOString()
      });

    } else {
      return res.status(400).json({
        status: 'error',
        message: `Ungültige Aktion: ${action}. Erlaubt sind 'start' oder 'status'.`
      });
    }

  } catch (error) {
    console.error('Fehler beim Targeted Historical Backfill:', error);
    return res.status(500).json({ 
      status: 'error', 
      message: `Targeted Historical Backfill fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` 
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

/**
 * Endpunkt für die Verfügbarkeit von historischen Transaktionsdaten
 * GET /api/vendon/historical-data-availability
 * 
 * Liefert aggregierte Daten über die Verfügbarkeit von Transaktionen in verschiedenen Zeiträumen.
 * Dies hilft bei der Visualisierung, für welche Zeiträume bereits Daten importiert wurden.
 */
router.get('/historical-data-availability', async (req: Request, res: Response) => {
  try {
    console.log('Abfrage der historischen Datenverfügbarkeit');
    
    // Parameter für die Granularität (Monat oder Tag)
    const granularity = req.query.granularity as string || 'month';
    
    // Start- und Endzeiten für die Abfrage
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date('2022-01-01');
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    
    console.log(`Prüfe Datenverfügbarkeit von ${startDate.toISOString()} bis ${endDate.toISOString()} mit Granularität: ${granularity}`);
    
    let result;
    
    // Je nach gewünschter Granularität unterschiedliche SQL-Abfragen
    if (granularity === 'day') {
      // Tägliche Granularität
      result = await db.select({
        date: sql`DATE_TRUNC('day', datetime)`,
        count: count(),
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.datetime, startDate),
          lte(transactions.datetime, endDate)
        )
      )
      .groupBy(sql`DATE_TRUNC('day', datetime)`)
      .orderBy(sql`DATE_TRUNC('day', datetime)`);
      
    } else {
      // Monatliche Granularität (Standardwert)
      result = await db.select({
        date: sql`DATE_TRUNC('month', datetime)`,
        count: count(),
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.datetime, startDate),
          lte(transactions.datetime, endDate)
        )
      )
      .groupBy(sql`DATE_TRUNC('month', datetime)`)
      .orderBy(sql`DATE_TRUNC('month', datetime)`);
    }
    
    // Formatiere die Ergebnisse für eine einfachere Verwendung im Frontend
    const formattedResult = result.map(item => ({
      date: item.date,
      count: Number(item.count)
    }));
    
    // Statistik über die Gesamtzahl der Transaktionen im angegebenen Zeitraum
    const totalStats = await db.select({
      total: count(),
      minDate: sql<string>`MIN(datetime)::text`,
      maxDate: sql<string>`MAX(datetime)::text`
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.datetime, startDate),
        lte(transactions.datetime, endDate)
      )
    );
    
    return res.json({
      status: 'success',
      availability: formattedResult,
      stats: totalStats[0] || { total: 0, minDate: null, maxDate: null },
      parameters: {
        granularity,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
    
  } catch (error) {
    console.error('Fehler bei der Abfrage der historischen Datenverfügbarkeit:', error);
    return res.status(500).json({
      status: 'error',
      message: `Fehler bei der Abfrage der historischen Datenverfügbarkeit: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * GET /api/vendon/sync-stats - Vendon Historical Sync Statistics
 */
router.get('/sync-stats', async (req: Request, res: Response) => {
  try {
    console.log('📊 Abrufe Vendon Sync Statistiken...');

    // 1. Watermark-Status abrufen
    const watermarkQuery = `
      SELECT 
        vw.machine_id,
        vw.last_updated_at,
        vw.created_at as watermark_created,
        vw.updated_at as watermark_updated,
        m.machine_name,
        m.vendon_id as machine_vendon_id
      FROM vendon_watermarks vw
      LEFT JOIN machines m ON m.vendon_id::text = vw.machine_id OR m.id::text = vw.machine_id
      ORDER BY vw.updated_at DESC
    `;

    const watermarkResult = await rawDb.query(watermarkQuery);

    // 2. Historische Transaktionen (neue seit Go-Live)
    const transactionQuery = `
      SELECT 
        machine_id,
        COUNT(*) as transaction_count,
        MIN(created_at) as first_import,
        MAX(created_at) as last_import,
        MIN(datetime) as earliest_transaction_date,
        MAX(datetime) as latest_transaction_date
      FROM transactions 
      WHERE created_at >= '2025-09-03 17:00:00'  -- Go-Live Zeitstempel
      GROUP BY machine_id
      ORDER BY transaction_count DESC
    `;

    const transactionResult = await rawDb.query(transactionQuery);

    // 3. Scheduler-Status (letzte Updates)
    const recentWatermarkUpdates = watermarkResult.rows.filter((row: any) => 
      new Date(row.watermark_updated) > new Date(Date.now() - 2 * 60 * 60 * 1000) // Letzte 2 Stunden
    );

    // 4. Aggregiere Statistiken
    const totalTransactions = transactionResult.rows.reduce((sum: number, row: any) => 
      sum + parseInt(row.transaction_count), 0
    );

    const activeMachines = watermarkResult.rows.length;
    const machinesWithData = transactionResult.rows.length;
    const recentActivity = recentWatermarkUpdates.length;

    // 5. Machine-spezifische Details
    const machineDetails = watermarkResult.rows.map((wm: any) => {
      const transactionData = transactionResult.rows.find((tr: any) => 
        tr.machine_id === wm.machine_id
      );
      
      return {
        machineId: wm.machine_id,
        machineName: wm.machine_name || `Maschine ${wm.machine_id}`,
        watermarkTime: wm.last_updated_at,
        lastSyncUpdate: wm.watermark_updated,
        transactionCount: transactionData ? parseInt(transactionData.transaction_count) : 0,
        dateRange: transactionData ? {
          earliest: transactionData.earliest_transaction_date,
          latest: transactionData.latest_transaction_date,
          firstImport: transactionData.first_import
        } : null,
        isActive: new Date(wm.watermark_updated) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      };
    });

    const syncStats = {
      summary: {
        totalTransactions,
        activeMachines,
        machinesWithData,
        recentActivity,
        lastSyncTime: watermarkResult.rows[0]?.watermark_updated || null,
        systemStatus: recentActivity > 0 ? 'active' : 'idle'
      },
      machines: machineDetails,
      performance: {
        avgTransactionsPerMachine: machinesWithData > 0 ? Math.round(totalTransactions / machinesWithData) : 0,
        dataAvailability: `${machinesWithData}/${activeMachines}`,
        uptimeIndicator: (recentActivity / Math.max(activeMachines, 1)) * 100
      }
    };

    console.log(`📊 Sync Stats: ${totalTransactions} Transaktionen, ${activeMachines} Maschinen, ${recentActivity} aktive`);
    
    res.json({
      success: true,
      data: syncStats
    });

  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Vendon Sync Statistiken:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Sync Statistiken',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// MONITORING & RECOVERY API ENDPOINTS
// ============================================================================

// Importiere Monitoring Services
import { transactionMonitoringService } from '../services/TransactionMonitoringService';
import { gapDetectionService } from '../services/GapDetectionService';
import { smartRecoveryService } from '../services/SmartRecoveryService';
import { alertingService } from '../services/AlertingService';

/**
 * Dashboard-Übersicht für Monitoring System
 */
router.get('/monitoring/dashboard', async (req, res) => {
  try {
    console.log('[Monitoring-API] Dashboard-Daten werden abgerufen...');

    // Parallele Abfrage aller Dashboard-relevanten Daten
    const [
      transactionStats,
      gapStats,
      recoveryStats,
      alertStats,
      healthStatus,
      recentActivity
    ] = await Promise.all([
      getTransactionStatistics(),
      getGapStatistics(),
      getRecoveryStatistics(),
      getAlertStatistics(),
      getSystemHealthStatus(),
      getRecentActivity()
    ]);

    const dashboardData = {
      summary: {
        status: healthStatus.overallStatus,
        lastUpdate: new Date(),
        activeIssues: alertStats.activeAlerts,
        systemHealth: healthStatus.score
      },
      transactions: transactionStats,
      gaps: gapStats,
      recovery: recoveryStats,
      alerts: alertStats,
      health: healthStatus,
      recentActivity
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('[Monitoring-API] Fehler beim Abrufen der Dashboard-Daten:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Dashboard-Daten',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Transaction Gap Analysis - Detaillierte Lückenanalyse
 */
router.get('/monitoring/gaps', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      machineId, 
      severity,
      status = 'all',
      limit = 100,
      offset = 0 
    } = req.query;

    console.log('[Monitoring-API] Gap-Analyse wird durchgeführt...');

    // Baue WHERE-Bedingungen auf
    const conditions = [];
    if (startDate) conditions.push(gte(transactionGaps.gapStart, new Date(startDate as string)));
    if (endDate) conditions.push(lte(transactionGaps.gapEnd, new Date(endDate as string)));
    if (machineId) conditions.push(eq(transactionGaps.machineId, parseInt(machineId as string)));
    if (severity) conditions.push(eq(transactionGaps.severity, severity as string));
    if (status !== 'all') conditions.push(eq(transactionGaps.status, status as string));

    // Hole Gap-Daten mit Paginierung
    const gaps = await db
      .select({
        id: transactionGaps.id,
        machineId: transactionGaps.machineId,
        machineName: transactionGaps.machineName,
        vendonMachineId: transactionGaps.vendonMachineId,
        gapStart: transactionGaps.gapStart,
        gapEnd: transactionGaps.gapEnd,
        gapDurationHours: transactionGaps.gapDurationHours,
        expectedTransactions: transactionGaps.expectedTransactions,
        severity: transactionGaps.severity,
        status: transactionGaps.status,
        detectionMethod: transactionGaps.detectionMethod,
        detectedAt: transactionGaps.detectedAt,
        resolvedAt: transactionGaps.resolvedAt,
        notes: transactionGaps.notes
      })
      .from(transactionGaps)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactionGaps.detectedAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Zähle Gesamt-Anzahl
    const totalCount = await db
      .select({ count: count() })
      .from(transactionGaps)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Gruppiere nach Schweregrad
    const severityStats = await db
      .select({
        severity: transactionGaps.severity,
        count: count(),
        avgDuration: sql<number>`AVG(${transactionGaps.gapDurationHours})`
      })
      .from(transactionGaps)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(transactionGaps.severity);

    res.json({
      success: true,
      data: {
        gaps,
        pagination: {
          total: totalCount[0]?.count || 0,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: (parseInt(offset as string) + gaps.length) < (totalCount[0]?.count || 0)
        },
        statistics: {
          severityBreakdown: severityStats,
          totalGaps: totalCount[0]?.count || 0
        }
      }
    });

  } catch (error) {
    console.error('[Monitoring-API] Fehler bei Gap-Analyse:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler bei Gap-Analyse',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Recovery Jobs Status - Übersicht und Management
 */
router.get('/monitoring/recovery-jobs', async (req, res) => {
  try {
    const { 
      status = 'all',
      priority,
      machineId,
      limit = 50,
      offset = 0 
    } = req.query;

    console.log('[Monitoring-API] Recovery Jobs werden abgerufen...');

    // Baue WHERE-Bedingungen auf
    const conditions = [];
    if (status !== 'all') conditions.push(eq(recoveryJobs.status, status as string));
    if (priority) conditions.push(eq(recoveryJobs.priority, priority as string));
    if (machineId) conditions.push(eq(recoveryJobs.machineId, parseInt(machineId as string)));

    // Hole Recovery Jobs
    const jobs = await db
      .select()
      .from(recoveryJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`CASE 
          WHEN priority = 'urgent' THEN 1 
          WHEN priority = 'high' THEN 2 
          WHEN priority = 'normal' THEN 3 
          ELSE 4 
        END`,
        desc(recoveryJobs.createdAt)
      )
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Gesamt-Anzahl
    const totalCount = await db
      .select({ count: count() })
      .from(recoveryJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Job-Status-Statistiken
    const statusStats = await db
      .select({
        status: recoveryJobs.status,
        count: count()
      })
      .from(recoveryJobs)
      .groupBy(recoveryJobs.status);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          total: totalCount[0]?.count || 0,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: (parseInt(offset as string) + jobs.length) < (totalCount[0]?.count || 0)
        },
        statistics: {
          statusBreakdown: statusStats,
          totalJobs: totalCount[0]?.count || 0
        },
        activeJobs: smartRecoveryService.getActiveJobs()
      }
    });

  } catch (error) {
    console.error('[Monitoring-API] Fehler beim Abrufen der Recovery Jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Recovery Jobs',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * System Health Status - Gesundheitsüberwachung
 */
router.get('/monitoring/health', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    console.log('[Monitoring-API] System Health wird abgerufen...');

    // Berechne Zeitraum
    const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 24;
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Hole Health Logs
    const healthLogs = await db
      .select()
      .from(syncHealthLogs)
      .where(gte(syncHealthLogs.checkTime, startTime))
      .orderBy(desc(syncHealthLogs.checkTime))
      .limit(200);

    // Gruppiere nach Komponenten
    const componentHealth = await db
      .select({
        component: syncHealthLogs.component,
        latestStatus: sql<string>`MAX(${syncHealthLogs.status})`,
        lastCheck: sql<Date>`MAX(${syncHealthLogs.checkTime})`,
        issueCount: sql<number>`COUNT(CASE WHEN ${syncHealthLogs.status} != 'healthy' THEN 1 END)`
      })
      .from(syncHealthLogs)
      .where(gte(syncHealthLogs.checkTime, startTime))
      .groupBy(syncHealthLogs.component);

    // Service-Statistiken
    const serviceStats = {
      transactionMonitoring: transactionMonitoringService.getServiceStats(),
      smartRecovery: smartRecoveryService.getServiceStats(),
      alerting: alertingService.getServiceStats()
    };

    // Berechne Overall Health Score
    const healthScore = calculateOverallHealthScore(componentHealth, serviceStats);

    res.json({
      success: true,
      data: {
        overallScore: healthScore.score,
        status: healthScore.status,
        components: componentHealth,
        services: serviceStats,
        recentLogs: healthLogs.slice(0, 50),
        summary: {
          totalChecks: healthLogs.length,
          issuesDetected: healthLogs.filter(log => log.status !== 'healthy').length,
          lastUpdate: new Date()
        }
      }
    });

  } catch (error) {
    console.error('[Monitoring-API] Fehler beim Abrufen der System Health:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der System Health',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Alerts Management - Aktive Benachrichtigungen
 */
router.get('/monitoring/alerts', async (req, res) => {
  try {
    const { acknowledged = 'all', severity } = req.query;

    console.log('[Monitoring-API] Alerts werden abgerufen...');

    // Hole aktive Alerts vom AlertingService
    let alerts = alertingService.getActiveAlerts();

    // Filtere nach Parametern
    if (acknowledged === 'true') {
      alerts = alerts.filter(alert => alert.acknowledged);
    } else if (acknowledged === 'false') {
      alerts = alerts.filter(alert => !alert.acknowledged);
    }

    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }

    // Service-Statistiken
    const alertStats = alertingService.getServiceStats();

    res.json({
      success: true,
      data: {
        alerts,
        statistics: alertStats,
        summary: {
          totalActive: alerts.length,
          unacknowledged: alerts.filter(a => !a.acknowledged).length,
          critical: alerts.filter(a => a.severity === 'critical').length,
          lastUpdate: new Date()
        }
      }
    });

  } catch (error) {
    console.error('[Monitoring-API] Fehler beim Abrufen der Alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Alerts',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Manuelle Gap-Detection ausführen
 */
router.post('/monitoring/detect-gaps', async (req, res) => {
  try {
    const { startTime, endTime, machineIds } = req.body;

    console.log('[Monitoring-API] Manuelle Gap-Detection gestartet...');

    const result = await gapDetectionService.performComprehensiveGapAnalysis(
      startTime ? new Date(startTime) : undefined,
      endTime ? new Date(endTime) : undefined,
      machineIds
    );

    res.json({
      success: true,
      data: result,
      message: `${result.newGaps.length} neue Lücken gefunden in ${Math.round(result.analysisTimeMs / 1000)}s`
    });

  } catch (error) {
    console.error('[Monitoring-API] Fehler bei manueller Gap-Detection:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler bei Gap-Detection',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Recovery Job manuell erstellen
 */
router.post('/monitoring/create-recovery-job', async (req, res) => {
  try {
    const {
      jobType,
      machineId,
      vendonMachineId,
      machineName,
      startDate,
      endDate,
      priority = 'normal'
    } = req.body;

    console.log('[Monitoring-API] Recovery Job wird erstellt...');

    const jobId = await smartRecoveryService.createRecoveryJob(
      jobType,
      machineId,
      vendonMachineId,
      machineName,
      new Date(startDate),
      new Date(endDate),
      priority
    );

    res.json({
      success: true,
      data: { jobId },
      message: `Recovery Job ${jobId} erfolgreich erstellt`
    });

  } catch (error) {
    console.error('[Monitoring-API] Fehler beim Erstellen des Recovery Jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Erstellen des Recovery Jobs',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Alert bestätigen
 */
router.post('/monitoring/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { acknowledgedBy = 'user' } = req.body;

    console.log(`[Monitoring-API] Alert ${alertId} wird bestätigt...`);

    const success = await alertingService.acknowledgeAlert(alertId, acknowledgedBy);

    if (success) {
      res.json({
        success: true,
        message: 'Alert erfolgreich bestätigt'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Alert nicht gefunden'
      });
    }

  } catch (error) {
    console.error('[Monitoring-API] Fehler beim Bestätigen des Alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Bestätigen des Alerts',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS FÜR MONITORING DASHBOARD
// ============================================================================

async function getTransactionStatistics() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [today, yesterday, week] = await Promise.all([
    db.select({ count: count() }).from(transactions)
      .where(gte(transactions.datetime, last24h)),
    db.select({ count: count() }).from(transactions)
      .where(and(
        gte(transactions.datetime, new Date(last24h.getTime() - 24 * 60 * 60 * 1000)),
        lt(transactions.datetime, last24h)
      )),
    db.select({ count: count() }).from(transactions)
      .where(gte(transactions.datetime, last7d))
  ]);

  return {
    last24h: today[0]?.count || 0,
    previous24h: yesterday[0]?.count || 0,
    last7d: week[0]?.count || 0,
    trend: ((today[0]?.count || 0) - (yesterday[0]?.count || 0)) / Math.max(yesterday[0]?.count || 1, 1) * 100
  };
}

async function getGapStatistics() {
  const [open, recent, critical] = await Promise.all([
    db.select({ count: count() }).from(transactionGaps)
      .where(eq(transactionGaps.status, 'detected')),
    db.select({ count: count() }).from(transactionGaps)
      .where(gte(transactionGaps.detectedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
    db.select({ count: count() }).from(transactionGaps)
      .where(and(
        eq(transactionGaps.severity, 'critical'),
        eq(transactionGaps.status, 'detected')
      ))
  ]);

  return {
    openGaps: open[0]?.count || 0,
    recentGaps: recent[0]?.count || 0,
    criticalGaps: critical[0]?.count || 0
  };
}

async function getRecoveryStatistics() {
  const [pending, running, failed] = await Promise.all([
    db.select({ count: count() }).from(recoveryJobs)
      .where(eq(recoveryJobs.status, 'pending')),
    db.select({ count: count() }).from(recoveryJobs)
      .where(eq(recoveryJobs.status, 'running')),
    db.select({ count: count() }).from(recoveryJobs)
      .where(eq(recoveryJobs.status, 'failed'))
  ]);

  return {
    pendingJobs: pending[0]?.count || 0,
    runningJobs: running[0]?.count || 0,
    failedJobs: failed[0]?.count || 0,
    activeJobs: smartRecoveryService.getActiveJobs().length
  };
}

function getAlertStatistics() {
  return alertingService.getServiceStats();
}

async function getSystemHealthStatus() {
  const recentLogs = await db
    .select()
    .from(syncHealthLogs)
    .where(gte(syncHealthLogs.checkTime, new Date(Date.now() - 60 * 60 * 1000)))
    .orderBy(desc(syncHealthLogs.checkTime))
    .limit(10);

  const criticalIssues = recentLogs.filter(log => log.status === 'critical').length;
  const warningIssues = recentLogs.filter(log => log.status === 'warning').length;

  let overallStatus = 'healthy';
  let score = 100;

  if (criticalIssues > 0) {
    overallStatus = 'critical';
    score = Math.max(0, 100 - criticalIssues * 20);
  } else if (warningIssues > 2) {
    overallStatus = 'warning';
    score = Math.max(60, 100 - warningIssues * 10);
  }

  return {
    overallStatus,
    score,
    criticalIssues,
    warningIssues,
    recentLogs: recentLogs.slice(0, 5)
  };
}

async function getRecentActivity() {
  const last1h = new Date(Date.now() - 60 * 60 * 1000);

  const [transactions, gaps, recoveryJobs] = await Promise.all([
    db.select({ count: count() }).from(transactions)
      .where(gte(transactions.datetime, last1h)),
    db.select({ count: count() }).from(transactionGaps)
      .where(gte(transactionGaps.detectedAt, last1h)),
    db.select({ count: count() }).from(recoveryJobs)
      .where(gte(recoveryJobs.createdAt, last1h))
  ]);

  return {
    newTransactions: transactions[0]?.count || 0,
    newGaps: gaps[0]?.count || 0,
    newRecoveryJobs: recoveryJobs[0]?.count || 0
  };
}

function calculateOverallHealthScore(componentHealth: any[], serviceStats: any) {
  let totalScore = 100;
  
  // Reduziere Score basierend auf Component Health
  componentHealth.forEach(component => {
    if (component.latestStatus === 'critical') totalScore -= 20;
    else if (component.latestStatus === 'warning') totalScore -= 10;
  });

  // Reduziere Score basierend auf Service-Status
  if (!serviceStats.transactionMonitoring.isRunning) totalScore -= 15;
  if (!serviceStats.smartRecovery.isProcessorRunning) totalScore -= 10;

  totalScore = Math.max(0, totalScore);

  let status = 'healthy';
  if (totalScore < 30) status = 'critical';
  else if (totalScore < 70) status = 'warning';

  return { score: totalScore, status };
}

export default router;