/**
 * Resource-efficient transaction cost calculation service
 * Calculates purchase costs and profitability for each transaction immediately when saved
 */

import { db } from '../db.js';
import { 
  products, 
  purchaseConditions, 
  supplierDiscountConditions, 
  transactions 
} from '../../shared/schema.js';
import { eq, and, gte, lte, sql, desc, isNull, or } from 'drizzle-orm';

export interface TransactionCostResult {
  unitCost: number;
  totalCost: number;
  supplierDiscountApplied: number;
  purchaseConditionId: number | null;
  grossProfit: number;
  profitMargin: number;
  calculationStatus: 'calculated' | 'fallback' | 'error';
}

/**
 * Calculates costs for a transaction based on purchase conditions and supplier discounts
 * This is called immediately when saving each transaction for resource efficiency
 */
export async function calculateTransactionCosts(
  productName: string,
  productId: string | null,
  quantity: number,
  revenue: number
): Promise<TransactionCostResult> {
  try {
    // First try to find the product by name or ID
    let dbProductId: number | null = null;
    
    if (productId) {
      // Try to find by productId first
      const productByIdQuery = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.vendonId, productId))
        .limit(1);
      
      if (productByIdQuery.length > 0) {
        dbProductId = productByIdQuery[0].id;
      }
    }
    
    if (!dbProductId && productName) {
      // Fallback to find by product name
      const productByNameQuery = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.productName, productName))
        .limit(1);
      
      if (productByNameQuery.length > 0) {
        dbProductId = productByNameQuery[0].id;
      }
    }
    
    if (!dbProductId) {
      // No product found - return zero costs
      return {
        unitCost: 0,
        totalCost: 0,
        supplierDiscountApplied: 0,
        purchaseConditionId: null,
        grossProfit: revenue,
        profitMargin: 100,
        calculationStatus: 'fallback'
      };
    }
    
    // Get current valid purchase conditions for the product
    const currentDate = new Date();
    const purchaseQuery = await db
      .select({
        id: purchaseConditions.id,
        unitPrice: purchaseConditions.unitPrice,
        supplierId: purchaseConditions.supplierId,
        packagingQuantity: purchaseConditions.packagingQuantity,
        depositPerUnit: purchaseConditions.depositPerUnit,
        isPreferred: purchaseConditions.isPreferred
      })
      .from(purchaseConditions)
      .where(
        and(
          eq(purchaseConditions.productId, dbProductId),
          or(
            isNull(purchaseConditions.validFrom),
            lte(purchaseConditions.validFrom, currentDate)
          ),
          or(
            isNull(purchaseConditions.validTo),
            gte(purchaseConditions.validTo, currentDate)
          )
        )
      )
      .orderBy(desc(purchaseConditions.isPreferred), purchaseConditions.unitPrice);
    
    if (purchaseQuery.length === 0) {
      // No valid purchase conditions found
      return {
        unitCost: 0,
        totalCost: 0,
        supplierDiscountApplied: 0,
        purchaseConditionId: null,
        grossProfit: revenue,
        profitMargin: 100,
        calculationStatus: 'fallback'
      };
    }
    
    const purchase = purchaseQuery[0];
    let unitCost = purchase.unitPrice || 0;
    let discountApplied = 0;
    
    // Apply supplier discounts if available
    const discountQuery = await db
      .select({
        discountType: supplierDiscountConditions.discountType,
        discountPercentage: supplierDiscountConditions.discountPercentage,
        thresholdQuantity: supplierDiscountConditions.thresholdQuantity,
        thresholdAmount: supplierDiscountConditions.thresholdAmount
      })
      .from(supplierDiscountConditions)
      .where(eq(supplierDiscountConditions.supplierId, purchase.supplierId))
      .orderBy(desc(supplierDiscountConditions.discountPercentage));
    
    // Apply the best applicable discount
    for (const discount of discountQuery) {
      const discountPercentage = discount.discountPercentage || 0;
      
      if (discount.discountType === 'quantity_scale' && quantity >= (discount.thresholdQuantity || 0)) {
        unitCost = unitCost * (1 - discountPercentage / 100);
        discountApplied = discountPercentage;
        break;
      } else if (discount.discountType === 'order_value' && revenue >= (discount.thresholdAmount || 0)) {
        unitCost = unitCost * (1 - discountPercentage / 100);
        discountApplied = discountPercentage;
        break;
      } else if (discount.discountType === 'volume_discount' && quantity >= (discount.thresholdQuantity || 0)) {
        unitCost = unitCost * (1 - discountPercentage / 100);
        discountApplied = discountPercentage;
        break;
      }
    }
    
    const totalCost = unitCost * quantity;
    const grossProfit = revenue - totalCost;
    const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    
    return {
      unitCost,
      totalCost,
      supplierDiscountApplied: discountApplied,
      purchaseConditionId: purchase.id,
      grossProfit,
      profitMargin,
      calculationStatus: 'calculated'
    };
    
  } catch (error) {
    console.error('Error calculating transaction costs:', error);
    
    // Return error state with zero costs
    return {
      unitCost: 0,
      totalCost: 0,
      supplierDiscountApplied: 0,
      purchaseConditionId: null,
      grossProfit: revenue,
      profitMargin: 100,
      calculationStatus: 'error'
    };
  }
}

/**
 * Updates an existing transaction with calculated cost data
 */
export async function updateTransactionWithCosts(
  transactionId: number,
  costResult: TransactionCostResult
): Promise<void> {
  try {
    await db
      .update(transactions)
      .set({
        unitCost: costResult.unitCost,
        totalCost: costResult.totalCost,
        supplierDiscountApplied: costResult.supplierDiscountApplied,
        purchaseConditionId: costResult.purchaseConditionId,
        grossProfit: costResult.grossProfit,
        profitMargin: costResult.profitMargin,
        costCalculatedAt: new Date(),
        costCalculationStatus: costResult.calculationStatus
      })
      .where(eq(transactions.id, transactionId));
  } catch (error) {
    console.error('Error updating transaction with costs:', error);
    throw error;
  }
}

/**
 * Batch calculate costs for transactions that haven't been processed yet
 */
export async function batchCalculateTransactionCosts(limit: number = 100): Promise<number> {
  try {
    // Get transactions without cost calculation
    const pendingTransactions = await db
      .select({
        id: transactions.id,
        productName: transactions.productName,
        productId: transactions.productId,
        quantity: transactions.quantity,
        price: transactions.price
      })
      .from(transactions)
      .where(eq(transactions.costCalculationStatus, 'pending'))
      .limit(limit);
    
    let processedCount = 0;
    
    for (const tx of pendingTransactions) {
      const revenue = (tx.price || 0) * (tx.quantity || 1);
      const costResult = await calculateTransactionCosts(
        tx.productName || '',
        tx.productId,
        tx.quantity || 1,
        revenue
      );
      
      await updateTransactionWithCosts(tx.id, costResult);
      processedCount++;
    }
    
    return processedCount;
  } catch (error) {
    console.error('Error in batch cost calculation:', error);
    return 0;
  }
}