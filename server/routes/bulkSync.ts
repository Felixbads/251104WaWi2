import express from 'express';
import { BulkTransactionExporter } from '../services/bulkTransactionExport';
import { storage } from '../storage';
import { vendonSync } from '../services/vendonSync';

const router = express.Router();

// Erstelle den Bulk-Exporter mit den vorhandenen Services
const vendonApi = vendonSync.getApi();
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
      error: error.message
    });
  }
});

// Status des letzten Exports abfragen
router.get('/export/status', (req, res) => {
  try {
    // Überprüfe, ob das Export-Verzeichnis existiert und welche Dateien darin sind
    const fs = require('fs');
    const path = require('path');
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
      error: error.message
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
    const fs = require('fs');
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
      error: error.message
    });
  }
});

export default router;