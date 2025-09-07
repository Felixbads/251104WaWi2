/**
 * API-Routen für wöchentliche automatische Refill-Templates
 * Ermöglicht Verwaltung und Übersicht der automatisch generierten Templates
 */

import { Router } from 'express';
import { 
  createWeeklyTemplatesForAllMachines,
  createWeeklyTemplateForMachine,
  getTemplateChangeHistory,
  runWeeklyTemplateCreationManually
} from '../services/weeklyRefillTemplateService';
import { weeklyRefillTemplateCron } from '../services/weeklyRefillTemplateCron';
import { db } from '../db';
import { eq, desc, and } from 'drizzle-orm';
import { refillTemplates, weeklyTemplateChanges, machines } from '../../shared/schema';
import { replitAuthMiddleware, ReplitUser } from '../auth/replit-auth';

const router = Router();

// Erweitere Request-Interface um user-Property
interface AuthenticatedRequest extends Request {
  user?: ReplitUser;
}

/**
 * GET /api/weekly-refill-templates/status
 * Status des wöchentlichen Cron-Services
 */
router.get('/status', async (req, res) => {
  try {
    const cronStatus = weeklyRefillTemplateCron.getStatus();
    const lastExecutionStats = await weeklyRefillTemplateCron.getLastExecutionStats();

    res.json({
      success: true,
      data: {
        cron: cronStatus,
        lastExecution: lastExecutionStats,
      }
    });

  } catch (error) {
    console.error('[WEEKLY-TEMPLATES API] Fehler beim Status abrufen:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Status abrufen',
      message: errorMessage
    });
  }
});

/**
 * POST /api/weekly-refill-templates/run-manual
 * Manuelle Ausführung der wöchentlichen Template-Erstellung
 */
router.post('/run-manual', replitAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[WEEKLY-TEMPLATES API] Manuelle Ausführung gestartet von Benutzer ${userId}`);

    const result = await runWeeklyTemplateCreationManually();

    res.json({
      success: result.success,
      data: result.results,
      message: result.message,
      summary: {
        totalTemplates: result.results.length,
        totalChanges: result.results.reduce((sum, t) => sum + t.changes.filter(c => c.changeType !== 'unchanged').length, 0)
      }
    });

  } catch (error) {
    console.error('[WEEKLY-TEMPLATES API] Fehler bei manueller Ausführung:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der manuellen Ausführung',
      message: errorMessage
    });
  }
});

/**
 * POST /api/weekly-refill-templates/create-for-machine/:machineId
 * Erstellt ein wöchentliches Template für eine spezifische Maschine
 */
router.post('/create-for-machine/:machineId', replitAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[WEEKLY-TEMPLATES API] Erstelle Template für Maschine ${machineId}`);

    // Hole Maschinen-Info mit Vendon-ID
    const machine = await db
      .select({
        id: machines.id,
        machineName: machines.machineName,
        vendonId: machines.vendonId,
      })
      .from(machines)
      .where(eq(machines.id, parseInt(machineId)))
      .limit(1);

    if (machine.length === 0) {
      return res.status(404).json({ error: 'Maschine nicht gefunden' });
    }

    if (!machine[0].vendonId) {
      return res.status(400).json({ error: 'Maschine hat keine Vendon-ID' });
    }

    // Erstelle Template für kommende Woche
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() + (7 - weekStart.getDay())); // Nächster Montag
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sonntag

    const result = await createWeeklyTemplateForMachine(
      parseInt(machineId),
      machine[0].vendonId,
      weekStart,
      weekEnd
    );

    if (result.success && result.result) {
      res.json({
        success: true,
        data: result.result,
        message: 'Wöchentliches Template erfolgreich erstellt'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error(`[WEEKLY-TEMPLATES API] Fehler bei Template-Erstellung:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der Template-Erstellung',
      message: errorMessage
    });
  }
});

/**
 * GET /api/weekly-refill-templates/templates/:machineId
 * Holt alle wöchentlichen Templates für eine Maschine
 */
router.get('/templates/:machineId', async (req, res) => {
  try {
    const { machineId } = req.params;
    const { limit = '10' } = req.query;

    console.log(`[WEEKLY-TEMPLATES API] Hole Templates für Maschine ${machineId}`);

    const templates = await db
      .select({
        id: refillTemplates.id,
        templateName: refillTemplates.templateName,
        description: refillTemplates.description,
        isActive: refillTemplates.isActive,
        createdAt: refillTemplates.createdAt,
      })
      .from(refillTemplates)
      .where(
        and(
          eq(refillTemplates.machineId, parseInt(machineId)),
          eq(refillTemplates.templateName, 'Woche%') // Filter für wöchentliche Templates
        )
      )
      .orderBy(desc(refillTemplates.createdAt))
      .limit(parseInt(limit as string));

    res.json({
      success: true,
      data: templates
    });

  } catch (error) {
    console.error(`[WEEKLY-TEMPLATES API] Fehler beim Template abrufen:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Template abrufen',
      message: errorMessage
    });
  }
});

