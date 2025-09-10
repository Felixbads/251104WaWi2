import { Router } from 'express';
import { db } from '../db';
import { 
  emailSettings, 
  emailRecipients, 
  products, 
  productBatches,
  inventoryItems, 
  orders,
  machines,
  transactions
} from '@shared/schema';
import { eq, and, sql, gte, lte, desc, isNotNull, isNull, count } from 'drizzle-orm';
import { sendEmail } from '../services/emailService';

const router = Router();

// GET /api/email-notifications/settings - Aktuelle Einstellungen laden
router.get('/settings', async (req, res) => {
  try {
    const settings = await db
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.enabled, true))
      .limit(1);

    if (settings.length === 0) {
      return res.json({
        emailAddress: '',
        isActive: true,
        frequency: 'daily',
        sendOnWeekdays: ['1', '2', '3', '4', '5'],
        includeMhdAlerts: true,
        includeStockAlerts: true,
        includeOrderAlerts: true,
        includeDeliveryAlerts: true,
        includePerformanceAlerts: false,
        sendTime: '06:00'
      });
    }

    const setting = settings[0];
    const recipients = await db
      .select()
      .from(emailRecipients)
      .where(eq(emailRecipients.emailSettingsId, setting.id));

    res.json({
      id: setting.id,
      emailAddress: recipients[0]?.email || '',
      isActive: setting.enabled || false,
      frequency: 'daily', // Vereinfacht auf täglich
      sendOnWeekdays: ['1', '2', '3', '4', '5'],
      includeMhdAlerts: setting.includeMhdAlerts || true,
      includeStockAlerts: setting.includeLowStockAlerts || true,
      includeOrderAlerts: setting.includeOpenOrders || true,
      includeDeliveryAlerts: setting.includeInventoryAlerts || true,
      includePerformanceAlerts: setting.includeSalesAnalysis || false,
      sendTime: setting.sendTime || '06:00'
    });
  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Einstellungen:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Einstellungen' });
  }
});

// POST /api/email-notifications/settings - Einstellungen speichern
router.post('/settings', async (req, res) => {
  try {
    const {
      id,
      emailAddress,
      isActive,
      includeMhdAlerts,
      includeStockAlerts,
      includeOrderAlerts,
      includeDeliveryAlerts,
      includePerformanceAlerts,
      sendTime
    } = req.body;

    if (!emailAddress) {
      return res.status(400).json({ error: 'E-Mail-Adresse ist erforderlich' });
    }

    let settingsId = id;

    if (id) {
      // Bestehende Einstellungen aktualisieren
      await db
        .update(emailSettings)
        .set({
          enabled: isActive,
          sendTime: sendTime || '06:00',
          includeMhdAlerts: includeMhdAlerts,
          includeLowStockAlerts: includeStockAlerts,
          includeOpenOrders: includeOrderAlerts,
          includeInventoryAlerts: includeDeliveryAlerts,
          includeSalesAnalysis: includePerformanceAlerts
        })
        .where(eq(emailSettings.id, id));
    } else {
      // Neue Einstellungen erstellen
      const newSettings = await db
        .insert(emailSettings)
        .values({
          enabled: isActive,
          sendTime: sendTime || '06:00',
          includeMhdAlerts: includeMhdAlerts,
          includeLowStockAlerts: includeStockAlerts,
          includeOpenOrders: includeOrderAlerts,
          includeInventoryAlerts: includeDeliveryAlerts,
          includeSalesAnalysis: includePerformanceAlerts
        })
        .returning();
      
      settingsId = newSettings[0].id;
    }

    // E-Mail-Empfänger aktualisieren
    await db.delete(emailRecipients).where(eq(emailRecipients.emailSettingsId, settingsId));
    await db.insert(emailRecipients).values({
      emailSettingsId: settingsId,
      email: emailAddress,
      name: 'Standard-Empfänger'
    });

    res.json({ success: true, settingsId });
  } catch (error) {
    console.error('Fehler beim Speichern der E-Mail-Einstellungen:', error);
    res.status(500).json({ error: 'Fehler beim Speichern der Einstellungen' });
  }
});

