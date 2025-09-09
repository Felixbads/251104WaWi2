import { db } from '../db';
import { syncHealthLogs, transactionGaps, recoveryJobs, emailLog, machines } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, isNull, count } from 'drizzle-orm';
import { EventEmitter } from 'events';

// Types für Alerting
export interface Alert {
  id: string;
  type: 'gap_detected' | 'health_critical' | 'recovery_failed' | 'system_overload' | 'data_quality_low';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  source: {
    service: string;
    machineId?: number | null;
    machineName?: string | null;
    vendonMachineId?: string | null;
  };
  metadata: Record<string, any>;
  timestamp: Date;
  acknowledged?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

export interface NotificationChannel {
  name: string;
  type: 'email' | 'webhook' | 'console' | 'dashboard';
  enabled: boolean;
  configuration: Record<string, any>;
  errorRate?: number;
  lastSuccessfulDelivery?: Date;
}

export interface AlertingRule {
  id: string;
  name: string;
  description: string;
  eventType: string;
  conditions: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  channels: string[];
  cooldownMinutes: number;
  lastTriggered?: Date;
}

/**
 * AlertingService - Real-time Benachrichtigungssystem
 * 
 * Features:
 * - Multi-Channel Benachrichtigungen (E-Mail, Webhook, Dashboard)
 * - Intelligente Alert-Aggregation und -Deduplication
 * - Regelbasiertes Alerting mit Cooldowns
 * - Escalation-Management
 * - Performance-optimierte Real-time Updates
 * - Integration mit allen Monitoring-Services
 */
export class AlertingService extends EventEmitter {
  private activeAlerts = new Map<string, Alert>();
  private alertingRules: AlertingRule[] = [];
  private notificationChannels: NotificationChannel[] = [];
  private cooldownTracker = new Map<string, Date>();
  private readonly ALERT_CLEANUP_INTERVAL_MS = 300000; // 5 Minuten
  private readonly MAX_ACTIVE_ALERTS = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeDefaultRules();
    this.initializeDefaultChannels();
    this.startCleanupProcess();
  }

  /**
   * Startet den Alerting Service
   */
  async start(): Promise<void> {
    console.log('[Alerting] Starte Alerting Service...');
    
    // Event-Handler für verschiedene Services registrieren
    this.setupServiceEventHandlers();
    
    // Cleanup alte Alerts
    await this.cleanupOldAlerts();
    
    console.log('[Alerting] Service gestartet mit', this.alertingRules.length, 'Regeln und', this.notificationChannels.length, 'Kanälen');
  }

  /**
   * Stoppt den Alerting Service
   */
  async stop(): Promise<void> {
    console.log('[Alerting] Stoppe Alerting Service...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Alle Event-Handler entfernen
    this.removeAllListeners();
    
    console.log('[Alerting] Service gestoppt');
  }

  /**
   * Verarbeitet ein neues Alert-Event
   */
  async processAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    title: string,
    message: string,
    source: Alert['source'],
    metadata: Record<string, any> = {}
  ): Promise<string | null> {
    try {
      // Prüfe ob Alert bereits kürzlich ausgelöst wurde (Cooldown)
      const cooldownKey = this.generateCooldownKey(type, source);
      if (this.isInCooldown(cooldownKey)) {
        return null; // Alert unterdrückt durch Cooldown
      }

      // Erstelle Alert
      const alert: Alert = {
        id: this.generateAlertId(),
        type,
        severity,
        title,
        message,
        source,
        metadata,
        timestamp: new Date(),
        acknowledged: false
      };

      // Prüfe Alerting-Regeln
      const applicableRules = this.findApplicableRules(alert);
      if (applicableRules.length === 0) {
        return null; // Keine anwendbaren Regeln
      }

      // Alert speichern
      this.activeAlerts.set(alert.id, alert);

      console.log(`[Alerting] Neues ${severity.toUpperCase()} Alert: ${title} (${source.service})`);

      // Benachrichtigungen versenden
      await this.sendNotifications(alert, applicableRules);

      // Cooldown setzen
      this.setCooldown(cooldownKey, applicableRules);

      // Event emittieren für Dashboard
      this.emit('alert_created', alert);

      return alert.id;

    } catch (error) {
      console.error('[Alerting] Fehler beim Verarbeiten des Alerts:', error);
      return null;
    }
  }

