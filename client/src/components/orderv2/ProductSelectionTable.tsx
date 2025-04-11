import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, RefreshCw, AlertTriangle, Plus, AlertCircle, Package, ArrowUpDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrderMode = 'new' | 'copy' | 'forecast';

type ProductSelectionTableProps = {
  supplierId: number;
  warehouseId: number;
  sourceOrderId: number | null;
  mode: OrderMode;
  selectedProducts: any[];
  onProductsChange: (products: any[]) => void;
};

interface ProductType {
  id: number;
  name: string;
  description?: string;
  unit?: string;
  price?: number;
  category?: string;
  supplierId?: number;
  supplierName?: string;
  orderQuantity?: number;
  currentStock?: number;
  minStock?: number;
  suggestedOrderQuantity?: number;
}

const ProductSelectionTable: React.FC<ProductSelectionTableProps> = ({
  supplierId,
  warehouseId,
  sourceOrderId,
  mode,
  selectedProducts,
  onProductsChange
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  
  // Fetch products by supplier
  const { 
    data: supplierProducts, 
    isLoading: isLoadingProducts, 
    error: productsError 
  } = useQuery<ProductType[]>({
    queryKey: ['/api/products/supplier', supplierId],
    enabled: supplierId > 0,
  });
  
  // Fetch inventory items for the selected warehouse
  const { 
    data: inventoryItems, 
    isLoading: isLoadingInventory, 
    error: inventoryError 
  } = useQuery<any[]>({
    queryKey: ['/api/inventory/warehouse', warehouseId],
    enabled: warehouseId > 0,
  });
  
  // Fetch source order items if in copy mode
  const { 
    data: sourceOrderItems, 
    isLoading: isLoadingSourceOrder, 
    error: sourceOrderError 
  } = useQuery<any[]>({
    queryKey: ['/api/orders', sourceOrderId, 'items'],
    enabled: mode === 'copy' && sourceOrderId !== null,
  });
  
  // Fetch forecast data if in forecast mode
  const { 
    data: forecastData, 
    isLoading: isLoadingForecast, 
    error: forecastError 
  } = useQuery<any[]>({
    queryKey: ['/api/forecast/recommended-order', warehouseId],
    enabled: mode === 'forecast' && warehouseId > 0,
  });
  
  // Combine product data with inventory information
  const products = React.useMemo(() => {
    if (!supplierProducts) return [];
    
    return supplierProducts.map(product => {
      // Find inventory data
      const inventoryItem = inventoryItems?.find(item => item.productId === product.id);
      
      // Find source order quantity if in copy mode
      const sourceOrderItem = sourceOrderItems?.find(item => item.productId === product.id);
      
      // Find forecast data if in forecast mode
      const forecastItem = forecastData?.find(item => item.productId === product.id);
      
      // Determine suggested order quantity based on mode
      let suggestedOrderQuantity = 0;
      
      if (mode === 'copy' && sourceOrderItem) {
        suggestedOrderQuantity = sourceOrderItem.quantity || 0;
      } else if (mode === 'forecast' && forecastItem) {
        suggestedOrderQuantity = forecastItem.recommendedOrderQuantity || 0;
      }
      
      // Return combined product data
      return {
        ...product,
        currentStock: inventoryItem?.quantity || 0,
        minStock: inventoryItem?.minQuantity || product.minStock || 0,
        suggestedOrderQuantity: suggestedOrderQuantity,
        orderQuantity: 0, // Will be updated from selectedProducts
      };
    });
  }, [supplierProducts, inventoryItems, sourceOrderItems, forecastData, mode]);
  
  // Update products with selected quantities
  useEffect(() => {
    // Create a map of selected products by ID for quick lookup
    const selectedProductsMap = new Map(
      selectedProducts.map(product => [product.id, product])
    );
    
    // Update the orderQuantity for each product
    const updatedProducts = products.map(product => {
      const selectedProduct = selectedProductsMap.get(product.id);
      return {
        ...product,
        orderQuantity: selectedProduct ? selectedProduct.orderQuantity : 0
      };
    });
    
    // Filter out any selected products that are not in the current products list
    // (this can happen if the supplier changes)
    const currentProductIds = new Set(updatedProducts.map(p => p.id));
    const filteredSelectedProducts = selectedProducts.filter(p => currentProductIds.has(p.id));
    
    if (filteredSelectedProducts.length !== selectedProducts.length) {
      onProductsChange(filteredSelectedProducts);
    }
    
  }, [products, selectedProducts, onProductsChange]);
  
  // Handle order quantity change
  const handleOrderQuantityChange = (productId: number, quantity: number) => {
    const product = products.find(p => p.id === productId);
    
    if (!product) return;
    
    const newSelectedProducts = [...selectedProducts];
    const existingIndex = newSelectedProducts.findIndex(p => p.id === productId);
    
    if (quantity > 0) {
      const productToAdd = {
        ...product,
        orderQuantity: quantity
      };
      
      if (existingIndex >= 0) {
        newSelectedProducts[existingIndex] = productToAdd;
      } else {
        newSelectedProducts.push(productToAdd);
      }
    } else {
      // Remove product if quantity is 0
      if (existingIndex >= 0) {
        newSelectedProducts.splice(existingIndex, 1);
      }
    }
    
    onProductsChange(newSelectedProducts);
  };
  
  // Apply suggested quantities to all products
  const applySuggestedQuantities = () => {
    const newSelectedProducts = products
      .filter(product => product.suggestedOrderQuantity > 0)
      .map(product => ({
        ...product,
        orderQuantity: product.suggestedOrderQuantity
      }));
    
    onProductsChange(newSelectedProducts);
  };
  
  // Filter and sort products
  const filteredAndSortedProducts = React.useMemo(() => {
    let result = [...products];
    
    // Apply search filter
    if (searchQuery) {
      result = result.filter(product => 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Show only selected products if option is enabled
    if (showOnlySelected) {
      const selectedProductIds = new Set(selectedProducts.map(p => p.id));
      result = result.filter(product => selectedProductIds.has(product.id));
    }
    
    // Sort products
    result.sort((a, b) => {
      let aValue = a[sortField as keyof ProductType];
      let bValue = b[sortField as keyof ProductType];
      
      // Handle null/undefined values
      if (aValue === undefined || aValue === null) aValue = '';
      if (bValue === undefined || bValue === null) bValue = '';
      
      // Sort logic
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc' 
          ? Number(aValue) - Number(bValue) 
          : Number(bValue) - Number(aValue);
      }
    });
    
    return result;
  }, [products, searchQuery, showOnlySelected, selectedProducts, sortField, sortDirection]);
  
  // Handle sort change
  const handleSortChange = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Get stock level class
  const getStockLevelClass = (current: number, min: number) => {
    if (current <= 0) return 'text-destructive';
    if (current < min) return 'text-amber-500 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  };
  
  // Loading state
  const isLoading = isLoadingProducts || isLoadingInventory || 
    (mode === 'copy' && isLoadingSourceOrder) || 
    (mode === 'forecast' && isLoadingForecast);
  
  // Error state
  const hasError = productsError || inventoryError || 
    (mode === 'copy' && sourceOrderError) || 
    (mode === 'forecast' && forecastError);
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Produkte suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-selected" 
              checked={showOnlySelected} 
              onCheckedChange={(checked) => setShowOnlySelected(!!checked)}
            />
            <label
              htmlFor="show-selected"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Nur ausgewählte anzeigen
            </label>
          </div>
          
          {mode !== 'new' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-2"
              onClick={applySuggestedQuantities}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Vorgeschlagene Mengen übernehmen
            </Button>
          )}
        </div>
      </div>
      
      {selectedProducts.length > 0 && (
        <div className="bg-primary/10 p-3 rounded-md flex items-center justify-between">
          <span>
            <span className="font-medium">{selectedProducts.length}</span> Produkte ausgewählt
          </span>
          <span className="font-medium">
            Gesamtbetrag: {
              new Intl.NumberFormat('de-DE', {
                style: 'currency',
                currency: 'EUR'
              }).format(
                selectedProducts.reduce((sum, product) => sum + (product.price || 0) * product.orderQuantity, 0)
              )
            }
          </span>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Daten werden geladen...</span>
        </div>
      ) : hasError ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Fehler beim Laden der Daten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Es ist ein Fehler beim Laden der Produktdaten aufgetreten. 
              Bitte versuchen Sie es später erneut oder wählen Sie einen anderen Lieferanten.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Seite neu laden
            </Button>
          </CardFooter>
        </Card>
      ) : filteredAndSortedProducts.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              Keine Produkte gefunden. Bitte versuchen Sie eine andere Suche oder wählen Sie einen anderen Lieferanten.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px] rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-[40%]">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleSortChange('name')}
                        className="flex items-center font-semibold p-0 h-auto"
                      >
                        Produkt
                        {sortField === 'name' && (
                          <ArrowUpDown className={`h-4 w-4 ml-1 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleSortChange('currentStock')}
                        className="flex items-center font-semibold p-0 h-auto"
                      >
                        Bestand
                        {sortField === 'currentStock' && (
                          <ArrowUpDown className={`h-4 w-4 ml-1 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Mindestbestand</TableHead>
                    <TableHead className="text-right">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleSortChange('price')}
                        className="flex items-center font-semibold justify-end p-0 h-auto"
                      >
                        Preis
                        {sortField === 'price' && (
                          <ArrowUpDown className={`h-4 w-4 ml-1 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">
                      {mode !== 'new' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center cursor-help">
                                Vorschlag
                                <AlertCircle className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {mode === 'copy' 
                                ? 'Menge aus der Quellbestellung' 
                                : 'Von der Prognose vorgeschlagene Menge'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableHead>
                    <TableHead className="text-center">Bestellmenge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedProducts.map(product => {
                    const isSelected = selectedProducts.some(p => p.id === product.id);
                    
                    // Find the selected product to get the current order quantity
                    const selectedProduct = selectedProducts.find(p => p.id === product.id);
                    const orderQuantity = selectedProduct ? selectedProduct.orderQuantity : 0;
                    
                    return (
                      <TableRow 
                        key={product.id}
                        className={isSelected ? 'bg-primary/5' : ''}
                      >
                        <TableCell className="font-medium">
                          <div>
                            {product.name}
                            {product.category && (
                              <Badge variant="outline" className="ml-2">
                                {product.category}
                              </Badge>
                            )}
                          </div>
                          {product.description && (
                            <p className="text-xs text-muted-foreground mt-1">{product.description}</p>
                          )}
                        </TableCell>
                        <TableCell className={`text-right ${getStockLevelClass(product.currentStock, product.minStock)}`}>
                          {product.currentStock} {product.unit || 'Stk.'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {product.minStock} {product.unit || 'Stk.'}
                        </TableCell>
                        <TableCell className="text-right">
                          {product.price 
                            ? new Intl.NumberFormat('de-DE', {
                                style: 'currency',
                                currency: 'EUR'
                              }).format(product.price)
                            : 'Auf Anfrage'
                          }
                        </TableCell>
                        <TableCell className="text-center">
                          {mode !== 'new' && product.suggestedOrderQuantity > 0 && (
                            <Badge variant="outline" className="bg-muted">
                              {product.suggestedOrderQuantity} {product.unit || 'Stk.'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <div className="w-32">
                              <div className="flex items-center rounded-md border">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-r-none"
                                  onClick={() => handleOrderQuantityChange(product.id, Math.max(0, orderQuantity - 1))}
                                  disabled={orderQuantity <= 0}
                                >
                                  <span className="sr-only">Verringern</span>
                                  <span className="text-xl">-</span>
                                </Button>
                                <Input
                                  type="number"
                                  min="0"
                                  value={orderQuantity}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    if (!isNaN(value) && value >= 0) {
                                      handleOrderQuantityChange(product.id, value);
                                    }
                                  }}
                                  className="h-8 w-12 border-0 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-l-none"
                                  onClick={() => handleOrderQuantityChange(product.id, orderQuantity + 1)}
                                >
                                  <span className="sr-only">Erhöhen</span>
                                  <span className="text-xl">+</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProductSelectionTable;