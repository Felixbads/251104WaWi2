import { Router } from 'express';
import { db } from '../db';
import { transactions, orders, products, machines, suppliers } from '../../shared/schema';
import { count, eq } from 'drizzle-orm';

const router = Router();

// Export a function to register the routes
export function statisticsRoutes(app: any) {
  app.use('/api/statistics', router);
}

/**
 * Endpunkt für grundlegende Datenbankstatistiken
 * 
 * Diese Abfrage ist effizient und schnell, da sie nur einfache Zählungen durchführt
 * und keine komplexen JOIN-Operationen oder Aggregationen verwendet.
 */
router.get('/database', async (req, res) => {
  try {
    console.log('Datenbankstatistiken werden abgefragt...');
    
    // Parallele Abfragen für bessere Performance
    const [
      transactionsCount,
      openOrdersCount,
      productsCount,
      machinesCount,
      suppliersCount
    ] = await Promise.all([
      // Anzahl aller Transaktionen
      db.select({ count: count() }).from(transactions),
      
      // Anzahl offener Bestellungen
      db.select({ count: count() }).from(orders)
        .where(eq(orders.status, 'open')),
      
      // Anzahl aller Produkte
      db.select({ count: count() }).from(products),
      
      // Anzahl aller Automaten
      db.select({ count: count() }).from(machines),
      
      // Anzahl aller Lieferanten
      db.select({ count: count() }).from(suppliers)
    ]);

    // Daten aufbereiten und zurückgeben
    const responseData = {
      transactions: transactionsCount[0].count || 0,
      openOrders: openOrdersCount[0].count || 0,
      products: productsCount[0].count || 0,
      machines: machinesCount[0].count || 0,
      suppliers: suppliersCount[0].count || 0,
      lastUpdated: new Date().toISOString()
    };

    console.log('Datenbankstatistiken erfolgreich abgefragt:', responseData);
    return res.json(responseData);
  } catch (error) {
    console.error('Fehler beim Abrufen der Datenbankstatistiken:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Datenbankstatistiken',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
    });
  }
});

export default router;