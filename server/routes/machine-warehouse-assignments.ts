import express, { Request, Response } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { machineWarehouseAssignments } from '@shared/schema';
import { reconcileWarehouseProducts } from '../services/warehouseReconciliation';

const router = express.Router();

// Get all machine-warehouse assignments
router.get('/', async (req: Request, res: Response) => {
  try {
    const assignments = await db.query.machineWarehouseAssignments.findMany({
      with: {
        machine: true,
        warehouse: true
      }
    });

    // Format the result to include machine and warehouse names
    const formattedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      machineId: assignment.machineId,
      warehouseId: assignment.warehouseId,
      isPrimary: assignment.isPrimary,
      machineName: assignment.machine?.name || null,
      warehouseName: assignment.warehouse?.name || null,
      notes: assignment.notes
    }));

    res.json(formattedAssignments);
  } catch (error) {
    console.error('Failed to fetch machine-warehouse assignments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch machine-warehouse assignments',
      details: (error as Error).message 
    });
  }
});

// Get assignments by warehouse ID
router.get('/warehouse/:warehouseId', async (req: Request, res: Response) => {
  try {
    const { warehouseId } = req.params;
    
    if (!warehouseId || isNaN(parseInt(warehouseId))) {
      return res.status(400).json({ error: 'Invalid warehouse ID' });
    }
    
    const assignments = await db.query.machineWarehouseAssignments.findMany({
      where: eq(machineWarehouseAssignments.warehouseId, parseInt(warehouseId)),
      with: {
        machine: true
      }
    });

    // Format the result to include machine names
    const formattedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      machineId: assignment.machineId,
      warehouseId: assignment.warehouseId,
      isPrimary: assignment.isPrimary,
      machineName: assignment.machine?.name || null,
      notes: assignment.notes
    }));

    res.json(formattedAssignments);
  } catch (error) {
    console.error(`Failed to fetch assignments for warehouse ID ${req.params.warehouseId}:`, error);
    res.status(500).json({ 
      error: `Failed to fetch assignments for warehouse ID ${req.params.warehouseId}`,
      details: (error as Error).message 
    });
  }
});

// Get assignments by machine ID
router.get('/machine/:machineId', async (req: Request, res: Response) => {
  try {
    const { machineId } = req.params;
    
    if (!machineId || isNaN(parseInt(machineId))) {
      return res.status(400).json({ error: 'Invalid machine ID' });
    }
    
    const assignments = await db.query.machineWarehouseAssignments.findMany({
      where: eq(machineWarehouseAssignments.machineId, parseInt(machineId)),
      with: {
        warehouse: true
      }
    });

    // Format the result to include warehouse names
    const formattedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      machineId: assignment.machineId,
      warehouseId: assignment.warehouseId,
      isPrimary: assignment.isPrimary,
      warehouseName: assignment.warehouse?.name || null,
      notes: assignment.notes
    }));

    res.json(formattedAssignments);
  } catch (error) {
    console.error(`Failed to fetch assignments for machine ID ${req.params.machineId}:`, error);
    res.status(500).json({ 
      error: `Failed to fetch assignments for machine ID ${req.params.machineId}`,
      details: (error as Error).message 
    });
  }
});

// Create a new machine-warehouse assignment
router.post('/', async (req: Request, res: Response) => {
  try {
    const { machineId, warehouseId, isPrimary, notes } = req.body;
    
    if (!machineId || !warehouseId) {
      return res.status(400).json({ error: 'Machine ID and warehouse ID are required' });
    }
    
    // If isPrimary is true, make all other assignments for this machine non-primary
    if (isPrimary) {
      await db
        .update(machineWarehouseAssignments)
        .set({ isPrimary: false })
        .where(eq(machineWarehouseAssignments.machineId, machineId));
    }
    
    // Create the new assignment
    const newAssignment = await db
      .insert(machineWarehouseAssignments)
      .values({
        machineId,
        warehouseId,
        isPrimary: isPrimary || false,
        notes: notes || null
      })
      .returning();
    
    // Starte Lagerabgleich für das neu zugeordnete Lager
    // Dies fügt automatisch alle Produkte aus dem Automaten zum Lager hinzu
    console.log(`Starte Lagerabgleich für neu zugeordneten Automaten ${machineId} zum Lager ${warehouseId}`);
    try {
      const reconcileResult = await reconcileWarehouseProducts(Number(warehouseId), true, true);
      console.log(`Lagerabgleich abgeschlossen: ${reconcileResult.productsAdded} neue Produkte hinzugefügt`);
    } catch (reconcileError) {
      console.error('Fehler beim Lagerabgleich nach Automaten-Zuordnung:', reconcileError);
      // Wir werfen hier keinen Fehler, damit die Zuordnung trotzdem erstellt werden kann
    }
    
    res.status(201).json(newAssignment[0]);
  } catch (error) {
    console.error('Failed to create machine-warehouse assignment:', error);
    res.status(500).json({ 
      error: 'Failed to create machine-warehouse assignment',
      details: (error as Error).message 
    });
  }
});

// Update an existing machine-warehouse assignment
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isPrimary, notes } = req.body;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }
    
    const assignment = await db.query.machineWarehouseAssignments.findFirst({
      where: eq(machineWarehouseAssignments.id, parseInt(id))
    });
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // If isPrimary is changing to true, make all other assignments for this machine non-primary
    if (isPrimary && !assignment.isPrimary) {
      await db
        .update(machineWarehouseAssignments)
        .set({ isPrimary: false })
        .where(eq(machineWarehouseAssignments.machineId, assignment.machineId));
    }
    
    // Update the assignment
    const updatedAssignment = await db
      .update(machineWarehouseAssignments)
      .set({
        isPrimary: isPrimary !== undefined ? isPrimary : assignment.isPrimary,
        notes: notes !== undefined ? notes : assignment.notes
      })
      .where(eq(machineWarehouseAssignments.id, parseInt(id)))
      .returning();
    
    res.json(updatedAssignment[0]);
  } catch (error) {
    console.error(`Failed to update assignment ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: `Failed to update assignment ID ${req.params.id}`,
      details: (error as Error).message 
    });
  }
});

// Delete a machine-warehouse assignment
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }
    
    const assignment = await db.query.machineWarehouseAssignments.findFirst({
      where: eq(machineWarehouseAssignments.id, parseInt(id))
    });
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    await db
      .delete(machineWarehouseAssignments)
      .where(eq(machineWarehouseAssignments.id, parseInt(id)));
    
    res.status(204).send();
  } catch (error) {
    console.error(`Failed to delete assignment ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: `Failed to delete assignment ID ${req.params.id}`,
      details: (error as Error).message 
    });
  }
});

export default router;