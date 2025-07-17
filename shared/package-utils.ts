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
export function calculatePackageInfo(product: Product): PackageInfo {
  const packageQuantity = product.packageQuantity || product.packageSize || 1;
  const packageTypeName = product.packageTypeName || "Stück";
  const baseUnitName = product.baseUnitName || "Stück";
  const orderQuantity = product.orderQuantity || 0;
  const packageCount = orderQuantity > 0 ? Math.floor(orderQuantity / packageQuantity) : 0;
  const totalQuantity = packageCount * packageQuantity;

  return {
    packageCount,
    packageQuantity,
    packageTypeName,
    baseUnitName,
    totalQuantity,
    sku: product.sku,
    supplierSku: product.supplierSku || product.articleSupplier,
    orderArticleNumber: product.sku
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