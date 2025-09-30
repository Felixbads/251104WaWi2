/**
 * E-Mail-System Diagnose-Endpoint
 * Prüft SMTP-Konfiguration, Datenbank-Einstellungen, Scheduler-Status
 */
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { emailSettings, emailRecipients, emailTemplates, emailLog } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { validateSmtpEnvironment, getSmtpSecurityStatus } from '../utils/secureSmtpConfig';
import { getDailyEmailSchedulerStatus } from '../services/dailyEmailScheduler';
import { DailyEmailService } from '../services/dailyEmailService';
import { sendTestEmail } from '../services/emailService';

const router = Router();
const dailyEmailService = new DailyEmailService();

interface DiagnosticResult {
  category: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

/**
 * GET /api/email-diagnostics/full
 * Führt eine vollständige Diagnose des E-Mail-Systems durch
 */
router.get('/full', async (_req: Request, res: Response) => {
  console.log('🔍 Starte vollständige E-Mail-System-Diagnose...');
  
  const diagnostics: DiagnosticResult[] = [];
  let overallStatus: 'success' | 'warning' | 'error' = 'success';

  // 1. SMTP-Umgebungsvariablen prüfen
  try {
    const smtpValidation = validateSmtpEnvironment();
    
    if (smtpValidation.isValid) {
      diagnostics.push({
        category: 'SMTP-Konfiguration',
        status: 'success',
        message: 'SMTP-Umgebungsvariablen sind vollständig konfiguriert',
        details: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          user: process.env.SMTP_USER,
          hasPassword: !!process.env.SMTP_PASS,
          fromEmail: process.env.FROM_EMAIL
        }
      });
    } else {
      overallStatus = 'error';
      diagnostics.push({
        category: 'SMTP-Konfiguration',
        status: 'error',
        message: 'SMTP-Umgebungsvariablen fehlen oder sind ungültig',
        details: {
          errors: smtpValidation.errors,
          currentConfig: {
            host: process.env.SMTP_HOST || 'NICHT GESETZT',
            port: process.env.SMTP_PORT || 'NICHT GESETZT',
            user: process.env.SMTP_USER || 'NICHT GESETZT',
            hasPassword: !!process.env.SMTP_PASS,
            fromEmail: process.env.FROM_EMAIL || 'NICHT GESETZT'
          }
        }
      });
    }
  } catch (error) {
    overallStatus = 'error';
    diagnostics.push({
      category: 'SMTP-Konfiguration',
      status: 'error',
      message: `Fehler bei SMTP-Validierung: ${error}`,
      details: { error: String(error) }
    });
  }

  // 2. SMTP-Sicherheitsstatus prüfen
  try {
    const securityStatus = getSmtpSecurityStatus();
    
    diagnostics.push({
      category: 'SMTP-Sicherheit',
      status: securityStatus.recommendations.length === 0 ? 'success' : 'warning',
      message: securityStatus.isSecure 
        ? 'SMTP-Sicherheitskonfiguration ist korrekt'
        : 'SMTP-Sicherheit hat Empfehlungen',
      details: {
        environment: securityStatus.environment,
        rejectUnauthorized: securityStatus.rejectUnauthorized,
        recommendations: securityStatus.recommendations
      }
    });
  } catch (error) {
    diagnostics.push({
      category: 'SMTP-Sicherheit',
      status: 'warning',
      message: `Sicherheitsstatus konnte nicht geprüft werden: ${error}`
    });
  }

  // 3. E-Mail-Einstellungen in Datenbank prüfen
  try {
    const settings = await db
      .select()
      .from(emailSettings)
      .orderBy(desc(emailSettings.createdAt))
      .limit(1);

    if (settings.length === 0) {
      if (overallStatus === 'success') overallStatus = 'warning';
      diagnostics.push({
        category: 'E-Mail-Einstellungen',
        status: 'warning',
        message: 'Keine E-Mail-Einstellungen in der Datenbank gefunden',
        details: {
          action: 'Erstellen Sie E-Mail-Einstellungen über die Benutzeroberfläche'
        }
      });
    } else {
      const setting = settings[0];
      const isEnabled = setting.enabled;
      
      diagnostics.push({
        category: 'E-Mail-Einstellungen',
        status: isEnabled ? 'success' : 'warning',
        message: isEnabled 
          ? 'E-Mail-Benachrichtigungen sind aktiviert'
          : 'E-Mail-Benachrichtigungen sind DEAKTIVIERT',
        details: {
          id: setting.id,
          enabled: setting.enabled,
          sendTime: setting.sendTime,
          weekdayMask: setting.weekdayMask,
          includeWeatherForecast: setting.includeWeatherForecast,
          includeSalesAnalysis: setting.includeSalesAnalysis,
          includeInventoryAlerts: setting.includeInventoryAlerts,
          createdAt: setting.createdAt,
          updatedAt: setting.updatedAt
        }
      });

      // Prüfe, ob heute ein Versandtag ist
      try {
        const weekdayMask = Array.isArray(setting.weekdayMask) 
          ? setting.weekdayMask as boolean[]
          : JSON.parse(setting.weekdayMask as string) as boolean[];
        
        const today = new Date();
        const jsDay = today.getDay();
        const maskIndex = jsDay === 0 ? 6 : jsDay - 1;
        const isSendDay = weekdayMask[maskIndex] === true;
        
        diagnostics.push({
          category: 'Wochentags-Konfiguration',
          status: isSendDay ? 'success' : 'warning',
          message: isSendDay 
            ? `Heute ist ein Versandtag (${today.toLocaleDateString('de-DE', { weekday: 'long' })})`
            : `Heute ist KEIN Versandtag (${today.toLocaleDateString('de-DE', { weekday: 'long' })})`,
          details: {
            today: today.toLocaleDateString('de-DE', { weekday: 'long' }),
            weekdayMask: {
              'Montag': weekdayMask[0],
              'Dienstag': weekdayMask[1],
              'Mittwoch': weekdayMask[2],
              'Donnerstag': weekdayMask[3],
              'Freitag': weekdayMask[4],
              'Samstag': weekdayMask[5],
              'Sonntag': weekdayMask[6]
            }
          }
        });
      } catch (error) {
        diagnostics.push({
          category: 'Wochentags-Konfiguration',
          status: 'error',
          message: `Fehler beim Parsen der Wochentags-Maske: ${error}`
        });
      }
    }
  } catch (error) {
    overallStatus = 'error';
    diagnostics.push({
      category: 'E-Mail-Einstellungen',
      status: 'error',
      message: `Fehler beim Laden der E-Mail-Einstellungen: ${error}`,
      details: { error: String(error) }
    });
  }

  // 4. E-Mail-Empfänger prüfen
  try {
    const recipients = await db
      .select()
      .from(emailRecipients)
      .where(eq(emailRecipients.active, true));

    if (recipients.length === 0) {
      if (overallStatus === 'success') overallStatus = 'warning';
      diagnostics.push({
        category: 'E-Mail-Empfänger',
        status: 'warning',
        message: 'Keine aktiven E-Mail-Empfänger konfiguriert',
        details: {
          action: 'Fügen Sie mindestens einen Empfänger über die Benutzeroberfläche hinzu'
        }
      });
    } else {
      diagnostics.push({
        category: 'E-Mail-Empfänger',
        status: 'success',
        message: `${recipients.length} aktive E-Mail-Empfänger konfiguriert`,
        details: {
          count: recipients.length,
          recipients: recipients.map(r => ({
            email: r.email,
            name: r.name,
            role: r.role,
            dailyReports: r.daily_reports,
            alerts: r.alerts
          }))
        }
      });
    }
  } catch (error) {
    overallStatus = 'error';
    diagnostics.push({
      category: 'E-Mail-Empfänger',
      status: 'error',
      message: `Fehler beim Laden der E-Mail-Empfänger: ${error}`,
      details: { error: String(error) }
    });
  }

  // 5. E-Mail-Templates prüfen
  try {
    const templates = await db.select().from(emailTemplates);
    
    diagnostics.push({
      category: 'E-Mail-Templates',
      status: templates.length > 0 ? 'success' : 'warning',
      message: templates.length > 0 
        ? `${templates.length} E-Mail-Template(s) verfügbar`
        : 'Keine E-Mail-Templates konfiguriert (Standard-Template wird verwendet)',
      details: {
        count: templates.length,
        templates: templates.map(t => ({
          id: t.id,
          type: t.type,
          name: t.name,
          isDefault: t.isDefault
        }))
      }
    });
  } catch (error) {
    diagnostics.push({
      category: 'E-Mail-Templates',
      status: 'warning',
      message: `Fehler beim Laden der E-Mail-Templates: ${error}`
    });
  }

  // 6. Scheduler-Status prüfen
  try {
    const schedulerStatus = getDailyEmailSchedulerStatus();
    
    diagnostics.push({
      category: 'E-Mail-Scheduler',
      status: schedulerStatus.isRunning ? 'success' : 'error',
      message: schedulerStatus.isRunning 
        ? 'E-Mail-Scheduler läuft'
        : 'E-Mail-Scheduler läuft NICHT',
      details: {
        isRunning: schedulerStatus.isRunning,
        nextRun: schedulerStatus.nextRun,
        timezone: 'Europe/Berlin'
      }
    });

    if (!schedulerStatus.isRunning && overallStatus === 'success') {
      overallStatus = 'warning';
    }
  } catch (error) {
    overallStatus = 'error';
    diagnostics.push({
      category: 'E-Mail-Scheduler',
      status: 'error',
      message: `Fehler beim Prüfen des Scheduler-Status: ${error}`,
      details: { error: String(error) }
    });
  }

  // 7. Letzte E-Mail-Logs prüfen
  try {
    const recentLogs = await db
      .select()
      .from(emailLog)
      .orderBy(desc(emailLog.sentAt))
      .limit(5);

    const failedCount = recentLogs.filter(log => log.status === 'failed').length;
    const sentCount = recentLogs.filter(log => log.status === 'sent').length;

    diagnostics.push({
      category: 'E-Mail-Verlauf',
      status: recentLogs.length === 0 
        ? 'warning' 
        : (failedCount > sentCount ? 'warning' : 'success'),
      message: recentLogs.length === 0 
        ? 'Keine E-Mail-Logs vorhanden (noch keine E-Mails versendet)'
        : `${sentCount} erfolgreich, ${failedCount} fehlgeschlagen (letzte 5 Einträge)`,
      details: {
        total: recentLogs.length,
        sent: sentCount,
        failed: failedCount,
        recentLogs: recentLogs.map(log => ({
          sentAt: log.sentAt,
          status: log.status,
          recipient: log.recipient,
          subject: log.emailSubject,
          errorMessage: log.errorMessage
        }))
      }
    });
  } catch (error) {
    diagnostics.push({
      category: 'E-Mail-Verlauf',
      status: 'warning',
      message: `Fehler beim Laden der E-Mail-Logs: ${error}`
    });
  }

  // 8. Konfigurationsvalidierung über DailyEmailService
  try {
    const validation = await dailyEmailService.validateConfiguration();
    
    diagnostics.push({
      category: 'Gesamte Konfiguration',
      status: validation.isValid ? 'success' : 'error',
      message: validation.isValid 
        ? 'E-Mail-System ist vollständig konfiguriert und bereit'
        : 'E-Mail-System hat Konfigurationsprobleme',
      details: {
        isValid: validation.isValid,
        issues: validation.issues
      }
    });

    if (!validation.isValid) {
      overallStatus = 'error';
    }
  } catch (error) {
    overallStatus = 'error';
    diagnostics.push({
      category: 'Gesamte Konfiguration',
      status: 'error',
      message: `Fehler bei der Konfigurationsvalidierung: ${error}`
    });
  }

  // Zusammenfassung
  const summary = {
    overallStatus,
    timestamp: new Date().toISOString(),
    totalChecks: diagnostics.length,
    successCount: diagnostics.filter(d => d.status === 'success').length,
    warningCount: diagnostics.filter(d => d.status === 'warning').length,
    errorCount: diagnostics.filter(d => d.status === 'error').length,
  };

  console.log('🔍 Diagnose abgeschlossen:', summary);

  res.json({
    success: true,
    summary,
    diagnostics,
    recommendations: generateRecommendations(diagnostics)
  });
});

