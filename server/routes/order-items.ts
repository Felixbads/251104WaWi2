import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orderItems, orders, products } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

// Add new product to existing order
router.post('/orders/:orderId/add-product', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { productId, quantity } = req.body;

    if (!orderId || !productId || !quantity) {
      return res.status(400).json({ 
        error: 'Order ID, Product ID, and quantity are required' 
      });
    }

    // Verify order exists
    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, parseInt(orderId)))
      .limit(1);

    if (order.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get product details
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, parseInt(productId)))
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = product[0];

    // Always add as new item to order (allow multiple entries of same product)
    const newItem = await db
      .insert(orderItems)
      .values({
        orderId: parseInt(orderId),
        productId: parseInt(productId),
        productName: productData.productName,
        quantity: parseInt(quantity),
        unit: 'Stk.',
        unitPrice: productData.price || 0,
        totalPrice: parseInt(quantity) * (productData.price || 0),
        vatRate: 19,
        vatAmount: (parseInt(quantity) * (productData.price || 0)) * 19 / 100,
        netAmount: (parseInt(quantity) * (productData.price || 0)) - ((parseInt(quantity) * (productData.price || 0)) * 19 / 100),
        grossAmount: parseInt(quantity) * (productData.price || 0),
        status: 'pending'
      })
      .returning();

    res.json({
      success: true,
      message: 'Product added to order',
      item: newItem[0]
    });
  } catch (error) {
    console.error('Error adding product to order:', error);
    res.status(500).json({ error: 'Failed to add product to order' });
  }
});

// Remove product from order
router.delete('/orders/:orderId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;

    if (!orderId || !itemId) {
      return res.status(400).json({ 
        error: 'Order ID and Item ID are required' 
      });
    }

    const deletedItem = await db
      .delete(orderItems)
      .where(and(
        eq(orderItems.id, parseInt(itemId)),
        eq(orderItems.orderId, parseInt(orderId))
      ))
      .returning();

    if (deletedItem.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    res.json({
      success: true,
      message: 'Product removed from order'
    });
  } catch (error) {
    console.error('Error removing product from order:', error);
    res.status(500).json({ error: 'Failed to remove product from order' });
  }
});

export default router;