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
        orderFrequency: suppliers.orderFrequency,
        orderWeekday: suppliers.orderWeekday,
        deliveryFrequency: suppliers.deliveryFrequency,
        deliveryWeekday: suppliers.deliveryWeekday,
        deliveryMethod: suppliers.deliveryMethod,
        contactPerson: suppliers.contactPerson,
        phone: suppliers.phone,
        email: suppliers.email,
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