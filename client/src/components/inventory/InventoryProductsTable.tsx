import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  AlertTriangle, 
  Plus, 
  FileDown, 
  MoreHorizontal 
} from 'lucide-react';
import { useInventoryCart } from './InventoryCartContext';

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export interface InventoryProduct {
  id: string | number;
  productId: string;
  productName: string;
  quantity: number;
  sku?: string;
  category?: string;
  minQuantity?: number;
  price?: number;
  warehouseId?: number;
  warehouseName?: string;
}

interface InventoryProductsTableProps {
  products: InventoryProduct[];
  isLoading?: boolean;
  error?: any;
  title?: string;
  description?: string;
  onAddToCart?: (product: InventoryProduct, quantity: number) => void;
  showBulkActions?: boolean;
}

export default function InventoryProductsTable({
  products,
  isLoading = false,
  error,
  title = "Produkte",
  description = "Wählen Sie Produkte aus",
  onAddToCart,
  showBulkActions = true
}: InventoryProductsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const { addItem, isInCart } = useInventoryCart();

  // Filter products based on search term
  const filteredProducts = products.filter(product => 
    product.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Reset selections when products change
  useEffect(() => {
    setSelectedProducts(new Set());
  }, [products]);

  // Handle product selection
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(productId)) {
        newSelection.delete(productId);
      } else {
        newSelection.add(productId);
      }
      return newSelection;
    });
  };

  // Toggle select all products
  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      // If all are selected, clear selection
      setSelectedProducts(new Set());
    } else {
      // Otherwise, select all filtered products
      setSelectedProducts(new Set(filteredProducts.map(p => p.productId)));
    }
  };

  // Handle add to cart for a single product
  const handleAddToCart = (product: InventoryProduct, quantity: number = 1) => {
    if (onAddToCart) {
      onAddToCart(product, quantity);
    } else {
      addItem({
        productId: product.productId,
        productName: product.productName,
        quantity,
        currentStock: product.quantity,
        sku: product.sku
      });
    }
  };

  // Handle bulk add to cart
  const handleBulkAddToCart = () => {
    if (selectedProducts.size === 0) return;
    
    selectedProducts.forEach(productId => {
      const product = products.find(p => p.productId === productId);
      if (product) {
        handleAddToCart(product, bulkQuantity);
      }
    });
    
    // Clear selection after adding
    setSelectedProducts(new Set());
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
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
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Fehler beim Laden der Produkte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {error.message || "Unbekannter Fehler beim Laden der Produkte"}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
            Neu laden
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <FileDown className="h-12 w-12 mb-3 opacity-20" />
            <p>Keine Produkte verfügbar</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Search and bulk actions */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {showBulkActions && selectedProducts.size > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <Label htmlFor="bulkQuantity" className="mr-2 text-sm">Menge:</Label>
                <Input
                  id="bulkQuantity"
                  type="number"
                  value={bulkQuantity}
                  onChange={(e) => setBulkQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 h-9"
                  min={1}
                />
              </div>
              <Button onClick={handleBulkAddToCart} size="sm">
                <ShoppingCart className="h-4 w-4 mr-2" />
                <span className="whitespace-nowrap">
                  {selectedProducts.size} {selectedProducts.size === 1 ? 'Produkt' : 'Produkte'} hinzufügen
                </span>
              </Button>
            </div>
          )}
        </div>

        {/* Products table */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {showBulkActions && (
                  <TableHead className="w-10">
                    <Checkbox 
                      checked={selectedProducts.size > 0 && selectedProducts.size === filteredProducts.length} 
                      onCheckedChange={toggleSelectAll}
                      aria-label="Alle Produkte auswählen"
                    />
                  </TableHead>
                )}
                <TableHead>Produkt</TableHead>
                <TableHead className="hidden md:table-cell">SKU</TableHead>
                <TableHead className="text-right">Bestand</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showBulkActions ? 5 : 4} className="text-center py-6 text-muted-foreground">
                    Keine Produkte gefunden
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map(product => {
                  const isSelected = selectedProducts.has(product.productId);
                  const isAddedToCart = isInCart(product.productId);
                  
                  return (
                    <TableRow 
                      key={product.productId}
                      className={isSelected ? "bg-primary/5" : undefined}
                      onClick={() => showBulkActions && toggleProductSelection(product.productId)}
                      style={showBulkActions ? { cursor: "pointer" } : undefined}
                    >
                      {showBulkActions && (
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={isSelected}
                            onCheckedChange={() => toggleProductSelection(product.productId)}
                            aria-label={`${product.productName} auswählen`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div>
                          <div className="font-medium">{product.productName}</div>
                          {product.category && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {product.category}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{product.sku || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={
                            product.quantity <= 0 ? "destructive" : 
                            (product.minQuantity && product.quantity <= product.minQuantity) 
                              ? "warning" 
                              : "outline"
                          }
                        >
                          {product.quantity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToCart(product);
                            }}
                            disabled={isAddedToCart}
                            title={isAddedToCart ? "Bereits im Warenkorb" : "Zum Warenkorb hinzufügen"}
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleAddToCart(product, 5);
                              }}>
                                5 Stück hinzufügen
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleAddToCart(product, 10);
                              }}>
                                10 Stück hinzufügen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredProducts.length} von {products.length} Produkten angezeigt
        </div>
      </CardFooter>
    </Card>
  );
}