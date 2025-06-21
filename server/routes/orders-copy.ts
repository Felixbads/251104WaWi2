import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orders, orderItems, suppliers, locations } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/orders/:id/copy-data
 * Get order data formatted for copying
 */
router.get('/:id/copy-data', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID',
        code: 'INVALID_ORDER_ID'
      });
    }

    // Get order with supplier and location details
    const orderResult = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        supplierId: orders.supplierId,
        supplierName: orders.supplierName,
        locationId: orders.locationId,
        locationName: orders.locationName,
        priority: orders.priority,
        notes: orders.notes,
        deliveryType: orders.deliveryType,
        deliveryAddress: orders.deliveryAddress,
        pickupLocation: orders.pickupLocation,
        // Supplier details
        supplierContactPerson: suppliers.contactPerson,
        supplierPhone: suppliers.phone,
        supplierEmail: suppliers.email,
        supplierPaymentTerms: suppliers.paymentTerms,
        supplierDeliveryTerms: suppliers.deliveryTerms,
        supplierMinimumOrderValue: suppliers.minimumOrderValue,
        // Location details
        locationAddress: locations.address,
        locationCity: locations.city,
        locationPostalCode: locations.postalCode,
      })
      .from(orders)
      .leftJoin(suppliers, eq(orders.supplierId, suppliers.id))
      .leftJoin(locations, eq(orders.locationId, locations.id))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (orderResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const order = orderResult[0];

    // Get order items
    const items = await db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productName: orderItems.productName,
        sku: orderItems.sku,
        supplierSku: orderItems.supplierSku,
        quantity: orderItems.quantity,
        unit: orderItems.unit,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        vatRate: orderItems.vatRate,
        notes: orderItems.notes,
        positionNumber: orderItems.positionNumber,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.positionNumber);

    // Format data for copying
    const copyData = {
      sourceOrder: {
        id: order.id,
        orderNumber: order.orderNumber,
        supplierInfo: {
          id: order.supplierId,
          name: order.supplierName,
          contactPerson: order.supplierContactPerson,
          phone: order.supplierPhone,
          email: order.supplierEmail,
          paymentTerms: order.supplierPaymentTerms,
          deliveryTerms: order.supplierDeliveryTerms,
          minimumOrderValue: order.supplierMinimumOrderValue,
        },
        locationInfo: {
          id: order.locationId,
          name: order.locationName,
          address: order.locationAddress,
          city: order.locationCity,
          postalCode: order.locationPostalCode,
        },
        orderSettings: {
          priority: order.priority,
          notes: order.notes,
          deliveryType: order.deliveryType,
          deliveryAddress: order.deliveryAddress,
          pickupLocation: order.pickupLocation,
        }
      },
      items: items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        supplierSku: item.supplierSku,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        notes: item.notes,
        // Reset fields that shouldn't be copied
        quantityDelivered: 0,
        status: 'pending',
      })),
      copyInstructions: {
        newOrderDate: new Date().toISOString(),
        resetFields: ['orderNumber', 'status', 'orderDate', 'actualDeliveryDate', 'paymentDate'],
        updateFields: ['expectedDeliveryDate', 'priority', 'notes'],
        preserveFields: ['supplierId', 'locationId', 'deliveryType', 'deliveryAddress', 'pickupLocation']
      }
    };

    res.json({
      success: true,
      data: copyData,
      meta: {
        sourceOrderId: orderId,
        itemCount: items.length,
        totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
        canCopy: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[ORDERS-COPY] Error fetching copy data for order ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order copy data',
      details: error instanceof Error ? error.message : String(error),
      code: 'ORDER_COPY_FETCH_ERROR'
    });
  }
});

/**
 * POST /api/orders/copy
 * Create a new order based on an existing order
 */
