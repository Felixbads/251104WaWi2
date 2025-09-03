/**
 * German Holidays API Routes
 * 
 * API-Endpunkte für deutsche Feiertage und Schulferien
 * mit echten Daten für Dashboard-Integration
 */

import express from 'express';
import { getCurrentActiveSchoolHolidays, getSchoolHolidaysForApi, syncSchoolHolidaysToDatabase } from '../services/germanSchoolHolidaysService';

const router = express.Router();

/**
 * GET /api/german-holidays/current-school-holidays
 * Holt aktuell aktive Schulferien für alle deutschen Bundesländer
 */
router.get('/current-school-holidays', async (req, res) => {
  try {
    console.log('📚 API-Anfrage: Aktuelle deutsche Schulferien');
    
    const result = await getSchoolHolidaysForApi();
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Fehler beim Laden der Schulferien-Daten',
        data: null
      });
    }
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        summary: {
          totalActiveStates: result.data.totalActiveHolidays,
          totalActiveDays: result.data.totalActiveDays,
          hasActiveHolidays: result.data.totalActiveHolidays > 0
        },
        activeHolidays: result.data.activeStates,
        upcomingHolidays: result.data.upcomingHolidays,
        recentlyEnded: result.data.recentlyEnded,
        formatted: result.formatted
      }
    };
    
    console.log(`✅ Schulferien-Daten geliefert: ${result.data.totalActiveHolidays} aktive Bundesländer`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Fehler in school-holidays API:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter API-Fehler',
      data: null
    });
  }
});

/**
 * POST /api/german-holidays/sync-school-holidays
 * Synchronisiert Schulferien-Daten in die Datenbank
 */
router.post('/sync-school-holidays', async (req, res) => {
  try {
    console.log('🔄 API-Anfrage: Schulferien-Synchronisation');
    
    const result = await syncSchoolHolidaysToDatabase();
    
    const response = {
      success: result.success,
      timestamp: new Date().toISOString(),
      data: {
        synced: result.synced,
        errors: result.errors,
        hasErrors: result.errors.length > 0
      }
    };
    
    if (result.success) {
      console.log(`✅ Schulferien-Sync erfolgreich: ${result.synced} Einträge`);
      res.json(response);
    } else {
      console.log(`⚠️ Schulferien-Sync mit Fehlern: ${result.errors.length} Fehler`);
      res.status(207).json(response); // 207 Multi-Status für teilweisen Erfolg
    }
    
  } catch (error) {
    console.error('❌ Fehler in sync-school-holidays API:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Sync-Fehler',
      data: null
    });
  }
});

export default router;