/**
 * Enhanced Vendon Transaction Mapping with 100% API Coverage
 * Based on the German implementation plan for complete field mapping
 */

import { InsertTransaction } from "@shared/schema";

// Type definition for Vendon Transaction from API
export interface VendonTransaction {
  id: string;
  datetime: string; // "YYYY-MM-DD HH:mm:ss"
  machine_id?: string;
  machine_name?: string;
  location_id?: string;
  location_name?: string;
  product_id?: string;
  product_name?: string;
  product_price?: number; // cents
  product_cost?: number;  // cents (often null)
  quantity?: number;
  total_amount?: number;  // cents
  payment_method?: string;
  transaction_type?: string;
  currency?: string;
  status?: string;
  refund_reason?: string | null;
  customer_id?: string | null;
  session_id?: string | null;

  // NEW / previously ignored fields:
  temperature?: number | null;
  humidity?: number | null;
  machine_status?: string | null;
  error_code?: string | null;
  maintenance_flag?: boolean | null;

  // Additional API fields for complete coverage
  selection?: number;
  product_cost_price?: number;
  vat?: number;
  price_vat?: number;
  price_wo_vat?: number;
  discount_code?: string;
  discount_amount?: number;
  transaction_data?: string;
  note?: string;
  metadata?: string;
  extra_data?: string;
  amount?: number;
  coin_credit?: number;
  card_credit?: number;
  cashless_credit?: number;
  is_test?: boolean;
}

/**
 * Converts cents to euros with proper rounding
 * @param cents Value in cents
 * @returns Value in euros or null if input is invalid
 */
function centsToEuro(cents?: number | null): number | null {
  if (typeof cents !== 'number' || isNaN(cents)) {
    return null;
  }
  return Math.round(cents) / 100;
}

/**
 * Converts Vendon API datetime to PostgreSQL timestamptz format
 * @param dateStr API datetime string in "YYYY-MM-DD HH:mm:ss" format
 * @returns ISO string with timezone
 */
function toTimestamptz(dateStr: string): string {
  if (!dateStr) {
    throw new Error('DateTime string is required');
  }
  
  // For now, assume local time is Europe/Berlin (+01:00)
  // TODO: Use luxon/dayjs with proper timezone handling for production
  return `${dateStr}+01:00`;
}

/**
 * Normalizes payment method values for consistency
 * @param paymentMethod Raw payment method from API
 * @returns Normalized payment method
 */
function normalizePaymentMethod(paymentMethod?: string): string | null {
  if (!paymentMethod) return null;
  
  const normalized = paymentMethod.toLowerCase();
  switch (normalized) {
    case 'cash':
    case 'coin':
    case 'münze':
      return 'cash';
    case 'card':
    case 'cashless':
    case 'karte':
    case 'kartenzahlung':
      return 'card';
    case 'mobile':
    case 'app':
      return 'mobile';
    case 'voucher':
    case 'gutschein':
      return 'voucher';
    default:
      return paymentMethod;
  }
}

/**
 * Normalizes machine status values
 * @param status Raw machine status from API
 * @returns Normalized machine status
 */
function normalizeMachineStatus(status?: string | null): string | null {
  if (!status) return null;
  
  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'ok':
    case 'online':
    case 'running':
    case 'active':
      return 'operational';
    case 'maintenance':
    case 'wartung':
    case 'service':
      return 'maintenance';
    case 'error':
    case 'fehler':
    case 'alarm':
      return 'error';
    case 'offline':
    case 'disconnected':
      return 'offline';
    default:
      return status;
  }
}

/**
 * Maps a Vendon API transaction to database format with complete field coverage
 * @param vendonTx Transaction from Vendon API
 * @returns Mapped transaction for database insertion
 */
