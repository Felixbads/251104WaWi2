/**
 * Goods Receipt API Routes with Delivery Note Upload
 * Handles goods receipt processing and delivery note management
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { DatabaseStorage } from '../storage/database-storage';
import GoodsReceiptService from '../services/goodsReceiptService';
import DeliveryNoteUploadService from '../services/deliveryNoteUploadService';

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
router.get('/:orderId', async (req: Request, res: Response) => {
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
router.post('/:orderId/upload-delivery-note', upload.single('deliveryNote'), async (req: Request, res: Response) => {
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
router.post('/:orderId/upload-multiple-delivery-notes', upload.array('deliveryNotes', 5), async (req: Request, res: Response) => {
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
router.get('/:orderId/delivery-notes', async (req: Request, res: Response) => {
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
router.delete('/delivery-notes/:noteId', async (req: Request, res: Response) => {
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
 * POST /api/goods-receipt/:orderId/process-with-documents
 * Wareneingang mit Lieferscheinen verarbeiten
 */
router.post('/:orderId/process-with-documents', upload.array('deliveryNotes', 5), async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return sendError(res, 400, 'Ungültige Bestell-ID');
    }

    const files = req.files as Express.Multer.File[] || [];
    
    // Wareneingang-Items aus Request Body parsen
    const goodsReceiptItems = JSON.parse(req.body.items || '[]');
    const receiptNote = req.body.receiptNote || '';
    
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
router.get('/statistics', async (req: Request, res: Response) => {
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