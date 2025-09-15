/**
 * ZENTRALE SICHERE SMTP-KONFIGURATION
 * Ersetzt unsichere rejectUnauthorized: false in allen E-Mail-Services
 */
import { TransportOptions } from 'nodemailer';

interface SecureSmtpConfig extends TransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS?: boolean;
  auth: {
    user: string | undefined;
    pass: string | undefined;
  };
  tls: {
    rejectUnauthorized: boolean;
    servername?: string;
    ciphers?: string;
  };
}

/**
 * Erstellt sichere SMTP-Konfiguration basierend auf Umgebung
 * PRODUCTION: rejectUnauthorized: true (sichere TLS-Validierung)
 * DEVELOPMENT: rejectUnauthorized: false (nur für lokale/interne SMTP-Server)
 */
export function createSecureSmtpConfig(): SecureSmtpConfig {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const isProduction = process.env.NODE_ENV === 'production';
  
  // SSL für Port 465, STARTTLS für andere Ports
  const secure = port === 465;
  
  const config: SecureSmtpConfig = {
    host: host || 'localhost',
    port,
    secure,
    requireTLS: !secure, // STARTTLS für nicht-SSL Ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: isProduction, // ← KRITISCHER SICHERHEITS-FIX
      servername: host,
      // Sichere Cipher-Suites für Production
      ciphers: isProduction ? 'HIGH:!aNULL:!MD5:!RC4:!3DES' : undefined
    }
  };

  // Debug-Logging (ohne Passwörter)
  console.log(`[SecureSmtp] Konfiguration erstellt:`, {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    user: config.auth.user,
    hasPassword: !!config.auth.pass,
    rejectUnauthorized: config.tls.rejectUnauthorized,
    environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT'
  });

  if (!isProduction && !config.tls.rejectUnauthorized) {
    console.warn(`[SecureSmtp] ⚠️  WARNUNG: TLS-Validierung deaktiviert (nur Development!)`);
  }

  return config;
}

/**
 * Validiert die SMTP-Umgebungsvariablen
 */
export function validateSmtpEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!process.env.SMTP_HOST) {
    errors.push('SMTP_HOST ist nicht gesetzt');
  }
  
  if (!process.env.SMTP_USER) {
    errors.push('SMTP_USER ist nicht gesetzt');
  }
  
  if (!process.env.SMTP_PASS) {
    errors.push('SMTP_PASS ist nicht gesetzt');
  }
  
  const port = parseInt(process.env.SMTP_PORT || '587');
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`SMTP_PORT ist ungültig: ${process.env.SMTP_PORT}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * TLS-Sicherheitsstatus für Monitoring und Logs
 */
export function getSmtpSecurityStatus(): {
  isSecure: boolean;
  environment: string;
  rejectUnauthorized: boolean;
  recommendations: string[];
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const config = createSecureSmtpConfig();
  
  const recommendations: string[] = [];
  
  if (!isProduction && config.tls.rejectUnauthorized === false) {
    recommendations.push('In Production sollte rejectUnauthorized: true gesetzt werden');
  }
  
  if (port !== 465 && port !== 587) {
    recommendations.push('Empfohlene SMTP-Ports: 465 (SSL) oder 587 (STARTTLS)');
  }
  
  if (!process.env.SMTP_HOST?.includes('.')) {
    recommendations.push('SMTP_HOST sollte ein vollqualifizierter Domain-Name sein');
  }
  
  return {
    isSecure: isProduction ? config.tls.rejectUnauthorized : true, // Development als sicher betrachten wenn explizit konfiguriert
    environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
    rejectUnauthorized: config.tls.rejectUnauthorized,
    recommendations
  };
}