/**
 * SMTP-BASIERTER E-MAIL-SERVICE FÜR ADMIN-BENACHRICHTIGUNGEN
 * Ersetzt SendGrid API durch server-basiertes SMTP für vollständige Kontrolle
 */
import nodemailer from 'nodemailer';

interface EmailParams {
  to: string;
  from?: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * SMTP-Transporter erstellen mit Umgebungsvariablen
 */
function createSMTPTransporter() {
  const smtpConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true für 465, false für andere Ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Zusätzliche Sicherheitsoptionen
    tls: {
      rejectUnauthorized: false // Für lokale/interne SMTP-Server
    }
  };

  console.log('📧 SMTP-Konfiguration initialisiert:', {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.auth.user,
    hasPassword: !!smtpConfig.auth.pass
  });

  return nodemailer.createTransport(smtpConfig);
}

/**
 * Zentraler E-Mail-Versand über SMTP-Server
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    const transporter = createSMTPTransporter();
    
    // Standard-Absenderadresse falls nicht angegeben
    const fromEmail = params.from || process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@warenwirtschaft.de';
    
    const mailOptions = {
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    };

    console.log(`📧 Sende E-Mail über SMTP...`, {
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      hasHTML: !!params.html
    });

    const result = await transporter.sendMail(mailOptions);
    
    console.log(`✅ E-Mail erfolgreich über SMTP gesendet an: ${params.to}`, {
      messageId: result.messageId,
      response: result.response
    });
    
    return true;
    
  } catch (error: any) {
    console.error('❌ SMTP E-Mail-Fehler:', error);
    console.error('❌ SMTP Fehler-Details:', {
      message: error?.message,
      code: error?.code,
      command: error?.command,
      response: error?.response
    });
    
    return false;
  }
}

/**
 * Test-E-Mail-Funktion für Validierung
 */
export async function sendTestEmail(recipientEmail: string): Promise<boolean> {
  const testContent = `
    <h2>🧪 SMTP Test-E-Mail</h2>
    <p>Diese Test-E-Mail bestätigt, dass das SMTP-basierte E-Mail-System korrekt funktioniert.</p>
    
    <div style="background: #f0f8ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <h3>✅ System-Information:</h3>
      <p><strong>Server:</strong> ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}</p>
      <p><strong>Benutzer:</strong> ${process.env.SMTP_USER}</p>
      <p><strong>Sicherheit:</strong> ${process.env.SMTP_PORT === '465' ? 'SSL/TLS' : 'STARTTLS'}</p>
      <p><strong>Zeitstempel:</strong> ${new Date().toLocaleString('de-DE')}</p>
    </div>
    
    <p><em>Gesendet vom Warenwirtschaftssystem über internen SMTP-Server</em></p>
  `;

  return await sendEmail({
    to: recipientEmail,
    subject: '🧪 SMTP E-Mail-System Test',
    html: testContent,
    text: `
      SMTP TEST-E-MAIL
      
      Diese Test-E-Mail bestätigt, dass das SMTP-basierte E-Mail-System korrekt funktioniert.
      
      System-Information:
      - Server: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}
      - Benutzer: ${process.env.SMTP_USER}
      - Sicherheit: ${process.env.SMTP_PORT === '465' ? 'SSL/TLS' : 'STARTTLS'}
      - Zeitstempel: ${new Date().toLocaleString('de-DE')}
      
      Gesendet vom Warenwirtschaftssystem über internen SMTP-Server
    `
  });
}

/**
 * Benachrichtigt Admins über neue Benutzerregistrierung
 */