/**
 * POST /api/email-diagnostics/test
 * Sendet eine Test-E-Mail an die angegebene Adresse
 */
router.post('/test', async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'E-Mail-Adresse ist erforderlich'
    });
  }

  console.log(`🧪 Sende Test-E-Mail an ${email}...`);

  try {
    // Prüfe zuerst SMTP-Konfiguration
    const smtpValidation = validateSmtpEnvironment();
    if (!smtpValidation.isValid) {
      return res.status(500).json({
        success: false,
        error: 'SMTP-Konfiguration ist ungültig',
        details: smtpValidation.errors
      });
    }

    // Sende Test-E-Mail
    const success = await sendTestEmail(email);

    if (success) {
      res.json({
        success: true,
        message: `Test-E-Mail erfolgreich an ${email} gesendet`,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Test-E-Mail konnte nicht gesendet werden',
        message: 'Prüfen Sie die Server-Logs für Details'
      });
    }
  } catch (error) {
    console.error('❌ Fehler beim Senden der Test-E-Mail:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Senden der Test-E-Mail',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Generiert Empfehlungen basierend auf den Diagnose-Ergebnissen
 */
function generateRecommendations(diagnostics: DiagnosticResult[]): string[] {
  const recommendations: string[] = [];

  const smtpError = diagnostics.find(d => d.category === 'SMTP-Konfiguration' && d.status === 'error');
  if (smtpError) {
    recommendations.push('🔴 KRITISCH: Setzen Sie die SMTP-Umgebungsvariablen (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL) in den Replit Secrets');
    recommendations.push('   Nach dem Setzen der Variablen: Server neu starten (Workflow neu starten)');
  }

  const noSettings = diagnostics.find(d => d.category === 'E-Mail-Einstellungen' && d.status === 'warning' && d.message.includes('Keine E-Mail-Einstellungen'));
  if (noSettings) {
    recommendations.push('⚠️  Erstellen Sie E-Mail-Einstellungen über die Seite "E-Mail-Benachrichtigungen"');
  }

  const disabled = diagnostics.find(d => d.category === 'E-Mail-Einstellungen' && d.message.includes('DEAKTIVIERT'));
  if (disabled) {
    recommendations.push('⚠️  Aktivieren Sie E-Mail-Benachrichtigungen in den Einstellungen (enabled: true)');
  }

  const noRecipients = diagnostics.find(d => d.category === 'E-Mail-Empfänger' && d.status === 'warning');
  if (noRecipients) {
    recommendations.push('⚠️  Fügen Sie mindestens einen aktiven E-Mail-Empfänger hinzu');
  }

  const notSendDay = diagnostics.find(d => d.category === 'Wochentags-Konfiguration' && d.status === 'warning');
  if (notSendDay) {
    recommendations.push('ℹ️  Heute ist kein Versandtag - konfigurieren Sie die Wochentags-Maske, wenn E-Mails heute versendet werden sollen');
  }

  const schedulerNotRunning = diagnostics.find(d => d.category === 'E-Mail-Scheduler' && d.status === 'error');
  if (schedulerNotRunning) {
    recommendations.push('🔴 E-Mail-Scheduler läuft nicht - Server neu starten');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ E-Mail-System ist vollständig konfiguriert und bereit!');
    recommendations.push('   Testen Sie das System mit dem "Test-E-Mail senden" Button');
  }

  return recommendations;
}

export default router;
