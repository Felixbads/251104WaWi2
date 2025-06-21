import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { sendEmail } from '../utils/emailService';

const router = Router();

// Ticket-Schema für API-Validierung
const createTicketSchema = z.object({
  // Kundendaten (PFLICHT)
  customerName: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  customerEmail: z.string().email("Gültige E-Mail-Adresse erforderlich"),
  customerPhone: z.string().optional().nullable(),
  customerCompany: z.string().optional().nullable(),
  
  // Ticket-Details (PFLICHT)
  priority: z.enum(["low", "medium", "high", "urgent"]),
  category: z.enum(["technical", "billing", "general", "feature_request", "bug_report"]),
  subject: z.string().min(5, "Betreff muss mindestens 5 Zeichen lang sein"),
  description: z.string().min(20, "Beschreibung muss mindestens 20 Zeichen lang sein"),
  
  // System-Informationen (OPTIONAL)
  affectedSystem: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  stepsToReproduce: z.string().optional().nullable(),
  expectedBehavior: z.string().optional().nullable(),
  actualBehavior: z.string().optional().nullable(),
  
  // Zusätzliche Informationen (OPTIONAL)
  browserInfo: z.string().optional().nullable(),
  deviceInfo: z.string().optional().nullable(),
  additionalNotes: z.string().optional().nullable(),
});

// Hilfsfunktionen für E-Mail-Generierung
const priorityLabels = {
  low: "Niedrig",
  medium: "Mittel", 
  high: "Hoch",
  urgent: "DRINGEND"
};

const categoryLabels = {
  technical: "Technisches Problem",
  billing: "Abrechnung/Zahlung",
  general: "Allgemeine Anfrage",
  feature_request: "Feature-Anfrage",
  bug_report: "Bug-Meldung"
};

function generateTicketNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `TK${year}${month}${day}-${random}`;
}

