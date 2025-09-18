/**
 * Goods Receipt API Routes with Delivery Note Upload
 * Handles goods receipt processing and delivery note management
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { DatabaseStorage } from '../storage/database-storage';
// SECURITY FIX: Import authentication and audit middleware
import { authenticateUser, auditLog, requireRole } from '../middleware/auth';
import GoodsReceiptService from '../services/goodsReceiptService';
import DeliveryNoteUploadService from '../services/deliveryNoteUploadService';
import { goodsReceiptDataSchema } from '../../shared/schema';
import { orders, orderItems } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Multer Configuration für File Uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Max 5 Dateien
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg', 
      'image/jpg',
      'image/png'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur PDF, JPEG und PNG Dateien sind erlaubt'));
    }
  }
});

// Helper function for consistent error responses
const sendError = (res: Response, statusCode: number, message: string) => {
  res.status(statusCode).json({
    success: false,
    error: message
  });
};

// Helper function for consistent success responses
const sendSuccess = (res: Response, data: any, message?: string) => {
  res.json({
    success: true,
    data,
    message
  });
};

/**
 * GET /api/goods-receipt/:orderId
 * Holt Wareneingang-Details inklusive Lieferscheine
 */
// SECURITY FIX: Add authentication and audit logging
router.get('/:orderId', 
  authenticateUser, 
  auditLog('GOODS_RECEIPT_VIEW', 'GOODS_RECEIPT_READ'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    const db = new DatabaseStorage();
    const goodsReceiptService = new GoodsReceiptService(db);
    
    const details = await goodsReceiptService.getGoodsReceiptWithDocuments(orderId);
    
    sendSuccess(res, details);
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Error getting details:', error);
    sendError(res, 500, 'Fehler beim Laden der Wareneingang-Details');
  }
});

/**
 * POST /api/goods-receipt/:orderId/upload-delivery-note
 * Upload eines einzelnen Lieferscheins
 */
// SECURITY FIX: Add authentication and audit logging for file upload
router.post('/:orderId/upload-delivery-note', 
  authenticateUser, 
  auditLog('DELIVERY_NOTE_UPLOAD', 'GOODS_RECEIPT_WRITE'), 
  upload.single('deliveryNote'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    const file = req.file;
    if (!file) {
      return sendError(res, 400, 'Keine Datei hochgeladen');
    }

    const db = new DatabaseStorage();
    const deliveryNoteService = new DeliveryNoteUploadService(db);
    
    // Metadaten aus Request Body extrahieren
    const metadata = {
      deliveryNoteNumber: req.body.deliveryNoteNumber,
      deliveryDate: req.body.deliveryDate,
      notes: req.body.notes,
      uploadedBy: req.body.uploadedBy ? parseInt(req.body.uploadedBy) : undefined,
      uploadedByName: req.body.uploadedByName
    };

    const uploadedFile = {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    };

    const result = await deliveryNoteService.uploadDeliveryNote(orderId, uploadedFile, metadata);
    
    if (result.success) {
      sendSuccess(res, {
        deliveryNoteId: result.deliveryNoteId,
        fileUrl: result.fileUrl,
        fileName: result.fileName
      }, 'Lieferschein erfolgreich hochgeladen');
    } else {
      sendError(res, 400, result.error || 'Upload fehlgeschlagen');
    }
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Upload error:', error);
    sendError(res, 500, 'Serverfehler beim Upload');
  }
});

/**
 * POST /api/goods-receipt/:orderId/upload-multiple-delivery-notes
 * Upload mehrerer Lieferscheine gleichzeitig
 */
// SECURITY FIX: Add authentication and audit logging for multiple file upload
router.post('/:orderId/upload-multiple-delivery-notes', 
  authenticateUser, 
  auditLog('MULTIPLE_DELIVERY_NOTES_UPLOAD', 'GOODS_RECEIPT_WRITE'), 
  upload.array('deliveryNotes', 5), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return sendError(res, 400, 'Keine Dateien hochgeladen');
    }

    const db = new DatabaseStorage();
    const deliveryNoteService = new DeliveryNoteUploadService(db);
    
    // Metadaten aus Request Body extrahieren
    const metadata = {
      deliveryNoteNumber: req.body.deliveryNoteNumber,
      deliveryDate: req.body.deliveryDate,
      notes: req.body.notes,
      uploadedBy: req.body.uploadedBy ? parseInt(req.body.uploadedBy) : undefined,
      uploadedByName: req.body.uploadedByName
    };

    const results = [];
    
    for (const file of files) {
      const uploadedFile = {
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      };

      const result = await deliveryNoteService.uploadDeliveryNote(orderId, uploadedFile, metadata);
      results.push({
        fileName: file.originalname,
        success: result.success,
        deliveryNoteId: result.deliveryNoteId,
        fileUrl: result.fileUrl,
        error: result.error
      });
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    sendSuccess(res, {
      results,
      successCount,
      totalCount,
      allSuccessful: successCount === totalCount
    }, `${successCount} von ${totalCount} Lieferscheinen erfolgreich hochgeladen`);

  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Multiple upload error:', error);
    sendError(res, 500, 'Serverfehler beim Upload');
  }
});

