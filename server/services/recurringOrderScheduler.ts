/**
 * WIEDERKEHRENDE BESTELLUNGEN SCHEDULER SERVICE
 * 
 * Verwaltet die automatische Ausführung von wiederkehrenden Bestellungen
 * mit intelligenter Prognose-Integration und Bestelltyp-Unterscheidung
 */

import cron from 'node-cron';
import { DatabaseClient } from '../storage/database-storage';
import { recurringOrders, recurringOrderItems, orders, orderItems, recurringOrderExecutions } from '../../shared/schema';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { sendEmail } from './emailService';

interface ForecastResult {
  productId: number;
  predictedQuantity: number;
  confidence: number;
  baselineQuantity: number;
}

interface SchedulerConfig {
  enabledHours: number[]; // Stunden, in denen der Scheduler aktiv ist (z.B. [6, 7, 8])
  maxConcurrentExecutions: number;
  retryAttempts: number;
  retryDelay: number; // in Minuten
}

class RecurringOrderScheduler {
  private db: DatabaseClient;
  private isRunning: boolean = false;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private config: SchedulerConfig;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.config = {
      enabledHours: [6, 7, 8], // Ausführung nur zwischen 6-8 Uhr
      maxConcurrentExecutions: 5,
      retryAttempts: 3,
      retryDelay: 30
    };
  }

  /**
   * Startet den Scheduler mit täglicher Prüfung
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Recurring Order Scheduler ist bereits aktiv');
      return;
    }

    console.log('🔄 Starte Recurring Order Scheduler...');

    // Tägliche Prüfung um 6:00 Uhr
    const dailyTask = cron.schedule('0 6 * * *', async () => {
      await this.checkAndExecuteRecurringOrders();
    }, {
      scheduled: false,
      timezone: "Europe/Berlin"
    });

    // Stündliche Prüfung zwischen 6-8 Uhr für verpasste Ausführungen
    const hourlyTask = cron.schedule('0 6-8 * * *', async () => {
      await this.checkMissedExecutions();
    }, {
      scheduled: false,
      timezone: "Europe/Berlin"
    });

    dailyTask.start();
    hourlyTask.start();

    this.scheduledTasks.set('daily', dailyTask);
    this.scheduledTasks.set('hourly', hourlyTask);
    this.isRunning = true;

    console.log('✅ Recurring Order Scheduler erfolgreich gestartet');
  }

  /**
   * Stoppt den Scheduler
   */
  stop(): void {
    console.log('🛑 Stoppe Recurring Order Scheduler...');
    
    this.scheduledTasks.forEach((task) => {
      task.stop();
      task.destroy();
    });
    
    this.scheduledTasks.clear();
    this.isRunning = false;
    
    console.log('✅ Recurring Order Scheduler gestoppt');
  }

  /**
   * Status des Schedulers abrufen
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTasks: this.scheduledTasks.size,
      config: this.config,
      nextCheckTime: this.isRunning ? '06:00 daily' : 'Nicht aktiv'
    };
  }

  /**
   * Prüft und führt fällige wiederkehrende Bestellungen aus
   */
  private async checkAndExecuteRecurringOrders(): Promise<void> {
    try {
      console.log('🔍 Prüfe fällige wiederkehrende Bestellungen...');
      
      const today = new Date().toISOString().split('T')[0];
      
      // Finde alle aktiven wiederkehrenden Bestellungen, die heute fällig sind
      const dueOrders = await this.db.drizzle
        .select()
        .from(recurringOrders)
        .where(
          and(
            eq(recurringOrders.isActive, true),
            lte(recurringOrders.nextExecutionDate, today)
          )
        );

      console.log(`📋 ${dueOrders.length} fällige wiederkehrende Bestellungen gefunden`);

      for (const recurringOrder of dueOrders) {
        await this.executeRecurringOrder(recurringOrder);
      }

    } catch (error) {
      console.error('❌ Fehler bei der Scheduler-Ausführung:', error);
    }
  }

  /**
   * Prüft verpasste Ausführungen und versucht sie erneut
   */
  private async checkMissedExecutions(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Finde verpasste Ausführungen von gestern
      const missedExecutions = await this.db.drizzle
        .select()
        .from(recurringOrderExecutions)
        .innerJoin(recurringOrders, eq(recurringOrderExecutions.recurringOrderId, recurringOrders.id))
        .where(
          and(
            eq(recurringOrderExecutions.scheduledDate, yesterdayStr),
            eq(recurringOrderExecutions.status, 'pending'),
            eq(recurringOrders.isActive, true)
          )
        );

      for (const missed of missedExecutions) {
        console.log(`🔄 Versuche verpasste Ausführung: ${missed.recurring_orders.name}`);
        await this.executeRecurringOrder(missed.recurring_orders, 'retry');
      }

    } catch (error) {
      console.error('❌ Fehler bei der Prüfung verpasster Ausführungen:', error);
    }
  }

  /**
   * Führt eine wiederkehrende Bestellung aus
   */
  private async executeRecurringOrder(
    recurringOrder: any, 
    executionType: 'automatic' | 'manual' | 'retry' = 'automatic'
  ): Promise<void> {
    console.log(`🚀 Führe wiederkehrende Bestellung aus: ${recurringOrder.name}`);
    
    const startTime = Date.now();
    let execution: any;

    try {
      // Erstelle Ausführungsprotokoll
      [execution] = await this.db.drizzle
        .insert(recurringOrderExecutions)
        .values({
          recurringOrderId: recurringOrder.id,
          scheduledDate: new Date().toISOString().split('T')[0],
          executedAt: new Date(),
          status: 'pending',
          executionType,
          retryCount: executionType === 'retry' ? 1 : 0
        })
        .returning();

      // Hole Bestellpositionen
      const items = await this.db.drizzle
        .select()
        .from(recurringOrderItems)
        .where(
          and(
            eq(recurringOrderItems.recurringOrderId, recurringOrder.id),
            eq(recurringOrderItems.isActive, true)
          )
        );

      if (items.length === 0) {
        throw new Error('Keine aktiven Bestellpositionen gefunden');
      }

      // Prognose-basierte Mengenanpassung
      let adjustedItems = items;
      if (recurringOrder.forecastEnabled) {
        adjustedItems = await this.applyForecastToItems(items, recurringOrder);
      }

      // Erstelle Bestellung basierend auf Bestelltyp
      const order = await this.createOrderFromRecurring(recurringOrder, adjustedItems);

      // Update Ausführungsprotokoll
      const processingDuration = Date.now() - startTime;
      await this.db.drizzle
        .update(recurringOrderExecutions)
        .set({
          orderId: order.id,
          status: 'success',
          success: true,
          orderNumber: order.orderNumber,
          itemCount: adjustedItems.length,
          totalAmount: order.totalAmount,
          processingDurationMs: processingDuration
        })
        .where(eq(recurringOrderExecutions.id, execution.id));

      // Nächster Ausführungstermin berechnen
      await this.updateNextExecutionDate(recurringOrder);

      // E-Mail-Benachrichtigung senden
      await this.sendNotificationEmail(recurringOrder, order, adjustedItems);

      console.log(`✅ Wiederkehrende Bestellung erfolgreich ausgeführt: ${order.orderNumber}`);

    } catch (error) {
      console.error(`❌ Fehler bei der Ausführung der wiederkehrenden Bestellung:`, error);
      
      if (execution) {
        await this.db.drizzle
          .update(recurringOrderExecutions)
          .set({
            status: 'failed',
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unbekannter Fehler',
            processingDurationMs: Date.now() - startTime
          })
          .where(eq(recurringOrderExecutions.id, execution.id));
      }
    }
  }

  /**
   * Wendet Prognose auf Bestellpositionen an
   * ERWEITERT: Prognose wird nur auf ausgewählte Produkte angewendet
   */
  private async applyForecastToItems(items: any[], recurringOrder: any): Promise<any[]> {
    console.log(`🔮 Wende Prognose an für ${items.length} Positionen`);
    
    // NEUE LOGIK: Unterscheidung zwischen ausgewählten Produkten und ALL-Modus
    if (items.length > 0) {
      // SHOPPING CART MODUS: Prognose nur für ausgewählte Produkte
      console.log(`📦 Shopping Cart Modus: Prognose für ${items.length} ausgewählte Produkte`);
      
      const productIds = items.map(item => item.productId);
      const forecastResults = await this.getForecastForProducts(productIds, recurringOrder.forecastPeriodDays || 14);
      
      return items.map(item => {
        const forecast = forecastResults.find(f => f.productId === item.productId);
        
        if (forecast && forecast.confidence > 0.6) {
          // Verwende Prognose wenn Konfidenz > 60%
          return {
            ...item,
            quantity: Math.max(1, Math.round(forecast.predictedQuantity)),
            notes: `${item.notes || ''} [Prognose: ${forecast.predictedQuantity}, Konfidenz: ${Math.round(forecast.confidence * 100)}%]`
          };
        }
        
        // Fallback auf Standardmenge (aus Shopping Cart)
        return item;
      });
      
    } else {
      // ALL-PRODUKTE MODUS: Prognose für alle Lieferanten-Produkte (Legacy-Verhalten)
      console.log(`🏪 All-Produkte Modus: Prognose für alle Lieferanten-Produkte`);
      
      // Hole alle verfügbaren Produkte des Lieferanten
      const supplierProducts = await this.db.drizzle.execute(sql`
        SELECT DISTINCT 
          p.id as product_id,
          p.name as product_name,
          p.sku,
          COALESCE(pc.packageSize, 1) as default_quantity,
          COALESCE(pc.unit, 'stk') as unit,
          COALESCE(pc.price, 0) as unit_price
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.productId
        WHERE pc.supplierId = ${recurringOrder.supplierId}
          AND p.isActive = true
        LIMIT 50
      `);
      
      if (supplierProducts.rows.length === 0) {
        console.log('⚠️ Keine Produkte für Lieferanten-Prognose gefunden');
        return [];
      }
      
      const productIds = supplierProducts.rows.map((row: any) => row.product_id);
      const forecastResults = await this.getForecastForProducts(productIds, recurringOrder.forecastPeriodDays || 14);
      
      // Erstelle Bestellpositionen basierend auf Prognose
      return supplierProducts.rows
        .map((row: any) => {
          const forecast = forecastResults.find(f => f.productId === row.product_id);
          
          if (forecast && forecast.confidence > 0.6 && forecast.predictedQuantity > 0) {
            return {
              productId: row.product_id,
              productName: row.product_name,
              sku: row.sku || '',
              quantity: Math.max(1, Math.round(forecast.predictedQuantity)),
              unit: row.unit || 'stk',
              unitPrice: row.unit_price || 0,
              notes: `[Automatisch per Prognose: ${forecast.predictedQuantity}, Konfidenz: ${Math.round(forecast.confidence * 100)}%]`,
              positionNumber: 0 // Wird später gesetzt
            };
          }
          
          return null;
        })
        .filter(item => item !== null); // Entferne null-Werte
    }
  }

  /**
   * Holt Prognose für Produkte (vereinfachte Integration)
   */
  private async getForecastForProducts(productIds: number[], periodDays: number): Promise<ForecastResult[]> {
    // Hier würde normalerweise das Prophet-System aufgerufen
    // Für jetzt eine vereinfachte Simulation basierend auf historischen Daten
    
    const results: ForecastResult[] = [];
    
    for (const productId of productIds) {
      try {
        // Hole historische Verkaufsdaten der letzten 30 Tage
        const historicalData = await this.db.drizzle.execute(sql`
          SELECT 
            DATE(datetime) as sale_date,
            SUM(quantity) as daily_quantity
          FROM transactions 
          WHERE product_id = ${productId}
            AND datetime >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(datetime)
          ORDER BY sale_date
        `);

        if (historicalData.rows.length > 0) {
          const totalQuantity = historicalData.rows.reduce((sum: number, row: any) => 
            sum + (row.daily_quantity || 0), 0
          );
          const avgDaily = totalQuantity / historicalData.rows.length;
          const predictedQuantity = avgDaily * periodDays;

          results.push({
            productId,
            predictedQuantity: Math.max(1, Math.round(predictedQuantity)),
            confidence: historicalData.rows.length >= 7 ? 0.8 : 0.5,
            baselineQuantity: Math.round(avgDaily)
          });
        } else {
          // Keine historischen Daten - verwende Standardmenge
          results.push({
            productId,
            predictedQuantity: 10, // Standard-Fallback
            confidence: 0.3,
            baselineQuantity: 10
          });
        }
      } catch (error) {
        console.error(`Prognose-Fehler für Produkt ${productId}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Erstellt Bestellung aus wiederkehrender Bestellung
   */
  private async createOrderFromRecurring(recurringOrder: any, items: any[]): Promise<any> {
    const orderNumber = `REC-${new Date().toISOString().split('T')[0]}-${recurringOrder.id}`;
    
    // Erstelle Bestellung mit entsprechendem Status je nach Bestelltyp
    const orderStatus = recurringOrder.orderType === 'goods_receipt' ? 'goods_receipt' : 'draft';
    
    const [order] = await this.db.drizzle
      .insert(orders)
      .values({
        orderNumber,
        supplierId: recurringOrder.supplierId,
        supplierName: recurringOrder.supplierName,
        warehouseId: recurringOrder.warehouseId,
        warehouseName: recurringOrder.warehouseName,
        status: orderStatus,
        orderDate: new Date(),
        deliveryLocation: recurringOrder.deliveryLocation,
        totalAmount: 0, // wird berechnet
        orderType: 'recurring',
        priority: recurringOrder.priority,
        notes: `Automatisch generiert aus wiederkehrender Bestellung: ${recurringOrder.name}`
      })
      .returning();

    // Erstelle Bestellpositionen
    let totalAmount = 0;
    const orderItemsData = items.map((item, index) => {
      const itemTotal = (item.unitPrice || 0) * item.quantity;
      totalAmount += itemTotal;
      
      return {
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        supplierSku: item.supplierSku,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice || 0,
        totalPrice: itemTotal,
        positionNumber: index + 1,
        notes: item.notes,
        itemComment: item.itemComment
      };
    });

    await this.db.drizzle.insert(orderItems).values(orderItemsData);

    // Update Gesamtbetrag
    await this.db.drizzle
      .update(orders)
      .set({ totalAmount })
      .where(eq(orders.id, order.id));

    return { ...order, totalAmount };
  }

  /**
   * Berechnet nächsten Ausführungstermin
   */
  private async updateNextExecutionDate(recurringOrder: any): Promise<void> {
    const nextDate = this.calculateNextExecutionDate(recurringOrder);
    
    await this.db.drizzle
      .update(recurringOrders)
      .set({
        nextExecutionDate: nextDate,
        lastExecutionDate: new Date().toISOString().split('T')[0],
        totalExecutions: sql`${recurringOrders.totalExecutions} + 1`
      })
      .where(eq(recurringOrders.id, recurringOrder.id));
  }

  /**
   * Berechnet nächsten Ausführungstermin basierend auf Intervall
   */
  private calculateNextExecutionDate(recurringOrder: any): string {
    const currentDate = new Date(recurringOrder.nextExecutionDate);
    const { interval, intervalValue, weekday } = recurringOrder;

    switch (interval) {
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case 'biweekly':
        currentDate.setDate(currentDate.getDate() + 14);
        break;
      case 'triweekly':
        currentDate.setDate(currentDate.getDate() + 21);
        break;
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      default:
        currentDate.setDate(currentDate.getDate() + 7); // Fallback: wöchentlich
    }

    return currentDate.toISOString().split('T')[0];
  }

  /**
   * Sendet E-Mail-Benachrichtigung
   */
  private async sendNotificationEmail(recurringOrder: any, order: any, items: any[]): Promise<void> {
    if (!recurringOrder.emailNotifications) return;

    try {
      const recipients = JSON.parse(recurringOrder.emailNotifications);
      if (!Array.isArray(recipients) || recipients.length === 0) return;

      const subject = `${recurringOrder.orderType === 'goods_receipt' ? 'Wareneingang' : 'Bestellentwurf'} bereit: ${recurringOrder.name}`;
      
      const emailBody = this.generateNotificationEmail(recurringOrder, order, items);

      for (const email of recipients) {
        await sendEmail({
          to: email,
          subject,
          html: emailBody,
          text: emailBody.replace(/<[^>]*>/g, '') // HTML entfernen für Text-Version
        });
      }

      console.log(`📧 E-Mail-Benachrichtigungen gesendet an ${recipients.length} Empfänger`);

    } catch (error) {
      console.error('❌ Fehler beim Senden der E-Mail-Benachrichtigung:', error);
    }
  }

  /**
   * Generiert E-Mail-Inhalt für Benachrichtigung
   */
  private generateNotificationEmail(recurringOrder: any, order: any, items: any[]): string {
    const isGoodsReceipt = recurringOrder.orderType === 'goods_receipt';
    
    return `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            .header { background-color: #f4f4f4; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .order-details { background-color: #f9f9f9; padding: 15px; margin: 10px 0; }
            .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .items-table th { background-color: #f2f2f2; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${isGoodsReceipt ? '📦 Wareneingang bereit' : '📝 Bestellentwurf erstellt'}</h2>
          </div>
          
          <div class="content">
            <p>Ihre automatische wiederkehrende Bestellung wurde erfolgreich verarbeitet:</p>
            
            <div class="order-details">
              <h3>Bestelldetails</h3>
              <p><strong>Name:</strong> ${recurringOrder.name}</p>
              <p><strong>Bestellnummer:</strong> ${order.orderNumber}</p>
              <p><strong>Lieferant:</strong> ${recurringOrder.supplierName}</p>
              <p><strong>Lager:</strong> ${recurringOrder.warehouseName}</p>
              <p><strong>Typ:</strong> ${isGoodsReceipt ? 'Wareneingangsbestellung' : 'Versandbestellung'}</p>
              <p><strong>Erstellt:</strong> ${new Date().toLocaleDateString('de-DE')}</p>
            </div>

            <h3>Bestellpositionen (${items.length})</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Menge</th>
                  <th>Einheit</th>
                  ${recurringOrder.forecastEnabled ? '<th>Prognose</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td>${item.productName}</td>
                    <td>${item.quantity}</td>
                    <td>${item.unit}</td>
                    ${recurringOrder.forecastEnabled ? `<td>${item.notes?.includes('Prognose') ? '✓' : '-'}</td>` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <p>
              ${isGoodsReceipt 
                ? '➡️ <strong>Nächster Schritt:</strong> Bitte gehen Sie zum Wareneingang-Tab und buchen Sie die angelieferten Waren.'
                : '➡️ <strong>Nächster Schritt:</strong> Bitte prüfen Sie den Entwurf und senden Sie die Bestellung an den Lieferanten.'
              }
            </p>
          </div>

          <div class="footer">
            <p>Diese E-Mail wurde automatisch generiert vom Warenwirtschaftssystem.</p>
          </div>
        </body>
      </html>
    `;
  }
}

export default RecurringOrderScheduler;