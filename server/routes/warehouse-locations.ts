import express from 'express';
import { Router } from 'express';
import { db, rawDb } from '../db';

const router = Router();

// Standardlagerplätze, die für jedes Lager genutzt werden können
const defaultLocations = [
  { name: 'Hauptlager' },
  { name: 'Eingang' },
  { name: 'Ausgang' },
  { name: 'Theke' },
  { name: 'Kühlbereich' },
  { name: 'Ladebereich' },
  { name: 'Regal A' },
  { name: 'Regal B' },
  { name: 'Regal C' },
  { name: 'Sonderbereich' }
];

/**
 * Ruft alle Lagerplätze für ein bestimmtes Lager ab
 */
router.get('/warehouse-locations/:warehouseId', async (req, res) => {
  try {
    const { warehouseId } = req.params;
    
    if (!warehouseId || isNaN(Number(warehouseId))) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Versuche zuerst, benutzerdefinierte Lagerplätze aus der Datenbank zu laden
    const query = `
      SELECT DISTINCT location_in_warehouse as name 
      FROM inventory_items 
      WHERE warehouse_id = $1 
        AND location_in_warehouse IS NOT NULL 
        AND location_in_warehouse != ''
      ORDER BY name
    `;
    
    const result = await rawDb.query(query, [warehouseId]);
    
    // Kombiniere Datenbankeinträge mit Standardlagerplätzen
    let combinedLocations = [...defaultLocations];
    
    // Füge gefundene Lagerplätze hinzu, die nicht bereits in den Standard-Locations sind
    result.rows.forEach(row => {
      if (!combinedLocations.find(loc => loc.name === row.name)) {
        combinedLocations.push({ name: row.name });
      }
    });
    
    res.json(combinedLocations);
  } catch (error) {
    console.error('Fehler beim Abrufen der Lagerplätze:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lagerplätze',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Ruft alle Inventarelemente nach Lagerplatz für ein bestimmtes Lager ab
 */
router.get('/warehouse-locations/:warehouseId/inventory', async (req, res) => {
  try {
    const { warehouseId } = req.params;
    
    if (!warehouseId || isNaN(Number(warehouseId))) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }

    // Abfrage, um Inventarelemente nach Lagerplätzen gruppiert zu bekommen
    const query = `
      SELECT 
        location_in_warehouse as location,
        COUNT(id) as item_count,
        SUM(quantity) as total_quantity
      FROM inventory_items 
      WHERE warehouse_id = $1 
        AND location_in_warehouse IS NOT NULL 
        AND location_in_warehouse != ''
      GROUP BY location_in_warehouse
      ORDER BY location_in_warehouse
    `;
    
    const result = await rawDb.query(query, [warehouseId]);
    
    // Leere Ergebnismenge, wenn keine Elemente gefunden wurden
    if (result.rows.length === 0) {
      return res.json([]);
    }
    
    // Ergebnisse in ein benutzerfreundliches Format umwandeln
    const locationInventory = result.rows.reduce((acc, row) => {
      acc.push({
        location: row.location,
        itemCount: Number(row.item_count),
        totalQuantity: Number(row.total_quantity)
      });
      return acc;
    }, []);
    
    res.json(locationInventory);
  } catch (error) {
    console.error('Fehler beim Abrufen des Inventars nach Lagerplätzen:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen des Inventars nach Lagerplätzen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Ruft alle Inventarelemente für einen bestimmten Lagerplatz in einem Lager ab
 */
router.get('/warehouse-locations/:warehouseId/:location/items', async (req, res) => {
  try {
    const { warehouseId, location } = req.params;
    
    if (!warehouseId || isNaN(Number(warehouseId))) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }
    
    if (!location) {
      return res.status(400).json({ error: 'Lagerplatz muss angegeben werden' });
    }

    // Abfrage, um Inventarelemente für einen bestimmten Lagerplatz zu erhalten
    const query = `
      SELECT 
        i.id,
        i.product_id as "productId",
        p.name as "productName",
        i.quantity,
        i.min_quantity as "minQuantity",
        p.barcode,
        p.unit,
        i.location_in_warehouse as "locationInWarehouse",
        i.last_count_date as "lastCountDate"
      FROM inventory_items i
      JOIN products p ON i.product_id = p.id
      WHERE i.warehouse_id = $1 
        AND i.location_in_warehouse = $2
      ORDER BY p.name
    `;
    
    const result = await rawDb.query(query, [warehouseId, location]);
    
    // Inventarelemente formatieren
    const items = result.rows.map(row => ({
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      quantity: Number(row.quantity),
      minQuantity: row.minQuantity ? Number(row.minQuantity) : null,
      barcode: row.barcode,
      unit: row.unit || 'Stk.',
      locationInWarehouse: row.locationInWarehouse,
      lastCountDate: row.lastCountDate
    }));
    
    res.json(items);
  } catch (error) {
    console.error('Fehler beim Abrufen der Inventarelemente für den Lagerplatz:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Inventarelemente',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Aktualisiert den Lagerplatz für mehrere Inventarelemente
 */
router.post('/warehouse-locations/:warehouseId/move', async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { items, destinationLocation, notes } = req.body;
    
    if (!warehouseId || isNaN(Number(warehouseId))) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }
    
    if (!destinationLocation) {
      return res.status(400).json({ error: 'Ziel-Lagerplatz muss angegeben werden' });
    }
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Mindestens ein Element muss ausgewählt werden' });
    }

    // Beginne eine Transaktion
    await rawDb.query('BEGIN');
    
    try {
      // Für jedes Element: Speichere die alte Position, aktualisiere die Position und erstelle einen Bewegungseintrag
      for (const item of items) {
        // Hole aktuelle Position
        const currentLocationQuery = `
          SELECT location_in_warehouse FROM inventory_items 
          WHERE id = $1 AND warehouse_id = $2
        `;
        const currentLocationResult = await rawDb.query(currentLocationQuery, [item.id, warehouseId]);
        
        if (currentLocationResult.rows.length === 0) {
          throw new Error(`Inventarelement ${item.id} nicht gefunden`);
        }
        
        const sourceLocation = currentLocationResult.rows[0].location_in_warehouse;
        
        // Update Position
        const updateQuery = `
          UPDATE inventory_items 
          SET location_in_warehouse = $1 
          WHERE id = $2 AND warehouse_id = $3
          RETURNING *
        `;
        await rawDb.query(updateQuery, [destinationLocation, item.id, warehouseId]);
        
        // Erstelle Bewegungseintrag für die interne Umlagerung
        const movementQuery = `
          INSERT INTO inventory_movements (
            warehouse_id, product_id, quantity, movement_type, 
            source_location, destination_location, notes, performed_at
          ) VALUES (
            $1, $2, $3, 'INTERNAL', $4, $5, $6, NOW()
          )
        `;
        
        const movementNotes = notes || `Umlagerung von ${sourceLocation} nach ${destinationLocation}`;
        
        await rawDb.query(movementQuery, [
          warehouseId, 
          item.productId, 
          item.quantity, 
          sourceLocation, 
          destinationLocation, 
          movementNotes
        ]);
      }
      
      // Commit der Transaktion
      await rawDb.query('COMMIT');
      
      res.status(200).json({ 
        success: true, 
        message: `${items.length} Produkt(e) erfolgreich von umgelagert nach ${destinationLocation}`
      });
    } catch (error) {
      // Bei Fehler: Rollback der Transaktion
      await rawDb.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Fehler bei der Umlagerung von Produkten:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Umlagerung von Produkten',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;