/**
 * GET /api/goods-receipt/:orderId/delivery-notes
 * Alle Lieferscheine einer Bestellung abrufen
 */
// SECURITY FIX: Add authentication and audit logging
router.get('/:orderId/delivery-notes', 
  authenticateUser, 
  auditLog('DELIVERY_NOTES_LIST', 'GOODS_RECEIPT_READ'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    const db = new DatabaseStorage();
    const deliveryNoteService = new DeliveryNoteUploadService(db);
    
    const deliveryNotes = await deliveryNoteService.getDeliveryNotes(orderId);
    
    sendSuccess(res, deliveryNotes);
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Error getting delivery notes:', error);
    sendError(res, 500, 'Fehler beim Laden der Lieferscheine');
  }
});

/**
 * DELETE /api/goods-receipt/delivery-notes/:noteId
 * Lieferschein löschen
 */
// SECURITY FIX: Add authentication and audit logging for delete operations
router.delete('/delivery-notes/:noteId', 
  authenticateUser, 
  auditLog('DELIVERY_NOTE_DELETE', 'GOODS_RECEIPT_DELETE'), 
  async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.noteId);
    
    if (isNaN(noteId)) {
      return sendError(res, 400, 'Ungültige Lieferschein-ID');
    }

    const userId = req.body.userId ? parseInt(req.body.userId) : undefined;

    const db = new DatabaseStorage();
    const deliveryNoteService = new DeliveryNoteUploadService(db);
    
    const result = await deliveryNoteService.deleteDeliveryNote(noteId, userId);
    
    if (result.success) {
      sendSuccess(res, { noteId }, 'Lieferschein erfolgreich gelöscht');
    } else {
      sendError(res, 400, result.error || 'Löschen fehlgeschlagen');
    }
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Delete error:', error);
    sendError(res, 500, 'Serverfehler beim Löschen');
  }
});

/**
 * POST /api/goods-receipt/:orderId/process
 * Einfacher Wareneingang ohne Dokumente - mit korrekter Per-Item-Verarbeitung
 */
