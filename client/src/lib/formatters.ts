/**
 * Unified currency and number formatting utilities
 * Ensures consistent display across the application
 */

/**
 * Formats a number as currency in EUR with consistent styling
 */
export function formatCurrency(amount: number | null | undefined, options: {
  showSymbol?: boolean;
  decimals?: number;
} = {}): string {
  const { showSymbol = true, decimals = 2 } = options;
  
  if (amount === null || amount === undefined || isNaN(amount)) {
    return showSymbol ? '0,00 €' : '0,00';
  }

  const formatted = amount.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  return showSymbol ? `${formatted} €` : formatted;
}

/**
 * Formats a percentage with German locale
 */
export function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,0%';
  }
  
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/**
 * Formats a number with German locale
 */
export function formatNumber(value: number | null | undefined, decimals: number = 0): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Calculates and formats VAT (MwSt) with flexible tax rates
 */
export function calculateVAT(netAmount: number, vatRate: number = 0.19): {
  net: number;
  vat: number;
  gross: number;
  formattedNet: string;
  formattedVat: string;
  formattedGross: string;
} {
  const net = netAmount;
  const vat = net * vatRate;
  const gross = net + vat;
  
  return {
    net,
    vat,
    gross,
    formattedNet: formatCurrency(net),
    formattedVat: formatCurrency(vat),
    formattedGross: formatCurrency(gross),
  };
}