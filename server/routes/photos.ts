import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const productId = req.body.productId || req.params.productId;
    const extension = path.extname(file.originalname);
    cb(null, `product-${productId}-${Date.now()}${extension}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Nur Bilddateien sind erlaubt (JPEG, PNG, GIF, WebP)'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload photo for product
router.post('/upload/:productId', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const productId = parseInt(req.params.productId);
    const photoPath = `/uploads/products/${req.file.filename}`;

    // Update product with photo information
    const { pool } = await import('../db');
    
    // Update the description field to include photo info
    const updateQuery = `
      UPDATE products 
      SET description = COALESCE(description, '') || 
          CASE 
            WHEN description IS NULL OR description = '' THEN 'Foto hochgeladen: ${req.file.filename}'
            ELSE E'\nFoto hochgeladen: ${req.file.filename}'
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, [productId]);
    
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
      'SELECT description FROM products WHERE id = $1',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    const description = result.rows[0].description || '';
    const photoMatch = description.match(/Foto hochgeladen: ([^\n\r]+)/);
    
    if (photoMatch) {
      const filename = photoMatch[1];
      const photoPath = `/uploads/products/${filename}`;
      res.json({ 
        hasPhoto: true, 
        photoPath,
        filename 
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