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

// Upload photo for a product
router.post('/upload/:productId', upload.single('photo'), async (req, res) => {
  try {
    console.log('[PHOTO_UPLOAD] Upload attempt for product:', req.params.productId);
    
    if (!req.file) {
      console.log('[PHOTO_UPLOAD] No file received');
      return res.status(400).json({ error: 'Keine Datei empfangen' });
    }

    console.log('[PHOTO_UPLOAD] File successfully saved:', req.file.filename);

    const productId = parseInt(req.params.productId);
    const photoPath = `/uploads/products/${req.file.filename}`;

    // Update product with photo path
    const { pool } = await import('../db');
    const result = await pool.query(
      'UPDATE products SET photo_url = $1, photos = COALESCE(photos, \'[]\') || $2::jsonb WHERE id = $3 RETURNING *',
      [photoPath, JSON.stringify([photoPath]), productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    res.json({
      success: true,
      photoPath,
      filename: req.file.filename,
      product: result.rows[0]
    });

  } catch (error) {
    console.error('Fehler beim Hochladen des Fotos:', error);
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