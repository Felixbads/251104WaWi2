/**
 * Simplified Supplier Forecast Service
 * Provides supplier information with current inventory levels for forecast-based ordering
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function getAvailableSuppliersForForecast(): Promise<any[]> {
  try {
    console.log('Starting supplier forecast query...');
    
    // Get basic supplier information
    const suppliersResult = await db.execute(sql`
      SELECT DISTINCT
        s.id,
        s.name,
        s.delivery_terms,
        s.minimum_order_value
      FROM suppliers s
      JOIN products p ON s.id = p.supplier_id
      WHERE s.status = 'active'
      ORDER BY s.name
      LIMIT 20
    `);
    
    // Extract actual supplier data from query result
    const supplierData = suppliersResult[3] || [];
    console.log(`Found ${supplierData.length} suppliers`);
    
    if (!supplierData || supplierData.length === 0) {
      return [];
    }
    
    // Enrich each supplier with inventory information
    const enrichedSuppliers = [];
    
    for (const supplier of supplierData) {
      console.log(`Processing supplier: ${supplier.name} (ID: ${supplier.id})`);
      
      try {
        // Get warehouse information for this supplier
        const warehouseInfoResult = await db.execute(sql`
          SELECT 
            w.id as warehouse_id,
            w.name as warehouse_name,
            w.location as warehouse_location,
            COUNT(DISTINCT p.id) as product_count,
            COALESCE(SUM(inv.quantity), 0) as total_stock
          FROM warehouses w
          JOIN inventory_items inv ON w.id = inv.warehouse_id
          JOIN products p ON inv.product_id = p.id
          WHERE p.supplier_id = ${supplier.id}
          GROUP BY w.id, w.name, w.location
          ORDER BY total_stock DESC
        `);
        
        const warehouseData = warehouseInfoResult[3] || [];
        
        // Get top products for this supplier
        const topProductsResult = await db.execute(sql`
          SELECT 
            p.id,
            p.name as product_name,
            p.sku,
            COALESCE(SUM(inv.quantity), 0) as total_stock_all_warehouses,
            COUNT(DISTINCT inv.warehouse_id) as warehouses_with_stock
          FROM products p
          LEFT JOIN inventory_items inv ON p.id = inv.product_id
          WHERE p.supplier_id = ${supplier.id}
          GROUP BY p.id, p.name, p.sku
          ORDER BY total_stock_all_warehouses DESC
          LIMIT 10
        `);
        
        const topProductsData = topProductsResult[3] || [];
        
        // Calculate summary statistics
        const totalWarehouses = warehouseData.length;
        const totalProducts = topProductsData.length;
        const totalInventory = warehouseData.reduce((sum, w) => sum + (parseInt(w.total_stock) || 0), 0);
        const lowStockProducts = topProductsData.filter(p => (parseInt(p.total_stock_all_warehouses) || 0) <= 5).length;
        
        enrichedSuppliers.push({
          id: supplier.id,
          name: supplier.name,
          delivery_terms: supplier.delivery_terms,
          minimum_order_value: supplier.minimum_order_value,
          warehouse_count: totalWarehouses,
          product_count: totalProducts,
          total_inventory: totalInventory,
          low_stock_products: lowStockProducts,
          warehouse_details: warehouseData,
          top_products: topProductsData
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
          warehouse_details: [],
          top_products: []
        });
      }
    }
    
    console.log(`Successfully processed ${enrichedSuppliers.length} suppliers`);
    return enrichedSuppliers;
    
  } catch (error) {
    console.error('Error in getAvailableSuppliersForForecast:', error);
    throw error;
  }
}