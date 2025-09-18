/**
 * Lieferanten PIN Service - Generierung und Verwaltung von Zugangs-PINs
 */

import { rawDb } from '../db';
import * as qrcode from 'qrcode';
import crypto from 'crypto';

/**
 * Generiert einen sicheren 4-stelligen PIN-Code mit crypto.randomBytes
 */
export function generatePinCode(): string {
  // Sichere PIN-Generierung mit crypto.randomBytes
  const bytes = crypto.randomBytes(2);
  const pin = (bytes.readUInt16BE(0) % 9000) + 1000;
  return pin.toString();
}

/**
 * Generiert einen sicheren Access-Token
 */
export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Erstellt einen neuen PIN-Zugang für einen Lieferanten
 */
export async function createSupplierPin(supplierId: number, orderId?: number, orderNumber?: string, permanent: boolean = false): Promise<{
  success: boolean;
  data?: {
    pinCode: string;
    accessUrl: string;
    qrCodeDataUrl: string;
    accessToken: string;
    validUntil: Date | null;
  };
  error?: string;
}> {
  try {
    // Generiere PIN und Access Token
    const pinCode = generatePinCode();
    const accessToken = generateAccessToken();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // PIN-Gültigkeit: Immer dauerhaft bis 2030 für Portal-System
    let validUntil = new Date('2030-12-31T23:59:59Z');
    
    // Session läuft nach 8 Stunden ab
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setHours(sessionExpiresAt.getHours() + 8);

    // Prüfe ob Lieferant existiert
    const supplierCheck = await rawDb.query(
      'SELECT id, name FROM suppliers WHERE id = $1',
      [supplierId]
    );

    if (supplierCheck.rows.length === 0) {
      return {
        success: false,
        error: 'Lieferant nicht gefunden'
      };
    }

    // WICHTIG: Alte PINs NICHT deaktivieren - Behalte bestehende Portal-Zugänge aktiv
    // await rawDb.query(
    //   'UPDATE supplier_access_pins SET is_active = false WHERE supplier_id = $1',
    //   [supplierId]
    // );

    // Erstelle neuen PIN-Eintrag
    const pinData = {
      order_id: orderId || null,
      supplier_id: supplierId,
      pin_code: pinCode,
      access_token: accessToken,
      valid_until: validUntil,
      session_token: sessionToken,
      session_expires_at: sessionExpiresAt,
      created_by_order_number: orderId ? `ORDER-${orderId}` : null,
      is_active: true
    };

    const insertResult = await rawDb.query(`
      INSERT INTO supplier_access_pins (
        order_id, supplier_id, pin_code, access_token, valid_until,
        session_token, session_expires_at, created_by_order_number, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      pinData.order_id,
      pinData.supplier_id,
      pinData.pin_code,
      pinData.access_token,
      pinData.valid_until,
      pinData.session_token,
      pinData.session_expires_at,
      pinData.created_by_order_number,
      pinData.is_active
    ]);

    if (insertResult.rows.length === 0) {
      return {
        success: false,
        error: 'PIN konnte nicht in der Datenbank gespeichert werden'
      };
    }

    // Erstelle Access-URL mit dynamischer Base-URL-Erkennung
    const baseUrl = process.env.BASE_URL || 
                   (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 
                   'http://localhost:5000');
    const accessUrl = `${baseUrl}/lieferant/${accessToken}`;

    // Generiere QR-Code
    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await qrcode.toDataURL(accessUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (qrError) {
      console.error('QR-Code Generierung fehlgeschlagen:', qrError);
      // QR-Code Fehler ist nicht kritisch, PIN funktioniert trotzdem
    }

    return {
      success: true,
      data: {
        pinCode,
        accessUrl,
        qrCodeDataUrl,
        accessToken,
        validUntil
      }
    };

  } catch (error) {
    console.error('Fehler beim Erstellen des Supplier PINs:', error);
    return {
      success: false,
      error: 'Unerwarteter Fehler beim Erstellen des PINs'
    };
  }
}

/**
 * Prüft die Gültigkeit eines PIN-Codes
 */
export async function validatePin(accessToken: string, pinCode: string): Promise<{
  success: boolean;
  data?: {
    supplierId: number;
    sessionToken: string;
    validUntil: Date;
  };
  error?: string;
}> {
  try {
    // Suche aktiven PIN
    const result = await rawDb.query(`
      SELECT 
        id, supplier_id, session_token, valid_until, session_expires_at
      FROM supplier_access_pins 
      WHERE access_token = $1 AND pin_code = $2 AND is_active = true
    `, [accessToken, pinCode]);

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Ungültiger PIN-Code oder Access-Token'
      };
    }

    const pin = result.rows[0];

    // Prüfe Gültigkeit
    const now = new Date();
    const validUntil = new Date(pin.valid_until);

    if (validUntil < now) {
      // Deaktiviere abgelaufenen PIN
      await rawDb.query(
        'UPDATE supplier_access_pins SET is_active = false WHERE id = $1',
        [pin.id]
      );

      return {
        success: false,
        error: 'PIN ist abgelaufen'
      };
    }

    // Aktualisiere Session-Token für neue Session
    const newSessionToken = crypto.randomBytes(32).toString('hex');
    const newSessionExpiresAt = new Date();
    newSessionExpiresAt.setHours(newSessionExpiresAt.getHours() + 8);

    await rawDb.query(`
      UPDATE supplier_access_pins 
      SET session_token = $1, session_expires_at = $2, last_access_at = NOW()
      WHERE id = $3
    `, [newSessionToken, newSessionExpiresAt, pin.id]);

    return {
      success: true,
      data: {
        supplierId: pin.supplier_id,
        sessionToken: newSessionToken,
        validUntil
      }
    };

  } catch (error) {
    console.error('Fehler bei der PIN-Validierung:', error);
    return {
      success: false,
      error: 'Serverfehler bei der PIN-Validierung'
    };
  }
}

/**
 * Deaktiviert alle PINs für einen Lieferanten
 */
export async function deactivateSupplierPins(supplierId: number): Promise<boolean> {
  try {
    await rawDb.query(
      'UPDATE supplier_access_pins SET is_active = false WHERE supplier_id = $1',
      [supplierId]
    );
    return true;
  } catch (error) {
    console.error('Fehler beim Deaktivieren der Supplier PINs:', error);
    return false;
  }
}

/**
 * Holt alle aktiven PINs für einen Lieferanten
 */
export async function getActiveSupplierPins(supplierId: number) {
  try {
    const result = await rawDb.query(`
      SELECT 
        id, pin_code, access_token, valid_until, created_at, 
        access_count, last_access_at, created_by_order_number
      FROM supplier_access_pins 
      WHERE supplier_id = $1 AND is_active = true AND valid_until > NOW()
      ORDER BY created_at DESC
    `, [supplierId]);

    return result.rows;
  } catch (error) {
    console.error('Fehler beim Laden der aktiven Supplier PINs:', error);
    return [];
  }
}

/**
 * Generiert PIN-Daten für E-Mail-Versendung
 */
export async function generatePinForEmail(supplierId: number, orderNumber: string): Promise<{
  pinCode: string;
  accessUrl: string;
  qrCodeDataUrl: string;
  supplierName: string;
  validUntil: string;
} | null> {
  try {
    // Erstelle PIN
    const pinResult = await createSupplierPin(supplierId);
    
    if (!pinResult.success || !pinResult.data) {
      return null;
    }

    // Hole Lieferantennamen
    const supplierResult = await rawDb.query(
      'SELECT name FROM suppliers WHERE id = $1',
      [supplierId]
    );

    if (supplierResult.rows.length === 0) {
      return null;
    }

    const supplierName = supplierResult.rows[0].name;

    return {
      pinCode: pinResult.data.pinCode,
      accessUrl: pinResult.data.accessUrl,
      qrCodeDataUrl: pinResult.data.qrCodeDataUrl,
      supplierName,
      validUntil: (pinResult.data.validUntil || new Date()).toLocaleDateString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    };

  } catch (error) {
    console.error('Fehler beim Generieren der PIN für E-Mail:', error);
    return null;
  }
}