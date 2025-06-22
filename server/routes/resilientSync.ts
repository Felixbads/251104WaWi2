/**
 * API-Routen für die resiliente Vendon-Synchronisation
 */

import { Router } from 'express';
import { getBackgroundServiceInstance } from '../services/vendonBackgroundService';
import { getResilientSyncInstance } from '../services/resilientVendonSync';

const router = Router();

/**
 * Status der resilienten Synchronisation abrufen
 */
router.get('/status', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    const resilientSync = getResilientSyncInstance();
    
    const serviceStatus = backgroundService.getStatus();
    const syncStatus = resilientSync.getStatus();
    
    res.json({
      backgroundService: serviceStatus,
      resilientSync: syncStatus,
      isRunning: backgroundService.isServiceRunning()
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Sync-Status:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen des Status',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Hintergrund-Service starten
 */
router.post('/start', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    
    if (backgroundService.isServiceRunning()) {
      return res.json({
        status: 'info',
        message: 'Hintergrund-Service läuft bereits'
      });
    }
    
    await backgroundService.start();
    
    res.json({
      status: 'success',
      message: 'Resiliente Vendon-Synchronisation gestartet'
    });
  } catch (error) {
    console.error('Fehler beim Starten des Hintergrund-Service:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Starten des Hintergrund-Service',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Hintergrund-Service stoppen
 */
router.post('/stop', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    
    if (!backgroundService.isServiceRunning()) {
      return res.json({
        status: 'info',
        message: 'Hintergrund-Service läuft nicht'
      });
    }
    
    await backgroundService.stop();
    
    res.json({
      status: 'success',
      message: 'Resiliente Vendon-Synchronisation gestoppt'
    });
  } catch (error) {
    console.error('Fehler beim Stoppen des Hintergrund-Service:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Stoppen des Hintergrund-Service',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Manuellen Sync auslösen
 */
router.post('/trigger-sync', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    const result = await backgroundService.triggerManualSync();
    
    res.json({
      status: result.status,
      message: result.message,
      stats: result.stats
    });
  } catch (error) {
    console.error('Fehler beim manuellen Sync:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim manuellen Sync',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Manuellen Gap-Check auslösen
 */
router.post('/trigger-gap-check', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    await backgroundService.triggerGapCheck();
    
    res.json({
      status: 'success',
      message: 'Gap-Check erfolgreich ausgeführt'
    });
  } catch (error) {
    console.error('Fehler beim Gap-Check:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Gap-Check',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Gap Crawler für historische Daten starten
 */
router.post('/start-gap-crawler', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    await backgroundService.startGapCrawler();
    
    res.json({
      status: 'success',
      message: 'Gap Crawler für historische Daten gestartet'
    });
  } catch (error) {
    console.error('Fehler beim Starten des Gap Crawlers:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Starten des Gap Crawlers',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Konfiguration abrufen
 */
router.get('/config', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    const config = backgroundService.getConfig();
    
    res.json({
      config,
      isRunning: backgroundService.isServiceRunning()
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Konfiguration:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Abrufen der Konfiguration',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Konfiguration aktualisieren
 */
router.put('/config', async (req, res) => {
  try {
    const backgroundService = getBackgroundServiceInstance();
    const { config } = req.body;
    
    if (!config) {
      return res.status(400).json({
        status: 'error',
        message: 'Konfiguration ist erforderlich'
      });
    }
    
    backgroundService.updateConfig(config);
    
    res.json({
      status: 'success',
      message: 'Konfiguration erfolgreich aktualisiert',
      config: backgroundService.getConfig()
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Konfiguration:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler beim Aktualisieren der Konfiguration',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;