/**
 * Comprehensive Package Logic Utilities for Gebindelogik
 * 
 * This utility provides consistent handling of package information
 * across all order types (Großbestellung, Barg, Einzelbestellung).
 * 
 * Key Features:
 * - Package type handling (Kiste, Karton, Stiege)
 * - Package size validation and calculation
 * - Display formatting for UI consistency
 * - Quantity validation with package multiples
 */

export interface PackageInfo {
  packageCount: number;
  packageQuantity: number;
  packageTypeName: string;
  baseUnitName: string;
  totalQuantity: number;
  sku?: string;
  supplierSku?: string;
  orderArticleNumber?: string;
}

export interface Product {
  id: number;
  name: string;
  sku?: string;
  supplierSku?: string;
  articleSupplier?: string;
  packageSize?: number;
  packageQuantity?: number;
  packageTypeName?: string;
  baseUnitName?: string;
  packageCount?: number;
  orderQuantity?: number;
  price?: number;
  inStock?: number;
}

/**
 * Calculates comprehensive package information from a product
 */
export function calculatePackageInfo(product: Product): PackageInfo;
export function calculatePackageInfo(
  orderQuantity: number,
  packageSize: number,
  packageTypeName: string,
  baseUnitName: string
): PackageInfo;
export function calculatePackageInfo(
  productOrQuantity: Product | number,
  packageSize?: number,
  packageTypeName?: string,
  baseUnitName?: string
): PackageInfo {
  // Handle both calling patterns
  let packageQuantity: number;
  let packageType: string;
  let baseUnit: string;
  let orderQuantity: number;
  let sku: string | undefined;
  let supplierSku: string | undefined;

  if (typeof productOrQuantity === 'object') {
    // Called with Product object
    const product = productOrQuantity;
    packageQuantity = product.packageQuantity || product.packageSize || 1;
    packageType = product.packageTypeName || "Stück";
    baseUnit = product.baseUnitName || "Stück";
    orderQuantity = product.orderQuantity || 0;
    sku = product.sku;
    supplierSku = product.supplierSku || product.articleSupplier;
  } else {
    // Called with individual parameters
    orderQuantity = productOrQuantity;
    packageQuantity = packageSize || 1;
    packageType = packageTypeName || "Stück";
    baseUnit = baseUnitName || "Stück";
  }

  const packageCount = orderQuantity > 0 ? Math.floor(orderQuantity / packageQuantity) : 0;
  const totalQuantity = packageCount * packageQuantity;

  return {
    packageCount,
    packageQuantity,
    packageTypeName: packageType,
    baseUnitName: baseUnit,
    totalQuantity,
    sku,
    supplierSku,
    orderArticleNumber: sku
  };
}

/**
 * Formats package information for display
 */
export function formatPackageDisplay(packageInfo: PackageInfo): string {
  const { packageQuantity, packageTypeName, baseUnitName } = packageInfo;
  
  if (packageQuantity > 1) {
    return `${packageTypeName} (${packageQuantity} ${baseUnitName})`;
  }
  
  return baseUnitName;
}

/**
 * Validates if a quantity is a valid multiple of the package size
 */
export function validatePackageQuantity(quantity: number, packageSize: number): boolean {
  if (packageSize <= 1) return true;
  return quantity % packageSize === 0;
}

/**
 * Gets the next valid package quantity (rounds up to nearest package multiple)
 */
export function getNextValidPackageQuantity(desiredQuantity: number, packageSize: number): number {
  if (packageSize <= 1) return desiredQuantity;
  return Math.ceil(desiredQuantity / packageSize) * packageSize;
}

/**
 * Gets the previous valid package quantity (rounds down to nearest package multiple)
 */
export function getPreviousValidPackageQuantity(desiredQuantity: number, packageSize: number): number {
  if (packageSize <= 1) return Math.max(0, desiredQuantity);
  return Math.floor(desiredQuantity / packageSize) * packageSize;
}

/**
 * Formats total quantity display for UI
 */
export function formatTotalQuantity(quantity: number, baseUnitName: string): string {
  return quantity > 0 ? `${quantity} ${baseUnitName}` : '-';
}

/**
 * Calculates package count from total quantity
 */
export function calculatePackageCount(totalQuantity: number, packageSize: number): number {
  if (packageSize <= 1) return totalQuantity;
  return Math.floor(totalQuantity / packageSize);
}

/**
 * Calculates total quantity from package count
 */
export function calculateTotalQuantity(packageCount: number, packageSize: number): number {
  return packageCount * packageSize;
}

/**
 * Comprehensive package validation with error messages
 */
