/**
 * API Routes für tägliche E-Mail-Benachrichtigungen
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { 
  emailSettings, 
  emailRecipients, 
  emailTemplates, 
  emailLog,
  insertEmailSettingsSchema,
  insertEmailRecipientsSchema,
  insertEmailTemplatesSchema
} from '@shared/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { DailyEmailService } from '../services/dailyEmailService';

const router = Router();
const dailyEmailService = new DailyEmailService();

// Validation schemas
const sendTestEmailSchema = z.object({
  recipientEmail: z.string().email("Ungültige E-Mail-Adresse"),
  templateId: z.number().optional(),
});

const emailLogsQuerySchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  status: z.enum(['sent', 'failed', 'pending']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// GET /api/email/daily/settings - Hole E-Mail-Einstellungen
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    console.log('📧 Lade E-Mail-Einstellungen...');
    
    const settings = await db
      .select()
      .from(emailSettings)
      .orderBy(desc(emailSettings.createdAt))
      .limit(1);

    if (settings.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'Keine E-Mail-Einstellungen konfiguriert'
      });
    }

    res.json({
      success: true,
      data: settings[0]
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der E-Mail-Einstellungen:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der E-Mail-Einstellungen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/email/daily/settings - Erstelle oder aktualisiere E-Mail-Einstellungen
router.post('/settings', async (req: Request, res: Response) => {
  try {
    console.log('📧 Speichere E-Mail-Einstellungen...');
    
    const settingsData = insertEmailSettingsSchema.parse(req.body);
    
    // Deaktiviere alle bestehenden Einstellungen
    await db
      .update(emailSettings)
      .set({ enabled: false, updatedAt: new Date() });

    // Erstelle neue Einstellungen
    const [newSettings] = await db
      .insert(emailSettings)
      .values({
        ...settingsData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    console.log('✅ E-Mail-Einstellungen erfolgreich gespeichert');
    
    res.json({
      success: true,
      data: newSettings,
      message: 'E-Mail-Einstellungen erfolgreich gespeichert'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Speichern der E-Mail-Einstellungen:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige E-Mail-Einstellungen',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Speichern der E-Mail-Einstellungen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/email/daily/settings/:id - Aktualisiere E-Mail-Einstellungen
router.put('/settings/:id', async (req: Request, res: Response) => {
  try {
    const settingsId = parseInt(req.params.id);
    if (isNaN(settingsId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Einstellungs-ID'
      });
    }

    const settingsData = insertEmailSettingsSchema.parse(req.body);
    
    const [updatedSettings] = await db
      .update(emailSettings)
      .set({
        ...settingsData,
        updatedAt: new Date()
      })
      .where(eq(emailSettings.id, settingsId))
      .returning();

    if (!updatedSettings) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail-Einstellungen nicht gefunden'
      });
    }

    console.log('✅ E-Mail-Einstellungen erfolgreich aktualisiert');
    
    res.json({
      success: true,
      data: updatedSettings,
      message: 'E-Mail-Einstellungen erfolgreich aktualisiert'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Aktualisieren der E-Mail-Einstellungen:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige E-Mail-Einstellungen',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Aktualisieren der E-Mail-Einstellungen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/email/daily/recipients - Hole E-Mail-Empfänger
router.get('/recipients', async (req: Request, res: Response) => {
  try {
    const emailSettingsId = req.query.emailSettingsId ? parseInt(req.query.emailSettingsId as string) : undefined;
    
    const recipients = emailSettingsId
      ? await db.select().from(emailRecipients)
          .where(eq(emailRecipients.emailSettingsId, emailSettingsId))
          .orderBy(emailRecipients.name)
      : await db.select().from(emailRecipients)
          .orderBy(emailRecipients.name);

    res.json({
      success: true,
      data: recipients
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der E-Mail-Empfänger:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der E-Mail-Empfänger',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/email/daily/recipients - Erstelle E-Mail-Empfänger
router.post('/recipients', async (req: Request, res: Response) => {
  try {
    const recipientData = insertEmailRecipientsSchema.parse(req.body);
    
    const [newRecipient] = await db
      .insert(emailRecipients)
      .values({
        ...recipientData,
        createdAt: new Date()
      })
      .returning();

    console.log('✅ E-Mail-Empfänger erfolgreich erstellt');
    
    res.json({
      success: true,
      data: newRecipient,
      message: 'E-Mail-Empfänger erfolgreich erstellt'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des E-Mail-Empfängers:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige E-Mail-Empfänger-Daten',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Erstellen des E-Mail-Empfängers',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/email/daily/recipients/:id - Aktualisiere E-Mail-Empfänger
router.put('/recipients/:id', async (req: Request, res: Response) => {
  try {
    const recipientId = parseInt(req.params.id);
    if (isNaN(recipientId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Empfänger-ID'
      });
    }

    const recipientData = insertEmailRecipientsSchema.parse(req.body);
    
    const [updatedRecipient] = await db
      .update(emailRecipients)
      .set(recipientData)
      .where(eq(emailRecipients.id, recipientId))
      .returning();

    if (!updatedRecipient) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail-Empfänger nicht gefunden'
      });
    }

    console.log('✅ E-Mail-Empfänger erfolgreich aktualisiert');
    
    res.json({
      success: true,
      data: updatedRecipient,
      message: 'E-Mail-Empfänger erfolgreich aktualisiert'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Aktualisieren des E-Mail-Empfängers:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige E-Mail-Empfänger-Daten',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Aktualisieren des E-Mail-Empfängers',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE /api/email/daily/recipients/:id - Lösche E-Mail-Empfänger
router.delete('/recipients/:id', async (req: Request, res: Response) => {
  try {
    const recipientId = parseInt(req.params.id);
    if (isNaN(recipientId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Empfänger-ID'
      });
    }

    const [deletedRecipient] = await db
      .delete(emailRecipients)
      .where(eq(emailRecipients.id, recipientId))
      .returning();

    if (!deletedRecipient) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail-Empfänger nicht gefunden'
      });
    }

    console.log('✅ E-Mail-Empfänger erfolgreich gelöscht');
    
    res.json({
      success: true,
      message: 'E-Mail-Empfänger erfolgreich gelöscht'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Löschen des E-Mail-Empfängers:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Löschen des E-Mail-Empfängers',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/email/daily/templates - Hole E-Mail-Templates
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await db
      .select()
      .from(emailTemplates)
      .orderBy(emailTemplates.name);

    res.json({
      success: true,
      data: templates
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der E-Mail-Templates:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der E-Mail-Templates',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/email/daily/templates - Erstelle E-Mail-Template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const templateData = insertEmailTemplatesSchema.parse(req.body);
    
    const [newTemplate] = await db
      .insert(emailTemplates)
      .values({
        ...templateData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    console.log('✅ E-Mail-Template erfolgreich erstellt');
    
    res.json({
      success: true,
      data: newTemplate,
      message: 'E-Mail-Template erfolgreich erstellt'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des E-Mail-Templates:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige E-Mail-Template-Daten',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Erstellen des E-Mail-Templates',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/email/daily/templates/:id - Aktualisiere E-Mail-Template
router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Template-ID'
      });
    }

    const templateData = insertEmailTemplatesSchema.parse(req.body);
    
    const [updatedTemplate] = await db
      .update(emailTemplates)
      .set({
        ...templateData,
        updatedAt: new Date()
      })
      .where(eq(emailTemplates.id, templateId))
      .returning();

    if (!updatedTemplate) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail-Template nicht gefunden'
      });
    }

    console.log('✅ E-Mail-Template erfolgreich aktualisiert');
    
    res.json({
      success: true,
      data: updatedTemplate,
      message: 'E-Mail-Template erfolgreich aktualisiert'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Aktualisieren des E-Mail-Templates:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige E-Mail-Template-Daten',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Aktualisieren des E-Mail-Templates',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE /api/email/daily/templates/:id - Lösche E-Mail-Template
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Template-ID'
      });
    }

    const [deletedTemplate] = await db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, templateId))
      .returning();

    if (!deletedTemplate) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail-Template nicht gefunden'
      });
    }

    console.log('✅ E-Mail-Template erfolgreich gelöscht');
    
    res.json({
      success: true,
      message: 'E-Mail-Template erfolgreich gelöscht'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Löschen des E-Mail-Templates:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Löschen des E-Mail-Templates',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/email/daily/send - Manuell tägliche E-Mail senden
router.post('/send', async (req: Request, res: Response) => {
  try {
    console.log('📧 Manuell tägliche E-Mail senden...');
    
    const date = req.body.date ? new Date(req.body.date) : new Date();
    
    const result = await dailyEmailService.sendDailyEmail(date);
    
    if (result.success) {
      console.log(`✅ Tägliche E-Mail erfolgreich gesendet: ${result.emailsSent} E-Mails`);
      res.json({
        success: true,
        data: result,
        message: `Tägliche E-Mail erfolgreich gesendet: ${result.emailsSent} E-Mails`
      });
    } else {
      console.log('❌ Fehler beim Senden der täglichen E-Mail:', result.errors);
      res.status(500).json({
        success: false,
        error: 'Fehler beim Senden der täglichen E-Mail',
        details: result.errors
      });
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Senden der täglichen E-Mail:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden der täglichen E-Mail',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/email/daily/test - Sende Test-E-Mail
router.post('/test', async (req: Request, res: Response) => {
  try {
    console.log('📧 Sende Test-E-Mail...');
    
    const testData = sendTestEmailSchema.parse(req.body);
    
    const success = await dailyEmailService.sendTestEmail(
      testData.recipientEmail,
      testData.templateId
    );
    
    if (success) {
      console.log(`✅ Test-E-Mail erfolgreich gesendet an: ${testData.recipientEmail}`);
      res.json({
        success: true,
        message: `Test-E-Mail erfolgreich gesendet an: ${testData.recipientEmail}`
      });
    } else {
      console.log(`❌ Fehler beim Senden der Test-E-Mail an: ${testData.recipientEmail}`);
      res.status(500).json({
        success: false,
        error: 'Fehler beim Senden der Test-E-Mail'
      });
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Senden der Test-E-Mail:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Test-E-Mail-Daten',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden der Test-E-Mail',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/email/daily/logs - Hole E-Mail-Logs
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const queryParams = emailLogsQuerySchema.parse(req.query);
    
    const conditions = [];
    
    // Status-Filter
    if (queryParams.status) {
      conditions.push(eq(emailLog.status, queryParams.status));
    }
    
    // Datumsbereich-Filter
    if (queryParams.startDate) {
      conditions.push(gte(emailLog.sentAt, new Date(queryParams.startDate)));
    }
    
    if (queryParams.endDate) {
      conditions.push(lte(emailLog.sentAt, new Date(queryParams.endDate)));
    }
    
    const logs = conditions.length > 0
      ? await db.select().from(emailLog)
          .where(and(...conditions))
          .orderBy(desc(emailLog.sentAt))
          .limit(queryParams.limit)
          .offset(queryParams.offset)
      : await db.select().from(emailLog)
          .orderBy(desc(emailLog.sentAt))
          .limit(queryParams.limit)
          .offset(queryParams.offset);

    res.json({
      success: true,
      data: logs,
      pagination: {
        limit: queryParams.limit,
        offset: queryParams.offset,
        total: logs.length
      }
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der E-Mail-Logs:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Log-Abfrage-Parameter',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der E-Mail-Logs',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/email/daily/validate - Validiere E-Mail-Konfiguration
router.get('/validate', async (_req: Request, res: Response) => {
  try {
    console.log('🔍 Validiere E-Mail-Konfiguration...');
    
    const validation = await dailyEmailService.validateConfiguration();
    
    console.log(`📊 Konfigurationsvalidierung: ${validation.isValid ? 'GÜLTIG' : 'UNGÜLTIG'}`);
    if (validation.issues.length > 0) {
      console.log('⚠️ Gefundene Probleme:', validation.issues);
    }
    
    res.json({
      success: true,
      data: validation
    });
    
  } catch (error) {
    console.error('❌ Fehler bei der Konfigurationsvalidierung:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Konfigurationsvalidierung',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/email/daily/send-proviantomat-test - Sende Proviantomat Test-Bericht
router.post('/send-proviantomat-test', async (req: Request, res: Response) => {
  try {
    const { recipientEmail } = z.object({
      recipientEmail: z.string().email("Ungültige E-Mail-Adresse").default('felix@proviantomat.de')
    }).parse(req.body);
    
    console.log(`📊 Sende Proviantomat Test-Bericht an ${recipientEmail}...`);
    
    // Hole die erweiterten E-Mail-Einstellungen für den Test
    // Suche nach dem Empfänger in der emailRecipients Tabelle und hole die verknüpften Einstellungen
    const settingsResults = await db
      .select()
      .from(emailSettings)
      .leftJoin(emailRecipients, eq(emailRecipients.emailSettingsId, emailSettings.id))
      .where(eq(emailRecipients.email, recipientEmail))
      .limit(1);
    
    const userEmailSettings: any = settingsResults[0]?.email_settings || {
      includeWeatherForecast: true,
      includeSalesAnalysis: true,
      includeInventoryAlerts: true,
      includeMhdAlerts: true,
      includeMachineAnomalies: true,
      includeOpenOrders: true,
      includeLowStockAlerts: true,
      lowStockThreshold: 15,
      mhdWarningDays: 7,
      anomalyDetectionDays: 3
    };
    
    const result = await dailyEmailService.sendProviantomatReport(recipientEmail, userEmailSettings);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Proviantomat Test-Bericht erfolgreich an ${recipientEmail} gesendet`,
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: `Fehler beim Senden des Proviantomat-Berichts: ${result.error}`,
        details: result.details
      });
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Senden des Proviantomat Test-Berichts:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Test-Daten',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden des Proviantomat Test-Berichts',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/daily-email/get-data - Hole E-Mail-Daten für Tests
router.get('/get-data', async (req: Request, res: Response) => {
  try {
    console.log('📊 API: Lade tägliche E-Mail-Daten...');
    
    // Verwende aktuelles Datum oder übergabenes Datum
    const dateParam = req.query.date as string;
    const reportDate = dateParam ? new Date(dateParam) : new Date();
    
    console.log('📊 API: Report-Datum:', reportDate.toISOString());
    
    // Sammle alle Daten über den DailyEmailService
    const emailData = await dailyEmailService.generateDailyReport(reportDate);
    
    console.log('📊 API: E-Mail-Daten generiert:', {
      template: emailData.template,
      sectionsCount: Object.keys(emailData.sections).length,
      machineOverviewCount: Array.isArray(emailData.sections.automaten_übersicht) ? emailData.sections.automaten_übersicht.length : 'undefined'
    });
    
    res.json({
      success: true,
      data: emailData
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der E-Mail-Daten:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der E-Mail-Daten',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;