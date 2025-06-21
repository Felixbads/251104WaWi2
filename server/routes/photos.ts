import { Router, Request, Response } from 'express';
import { uploadPhotos, getPhotoUrl, deletePhotoFile } from '../middleware/fileUpload';
import path from 'path';

const router = Router();

// Upload photos for suppliers or products
router.post('/upload', uploadPhotos.array('photos', 10), (req: Request, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).json({
        success: false,
        error: 'Keine Dateien hochgeladen'
      });
    }

    const uploadedPhotos = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      url: getPhotoUrl(file.filename),
      size: file.size
    }));

    res.json({
      success: true,
      photos: uploadedPhotos
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Hochladen der Fotos'
    });
  }
});

// Delete a photo
router.delete('/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent path traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        success: false,
        error: 'Ungültiger Dateiname'
      });
    }

    deletePhotoFile(filename);
    
    res.json({
      success: true,
      message: 'Foto erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Photo deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Löschen des Fotos'
    });
  }
});

export default router;