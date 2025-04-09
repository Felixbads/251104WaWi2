/**
 * API-Routen für Lagerplätze
 * Diese Routen stellen Funktionen zur Verfügung, um Lagerplätze zu verwalten
 * und abzufragen, an denen Produkte gelagert werden können.
 */

import express, { Request, Response } from 'express';
import { db, rawDb } from '../storage';
import { eq } from 'drizzle-orm';
import { inventoryItems } from '@shared/schema';

const router = express.Router();

// GET /api/warehouse-locations - Alle verfügbaren Lagerplätze abrufen
router.get('/warehouse-locations', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    
    // Suche nach verfügbaren Lagerplätzen für ein bestimmtes Lager
    if (warehouseId) {
      // SQL-Abfrage, um alle Lagerplätze des angegebenen Lagers zu finden
      const query = `
        SELECT DISTINCT location_in_warehouse as location
        FROM inventory_items 
        WHERE warehouse_id = $1 
          AND location_in_warehouse IS NOT NULL 
          AND location_in_warehouse != ''
        ORDER BY location_in_warehouse
      `;
      
      const result = await rawDb.query(query, [warehouseId]);
      const locations = result.rows.map(row => row.location);
      
      return res.json(locations);
    }
    
    // Wenn kein Lager angegeben, holen wir alle Lagerplätze aus allen Lagern
    const query = `
      SELECT 
        warehouse_id as "warehouseId", 
        w.name as "warehouseName",
        location_in_warehouse as location,
        COUNT(*) as product_count
      FROM 
        inventory_items i
      JOIN 
        warehouses w ON i.warehouse_id = w.id
      WHERE 
        location_in_warehouse IS NOT NULL 
        AND location_in_warehouse != ''
      GROUP BY 
        warehouse_id, w.name, location_in_warehouse
      ORDER BY 
        warehouse_id, location_in_warehouse
    `;
    
    const result = await rawDb.query(query);
    
    // Ergebnisse in eine übersichtlichere Struktur umwandeln
    const locationsByWarehouse = result.rows.reduce((acc, row) => {
      const warehouseId = row.warehouseId;
      
      if (!acc[warehouseId]) {
        acc[warehouseId] = {
          id: warehouseId,
          name: row.warehouseName,
          locations: []
        };
      }
      
      acc[warehouseId].locations.push({
        name: row.location,
        productCount: row.product_count
      });
      
      return acc;
    }, {});
    
    return res.json(Object.values(locationsByWarehouse));
  } catch (error) {
    console.error("Fehler beim Abrufen der Lagerplätze:", error);
    res.status(500).json({ 
      error: "Lagerplätze konnten nicht geladen werden", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET /api/warehouse-locations/:warehouseId - Lagerplätze für ein bestimmtes Lager abrufen
router.get('/warehouse-locations/:warehouseId', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: "Ungültige Lager-ID" });
    }
    
    // SQL-Abfrage, um alle Lagerplätze eines Lagers mit Produktanzahl zu finden
    const query = `
      SELECT 
        location_in_warehouse as location,
        COUNT(*) as product_count
      FROM 
        inventory_items 
      WHERE 
        warehouse_id = $1 
        AND location_in_warehouse IS NOT NULL 
        AND location_in_warehouse != ''
      GROUP BY 
        location_in_warehouse
      ORDER BY 
        location_in_warehouse
    `;
    
    const result = await rawDb.query(query, [warehouseId]);
    const locations = result.rows.map(row => ({
      name: row.location,
      productCount: parseInt(row.product_count)
    }));
    
    return res.json(locations);
  } catch (error) {
    console.error(`Fehler beim Abrufen der Lagerplätze für Lager ${req.params.warehouseId}:`, error);
    res.status(500).json({ 
      error: "Lagerplätze konnten nicht geladen werden", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET /api/warehouse-locations/:warehouseId/:location/products - Produkte an einem bestimmten Lagerplatz
router.get('/warehouse-locations/:warehouseId/:location/products', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const location = req.params.location;
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: "Ungültige Lager-ID" });
    }
    
    // SQL-Abfrage für Produkte an einem bestimmten Lagerplatz
    const query = `
      SELECT 
        i.*, 
        p.name as product_name, 
        p.description as product_description,
        p.unit as product_unit
      FROM 
        inventory_items i
      JOIN 
        products p ON i.product_id = p.id
      WHERE 
        i.warehouse_id = $1 
        AND i.location_in_warehouse = $2
      ORDER BY 
        p.name
    `;
    
    const result = await rawDb.query(query, [warehouseId, location]);
    
    // Produkte in ein benutzerfreundliches Format umwandeln
    const products = result.rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      description: row.product_description,
      quantity: row.quantity,
      unit: row.product_unit || 'Stk.',
      minQuantity: row.min_quantity,
      location: row.location_in_warehouse,
      warehouseId: row.warehouse_id,
      status: row.status,
      lastCountDate: row.last_count_date
    }));
    
    return res.json(products);
  } catch (error) {
    console.error(`Fehler beim Abrufen der Produkte für Lagerplatz ${req.params.location}:`, error);
    res.status(500).json({ 
      error: "Produkte konnten nicht geladen werden", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST /api/warehouse-locations/:warehouseId - Neuen Lagerplatz hinzufügen
router.post('/warehouse-locations/:warehouseId', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const { name } = req.body;
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: "Ungültige Lager-ID" });
    }
    
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: "Lagerplatzname ist erforderlich" });
    }
    
    // Prüfen, ob der Lagerplatz bereits existiert
    const existingQuery = `
      SELECT COUNT(*) as count
      FROM inventory_items
      WHERE warehouse_id = $1 AND location_in_warehouse = $2
    `;
    
    const existingResult = await rawDb.query(existingQuery, [warehouseId, name]);
    const exists = parseInt(existingResult.rows[0].count) > 0;
    
    if (exists) {
      return res.status(409).json({ 
        error: "Lagerplatz existiert bereits", 
        message: `Der Lagerplatz '${name}' existiert bereits in diesem Lager.` 
      });
    }
    
    // In diesem Fall brauchen wir eigentlich keine Datenbankoperation, da Lagerplätze
    // implizit durch Zuordnung zu Produkten entstehen. Für die API-Vollständigkeit
    // könnten wir aber einen "Platzhalter" mit einem speziellen Produktcode anlegen.
    
    // Stattdessen senden wir einfach eine Erfolgsbestätigung zurück
    return res.status(201).json({ 
      success: true, 
      message: `Lagerplatz '${name}' wurde angelegt und kann nun Produkten zugewiesen werden.`,
      location: name
    });
  } catch (error) {
    console.error(`Fehler beim Anlegen des Lagerplatzes:`, error);
    res.status(500).json({ 
      error: "Lagerplatz konnte nicht angelegt werden", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// PUT /api/warehouse-locations/:warehouseId/:location - Lagerplatz umbenennen
router.put('/warehouse-locations/:warehouseId/:location', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const oldLocation = req.params.location;
    const { newName } = req.body;
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: "Ungültige Lager-ID" });
    }
    
    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return res.status(400).json({ error: "Neuer Lagerplatzname ist erforderlich" });
    }
    
    // Prüfen, ob der neue Lagerplatzname bereits existiert
    const existingQuery = `
      SELECT COUNT(*) as count
      FROM inventory_items
      WHERE warehouse_id = $1 AND location_in_warehouse = $2
    `;
    
    const existingResult = await rawDb.query(existingQuery, [warehouseId, newName]);
    const exists = parseInt(existingResult.rows[0].count) > 0;
    
    if (exists) {
      return res.status(409).json({ 
        error: "Lagerplatz existiert bereits", 
        message: `Der Lagerplatz '${newName}' existiert bereits in diesem Lager.` 
      });
    }
    
    // Alle Produkte am alten Lagerplatz dem neuen Lagerplatz zuweisen
    const updateQuery = `
      UPDATE inventory_items
      SET location_in_warehouse = $1
      WHERE warehouse_id = $2 AND location_in_warehouse = $3
    `;
    
    const result = await rawDb.query(updateQuery, [newName, warehouseId, oldLocation]);
    
    return res.json({ 
      success: true, 
      message: `Lagerplatz von '${oldLocation}' zu '${newName}' umbenannt.`,
      oldLocation,
      newLocation: newName,
      updatedProducts: result.rowCount
    });
  } catch (error) {
    console.error(`Fehler beim Umbenennen des Lagerplatzes:`, error);
    res.status(500).json({ 
      error: "Lagerplatz konnte nicht umbenannt werden", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// DELETE /api/warehouse-locations/:warehouseId/:location - Lagerplatz löschen
router.delete('/warehouse-locations/:warehouseId/:location', async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId);
    const location = req.params.location;
    
    if (isNaN(warehouseId)) {
      return res.status(400).json({ error: "Ungültige Lager-ID" });
    }
    
    // Prüfen, ob noch Produkte an diesem Lagerplatz existieren
    const checkQuery = `
      SELECT COUNT(*) as count
      FROM inventory_items
      WHERE warehouse_id = $1 AND location_in_warehouse = $2
    `;
    
    const checkResult = await rawDb.query(checkQuery, [warehouseId, location]);
    const productCount = parseInt(checkResult.rows[0].count);
    
    if (productCount > 0) {
      // Option 1: Wir setzen den Lagerplatz auf NULL für alle betroffenen Produkte
      const updateQuery = `
        UPDATE inventory_items
        SET location_in_warehouse = NULL
        WHERE warehouse_id = $1 AND location_in_warehouse = $2
      `;
      
      const result = await rawDb.query(updateQuery, [warehouseId, location]);
      
      return res.json({ 
        success: true, 
        message: `Lagerplatz '${location}' wurde gelöscht. ${result.rowCount} Produkte wurden dem Hauptlager zugewiesen.`,
        affectedProducts: result.rowCount
      });
      
      // Option 2: Alternativ könnten wir einen Fehler zurückgeben,
      // wenn noch Produkte an diesem Lagerplatz sind:
      /*
      return res.status(409).json({
        error: "Lagerplatz enthält noch Produkte",
        message: `Lagerplatz '${location}' enthält noch ${productCount} Produkte und kann nicht gelöscht werden.`,
        productCount
      });
      */
    } else {
      // Da keine Produkte mehr an diesem Lagerplatz existieren,
      // gibt es eigentlich keine Datenbankeinträge zu löschen (Lagerplätze sind
      // implizit durch ihre Verwendung definiert)
      return res.json({ 
        success: true, 
        message: `Lagerplatz '${location}' wurde gelöscht.`,
        affectedProducts: 0
      });
    }
  } catch (error) {
    console.error(`Fehler beim Löschen des Lagerplatzes:`, error);
    res.status(500).json({ 
      error: "Lagerplatz konnte nicht gelöscht werden", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;