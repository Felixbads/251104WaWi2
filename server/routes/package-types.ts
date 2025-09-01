import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/package-types - Alle Package Types
router.get('/', async (req, res) => {
  try {
    // Hole aktive Package Types aus der Datenbank
    const result = await pool.query(`
      SELECT 
        id, 
        name, 
        description, 
        units_per_package,
        is_active 
      FROM package_types 
      WHERE is_active = true 
      ORDER BY sort_order ASC, name ASC
    `);
    
    const packageTypes = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      unitsPerPackage: row.units_per_package,
      isActive: row.is_active
    }));
    
    // Frontend erwartet das Array in einem packageTypes Wrapper
    res.json({ packageTypes });
  } catch (error) {
    console.error('Fehler beim Laden der Gebindearten:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Gebindearten',
      message: error.message 
    });
  }
});

// GET /api/package-types/names - Package Type Namen für Dropdown
router.get('/names', async (req, res) => {
  try {
    console.log('[PACKAGE-TYPES] Returning hardcoded package type names');
    
    // Hardcoded package types bis DB-Tabelle existiert
    const packageTypes = [
      { id: 1, name: 'Flasche', description: 'Glasflasche' },
      { id: 2, name: 'Dose', description: 'Aluminiumdose' },
      { id: 3, name: 'Tetrapack', description: 'Tetrapack Verpackung' },
      { id: 4, name: 'Plastikflasche', description: 'PET Flasche' },
      { id: 5, name: 'Glas', description: 'Konservenglas' },
      { id: 6, name: 'Tüte', description: 'Folientüte' },
      { id: 7, name: 'Karton', description: 'Pappkarton' }
    ];
    
    console.log('[PACKAGE-TYPES] Returning', packageTypes.length, 'hardcoded package types');
    res.json(packageTypes);
  } catch (error) {
    console.error('[PACKAGE-TYPES] Error:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Laden der Package Types',
      message: error.message 
    });
  }
});

// GET /api/package-types/:id - Einzelne Package Type
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[PACKAGE-TYPES] Fetching package type with ID:', id);
    
    // Hardcoded package types bis DB-Tabelle existiert
    const packageTypes = [
      { id: 1, name: 'Flasche', description: 'Glasflasche' },
      { id: 2, name: 'Dose', description: 'Aluminiumdose' },
      { id: 3, name: 'Tetrapack', description: 'Tetrapack Verpackung' },
      { id: 4, name: 'Plastikflasche', description: 'PET Flasche' },
      { id: 5, name: 'Glas', description: 'Konservenglas' },
      { id: 6, name: 'Tüte', description: 'Folientüte' },
      { id: 7, name: 'Karton', description: 'Pappkarton' }
    ];
    
    const packageType = packageTypes.find(pt => pt.id === parseInt(id));
    
    if (packageType) {
      res.json(packageType);
    } else {
      res.status(404).json({ error: 'Package Type nicht gefunden' });
    }
  } catch (error) {
    console.error('[PACKAGE-TYPES] Error:', error);
    res.status(500).json({ 
      error: 'Serverfehler beim Laden der Package Type',
      message: error.message 
    });
  }
});

export default router;