export async function notifyAdminsOfNewUser(user: {
  username: string;
  email?: string;
  role?: string;
  createdAt: Date;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@warenwirtschaft.de'; 
  
  const subject = `🔔 Neue Benutzerregistrierung - Freigabe erforderlich`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Neue Benutzerregistrierung</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
        .user-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .action-btn { 
          display: inline-block; 
          background: #16a34a; 
          color: white; 
          padding: 12px 24px; 
          text-decoration: none; 
          border-radius: 6px; 
          margin: 10px 5px; 
        }
        .footer { background: #64748b; color: white; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>🔔 Neue Benutzerregistrierung</h2>
          <p>Ein neuer Benutzer hat sich registriert und benötigt eine Admin-Freigabe.</p>
        </div>
        
        <div class="content">
          <div class="user-info">
            <h3>Benutzerinformationen:</h3>
            <p><strong>Benutzername:</strong> ${user.username}</p>
            <p><strong>E-Mail:</strong> ${user.email || 'Nicht angegeben'}</p>
            <p><strong>Gewünschte Rolle:</strong> ${user.role || 'user'}</p>
            <p><strong>Registrierung:</strong> ${user.createdAt.toLocaleString('de-DE')}</p>
          </div>
          
          <h3>Erforderliche Aktion:</h3>
          <p>
            Bitte loggen Sie sich in das Admin-Panel ein, um den neuen Benutzer zu überprüfen 
            und freizuschalten. Sie können dabei auch die gewünschte Rolle zuweisen.
          </p>
          
          <div style="text-align: center; margin: 20px 0;">
            <a href="${getAdminPanelUrl()}/admin/users" class="action-btn">
              🔧 Admin-Panel öffnen
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>Diese E-Mail wurde automatisch vom Warenwirtschaftssystem generiert.</p>
          <p>Gesendet über internen SMTP-Server - ${new Date().toLocaleString('de-DE')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const textContent = `
    🔔 NEUE BENUTZERREGISTRIERUNG - FREIGABE ERFORDERLICH
    
    Ein neuer Benutzer hat sich registriert und benötigt eine Admin-Freigabe:
    
    Benutzerinformationen:
    - Benutzername: ${user.username}
    - E-Mail: ${user.email || 'Nicht angegeben'}
    - Gewünschte Rolle: ${user.role || 'user'}
    - Registrierung: ${user.createdAt.toLocaleString('de-DE')}
    
    Erforderliche Aktion:
    Bitte loggen Sie sich in das Admin-Panel ein, um den neuen Benutzer zu überprüfen 
    und freizuschalten. Sie können dabei auch die gewünschte Rolle zuweisen.
    
    Admin-Panel: ${getAdminPanelUrl()}/admin/users
    
    ---
    Diese E-Mail wurde automatisch vom Warenwirtschaftssystem generiert.
    Gesendet über internen SMTP-Server - ${new Date().toLocaleString('de-DE')}
  `;
  
  return await sendEmail({
    to: adminEmail,
    subject,
    html: htmlContent,
    text: textContent,
  });
}

/**
 * Benachrichtigt Benutzer über Freigabe/Ablehnung
 */
export async function notifyUserOfApprovalStatus(
  userEmail: string,
  username: string,
  approved: boolean,
  role?: string
): Promise<boolean> {
  if (!userEmail) {
    console.log('⚠️ Keine E-Mail-Adresse für Benutzerbenachrichtigung vorhanden');
    return false;
  }
  
  const subject = approved 
    ? '✅ Ihr Account wurde freigeschaltet' 
    : '❌ Ihr Account wurde nicht freigegeben';
  
  let htmlContent: string;
  let textContent: string;
  
  if (approved) {
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Account freigegeben</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
          .login-btn { 
            display: inline-block; 
            background: #2563eb; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 15px 0;
          }
          .footer { background: #64748b; color: white; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>✅ Willkommen im Warenwirtschaftssystem!</h2>
            <p>Ihr Account wurde erfolgreich freigeschaltet.</p>
          </div>
          
          <div class="content">
            <p>Hallo <strong>${username}</strong>,</p>
            
            <p>
              Ihr Account wurde von einem Administrator freigegeben und Sie können sich jetzt 
              in das Warenwirtschaftssystem einloggen.
            </p>
            
            <p><strong>Ihre Benutzerrolle:</strong> ${role || 'Standardbenutzer'}</p>
            
            <div style="text-align: center;">
              <a href="${getAdminPanelUrl()}/login" class="login-btn">
                🔐 Jetzt einloggen
              </a>
            </div>
            
            <p>
              Falls Sie Fragen haben oder Probleme beim Einloggen auftreten, 
              wenden Sie sich an Ihren Administrator.
            </p>
          </div>
          
          <div class="footer">
            <p>Vielen Dank für Ihre Registrierung im Warenwirtschaftssystem.</p>
            <p>Gesendet über internen SMTP-Server - ${new Date().toLocaleString('de-DE')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    textContent = `
      ✅ WILLKOMMEN IM WARENWIRTSCHAFTSSYSTEM!
      
      Hallo ${username},
      
      Ihr Account wurde von einem Administrator freigegeben und Sie können sich jetzt 
      in das Warenwirtschaftssystem einloggen.
      
      Ihre Benutzerrolle: ${role || 'Standardbenutzer'}
      
      Login: ${getAdminPanelUrl()}/login
      
      Falls Sie Fragen haben oder Probleme beim Einloggen auftreten, 
      wenden Sie sich an Ihren Administrator.
      
      Vielen Dank für Ihre Registrierung im Warenwirtschaftssystem.
      Gesendet über internen SMTP-Server - ${new Date().toLocaleString('de-DE')}
    `;
  } else {
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Account nicht freigegeben</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
          .footer { background: #64748b; color: white; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>❌ Account nicht freigegeben</h2>
            <p>Ihre Registrierungsanfrage wurde nicht genehmigt.</p>
          </div>
          
          <div class="content">
            <p>Hallo <strong>${username}</strong>,</p>
            
            <p>
              Leider wurde Ihre Registrierungsanfrage für das Warenwirtschaftssystem 
              nicht genehmigt.
            </p>
            
            <p>
              Falls Sie Fragen dazu haben oder der Meinung sind, dass es sich um einen 
              Fehler handelt, wenden Sie sich bitte an Ihren Administrator.
            </p>
          </div>
          
          <div class="footer">
            <p>Bei weiteren Fragen stehen wir gerne zur Verfügung.</p>
            <p>Gesendet über internen SMTP-Server - ${new Date().toLocaleString('de-DE')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    textContent = `
      ❌ ACCOUNT NICHT FREIGEGEBEN
      
      Hallo ${username},
      
      Leider wurde Ihre Registrierungsanfrage für das Warenwirtschaftssystem 
      nicht genehmigt.
      
      Falls Sie Fragen dazu haben oder der Meinung sind, dass es sich um einen 
      Fehler handelt, wenden Sie sich bitte an Ihren Administrator.
      
      Bei weiteren Fragen stehen wir gerne zur Verfügung.
      Gesendet über internen SMTP-Server - ${new Date().toLocaleString('de-DE')}
    `;
  }
  
  return await sendEmail({
    to: userEmail,
    subject,
    html: htmlContent,
    text: textContent,
  });
}

/**
 * E-Mail für wiederkehrende Bestellungen mit Portal-Link
 */
export async function sendRecurringOrderEmail(
  recipientEmail: string,
  orderDetails: {
    orderName: string;
    orderNumber: string;
    supplierName: string;
    items: Array<{ productName: string; quantity: number; unit: string }>;
    totalAmount?: number;
  },
  portalLink?: string
): Promise<boolean> {
  const subject = `📦 Neue Bestellung: ${orderDetails.orderName} (${orderDetails.orderNumber})`;
  
  const itemsList = orderDetails.items
    .map(item => `<li>${item.productName} - ${item.quantity} ${item.unit}</li>`)
    .join('');
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Neue Bestellung</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
        .order-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .portal-btn { 
          display: inline-block; 
          background: #16a34a; 
          color: white; 
          padding: 12px 24px; 
          text-decoration: none; 
          border-radius: 6px; 
          margin: 15px 0;
        }
        .footer { background: #64748b; color: white; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📦 Neue Bestellung eingegangen</h2>
          <p>Bestellung ${orderDetails.orderNumber} wurde automatisch erstellt</p>
        </div>
        
        <div class="content">
          <div class="order-info">
            <h3>Bestelldetails:</h3>
            <p><strong>Bestellname:</strong> ${orderDetails.orderName}</p>
            <p><strong>Bestellnummer:</strong> ${orderDetails.orderNumber}</p>
            <p><strong>Lieferant:</strong> ${orderDetails.supplierName}</p>
            ${orderDetails.totalAmount ? `<p><strong>Gesamtwert:</strong> ${orderDetails.totalAmount.toFixed(2)} €</p>` : ''}
            
            <h4>Bestellpositionen:</h4>
            <ul>${itemsList}</ul>
          </div>
          
          ${portalLink ? `
            <div style="text-align: center;">
              <a href="${portalLink}" class="portal-btn">
                🔗 Bestellung im Portal anzeigen
              </a>
              <p><small>Link gültig für 24 Stunden</small></p>
            </div>
          ` : ''}
        </div>
        
        <div class="footer">
          <p>Diese E-Mail wurde automatisch vom Warenwirtschaftssystem generiert.</p>
          <p>Gesendet über internen SMTP-Server - ${new Date().toLocaleString('de-DE')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return await sendEmail({
    to: recipientEmail,
    subject,
    html: htmlContent
  });
}

/**
 * Hilfsfunktion um die Admin-Panel URL zu generieren
 */
function getAdminPanelUrl(): string {
  return process.env.BASE_URL || 'http://localhost:5000';
}