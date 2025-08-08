/**
 * Email Composer Service für tägliche E-Mail-Benachrichtigungen
 * Komponiert HTML-E-Mails basierend auf Templates und Daten
 */
import { DailyReportData } from './dailyEmailDataAggregator';
import { EmailTemplates } from '@shared/schema';

export class DailyEmailComposer {
  /**
   * Erstellt den Haupt-HTML-Inhalt für den täglichen Statusbericht
   */
  async composeEmail(data: DailyReportData, template?: EmailTemplates): Promise<{
    subject: string;
    html: string;
    text: string;
  }> {
    const subject = `📊 ${data.template} - ${this.formatDate(data.date)}`;
    
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
      // In einer erweiterten Version könnte hier Handlebars oder ähnliches verwendet werden
      let rendered = htmlTemplate;
      
      // Ersetze grundlegende Variablen
      rendered = rendered.replace(/{{date}}/g, this.formatDate(data.date));
      rendered = rendered.replace(/{{template}}/g, data.template);
      
      // Ersetze Sektionen
      rendered = rendered.replace(/{{umsatz_gesamt}}/g, data.sections.rückblick.umsatz_gesamt.toFixed(2));
      rendered = rendered.replace(/{{netto_ergebnis}}/g, data.sections.rückblick.netto_ergebnis.toFixed(2));
      
      // Füge Listen hinzu
      if (rendered.includes('{{anomalien_liste}}')) {
        const anomalienHtml = data.sections.automaten_anomalien
          .map(anomaly => `<li><strong>${anomaly.automat}:</strong> ${anomaly.meldung}</li>`)
          .join('');
        rendered = rendered.replace(/{{anomalien_liste}}/g, anomalienHtml);
      }
      
      return rendered;
    } catch (error) {
      console.error('Fehler beim Rendern des benutzerdefinierten Templates:', error);
      return this.renderDefaultTemplate(data);
    }
  }

  /**
   * Rendert das Standard-HTML-Template
   */
  private renderDefaultTemplate(data: DailyReportData): string {
    return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.template}</title>
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
            .weather-box {
                background: linear-gradient(135deg, #74b9ff, #0984e3);
                color: white;
                padding: 20px;
                border-radius: 8px;
                margin: 15px 0;
            }
            .forecast-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
                gap: 10px;
                margin-top: 15px;
            }
            .forecast-day {
                background: rgba(255,255,255,0.2);
                padding: 10px;
                border-radius: 4px;
                text-align: center;
                font-size: 12px;
            }
            .sales-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            .sales-card {
                background: white;
                padding: 15px;
                border-radius: 6px;
                border: 1px solid #e0e6ed;
                text-align: center;
            }
            .amount {
                font-size: 24px;
                font-weight: bold;
                color: #27ae60;
            }
            .mhd-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
            }
            .mhd-table th,
            .mhd-table td {
                padding: 10px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            .mhd-table th {
                background: #f1f3f4;
                font-weight: 600;
            }
            .urgent { color: #e74c3c; font-weight: bold; }
            .warning { color: #f39c12; font-weight: bold; }
            .normal { color: #27ae60; }
            .anomaly {
                background: #fff5f5;
                border-left: 4px solid #e53e3e;
                padding: 12px;
                margin: 8px 0;
                border-radius: 4px;
            }
            .anomaly strong {
                color: #c53030;
            }
            .summary-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin: 20px 0;
            }
            .stat-card {
                background: white;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #e0e6ed;
                text-align: center;
            }
            .stat-value {
                font-size: 28px;
                font-weight: bold;
                color: #2c3e50;
            }
            .stat-label {
                font-size: 14px;
                color: #7f8c8d;
                margin-top: 5px;
            }
            .hints {
                background: #fff8e1;
                border-left: 4px solid #ffa726;
                padding: 15px;
                border-radius: 4px;
                margin-top: 20px;
            }
            .footer {
                background: #34495e;
                color: #ecf0f1;
                padding: 20px;
                text-align: center;
                font-size: 12px;
            }
            ul { margin: 10px 0; padding-left: 20px; }
            li { margin: 5px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${data.template}</h1>
                <div class="date">${this.formatDate(data.date)}</div>
            </div>
            
            <div class="content">
                <!-- Wetter & Umsatzprognose -->
                <div class="section">
                    <h2>🌤️ Wetter & Umsatzprognose</h2>
                    <div class="weather-box">
                        <h3>Heute in ${data.sections.wetter_ferien_umsatz.standort}</h3>
                        <p><strong>${data.sections.wetter_ferien_umsatz.heute.wetter}</strong></p>
                        
                        <div class="sales-grid">
                            ${data.sections.wetter_ferien_umsatz.heute.prognostizierter_umsatz
                              .map(sale => `
                                <div class="sales-card">
                                    <div>${sale.automat}</div>
                                    <div class="amount">${sale.wert}€</div>
                                </div>
                              `).join('')}
                        </div>
                    </div>
                    
                    <div class="forecast-grid">
                        ${data.sections.wetter_ferien_umsatz.wettervorschau
                          .map(day => `
                            <div class="forecast-day">
                                <div><strong>${day.tag}</strong></div>
                                <div>${day.temperatur}</div>
                                <div>${day.wetter}</div>
                                <div style="font-size: 10px; margin-top: 5px;">${day.bemerkung}</div>
                            </div>
                          `).join('')}
                    </div>
                    
                    <p style="margin-top: 15px; font-style: italic;">
                        ${data.sections.wetter_ferien_umsatz.auswirkung}
                    </p>
                </div>

                <!-- Tagesrückblick -->
                <div class="section">
                    <h2>📈 Tagesrückblick</h2>
                    <div class="summary-stats">
                        <div class="stat-card">
                            <div class="stat-value">${data.sections.rückblick.umsatz_gesamt.toFixed(2)}€</div>
                            <div class="stat-label">Gesamtumsatz</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.sections.rückblick.netto_ergebnis.toFixed(2)}€</div>
                            <div class="stat-label">Nettoegebnis</div>
                        </div>
                    </div>
                    
                    ${data.sections.rückblick.entnahmen.length > 0 ? `
                        <h3>🔄 Entnahmen/Nachfüllungen</h3>
                        ${data.sections.rückblick.entnahmen
                          .map(entnahme => `
                            <div style="margin: 10px 0; padding: 10px; background: white; border-radius: 4px;">
                                <strong>${entnahme.automat}:</strong> ${entnahme.produkte.join(', ')}
                            </div>
                          `).join('')}
                    ` : ''}
                </div>

                <!-- MHD Übersicht -->
                <div class="section">
                    <h2>⏰ MHD-Übersicht</h2>
                    
                    ${this.renderMHDSection('🚨 Kritisch (<5 Tage)', data.sections.mhd_lager["<5"], 'urgent')}
                    ${this.renderMHDSection('⚠️ Bald ablaufend (<14 Tage)', data.sections.mhd_lager["<14"], 'warning')}
                    ${this.renderMHDSection('📅 Überwachen (<31 Tage)', data.sections.mhd_lager["<31"], 'normal')}
                    
                    ${data.sections.mhd_automaten.length > 0 ? `
                        <h3>🏪 MHD in Automaten</h3>
                        <table class="mhd-table">
                            <thead>
                                <tr>
                                    <th>Automat</th>
                                    <th>Produkt</th>
                                    <th>Anzahl</th>
                                    <th>MHD</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.sections.mhd_automaten
                                  .map(item => `
                                    <tr>
                                        <td>${item.automat}</td>
                                        <td>${item.produkt}</td>
                                        <td>${item.anzahl}</td>
                                        <td class="${this.getMHDClass(item.mhd)}">${this.formatDate(item.mhd)}</td>
                                    </tr>
                                  `).join('')}
                            </tbody>
                        </table>
                    ` : ''}
                </div>

                <!-- Niedriger Lagerbestand -->
                ${data.sections.niedriger_lagerbestand.length > 0 ? `
                    <div class="section">
                        <h2>📦 Niedriger Lagerbestand</h2>
                        <table class="mhd-table">
                            <thead>
                                <tr>
                                    <th>Produkt</th>
                                    <th>Aktueller Bestand</th>
                                    <th>Sollbestand</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.sections.niedriger_lagerbestand
                                  .map(item => `
                                    <tr>
                                        <td>${item.produkt}</td>
                                        <td>${item.bestand}</td>
                                        <td>${item.bedarf}</td>
                                        <td class="${item.bestand < item.bedarf * 0.5 ? 'urgent' : 'warning'}">
                                            ${item.bestand < item.bedarf * 0.5 ? '🚨 Kritisch' : '⚠️ Niedrig'}
                                        </td>
                                    </tr>
                                  `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <!-- Offene Wareneingänge -->
                ${data.sections.offene_wareneingänge.length > 0 ? `
                    <div class="section">
                        <h2>📋 Offene Wareneingänge</h2>
                        ${data.sections.offene_wareneingänge
                          .map(order => `
                            <div style="margin: 10px 0; padding: 15px; background: white; border-radius: 4px; border-left: 4px solid #3498db;">
                                <strong>Lieferant:</strong> ${order.lieferant}<br>
                                <strong>Bestelldatum:</strong> ${this.formatDate(order.bestelldatum)}<br>
                                <strong>Produkte:</strong> ${order.produkte.join(', ')}
                            </div>
                          `).join('')}
                    </div>
                ` : ''}

                <!-- Automaten-Anomalien -->
                ${data.sections.automaten_anomalien.length > 0 ? `
                    <div class="section">
                        <h2>🚨 Automaten-Anomalien</h2>
                        ${data.sections.automaten_anomalien
                          .map(anomaly => `
                            <div class="anomaly">
                                <strong>${anomaly.automat}:</strong> ${anomaly.meldung}
                            </div>
                          `).join('')}
                    </div>
                ` : ''}

                <!-- Hinweise -->
                ${data.sections.hinweise.length > 0 ? `
                    <div class="hints">
                        <h3>💡 Hinweise für heute</h3>
                        <ul>
                            ${data.sections.hinweise.map(hint => `<li>${hint}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
            
            <div class="footer">
                <p>📧 Automatisch generierter Tagesbericht vom Warenwirtschaftssystem</p>
                <p>Generiert am ${new Date().toLocaleString('de-DE')}</p>
            </div>
        </div>
    </body>
    </html>`;
  }

  /**
   * Rendert eine MHD-Sektion
   */
  private renderMHDSection(title: string, items: any[], cssClass: string): string {
    if (items.length === 0) return '';
    
    return `
      <h3>${title}</h3>
      <table class="mhd-table">
          <thead>
              <tr>
                  <th>Lager</th>
                  <th>Produkt</th>
                  <th>Anzahl</th>
                  <th>MHD</th>
              </tr>
          </thead>
          <tbody>
              ${items
                .map(item => `
                  <tr>
                      <td>${item.lager}</td>
                      <td>${item.produkt}</td>
                      <td>${item.anzahl}</td>
                      <td class="${cssClass}">${this.formatDate(item.mhd)}</td>
                  </tr>
                `).join('')}
          </tbody>
      </table>
    `;
  }

  /**
   * Bestimmt CSS-Klasse basierend auf MHD
   */
  private getMHDClass(mhdDate: string): string {
    const today = new Date();
    const mhd = new Date(mhdDate);
    const daysDiff = Math.ceil((mhd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 5) return 'urgent';
    if (daysDiff <= 14) return 'warning';
    return 'normal';
  }

  /**
   * Generiert eine Textversion der E-Mail
   */
  private generateTextVersion(data: DailyReportData): string {
    return `
${data.template}
${this.formatDate(data.date)}

===========================================

WETTER & UMSATZPROGNOSE
Standort: ${data.sections.wetter_ferien_umsatz.standort}
Heute: ${data.sections.wetter_ferien_umsatz.heute.wetter}

Prognostizierter Umsatz:
${data.sections.wetter_ferien_umsatz.heute.prognostizierter_umsatz
  .map(sale => `- ${sale.automat}: ${sale.wert}€`)
  .join('\n')}

Wettervorschau:
${data.sections.wetter_ferien_umsatz.wettervorschau
  .map(day => `${day.tag}: ${day.temperatur}, ${day.wetter} (${day.bemerkung})`)
  .join('\n')}

${data.sections.wetter_ferien_umsatz.auswirkung}

===========================================

TAGESRÜCKBLICK
Gesamtumsatz: ${data.sections.rückblick.umsatz_gesamt.toFixed(2)}€
Netto-Ergebnis: ${data.sections.rückblick.netto_ergebnis.toFixed(2)}€

${data.sections.rückblick.entnahmen.length > 0 ? `
Entnahmen/Nachfüllungen:
${data.sections.rückblick.entnahmen
  .map(entnahme => `- ${entnahme.automat}: ${entnahme.produkte.join(', ')}`)
  .join('\n')}
` : ''}

===========================================

${data.sections.automaten_anomalien.length > 0 ? `
AUTOMATEN-ANOMALIEN
${data.sections.automaten_anomalien
  .map(anomaly => `- ${anomaly.automat}: ${anomaly.meldung}`)
  .join('\n')}

===========================================
` : ''}

${data.sections.hinweise.length > 0 ? `
HINWEISE
${data.sections.hinweise.map(hint => `- ${hint}`).join('\n')}

===========================================
` : ''}

Automatisch generiert am ${new Date().toLocaleString('de-DE')}
`;
  }

  /**
   * Formatiert ein Datum für die Anzeige
   */
  private formatDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}