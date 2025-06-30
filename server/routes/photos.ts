import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { rawDb } from '../db';

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const productId = req.params.productId;
    const extension = path.extname(file.originalname);
    const timestamp = Date.now();
    cb(null, `product-${productId}-${timestamp}${extension}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    console.log('[PHOTO_UPLOAD] File received:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilder sind erlaubt'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    fieldNameSize: 100,
    fieldSize: 5 * 1024 * 1024,
    files: 1
  }
});

// Upload photo for a supplier using Cloudinary
router.post('/upload/supplier/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    console.log('[SUPPLIER_CLOUDINARY_UPLOAD] Processing upload for supplier:', supplierId);
    
    const { data, filename, entityType = 'supplier' } = req.body;
    
    if (!data) {
      console.log('[SUPPLIER_CLOUDINARY_UPLOAD] No image data received');
      return res.status(400).json({ error: 'Keine Bilddaten empfangen' });
    }
    
    // Decode base64 image data
    const base64Data = data.replace(/^data:image\/[a-z]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    console.log('[SUPPLIER_CLOUDINARY_UPLOAD] Image size:', imageBuffer.length, 'bytes');
    
    // Upload to Cloudinary
    const { uploadSupplierPhoto } = await import('../services/cloudinaryService');
    const uploadResult = await uploadSupplierPhoto(imageBuffer, supplierId, filename);
    
    if (!uploadResult.success) {
      console.error('[SUPPLIER_CLOUDINARY_UPLOAD] Upload failed:', uploadResult.error);
      return res.status(500).json({ error: uploadResult.error || 'Upload fehlgeschlagen' });
    }
    
    // Update database with Cloudinary URL
    const { pool } = await import('../db');
    
    // Get current photos array
    const supplierResult = await pool.query(
      'SELECT photos FROM suppliers WHERE id = $1',
      [supplierId]
    );
    
    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lieferant nicht gefunden' });
    }
    
    const currentPhotos = supplierResult.rows[0].photos || [];
    const newPhotos = [...currentPhotos, uploadResult.urls.medium];
    
    // Update supplier with new photo URL
    await pool.query(
      'UPDATE suppliers SET photos = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newPhotos), supplierId]
    );
    
    console.log('[SUPPLIER_CLOUDINARY_UPLOAD] Upload successful for supplier:', supplierId);
    
    res.json({
      success: true,
      urls: uploadResult.urls,
      message: 'Lieferantenfoto erfolgreich hochgeladen'
    });

  } catch (error) {
    console.error('[SUPPLIER_CLOUDINARY_UPLOAD] Error:', error);
    res.status(500).json({ 
      error: 'Fehler beim Upload',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Upload photo for a product using Cloudinary
router.post('/upload/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    console.log('[CLOUDINARY_UPLOAD] Processing upload for product:', productId);
    
    const { imageData, filename } = req.body;
    
    if (!imageData) {
      console.log('[CLOUDINARY_UPLOAD] No image data received');
      return res.status(400).json({ error: 'Keine Bilddaten empfangen' });
    }
    
    // Decode base64 image data
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    console.log('[CLOUDINARY_UPLOAD] Image size:', imageBuffer.length, 'bytes');
    
    // Upload to Cloudinary
    const { uploadProductPhoto } = await import('../services/cloudinaryService');
    const uploadResult = await uploadProductPhoto(imageBuffer, productId, filename);
    
    if (!uploadResult.success) {
      console.error('[CLOUDINARY_UPLOAD] Upload failed:', uploadResult.error);
      return res.status(500).json({ error: uploadResult.error || 'Upload fehlgeschlagen' });
    }
    
    // Update database with Cloudinary URL
    const { pool } = await import('../db');
    const result = await pool.query(
      'UPDATE products SET photo_url = $1, photos = CASE WHEN photos IS NULL THEN ARRAY[$2] ELSE photos || ARRAY[$2] END WHERE id = $3 RETURNING *',
      [uploadResult.url, uploadResult.url, productId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }
    
    console.log('[CLOUDINARY_UPLOAD] Database updated successfully');
    
    res.json({
      success: true,
      photoPath: uploadResult.url,
      cloudinaryUrl: uploadResult.url,
      publicId: uploadResult.publicId,
      message: 'Foto erfolgreich zu Cloudinary hochgeladen',
      fileSize: imageBuffer.length,
      product: result.rows[0]
    });

  } catch (error) {
    console.error('[CLOUDINARY_UPLOAD] Upload error:', error);
    res.status(500).json({ 
      error: 'Fehler beim Hochladen des Fotos',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get product photo
router.get('/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    
    const { pool } = await import('../db');
    const result = await pool.query(
      'SELECT photo_url FROM products WHERE id = $1',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    const photoUrl = result.rows[0].photo_url;
    
    if (photoUrl) {
      res.json({ 
        hasPhoto: true, 
        photoPath: photoUrl,
        filename: path.basename(photoUrl)
      });
    } else {
      res.json({ 
        hasPhoto: false, 
        photoPath: null,
        filename: null 
      });
    }

  } catch (error) {
    console.error('Fehler beim Abrufen des Fotos:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen des Fotos',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;