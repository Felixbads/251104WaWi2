import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { BulkTransactionExporter } from '../services/bulkTransactionExport';
import { storage } from '../storage';
import { vendonSync } from '../services/vendonSync';

const router = express.Router();

// Erstelle den Bulk-Exporter mit den vorhandenen Services
// ⚠️ TEMPORÄRER FIX - Verwende EnhancedVendonApiClient stattdessen
// const vendonApi = vendonSync.getApi(); 
// Temporarily disable bulkSync until we fix the N+1 problem
const vendonApi = null;
const bulkExporter = new BulkTransactionExporter(vendonApi, storage);

// Bulk-Export starten
router.post('/export', async (req, res) => {
  try {
    const { startDate, endDate, batchSize } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Start- und Enddatum müssen angegeben werden' 
      });
    }
    
    // Konvertiere Datumsangaben
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // Validiere Datum
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Ungültiges Datumsformat' 
      });
    }
    
    // Starte asynchronen Export-Prozess
    const exportPromise = bulkExporter.exportTransactions(
      startDateObj, 
      endDateObj, 
      batchSize || 100
    );
    
    // Sende sofort eine Antwort, dass der Prozess gestartet wurde
    res.status(202).json({
      status: 'processing',
      message: 'Bulk-Export gestartet',
      details: {
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        batchSize: batchSize || 100
      }
    });
    
    // Warte auf den Export im Hintergrund
    try {
      const filePath = await exportPromise;
      console.log(`Bulk-Export erfolgreich abgeschlossen. Datei: ${filePath}`);
    } catch (error) {
      console.error('Fehler beim Bulk-Export:', error);
    }
  } catch (error) {
    console.error('Fehler beim Starten des Bulk-Exports:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Interner Serverfehler beim Starten des Exports',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Status des letzten Exports abfragen
router.get('/export/status', (req, res) => {
  try {
    // Überprüfe, ob das Export-Verzeichnis existiert und welche Dateien darin sind
    const exportDir = path.join(process.cwd(), 'exports');
    
    if (!fs.existsSync(exportDir)) {
      return res.status(200).json({ 
        status: 'no_exports',
        message: 'Keine Exports vorhanden',
        files: []
      });
    }
    
    // Liste alle Export-Dateien auf
    const files = fs.readdirSync(exportDir)
      .filter(file => file.startsWith('transactions_') && file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(exportDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          created: stats.ctime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime()); // Neueste zuerst
    
    res.status(200).json({
      status: 'success',
      message: `${files.length} Export-Dateien gefunden`,
      files
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Export-Status:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Fehler beim Abrufen des Export-Status',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Bulk-Import starten
router.post('/import', async (req, res) => {
  try {
    const { filePath, forceUpdate } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Dateipfad muss angegeben werden' 
      });
    }
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        status: 'error', 
        message: `Datei ${filePath} existiert nicht` 
      });
    }
    
    // Starte asynchronen Import-Prozess
    const importPromise = bulkExporter.importTransactions(
      filePath, 
      forceUpdate === true
    );
    
    // Sende sofort eine Antwort, dass der Prozess gestartet wurde
    res.status(202).json({
      status: 'processing',
      message: 'Bulk-Import gestartet',
      details: {
        filePath,
        forceUpdate: forceUpdate === true
      }
    });
    
    // Warte auf den Import im Hintergrund
    try {
      const stats = await importPromise;
      console.log(`Bulk-Import erfolgreich abgeschlossen. Statistik:`, stats);
    } catch (error) {
      console.error('Fehler beim Bulk-Import:', error);
    }
  } catch (error) {
    console.error('Fehler beim Starten des Bulk-Imports:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Interner Serverfehler beim Starten des Imports',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Excel/JSON-Import-Logs abrufen
router.get('/import/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    // Hole Logs für Excel- und JSON-Importe
    const logs = await storage.getSyncLogsByTypePatterns(['transactions_excel_import', 'json-import'], limit);
    
    // Sortiere nach Erstellungsdatum (neueste zuerst)
    logs.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    
    return res.status(200).json({
      status: 'success',
      count: logs.length,
      logs: logs.map(log => {
        // Parse additionalData wenn vorhanden
        let parsedAdditionalData = null;
        if (log.additionalData) {
          try {
            parsedAdditionalData = JSON.parse(log.additionalData);
          } catch (e) {
            console.error('Fehler beim Parsen der Log-Metadaten:', e);
          }
        }
        
        // Bereite ein strukturiertes Log-Objekt vor
        return {
          id: log.id,
          syncType: log.syncType,
          startDate: log.startDate,
          endDate: log.endDate,
          itemsFound: log.itemsFound,
          itemsSaved: log.itemsSaved,
          itemsUpdated: log.itemsUpdated,
          duplicates: log.duplicates,
          errors: log.errors,
          syncStatus: log.syncStatus,
          durationSeconds: log.durationSeconds,
          errorMessage: log.errorMessage,
          createdAt: log.createdAt,
          additionalData: parsedAdditionalData
        };
      })
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Import-Logs:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Fehler beim Abrufen der Import-Logs',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;