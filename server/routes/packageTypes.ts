import express, { Request, Response } from 'express';
import { storage } from '../storage';
import { insertPackageTypeSchema } from '../../shared/schema';
import { z } from 'zod';

const router = express.Router();

// GET /api/package-types - Alle Package Types abrufen
router.get('/', async (req: Request, res: Response) => {
  try {
    const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
    const packageTypes = await storage.getPackageTypes({ isActive });
    res.json({ packageTypes });
  } catch (error) {
    console.error('Fehler beim Abrufen der Package Types:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Package Types', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET /api/package-types/names - Package Type Namen für Dropdown  
router.get('/names', async (req: Request, res: Response) => {
  try {
    console.log('[PACKAGE-TYPES] Fetching package type names for dropdown');
    
    const packageTypes = await storage.getPackageTypes({ isActive: true });
    
    // Format data for frontend dropdown
    const formattedTypes = packageTypes.map(pt => ({
      id: pt.id,
      name: pt.name,
      description: pt.description
    }));
    
    console.log('[PACKAGE-TYPES] Found', formattedTypes.length, 'package types');
    res.json(formattedTypes);
  } catch (error) {
    console.error('[PACKAGE-TYPES] Error fetching names:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Package Type Namen',
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET /api/package-types/:id - Package Type nach ID abrufen
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Package Type ID' });
    }

    const packageType = await storage.getPackageTypeById(id);
    if (!packageType) {
      return res.status(404).json({ error: 'Package Type nicht gefunden' });
    }

    res.json({ packageType });
  } catch (error) {
    console.error('Fehler beim Abrufen des Package Types:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen des Package Types', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST /api/package-types - Neuen Package Type erstellen
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validierung mit Zod-Schema
    const validatedData = insertPackageTypeSchema.parse(req.body);

    const newPackageType = await storage.createPackageType(validatedData);
    res.status(201).json({ 
      message: 'Package Type erfolgreich erstellt',
      packageType: newPackageType 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validierungsfehler', 
        details: error.errors 
      });
    }

    console.error('Fehler beim Erstellen des Package Types:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Package Types', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// PUT /api/package-types/:id - Package Type aktualisieren
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Package Type ID' });
    }

    // Validierung mit partiellem Schema
    const validatedData = insertPackageTypeSchema.partial().parse(req.body);

    const updatedPackageType = await storage.updatePackageType(id, validatedData);
    if (!updatedPackageType) {
      return res.status(404).json({ error: 'Package Type nicht gefunden' });
    }

    res.json({ 
      message: 'Package Type erfolgreich aktualisiert',
      packageType: updatedPackageType 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validierungsfehler', 
        details: error.errors 
      });
    }

    console.error('Fehler beim Aktualisieren des Package Types:', error);
    res.status(500).json({ 
      error: 'Fehler beim Aktualisieren des Package Types', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// DELETE /api/package-types/:id - Package Type löschen
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Package Type ID' });
    }

    const success = await storage.deletePackageType(id);
    if (!success) {
      return res.status(404).json({ error: 'Package Type nicht gefunden oder konnte nicht gelöscht werden' });
    }

    res.json({ message: 'Package Type erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen des Package Types:', error);
    res.status(500).json({ 
      error: 'Fehler beim Löschen des Package Types', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;