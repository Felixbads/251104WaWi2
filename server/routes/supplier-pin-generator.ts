/**
 * PIN-Generator-Route für Bestellungen
 * 
 * Generiert PINs für Lieferanten bei Bestellungsversendung
 */

import { Router, Request, Response } from 'express';
import { createSupplierPin, generatePinForEmail } from '../services/supplierPinService';

const router = Router();

/**
 * Generiert einen neuen PIN für einen Lieferanten
 * POST /api/supplier-pin/generate
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { supplierId, orderId, orderNumber } = req.body;

    if (!supplierId) {
      return res.status(400).json({
        success: false,
        error: 'Lieferant-ID ist erforderlich'
      });
    }

    // PIN generieren
    const result = await createSupplierPin(supplierId, orderId);

    if (result.success && result.data) {
      res.json({
        success: true,
        data: {
          pinCode: result.data.pinCode,
          accessUrl: result.data.accessUrl,
          qrCodeDataUrl: result.data.qrCodeDataUrl,
          validUntil: result.data.validUntil?.toISOString(),
          orderNumber: orderNumber || `ORDER-${orderId}`
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'PIN konnte nicht generiert werden'
      });
    }

  } catch (error) {
    console.error('[SUPPLIER-PIN-GENERATOR] Fehler beim Generieren des PINs:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler beim Generieren des PINs'
    });
  }
});

/**
 * Generiert PIN-Daten für E-Mail-Versendung
 * POST /api/supplier-pin/generate-for-email
 */
router.post('/generate-for-email', async (req: Request, res: Response) => {
  try {
    const { supplierId, orderNumber } = req.body;

    if (!supplierId || !orderNumber) {
      return res.status(400).json({
        success: false,
        error: 'Lieferant-ID und Bestellnummer sind erforderlich'
      });
    }

    // PIN für E-Mail generieren
    const pinData = await generatePinForEmail(supplierId, orderNumber);

    if (pinData) {
      res.json({
        success: true,
        data: pinData
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'PIN für E-Mail konnte nicht generiert werden'
      });
    }

  } catch (error) {
    console.error('[SUPPLIER-PIN-GENERATOR] Fehler beim Generieren des E-Mail-PINs:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler beim Generieren des E-Mail-PINs'
    });
  }
});

export default router;