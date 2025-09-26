import { notificationService } from '../notificationService';
import { db } from '../../db';
import { transactions, machines, locations } from '@shared/schema';
import { eq, sql, and, max } from 'drizzle-orm';

/**
 * Card Payment Inactive Trigger - Überwachung der Kartenzahlungs-Funktionalität
 * Monitors card payment activity and triggers notifications when machines haven't processed card payments
 */
export class CardPaymentInactiveTrigger {
  /**
   * Check all machines for inactive card payment systems
   */
  async checkCardPaymentActivity(): Promise<void> {
    try {
      console.log('🔍 Checking card payment activity across all machines...');

      // SQL Query wie im Prompt spezifiziert
      const machinesWithoutCardPayments = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          lastCardPayment: max(transactions.datetime).as('lastCardPayment'),
          hoursSinceLastCard: sql<number>`EXTRACT(HOURS FROM (NOW() - MAX(${transactions.datetime})))`.as('hoursSinceLastCard')
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(transactions, and(
          eq(transactions.machineId, machines.id),
          eq(transactions.paymentMethod, 'CASHLESS')
        ))
        .where(eq(machines.isActive, true))
        .groupBy(machines.id, machines.name, machines.vendonId, locations.name, locations.id)
        .having(sql`EXTRACT(HOURS FROM (NOW() - MAX(${transactions.datetime}))) > 24 OR MAX(${transactions.datetime}) IS NULL`);

      console.log(`📊 Found ${machinesWithoutCardPayments.length} machines with card payment issues`);

      for (const machine of machinesWithoutCardPayments) {
        const hoursSinceLastCard = machine.hoursSinceLastCard || 999;
        
        let severity: 'warning' | 'critical' | 'urgent';
        let alertType: string;
        let message: string;
        let recommendedAction: string;

        if (hoursSinceLastCard >= 72) {
          severity = 'urgent';
          alertType = 'card_payment_failure';
          message = `🚨 KARTENZAHLUNGS-AUSFALL in ${machine.machineName}: Seit ${Math.floor(hoursSinceLastCard)}h keine Kartenzahlung`;
          recommendedAction = 'Sofortige Überprüfung des Kartenterminals erforderlich';
        } else if (hoursSinceLastCard >= 48) {
          severity = 'critical';
          alertType = 'card_payment_critical';
          message = `🔴 KRITISCH: ${machine.machineName} - Seit ${Math.floor(hoursSinceLastCard)}h keine Kartenzahlung`;
          recommendedAction = 'Kartenterminal-Diagnose innerhalb 4h durchführen';
        } else {
          severity = 'warning';
          alertType = 'card_payment_warning';
          message = `🟡 WARNUNG: ${machine.machineName} - Seit ${Math.floor(hoursSinceLastCard)}h keine Kartenzahlung`;
          recommendedAction = 'Kartenterminal-Status überprüfen';
        }

        const payload = {
          machineId: machine.machineId,
          machineName: machine.machineName,
          vendonId: machine.vendonId,
          locationName: machine.locationName,
          locationId: machine.locationId,
          lastCardPayment: machine.lastCardPayment?.toISOString() || null,
          hoursSinceLastCard: Math.floor(hoursSinceLastCard),
          severity,
          alertType,
          timestamp: new Date().toISOString(),
          message,
          recommendedAction,
          category: 'payment_system'
        };

        // Record the event with appropriate deduplication window
        const dedupeWindow = severity === 'urgent' ? 3600 : severity === 'critical' ? 7200 : 14400; // 1h, 2h, 4h
        await notificationService.recordEvent('card_payment_inactive', payload, dedupeWindow);
      }

    } catch (error) {
      console.error('❌ Error checking card payment activity:', error);
      throw error;
    }
  }