export function validatePackageOrder(product: Product, requestedQuantity: number): {
  isValid: boolean;
  errorMessage?: string;
  suggestedQuantity?: number;
} {
  const packageSize = product.packageQuantity || product.packageSize || 1;
  
  if (requestedQuantity <= 0) {
    return {
      isValid: false,
      errorMessage: 'Menge muss größer als 0 sein'
    };
  }

  if (packageSize > 1 && requestedQuantity % packageSize !== 0) {
    const suggestedQuantity = getNextValidPackageQuantity(requestedQuantity, packageSize);
    return {
      isValid: false,
      errorMessage: `Menge muss ein Vielfaches von ${packageSize} sein (${product.packageTypeName || 'Gebinde'})`,
      suggestedQuantity
    };
  }

  return { isValid: true };
}

/**
 * Simple package validation for quantity and package size
 */
export function validatePackageQuantitySimple(requestedQuantity: number, packageSize: number): {
  isValid: boolean;
  errorMessage?: string;
  suggestedQuantity?: number;
} {
  if (requestedQuantity <= 0) {
    return {
      isValid: false,
      errorMessage: 'Menge muss größer als 0 sein'
    };
  }

  if (packageSize > 1 && requestedQuantity % packageSize !== 0) {
    const suggestedQuantity = getNextValidPackageQuantity(requestedQuantity, packageSize);
    return {
      isValid: false,
      errorMessage: `Menge muss ein Vielfaches von ${packageSize} sein (Gebinde)`,
      suggestedQuantity
    };
  }

  return { isValid: true };
}

/**
 * Formats package information for order summary display
 */
export function formatOrderSummaryPackage(product: Product): {
  packageDisplay: string;
  packageCount: number;
  totalQuantity: string;
  articleNumber: string;
  supplierArticleNumber: string;
} {
  const packageInfo = calculatePackageInfo(product);
  
  return {
    packageDisplay: formatPackageDisplay(packageInfo),
    packageCount: packageInfo.packageCount,
    totalQuantity: formatTotalQuantity(packageInfo.totalQuantity, packageInfo.baseUnitName),
    articleNumber: product.sku || '-',
    supplierArticleNumber: product.supplierSku || product.articleSupplier || '-'
  };
}

/**
 * Formats package information for email/supplier communication
 */
export function formatSupplierPackageInfo(product: Product): {
  productName: string;
  articleNumber: string;
  supplierArticleNumber: string;
  packageDescription: string;
  packageCount: number;
  totalQuantity: number;
  baseUnit: string;
} {
  const packageInfo = calculatePackageInfo(product);
  
  return {
    productName: product.name,
    articleNumber: product.sku || '',
    supplierArticleNumber: product.supplierSku || product.articleSupplier || '',
    packageDescription: formatPackageDisplay(packageInfo),
    packageCount: packageInfo.packageCount,
    totalQuantity: packageInfo.totalQuantity,
    baseUnit: packageInfo.baseUnitName
  };
}

/**
 * Common package types in German vending industry
 */
export const COMMON_PACKAGE_TYPES = [
  'Kiste',
  'Karton',
  'Stiege',
  'Palette',
  'Beutel',
  'Fach',
  'Stück'
] as const;

export type PackageType = typeof COMMON_PACKAGE_TYPES[number];

/**
 * Parses package_size string from database to numeric package quantity
 * Examples: "6x0,5L" -> 6, "24x330ml" -> 24, "20 Stück" -> 20, "2" -> 2
 */
export function parsePackageSizeToQuantity(packageSize: string | null | undefined): number {
  if (!packageSize || packageSize === '0' || packageSize === '') return 1;
  
  // Regex patterns to extract the package count
  const patterns = [
    /^(\d+)x/,          // "24x330ml" -> 24, "6x0,5L" -> 6
    /^(\d+)\s*Stück/i,  // "20 Stück" -> 20, "12 stück" -> 12
    /^(\d+)\s*Fl/i,     // "6 Flaschen" -> 6
    /^(\d+)\s*St\b/i,   // "20 St" -> 20
    /^(\d+)[^0-9]/,     // "20..." -> 20 (any non-digit after number)
    /^(\d+)$/           // "2" -> 2 (pure number)
  ];
  
  for (const pattern of patterns) {
    const match = packageSize.match(pattern);
    if (match) {
      const num = parseInt(match[1]);
      if (num > 0) return num;
    }
  }
  
  return 1; // Fallback for individual pieces
}

/**
 * Determines package type name from package_size string
 * Examples: "6x0,5L" -> "Karton", "24x330ml" -> "Kasten", "20 Stück" -> "Gebinde"
 */
export function getPackageTypeName(packageSize: string | null | undefined): string {
  if (!packageSize) return "Stück";
  
  const packageQuantity = parsePackageSizeToQuantity(packageSize);
  
  // Guess package type based on quantity and content
  if (packageSize.includes('x') && packageSize.toLowerCase().includes('l')) {
    // Liquid products
    if (packageQuantity >= 20) return "Kasten";
    if (packageQuantity >= 6) return "Karton";
  }
  
  if (packageSize.toLowerCase().includes('stück')) {
    if (packageQuantity >= 10) return "Gebinde";
    return "Pack";
  }
  
  // Default based on quantity
  if (packageQuantity >= 20) return "Kasten";
  if (packageQuantity >= 6) return "Karton";
  if (packageQuantity > 1) return "Gebinde";
  
  return "Stück";
}