// GET /api/email-notifications/preview - Live-Vorschau der Daten
router.get('/preview', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Echte MHD-Warnungen aus product_batches
    const mhdAlertsResult = await db
      .select({
        productName: products.productName,
        expiryDate: productBatches.expiryDate,
        quantity: productBatches.currentQuantity,
        location: sql<string>`'Lager ' || ${productBatches.warehouseId}`.as('location'),
        daysUntilExpiry: sql<number>`EXTRACT(DAY FROM (${productBatches.expiryDate}::date - CURRENT_DATE))`.as('daysUntilExpiry')
      })
      .from(productBatches)
      .innerJoin(products, eq(productBatches.productId, products.id))
      .where(and(
        gte(productBatches.expiryDate, sql`CURRENT_DATE`),
        lte(productBatches.expiryDate, sql`CURRENT_DATE + INTERVAL '30 days'`),
        sql`${productBatches.currentQuantity} > 0`
      ))
      .orderBy(productBatches.expiryDate)
      .limit(10);

    // Echte Lagerbestands-Warnungen aus inventory_items
    const stockAlertsResult = await db
      .select({
        productName: products.productName,
        currentStock: inventoryItems.quantity,
        minimumStock: inventoryItems.minQuantity,
        location: sql<string>`'Lager ' || ${inventoryItems.warehouseId}`.as('location')
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .where(and(
        isNotNull(inventoryItems.minQuantity),
        sql`${inventoryItems.quantity} <= ${inventoryItems.minQuantity}`
      ))
      .orderBy(sql`${inventoryItems.quantity} - ${inventoryItems.minQuantity}`)
      .limit(10);

    // Echte offene Bestellungen
    const pendingOrdersResult = await db
      .select({
        orderNumber: orders.orderNumber,
        supplierName: orders.supplierName,
        expectedDelivery: orders.expectedDeliveryDate,
        orderDate: orders.orderDate,
        status: orders.status
      })
      .from(orders)
      .where(sql`${orders.status} IN ('pending', 'processing', 'ordered')`)
      .orderBy(desc(orders.orderDate))
      .limit(8);

    // Echte kürzliche Lieferungen (letzten 7 Tage)
    const recentDeliveriesResult = await db
      .select({
        orderNumber: orders.orderNumber,
        supplierName: orders.supplierName,
        deliveredDate: orders.actualDeliveryDate,
        status: orders.status
      })
      .from(orders)
      .where(and(
        isNotNull(orders.actualDeliveryDate),
        gte(orders.actualDeliveryDate, sevenDaysAgo)
      ))
      .orderBy(desc(orders.actualDeliveryDate))
      .limit(8);

    // Echte Performance-Metriken aus transactions
    const revenueResult = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.as('totalRevenue'),
        transactionCount: count(transactions.id)
      })
      .from(transactions)
      .where(gte(transactions.transactionDt, thirtyDaysAgo));

    const machinesCount = await db
      .select({
        totalMachines: count(machines.id)
      })
      .from(machines);

    // Top und Low-Performing Maschinen (letzten 30 Tage)
    const machinePerformance = await db
      .select({
        machineName: sql<string>`COALESCE(${machines.locationName}, 'Automat ' || ${machines.id})`.as('machineName'),
        revenue: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.as('revenue'),
        transactionCount: count(transactions.id)
      })
      .from(machines)
      .leftJoin(transactions, and(
        eq(machines.vendonId, transactions.machineId),
        gte(transactions.transactionDt, thirtyDaysAgo)
      ))
      .groupBy(machines.id, machines.locationName)
      .orderBy(sql`revenue DESC`)
      .limit(20);

    const topPerformer = machinePerformance[0];
    const lowPerformers = machinePerformance.filter(m => m.revenue < (topPerformer?.revenue || 0) * 0.3).slice(0, 3);

    const performanceMetrics = {
      totalRevenue: revenueResult[0]?.totalRevenue || 0,
      totalTransactions: revenueResult[0]?.transactionCount || 0,
      totalMachines: machinesCount[0]?.totalMachines || 0,
      topPerformingMachine: topPerformer?.machineName || 'Keine Daten verfügbar',
      topPerformingRevenue: topPerformer?.revenue || 0,
      lowPerformingMachines: lowPerformers.map(m => m.machineName),
      averageDailySales: (revenueResult[0]?.totalRevenue || 0) / 30
    };

    res.json({
      mhdAlerts: mhdAlertsResult,
      stockAlerts: stockAlertsResult,
      pendingOrders: pendingOrdersResult,
      recentDeliveries: recentDeliveriesResult,
      performanceMetrics
    });
  } catch (error) {
    console.error('Fehler beim Laden der Vorschau-Daten:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Vorschau-Daten' });
  }
});

// POST /api/email-notifications/test - Test-E-Mail senden
router.post('/test', async (req, res) => {
  try {
    const { emailAddress } = req.body;

    if (!emailAddress) {
      return res.status(400).json({ error: 'E-Mail-Adresse ist erforderlich' });
    }

    const testEmailContent = `
      <h2>Test-E-Mail für Warenwirtschaftssystem</h2>
      <p>Diese Test-E-Mail bestätigt, dass Ihr E-Mail-System korrekt konfiguriert ist.</p>
      
      <h3>Beispiel-Inhalte:</h3>
      <ul>
        <li>✅ MHD-Warnungen funktionieren</li>
        <li>✅ Lagerbestands-Alerts aktiviert</li>
        <li>✅ Bestellungsübersicht verfügbar</li>
        <li>✅ Performance-Berichte eingerichtet</li>
      </ul>
      
      <p>Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
      <p>System: Warenwirtschaftssystem</p>
    `;

    await sendEmail({
      to: emailAddress,
      subject: 'Test-E-Mail - Warenwirtschaftssystem Benachrichtigungen',
      html: testEmailContent
    });

    res.json({ success: true, message: 'Test-E-Mail erfolgreich gesendet' });
  } catch (error) {
    console.error('Fehler beim Senden der Test-E-Mail:', error);
    res.status(500).json({ error: 'Fehler beim Senden der Test-E-Mail' });
  }
});

export default router;