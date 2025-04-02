import express, { Request, Response } from 'express';
import { databaseExport } from '../services/databaseExport';
import * as fs from 'fs';
import fileUpload from 'express-fileupload';
import path from 'path';

const router = express.Router();

// Verzeichnis für temporäre Datei-Uploads
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Express-Fileupload-Middleware für die Verarbeitung von Datei-Uploads
router.use(fileUpload({
  useTempFiles: true,
  tempFileDir: tempDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  abortOnLimit: true,
  debug: true
}));

/**
 * Vollständigen Datenbank-Export starten
 * POST /api/db/export
 */
router.post('/export', async (req: Request, res: Response) => {
  try {
    console.log('Vollständiger Datenbank-Export wird gestartet...');
    
    // Starte asynchronen Export-Prozess
    const exportPromise = databaseExport.exportDatabase();
    
    // Sende sofort eine Antwort, dass der Prozess gestartet wurde
    res.status(202).json({
      status: 'processing',
      message: 'Vollständiger Datenbank-Export gestartet',
      details: {
        startedAt: new Date().toISOString()
      }
    });
    
    // Warte auf den Export im Hintergrund
    try {
      const filePath = await exportPromise;
      console.log(`Vollständiger Datenbank-Export erfolgreich abgeschlossen. Datei: ${filePath}`);
    } catch (error) {
      console.error('Fehler beim vollständigen Datenbank-Export:', error);
    }
  } catch (error) {
    console.error('Fehler beim Starten des vollständigen Datenbank-Exports:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Interner Serverfehler beim Starten des Exports',
      error: error.message
    });
  }
});

/**
 * Status des letzten Datenbank-Exports abfragen
 * GET /api/db/export/status
 */
router.get('/export/status', (req: Request, res: Response) => {
  try {
    console.log('Status des vollständigen Datenbank-Exports wird abgefragt...');
    
    // Liste alle Export-Dateien auf
    const files = databaseExport.listDatabaseExports();
    
    if (files.length === 0) {
      return res.status(200).json({ 
        status: 'no_exports',
        message: 'Keine vollständigen Datenbank-Exports vorhanden',
        files: []
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: `${files.length} Datenbank-Export-Dateien gefunden`,
      files
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Datenbank-Export-Status:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Fehler beim Abrufen des Datenbank-Export-Status',
      error: error.message
    });
  }
});

/**
 * Datenbank-Export-Datei herunterladen
 * GET /api/db/export/download/:filename
 */
router.get('/export/download/:filename', (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const exportDir = path.join(process.cwd(), 'exports');
    const filePath = path.join(exportDir, filename);
    
    // Überprüfe, ob die Datei existiert
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        status: 'error', 
        message: `Datei ${filename} existiert nicht` 
      });
    }
    
    // Sende die Datei als Download
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Fehler beim Herunterladen der Datei:', err);
        res.status(500).json({ 
          status: 'error', 
          message: 'Fehler beim Herunterladen der Datei',
          error: err.message
        });
      }
    });
  } catch (error) {
    console.error('Fehler beim Herunterladen der Datenbank-Export-Datei:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Fehler beim Herunterladen der Datenbank-Export-Datei',
      error: error.message
    });
  }
});

/**
 * Datenbank aus einer XLSX-Datei importieren
 * POST /api/db/import
 */
router.post('/import', async (req: Request, res: Response) => {
  try {
    console.log('Datenbank-Import aus XLSX-Datei wird gestartet...');
    
    // Überprüfe, ob eine Datei hochgeladen wurde
    if (!req.files || !req.files.file) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Keine Datei hochgeladen' 
      });
    }
    
    // Konfigurationsoptionen aus dem Request
    const skipVendonData = req.body.skipVendonData === 'true';
    const forceUpdate = req.body.forceUpdate === 'true';
    const tables = req.body.tables ? JSON.parse(req.body.tables) : undefined;
    
    // Hole die hochgeladene Datei
    const file = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    const filePath = file.tempFilePath;
    
    console.log(`Datei ${file.name} (${file.size} Bytes) hochgeladen nach ${filePath}`);
    console.log(`Import-Optionen: skipVendonData=${skipVendonData}, forceUpdate=${forceUpdate}, tables=${tables}`);
    
    // Starte asynchronen Import-Prozess
    const importPromise = databaseExport.importDatabase(filePath, {
      skipVendonData,
      forceUpdate,
      tables
    });
    
    // Sende sofort eine Antwort, dass der Prozess gestartet wurde
    res.status(202).json({
      status: 'processing',
      message: 'Datenbank-Import gestartet',
      details: {
        filename: file.name,
        size: file.size,
        options: { skipVendonData, forceUpdate, tables },
        startedAt: new Date().toISOString()
      }
    });
    
    // Warte auf den Import im Hintergrund
    try {
      const stats = await importPromise;
      console.log(`Datenbank-Import erfolgreich abgeschlossen. Statistik:`, stats);
      
      // Temporäre Datei löschen
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Fehler beim Datenbank-Import:', error);
      
      // Versuche, die temporäre Datei zu löschen
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkError) {
        console.error('Fehler beim Löschen der temporären Datei:', unlinkError);
      }
    }
  } catch (error) {
    console.error('Fehler beim Starten des Datenbank-Imports:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Interner Serverfehler beim Starten des Imports',
      error: error.message
    });
  }
});

/**
 * Status des letzten Datenbank-Imports abfragen
 * GET /api/db/import/status
 */
router.get('/import/status', (req: Request, res: Response) => {
  // Da wir den Import-Status nicht persistent speichern, kann hier nur ein einfacher Status zurückgegeben werden
  // In einer Produktionsumgebung würde man den Status z.B. in der Datenbank speichern
  res.status(200).json({
    status: 'unknown',
    message: 'Der Import-Status wird aktuell nicht zwischen Anfragen gespeichert',
    lastImport: null
  });
});

export default router;