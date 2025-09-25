/**
 * Zentraler Supplier Portal Service
 * Konsolidiert alle Portal-Link-Generierung und Token-Management
 */

import { rawDb } from '../db';
import crypto from 'crypto';

interface PortalLinkOptions {
  supplierId: number;
  orderId?: number;
  orderNumber?: string;
  validUntilDays?: number;
}

interface PortalLinkResult {
  success: boolean;
  portalUrl?: string;
  accessToken?: string;
  error?: string;
}

interface TokenValidationResult {
  success: boolean;
  supplierId?: number;
  supplierName?: string;
  error?: string;
}

/**
 * Generiert einen sicheren Access-Token für das Lieferantenportal
 */
function generateSecureAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Ermittelt sichere Basis-URL für Portal-Links
 */
function getSecureBaseUrl(): string {
  // Portal läuft auf Replit-Webspace
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return 'https://proviantomat.de'; // Fallback
}

/**
 * Erstellt oder aktualisiert einen Portal-Zugang für einen Lieferanten
 * ZENTRALE FUNKTION - ersetzt alle anderen Portal-Link-Generierungen
 */
export async function createSupplierPortalLink(options: PortalLinkOptions): Promise<PortalLinkResult> {
  try {
    const { supplierId, orderId, orderNumber, validUntilDays = 365 } = options;

    // Validiere supplierId
    if (!supplierId || supplierId <= 0) {
      return {
        success: false,
        error: 'Ungültige Lieferanten-ID'
      };
    }

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

    // Generiere neuen Access-Token
    const accessToken = generateSecureAccessToken();
    
    // Berechne Gültigkeitsdauer (lange Gültigkeit für Portal-Zugang)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validUntilDays);

    // Prüfe ob bereits ein aktiver Portal-Zugang existiert
    const existingAccess = await rawDb.query(
      'SELECT id, access_token FROM supplier_access_pins WHERE supplier_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [supplierId]
    );

    let pinId: number;

    if (existingAccess.rows.length > 0) {
      // Aktualisiere bestehenden Zugang mit neuem Token
      const updateResult = await rawDb.query(`
        UPDATE supplier_access_pins 
        SET access_token = $1, valid_until = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id
      `, [accessToken, validUntil, existingAccess.rows[0].id]);
      
      pinId = updateResult.rows[0].id;
      console.log(`[SupplierPortal] Bestehender Portal-Zugang aktualisiert für Lieferant ${supplierId}`);
    } else {
      // Erstelle neuen Portal-Zugang
      const insertResult = await rawDb.query(`
        INSERT INTO supplier_access_pins (
          supplier_id, access_token, valid_until, is_active,
          order_id, created_by_order_number, pin_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        supplierId,
        accessToken,
        validUntil,
        true,
        orderId || null,
        orderNumber || null,
        '0000' // Dummy PIN - Portal verwendet Token-basierte Authentifizierung
      ]);

      pinId = insertResult.rows[0].id;
      console.log(`[SupplierPortal] Neuer Portal-Zugang erstellt für Lieferant ${supplierId}`);
    }

    // Erstelle Portal-URL
    const baseUrl = getSecureBaseUrl();
    const portalUrl = `${baseUrl}/lieferant/${accessToken}`;

    // Validiere generierte URL
    try {
      new URL(portalUrl);
    } catch (error) {
      return {
        success: false,
        error: 'Generierte Portal-URL ist ungültig'
      };
    }

    console.log(`[SupplierPortal] Portal-Link erfolgreich generiert: ${portalUrl}`);

    return {
      success: true,
      portalUrl,
      accessToken
    };

  } catch (error) {
    console.error('[SupplierPortal] Fehler beim Erstellen des Portal-Links:', error);
    return {
      success: false,
      error: 'Unerwarteter Fehler beim Erstellen des Portal-Links'
    };
  }
}

/**
 * Validiert einen Access-Token für das Portal
 */
export async function validatePortalToken(accessToken: string): Promise<TokenValidationResult> {
  try {
    if (!accessToken || typeof accessToken !== 'string') {
      return {
        success: false,
        error: 'Ungültiger Access-Token'
      };
    }

    // Suche aktiven Portal-Zugang
    const result = await rawDb.query(`
      SELECT 
        sap.id,
        sap.supplier_id,
        sap.valid_until,
        s.name as supplier_name
      FROM supplier_access_pins sap
      LEFT JOIN suppliers s ON sap.supplier_id = s.id
      WHERE sap.access_token = $1 AND sap.is_active = true
    `, [accessToken]);

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Access-Token nicht gefunden oder inaktiv'
      };
    }

    const tokenData = result.rows[0];

    // Prüfe Gültigkeit
    if (tokenData.valid_until) {
      const expiresAt = new Date(tokenData.valid_until);
      const now = new Date();
      
      if (expiresAt <= now) {
        // Deaktiviere abgelaufenen Token
        await rawDb.query(
          'UPDATE supplier_access_pins SET is_active = false WHERE id = $1',
          [tokenData.id]
        );

        return {
          success: false,
          error: 'Access-Token ist abgelaufen'
        };
      }
    }

    // Aktualisiere letzten Zugriff
    await rawDb.query(
      'UPDATE supplier_access_pins SET last_access_at = NOW() WHERE id = $1',
      [tokenData.id]
    );

    return {
      success: true,
      supplierId: tokenData.supplier_id,
      supplierName: tokenData.supplier_name
    };

  } catch (error) {
    console.error('[SupplierPortal] Fehler bei Token-Validierung:', error);
    return {
      success: false,
      error: 'Serverfehler bei der Token-Validierung'
    };
  }
}

/**
 * Generiert Portal-Link-HTML für E-Mail-Templates
 */
export function generatePortalLinkHTML(portalUrl: string, supplierName: string = ''): string {
  if (!portalUrl) {
    return '';
  }

  return `
    <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px; border: 1px solid #dee2e6;">
      <h3 style="color: #0891b2; margin-top: 0;">🔗 Lieferantenportal-Zugang</h3>
      <p>Sehr geehrte Damen und Herren${supplierName ? ` von ${supplierName}` : ''},</p>
      <p>über den folgenden Link gelangen Sie zu Ihrem persönlichen Lieferantenportal, wo Sie Ihre Bestellungen einsehen und bestätigen können:</p>
      <p style="text-align: center; margin: 15px 0;">
        <a href="${portalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0891b2; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
          🏪 Zum Lieferantenportal
        </a>
      </p>
      <p><small>Dieser Link ist personalisiert und sicher. Bitte geben Sie ihn nicht an Dritte weiter.</small></p>
    </div>
  `;
}

/**
 * Holt alle aktiven Portal-Zugänge für einen Lieferanten
 */
export async function getSupplierPortalAccess(supplierId: number) {
  try {
    const result = await rawDb.query(`
      SELECT 
        id, access_token, valid_until, created_at,
        last_access_at, order_id, created_by_order_number
      FROM supplier_access_pins 
      WHERE supplier_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `, [supplierId]);

    return result.rows;
  } catch (error) {
    console.error('[SupplierPortal] Fehler beim Laden der Portal-Zugänge:', error);
    return [];
  }
}