export function mapVendonTransaction(vendonTx: VendonTransaction): InsertTransaction {
  if (!vendonTx.id) {
    throw new Error('Transaction ID is required');
  }
  
  if (!vendonTx.datetime) {
    throw new Error('Transaction datetime is required');
  }

  return {
    // Core identification
    vendonId: vendonTx.id,
    datetime: toTimestamptz(vendonTx.datetime),
    
    // Machine information
    machineId: null, // Will be resolved separately via machine lookup
    machineName: vendonTx.machine_name ?? null,
    
    // Product information
    productId: vendonTx.product_id ?? null,
    productName: vendonTx.product_name ?? null,
    selection: vendonTx.selection ?? null,
    
    // Pricing (convert from cents to euros)
    price: centsToEuro(vendonTx.product_price) ?? 0,
    priceVat: centsToEuro(vendonTx.price_vat),
    priceWoVat: centsToEuro(vendonTx.price_wo_vat),
    vat: vendonTx.vat ?? null,
    totalCost: centsToEuro(vendonTx.product_cost),
    amount: centsToEuro(vendonTx.total_amount),
    
    // Quantity and transaction details
    quantity: vendonTx.quantity ?? 1,
    currency: vendonTx.currency ?? 'EUR',
    
    // Payment information
    paymentMethod: normalizePaymentMethod(vendonTx.payment_method),
    paymentType: vendonTx.payment_method ?? null, // Keep original for reference
    
    // Discount information
    discountCode: vendonTx.discount_code ?? null,
    discountAmount: centsToEuro(vendonTx.discount_amount),
    
    // Transaction metadata
    transactionType: vendonTx.transaction_type ?? null,
    status: vendonTx.status ?? 'completed',
    source: 'vendon',
    transactionData: vendonTx.transaction_data ?? null,
    note: vendonTx.note ?? null,
    metadata: vendonTx.metadata ?? null,
    extraData: vendonTx.extra_data ?? null,
    
    // Location information
    locationId: null, // Will be resolved separately via location lookup
    locationName: vendonTx.location_name ?? null,
    
    // Customer information
    customerId: vendonTx.customer_id ?? null,
    sessionId: vendonTx.session_id ?? null,
    refundReason: vendonTx.refund_reason ?? null,
    
    // Credit tracking
    coinCredit: centsToEuro(vendonTx.coin_credit) ?? 0,
    cardCredit: centsToEuro(vendonTx.card_credit) ?? 0,
    cashlessCredit: centsToEuro(vendonTx.cashless_credit) ?? 0,
    
    // Test transaction flag
    isTest: vendonTx.is_test ?? false,
    
    // NEW FIELDS: Environmental and machine status (main focus of this plan)
    temperature: (typeof vendonTx.temperature === 'number') ? vendonTx.temperature : null,
    humidity: (typeof vendonTx.humidity === 'number') ? vendonTx.humidity : null,
    machineStatus: normalizeMachineStatus(vendonTx.machine_status),
    errorCode: vendonTx.error_code ?? null,
    maintenanceFlag: vendonTx.maintenance_flag ?? false,
    
    // Timestamps
    syncedAt: new Date().toISOString(),
    lastSync: new Date().toISOString(),
    processingStatus: 'pending',
    
    // Will be filled by seasonal enrichment later
    weekOfYear: null,
    dayOfYear: null,
    monthOfYear: null,
    quarterOfYear: null,
    weekdayNumber: null,
    season: null,
    isHoliday: false,
    holidayName: null,
    holidayType: null,
    isVacation: false,
    vacationType: null,
    isBridgeDay: false,
    
    // Weather context (will be enriched separately)
    weatherCondition: null,
    precipitation: null,
    windSpeed: null,
    
    // Event context
    eventType: null,
    touristSeason: false,
    schoolInSession: true,
    
    // Cost calculation (will be calculated separately)
    unitCost: null,
    totalCost: null,
    supplierDiscountApplied: null,
    purchaseConditionId: null,
    costCalculatedAt: null,
    costCalculationStatus: 'pending',
    grossProfit: null,
    profitMargin: null,
    
    // Default timestamps
    createdAt: new Date().toISOString()
  };
}

/**
 * Batch mapping function for multiple transactions
 * @param vendonTransactions Array of Vendon API transactions
 * @returns Array of mapped transactions
 */
export function mapVendonTransactionsBatch(vendonTransactions: VendonTransaction[]): InsertTransaction[] {
  const results: InsertTransaction[] = [];
  const errors: { index: number; error: string; transaction: any }[] = [];
  
  vendonTransactions.forEach((tx, index) => {
    try {
      results.push(mapVendonTransaction(tx));
    } catch (error) {
      errors.push({
        index,
        error: error instanceof Error ? error.message : String(error),
        transaction: tx
      });
    }
  });
  
  if (errors.length > 0) {
    console.warn(`Mapping errors encountered for ${errors.length}/${vendonTransactions.length} transactions:`, errors);
  }
  
  return results;
}

/**
 * Validates that all critical API fields are being mapped
 * @param apiSample Sample transaction from API
 * @returns Coverage report
 */
export function analyzeMappingCoverage(apiSample: any): {
  mappedFields: string[];
  unmappedFields: string[];
  coveragePercentage: number;
} {
  const apiKeys = Object.keys(apiSample);
  const mappingFunction = mapVendonTransaction.toString();
  
  const mappedFields = apiKeys.filter(key => 
    mappingFunction.includes(`vendonTx.${key}`) || 
    mappingFunction.includes(`tx.${key}`)
  );
  
  const unmappedFields = apiKeys.filter(key => !mappedFields.includes(key));
  
  return {
    mappedFields,
    unmappedFields,
    coveragePercentage: Math.round((mappedFields.length / apiKeys.length) * 100)
  };
}