import { db } from "../db";
import { orders, orderItems, type Order, type InsertOrder, type OrderItem, type InsertOrderItem } from "@shared/schema";
import { eq, and, like, ilike, or, desc, isNull } from "drizzle-orm";

// Order storage implementation
export async function getOrders(): Promise<Order[]> {
  return await db.select().from(orders).orderBy(desc(orders.orderDate));
}

export async function getOrder(id: number): Promise<Order | undefined> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return order;
}

export async function createOrder(data: Omit<InsertOrder, "id">): Promise<Order> {
  const [newOrder] = await db.insert(orders).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newOrder;
}

export async function updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined> {
  const [updatedOrder] = await db
    .update(orders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();
  return updatedOrder;
}

export async function deleteOrder(id: number): Promise<boolean> {
  const result = await db.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
  return result.length > 0;
}

// Order items storage implementation
export async function getOrderItems(orderId?: number): Promise<OrderItem[]> {
  if (orderId) {
    return await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.positionNumber);
  } else {
    return await db.select().from(orderItems);
  }
}

export async function getOrderItem(id: number): Promise<OrderItem | undefined> {
  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
  return item;
}

export async function createOrderItem(data: Omit<InsertOrderItem, "id">): Promise<OrderItem> {
  const [newItem] = await db.insert(orderItems).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newItem;
}

export async function updateOrderItem(id: number, data: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
  const [updatedItem] = await db
    .update(orderItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orderItems.id, id))
    .returning();
  return updatedItem;
}

export async function deleteOrderItem(id: number): Promise<boolean> {
  const result = await db.delete(orderItems).where(eq(orderItems.id, id)).returning({ id: orderItems.id });
  return result.length > 0;
}

// Get all open orders for dashboard
export async function getOpenOrders(limit: number = 10): Promise<Order[]> {
  return await db
    .select()
    .from(orders)
    .where(
      or(
        eq(orders.status, "open"),
        eq(orders.status, "ordered"),
        eq(orders.status, "partial")
      )
    )
    .orderBy(desc(orders.orderDate))
    .limit(limit);
}

// Get recently completed orders for dashboard
export async function getRecentlyCompletedOrders(limit: number = 5): Promise<Order[]> {
  return await db
    .select()
    .from(orders)
    .where(eq(orders.status, "completed"))
    .orderBy(desc(orders.actualDeliveryDate))
    .limit(limit);
}

// Get orders by supplier for dashboard and supplier details
export async function getOrdersBySupplier(supplierId: number): Promise<Order[]> {
  return await db
    .select()
    .from(orders)
    .where(eq(orders.supplierId, supplierId))
    .orderBy(desc(orders.orderDate));
}

// Get order statistics
export async function getOrderStatistics(): Promise<{
  total: number;
  open: number;
  ordered: number;
  partial: number;
  completed: number;
  cancelled: number;
}> {
  // Total orders
  const [totalResult] = await db
    .select({ count: db.fn.count() })
    .from(orders);
  
  // Open orders
  const [openResult] = await db
    .select({ count: db.fn.count() })
    .from(orders)
    .where(eq(orders.status, "open"));
  
  // Ordered orders
  const [orderedResult] = await db
    .select({ count: db.fn.count() })
    .from(orders)
    .where(eq(orders.status, "ordered"));
  
  // Partial orders
  const [partialResult] = await db
    .select({ count: db.fn.count() })
    .from(orders)
    .where(eq(orders.status, "partial"));
  
  // Completed orders
  const [completedResult] = await db
    .select({ count: db.fn.count() })
    .from(orders)
    .where(eq(orders.status, "completed"));
  
  // Cancelled orders
  const [cancelledResult] = await db
    .select({ count: db.fn.count() })
    .from(orders)
    .where(eq(orders.status, "cancelled"));
  
  return {
    total: Number(totalResult.count),
    open: Number(openResult.count),
    ordered: Number(orderedResult.count),
    partial: Number(partialResult.count),
    completed: Number(completedResult.count),
    cancelled: Number(cancelledResult.count)
  };
}