router.post('/:orderId/process', 
  authenticateUser, 
  requireRole(['admin', 'manager']), 
  auditLog('GOODS_RECEIPT_PROCESS', 'GOODS_RECEIPT_WRITE'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    // Parse und validiere Wareneingang-Daten
    let goodsReceiptData;
    
    if (req.body.goodsReceiptData) {
      try {
        const parsedData = JSON.parse(req.body.goodsReceiptData);
        goodsReceiptData = goodsReceiptDataSchema.parse(parsedData);
      } catch (error) {
        console.error('[GOODS_RECEIPT] Error parsing/validating goodsReceiptData:', error);
        return sendError(res, 400, `Ungültige Wareneingang-Daten: ${error instanceof Error ? error.message : 'Validation failed'}`);
      }
    } else {
      // Legacy format support
      try {
        goodsReceiptData = goodsReceiptDataSchema.parse({
          items: req.body.items || [],
          notes: req.body.receiptNote || req.body.notes || ''
        });
      } catch (error) {
        console.error('[GOODS_RECEIPT] Error validating legacy format:', error);
        return sendError(res, 400, `Ungültige Wareneingang-Daten: ${error instanceof Error ? error.message : 'Validation failed'}`);
      }
    }

    if (goodsReceiptData.items.length === 0) {
      return sendError(res, 400, 'Keine Wareneingang-Items angegeben');
    }

    console.log(`📦 Wareneingang für Bestellung ${orderId} - verarbeite ${goodsReceiptData.items.length} Items`);

    const db = new DatabaseStorage();
    
    // Verwende Transaktion für konsistente Updates
    const result = await db.drizzle.transaction(async (tx) => {
      // 1. Hole aktuelle Bestelldaten zur Validierung
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));

      if (!order) {
        throw new Error(`Bestellung ${orderId} nicht gefunden`);
      }

      // 2. Validiere alle orderItemIds existieren in dieser Bestellung
      const orderItemIds = goodsReceiptData.items.map(item => item.orderItemId);
      const existingItems = await tx
        .select({ id: orderItems.id, quantity: orderItems.quantity })
        .from(orderItems)
        .where(
          eq(orderItems.orderId, orderId)
        );

      const existingItemIds = existingItems.map(item => item.id);
      const invalidItemIds = orderItemIds.filter(id => !existingItemIds.includes(id));
      
      if (invalidItemIds.length > 0) {
        throw new Error(`Ungültige orderItemIds für Bestellung ${orderId}: ${invalidItemIds.join(', ')}`);
      }

      let itemsProcessed = 0;
      let allItemsComplete = true;

      // 3. Update jedes Item INDIVIDUELL mit seinen eigenen Daten
      for (const item of goodsReceiptData.items) {
        if (item.quantityReceived < 0) {
          console.warn(`⚠️ Negative Menge für Item ${item.orderItemId}: ${item.quantityReceived}`);
          continue;
        }

        // Status basierend auf Mengenvergleich
        const itemStatus = item.quantityReceived >= item.quantityOrdered ? 'completed' : 'partial';
        
        if (itemStatus !== 'completed') {
          allItemsComplete = false;
        }

        await tx
          .update(orderItems)
          .set({ 
            status: itemStatus,
            quantityDelivered: item.quantityReceived
          })
          .where(eq(orderItems.id, item.orderItemId));

        itemsProcessed++;
        console.log(`✅ Item ${item.orderItemId}: ${item.quantityReceived}/${item.quantityOrdered} (${itemStatus})`);
      }

      // 4. Update Bestellstatus basierend auf Items
      const orderStatus = allItemsComplete ? 'received' : 'partially_received';
      
      await tx
        .update(orders)
        .set({ 
          status: orderStatus,
          actualDeliveryDate: new Date()
        })
        .where(eq(orders.id, orderId));

      return {
        success: true,
        orderId: orderId,
        orderNumber: order.orderNumber || `ORDER-${orderId}`,
        itemsProcessed,
        batchesCreated: 0, // Simple mode - keine Batches
        totalValue: 0, // Simple mode - kein Warenwert
        allItemsComplete,
        orderStatus,
        message: `Wareneingang erfolgreich verarbeitet (${itemsProcessed} Items, Status: ${orderStatus})`
      };
    });
    
    console.log(`✅ Wareneingang für Bestellung ${orderId} erfolgreich - ${result.itemsProcessed} Items verarbeitet`);
    sendSuccess(res, result, 'Wareneingang erfolgreich verarbeitet');
    
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Process error:', error);
    sendError(res, 500, `Serverfehler bei der Verarbeitung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
});

/**
 * POST /api/goods-receipt/:orderId/process-with-documents
 * Wareneingang mit Lieferscheinen verarbeiten
 */
router.post('/:orderId/process-with-documents', 
  authenticateUser, 
  requireRole(['admin', 'manager']), 
  auditLog('GOODS_RECEIPT_PROCESS_WITH_DOCUMENTS', 'GOODS_RECEIPT_WRITE'), 
  upload.array('deliveryNotes', 5), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    const files = req.files as Express.Multer.File[] || [];
    
    // Wareneingang-Items aus Request Body parsen
    // Frontend sendet goodsReceiptData als JSON string
    let goodsReceiptItems = [];
    let receiptNote = '';
    
    if (req.body.goodsReceiptData) {
      try {
        const goodsReceiptData = JSON.parse(req.body.goodsReceiptData);
        goodsReceiptItems = goodsReceiptData.items || [];
        receiptNote = goodsReceiptData.notes || '';
      } catch (error) {
        console.error('[GOODS_RECEIPT] Error parsing goodsReceiptData:', error);
        return sendError(res, 400, 'Ungültige Wareneingang-Daten');
      }
    } else {
      // Fallback für direktes Format
      goodsReceiptItems = JSON.parse(req.body.items || '[]');
      receiptNote = req.body.receiptNote || '';
    }
    
    // Metadaten für Lieferscheine
    const metadata = {
      deliveryNoteNumber: req.body.deliveryNoteNumber,
      deliveryDate: req.body.deliveryDate,
      notes: req.body.notes || receiptNote,
      uploadedBy: req.body.uploadedBy ? parseInt(req.body.uploadedBy) : undefined,
      uploadedByName: req.body.uploadedByName
    };

    // Dateien konvertieren
    const deliveryNotes = files.map(file => ({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    }));

    const db = new DatabaseStorage();
    const goodsReceiptService = new GoodsReceiptService(db);
    
    const data = {
      items: goodsReceiptItems,
      deliveryNotes,
      metadata
    };

    const result = await goodsReceiptService.processGoodsReceiptWithDocuments(orderId, data);
    
    if (result.success) {
      sendSuccess(res, result, 'Wareneingang mit Dokumenten erfolgreich verarbeitet');
    } else {
      sendError(res, 400, result.errorMessage || 'Verarbeitung fehlgeschlagen');
    }
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Process error:', error);
    sendError(res, 500, 'Serverfehler bei der Verarbeitung');
  }
});

/**
 * GET /api/goods-receipt/statistics
 * Upload-Statistiken abrufen
 */
router.get('/statistics', 
  authenticateUser, 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('GOODS_RECEIPT_STATISTICS', 'GOODS_RECEIPT_READ'), 
  async (req: Request, res: Response) => {
  try {
    const db = new DatabaseStorage();
    const deliveryNoteService = new DeliveryNoteUploadService(db);
    
    const stats = await deliveryNoteService.getUploadStatistics();
    
    sendSuccess(res, stats);
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Statistics error:', error);
    sendError(res, 500, 'Fehler beim Laden der Statistiken');
  }
});

// ========================================
// NEW ENHANCED GOODS RECEIPT ROUTES
// ========================================

/**
 * POST /api/goods-receipt/:orderId/process-enhanced
 * Erweiterte Wareneingangs-Verarbeitung mit allen neuen Features
 * - Lieferdatum (deliveryDate) Validierung
 * - MHD pro Item mit Batch-Erstellung
 * - Lagerauswahl (warehouseId)
 * - Erweiterte Qualitätskontrolle
 */
router.post('/:orderId/process-enhanced', 
  authenticateUser, 
  requireRole(['admin', 'manager']), 
  auditLog('GOODS_RECEIPT_PROCESS_ENHANCED', 'GOODS_RECEIPT_WRITE'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    console.log(`📦 [ENHANCED] Erweiterte Wareneingangs-Verarbeitung für Bestellung ${orderId}`);

    // Validiere und parse Request Body mit goodsReceiptDataSchema
    let goodsReceiptData;
    try {
      // Erwarte vollständige goodsReceiptData im Request Body
      goodsReceiptData = goodsReceiptDataSchema.parse({
        orderId,
        ...req.body
      });
    } catch (error) {
      console.error('[ENHANCED_GOODS_RECEIPT] Validierungsfehler:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ungültige Wareneingang-Daten';
      return sendError(res, 400, `Validierungsfehler: ${errorMessage}`);
    }

    console.log(`📦 Verarbeite ${goodsReceiptData.items.length} Artikel für Lager ${goodsReceiptData.warehouseId}`);
    console.log(`📅 Lieferdatum: ${goodsReceiptData.deliveryDate}`);

    const db = new DatabaseStorage();
    const goodsReceiptService = new GoodsReceiptService(db);
    
    // Verwende neue processEnhancedGoodsReceipt Methode
    const result = await goodsReceiptService.processEnhancedGoodsReceipt(goodsReceiptData);
    
    if (result.success) {
      console.log(`✅ Erweiterte Verarbeitung erfolgreich: ${result.itemsProcessed} Items, ${result.batchesCreated} Batches erstellt`);
      sendSuccess(res, result, 'Erweiterte Wareneingangs-Verarbeitung erfolgreich abgeschlossen');
    } else {
      console.error(`❌ Erweiterte Verarbeitung fehlgeschlagen: ${result.errorMessage}`);
      sendError(res, 400, result.errorMessage || 'Erweiterte Verarbeitung fehlgeschlagen');
    }
  } catch (error) {
    console.error('[ENHANCED_GOODS_RECEIPT_API] Unerwarteter Fehler:', error);
    sendError(res, 500, `Serverfehler bei der erweiterten Verarbeitung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
});

