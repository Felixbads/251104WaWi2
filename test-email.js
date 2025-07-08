/**
 * Test E-Mail-Versendung
 */
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.smtp' });

async function testEmailSending() {
  console.log('SMTP-Konfiguration:');
  console.log('Host:', process.env.SMTP_HOST);
  console.log('User:', process.env.SMTP_USER);
  console.log('Port:', process.env.SMTP_PORT);
  console.log('From:', process.env.SMTP_FROM);

  // SMTP-Transporter erstellen
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false, // Port 587 braucht STARTTLS, nicht SSL
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1'
    },
    requireTLS: true
  });

  try {
    // Verbindung testen
    console.log('Teste SMTP-Verbindung...');
    await transporter.verify();
    console.log('✅ SMTP-Verbindung erfolgreich');

    // Test-E-Mail senden
    console.log('Sende Test-E-Mail...');
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: 'test@example.com',
      subject: 'Test E-Mail vom Warenwirtschaftssystem',
      text: 'Dies ist eine Test-E-Mail. Wenn Sie diese erhalten, funktioniert der E-Mail-Versand korrekt.',
      html: `
        <h2>Test E-Mail</h2>
        <p>Dies ist eine Test-E-Mail vom Warenwirtschaftssystem.</p>
        <p>Wenn Sie diese erhalten, funktioniert der E-Mail-Versand korrekt.</p>
        <p>Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
      `
    });

    console.log('✅ E-Mail erfolgreich gesendet');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);

  } catch (error) {
    console.error('❌ E-Mail-Fehler:', error.message);
    console.error('Vollständiger Fehler:', error);
  }
}

testEmailSending();