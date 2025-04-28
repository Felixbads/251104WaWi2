// Test-Skript zum Überprüfen der E-Mail-Funktionalität
require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// IMAP-Konfiguration für E-Mail-Server
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASSWORD || '',
  },
  // Zertifikatsfehler ignorieren (nur für Entwicklung)
  tls: {
    rejectUnauthorized: false
  }
});

// Funktion zum Senden einer Test-E-Mail
async function sendTestEmail() {
  try {
    // Temporären Pfad für PDF erstellen, falls er nicht existiert
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Log-Datei erstellen, um den E-Mail-Server zu prüfen
    fs.writeFileSync(
      path.join(tempDir, `email_test_config.txt`),
      `SMTP Host: ${process.env.SMTP_HOST || 'not set'}\n` +
      `SMTP Port: ${process.env.SMTP_PORT || 'not set'}\n` +
      `SMTP Secure: ${process.env.SMTP_SECURE || 'not set'}\n` +
      `SMTP User: ${process.env.SMTP_USER || 'not set'}`
    );

    // Fallback, wenn keine SMTP-Konfiguration vorhanden ist
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      console.log('SMTP-Konfiguration fehlt. Speichere simulierte E-Mail in temporärem Verzeichnis.');
      
      fs.writeFileSync(
        path.join(tempDir, `email_test_simulated.txt`),
        `An: test@example.com\n` +
        `Von: info@elbsandstein-proviant.de\n` +
        `Betreff: Test-E-Mail von Elbsandstein Proviant & Quartier GmbH\n` +
        `Inhalt: Dies ist eine Test-E-Mail, um die Konfiguration zu überprüfen.\n`
      );
      
      console.log(`Test-E-Mail wurde simuliert: ${path.join(tempDir, 'email_test_simulated.txt')}`);
      return;
    }

    console.log("Überprüfe SMTP-Verbindung...");
    await transporter.verify();
    console.log("SMTP-Verbindung erfolgreich getestet!");

    // E-Mail-Nachricht erstellen
    const mailOptions = {
      from: process.env.SMTP_USER, // Die E-Mail-Adresse des Absenders muss mit dem SMTP-Nutzer übereinstimmen
      to: 'test@example.com', // Bitte durch eine echte E-Mail-Adresse ersetzen
      subject: 'Test-E-Mail von Elbsandstein Proviant & Quartier GmbH',
      text: 'Dies ist eine Test-E-Mail, um die Konfiguration zu überprüfen.',
      html: '<p>Dies ist eine <strong>Test-E-Mail</strong>, um die Konfiguration zu überprüfen.</p>',
    };

    // E-Mail senden
    console.log("Sende Test-E-Mail...");
    const info = await transporter.sendMail(mailOptions);
    console.log('E-Mail erfolgreich gesendet:', info.messageId);
    
    // Erfolgreichen Versand dokumentieren
    fs.writeFileSync(
      path.join(tempDir, `email_test_success.txt`),
      `E-Mail erfolgreich gesendet\n` +
      `Nachrichten-ID: ${info.messageId}\n` +
      `Zeitpunkt: ${new Date().toISOString()}\n`
    );
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    
    // Fehler dokumentieren
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(tempDir, `email_test_error.txt`),
      `Fehler beim Senden der E-Mail: ${error.message}\n` +
      `Zeitpunkt: ${new Date().toISOString()}\n` +
      `Fehlerdetails: ${JSON.stringify(error, null, 2)}\n`
    );
  }
}

// Test-E-Mail senden
console.log("Starte E-Mail-Test mit SMTP-Konfiguration");
sendTestEmail()
  .then(() => console.log('Test abgeschlossen'))
  .catch(err => console.error('Unerwarteter Fehler:', err));