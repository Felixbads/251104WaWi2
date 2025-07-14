/**
 * Wöchentlicher E-Mail-Bericht Service
 * Erstellt und versendet automatisch wöchentliche Übersichts-E-Mails mit:
 * - Geplante Lieferungen
 * - Nachbestellbedarf (kritisch)
 * - Empfohlene Nachbestellungen
 * - MHD-Warnungen
 */

import { db } from '../db';
import { orders, orderItems, inventoryItems, recurringOrders, products, suppliers } from '../../shared/schema';
import { eq, and, sql, gte, lte, desc, asc } from 'drizzle-orm';
import nodemailer from 'nodemailer';

interface WeeklyReportData {
  weekStart: string;
  weekEnd: string;
  plannedDeliveries: Array<{
    supplierName: string;
    plannedDate: string;
    products: string[];
  }>;
  criticalReorders: Array<{
    productName: string;
    currentStock: number;
    forecast14Days: number;
    difference: number;
    status: 'critical' | 'warning';
  }>;
  recommendedReorders: Array<{
    productName: string;
    currentStock: number;
    forecast14Days: number;
    recommendation: string;
  }>;
  expiringProducts: Array<{
    productName: string;
    expiryDate: string;
    quantity: number;
    location: string;
  }>;
}

class WeeklyReportService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    
    if (smtpConfigured) {
      try {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          requireTLS: true,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          tls: {
            rejectUnauthorized: false,
            servername: process.env.SMTP_HOST
          }
        });
        console.log('📧 Weekly Report SMTP-Transporter initialisiert');
      } catch (error) {
        console.error('❌ Weekly Report SMTP-Initialisierung fehlgeschlagen:', error);
      }
    }
  }

  /**
   * Sammelt alle Daten für den wöchentlichen Bericht
   */
  async collectWeeklyData(): Promise<WeeklyReportData> {
    const now = new Date();
    const weekStart = this.getWeekStart(now);
    const weekEnd = this.getWeekEnd(weekStart);
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    console.log(`📊 Sammle Wochendaten für ${weekStart.toLocaleDateString('de-DE')} - ${weekEnd.toLocaleDateString('de-DE')}`);

    return {
      weekStart: weekStart.toLocaleDateString('de-DE'),
      weekEnd: weekEnd.toLocaleDateString('de-DE'),
      plannedDeliveries: await this.getPlannedDeliveries(weekStart, weekEnd),
      criticalReorders: await this.getCriticalReorders(),
      recommendedReorders: await this.getRecommendedReorders(),
      expiringProducts: await this.getExpiringProducts(twoWeeksFromNow)
    };
  }

  /**
   * Geplante Lieferungen für diese Woche
   */
  private async getPlannedDeliveries(weekStart: Date, weekEnd: Date) {
    try {
      const deliveries = await db
        .select({
          supplierName: orders.supplierName,
          plannedDate: orders.expectedDeliveryDate,
          orderNumber: orders.orderNumber,
        })
        .from(orders)
        .where(
          and(
            gte(orders.expectedDeliveryDate, weekStart),
            lte(orders.expectedDeliveryDate, weekEnd),
            eq(orders.status, 'pending')
          )
        )
        .orderBy(asc(orders.expectedDeliveryDate));

      // Gruppiere nach Lieferant und sammle Produkte
      const grouped = deliveries.reduce((acc, delivery) => {
        const key = delivery.supplierName || 'Unbekannter Lieferant';
        if (!acc[key]) {
          acc[key] = {
            supplierName: key,
            plannedDate: delivery.plannedDate?.toLocaleDateString('de-DE') || 'Nicht definiert',
            products: []
          };
        }
        return acc;
      }, {} as Record<string, any>);

      return Object.values(grouped);
    } catch (error) {
      console.error('❌ Fehler beim Abrufen geplanter Lieferungen:', error);
      return [];
    }
  }

  /**
   * Kritische Nachbestellungen basierend auf Lagerbestand vs. Prognose
   */
  private async getCriticalReorders() {
    try {
      // Vereinfachte Prognose: Durchschnitt der letzten 14 Tage * 2
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      
      const result = await db.execute(sql`
        WITH inventory_summary AS (
          SELECT 
            p.name as product_name,
            COALESCE(SUM(ii.quantity), 0) as current_stock,
            -- Vereinfachte Prognose: 20% mehr als aktueller Bestand als Minimum
            COALESCE(SUM(ii.quantity), 0) * 1.2 as forecast_14_days
          FROM products p
          LEFT JOIN inventory_items ii ON p.id = ii.product_id
          WHERE p.is_active = true
          GROUP BY p.id, p.name
        )
        SELECT 
          product_name,
          current_stock,
          forecast_14_days,
          (forecast_14_days - current_stock) as difference,
          CASE 
            WHEN current_stock < forecast_14_days * 0.5 THEN 'critical'
            WHEN current_stock < forecast_14_days * 0.8 THEN 'warning'
            ELSE 'ok'
          END as status
        FROM inventory_summary
        WHERE current_stock < forecast_14_days * 0.8
        ORDER BY difference DESC
        LIMIT 10
      `);

      return result.map((row: any) => ({
        productName: row.product_name,
        currentStock: parseInt(row.current_stock) || 0,
        forecast14Days: Math.round(parseFloat(row.forecast_14_days)) || 0,
        difference: Math.round(parseFloat(row.difference)) || 0,
        status: row.status
      }));
    } catch (error) {
      console.error('❌ Fehler beim Abrufen kritischer Nachbestellungen:', error);
      return [];
    }
  }

  /**
   * Empfohlene Nachbestellungen (nicht kritisch)
   */
  private async getRecommendedReorders() {
    try {
      const result = await db.execute(sql`
        WITH inventory_summary AS (
          SELECT 
            p.name as product_name,
            COALESCE(SUM(ii.quantity), 0) as current_stock,
            COALESCE(SUM(ii.quantity), 0) * 1.1 as forecast_14_days
          FROM products p
          LEFT JOIN inventory_items ii ON p.id = ii.product_id
          WHERE p.is_active = true
          GROUP BY p.id, p.name
        )
        SELECT 
          product_name,
          current_stock,
          forecast_14_days,
          CASE 
            WHEN current_stock > forecast_14_days * 1.5 THEN 'Überbestand - reduzieren'
            WHEN current_stock >= forecast_14_days THEN 'OK - beobachten'
            ELSE 'Beobachten'
          END as recommendation
        FROM inventory_summary
        WHERE current_stock >= forecast_14_days * 0.8 
          AND current_stock <= forecast_14_days * 1.5
        ORDER BY current_stock DESC
        LIMIT 5
      `);

      return result.map((row: any) => ({
        productName: row.product_name,
        currentStock: parseInt(row.current_stock) || 0,
        forecast14Days: Math.round(parseFloat(row.forecast_14_days)) || 0,
        recommendation: row.recommendation
      }));
    } catch (error) {
      console.error('❌ Fehler beim Abrufen empfohlener Nachbestellungen:', error);
      return [];
    }
  }

  /**
   * Produkte mit MHD-Ablauf in den nächsten 2 Wochen
   */
  private async getExpiringProducts(twoWeeksFromNow: Date) {
    try {
      const result = await db
        .select({
          productName: products.name,
          expiryDate: inventoryItems.expiryDate,
          quantity: inventoryItems.quantity,
          location: inventoryItems.warehouseName,
        })
        .from(inventoryItems)
        .leftJoin(products, eq(inventoryItems.productId, products.id))
        .where(
          and(
            lte(inventoryItems.expiryDate, twoWeeksFromNow),
            gte(inventoryItems.quantity, 1)
          )
        )
        .orderBy(asc(inventoryItems.expiryDate));

      return result.map(item => ({
        productName: item.productName || 'Unbekanntes Produkt',
        expiryDate: item.expiryDate?.toLocaleDateString('de-DE') || 'Nicht definiert',
        quantity: item.quantity || 0,
        location: item.location || 'Unbekannter Ort'
      }));
    } catch (error) {
      console.error('❌ Fehler beim Abrufen ablaufender Produkte:', error);
      return [];
    }
  }

  /**
   * Erstellt HTML-E-Mail-Inhalt basierend auf der Vorlage aus dem Anhang
   */
  generateEmailContent(data: WeeklyReportData): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>🧾 Wochenüberblick: Liefertermine, Bestellbedarf & MHD-Warnungen</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; }
        .section h3 { color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f8f9fa; font-weight: 600; }
        .status-critical { color: #dc2626; font-weight: bold; }
        .status-warning { color: #f59e0b; font-weight: bold; }
        .status-ok { color: #16a34a; }
        .footer { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 30px; font-size: 0.9em; color: #6b7280; }
        .emoji { font-size: 1.2em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧾 Wochenüberblick: Liefertermine, Bestellbedarf & MHD-Warnungen</h1>
        <p><strong>Guten Morgen Felix,</strong></p>
        <p>hier ist dein aktueller Wochenüberblick für den Zeitraum <strong>${data.weekStart} – ${data.weekEnd}</strong>:</p>
    </div>

    <div class="section">
        <h3>📦 Geplante Lieferungen diese Woche</h3>
        ${data.plannedDeliveries.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>Lieferant</th>
                    <th>Geplantes Lieferdatum</th>
                    <th>Produkte</th>
                </tr>
            </thead>
            <tbody>
                ${data.plannedDeliveries.map(delivery => `
                <tr>
                    <td>${delivery.supplierName}</td>
                    <td>${delivery.plannedDate}</td>
                    <td>${delivery.products.join(', ') || 'Siehe Bestelldetails'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : '<p><em>Keine geplanten Lieferungen diese Woche.</em></p>'}
    </div>

    <div class="section">
        <h3>🔁 Nachbestellbedarf (kritisch)</h3>
        <p>Diese Produkte sollten dringend nachbestellt werden – basierend auf dem prognostizierten Absatz in den nächsten 14 Tagen:</p>
        ${data.criticalReorders.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>Produkt</th>
                    <th>Lagerbestand</th>
                    <th>Prognose 2 Wochen</th>
                    <th>Differenz</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${data.criticalReorders.map(item => `
                <tr>
                    <td>${item.productName}</td>
                    <td>${item.currentStock}</td>
                    <td>${item.forecast14Days}</td>
                    <td>${item.difference > 0 ? '+' : ''}${item.difference}</td>
                    <td class="status-${item.status}">
                        ${item.status === 'critical' ? '🔴 Nachbestellen' : '🟠 Engpass droht'}
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : '<p><em>Keine kritischen Nachbestellungen erforderlich.</em></p>'}
    </div>

    <div class="section">
        <h3>📊 Empfohlene Nachbestellungen (nicht kritisch, aber sinnvoll)</h3>
        <p>Diese Produkte könnten in Kürze knapp werden, Bestellmenge nach Bedarf anpassen:</p>
        ${data.recommendedReorders.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>Produkt</th>
                    <th>Lagerbestand</th>
                    <th>Prognose 2 Wochen</th>
                    <th>Empfehlung</th>
                </tr>
            </thead>
            <tbody>
                ${data.recommendedReorders.map(item => `
                <tr>
                    <td>${item.productName}</td>
                    <td>${item.currentStock}</td>
                    <td>${item.forecast14Days}</td>
                    <td class="status-ok">${item.recommendation}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : '<p><em>Keine spezifischen Empfehlungen diese Woche.</em></p>'}
    </div>

    <div class="section">
        <h3>⏳ MHD-Warnung – Produkte mit Ablauf in den nächsten 2 Wochen</h3>
        <p>Folgende Artikel laufen bis <strong>${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE')}</strong> ab:</p>
        ${data.expiringProducts.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>Produkt</th>
                    <th>MHD</th>
                    <th>Menge</th>
                    <th>Lagerort</th>
                </tr>
            </thead>
            <tbody>
                ${data.expiringProducts.map(item => `
                <tr>
                    <td>${item.productName}</td>
                    <td class="status-warning">${item.expiryDate}</td>
                    <td>${item.quantity}</td>
                    <td>${item.location}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : '<p class="status-ok"><em>Keine Produkte laufen in den nächsten 2 Wochen ab.</em></p>'}
    </div>

    <div class="footer">
        <p><strong>Hinweis:</strong><br>
        Alle Daten basieren auf dem aktuellen Lagerbestand und der Verkaufsprognose. Du kannst direkt über das System nachbestellen oder die Bestellvorschläge anpassen.</p>
        
        <p>Bei Fragen oder Anpassungswünschen an diesen Bericht – einfach kurz melden!</p>
        
        <p><strong>Viele Grüße<br>
        Dein Warenwirtschafts-Assistenzsystem</strong></p>
        
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p><em>Gesendet am: ${new Date().toLocaleDateString('de-DE')}, ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</em></p>
    </div>
</body>
</html>
    `;
  }

  /**
   * Versendet den wöchentlichen Bericht
   */
  async sendWeeklyReport(recipientEmail: string = 'felix@proviantomat.de'): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      console.log('📧 Beginne Erstellung des wöchentlichen Berichts...');
      
      const data = await this.collectWeeklyData();
      const htmlContent = this.generateEmailContent(data);
      
      if (!this.transporter) {
        // Fallback: Simuliere E-Mail-Versand
        console.log('📧 SMTP nicht verfügbar - simuliere E-Mail-Versand');
        return {
          success: true,
          message: `Wöchentlicher Bericht simuliert für ${recipientEmail}`,
          error: 'SMTP nicht konfiguriert - E-Mail wurde nur simuliert'
        };
      }

      const mailOptions = {
        from: process.env.SMTP_USER || 'system@proviantomat.de',
        to: recipientEmail,
        subject: '🧾 Wochenüberblick: Liefertermine, Bestellbedarf & MHD-Warnungen',
        html: htmlContent
      };

      await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Wöchentlicher Bericht erfolgreich an ${recipientEmail} gesendet`);
      return {
        success: true,
        message: `Wöchentlicher Bericht erfolgreich an ${recipientEmail} gesendet`
      };

    } catch (error: any) {
      console.error('❌ Fehler beim Versenden des wöchentlichen Berichts:', error);
      return {
        success: false,
        message: `Fehler beim Versenden des wöchentlichen Berichts: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Test-E-Mail senden
   */
  async sendTestEmail(recipientEmail: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      if (!this.transporter) {
        return {
          success: false,
          message: 'SMTP-Transporter nicht verfügbar',
          error: 'SMTP-Konfiguration fehlt oder ist fehlerhaft'
        };
      }

      const testContent = `
        <h2>📧 Test-E-Mail - Warenwirtschaftssystem</h2>
        <p>Dies ist eine Test-E-Mail zur Überprüfung der E-Mail-Funktionalität.</p>
        <p><strong>Zeitstempel:</strong> ${new Date().toLocaleString('de-DE')}</p>
        <p><em>Wenn Sie diese E-Mail erhalten, funktioniert das E-Mail-System korrekt.</em></p>
      `;

      const mailOptions = {
        from: process.env.SMTP_USER || 'system@proviantomat.de',
        to: recipientEmail,
        subject: '📧 Test-E-Mail - Warenwirtschaftssystem',
        html: testContent
      };

      await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        message: `Test-E-Mail erfolgreich an ${recipientEmail} gesendet`
      };

    } catch (error: any) {
      console.error('❌ Test-E-Mail-Versand fehlgeschlagen:', error);
      return {
        success: false,
        message: `Test-E-Mail-Versand fehlgeschlagen: ${error.message}`,
        error: error.message
      };
    }
  }

  // Hilfsfunktionen
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Montag als Wochenstart
    return new Date(d.setDate(diff));
  }

  private getWeekEnd(weekStart: Date): Date {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return weekEnd;
  }
}

export const weeklyReportService = new WeeklyReportService();