/**
 * GET /api/goods-receipt/:orderId/warehouses
 * Verfügbare Lager für eine Bestellung abrufen
 */
router.get('/:orderId/warehouses', 
  authenticateUser, 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('GOODS_RECEIPT_WAREHOUSES', 'GOODS_RECEIPT_READ'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    console.log(`🏬 Lade verfügbare Lager für Bestellung ${orderId}`);

    const db = new DatabaseStorage();
    const goodsReceiptService = new GoodsReceiptService(db);
    
    const warehouses = await goodsReceiptService.getWarehousesForOrder(orderId);
    
    console.log(`✅ ${warehouses.length} verfügbare Lager gefunden`);
    sendSuccess(res, warehouses, `${warehouses.length} verfügbare Lager gefunden`);
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Fehler beim Laden der Lager:', error);
    sendError(res, 500, 'Fehler beim Laden der verfügbaren Lager');
  }
});

/**
 * POST /api/goods-receipt/:orderId/validate
 * Validierung der Wareneingangs-Daten vor dem Speichern
 * Prüft Schema-Validität, MHD-Regeln, Lager-Verfügbarkeit etc.
 */
router.post('/:orderId/validate', 
  authenticateUser, 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('GOODS_RECEIPT_VALIDATE', 'GOODS_RECEIPT_READ'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    console.log(`🔍 Validiere Wareneingangs-Daten für Bestellung ${orderId}`);

    const db = new DatabaseStorage();
    const goodsReceiptService = new GoodsReceiptService(db);
    
    // Erweitere Request Body mit orderId für Validierung
    const dataToValidate = {
      orderId,
      ...req.body
    };
    
    const validationResult = await goodsReceiptService.validateGoodsReceiptData(dataToValidate);
    
    if (validationResult.isValid) {
      console.log(`✅ Validierung erfolgreich für Bestellung ${orderId}`);
      sendSuccess(res, {
        valid: true,
        data: validationResult.validatedData,
        warnings: validationResult.warnings
      }, 'Wareneingangs-Daten sind gültig');
    } else {
      console.log(`⚠️ Validierung fehlgeschlagen für Bestellung ${orderId}: ${validationResult.errors.length} Fehler`);
      res.status(400).json({
        success: false,
        valid: false,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        message: `Validierung fehlgeschlagen: ${validationResult.errors.length} Fehler gefunden`
      });
    }
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Validierungsfehler:', error);
    sendError(res, 500, 'Serverfehler bei der Validierung');
  }
});

