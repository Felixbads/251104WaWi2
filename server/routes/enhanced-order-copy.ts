import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Enhanced Order Copy API - Provides full order data for copying with editable fields
router.get('/orders/:id/copy-data', async (req, res) => {
  try {
    const sourceOrderId = parseInt(req.params.id);
    
    if (isNaN(sourceOrderId)) {
      return res.status(400).json({ 
        error: 'Ungültige Bestellungs-ID',
        success: false 
      });
    }
    
    console.log(`Loading order ${sourceOrderId} for copying...`);
    
    // Get source order with full details
    const orderQuery = `
      SELECT 
        o.*,
        s.name as supplier_name,
        s.email as supplier_email,
        s.delivery_terms,
        s.minimum_order_value,
        w.name as warehouse_name,
        w.address as warehouse_address,
        w.city as warehouse_city
      FROM orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      LEFT JOIN warehouses w ON o.warehouse_id = w.id
      WHERE o.id = $1
    `;
    
    const orderResult = await pool.query(orderQuery, [sourceOrderId]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Quell-Bestellung nicht gefunden',
        success: false 
      });
    }
    
    const sourceOrder = orderResult.rows[0];
    
    // Get order items with product details
    const itemsQuery = `
      SELECT 
        oi.*,
        p.product_name,
        p.sku,
        p.category,
        p.package_size,
        p.units,
        p.vat_rate,
        p.price as current_product_price,
        pc.unit_price as purchase_price,
        pc.tax_rate as purchase_tax_rate
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN purchase_conditions pc ON p.id = pc.product_id AND pc.supplier_id = $1
      WHERE oi.order_id = $2
      ORDER BY oi.id
    `;
    
    const itemsResult = await pool.query(itemsQuery, [sourceOrder.supplier_id, sourceOrderId]);
    
    // Get all available warehouses for selection
    const warehousesQuery = `
      SELECT id, name, address, city, is_active
      FROM warehouses 
      WHERE is_active = true
      ORDER BY name
    `;
    
    const warehousesResult = await pool.query(warehousesQuery);
    
    // Prepare editable order data
    const copyData = {
      sourceOrder: {
        id: sourceOrder.id,
        orderNumber: sourceOrder.order_number,
        supplierName: sourceOrder.supplier_name || 'Unbekannt',
        warehouseName: sourceOrder.warehouse_name || 'Unbekannt',
        status: sourceOrder.status,
        orderDate: sourceOrder.order_date || sourceOrder.created_at,
        expectedDeliveryDate: sourceOrder.expected_delivery_date,
        notes: sourceOrder.notes,
        totalAmount: sourceOrder.total_amount
      },
      editableFields: {
        // Pre-fill with source data but allow editing
        warehouseId: sourceOrder.warehouse_id,
        supplierId: sourceOrder.supplier_id,
        expectedDeliveryDate: null, // Force user to set new delivery date
        notes: `Kopie von ${sourceOrder.order_number}`,
        priority: 'normal'
      },
      items: itemsResult.rows.map(item => ({
        productId: item.product_id,
        productName: item.product_name || 'Unbekanntes Produkt',
        sku: item.sku || '',
        category: item.category || '',
        originalQuantity: item.quantity,
        quantity: item.quantity, // Editable
        unitPrice: item.unit_price || item.purchase_price || 0,
        unit: item.unit || 'stk',
        totalPrice: (item.quantity || 0) * (item.unit_price || item.purchase_price || 0),
        packageSize: item.package_size || 1,
        vatRate: item.vat_rate || item.purchase_tax_rate || 19,
        status: 'pending'
      })),
      availableWarehouses: warehousesResult.rows.map(warehouse => ({
        id: warehouse.id,
        name: warehouse.name,
        address: warehouse.address,
        city: warehouse.city,
        fullName: `${warehouse.name}${warehouse.city ? ` (${warehouse.city})` : ''}`
      })),
      supplierDetails: {
        id: sourceOrder.supplier_id,
        name: sourceOrder.supplier_name,
        email: sourceOrder.supplier_email,
        deliveryTerms: sourceOrder.delivery_terms,
        minimumOrderValue: sourceOrder.minimum_order_value
      }
    };
    
    console.log(`Order copy data prepared for order ${sourceOrderId}`);
    
    res.json({
      success: true,
      data: copyData
    });
    
  } catch (error) {
    console.error('Error preparing order copy data:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Bestelldaten zum Kopieren',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false 
    });
  }
});

