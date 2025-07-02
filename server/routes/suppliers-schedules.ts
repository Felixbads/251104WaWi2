import { Request, Response } from 'express';
import { db } from '../db';
import { suppliers } from '../../shared/schema';
import { sql } from 'drizzle-orm';

export async function getSuppliersSchedules(req: Request, res: Response) {
  try {
    const scheduledSuppliers = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        orderFrequency: suppliers.order_frequency,
        orderWeekday: suppliers.order_weekday,
        deliveryFrequency: suppliers.delivery_frequency,
        deliveryWeekday: suppliers.delivery_weekday,
        deliveryMethod: suppliers.delivery_method,
        contactPerson: suppliers.contact_person,
        phone: suppliers.phone,
        email: suppliers.email,
        // Purchase conditions
        paymentTerms: suppliers.payment_terms,
        deliveryTerms: suppliers.delivery_terms,
        showPricesInOrders: suppliers.show_prices_in_orders,
        preferredDeliveryMethod: suppliers.preferred_delivery_method,
        // Additional scheduling preferences
        orderPreferences: suppliers.order_preferences,
        deliveryPreferences: suppliers.delivery_preferences,
        // Basic supplier info
        description: suppliers.description,
        address: suppliers.address,
        status: suppliers.status,
      })
      .from(suppliers)
      .where(sql`${suppliers.status} = 'active'`)
      .orderBy(suppliers.name);

    res.json(scheduledSuppliers);
  } catch (error) {
    console.error('Error fetching suppliers schedules:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Fehler beim Laden der Lieferanten-Zeitpläne' 
    });
  }
}