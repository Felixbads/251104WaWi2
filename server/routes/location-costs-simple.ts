import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Updated Zod schema to match frontend
const locationCostSchema = z.object({
  machineId: z.number().optional(),
  locationId: z.number().optional(),
  locationName: z.string().optional(),
  costType: z.string().min(1),
  costName: z.string().min(1),
  amountNet: z.number().min(0),
  amountGross: z.number().optional(),
  billingCycle: z.string().default("monthly"),
  vatRate: z.number().default(19),
  currency: z.string().default("EUR"),
  validFrom: z.string(),
  validTo: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true)
});

// Get all location costs
router.get('/', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        lc.*,
        m.machine_name as machine_name,
        l.name as location_name
      FROM location_costs lc
      LEFT JOIN machines m ON lc.machine_id = m.id  
      LEFT JOIN locations l ON lc.location_id = l.id
      ORDER BY lc.created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        machineId: row.machine_id,
        locationId: row.location_id,
        costType: row.cost_type,
        amountNet: Number(row.amount_net),
        amountGross: Number(row.amount_gross),
        currency: row.currency,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        description: row.description,
        isActive: row.is_active,
        machineName: row.machine_name,
        locationName: row.location_name,
        createdAt: row.created_at
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

// Create new location cost with direct SQL
router.post('/', async (req, res) => {
  try {
    console.log('[LOCATION-COSTS] Received data:', req.body);
    const validatedData = locationCostSchema.parse(req.body);
    console.log('[LOCATION-COSTS] Validated data:', validatedData);
    
    // Calculate gross amount (with VAT)
    const amountNet = validatedData.amountNet;
    const amountGross = validatedData.amountGross || (amountNet * (1 + validatedData.vatRate / 100));
    
    const result = await db.execute(sql`
      INSERT INTO location_costs (
        machine_id,
        location_id,
        location_name,
        cost_type,
        cost_name,
        amount_net,
        amount_gross,
        billing_cycle,
        vat_rate,
        currency,
        valid_from,
        valid_to,
        description,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        ${validatedData.machineId || null},
        ${validatedData.locationId || null},
        ${validatedData.locationName || null},
        ${validatedData.costType},
        ${validatedData.costName},
        ${amountNet},
        ${amountGross},
        ${validatedData.billingCycle},
        ${validatedData.vatRate},
        ${validatedData.currency},
        ${validatedData.validFrom},
        ${validatedData.validTo || null},
        ${validatedData.description || null},
        ${validatedData.isActive},
        NOW(),
        NOW()
      )
      RETURNING *
    `);

    const newCost = result.rows[0];
    console.log('[LOCATION-COSTS] Created cost:', newCost);

    res.json({
      success: true,
      data: {
        id: newCost.id,
        machineId: newCost.machine_id,
        locationId: newCost.location_id,
        costType: newCost.cost_type,
        amountNet: Number(newCost.amount_net),
        amountGross: Number(newCost.amount_gross),
        currency: newCost.currency,
        validFrom: newCost.valid_from,
        validTo: newCost.valid_to,
        description: newCost.description,
        isActive: newCost.is_active,
        createdAt: newCost.created_at
      },
      message: 'Standortkosten erfolgreich erstellt'
    });
  } catch (error) {
    console.error('Error creating location cost:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Eingabedaten',
        details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Erstellen der Standortkosten'
    });
  }
});

// Get costs by location - MISSING ROUTE ADDED
router.get('/location/:locationId', async (req, res) => {
  try {
    console.log('[LOCATION-COSTS] Fetching costs for location:', req.params.locationId);
    const { locationId } = req.params;
    
    const result = await db.execute(sql`
      SELECT 
        lc.*,
        l.name as location_name
      FROM location_costs lc
      LEFT JOIN locations l ON lc.location_id = l.id
      WHERE lc.location_name = ${locationId} OR lc.location_id = ${Number(locationId) || 0}
      ORDER BY lc.created_at DESC
    `);

    console.log('[LOCATION-COSTS] Found costs:', result.rows.length);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        locationId: row.location_id,
        locationName: row.location_name,
        costType: row.cost_type,
        costName: row.cost_name,
        amountNet: isNaN(Number(row.amount_net)) ? 0 : Number(row.amount_net),
        amountGross: isNaN(Number(row.amount_gross)) ? 0 : Number(row.amount_gross),
        billingCycle: row.billing_cycle || 'monthly',
        currency: row.currency,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        description: row.description,
        isActive: row.is_active,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('[LOCATION-COSTS] Error fetching location costs:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Standortkosten'
    });
  }
});

// Get costs by machine
router.get('/machine/:machineId', async (req, res) => {
  try {
    const { machineId } = req.params;
    
    const result = await db.execute(sql`
      SELECT 
        lc.*,
        m.machine_name as machine_name
      FROM location_costs lc
      LEFT JOIN machines m ON lc.machine_id = m.id
      WHERE lc.machine_id = ${Number(machineId)}
        AND lc.is_active = true
      ORDER BY lc.valid_from DESC
    `);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        machineId: row.machine_id,
        costType: row.cost_type,
        amountNet: Number(row.amount_net),
        amountGross: Number(row.amount_gross),
        currency: row.currency,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        description: row.description,
        machineName: row.machine_name
      }))
    });
  } catch (error) {
    console.error('Error fetching machine costs:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Maschinenkosten'
    });
  }
});

export default router;