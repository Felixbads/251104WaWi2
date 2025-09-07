import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { getUnifiedSyncCoordinator } from '../services/unifiedVendonSyncCoordinator';

const router = Router();

/**
 * GET /api/refills - Holt alle Refills, optional gefiltert nach Lager-ID und Datumsbereich
 * Query-Parameter:
 * - warehouseId: (optional) Die ID des Lagers, aus dem Produkte entnommen wurden
 * - startDate: (optional) Startdatum für den Datumsbereich
 * - endDate: (optional) Enddatum für den Datumsbereich
 * - limit: (optional) Maximale Anzahl der zurückgegebenen Datensätze
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Parameter aus der Abfrage extrahieren
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    console.log(`Refills abrufen für Lager ${warehouseId || 'alle'}, Zeitraum: ${startDate?.toISOString() || 'unbegrenzt'} bis ${endDate?.toISOString() || 'jetzt'}`);

    // Refills aus der Datenbank abrufen
    // Hier implementieren wir die tatsächliche Abfrage über unseren Speicher
    let refills = [];
    
    // Verwende die neue getRefills Methode mit Optionen-Objekt
    refills = await storage.getRefills({ 
      warehouseId, 
      startDate, 
      endDate,
      limit
    });

    // Wenn keine Refills gefunden wurden, versuchen wir eine Synchronisierung zu starten
    if ((!refills || refills.length === 0) && startDate && endDate) {
      console.log(`Keine Refills gefunden. Versuche Synchronisierung für ${startDate.toISOString()} bis ${endDate.toISOString()}`);
      
      try {
        // Nur synchronisieren, wenn wir ein Datum haben
        const coordinator = getUnifiedSyncCoordinator();
        await coordinator.syncRefills(startDate, endDate);
        
        // Nach der Synchronisierung erneut abfragen
        let updatedRefills = await storage.getRefills({ 
          warehouseId, 
          startDate, 
          endDate,
          limit
        });
        
        return res.json(updatedRefills || []);
      } catch (syncError) {
        console.error("Fehler bei der Refill-Synchronisierung:", syncError);
        // Wir geben das ursprüngliche leere Ergebnis zurück, aber loggen den Fehler
      }
    }

    res.json(refills || []);
  } catch (error) {
    console.error("Fehler beim Abrufen von Refills:", error);
    res.status(500).json({
      error: "Fehler beim Abrufen von Refills",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/refills/:id - Holt die Details eines einzelnen Refills
 * URL-Parameter:
 * - id: Die ID des Refills
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const refillId = parseInt(req.params.id);
    
    if (isNaN(refillId)) {
      return res.status(400).json({ error: "Ungültige Refill-ID" });
    }
    
    const refill = await storage.getRefillById(refillId);
    
    if (!refill) {
      return res.status(404).json({ error: "Refill nicht gefunden" });
    }
    
    res.json(refill);
  } catch (error) {
    console.error("Fehler beim Abrufen des Refills:", error);
    res.status(500).json({
      error: "Fehler beim Abrufen des Refills",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;