/**
 * Formats package size string for display in UI
 * Examples: "24x330ml" -> "Kasten (24 Stück)", "6x0,5L" -> "Karton (6 Stück)"
 */
export function formatPackageDisplayFromString(packageSize: string | null | undefined): string {
  if (!packageSize) return "Stück";
  
  const packageQuantity = parsePackageSizeToQuantity(packageSize);
  const packageTypeName = getPackageTypeName(packageSize);
  
  if (packageQuantity > 1) {
    return `${packageTypeName} (${packageQuantity} Stück)`;
  }
  
  return "Stück";
}

/**
 * Creates a Product object with package information from warehouse product data
 * This allows using existing package-utils functions with warehouse product data
 */
export function createProductWithPackageInfo(warehouseProduct: {
  productId: number;
  productName: string;
  packageSize?: string | null;
  quantity: number;
  [key: string]: any;
}): Product {
  const packageQuantity = parsePackageSizeToQuantity(warehouseProduct.packageSize);
  const packageTypeName = getPackageTypeName(warehouseProduct.packageSize);
  
  return {
    id: warehouseProduct.productId,
    name: warehouseProduct.productName,
    packageSize: packageQuantity,
    packageQuantity: packageQuantity,
    packageTypeName: packageTypeName,
    baseUnitName: "Stück",
    orderQuantity: 0,
    inStock: warehouseProduct.quantity
  };
}

/**
 * Zwei-Feld-Eingabe-System: Berechnet Gesamtmenge aus Gebinde-Anzahl + Einzelmenge
 * @param packageCount Anzahl der ganzen Gebinde
 * @param individualCount Zusätzliche Einzelmengen  
 * @param packageSize Anzahl Stück pro Gebinde (aus package_size)
 * @returns Berechnete Gesamtmenge
 */
export function calculateDualFieldTotal(
  packageCount: number, 
  individualCount: number, 
  packageSize: number
): number {
  const totalFromPackages = Math.max(0, packageCount) * Math.max(1, packageSize);
  const totalFromIndividual = Math.max(0, individualCount);
  return totalFromPackages + totalFromIndividual;
}

/**
 * Zwei-Feld-Eingabe-System: Zerlegt Gesamtmenge in Gebinde + Einzelmenge
 * @param totalQuantity Gesamtmenge die aufgeteilt werden soll
 * @param packageSize Anzahl Stück pro Gebinde
 * @returns Aufgeteilte Mengen: {packageCount, individualCount, calculatedTotal}
 */
export function splitTotalToPackageFields(
  totalQuantity: number,
  packageSize: number
): {
  packageCount: number;
  individualCount: number;
  calculatedTotal: number;
} {
  if (packageSize <= 1) {
    return {
      packageCount: 0,
      individualCount: totalQuantity,
      calculatedTotal: totalQuantity
    };
  }
  
  const packageCount = Math.floor(totalQuantity / packageSize);
  const individualCount = totalQuantity % packageSize;
  
  return {
    packageCount,
    individualCount,
    calculatedTotal: calculateDualFieldTotal(packageCount, individualCount, packageSize)
  };
}

/**
 * Formatiert Gebinde-Information für UI-Anzeige
 * @param packageSize package_size string aus Datenbank
 * @returns Formatierter Text für UI (z.B. "Kasten (24 Stk./Gebinde)")
 */
export function formatPackageInfoForUI(packageSize: string | null | undefined): string {
  if (!packageSize || packageSize === '0' || packageSize === '') {
    return "Einzelartikel";
  }
  
  const packageQuantity = parsePackageSizeToQuantity(packageSize);
  const packageTypeName = getPackageTypeName(packageSize);
  
  if (packageQuantity > 1) {
    return `${packageTypeName} (${packageQuantity} Stk./Gebinde)`;
  }
  
  return "Einzelartikel";
}

/**
 * Validiert Zwei-Feld-Eingabe für Gebinde-System
 * @param packageCount Anzahl Gebinde
 * @param individualCount Anzahl Einzelmengen
 * @param packageSize Gebinde-Größe
 * @returns Validierungsresultat mit Fehlermeldung falls ungültig
 */
export function validateDualFieldInput(
  packageCount: number,
  individualCount: number,
  packageSize: number
): {
  isValid: boolean;
  errorMessage?: string;
  warningMessage?: string;
} {
  if (packageCount < 0 || individualCount < 0) {
    return {
      isValid: false,
      errorMessage: 'Mengen dürfen nicht negativ sein'
    };
  }
  
  if (individualCount >= packageSize && packageSize > 1) {
    return {
      isValid: true,
      warningMessage: `Sie haben ${individualCount} Einzelmengen eingegeben. Das entspricht ${Math.floor(individualCount / packageSize)} zusätzlichen Gebinden.`
    };
  }
  
  return { isValid: true };
}