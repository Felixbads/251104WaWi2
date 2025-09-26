import { notificationService } from '../notificationService';
import { db } from '../../db';
import { machineStocks, machines, locations, products } from '@shared/schema';
import { eq, sql, and, lte } from 'drizzle-orm';

/**
 * MHD Soon Trigger - ERWEITERT: Intelligente MHD-Überwachung für Automaten
 * Enhanced expiry date monitoring with machine-specific analysis, product value prioritization and smart recommendations
 */
export class MhdSoonTrigger {
  // ERWEITERTE MHD-KATEGORIEN für stufenweise Überwachung
  private readonly MHD_RISK_LEVELS = {
    CRITICAL: 1,    // 🚨 Kritisch: <24h
    HIGH: 3,        // 🔴 Hoch: 1-3 Tage
    MEDIUM: 7,      // 🟡 Mittel: 4-7 Tage
    LOW: 14         // 🟢 Niedrig: 8-14 Tage
  };

  private readonly PRODUCT_VALUE_TIERS = {
    PREMIUM: 5.0,     // Premium-Produkte >5€
    HIGH: 3.0,        // Hochwertige Produkte 3-5€
    STANDARD: 1.5,    // Standard-Produkte 1.5-3€
    BASIC: 0          // Basis-Produkte <1.5€
  };

  private readonly LOCATION_TYPES = {
    OFFICE: { riskMultiplier: 1.2, replacementUrgency: 'high' },
    SCHOOL: { riskMultiplier: 0.8, replacementUrgency: 'medium' },
    HOSPITAL: { riskMultiplier: 1.5, replacementUrgency: 'critical' },
    FACTORY: { riskMultiplier: 1.0, replacementUrgency: 'medium' },
    PUBLIC: { riskMultiplier: 0.9, replacementUrgency: 'low' }
  };