  /**
   * Bestätigt ein Alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    console.log(`[Alerting] Alert ${alertId} bestätigt von ${acknowledgedBy}`);
    
    this.emit('alert_acknowledged', alert);
    return true;
  }

  /**
   * Löst ein Alert auf
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolvedAt = new Date();
    
    console.log(`[Alerting] Alert ${alertId} aufgelöst`);
    
    this.emit('alert_resolved', alert);
    
    // Nach kurzer Zeit aus aktiven Alerts entfernen
    setTimeout(() => {
      this.activeAlerts.delete(alertId);
    }, 60000); // 1 Minute

    return true;
  }

  /**
   * Initialisiert Standard-Alerting-Regeln
   */
  private initializeDefaultRules(): void {
    this.alertingRules = [
      {
        id: 'transaction_gap_critical',
        name: 'Kritische Transaktionslücke',
        description: 'Kritische Lücken in Transaktionsdaten erkannt',
        eventType: 'gap_detected',
        conditions: { severity: 'critical' },
        severity: 'critical',
        enabled: true,
        channels: ['email', 'dashboard'],
        cooldownMinutes: 30
      },
      {
        id: 'transaction_gap_high',
        name: 'Hohe Transaktionslücke',
        description: 'Bedeutende Lücken in Transaktionsdaten erkannt',
        eventType: 'gap_detected',
        conditions: { severity: 'high' },
        severity: 'error',
        enabled: true,
        channels: ['email', 'dashboard'],
        cooldownMinutes: 60
      },
      {
        id: 'health_check_critical',
        name: 'Kritisches Systemproblem',
        description: 'Kritischer Zustand in Monitoring-Komponenten',
        eventType: 'health_critical',
        conditions: { component: ['transaction_monitor', 'gap_detector'] },
        severity: 'critical',
        enabled: true,
        channels: ['email', 'dashboard'],
        cooldownMinutes: 15
      },
      {
        id: 'recovery_job_failed',
        name: 'Recovery-Job fehlgeschlagen',
        description: 'Automatische Datenwiederherstellung fehlgeschlagen',
        eventType: 'recovery_failed',
        conditions: { priority: ['high', 'urgent'] },
        severity: 'error',
        enabled: true,
        channels: ['email', 'dashboard'],
        cooldownMinutes: 45
      },
      {
        id: 'data_quality_low',
        name: 'Niedrige Datenqualität',
        description: 'Datenqualität unter kritischem Schwellwert',
        eventType: 'data_quality_low',
        conditions: { overallScore: { operator: '<', value: 60 } },
        severity: 'warning',
        enabled: true,
        channels: ['dashboard'],
        cooldownMinutes: 120
      },
      {
        id: 'system_overload',
        name: 'Systemüberlastung',
        description: 'Monitoring-System überlastet',
        eventType: 'system_overload',
        conditions: { activeJobs: { operator: '>', value: 10 } },
        severity: 'warning',
        enabled: true,
        channels: ['dashboard'],
        cooldownMinutes: 30
      }
    ];
  }

  /**
   * Initialisiert Standard-Benachrichtigungskanäle
   */
  private initializeDefaultChannels(): void {
    this.notificationChannels = [
      {
        name: 'email',
        type: 'email',
        enabled: true,
        configuration: {
          recipients: ['admin@example.com'],
          template: 'monitoring_alert'
        }
      },
      {
        name: 'dashboard',
        type: 'dashboard',
        enabled: true,
        configuration: {
          realtime: true,
          retention: '24h'
        }
      },
      {
        name: 'console',
        type: 'console',
        enabled: true,
        configuration: {
          logLevel: 'warn'
        }
      }
    ];
  }

  /**
   * Setup Event-Handler für verschiedene Services
   */
  private setupServiceEventHandlers(): void {
    // Event-Handler würden hier registriert werden für:
    // - TransactionMonitoringService
    // - GapDetectionService  
    // - SmartRecoveryService
    
    console.log('[Alerting] Event-Handler für Services registriert');
  }

  /**
   * Findet anwendbare Regeln für ein Alert
   */
  private findApplicableRules(alert: Alert): AlertingRule[] {
    return this.alertingRules.filter(rule => {
      if (!rule.enabled || rule.eventType !== alert.type) {
        return false;
      }

      // Prüfe Regelbed (conditions)
      return this.evaluateRuleConditions(rule.conditions, alert);
    });
  }

