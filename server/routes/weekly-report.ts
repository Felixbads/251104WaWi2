/**
 * API-Routen für wöchentliche E-Mail-Berichte
 */

import { Router, Request, Response } from 'express';
import { weeklyReportService } from '../services/weeklyReportService';

const router = Router();

// POST /api/weekly-report/send - Wöchentlichen Bericht manuell senden
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { recipientEmail = 'felix@proviantomat.de' } = req.body;
    
    console.log(`📧 Manueller Versand des wöchentlichen Berichts an ${recipientEmail}`);
    
    const result = await weeklyReportService.sendWeeklyReport(recipientEmail);
    
    if (result.success) {
      return res.json({
        success: true,
        message: result.message
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('❌ Fehler beim manuellen Versand des wöchentlichen Berichts:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Versenden des wöchentlichen Berichts',
      error: error.message
    });
  }
});

// POST /api/weekly-report/test-email - Test-E-Mail senden
router.post('/test-email', async (req: Request, res: Response) => {
  try {
    const { recipientEmail = 'felix@proviantomat.de' } = req.body;
    
    console.log(`📧 Versende Test-E-Mail an ${recipientEmail}`);
    
    const result = await weeklyReportService.sendTestEmail(recipientEmail);
    
    if (result.success) {
      return res.json({
        success: true,
        message: result.message
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('❌ Fehler beim Test-E-Mail-Versand:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Test-E-Mail-Versand',
      error: error.message
    });
  }
});

// GET /api/weekly-report/preview - Vorschau des wöchentlichen Berichts
router.get('/preview', async (req: Request, res: Response) => {
  try {
    console.log('📊 Erstelle Vorschau des wöchentlichen Berichts');
    
    const data = await weeklyReportService.collectWeeklyData();
    const htmlContent = weeklyReportService.generateEmailContent(data);
    
    return res.json({
      success: true,
      data: data,
      htmlContent: htmlContent,
      message: 'Wöchentlicher Bericht erfolgreich erstellt'
    });
  } catch (error: any) {
    console.error('❌ Fehler bei der Bericht-Vorschau:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler bei der Bericht-Vorschau',
      error: error.message
    });
  }
});

// GET /api/weekly-report/data - Nur die Daten für den wöchentlichen Bericht
router.get('/data', async (req: Request, res: Response) => {
  try {
    console.log('📊 Sammle Daten für wöchentlichen Bericht');
    
    const data = await weeklyReportService.collectWeeklyData();
    
    return res.json({
      success: true,
      data: data,
      message: 'Wochendaten erfolgreich gesammelt'
    });
  } catch (error: any) {
    console.error('❌ Fehler beim Sammeln der Wochendaten:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Sammeln der Wochendaten',
      error: error.message
    });
  }
});

export default router;