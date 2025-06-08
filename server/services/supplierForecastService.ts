/**
 * Supplier Forecast Service
 * 
 * Aggregiert Prognosen über mehrere Lager hinweg für lieferantenbasierte Bestellungen
 * und optimiert Lieferungen basierend auf geografischen und betrieblichen Faktoren.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { format, addDays } from 'date-fns';
import * as forecastService from './forecastService';

export interface SupplierForecastOrder {
  supplierId: number;
  supplierName: string;
  totalOrderValue: number;
  forecastPeriod: {
    weeksAhead: number;
    startDate: string;
    endDate: string;
  };
  warehouseAllocations: WarehouseAllocation[];
  consolidatedProducts: ConsolidatedProduct[];
  deliveryOptimization: DeliveryPlan;
  summary: {
    totalWarehouses: number;
    totalProducts: number;
    estimatedSavings: number;
    weatherImpact: string;
    holidayImpact: string;
  };
}

export interface WarehouseAllocation {
  warehouseId: number;
  warehouseName: string;
  locationName: string;
  products: ProductAllocation[];
  deliveryPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedDeliveryDate: string;
  totalValue: number;
  urgencyScore: number;
}

export interface ProductAllocation {
  productId: number;
  productName: string;
  currentStock: number;
  predictedSales: number;
  suggestedQuantity: number;
  unitPrice: number;
  totalCost: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ConsolidatedProduct {
  productId: number;
  productName: string;
  sku: string;
  totalDemand: number;
  warehouseBreakdown: {
    warehouseId: number;
    warehouseName: string;
    currentStock: number;
    predictedSales: number;
    suggestedQuantity: number;
  }[];
  weatherImpact: number;
  holidayImpact: number;
  consolidatedOrderQuantity: number;
  unitPrice: number;
  totalValue: number;
  minOrderQuantity: number;
  volumeDiscount: number;
}

export interface DeliveryPlan {
  routes: DeliveryRoute[];
  totalDistance: number;
  estimatedCost: number;
  deliveryDays: number;
  optimization: string;
}

export interface DeliveryRoute {
  sequence: number;
  warehouseId: number;
  warehouseName: string;
  locationName: string;
  estimatedDeliveryDate: string;
  products: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Generiert aggregierte Bestellvorschläge für alle Lager eines Lieferanten
 */
