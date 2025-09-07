/**
 * Email Composer Service für tägliche E-Mail-Benachrichtigungen
 * Komponiert HTML-E-Mails basierend auf Proviantomat-Datenstruktur
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
    const subject = data.betreff || `📊 ${data.template} - ${this.formatDate(data.date)}`;
    
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
      rendered = rendered.replace(/{{date}}/g, this.formatDate(data.date));
      rendered = rendered.replace(/{{template}}/g, data.template);
      
      // Ersetze Verkaufsdaten
      rendered = rendered.replace(/{{anzahl_verkäufe}}/g, data.sections.verkäufe.anzahl_verkäufe.toString());
      rendered = rendered.replace(/{{umsatzsumme}}/g, data.sections.verkäufe.umsatzsumme.toFixed(2));
      
      // Füge Listen hinzu
      if (rendered.includes('{{top_produkte_liste}}')) {
        const produkteHtml = data.sections.verkäufe.top_produkte
          .map(product => `<li><strong>${product.name}:</strong> ${product.stückzahl} Stück (${product.umsatz.toFixed(2)} €)</li>`)
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
                <h1>📊 ${data.template}</h1>
                <div class="date">${this.formatDate(data.date)}</div>
            </div>
            
            <div class="content">
                ${this.renderSalesSection(data)}
                ${this.renderInventorySection(data)}
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
                <span class="metric-value">${verkäufe.anzahl_verkäufe}</span>
                <span class="metric-label">Anzahl Verkäufe</span>
            </div>
            <div class="metric">
                <span class="metric-value">${verkäufe.umsatzsumme.toFixed(2)} €</span>
                <span class="metric-label">Umsatzsumme</span>
            </div>
        </div>
        
        ${verkäufe.top_produkte.length > 0 ? `
        <div class="product-list">
            <h3>🏆 Top-Produkte</h3>
            ${verkäufe.top_produkte.map(product => `
                <div class="product-item">
                    <span><strong>${product.name}</strong></span>
                    <span>${product.stückzahl} Stück • ${product.umsatz.toFixed(2)} €</span>
                </div>
            `).join('')}
        </div>
        ` : ''}
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
        
        ${bestände.niedriger_lagerbestand.length > 0 ? `
        <div class="alert-high">
            <h3>⚠️ Niedriger Lagerbestand</h3>
            <ul>
                ${bestände.niedriger_lagerbestand.map(item => 
                    `<li><strong>${item.produkt}</strong>: ${item.bestand} Stück (Schwellenwert: ${item.schwellenwert})</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${bestände.nachzubestellende_artikel.length > 0 ? `
        <div class="alert-medium">
            <h3>🔄 Nachzubestellende Artikel</h3>
            <ul>
                ${bestände.nachzubestellende_artikel.map(item => 
                    `<li><strong>${item.produkt}</strong> (${item.priorität}) - Empfohlen: ${item.empfohlene_menge} Stück</li>`
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
                ${mhdData.lager["<5"].map((item: any) => 
                    `<li>${item.lager}: <strong>${item.produkt}</strong> (${item.anzahl} Stück, MHD: ${item.mhd})</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${mhdData.lager["<14"].length > 0 ? `
        <div style="margin-bottom: 15px;">
            <strong>Warnung (&lt;14 Tage):</strong>
            <ul>
                ${mhdData.lager["<14"].map((item: any) => 
                    `<li>${item.lager}: <strong>${item.produkt}</strong> (${item.anzahl} Stück, MHD: ${item.mhd})</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${mhdData.automaten.length > 0 ? `
        <div>
            <strong>Automaten:</strong>
            <ul>
                ${mhdData.automaten.map((item: any) => 
                    `<li>${item.automat}: <strong>${item.produkt}</strong> (${item.anzahl} Stück, MHD: ${item.mhd})</li>`
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
            <strong>${wetter.standort}:</strong> ${wetter.heute.wetter}
            <p><strong>Auswirkung:</strong> ${wetter.auswirkung}</p>
        </div>
        
        ${wetter.heute.prognostizierter_umsatz.length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 15px;">
            <h4>💰 Prognostizierter Umsatz</h4>
            <ul>
                ${wetter.heute.prognostizierter_umsatz.map(prognose => 
                    `<li><strong>${prognose.automat}</strong>: ${prognose.wert} €</li>`
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
            ${bestellungen.map(bestellung => 
                `<li><strong>${bestellung.lieferant}</strong> (${bestellung.bestelldatum}): ${bestellung.produkte.join(', ')}</li>`
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
   * Rendert die Hinweise-Sektion
   */
  private renderHinweiseSection(data: DailyReportData): string {
    return `
    <div class="section">
        <h2>💡 Hinweise</h2>
        <ul>
            ${data.sections.hinweise.map(hinweis => 
                `<li>${hinweis}</li>`
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
    
    lines.push(`${data.template}`);
    lines.push(`Datum: ${this.formatDate(data.date)}`);
    lines.push('');
    
    // Verkäufe
    lines.push('=== VERKÄUFE ===');
    lines.push(`Anzahl Verkäufe: ${data.sections.verkäufe.anzahl_verkäufe}`);
    lines.push(`Umsatzsumme: ${data.sections.verkäufe.umsatzsumme.toFixed(2)} €`);
    lines.push('');
    
    if (data.sections.verkäufe.top_produkte.length > 0) {
      lines.push('Top-Produkte:');
      data.sections.verkäufe.top_produkte.forEach(product => {
        lines.push(`- ${product.name}: ${product.stückzahl} Stück (${product.umsatz.toFixed(2)} €)`);
      });
      lines.push('');
    }
    
    // Bestände & Logistik
    lines.push('=== BESTÄNDE & LOGISTIK ===');
    const bestände = data.sections.bestände_logistik;
    
    if (bestände.niedriger_lagerbestand.length > 0) {
      lines.push('Niedriger Lagerbestand:');
      bestände.niedriger_lagerbestand.forEach(item => {
        lines.push(`- ${item.produkt}: ${item.bestand} Stück`);
      });
      lines.push('');
    }
    
    if (bestände.nachzubestellende_artikel.length > 0) {
      lines.push('Nachzubestellende Artikel:');
      bestände.nachzubestellende_artikel.forEach(item => {
        lines.push(`- ${item.produkt} (${item.priorität}): ${item.empfohlene_menge} Stück empfohlen`);
      });
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