import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Calendar, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { CartItem, useInventoryCart } from "./InventoryCartContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface InventoryProduct {
  id: number;
  productId: number;
  productName: string;
  packageSize?: string | null;
  quantity: number;
  warehouseId: number;
  warehouseName?: string;
  status?: string;
  packageTypeId?: number;
  packageTypeName?: string;
  unitsPerPackage?: number;
}

export interface ProductBatch {
  id: number;
  batchNumber: string;
  productId: number;
  warehouseId: number;
  initialQuantity: number;
  currentQuantity: number;
  expiryDate: string | null;
  manufacturingDate?: string | null;
  locationInWarehouse?: string | null;
  status: string;
  notes?: string | null;
  productName?: string;
  warehouseName?: string;
}

export interface PackageType {
  id: number;
  name: string;
  description?: string;
  unitsPerPackage: number;
  isActive: boolean;
  sortOrder: number;
}

interface InventoryProductsTableProps {
  products: InventoryProduct[];
  onAddToCart: (product: InventoryProduct, quantity: number, batchIds?: number[]) => void;
  warehouseId: number;
  packageTypes?: PackageType[];
}

type UnitType = 'pieces' | 'packages';

// Hilfsfunktion zum Parsen der Gebindegröße
function parsePackageSize(packageSize: string | null | undefined): number {
  if (!packageSize) return 1;
  
  // Regex für verschiedene Formate: "24x330ml", "6x0,5L", "12 Flaschen", etc.
  const patterns = [
    /^(\d+)x/,          // "24x330ml" -> 24
    /^(\d+)\s*Stück/i,  // "12 Stück" -> 12
    /^(\d+)\s*Fl/i,     // "6 Flaschen" -> 6
    /^(\d+)[^0-9]/,     // "20..." -> 20
    /(\d+)/             // Fallback für erste Zahl
  ];
  
  for (const pattern of patterns) {
    const match = packageSize.match(pattern);
    if (match) {
      const num = parseInt(match[1]);
      if (num > 1) return num;
    }
  }
  
  return 1; // Fallback für einzelne Stücke
}

// Gebinde-Informationen für ein Produkt (erweitert für Package Types)
function getPackageInfo(product: InventoryProduct) {
  // Bevorzuge Package Type Data, fallback auf packageSize parsing
  let packageCount = 1;
  let packageLabel = 'Gebinde';
  let hasPackaging = false;
  
  if (product.unitsPerPackage && product.unitsPerPackage > 1) {
    // Package Type verfügbar
    packageCount = product.unitsPerPackage;
    hasPackaging = true;
    packageLabel = product.packageTypeName 
      ? `${product.packageTypeName} (${packageCount} Stück)` 
      : `Gebinde (${packageCount} Stück)`;
  } else if (product.packageSize) {
    // Fallback auf packageSize parsing
    packageCount = parsePackageSize(product.packageSize);
    hasPackaging = packageCount > 1;
    packageLabel = `Gebinde (${product.packageSize})`;
  }
  
  return {
    packageCount,
    hasPackaging,
    piecesInStock: product.quantity,
    packagesInStock: hasPackaging ? Math.floor(product.quantity / packageCount) : 0,
    packageLabel,
    packageTypeName: product.packageTypeName,
    packageTypeId: product.packageTypeId
  };
}

