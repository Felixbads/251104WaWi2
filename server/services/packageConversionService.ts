/**
 * Package Conversion Service
 * Handles automatic conversion between individual units and package units (Gebinde)
 * 
 * Features:
 * - Convert package quantities to individual units
 * - Convert individual units to package quantities  
 * - Calculate optimal package combinations
 * - Validate package constraints
 */

import { storage } from "../storage";
import type { Product, PackageType } from "@shared/schema";

export interface PackageCalculation {
  productId: number;
  productName: string;
  packageType?: PackageType;
  packageQuantity: number; // Anzahl Einzelprodukte pro Gebinde
  baseUnitName: string;
  
  // Input
  requestedUnits: number; // Gewünschte Anzahl (in Einzelprodukten oder Gebinden)
  inputType: 'units' | 'packages'; // Was wurde eingegeben?
  
  // Calculation results
  totalUnits: number; // Gesamtanzahl Einzelprodukte
  fullPackages: number; // Vollständige Gebinde
  remainingUnits: number; // Übrige Einzelprodukte
  
  // Display strings
  displayText: string; // z.B. "2 Kisten + 3 Stück" oder "15 Stück"
  packageText?: string; // z.B. "2 Kisten (à 12 Stück)"
  unitText: string; // z.B. "15 Stück"
}

export class PackageConversionService {
  
  /**
   * Konvertiert eine Eingabe (Gebinde oder Einzelprodukte) in eine vollständige Berechnung
   */
  static async calculatePackaging(
    productId: number,
    quantity: number,
    inputType: 'units' | 'packages' = 'units'
  ): Promise<PackageCalculation> {
    // Hole Produktinformationen mit Package Type
    const product = await storage.getProductById(productId);
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    // Hole Package Type falls vorhanden
    let packageType: PackageType | undefined;
    if (product.packageTypeId) {
      const packageTypes = await storage.getPackageTypes({ isActive: true });
      packageType = packageTypes.find(pt => pt.id === product.packageTypeId);
    }

    const packageQuantity = product.packageQuantity || 1;
    const baseUnitName = product.baseUnitName || 'Stück';
    const packageTypeName = packageType?.name || 'Gebinde';

    let totalUnits: number;
    
    if (inputType === 'packages') {
      // Eingabe waren Gebinde -> umrechnen zu Einzelprodukten
      totalUnits = quantity * packageQuantity;
    } else {
      // Eingabe waren bereits Einzelprodukte
      totalUnits = quantity;
    }

    // Berechne optimale Aufteilung in Gebinde + Reste
    const fullPackages = Math.floor(totalUnits / packageQuantity);
    const remainingUnits = totalUnits % packageQuantity;

    // Erstelle Display-Texte
    let displayText: string;
    let packageText: string | undefined;
    let unitText: string;

    if (packageQuantity === 1 || !packageType) {
      // Kein echtes Gebinde -> nur Einzelprodukte anzeigen
      displayText = `${totalUnits} ${baseUnitName}`;
      unitText = displayText;
    } else {
      // Mit Gebinden
      if (fullPackages > 0 && remainingUnits > 0) {
        displayText = `${fullPackages} ${packageTypeName} + ${remainingUnits} ${baseUnitName}`;
        packageText = `${fullPackages} ${packageTypeName} (à ${packageQuantity} ${baseUnitName})`;
        unitText = `${totalUnits} ${baseUnitName}`;
      } else if (fullPackages > 0) {
        displayText = `${fullPackages} ${packageTypeName}`;
        packageText = `${fullPackages} ${packageTypeName} (à ${packageQuantity} ${baseUnitName})`;
        unitText = `${totalUnits} ${baseUnitName}`;
      } else {
        displayText = `${remainingUnits} ${baseUnitName}`;
        unitText = displayText;
      }
    }

    return {
      productId,
      productName: product.productName,
      packageType,
      packageQuantity,
      baseUnitName,
      requestedUnits: quantity,
      inputType,
      totalUnits,
      fullPackages,
      remainingUnits,
      displayText,
      packageText,
      unitText
    };
  }

