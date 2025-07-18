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
  Grid, 
  List, 
  AlertTriangle,
  Tag,
  CircleDollarSign,
  Edit,
  Download,
  Upload,
  RefreshCw,
  Camera,
  ExternalLink,
  Filter,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
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

  const { data: categories = [] } = useQuery({
    queryKey: ['/api/product-categories'],
    queryFn: getProductCategories,
  });

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

  // Product List Item Component
  const ProductListItem = ({ product }: { product: Product }) => {
    const formatPrice = (price?: number) => {
      if (!price) return '–';
      return `${price.toFixed(2)} €`;
    };

    return (
      <div className="flex items-center p-4 hover:bg-gray-50 border-b last:border-b-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">
                {product.productName}
              </h3>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>Kategorie: {product.category}</span>
                {product.sku && <span>SKU: {product.sku}</span>}
                <span>Preis: {formatPrice(product.price)}</span>
              </div>
              {product.shortDescription && (
                <p className="text-sm text-gray-700 mt-1 line-clamp-1">
                  {product.shortDescription}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4">
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
                onClick={() => setLocation(`/produkte/${product.id}`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
            </div>
          </div>
        </div>
      </div>
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Produkte</h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie Ihre Produktdatenbank
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          >
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
          </Button>
        </div>
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
        
        <div className="flex items-center gap-2">
          {/* Data Entry Button */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setLocation('/product-data-entry')}
          >
            <Edit className="h-4 w-4 mr-2" />
            Daten bearbeiten
          </Button>

          {/* Vendon Sync Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncProducts}
            disabled={isSyncing}
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
          <ExportImportButtons
            type="products"
            label="Produkte"
            onSuccessfulImport={handleSuccessfulImport}
          />

          {/* Add New Product */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setLocation('/produkte/neu')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Neues Produkt
          </Button>
        </div>
      </div>

      {/* Category Filter */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <TabsList className="grid w-full grid-cols-auto overflow-x-auto">
          <TabsTrigger value="all">Alle Kategorien</TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger key={category} value={category}>
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
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

      {/* Products Display */}
      {!isLoading && !error && (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {filteredProducts.map((product) => (
                    <ProductListItem key={product.id} product={product} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
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
    </div>
  );
}