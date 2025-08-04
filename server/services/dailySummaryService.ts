/**
 * DAILY SUMMARY EMAIL SERVICE
 * 
 * Sendet täglich um 06:00 Uhr eine Zusammenfassung an einkauf@proviantomat.de mit:
 * - Heutigen Bestellungen (alle neuen Orders)
 * - Offenen Wareneingängen (Goods Receipts)
 * - Wiederkehrenden Bestellungen die heute ausgeführt wurden
 */

import cron from 'node-cron';
import { db } from '../db';
import { 
  orders, 
  orderItems, 
  recurringOrders, 
  recurringOrderExecutions,
  products,
  suppliers,
  warehouses
} from '../../shared/schema';
import { eq, and, gte, lte, desc, isNull, or } from 'drizzle-orm';
import { sendEmail } from './emailService';

interface DailySummaryData {
  todaysOrders: any[];
  openGoodsReceipts: any[];
  recurringOrderExecutions: any[];
  summaryStats: {
    totalOrders: number;
    totalValue: number;
    openGoodsReceiptsCount: number;
    recurringExecutions: number;
  };
}

class DailySummaryService {
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Startet den täglichen Summary-Cron um 06:00
   */
  start(): void {
    if (this.cronJob) {
      console.log('Daily Summary Service läuft bereits');
      return;
    }

    // Täglich um 06:00 Uhr ausführen
    this.cronJob = cron.schedule('0 6 * * *', async () => {
      if (this.isRunning) {
        console.log('Daily Summary läuft bereits, überspringe diese Ausführung');
        return;
      }

      this.isRunning = true;
      console.log('📧 Starte tägliche E-Mail-Zusammenfassung...');
      
      try {
        await this.sendDailySummary();
      } catch (error) {
        console.error('Fehler beim Senden der täglichen Zusammenfassung:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      timezone: 'Europe/Berlin'
    });

    console.log('✅ Daily Summary Service gestartet (täglich 06:00 Uhr)');
  }

  /**
   * Stoppt den Cron-Job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('Daily Summary Service gestoppt');
    }
  }

  /**
   * Manuelle Ausführung der täglichen Zusammenfassung
   */
  async sendDailySummary(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const summaryData = await this.collectDailySummaryData(today);
    
    const emailContent = this.generateSummaryEmail(summaryData, today);
    
    const success = await sendEmail({
      to: 'einkauf@proviantomat.de',
      subject: `📊 Tägliche Zusammenfassung ${new Date().toLocaleDateString('de-DE')} - Bestellungen & Wareneingänge`,
      html: emailContent
    });

    if (success) {
      console.log('✅ Tägliche Zusammenfassung erfolgreich an einkauf@proviantomat.de gesendet');
    } else {
      console.error('❌ Fehler beim Senden der täglichen Zusammenfassung');
    }
  }

  /**
   * Sammelt alle relevanten Daten für die tägliche Zusammenfassung
   */
  private async collectDailySummaryData(date: string): Promise<DailySummaryData> {
    // Heutige Bestellungen (alle Orders vom heutigen Tag)
    const todaysOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        supplierName: orders.supplierName,
        totalAmount: orders.totalAmount,
        status: orders.status,
        createdAt: orders.createdAt
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, new Date(date + 'T00:00:00Z')),
          lte(orders.createdAt, new Date(date + 'T23:59:59Z'))
        )
      )
      .orderBy(desc(orders.createdAt));

