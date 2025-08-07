/**
 * E-Mail-Service für Admin-Benachrichtigungen
 */
import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(`✅ E-Mail erfolgreich gesendet an: ${params.to}`);
    return true;
  } catch (error) {
    console.error('❌ SendGrid E-Mail-Fehler:', error);
    return false;
  }
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
  const fromEmail = process.env.FROM_EMAIL || 'noreply@warenwirtschaft.de';
  
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
          <p>Bei Problemen wenden Sie sich an den Systemadministrator.</p>
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
  `;
  
  return await sendEmail({
    to: adminEmail,
    from: fromEmail,
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
  
  const fromEmail = 'noreply@warenwirtschaft.de';
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
    `;
  }
  
  return await sendEmail({
    to: userEmail,
    from: fromEmail,
    subject,
    html: htmlContent,
    text: textContent,
  });
}

/**
 * Hilfsfunktion um die Admin-Panel URL zu generieren
 */
function getAdminPanelUrl(): string {
  return process.env.BASE_URL || 'http://localhost:5000';
}