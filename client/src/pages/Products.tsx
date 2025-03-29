import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  ShoppingBag, 
  Search, 
  Plus, 
  Filter, 
  Grid, 
  List, 
  AlertTriangle, 
  ExternalLink,
  FileText,
  Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getProducts } from "@/lib/api";

// Typen für Produkte
interface Product {
  id: number;
  vendonId: string;
  name: string;
  productCode?: string;
  category?: string;
  price?: number;
  vat?: number;
  inStock?: number;
  supplier?: string;
  regionalOrigin?: string;
  salesCount?: number;
}

export default function Products() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [, setLocation] = useLocation();

  // Daten abrufen
  const { data: products, isLoading, error } = useQuery({
    queryKey: ['/api/products'],
    queryFn: () => getProducts(),
  });

  // Category Filter
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Kategorien sammeln
  const categories = products 
    ? [...new Set(products.map((product: Product) => product.category || 'Unkategorisiert'))]
    : [];

  // Filter- und Suchfunktionen
  const filteredProducts = products?.filter((product: Product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (product.productCode?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    const matchesCategory = !categoryFilter || product.category === categoryFilter || 
                           (categoryFilter === 'Unkategorisiert' && !product.category);
    return matchesSearch && matchesCategory;
  }) || [];

  // Product Card Component
  const ProductCard = ({ product }: { product: Product }) => {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg truncate">{product.name}</CardTitle>
            {product.regionalOrigin && (
              <Badge variant="outline" className="ml-2">
                {product.regionalOrigin}
              </Badge>
            )}
          </div>
          <CardDescription>
            {product.productCode && (
              <span className="text-xs text-gray-500 flex items-center">
                <Tag className="h-3 w-3 mr-1" />
                {product.productCode}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-sm text-gray-500">Preis</p>
              <p className="font-medium">{product.price?.toFixed(2) || '–'} €</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Bestand</p>
              <p className="font-medium">{typeof product.inStock === 'number' ? product.inStock : '–'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Verkäufe</p>
              <p className="font-medium">{product.salesCount || '0'}</p>
            </div>
          </div>
          {product.supplier && (
            <div className="mt-2">
              <p className="text-sm text-gray-500">Lieferant</p>
              <p className="text-sm font-medium truncate">{product.supplier}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setLocation(`/products/${product.id}`)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Details
          </Button>
        </CardFooter>
      </Card>
    );
  };

  // Product List Item Component
  const ProductListItem = ({ product }: { product: Product }) => {
    return (
      <div className="flex items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div className="flex-grow mr-4">
          <div className="flex items-center mb-1">
            <h3 className="font-medium truncate mr-2">{product.name}</h3>
            {product.regionalOrigin && (
              <Badge variant="outline" className="ml-2">
                {product.regionalOrigin}
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {product.productCode && (
              <span className="text-xs text-gray-500 flex items-center">
                <Tag className="h-3 w-3 mr-1" />
                {product.productCode}
              </span>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className="text-gray-500">Preis</p>
            <p className="font-medium">{product.price?.toFixed(2) || '–'} €</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500">Bestand</p>
            <p className="font-medium">{typeof product.inStock === 'number' ? product.inStock : '–'}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500">Kategorie</p>
            <p className="font-medium">{product.category || 'Unkategorisiert'}</p>
          </div>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setLocation(`/products/${product.id}`)}
          >
            Details
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <ShoppingBag className="h-6 w-6 mr-2" />
            Produkte
          </h1>
          <p className="text-gray-500 mt-1">
            Verwalten Sie das Produktsortiment aller Automaten
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setLocation("/products/inventory")}
          >
            <FileText className="h-4 w-4 mr-2" />
            Inventurbericht
          </Button>
          <Button onClick={() => setLocation("/products/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Neues Produkt
          </Button>
        </div>
      </div>

      <Separator />

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Produkte suchen nach Name oder Artikelnummer..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {/* Filter dialog implementieren */}}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <div className="border rounded-md p-1 flex">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
              className="h-8 w-8 rounded-sm"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
              className="h-8 w-8 rounded-sm"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs for Category Filtering */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="all" onClick={() => setCategoryFilter(null)}>
            Alle
          </TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger 
              key={category} 
              value={category}
              onClick={() => setCategoryFilter(category)}
            >
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
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

      {/* Results Count */}
      {!isLoading && !error && (
        <p className="text-sm text-gray-500">
          {filteredProducts.length} {filteredProducts.length === 1 ? 'Produkt' : 'Produkte'} gefunden
        </p>
      )}

      {/* Products Grid/List View */}
      {!isLoading && !error && viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product: Product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "list" && (
        <div className="border rounded-md divide-y">
          {filteredProducts.map((product: Product) => (
            <ProductListItem key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* No Results */}
      {!isLoading && !error && filteredProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <ShoppingBag className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium">Keine Produkte gefunden</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm 
              ? `Keine Ergebnisse für "${searchTerm}"`
              : "Es wurden keine Produkte gefunden, die den Filterkriterien entsprechen"}
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              setSearchTerm("");
              setCategoryFilter(null);
            }}
          >
            Filter zurücksetzen
          </Button>
        </div>
      )}
    </div>
  );
}