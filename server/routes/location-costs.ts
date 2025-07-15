import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { 
  locationCosts, 
  insertLocationCostSchema,
  locations,
  machines
} from '../../shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

const router = Router();

// Get all location costs with optional filtering
router.get('/', async (req, res) => {
  try {
    const { locationId, machineId, costType, startDate, endDate, isActive } = req.query;
    
    let query = db
      .select({
        cost: locationCosts,
        locationName: locations.name,
        machineName: machines.machineName,
      })
      .from(locationCosts)
      .leftJoin(locations, eq(locationCosts.locationId, locations.id))
      .leftJoin(machines, eq(locationCosts.machineId, machines.id));

    // Apply filters
    const conditions = [];
    if (locationId) conditions.push(eq(locationCosts.locationId, Number(locationId)));
    if (machineId) conditions.push(eq(locationCosts.machineId, Number(machineId)));
    if (costType) conditions.push(eq(locationCosts.costType, String(costType)));
    if (isActive !== undefined) conditions.push(eq(locationCosts.isActive, isActive === 'true'));
    if (startDate) conditions.push(gte(locationCosts.validFrom, new Date(String(startDate))));
    if (endDate) conditions.push(lte(locationCosts.validUntil, new Date(String(endDate))));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const costs = await query.orderBy(desc(locationCosts.createdAt));

    res.json({
      success: true,
      data: costs.map(row => ({
        ...row.cost,
        locationName: row.locationName,
        machineName: row.machineName,
      }))
    });
  } catch (error) {
    console.error('Error fetching location costs:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Standortkosten'
    });
  }
});

// Get costs for a specific location
router.get('/location/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { month, year } = req.query;

    let query = db
      .select({
        cost: locationCosts,
        locationName: locations.name,
        machineName: machines.machineName,
      })
      .from(locationCosts)
      .leftJoin(locations, eq(locationCosts.locationId, locations.id))
      .leftJoin(machines, eq(locationCosts.machineId, machines.id))
      .where(eq(locationCosts.locationId, Number(locationId)));

    // Filter by month/year if provided
    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0);
      query = query.where(and(
        eq(locationCosts.locationId, Number(locationId)),
        gte(locationCosts.validFrom, startDate),
        lte(locationCosts.validUntil, endDate)
      ));
    }

    const costs = await query.orderBy(locationCosts.costType, desc(locationCosts.validFrom));

    // Group costs by type for easier frontend consumption
    const costsByType = costs.reduce((acc, row) => {
      const type = row.cost.costType;
      if (!acc[type]) acc[type] = [];
      acc[type].push({
        ...row.cost,
        locationName: row.locationName,
        machineName: row.machineName,
      });
      return acc;
    }, {} as Record<string, any[]>);

    res.json({
      success: true,
      data: costsByType,
      summary: {
        totalCosts: costs.reduce((sum, row) => sum + (row.cost.amount || 0), 0),
        activeCosts: costs.filter(row => row.cost.isActive).length,
        costTypes: Object.keys(costsByType).length,
      }
    });
  } catch (error) {
    console.error('Error fetching location costs:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Standortkosten'
    });
  }
});

// Create new location cost
router.post('/', async (req, res) => {
  try {
    const validatedData = insertLocationCostSchema.parse(req.body);
    
    const [newCost] = await db
      .insert(locationCosts)
      .values(validatedData)
      .returning();

    res.json({
      success: true,
      data: newCost,
      message: 'Standortkosten erfolgreich erstellt'
    });
  } catch (error) {
    console.error('Error creating location cost:', error);
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? 'Ungültige Eingabedaten' : 'Fehler beim Erstellen der Standortkosten'
    });
  }
});

// Update location cost
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = insertLocationCostSchema.partial().parse(req.body);
    
    const [updatedCost] = await db
      .update(locationCosts)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(locationCosts.id, Number(id)))
      .returning();

    if (!updatedCost) {
      return res.status(404).json({
        success: false,
        error: 'Standortkosten nicht gefunden'
      });
    }

    res.json({
      success: true,
      data: updatedCost,
      message: 'Standortkosten erfolgreich aktualisiert'
    });
  } catch (error) {
    console.error('Error updating location cost:', error);
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? 'Ungültige Eingabedaten' : 'Fehler beim Aktualisieren der Standortkosten'
    });
  }
});

// Delete location cost
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deletedCost] = await db
      .delete(locationCosts)
      .where(eq(locationCosts.id, Number(id)))
      .returning();

    if (!deletedCost) {
      return res.status(404).json({
        success: false,
        error: 'Standortkosten nicht gefunden'
      });
    }

    res.json({
      success: true,
      message: 'Standortkosten erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Error deleting location cost:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Löschen der Standortkosten'
    });
  }
});

// Get cost summary for dashboard
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let baseQuery = db.select({
      locationId: locationCosts.locationId,
      locationName: locations.name,
      costType: locationCosts.costType,
      totalAmount: sql<number>`SUM(${locationCosts.amount})`,
      countCosts: sql<number>`COUNT(*)`,
    })
    .from(locationCosts)
    .leftJoin(locations, eq(locationCosts.locationId, locations.id))
    .where(eq(locationCosts.isActive, true));

    // Apply date filters
    if (startDate && endDate) {
      baseQuery = baseQuery.where(and(
        eq(locationCosts.isActive, true),
        gte(locationCosts.validFrom, new Date(String(startDate))),
        lte(locationCosts.validUntil, new Date(String(endDate)))
      ));
    }

    const summary = await baseQuery
      .groupBy(locationCosts.locationId, locations.name, locationCosts.costType);

    // Calculate totals
    const totalAmount = summary.reduce((sum, row) => sum + (row.totalAmount || 0), 0);
    const uniqueLocations = new Set(summary.map(row => row.locationId)).size;
    const costTypes = new Set(summary.map(row => row.costType)).size;

    res.json({
      success: true,
      data: summary,
      totals: {
        totalAmount,
        uniqueLocations,
        costTypes,
        totalEntries: summary.length
      }
    });
  } catch (error) {
    console.error('Error fetching cost summary:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Kostenübersicht'
    });
  }
});

export default router;