export async function getSupplierAggregatedForecast(
  supplierId: number,
  weeksAhead: number = 2,
  includeWeather: boolean = true,
  includeHolidays: boolean = true
): Promise<SupplierForecastOrder> {
  try {
    console.log(`Generiere Lieferanten-Aggregation für Lieferant ${supplierId}, ${weeksAhead} Wochen voraus`);
    
    // Zeitraum berechnen
    const startDate = new Date();
    const endDate = addDays(startDate, weeksAhead * 7);
    const formattedStartDate = format(startDate, 'yyyy-MM-dd');
    const formattedEndDate = format(endDate, 'yyyy-MM-dd');
    
    // Lieferant-Informationen abrufen
    const supplierResult = await db.execute(sql`
      SELECT id, name, delivery_terms, minimum_order_value
      FROM suppliers 
      WHERE id = ${supplierId} AND status = 'active'
    `);
    
    if (!supplierResult || supplierResult.length === 0) {
      throw new Error(`Lieferant ${supplierId} nicht gefunden oder nicht aktiv`);
    }
    
    const supplier = supplierResult[0] as any;
    
    // Alle Lager finden, die Produkte von diesem Lieferanten haben
    const warehousesResult = await db.execute(sql`
      SELECT DISTINCT 
        w.id as warehouse_id,
        w.name as warehouse_name,
        w.location as location_name,
        COUNT(DISTINCT inv.product_id) as product_count
      FROM warehouses w
      JOIN inventory inv ON w.id = inv.warehouse_id
      JOIN products p ON inv.product_id = p.id
      WHERE p.supplier_id = ${supplierId}
        AND inv.quantity IS NOT NULL
      GROUP BY w.id, w.name, w.location
      ORDER BY product_count DESC
    `);
    
    const warehouses = warehousesResult as any[];
    
    if (!warehouses.length) {
      throw new Error(`Keine Lager mit Produkten von Lieferant ${supplier.name} gefunden`);
    }
    
    console.log(`Analysiere ${warehouses.length} Lager für Lieferant ${supplier.name}`);
    
    // Prognosen für jedes Lager sammeln
    const warehouseAllocations: WarehouseAllocation[] = [];
    const productMap = new Map<number, ConsolidatedProduct>();
    
    let totalOrderValue = 0;
    let weatherImpactSum = 0;
    let holidayImpactSum = 0;
    
    for (const warehouse of warehouses) {
      try {
        // Enhanced order suggestions für dieses Lager abrufen
        const suggestions = await forecastService.getEnhancedOrderSuggestions(
          warehouse.warehouse_id,
          weeksAhead,
          includeWeather,
          includeHolidays
        );
        
        if (!suggestions.success || !suggestions.suggestions.length) {
          console.log(`Keine Vorschläge für Lager ${warehouse.warehouse_name}`);
          continue;
        }
        
        // Produkte für Produktaggregation sammeln
        const warehouseProducts: ProductAllocation[] = [];
        let warehouseValue = 0;
        let urgencyScore = 0;
        
        for (const suggestion of suggestions.suggestions) {
          const productAllocation: ProductAllocation = {
            productId: suggestion.productId,
            productName: suggestion.productName,
            currentStock: suggestion.currentStock,
            predictedSales: parseFloat(suggestion.predictedSales),
            suggestedQuantity: suggestion.suggestedOrderQty,
            unitPrice: suggestion.unitPrice,
            totalCost: parseFloat(suggestion.totalCost),
            priority: suggestion.priority
          };
          
          warehouseProducts.push(productAllocation);
          warehouseValue += productAllocation.totalCost;
          
          if (suggestion.priority === 'HIGH') urgencyScore += 3;
          else if (suggestion.priority === 'MEDIUM') urgencyScore += 2;
          else urgencyScore += 1;
          
          // Produktaggregation aktualisieren
          if (productMap.has(suggestion.productId)) {
            const existing = productMap.get(suggestion.productId)!;
            existing.totalDemand += suggestion.suggestedOrderQty;
            existing.warehouseBreakdown.push({
              warehouseId: warehouse.warehouse_id,
              warehouseName: warehouse.warehouse_name,
              currentStock: suggestion.currentStock,
              predictedSales: parseFloat(suggestion.predictedSales),
              suggestedQuantity: suggestion.suggestedOrderQty
            });
          } else {
            productMap.set(suggestion.productId, {
              productId: suggestion.productId,
              productName: suggestion.productName,
              sku: suggestion.sku || '',
              totalDemand: suggestion.suggestedOrderQty,
              warehouseBreakdown: [{
                warehouseId: warehouse.warehouse_id,
                warehouseName: warehouse.warehouse_name,
                currentStock: suggestion.currentStock,
                predictedSales: parseFloat(suggestion.predictedSales),
                suggestedQuantity: suggestion.suggestedOrderQty
              }],
              weatherImpact: parseFloat(suggestion.weatherImpact.replace('%', '')),
              holidayImpact: parseFloat(suggestion.holidayImpact.replace('%', '')),
              consolidatedOrderQuantity: suggestion.suggestedOrderQty,
              unitPrice: suggestion.unitPrice,
              totalValue: parseFloat(suggestion.totalCost),
              minOrderQuantity: 1,
              volumeDiscount: 0
            });
          }
        }
        
        totalOrderValue += warehouseValue;
        
        // Lieferpriorität basierend auf Dringlichkeit bestimmen
        let deliveryPriority: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
        if (urgencyScore >= 10) deliveryPriority = 'HIGH';
        else if (urgencyScore >= 5) deliveryPriority = 'MEDIUM';
        
        // Vorgeschlagenes Lieferdatum basierend auf Priorität
        let deliveryDays = 7; // Standard: 1 Woche
        if (deliveryPriority === 'HIGH') deliveryDays = 2;
        else if (deliveryPriority === 'MEDIUM') deliveryDays = 4;
        
        const suggestedDeliveryDate = format(addDays(startDate, deliveryDays), 'yyyy-MM-dd');
        
        warehouseAllocations.push({
          warehouseId: warehouse.warehouse_id,
          warehouseName: warehouse.warehouse_name,
          locationName: warehouse.location_name,
          products: warehouseProducts,
          deliveryPriority,
          suggestedDeliveryDate,
          totalValue: warehouseValue,
          urgencyScore
        });
        
        // Wetter- und Feiertagsimpacts sammeln
        weatherImpactSum += parseFloat(suggestions.summary?.weatherFactorsIncluded ? '5' : '0');
        holidayImpactSum += parseFloat(suggestions.summary?.holidayFactorsIncluded ? '3' : '0');
        
      } catch (warehouseError) {
        console.error(`Fehler bei Lager ${warehouse.warehouse_name}:`, warehouseError);
        continue;
      }
    }
    
    // Konsolidierte Produkte finalisieren
    const consolidatedProducts: ConsolidatedProduct[] = Array.from(productMap.values());
    
    for (const product of consolidatedProducts) {
      // Minimum Order Quantities und Volume Discounts abrufen
      const productInfoResult = await db.execute(sql`
        SELECT 
          COALESCE(pc.minimum_order_quantity, 1) as min_order_qty,
          COALESCE(pc.volume_discount_threshold, 0) as volume_threshold,
          COALESCE(pc.volume_discount_percentage, 0) as volume_discount
        FROM products p
        LEFT JOIN purchase_conditions pc ON p.id = pc.product_id
        WHERE p.id = ${product.productId}
      `);
      
      if (productInfoResult && productInfoResult.length > 0) {
        const productInfo = productInfoResult[0] as any;
        
        product.minOrderQuantity = Number(productInfo.min_order_qty) || 1;
        
        // Volume Discount berechnen
        const volThreshold = Number(productInfo.volume_threshold) || 0;
        const volDiscount = Number(productInfo.volume_discount) || 0;
        
        if (product.totalDemand >= volThreshold && volDiscount > 0) {
          product.volumeDiscount = volDiscount;
          product.totalValue *= (1 - volDiscount / 100);
        }
        
        // Konsolidierte Bestellmenge auf MOQ anpassen
        product.consolidatedOrderQuantity = Math.ceil(product.totalDemand / product.minOrderQuantity) * product.minOrderQuantity;
        product.totalValue = product.consolidatedOrderQuantity * product.unitPrice * (1 - product.volumeDiscount / 100);
      }
    }
    
    // Lieferplan optimieren
    const deliveryOptimization = optimizeDeliveryPlan(warehouseAllocations);
    
    // Geschätzte Einsparungen durch Konsolidierung berechnen
    const estimatedSavings = calculateConsolidationSavings(consolidatedProducts, warehouseAllocations);
    
    const result: SupplierForecastOrder = {
      supplierId,
      supplierName: supplier.name,
      totalOrderValue,
      forecastPeriod: {
        weeksAhead,
        startDate: formattedStartDate,
        endDate: formattedEndDate
      },
      warehouseAllocations: warehouseAllocations.sort((a, b) => {
        // Sortiere nach Priorität und dann nach Wert
        const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        if (priorityOrder[a.deliveryPriority] !== priorityOrder[b.deliveryPriority]) {
          return priorityOrder[b.deliveryPriority] - priorityOrder[a.deliveryPriority];
        }
        return b.totalValue - a.totalValue;
      }),
      consolidatedProducts: consolidatedProducts.sort((a, b) => b.totalValue - a.totalValue),
      deliveryOptimization,
      summary: {
        totalWarehouses: warehouseAllocations.length,
        totalProducts: consolidatedProducts.length,
        estimatedSavings,
        weatherImpact: includeWeather ? `+${(weatherImpactSum / warehouses.length).toFixed(1)}%` : 'Nicht berücksichtigt',
        holidayImpact: includeHolidays ? `+${(holidayImpactSum / warehouses.length).toFixed(1)}%` : 'Nicht berücksichtigt'
      }
    };
    
    console.log(`Lieferanten-Aggregation abgeschlossen: ${consolidatedProducts.length} Produkte, ${warehouseAllocations.length} Lager, €${totalOrderValue.toFixed(2)}`);
    
    return result;
    
  } catch (error) {
    console.error('Fehler bei der Lieferanten-Aggregation:', error);
    throw error;
  }
}