function generateCustomerEmailContent(ticketData: any): { subject: string; html: string; text: string } {
  const subject = `Ticket ${ticketData.ticketNumber} erstellt: ${ticketData.subject}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Support-Ticket Bestätigung</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; border-radius: 8px; overflow: hidden; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background: white; }
        .ticket-info { background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0; }
        .field-group { margin-bottom: 15px; }
        .field-label { font-weight: bold; color: #374151; margin-bottom: 5px; }
        .field-value { color: #6b7280; margin-left: 10px; }
        .priority-urgent { color: #dc2626; font-weight: bold; }
        .priority-high { color: #ea580c; font-weight: bold; }
        .priority-medium { color: #d97706; }
        .priority-low { color: #059669; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; }
        .section { margin-bottom: 25px; }
        .section-title { font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Support-Ticket erstellt</h1>
          <p>Vielen Dank für Ihre Anfrage. Wir haben Ihr Ticket erhalten und bearbeiten es schnellstmöglich.</p>
        </div>
        
        <div class="content">
          <div class="ticket-info">
            <h2>Ticket-Nummer: ${ticketData.ticketNumber}</h2>
            <p><strong>Erstellt am:</strong> ${new Date(ticketData.createdAt).toLocaleString('de-DE')}</p>
            <p><strong>Status:</strong> Offen</p>
          </div>

          <!-- KUNDENDATEN -->
          <div class="section">
            <div class="section-title">Ihre Kontaktdaten</div>
            <div class="field-group">
              <div class="field-label">Name:</div>
              <div class="field-value">${ticketData.customerName}</div>
            </div>
            <div class="field-group">
              <div class="field-label">E-Mail:</div>
              <div class="field-value">${ticketData.customerEmail}</div>
            </div>
            ${ticketData.customerPhone ? `
            <div class="field-group">
              <div class="field-label">Telefon:</div>
              <div class="field-value">${ticketData.customerPhone}</div>
            </div>
            ` : ''}
            ${ticketData.customerCompany ? `
            <div class="field-group">
              <div class="field-label">Unternehmen:</div>
              <div class="field-value">${ticketData.customerCompany}</div>
            </div>
            ` : ''}
          </div>

          <!-- TICKET-DETAILS -->
          <div class="section">
            <div class="section-title">Ticket-Details</div>
            <div class="field-group">
              <div class="field-label">Priorität:</div>
              <div class="field-value priority-${ticketData.priority}">${priorityLabels[ticketData.priority]}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Kategorie:</div>
              <div class="field-value">${categoryLabels[ticketData.category]}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Betreff:</div>
              <div class="field-value">${ticketData.subject}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Beschreibung:</div>
              <div class="field-value" style="white-space: pre-wrap;">${ticketData.description}</div>
            </div>
          </div>

          <!-- SYSTEM-INFORMATIONEN -->
          ${ticketData.affectedSystem || ticketData.errorMessage || ticketData.stepsToReproduce || ticketData.expectedBehavior || ticketData.actualBehavior ? `
          <div class="section">
            <div class="section-title">System-Informationen</div>
            ${ticketData.affectedSystem ? `
            <div class="field-group">
              <div class="field-label">Betroffenes System:</div>
              <div class="field-value">${ticketData.affectedSystem}</div>
            </div>
            ` : ''}
            ${ticketData.errorMessage ? `
            <div class="field-group">
              <div class="field-label">Fehlermeldung:</div>
              <div class="field-value" style="white-space: pre-wrap; font-family: monospace; background: #f3f4f6; padding: 10px; border-radius: 4px;">${ticketData.errorMessage}</div>
            </div>
            ` : ''}
            ${ticketData.stepsToReproduce ? `
            <div class="field-group">
              <div class="field-label">Schritte zur Reproduktion:</div>
              <div class="field-value" style="white-space: pre-wrap;">${ticketData.stepsToReproduce}</div>
            </div>
            ` : ''}
            ${ticketData.expectedBehavior ? `
            <div class="field-group">
              <div class="field-label">Erwartetes Verhalten:</div>
              <div class="field-value" style="white-space: pre-wrap;">${ticketData.expectedBehavior}</div>
            </div>
            ` : ''}
            ${ticketData.actualBehavior ? `
            <div class="field-group">
              <div class="field-label">Tatsächliches Verhalten:</div>
              <div class="field-value" style="white-space: pre-wrap;">${ticketData.actualBehavior}</div>
            </div>
            ` : ''}
          </div>
          ` : ''}

          <!-- TECHNISCHE DETAILS -->
          ${ticketData.browserInfo || ticketData.deviceInfo || ticketData.additionalNotes ? `
          <div class="section">
            <div class="section-title">Technische Details</div>
            ${ticketData.browserInfo ? `
            <div class="field-group">
              <div class="field-label">Browser:</div>
              <div class="field-value">${ticketData.browserInfo}</div>
            </div>
            ` : ''}
            ${ticketData.deviceInfo ? `
            <div class="field-group">
              <div class="field-label">Gerät:</div>
              <div class="field-value">${ticketData.deviceInfo}</div>
            </div>
            ` : ''}
            ${ticketData.additionalNotes ? `
            <div class="field-group">
              <div class="field-label">Zusätzliche Notizen:</div>
              <div class="field-value" style="white-space: pre-wrap;">${ticketData.additionalNotes}</div>
            </div>
            ` : ''}
          </div>
          ` : ''}

          <div class="section">
            <div class="section-title">Was passiert als nächstes?</div>
            <ul>
              <li>Unser Support-Team wird Ihr Ticket prüfen und bearbeiten</li>
              <li>Sie erhalten Updates per E-Mail über den Bearbeitungsfortschritt</li>
              <li>Bei dringenden Anfragen melden wir uns innerhalb von 2 Stunden</li>
              <li>Bei Fragen können Sie auf diese E-Mail antworten</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p>Elbsandstein Proviant & Quartier GmbH<br>
          Support-Team<br>
          E-Mail: support@elbsandstein-proviant.de</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Text-Version für E-Mail-Clients ohne HTML-Unterstützung
  const text = `
Support-Ticket erstellt: ${ticketData.ticketNumber}

Vielen Dank für Ihre Anfrage. Wir haben Ihr Ticket erhalten und bearbeiten es schnellstmöglich.

TICKET-INFORMATIONEN:
Ticket-Nummer: ${ticketData.ticketNumber}
Erstellt am: ${new Date(ticketData.createdAt).toLocaleString('de-DE')}
Status: Offen

IHRE KONTAKTDATEN:
Name: ${ticketData.customerName}
E-Mail: ${ticketData.customerEmail}
${ticketData.customerPhone ? `Telefon: ${ticketData.customerPhone}` : ''}
${ticketData.customerCompany ? `Unternehmen: ${ticketData.customerCompany}` : ''}

TICKET-DETAILS:
Priorität: ${priorityLabels[ticketData.priority]}
Kategorie: ${categoryLabels[ticketData.category]}
Betreff: ${ticketData.subject}
Beschreibung: ${ticketData.description}

${ticketData.affectedSystem ? `Betroffenes System: ${ticketData.affectedSystem}` : ''}
${ticketData.errorMessage ? `Fehlermeldung: ${ticketData.errorMessage}` : ''}
${ticketData.stepsToReproduce ? `Schritte zur Reproduktion: ${ticketData.stepsToReproduce}` : ''}
${ticketData.expectedBehavior ? `Erwartetes Verhalten: ${ticketData.expectedBehavior}` : ''}
${ticketData.actualBehavior ? `Tatsächliches Verhalten: ${ticketData.actualBehavior}` : ''}
${ticketData.browserInfo ? `Browser: ${ticketData.browserInfo}` : ''}
${ticketData.deviceInfo ? `Gerät: ${ticketData.deviceInfo}` : ''}
${ticketData.additionalNotes ? `Zusätzliche Notizen: ${ticketData.additionalNotes}` : ''}

WAS PASSIERT ALS NÄCHSTES?
- Unser Support-Team wird Ihr Ticket prüfen und bearbeiten
- Sie erhalten Updates per E-Mail über den Bearbeitungsfortschritt
- Bei dringenden Anfragen melden wir uns innerhalb von 2 Stunden
- Bei Fragen können Sie auf diese E-Mail antworten

Elbsandstein Proviant & Quartier GmbH
Support-Team
E-Mail: support@elbsandstein-proviant.de
  `;

  return { subject, html, text };
}

function generateAdminEmailContent(ticketData: any): { subject: string; html: string; text: string } {
  const priorityPrefix = ticketData.priority === 'urgent' ? '[DRINGEND] ' : 
                        ticketData.priority === 'high' ? '[HOCH] ' : '';
  
  const subject = `${priorityPrefix}Neues Support-Ticket ${ticketData.ticketNumber}: ${ticketData.subject}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Neues Support-Ticket</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: #f9f9f9; border-radius: 8px; overflow: hidden; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .header.medium { background: #d97706; }
        .header.low { background: #059669; }
        .header.high { background: #ea580c; }
        .content { padding: 30px; background: white; }
        .ticket-info { background: #fee2e2; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #dc2626; }
        .ticket-info.medium { background: #fef3c7; border-color: #d97706; }
        .ticket-info.low { background: #d1fae5; border-color: #059669; }
        .ticket-info.high { background: #fed7aa; border-color: #ea580c; }
        .field-group { margin-bottom: 15px; }
        .field-label { font-weight: bold; color: #374151; margin-bottom: 5px; }
        .field-value { color: #6b7280; margin-left: 10px; }
        .priority-urgent { color: #dc2626; font-weight: bold; font-size: 16px; }
        .priority-high { color: #ea580c; font-weight: bold; }
        .priority-medium { color: #d97706; }
        .priority-low { color: #059669; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; }
        .section { margin-bottom: 25px; }
        .section-title { font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px; }
        .action-buttons { text-align: center; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 0 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header ${ticketData.priority}">
          <h1>🎫 Neues Support-Ticket</h1>
          <p>Ein neues Support-Ticket wurde erstellt und benötigt Ihre Aufmerksamkeit.</p>
        </div>
        
        <div class="content">
          <div class="ticket-info ${ticketData.priority}">
            <h2>Ticket ${ticketData.ticketNumber}</h2>
            <p><strong>Priorität:</strong> <span class="priority-${ticketData.priority}">${priorityLabels[ticketData.priority]}</span></p>
            <p><strong>Kategorie:</strong> ${categoryLabels[ticketData.category]}</p>
            <p><strong>Erstellt am:</strong> ${new Date(ticketData.createdAt).toLocaleString('de-DE')}</p>
            <p><strong>Status:</strong> Offen (neu)</p>
          </div>

          <!-- VOLLSTÄNDIGE KUNDENDATEN -->
          <div class="section">
            <div class="section-title">👤 Kundendaten</div>
            <div class="field-group">
              <div class="field-label">Name:</div>
              <div class="field-value">${ticketData.customerName}</div>
            </div>
            <div class="field-group">
              <div class="field-label">E-Mail:</div>
              <div class="field-value"><a href="mailto:${ticketData.customerEmail}">${ticketData.customerEmail}</a></div>
            </div>
            ${ticketData.customerPhone ? `
            <div class="field-group">
              <div class="field-label">Telefon:</div>
              <div class="field-value"><a href="tel:${ticketData.customerPhone}">${ticketData.customerPhone}</a></div>
            </div>
            ` : ''}
            ${ticketData.customerCompany ? `
            <div class="field-group">
              <div class="field-label">Unternehmen:</div>
              <div class="field-value">${ticketData.customerCompany}</div>
            </div>
            ` : ''}
          </div>

          <!-- VOLLSTÄNDIGE TICKET-DETAILS -->
          <div class="section">
            <div class="section-title">📋 Ticket-Details</div>
            <div class="field-group">
              <div class="field-label">Betreff:</div>
              <div class="field-value" style="font-size: 16px; font-weight: bold;">${ticketData.subject}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Beschreibung:</div>
              <div class="field-value" style="white-space: pre-wrap; background: #f9fafb; padding: 15px; border-radius: 6px; border-left: 3px solid #3b82f6;">${ticketData.description}</div>
            </div>
          </div>

          <!-- VOLLSTÄNDIGE SYSTEM-INFORMATIONEN -->
          ${ticketData.affectedSystem || ticketData.errorMessage || ticketData.stepsToReproduce || ticketData.expectedBehavior || ticketData.actualBehavior ? `
          <div class="section">
            <div class="section-title">🔧 System-Informationen</div>
            ${ticketData.affectedSystem ? `
            <div class="field-group">
              <div class="field-label">Betroffenes System/Modul:</div>
              <div class="field-value">${ticketData.affectedSystem}</div>
            </div>
            ` : ''}
            ${ticketData.errorMessage ? `
            <div class="field-group">
              <div class="field-label">Fehlermeldung:</div>
              <div class="field-value" style="white-space: pre-wrap; font-family: monospace; background: #fef2f2; padding: 15px; border-radius: 6px; border-left: 3px solid #ef4444;">${ticketData.errorMessage}</div>
            </div>
            ` : ''}
            ${ticketData.stepsToReproduce ? `
            <div class="field-group">
              <div class="field-label">Schritte zur Reproduktion:</div>
              <div class="field-value" style="white-space: pre-wrap; background: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 3px solid #0ea5e9;">${ticketData.stepsToReproduce}</div>
            </div>
            ` : ''}
            ${ticketData.expectedBehavior ? `
            <div class="field-group">
              <div class="field-label">Erwartetes Verhalten:</div>
              <div class="field-value" style="white-space: pre-wrap; background: #f0fdf4; padding: 15px; border-radius: 6px; border-left: 3px solid #22c55e;">${ticketData.expectedBehavior}</div>
            </div>
            ` : ''}
            ${ticketData.actualBehavior ? `
            <div class="field-group">
              <div class="field-label">Tatsächliches Verhalten:</div>
              <div class="field-value" style="white-space: pre-wrap; background: #fefce8; padding: 15px; border-radius: 6px; border-left: 3px solid #eab308;">${ticketData.actualBehavior}</div>
            </div>
            ` : ''}
          </div>
          ` : ''}

          <!-- VOLLSTÄNDIGE TECHNISCHE DETAILS -->
          ${ticketData.browserInfo || ticketData.deviceInfo || ticketData.additionalNotes ? `
          <div class="section">
            <div class="section-title">💻 Technische Details</div>
            ${ticketData.browserInfo ? `
            <div class="field-group">
              <div class="field-label">Browser-Informationen:</div>
              <div class="field-value" style="font-family: monospace; background: #f3f4f6; padding: 10px; border-radius: 4px;">${ticketData.browserInfo}</div>
            </div>
            ` : ''}
            ${ticketData.deviceInfo ? `
            <div class="field-group">
              <div class="field-label">Geräteinformationen:</div>
              <div class="field-value" style="font-family: monospace; background: #f3f4f6; padding: 10px; border-radius: 4px;">${ticketData.deviceInfo}</div>
            </div>
            ` : ''}
            ${ticketData.additionalNotes ? `
            <div class="field-group">
              <div class="field-label">Zusätzliche Notizen:</div>
              <div class="field-value" style="white-space: pre-wrap; background: #f8fafc; padding: 15px; border-radius: 6px; border-left: 3px solid #64748b;">${ticketData.additionalNotes}</div>
            </div>
            ` : ''}
          </div>
          ` : ''}

          <div class="action-buttons">
            <a href="mailto:${ticketData.customerEmail}?subject=Re: ${ticketData.subject} (Ticket ${ticketData.ticketNumber})" class="button">
              📧 Kunde antworten
            </a>
          </div>

          <div class="section">
            <div class="section-title">⚡ Nächste Schritte</div>
            <ul>
              <li><strong>Priorität ${priorityLabels[ticketData.priority]}:</strong> ${
                ticketData.priority === 'urgent' ? 'Sofortige Bearbeitung erforderlich!' :
                ticketData.priority === 'high' ? 'Bearbeitung innerhalb von 4 Stunden' :
                ticketData.priority === 'medium' ? 'Bearbeitung innerhalb von 24 Stunden' :
                'Bearbeitung innerhalb von 48 Stunden'
              }</li>
              <li>Ticket-Status auf "In Bearbeitung" setzen</li>
              <li>Ersten Kontakt mit Kunde aufnehmen</li>
              <li>Problem analysieren und Lösung erarbeiten</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Support-Team Admin-Portal</strong><br>
          Alle Ticket-Daten wurden vollständig übertragen.<br>
          Diese E-Mail enthält sämtliche vom Kunden eingegebenen Informationen.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Text-Version für Admin
  const text = `
NEUES SUPPORT-TICKET: ${ticketData.ticketNumber}

Priorität: ${priorityLabels[ticketData.priority]} (${ticketData.priority === 'urgent' ? 'SOFORTIGE BEARBEITUNG!' : 'Standard-Bearbeitung'})
Kategorie: ${categoryLabels[ticketData.category]}
Erstellt: ${new Date(ticketData.createdAt).toLocaleString('de-DE')}

KUNDENDATEN:
Name: ${ticketData.customerName}
E-Mail: ${ticketData.customerEmail}
${ticketData.customerPhone ? `Telefon: ${ticketData.customerPhone}` : ''}
${ticketData.customerCompany ? `Unternehmen: ${ticketData.customerCompany}` : ''}

TICKET-DETAILS:
Betreff: ${ticketData.subject}
Beschreibung: ${ticketData.description}

SYSTEM-INFORMATIONEN:
${ticketData.affectedSystem ? `Betroffenes System: ${ticketData.affectedSystem}` : ''}
${ticketData.errorMessage ? `Fehlermeldung: ${ticketData.errorMessage}` : ''}
${ticketData.stepsToReproduce ? `Schritte zur Reproduktion: ${ticketData.stepsToReproduce}` : ''}
${ticketData.expectedBehavior ? `Erwartetes Verhalten: ${ticketData.expectedBehavior}` : ''}
${ticketData.actualBehavior ? `Tatsächliches Verhalten: ${ticketData.actualBehavior}` : ''}

TECHNISCHE DETAILS:
${ticketData.browserInfo ? `Browser: ${ticketData.browserInfo}` : ''}
${ticketData.deviceInfo ? `Gerät: ${ticketData.deviceInfo}` : ''}
${ticketData.additionalNotes ? `Zusätzliche Notizen: ${ticketData.additionalNotes}` : ''}

NÄCHSTE SCHRITTE:
- Ticket-Status auf "In Bearbeitung" setzen
- Ersten Kontakt mit Kunde aufnehmen  
- Problem analysieren und Lösung erarbeiten
- ${ticketData.priority === 'urgent' ? 'SOFORTIGE Bearbeitung erforderlich!' : 
    ticketData.priority === 'high' ? 'Bearbeitung innerhalb von 4 Stunden' :
    ticketData.priority === 'medium' ? 'Bearbeitung innerhalb von 24 Stunden' :
    'Bearbeitung innerhalb von 48 Stunden'}

Alle vom Kunden eingegebenen Daten wurden vollständig übertragen.
  `;

  return { subject, html, text };
}

// POST /api/support-tickets - Neues Ticket erstellen
router.post('/', async (req, res) => {
  try {
    console.log('📥 Support-Ticket Anfrage erhalten:', req.body);

    // Input-Validierung
    const validatedData = createTicketSchema.parse(req.body);
    console.log('✅ Daten validiert');

    // Ticket-Nummer generieren
    const ticketNumber = generateTicketNumber();
    console.log('🎫 Ticket-Nummer generiert:', ticketNumber);

    // Ticket in Datenbank speichern
    const result = await pool.query(`
      INSERT INTO support_tickets (
        ticket_number, customer_name, customer_email, customer_phone, customer_company,
        priority, category, subject, description,
        affected_system, error_message, steps_to_reproduce, expected_behavior, actual_behavior,
        browser_info, device_info, additional_notes,
        status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
      ) RETURNING *
    `, [
      ticketNumber,
      validatedData.customerName,
      validatedData.customerEmail,
      validatedData.customerPhone || null,
      validatedData.customerCompany || null,
      validatedData.priority,
      validatedData.category,
      validatedData.subject,
      validatedData.description,
      validatedData.affectedSystem || null,
      validatedData.errorMessage || null,
      validatedData.stepsToReproduce || null,
      validatedData.expectedBehavior || null,
      validatedData.actualBehavior || null,
      validatedData.browserInfo || null,
      validatedData.deviceInfo || null,
      validatedData.additionalNotes || null,
      'open'
    ]);

    const savedTicket = result.rows[0];
    console.log('💾 Ticket in Datenbank gespeichert:', savedTicket.id);

    // E-Mail-Inhalt für Kunden generieren (ALLE Daten enthalten)
    const customerEmail = generateCustomerEmailContent(savedTicket);
    console.log('📧 Kunden-E-Mail generiert');

    // E-Mail-Inhalt für Admin generieren (ALLE Daten enthalten)
    const adminEmail = generateAdminEmailContent(savedTicket);
    console.log('👨‍💼 Admin-E-Mail generiert');

    // E-Mails versenden (parallel)
    const emailPromises = [];

    // 1. Bestätigungs-E-Mail an Kunden senden
    emailPromises.push(
      sendEmail({
        to: savedTicket.customer_email,
        subject: customerEmail.subject,
        html: customerEmail.html,
        text: customerEmail.text,
      }).then(success => {
        if (success) {
          console.log('✅ Bestätigungs-E-Mail an Kunden gesendet:', savedTicket.customer_email);
        } else {
          console.error('❌ Fehler beim Senden der Kunden-E-Mail');
        }
        return { type: 'customer', success };
      })
    );

    // 2. Benachrichtigungs-E-Mail an Admin senden
    const adminEmails = [
      'support@elbsandstein-proviant.de',
      'admin@elbsandstein-proviant.de'
    ];

    adminEmails.forEach(adminEmail => {
      emailPromises.push(
        sendEmail({
          to: adminEmail,
          subject: adminEmail.subject,
          html: adminEmail.html,
          text: adminEmail.text,
        }).then(success => {
          if (success) {
            console.log('✅ Admin-Benachrichtigung gesendet an:', adminEmail);
          } else {
            console.error('❌ Fehler beim Senden der Admin-E-Mail an:', adminEmail);
          }
          return { type: 'admin', email: adminEmail, success };
        })
      );
    });

    // Warten auf alle E-Mail-Sends
    const emailResults = await Promise.all(emailPromises);
    console.log('📨 E-Mail-Versand abgeschlossen:', emailResults);

    // Erfolgreiche Antwort senden
    res.status(201).json({
      success: true,
      message: 'Support-Ticket erfolgreich erstellt',
      ticketNumber: savedTicket.ticket_number,
      ticketId: savedTicket.id,
      emailResults: emailResults,
      ticket: {
        id: savedTicket.id,
        ticketNumber: savedTicket.ticket_number,
        status: savedTicket.status,
        createdAt: savedTicket.created_at,
        priority: savedTicket.priority,
        category: savedTicket.category,
        subject: savedTicket.subject
      }
    });

    console.log('🎉 Support-Ticket erfolgreich verarbeitet:', savedTicket.ticket_number);

  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Support-Tickets:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validierungsfehler',
        errors: error.errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Interner Serverfehler beim Erstellen des Tickets',
      error: error.message
    });
  }
});

// GET /api/support-tickets - Alle Tickets abrufen (für Admin)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM support_tickets 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      tickets: result.rows
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Tickets'
    });
  }
});

// GET /api/support-tickets/:id - Einzelnes Ticket abrufen
router.get('/:id', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    
    const result = await pool.query(`
      SELECT * FROM support_tickets WHERE id = $1
    `, [ticketId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket nicht gefunden'
      });
    }
    
    res.json({
      success: true,
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen des Tickets'
    });
  }
});

export default router;