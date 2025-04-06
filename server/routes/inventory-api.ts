import { Router } from 'express';
import { IStorage } from '../storage';
import { format, addDays, isBefore } from 'date-fns';

const router = Router();

export default function inventoryApiRoutes(storage: IStorage) {
  // Endpoint für Lagerbestandsstatistiken
  router.get('/stats', async (req, res) => {
    try {
      // Gesamtanzahl der Inventarpositionen
      const allInventoryItems = await storage.getInventoryItems({});
      
      // Aktive Chargen (nicht abgelaufen und mit Bestand > 0)
      const allBatches = await storage.getInventoryBatches({});
      const activeBatches = allBatches.filter(batch => 
        batch.status !== 'expired' && 
        batch.status !== 'consumed' && 
        batch.quantity > 0
      );
      
      // Ablaufende Chargen (innerhalb der nächsten 30 Tage)
      const today = new Date();
      const thirtyDaysFromNow = addDays(today, 30);
      
      const expiringBatches = activeBatches.filter(batch => {
        const expiryDate = new Date(batch.expiryDate);
        return isBefore(expiryDate, thirtyDaysFromNow) && !isBefore(expiryDate, today);
      });
      
      // Abgelaufene Chargen
      const expiredBatches = allBatches.filter(batch => {
        const expiryDate = new Date(batch.expiryDate);
        return isBefore(expiryDate, today) && batch.quantity > 0 && batch.status !== 'consumed';
      });
      
      // Kritische Bestände
      const criticalStockItems = allInventoryItems.filter(item => 
        (item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0
      );
      
      // Offene Inventuren
      const openInventoryCounts = await storage.getInventoryCounts({
        status: 'pending,in_progress' // Kommagetrennte Status-Liste
      });

      // Statistik-Ergebnis
      const stats = {
        totalItems: allInventoryItems.length,
        activeBatches: activeBatches.length,
        expiringBatches: expiringBatches.length,
        expiredBatches: expiredBatches.length,
        criticalStock: criticalStockItems.length,
        openCounts: openInventoryCounts.length,
        totalAlerts: criticalStockItems.length + expiredBatches.length + expiringBatches.length
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Fehler bei der Abfrage der Lagerstatistiken:', error);
      res.status(500).json({ error: 'Fehler bei der Abfrage der Lagerstatistiken' });
    }
  });

  // Endpoint für Lagerbestandswarnungen und Benachrichtigungen
  router.get('/alerts', async (req, res) => {
    try {
      const alerts = [];
      const today = new Date();
      const thirtyDaysFromNow = addDays(today, 30);
      const sevenDaysFromNow = addDays(today, 7);
      
      // Abgelaufene Chargen abrufen
      const allBatches = await storage.getInventoryBatches({});
      
      // Warehouses für Namen abrufen
      const warehouses = await storage.getWarehouses();
      const warehouseMap = new Map(warehouses.map(w => [w.id, w.name]));
      
      // Produkte für Namen abrufen
      const products = await storage.getProducts();
      const productMap = new Map(
        Array.isArray(products) 
          ? products.map((p: any) => [p.id, p.name]) 
          : (products as any).data?.map((p: any) => [p.id, p.name]) || []
      );
      
      // 1. Abgelaufene Chargen
      const expiredBatches = allBatches.filter(batch => {
        const expiryDate = new Date(batch.expiryDate);
        return isBefore(expiryDate, today) && batch.quantity > 0 && batch.status !== 'consumed';
      });
      
      for (const batch of expiredBatches) {
        alerts.push({
          id: `expired-batch-${batch.id}`,
          type: 'critical',
          title: 'Abgelaufene Charge',
          message: `${productMap.get(batch.productId) || 'Unbekanntes Produkt'} - Charge ${batch.batchNumber} ist am ${format(new Date(batch.expiryDate), 'dd.MM.yyyy')} abgelaufen (${batch.quantity} Stück)`,
          warehouseName: warehouseMap.get(batch.warehouseId) || 'Unbekanntes Lager',
          warehouseId: batch.warehouseId,
          productId: batch.productId,
          batchId: batch.id,
          expiryDate: batch.expiryDate
        });
      }
      
      // 2. In 7 Tagen ablaufende Chargen
      const soonExpiringBatches = allBatches.filter(batch => {
        const expiryDate = new Date(batch.expiryDate);
        return isBefore(expiryDate, sevenDaysFromNow) && !isBefore(expiryDate, today) && batch.quantity > 0;
      });
      
      for (const batch of soonExpiringBatches) {
        alerts.push({
          id: `soon-expiring-batch-${batch.id}`,
          type: 'warning',
          title: 'Bald ablaufende Charge',
          message: `${productMap.get(batch.productId) || 'Unbekanntes Produkt'} - Charge ${batch.batchNumber} läuft in weniger als 7 Tagen ab (am ${format(new Date(batch.expiryDate), 'dd.MM.yyyy')})`,
          warehouseName: warehouseMap.get(batch.warehouseId) || 'Unbekanntes Lager',
          warehouseId: batch.warehouseId,
          productId: batch.productId,
          batchId: batch.id,
          expiryDate: batch.expiryDate
        });
      }
      
      // 3. In 30 Tagen ablaufende Chargen (die nicht bereits in den "in 7 Tagen ablaufenden" enthalten sind)
      const expiringBatches = allBatches.filter(batch => {
        const expiryDate = new Date(batch.expiryDate);
        return isBefore(expiryDate, thirtyDaysFromNow) && !isBefore(expiryDate, sevenDaysFromNow) && batch.quantity > 0;
      });
      
      for (const batch of expiringBatches) {
        alerts.push({
          id: `expiring-batch-${batch.id}`,
          type: 'info',
          title: 'Demnächst ablaufende Charge',
          message: `${productMap.get(batch.productId) || 'Unbekanntes Produkt'} - Charge ${batch.batchNumber} läuft am ${format(new Date(batch.expiryDate), 'dd.MM.yyyy')} ab`,
          warehouseName: warehouseMap.get(batch.warehouseId) || 'Unbekanntes Lager',
          warehouseId: batch.warehouseId,
          productId: batch.productId,
          batchId: batch.id,
          expiryDate: batch.expiryDate
        });
      }
      
      // 4. Kritische Bestände
      const inventoryItems = await storage.getInventoryItems({});
      const criticalStockItems = inventoryItems.filter(item => 
        (item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0
      );
      
      for (const item of criticalStockItems) {
        const severity = item.quantity === 0 ? 'critical' : 'warning';
        alerts.push({
          id: `critical-stock-${item.id}`,
          type: severity,
          title: item.quantity === 0 ? 'Kein Bestand' : 'Kritischer Bestand',
          message: `${productMap.get(item.productId) || 'Unbekanntes Produkt'} - Aktueller Bestand: ${item.quantity}, Minimum: ${item.minQuantity}`,
          warehouseName: warehouseMap.get(item.warehouseId) || 'Unbekanntes Lager',
          warehouseId: item.warehouseId,
          productId: item.productId,
          itemId: item.id
        });
      }
      
      // Sortierung der Alerts nach Priorität und Datum
      const sortedAlerts = alerts.sort((a, b) => {
        // Zuerst nach Typ sortieren (critical > warning > info)
        const typeScore: Record<string, number> = { 'critical': 3, 'warning': 2, 'info': 1 };
        if (typeScore[a.type as string] !== typeScore[b.type as string]) {
          return typeScore[b.type as string] - typeScore[a.type as string];
        }
        
        // Bei gleichem Typ nach Ablaufdatum sortieren (falls vorhanden, früheres zuerst)
        if (a.expiryDate && b.expiryDate) {
          return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        }
        
        return 0;
      });
      
      res.json(sortedAlerts);
    } catch (error) {
      console.error('Fehler bei der Abfrage der Lagerwarnungen:', error);
      res.status(500).json({ error: 'Fehler bei der Abfrage der Lagerwarnungen' });
    }
  });

  return router;
}