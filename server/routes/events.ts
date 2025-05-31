import { Router } from "express";
import { db } from "../db";
import { events, syncLogs } from "@shared/schema";
import { eq, desc, and, gte, lte, like, sql } from "drizzle-orm";
import { VendonEventsSync } from "../services/vendonEventsSync";

const router = Router();

// Events abrufen mit Filteroptionen
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      state,
      eventType,
      machineId,
      fromDate,
      toDate,
      severity
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    
    // Basis-Query
    let query = db.select().from(events);
    
    // Filter anwenden
    const conditions = [];
    
    if (search) {
      conditions.push(
        sql`(${events.description} ILIKE ${`%${search}%`} OR ${events.eventName} ILIKE ${`%${search}%`} OR ${events.machineName} ILIKE ${`%${search}%`})`
      );
    }
    
    if (state) {
      conditions.push(eq(events.state, String(state)));
    }
    
    if (eventType) {
      conditions.push(eq(events.eventType, String(eventType)));
    }
    
    if (machineId) {
      conditions.push(eq(events.machineId, Number(machineId)));
    }
    
    if (fromDate) {
      conditions.push(gte(events.datetime, new Date(String(fromDate))));
    }
    
    if (toDate) {
      conditions.push(lte(events.datetime, new Date(String(toDate))));
    }
    
    if (severity) {
      conditions.push(eq(events.severity, String(severity)));
    }
    
    // Conditions zur Query hinzufügen
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Sortierung und Pagination
    const eventsResult = await query
      .orderBy(desc(events.datetime))
      .limit(Number(limit))
      .offset(offset);

    // Gesamtanzahl für Pagination
    let countQuery = db.select({ count: sql`count(*)` }).from(events);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions));
    }
    
    const totalResult = await countQuery;
    const total = Number(totalResult[0]?.count || 0);

    res.json({
      events: eventsResult,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error("Fehler beim Abrufen der Events:", error);
    res.status(500).json({ 
      error: "Fehler beim Abrufen der Events",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Einzelnes Event abrufen
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await db.select()
      .from(events)
      .where(eq(events.id, Number(id)))
      .limit(1);

    if (event.length === 0) {
      return res.status(404).json({ error: "Event nicht gefunden" });
    }

    res.json(event[0]);

  } catch (error) {
    console.error("Fehler beim Abrufen des Events:", error);
    res.status(500).json({ 
      error: "Fehler beim Abrufen des Events",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Event-Statistiken abrufen
router.get("/stats/overview", async (req, res) => {
  try {
    // Gesamtanzahl Events
    const totalResult = await db.select({ count: sql`count(*)` }).from(events);
    const total = Number(totalResult[0]?.count || 0);

    // Events nach Status
    const stateResult = await db.select({
      state: events.state,
      count: sql`count(*)`
    })
    .from(events)
    .groupBy(events.state);

    const eventsByState: Record<string, number> = {};
    stateResult.forEach(row => {
      eventsByState[row.state || 'unknown'] = Number(row.count);
    });

    // Events nach Typ
    const typeResult = await db.select({
      eventType: events.eventType,
      count: sql`count(*)`
    })
    .from(events)
    .groupBy(events.eventType)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

    const eventsByType: Record<string, number> = {};
    typeResult.forEach(row => {
      eventsByType[row.eventType || 'unknown'] = Number(row.count);
    });

    // Events nach Schweregrad
    const severityResult = await db.select({
      severity: events.severity,
      count: sql`count(*)`
    })
    .from(events)
    .groupBy(events.severity);

    const eventsBySeverity: Record<string, number> = {};
    severityResult.forEach(row => {
      eventsBySeverity[row.severity || 'unknown'] = Number(row.count);
    });

    // Aktuelle aktive Events
    const activeResult = await db.select({ count: sql`count(*)` })
      .from(events)
      .where(eq(events.state, 'active'));
    
    const activeEvents = Number(activeResult[0]?.count || 0);

    // Neueste und älteste Events
    const dateResult = await db.select({
      latest: sql`max(${events.datetime})`,
      oldest: sql`min(${events.datetime})`
    }).from(events);

    res.json({
      total,
      activeEvents,
      eventsByState,
      eventsByType,
      eventsBySeverity,
      latestEvent: dateResult[0]?.latest ? new Date(dateResult[0].latest as string) : null,
      oldestEvent: dateResult[0]?.oldest ? new Date(dateResult[0].oldest as string) : null
    });

  } catch (error) {
    console.error("Fehler beim Abrufen der Event-Statistiken:", error);
    res.status(500).json({ 
      error: "Fehler beim Abrufen der Event-Statistiken",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Vendon Events importieren
router.post("/import", async (req, res) => {
  try {
    const {
      fromTimestamp,
      toTimestamp,
      timeframeFilterType = 'received_at',
      machineId,
      warehouseId,
      state,
      locationId,
      locationType,
      clientId,
      minDuration,
      maxDuration,
      ignored = 'exclude',
      machineTags,
      eventTags,
      batchSize = 100,
      maxEvents = 10000,
      forceUpdate = false
    } = req.body;

    // API-Key prüfen
    if (!process.env.VENDON_API_KEY) {
      return res.status(400).json({ 
        error: "Vendon API-Key nicht konfiguriert",
        message: "VENDON_API_KEY Umgebungsvariable ist nicht gesetzt"
      });
    }

    // Import-Optionen zusammenstellen
    const options = {
      fromTimestamp,
      toTimestamp,
      timeframeFilterType,
      machineId,
      warehouseId,
      state,
      locationId,
      locationType,
      clientId,
      minDuration,
      maxDuration,
      ignored,
      machineTags,
      eventTags,
      batchSize,
      maxEvents,
      forceUpdate
    };

    // Import starten
    const sync = new VendonEventsSync(process.env.VENDON_API_KEY);
    const result = await sync.syncEvents(options);

    res.json({
      success: result.success,
      totalProcessed: result.totalProcessed,
      duplicates: result.duplicates,
      errors: result.errors,
      errorMessage: result.errorMessage,
      importOptions: options
    });

  } catch (error) {
    console.error("Fehler beim Event-Import:", error);
    res.status(500).json({ 
      error: "Fehler beim Event-Import",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Sync-Logs für Events abrufen
router.get("/sync/logs", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    const logs = await db.select()
      .from(syncLogs)
      .where(eq(syncLogs.syncType, 'vendon_events'))
      .orderBy(desc(syncLogs.startDate))
      .limit(Number(limit))
      .offset(offset);

    // Gesamtanzahl
    const totalResult = await db.select({ count: sql`count(*)` })
      .from(syncLogs)
      .where(eq(syncLogs.syncType, 'vendon_events'));
    
    const total = Number(totalResult[0]?.count || 0);

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error("Fehler beim Abrufen der Sync-Logs:", error);
    res.status(500).json({ 
      error: "Fehler beim Abrufen der Sync-Logs",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;