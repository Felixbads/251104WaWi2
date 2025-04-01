import { Request, Response, Router } from "express";
import { db } from "../db";
import { machines, products, suppliers, transactions, orders, stocks } from "@shared/schema";
import { count, eq, or } from "drizzle-orm";

// API route prefix
const API_PREFIX = "/api";

export function statisticsRoutes(app: Router) {
  // Datenbankstatistiken abrufen
  app.get(`${API_PREFIX}/statistics/database`, async (req: Request, res: Response) => {
    try {
      console.log('Datenbankstatistiken werden abgerufen...');
      
      // Transaktionen zählen
      const transactionsCount = await db.select({ count: count() }).from(transactions);
      
      // Offene Bestellungen zählen
      const openOrdersCount = await db.select({ count: count() })
        .from(orders)
        .where(or(
          eq(orders.status, 'pending'),
          eq(orders.status, 'confirmed'),
          eq(orders.status, 'processing')
        ));
      
      // Lieferanten zählen
      const suppliersCount = await db.select({ count: count() }).from(suppliers);
      
      // Produkte zählen - Hier war das Problem: Die Produktanzahl in 'products' Tabelle
      // war falsch, stattdessen verwenden wir die Stocks-Tabelle (Vendon API)
      let productsCount;
      try {
        // Verwende die stocks Tabelle für eine präzisere Messung der Produktanzahl
        productsCount = await db.select({ count: count() }).from(stocks);
      } catch (err) {
        // Fallback auf products Tabelle wenn stocks nicht verfügbar
        console.warn("Konnte nicht auf Stocks-Tabelle zugreifen, verwende Products:", err);
        productsCount = await db.select({ count: count() }).from(products);
      }
      
      // Maschinen zählen
      const machinesCount = await db.select({ count: count() }).from(machines);
      
      const statistics = {
        transactions: transactionsCount[0].count,
        openOrders: openOrdersCount[0].count,
        suppliers: suppliersCount[0].count,
        products: productsCount[0].count,
        machines: machinesCount[0].count,
        lastUpdated: new Date().toISOString()
      };
      
      console.log('Datenbankstatistiken geladen:', statistics);
      
      res.json(statistics);
    } catch (error) {
      console.error('Fehler beim Abrufen der Datenbankstatistiken:', error);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  });
}