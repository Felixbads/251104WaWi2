import { notificationService } from '../notificationService';
import { db } from '../../db';
import { transactions, machines, locations, products, categories } from '@shared/schema';
import { eq, sql, and, max, ilike, or } from 'drizzle-orm';

/**
 * Alcohol Sales Inactive Trigger - Überwachung der Alkohol-Verkäufe zur Compliance-Sicherstellung
 * Monitors alcohol sales activity to ensure compliance and detect potential issues
 */
export class AlcoholSalesInactiveTrigger {
  /**
   * Check all machines for inactive alcohol sales
   */
  async checkAlcoholSalesActivity(): Promise<void> {
    try {
      console.log('🍺 Checking alcohol sales activity across all machines...');

      // SQL Query wie im Prompt spezifiziert - erweitert für bessere Erkennung
      const machinesWithoutAlcoholSales = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          lastAlcoholSale: max(transactions.datetime).as('lastAlcoholSale'),
          daysSinceLastAlcohol: sql<number>`EXTRACT(DAYS FROM (NOW() - MAX(${transactions.datetime})))`.as('daysSinceLastAlcohol')
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(transactions, eq(transactions.machineId, machines.id))
        .leftJoin(products, eq(transactions.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(machines.isActive, true),
            // Alcohol detection criteria
            or(
              // Category-based detection
              ilike(categories.name, '%alkohol%'),
              // Product name-based detection
              ilike(products.productName, '%bier%'),
              ilike(products.productName, '%wein%'),
              ilike(products.productName, '%sekt%'),
              ilike(products.productName, '%prosecco%'),
              ilike(products.productName, '%radler%'),
              ilike(products.productName, '%weizen%'),
              ilike(products.productName, '%pils%'),
              // Alcohol flag (if available)
              eq(products.isAlcoholic, true)
            )
          )
        )
        .groupBy(machines.id, machines.name, machines.vendonId, locations.name, locations.id)
        .having(sql`EXTRACT(DAYS FROM (NOW() - MAX(${transactions.datetime}))) > 7 OR MAX(${transactions.datetime}) IS NULL`);

      console.log(`📊 Found ${machinesWithoutAlcoholSales.length} machines with alcohol sales issues`);

      for (const machine of machinesWithoutAlcoholSales) {
        const daysSinceLastAlcohol = machine.daysSinceLastAlcohol || 999;
        
        let severity: 'info' | 'warning' | 'critical';
        let alertType: string;
        let message: string;
        let recommendedAction: string;

        if (daysSinceLastAlcohol >= 30) {
          severity = 'critical';
          alertType = 'alcohol_sales_compliance_check';
          message = `🚨 COMPLIANCE-PRÜFUNG: ${machine.machineName} - Seit ${Math.floor(daysSinceLastAlcohol)} Tagen kein Alkoholverkauf`;
          recommendedAction = 'Compliance-Überprüfung und Produktsortiment-Analyse erforderlich';
        } else if (daysSinceLastAlcohol >= 14) {
          severity = 'warning';
          alertType = 'alcohol_sales_anomaly';
          message = `🔴 AUFFÄLLIG: ${machine.machineName} - Seit ${Math.floor(daysSinceLastAlcohol)} Tagen kein Alkoholverkauf`;
          recommendedAction = 'Produktsortiment und Nachfrage analysieren';
        } else {
          severity = 'info';
          alertType = 'alcohol_sales_notice';
          message = `🟡 HINWEIS: ${machine.machineName} - Seit ${Math.floor(daysSinceLastAlcohol)} Tagen kein Alkoholverkauf`;
          recommendedAction = 'Überwachung fortsetzen, normale Schwankung möglich';
        }

        const payload = {
          machineId: machine.machineId,
          machineName: machine.machineName,
          vendonId: machine.vendonId,
          locationName: machine.locationName,
          locationId: machine.locationId,
          lastAlcoholSale: machine.lastAlcoholSale?.toISOString() || null,
          daysSinceLastAlcohol: Math.floor(daysSinceLastAlcohol),
          severity,
          alertType,
          timestamp: new Date().toISOString(),
          message,
          recommendedAction,
          category: 'compliance',
          complianceType: 'alcohol_sales'
        };

        // Record the event with appropriate deduplication window
        const dedupeWindow = severity === 'critical' ? 86400 : severity === 'warning' ? 172800 : 345600; // 1d, 2d, 4d
        await notificationService.recordEvent('alcohol_sales_inactive', payload, dedupeWindow);
      }

    } catch (error) {
      console.error('❌ Error checking alcohol sales activity:', error);
      throw error;
    }
  }