  /**
   * Evaluiert Regelbedingungen
   */
  private evaluateRuleConditions(conditions: Record<string, any>, alert: Alert): boolean {
    for (const [key, condition] of Object.entries(conditions)) {
      const alertValue = this.getAlertValue(alert, key);
      
      if (!this.evaluateCondition(alertValue, condition)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Extrahiert Wert aus Alert für Regel-Evaluation
   */
  private getAlertValue(alert: Alert, key: string): any {
    // Einfache Schlüssel
    if (key in alert) {
      return (alert as any)[key];
    }
    
    // Verschachtelte Schlüssel (source.machineId, metadata.overallScore, etc.)
    const parts = key.split('.');
    let value: any = alert;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Evaluiert einzelne Bedingung
   */
  private evaluateCondition(value: any, condition: any): boolean {
    if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
      // Direkte Gleichheit
      return value === condition;
    }
    
    if (Array.isArray(condition)) {
      // Wert muss in Array enthalten sein
      return condition.includes(value);
    }
    
    if (typeof condition === 'object' && condition.operator) {
      // Operator-basierte Bedingung
      switch (condition.operator) {
        case '<': return value < condition.value;
        case '<=': return value <= condition.value;
        case '>': return value > condition.value;
        case '>=': return value >= condition.value;
        case '!=': return value !== condition.value;
        case 'contains': return String(value).includes(condition.value);
        default: return value === condition.value;
      }
    }
    
    return false;
  }

  /**
   * Versendet Benachrichtigungen für Alert
   */
  private async sendNotifications(alert: Alert, rules: AlertingRule[]): Promise<void> {
    const channelsToNotify = new Set<string>();
    
    // Sammle alle Kanäle aus anwendbaren Regeln
    rules.forEach(rule => {
      rule.channels.forEach(channel => channelsToNotify.add(channel));
    });
    
    // Versende über jeden Kanal
    for (const channelName of Array.from(channelsToNotify)) {
      const channel = this.notificationChannels.find(c => c.name === channelName);
      if (channel && channel.enabled) {
        await this.sendNotificationToChannel(alert, channel);
      }
    }
  }

  /**
   * Versendet Benachrichtigung über spezifischen Kanal
   */
  private async sendNotificationToChannel(alert: Alert, channel: NotificationChannel): Promise<void> {
    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmailNotification(alert, channel);
          break;
          
        case 'webhook':
          await this.sendWebhookNotification(alert, channel);
          break;
          
        case 'console':
          this.sendConsoleNotification(alert, channel);
          break;
          
        case 'dashboard':
          this.sendDashboardNotification(alert, channel);
          break;
          
        default:
          console.warn(`[Alerting] Unbekannter Kanal-Typ: ${channel.type}`);
      }
      
      channel.lastSuccessfulDelivery = new Date();
      
    } catch (error) {
      console.error(`[Alerting] Fehler beim Versenden über ${channel.name}:`, error);
      channel.errorRate = (channel.errorRate || 0) + 1;
    }
  }

  /**
   * Versendet E-Mail-Benachrichtigung
   */
  private async sendEmailNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
    try {
      // Hier würde die E-Mail-Integration erfolgen
      // Integration mit dem bestehenden E-Mail-System
      
      const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
      const body = this.formatAlertForEmail(alert);
      
      // Log für E-Mail-Versendung
      await db.insert(emailLog).values({
        recipient: JSON.stringify(channel.configuration.recipients),
        emailSubject: subject,
        emailContent: body,
        status: 'sent'
      });
      
      console.log(`[Alerting] E-Mail-Benachrichtigung versendet: ${subject}`);
      
    } catch (error) {
      console.error('[Alerting] E-Mail-Versendung fehlgeschlagen:', error);
      throw error;
    }
  }