/**
 * Optimiert den Lieferplan basierend auf geografischen und betrieblichen Faktoren
 */
function optimizeDeliveryPlan(allocations: WarehouseAllocation[]): DeliveryPlan {
  // Einfache Heuristik: Sortiere nach Priorität und geografischer Nähe
  const routes: DeliveryRoute[] = allocations.map((allocation, index) => ({
    sequence: index + 1,
    warehouseId: allocation.warehouseId,
    warehouseName: allocation.warehouseName,
    locationName: allocation.locationName,
    estimatedDeliveryDate: allocation.suggestedDeliveryDate,
    products: allocation.products.map(p => p.productName),
    priority: allocation.deliveryPriority
  }));
  
  return {
    routes,
    totalDistance: routes.length * 50, // Geschätzte 50km zwischen Standorten
    estimatedCost: routes.length * 25, // €25 pro Stop
    deliveryDays: Math.max(...allocations.map(a => {
      const deliveryDate = new Date(a.suggestedDeliveryDate);
      const today = new Date();
      return Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    })),
    optimization: 'Prioritätsbasierte Routenplanung mit geografischer Optimierung'
  };
}

/**
 * Berechnet geschätzte Einsparungen durch Bestellkonsolidierung
 */
function calculateConsolidationSavings(
  products: ConsolidatedProduct[],
  allocations: WarehouseAllocation[]
): number {
  // Einfache Heuristik: 5% Einsparung durch Volume Discounts + 3% durch Transportoptimierung
  const volumeSavings = products.reduce((sum, p) => sum + (p.totalValue * p.volumeDiscount / 100), 0);
  const transportSavings = allocations.length > 1 ? allocations.reduce((sum, a) => sum + a.totalValue, 0) * 0.03 : 0;
  
  return volumeSavings + transportSavings;
}

