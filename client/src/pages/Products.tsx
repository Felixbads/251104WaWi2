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
  Tag,
  X,
  CircleDollarSign,
  PackageOpen,
  Clock,
  BadgeAlert,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter, 
  DialogClose 
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getProducts, getAllVendonProducts } from "@/lib/api";

// Import die Produkt-Definition aus der API
import { Product } from "@/lib/api";

// Filter Dialog Komponente
interface FilterDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilters: (filters: FilterState) => void;
  categories: string[];
  initialFilters: FilterState;
}

interface FilterState {
  onlyInStock: boolean;
  onlyLowStock: boolean;
  priceRange: [number, number];
  suppliers: string[];
  requiresAgeVerification: boolean | null;
}

// Filter Dialog Component
function FilterDialog({ isOpen, onOpenChange, onApplyFilters, categories, initialFilters }: FilterDialogProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  
  // Reset Filters
  const resetFilters = () => {
    setFilters({
      onlyInStock: false,
      onlyLowStock: false,
      priceRange: [0, 100],
      suppliers: [],
      requiresAgeVerification: null
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Produkte filtern
          </DialogTitle>
          <DialogDescription>
            Filtern Sie die Produktliste nach verschiedenen Kriterien.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Bestand */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center">
              <PackageOpen className="h-4 w-4 mr-2" />
              Bestand
            </h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="only-in-stock" 
                  checked={filters.onlyInStock}
                  onCheckedChange={(checked) => 
                    setFilters({...filters, onlyInStock: checked as boolean})
                  }
                />
                <Label htmlFor="only-in-stock">Nur Produkte auf Lager</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="only-low-stock" 
                  checked={filters.onlyLowStock}
                  onCheckedChange={(checked) => 
                    setFilters({...filters, onlyLowStock: checked as boolean})
                  }
                />
                <Label htmlFor="only-low-stock">Kritischer Bestand</Label>
              </div>
            </div>
          </div>
          
          {/* Preis */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center">
              <CircleDollarSign className="h-4 w-4 mr-2" />
              Preis
            </h4>
            <div className="px-2">
              <Slider 
                defaultValue={filters.priceRange} 
                max={100}
                step={1}
                onValueChange={(value) => 
                  setFilters({...filters, priceRange: value as [number, number]})
                }
              />
              <div className="flex justify-between mt-2 text-sm text-gray-500">
                <span>{filters.priceRange[0]}€</span>
                <span>bis</span>
                <span>{filters.priceRange[1]}€</span>
              </div>
            </div>
          </div>
          
          {/* Altersüberprüfung */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center">
              <BadgeAlert className="h-4 w-4 mr-2" />
              Altersüberprüfung
            </h4>
            <RadioGroup 
              defaultValue={filters.requiresAgeVerification === null ? "all" : 
                          filters.requiresAgeVerification ? "required" : "not-required"}
              onValueChange={(value) => {
                let newValue: boolean | null = null;
                if (value === "required") newValue = true;
                if (value === "not-required") newValue = false;
                setFilters({...filters, requiresAgeVerification: newValue});
              }}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all">Alle Produkte</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="required" id="required" />
                <Label htmlFor="required">Nur Produkte mit Altersüberprüfung (18+)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="not-required" id="not-required" />
                <Label htmlFor="not-required">Nur Produkte ohne Altersüberprüfung</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2">
          <Button 
            variant="outline" 
            onClick={resetFilters}
          >
            <X className="h-4 w-4 mr-2" />
            Zurücksetzen
          </Button>
          <Button onClick={() => {
            onApplyFilters(filters);
            onOpenChange(false);
          }}>
            Filter anwenden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Products() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [, setLocation] = useLocation();
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  
  // Filterzustand
  const [filters, setFilters] = useState<FilterState>({
    onlyInStock: false,
    onlyLowStock: false,
    priceRange: [0, 100],
    suppliers: [],
    requiresAgeVerification: null
  });

  // Daten abrufen
  const { data: products, isLoading, error } = useQuery({
    queryKey: ['/api/products', { page: currentPage, limit }],
    queryFn: () => getProducts({ 
      offset: (currentPage - 1) * limit,
      limit
    }),
  });
  
  // Alle Vendon-Produkte abrufen (ohne Paginierung)
  const { 
    data: vendonProducts, 
    isLoading: isLoadingVendonProducts,
    error: vendonProductsError
  } = useQuery({
    queryKey: ['/api/vendon/products'],
    queryFn: getAllVendonProducts,
  });

  // Category Filter
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Kategorien und Lieferanten sammeln
  const categories = products?.data 
    ? Array.from(new Set(products.data.map((product: Product) => product.category || 'Unkategorisiert')))
    : [];
    
  const suppliers = products?.data
    ? Array.from(new Set(products.data.filter(p => p.supplier).map(p => p.supplier as string)))
    : [];

  // Kombiniere reguläre Produkte mit Vendon-Produkten
  const allProducts = [...(products?.data || []), ...(vendonProducts || [])];
  
  // Entferne Duplikate basierend auf vendonId
  const uniqueProductsMap = new Map();
  allProducts.forEach(product => {
    if (product.vendonId && !uniqueProductsMap.has(product.vendonId)) {
      uniqueProductsMap.set(product.vendonId, product);
    } else if (!uniqueProductsMap.has(product.id)) {
      uniqueProductsMap.set(product.id, product);
    }
  });
  
  const combinedProducts = Array.from(uniqueProductsMap.values());
  
  // Count-Anzeige für alle Produkte
  const totalProductCount = combinedProducts?.length || 0;

  // Filter- und Suchfunktionen
  const filteredProducts = combinedProducts
    ? combinedProducts.filter((product: Product) => {
        // Sicherstellen, dass product und seine Eigenschaften definiert sind
        if (!product || !product.productName) return false;
        
        // Suchterm-Filter
        const matchesSearch = product.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
        
        // Kategorie-Filter
        const matchesCategory = !categoryFilter || product.category === categoryFilter || 
                              (categoryFilter === 'Unkategorisiert' && !product.category);
        
        // Erweiterte Filter
        
        // Bestand-Filter
        const hasStock = !filters.onlyInStock || (typeof product.inStock === 'number' && product.inStock > 0);
        
        // Kritischer Bestand
        const hasLowStock = !filters.onlyLowStock || 
                            (typeof product.inStock === 'number' && 
                            typeof product.amountCritical === 'number' && 
                            product.inStock <= product.amountCritical && 
                            product.inStock > 0);
        
        // Preis-Filter
        const priceInRange = !product.price || 
                            (product.price >= filters.priceRange[0] && 
                             product.price <= filters.priceRange[1]);
        
        // Altersüberprüfung
        const tags = product.tags ? JSON.parse(product.tags) : [];
        const isAlcohol = tags.includes('alcohol') || product.requiresAgeVerification;
        const matchesAgeVerification = filters.requiresAgeVerification === null || 
                                      isAlcohol === filters.requiresAgeVerification;
        
        return matchesSearch && 
              matchesCategory && 
              hasStock && 
              hasLowStock && 
              priceInRange && 
              matchesAgeVerification;
      })
    : [];

  // Product Card Component
  const ProductCard = ({ product }: { product: Product }) => {
    // Extrahiere Tags, wenn vorhanden
    const tags = product.tags ? JSON.parse(product.tags) : [];
    const isAlcohol = tags.includes('alcohol') || product.requiresAgeVerification;
    
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg truncate">{product.productName}</CardTitle>
            {isAlcohol && (
              <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 border-amber-300">
                18+
              </Badge>
            )}
          </div>
          <CardDescription>
            {product.sku && (
              <span className="text-xs text-gray-500 flex items-center">
                <Tag className="h-3 w-3 mr-1" />
                {product.sku}
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
          {product.category && (
            <div className="mt-2">
              <Badge variant="secondary" className="mt-1">
                {product.category}
              </Badge>
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setLocation(`/produkte/${product.id}`)}
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
    // Extrahiere Tags, wenn vorhanden
    const tags = product.tags ? JSON.parse(product.tags) : [];
    const isAlcohol = tags.includes('alcohol') || product.requiresAgeVerification;
    
    // Bestandsstatus berechnen
    let stockStatus = "normal";
    if (typeof product.inStock === 'number' && product.amountCritical) {
      if (product.inStock <= 0) {
        stockStatus = "out";
      } else if (product.inStock <= product.amountCritical) {
        stockStatus = "low";
      }
    }
    
    return (
      <div className="flex items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div className="flex-grow mr-4">
          <div className="flex items-center mb-1">
            <h3 className="font-medium truncate mr-2">{product.productName}</h3>
            {isAlcohol && (
              <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 border-amber-300">
                18+
              </Badge>
            )}
            {product.category && (
              <Badge variant="secondary" className="ml-2">
                {product.category}
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {product.sku && (
              <span className="text-xs text-gray-500 flex items-center">
                <Tag className="h-3 w-3 mr-1" />
                {product.sku}
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
            <p className={`font-medium ${
              stockStatus === "out" ? "text-red-600" : 
              stockStatus === "low" ? "text-amber-600" : ""
            }`}>
              {typeof product.inStock === 'number' ? product.inStock : '–'}
            </p>
          </div>
          {product.salesCount !== undefined && (
            <div className="text-center">
              <p className="text-gray-500">Verkäufe</p>
              <p className="font-medium">{product.salesCount}</p>
            </div>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setLocation(`/produkte/${product.id}`)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
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
            onClick={() => setLocation("/produkte/inventory")}
          >
            <FileText className="h-4 w-4 mr-2" />
            Inventurbericht
          </Button>
          <Button onClick={() => setLocation("/produkte/new")}>
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
            onClick={() => setIsFilterDialogOpen(true)}
            className="gap-1 relative"
          >
            <Filter className="h-4 w-4 mr-1" />
            Filter
            {/* Filter-Indikator, wenn aktive Filter vorhanden sind */}
            {(filters.onlyInStock || 
              filters.onlyLowStock || 
              filters.priceRange[0] > 0 || 
              filters.priceRange[1] < 100 || 
              filters.requiresAgeVerification !== null) && (
              <span className="absolute -top-1 -right-1 rounded-full bg-primary w-2 h-2" />
            )}
          </Button>
          
          {/* Filter Dialog */}
          <FilterDialog 
            isOpen={isFilterDialogOpen} 
            onOpenChange={setIsFilterDialogOpen}
            onApplyFilters={setFilters}
            categories={categories}
            initialFilters={filters}
          />
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
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'Produkt' : 'Produkte'} gefunden
            {vendonProducts && ` (Insgesamt verfügbar: ${vendonProducts.length} Produkte in der Vendon-Datenbank)`}
          </p>
          {isLoadingVendonProducts && (
            <div className="flex items-center text-sm text-gray-500">
              <div className="animate-spin h-4 w-4 border-t-2 border-b-2 border-primary rounded-full mr-2"></div>
              Lade Vendon-Produkte...
            </div>
          )}
          {vendonProductsError && (
            <p className="text-sm text-red-500">
              Fehler beim Laden der Vendon-Produkte
            </p>
          )}
        </div>
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
              // Alle Filter zurücksetzen
              setSearchTerm("");
              setCategoryFilter(null);
              setFilters({
                onlyInStock: false,
                onlyLowStock: false,
                priceRange: [0, 100],
                suppliers: [],
                requiresAgeVerification: null
              });
            }}
          >
            <X className="h-4 w-4 mr-2" />
            Filter zurücksetzen
          </Button>
        </div>
      )}
      
      {/* Pagination */}
      {!isLoading && !error && products?.meta && products.meta.pages > 1 && (
        <div className="flex justify-center mt-6">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center space-x-1">
              {(() => {
                const totalPages = products.meta.pages || 1;
                const buttons = [];
                
                // Logik für die anzuzeigenden Seitenzahlen
                let startPage = Math.max(1, currentPage - 2);
                let endPage = Math.min(totalPages, startPage + 4);
                
                // Wenn wir weniger als 5 Seiten zeigen würden, starten wir früher
                if (endPage - startPage < 4) {
                  startPage = Math.max(1, endPage - 4);
                }
                
                for (let i = startPage; i <= endPage; i++) {
                  buttons.push(
                    <Button
                      key={i}
                      variant={currentPage === i ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(i)}
                      className="w-8 h-8 p-0"
                    >
                      {i}
                    </Button>
                  );
                }
                
                return buttons;
              })()}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage >= (products.meta.pages || 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(products.meta.pages || 1)}
              disabled={currentPage >= (products.meta.pages || 1)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}