  /**
   * Check card payment activity for a specific machine
   */
  async checkMachineCardPaymentActivity(machineId: number): Promise<void> {
    try {
      const machine = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          vendonId: machines.vendonId,
          locationName: locations.name,
          locationId: locations.id,
          lastCardPayment: max(transactions.datetime).as('lastCardPayment'),
          hoursSinceLastCard: sql<number>`EXTRACT(HOURS FROM (NOW() - MAX(${transactions.datetime})))`.as('hoursSinceLastCard')
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(transactions, and(
          eq(transactions.machineId, machines.id),
          eq(transactions.paymentMethod, 'CASHLESS')
        ))
        .where(and(
          eq(machines.id, machineId),
          eq(machines.isActive, true)
        ))
        .groupBy(machines.id, machines.name, machines.vendonId, locations.name, locations.id)
        .limit(1);

      if (machine.length === 0) {
        console.log(`Machine ${machineId} not found or inactive`);
        return;
      }

      const machineData = machine[0];
      const hoursSinceLastCard = machineData.hoursSinceLastCard || 999;

      if (hoursSinceLastCard > 24) {
        let severity: 'warning' | 'critical' | 'urgent';
        let alertType: string;
        let message: string;

        if (hoursSinceLastCard >= 72) {
          severity = 'urgent';
          alertType = 'card_payment_failure';
          message = `🚨 KARTENZAHLUNGS-AUSFALL in ${machineData.machineName}`;
        } else if (hoursSinceLastCard >= 48) {
          severity = 'critical';
          alertType = 'card_payment_critical';
          message = `🔴 KRITISCH: Kartenzahlung ausgefallen in ${machineData.machineName}`;
        } else {
          severity = 'warning';
          alertType = 'card_payment_warning';
          message = `🟡 WARNUNG: Lange keine Kartenzahlung in ${machineData.machineName}`;
        }

        const payload = {
          machineId: machineData.machineId,
          machineName: machineData.machineName,
          vendonId: machineData.vendonId,
          locationName: machineData.locationName,
          locationId: machineData.locationId,
          lastCardPayment: machineData.lastCardPayment?.toISOString() || null,
          hoursSinceLastCard: Math.floor(hoursSinceLastCard),
          severity,
          alertType,
          timestamp: new Date().toISOString(),
          message,
          recommendedAction: severity === 'urgent' ? 'Sofortige Reparatur' : 'Diagnose erforderlich',
          category: 'payment_system'
        };

        await notificationService.recordEvent('card_payment_inactive', payload, 1800); // 30 min dedupe for specific machine
      }

    } catch (error) {
      console.error(`❌ Error checking card payment activity for machine ${machineId}:`, error);
      throw error;
    }
  }

  /**
   * Get card payment system health overview
   */
  async getCardPaymentHealthReport(): Promise<Array<{
    machineId: number;
    machineName: string;
    locationName: string;
    lastCardPayment: Date | null;
    hoursSinceLastCard: number;
    status: 'healthy' | 'warning' | 'critical' | 'failure';
    priority: number;
  }>> {
    try {
      const allMachines = await db
        .select({
          machineId: machines.id,
          machineName: machines.name,
          locationName: locations.name,
          lastCardPayment: max(transactions.datetime).as('lastCardPayment'),
          hoursSinceLastCard: sql<number>`EXTRACT(HOURS FROM (NOW() - MAX(${transactions.datetime})))`.as('hoursSinceLastCard')
        })
        .from(machines)
        .leftJoin(locations, eq(machines.locationId, locations.id))
        .leftJoin(transactions, and(
          eq(transactions.machineId, machines.id),
          eq(transactions.paymentMethod, 'CASHLESS')
        ))
        .where(eq(machines.isActive, true))
        .groupBy(machines.id, machines.name, locations.name);

      const healthReport = allMachines.map(machine => {
        const hoursSinceLastCard = machine.hoursSinceLastCard || 999;
        let status: 'healthy' | 'warning' | 'critical' | 'failure';
        let priority: number;

        if (hoursSinceLastCard >= 72) {
          status = 'failure';
          priority = 4;
        } else if (hoursSinceLastCard >= 48) {
          status = 'critical';
          priority = 3;
        } else if (hoursSinceLastCard >= 24) {
          status = 'warning';
          priority = 2;
        } else {
          status = 'healthy';
          priority = 1;
        }

        return {
          machineId: machine.machineId,
          machineName: machine.machineName,
          locationName: machine.locationName,
          lastCardPayment: machine.lastCardPayment,
          hoursSinceLastCard: Math.floor(hoursSinceLastCard),
          status,
          priority
        };
      });

      // Sort by priority (failures first) and then by hours since last payment
      return healthReport.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return b.hoursSinceLastCard - a.hoursSinceLastCard;
      });

    } catch (error) {
      console.error('❌ Error getting card payment health report:', error);
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
      const allMachines = await db
        .select({ id: machines.id })
        .from(machines)
        .where(eq(machines.isActive, true));

      for (const machine of allMachines) {
        const eventsBefore = await notificationService.getEvents({
          eventType: 'card_payment_inactive',
          processed: false
        });

        await this.checkMachineCardPaymentActivity(machine.id);

        const eventsAfter = await notificationService.getEvents({
          eventType: 'card_payment_inactive',
          processed: false
        });

        if (eventsAfter.length > eventsBefore.length) {
          alertsTriggered++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`💳 Manual card payment check completed in ${duration}ms: ${allMachines.length} machines checked, ${alertsTriggered} alerts triggered`);

      return {
        machinesChecked: allMachines.length,
        alertsTriggered
      };

    } catch (error) {
      console.error('❌ Error in manual card payment check:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const cardPaymentInactiveTrigger = new CardPaymentInactiveTrigger();