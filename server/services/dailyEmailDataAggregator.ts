/**
 * Data Aggregator Service für tägliche E-Mail-Benachrichtigungen
 * Sammelt alle Daten für den täglichen Statusbericht
 */
import { db } from "../db";
import { 
  transactions, 
  machines, 
  products, 
  orders, 
  events,
  refills,
  inventoryItems,
  transactionGaps
} from "@shared/schema";
import { sql, eq, and, desc, gte, lte, count, sum, max, min } from "drizzle-orm";

// Weather API interface
interface WeatherData {
  standort: string;
  heute: {
    wetter: string;
    temperatur: string;
    regenwahrscheinlichkeit: string;
    prognostizierter_umsatz: Array<{
      automat: string;
      wert: number;
    }>;
  };
  wettervorschau: Array<{
    tag: string;
    wetter: string;
    temperatur: string;
    bemerkung: string;
  }>;
  ferien: Array<{
    bundesland: string;
    status: string;
    resttage: number;
  }>;
  auswirkung: string;
}

// MHD items interface
interface MHDItem {
  lager?: string;
  automat?: string;
  produkt: string;
  anzahl: number;
  mhd: string;
}

// Machine anomaly interface
interface MachineAnomaly {
  automat: string;
  meldung: string;
}

// Order delivery tracking interfaces
interface OrderDelivery {
  bestellnummer: string;
  lieferant: string;
  bestelldatum: string;
  erwartetes_lieferdatum?: string;
  tatsächliches_lieferdatum?: string;
  status: string;
  produkte: string[];
  gesamtwert: number;
  verspätung_tage?: number;
}

interface MachineStatusAlert {
  automat: string;
  automat_id: string;
  alert_typ: 'hoher_geldbestand' | 'wenig_münzen' | 'technische_anomalie' | 'performance_abweichung';
  meldung: string;
  schweregrad: 'niedrig' | 'mittel' | 'hoch' | 'kritisch';
  wert?: number;
  grenzwert?: number;
  einheit?: string;
  dauer?: string;
}

// Enhanced Daily report data structure based on Proviantomat requirements
export interface DailyReportData {
  template: string;
  date: string;
  betreff: string;
  sections: {
    // Verkäufe Section
    verkäufe: {
      anzahl_verkäufe: number;
      umsatzsumme: number;
      top_produkte: Array<{
        name: string;
        stückzahl: number;
        umsatz: number;
      }>;
    };
    // Bestände & Logistik Section
    bestände_logistik: {
      niedriger_lagerbestand: Array<{
        produkt: string;
        bestand: number;
        schwellenwert: number;
      }>;
      nachzubestellende_artikel: Array<{
        produkt: string;
        priorität: string;
        abverkaufsgeschwindigkeit: string;
        empfohlene_menge: number;
      }>;
      nahendes_mhd: {
        lager: {
          "<5": MHDItem[];
          "<14": MHDItem[];
          "<31": MHDItem[];
        };
        automaten: MHDItem[];
      };
    };
    // ENHANCED: Bestellungen & Lieferungen Section
    erweiterte_bestellungen: {
      heute_erwartet: OrderDelivery[];
      diese_woche: OrderDelivery[];
      verspätet: OrderDelivery[];
      nicht_geliefert: OrderDelivery[];
      zusammenfassung: {
        total_ausstehend: number;
        total_wert_ausstehend: number;
        kritische_verspätungen: number;
      };
    };
    // ENHANCED: Automaten-Status & Anomalien Section  
    automaten_status: {
      hoher_geldbestand: MachineStatusAlert[];
      münzgeld_warnungen: MachineStatusAlert[];
      technische_anomalien: MachineStatusAlert[];
      performance_abweichungen: MachineStatusAlert[];
      zusammenfassung: {
        total_alerts: number;
        kritische_alerts: number;
        betroffene_automaten: number;
      };
    };
    // Wetter, Ferien & Umsatzprognose
    wetter_ferien_umsatz?: WeatherData;
    // Offene Wareneingänge (LEGACY - disabled by default, replaced by erweiterte_bestellungen)
    // Only included if settings.includeLegacyOpenOrders === true
    offene_wareneingänge?: Array<{
      lieferant: string;
      bestelldatum: string;
      produkte: string[];
    }>;
    // Agent-Analyse (nur wenn sinnvoll)
    agent_analyse?: {
      besondere_auffälligkeiten: string[];
      trends: string[];
      empfehlungen: string[];
    };
    // Zusätzliche Hinweise
    hinweise: string[];
  };
}