  /**
   * ERWEITERTE MHD-Überwachung mit intelligenter Automaten-Analyse
   */
  async checkExpiryDates(warningDays: number = 14): Promise<void> {
    try {
      console.log(`🗓️ Erweiterte MHD-Analyse wird durchgeführt (${warningDays} Tage Vorlauf)...`);

      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + warningDays);

      // ERWEITERTE Query mit Produkt-Details und Preisen
      const expiringProducts = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          locationType: sql<string>`COALESCE(${locations.locationType}, 'PUBLIC')`,
          
          // Produkt-Details
          productName: sql<string>`COALESCE(${machineStocks.productVendonId}, 'Unbekanntes Produkt')`,
          productId: machineStocks.productId,
          selectionNumber: machineStocks.selectionNumber,
          quantity: machineStocks.quantity,
          expiryDate: machineStocks.expiryDate,
          
          // ERWEITERTE Berechnungen
          daysUntilExpiry: sql<number>`DATE_PART('day', ${machineStocks.expiryDate} - CURRENT_DATE)`,
          
          // Produkt-Wert (für Priorisierung)
          productPrice: sql<number>`COALESCE(${products.sellingPrice}, 0)`,
          totalValue: sql<number>`COALESCE(${products.sellingPrice}, 0) * COALESCE(${machineStocks.quantity}, 0)`,
          
          // Automaten-Performance
          dailyRevenue: sql<number>`COALESCE(${machines.dailyRevenue}, 0)`,
          lastRefill: sql<string>`${machines.lastRefillDate}`,
          
          // Produkt-Kategorie für intelligente Empfehlungen
          category: sql<string>`COALESCE(${products.category}, 'Standard')`
        })
        .from(machineStocks)
        .innerJoin(machines, eq(machineStocks.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(products, eq(machineStocks.productId, products.id))
        .where(
          and(
            eq(machines.isActive, true),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.quantity} > 0`,
            sql`${machineStocks.expiryDate} IS NOT NULL`,
            lte(machineStocks.expiryDate, warningDate.toISOString().split('T')[0])
          )
        )
        .orderBy(machineStocks.expiryDate);

      console.log(`📊 ${expiringProducts.length} Produkte mit ablaufendem MHD gefunden`);

      // INTELLIGENTE Gruppierung nach Automaten mit erweiterten Analysen
      const machineGroups = new Map<number, typeof expiringProducts>();
      
      for (const product of expiringProducts) {
        if (!machineGroups.has(product.machineId)) {
          machineGroups.set(product.machineId, []);
        }
        machineGroups.get(product.machineId)!.push(product);
      }

      for (const [machineId, products] of machineGroups) {
        const machine = products[0]; // Get machine info from first product
        const analysis = this.analyzeMHDSituation(machine, products);
        
        if (analysis.requiresNotification) {
          const payload = {
            machineId: machine.machineId,
            machineName: machine.machineName,
            vendonId: machine.vendonId,
            locationName: machine.locationName,
            locationId: machine.locationId,
            
            // ERWEITERTE Produkt-Analyse
            expiringProducts: products.map(p => ({
              productName: p.productName,
              selectionNumber: p.selectionNumber,
              quantity: p.quantity,
              expiryDate: p.expiryDate,
              daysUntilExpiry: p.daysUntilExpiry,
              productPrice: p.productPrice,
              totalValue: p.totalValue,
              category: p.category,
              riskLevel: this.calculateRiskLevel(p.daysUntilExpiry || 0, p.productPrice || 0),
              priority: this.calculatePriority(p.daysUntilExpiry || 0, p.productPrice || 0, p.quantity || 0)
            })),
            
            // AGGREGIERTE Metriken
            totalExpiringItems: analysis.totalItems,
            totalExpiringValue: analysis.totalValue,
            criticalItems: analysis.criticalItems,
            highRiskItems: analysis.highRiskItems,
            mediumRiskItems: analysis.mediumRiskItems,
            lowRiskItems: analysis.lowRiskItems,
            
            // STANDORT-ANALYSE
            locationType: machine.locationType,
            locationRiskMultiplier: analysis.locationRiskMultiplier,
            replacementUrgency: analysis.replacementUrgency,
            
            // INTELLIGENTE Empfehlungen
            recommendedActions: analysis.recommendedActions,
            collectionStrategy: analysis.collectionStrategy,
            refillRecommendations: analysis.refillRecommendations,
            estimatedLoss: analysis.estimatedLoss,
            
            // Metadaten
            timestamp: new Date().toISOString(),
            message: analysis.message,
            severity: analysis.severity,
            category: 'mhd_management',
            alertType: analysis.alertType
          };

          // DYNAMISCHE Deduplikation basierend auf Schweregrad
          const dedupeWindow = this.getDeduplicationWindow(analysis.severity);
          await notificationService.recordEvent('mhd_soon_enhanced', payload, dedupeWindow);
        }
      }

    } catch (error) {
      console.error('❌ Fehler bei der erweiterten MHD-Analyse:', error);
      throw error;
    }
  }

  /**
   * NEUE Funktion: Intelligente MHD-Situations-Analyse
   */
  private analyzeMHDSituation(machine: any, products: any[]): {
    requiresNotification: boolean;
    totalItems: number;
    totalValue: number;
    criticalItems: number;
    highRiskItems: number;
    mediumRiskItems: number;
    lowRiskItems: number;
    locationRiskMultiplier: number;
    replacementUrgency: string;
    recommendedActions: string[];
    collectionStrategy: string;
    refillRecommendations: string[];
    estimatedLoss: number;
    severity: 'info' | 'warning' | 'critical' | 'urgent';
    message: string;
    alertType: string;
  } {
    const locationType = machine.locationType || 'PUBLIC';
    const locationConfig = this.LOCATION_TYPES[locationType as keyof typeof this.LOCATION_TYPES] || this.LOCATION_TYPES.PUBLIC;
    
    // KATEGORISIERUNG nach Risiko-Level
    const criticalItems = products.filter(p => (p.daysUntilExpiry || 0) <= this.MHD_RISK_LEVELS.CRITICAL).length;
    const highRiskItems = products.filter(p => {
      const days = p.daysUntilExpiry || 0;
      return days > this.MHD_RISK_LEVELS.CRITICAL && days <= this.MHD_RISK_LEVELS.HIGH;
    }).length;
    const mediumRiskItems = products.filter(p => {
      const days = p.daysUntilExpiry || 0;
      return days > this.MHD_RISK_LEVELS.HIGH && days <= this.MHD_RISK_LEVELS.MEDIUM;
    }).length;
    const lowRiskItems = products.filter(p => {
      const days = p.daysUntilExpiry || 0;
      return days > this.MHD_RISK_LEVELS.MEDIUM && days <= this.MHD_RISK_LEVELS.LOW;
    }).length;

    // WERT-Analyse
    const totalItems = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const totalValue = products.reduce((sum, p) => sum + (p.totalValue || 0), 0);
    const estimatedLoss = totalValue * 0.8; // 80% Verlust bei Ablauf

    // SCHWEREGRAD-Bestimmung
    let severity: 'info' | 'warning' | 'critical' | 'urgent';
    let alertType: string;
    let message: string;

    if (criticalItems > 0) {
      severity = 'urgent';
      alertType = 'mhd_critical_expiry';
      message = `🚨 KRITISCH: ${machine.machineName} - ${criticalItems} Produkte laufen binnen 24h ab!`;
    } else if (highRiskItems > 0 && totalValue > 50) {
      severity = 'critical';
      alertType = 'mhd_high_risk_value';
      message = `🔴 HOHES RISIKO: ${machine.machineName} - ${highRiskItems} hochwertige Produkte (${totalValue.toFixed(2)}€)`;
    } else if (highRiskItems > 0 || mediumRiskItems > 3) {
      severity = 'warning';
      alertType = 'mhd_warning_multiple';
      message = `🟡 WARNUNG: ${machine.machineName} - ${products.length} Produkte mit ablaufendem MHD`;
    } else {
      severity = 'info';
      alertType = 'mhd_info_monitoring';
      message = `🟢 INFO: ${machine.machineName} - ${lowRiskItems} Produkte überwachen`;
    }

    // INTELLIGENTE Empfehlungen
    const recommendedActions: string[] = [];
    const refillRecommendations: string[] = [];

    if (criticalItems > 0) {
      recommendedActions.push('Sofortige Produktentnahme binnen 6h');
      recommendedActions.push('Neue Charge mit längerem MHD bestellen');
      if (totalValue > 100) {
        recommendedActions.push('Schnellverkauf/Rabatt-Aktion prüfen');
      }
    }

    if (highRiskItems > 0) {
      recommendedActions.push('Entnahme binnen 1-2 Tagen planen');
      refillRecommendations.push('Reduzierten Nachfüllmengen verwenden');
    }

    if (mediumRiskItems > 2) {
      recommendedActions.push('Wöchentliche MHD-Kontrolle verstärken');
      refillRecommendations.push('FIFO-Prinzip strenger befolgen');
    }

    // STANDORT-spezifische Anpassungen
    if (locationType === 'HOSPITAL') {
      recommendedActions.push('Hygiene-Standards bei Entnahme beachten');
      refillRecommendations.push('Besonders kurze MHD-Zyklen verwenden');
    } else if (locationType === 'SCHOOL') {
      refillRecommendations.push('Ferienzeiten bei Nachfüllung berücksichtigen');
    }

    // ABHOL-Strategie
    let collectionStrategy: string;
    if (criticalItems > 0) {
      collectionStrategy = 'NOTFALL - Sofortige Entnahme erforderlich';
    } else if (highRiskItems > 0 && totalValue > 50) {
      collectionStrategy = 'PRIORITÄT - Geplante Entnahme binnen 24h';
    } else if (mediumRiskItems > 2) {
      collectionStrategy = 'GEPLANT - Entnahme bei nächster Wartung';
    } else {
      collectionStrategy = 'ROUTINE - Normale Überwachung fortsetzen';
    }

    return {
      requiresNotification: criticalItems > 0 || highRiskItems > 0 || mediumRiskItems > 2,
      totalItems,
      totalValue,
      criticalItems,
      highRiskItems,
      mediumRiskItems,
      lowRiskItems,
      locationRiskMultiplier: locationConfig.riskMultiplier,
      replacementUrgency: locationConfig.replacementUrgency,
      recommendedActions,
      collectionStrategy,
      refillRecommendations,
      estimatedLoss,
      severity,
      message,
      alertType
    };
  }

  /**
   * NEUE Funktion: Risiko-Level-Berechnung für einzelne Produkte
   */
  private calculateRiskLevel(daysUntilExpiry: number, productPrice: number): 'critical' | 'high' | 'medium' | 'low' {
    // ZEITBASIERTE Risiko-Bewertung
    if (daysUntilExpiry <= this.MHD_RISK_LEVELS.CRITICAL) return 'critical';
    if (daysUntilExpiry <= this.MHD_RISK_LEVELS.HIGH) return 'high';
    if (daysUntilExpiry <= this.MHD_RISK_LEVELS.MEDIUM) return 'medium';
    return 'low';
  }

  /**
   * NEUE Funktion: Prioritäts-Berechnung für Handlungsreihenfolge
   */
  private calculatePriority(daysUntilExpiry: number, productPrice: number, quantity: number): number {
    let priority = 1;
    
    // ZEIT-Faktor (je kürzer, desto höher)
    if (daysUntilExpiry <= 1) priority += 10;
    else if (daysUntilExpiry <= 3) priority += 7;
    else if (daysUntilExpiry <= 7) priority += 4;
    else if (daysUntilExpiry <= 14) priority += 2;
    
    // WERT-Faktor
    if (productPrice >= this.PRODUCT_VALUE_TIERS.PREMIUM) priority += 5;
    else if (productPrice >= this.PRODUCT_VALUE_TIERS.HIGH) priority += 3;
    else if (productPrice >= this.PRODUCT_VALUE_TIERS.STANDARD) priority += 2;
    
    // MENGEN-Faktor
    if (quantity > 10) priority += 2;
    else if (quantity > 5) priority += 1;
    
    return Math.min(priority, 20); // Cap bei 20
  }

  /**
   * NEUE Funktion: Deduplikationsfenster basierend auf Schweregrad
   */
  private getDeduplicationWindow(severity: string): number {
    switch (severity) {
      case 'urgent': return 3600;   // 1 Stunde für kritische Fälle
      case 'critical': return 7200; // 2 Stunden für hohe Risiken
      case 'warning': return 21600; // 6 Stunden für Warnungen
      default: return 43200;        // 12 Stunden für Info-Level
    }
  }

  /**
   * Check expiry dates for a specific machine
   */
  async checkMachineExpiryDates(machineId: number, warningDays: number = 7): Promise<void> {
    try {
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + warningDays);

      const expiringProducts = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          productName: sql<string>`COALESCE(${machineStocks.productVendonId}, 'Unbekanntes Produkt')`,
          selectionNumber: machineStocks.selectionNumber,
          quantity: machineStocks.quantity,
          expiryDate: machineStocks.expiryDate,
          daysUntilExpiry: sql<number>`DATE_PART('day', ${machineStocks.expiryDate} - CURRENT_DATE)`
        })
        .from(machineStocks)
        .innerJoin(machines, eq(machineStocks.machineId, machines.id))
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(
          and(
            eq(machines.id, machineId),
            eq(machines.isActive, true),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.quantity} > 0`,
            sql`${machineStocks.expiryDate} IS NOT NULL`,
            lte(machineStocks.expiryDate, warningDate.toISOString().split('T')[0])
          )
        )
        .orderBy(machineStocks.expiryDate);

      if (expiringProducts.length === 0) {
        console.log(`No expiring products found for machine ${machineId}`);
        return;
      }

      const machine = expiringProducts[0];
      
      const payload = {
        machineId: machine.machineId,
        machineName: machine.machineName,
        vendonId: machine.vendonId,
        locationName: machine.locationName,
        locationId: machine.locationId,
        expiringProducts: expiringProducts.map(p => ({
          productName: p.productName,
          selectionNumber: p.selectionNumber,
          quantity: p.quantity,
          expiryDate: p.expiryDate,
          daysUntilExpiry: p.daysUntilExpiry
        })),
        totalExpiringItems: expiringProducts.reduce((sum, p) => sum + (p.quantity || 0), 0),
        urgentItems: expiringProducts.filter(p => (p.daysUntilExpiry || 0) <= 3).length,
        warningItems: expiringProducts.filter(p => (p.daysUntilExpiry || 0) > 3 && (p.daysUntilExpiry || 0) <= 7).length,
        timestamp: new Date().toISOString(),
        message: `MHD-Warnung für ${machine.machineName}: ${expiringProducts.length} Produkte laufen ab`,
        severity: expiringProducts.some(p => (p.daysUntilExpiry || 0) <= 3) ? 'critical' : 'warning'
      };

      await notificationService.recordEvent('mhd_soon', payload, 21600); // 6 hour dedupe window for specific machine
      
    } catch (error) {
      console.error(`Error checking expiry dates for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Get expiry summary for all machines
   */
  async getExpirySummary(): Promise<{
    totalMachines: number;
    machinesWithExpiringProducts: number;
    totalExpiringProducts: number;
    urgentItems: number;
    warningItems: number;
    detailsByMachine: Array<{
      machineId: number;
      machineName: string;
      locationName: string;
      expiringProductCount: number;
      urgentCount: number;
      earliestExpiry: string | null;
    }>;
  }> {
    try {
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + 7);

      const summary = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          expiringProductCount: sql<number>`COUNT(${machineStocks.id})`,
          urgentCount: sql<number>`COUNT(CASE WHEN DATE_PART('day', ${machineStocks.expiryDate} - CURRENT_DATE) <= 3 THEN 1 END)`,
          earliestExpiry: sql<string>`MIN(${machineStocks.expiryDate})`
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(
          machineStocks,
          and(
            eq(machineStocks.machineId, machines.id),
            eq(machineStocks.status, 'active'),
            sql`${machineStocks.quantity} > 0`,
            sql`${machineStocks.expiryDate} IS NOT NULL`,
            lte(machineStocks.expiryDate, warningDate.toISOString().split('T')[0])
          )
        )
        .where(eq(machines.isActive, true))
        .groupBy(machines.id, machines.name, locations.name)
        .having(sql`COUNT(${machineStocks.id}) > 0`);

      const totalMachines = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(machines)
        .where(eq(machines.isActive, true));

      const totals = summary.reduce(
        (acc, machine) => ({
          totalExpiringProducts: acc.totalExpiringProducts + machine.expiringProductCount,
          urgentItems: acc.urgentItems + machine.urgentCount,
          warningItems: acc.warningItems + (machine.expiringProductCount - machine.urgentCount)
        }),
        { totalExpiringProducts: 0, urgentItems: 0, warningItems: 0 }
      );

      return {
        totalMachines: totalMachines[0].count,
        machinesWithExpiringProducts: summary.length,
        ...totals,
        detailsByMachine: summary
      };

    } catch (error) {
      console.error('Error getting expiry summary:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for testing or immediate check
   */
  async triggerManualCheck(warningDays: number = 7): Promise<{ machinesChecked: number; alertsTriggered: number }> {
    const startTime = Date.now();
    let alertsTriggered = 0;

    try {
      const allMachines = await db
        .select({ id: machines.id })
        .from(machines)
        .where(eq(machines.isActive, true));

      for (const machine of allMachines) {
        const eventsBefore = await notificationService.getEvents({
          eventType: 'mhd_soon',
          processed: false
        });

        await this.checkMachineExpiryDates(machine.id, warningDays);

        const eventsAfter = await notificationService.getEvents({
          eventType: 'mhd_soon',
          processed: false
        });

        if (eventsAfter.length > eventsBefore.length) {
          alertsTriggered++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Manual expiry check completed in ${duration}ms: ${allMachines.length} machines checked, ${alertsTriggered} alerts triggered`);

      return {
        machinesChecked: allMachines.length,
        alertsTriggered
      };

    } catch (error) {
      console.error('Error in manual expiry check:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const mhdSoonTrigger = new MhdSoonTrigger();