/**
 * GET /api/weekly-refill-templates/changes/:templateId
 * Holt die Änderungshistorie für ein Template
 */
router.get('/changes/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;

    console.log(`[WEEKLY-TEMPLATES API] Hole Änderungen für Template ${templateId}`);

    const result = await getTemplateChangeHistory(parseInt(templateId));

    res.json({
      success: true,
      data: {
        changes: result.changes,
        explanationText: result.explanationText,
        summary: {
          totalChanges: result.changes.length,
          increases: result.changes.filter(c => c.changeType === 'increase').length,
          decreases: result.changes.filter(c => c.changeType === 'decrease').length,
          averageConfidence: result.changes.length > 0 
            ? result.changes.reduce((sum, c) => sum + c.confidence, 0) / result.changes.length 
            : 0,
        }
      }
    });

  } catch (error) {
    console.error(`[WEEKLY-TEMPLATES API] Fehler beim Änderungen abrufen:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Änderungen abrufen',
      message: errorMessage
    });
  }
});

/**
 * GET /api/weekly-refill-templates/overview
 * Übersicht aller aktuellen wöchentlichen Templates
 */
router.get('/overview', async (req, res) => {
  try {
    console.log(`[WEEKLY-TEMPLATES API] Hole Template-Übersicht`);

    // Aktuell aktive Templates mit Änderungsstatistiken
    const activeTemplates = await db
      .select({
        templateId: refillTemplates.id,
        machineId: refillTemplates.machineId,
        templateName: refillTemplates.templateName,
        description: refillTemplates.description,
        createdAt: refillTemplates.createdAt,
      })
      .from(refillTemplates)
      .where(
        and(
          eq(refillTemplates.isActive, true)
        )
      )
      .orderBy(desc(refillTemplates.createdAt));

    // Statistiken für jedes Template sammeln
    const templateStats = await Promise.all(
      activeTemplates.map(async (template) => {
        const changes = await db
          .select()
          .from(weeklyTemplateChanges)
          .where(eq(weeklyTemplateChanges.templateId, template.templateId));

        return {
          ...template,
          changeStats: {
            totalChanges: changes.length,
            increases: changes.filter(c => c.changeType === 'increase').length,
            decreases: changes.filter(c => c.changeType === 'decrease').length,
            averageConfidence: changes.length > 0 
              ? changes.reduce((sum, c) => sum + c.confidence, 0) / changes.length 
              : 0,
          }
        };
      })
    );

    res.json({
      success: true,
      data: templateStats,
      summary: {
        totalActiveTemplates: activeTemplates.length,
        totalChanges: templateStats.reduce((sum, t) => sum + t.changeStats.totalChanges, 0),
        averageChangesPerTemplate: activeTemplates.length > 0 
          ? templateStats.reduce((sum, t) => sum + t.changeStats.totalChanges, 0) / activeTemplates.length 
          : 0,
      }
    });

  } catch (error) {
    console.error(`[WEEKLY-TEMPLATES API] Fehler bei Template-Übersicht:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der Template-Übersicht',
      message: errorMessage
    });
  }
});

/**
 * POST /api/weekly-refill-templates/test-cron
 * Test-Ausführung des Cron-Jobs (für Debugging)
 */
router.post('/test-cron', replitAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[WEEKLY-TEMPLATES API] Test-Ausführung von Benutzer ${userId}`);

    const result = await weeklyRefillTemplateCron.runTestExecution();

    res.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('[WEEKLY-TEMPLATES API] Fehler bei Test-Ausführung:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der Test-Ausführung',
      message: errorMessage
    });
  }
});

console.log('[WEEKLY-TEMPLATES API] ✅ Wöchentliche Refill-Template Routen registriert');

export default router;