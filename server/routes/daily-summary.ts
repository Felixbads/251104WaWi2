import { Router, Request, Response } from 'express';
import DailySummaryService from '../services/dailySummaryService';

const router = Router();
const dailySummaryService = new DailySummaryService();

// GET /api/daily-summary/status - Status des Daily Summary Services
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = dailySummaryService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Fehler beim Abrufen des Daily Summary Status:', error);
    res.status(500).json({ error: 'Server-Fehler beim Status-Abruf' });
  }
});

// POST /api/daily-summary/send-test - Test-E-Mail manuell senden
router.post('/send-test', async (req: Request, res: Response) => {
  try {
    console.log('📧 Manuelle Test-Summary wird gesendet...');
    const success = await dailySummaryService.sendTestSummary();
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Test-Summary erfolgreich an einkauf@proviantomat.de gesendet' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Fehler beim Senden der Test-Summary' 
      });
    }
  } catch (error) {
    console.error('Fehler beim Senden der Test-Summary:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server-Fehler beim Senden der Test-Summary' 
    });
  }
});

// POST /api/daily-summary/start - Service manuell starten
router.post('/start', async (req: Request, res: Response) => {
  try {
    dailySummaryService.start();
    res.json({ 
      success: true, 
      message: 'Daily Summary Service gestartet' 
    });
  } catch (error) {
    console.error('Fehler beim Starten des Daily Summary Service:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Fehler beim Starten des Services' 
    });
  }
});

// POST /api/daily-summary/stop - Service manuell stoppen
router.post('/stop', async (req: Request, res: Response) => {
  try {
    dailySummaryService.stop();
    res.json({ 
      success: true, 
      message: 'Daily Summary Service gestoppt' 
    });
  } catch (error) {
    console.error('Fehler beim Stoppen des Daily Summary Service:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Fehler beim Stoppen des Services' 
    });
  }
});

// Export des Service-Instance für Server-Initialisierung
export function getDailySummaryServiceInstance() {
  return dailySummaryService;
}

export default router;