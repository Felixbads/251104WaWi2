import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseConditionsBySupplier, PurchaseCondition, getSupplier, Supplier } from '../../lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, Plus, Minus, Package2, AlertCircle, Tag, ArrowRight } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { OrderMode } from './OrderModeSelector';
import { 
  calculatePackageInfo, 
  formatPackageDisplay, 
  formatTotalQuantity, 
  validatePackageOrder,
  getNextValidPackageQuantity,
  getPreviousValidPackageQuantity 
} from '../../../../shared/package-utils';

interface ProductSelectionTableProps {
  supplierId: number;
  warehouseId: number;
  sourceOrderId?: number | null;
  mode: OrderMode;
  selectedProducts: any[];
  setSelectedProducts?: (products: any[]) => void;
  onProductsChange?: (products: any[]) => void;
  onNext?: () => void;
  onBack?: () => void;
}

const ProductSelectionTable: React.FC<ProductSelectionTableProps> = ({
  supplierId,
  warehouseId,
  sourceOrderId,
  mode,
  selectedProducts,
  setSelectedProducts,
  onProductsChange,
  onNext,
  onBack
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 10;
  
  // Fetch products for the supplier using the enhanced API
  const { data: supplierProductsResponse, isLoading, error } = useQuery({
    queryKey: ['/api/suppliers', supplierId, 'products'],
    queryFn: async () => {
      if (!supplierId) return { data: [], meta: {} };
      const response = await fetch(`/api/suppliers/${supplierId}/products`);
      if (!response.ok) {
        throw new Error('Failed to fetch supplier products');
      }
      return response.json();
    },
    enabled: !!supplierId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Fetch supplier details to display name
  const { data: supplierData } = useQuery({
    queryKey: ['/api/suppliers', supplierId],
    queryFn: () => supplierId ? getSupplier(supplierId) : null,
    enabled: !!supplierId,
  });

  // Fetch purchase conditions for the supplier
  const { data: purchaseConditionsResponse } = useQuery({
    queryKey: ['/api/purchase-conditions', supplierId],
    queryFn: async () => {
      if (!supplierId) return { data: [] };
      try {
        const conditions = await getPurchaseConditionsBySupplier(supplierId);
        return { data: conditions };
      } catch (error) {
        console.warn('Failed to fetch purchase conditions:', error);
        return { data: [] };
      }
    },
    enabled: !!supplierId,
  });
  
  // Fetch products from source order if in copy mode
  const { data: sourceOrderData } = useQuery({
    queryKey: ['/api/orders-direct', sourceOrderId],
    enabled: mode === 'copy' && !!sourceOrderId,
  });

  const sourceOrderProducts = React.useMemo(() => {
    if (!sourceOrderData || !sourceOrderData.items) return [];
    return sourceOrderData.items.map((item: any) => ({
      id: item.product_id,
      orderQuantity: item.quantity,
      name: item.product_name || '',
      price: item.unit_price || item.price || 0,
      sku: item.sku || '',
      packageSize: item.package_size || 1
    }));
  }, [sourceOrderData]);
  
  // Fetch inventory for warehouse to show stock levels
  const { data: inventory } = useQuery({
    queryKey: ['/api/inventory', { warehouseId }],
    enabled: !!warehouseId,
  });
  
  // Fetch forecast data if in forecast mode
  const { data: forecastData } = useQuery({
    queryKey: ['/api/forecast', { warehouseId }],
    enabled: mode === 'forecast' && !!warehouseId,
  });
  
  // Convert supplier products response to products array
  const products = React.useMemo(() => {
    console.log('[ProductSelectionTable] Processing products response:', supplierProductsResponse);
    
    if (!supplierProductsResponse?.data || !Array.isArray(supplierProductsResponse.data)) {
      console.log('[ProductSelectionTable] No products data available');
      return [];
    }
    
    const processedProducts = supplierProductsResponse.data.map((product: any) => ({
      ...product,
      // Map productName to name for consistency
      name: product.productName || product.name || '',
      // KRITISCH: Verwende den korrigierten Preis (jetzt sollte unitPrice den Einkaufspreis enthalten)
      price: product.price || 0, // Die API liefert jetzt den Einkaufspreis im price-Feld
      // Add purchase condition information if available
      purchaseCondition: {
        unitPrice: product.unitPrice,
        taxRate: product.taxRate,
        grossPrice: product.grossPrice,
        minQuantity: product.minQuantity,
        packagingUnit: product.packagingUnit,
        packagingQuantity: product.packagingQuantity,
        deliveryTime: product.deliveryTime,
        isPreferred: product.isPreferred,
        notes: product.notes,
        leadTime: product.leadTime
      }
    }));
    
    console.log('[ProductSelectionTable] Processed products:', processedProducts.length, 'products');
    console.log('[ProductSelectionTable] First product:', processedProducts[0]);
    
    return processedProducts;
  }, [supplierProductsResponse]);
  
  // Map purchase conditions to a product-like format
  const purchaseConditionsProducts = React.useMemo(() => {
    if (!purchaseConditionsResponse?.data) return [];
    
    const purchaseConditions = purchaseConditionsResponse.data;
    return purchaseConditions.map((condition: PurchaseCondition) => ({
      id: condition.productId,
      name: condition.productName || `Produkt ID: ${condition.productId}`,
      productName: condition.productName || `Produkt ID: ${condition.productId}`,
      sku: condition.productSku,
      price: condition.unitPrice,
      packagingUnit: condition.packagingUnit,
      minQuantity: condition.minQuantity || 1,
      // Gebindegröße aus der Einkaufsbedingung
      packageSize: condition.packageSize || condition.minQuantity || 1,
      // Additional fields from purchase condition
      purchaseConditionId: condition.id,
      isPreferred: condition.isPreferred,
      validFrom: condition.validFrom,
      validTo: condition.validTo,
      notes: condition.notes,
      leadTime: condition.leadTime
    }));
  }, [purchaseConditionsResponse]);
  
  // Get supplier name if available
  const supplierName = React.useMemo(() => {
    if (!supplierData) return '';
    if (typeof supplierData === 'object' && 
        supplierData !== null && 
        'name' in supplierData) {
      return supplierData.name as string;
    }
    return '';
  }, [supplierData]);
  
  // Combine products with selection state and stock info
  const enrichedProducts = React.useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    
    return products.map((product: any) => {
      // Find if product is selected
      const selectedProduct = selectedProducts.find(p => p.id === product.id);
      
      // Find inventory info
      const inventoryItem = Array.isArray(inventory) 
        ? inventory.find((item: any) => item.productId === product.id)
        : null;
      
      // Find forecast info if in forecast mode
      const forecastItem = Array.isArray(forecastData)
        ? forecastData.find((item: any) => item.productId === product.id)
        : null;
      
      return {
        ...product,
        name: product.name || product.productName || '',
        orderQuantity: selectedProduct?.orderQuantity || 0,
        inStock: inventoryItem?.quantity || 0,
        lastOrderDate: selectedProduct?.lastOrderDate || null,
        forecastQuantity: forecastItem?.recommendedQuantity || 0,
      };
    });
  }, [products, selectedProducts, inventory, forecastData]);
  
  // Filter products based on search
  const filteredProducts = React.useMemo(() => {
    if (!enrichedProducts) return [];
    
    return enrichedProducts.filter((product: any) => {
      const name = product.name || product.productName || '';
      const sku = product.sku || '';
      const category = product.category || '';
      
      return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
             category.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [enrichedProducts, searchQuery]);
  
  // Paginate products
  const paginatedProducts = React.useMemo(() => {
    const startIndex = (currentPage - 1) * productsPerPage;
    return filteredProducts.slice(startIndex, startIndex + productsPerPage);
  }, [filteredProducts, currentPage, productsPerPage]);
  
  // Calculate number of pages
  const pageCount = Math.ceil(filteredProducts.length / productsPerPage);
  
  // Load source order products when in copy mode
  useEffect(() => {
    if (mode === 'copy' && sourceOrderProducts && Array.isArray(sourceOrderProducts) && sourceOrderProducts.length > 0) {
      // Only update if we don't already have selected products
      if (selectedProducts.length === 0) {
        if (onProductsChange) {
          onProductsChange(sourceOrderProducts);
        }
        if (setSelectedProducts) {
          setSelectedProducts(sourceOrderProducts);
        }
      }
    }
  }, [mode, sourceOrderProducts, selectedProducts.length, onProductsChange, setSelectedProducts]);
  
  // Load forecast quantities when in forecast mode
  useEffect(() => {
    if (mode === 'forecast' && forecastData && Array.isArray(forecastData) && forecastData.length > 0 && products && Array.isArray(products)) {
      // Only update if we don't already have selected products
      if (selectedProducts.length === 0) {
        const forecastProducts = products.map((product: any) => {
          const forecastItem = forecastData.find((item: any) => item.productId === product.id);
          return {
            ...product,
            orderQuantity: forecastItem?.recommendedQuantity || 0
          };
        }).filter((product: any) => product.orderQuantity > 0);
        
        if (onProductsChange) {
          onProductsChange(forecastProducts);
        }
        if (setSelectedProducts) {
          setSelectedProducts(forecastProducts);
        }
      }
    }
  }, [mode, forecastData, products, selectedProducts.length, onProductsChange, setSelectedProducts]);
  
  // Handle quantity change with package validation
  const handleQuantityChange = (productId: number, quantity: number) => {
    const product = enrichedProducts.find((p: any) => p.id === productId);
    if (!product) return;
    
    const packageSize = product.packageQuantity || product.packageSize || 1;
    const packageTypeName = product.packageTypeName || "Stück";
    const baseUnitName = product.baseUnitName || "Stück";
    
    // Validate that quantity is a multiple of package size
    if (quantity > 0 && quantity % packageSize !== 0) {
      // Round to nearest package multiple
      const packageCount = Math.round(quantity / packageSize);
      quantity = packageCount * packageSize;
    }
    
    const updatedProducts = [...selectedProducts];
    const productIndex = updatedProducts.findIndex(p => p.id === productId);
    
    if (productIndex >= 0) {
      // Update existing product
      if (quantity <= 0) {
        // Remove product if quantity is zero or negative
        updatedProducts.splice(productIndex, 1);
      } else {
        // Update quantity with package information
        updatedProducts[productIndex] = {
          ...updatedProducts[productIndex],
          orderQuantity: quantity,
          packageCount: quantity / packageSize,
          packageQuantity: packageSize,
          packageTypeName,
          baseUnitName,
          supplierSku: product.supplierSku || product.articleSupplier
        };
      }
    } else if (quantity > 0) {
      // Add new product with package information
      updatedProducts.push({
        id: productId,
        name: product.name || product.productName || '',
        productName: product.productName || product.name || '',
        price: product.price,
        sku: product.sku,
        supplierSku: product.supplierSku || product.articleSupplier,
        orderQuantity: quantity,
        packageSize: packageSize, // Legacy field
        packageCount: quantity / packageSize,
        packageQuantity: packageSize,
        packageTypeName,
        baseUnitName
      });
    }
    
    if (onProductsChange) {
      onProductsChange(updatedProducts);
    }
    if (setSelectedProducts) {
      setSelectedProducts(updatedProducts);
    }
  };
  
  // Increment quantity basierend auf Gebindegröße
  const incrementQuantity = (productId: number) => {
    const selectedProduct = selectedProducts.find(p => p.id === productId);
    const product = enrichedProducts.find((p: any) => p.id === productId);
    const packageSize = product?.packageQuantity || product?.packageSize || 1;
    const currentQuantity = selectedProduct?.orderQuantity || 0;
    
    // Wenn die aktuelle Menge 0 ist, setzen wir sie auf die Gebindegröße,
    // ansonsten erhöhen wir um die Gebindegröße
    const newQuantity = currentQuantity === 0 ? packageSize : currentQuantity + packageSize;
    handleQuantityChange(productId, newQuantity);
  };
  
  // Decrement quantity basierend auf Gebindegröße
  const decrementQuantity = (productId: number) => {
    const selectedProduct = selectedProducts.find(p => p.id === productId);
    const product = enrichedProducts.find((p: any) => p.id === productId);
    const packageSize = product?.packageQuantity || product?.packageSize || 1;
    const currentQuantity = selectedProduct?.orderQuantity || 0;
    
    if (currentQuantity > 0) {
      // Reduzieren um die Gebindegröße, aber nicht unter 0
      const newQuantity = Math.max(0, currentQuantity - packageSize);
      handleQuantityChange(productId, newQuantity);
    }
  };
  
  // Render pagination controls
  const renderPagination = () => {
    if (pageCount <= 1) return null;
    
    const pageItems = [];
    const maxDisplayedPages = 5;
    
    // Always show first page
    pageItems.push(
      <PaginationItem key="first">
        <PaginationLink 
          onClick={() => setCurrentPage(1)} 
          isActive={currentPage === 1}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );
    
    // Show ellipsis if needed
    if (currentPage > 3) {
      pageItems.push(
        <PaginationItem key="ellipsis1">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }
    
    // Calculate range of pages to show
    let startPage = Math.max(2, currentPage - 1);
    let endPage = Math.min(pageCount - 1, currentPage + 1);
    
    // Adjust range to show more pages if we're at the start or end
    if (currentPage <= 3) {
      endPage = Math.min(pageCount - 1, maxDisplayedPages - 1);
    }
    if (currentPage >= pageCount - 2) {
      startPage = Math.max(2, pageCount - maxDisplayedPages + 2);
    }
    
    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      pageItems.push(
        <PaginationItem key={i}>
          <PaginationLink 
            onClick={() => setCurrentPage(i)} 
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    // Show ellipsis if needed
    if (currentPage < pageCount - 2) {
      pageItems.push(
        <PaginationItem key="ellipsis2">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }
    
    // Always show last page if there's more than one page
    if (pageCount > 1) {
      pageItems.push(
        <PaginationItem key="last">
          <PaginationLink 
            onClick={() => setCurrentPage(pageCount)} 
            isActive={currentPage === pageCount}
          >
            {pageCount}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    return (
      <Pagination className="mt-4">
        <PaginationContent>
          <PaginationItem>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="cursor-pointer"
            >
              <PaginationPrevious />
            </Button>
          </PaginationItem>
          
          {pageItems}
          
          <PaginationItem>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setCurrentPage(prev => Math.min(pageCount, prev + 1))}
              disabled={currentPage === pageCount}
              className="cursor-pointer"
            >
              <PaginationNext />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };
  
  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produkte auswählen</CardTitle>
          <CardDescription>Produkte werden geladen...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Lade Produkte für {supplierName}...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produkte auswählen</CardTitle>
          <CardDescription>Fehler beim Laden der Produkte</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-destructive/15 p-8 rounded-md text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <h3 className="text-lg font-medium text-destructive mb-2">Fehler beim Laden der Produkte</h3>
            <p className="text-muted-foreground mb-4">
              Bitte versuchen Sie es später erneut.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onBack}>
                Zurück
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produkte auswählen</CardTitle>
        <CardDescription>
          {supplierName ? (
            <>Lieferant: <strong>{supplierName}</strong> - Wählen Sie die Produkte und Mengen für Ihre Bestellung aus.</>
          ) : (
            <>Wählen Sie die Produkte und Mengen für Ihre Bestellung aus.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Produkte suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
          </div>
          
          <div className="flex gap-2">
            <Badge variant="outline" className="flex items-center gap-1 py-2">
              <Package2 className="w-3 h-3" />
              <span>{Array.isArray(selectedProducts) ? selectedProducts.length : 0} Produkte</span>
            </Badge>
            
            <Badge variant="outline" className="flex items-center gap-1 py-2">
              <Tag className="w-3 h-3" />
              <span>Gesamtmenge: {Array.isArray(selectedProducts) ? selectedProducts.reduce((sum, p) => sum + (p?.orderQuantity || 0), 0) : 0}</span>
            </Badge>
          </div>
        </div>
        
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <div className="bg-destructive/20 p-4 rounded-md text-destructive">
            Fehler beim Laden der Produkte. Bitte versuchen Sie es später erneut.
          </div>
        ) : filteredProducts.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produktname</TableHead>
                  <TableHead className="text-right">Artikelnummer</TableHead>
                  <TableHead className="text-right">Lieferanten-Art.-Nr.</TableHead>
                  <TableHead className="text-right">Gebinde</TableHead>
                  <TableHead className="text-right">Lagerbestand</TableHead>
                  <TableHead className="text-right">Anzahl Gebinde</TableHead>
                  <TableHead className="text-right">Gesamtanzahl</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product: any) => {
                  const selectedProduct = selectedProducts.find(p => p.id === product.id);
                  const orderQuantity = selectedProduct?.orderQuantity || 0;
                  const isSelected = orderQuantity > 0;
                  
                  const packageInfo = calculatePackageInfo({
                    ...product,
                    orderQuantity
                  });
                  const packageDisplayText = formatPackageDisplay(packageInfo);
                  const packageSize = packageInfo.packageQuantity;
                  
                  return (
                    <TableRow 
                      key={product.id} 
                      className={isSelected ? 'bg-primary/10' : ''}
                    >
                      <TableCell className="font-medium">
                        <div>
                          {product.name}
                          {mode === 'forecast' && product.forecastQuantity > 0 && (
                            <Badge variant="outline" className="ml-2 bg-blue-50">
                              Empfohlen: {product.forecastQuantity}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {product.sku || '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {product.supplierSku || product.articleSupplier || '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {packageDisplayText}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.inStock}
                        {product.inStock <= 5 && (
                          <AlertCircle className="inline ml-1 h-4 w-4 text-amber-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => decrementQuantity(product.id)}
                            disabled={orderQuantity === 0}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={packageInfo.packageCount}
                            onChange={(e) => {
                              const newPackageCount = parseInt(e.target.value) || 0;
                              const newQuantity = newPackageCount * packageSize;
                              handleQuantityChange(product.id, newQuantity);
                            }}
                            className="w-16 h-8 text-center"
                            placeholder="0"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => incrementQuantity(product.id)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatTotalQuantity(packageInfo.totalQuantity, packageInfo.baseUnitName)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
            {renderPagination()}
            
            <div className="flex justify-between mt-6">
              <Button
                variant="outline"
                onClick={onBack}
                className="gap-2"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Zurück
              </Button>
              
              <Button
                onClick={onNext}
                disabled={selectedProducts.length === 0}
                className="gap-2"
              >
                Bestätigen
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="bg-muted p-8 rounded-md flex flex-col items-center justify-center text-center">
            <Package2 className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Produkte gefunden</h3>
            <p className="text-muted-foreground">
              {searchQuery 
                ? `Keine Produkte gefunden, die zu "${searchQuery}" passen.` 
                : "Keine Produkte für diesen Lieferanten verfügbar."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductSelectionTable;