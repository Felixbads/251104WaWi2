import { Router } from 'express';
import { db } from '../db';
import { 
  emailSettings, 
  emailRecipients, 
  products, 
  productBatches, 
  inventoryItems, 
  orders, 
  orderItems,
  machines,
  transactions
} from '@shared/schema';
import { eq, and, sql, gte, lte, desc, isNotNull, isNull } from 'drizzle-orm';
import { sendEmail } from '../services/emailService';

const router = Router();

// GET /api/email-notifications/settings - Aktuelle Einstellungen laden
router.get('/settings', async (req, res) => {
  try {
    const settings = await db
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.isActive, true))
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
      .where(eq(emailRecipients.settingsId, setting.id));

    res.json({
      id: setting.id,
      emailAddress: recipients[0]?.email || '',
      isActive: setting.isActive,
      frequency: setting.frequency,
      sendOnWeekdays: setting.sendOnWeekdays ? JSON.parse(setting.sendOnWeekdays) : ['1', '2', '3', '4', '5'],
      includeMhdAlerts: setting.includeMhdAlerts,
      includeStockAlerts: setting.includeStockAlerts,
      includeOrderAlerts: setting.includeOrderAlerts,
      includeDeliveryAlerts: setting.includeDeliveryAlerts,
      includePerformanceAlerts: setting.includePerformanceAlerts || false,
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
      frequency,
      sendOnWeekdays,
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
          isActive,
          frequency,
          sendOnWeekdays: JSON.stringify(sendOnWeekdays),
          includeMhdAlerts,
          includeStockAlerts,
          includeOrderAlerts,
          includeDeliveryAlerts,
          includePerformanceAlerts,
          sendTime
        })
        .where(eq(emailSettings.id, id));
    } else {
      // Neue Einstellungen erstellen
      const newSettings = await db
        .insert(emailSettings)
        .values({
          isActive,
          frequency,
          sendOnWeekdays: JSON.stringify(sendOnWeekdays),
          includeMhdAlerts,
          includeStockAlerts,
          includeOrderAlerts,
          includeDeliveryAlerts,
          includePerformanceAlerts,
          sendTime
        })
        .returning();
      
      settingsId = newSettings[0].id;
    }

    // E-Mail-Empfänger aktualisieren
    await db.delete(emailRecipients).where(eq(emailRecipients.settingsId, settingsId));
    await db.insert(emailRecipients).values({
      settingsId,
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

    // MHD-Warnungen (ablaufende Produkte in den nächsten 7 Tagen)
    const mhdAlerts = await db
      .select({
        productName: products.name,
        expiryDate: productBatches.expiryDate,
        quantity: productBatches.quantity,
        location: sql<string>`'Lager'` // Vereinfacht, könnte aus warehouse_locations kommen
      })
      .from(productBatches)
      .innerJoin(products, eq(productBatches.productId, products.id))
      .where(
        and(
          isNotNull(productBatches.expiryDate),
          lte(productBatches.expiryDate, sevenDaysFromNow),
          gte(productBatches.expiryDate, now)
        )
      )
      .orderBy(productBatches.expiryDate)
      .limit(10);

    // Erweitere MHD-Alerts um daysUntilExpiry
    const enrichedMhdAlerts = mhdAlerts.map(alert => ({
      ...alert,
      daysUntilExpiry: Math.ceil((new Date(alert.expiryDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }));

    // Lagerbestands-Warnungen (niedrige Bestände)
    const stockAlerts = await db
      .select({
        productName: products.name,
        currentStock: sql<number>`COALESCE(SUM(${inventoryItems.quantity}), 0)`.as('currentStock'),
        minimumStock: sql<number>`50`.as('minimumStock'), // Vereinfacht
        location: sql<string>`'Hauptlager'`.as('location')
      })
      .from(products)
      .leftJoin(inventoryItems, eq(inventoryItems.productId, products.id))
      .groupBy(products.id, products.name)
      .having(sql`COALESCE(SUM(${inventoryItems.quantity}), 0) < 50`)
      .limit(10);

    // Offene Bestellungen
    const pendingOrders = await db
      .select({
        orderNumber: orders.orderNumber,
        supplierName: sql<string>`COALESCE(${orders.supplierName}, 'Unbekannt')`.as('supplierName'),
        expectedDelivery: orders.expectedDeliveryDate,
        totalAmount: orders.totalAmount
      })
      .from(orders)
      .where(eq(orders.status, 'pending'))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    // Kürzliche Lieferungen (letzten 7 Tage)
    const recentDeliveries = await db
      .select({
        orderNumber: orders.orderNumber,
        supplierName: sql<string>`COALESCE(${orders.supplierName}, 'Unbekannt')`.as('supplierName'),
        deliveredDate: orders.deliveredAt,
        products: sql<string[]>`ARRAY[]::text[]`.as('products') // Vereinfacht
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'delivered'),
          gte(orders.deliveredAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
        )
      )
      .orderBy(desc(orders.deliveredAt))
      .limit(10);

    // Performance-Metriken (letzten 30 Tage)
    const performanceData = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.as('totalRevenue'),
        transactionCount: sql<number>`COUNT(*)`.as('transactionCount')
      })
      .from(transactions)
      .where(gte(transactions.transactionTime, thirtyDaysAgo));

    const topMachine = await db
      .select({
        machineName: machines.name,
        revenue: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`.as('revenue')
      })
      .from(machines)
      .leftJoin(transactions, eq(transactions.machineId, machines.id))
      .where(gte(transactions.transactionTime, thirtyDaysAgo))
      .groupBy(machines.id, machines.name)
      .orderBy(desc(sql`COALESCE(SUM(${transactions.amount}), 0)`))
      .limit(1);

    const performanceMetrics = {
      totalRevenue: performanceData[0]?.totalRevenue || 0,
      topPerformingMachine: topMachine[0]?.machineName || 'Keine Daten',
      lowPerformingMachines: [] as string[],
      averageDailySales: (performanceData[0]?.totalRevenue || 0) / 30
    };

    res.json({
      mhdAlerts: enrichedMhdAlerts,
      stockAlerts,
      pendingOrders,
      recentDeliveries,
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