  /**
   * Konvertiert eine Liste von Produkten mit Mengen
   */
  static async calculateMultiplePackaging(
    items: Array<{ productId: number; quantity: number; inputType?: 'units' | 'packages' }>
  ): Promise<PackageCalculation[]> {
    const calculations: PackageCalculation[] = [];
    
    for (const item of items) {
      const calculation = await this.calculatePackaging(
        item.productId,
        item.quantity,
        item.inputType || 'units'
      );
      calculations.push(calculation);
    }
    
    return calculations;
  }

  /**
   * Berechnet minimale Bestellmenge in Gebinden
   */
  static async calculateMinimumOrderPackages(productId: number): Promise<{
    minOrderQuantity: number;
    packageQuantity: number;
    minPackages: number;
    displayText: string;
  }> {
    const product = await storage.getProductById(productId);
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const minOrderQuantity = product.minOrderQuantity || 1;
    const packageQuantity = product.packageQuantity || 1;
    const minPackages = Math.ceil(minOrderQuantity / packageQuantity);

    let packageType: PackageType | undefined;
    if (product.packageTypeId) {
      const packageTypes = await storage.getPackageTypes({ isActive: true });
      packageType = packageTypes.find(pt => pt.id === product.packageTypeId);
    }

    const packageTypeName = packageType?.name || 'Gebinde';
    const baseUnitName = product.baseUnitName || 'Stück';

    let displayText: string;
    if (packageQuantity === 1) {
      displayText = `Mindestens ${minOrderQuantity} ${baseUnitName}`;
    } else {
      displayText = `Mindestens ${minPackages} ${packageTypeName} (${minPackages * packageQuantity} ${baseUnitName})`;
    }

    return {
      minOrderQuantity,
      packageQuantity,
      minPackages,
      displayText
    };
  }

  /**
   * Validiert ob eine Bestellmenge die Mindestbestellmenge erfüllt
   */
  static async validateOrderQuantity(
    productId: number,
    quantity: number,
    inputType: 'units' | 'packages' = 'units'
  ): Promise<{ valid: boolean; message?: string; calculation: PackageCalculation }> {
    const calculation = await this.calculatePackaging(productId, quantity, inputType);
    const product = await storage.getProductById(productId);
    
    if (!product) {
      return {
        valid: false,
        message: 'Produkt nicht gefunden',
        calculation
      };
    }

    const minOrderQuantity = product.minOrderQuantity || 1;
    
    if (calculation.totalUnits < minOrderQuantity) {
      const minOrder = await this.calculateMinimumOrderPackages(productId);
      return {
        valid: false,
        message: `Mindestbestellmenge unterschritten. ${minOrder.displayText}`,
        calculation
      };
    }

    return {
      valid: true,
      calculation
    };
  }

  /**
   * Parsing-Helper für Legacy packageSize Feld (z.B. "6x0,5L", "24x330ml")
   */
  static parsePackageSize(packageSize?: string | null): {
    quantity: number;
    unit: string;
    description: string;
  } {
    if (!packageSize) {
      return { quantity: 1, unit: 'Stück', description: '1 Stück' };
    }

    // Parse "6x0,5L", "24x330ml", "12 Stück", etc.
    const patterns = [
      /^(\d+)x([\d,\.]+)([a-zA-Z]+)$/i, // 6x0,5L, 24x330ml
      /^(\d+)\s*([a-zA-Z]+)$/i, // 12 Stück, 20 Flaschen
      /^(\d+)$/i, // 24 (nur Zahl)
    ];

    for (const pattern of patterns) {
      const match = packageSize.match(pattern);
      if (match) {
        const quantity = parseInt(match[1]);
        const unit = match[3] || match[2] || 'Stück';
        return {
          quantity,
          unit,
          description: packageSize
        };
      }
    }

    // Fallback
    return { quantity: 1, unit: 'Stück', description: packageSize };
  }
}

export default PackageConversionService;