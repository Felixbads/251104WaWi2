import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { 
  orders, 
  orderItems, 
  products, 
  suppliers, 
  warehouses,
  locations,
  insertOrderSchema,
  insertOrderItemSchema 
} from '../../shared/schema';
import { eq, desc, and } from 'drizzle-orm';

const router = Router();

// Enhanced order creation schema
const enhancedOrderSchema = z.object({
  warehouseId: z.number(),
  supplierId: z.number(),
  orderMode: z.enum(['standard', 'forecast', 'copy']),
  deliveryLocation: z.string().optional(),
  notes: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  showPricesInEmail: z.boolean().default(true),
  forecastPeriodDays: z.number().default(7),
  cartData: z.string(), // JSON string of cart items
  items: z.array(z.object({
    productId: z.number(),
    productName: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalPrice: z.number(),
    unit: z.string(),
    itemComment: z.string().optional(),
    expectedMHD: z.string().optional(),
    // Package information
    sku: z.string().optional(),
    supplierSku: z.string().optional(),
    orderArticleNumber: z.string().optional(),
    packageCount: z.number().optional(),
    packageQuantity: z.number().optional(),
    packageTypeName: z.string().optional(),
    baseUnitName: z.string().optional()
  })),
  totalAmount: z.number()
});

// Create enhanced order
router.post('/enhanced', async (req, res) => {
  try {
    const orderData = enhancedOrderSchema.parse(req.body);
    
    // Generate order number
    const currentDate = new Date();
    const dateStr = currentDate.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = Date.now().toString().slice(-4);
    const orderNumber = `ORD-${dateStr}-${timeStr}`;
    
    // Get supplier information
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, orderData.supplierId))
      .limit(1);
    
    if (!supplier) {
      return res.status(404).json({ error: 'Lieferant nicht gefunden' });
    }
    
    // Get warehouse/location information
    let locationData = null;
    if (orderData.warehouseId) {
      const [warehouse] = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, orderData.warehouseId))
        .limit(1);
      
      if (warehouse) {
        locationData = warehouse;
      } else {
        // Try locations table
        const [location] = await db
          .select()
          .from(locations)
          .where(eq(locations.id, orderData.warehouseId))
          .limit(1);
        locationData = location;
      }
    }
    
    // Calculate order values
    const subtotal = orderData.totalAmount;
    const vatRate = 19; // 19% MwSt
    const vatAmount = subtotal * (vatRate / 100);
    const totalWithVat = subtotal + vatAmount;
    
    // Create order
    const [newOrder] = await db
      .insert(orders)
      .values({
        orderNumber,
        supplierId: orderData.supplierId,
        supplierName: supplier.name,
        locationId: locationData?.id || null,
        locationName: locationData?.name || 'Unbekannt',
        deliveryLocation: orderData.deliveryLocation || locationData?.address || '',
        status: 'draft', // Start as draft
        orderDate: new Date(),
        expectedDeliveryDate: orderData.expectedDeliveryDate ? new Date(orderData.expectedDeliveryDate) : null,
        totalAmount: totalWithVat,
        currency: 'EUR',
        vatAmount: vatAmount,
        notes: orderData.notes || '',
        orderMode: orderData.orderMode,
        showPricesInEmail: orderData.showPricesInEmail,
        forecastPeriodDays: orderData.forecastPeriodDays,
        cartData: orderData.cartData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    // Create order items with package information
    const orderItemsToInsert = orderData.items.map((item, index) => ({
      orderId: newOrder.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku || null,
      supplierSku: item.supplierSku || null,
      orderArticleNumber: item.orderArticleNumber || null,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      vatRate: vatRate,
      vatAmount: item.totalPrice * (vatRate / 100),
      positionNumber: index + 1,
      status: 'pending',
      itemComment: item.itemComment || null,
      expectedMHD: item.expectedMHD || null,
      // Package information
      packageCount: item.packageCount || null,
      packageQuantity: item.packageQuantity || null,
      packageTypeName: item.packageTypeName || null,
      baseUnitName: item.baseUnitName || null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    const createdItems = await db
      .insert(orderItems)
      .values(orderItemsToInsert)
      .returning();
    
    // Return complete order with items
    const completeOrder = {
      ...newOrder,
      items: createdItems,
      supplier: supplier,
      location: locationData
    };
    
    res.status(201).json({
      message: 'Bestellung erfolgreich erstellt',
      order: completeOrder
    });
    
  } catch (error) {
    console.error('Error creating enhanced order:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validierungsfehler',
        details: error.errors
      });
    }
    
    res.status(500).json({
      error: 'Fehler beim Erstellen der Bestellung',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Get order with enhanced details
router.get('/:id/enhanced', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestell-ID' });
    }
    
    // Get order with all related data
    const [order] = await db
      .select({
        order: orders,
        supplier: suppliers,
        location: locations
      })
      .from(orders)
      .leftJoin(suppliers, eq(orders.supplierId, suppliers.id))
      .leftJoin(locations, eq(orders.locationId, locations.id))
      .where(eq(orders.id, orderId))
      .limit(1);
    
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    // Get order items with product details
    const items = await db
      .select({
        item: orderItems,
        product: products
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.positionNumber);
    
    // Parse cart data if available
    let cartData = null;
    if (order.order.cartData) {
      try {
        cartData = JSON.parse(order.order.cartData);
      } catch (e) {
        console.warn('Failed to parse cart data:', e);
      }
    }
    
    const enhancedOrder = {
      ...order.order,
      supplier: order.supplier,
      location: order.location,
      items: items.map(item => ({
        ...item.item,
        product: item.product
      })),
      cartData: cartData
    };
    
    res.json(enhancedOrder);
    
  } catch (error) {
    console.error('Error fetching enhanced order:', error);
    res.status(500).json({
      error: 'Fehler beim Laden der Bestellung',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Update order status in enhanced workflow
router.patch('/:id/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status, notes } = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Ungültige Bestell-ID' });
    }
    
    const validStatuses = ['draft', 'review', 'approved', 'sent', 'confirmed', 'partially_received', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Ungültiger Status',
        validStatuses
      });
    }
    
    // Update order status
    const [updatedOrder] = await db
      .update(orders)
      .set({
        status,
        notes: notes || undefined,
        updatedAt: new Date()
      })
      .where(eq(orders.id, orderId))
      .returning();
    
    if (!updatedOrder) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    res.json({
      message: 'Status erfolgreich aktualisiert',
      order: updatedOrder
    });
    
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      error: 'Fehler beim Aktualisieren des Status',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Get forecast data for enhanced ordering
router.get('/forecast/:supplierId/:warehouseId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const warehouseId = parseInt(req.params.warehouseId);
    const forecastDays = parseInt(req.query.days as string) || 7;
    
    if (isNaN(supplierId) || isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Ungültige Parameter' });
    }
    
    // Get products from supplier with current stock and forecast
    // This is a simplified implementation - in reality you'd integrate with your forecasting system
    const supplierProducts = await db
      .select({
        product: products,
        // Note: You would join with inventory and forecast tables here
        currentStock: products.currentStock, // Placeholder
        forecastQuantity: products.currentStock // Placeholder - replace with actual forecast logic
      })
      .from(products)
      .where(eq(products.supplierId, supplierId));
    
    // Calculate suggested quantities based on forecast period
    const forecastData = supplierProducts.map(item => ({
      ...item,
      suggestedQuantity: Math.max(1, Math.ceil((item.forecastQuantity || 0) * (forecastDays / 7))),
      reorderPoint: item.product.reorderPoint || 0,
      needsReorder: (item.currentStock || 0) <= (item.product.reorderPoint || 0)
    }));
    
    res.json(forecastData);
    
  } catch (error) {
    console.error('Error fetching forecast data:', error);
    res.status(500).json({
      error: 'Fehler beim Laden der Prognosedaten',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Get recent orders for copy functionality
router.get('/recent/:supplierId', async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const limit = parseInt(req.query.limit as string) || 5;
    
    if (isNaN(supplierId)) {
      return res.status(400).json({ error: 'Ungültige Lieferanten-ID' });
    }
    
    // Get recent orders from this supplier
    const recentOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.supplierId, supplierId))
      .orderBy(desc(orders.orderDate))
      .limit(limit);
    
    // Get items for each order
    const ordersWithItems = await Promise.all(
      recentOrders.map(async (order) => {
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id))
          .orderBy(orderItems.positionNumber);
        
        return {
          ...order,
          items
        };
      })
    );
    
    res.json(ordersWithItems);
    
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({
      error: 'Fehler beim Laden der letzten Bestellungen',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

// Copy order functionality
router.post('/:id/copy', async (req, res) => {
  try {
    const sourceOrderId = parseInt(req.params.id);
    const { warehouseId, adjustQuantities = false } = req.body;
    
    if (isNaN(sourceOrderId)) {
      return res.status(400).json({ error: 'Ungültige Bestell-ID' });
    }
    
    // Get source order
    const [sourceOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, sourceOrderId))
      .limit(1);
    
    if (!sourceOrder) {
      return res.status(404).json({ error: 'Quell-Bestellung nicht gefunden' });
    }
    
    // Get source order items
    const sourceItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, sourceOrderId));
    
    // Generate new order number
    const currentDate = new Date();
    const dateStr = currentDate.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = Date.now().toString().slice(-4);
    const orderNumber = `ORD-${dateStr}-${timeStr}`;
    
    // Create new order
    const [newOrder] = await db
      .insert(orders)
      .values({
        orderNumber,
        supplierId: sourceOrder.supplierId,
        supplierName: sourceOrder.supplierName,
        locationId: warehouseId || sourceOrder.locationId,
        locationName: sourceOrder.locationName,
        deliveryLocation: sourceOrder.deliveryLocation,
        status: 'draft',
        orderDate: new Date(),
        totalAmount: 0, // Will be calculated
        currency: 'EUR',
        notes: `Kopiert von Bestellung ${sourceOrder.orderNumber}`,
        orderMode: 'copy',
        showPricesInEmail: sourceOrder.showPricesInEmail,
        forecastPeriodDays: sourceOrder.forecastPeriodDays,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    // Copy items with potential quantity adjustments
    let totalAmount = 0;
    const newItemsData = sourceItems.map((item, index) => {
      // If adjustQuantities is true, you could implement logic here to adjust based on current stock levels
      const quantity = adjustQuantities ? 
        Math.max(1, item.quantity) : // Placeholder for adjustment logic
        item.quantity;
      
      const itemTotal = quantity * item.unitPrice;
      totalAmount += itemTotal;
      
      return {
        orderId: newOrder.id,
        productId: item.productId,
        productName: item.productName,
        quantity: quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: itemTotal,
        vatRate: item.vatRate,
        vatAmount: itemTotal * ((item.vatRate || 19) / 100),
        positionNumber: index + 1,
        status: 'pending',
        notes: `Kopiert von Position ${item.positionNumber}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    // Insert new items
    const newItems = await db
      .insert(orderItems)
      .values(newItemsData)
      .returning();
    
    // Update order total
    const vatAmount = totalAmount * 0.19;
    const totalWithVat = totalAmount + vatAmount;
    
    await db
      .update(orders)
      .set({
        totalAmount: totalWithVat,
        vatAmount: vatAmount
      })
      .where(eq(orders.id, newOrder.id));
    
    res.status(201).json({
      message: 'Bestellung erfolgreich kopiert',
      order: {
        ...newOrder,
        totalAmount: totalWithVat,
        vatAmount: vatAmount,
        items: newItems
      }
    });
    
  } catch (error) {
    console.error('Error copying order:', error);
    res.status(500).json({
      error: 'Fehler beim Kopieren der Bestellung',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;