/**
 * GET /api/goods-receipt/:orderId/enhanced-details
 * Erweiterte Wareneingang-Details mit allen neuen Features
 * - Lieferschein-Informationen
 * - Verfügbare Lager
 * - MHD-Tracking
 * - Qualitätsbewertungen
 */
router.get('/:orderId/enhanced-details', 
  authenticateUser, 
  requireRole(['admin', 'manager', 'employee']), 
  auditLog('GOODS_RECEIPT_ENHANCED_DETAILS', 'GOODS_RECEIPT_READ'), 
  async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    console.log(`📋 Lade erweiterte Wareneingang-Details für Bestellung ${orderId}`);

    const db = new DatabaseStorage();
    const goodsReceiptService = new GoodsReceiptService(db);
    
    const enhancedDetails = await goodsReceiptService.getEnhancedGoodsReceiptDetails(orderId);
    
    console.log(`✅ Erweiterte Details geladen für Bestellung ${orderId}`);
    sendSuccess(res, enhancedDetails, 'Erweiterte Wareneingang-Details erfolgreich geladen');
  } catch (error) {
    console.error('[GOODS_RECEIPT_API] Fehler beim Laden der erweiterten Details:', error);
    sendError(res, 500, 'Fehler beim Laden der erweiterten Wareneingang-Details');
  }
});

// ========================================
// ERROR HANDLER (MUST BE LAST)
// ========================================

/**
 * Error Handler für Multer
 */
router.use((error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 400, 'Datei ist zu groß (max. 10MB)');
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return sendError(res, 400, 'Zu viele Dateien (max. 5)');
    }
    return sendError(res, 400, `Upload-Fehler: ${error.message}`);
  }
  
  if (error.message.includes('Nur PDF, JPEG und PNG Dateien sind erlaubt')) {
    return sendError(res, 400, error.message);
  }
  
  console.error('[GOODS_RECEIPT_API] Unhandled error:', error);
  return sendError(res, 500, 'Unbekannter Serverfehler');
});

export default router;