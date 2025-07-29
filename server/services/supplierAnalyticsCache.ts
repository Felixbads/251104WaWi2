import { rawDb } from '../db';

export class SupplierAnalyticsCache {
  private static instance: SupplierAnalyticsCache;
  private isUpdating = false;

  static getInstance(): SupplierAnalyticsCache {
    if (!SupplierAnalyticsCache.instance) {
      SupplierAnalyticsCache.instance = new SupplierAnalyticsCache();
    }
    return SupplierAnalyticsCache.instance;
  }

  /**
   * Berechnet und speichert Supplier Analytics in Cache-Tabelle
   */
  async updateCache(): Promise<void> {
    if (this.isUpdating) {
      console.log('Cache-Update bereits in Arbeit, überspringe...');
      return;
    }

    this.isUpdating = true;
    const startTime = Date.now();
    console.log('🔄 Starte Supplier Analytics Cache-Update...');

    try {
      // Hole alle aktiven Lieferanten
      const suppliersResult = await rawDb.query('SELECT id, name FROM suppliers WHERE status = $1 ORDER BY name', ['active']);
      const suppliers = suppliersResult.rows;
      
      console.log(`📊 Verarbeite ${suppliers.length} Lieferanten...`);

      for (const supplier of suppliers) {
        try {
          await this.updateSupplierCache(supplier.id, supplier.name);
        } catch (error) {
          console.error(`❌ Fehler bei Lieferant ${supplier.name}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Cache-Update abgeschlossen in ${duration}ms`);

    } catch (error) {
      console.error('❌ Kritischer Fehler beim Cache-Update:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Berechnet Analytics für einen einzelnen Lieferanten
   */
  private async updateSupplierCache(supplierId: number, supplierName: string): Promise<void> {
    console.log(`📈 Berechne Analytics für: ${supplierName}`);

    // Berechne Jahresumsatz (12 Monate)
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

    // Hole Produktnamen für diesen Lieferanten
    const productsResult = await rawDb.query(`
      SELECT DISTINCT p.id, p.product_name
      FROM products p
      INNER JOIN purchase_conditions pc ON p.id = pc.product_id
      WHERE pc.supplier_id = $1
    `, [supplierId]);

    const productNames = productsResult.rows.map((p: any) => p.product_name);
    console.log(`   🛍️ ${productNames.length} Produkte gefunden`);

    if (productNames.length === 0) {
      // Keine Produkte -> Nullwerte setzen
      await this.saveToCache(supplierId, supplierName, 0, 0, 0, 0, null);
      return;
    }

    // Berechne Verkaufsstatistiken mit IN-Clause für bessere Performance
    const placeholders = productNames.map((_: any, i: number) => `$${i + 2}`).join(',');
    const revenueQuery = `
      SELECT 
        COALESCE(SUM(CAST(t.price AS DECIMAL)), 0) as revenue,
        COUNT(t.id) as transaction_count
      FROM transactions t
      WHERE t.product_name IN (${placeholders})
        AND t.datetime >= $1
    `;

    const revenueResult = await rawDb.query(revenueQuery, [cutoffDate.toISOString(), ...productNames]);
    const { revenue, transaction_count } = revenueResult.rows[0];

    // Berechne letztes Bestelldatum
    const lastOrderQuery = `
      SELECT MAX(t.datetime) as last_order
      FROM transactions t
      WHERE t.product_name IN (${placeholders})
    `;

    const lastOrderResult = await rawDb.query(lastOrderQuery, productNames);
    const lastOrderDate = lastOrderResult.rows[0].last_order;

    // Berechne offene Bestellungen
    const openOrdersQuery = `
      SELECT COUNT(DISTINCT o.id) as open_orders
      FROM orders o
      WHERE o.supplier_id = $1 AND o.status IN ('draft', 'sent', 'confirmed')
    `;

    const openOrdersResult = await rawDb.query(openOrdersQuery, [supplierId]);
    const openOrders = openOrdersResult.rows[0].open_orders || 0;

    console.log(`   💰 Revenue: €${revenue}, Transactions: ${transaction_count}, Open Orders: ${openOrders}`);

    // Speichere in Cache
    await this.saveToCache(
      supplierId,
      supplierName,
      parseInt(transaction_count) || 0, // orderVolume = Anzahl Transaktionen
      parseFloat(revenue) || 0,         // annualRevenue
      productNames.length,              // productCount
      parseInt(openOrders) || 0,        // openOrders
      lastOrderDate                     // lastOrderDate
    );
  }

  /**
   * Speichert berechnete Werte in Cache-Tabelle
   */
  private async saveToCache(
    supplierId: number,
    supplierName: string,
    orderVolume: number,
    annualRevenue: number,
    productCount: number,
    openOrders: number,
    lastOrderDate: string | null
  ): Promise<void> {
    const query = `
      INSERT INTO supplier_analytics_cache 
        (supplier_id, supplier_name, order_volume, annual_revenue, product_count, open_orders, last_order_date, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (supplier_id) 
      DO UPDATE SET
        supplier_name = EXCLUDED.supplier_name,
        order_volume = EXCLUDED.order_volume,
        annual_revenue = EXCLUDED.annual_revenue,
        product_count = EXCLUDED.product_count,
        open_orders = EXCLUDED.open_orders,
        last_order_date = EXCLUDED.last_order_date,
        last_updated = NOW()
    `;

    await rawDb.query(query, [
      supplierId,
      supplierName,
      orderVolume,
      annualRevenue,
      productCount,
      openOrders,
      lastOrderDate
    ]);
  }

  /**
   * Liest Analytics aus Cache (für API)
   */
  async getCachedAnalytics(): Promise<any[]> {
    const query = `
      SELECT 
        supplier_id as "supplierId",
        supplier_name as "supplierName",
        order_volume as "orderVolume",
        annual_revenue as "annualRevenue",
        product_count as "productCount",
        open_orders as "openOrders",
        last_order_date as "lastOrderDate",
        last_updated as "lastUpdated"
      FROM supplier_analytics_cache
      ORDER BY order_volume DESC
    `;

    const result = await rawDb.query(query);
    return result.rows;
  }

  /**
   * Prüft, ob Cache aktuell ist (nicht älter als 1 Stunde)
   */
  async isCacheStale(): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM supplier_analytics_cache
      WHERE last_updated > NOW() - INTERVAL '1 hour'
    `;

    const result = await rawDb.query(query);
    const recentUpdates = parseInt(result.rows[0].count);
    
    // Cache ist veraltet, wenn es keine Updates in der letzten Stunde gab
    return recentUpdates === 0;
  }

  /**
   * Startet Background-Timer für automatische Updates
   */
  startBackgroundUpdates(): void {
    // Sofortiges erstes Update
    this.updateCache();

    // Dann alle 30 Minuten
    setInterval(() => {
      this.updateCache();
    }, 30 * 60 * 1000); // 30 Minuten

    console.log('🔄 Background Supplier Analytics Cache gestartet (Update alle 30 Minuten)');
  }
}