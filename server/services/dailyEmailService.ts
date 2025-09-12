/**
 * Haupt-Service für tägliche E-Mail-Benachrichtigungen
 * Orchestriert DataAggregator, EmailComposer und EmailSender
 */
import { db } from "../db";
import {
  emailSettings,
  emailRecipients,
  emailTemplates,
  emailLog,
  EmailSettings,
  EmailTemplates,
  EmailRecipients
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { DailyEmailDataAggregator } from './dailyEmailDataAggregator';
import { DailyEmailComposer } from './dailyEmailComposer';
import { sendEmail } from './emailService';

export class DailyEmailService {
  private aggregator: DailyEmailDataAggregator;
  private composer: DailyEmailComposer;
  private emailService: { sendEmail: typeof sendEmail };

  constructor() {
    this.aggregator = new DailyEmailDataAggregator();
    this.composer = new DailyEmailComposer();
    this.emailService = { sendEmail };
  }

  /**
   * Führt den kompletten Prozess der täglichen E-Mail-Benachrichtigung aus
   */
  async sendDailyEmail(date: Date = new Date()): Promise<{
    success: boolean;
    emailsSent: number;
    errors: string[];
  }> {
    console.log(`📧 Starte tägliche E-Mail-Benachrichtigung für ${date.toISOString().split('T')[0]}`);
    
    const result = {
      success: false,
      emailsSent: 0,
      errors: [] as string[]
    };

    try {
      // 1. Prüfe, ob E-Mail-Benachrichtigungen aktiviert sind
      const settings = await this.getActiveEmailSettings();
      if (!settings) {
        console.log('ℹ️ E-Mail-Benachrichtigungen sind deaktiviert');
        result.success = true;
        return result;
      }

      // 2. Prüfe, ob heute ein Versandtag ist
      if (!this.shouldSendToday(settings, date)) {
        console.log(`ℹ️ Heute ist kein Versandtag (${date.toLocaleDateString('de-DE')})`);
        result.success = true;
        return result;
      }

      // 3. Lade E-Mail-Empfänger
      const recipients = await this.getEmailRecipients(settings.id);
      if (recipients.length === 0) {
        result.errors.push('Keine E-Mail-Empfänger konfiguriert');
        return result;
      }

      // 4. Lade Template (falls konfiguriert)
      const template = settings.templateId 
        ? await this.getEmailTemplate(settings.templateId)
        : null;

      // 5. Sammle Daten
      console.log('📊 Sammle Daten für den Tagesbericht...');
      const reportData = await this.aggregator.aggregateData(date);

      // 6. Komponiere E-Mail
      console.log('✍️ Komponiere E-Mail...');
      const emailContent = await this.composer.composeEmail(reportData, template || undefined);

      // 7. Versende E-Mails an alle Empfänger
      console.log(`📤 Versende E-Mails an ${recipients.length} Empfänger...`);
      
      for (const recipient of recipients) {
        try {
          const success = await this.sendToRecipient(
            recipient,
            emailContent,
            template,
            reportData
          );
          
          if (success) {
            result.emailsSent++;
          } else {
            result.errors.push(`Fehler beim Senden an ${recipient.email}`);
          }
        } catch (error) {
          const errorMsg = `Fehler beim Senden an ${recipient.email}: ${error}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      result.success = result.emailsSent > 0;
      
      console.log(`✅ Tägliche E-Mail-Benachrichtigung abgeschlossen: ${result.emailsSent} E-Mails versendet`);
      if (result.errors.length > 0) {
        console.log(`⚠️ Fehler aufgetreten: ${result.errors.join(', ')}`);
      }

    } catch (error) {
      const errorMsg = `Fehler beim Ausführen der täglichen E-Mail-Benachrichtigung: ${error}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * Versendet eine Test-E-Mail an einen bestimmten Empfänger
   */
  async sendTestEmail(recipientEmail: string, templateId?: number): Promise<boolean> {
    console.log(`📧 Sende Test-E-Mail an ${recipientEmail}`);

    try {
      // Lade Template falls angegeben
      const template = templateId ? await this.getEmailTemplate(templateId) : null;

      // Sammle aktuelle Daten
      const reportData = await this.aggregator.aggregateData();

      // Komponiere Test-E-Mail
      const emailContent = await this.composer.composeEmail(reportData, template || undefined);
      
      // Füge Test-Prefix hinzu
      emailContent.subject = `[TEST] ${emailContent.subject}`;
      
      // Versende E-Mail
      const success = await sendEmail({
        to: recipientEmail,
        from: process.env.FROM_EMAIL || 'noreply@warenwirtschaft.de',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });

      // Protokolliere Test-E-Mail
      if (success) {
        await this.logEmail({
          recipient: recipientEmail,
          templateId: templateId || null,
          status: 'sent',
          emailSubject: emailContent.subject,
          payload: reportData
        });
      }

      return success;

    } catch (error) {
      console.error(`Fehler beim Senden der Test-E-Mail: ${error}`);
      
      await this.logEmail({
        recipient: recipientEmail,
        templateId: templateId || null,
        status: 'failed',
        errorMessage: String(error),
        emailSubject: '[TEST] Täglicher Statusbericht',
        payload: null
      });

      return false;
    }
  }

  /**
   * Holt die aktiven E-Mail-Einstellungen
   */
  private async getActiveEmailSettings(): Promise<EmailSettings | null> {
    try {
      const [settings] = await db
        .select()
        .from(emailSettings)
        .where(eq(emailSettings.enabled, true))
        .limit(1);

      return settings || null;
    } catch (error) {
      console.error('Fehler beim Laden der E-Mail-Einstellungen:', error);
      return null;
    }
  }

  /**
   * Prüft, ob heute ein Versandtag ist
   */
  private shouldSendToday(settings: EmailSettings, date: Date): boolean {
    try {
      // Parse weekday_mask (JSON array mit 7 boolean-Werten, Mo-So)
      const weekdayMask = Array.isArray(settings.weekdayMask) 
        ? settings.weekdayMask as boolean[]
        : JSON.parse(settings.weekdayMask as string) as boolean[];

      // JavaScript: getDay() = 0 (Sonntag) bis 6 (Samstag)
      // Unsere Maske: 0 (Montag) bis 6 (Sonntag)
      const jsDay = date.getDay(); // 0=So, 1=Mo, 2=Di, ..., 6=Sa
      const maskIndex = jsDay === 0 ? 6 : jsDay - 1; // Konvertiere zu 0=Mo, 1=Di, ..., 6=So

      return weekdayMask[maskIndex] === true;
    } catch (error) {
      console.error('Fehler beim Prüfen der Wochentage:', error);
      return false;
    }
  }

  /**
   * Holt die E-Mail-Empfänger für die gegebenen Einstellungen
   */
  private async getEmailRecipients(emailSettingsId: number): Promise<EmailRecipients[]> {
    try {
      return await db
        .select()
        .from(emailRecipients)
        .where(eq(emailRecipients.emailSettingsId, emailSettingsId));
    } catch (error) {
      console.error('Fehler beim Laden der E-Mail-Empfänger:', error);
      return [];
    }
  }

  /**
   * Holt ein E-Mail-Template
   */
  private async getEmailTemplate(templateId: number): Promise<EmailTemplates | null> {
    try {
      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, templateId))
        .limit(1);

      return template || null;
    } catch (error) {
      console.error('Fehler beim Laden des E-Mail-Templates:', error);
      return null;
    }
  }

  /**
   * Versendet E-Mail an einen spezifischen Empfänger
   */
  private async sendToRecipient(
    recipient: EmailRecipients,
    emailContent: { subject: string; html: string; text: string },
    template: EmailTemplates | null,
    reportData: any
  ): Promise<boolean> {
    try {
      const success = await sendEmail({
        to: recipient.email,
        from: process.env.FROM_EMAIL || 'noreply@warenwirtschaft.de',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });

      // Protokolliere E-Mail
      await this.logEmail({
        recipient: recipient.email,
        templateId: template?.id || null,
        status: success ? 'sent' : 'failed',
        emailSubject: emailContent.subject,
        payload: reportData
      });

      return success;

    } catch (error) {
      console.error(`Fehler beim Senden an ${recipient.email}:`, error);
      
      await this.logEmail({
        recipient: recipient.email,
        templateId: template?.id || null,
        status: 'failed',
        errorMessage: String(error),
        emailSubject: emailContent.subject,
        payload: reportData
      });

      return false;
    }
  }

  /**
   * Protokolliert gesendete E-Mails
   */
  private async logEmail(logData: {
    recipient: string;
    templateId: number | null;
    status: 'sent' | 'failed' | 'pending';
    emailSubject: string;
    payload: any;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await db.insert(emailLog).values({
        recipient: logData.recipient,
        templateId: logData.templateId,
        status: logData.status,
        emailSubject: logData.emailSubject,
        payload: logData.payload ? JSON.stringify(logData.payload) : null,
        errorMessage: logData.errorMessage || null,
        sentAt: new Date()
      });
    } catch (error) {
      console.error('Fehler beim Protokollieren der E-Mail:', error);
    }
  }

  /**
   * Holt E-Mail-Logs für die Übersicht
   */
  async getEmailLogs(limit: number = 50) {
    try {
      return await db
        .select({
          id: emailLog.id,
          sentAt: emailLog.sentAt,
          status: emailLog.status,
          recipient: emailLog.recipient,
          emailSubject: emailLog.emailSubject,
          errorMessage: emailLog.errorMessage,
          templateId: emailLog.templateId
        })
        .from(emailLog)
        .orderBy(emailLog.sentAt)
        .limit(limit);
    } catch (error) {
      console.error('Fehler beim Laden der E-Mail-Logs:', error);
      return [];
    }
  }

  /**
   * Sendet einen Proviantomat-Bericht mit spezifischen Einstellungen
   */
  async sendProviantomatReport(recipientEmail: string, settings: any): Promise<any> {
    try {
      console.log(`📊 Sende Proviantomat-Bericht an ${recipientEmail}...`);
      
      // Sammle echte Daten mit den spezifizierten Einstellungen
      const reportData = await this.aggregator.aggregateData(new Date(), settings);
      
      const emailContent = await this.composer.composeEmail(reportData);
      
      const result = await this.emailService.sendEmail({
        to: recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
      
      if (result) {
        await this.logEmail({
          recipient: recipientEmail,
          templateId: null,
          status: 'sent',
          emailSubject: emailContent.subject,
          payload: reportData
        });
        console.log(`✅ Proviantomat-Bericht erfolgreich gesendet an ${recipientEmail}`);
        return { success: true, emailData: emailContent };
      } else {
        await this.logEmail({
          recipient: recipientEmail,
          templateId: null,
          status: 'failed',
          emailSubject: emailContent.subject,
          payload: reportData,
          errorMessage: 'E-Mail-Versand fehlgeschlagen'
        });
        console.error(`❌ Proviantomat-Bericht-Versand fehlgeschlagen`);
        return { success: false, error: 'E-Mail-Versand fehlgeschlagen' };
      }
      
    } catch (error) {
      console.error('❌ Fehler beim Senden des Proviantomat-Berichts:', error);
      await this.logEmail({
        recipient: recipientEmail,
        templateId: null,
        status: 'failed',
        emailSubject: '[PROVIANTOMAT] Fehler',
        payload: null,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Prüft die E-Mail-Konfiguration
   */
  async validateConfiguration(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Prüfe SendGrid-Konfiguration
      if (!process.env.SENDGRID_API_KEY) {
        issues.push('SENDGRID_API_KEY nicht konfiguriert');
      }

      if (!process.env.FROM_EMAIL) {
        issues.push('FROM_EMAIL nicht konfiguriert');
      }

      // Prüfe E-Mail-Einstellungen
      const settings = await this.getActiveEmailSettings();
      if (!settings) {
        issues.push('Keine aktiven E-Mail-Einstellungen gefunden');
      } else {
        // Prüfe Empfänger
        const recipients = await this.getEmailRecipients(settings.id);
        if (recipients.length === 0) {
          issues.push('Keine E-Mail-Empfänger konfiguriert');
        }

        // Prüfe Template falls konfiguriert
        if (settings.templateId) {
          const template = await this.getEmailTemplate(settings.templateId);
          if (!template) {
            issues.push(`Template mit ID ${settings.templateId} nicht gefunden`);
          }
        }
      }

    } catch (error) {
      issues.push(`Fehler bei der Konfigurationsprüfung: ${error}`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}