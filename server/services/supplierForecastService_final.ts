/**
 * Final Working Supplier Forecast Service
 * Provides supplier information with current inventory levels for forecast-based ordering
 */

import { db } from '../db';

export async function getAvailableSuppliersForForecast(): Promise<any[]> {
  try {
    console.log('Starting supplier forecast query with direct SQL...');
    
    // Use direct SQL queries to avoid Drizzle schema complications
    const suppliersQuery = `
      SELECT DISTINCT
        s.id,
        s.name,
        s.delivery_terms,
        s.minimum_order_value,
        COUNT(DISTINCT w.id) as warehouse_count,
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(inv.quantity), 0) as total_inventory
      FROM suppliers s
      JOIN products p ON s.id = p.supplier_id
      LEFT JOIN inventory_items inv ON p.id = inv.product_id
      LEFT JOIN warehouses w ON inv.warehouse_id = w.id
      WHERE s.status = 'active'
      GROUP BY s.id, s.name, s.delivery_terms, s.minimum_order_value
      HAVING COUNT(DISTINCT p.id) > 0
      ORDER BY warehouse_count DESC, product_count DESC
      LIMIT 15
    `;
    
    const suppliersResult = await db.execute(suppliersQuery);
    const suppliers = Array.isArray(suppliersResult) ? suppliersResult : [];
    
    console.log(`Found ${suppliers.length} suppliers with direct SQL`);
    
    if (suppliers.length === 0) {
      return [];
    }
    
    // Enrich each supplier with detailed warehouse and product information
    const enrichedSuppliers = [];
    
    for (const supplier of suppliers) {
      console.log(`Processing supplier: ${supplier.name} (ID: ${supplier.id})`);
      
      try {
        // Get warehouse details for this supplier
        const warehouseQuery = `
          SELECT 
            w.id as warehouse_id,
            w.name as warehouse_name,
            w.address,
            w.city,
            COUNT(DISTINCT p.id) as product_count,
            COALESCE(SUM(inv.quantity), 0) as total_stock,
            COUNT(CASE WHEN inv.quantity <= 5 THEN 1 END) as low_stock_products,
            COUNT(CASE WHEN inv.quantity = 0 OR inv.quantity IS NULL THEN 1 END) as out_of_stock_products
          FROM warehouses w
          JOIN inventory_items inv ON w.id = inv.warehouse_id
          JOIN products p ON inv.product_id = p.id
          WHERE p.supplier_id = $1 AND w.is_active = true
          GROUP BY w.id, w.name, w.address, w.city
          ORDER BY total_stock DESC
        `;
        
        const warehouseResult = await db.execute(warehouseQuery, [supplier.id]);
        const warehouseDetails = Array.isArray(warehouseResult) ? warehouseResult : [];
        
        // Get top products for this supplier
        const productsQuery = `
          SELECT 
            p.id,
            p.product_name,
            p.sku,
            COALESCE(SUM(inv.quantity), 0) as total_stock_all_warehouses,
            COUNT(DISTINCT inv.warehouse_id) as warehouses_with_stock,
            COALESCE(AVG(inv.quantity), 0) as avg_stock_per_warehouse
          FROM products p
          LEFT JOIN inventory_items inv ON p.id = inv.product_id
          WHERE p.supplier_id = $1
          GROUP BY p.id, p.product_name, p.sku
          ORDER BY total_stock_all_warehouses DESC
          LIMIT 10
        `;
        
        const productsResult = await db.execute(productsQuery, [supplier.id]);
        const topProducts = Array.isArray(productsResult) ? productsResult : [];
        
        // Calculate enhanced statistics
        const totalWarehouses = warehouseDetails.length;
        const totalProducts = topProducts.length;
        const totalInventory = Number(supplier.total_inventory) || 0;
        const lowStockProducts = topProducts.filter(p => Number(p.total_stock_all_warehouses) <= 5).length;
        const outOfStockProducts = topProducts.filter(p => Number(p.total_stock_all_warehouses) === 0).length;
        
        // Calculate inventory health score (0-100)
        const healthScore = totalProducts > 0 ? 
          Math.round(((totalProducts - outOfStockProducts) / totalProducts) * 100) : 0;
        
        enrichedSuppliers.push({
          id: supplier.id,
          name: supplier.name,
          delivery_terms: supplier.delivery_terms,
          minimum_order_value: supplier.minimum_order_value,
          warehouse_count: totalWarehouses,
          product_count: totalProducts,
          total_inventory: totalInventory,
          low_stock_products: lowStockProducts,
          out_of_stock_products: outOfStockProducts,
          inventory_health_score: healthScore,
          warehouse_details: warehouseDetails,
          top_products: topProducts,
          summary: {
            has_low_stock_warnings: lowStockProducts > 0,
            has_out_of_stock_items: outOfStockProducts > 0,
            inventory_status: healthScore >= 80 ? 'Excellent' : 
                            healthScore >= 60 ? 'Good' : 
                            healthScore >= 40 ? 'Warning' : 'Critical'
          }
        });
        
      } catch (supplierError) {
        console.error(`Error processing supplier ${supplier.name}:`, supplierError);
        
        // Add supplier with basic info even if enrichment fails
        enrichedSuppliers.push({
          id: supplier.id,
          name: supplier.name,
          delivery_terms: supplier.delivery_terms,
          minimum_order_value: supplier.minimum_order_value,
          warehouse_count: 0,
          product_count: 0,
          total_inventory: 0,
          low_stock_products: 0,
          out_of_stock_products: 0,
          inventory_health_score: 0,
          warehouse_details: [],
          top_products: [],
          summary: {
            has_low_stock_warnings: false,
            has_out_of_stock_items: false,
            inventory_status: 'Unknown'
          }
        });
      }
    }
    
    console.log(`Successfully processed ${enrichedSuppliers.length} suppliers with enhanced inventory data`);
    return enrichedSuppliers;
    
  } catch (error) {
    console.error('Error in getAvailableSuppliersForForecast:', error);
    throw error;
  }
}

// Stub function for supplier aggregated forecast
export async function getSupplierAggregatedForecast(
  supplierId: number,
  weeksAhead: number = 2,
  includeWeather: boolean = true,
  includeHolidays: boolean = true
): Promise<any> {
  return {
    supplierId,
    supplierName: 'Test Supplier',
    totalOrderValue: 0,
    forecastPeriod: {
      weeksAhead,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + weeksAhead * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    warehouseAllocations: [],
    consolidatedProducts: [],
    deliveryOptimization: {
      routes: [],
      totalDistance: 0,
      estimatedCost: 0,
      deliveryDays: 0,
      optimization: 'Basic optimization'
    },
    summary: {
      totalWarehouses: 0,
      totalProducts: 0,
      estimatedSavings: 0,
      weatherImpact: 'Not implemented',
      holidayImpact: 'Not implemented'
    }
  };
}