    // Offene Wareneingänge (status = 'pending', 'partial' oder ähnlich)
    const openGoodsReceipts = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        supplierName: orders.supplierName,
        totalAmount: orders.totalAmount,
        status: orders.status,
        createdAt: orders.createdAt,
        expectedDeliveryDate: orders.expectedDeliveryDate
      })
      .from(orders)
      .where(
        or(
          eq(orders.status, 'pending'),
          eq(orders.status, 'partial'),
          eq(orders.status, 'confirmed')
        )
      )
      .orderBy(desc(orders.createdAt));

    // Heutige wiederkehrende Bestellausführungen
    const recurringExecutions = await db
      .select({
        id: recurringOrderExecutions.id,
        recurringOrderName: recurringOrders.name,
        supplierName: recurringOrders.supplierName,
        warehouseName: recurringOrders.warehouseName,
        status: recurringOrderExecutions.status,
        executedAt: recurringOrderExecutions.executedAt,
        orderNumber: recurringOrderExecutions.orderNumber,
        totalAmount: recurringOrderExecutions.totalAmount,
        itemCount: recurringOrderExecutions.itemCount
      })
      .from(recurringOrderExecutions)
      .innerJoin(recurringOrders, eq(recurringOrderExecutions.recurringOrderId, recurringOrders.id))
      .where(
        and(
          gte(recurringOrderExecutions.createdAt, new Date(date + 'T00:00:00Z')),
          lte(recurringOrderExecutions.createdAt, new Date(date + 'T23:59:59Z'))
        )
      )
      .orderBy(desc(recurringOrderExecutions.executedAt));

    // Zusammenfassungsstatistiken
    const summaryStats = {
      totalOrders: todaysOrders.length,
      totalValue: todaysOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
      openGoodsReceiptsCount: openGoodsReceipts.length,
      recurringExecutions: recurringExecutions.length
    };

    return {
      todaysOrders,
      openGoodsReceipts,
      recurringOrderExecutions: recurringExecutions,
      summaryStats
    };
  }

  /**
   * Generiert den HTML-Inhalt für die Summary-E-Mail
   */
  private generateSummaryEmail(data: DailySummaryData, date: string): string {
    const { todaysOrders, openGoodsReceipts, recurringOrderExecutions, summaryStats } = data;
    const formattedDate = new Date(date).toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
    .stat-card { background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; text-align: center; }
    .stat-number { font-size: 24px; font-weight: bold; color: #2563eb; }
    .stat-label { color: #64748b; font-size: 14px; }
    .section { margin: 25px 0; }
    .section-title { color: #1e40af; font-size: 18px; font-weight: bold; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; }
    .order-list { background: white; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
    .order-item { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
    .order-item:last-child { border-bottom: none; }
    .order-info { flex: 1; }
    .order-title { font-weight: bold; color: #1e40af; }
    .order-details { color: #64748b; font-size: 14px; margin-top: 4px; }
    .order-amount { font-weight: bold; color: #059669; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-confirmed { background: #d1fae5; color: #065f46; }
    .status-partial { background: #fde68a; color: #92400e; }
    .footer { background: #f8fafc; padding: 15px; text-align: center; color: #64748b; font-size: 14px; }
    .no-items { text-align: center; color: #64748b; padding: 20px; font-style: italic; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Tägliche Bestellübersicht</h1>
    <p>${formattedDate}</p>
  </div>

  <div class="summary-box">
    <h2>📈 Tagesstatistik</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${summaryStats.totalOrders}</div>
        <div class="stat-label">Neue Bestellungen</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${summaryStats.totalValue.toFixed(2)}€</div>
        <div class="stat-label">Gesamtwert</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${summaryStats.openGoodsReceiptsCount}</div>
        <div class="stat-label">Offene Wareneingänge</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${summaryStats.recurringExecutions}</div>
        <div class="stat-label">Wiederkehrende Bestellungen</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">🛒 Heutige Bestellungen (${todaysOrders.length})</h3>
    <div class="order-list">
      ${todaysOrders.length > 0 ? todaysOrders.map(order => `
        <div class="order-item">
          <div class="order-info">
            <div class="order-title">${order.orderNumber || `#${order.id}`}</div>
            <div class="order-details">
              ${order.supplierName} → ${order.warehouseName} 
              | ${order.itemCount || 0} Artikel
              | ${new Date(order.createdAt).toLocaleTimeString('de-DE')}
            </div>
          </div>
          <div class="order-amount">${(order.totalAmount || 0).toFixed(2)}€</div>
          <span class="status status-${order.status}">${order.status}</span>
        </div>
      `).join('') : '<div class="no-items">Keine neuen Bestellungen heute</div>'}
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">📦 Offene Wareneingänge (${openGoodsReceipts.length})</h3>
    <div class="order-list">
      ${openGoodsReceipts.length > 0 ? openGoodsReceipts.map(receipt => `
        <div class="order-item">
          <div class="order-info">
            <div class="order-title">${receipt.orderNumber || `#${receipt.id}`}</div>
            <div class="order-details">
              ${receipt.supplierName} → ${receipt.warehouseName}
              | Erwartet: ${receipt.expectedDeliveryDate ? new Date(receipt.expectedDeliveryDate).toLocaleDateString('de-DE') : 'TBD'}
            </div>
          </div>
          <div class="order-amount">${(receipt.totalAmount || 0).toFixed(2)}€</div>
          <span class="status status-${receipt.status}">${receipt.status}</span>
        </div>
      `).join('') : '<div class="no-items">Keine offenen Wareneingänge</div>'}
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">🔄 Wiederkehrende Bestellungen (${recurringExecutions.length})</h3>
    <div class="order-list">
      ${recurringOrderExecutions.length > 0 ? recurringOrderExecutions.map(execution => `
        <div class="order-item">
          <div class="order-info">
            <div class="order-title">${execution.recurringOrderName}</div>
            <div class="order-details">
              ${execution.supplierName} → ${execution.warehouseName}
              | ${execution.itemCount || 0} Artikel
              | ${execution.executedAt ? new Date(execution.executedAt).toLocaleTimeString('de-DE') : 'Ausstehend'}
            </div>
          </div>
          <div class="order-amount">${(execution.totalAmount || 0).toFixed(2)}€</div>
          <span class="status status-${execution.status}">${execution.status}</span>
        </div>
      `).join('') : '<div class="no-items">Keine wiederkehrenden Bestellungen heute ausgeführt</div>'}
    </div>
  </div>

  <div class="footer">
    <p>Automatisch generiert um 06:00 Uhr | Proviantomat Bestellsystem</p>
    <p>Bei Fragen wenden Sie sich an das Einkaufsteam</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Status-Check des Services
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      cronActive: this.cronJob !== null,
      nextSummaryTime: '06:00 daily (Europe/Berlin)'
    };
  }

  /**
   * Test-Endpoint für manuelle Summary-E-Mail
   */
  async sendTestSummary(): Promise<boolean> {
    try {
      console.log('📧 Sende Test-Summary...');
      await this.sendDailySummary();
      return true;
    } catch (error) {
      console.error('Fehler beim Senden der Test-Summary:', error);
      return false;
    }
  }
}

export default DailySummaryService;