// Create new order from copy data
router.post('/orders/create-from-copy', async (req, res) => {
  try {
    const {
      sourceOrderId,
      warehouseId,
      supplierId,
      expectedDeliveryDate,
      notes,
      priority = 'normal',
      items
    } = req.body;
    
    // Validation
    if (!warehouseId || !supplierId) {
      return res.status(400).json({ 
        error: 'Lager und Lieferant müssen angegeben werden',
        success: false 
      });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'Mindestens ein Artikel muss bestellt werden',
        success: false 
      });
    }
    
    if (!expectedDeliveryDate) {
      return res.status(400).json({ 
        error: 'Lieferdatum muss festgelegt werden',
        success: false 
      });
    }
    
    // Generate new order number
    const today = new Date();
    const dateString = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    const sequenceResult = await pool.query(
      `SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1`,
      [`ORD-${dateString}-%`]
    );
    
    let sequenceNumber = 1;
    if (sequenceResult.rows.length > 0) {
      const match = sequenceResult.rows[0].order_number.match(/ORD-\d{8}-(\d+)/);
      if (match) {
        sequenceNumber = parseInt(match[1]) + 1;
      }
    }
    
    const newOrderNumber = `ORD-${dateString}-${sequenceNumber.toString().padStart(3, '0')}`;
    
    // Get supplier and warehouse names
    const supplierResult = await pool.query('SELECT name FROM suppliers WHERE id = $1', [supplierId]);
    const warehouseResult = await pool.query('SELECT name FROM warehouses WHERE id = $1', [warehouseId]);
    
    const supplierName = supplierResult.rows[0]?.name || 'Unbekannt';
    const warehouseName = warehouseResult.rows[0]?.name || 'Unbekannt';
    
    // Create new order
    const orderResult = await pool.query(`
      INSERT INTO orders (
        order_number, warehouse_id, supplier_id, status, 
        expected_delivery_date, priority, notes, 
        supplier_name, location_name,
        created_at, updated_at
      ) VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `, [
      newOrderNumber, warehouseId, supplierId, expectedDeliveryDate, 
      priority, notes, supplierName, warehouseName
    ]);
    
    const newOrder = orderResult.rows[0];
    let totalAmount = 0;
    
    // Create order items
    for (const item of items) {
      if (!item.productId || item.quantity <= 0) {
        continue;
      }
      
      const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
      totalAmount += itemTotal;
      
      await pool.query(`
        INSERT INTO order_items (
          order_id, product_id, product_name, quantity, unit, 
          unit_price, total_price, vat_rate, status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW())
      `, [
        newOrder.id,
        item.productId,
        item.productName,
        item.quantity,
        item.unit || 'stk',
        item.unitPrice,
        itemTotal,
        item.vatRate || 19
      ]);
    }
    
    // Update order total
    await pool.query(
      'UPDATE orders SET total_amount = $1 WHERE id = $2',
      [totalAmount, newOrder.id]
    );
    
    // Log copy action
    if (sourceOrderId) {
      await pool.query(`
        INSERT INTO order_copy_log (
          source_order_id, new_order_id, copied_at, 
          items_count, total_amount
        ) VALUES ($1, $2, NOW(), $3, $4)
      `, [sourceOrderId, newOrder.id, items.length, totalAmount]);
    }
    
    console.log(`New order ${newOrderNumber} created from copy with ${items.length} items`);
    
    res.json({
      success: true,
      order: {
        ...newOrder,
        supplierName,
        warehouseName,
        totalAmount
      },
      message: `Bestellung ${newOrderNumber} erfolgreich erstellt`
    });
    
  } catch (error) {
    console.error('Error creating order from copy:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen der Bestellung',
      message: error instanceof Error ? error.message : 'Unbekannter Fehler',
      success: false 
    });
  }
});

export default router;