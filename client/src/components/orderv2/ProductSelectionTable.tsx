import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Search, Plus, Minus, Package2, AlertCircle, Tag } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { OrderMode } from './OrderModeSelector';

interface ProductSelectionTableProps {
  supplierId: number;
  warehouseId: number;
  sourceOrderId?: number | null;
  mode: OrderMode;
  selectedProducts: any[];
  onProductsChange: (products: any[]) => void;
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
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 10;
  
  // Fetch products for the supplier
  const { data: products, isLoading, error } = useQuery({
    queryKey: ['/api/products', { supplierId }],
    enabled: !!supplierId,
  });
  
  // Fetch products from source order if in copy mode
  const { data: sourceOrderProducts } = useQuery({
    queryKey: ['/api/orders', sourceOrderId, 'products'],
    enabled: mode === 'copy' && !!sourceOrderId,
  });
  
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
    
    return enrichedProducts.filter((product: any) => 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );
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
        onProductsChange(sourceOrderProducts);
      }
    }
  }, [mode, sourceOrderProducts, selectedProducts.length, onProductsChange]);
  
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
        
        onProductsChange(forecastProducts);
      }
    }
  }, [mode, forecastData, products, selectedProducts.length, onProductsChange]);
  
  // Handle quantity change
  const handleQuantityChange = (productId: number, quantity: number) => {
    const updatedProducts = [...selectedProducts];
    const productIndex = updatedProducts.findIndex(p => p.id === productId);
    
    if (productIndex >= 0) {
      // Update existing product
      if (quantity <= 0) {
        // Remove product if quantity is zero or negative
        updatedProducts.splice(productIndex, 1);
      } else {
        // Update quantity
        updatedProducts[productIndex].orderQuantity = quantity;
      }
    } else if (quantity > 0) {
      // Add new product
      const product = enrichedProducts.find((p: any) => p.id === productId);
      if (product) {
        updatedProducts.push({
          id: productId,
          name: product.name,
          price: product.price,
          sku: product.sku,
          orderQuantity: quantity
        });
      }
    }
    
    onProductsChange(updatedProducts);
  };
  
  // Increment quantity
  const incrementQuantity = (productId: number) => {
    const selectedProduct = selectedProducts.find(p => p.id === productId);
    const currentQuantity = selectedProduct?.orderQuantity || 0;
    handleQuantityChange(productId, currentQuantity + 1);
  };
  
  // Decrement quantity
  const decrementQuantity = (productId: number) => {
    const selectedProduct = selectedProducts.find(p => p.id === productId);
    const currentQuantity = selectedProduct?.orderQuantity || 0;
    if (currentQuantity > 0) {
      handleQuantityChange(productId, currentQuantity - 1);
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
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Produkte auswählen</CardTitle>
        <CardDescription>
          Wählen Sie die Produkte und Mengen für Ihre Bestellung aus.
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
              <span>{selectedProducts.length} Produkte</span>
            </Badge>
            
            <Badge variant="outline" className="flex items-center gap-1 py-2">
              <Tag className="w-3 h-3" />
              <span>Gesamtmenge: {selectedProducts.reduce((sum, p) => sum + p.orderQuantity, 0)}</span>
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
                  <TableHead className="hidden md:table-cell">SKU</TableHead>
                  <TableHead className="text-right">Preis</TableHead>
                  <TableHead className="text-right">Lagerbestand</TableHead>
                  <TableHead className="text-right">Menge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product: any) => {
                  const selectedProduct = selectedProducts.find(p => p.id === product.id);
                  const orderQuantity = selectedProduct?.orderQuantity || 0;
                  const isSelected = orderQuantity > 0;
                  
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
                      <TableCell className="hidden md:table-cell">{product.sku || '-'}</TableCell>
                      <TableCell className="text-right">{product.price?.toFixed(2) || '-'} €</TableCell>
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
                            value={orderQuantity}
                            onChange={(e) => handleQuantityChange(product.id, parseInt(e.target.value) || 0)}
                            className="w-16 h-8 text-center"
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
            {renderPagination()}
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