export default function InventoryProductsTable({
  products,
  onAddToCart,
  warehouseId,
  packageTypes = []
}: InventoryProductsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [selectedBatches, setSelectedBatches] = useState<Record<number, number[]>>({});
  const { cartItems } = useInventoryCart();

  // Hilfsfunktion: Verfügbare Menge berechnen (Lagerbestand - Warenkorb-Menge)
  const getAvailableQuantity = (product: InventoryProduct) => {
    const cartItem = cartItems.find(item => item.productId === product.productId);
    const cartQuantity = cartItem ? cartItem.quantity : 0;
    const batchQuantity = getAvailableQuantityFromBatches(product);
    return Math.max(0, batchQuantity - cartQuantity);
  };

  // Hilfsfunktion: Erweiterte Produktinformationen mit verfügbaren Mengen
  const getEnhancedProductInfo = (product: InventoryProduct) => {
    const availableQuantity = getAvailableQuantity(product);
    const packageInfo = getPackageInfo({ ...product, quantity: availableQuantity });
    return {
      ...product,
      availableQuantity,
      packageInfo
    };
  };
  const [quantityInputs, setQuantityInputs] = useState<Record<number, number>>({});
  const [unitTypes, setUnitTypes] = useState<Record<number, UnitType>>({});
  
  // Neue States für Gebinde-Eingabe
  const [packageQuantities, setPackageQuantities] = useState<Record<number, number>>({});
  const [individualQuantities, setIndividualQuantities] = useState<Record<number, number>>({});
  const [selectedPackageTypes, setSelectedPackageTypes] = useState<Record<number, number>>({});
  
  // Get batches for products
  const { data: productBatches } = useQuery({
    queryKey: ['/api/product-batches', { warehouseId }],
    queryFn: () => apiRequest(`/api/product-batches?warehouseId=${warehouseId}`, {}, "GET"),
    enabled: !!warehouseId,
    select: (data: ProductBatch[]) => {
      // Group batches by product ID
      const batchesByProduct: Record<number, ProductBatch[]> = {};
      data.forEach(batch => {
        if (!batchesByProduct[batch.productId]) {
          batchesByProduct[batch.productId] = [];
        }
        batchesByProduct[batch.productId].push(batch);
      });
      return batchesByProduct;
    }
  });
  
  // Filtert Produkte basierend auf dem Suchbegriff
  const filteredProducts = products.filter((product) => {
    if (searchTerm === "") return true;
    
    const term = searchTerm.toLowerCase();
    return (
      product.productName.toLowerCase().includes(term) ||
      String(product.productId).includes(term)
    );
  });

  // Berechnet die tatsächliche Stückzahl basierend auf der Einheit
  const calculateActualQuantity = (product: InventoryProduct, inputQuantity: number, unitType: UnitType): number => {
    if (unitType === 'pieces') {
      return inputQuantity;
    } else {
      const packageInfo = getPackageInfo(product);
      return inputQuantity * packageInfo.packageCount;
    }
  };

  // Fügt ein Produkt zum Warenkorb hinzu
  const handleAddToCart = (product: InventoryProduct) => {
    const inputQuantity = quantityInputs[product.id] || 1;
    const unitType = unitTypes[product.id] || 'pieces';
    const actualQuantity = calculateActualQuantity(product, inputQuantity, unitType);
    const selectedBatchIds = selectedBatches[product.productId] || [];
    
    const availableQuantity = getAvailableQuantity(product);
    if (actualQuantity > 0 && actualQuantity <= availableQuantity) {
      // Nur Chargen-IDs übertragen, wenn welche ausgewählt sind
      const batchIdsToTransfer = selectedBatchIds.length > 0 ? selectedBatchIds : undefined;
      onAddToCart(product, actualQuantity, batchIdsToTransfer);
      
      // Zurücksetzen der Auswahl und Menge nach dem Hinzufügen
      const newSelected = new Set(selectedRows);
      newSelected.delete(product.id);
      setSelectedRows(newSelected);
      
      const newQuantities = { ...quantityInputs };
      delete newQuantities[product.id];
      setQuantityInputs(newQuantities);
      
      const newUnitTypes = { ...unitTypes };
      delete newUnitTypes[product.id];
      setUnitTypes(newUnitTypes);
      
      // Chargen-Auswahl zurücksetzen
      const newSelectedBatches = { ...selectedBatches };
      delete newSelectedBatches[product.productId];
      setSelectedBatches(newSelectedBatches);
      
      // Produkterweiterung zurücksetzen
      const newExpanded = new Set(expandedProducts);
      newExpanded.delete(product.productId);
      setExpandedProducts(newExpanded);
    }
  };

  // Behandelt Checkbox-Änderungen
  const handleCheckboxChange = (productId: number, checked: boolean) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(productId);
    } else {
      newSelected.delete(productId);
    }
    setSelectedRows(newSelected);
  };

  // Behandelt Mengenänderungen
  const handleQuantityChange = (productId: number, value: string) => {
    const quantity = parseInt(value) || 0;
    setQuantityInputs(prev => ({
      ...prev,
      [productId]: quantity
    }));
  };

  // Behandelt Einheitenwechsel
  const handleUnitTypeChange = (productId: number, unitType: UnitType) => {
    setUnitTypes(prev => ({
      ...prev,
      [productId]: unitType
    }));
  };

  // Handler: Gebinde-Menge ändern
  const handlePackageQuantityChange = (productId: number, value: string) => {
    const quantity = Math.max(0, parseInt(value) || 0);
    setPackageQuantities(prev => ({ ...prev, [productId]: quantity }));
  };

  // Handler: Einzelstück-Menge ändern  
  const handleIndividualQuantityChange = (productId: number, value: string) => {
    const quantity = Math.max(0, parseInt(value) || 0);
    setIndividualQuantities(prev => ({ ...prev, [productId]: quantity }));
  };

  // Handler: Package-Type auswählen
  const handlePackageTypeSelection = (productId: number, packageTypeId: number) => {
    setSelectedPackageTypes(prev => ({ ...prev, [productId]: packageTypeId }));
  };

  // Berechnet Gesamtmenge aus Gebinde + Einzelstück
  const calculateTotalFromPackages = (productId: number): number => {
    const packageQty = packageQuantities[productId] || 0;
    const individualQty = individualQuantities[productId] || 0;
    const selectedPackageTypeId = selectedPackageTypes[productId];
    
    if (selectedPackageTypeId) {
      const packageType = packageTypes.find(pt => pt.id === selectedPackageTypeId);
      if (packageType) {
        return (packageQty * packageType.unitsPerPackage) + individualQty;
      }
    }
    
    return packageQty + individualQty;
  };

  // Behandelt Produkterweiterung (Chargen anzeigen/verbergen)
  const toggleProductExpansion = (productId: number) => {
    setExpandedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // Behandelt Chargen-Auswahl
  const handleBatchSelection = (productId: number, batchId: number, selected: boolean) => {
    setSelectedBatches(prev => {
      const productBatches = prev[productId] || [];
      if (selected) {
        return {
          ...prev,
          [productId]: [...productBatches, batchId]
        };
      } else {
        return {
          ...prev,
          [productId]: productBatches.filter(id => id !== batchId)
        };
      }
    });
  };

  // Hilfsfunktion: Verfügbare Menge aus ausgewählten Chargen berechnen
  const getAvailableQuantityFromBatches = (product: InventoryProduct): number => {
    if (!productBatches) return product.quantity;
    
    const batches = productBatches[product.productId] || [];
    const selectedBatchIds = selectedBatches[product.productId] || [];
    
    if (selectedBatchIds.length === 0) {
      // Keine Chargen ausgewählt - verwende Gesamtbestand
      return product.quantity;
    }
    
    // Nur aus ausgewählten Chargen
    return batches
      .filter(batch => selectedBatchIds.includes(batch.id))
      .reduce((total, batch) => total + batch.currentQuantity, 0);
  };

  // Fügt alle ausgewählten Produkte zum Warenkorb hinzu
  const handleAddSelectedToCart = () => {
    selectedRows.forEach(productId => {
      const product = products.find(p => p.id === productId);
      if (product) {
        handleAddToCart(product);
      }
    });
  };

  // Berechnet verfügbare Menge für Anzeige (berücksichtigt Warenkorb)
  const getAvailableQuantityDisplay = (enhancedProduct: any, unitType: UnitType): string => {
    const packageInfo = enhancedProduct.packageInfo;
    
    if (unitType === 'pieces') {
      return `${enhancedProduct.availableQuantity} Stück verfügbar`;
    } else if (packageInfo.hasPackaging) {
      return `${packageInfo.packagesInStock} Gebinde verfügbar (${packageInfo.packagesInStock * packageInfo.packageCount} Stück)`;
    } else {
      return `${enhancedProduct.availableQuantity} Stück verfügbar`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Suchleiste */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Produkte suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {selectedRows.size > 0 && (
          <Button onClick={handleAddSelectedToCart} className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            Ausgewählte hinzufügen ({selectedRows.size})
          </Button>
        )}
      </div>

      {/* Produkttabelle */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedRows.has(p.id))}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedRows(new Set(filteredProducts.map(p => p.id)));
                    } else {
                      setSelectedRows(new Set());
                    }
                  }}
                />
              </TableHead>
              <TableHead>Produktname</TableHead>
              <TableHead>Gebindegröße</TableHead>
              <TableHead>Bestand</TableHead>
              <TableHead>Chargen</TableHead>
              <TableHead>Einheit</TableHead>
              <TableHead>Menge</TableHead>
              <TableHead>Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product) => {
              const enhancedProduct = getEnhancedProductInfo(product);
              const packageInfo = enhancedProduct.packageInfo;
              const unitType = unitTypes[product.id] || 'pieces';
              const inputQuantity = quantityInputs[product.id] || 1;
              const actualQuantity = calculateActualQuantity(product, inputQuantity, unitType);
              const isValidQuantity = actualQuantity > 0 && actualQuantity <= enhancedProduct.availableQuantity;

              return (
                <TableRow key={product.id} className={selectedRows.has(product.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRows.has(product.id)}
                      onCheckedChange={(checked) => handleCheckboxChange(product.id, !!checked)}
                    />
                  </TableCell>
                  
                  <TableCell className="font-medium">
                    {product.productName}
                  </TableCell>
                  
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {product.packageSize || "Einzelstück"}
                    </span>
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{enhancedProduct.availableQuantity} Stück verfügbar</div>
                      {enhancedProduct.packageInfo.hasPackaging && (
                        <div className="text-muted-foreground">
                          {enhancedProduct.packageInfo.packagesInStock} Gebinde verfügbar
                        </div>
                      )}
                      {enhancedProduct.availableQuantity < product.quantity && (
                        <div className="text-xs text-orange-600">
                          ({product.quantity - enhancedProduct.availableQuantity} im Warenkorb)
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {(() => {
                      const batches = productBatches?.[product.productId] || [];
                      const validBatches = batches.filter(batch => batch.currentQuantity > 0);
                      
                      if (validBatches.length === 0) {
                        return (
                          <span className="text-sm text-muted-foreground">Keine Chargen</span>
                        );
                      }
                      
                      if (validBatches.length === 1) {
                        const batch = validBatches[0];
                        return (
                          <div className="text-sm">
                            <div className="font-medium">{batch.batchNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {batch.currentQuantity} Stück
                              {batch.expiryDate && (
                                <span className="ml-2">
                                  MHD: {new Date(batch.expiryDate).toLocaleDateString('de-DE')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <Collapsible
                          open={expandedProducts.has(product.productId)}
                          onOpenChange={() => toggleProductExpansion(product.productId)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 p-1">
                              {expandedProducts.has(product.productId) ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              <span className="ml-1 text-xs">
                                {validBatches.length} Chargen
                              </span>
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2">
                            <div className="space-y-1">
                              {validBatches.map(batch => {
                                const isSelected = selectedBatches[product.productId]?.includes(batch.id) || false;
                                const expiryDays = batch.expiryDate 
                                  ? Math.ceil((new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                                  : null;
                                
                                return (
                                  <div key={batch.id} className="flex items-center gap-2 p-2 border rounded-md">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => 
                                        handleBatchSelection(product.productId, batch.id, !!checked)
                                      }
                                    />
                                    <div className="flex-1 text-xs">
                                      <div className="font-medium">{batch.batchNumber}</div>
                                      <div className="text-muted-foreground">
                                        {batch.currentQuantity} Stück
                                        {batch.expiryDate && (
                                          <span className={`ml-2 ${
                                            expiryDays !== null && expiryDays < 7 
                                              ? 'text-red-600 font-medium' 
                                              : expiryDays !== null && expiryDays < 30 
                                                ? 'text-orange-600' 
                                                : ''
                                          }`}>
                                            MHD: {new Date(batch.expiryDate).toLocaleDateString('de-DE')}
                                            {expiryDays !== null && (
                                              <span className="ml-1">
                                                ({expiryDays > 0 ? `${expiryDays}d` : 'abgelaufen'})
                                              </span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                      {batch.locationInWarehouse && (
                                        <div className="text-muted-foreground">
                                          📍 {batch.locationInWarehouse}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })()} 
                  </TableCell>
                  
                  <TableCell>
                    {packageInfo.hasPackaging ? (
                      <Select
                        value={unitType}
                        onValueChange={(value: UnitType) => handleUnitTypeChange(product.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pieces">Stück</SelectItem>
                          <SelectItem value="packages">{packageInfo.packageLabel}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground">Stück</span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    {(() => {
                      const totalFromPackages = calculateTotalFromPackages(product.id);
                      const packageQty = packageQuantities[product.id] || 0;
                      const individualQty = individualQuantities[product.id] || 0;
                      const selectedPackageTypeId = selectedPackageTypes[product.id];
                      const selectedPackageType = packageTypes.find(pt => pt.id === selectedPackageTypeId);
                      
                      return (
                        <div className="space-y-2 min-w-[200px]">
                          {/* Package Type Auswahl */}
                          <div>
                            <Select
                              value={selectedPackageTypeId ? selectedPackageTypeId.toString() : ""}
                              onValueChange={(value) => handlePackageTypeSelection(product.id, parseInt(value))}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Gebindeart wählen..." />
                              </SelectTrigger>
                              <SelectContent>
                                {packageTypes.map(pt => (
                                  <SelectItem key={pt.id} value={pt.id.toString()}>
                                    {pt.name} ({pt.unitsPerPackage} Stück)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Gebinde + Einzelstück Eingabe */}
                          {selectedPackageType && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Gebinde"
                                  value={packageQty || ""}
                                  onChange={(e) => handlePackageQuantityChange(product.id, e.target.value)}
                                  className="w-full"
                                />
                                <div className="text-xs text-muted-foreground mt-1">
                                  {selectedPackageType.name}
                                </div>
                              </div>
                              <div>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Einzelstück"
                                  value={individualQty || ""}
                                  onChange={(e) => handleIndividualQuantityChange(product.id, e.target.value)}
                                  className="w-full"
                                />
                                <div className="text-xs text-muted-foreground mt-1">
                                  Stück
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Berechnung anzeigen */}
                          {selectedPackageType && (packageQty > 0 || individualQty > 0) && (
                            <div className="text-sm font-medium text-blue-600 bg-blue-50 p-2 rounded">
                              {packageQty > 0 && (
                                <span>{packageQty} × {selectedPackageType.unitsPerPackage}</span>
                              )}
                              {packageQty > 0 && individualQty > 0 && <span> + </span>}
                              {individualQty > 0 && (
                                <span>{individualQty} Stück</span>
                              )}
                              <span className="ml-2">= {totalFromPackages} Stück</span>
                            </div>
                          )}
                          
                          {/* Verfügbarkeit anzeigen */}
                          <div className="text-xs text-muted-foreground">
                            {enhancedProduct.availableQuantity} Stück verfügbar
                          </div>
                          
                          {/* Validation */}
                          {totalFromPackages > enhancedProduct.availableQuantity && (
                            <div className="text-xs text-red-600">
                              ⚠️ Nicht genügend Bestand
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  
                  <TableCell>
                    {(() => {
                      const totalFromPackages = calculateTotalFromPackages(product.id);
                      const hasPackageInput = totalFromPackages > 0;
                      const isPackageValid = hasPackageInput ? totalFromPackages <= enhancedProduct.availableQuantity : true;
                      const finalQuantity = hasPackageInput ? totalFromPackages : (inputQuantity || 1);
                      const isFinalValid = finalQuantity > 0 && finalQuantity <= enhancedProduct.availableQuantity;
                      
                      const handleAddWithPackages = () => {
                        const quantityToAdd = hasPackageInput ? totalFromPackages : actualQuantity;
                        
                        // Erstelle CartItem mit Package-Informationen
                        const cartItem: CartItem = {
                          id: Date.now(),
                          productId: product.productId,
                          warehouseId: product.warehouseId,
                          quantity: quantityToAdd,
                          productName: product.productName,
                          packageTypeId: selectedPackageTypes[product.id],
                          packageTypeName: selectedPackageTypes[product.id] 
                            ? packageTypes.find(pt => pt.id === selectedPackageTypes[product.id])?.name 
                            : undefined,
                          packageQuantity: packageQuantities[product.id] || 0,
                          individualQuantity: individualQuantities[product.id] || 0,
                          selectedBatchIds: selectedBatches[product.productId] || []
                        };
                        
                        onAddToCart(cartItem);
                      };
                      
                      return (
                        <Button
                          size="sm"
                          onClick={handleAddWithPackages}
                          disabled={!isFinalValid}
                          className="flex items-center gap-1"
                        >
                          <PlusCircle className="h-3 w-3" />
                          Hinzufügen
                        </Button>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "Keine Produkte gefunden." : "Keine Produkte im Lager verfügbar."}
        </div>
      )}
    </div>
  );
}