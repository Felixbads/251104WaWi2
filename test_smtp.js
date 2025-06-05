/**
 * Direct SMTP Test Script
 * Tests the SMTP configuration independently of the Express server
 */

import { createTransport } from 'nodemailer';

async function testSMTPConnection() {
  console.log('Starting direct SMTP test...');
  
  // Get SMTP configuration from environment
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpSecure = process.env.SMTP_SECURE === 'true';
  const smtpFrom = process.env.SMTP_FROM || 'einkauf@proviantomat.de';

  console.log('SMTP Configuration:');
  console.log(`- Host: ${smtpHost}`);
  console.log(`- Port: ${smtpPort}`);
  console.log(`- Secure: ${smtpSecure}`);
  console.log(`- User: ${smtpUser ? '***' : 'NOT SET'}`);
  console.log(`- Pass: ${smtpPass ? '***' : 'NOT SET'}`);
  console.log(`- From: ${smtpFrom}`);

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('❌ SMTP configuration incomplete');
    return false;
  }

  try {
    // Create transporter
    const transporter = createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false, // Use STARTTLS instead of SSL
      requireTLS: true,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false,
        servername: smtpHost
      }
    });

    console.log('Testing SMTP connection...');
    
    // Test connection
    await transporter.verify();
    console.log('✅ SMTP connection successful');

    // Send test email
    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: smtpFrom,
      to: 'test@example.com',
      subject: 'SMTP Test - Proviantomat System',
      html: '<h1>SMTP Test</h1><p>This is a test email to verify SMTP configuration.</p>',
      text: 'SMTP Test - This is a test email to verify SMTP configuration.'
    });

    console.log('✅ Test email sent successfully');
    console.log('Message ID:', info.messageId);
    return true;

  } catch (error) {
    console.error('❌ SMTP test failed:', error.message);
    return false;
  }
}

// Run the test
testSMTPConnection().then(success => {
  console.log(`\nSMTP Test Result: ${success ? 'SUCCESS' : 'FAILED'}`);
  process.exit(success ? 0 : 1);
});