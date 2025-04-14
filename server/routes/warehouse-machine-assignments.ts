import express, { Request, Response } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { machineWarehouseAssignments, machines, warehouses } from '@shared/schema';
import { reconcileWarehouseProducts } from '../services/warehouseReconciliation';

const router = express.Router();

// GET - Alle Lager-Automaten Zuordnungen abrufen
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = db.select({
      assignment: machineWarehouseAssignments,
      machine: machines,
      warehouse: warehouses
    })
    .from(machineWarehouseAssignments)
    .leftJoin(machines, eq(machineWarehouseAssignments.machineId, machines.id))
    .leftJoin(warehouses, eq(machineWarehouseAssignments.warehouseId, warehouses.id));
    
    const result = await query;
    
    // Formatieren der Ergebnisse
    const formattedAssignments = result.map(row => ({
      id: row.assignment.id,
      machineId: row.assignment.machineId,
      warehouseId: row.assignment.warehouseId,
      isDefault: row.assignment.isPrimary,
      machineName: row.machine?.name || 'Unbekannter Automat',
      machineType: row.machine?.type || 'Unbekannt',
      warehouseName: row.warehouse?.name || 'Unbekanntes Lager',
      location: row.machine?.location || 'Unbekannt',
      createdAt: row.assignment.createdAt,
      updatedAt: row.assignment.updatedAt
    }));
    
    res.json(formattedAssignments);
  } catch (error) {
    console.error('Fehler beim Abrufen der Lager-Automaten Zuordnungen:', error);
    res.status(500).json({ 
      error: 'Fehler beim Abrufen der Lager-Automaten Zuordnungen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST - Neue Lager-Automaten Zuordnung erstellen
router.post('/', async (req: Request, res: Response) => {
  try {
    const { warehouseId, machineId, isDefault } = req.body;
    
    if (!warehouseId || !machineId) {
      return res.status(400).json({ error: 'Lager-ID und Automaten-ID sind erforderlich' });
    }
    
    // Überprüfen, ob die Zuordnung bereits existiert
    const existingAssignment = await db.query.machineWarehouseAssignments.findFirst({
      where: and(
        eq(machineWarehouseAssignments.machineId, machineId),
        eq(machineWarehouseAssignments.warehouseId, warehouseId)
      )
    });
    
    if (existingAssignment) {
      return res.status(409).json({ error: 'Diese Zuordnung existiert bereits' });
    }
    
    // Wenn isDefault true ist, alle anderen Zuordnungen für diesen Automaten auf false setzen
    if (isDefault) {
      await db
        .update(machineWarehouseAssignments)
        .set({ isPrimary: false })
        .where(eq(machineWarehouseAssignments.machineId, machineId));
    }
    
    // Neue Zuordnung erstellen
    const newAssignment = await db
      .insert(machineWarehouseAssignments)
      .values({
        machineId,
        warehouseId,
        isPrimary: isDefault || false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    // Starte Lagerabgleich
    try {
      const reconcileResult = await reconcileWarehouseProducts(Number(warehouseId));
      console.log(`Lagerabgleich abgeschlossen: ${reconcileResult?.productsAdded || 0} neue Produkte hinzugefügt`);
    } catch (reconcileError) {
      console.error('Fehler beim Lagerabgleich nach Automaten-Zuordnung:', reconcileError);
    }
    
    res.status(201).json(newAssignment[0]);
  } catch (error) {
    console.error('Fehler beim Erstellen der Lager-Automaten Zuordnung:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen der Lager-Automaten Zuordnung',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE - Lager-Automaten Zuordnung löschen
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Ungültige Zuordnungs-ID' });
    }
    
    // Überprüfen, ob die Zuordnung existiert
    const existingAssignment = await db.query.machineWarehouseAssignments.findFirst({
      where: eq(machineWarehouseAssignments.id, id)
    });
    
    if (!existingAssignment) {
      return res.status(404).json({ error: 'Zuordnung nicht gefunden' });
    }
    
    // Zuordnung löschen
    await db
      .delete(machineWarehouseAssignments)
      .where(eq(machineWarehouseAssignments.id, id));
    
    res.json({ success: true, message: 'Zuordnung erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen der Lager-Automaten Zuordnung:', error);
    res.status(500).json({ 
      error: 'Fehler beim Löschen der Lager-Automaten Zuordnung',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;