/**
 * Working Supplier Forecast Service
 * Provides supplier information with current inventory levels for forecast-based ordering
 */

import { db } from '../db';
import { suppliers, products, inventoryItems, warehouses } from '../../shared/schema';
import { eq, and, sql, count, sum, avg } from 'drizzle-orm';

export async function getAvailableSuppliersForForecast(): Promise<any[]> {
  try {
    console.log('Starting supplier forecast query with proper Drizzle syntax...');
    
    // Get basic supplier information using Drizzle ORM
    const supplierData = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        delivery_terms: suppliers.deliveryTerms,
        minimum_order_value: suppliers.minimumOrderValue
      })
      .from(suppliers)
      .innerJoin(products, eq(suppliers.id, products.supplierId))
      .where(eq(suppliers.status, 'active'))
      .groupBy(suppliers.id, suppliers.name, suppliers.deliveryTerms, suppliers.minimumOrderValue)
      .limit(20);
    
    console.log(`Found ${supplierData.length} suppliers using Drizzle ORM`);
    
    if (!supplierData || supplierData.length === 0) {
      return [];
    }
    
    // Enrich each supplier with inventory information
    const enrichedSuppliers = [];
    
    for (const supplier of supplierData) {
      console.log(`Processing supplier: ${supplier.name} (ID: ${supplier.id})`);
      
      try {
        // Get warehouse information for this supplier
        const warehouseInfo = await db
          .select({
            warehouse_id: warehouses.id,
            warehouse_name: warehouses.name,
            warehouse_location: warehouses.locationName,
            product_count: count(products.id),
            total_stock: sum(inventoryItems.quantity)
          })
          .from(warehouses)
          .innerJoin(inventoryItems, eq(warehouses.id, inventoryItems.warehouseId))
          .innerJoin(products, eq(inventoryItems.productId, products.id))
          .where(eq(products.supplierId, supplier.id))
          .groupBy(warehouses.id, warehouses.name, warehouses.locationName)
          .orderBy(sql`${sum(inventoryItems.quantity)} DESC`);
        
        // Get top products for this supplier
        const topProducts = await db
          .select({
            id: products.id,
            product_name: products.productName,
            sku: products.sku,
            total_stock_all_warehouses: sum(inventoryItems.quantity),
            warehouses_with_stock: count(inventoryItems.warehouseId)
          })
          .from(products)
          .leftJoin(inventoryItems, eq(products.id, inventoryItems.productId))
          .where(eq(products.supplierId, supplier.id))
          .groupBy(products.id, products.productName, products.sku)
          .orderBy(sql`${sum(inventoryItems.quantity)} DESC`)
          .limit(10);
        
        // Calculate summary statistics
        const totalWarehouses = warehouseInfo.length;
        const totalProducts = topProducts.length;
        const totalInventory = warehouseInfo.reduce((sum, w) => sum + (Number(w.total_stock) || 0), 0);
        const lowStockProducts = topProducts.filter(p => (Number(p.total_stock_all_warehouses) || 0) <= 5).length;
        
        enrichedSuppliers.push({
          id: supplier.id,
          name: supplier.name,
          delivery_terms: supplier.delivery_terms,
          minimum_order_value: supplier.minimum_order_value,
          warehouse_count: totalWarehouses,
          product_count: totalProducts,
          total_inventory: totalInventory,
          low_stock_products: lowStockProducts,
          warehouse_details: warehouseInfo,
          top_products: topProducts
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

// Stub function for supplier aggregated forecast (to be implemented when core functionality works)
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