/**
 * Delivery Note Upload Service
 * Handles upload and management of delivery notes (PDF, JPEG, PNG)
 * for goods receipt processes
 */

import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { DatabaseClient } from '../storage/database-storage';
import { deliveryNotes, orders, InsertDeliveryNote } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';

// Configure Cloudinary (reuse existing config)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dzl0viskw',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface DeliveryNoteUploadResult {
  success: boolean;
  deliveryNoteId?: number;
  fileUrl?: string;
  fileName?: string;
  error?: string;
}

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface DeliveryNoteMetadata {
  deliveryNoteNumber?: string;
  deliveryDate?: string;
  notes?: string;
  uploadedBy?: number;
  uploadedByName?: string;
}

class DeliveryNoteUploadService {
  private db: DatabaseClient;
  private localUploadsPath: string;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.localUploadsPath = path.join(process.cwd(), 'uploads', 'delivery-notes');
    this.ensureDirectoryExists();
  }

  /**
   * Stelle sicher, dass das Upload-Verzeichnis existiert
   */
  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.localUploadsPath, { recursive: true });
    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Error creating directory:', error);
    }
  }

  /**
   * Validiere Dateityp und -größe
   */
  private validateFile(file: UploadedFile): { valid: boolean; error?: string } {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg', 
      'image/jpg',
      'image/png'
    ];

    const maxFileSize = 10 * 1024 * 1024; // 10MB

    if (!allowedMimeTypes.includes(file.mimeType)) {
      return {
        valid: false,
        error: 'Nur PDF, JPEG und PNG Dateien sind erlaubt'
      };
    }

    if (file.size > maxFileSize) {
      return {
        valid: false,
        error: 'Datei ist zu groß (max. 10MB)'
      };
    }

    return { valid: true };
  }

  /**
   * Generiere eindeutigen Dateinamen
   */
  private generateFileName(orderId: number, originalName: string): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    return `delivery-note-${orderId}-${timestamp}-${random}${ext}`;
  }

  /**
   * Upload zu Cloudinary (für PDF und Bilder)
   */
  private async uploadToCloudinary(
    file: UploadedFile, 
    orderId: number, 
    fileName: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      console.log(`[DELIVERY_NOTE_UPLOAD] Uploading to Cloudinary: ${fileName}`);
      
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const folderPath = `delivery-notes/${year}/${month}/${orderId}`;

      // Für Bilder: Optimierung mit Sharp
      let processedBuffer = file.buffer;
      let resourceType: 'image' | 'raw' = 'raw';
      
      if (file.mimeType.startsWith('image/')) {
        resourceType = 'image';
        
        // Bild-Optimierung nur für Bilder > 1MB
        if (file.size > 1024 * 1024) {
          processedBuffer = await sharp(file.buffer)
            .resize(1200, 1200, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 85 })
            .toBuffer();
        }
      }

      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: folderPath,
            public_id: path.basename(fileName, path.extname(fileName)),
            use_filename: true,
            unique_filename: false,
            overwrite: false
          },
          (error, result) => {
            if (error) {
              console.error('[DELIVERY_NOTE_UPLOAD] Cloudinary error:', error);
              reject(error);
            } else {
              console.log('[DELIVERY_NOTE_UPLOAD] Cloudinary success:', result?.secure_url);
              resolve(result);
            }
          }
        ).end(processedBuffer);
      });

      return {
        success: true,
        url: result.secure_url
      };

    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Cloudinary upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload fehlgeschlagen'
      };
    }
  }

  /**
   * Lokale Backup-Speicherung
   */
  private async saveLocalBackup(
    file: UploadedFile, 
    orderId: number, 
    fileName: string
  ): Promise<string | null> {
    try {
      const orderDir = path.join(this.localUploadsPath, orderId.toString());
      await fs.mkdir(orderDir, { recursive: true });
      
      const filePath = path.join(orderDir, fileName);
      await fs.writeFile(filePath, file.buffer);
      
      console.log(`[DELIVERY_NOTE_UPLOAD] Local backup saved: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Local backup failed:', error);
      return null;
    }
  }

  /**
   * Hauptfunktion: Lieferschein hochladen
   */
  async uploadDeliveryNote(
    orderId: number,
    file: UploadedFile,
    metadata: DeliveryNoteMetadata = {}
  ): Promise<DeliveryNoteUploadResult> {
    try {
      console.log(`[DELIVERY_NOTE_UPLOAD] Starting upload for order ${orderId}`);

      // 1. Datei validieren
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // 2. Prüfen, ob Bestellung existiert
      const [order] = await this.db.drizzle
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        return {
          success: false,
          error: `Bestellung ${orderId} nicht gefunden`
        };
      }

      // 3. Dateinamen generieren
      const fileName = this.generateFileName(orderId, file.originalName);

      // 4. Upload zu Cloudinary
      const cloudinaryResult = await this.uploadToCloudinary(file, orderId, fileName);
      
      if (!cloudinaryResult.success) {
        return {
          success: false,
          error: cloudinaryResult.error || 'Upload fehlgeschlagen'
        };
      }

      // 5. Lokales Backup (optional)
      const localPath = await this.saveLocalBackup(file, orderId, fileName);

      // 6. Datensatz in Datenbank erstellen
      const deliveryNoteData: InsertDeliveryNote = {
        orderId,
        fileName,
        originalFileName: file.originalName,
        fileSize: file.size,
        mimeType: file.mimeType,
        fileUrl: cloudinaryResult.url!,
        filePath: localPath,
        deliveryNoteNumber: metadata.deliveryNoteNumber,
        deliveryDate: metadata.deliveryDate ? new Date(metadata.deliveryDate) : null,
        uploadedBy: metadata.uploadedBy,
        uploadedByName: metadata.uploadedByName,
        notes: metadata.notes,
        isProcessed: false,
        isVisible: true
      };

      const [savedDeliveryNote] = await this.db.drizzle
        .insert(deliveryNotes)
        .values(deliveryNoteData)
        .returning({ id: deliveryNotes.id });

      // 7. Bestellung aktualisieren
      await this.updateOrderDeliveryNoteStatus(orderId);

      console.log(`[DELIVERY_NOTE_UPLOAD] Successfully uploaded delivery note ${savedDeliveryNote.id}`);

      return {
        success: true,
        deliveryNoteId: savedDeliveryNote.id,
        fileUrl: cloudinaryResult.url,
        fileName
      };

    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unbekannter Fehler'
      };
    }
  }

  /**
   * Bestellungs-Lieferschein-Status aktualisieren
   */
  private async updateOrderDeliveryNoteStatus(orderId: number): Promise<void> {
    try {
      // Anzahl der Lieferscheine für diese Bestellung zählen
      const deliveryNoteCount = await this.db.drizzle
        .select({ count: deliveryNotes.id })
        .from(deliveryNotes)
        .where(
          and(
            eq(deliveryNotes.orderId, orderId),
            eq(deliveryNotes.isVisible, true)
          )
        );

      const count = deliveryNoteCount.length;

      // Bestellung aktualisieren
      await this.db.drizzle
        .update(orders)
        .set({
          deliveryNoteUploaded: count > 0,
          deliveryNoteCount: count,
          lastDeliveryNoteUpload: new Date()
        })
        .where(eq(orders.id, orderId));

      console.log(`[DELIVERY_NOTE_UPLOAD] Updated order ${orderId} delivery note status: ${count} notes`);
    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Failed to update order status:', error);
    }
  }

  /**
   * Alle Lieferscheine einer Bestellung abrufen
   */
  async getDeliveryNotes(orderId: number): Promise<any[]> {
    try {
      const notes = await this.db.drizzle
        .select()
        .from(deliveryNotes)
        .where(
          and(
            eq(deliveryNotes.orderId, orderId),
            eq(deliveryNotes.isVisible, true)
          )
        )
        .orderBy(deliveryNotes.uploadedAt);

      return notes;
    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Failed to get delivery notes:', error);
      return [];
    }
  }

  /**
   * Lieferschein löschen
   */
  async deleteDeliveryNote(noteId: number, userId?: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Lieferschein finden
      const [note] = await this.db.drizzle
        .select()
        .from(deliveryNotes)
        .where(eq(deliveryNotes.id, noteId))
        .limit(1);

      if (!note) {
        return { success: false, error: 'Lieferschein nicht gefunden' };
      }

      // Soft-Delete (isVisible = false)
      await this.db.drizzle
        .update(deliveryNotes)
        .set({ 
          isVisible: false,
          updatedAt: new Date()
        })
        .where(eq(deliveryNotes.id, noteId));

      // Bestellungs-Status aktualisieren
      await this.updateOrderDeliveryNoteStatus(note.orderId);

      console.log(`[DELIVERY_NOTE_UPLOAD] Deleted delivery note ${noteId}`);
      return { success: true };

    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Delete failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Löschen fehlgeschlagen'
      };
    }
  }

  /**
   * Lieferscheine für Lieferantenportal abrufen
   */
  async getDeliveryNotesForSupplier(orderId: number, supplierId: number): Promise<any[]> {
    try {
      // Prüfen, ob Bestellung zu diesem Lieferanten gehört
      const [order] = await this.db.drizzle
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.supplierId, supplierId)
          )
        )
        .limit(1);

      if (!order) {
        return [];
      }

      // Lieferscheine abrufen (nur sichtbare)
      const notes = await this.db.drizzle
        .select({
          id: deliveryNotes.id,
          fileName: deliveryNotes.fileName,
          originalFileName: deliveryNotes.originalFileName,
          fileSize: deliveryNotes.fileSize,
          mimeType: deliveryNotes.mimeType,
          fileUrl: deliveryNotes.fileUrl,
          deliveryNoteNumber: deliveryNotes.deliveryNoteNumber,
          deliveryDate: deliveryNotes.deliveryDate,
          uploadedAt: deliveryNotes.uploadedAt,
          notes: deliveryNotes.notes
        })
        .from(deliveryNotes)
        .where(
          and(
            eq(deliveryNotes.orderId, orderId),
            eq(deliveryNotes.isVisible, true)
          )
        )
        .orderBy(deliveryNotes.uploadedAt);

      return notes;
    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Failed to get supplier delivery notes:', error);
      return [];
    }
  }

  /**
   * Statistiken über hochgeladene Lieferscheine
   */
  async getUploadStatistics(): Promise<{
    totalUploads: number;
    totalSizeBytes: number;
    avgFileSizeBytes: number;
    fileTypeBreakdown: Record<string, number>;
  }> {
    try {
      const stats = await this.db.drizzle
        .select()
        .from(deliveryNotes)
        .where(eq(deliveryNotes.isVisible, true));

      const totalUploads = stats.length;
      const totalSizeBytes = stats.reduce((sum, note) => sum + (note.fileSize || 0), 0);
      const avgFileSizeBytes = totalUploads > 0 ? totalSizeBytes / totalUploads : 0;

      const fileTypeBreakdown: Record<string, number> = {};
      stats.forEach(note => {
        const mimeType = note.mimeType || 'unknown';
        fileTypeBreakdown[mimeType] = (fileTypeBreakdown[mimeType] || 0) + 1;
      });

      return {
        totalUploads,
        totalSizeBytes,
        avgFileSizeBytes,
        fileTypeBreakdown
      };
    } catch (error) {
      console.error('[DELIVERY_NOTE_UPLOAD] Failed to get statistics:', error);
      return {
        totalUploads: 0,
        totalSizeBytes: 0,
        avgFileSizeBytes: 0,
        fileTypeBreakdown: {}
      };
    }
  }
}

export default DeliveryNoteUploadService;