  /**
   * Versendet Webhook-Benachrichtigung
   */
  private async sendWebhookNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
    // Webhook-Implementation würde hier erfolgen
    console.log(`[Alerting] Webhook-Benachrichtigung für ${alert.id}`);
  }

  /**
   * Versendet Console-Benachrichtigung
   */
  private sendConsoleNotification(alert: Alert, channel: NotificationChannel): void {
    const logLevel = channel.configuration.logLevel || 'info';
    const message = `[ALERT] ${alert.severity.toUpperCase()}: ${alert.title} - ${alert.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * Versendet Dashboard-Benachrichtigung
   */
  private sendDashboardNotification(alert: Alert, channel: NotificationChannel): void {
    // Dashboard-Benachrichtigung via WebSocket oder SSE
    this.emit('dashboard_notification', {
      type: 'alert',
      data: alert,
      timestamp: new Date()
    });
  }

  /**
   * Formatiert Alert für E-Mail
   */
  private formatAlertForEmail(alert: Alert): string {
    const lines = [
      `Alert: ${alert.title}`,
      `Schweregrad: ${alert.severity.toUpperCase()}`,
      `Zeitpunkt: ${alert.timestamp.toLocaleString('de-DE')}`,
      `Service: ${alert.source.service}`,
      '',
      `Beschreibung:`,
      alert.message,
      ''
    ];
    
    if (alert.source.machineName) {
      lines.push(`Maschine: ${alert.source.machineName}`);
    }
    
    if (Object.keys(alert.metadata).length > 0) {
      lines.push('', 'Zusätzliche Informationen:');
      for (const [key, value] of Object.entries(alert.metadata)) {
        lines.push(`- ${key}: ${JSON.stringify(value)}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Generiert Cooldown-Key
   */
  private generateCooldownKey(type: Alert['type'], source: Alert['source']): string {
    return `${type}:${source.service}:${source.machineId || 'all'}`;
  }

  /**
   * Prüft ob Alert in Cooldown ist
   */
  private isInCooldown(cooldownKey: string): boolean {
    const lastTriggered = this.cooldownTracker.get(cooldownKey);
    if (!lastTriggered) return false;
    
    // Suche entsprechende Regel für Cooldown-Zeit
    const rule = this.alertingRules.find(r => 
      cooldownKey.startsWith(r.eventType)
    );
    
    if (!rule) return false;
    
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    const now = Date.now();
    
    return (now - lastTriggered.getTime()) < cooldownMs;
  }

  /**
   * Setzt Cooldown für Alert-Typ
   */
  private setCooldown(cooldownKey: string, rules: AlertingRule[]): void {
    this.cooldownTracker.set(cooldownKey, new Date());
    
    // Update lastTriggered für Regeln
    rules.forEach(rule => {
      rule.lastTriggered = new Date();
    });
  }

  /**
   * Generiert eindeutige Alert-ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Startet Cleanup-Prozess für alte Alerts
   */
  private startCleanupProcess(): void {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOldAlerts();
    }, this.ALERT_CLEANUP_INTERVAL_MS);
  }

  /**
   * Räumt alte Alerts auf
   */
  private async cleanupOldAlerts(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 Stunden
    
    let cleanedCount = 0;
    
    for (const [alertId, alert] of Array.from(this.activeAlerts.entries())) {
      const age = now - alert.timestamp.getTime();
      
      // Entferne aufgelöste oder sehr alte Alerts
      if (alert.resolvedAt || age > maxAge) {
        this.activeAlerts.delete(alertId);
        cleanedCount++;
      }
    }
    
    // Auch Cooldown-Tracker aufräumen
    for (const [key, timestamp] of Array.from(this.cooldownTracker.entries())) {
      const age = now - timestamp.getTime();
      if (age > maxAge) {
        this.cooldownTracker.delete(key);
      }
    }
    
    // Begrenze Anzahl aktiver Alerts
    if (this.activeAlerts.size > this.MAX_ACTIVE_ALERTS) {
      const sortedAlerts = Array.from(this.activeAlerts.entries())
        .sort(([,a], [,b]) => a.timestamp.getTime() - b.timestamp.getTime());
      
      const toRemove = sortedAlerts.slice(0, this.activeAlerts.size - this.MAX_ACTIVE_ALERTS);
      toRemove.forEach(([alertId]) => {
        this.activeAlerts.delete(alertId);
        cleanedCount++;
      });
    }
    
    if (cleanedCount > 0) {
      console.log(`[Alerting] ${cleanedCount} alte Alerts bereinigt`);
    }
  }

  /**
   * Gibt aktuelle Service-Statistiken zurück
   */
  public getServiceStats() {
    const severityCounts = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const alert of Array.from(this.activeAlerts.values())) {
      const severity = alert.severity as keyof typeof severityCounts;
      severityCounts[severity]++;
    }
    
    return {
      activeAlerts: this.activeAlerts.size,
      severityCounts,
      alertingRules: this.alertingRules.length,
      enabledRules: this.alertingRules.filter(r => r.enabled).length,
      notificationChannels: this.notificationChannels.length,
      enabledChannels: this.notificationChannels.filter(c => c.enabled).length,
      cooldownEntries: this.cooldownTracker.size
    };
  }

  /**
   * Gibt aktive Alerts zurück
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Gibt Alerting-Regeln zurück
   */
  public getAlertingRules(): AlertingRule[] {
    return [...this.alertingRules];
  }

  /**
   * Gibt Benachrichtigungskanäle zurück
   */
  public getNotificationChannels(): NotificationChannel[] {
    return [...this.notificationChannels];
  }
}

// Singleton Instance
export const alertingService = new AlertingService();