  /**
   * Check alcohol sales activity for a specific machine
   */
  async checkMachineAlcoholSalesActivity(machineId: number): Promise<void> {
    try {
      const machine = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          lastAlcoholSale: max(transactions.datetime).as('lastAlcoholSale'),
          daysSinceLastAlcohol: sql<number>`EXTRACT(DAYS FROM (NOW() - MAX(${transactions.datetime})))`.as('daysSinceLastAlcohol')
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(transactions, eq(transactions.machineId, machines.id))
        .leftJoin(products, eq(transactions.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(machines.id, machineId),
            eq(machines.isActive, true),
            // Alcohol detection criteria
            or(
              ilike(categories.name, '%alkohol%'),
              ilike(products.productName, '%bier%'),
              ilike(products.productName, '%wein%'),
              ilike(products.productName, '%sekt%'),
              ilike(products.productName, '%prosecco%'),
              ilike(products.productName, '%radler%'),
              ilike(products.productName, '%weizen%'),
              ilike(products.productName, '%pils%'),
              eq(products.isAlcoholic, true)
            )
          )
        )
        .groupBy(machines.id, machines.name, machines.vendonId, locations.name, locations.id)
        .limit(1);

      if (machine.length === 0) {
        console.log(`Machine ${machineId} not found, inactive, or has no alcohol products`);
        return;
      }

      const machineData = machine[0];
      const daysSinceLastAlcohol = machineData.daysSinceLastAlcohol || 999;

      if (daysSinceLastAlcohol > 7) {
        let severity: 'info' | 'warning' | 'critical';
        let alertType: string;
        let message: string;

        if (daysSinceLastAlcohol >= 30) {
          severity = 'critical';
          alertType = 'alcohol_sales_compliance_check';
          message = `🚨 COMPLIANCE-PRÜFUNG für ${machineData.machineName}`;
        } else if (daysSinceLastAlcohol >= 14) {
          severity = 'warning';
          alertType = 'alcohol_sales_anomaly';
          message = `🔴 AUFFÄLLIG: Alkoholverkauf in ${machineData.machineName}`;
        } else {
          severity = 'info';
          alertType = 'alcohol_sales_notice';
          message = `🟡 HINWEIS: Alkoholverkauf in ${machineData.machineName}`;
        }

        const payload = {
          machineId: machineData.machineId,
          machineName: machineData.machineName,
          vendonId: machineData.vendonId,
          locationName: machineData.locationName,
          locationId: machineData.locationId,
          lastAlcoholSale: machineData.lastAlcoholSale?.toISOString() || null,
          daysSinceLastAlcohol: Math.floor(daysSinceLastAlcohol),
          severity,
          alertType,
          timestamp: new Date().toISOString(),
          message,
          recommendedAction: severity === 'critical' ? 'Compliance-Analyse' : 'Sortiment überprüfen',
          category: 'compliance',
          complianceType: 'alcohol_sales'
        };

        await notificationService.recordEvent('alcohol_sales_inactive', payload, 3600); // 1h dedupe for specific machine
      }

    } catch (error) {
      console.error(`❌ Error checking alcohol sales activity for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Get alcohol sales compliance overview
   */
  async getAlcoholSalesComplianceReport(): Promise<Array<{
    machineId: number;
    machineName: string;
    locationName: string;
    lastAlcoholSale: Date | null;
    daysSinceLastAlcohol: number;
    complianceStatus: 'compliant' | 'notice' | 'anomaly' | 'requires_review';
    priority: number;
    alcoholProductsAvailable: boolean;
  }>> {
    try {
      // First, get machines that have alcohol products
      const machinesWithAlcoholProducts = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          hasAlcoholProducts: sql<boolean>`COUNT(DISTINCT ${products.id}) > 0`.as('hasAlcoholProducts')
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(transactions, eq(transactions.machineId, machines.id))
        .leftJoin(products, eq(transactions.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(machines.isActive, true),
            or(
              ilike(categories.name, '%alkohol%'),
              ilike(products.productName, '%bier%'),
              ilike(products.productName, '%wein%'),
              eq(products.isAlcoholic, true)
            )
          )
        )
        .groupBy(machines.id, machines.name, locations.name);

      // Then get alcohol sales data for these machines
      const alcoholSalesData = await db
        .select({
          machineId: machines.id,
          lastAlcoholSale: max(transactions.datetime).as('lastAlcoholSale'),
          daysSinceLastAlcohol: sql<number>`EXTRACT(DAYS FROM (NOW() - MAX(${transactions.datetime})))`.as('daysSinceLastAlcohol')
        })
        .from(machines)
        .leftJoin(transactions, eq(transactions.machineId, machines.id))
        .leftJoin(products, eq(transactions.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(machines.isActive, true),
            or(
              ilike(categories.name, '%alkohol%'),
              ilike(products.productName, '%bier%'),
              ilike(products.productName, '%wein%'),
              eq(products.isAlcoholic, true)
            )
          )
        )
        .groupBy(machines.id);

      // Combine data and create compliance report
      const complianceReport = machinesWithAlcoholProducts.map(machine => {
        const salesData = alcoholSalesData.find(data => data.machineId === machine.machineId);
        const daysSinceLastAlcohol = salesData?.daysSinceLastAlcohol || 999;
        
        let complianceStatus: 'compliant' | 'notice' | 'anomaly' | 'requires_review';
        let priority: number;

        if (daysSinceLastAlcohol >= 30) {
          complianceStatus = 'requires_review';
          priority = 4;
        } else if (daysSinceLastAlcohol >= 14) {
          complianceStatus = 'anomaly';
          priority = 3;
        } else if (daysSinceLastAlcohol >= 7) {
          complianceStatus = 'notice';
          priority = 2;
        } else {
          complianceStatus = 'compliant';
          priority = 1;
        }

        return {
          machineId: machine.machineId,
          machineName: machine.machineName,
          locationName: machine.locationName,
          lastAlcoholSale: salesData?.lastAlcoholSale || null,
          daysSinceLastAlcohol: Math.floor(daysSinceLastAlcohol),
          complianceStatus,
          priority,
          alcoholProductsAvailable: machine.hasAlcoholProducts
        };
      });

      // Sort by priority (requires review first) and then by days since last sale
      return complianceReport.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return b.daysSinceLastAlcohol - a.daysSinceLastAlcohol;
      });

    } catch (error) {
      console.error('❌ Error getting alcohol sales compliance report:', error);
      throw error;
    }
  }

  /**
   * Get detailed alcohol product analysis for a machine
   */
  async getAlcoholProductAnalysis(machineId: number): Promise<{
    machineInfo: any;
    alcoholProducts: Array<{ productName: string; lastSale: Date | null; daysSinceLastSale: number }>;
    totalAlcoholProducts: number;
    activeAlcoholProducts: number;
  }> {
    try {
      const machineInfo = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .where(eq(machines.id, machineId))
        .limit(1);

      if (machineInfo.length === 0) {
        throw new Error(`Machine ${machineId} not found`);
      }

      // Get alcohol products and their last sales
      const alcoholProducts = await db
        .select({
          productName: products.productName,
          productId: products.id,
          lastSale: max(transactions.datetime).as('lastSale'),
          daysSinceLastSale: sql<number>`EXTRACT(DAYS FROM (NOW() - MAX(${transactions.datetime})))`.as('daysSinceLastSale')
        })
        .from(products)
        .leftJoin(transactions, and(
          eq(transactions.productId, products.id),
          eq(transactions.machineId, machineId)
        ))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          or(
            ilike(categories.name, '%alkohol%'),
            ilike(products.productName, '%bier%'),
            ilike(products.productName, '%wein%'),
            eq(products.isAlcoholic, true)
          )
        )
        .groupBy(products.id, products.productName);

      const productAnalysis = alcoholProducts.map(product => ({
        productName: product.productName,
        lastSale: product.lastSale,
        daysSinceLastSale: Math.floor(product.daysSinceLastSale || 999)
      }));

      return {
        machineInfo: machineInfo[0],
        alcoholProducts: productAnalysis,
        totalAlcoholProducts: productAnalysis.length,
        activeAlcoholProducts: productAnalysis.filter(p => p.daysSinceLastSale <= 7).length
      };

    } catch (error) {
      console.error(`❌ Error getting alcohol product analysis for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Manual trigger for testing or immediate check
   */
  async triggerManualCheck(): Promise<{ machinesChecked: number; alertsTriggered: number }> {
    const startTime = Date.now();
    let alertsTriggered = 0;

    try {
      // Only check machines that have alcohol products
      const machinesWithAlcohol = await db
        .select({ id: machines.id })
        .from(machines)
        .leftJoin(transactions, eq(transactions.machineId, machines.id))
        .leftJoin(products, eq(transactions.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(machines.isActive, true),
            or(
              ilike(categories.name, '%alkohol%'),
              ilike(products.productName, '%bier%'),
              ilike(products.productName, '%wein%'),
              eq(products.isAlcoholic, true)
            )
          )
        )
        .groupBy(machines.id);

      for (const machine of machinesWithAlcohol) {
        const eventsBefore = await notificationService.getEvents({
          eventType: 'alcohol_sales_inactive',
          processed: false
        });

        await this.checkMachineAlcoholSalesActivity(machine.id);

        const eventsAfter = await notificationService.getEvents({
          eventType: 'alcohol_sales_inactive',
          processed: false
        });

        if (eventsAfter.length > eventsBefore.length) {
          alertsTriggered++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`🍺 Manual alcohol sales check completed in ${duration}ms: ${machinesWithAlcohol.length} machines checked, ${alertsTriggered} alerts triggered`);

      return {
        machinesChecked: machinesWithAlcohol.length,
        alertsTriggered
      };

    } catch (error) {
      console.error('❌ Error in manual alcohol sales check:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const alcoholSalesInactiveTrigger = new AlcoholSalesInactiveTrigger();