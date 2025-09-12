/**
 * Email Composer Service für tägliche E-Mail-Benachrichtigungen
 * Komponiert HTML-E-Mails basierend auf Proviantomat-Datenstruktur
 */
import { DailyReportData } from './dailyEmailDataAggregator';
import { EmailTemplates } from '@shared/schema';
import { escapeHtml, escapeText, safeArray, safeObject } from '../utils/stringUtils';

export class DailyEmailComposer {
  /**
   * Erstellt den Haupt-HTML-Inhalt für den täglichen Statusbericht
   */
  async composeEmail(data: DailyReportData, template?: EmailTemplates): Promise<{
    subject: string;
    html: string;
    text: string;
  }> {
    const subject = data.betreff || `📊 ${escapeText(data.template)} - ${this.formatDate(data.date)}`;
    
    const html = template?.htmlTemplate 
      ? this.renderCustomTemplate(template.htmlTemplate, data)
      : this.renderDefaultTemplate(data);
    
    const text = this.generateTextVersion(data);

    return { subject, html, text };
  }

  /**
   * Rendert ein benutzerdefiniertes Template
   */
  private renderCustomTemplate(htmlTemplate: string, data: DailyReportData): string {
    try {
      // Einfache Template-Variable-Ersetzung
      let rendered = htmlTemplate;
      
      // Ersetze grundlegende Variablen
      rendered = rendered.replace(/{{date}}/g, escapeHtml(this.formatDate(data.date)));
      rendered = rendered.replace(/{{template}}/g, escapeHtml(data.template));
      
      // Ersetze Verkaufsdaten
      rendered = rendered.replace(/{{anzahl_verkäufe}}/g, data.sections.verkäufe.anzahl_verkäufe.toString());
      rendered = rendered.replace(/{{umsatzsumme}}/g, data.sections.verkäufe.umsatzsumme.toFixed(2));
      
      // Füge Listen hinzu
      if (rendered.includes('{{top_produkte_liste}}')) {
        const produkteHtml = safeArray(data.sections.verkäufe.top_produkte)
          .map(product => `<li><strong>${escapeHtml(product.name)}:</strong> ${escapeHtml(product.stückzahl)} Stück (${escapeHtml(product.umsatz.toFixed(2))} €)</li>`)
          .join('');
        rendered = rendered.replace(/{{top_produkte_liste}}/g, produkteHtml);
      }
      
      return rendered;
    } catch (error) {
      console.error('Fehler beim Rendern des benutzerdefinierten Templates:', error);
      return this.renderDefaultTemplate(data);
    }
  }

  /**
   * Rendert das Standard-HTML-Template für Proviantomat-Berichte
   */
  private renderDefaultTemplate(data: DailyReportData): string {
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
                color: #333;
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
}