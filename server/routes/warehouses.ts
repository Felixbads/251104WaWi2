import express, { Request, Response } from 'express';
import { db } from '../db';
import { warehouses } from '@shared/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { storage } from '../storage';

const router = express.Router();

// GET - Alle Lager abrufen (mit Paginierung, Suche und Statusfilterung)
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || 'alle';

    console.log(`Warehouse query with params: Page=${page}, Limit=${limit}, Search="${search}", Status="${status}"`);

    // Basis-Query
    let query = db.select().from(warehouses);
    
    // Filter nach Status
    if (status && status !== 'alle') {
      query = query.where(eq(warehouses.status, status));
    }
    
    // Suchfilter hinzufügen
    if (search) {
      query = query.where(
        or(
          like(warehouses.name, `%${search}%`),
          like(warehouses.description || '', `%${search}%`),
          like(warehouses.address || '', `%${search}%`),
          like(warehouses.city || '', `%${search}%`)
        )
      );
    }
    
    // Zuerst die Gesamtanzahl der gefilterten Datensätze ermitteln
    const countQuery = db.select({ count: sql`count(*)` }).from(warehouses);
    if (status && status !== 'alle') {
      countQuery.where(eq(warehouses.status, status));
    }
    if (search) {
      countQuery.where(
        or(
          like(warehouses.name, `%${search}%`),
          like(warehouses.description || '', `%${search}%`),
          like(warehouses.address || '', `%${search}%`),
          like(warehouses.city || '', `%${search}%`)
        )
      );
    }
    
    // Sortierung hinzufügen
    query = query.orderBy(asc(warehouses.name));
    
    // Paginierung hinzufügen
    query = query.limit(limit).offset(offset);
    
    // Daten abrufen
    const warehouseList = await query;
    
    // Wenn keine Ergebnisse und die SQL-Query funktioniert, versuche es mit der
    // Speicher-Implementierung (getWarehouses)
    if (warehouseList.length === 0) {
      console.log("No warehouses found in direct SQL query, trying storage.getWarehouses()");
      const storageWarehouses = await storage.getWarehouses();
      
      if (storageWarehouses && storageWarehouses.length > 0) {
        console.log(`Found ${storageWarehouses.length} warehouses using storage implementation`);
        
        // Einfache Filterung auf der Ergebnismenge
        let filteredWarehouses = storageWarehouses;
        
        if (status && status !== 'alle') {
          filteredWarehouses = filteredWarehouses.filter(w => w.status === status);
        }
        
        if (search) {
          const searchLower = search.toLowerCase();
          filteredWarehouses = filteredWarehouses.filter(w => 
            (w.name && w.name.toLowerCase().includes(searchLower)) ||
            (w.description && w.description.toLowerCase().includes(searchLower)) ||
            (w.address && w.address.toLowerCase().includes(searchLower)) ||
            (w.city && w.city.toLowerCase().includes(searchLower))
          );
        }
        
        // Sortierung
        filteredWarehouses.sort((a, b) => a.name.localeCompare(b.name));
        
        // Paginierung
        const paginatedWarehouses = filteredWarehouses.slice(offset, offset + limit);
        
        const totalCount = filteredWarehouses.length;
        const totalPages = Math.ceil(totalCount / limit);
        
        return res.json({
          data: paginatedWarehouses,
          meta: {
            page,
            limit,
            total: totalCount,
            pages: totalPages
          }
        });
      }
    }
    
    // Anzahl der Datensätze (mit Filtern)
    const [countResult] = await countQuery;
    const totalCount = countResult?.count || 0;
    const totalPages = Math.ceil(Number(totalCount) / limit);
    
    // Formatierte Antwort zurückgeben
    res.json({
      data: warehouseList,
      meta: {
        page,
        limit,
        total: Number(totalCount),
        pages: totalPages
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Lager:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lager',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET - Ein bestimmtes Lager abrufen
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }
    
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, id)
    });
    
    if (!warehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }
    
    res.json(warehouse);
  } catch (error) {
    console.error('Fehler beim Abrufen des Lagers:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen des Lagers',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST - Neues Lager erstellen
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, address, city, postalCode, status, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Lagername ist erforderlich' });
    }
    
    // Prüfen, ob ein Lager mit diesem Namen bereits existiert
    const existingWarehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.name, name)
    });
    
    if (existingWarehouse) {
      return res.status(409).json({ error: 'Ein Lager mit diesem Namen existiert bereits' });
    }
    
    // Neues Lager erstellen
    const newWarehouse = await db
      .insert(warehouses)
      .values({
        name,
        description,
        address,
        city,
        postalCode,
        status: status || 'active',
        notes,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    res.status(201).json(newWarehouse[0]);
  } catch (error) {
    console.error('Fehler beim Erstellen des Lagers:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Lagers',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT - Lager aktualisieren
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }
    
    const { name, description, address, city, postalCode, status, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Lagername ist erforderlich' });
    }
    
    // Prüfen, ob das Lager existiert
    const existingWarehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, id)
    });
    
    if (!existingWarehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }
    
    // Prüfen, ob der neue Name bereits von einem anderen Lager verwendet wird
    if (name !== existingWarehouse.name) {
      const warehouseWithSameName = await db.query.warehouses.findFirst({
        where: and(
          eq(warehouses.name, name),
          eq(warehouses.id, id, true) // not eq
        )
      });
      
      if (warehouseWithSameName) {
        return res.status(409).json({ error: 'Ein anderes Lager mit diesem Namen existiert bereits' });
      }
    }
    
    // Lager aktualisieren
    const updatedWarehouse = await db
      .update(warehouses)
      .set({
        name,
        description,
        address,
        city,
        postalCode,
        status,
        notes,
        updatedAt: new Date()
      })
      .where(eq(warehouses.id, id))
      .returning();
    
    res.json(updatedWarehouse[0]);
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Lagers:', error);
    res.status(500).json({ 
      error: 'Fehler beim Aktualisieren des Lagers',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE - Lager löschen
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Lager-ID' });
    }
    
    // Prüfen, ob das Lager existiert
    const existingWarehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, id)
    });
    
    if (!existingWarehouse) {
      return res.status(404).json({ error: 'Lager nicht gefunden' });
    }
    
    // Lager löschen
    await db
      .delete(warehouses)
      .where(eq(warehouses.id, id));
    
    res.json({ success: true, message: 'Lager erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen des Lagers:', error);
    res.status(500).json({ 
      error: 'Fehler beim Löschen des Lagers',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Füge hier im SQL Statement eine fehlende Import
import { sql } from 'drizzle-orm';

export default router;