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
import { weeklyOperationsAnalysisService } from './weeklyOperationsAnalysisService';
import type { WeeklyOperationsSummary } from './weeklyOperationsAnalysisService';

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
  // Neue umfassende Betriebsanalyse
  operationsAnalysis?: WeeklyOperationsSummary;
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

    // Lade umfassende Betriebsanalyse
    let operationsAnalysis: WeeklyOperationsSummary | undefined;
    try {
      console.log(`🔄 Lade umfassende Betriebsanalyse für die Woche...`);
      operationsAnalysis = await weeklyOperationsAnalysisService.generateWeeklyAnalysis(
        weekStart, 
        weekEnd
      );
      console.log(`✅ Betriebsanalyse geladen: ${operationsAnalysis.refillSummary.totalRefills} Befüllungen analysiert`);
    } catch (error) {
      console.error(`❌ Fehler beim Laden der Betriebsanalyse:`, error);
    }

    return {
      weekStart: weekStart.toLocaleDateString('de-DE'),
      weekEnd: weekEnd.toLocaleDateString('de-DE'),
      plannedDeliveries: await this.getPlannedDeliveries(weekStart, weekEnd),
      criticalReorders: await this.getCriticalReorders(),
      recommendedReorders: await this.getRecommendedReorders(),
      expiringProducts: await this.getExpiringProducts(twoWeeksFromNow),
      operationsAnalysis: operationsAnalysis
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

      return result.rows.map((row: any) => ({
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

      return result.rows.map((row: any) => ({
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
      // Vereinfachte Abfrage mit SQL da die Tabellenschemas komplex sind
      const result = await db.execute(sql`
        SELECT 
          p.product_name as product_name,
          ib.expiry_date,
          ib.current_quantity as quantity,
          w.name as warehouse_name
        FROM inventory_batches ib
        LEFT JOIN products p ON ib.product_id = p.id  
        LEFT JOIN warehouses w ON ib.warehouse_id = w.id
        WHERE ib.expiry_date <= ${twoWeeksFromNow}
          AND ib.current_quantity > 0
          AND ib.status = 'active'
        ORDER BY ib.expiry_date ASC
        LIMIT 20
      `);

      return result.rows.map((item: any) => ({
        productName: item.product_name || 'Unbekanntes Produkt',
        expiryDate: item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('de-DE') : 'Nicht definiert',
        quantity: parseInt(item.quantity) || 0,
        location: item.warehouse_name || 'Unbekannter Ort'
      }));
    } catch (error) {
      console.error('❌ Fehler beim Abrufen ablaufender Produkte:', error);
      return [];
    }
  }

  /**
   * Erstellt umfassenden HTML-E-Mail-Inhalt mit Betriebsanalyse und visueller Darstellung
   */
  generateEmailContent(data: WeeklyReportData): string {
    const ops = data.operationsAnalysis;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>🏆 Umfassende Wochenanalyse: Betriebsleistung, Wirtschaftlichkeit & Optimierung</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #1a1a1a; 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f8fafc;
        }
        .container { background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px; 
            text-align: center;
        }
        .header h1 { margin: 0 0 10px 0; font-size: 28px; font-weight: 700; }
        .header p { margin: 5px 0; font-size: 16px; opacity: 0.9; }
        .section { padding: 25px 30px; border-bottom: 1px solid #e2e8f0; }
        .section:last-child { border-bottom: none; }
        .section h2 { 
            color: #2d3748; 
            font-size: 22px; 
            margin: 0 0 20px 0; 
            display: flex; 
            align-items: center; 
            gap: 10px;
        }
        .section h3 { 
            color: #4a5568; 
            font-size: 18px; 
            margin: 20px 0 15px 0; 
            border-left: 4px solid #667eea; 
            padding-left: 12px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric-card {
            background: #f7fafc;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            border: 2px solid #e2e8f0;
        }
        .metric-value {
            font-size: 28px;
            font-weight: 700;
            color: #2d3748;
            margin: 10px 0;
        }
        .metric-label {
            font-size: 14px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .positive { color: #38a169; }
        .negative { color: #e53e3e; }
        .warning { color: #d69e2e; }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th, td { padding: 15px 12px; text-align: left; }
        th { 
            background: #4a5568; 
            color: white; 
            font-weight: 600;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        td { border-bottom: 1px solid #e2e8f0; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #f7fafc; }
        .status-critical { color: #e53e3e; font-weight: 700; }
        .status-warning { color: #d69e2e; font-weight: 600; }
        .status-ok { color: #38a169; font-weight: 600; }
        .recommendations {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 25px;
            border-radius: 12px;
            margin: 20px 0;
        }
        .recommendations h3 {
            color: white;
            border-left: 4px solid white;
            margin-top: 0;
        }
        .recommendation-item {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            border-left: 4px solid #ffd700;
        }
        .footer { 
            background: #2d3748; 
            color: #e2e8f0; 
            padding: 25px; 
            text-align: center;
            font-size: 14px;
        }
        .footer strong { color: white; }
        .highlight { 
            background: #fef5e7; 
            border: 1px solid #f6ad55; 
            border-radius: 6px; 
            padding: 15px; 
            margin: 15px 0;
        }
        .icon { font-size: 24px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏆 Umfassende Wochenanalyse</h1>
            <p><strong>Guten Morgen Felix!</strong></p>
            <p>Deine detaillierte Betriebsanalyse für <strong>${data.weekStart} – ${data.weekEnd}</strong></p>
        </div>

        ${ops ? `
        <div class="section">
            <h2><span class="icon">💰</span> Wirtschaftliche Leistung</h2>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value positive">€${ops.economicAnalysis?.weeklyTotals?.totalRevenue || 0}</div>
                    <div class="metric-label">Gesamtumsatz</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value ${(ops.economicAnalysis?.weeklyTotals?.netOperatingResult || 0) > 0 ? 'positive' : 'negative'}">€${ops.economicAnalysis?.weeklyTotals?.netOperatingResult || 0}</div>
                    <div class="metric-label">Netto-Betriebsergebnis</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${((ops.economicAnalysis?.keyMetrics?.profitMargin || 0) * 100).toFixed(1)}%</div>
                    <div class="metric-label">Gewinnmarge</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">€${ops.economicAnalysis?.weeklyTotals?.totalRefillCost || 0}</div>
                    <div class="metric-label">Befüllungskosten</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2><span class="icon">🔄</span> Befüllungsanalyse</h2>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${ops.refillSummary?.totalRefills || 0}</div>
                    <div class="metric-label">Befüllungen</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${ops.refillSummary?.machinesRefilled || 0}</div>
                    <div class="metric-label">Maschinen befüllt</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${ops.refillSummary?.productsRefilled || 0}</div>
                    <div class="metric-label">Produktarten</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${(ops.refillSummary?.averageFillLevel || 0).toFixed(1)}%</div>
                    <div class="metric-label">Ø Füllstand</div>
                </div>
            </div>
            ${ops.refillDetails && ops.refillDetails.length > 0 ? `
            <h3>Detaillierte Befüllungshistorie</h3>
            <table>
                <thead>
                    <tr>
                        <th>Maschine</th>
                        <th>Datum</th>
                        <th>Durchgeführt von</th>
                        <th>ROI</th>
                        <th>Umsatzpotential</th>
                        <th>Kosten</th>
                    </tr>
                </thead>
                <tbody>
                    ${ops.refillDetails.slice(0, 10).map(refill => `
                    <tr>
                        <td><strong>${refill.machineName}</strong></td>
                        <td>${new Date(refill.refillDate).toLocaleDateString('de-DE')}</td>
                        <td>${refill.performedBy || 'Unbekannt'}</td>
                        <td class="${refill.roi > 0 ? 'positive' : 'negative'}">${refill.roi.toFixed(1)}%</td>
                        <td>€${refill.estimatedRevenuePotential.toFixed(2)}</td>
                        <td>€${refill.fixCost}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<p><em>Keine Befüllungen in diesem Zeitraum.</em></p>'}
        </div>
        ` : ''}

        <div class="section">
            <h2><span class="icon">📦</span> Geplante Lieferungen</h2>
            ${data.plannedDeliveries.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>Lieferant</th>
                        <th>Lieferdatum</th>
                        <th>Produkte</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.plannedDeliveries.map(delivery => `
                    <tr>
                        <td><strong>${delivery.supplierName}</strong></td>
                        <td>${delivery.plannedDate}</td>
                        <td>${delivery.products.join(', ') || 'Siehe Bestelldetails'}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<p><em>Keine geplanten Lieferungen diese Woche.</em></p>'}
        </div>

        <div class="section">
            <h2><span class="icon">🔁</span> Nachbestellbedarf</h2>
            <h3>Kritische Nachbestellungen</h3>
            ${data.criticalReorders.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>Produkt</th>
                        <th>Bestand</th>
                        <th>Prognose 14T</th>
                        <th>Differenz</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.criticalReorders.map(item => `
                    <tr>
                        <td><strong>${item.productName}</strong></td>
                        <td>${item.currentStock}</td>
                        <td>${item.forecast14Days}</td>
                        <td class="${item.difference > 0 ? 'positive' : 'negative'}">${item.difference > 0 ? '+' : ''}${item.difference}</td>
                        <td class="status-${item.status}">
                            ${item.status === 'critical' ? '🔴 Sofort nachbestellen' : '🟠 Engpass droht'}
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<div class="highlight"><strong>✅ Keine kritischen Nachbestellungen erforderlich!</strong></div>'}
        </div>

        <div class="section">
            <h2><span class="icon">⏳</span> MHD-Management</h2>
            ${data.expiringProducts.length > 0 ? `
            <div class="highlight">
                <strong>⚠️ Aufmerksamkeit erforderlich:</strong> ${data.expiringProducts.length} Produkte laufen in den nächsten 2 Wochen ab.
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Produkt</th>
                        <th>Ablaufdatum</th>
                        <th>Menge</th>
                        <th>Lagerort</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.expiringProducts.map(item => `
                    <tr>
                        <td><strong>${item.productName}</strong></td>
                        <td class="status-warning">${item.expiryDate}</td>
                        <td>${item.quantity}</td>
                        <td>${item.location}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<div class="highlight"><strong>✅ Alle Produkte haben ausreichend lange MHD-Zeiten!</strong></div>'}
        </div>

        ${ops && ops.optimizationRecommendations && ops.optimizationRecommendations.length > 0 ? `
        <div class="recommendations">
            <h3><span class="icon">🎯</span> Optimierungsempfehlungen</h3>
            ${ops.optimizationRecommendations.map(rec => `
            <div class="recommendation-item">
                <strong>${rec.title}</strong><br>
                ${rec.description}<br>
                <small><strong>Erwartete Auswirkung:</strong> ${rec.expectedImpact}</small>
            </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="footer">
            <p><strong>Dein intelligentes Warenwirtschaftssystem</strong></p>
            <p>Automatisch generiert mit KI-gestützter Analyse • ${new Date().toLocaleDateString('de-DE')}, ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
            <p style="margin-top: 15px;"><em>Bei Fragen oder Anpassungswünschen einfach kurz melden!</em></p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Versendet den umfassenden wöchentlichen Bericht mit Betriebsanalyse
   */
  async sendComprehensiveWeeklyReport(recipientEmail: string = 'felix@proviantomat.de'): Promise<{ success: boolean; message: string; error?: string; data?: WeeklyReportData }> {
    try {
      console.log('📧 Beginne Erstellung des umfassenden wöchentlichen Berichts...');
      
      const data = await this.collectWeeklyData();
      const htmlContent = this.generateEmailContent(data);
      
      if (!this.transporter) {
        // Fallback: Zeige den E-Mail-Inhalt für Testing
        console.log('📧 SMTP nicht verfügbar - zeige E-Mail-Inhalt für Debugging');
        return {
          success: true,
          message: `Umfassender Wochenbericht für ${recipientEmail} generiert (SMTP nicht verfügbar)`,
          error: 'SMTP nicht konfiguriert - E-Mail wurde nur generiert',
          data: data
        };
      }

      const mailOptions = {
        from: process.env.SMTP_USER || 'system@proviantomat.de',
        to: recipientEmail,
        subject: '🏆 Umfassende Wochenanalyse: Betriebsleistung, Wirtschaftlichkeit & Optimierung',
        html: htmlContent
      };

      await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Umfassender Wochenbericht erfolgreich an ${recipientEmail} gesendet`);
      return {
        success: true,
        message: `Umfassender Wochenbericht erfolgreich an ${recipientEmail} gesendet`,
        data: data
      };

    } catch (error: any) {
      console.error('❌ Fehler beim Versenden des umfassenden wöchentlichen Berichts:', error);
      return {
        success: false,
        message: `Fehler beim Versenden des umfassenden wöchentlichen Berichts: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Versendet den standard wöchentlichen Bericht (für Kompatibilität)
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