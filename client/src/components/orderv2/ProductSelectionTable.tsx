import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Minus, Search, Filter, ArrowUpDown, Loader2, ShoppingCart } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { OrderMode } from './OrderModeSelector';

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
  productName: string;
  price: number;
  sku?: string;
  barcode?: string;
  category?: string;
  status?: string;
  inStock?: number;
  minStock?: number;
  supplier?: {
    id: number;
    name: string;
  };
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [localProducts, setLocalProducts] = useState<any[]>([]);
  
  // Fetch products for the supplier
  const { data: products, isLoading, error } = useQuery<ProductType[]>({
    queryKey: ['/api/products', { supplierId }],
    enabled: !!supplierId,
  });
  
  // Fetch current inventory levels
  const { data: inventory } = useQuery<any[]>({
    queryKey: ['/api/inventory/warehouse', warehouseId],
    enabled: !!warehouseId,
  });
  
  // If in copy mode, fetch source order
  const { data: sourceOrder } = useQuery<any>({
    queryKey: ['/api/orders', sourceOrderId],
    enabled: !!sourceOrderId && mode === 'copy',
  });
  
  // If in forecast mode, fetch product forecast
  const { data: forecast } = useQuery<any[]>({
    queryKey: ['/api/forecast/products', warehouseId],
    enabled: !!warehouseId && mode === 'forecast',
  });
  
  // Initialize local products
  useEffect(() => {
    if (products) {
      const initialProducts = products.map(product => {
        // Find inventory for this product
        const productInventory = inventory?.find(inv => inv.productId === product.id);
        
        // Find source order item if in copy mode
        const sourceItem = sourceOrder?.items?.find((item: any) => item.productId === product.id);
        
        // Find forecast if in forecast mode
        const productForecast = forecast?.find(f => f.productId === product.id);
        
        // Check if product is already selected
        const existingSelection = selectedProducts.find(p => p.id === product.id);
        
        return {
          ...product,
          inStock: productInventory?.quantity || 0,
          orderQuantity: existingSelection?.orderQuantity || 
                        (mode === 'copy' ? sourceItem?.quantity || 0 : 0),
          suggestedQuantity: mode === 'forecast' && productForecast ? 
                            Math.max(productForecast.suggestedOrderQuantity, 0) : 0
        };
      });
      
      setLocalProducts(initialProducts);
    }
  }, [products, inventory, sourceOrder, forecast, selectedProducts, mode]);
  
  // Update selected products when local products change
  useEffect(() => {
    const selected = localProducts.filter(p => p.orderQuantity > 0);
    onProductsChange(selected);
  }, [localProducts, onProductsChange]);
  
  // Filter and sort products
  const filteredProducts = localProducts
    .filter(product => {
      // Apply search query filter
      const matchesSearch = product.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (product.sku && product.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (product.barcode && product.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Apply category filter
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle string comparisons
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? 
          aValue.localeCompare(bValue) : 
          bValue.localeCompare(aValue);
      }
      
      // Handle numeric comparisons
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });
  
  // Get unique categories for filter
  const categories = Array.from(new Set(localProducts
    .filter(p => p.category)
    .map(p => p.category)));
  
  // Handle sort toggle
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Handle quantity update
  const updateQuantity = (productId: number, quantity: number) => {
    setLocalProducts(prev => 
      prev.map(product => 
        product.id === productId ? 
          { ...product, orderQuantity: Math.max(0, quantity) } : 
          product
      )
    );
  };
  
  // Apply suggested quantities (only in forecast mode)
  const applySuggestedQuantities = () => {
    setLocalProducts(prev => 
      prev.map(product => ({
        ...product,
        orderQuantity: mode === 'forecast' ? product.suggestedQuantity : product.orderQuantity
      }))
    );
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Produkte durchsuchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select
          value={categoryFilter}
          onValueChange={setCategoryFilter}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {mode === 'forecast' && (
          <Button 
            onClick={applySuggestedQuantities}
            className="whitespace-nowrap"
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Prognosevorschläge übernehmen
          </Button>
        )}
      </div>
      
      <div className="border rounded-md">
        <div className="relative overflow-x-auto rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[400px]">
                  <Button variant="ghost" onClick={() => toggleSort('productName')} className="flex gap-1 items-center px-0">
                    Produkt
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                {mode === 'forecast' && (
                  <TableHead className="text-right">
                    <Button variant="ghost" onClick={() => toggleSort('suggestedQuantity')} className="flex gap-1 items-center px-0">
                      Vorschlag
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                )}
                <TableHead className="text-right">
                  <Button variant="ghost" onClick={() => toggleSort('inStock')} className="flex gap-1 items-center px-0">
                    Lagerbestand
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" onClick={() => toggleSort('price')} className="flex gap-1 items-center px-0">
                    Preis
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead className="text-right">Summe</TableHead>
              </TableRow>
            </TableHeader>
            
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={mode === 'forecast' ? 6 : 5} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    <p className="mt-2">Produkte werden geladen...</p>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={mode === 'forecast' ? 6 : 5} className="h-24 text-center text-destructive">
                    Fehler beim Laden der Produkte. Bitte versuchen Sie es später erneut.
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={mode === 'forecast' ? 6 : 5} className="h-24 text-center text-muted-foreground">
                    Keine Produkte gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map(product => (
                  <TableRow key={product.id} className={product.orderQuantity > 0 ? 'bg-primary/5' : ''}>
                    <TableCell className="font-medium">
                      <div>
                        {product.productName}
                        {product.status === 'low_stock' && (
                          <Badge variant="destructive" className="ml-2">
                            Niedriger Bestand
                          </Badge>
                        )}
                      </div>
                      {product.sku && (
                        <div className="text-xs text-muted-foreground mt-1">
                          SKU: {product.sku}
                        </div>
                      )}
                    </TableCell>
                    
                    {mode === 'forecast' && (
                      <TableCell className="text-right">
                        {product.suggestedQuantity}
                      </TableCell>
                    )}
                    
                    <TableCell className="text-right">
                      {product.inStock}
                    </TableCell>
                    
                    <TableCell className="text-right">
                      {product.price.toFixed(2)} €
                    </TableCell>
                    
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(product.id, product.orderQuantity - 1)}
                          disabled={product.orderQuantity <= 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        
                        <Input
                          type="number"
                          value={product.orderQuantity}
                          onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 0)}
                          className="w-16 text-center"
                          min="0"
                        />
                        
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(product.id, product.orderQuantity + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-right font-medium">
                      {(product.price * product.orderQuantity).toFixed(2)} €
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Bestellübersicht</CardTitle>
          <CardDescription>
            {selectedProducts.length} Produkte ausgewählt
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between font-medium text-lg">
            <div>Gesamtsumme:</div>
            <div>
              {selectedProducts.reduce((sum, product) => sum + (product.price * product.orderQuantity), 0).toFixed(2)} €
            </div>
          </div>
          <div className="text-sm text-muted-foreground mt-1 text-right">
            (exkl. MwSt.)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductSelectionTable;