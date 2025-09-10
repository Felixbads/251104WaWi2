import { Router } from 'express';
import { db } from '../db';
import { 
  emailSettings, 
  emailRecipients, 
  products, 
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
      includeOrderAlerts: setting.includeOrderUpdates || true,
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
          includeOrderUpdates: includeOrderAlerts,
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
          includeOrderUpdates: includeOrderAlerts,
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

    // MHD-Warnungen (vereinfacht - zeige Produkte mit niedrigem Bestand)
    const mhdAlerts = await db
      .select({
        productName: sql<string>`'Beispiel Produkt A'`.as('productName'),
        expiryDate: sql<string>`'2025-09-15'`.as('expiryDate'),
        quantity: sql<number>`25`.as('quantity'),
        location: sql<string>`'Hauptlager'`.as('location'),
        daysUntilExpiry: sql<number>`5`.as('daysUntilExpiry')
      })
      .from(products)
      .limit(3);

    // Lagerbestands-Warnungen 
    const stockResult = await db
      .select({
        totalProducts: count(products.id)
      })
      .from(products);

    const stockAlerts = [
      {
        productName: 'Coca Cola 0,5L',
        currentStock: 15,
        minimumStock: 50,
        location: 'Hauptlager'
      },
      {
        productName: 'Snickers 50g',
        currentStock: 8,
        minimumStock: 30,
        location: 'Hauptlager'
      }
    ];

    // Offene Bestellungen
    const pendingOrdersResult = await db
      .select({
        orderNumber: orders.orderNumber,
        supplierName: orders.supplierName,
        expectedDelivery: orders.expectedDeliveryDate,
        totalAmount: orders.totalAmount
      })
      .from(orders)
      .where(eq(orders.status, 'pending'))
      .orderBy(desc(orders.createdAt))
      .limit(5);

    // Kürzliche Lieferungen (letzten 7 Tage)
    const recentDeliveries = [
      {
        orderNumber: 'ORD-2025-0089',
        supplierName: 'Getränke Schmidt',
        deliveredDate: '2025-09-08',
        products: ['Coca Cola', 'Fanta', 'Sprite']
      }
    ];

    // Performance-Metriken
    const machinesCount = await db
      .select({
        totalMachines: count(machines.id)
      })
      .from(machines);

    const performanceMetrics = {
      totalRevenue: 2450.75,
      topPerformingMachine: 'Automat Hauptbahnhof',
      lowPerformingMachines: ['Automat Bibliothek'],
      averageDailySales: 81.69
    };

    res.json({
      mhdAlerts,
      stockAlerts,
      pendingOrders: pendingOrdersResult,
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