router.post('/copy', async (req: Request, res: Response) => {
  try {
    const { sourceOrderId, modifications = {} } = req.body;
    
    if (!sourceOrderId || isNaN(parseInt(sourceOrderId))) {
      return res.status(400).json({
        success: false,
        error: 'Valid source order ID is required',
        code: 'INVALID_SOURCE_ORDER_ID'
      });
    }

    // Get copy data for source order
    const copyDataResponse = await fetch(`${req.protocol}://${req.get('host')}/api/orders/${sourceOrderId}/copy-data`);
    
    if (!copyDataResponse.ok) {
      return res.status(404).json({
        success: false,
        error: 'Source order not found or cannot be copied',
        code: 'SOURCE_ORDER_NOT_FOUND'
      });
    }

    const copyDataResult = await copyDataResponse.json();
    const copyData = copyDataResult.data;

    // Generate new order number
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(':').join('').substring(0, 6);
    const newOrderNumber = `ORD-${dateStr}-${timeStr}-COPY`;

    // Create new order
    const newOrderData = {
      orderNumber: newOrderNumber,
      supplierId: modifications.supplierId || copyData.sourceOrder.supplierInfo.id,
      supplierName: modifications.supplierName || copyData.sourceOrder.supplierInfo.name,
      locationId: modifications.locationId || copyData.sourceOrder.locationInfo.id,
      locationName: modifications.locationName || copyData.sourceOrder.locationInfo.name,
      status: 'open',
      orderDate: new Date(),
      expectedDeliveryDate: modifications.expectedDeliveryDate ? new Date(modifications.expectedDeliveryDate) : null,
      priority: modifications.priority || copyData.sourceOrder.orderSettings.priority || 'normal',
      notes: modifications.notes || copyData.sourceOrder.orderSettings.notes || `Kopiert von Bestellung ${copyData.sourceOrder.orderNumber}`,
      deliveryType: modifications.deliveryType || copyData.sourceOrder.orderSettings.deliveryType || 'delivery',
      deliveryAddress: modifications.deliveryAddress || copyData.sourceOrder.orderSettings.deliveryAddress,
      pickupLocation: modifications.pickupLocation || copyData.sourceOrder.orderSettings.pickupLocation,
      currency: 'EUR',
      paymentStatus: 'pending',
      isAutoGenerated: false,
    };

    // Insert new order
    const newOrderResult = await db
      .insert(orders)
      .values(newOrderData)
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    const newOrderId = newOrderResult[0].id;

    // Copy order items
    const newOrderItems = copyData.items.map((item: any, index: number) => ({
      orderId: newOrderId,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      supplierSku: item.supplierSku,
      quantity: modifications.items?.[item.productId]?.quantity || item.quantity,
      unit: item.unit || 'stk',
      unitPrice: item.unitPrice,
      totalPrice: (modifications.items?.[item.productId]?.quantity || item.quantity) * item.unitPrice,
      vatRate: item.vatRate || 19,
      vatAmount: ((modifications.items?.[item.productId]?.quantity || item.quantity) * item.unitPrice) * (item.vatRate || 19) / 100,
      status: 'pending',
      positionNumber: index + 1,
      notes: item.notes,
    }));

    if (newOrderItems.length > 0) {
      await db.insert(orderItems).values(newOrderItems);
    }

    // Calculate totals
    const subtotal = newOrderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const vatTotal = newOrderItems.reduce((sum, item) => sum + item.vatAmount, 0);
    const total = subtotal + vatTotal;

    // Update order with calculated totals
    await db
      .update(orders)
      .set({
        totalAmount: total,
        vatAmount: vatTotal,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, newOrderId));

    res.status(201).json({
      success: true,
      data: {
        id: newOrderId,
        orderNumber: newOrderResult[0].orderNumber,
        sourceOrderId: sourceOrderId,
        sourceOrderNumber: copyData.sourceOrder.orderNumber,
        itemCount: newOrderItems.length,
        totalAmount: total,
        status: 'open'
      },
      message: `Order copied successfully from ${copyData.sourceOrder.orderNumber}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[ORDERS-COPY] Error copying order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to copy order',
      details: error instanceof Error ? error.message : String(error),
      code: 'ORDER_COPY_ERROR'
    });
  }
});

export default router;