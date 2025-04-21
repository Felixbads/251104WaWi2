import express from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { product_batches, machines, warehouses, product_movements } from '../../shared/schema';
// Fix imports when testing with actual schema
//import { machines, warehouses, products } from '../../shared/schema';
import { and, eq, like, sql } from 'drizzle-orm';

const router = express.Router();

// Bewegungen für ein Produkt abrufen (zeigt in welchen Automaten das Produkt liegt)
router.get('/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Ungültige Produkt-ID' });
    }
    
    // Bewegungen des Produkts aus der Datenbank holen mit Join zu Maschinen und Lagern
    const movements = await db
      .select({
        id: product_movements.id,
        productId: product_movements.productId,
        machineId: product_movements.machineId,
        machineName: machines.name,
        location: machines.location,
        batchId: product_movements.batchId,
        batchNumber: product_batches.batchNumber,
        expiryDate: product_batches.expiryDate,
        warehouseId: product_movements.warehouseId,
        warehouseName: warehouses.name,
        quantity: product_movements.quantity,
        movementDate: product_movements.createdAt,
      })
      .from(product_movements)
      .leftJoin(machines, eq(product_movements.machineId, machines.id))
      .leftJoin(warehouses, eq(product_movements.warehouseId, warehouses.id))
      .leftJoin(product_batches, eq(product_movements.batchId, product_batches.id))
      .where(eq(product_movements.productId, productId))
      .orderBy(machines.name, product_batches.expiryDate);
    
    res.json(movements);
  } catch (error) {
    console.error('Fehler beim Abrufen der Produktbewegungen:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// Bewegungen für eine bestimmte Charge abrufen
router.get('/batch/:batchId', async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId, 10);
    
    if (isNaN(batchId)) {
      return res.status(400).json({ error: 'Ungültige Chargen-ID' });
    }
    
    const movements = await db
      .select({
        id: product_movements.id,
        productId: product_movements.productId,
        machineId: product_movements.machineId,
        machineName: machines.name,
        location: machines.location,
        batchId: product_movements.batchId,
        batchNumber: product_batches.batchNumber,
        expiryDate: product_batches.expiryDate,
        warehouseId: product_movements.warehouseId,
        warehouseName: warehouses.name,
        quantity: product_movements.quantity,
        movementDate: product_movements.createdAt,
      })
      .from(product_movements)
      .leftJoin(machines, eq(product_movements.machineId, machines.id))
      .leftJoin(warehouses, eq(product_movements.warehouseId, warehouses.id))
      .leftJoin(product_batches, eq(product_movements.batchId, product_batches.id))
      .where(eq(product_movements.batchId, batchId))
      .orderBy(machines.name);
    
    res.json(movements);
  } catch (error) {
    console.error('Fehler beim Abrufen der Chargenbewegungen:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// Bewegung eines Produkts erstellen (von Lager zu Automat)
router.post('/', async (req, res) => {
  try {
    const { productId, machineId, batchId, warehouseId, quantity } = req.body;
    
    if (!productId || !machineId || !quantity || quantity <= 0) {
      return res.status(400).json({ 
        error: 'Erforderliche Felder fehlen oder sind ungültig: productId, machineId, quantity' 
      });
    }
    
    // Neue Bewegung erstellen
    const newMovement = await db.insert(product_movements).values({
      productId,
      machineId,
      batchId: batchId || null,
      warehouseId: warehouseId || null,
      quantity,
      createdAt: new Date(),
    }).returning();
    
    res.status(201).json(newMovement[0]);
  } catch (error) {
    console.error('Fehler beim Erstellen der Produktbewegung:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

export default router;