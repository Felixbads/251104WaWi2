import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Calendar, Package, Minus, Plus } from "lucide-react";
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
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  calculatePackageInfo,
  formatPackageDisplay,
  formatTotalQuantity,
  parsePackageSizeToQuantity,
  getPackageTypeName,
  createProductWithPackageInfo,
  calculateDualFieldTotal,
  splitTotalToPackageFields,
  formatPackageInfoForUI,
  Product
} from '../../../../shared/package-utils';

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

interface InventoryProductsTableProps {
  products: InventoryProduct[];
  onAddToCart: (product: InventoryProduct, quantity: number, batchIds?: number[]) => void;
  warehouseId: number;
}

export default function InventoryProductsTable({
  products,
  onAddToCart,
  warehouseId
}: InventoryProductsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [selectedBatches, setSelectedBatches] = useState<Record<number, number[]>>({});
  const { cartItems } = useInventoryCart();

  // Package-based quantity states
  const [packageCounts, setPackageCounts] = useState<Record<number, number>>({});
  const [totalQuantities, setTotalQuantities] = useState<Record<number, number>>({});

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

  // Hilfsfunktion: Verfügbare Menge berechnen (Lagerbestand - Warenkorb-Menge)
  const getAvailableQuantity = (product: InventoryProduct) => {
    const cartItem = cartItems.find(item => item.productId === product.productId);
    const cartQuantity = cartItem ? cartItem.quantity : 0;
    const batchQuantity = getAvailableQuantityFromBatches(product);
    return Math.max(0, batchQuantity - cartQuantity);
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

  // Handler: Anzahl Gebinde ändern (automatisch Gesamtanzahl berechnen)
  const handlePackageCountChange = (productId: number, value: string) => {
    const packageCount = Math.max(0, parseInt(value) || 0);
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Verwende package_size aus der Datenbank für einheitliche Logik
    const packageQuantity = parsePackageSizeToQuantity(product.packageSize);
    const currentIndividualCount = totalQuantities[productId] ? 
      splitTotalToPackageFields(totalQuantities[productId], packageQuantity).individualCount : 0;
    const totalQuantity = calculateDualFieldTotal(packageCount, currentIndividualCount, packageQuantity);
    
    setPackageCounts(prev => ({ ...prev, [productId]: packageCount }));
    setTotalQuantities(prev => ({ ...prev, [productId]: totalQuantity }));
  };

  // Handler: Gesamtanzahl ändern (automatisch Gebinde-Anzahl berechnen)
  const handleTotalQuantityChange = (productId: number, value: string) => {
    const totalQuantity = Math.max(0, parseInt(value) || 0);
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Verwende package_size aus der Datenbank für einheitliche Logik
    const packageQuantity = parsePackageSizeToQuantity(product.packageSize);
    const { packageCount, individualCount } = splitTotalToPackageFields(totalQuantity, packageQuantity);
    
    setTotalQuantities(prev => ({ ...prev, [productId]: totalQuantity }));
    setPackageCounts(prev => ({ ...prev, [productId]: packageCount }));
  };

  // Increment package count
  const incrementPackageCount = (productId: number) => {
    const currentCount = packageCounts[productId] || 0;
    handlePackageCountChange(productId, (currentCount + 1).toString());
  };

  // Decrement package count
  const decrementPackageCount = (productId: number) => {
    const currentCount = packageCounts[productId] || 0;
    if (currentCount > 0) {
      handlePackageCountChange(productId, (currentCount - 1).toString());
    }
  };

  // Increment total quantity based on package size
  const incrementTotalQuantity = (productId: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const packageQuantity = parsePackageSizeToQuantity(product.packageSize);
    const currentTotal = totalQuantities[productId] || 0;
    
    // If no current quantity, add one package, otherwise add package quantity
    const newTotal = currentTotal === 0 ? packageQuantity : currentTotal + packageQuantity;
    handleTotalQuantityChange(productId, newTotal.toString());
  };

  // Decrement total quantity based on package size
  const decrementTotalQuantity = (productId: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const packageQuantity = parsePackageSizeToQuantity(product.packageSize);
    const currentTotal = totalQuantities[productId] || 0;
    
    if (currentTotal > 0) {
      const newTotal = Math.max(0, currentTotal - packageQuantity);
      handleTotalQuantityChange(productId, newTotal.toString());
    }
  };

  // Fügt ein Produkt zum Warenkorb hinzu
  const handleAddToCart = (product: InventoryProduct) => {
    const totalQuantity = totalQuantities[product.id] || 0;
    const selectedBatchIds = selectedBatches[product.productId] || [];
    
    const availableQuantity = getAvailableQuantity(product);
    if (totalQuantity > 0 && totalQuantity <= availableQuantity) {
      // Nur Chargen-IDs übertragen, wenn welche ausgewählt sind
      const batchIdsToTransfer = selectedBatchIds.length > 0 ? selectedBatchIds : undefined;
      onAddToCart(product, totalQuantity, batchIdsToTransfer);
      
      // Zurücksetzen der Auswahl und Menge nach dem Hinzufügen
      const newSelected = new Set(selectedRows);
      newSelected.delete(product.id);
      setSelectedRows(newSelected);
      
      // Reset quantities
      setPackageCounts(prev => ({ ...prev, [product.id]: 0 }));
      setTotalQuantities(prev => ({ ...prev, [product.id]: 0 }));
      
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

  // Fügt alle ausgewählten Produkte zum Warenkorb hinzu
  const handleAddSelectedToCart = () => {
    selectedRows.forEach(productId => {
      const product = products.find(p => p.id === productId);
      if (product) {
        handleAddToCart(product);
      }
    });
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
              <TableHead>Gebinde</TableHead>
              <TableHead>Lagerbestand</TableHead>
              <TableHead>Chargen</TableHead>
              <TableHead className="text-center">Anzahl Gebinde</TableHead>
              <TableHead className="text-center">Gesamtanzahl</TableHead>
              <TableHead>Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product) => {
              const availableQuantity = getAvailableQuantity(product);
              const productWithPackageInfo = createProductWithPackageInfo(product);
              const packageInfo = calculatePackageInfo({
                ...productWithPackageInfo,
                orderQuantity: totalQuantities[product.id] || 0
              });
              
              const packageDisplayText = formatPackageDisplay(packageInfo);
              const packageCount = packageCounts[product.id] || 0;
              const totalQuantity = totalQuantities[product.id] || 0;
              const hasPackaging = packageInfo.packageQuantity > 1;

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
                    <div className="text-sm">
                      <span className="text-muted-foreground">
                        {hasPackaging ? packageDisplayText : 'Einzelstück'}
                      </span>
                      {product.packageSize && (
                        <div className="text-xs text-muted-foreground">
                          {product.packageSize}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{availableQuantity} Stück verfügbar</div>
                      {hasPackaging && (
                        <div className="text-muted-foreground">
                          {Math.floor(availableQuantity / packageInfo.packageQuantity)} Gebinde verfügbar
                        </div>
                      )}
                      {availableQuantity < product.quantity && (
                        <div className="text-xs text-orange-600">
                          ({product.quantity - availableQuantity} im Warenkorb)
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
                  
                  {/* Anzahl Gebinde Input */}
                  <TableCell>
                    {hasPackaging ? (
                      <div className="flex items-center gap-1 w-32">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => decrementPackageCount(product.id)}
                          disabled={packageCount <= 0}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        
                        <Input
                          type="number"
                          min="0"
                          value={packageCount || ''}
                          onChange={(e) => handlePackageCountChange(product.id, e.target.value)}
                          className="h-8 text-center [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="0"
                        />
                        
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => incrementPackageCount(product.id)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground text-center block">-</span>
                    )}
                  </TableCell>

                  {/* Gesamtanzahl Input */}
                  <TableCell>
                    <div className="flex items-center gap-1 w-32">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => decrementTotalQuantity(product.id)}
                        disabled={totalQuantity <= 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      
                      <Input
                        type="number"
                        min="0"
                        max={availableQuantity}
                        value={totalQuantity || ''}
                        onChange={(e) => handleTotalQuantityChange(product.id, e.target.value)}
                        className={`h-8 text-center [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          totalQuantity > 0 && totalQuantity > availableQuantity ? 'border-red-500' : ''
                        }`}
                        placeholder="0"
                      />
                      
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => incrementTotalQuantity(product.id)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    {totalQuantity > 0 && totalQuantity > availableQuantity && (
                      <div className="text-xs text-red-600 mt-1">
                        Max. {availableQuantity} verfügbar
                      </div>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <Button
                      onClick={() => handleAddToCart(product)}
                      disabled={totalQuantity <= 0 || totalQuantity > availableQuantity}
                      size="sm"
                      className="h-8"
                    >
                      <PlusCircle className="h-3 w-3 mr-1" />
                      Hinzufügen
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        
        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {searchTerm ? "Keine Produkte gefunden" : "Keine Produkte verfügbar"}
          </div>
        )}
      </div>
    </div>
  );
}