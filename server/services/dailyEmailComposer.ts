/**
 * Email Composer Service für tägliche E-Mail-Benachrichtigungen
 * Komponiert HTML-E-Mails basierend auf Proviantomat-Datenstruktur
 */
import { DailyReportData } from './dailyEmailDataAggregator';
import { EmailTemplates } from '@shared/schema';
import { escapeHtml, escapeText, safeArray, safeObject } from '../utils/stringUtils';

export class DailyEmailComposer {
  /**
   * ERWEITERTE Currency-Formatierung für robuste Null-Wert-Behandlung
   */
  private formatCurrency(value: any, showSymbol: boolean = true): string {
    // ROBUSTE Null-Wert-Behandlung und Typ-Konvertierung
    let numericValue: number;
    
    if (value === null || value === undefined || value === '') {
      numericValue = 0;
    } else if (typeof value === 'string') {
      // String zu Number konvertieren, Kommas entfernen
      const cleanString = value.replace(/[€$£¥\s,]/g, '');
      numericValue = parseFloat(cleanString);
      if (isNaN(numericValue)) numericValue = 0;
    } else if (typeof value === 'number') {
      numericValue = isNaN(value) ? 0 : value;
    } else {
      numericValue = 0;
    }
    
    // Deutsche Lokalisierung mit Euro-Symbol
    const formatter = new Intl.NumberFormat('de-DE', {
      style: showSymbol ? 'currency' : 'decimal',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    return formatter.format(numericValue);
  }

  /**
   * ERWEITERTE Number-Formatierung für deutsche Lokalisierung
   */
  private formatNumber(value: any, decimals: number = 0): string {
    let numericValue: number;
    
    if (value === null || value === undefined || value === '') {
      numericValue = 0;
    } else if (typeof value === 'string') {
      numericValue = parseFloat(value.replace(/[^\d.-]/g, ''));
      if (isNaN(numericValue)) numericValue = 0;
    } else if (typeof value === 'number') {
      numericValue = isNaN(value) ? 0 : value;
    } else {
      numericValue = 0;
    }
    
    const formatter = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    
    return formatter.format(numericValue);
  }

  /**
   * NEUE Funktion: Safe Value Extraction mit Fallback
   */
  private safeValue(value: any, fallback: any = 0): any {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    return value;
  }

  /**
   * Erstellt den Haupt-HTML-Inhalt für den täglichen Statusbericht
   */
  async composeEmail(data: DailyReportData, template?: EmailTemplates): Promise<{
    subject: string;
    html: string;
    text: string;
  }> {
    const subject = data.betreff || `📊 ${escapeText(data.template)} - ${this.formatDate(data.date)}`;
    
    const html = template?.html_template 
      ? this.renderCustomTemplate(template.html_template, data)
      : this.renderDefaultTemplate(data);
    
    const text = this.generateTextVersion(data);

    return { subject, html, text };
  }

  /**
   * Rendert ein benutzerdefiniertes Template mit umfassender Platzhalter-Unterstützung
   */
  private renderCustomTemplate(htmlTemplate: string, data: DailyReportData): string {
    try {
      let rendered = htmlTemplate;
      
      // BASIC REPLACEMENTS: Date, Time, Meta
      const currentDate = new Date();
      rendered = this.replaceVar(rendered, 'date', this.formatDate(data.date));
      rendered = this.replaceVar(rendered, 'time', currentDate.toLocaleTimeString('de-DE'));
      rendered = this.replaceVar(rendered, 'timestamp', currentDate.toLocaleString('de-DE'));
      rendered = this.replaceVar(rendered, 'next_report_time', '08:00 Uhr');
      
      // VERKÄUFE & PERFORMANCE - KORRIGIERT mit robuster Currency-Formatierung
      const verkäufe = safeObject(data.sections?.verkäufe, {});
      const salesCount = this.safeValue(verkäufe.anzahl_verkäufe, 0);
      const salesTotal = this.safeValue(verkäufe.umsatzsumme, 0);
      const salesAverage = salesCount > 0 ? (salesTotal / salesCount) : 0;
      
      rendered = this.replaceVar(rendered, 'sales_total', this.formatCurrency(salesTotal));
      rendered = this.replaceVar(rendered, 'sales_count', this.formatNumber(salesCount));
      rendered = this.replaceVar(rendered, 'sales_average', this.formatCurrency(salesAverage));
      
      // Top Produkte Details
      const topProductsHtml = this.renderTopProducts(safeArray(verkäufe.top_produkte, []));
      rendered = this.replaceVar(rendered, 'sales_details', topProductsHtml);
      
      // ERWEITERTE BESTELLUNGEN & LIEFERUNGEN
      const erweiterteBest = safeObject(data.sections?.erweiterte_bestellungen, {});
      
      rendered = this.replaceVar(rendered, 'erweiterte_bestellungen_heute_erwartet', 
        this.renderOrderDeliveries(safeArray(erweiterteBest.heute_erwartet, [])));
      rendered = this.replaceVar(rendered, 'erweiterte_bestellungen_verspaetet', 
        this.renderOrderDeliveries(safeArray(erweiterteBest.verspätet, [])));
      rendered = this.replaceVar(rendered, 'erweiterte_bestellungen_ausstehend', 
        this.renderOrderDeliveries(safeArray(erweiterteBest.diese_woche, [])));
      
      // Bestellungen Zusammenfassung - KORRIGIERT mit robuster Formatierung
      const bestZusammenfassung = safeObject(erweiterteBest.zusammenfassung, {});
      rendered = this.replaceVar(rendered, 'bestellungen_total_count', this.formatNumber(bestZusammenfassung.total_ausstehend));
      rendered = this.replaceVar(rendered, 'bestellungen_total_value', this.formatCurrency(bestZusammenfassung.total_wert_ausstehend));
      rendered = this.replaceVar(rendered, 'bestellungen_critical_delays', this.formatNumber(bestZusammenfassung.kritische_verspätungen));
      
      // AUTOMATEN-STATUS & ALERTS
      const automatenStatus = safeObject(data.sections?.automaten_status, {});
      
      rendered = this.replaceVar(rendered, 'automaten_status_hoher_geldbestand', 
        this.renderMachineAlerts(safeArray(automatenStatus.hoher_geldbestand, [])));
      rendered = this.replaceVar(rendered, 'automaten_status_muenzgeld_warnungen', 
        this.renderMachineAlerts(safeArray(automatenStatus.münzgeld_warnungen, [])));
      rendered = this.replaceVar(rendered, 'automaten_status_technische_anomalien', 
        this.renderMachineAlerts(safeArray(automatenStatus.technische_anomalien, [])));
      
      // Automaten Zusammenfassung - KORRIGIERT mit robuster Formatierung
      const automatZusammenfassung = safeObject(automatenStatus.zusammenfassung, {});
      rendered = this.replaceVar(rendered, 'automaten_alerts_total', this.formatNumber(automatZusammenfassung.total_alerts));
      rendered = this.replaceVar(rendered, 'automaten_betroffene', this.formatNumber(automatZusammenfassung.betroffene_automaten));
      rendered = this.replaceVar(rendered, 'automaten_kritische_alerts', this.formatNumber(automatZusammenfassung.kritische_alerts));
      
      // BESTÄNDE & LOGISTIK
      const beständeLogistik = safeObject(data.sections?.bestände_logistik, {});
      
      rendered = this.replaceVar(rendered, 'niedriger_lagerbestand', 
        this.renderLowStock(safeArray(beständeLogistik.niedriger_lagerbestand, [])));
      rendered = this.replaceVar(rendered, 'nachzubestellende_artikel', 
        this.renderReorderItems(safeArray(beständeLogistik.nachzubestellende_artikel, [])));
      rendered = this.replaceVar(rendered, 'bestaende_zusammenfassung', 
        this.renderInventorySummary(beständeLogistik));
      
      // MHD-WARNUNGEN
      const nahendesMhd = safeObject(beständeLogistik.nahendes_mhd, {});
      const mhdLager = safeObject(nahendesMhd.lager, {});
      
      rendered = this.replaceVar(rendered, 'mhd_kritisch', 
        this.renderMhdItems(safeArray(mhdLager['<5'], [])));
      rendered = this.replaceVar(rendered, 'mhd_warnung', 
        this.renderMhdItems(safeArray(mhdLager['<14'], [])));
      rendered = this.replaceVar(rendered, 'mhd_zusammenfassung', 
        this.renderMhdSummary(nahendesMhd));
      
      // WETTER & PROGNOSE
      const wetterDaten = safeObject(data.sections?.wetter_ferien_umsatz, {});
      
      // NEUE AUTOMATEN-ÜBERSICHT mit Füllstand, MHD, Verkäufen und Bargeld
      const automatenÜbersicht = safeArray(data.sections?.automaten_übersicht, []);
      rendered = this.replaceVar(rendered, 'automaten_uebersicht', this.renderMachineOverview(automatenÜbersicht));
      rendered = this.replaceVar(rendered, 'weather_data', this.renderWeatherData(wetterDaten));
      rendered = this.replaceVar(rendered, 'umsatz_prognose', this.renderSalesForecast(wetterDaten));
      
      // TAGES-ZUSAMMENFASSUNG
      rendered = this.replaceVar(rendered, 'tages_zusammenfassung', this.renderDailySummary(data));
      
      // LEGACY SUPPORT: Support legacy double-brace syntax for backwards compatibility
      rendered = this.replaceLegacyPlaceholders(rendered, data);
      
      return rendered;
    } catch (error) {
      console.error('Fehler beim Rendern des benutzerdefinierten Templates:', error);
      return this.renderDefaultTemplate(data);
    }
  }

  /**
   * NEUE Funktion: Rendert die detaillierte Automaten-Übersicht
   */
  private renderMachineOverview(machines: any[]): string {
    if (!machines || machines.length === 0) {
      return '<p style="color: black;">Keine Automaten-Daten verfügbar.</p>';
    }

    let html = `
      <div style="margin: 15px 0; color: black;">
        <h3 style="color: black; margin-bottom: 10px;">📊 Detaillierte Automaten-Übersicht</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; color: black;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left; color: black;">Automat</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: center; color: black;">Füllstand</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: center; color: black;">Nächstes MHD</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: center; color: black;">Gestriger Verkauf</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: center; color: black;">Bargeld-Bestand</th>
              </tr>
            </thead>
            <tbody>`;

    machines.forEach((machine: any) => {
      const mhdDate = machine.nächstes_mhd?.datum ? new Date(machine.nächstes_mhd.datum).toLocaleDateString('de-DE') : 'n/a';
      const mhdDays = machine.nächstes_mhd?.tage_bis_ablauf;
      const mhdColor = mhdDays && mhdDays <= 5 ? '#d32f2f' : mhdDays && mhdDays <= 14 ? '#f57c00' : 'black';
      const mhdText = mhdDays !== null ? `${mhdDate} (${mhdDays}d)` : mhdDate;
      
      html += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; color: black;">
            <strong>${escapeHtml(machine.automat_name || 'Unbekannt')}</strong>
          </td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; color: black;">
            ${this.formatNumber(machine.füllstand?.gesamt_produkte || 0)} Stk.<br>
            <small style="color: #666;">${this.formatNumber(machine.füllstand?.verschiedene_artikel || 0)} Artikel</small>
          </td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; color: ${mhdColor};">
            ${mhdText}<br>
            <small style="color: #666;">${escapeHtml(machine.nächstes_mhd?.produkt || 'n/a')}</small>
          </td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; color: black;">
            ${this.formatNumber(machine.gestriger_verkauf?.anzahl || 0)} Verkäufe<br>
            <small style="color: #666;">${this.formatCurrency(machine.gestriger_verkauf?.umsatz || 0)}</small>
          </td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; color: black;">
            ${this.formatCurrency(machine.bargeld_bestand || 0)}
          </td>
        </tr>`;
    });

    html += `
            </tbody>
          </table>
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 10px;">
          Bargeld-Bestand = Kumulierte Cash-Transaktionen der letzten 7 Tage
        </p>
      </div>`;

    return html;
  }

  /**
   * AKTUALISIERT: Standard-HTML-Template mit schwarzer Schriftfarbe und Automaten-Übersicht
   */
  private renderDefaultTemplate(data: DailyReportData): string {
    const verkäufe = safeObject(data.sections?.verkäufe, {});
    const beständeLogistik = safeObject(data.sections?.bestände_logistik, {});
    const automatenStatus = safeObject(data.sections?.automaten_status, {});
    const automatenÜbersicht = safeArray(data.sections?.automaten_übersicht, []);
    const wetterDaten = safeObject(data.sections?.wetter_ferien_umsatz, {});
    const erweiterteBest = safeObject(data.sections?.erweiterte_bestellungen, {});
    
    return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(data.template)}</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: black;
                background-color: #f5f5f5;
                margin: 0;
                padding: 20px;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                color: white;
                font-weight: 300;
            }
            .date {
                font-size: 14px;
                opacity: 0.9;
                margin-top: 5px;
            }
            .content {
                padding: 30px;
            }
            .section {
                margin-bottom: 30px;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 6px;
                border-left: 4px solid #667eea;
            }
            .section h2 {
                margin: 0 0 15px 0;
                color: #2c3e50;
                font-size: 18px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .sales-box {
                background: linear-gradient(135deg, #00b894, #00a085);
                color: white;
                padding: 20px;
                border-radius: 6px;
                margin-bottom: 15px;
            }
            .metric {
                display: inline-block;
                margin-right: 30px;
            }
            .metric-value {
                font-size: 24px;
                font-weight: bold;
                display: block;
            }
            .metric-label {
                font-size: 12px;
                opacity: 0.9;
            }
            .product-list {
                background: #fff;
                border-radius: 4px;
                padding: 15px;
                margin-top: 15px;
            }
            .product-item {
                padding: 8px 0;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
            }
            .product-item:last-child {
                border-bottom: none;
            }
            .alert-high {
                background-color: #ff6b6b;
                color: white;
                padding: 10px;
                border-radius: 4px;
                margin-bottom: 10px;
            }
            .alert-medium {
                background-color: #ffa500;
                color: white;
                padding: 10px;
                border-radius: 4px;
                margin-bottom: 10px;
            }
            .alert-low {
                background-color: #74b9ff;
                color: white;
                padding: 10px;
                border-radius: 4px;
                margin-bottom: 10px;
            }
            .alert-critical {
                background-color: #d63031;
                color: white;
                padding: 12px;
                border-radius: 4px;
                margin-bottom: 10px;
                border-left: 4px solid #a52a2a;
            }
            .delivery-status {
                display: inline-block;
                padding: 3px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
                margin-left: 8px;
            }
            .status-expected {
                background: #00b894;
                color: white;
            }
            .status-delayed {
                background: #fdcb6e;
                color: #2d3436;
            }
            .status-overdue {
                background: #e17055;
                color: white;
            }
            .machine-alert {
                background: #fff;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .machine-alert.severity-kritisch {
                border-left: 4px solid #d63031;
                background: #fff5f5;
            }
            .machine-alert.severity-hoch {
                border-left: 4px solid #e17055;
                background: #fff8f5;
            }
            .machine-alert.severity-mittel {
                border-left: 4px solid #fdcb6e;
                background: #fffef5;
            }
            .machine-alert.severity-niedrig {
                border-left: 4px solid #74b9ff;
                background: #f5f9ff;
            }
            .alert-value {
                font-weight: bold;
                font-size: 14px;
            }
            .summary-box {
                background: linear-gradient(135deg, #636e72, #2d3436);
                color: white;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 15px;
            }
            .summary-metric {
                display: inline-block;
                margin-right: 25px;
                text-align: center;
            }
            .summary-metric-value {
                font-size: 20px;
                font-weight: bold;
                display: block;
            }
            .summary-metric-label {
                font-size: 11px;
                opacity: 0.9;
            }
            .footer {
                text-align: center;
                padding: 20px;
                background: #f8f9fa;
                color: #666;
                font-size: 12px;
            }
            /* NEUE CSS-Klassen für Enhanced Monitoring */
            .enhanced-monitoring {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
            }
            .monitoring-subsection {
                background: rgba(255,255,255,0.1);
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 15px;
            }
            .monitoring-subsection h3 {
                margin-top: 0;
                color: #ffffff;
                border-bottom: 1px solid rgba(255,255,255,0.3);
                padding-bottom: 8px;
            }
            .risk-summary {
                display: flex;
                gap: 15px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            .risk-critical, .risk-high, .risk-medium {
                padding: 8px 12px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 14px;
            }
            .risk-critical {
                background: #d63031;
            }
            .risk-high {
                background: #e17055;
            }
            .risk-medium {
                background: #fdcb6e;
                color: #2d3436;
            }
            .mhd-analysis, .cash-monitoring, .card-payment-monitoring, .alcohol-monitoring {
                background: rgba(255,255,255,0.05);
                border-radius: 4px;
                padding: 12px;
            }
            .info-medium {
                background-color: #667eea;
                color: white;
                padding: 10px;
                border-radius: 4px;
                margin-bottom: 10px;
            }
            .link-button {
                display: inline-block;
                background: #667eea;
                color: white;
                padding: 10px 20px;
                text-decoration: none;
                border-radius: 4px;
                margin-top: 15px;
            }
            ul {
                list-style: none;
                padding-left: 0;
            }
            li {
                padding: 5px 0;
                border-bottom: 1px solid #eee;
            }
            li:last-child {
                border-bottom: none;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 ${escapeHtml(data.template)}</h1>
                <div class="date">${escapeHtml(this.formatDate(data.date))}</div>
            </div>
            
            <div class="content">
                ${this.renderSalesSection(data)}
                ${this.renderInventorySection(data)}
                ${data.sections.erweiterte_bestellungen ? this.renderEnhancedOrdersSection(data) : ''}
                ${data.sections.automaten_status ? this.renderMachineStatusSection(data) : ''}
                ${this.renderEnhancedMonitoringSection(data)}
                ${data.sections.wetter_ferien_umsatz ? this.renderWeatherSection(data) : ''}
                ${data.sections.offene_wareneingänge ? this.renderOpenOrdersSection(data) : ''}
                ${data.sections.agent_analyse ? this.renderAgentAnalysisSection(data) : ''}
                ${this.renderHinweiseSection(data)}
            </div>
            
            <div class="footer">
                <p>Automatisch generiert von Ihrem Proviantomat-System</p>
                <a href="${process.env.FRONTEND_URL || 'https://your-app.replit.app'}/dashboard" class="link-button">Zum Dashboard</a>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Rendert die Verkaufs-Sektion
   */
  private renderSalesSection(data: DailyReportData): string {
    const verkäufe = data.sections.verkäufe;
    
    return `
    <div class="section">
        <h2>💰 Verkäufe</h2>
        <div class="sales-box">
            <div class="metric">
                <span class="metric-value">${escapeHtml(verkäufe.anzahl_verkäufe)}</span>
                <span class="metric-label">Anzahl Verkäufe</span>
            </div>
            <div class="metric">
                <span class="metric-value">${escapeHtml(verkäufe.umsatzsumme.toFixed(2))} €</span>
                <span class="metric-label">Umsatzsumme</span>
            </div>
        </div>
        
        ${safeArray(verkäufe.top_produkte).length > 0 ? `
        <div class="product-list">
            <h3>🏆 Top-Produkte</h3>
            ${safeArray(verkäufe.top_produkte).map(product => `
                <div class="product-item">
                    <span><strong>${escapeHtml(product.name)}</strong></span>
                    <span>${escapeHtml(product.stückzahl)} Stück • ${escapeHtml(product.umsatz.toFixed(2))} €</span>
                </div>
            `).join('')}
        </div>
        ` : `
        <div class="info-low">
            ℹ️ Noch keine Verkaufsdaten für heute verfügbar
        </div>
        `}
    </div>
    `;
  }

  /**
   * Rendert die Bestände & Logistik-Sektion
   */
  private renderInventorySection(data: DailyReportData): string {
    const bestände = data.sections.bestände_logistik;
    
    return `
    <div class="section">
        <h2>📦 Bestände & Logistik</h2>
        
        ${safeArray(bestände.niedriger_lagerbestand).length > 0 ? `
        <div class="alert-high">
            <h3>⚠️ Niedriger Lagerbestand</h3>
            <ul>
                ${safeArray(bestände.niedriger_lagerbestand).map(item => 
                    `<li><strong>${escapeHtml(item.produkt)}</strong>: ${escapeHtml(item.bestand)} Stück (Schwellenwert: ${escapeHtml(item.schwellenwert)})</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${safeArray(bestände.nachzubestellende_artikel).length > 0 ? `
        <div class="alert-medium">
            <h3>🔄 Nachzubestellende Artikel</h3>
            <ul>
                ${safeArray(bestände.nachzubestellende_artikel).map(item => 
                    `<li><strong>${escapeHtml(item.produkt)}</strong> (${escapeHtml(item.priorität)}) - Empfohlen: ${escapeHtml(item.empfohlene_menge)} Stück</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${this.renderMHDSection(bestände.nahendes_mhd)}
    </div>
    `;
  }

  /**
   * Rendert die MHD-Sektion
   */
  private renderMHDSection(mhdData: any): string {
    const hasLagerMHD = mhdData.lager["<5"].length > 0 || mhdData.lager["<14"].length > 0 || mhdData.lager["<31"].length > 0;
    const hasAutomatenMHD = mhdData.automaten.length > 0;
    
    if (!hasLagerMHD && !hasAutomatenMHD) {
      return '<div class="alert-low">✅ Alle Produkte haben ausreichend lange MHD</div>';
    }
    
    return `
    <div class="alert-medium">
        <h3>📅 Produkte mit nahendem MHD</h3>
        
        ${mhdData.lager["<5"].length > 0 ? `
        <div style="margin-bottom: 15px;">
            <strong>Kritisch (&lt;5 Tage):</strong>
            <ul>
                ${safeArray(mhdData.lager["<5"]).map((item: any) => 
                    `<li>${escapeHtml(item.lager)}: <strong>${escapeHtml(item.produkt)}</strong> (${escapeHtml(item.anzahl)} Stück, MHD: ${escapeHtml(item.mhd)})</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${mhdData.lager["<14"].length > 0 ? `
        <div style="margin-bottom: 15px;">
            <strong>Warnung (&lt;14 Tage):</strong>
            <ul>
                ${safeArray(mhdData.lager["<14"]).map((item: any) => 
                    `<li>${escapeHtml(item.lager)}: <strong>${escapeHtml(item.produkt)}</strong> (${escapeHtml(item.anzahl)} Stück, MHD: ${escapeHtml(item.mhd)})</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${mhdData.automaten.length > 0 ? `
        <div>
            <strong>Automaten:</strong>
            <ul>
                ${safeArray(mhdData.automaten).map((item: any) => 
                    `<li>${escapeHtml(item.automat)}: <strong>${escapeHtml(item.produkt)}</strong> (${escapeHtml(item.anzahl)} Stück, MHD: ${escapeHtml(item.mhd)})</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
    </div>
    `;
  }

  /**
   * Rendert die Wetter-Sektion
   */
  private renderWeatherSection(data: DailyReportData): string {
    const wetter = data.sections.wetter_ferien_umsatz!;
    
    return `
    <div class="section">
        <h2>🌤️ Wetter & Prognose</h2>
        <div class="alert-low">
            <strong>${escapeHtml(wetter.standort)}:</strong> ${escapeHtml(wetter.heute.wetter)}
            <p><strong>Auswirkung:</strong> ${escapeHtml(wetter.auswirkung)}</p>
        </div>
        
        ${safeArray(wetter.heute.prognostizierter_umsatz).length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 15px;">
            <h4>💰 Prognostizierter Umsatz</h4>
            <ul>
                ${safeArray(wetter.heute.prognostizierter_umsatz).map(prognose => 
                    `<li><strong>${escapeHtml(prognose.automat)}</strong>: ${escapeHtml(prognose.wert)} €</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
    </div>
    `;
  }

  /**
   * Rendert die offenen Bestellungen
   */
  private renderOpenOrdersSection(data: DailyReportData): string {
    const bestellungen = data.sections.offene_wareneingänge!;
    
    if (bestellungen.length === 0) {
      return '';
    }
    
    return `
    <div class="section">
        <h2>📋 Offene Wareneingänge</h2>
        <ul>
            ${safeArray(bestellungen).map(bestellung => 
                `<li><strong>${escapeHtml(bestellung.lieferant)}</strong> (${escapeHtml(bestellung.bestelldatum)}): ${escapeHtml(bestellung.produkte.join(', '))}</li>`
            ).join('')}
        </ul>
    </div>
    `;
  }

  /**
   * NEUE FUNKTION: Rendert die erweiterten Monitoring-Systeme
   */
  private renderEnhancedMonitoringSection(data: DailyReportData): string {
    return `
    <div class="section enhanced-monitoring">
        <h2>🔍 Erweiterte Monitoring-Systeme</h2>
        
        <!-- MHD-Optimiertes Monitoring -->
        <div class="monitoring-subsection">
            <h3>📅 MHD-Risiko-Analyse</h3>
            ${this.renderMhdOptimizedMonitoring(data)}
        </div>
        
        <!-- Geld-Monitoring -->
        <div class="monitoring-subsection">
            <h3>💰 Geld-Monitoring</h3>
            ${this.renderCashMonitoring(data)}
        </div>
        
        <!-- Kartenzahlungs-Monitoring -->
        <div class="monitoring-subsection">
            <h3>💳 Kartenzahlungs-Status</h3>
            ${this.renderCardPaymentMonitoring(data)}
        </div>
        
        <!-- Alkohol-Compliance -->
        <div class="monitoring-subsection">
            <h3>🍺 Alkohol-Compliance</h3>
            ${this.renderAlcoholMonitoring(data)}
        </div>
    </div>
    `;
  }

  /**
   * Rendert MHD-optimierte Monitoring-Daten
   */
  private renderMhdOptimizedMonitoring(data: DailyReportData): string {
    const mhdData = data.sections?.bestände_logistik?.nahendes_mhd;
    if (!mhdData) return '<div class="info-low">ℹ️ Keine MHD-Daten verfügbar</div>';
    
    const kritisch = safeArray(mhdData.lager?.["<5"]);
    const hoch = safeArray(mhdData.lager?.["<14"]);
    const mittel = safeArray(mhdData.lager?.["<31"]);
    
    return `
    <div class="mhd-analysis">
        <div class="risk-summary">
            <span class="risk-critical">Kritisch: ${kritisch.length}</span>
            <span class="risk-high">Hoch: ${hoch.length}</span>
            <span class="risk-medium">Mittel: ${mittel.length}</span>
        </div>
        
        ${kritisch.length > 0 ? `
        <div class="alert-critical">
            <strong>🚨 Kritische MHD-Probleme (&lt;5 Tage):</strong>
            <ul>
                ${kritisch.map((item: any) => `
                <li>
                    <strong>${escapeHtml(item.produkt)}</strong> - ${escapeHtml(item.lager)}
                    <br>Anzahl: ${this.formatNumber(item.anzahl)} | MHD: ${escapeHtml(item.mhd)}
                    <br><em>Sofortige Abholung empfohlen</em>
                </li>
                `).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${hoch.length > 0 ? `
        <div class="alert-high">
            <strong>⚠️ Hohe MHD-Priorität (&lt;14 Tage):</strong>
            <ul>
                ${hoch.map((item: any) => `
                <li>
                    <strong>${escapeHtml(item.produkt)}</strong> - ${escapeHtml(item.lager)}
                    <br>Anzahl: ${this.formatNumber(item.anzahl)} | MHD: ${escapeHtml(item.mhd)}
                </li>
                `).join('')}
            </ul>
        </div>
        ` : ''}
    </div>
    `;
  }

  /**
   * Rendert Geld-Monitoring-Daten
   */
  private renderCashMonitoring(data: DailyReportData): string {
    const automatenStatus = data.sections?.automaten_status;
    const hoherGeldbestand = safeArray(automatenStatus?.hoher_geldbestand);
    
    if (hoherGeldbestand.length === 0) {
      return '<div class="info-low">✅ Alle Automaten haben normalen Geldbestand</div>';
    }
    
    return `
    <div class="cash-monitoring">
        <div class="alert-high">
            <strong>💰 Automaten mit hohem Geldbestand:</strong>
            <ul>
                ${hoherGeldbestand.map((machine: any) => `
                <li>
                    <strong>${escapeHtml(machine.automat)}</strong>
                    <br>Aktuell: ${this.formatCurrency(machine.aktueller_bestand)}
                    <br>Schwellenwert: ${this.formatCurrency(machine.schwellenwert)}
                    <br><em>Leerung ${escapeHtml(machine.priorität)}</em>
                </li>
                `).join('')}
            </ul>
        </div>
    </div>
    `;
  }

  /**
   * Rendert Kartenzahlungs-Monitoring-Daten
   */
  private renderCardPaymentMonitoring(data: DailyReportData): string {
    // Da Kartenzahlungs-Daten eventuell in unterschiedlichen Sektionen sind
    const technischeAnomalien = safeArray(data.sections?.automaten_status?.technische_anomalien);
    const cardPaymentIssues = technischeAnomalien.filter((anomalie: any) => 
      anomalie.problem?.toLowerCase().includes('karte') || 
      anomalie.problem?.toLowerCase().includes('payment')
    );
    
    if (cardPaymentIssues.length === 0) {
      return '<div class="info-low">✅ Kartenzahlungssysteme funktionieren normal</div>';
    }
    
    return `
    <div class="card-payment-monitoring">
        <div class="alert-medium">
            <strong>💳 Kartenzahlungs-Probleme:</strong>
            <ul>
                ${cardPaymentIssues.map((issue: any) => `
                <li>
                    <strong>${escapeHtml(issue.automat)}</strong>
                    <br>Problem: ${escapeHtml(issue.problem)}
                    <br>Seit: ${escapeHtml(issue.seit)}
                </li>
                `).join('')}
            </ul>
        </div>
    </div>
    `;
  }

  /**
   * Rendert Alkohol-Monitoring-Daten
   */
  private renderAlcoholMonitoring(data: DailyReportData): string {
    // Alkohol-Compliance wird über Verkaufsdaten analysiert
    const verkäufe = data.sections?.verkäufe;
    const topProdukte = safeArray(verkäufe?.top_produkte);
    
    const alkoholProdukte = topProdukte.filter((produkt: any) => 
      produkt.name?.toLowerCase().includes('bier') ||
      produkt.name?.toLowerCase().includes('wein') ||
      produkt.name?.toLowerCase().includes('schnaps') ||
      produkt.name?.toLowerCase().includes('alcohol')
    );
    
    if (alkoholProdukte.length === 0) {
      return '<div class="info-low">ℹ️ Keine Alkohol-Verkäufe heute registriert</div>';
    }
    
    return `
    <div class="alcohol-monitoring">
        <div class="info-medium">
            <strong>🍺 Alkohol-Verkäufe heute:</strong>
            <ul>
                ${alkoholProdukte.map((produkt: any) => `
                <li>
                    <strong>${escapeHtml(produkt.name)}</strong>
                    <br>Verkäufe: ${this.formatNumber(produkt.anzahl)} | Umsatz: ${this.formatCurrency(produkt.umsatz)}
                </li>
                `).join('')}
            </ul>
        </div>
    </div>
    `;
  }

  /**
   * Rendert die Agent-Analyse
   */
  private renderAgentAnalysisSection(data: DailyReportData): string {
    const analyse = data.sections.agent_analyse!;
    
    return `
    <div class="section">
        <h2>🤖 Agent-Analyse</h2>
        
        ${analyse.besondere_auffälligkeiten.length > 0 ? `
        <div class="alert-medium">
            <h4>⚠️ Besondere Auffälligkeiten</h4>
            <ul>
                ${analyse.besondere_auffälligkeiten.map(auffälligkeit => 
                    `<li>${auffälligkeit}</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${analyse.empfehlungen.length > 0 ? `
        <div class="alert-low">
            <h4>💡 Empfehlungen</h4>
            <ul>
                ${analyse.empfehlungen.map(empfehlung => 
                    `<li>${empfehlung}</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
    </div>
    `;
  }

  /**
   * Rendert die erweiterte Bestellungen & Lieferungen-Sektion
   */
  private renderEnhancedOrdersSection(data: DailyReportData): string {
    const bestellungen = data.sections.erweiterte_bestellungen!;
    
    return `
    <div class="section">
        <h2>🚚 Bestellungen & Lieferungen</h2>
        
        <div class="summary-box">
            <div class="summary-metric">
                <span class="summary-metric-value">${escapeHtml(bestellungen.zusammenfassung.total_ausstehend)}</span>
                <span class="summary-metric-label">Ausstehend</span>
            </div>
            <div class="summary-metric">
                <span class="summary-metric-value">${escapeHtml(bestellungen.zusammenfassung.total_wert_ausstehend.toFixed(2))} €</span>
                <span class="summary-metric-label">Gesamtwert</span>
            </div>
            <div class="summary-metric">
                <span class="summary-metric-value">${escapeHtml(bestellungen.zusammenfassung.kritische_verspätungen)}</span>
                <span class="summary-metric-label">Verspätungen</span>
            </div>
        </div>
        
        ${bestellungen.heute_erwartet.length > 0 ? `
        <div class="alert-low">
            <h4>📅 Heute erwartet</h4>
            ${bestellungen.heute_erwartet.map(order => `
                <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 4px; margin-bottom: 6px;">
                    <strong>${order.lieferant}</strong> (${order.bestellnummer})
                    <span class="delivery-status status-expected">Pünktlich</span>
                    <br><small>${order.produkte.join(', ')} • ${order.gesamtwert.toFixed(2)} €</small>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${bestellungen.diese_woche.length > 0 ? `
        <div class="alert-medium">
            <h4>📋 Diese Woche erwartet</h4>
            ${bestellungen.diese_woche.map(order => `
                <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 4px; margin-bottom: 6px;">
                    <strong>${order.lieferant}</strong> (${order.erwartetes_lieferdatum || 'TBD'})
                    <span class="delivery-status status-expected">Geplant</span>
                    <br><small>${order.produkte.join(', ')}</small>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${bestellungen.verspätet.length > 0 ? `
        <div class="alert-high">
            <h4>⚠️ Verspätete Lieferungen</h4>
            ${bestellungen.verspätet.map(order => `
                <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 4px; margin-bottom: 6px;">
                    <strong>${order.lieferant}</strong> (${order.bestellnummer})
                    <span class="delivery-status status-delayed">${order.verspätung_tage} Tage</span>
                    <br><small>Erwartet: ${order.erwartetes_lieferdatum}</small>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${bestellungen.nicht_geliefert.length > 0 ? `
        <div class="alert-critical">
            <h4>🚨 Nicht geliefert</h4>
            ${bestellungen.nicht_geliefert.map(order => `
                <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 4px; margin-bottom: 6px;">
                    <strong>${order.lieferant}</strong> (${order.bestelldatum})
                    <span class="delivery-status status-overdue">Überfällig</span>
                    <br><small>${order.produkte.join(', ')}</small>
                </div>
            `).join('')}
        </div>
        ` : ''}
    </div>
    `;
  }

  /**
   * Rendert die Automaten-Status & Anomalien-Sektion
   */
  private renderMachineStatusSection(data: DailyReportData): string {
    const status = data.sections.automaten_status!;
    
    return `
    <div class="section">
        <h2>🤖 Automaten-Status</h2>
        
        <div class="summary-box">
            <div class="summary-metric">
                <span class="summary-metric-value">${status.zusammenfassung.total_alerts}</span>
                <span class="summary-metric-label">Gesamt Alerts</span>
            </div>
            <div class="summary-metric">
                <span class="summary-metric-value">${status.zusammenfassung.kritische_alerts}</span>
                <span class="summary-metric-label">Kritisch</span>
            </div>
            <div class="summary-metric">
                <span class="summary-metric-value">${status.zusammenfassung.betroffene_automaten}</span>
                <span class="summary-metric-label">Betroffene Geräte</span>
            </div>
        </div>
        
        ${status.hoher_geldbestand.length > 0 ? `
        <div class="alert-medium">
            <h4>💰 Hoher Geldbestand</h4>
            ${status.hoher_geldbestand.map(alert => `
                <div class="machine-alert severity-${alert.schweregrad}">
                    <div>
                        <strong>${alert.automat}</strong><br>
                        <small>${alert.meldung}</small>
                    </div>
                    <div class="alert-value">
                        ${alert.wert}${alert.einheit || ''} / ${alert.grenzwert}${alert.einheit || ''}
                    </div>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${status.münzgeld_warnungen.length > 0 ? `
        <div class="alert-high">
            <h4>🪙 Münzgeld-Warnungen</h4>
            ${status.münzgeld_warnungen.map(alert => `
                <div class="machine-alert severity-${alert.schweregrad}">
                    <div>
                        <strong>${alert.automat}</strong><br>
                        <small>${alert.meldung}</small>
                    </div>
                    ${alert.wert ? `<div class="alert-value">${alert.wert}${alert.einheit || ''}</div>` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${status.technische_anomalien.length > 0 ? `
        <div class="alert-critical">
            <h4>🚨 Technische Anomalien</h4>
            ${status.technische_anomalien.map(alert => `
                <div class="machine-alert severity-${alert.schweregrad}">
                    <div>
                        <strong>${alert.automat}</strong><br>
                        <small>${alert.meldung}</small>
                    </div>
                    ${alert.dauer ? `<div class="alert-value">${alert.dauer}</div>` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${status.performance_abweichungen.length > 0 ? `
        <div class="alert-medium">
            <h4>📊 Performance-Abweichungen</h4>
            ${status.performance_abweichungen.map(alert => `
                <div class="machine-alert severity-${alert.schweregrad}">
                    <div>
                        <strong>${alert.automat}</strong><br>
                        <small>${alert.meldung}</small>
                    </div>
                    ${alert.wert ? `<div class="alert-value">${alert.wert}${alert.einheit || ''}</div>` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${status.zusammenfassung.total_alerts === 0 ? `
        <div class="alert-low">
            ✅ Alle Automaten funktionieren ordnungsgemäß
        </div>
        ` : ''}
    </div>
    `;
  }

  /**
   * Rendert die Hinweise-Sektion
   */
  private renderHinweiseSection(data: DailyReportData): string {
    return `
    <div class="section">
        <h2>💡 Hinweise</h2>
        <ul>
            ${safeArray(data.sections.hinweise).map(hinweis => 
                `<li>${escapeHtml(hinweis)}</li>`
            ).join('')}
        </ul>
    </div>
    `;
  }

  /**
   * Generiert eine Textversion der E-Mail
   */
  private generateTextVersion(data: DailyReportData): string {
    const lines: string[] = [];
    
    lines.push(`${escapeText(data.template)}`);
    lines.push(`Datum: ${escapeText(this.formatDate(data.date))}`);
    lines.push('');
    
    // Verkäufe
    lines.push('=== VERKÄUFE ===');
    lines.push(`Anzahl Verkäufe: ${escapeText(data.sections.verkäufe.anzahl_verkäufe)}`);
    lines.push(`Umsatzsumme: ${escapeText(data.sections.verkäufe.umsatzsumme.toFixed(2))} €`);
    lines.push('');
    
    if (data.sections.verkäufe.top_produkte.length > 0) {
      lines.push('Top-Produkte:');
      safeArray(data.sections.verkäufe.top_produkte).forEach(product => {
        lines.push(`- ${escapeText(product.name)}: ${escapeText(product.stückzahl)} Stück (${escapeText(product.umsatz.toFixed(2))} €)`);
      });
      lines.push('');
    }
    
    // Bestände & Logistik
    lines.push('=== BESTÄNDE & LOGISTIK ===');
    const bestände = data.sections.bestände_logistik;
    
    if (bestände.niedriger_lagerbestand.length > 0) {
      lines.push('Niedriger Lagerbestand:');
      safeArray(bestände.niedriger_lagerbestand).forEach(item => {
        lines.push(`- ${escapeText(item.produkt)}: ${escapeText(item.bestand)} Stück`);
      });
      lines.push('');
    }
    
    if (bestände.nachzubestellende_artikel.length > 0) {
      lines.push('Nachzubestellende Artikel:');
      safeArray(bestände.nachzubestellende_artikel).forEach(item => {
        lines.push(`- ${escapeText(item.produkt)} (${escapeText(item.priorität)}): ${escapeText(item.empfohlene_menge)} Stück empfohlen`);
      });
      lines.push('');
    }
    
    // Bestellungen & Lieferungen
    if (data.sections.erweiterte_bestellungen) {
      lines.push('=== BESTELLUNGEN & LIEFERUNGEN ===');
      const bestellungen = data.sections.erweiterte_bestellungen;
      lines.push(`Ausstehend: ${escapeText(bestellungen.zusammenfassung.total_ausstehend)}`);
      lines.push(`Gesamtwert: ${escapeText(bestellungen.zusammenfassung.total_wert_ausstehend.toFixed(2))} €`);
      lines.push(`Verspätungen: ${escapeText(bestellungen.zusammenfassung.kritische_verspätungen)}`);
      
      if (bestellungen.heute_erwartet.length > 0) {
        lines.push('Heute erwartet:');
        safeArray(bestellungen.heute_erwartet).forEach(order => {
          lines.push(`- ${escapeText(order.lieferant)} (${escapeText(order.bestellnummer)}): ${escapeText(order.produkte.join(', '))}`);
        });
      }
      
      if (bestellungen.verspätet.length > 0) {
        lines.push('Verspätete Lieferungen:');
        safeArray(bestellungen.verspätet).forEach(order => {
          lines.push(`- ${escapeText(order.lieferant)}: ${escapeText(order.verspätung_tage)} Tage verspätet`);
        });
      }
      lines.push('');
    }
    
    // Automaten-Status
    if (data.sections.automaten_status) {
      lines.push('=== AUTOMATEN-STATUS ===');
      const status = data.sections.automaten_status;
      lines.push(`Gesamt Alerts: ${status.zusammenfassung.total_alerts}`);
      lines.push(`Kritische Alerts: ${status.zusammenfassung.kritische_alerts}`);
      lines.push(`Betroffene Automaten: ${status.zusammenfassung.betroffene_automaten}`);
      
      if (status.hoher_geldbestand.length > 0) {
        lines.push('Hoher Geldbestand:');
        status.hoher_geldbestand.forEach(alert => {
          lines.push(`- ${alert.automat}: ${alert.meldung}`);
        });
      }
      
      if (status.technische_anomalien.length > 0) {
        lines.push('Technische Anomalien:');
        status.technische_anomalien.forEach(alert => {
          lines.push(`- ${alert.automat}: ${alert.meldung}`);
        });
      }
      lines.push('');
    }
    
    // Hinweise
    lines.push('=== HINWEISE ===');
    data.sections.hinweise.forEach(hinweis => {
      lines.push(`- ${hinweis}`);
    });
    
    lines.push('');
    lines.push('---');
    lines.push('Automatisch generiert von Ihrem Proviantomat-System');
    lines.push(`Dashboard: ${process.env.FRONTEND_URL || 'https://your-app.replit.app'}/dashboard`);
    
    return lines.join('\n');
  }

  /**
   * Formatiert ein Datum für die Anzeige
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  }

  // ============= COMPREHENSIVE TEMPLATE REPLACEMENT SYSTEM =============

  /**
   * Ersetzt eine Platzhalter-Variable im Template (single-brace syntax)
   */
  private replaceVar(template: string, varName: string, value: string): string {
    const regex = new RegExp(`{${varName}}`, 'g');
    return template.replace(regex, value || '');
  }

  /**
   * Rendert Top-Produkte als HTML-Liste
   */
  private renderTopProducts(products: any[]): string {
    if (!products || products.length === 0) {
      return '<p><em>Keine Top-Produkte-Daten verfügbar</em></p>';
    }

    return `
    <div class="product-list">
      ${products.map(product => `
        <div class="product-item">
          <span><strong>${escapeHtml(product.name)}</strong></span>
          <span>${escapeHtml(product.stückzahl)} Stück - ${escapeHtml(product.umsatz.toFixed(2))} €</span>
        </div>
      `).join('')}
    </div>`;
  }

  /**
   * Rendert Bestellungen/Lieferungen als HTML
   */
  private renderOrderDeliveries(orders: any[]): string {
    if (!orders || orders.length === 0) {
      return '<p><em>Keine Daten verfügbar</em></p>';
    }

    return orders.map(order => `
      <div class="delivery-item">
        <strong>${escapeHtml(order.lieferant)}</strong> - ${escapeHtml(order.bestellnummer)}<br>
        <small>Wert: ${escapeHtml(order.gesamtwert?.toFixed(2) || '0.00')} € | 
        ${order.verspätung_tage ? `${escapeHtml(order.verspätung_tage)} Tage verspätet` : 'Im Plan'}</small><br>
        <small>Produkte: ${escapeHtml(order.produkte?.join(', ') || 'Keine Angabe')}</small>
      </div>
    `).join('');
  }

  /**
   * Rendert Automaten-Alerts als HTML
   */
  private renderMachineAlerts(alerts: any[]): string {
    if (!alerts || alerts.length === 0) {
      return '<p><em>Keine Alerts</em></p>';
    }

    return alerts.map(alert => {
      const severityClass = `severity-${alert.schweregrad || 'niedrig'}`;
      return `
        <div class="machine-alert ${severityClass}">
          <div>
            <strong>${escapeHtml(alert.automat)}</strong><br>
            <span>${escapeHtml(alert.meldung)}</span>
          </div>
          <div class="alert-value">
            ${alert.wert ? `${escapeHtml(alert.wert.toString())} ${escapeHtml(alert.einheit || '')}` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Rendert niedrige Lagerbestände als HTML
   */
  private renderLowStock(items: any[]): string {
    if (!items || items.length === 0) {
      return '<p><em>Alle Bestände ausreichend</em></p>';
    }

    return `
    <div class="stock-alerts">
      ${items.map(item => `
        <div class="stock-alert">
          <strong>${escapeHtml(item.produkt)}</strong><br>
          <small>Bestand: ${escapeHtml(item.bestand)} | Schwellenwert: ${escapeHtml(item.schwellenwert)}</small>
        </div>
      `).join('')}
    </div>`;
  }

  /**
   * Rendert nachzubestellende Artikel als HTML
   */
  private renderReorderItems(items: any[]): string {
    if (!items || items.length === 0) {
      return '<p><em>Keine Nachbestellungen erforderlich</em></p>';
    }

    return items.map(item => `
      <div class="reorder-item">
        <strong>${escapeHtml(item.produkt)}</strong> 
        <span class="priority-${item.priorität?.toLowerCase() || 'normal'}">(${escapeHtml(item.priorität || 'Normal')})</span><br>
        <small>Empfohlen: ${escapeHtml(item.empfohlene_menge)} Stück | 
        Abverkauf: ${escapeHtml(item.abverkaufsgeschwindigkeit || 'Unbekannt')}</small>
      </div>
    `).join('');
  }

  /**
   * Rendert Bestände-Zusammenfassung
   */
  private renderInventorySummary(inventory: any): string {
    if (!inventory) {
      return '<p><em>Keine Inventar-Daten verfügbar</em></p>';
    }

    const lowStock = safeArray(inventory.niedriger_lagerbestand).length;
    const reorderItems = safeArray(inventory.nachzubestellende_artikel).length;

    return `
    <p><strong>Niedrige Bestände:</strong> ${lowStock} Artikel</p>
    <p><strong>Nachbestellungen:</strong> ${reorderItems} Artikel</p>
    `;
  }

  /**
   * Rendert MHD-Items als HTML
   */
  private renderMhdItems(items: any[]): string {
    if (!items || items.length === 0) {
      return '<p><em>Keine kritischen MHD-Warnungen</em></p>';
    }

    return items.map(item => `
      <div class="mhd-item">
        <strong>${escapeHtml(item.produkt)}</strong><br>
        <small>${escapeHtml(item.anzahl)} Stück | MHD: ${escapeHtml(item.mhd)} | 
        Ort: ${escapeHtml(item.lager || item.automat || 'Unbekannt')}</small>
      </div>
    `).join('');
  }

  /**
   * Rendert MHD-Zusammenfassung
   */
  private renderMhdSummary(mhdData: any): string {
    if (!mhdData) {
      return '<p><em>Keine MHD-Daten verfügbar</em></p>';
    }

    const lager = safeObject(mhdData.lager);
    const kritisch = safeArray(lager['<5']).length;
    const warnung = safeArray(lager['<14']).length;
    const automaten = safeArray(mhdData.automaten).length;

    return `
    <p><strong>Kritisch (&lt; 5 Tage):</strong> ${kritisch} Artikel</p>
    <p><strong>Warnung (&lt; 14 Tage):</strong> ${warnung} Artikel</p>
    <p><strong>Automaten betroffen:</strong> ${automaten} Artikel</p>
    `;
  }

  /**
   * Rendert Wetter-Daten
   */
  private renderWeatherData(weatherData: any): string {
    if (!weatherData || !weatherData.heute) {
      return '<p><em>Keine Wetter-Daten verfügbar</em></p>';
    }

    const heute = weatherData.heute;
    return `
    <p><strong>Wetter heute:</strong> ${escapeHtml(heute.wetter)} | 
    <strong>Temperatur:</strong> ${escapeHtml(heute.temperatur)} | 
    <strong>Regenwahrscheinlichkeit:</strong> ${escapeHtml(heute.regenwahrscheinlichkeit)}</p>
    <p><strong>Standort:</strong> ${escapeHtml(weatherData.standort)}</p>
    ${weatherData.auswirkung ? `<p><strong>Auswirkung:</strong> ${escapeHtml(weatherData.auswirkung)}</p>` : ''}
    `;
  }

  /**
   * Rendert Umsatz-Prognose
   */
  private renderSalesForecast(weatherData: any): string {
    if (!weatherData?.heute?.prognostizierter_umsatz) {
      return '<p><em>Keine Umsatz-Prognose verfügbar</em></p>';
    }

    const prognose = weatherData.heute.prognostizierter_umsatz;
    const gesamtprognose = prognose.reduce((sum: number, p: any) => sum + (p.wert || 0), 0);

    return `
    <p><strong>Prognostizierter Tagesumsatz:</strong> ${gesamtprognose.toFixed(2)} €</p>
    <div class="forecast-details">
      ${prognose.map((p: any) => `
        <small>${escapeHtml(p.automat)}: ${escapeHtml(p.wert?.toFixed(2) || '0.00')} €</small><br>
      `).join('')}
    </div>
    `;
  }

  /**
   * Rendert Tages-Zusammenfassung
   */
  private renderDailySummary(data: DailyReportData): string {
    const verkäufe = safeObject(data.sections?.verkäufe);
    const bestellungen = safeObject(data.sections?.erweiterte_bestellungen?.zusammenfassung);
    const alerts = safeObject(data.sections?.automaten_status?.zusammenfassung);

    return `
    <p><strong>Verkäufe heute:</strong> ${verkäufe.anzahl_verkäufe || 0} (${(verkäufe.umsatzsumme || 0).toFixed(2)} €)</p>
    <p><strong>Ausstehende Bestellungen:</strong> ${bestellungen.total_ausstehend || 0} (${(bestellungen.total_wert_ausstehend || 0).toFixed(2)} €)</p>
    <p><strong>Aktive Alerts:</strong> ${alerts.total_alerts || 0} (${alerts.kritische_alerts || 0} kritisch)</p>
    <p><strong>Status:</strong> ${this.calculateOverallStatus(data)}</p>
    `;
  }

  /**
   * Berechnet den Gesamt-Status des Systems
   */
  private calculateOverallStatus(data: DailyReportData): string {
    const alerts = safeObject(data.sections?.automaten_status?.zusammenfassung);
    const bestellungen = safeObject(data.sections?.erweiterte_bestellungen?.zusammenfassung);
    
    const kritischeAlerts = alerts.kritische_alerts || 0;
    const verspätungen = bestellungen.kritische_verspätungen || 0;

    if (kritischeAlerts > 0 || verspätungen > 0) {
      return '<span class="alert-high">Aufmerksamkeit erforderlich</span>';
    }
    
    if (alerts.total_alerts > 5) {
      return '<span class="alert-medium">Überwachung empfohlen</span>';
    }

    return '<span class="alert-low">System läuft stabil</span>';
  }

  /**
   * Legacy-Support: Unterstützt alte double-brace Syntax für Rückwärtskompatibilität
   */
  private replaceLegacyPlaceholders(template: string, data: DailyReportData): string {
    let rendered = template;
    
    // Legacy double-brace support
    rendered = rendered.replace(/{{date}}/g, escapeHtml(this.formatDate(data.date)));
    rendered = rendered.replace(/{{template}}/g, escapeHtml(data.template));
    rendered = rendered.replace(/{{anzahl_verkäufe}}/g, data.sections.verkäufe.anzahl_verkäufe.toString());
    rendered = rendered.replace(/{{umsatzsumme}}/g, data.sections.verkäufe.umsatzsumme.toFixed(2));
    
    // Legacy top products list
    if (rendered.includes('{{top_produkte_liste}}')) {
      const produkteHtml = safeArray(data.sections.verkäufe.top_produkte)
        .map(product => `<li><strong>${escapeHtml(product.name)}:</strong> ${escapeHtml(product.stückzahl)} Stück (${escapeHtml(product.umsatz.toFixed(2))} €)</li>`)
        .join('');
      rendered = rendered.replace(/{{top_produkte_liste}}/g, produkteHtml);
    }
    
    return rendered;
  }
}