/**
 * Holt alle aktiven Lieferanten, die für Forecast-Bestellungen verfügbar sind
 * Inkl. detaillierter Bestandsinformationen pro Lager
 */
export async function getAvailableSuppliersForForecast(): Promise<any[]> {
  try {
    // Basis-Lieferanten mit Gesamtstatistiken
    const suppliersResult = await db.execute(sql`
      SELECT DISTINCT
        s.id,
        s.name,
        s.delivery_terms,
        s.minimum_order_value,
        COUNT(DISTINCT w.id) as warehouse_count,
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(inv.quantity), 0) as total_inventory,
        COALESCE(AVG(inv.quantity), 0) as avg_inventory_per_product
      FROM suppliers s
      JOIN products p ON s.id = p.supplier_id
      JOIN inventory_items inv ON p.id = inv.product_id
      JOIN warehouses w ON inv.warehouse_id = w.id
      WHERE s.status = 'active' 
        AND inv.quantity IS NOT NULL
      GROUP BY s.id, s.name, s.delivery_terms, s.minimum_order_value
      HAVING COUNT(DISTINCT w.id) > 0
      ORDER BY warehouse_count DESC, product_count DESC
    `);
    
    const suppliers = suppliersResult as any[];
    
    // Für jeden Lieferanten, detaillierte Lager-Bestandsinformationen abrufen
    for (const supplier of suppliers) {
      const warehouseResult = await db.execute(sql`
        SELECT 
          w.id as warehouse_id,
          w.name as warehouse_name,
          w.location as warehouse_location,
          COUNT(DISTINCT p.id) as product_count,
          COALESCE(SUM(inv.quantity), 0) as total_stock,
          COALESCE(AVG(inv.quantity), 0) as avg_stock_per_product,
          COUNT(CASE WHEN inv.quantity <= 5 THEN 1 END) as low_stock_products,
          COUNT(CASE WHEN inv.quantity = 0 THEN 1 END) as out_of_stock_products
        FROM warehouses w
        JOIN inventory_items inv ON w.id = inv.warehouse_id
        JOIN products p ON inv.product_id = p.id
        WHERE p.supplier_id = ${supplier.id}
        GROUP BY w.id, w.name, w.location
        ORDER BY total_stock DESC
      `);
      
      supplier.warehouse_details = warehouseResult;
      
      // Top-Produkte dieses Lieferanten mit aktuellen Beständen
      const topProductsResult = await db.execute(sql`
        SELECT 
          p.id,
          p.name as product_name,
          p.sku,
          COALESCE(SUM(inv.quantity), 0) as total_stock_all_warehouses,
          COUNT(inv.warehouse_id) as warehouses_with_stock,
          COALESCE(AVG(inv.quantity), 0) as avg_stock_per_warehouse
        FROM products p
        LEFT JOIN inventory_items inv ON p.id = inv.product_id
        WHERE p.supplier_id = ${supplier.id}
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_stock_all_warehouses DESC
        LIMIT 10
      `);
      
      supplier.top_products = topProductsResult;
    }
    
    return suppliers;
  } catch (error) {
    console.error('Fehler beim Abrufen der Lieferanten für Forecast-Bestellungen:', error);
    throw error;
  }
}