import express, { Request, Response } from 'express';
import { storage } from '../storage';

// Definiere eine Interface für das formatierte Inventar-Item
interface FormattedInventoryItem {
  id: number;
  warehouseId: number;
  productId: number;
  quantity: number | null;
  minQuantity: number | null;
  status: string | null;
  notes: string | null;
  lastUpdated: Date | null;
  productName?: string;
  targetQuantity?: number;
  locationInWarehouse?: string;
  [key: string]: any; // Für alle zusätzlichen Felder
}

const router = express.Router();

// GET /api/inventory - Lagerbestand eines bestimmten Lagers abrufen
router.get('/', async (req: Request, res: Response) => {
  try {
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const includeZeroStock = req.query.includeZeroStock === 'true';
    
    if (!warehouseId) {
      return res.status(400).json({ error: "warehouseId is required" });
    }
    
    // Lagerbestand abrufen
    const inventoryItems = await storage.getInventoryItems({
      warehouseId,
      includeZeroStock
    });
    
    // Format für die Frontend-Anwendung anpassen
    const formattedInventory = inventoryItems.map(item => {
      // Erstelle ein Basisobjekt mit den garantierten Feldern
      const inventoryItem: FormattedInventoryItem = {
        id: item.id,
        warehouseId: item.warehouseId,
        productId: item.productId,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        status: item.status,
        notes: item.notes,
        lastUpdated: item.updatedAt || item.createdAt
      };
      
      // Füge optionale Felder hinzu, wenn sie existieren
      if ('productName' in item) {
        inventoryItem.productName = item['productName'] as string;
      }
      
      if ('targetQuantity' in item) {
        inventoryItem.targetQuantity = item['targetQuantity'] as number;
      }
      
      if ('locationInWarehouse' in item) {
        inventoryItem.locationInWarehouse = item['locationInWarehouse'] as string;
      }
      
      return inventoryItem;
    });
    
    res.json(formattedInventory);
  } catch (error) {
    console.error("Error fetching warehouse inventory:", error);
    res.status(500).json({ 
      error: "Failed to fetch warehouse inventory", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;