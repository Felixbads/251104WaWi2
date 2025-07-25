import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { 
  Package, 
  Search, 
  Plus, 
  AlertTriangle,
  Tag,
  CircleDollarSign,
  Edit,
  RefreshCw,
  Filter,
  X,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  MinusCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle, 
  DialogTrigger
} from "@/components/ui/dialog";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

import { useToast } from "@/hooks/use-toast";
import { ProductPhotoUpload } from "@/components/ProductPhotoUpload";
import { ExportImportButtons } from "@/components/ExportImportButtons";

// Types
interface Product {
  id: number;
  vendonId?: string;
  productName: string;
  product_name?: string;
  sku?: string;
  barcode?: string;
  price?: number;
  vat?: number;
  status?: string;
  category?: string;
  shortDescription?: string;
  description?: string;
  ingredients?: string;
  allergens?: string;
  packageSize?: string;
  minOrderQuantity?: number;
  shelfLifeDays?: number;
  photos?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface ProductsResponse {
  products?: Product[];
  total: number;
  limit: number;
  offset: number;
}

// API Functions
const getProducts = async (params?: {
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<Product[]> => {
  const queryParams = new URLSearchParams();
  
  if (params?.search) queryParams.append('search', params.search);
  if (params?.category) queryParams.append('category', params.category);
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());

  const response = await fetch(`/api/products?${queryParams.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }
  
  const data = await response.json();
  
  // Handle different response formats
  if (Array.isArray(data)) {
    return data.map(normalizeProduct);
  } else if (data.products && Array.isArray(data.products)) {
    return data.products.map(normalizeProduct);
  } else {
    return [];
  }
};

const normalizeProduct = (product: any): Product => ({
  ...product,
  productName: product.productName || product.product_name || `Produkt-ID ${product.id}`,
  category: product.category || 'Unkategorisiert',
  price: product.price || 0,
  status: product.status || 'active'
});

const getProductCategories = async (): Promise<string[]> => {
  const response = await fetch('/api/product-categories');
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  return response.json();
};

const syncProductsWithVendon = async () => {
  const response = await fetch('/api/product-sync/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to sync products with Vendon');
  }
  
  return response.json();
};

export default function ProductsNew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  // Data queries
  const {
    data: products = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/products', { search: searchTerm, category: selectedCategory }],
    queryFn: () => getProducts({ 
      search: searchTerm || undefined,
      category: selectedCategory === "all" ? undefined : selectedCategory,
      limit: 1000 
    }),
  });

  // Extract unique categories from products if API fails
  const extractCategoriesFromProducts = (productsList: Product[]) => {
    const categorySet = new Set<string>();
    productsList.forEach(product => {
      if (product.category && product.category !== 'Unkategorisiert') {
        categorySet.add(product.category);
      }
    });
    return Array.from(categorySet).sort();
  };

  const { data: apiCategories = [] } = useQuery({
    queryKey: ['/api/product-categories'],
    queryFn: getProductCategories,
  });

  // Use API categories or extract from products as fallback
  const categories = apiCategories.length > 0 ? apiCategories : extractCategoriesFromProducts(products);

  // Handle Vendon sync
  const handleSyncProducts = async () => {
    try {
      setIsSyncing(true);
      await syncProductsWithVendon();
      
      // Refresh products after sync
      await refetch();
      
      toast({
        title: 'Synchronisierung erfolgreich',
        description: 'Produkte wurden erfolgreich mit Vendon synchronisiert',
      });
    } catch (error) {
      toast({
        title: 'Synchronisierung fehlgeschlagen',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter products based on search and category
  const filteredProducts = products.filter(product => {
    const matchesSearch = searchTerm === "" || 
      product.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Product Card Component
  const ProductCard = ({ product }: { product: Product }) => {
    const formatPrice = (price?: number) => {
      if (!price) return '–';
      return `${price.toFixed(2)} €`;
    };

    const getStatusColor = (status?: string) => {
      switch (status) {
        case 'active':
          return 'bg-green-100 text-green-800';
        case 'inactive':
          return 'bg-gray-100 text-gray-800';
        case 'discontinued':
          return 'bg-red-100 text-red-800';
        default:
          return 'bg-gray-100 text-gray-800';
      }
    };

    return (
      <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg font-semibold line-clamp-2">
              {product.productName}
            </CardTitle>
            <Badge variant="secondary" className={getStatusColor(product.status)}>
              {product.status === 'active' ? 'Aktiv' : product.status === 'inactive' ? 'Inaktiv' : 'Eingestellt'}
            </Badge>
          </div>
          <CardDescription className="text-sm text-gray-600">
            {product.category}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Product Info */}
            <div className="flex justify-between items-center">
              <div className="flex items-center text-sm text-gray-600">
                <CircleDollarSign className="h-4 w-4 mr-1" />
                <span>Preis: {formatPrice(product.price)}</span>
              </div>
              {product.sku && (
                <div className="flex items-center text-sm text-gray-600">
                  <Tag className="h-4 w-4 mr-1" />
                  <span>{product.sku}</span>
                </div>
              )}
            </div>

            {/* Description */}
            {product.shortDescription && (
              <p className="text-sm text-gray-700 line-clamp-2">
                {product.shortDescription}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <ProductPhotoUpload 
                productId={product.id}
                size="sm"
                onUploadSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/products'] });
                }}
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => setLocation(`/produkte/${product.id}`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Product Table Component - Mobile First
  const ProductTable = ({ products }: { products: Product[] }) => {
    const handleRowClick = (productId: number) => {
      setLocation(`/produkte/${productId}`);
    };

    return (
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Produkt</TableHead>
                  <TableHead className="min-w-[120px]">Kategorie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow 
                    key={product.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleRowClick(product.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <div className="font-semibold text-foreground text-sm sm:text-base">
                          {product.productName}
                        </div>
                        {product.barcode && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Barcode: {product.barcode}
                          </div>
                        )}
                        {product.shortDescription && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {product.shortDescription}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {product.category || 'Unkategorisiert'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Success callback for import
  const handleSuccessfulImport = () => {
    refetch();
    toast({
      title: 'Import erfolgreich',
      description: 'Produkte wurden erfolgreich importiert',
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Produkte</h1>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Nach Produkten suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {/* Actions removed - cleaner interface */}
      </div>

      {/* Category Filter - Mobile First */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-auto p-1 min-w-full">
            <TabsTrigger value="all" className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2">
              Alle Kategorien
            </TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger 
                key={category} 
                value={category}
                className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 whitespace-nowrap"
              >
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <p>Fehler beim Laden der Produkte: {String(error)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Info */}
      {!isLoading && !error && (
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>
            {filteredProducts.length} {filteredProducts.length === 1 ? 'Produkt' : 'Produkte'} gefunden
          </span>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm("")}
            >
              <X className="h-4 w-4 mr-1" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      )}

      {/* Products Table */}
      {!isLoading && !error && (
        <ProductTable products={filteredProducts} />
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Keine Produkte gefunden
          </h3>
          <p className="text-gray-600 mb-4">
            {searchTerm 
              ? `Keine Ergebnisse für "${searchTerm}"`
              : "Es wurden keine Produkte gefunden, die den Filterkriterien entsprechen"
            }
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSearchTerm("");
              setSelectedCategory("all");
            }}
          >
            Filter zurücksetzen
          </Button>
        </div>
      )}

      {/* Action Buttons moved to bottom */}
      {!isLoading && !error && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              {/* Vendon Sync Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncProducts}
                disabled={isSyncing}
                className="w-full sm:w-auto"
              >
                {isSyncing ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                    Synchronisiere...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Vendon Sync
                  </>
                )}
              </Button>

              {/* Export/Import */}
              <div className="w-full sm:w-auto">
                <ExportImportButtons
                  type="products"
                  label="Produkte"
                  onSuccessfulImport={handleSuccessfulImport}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}