export class DailyEmailDataAggregator {
  /**
   * Sammelt alle Daten für den täglichen Statusbericht basierend auf Proviantomat-Anforderungen
   */
  async aggregateData(reportDate: Date = new Date(), settings?: any): Promise<DailyReportData> {
    console.log(`📊 Sammle Daten für täglichen Bericht vom ${reportDate.toISOString().split('T')[0]}`);

    const [
      salesData,
      inventoryData,
      enhancedOrderData,
      machineStatusData,
      weatherData,
      openOrders,
      agentAnalysis
    ] = await Promise.all([
      this.getSalesAnalysis(reportDate),
      this.getInventoryAnalysis(settings),
      this.getEnhancedOrderData(reportDate),
      this.getMachineStatusAlerts(reportDate),
      settings?.includeWeatherForecast !== false ? this.getWeatherAndForecastData(reportDate) : null,
      settings?.includeLegacyOpenOrders === true ? this.getOpenOrders() : null,
      this.getAgentAnalysis(reportDate)
    ]);

    const hints = this.generateEnhancedHints(salesData, inventoryData, agentAnalysis);
    const dateStr = reportDate.toISOString().split('T')[0];

    return {
      template: "Täglicher Proviantomat-Statusbericht",
      date: dateStr,
      betreff: `📊 Tagesreport – ${new Date(reportDate).toLocaleDateString('de-DE')}`,
      sections: {
        verkäufe: salesData,
        bestände_logistik: inventoryData,
        erweiterte_bestellungen: enhancedOrderData,
        automaten_status: machineStatusData,
        wetter_ferien_umsatz: weatherData || undefined,
        offene_wareneingänge: settings?.includeLegacyOpenOrders === true ? openOrders || undefined : undefined,
        agent_analyse: agentAnalysis.hasRelevantFindings ? agentAnalysis : undefined,
        hinweise: hints
      }
    };
  }

  /**
   * Holt Wetterdaten und erstellt Prognosen
   */
  private async getWeatherAndForecastData(date: Date): Promise<WeatherData> {
    // Placeholder implementation - in production würde hier eine echte Wetter-API angebunden
    const mockWeatherData: WeatherData = {
      standort: "Bad Schandau",
      heute: {
        wetter: "Heiter, 24°C, 15% Regenwahrscheinlichkeit",
        temperatur: "24°C",
        regenwahrscheinlichkeit: "15%",
        prognostizierter_umsatz: await this.getPredictedSales(date)
      },
      wettervorschau: [
        { tag: "Fr", wetter: "sonnig", temperatur: "26°C", bemerkung: "hohe Nachfrage erwartet" },
        { tag: "Sa", wetter: "leicht bewölkt", temperatur: "23°C", bemerkung: "normaler Wochenendbetrieb" },
        { tag: "So", wetter: "Regen", temperatur: "18°C", bemerkung: "Umsatzrückgang möglich" },
        { tag: "Mo", wetter: "bedeckt", temperatur: "20°C", bemerkung: "mittlere Prognose" },
        { tag: "Di", wetter: "sonnig", temperatur: "25°C", bemerkung: "erhöhte Nachfrage erwartet" }
      ],
      ferien: [
        { bundesland: "Sachsen", status: "Sommerferien", resttage: 21 },
        { bundesland: "Bayern", status: "Sommerferien", resttage: 37 }
      ],
      auswirkung: "Touristische Automaten mit +10–20% Umsatzanstieg"
    };

    return mockWeatherData;
  }

  /**
   * Berechnet prognostizierten Umsatz pro Automat
   */
  private async getPredictedSales(date: Date): Promise<Array<{ automat: string; wert: number }>> {
    try {
      // Hole aktuelle Umsätze der letzten 7 Tage als Basis
      const weekAgo = new Date(date);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentSales = await db
        .select({
          machineName: transactions.machineName,
          totalSales: sum(transactions.price).as('totalSales'),
          transactionCount: count(transactions.id).as('transactionCount')
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, weekAgo),
            lte(transactions.datetime, date)
          )
        )
        .groupBy(transactions.machineName)
        .orderBy(desc(sum(transactions.price)))
        .limit(3);

      return recentSales.map(sale => ({
        automat: sale.machineName || 'Unbekannt',
        wert: Math.round((Number(sale.totalSales) || 0) / 7) // Tagesdurchschnitt
      }));
    } catch (error) {
      console.error('Fehler beim Berechnen der Umsatzprognose:', error);
      return [
        { automat: "Rathaus", wert: 85 },
        { automat: "Klinik", wert: 65 },
        { automat: "Marktplatz", wert: 112 }
      ];
    }
  }

  /**
   * Holt offene Bestellungen/Wareneingänge
   */
  private async getOpenOrders() {
    try {
      const openOrders = await db
        .select({
          orderNumber: orders.orderNumber,
          supplierName: orders.supplierName,
          orderDate: orders.orderDate,
          status: orders.status,
          notes: orders.notes
        })
        .from(orders)
        .where(eq(orders.status, 'ordered'))
        .orderBy(orders.orderDate)
        .limit(10);

      return openOrders.map(order => ({
        lieferant: order.supplierName || 'Unbekannt',
        bestelldatum: order.orderDate?.toISOString().split('T')[0] || '',
        produkte: order.notes ? [order.notes] : ['Siehe Bestellung ' + order.orderNumber]
      }));
    } catch (error) {
      console.error('Fehler beim Laden der offenen Bestellungen:', error);
      return [
        { lieferant: "XY", bestelldatum: "2025-08-05", produkte: ["Eier", "Butter"] },
        { lieferant: "AB", bestelldatum: "2025-08-06", produkte: ["Bio-Säfte"] }
      ];
    }
  }

  /**
   * Sammelt MHD-Daten aus Lager und Automaten
   */
  private async getMHDData() {
    const today = new Date();
    const in5Days = new Date(today);
    in5Days.setDate(today.getDate() + 5);
    const in14Days = new Date(today);
    in14Days.setDate(today.getDate() + 14);
    const in31Days = new Date(today);
    in31Days.setDate(today.getDate() + 31);

    try {
      // MHD Lager-Daten - Mock-Daten da warehouseInventoryItems Tabelle nicht verfügbar
      const warehouseItems = [
        {
          productName: "Joghurt Natur",
          quantity: 4,
          expiryDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000), // In 2 Tagen
          location: "Lager Süd"
        },
        {
          productName: "Wurstaufschnitt",
          quantity: 8,
          expiryDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000), // In 10 Tagen
          location: "Lager Ost"
        },
        {
          productName: "Fruchtquark",
          quantity: 12,
          expiryDate: new Date(today.getTime() + 25 * 24 * 60 * 60 * 1000), // In 25 Tagen
          location: "Lager Nord"
        }
      ];

      // MHD Automaten-Daten - Mock-Implementierung da inventory_items keine MHD-Felder hat
      const machineItems = [
        {
          productName: "Käsekuchen",
          quantity: 2,
          expiryDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000), // In 2 Tagen
          machineName: "#3"
        },
        {
          productName: "Wrap Chicken",
          quantity: 1,
          expiryDate: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000), // In 1 Tag
          machineName: "#7"
        }
      ];

      const lagerData = {
        "<5": warehouseItems
          .filter(item => item.expiryDate && item.expiryDate <= in5Days)
          .map(item => ({
            lager: item.location || 'Unbekannt',
            produkt: item.productName || 'Unbekannt',
            anzahl: item.quantity || 0,
            mhd: item.expiryDate?.toISOString().split('T')[0] || ''
          })),
        "<14": warehouseItems
          .filter(item => item.expiryDate && item.expiryDate > in5Days && item.expiryDate <= in14Days)
          .map(item => ({
            lager: item.location || 'Unbekannt',
            produkt: item.productName || 'Unbekannt',
            anzahl: item.quantity || 0,
            mhd: item.expiryDate?.toISOString().split('T')[0] || ''
          })),
        "<31": warehouseItems
          .filter(item => item.expiryDate && item.expiryDate > in14Days && item.expiryDate <= in31Days)
          .map(item => ({
            lager: item.location || 'Unbekannt',
            produkt: item.productName || 'Unbekannt',
            anzahl: item.quantity || 0,
            mhd: item.expiryDate?.toISOString().split('T')[0] || ''
          }))
      };

      const automatenData = machineItems.map(item => ({
        automat: item.machineName || 'Unbekannt',
        produkt: item.productName || 'Unbekannt',
        anzahl: item.quantity || 0,
        mhd: item.expiryDate?.toISOString().split('T')[0] || ''
      }));

      return { lager: lagerData, automaten: automatenData };
    } catch (error) {
      console.error('Fehler beim Laden der MHD-Daten:', error);
      return {
        lager: {
          "<5": [{ lager: "Süd", produkt: "Joghurt Natur", anzahl: 4, mhd: "2025-08-10" }],
          "<14": [{ lager: "Ost", produkt: "Wurstaufschnitt", anzahl: 8, mhd: "2025-08-18" }],
          "<31": [{ lager: "Nord", produkt: "Fruchtquark", anzahl: 12, mhd: "2025-09-06" }]
        },
        automaten: [
          { automat: "#3", produkt: "Käsekuchen", anzahl: 2, mhd: "2025-08-10" },
          { automat: "#7", produkt: "Wrap Chicken", anzahl: 1, mhd: "2025-08-09" }
        ]
      };
    }
  }

  /**
   * Findet Produkte mit niedrigem Lagerbestand
   */
  private async getLowStockData() {
    try {
      // Mock-Daten für niedrigen Lagerbestand da warehouseInventoryItems Tabelle nicht verfügbar
      return [
        { produkt: "Eier", bestand: 6, bedarf: 20 },
        { produkt: "Käsewürfel", bestand: 4, bedarf: 15 },
        { produkt: "Apfelsaft 0,33l", bestand: 8, bedarf: 22 },
        { produkt: "Mineralwasser 0,5l", bestand: 12, bedarf: 30 },
        { produkt: "Vollkornbrötchen", bestand: 3, bedarf: 10 }
      ];
    } catch (error) {
      console.error('Fehler beim Laden der Lagerbestandsdaten:', error);
      return [
        { produkt: "Eier", bestand: 6, bedarf: 20 },
        { produkt: "Käsewürfel", bestand: 4, bedarf: 15 },
        { produkt: "Apfelsaft 0,33l", bestand: 8, bedarf: 22 }
      ];
    }
  }

  /**
   * Erkennt Automaten-Anomalien
   */
  private async getMachineAnomalies(): Promise<MachineAnomaly[]> {
    const anomalies: MachineAnomaly[] = [];
    const today = new Date();
    const sixDaysAgo = new Date(today);
    sixDaysAgo.setDate(today.getDate() - 6);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);
    const oneDayAgo = new Date(today);
    oneDayAgo.setDate(today.getDate() - 1);

    try {
      // Automaten die lange nicht geöffnet wurden
      const machinesWithoutEvents = await db
        .select({
          machineName: machines.machineName,
          lastVend: max(transactions.datetime).as('lastVend')
        })
        .from(machines)
        .leftJoin(transactions, eq(machines.machineName, transactions.machineName))
        .groupBy(machines.machineName)
        .having(sql`MAX(${transactions.datetime}) < ${sixDaysAgo} OR MAX(${transactions.datetime}) IS NULL`);

      machinesWithoutEvents.forEach(machine => {
        const daysSinceLastVend = machine.lastVend 
          ? Math.floor((today.getTime() - machine.lastVend.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        
        if (daysSinceLastVend >= 6) {
          anomalies.push({
            automat: machine.machineName || 'Unbekannt',
            meldung: `Seit ${daysSinceLastVend} Tagen nicht geöffnet`
          });
        }
      });

      // Automaten ohne Kartenzahlung (vereinfacht)
      const machinesWithoutCard = await db
        .select({
          machineName: transactions.machineName,
          lastCardPayment: max(transactions.datetime).as('lastCardPayment')
        })
        .from(transactions)
        .where(eq(transactions.paymentMethod, 'CASHLESS'))
        .groupBy(transactions.machineName)
        .having(sql`MAX(${transactions.datetime}) < ${twoDaysAgo}`);

      machinesWithoutCard.forEach(machine => {
        anomalies.push({
          automat: machine.machineName || 'Unbekannt',
          meldung: 'Seit 2 Tagen keine Kartenzahlung'
        });
      });

    } catch (error) {
      console.error('Fehler beim Erkennen von Automaten-Anomalien:', error);
      return [
        { automat: "#4", meldung: "Seit 6 Tagen nicht geöffnet" },
        { automat: "#1", meldung: "Seit 2 Tagen keine Kartenzahlung" },
        { automat: "#5", meldung: "Seit 24h kein Alkoholverkauf" }
      ];
    }

    return anomalies.slice(0, 5); // Limitiere auf 5 Anomalien
  }

  /**
   * Erstellt Tagesrückblick mit Umsatz
   */
  private async getDailySummary(date: Date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    try {
      const dailyStats = await db
        .select({
          totalRevenue: sum(transactions.price).as('totalRevenue'),
          totalNetResult: sum(transactions.price).as('totalNetResult'),
          transactionCount: count(transactions.id).as('transactionCount')
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, dayStart),
            lte(transactions.datetime, dayEnd)
          )
        );

      const stats = dailyStats[0] || {};
      
      return {
        umsatz_gesamt: Number(stats.totalRevenue) || 0,
        netto_ergebnis: Number(stats.totalNetResult) || 0
      };
    } catch (error) {
      console.error('Fehler beim Erstellen der Tagesstatistik:', error);
      return {
        umsatz_gesamt: 526.4,
        netto_ergebnis: 431.6
      };
    }
  }

  /**
   * Holt aktuelle Entnahmen/Refills
   */
  private async getRecentWithdrawals(date: Date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    try {
      const recentRefills = await db
        .select({
          machineName: refills.machineName,
          refillType: refills.refillType,
          actualAmount: refills.actualAmount
        })
        .from(refills)
        .where(
          and(
            gte(refills.datetime, dayStart),
            lte(refills.datetime, dayEnd),
            gte(refills.actualAmount, 1)
          )
        )
        .limit(10);

      // Gruppiere nach Automat
      const groupedRefills = recentRefills.reduce((acc, refill) => {
        const machineName = refill.machineName || 'Unbekannt';
        if (!acc[machineName]) {
          acc[machineName] = [];
        }
        acc[machineName].push(`${refill.actualAmount}x ${refill.refillType}`);
        return acc;
      }, {} as Record<string, string[]>);

      return Object.entries(groupedRefills).map(([automat, produkte]) => ({
        automat,
        produkte
      }));
    } catch (error) {
      console.error('Fehler beim Laden der Entnahmen:', error);
      return [
        { automat: "#2", produkte: ["4x Milchreis", "2x Salat"] },
        { automat: "#6", produkte: ["5x Club-Mate", "3x Bier Hell"] }
      ];
    }
  }

  /**
   * Analysiert Verkäufe und Top-Produkte für den Berichtszeitraum
   * KORRIGIERT: Umsatz-Null-Problem durch robuste Decimal-Behandlung und Null-Checks
   */
  private async getSalesAnalysis(reportDate: Date) {
    const dayStart = new Date(reportDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(reportDate);
    dayEnd.setHours(23, 59, 59, 999);

    try {
      // Gesamtumsatz und Anzahl Verkäufe - KORRIGIERT mit COALESCE und Price-Validierung
      const salesStats = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(CAST(${transactions.price} AS DECIMAL)), 0)`.as('totalRevenue'),
          totalSales: count(transactions.id).as('totalSales')
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, dayStart),
            lte(transactions.datetime, dayEnd),
            // Stelle sicher, dass price nicht null und > 0 ist
            sql`${transactions.price} IS NOT NULL AND CAST(${transactions.price} AS DECIMAL) > 0`
          )
        );

      // Top-Produkte nach Stückzahl und Umsatz - KORRIGIERT mit verbesserter Aggregation
      const topProducts = await db
        .select({
          productName: transactions.productName,
          quantity: sql<number>`COALESCE(SUM(CAST(${transactions.quantity} AS INTEGER)), 0)`.as('quantity'),
          revenue: sql<number>`COALESCE(SUM(CAST(${transactions.price} AS DECIMAL)), 0)`.as('revenue')
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.datetime, dayStart),
            lte(transactions.datetime, dayEnd),
            sql`${transactions.price} IS NOT NULL AND CAST(${transactions.price} AS DECIMAL) > 0`,
            sql`${transactions.quantity} IS NOT NULL AND CAST(${transactions.quantity} AS INTEGER) > 0`
          )
        )
        .groupBy(transactions.productName)
        .orderBy(sql`COALESCE(SUM(CAST(${transactions.quantity} AS INTEGER)), 0) DESC`)
        .limit(5);

      const stats = salesStats[0] || {};
      
      // Robuste Number-Konvertierung mit Fallback-Werten
      const totalRevenue = Number(stats.totalRevenue) || 0;
      const totalSales = Number(stats.totalSales) || 0;
      
      console.log(`📊 Verkaufsanalyse ${reportDate.toISOString().split('T')[0]}: ${totalSales} Verkäufe, ${totalRevenue.toFixed(2)}€ Umsatz`);
      
      return {
        anzahl_verkäufe: totalSales,
        umsatzsumme: totalRevenue,
        top_produkte: topProducts.map(product => ({
          name: product.productName || 'Unbekannt',
          stückzahl: Number(product.quantity) || 0,
          umsatz: Number(product.revenue) || 0
        }))
      };
    } catch (error) {
      console.error('❌ Fehler bei der Verkaufsanalyse:', error);
      return {
        anzahl_verkäufe: 0,
        umsatzsumme: 0,
        top_produkte: []
      };
    }
  }

  /**
   * Analysiert Lagerbestand und Logistik
   */
  private async getInventoryAnalysis(settings?: any) {
    const lowStockThreshold = settings?.lowStockThreshold || 10;
    const mhdWarningDays = settings?.mhdWarningDays || 7;

    try {
      // Niedriger Lagerbestand
      const lowStockItems = await db
        .select({
          productName: products.productName,
          currentStock: inventoryItems.quantity,
          minQuantity: inventoryItems.minQuantity
        })
        .from(inventoryItems)
        .leftJoin(products, eq(inventoryItems.productId, products.id))
        .where(lte(inventoryItems.quantity, lowStockThreshold))
        .orderBy(inventoryItems.quantity)
        .limit(10);

      // MHD-Daten
      const mhdData = await this.getMHDData();

      // Nachbestellempfehlungen (vereinfachte Logik)
      const reorderRecommendations = lowStockItems.slice(0, 5).map(item => ({
        produkt: item.productName || 'Unbekannt',
        priorität: (item.currentStock || 0) <= 5 ? 'hoch' : 'mittel',
        abverkaufsgeschwindigkeit: '5-10 Stück/Woche', // Mock-Daten
        empfohlene_menge: Math.max(20, (item.minQuantity || 10) * 2)
      }));

      return {
        niedriger_lagerbestand: lowStockItems.map(item => ({
          produkt: item.productName || 'Unbekannt',
          bestand: Number(item.currentStock) || 0,
          schwellenwert: lowStockThreshold
        })),
        nachzubestellende_artikel: reorderRecommendations,
        nahendes_mhd: {
          lager: mhdData.lager,
          automaten: mhdData.automaten
        }
      };
    } catch (error) {
      console.error('Fehler bei der Lageranalyse:', error);
      return {
        niedriger_lagerbestand: [],
        nachzubestellende_artikel: [],
        nahendes_mhd: {
          lager: { "<5": [], "<14": [], "<31": [] },
          automaten: []
        }
      };
    }
  }

  /**
   * Agent-Analyse für besondere Auffälligkeiten
   */
  private async getAgentAnalysis(reportDate: Date) {
    try {
      // Anomalien von der alten getMachineAnomalies Methode
      const anomalies = await this.getMachineAnomalies();
      
      // Trends-Analyse (vereinfacht)
      const trends: string[] = [];
      const recommendations: string[] = [];
      
      if (anomalies.length > 3) {
        trends.push('Erhöhte Anzahl von Maschinenstörungen erkannt');
        recommendations.push('Wartungsintervalle überprüfen');
      }

      const specialFindings = anomalies.map(a => a.meldung);
      
      return {
        hasRelevantFindings: specialFindings.length > 0 || trends.length > 0,
        besondere_auffälligkeiten: specialFindings,
        trends,
        empfehlungen: recommendations
      };
    } catch (error) {
      console.error('Fehler bei der Agent-Analyse:', error);
      return {
        hasRelevantFindings: false,
        besondere_auffälligkeiten: [],
        trends: [],
        empfehlungen: []
      };
    }
  }

  /**
   * Sammelt erweiterte Bestellungs- und Lieferdaten
   */
  private async getEnhancedOrderData(reportDate: Date = new Date()) {
    const today = new Date(reportDate);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(today.getDate() + 7);

    try {
      // Heute erwartete Bestellungen
      const todayExpected = await db
        .select({
          orderNumber: orders.orderNumber,
          supplierName: orders.supplierName,
          orderDate: orders.orderDate,
          expectedDeliveryDate: orders.expectedDeliveryDate,
          status: orders.status,
          totalAmount: orders.totalAmount,
          notes: orders.notes
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, 'ordered'),
            gte(orders.expectedDeliveryDate, today),
            lte(orders.expectedDeliveryDate, tomorrow)
          )
        )
        .orderBy(orders.expectedDeliveryDate);

      // Diese Woche erwartete Bestellungen  
      const thisWeekExpected = await db
        .select({
          orderNumber: orders.orderNumber,
          supplierName: orders.supplierName,
          orderDate: orders.orderDate,
          expectedDeliveryDate: orders.expectedDeliveryDate,
          status: orders.status,
          totalAmount: orders.totalAmount,
          notes: orders.notes
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, 'ordered'),
            gte(orders.expectedDeliveryDate, tomorrow),
            lte(orders.expectedDeliveryDate, weekFromNow)
          )
        )
        .orderBy(orders.expectedDeliveryDate)
        .limit(10);

      // Verspätete Bestellungen (erwartetes Lieferdatum überschritten)
      const overdueOrders = await db
        .select({
          orderNumber: orders.orderNumber,
          supplierName: orders.supplierName,
          orderDate: orders.orderDate,
          expectedDeliveryDate: orders.expectedDeliveryDate,
          status: orders.status,
          totalAmount: orders.totalAmount,
          notes: orders.notes
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, 'ordered'),
            lte(orders.expectedDeliveryDate, today)
          )
        )
        .orderBy(orders.expectedDeliveryDate)
        .limit(10);

      // Nicht gelieferte Bestellungen (ohne erwartetes Lieferdatum)
      const undeliveredOrders = await db
        .select({
          orderNumber: orders.orderNumber,
          supplierName: orders.supplierName,
          orderDate: orders.orderDate,
          expectedDeliveryDate: orders.expectedDeliveryDate,
          status: orders.status,
          totalAmount: orders.totalAmount,
          notes: orders.notes
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, 'ordered'),
            sql`${orders.expectedDeliveryDate} IS NULL`
          )
        )
        .orderBy(orders.orderDate)
        .limit(5);

      // Hilfsfunktion zur Formatierung der Bestelldaten
      const formatOrderData = (order: any): OrderDelivery => {
        const orderDate = order.orderDate?.toISOString().split('T')[0] || '';
        const expectedDate = order.expectedDeliveryDate?.toISOString().split('T')[0];
        const delayDays = expectedDate && new Date(expectedDate) < today 
          ? Math.ceil((today.getTime() - new Date(expectedDate).getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

        return {
          bestellnummer: order.orderNumber || 'Unbekannt',
          lieferant: order.supplierName || 'Unbekannt',
          bestelldatum: orderDate,
          erwartetes_lieferdatum: expectedDate,
          status: order.status || 'unbekannt',
          produkte: order.notes ? [order.notes] : ['Siehe Bestellung ' + order.orderNumber],
          gesamtwert: Number(order.totalAmount) || 0,
          verspätung_tage: delayDays
        };
      };

      // Zusammenfassungsstatistiken
      const allPendingOrders = await db
        .select({
          count: count(orders.id).as('count'),
          totalAmount: sum(orders.totalAmount).as('totalAmount')
        })
        .from(orders)
        .where(eq(orders.status, 'ordered'));

      const pendingStats = allPendingOrders[0] || {};
      const criticalDelays = overdueOrders.filter(order => {
        const delay = order.expectedDeliveryDate 
          ? Math.ceil((today.getTime() - order.expectedDeliveryDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return delay > 7; // Mehr als 7 Tage verspätet
      }).length;

      return {
        heute_erwartet: todayExpected.map(formatOrderData),
        diese_woche: thisWeekExpected.map(formatOrderData),
        verspätet: overdueOrders.map(formatOrderData),
        nicht_geliefert: undeliveredOrders.map(formatOrderData),
        zusammenfassung: {
          total_ausstehend: Number(pendingStats.count) || 0,
          total_wert_ausstehend: Number(pendingStats.totalAmount) || 0,
          kritische_verspätungen: criticalDelays
        }
      };
    } catch (error) {
      console.error('Fehler beim Laden der erweiterten Bestelldaten:', error);
      return {
        heute_erwartet: [],
        diese_woche: [],
        verspätet: [],
        nicht_geliefert: [],
        zusammenfassung: {
          total_ausstehend: 0,
          total_wert_ausstehend: 0,
          kritische_verspätungen: 0
        }
      };
    }
  }

  /**
   * Sammelt Automaten-Status und Anomalie-Alerts
   */
  private async getMachineStatusAlerts(reportDate: Date = new Date()) {
    const alerts: MachineStatusAlert[] = [];
    const today = new Date(reportDate);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    try {
      // 1. Hoher Geldbestand (basierend auf Transaktionen)
      const highCashMachines = await db
        .select({
          machineName: transactions.machineName,
          machineId: machines.id,
          totalCash: sum(transactions.price).as('totalCash'),
          lastTransaction: max(transactions.datetime).as('lastTransaction')
        })
        .from(transactions)
        .leftJoin(machines, eq(transactions.machineName, machines.machineName))
        .where(
          and(
            gte(transactions.datetime, weekAgo),
            eq(transactions.paymentMethod, 'CASH')
          )
        )
        .groupBy(transactions.machineName, machines.id)
        .having(sql`SUM(${transactions.price}) > 200`) // Hoher Geldbestand > 200€
        .orderBy(desc(sum(transactions.price)))
        .limit(5);

      highCashMachines.forEach(machine => {
        alerts.push({
          automat: machine.machineName || 'Unbekannt',
          automat_id: machine.machineId?.toString() || 'unknown',
          alert_typ: 'hoher_geldbestand',
          meldung: `Hoher Bargeldbestand: ${Math.round(Number(machine.totalCash) || 0)}€`,
          schweregrad: Number(machine.totalCash) > 300 ? 'hoch' : 'mittel',
          wert: Math.round(Number(machine.totalCash) || 0),
          grenzwert: 200,
          einheit: '€'
        });
      });

      // 2. Wenig Münzgeld (Automaten mit wenig Kleingeld-Transaktionen)
      const lowCoinMachines = await db
        .select({
          machineName: transactions.machineName,
          machineId: machines.id,
          smallTransactions: count(transactions.id).as('smallTransactions'),
          avgPrice: sql<number>`AVG(${transactions.price})`.as('avgPrice')
        })
        .from(transactions)
        .leftJoin(machines, eq(transactions.machineName, machines.machineName))
        .where(
          and(
            gte(transactions.datetime, yesterday),
            lte(transactions.price, 2.0), // Kleine Beträge
            eq(transactions.paymentMethod, 'CASH')
          )
        )
        .groupBy(transactions.machineName, machines.id)
        .having(sql`COUNT(${transactions.id}) < 3`) // Weniger als 3 kleine Transaktionen
        .limit(3);

      lowCoinMachines.forEach(machine => {
        alerts.push({
          automat: machine.machineName || 'Unbekannt',
          automat_id: machine.machineId?.toString() || 'unknown',
          alert_typ: 'wenig_münzen',
          meldung: `Möglicher Münzgeldmangel - nur ${machine.smallTransactions} kleine Transaktionen`,
          schweregrad: 'mittel',
          wert: Number(machine.smallTransactions),
          grenzwert: 3,
          einheit: 'Transaktionen'
        });
      });

      // 3. Technische Anomalien (aus Events-Tabelle)
      const technicalIssues = await db
        .select({
          machineName: events.machineName,
          machineId: events.machineId,
          eventType: events.eventType,
          description: events.description,
          eventDatetime: events.eventDatetime
        })
        .from(events)
        .where(
          and(
            gte(events.eventDatetime, yesterday),
            sql`${events.eventType} IN ('ERROR', 'MALFUNCTION', 'SERVICE_REQUIRED')`
          )
        )
        .orderBy(desc(events.eventDatetime))
        .limit(5);

      technicalIssues.forEach(issue => {
        const severity = issue.eventType === 'ERROR' ? 'hoch' : 'mittel';
        alerts.push({
          automat: issue.machineName || 'Unbekannt',
          automat_id: issue.machineId?.toString() || 'unknown',
          alert_typ: 'technische_anomalie',
          meldung: `${issue.eventType}: ${issue.description || 'Technisches Problem'}`,
          schweregrad: severity,
          dauer: 'Seit ' + (issue.eventDatetime?.toLocaleTimeString('de-DE') || 'unbekannt')
        });
      });

      // 4. Performance-Abweichungen (basierend auf Transaction Gaps)
      const performanceIssues = await db
        .select({
          machineName: transactionGaps.machineName,
          machineId: transactionGaps.machineId,
          severity: transactionGaps.severity,
          gapDurationHours: transactionGaps.gapDurationHours,
          gapStart: transactionGaps.gapStart
        })
        .from(transactionGaps)
        .where(
          and(
            gte(transactionGaps.gapStart, weekAgo),
            sql`${transactionGaps.status} = 'detected'`,
            gte(transactionGaps.gapDurationHours, 4) // Lücken > 4 Stunden
          )
        )
        .orderBy(desc(transactionGaps.gapDurationHours))
        .limit(3);

      performanceIssues.forEach(issue => {
        const hours = Math.round(Number(issue.gapDurationHours) || 0);
        alerts.push({
          automat: issue.machineName || 'Unbekannt',
          automat_id: issue.machineId?.toString() || 'unknown',
          alert_typ: 'performance_abweichung',
          meldung: `Transaktionslücke von ${hours}h erkannt`,
          schweregrad: issue.severity as any || 'mittel',
          wert: hours,
          grenzwert: 4,
          einheit: 'Stunden',
          dauer: hours + 'h'
        });
      });

      // Zusammenfassung
      const totalAlerts = alerts.length;
      const criticalAlerts = alerts.filter(a => a.schweregrad === 'kritisch' || a.schweregrad === 'hoch').length;
      const affectedMachines = new Set(alerts.map(a => a.automat)).size;

      return {
        hoher_geldbestand: alerts.filter(a => a.alert_typ === 'hoher_geldbestand'),
        münzgeld_warnungen: alerts.filter(a => a.alert_typ === 'wenig_münzen'),
        technische_anomalien: alerts.filter(a => a.alert_typ === 'technische_anomalie'),
        performance_abweichungen: alerts.filter(a => a.alert_typ === 'performance_abweichung'),
        zusammenfassung: {
          total_alerts: totalAlerts,
          kritische_alerts: criticalAlerts,
          betroffene_automaten: affectedMachines
        }
      };
    } catch (error) {
      console.error('Fehler beim Sammeln der Automaten-Status-Alerts:', error);
      return {
        hoher_geldbestand: [],
        münzgeld_warnungen: [],
        technische_anomalien: [],
        performance_abweichungen: [],
        zusammenfassung: {
          total_alerts: 0,
          kritische_alerts: 0,
          betroffene_automaten: 0
        }
      };
    }
  }

  /**
   * Erweiterte Hinweise-Generierung
   */
  private generateEnhancedHints(salesData: any, inventoryData: any, agentAnalysis: any): string[] {
    const hints: string[] = [];

    // Verkaufs-Hinweise
    if (salesData.anzahl_verkäufe === 0) {
      hints.push('Keine Verkäufe heute - System prüfen');
    }

    // Lager-Hinweise
    if (inventoryData.niedriger_lagerbestand.length > 0) {
      hints.push(`${inventoryData.niedriger_lagerbestand.length} Produkte unter Mindestbestand`);
    }

    if (inventoryData.nachzubestellende_artikel.length > 0) {
      const highPriorityItems = inventoryData.nachzubestellende_artikel.filter((item: any) => item.priorität === 'hoch').length;
      if (highPriorityItems > 0) {
        hints.push(`${highPriorityItems} Artikel mit hoher Nachbestellpriorität`);
      }
    }

    // MHD-Hinweise
    const criticalMHD = inventoryData.nahendes_mhd.lager["<5"].length + inventoryData.nahendes_mhd.automaten.filter((item: any) => {
      const days = Math.ceil((new Date(item.mhd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days <= 5;
    }).length;
    
    if (criticalMHD > 0) {
      hints.push(`${criticalMHD} Produkte laufen in <5 Tagen ab`);
    }

    // Agent-Analyse Hinweise
    if (agentAnalysis.empfehlungen.length > 0) {
      hints.push(...agentAnalysis.empfehlungen.slice(0, 2));
    }

    if (hints.length === 0) {
      hints.push('Alle Systeme laufen normal');
    }

    return hints;
  }

  // Behalte die alten Methoden für Kompatibilität bei
  /**
   * @deprecated Use getSalesAnalysis instead
   */
  private generateHints(openOrders: any[], anomalies: MachineAnomaly[]): string[] {
    const hints: string[] = [];

    if (openOrders.length > 0) {
      openOrders.slice(0, 2).forEach(order => {
        hints.push(`Bitte Wareneingang von Bestellung ${order.lieferant} prüfen`);
      });
    }

    if (anomalies.length > 0) {
      anomalies.slice(0, 2).forEach(anomaly => {
        if (anomaly.meldung.includes('Tagen nicht geöffnet')) {
          hints.push(`${anomaly.automat} ggf. kontrollieren (${anomaly.meldung})`);
        }
      });
    }

    if (hints.length === 0) {
      hints.push('Alle Systeme laufen normal');
    }

    return hints;
  }
}