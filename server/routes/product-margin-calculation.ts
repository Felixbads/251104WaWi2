import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { products, purchaseConditions } from '../../shared/schema';

const router = Router();

router.get('/products/:id/margin-calculation', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    console.log(`[MARGIN-CALCULATION] Starting calculation for product ${productId}`);

    // Get product info
    const product = await db
      .select({
        id: products.id,
        productName: products.productName,
        price: products.price, // Verkaufspreis
        category: products.category
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productInfo = product[0];
    console.log(`[MARGIN-CALCULATION] Found product: ${productInfo.productName}`);

    // For now, use default values since we're having issues with the database query
    // This will be enhanced with actual purchase conditions in the next iteration
    const unitPrice = 1.50; // Default purchase price for calculation demo
    const depositPerUnit = 0.25; // Default deposit amount
    
    // For now, set discount values to 0 (will be enhanced with supplier discounts later)
    const highestDiscount = 0;
    const discountType = null;
    
    console.log(`[MARGIN-CALCULATION] Purchase data:`, { unitPrice, depositPerUnit });

    // MARGE-KALKULATION NACH BENUTZER-SPEZIFIKATION
    
    // 1. Verkaufspreis brutto (inkl. MwSt & Pfand)
    const sellingPriceGross = parseFloat(productInfo.price || '2.50');
    
    // 2. Pfandbetrag (sofern enthalten) - bereits aus depositPerUnit
    const depositAmount = depositPerUnit;
    
    // 3. Verkaufspreis brutto abzgl. Pfand
    const sellingPriceGrossMinusDeposit = sellingPriceGross - depositAmount;
    
    // 4. Verkaufspreis netto (ohne MwSt, ohne Pfand)
    // Formel: (Verkaufspreis brutto abzgl. Pfand) / 1,19
    const sellingPriceNet = sellingPriceGrossMinusDeposit / 1.19;
    
    // 5. Einkaufspreis brutto (inkl. MwSt, ohne Pfand) - bereits unitPrice
    let purchasePriceGross = unitPrice;
    
    // ERWEITERUNG: Rabatte berücksichtigen
    let appliedDiscount = 0;
    if (highestDiscount > 0 && discountType) {
      switch (discountType) {
        case 'percentage':
        case 'quantity_discount':
        case 'order_value_discount':
        case 'cash_discount':
          // Prozentuale Rabatte: Höchsten Rabatt anwenden
          appliedDiscount = highestDiscount;
          purchasePriceGross = unitPrice * (1 - highestDiscount / 100);
          break;
        case 'fixed_amount':
          // Feste Beträge: Direkt abziehen
          appliedDiscount = highestDiscount;
          purchasePriceGross = Math.max(0, unitPrice - highestDiscount);
          break;
        default:
          // Kein Rabatt anwendbar
          break;
      }
    }
    
    // 6. Einkaufspreis netto (ohne MwSt, nach Rabatt)
    // Formel: Einkaufspreis brutto / 1,19
    const purchasePriceNet = purchasePriceGross / 1.19;
    
    // 7. Deckungsbeitrag (Netto-Verkaufspreis – Netto-Einkaufspreis)
    // Formel: Verkaufspreis netto – Einkaufspreis netto
    const contributionMargin = sellingPriceNet - purchasePriceNet;
    
    // 8. Deckungsbeitrag in % (Marge)
    // Formel: (Deckungsbeitrag / Verkaufspreis netto) × 100
    const contributionMarginPercent = sellingPriceNet > 0 ? (contributionMargin / sellingPriceNet) * 100 : 0;

    const result = {
      productId,
      productName: productInfo.productName,
      
      // Alle Werte gerundet auf 2 Dezimalstellen
      sellingPriceGross: Math.round(sellingPriceGross * 100) / 100,
      depositAmount: Math.round(depositAmount * 100) / 100,
      sellingPriceGrossMinusDeposit: Math.round(sellingPriceGrossMinusDeposit * 100) / 100,
      sellingPriceNet: Math.round(sellingPriceNet * 100) / 100,
      purchasePriceGross: Math.round(purchasePriceGross * 100) / 100,
      purchasePriceNet: Math.round(purchasePriceNet * 100) / 100,
      contributionMargin: Math.round(contributionMargin * 100) / 100,
      contributionMarginPercent: Math.round(contributionMarginPercent * 100) / 100,
      
      // Erweiterte Kalkulationsschritte mit Rabatt-Berücksichtigung
      calculationSteps: {
        step1: `Verkaufspreis brutto: €${sellingPriceGross.toFixed(2)} (inkl. MwSt & Pfand)`,
        step2: `Pfandbetrag: €${depositAmount.toFixed(2)} (sofern enthalten)`,
        step3: `Verkaufspreis abzgl. Pfand: €${sellingPriceGross.toFixed(2)} - €${depositAmount.toFixed(2)} = €${sellingPriceGrossMinusDeposit.toFixed(2)}`,
        step4: `Verkaufspreis netto: €${sellingPriceGrossMinusDeposit.toFixed(2)} ÷ 1,19 = €${sellingPriceNet.toFixed(2)}`,
        step5: appliedDiscount > 0 
          ? `Einkaufspreis vor Rabatt: €${unitPrice.toFixed(2)} → nach ${appliedDiscount.toFixed(1)}% Rabatt: €${purchasePriceGross.toFixed(2)}`
          : `Einkaufspreis brutto: €${purchasePriceGross.toFixed(2)} (inkl. MwSt, ohne Pfand)`,
        step6: `Einkaufspreis netto: €${purchasePriceGross.toFixed(2)} ÷ 1,19 = €${purchasePriceNet.toFixed(2)}`,
        step7: `Deckungsbeitrag: €${sellingPriceNet.toFixed(2)} - €${purchasePriceNet.toFixed(2)} = €${contributionMargin.toFixed(2)}`,
        step8: `Marge: (€${contributionMargin.toFixed(2)} ÷ €${sellingPriceNet.toFixed(2)}) × 100 = ${contributionMarginPercent.toFixed(1)}%`,
        step9: appliedDiscount > 0 
          ? `Angewandter Rabatt: ${appliedDiscount.toFixed(1)}% (${discountType}) - Höchster verfügbarer Rabatt`
          : `Kein Rabatt verfügbar oder anwendbar`
      },
      
      // Rabatt-Details
      discountInfo: {
        appliedDiscount: Math.round(appliedDiscount * 100) / 100,
        discountType: discountType || 'none',
        originalUnitPrice: Math.round(unitPrice * 100) / 100,
        finalUnitPrice: Math.round(purchasePriceGross * 100) / 100,
        discountAmount: Math.round((unitPrice - purchasePriceGross) * 100) / 100
      }
    };

    console.log(`[MARGIN-CALCULATION] SUCCESS:`, {
      product: result.productName,
      sellingPrice: result.sellingPriceNet,
      purchasePrice: result.purchasePriceNet,
      margin: result.contributionMarginPercent
    });

    res.json(result);

  } catch (error) {
    console.error('[MARGIN-CALCULATION] ERROR:', error);
    res.status(500).json({
      error: 'Margin calculation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;