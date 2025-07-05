import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { 
  supplierDiscountConditions, 
  insertSupplierDiscountConditionSchema,
  type SupplierDiscountCondition 
} from "@shared/schema";

const router = Router();

// GET /api/supplier-discounts/:supplierId - Alle Rabattbedingungen für einen Lieferanten
router.get("/:supplierId", async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({ error: "Ungültige Lieferanten-ID" });
    }

    const discounts = await db
      .select()
      .from(supplierDiscountConditions)
      .where(eq(supplierDiscountConditions.supplierId, supplierId))
      .orderBy(desc(supplierDiscountConditions.priority), desc(supplierDiscountConditions.createdAt));

    res.json(discounts);
  } catch (error) {
    console.error("Fehler beim Abrufen der Lieferanten-Rabatte:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// GET /api/supplier-discounts/discount/:id - Einzelne Rabattbedingung
router.get("/discount/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Ungültige Rabatt-ID" });
    }

    const discount = await db
      .select()
      .from(supplierDiscountConditions)
      .where(eq(supplierDiscountConditions.id, id))
      .limit(1);

    if (discount.length === 0) {
      return res.status(404).json({ error: "Rabattbedingung nicht gefunden" });
    }

    res.json(discount[0]);
  } catch (error) {
    console.error("Fehler beim Abrufen der Rabattbedingung:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /api/supplier-discounts - Neue Rabattbedingung erstellen
router.post("/", async (req, res) => {
  try {
    const validatedData = insertSupplierDiscountConditionSchema.parse(req.body);
    
    const newDiscount = await db
      .insert(supplierDiscountConditions)
      .values(validatedData)
      .returning();

    res.status(201).json(newDiscount[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validierungsfehler", 
        details: error.errors 
      });
    }
    
    console.error("Fehler beim Erstellen der Rabattbedingung:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// PUT /api/supplier-discounts/:id - Rabattbedingung aktualisieren
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Ungültige Rabatt-ID" });
    }

    const validatedData = insertSupplierDiscountConditionSchema.parse(req.body);
    
    const updatedDiscount = await db
      .update(supplierDiscountConditions)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(supplierDiscountConditions.id, id))
      .returning();

    if (updatedDiscount.length === 0) {
      return res.status(404).json({ error: "Rabattbedingung nicht gefunden" });
    }

    res.json(updatedDiscount[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validierungsfehler", 
        details: error.errors 
      });
    }
    
    console.error("Fehler beim Aktualisieren der Rabattbedingung:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// DELETE /api/supplier-discounts/:id - Rabattbedingung löschen
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Ungültige Rabatt-ID" });
    }

    const deletedDiscount = await db
      .delete(supplierDiscountConditions)
      .where(eq(supplierDiscountConditions.id, id))
      .returning();

    if (deletedDiscount.length === 0) {
      return res.status(404).json({ error: "Rabattbedingung nicht gefunden" });
    }

    res.json({ message: "Rabattbedingung erfolgreich gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen der Rabattbedingung:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /api/supplier-discounts/calculate - Rabatt für Bestellung berechnen
router.post("/calculate", async (req, res) => {
  try {
    const calculateSchema = z.object({
      supplierId: z.number(),
      orderValue: z.number().min(0),
      orderQuantity: z.number().min(0),
      paymentTermsDays: z.number().optional(),
      productCategories: z.array(z.string()).optional(),
      productIds: z.array(z.number()).optional(),
    });

    const { 
      supplierId, 
      orderValue, 
      orderQuantity, 
      paymentTermsDays,
      productCategories = [],
      productIds = []
    } = calculateSchema.parse(req.body);

    // Alle aktiven Rabattbedingungen für den Lieferanten abrufen
    const discounts = await db
      .select()
      .from(supplierDiscountConditions)
      .where(
        and(
          eq(supplierDiscountConditions.supplierId, supplierId),
          eq(supplierDiscountConditions.isActive, true)
        )
      )
      .orderBy(desc(supplierDiscountConditions.priority));

    const applicableDiscounts: Array<SupplierDiscountCondition & { calculatedDiscount: number }> = [];
    let totalDiscount = 0;

    for (const discount of discounts) {
      let isApplicable = false;
      let calculatedDiscount = 0;

      // Prüfung der verschiedenen Rabatttypen
      switch (discount.discountType) {
        case 'volume_discount':
          if (discount.thresholdQuantity && orderQuantity >= discount.thresholdQuantity) {
            isApplicable = true;
            calculatedDiscount = discount.discountPercentage 
              ? (orderValue * discount.discountPercentage / 100)
              : (discount.discountAmount || 0);
          }
          break;

        case 'order_value':
          if (discount.thresholdAmount && orderValue >= discount.thresholdAmount) {
            isApplicable = true;
            calculatedDiscount = discount.discountPercentage 
              ? (orderValue * discount.discountPercentage / 100)
              : (discount.discountAmount || 0);
          }
          break;

        case 'cash_discount':
          if (paymentTermsDays && discount.paymentTermsDays && paymentTermsDays <= discount.paymentTermsDays) {
            isApplicable = true;
            calculatedDiscount = discount.skontoPercentage 
              ? (orderValue * discount.skontoPercentage / 100)
              : (discount.discountAmount || 0);
          }
          break;

        case 'quantity_scale':
          // Staffelpreise: Prüfung ob Menge im Bereich liegt
          if (discount.thresholdQuantity && orderQuantity >= discount.thresholdQuantity) {
            if (!discount.maxQuantity || orderQuantity <= discount.maxQuantity) {
              isApplicable = true;
              calculatedDiscount = discount.discountPercentage 
                ? (orderValue * discount.discountPercentage / 100)
                : (discount.discountAmount || 0);
            }
          }
          break;
      }

      // Prüfung der Mindestbestellmenge
      if (isApplicable && discount.minimumOrderQuantity && orderQuantity < discount.minimumOrderQuantity) {
        isApplicable = false;
      }

      // Prüfung der Produktkategorien (wenn angegeben)
      if (isApplicable && discount.applicableProductCategories) {
        const applicableCategories = JSON.parse(discount.applicableProductCategories);
        if (applicableCategories.length > 0) {
          const hasMatchingCategory = productCategories.some(cat => 
            applicableCategories.includes(cat)
          );
          if (!hasMatchingCategory) {
            isApplicable = false;
          }
        }
      }

      // Prüfung der ausgeschlossenen Produkte
      if (isApplicable && discount.excludedProductIds) {
        const excludedIds = JSON.parse(discount.excludedProductIds);
        if (excludedIds.length > 0) {
          const hasExcludedProduct = productIds.some(id => 
            excludedIds.includes(id)
          );
          if (hasExcludedProduct) {
            isApplicable = false;
          }
        }
      }

      if (isApplicable) {
        applicableDiscounts.push({
          ...discount,
          calculatedDiscount
        });

        // Rabatte kombinieren oder nur höchsten nehmen
        if (discount.canCombineWithOtherDiscounts) {
          totalDiscount += calculatedDiscount;
        } else {
          // Wenn nicht kombinierbar, nur den höchsten Rabatt nehmen
          totalDiscount = Math.max(totalDiscount, calculatedDiscount);
        }
      }
    }

    const finalOrderValue = Math.max(0, orderValue - totalDiscount);
    const discountPercentage = orderValue > 0 ? (totalDiscount / orderValue) * 100 : 0;

    res.json({
      originalOrderValue: orderValue,
      totalDiscount,
      finalOrderValue,
      discountPercentage: Math.round(discountPercentage * 100) / 100,
      applicableDiscounts: applicableDiscounts.map(d => ({
        id: d.id,
        discountType: d.discountType,
        description: d.description,
        calculatedDiscount: d.calculatedDiscount,
        discountPercentage: d.discountPercentage,
        canCombine: d.canCombineWithOtherDiscounts
      }))
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validierungsfehler", 
        details: error.errors 
      });
    }
    
    console.error("Fehler beim Berechnen der Rabatte:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

export default router;