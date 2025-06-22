import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { de } from "date-fns/locale";
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
  ChevronsRight,
  SlidersHorizontal,
  Download,
  BarChart,
  Truck,
  Percent,
  RefreshCw,
  Upload,
  FileSpreadsheet
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PageHeader from "@/components/layout/PageHeader";
import { ExportImportButtons } from "@/components/ExportImportButtons";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { 
  getProducts, 
  getAllVendonProducts, 
  exportProductsAsExcel, 
  importProductsFromExcel,
  syncProductsWithVendon,
  getProductSyncStatus,
  Product,
  ProductSyncStatus
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Formatierungsfunktion für Datumsangaben
const formatDateTime = (dateString: string | Date | null, type: 'date' | 'time' | 'datetime' = 'date') => {
  if (!dateString) return '-';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  try {
    if (type === 'date') {
      return format(date, 'dd.MM.yyyy', { locale: de });
    } else if (type === 'time') {
      return format(date, 'HH:mm', { locale: de });
    } else {
      return format(date, 'dd.MM.yyyy HH:mm', { locale: de });
    }
  } catch (error) {
    console.error('Fehler bei der Datums-Formatierung:', error);
    return String(dateString);
  }
};

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
  categories: string[];
  requiresAgeVerification: boolean | null;
  sortBy: "name" | "price" | "stock" | "sales";
  sortDirection: "asc" | "desc";
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
      categories: [],
      requiresAgeVerification: null,
      sortBy: "name",
      sortDirection: "asc"
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" />
            Produkte filtern und sortieren
          </DialogTitle>
          <DialogDescription>
            Filtern und sortieren Sie die Produktliste nach verschiedenen Kriterien.
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
          
          {/* Kategorien */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center">
              <Tag className="h-4 w-4 mr-2" />
              Kategorien
            </h4>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Badge 
                  key={category}
                  variant={filters.categories.includes(category) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    const newCategories = filters.categories.includes(category)
                      ? filters.categories.filter(c => c !== category)
                      : [...filters.categories, category];
                    setFilters({...filters, categories: newCategories});
                  }}
                >
                  {category}
                </Badge>
              ))}
            </div>
          </div>
          
          {/* Lieferanten */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center">
              <Truck className="h-4 w-4 mr-2" />
              Lieferanten
            </h4>
            <Select 
              value={filters.suppliers[0] || ""}
              onValueChange={(value) => {
                if (value === "") {
                  setFilters({...filters, suppliers: []});
                } else {
                  setFilters({...filters, suppliers: [value]});
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Alle Lieferanten" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Alle Lieferanten</SelectItem>
                {/* Hier werden normalerweise die Lieferanten geladen */}
                {Array.isArray(initialFilters.suppliers) && 
                 initialFilters.suppliers.map((supplier) => (
                  <SelectItem key={supplier} value={supplier}>
                    {supplier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          
          {/* Sortierung */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center">
              <BarChart className="h-4 w-4 mr-2" />
              Sortierung
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sort-by" className="text-sm mb-1 block">Sortieren nach</Label>
                <Select 
                  value={filters.sortBy}
                  onValueChange={(value) => 
                    setFilters({...filters, sortBy: value as "name" | "price" | "stock" | "sales"})
                  }
                >
                  <SelectTrigger id="sort-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="price">Preis</SelectItem>
                    <SelectItem value="stock">Bestand</SelectItem>
                    <SelectItem value="sales">Verkäufe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sort-direction" className="text-sm mb-1 block">Reihenfolge</Label>
                <Select 
                  value={filters.sortDirection}
                  onValueChange={(value) => 
                    setFilters({...filters, sortDirection: value as "asc" | "desc"})
                  }
                >
                  <SelectTrigger id="sort-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Aufsteigend</SelectItem>
                    <SelectItem value="desc">Absteigend</SelectItem>
                  </SelectContent>
                </Select>
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
  // Immer Listenansicht verwenden
  const viewMode = "list" as "list" | "grid";
  const [, setLocation] = useLocation();
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const { toast } = useToast();
  
  // Synchronisierungs-Status
  const [syncStatus, setSyncStatus] = useState<ProductSyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(200); // Erhöht auf 200, um mehr Produkte zu laden
  
  // Funktion zum Synchronisieren der Produkte mit Vendon API
  const handleSyncProducts = async () => {
    try {
      setIsSyncing(true);
      setSyncStatus({ status: 'running', lastSync: null, message: 'Synchronisierung läuft...' });
      
      const result = await syncProductsWithVendon();
      setSyncStatus(result);
      
      // Aktualisiere die Produkte nach erfolgreicher Synchronisierung
      if (result.status === 'success') {
        queryClient.invalidateQueries({ queryKey: ['/api/products'] });
        queryClient.invalidateQueries({ queryKey: ['/api/vendon/products'] });
        
        toast({
          title: 'Synchronisierung erfolgreich',
          description: `${result.itemsSaved || 0} neue Produkte hinzugefügt, ${result.itemsUpdated || 0} Produkte aktualisiert`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Synchronisierung fehlgeschlagen',
          description: result.message || 'Unbekannter Fehler bei der Synchronisierung',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Fehler bei der Produktsynchronisierung:', error);
      setSyncStatus({ 
        status: 'error', 
        lastSync: null, 
        message: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      });
      
      toast({
        title: 'Synchronisierung fehlgeschlagen',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler bei der Synchronisierung',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };
  
  // Filterzustand
  const [filters, setFilters] = useState<FilterState>({
    onlyInStock: false,
    onlyLowStock: false,
    priceRange: [0, 100],
    suppliers: [],
    categories: [],
    requiresAgeVerification: null,
    sortBy: "name",
    sortDirection: "asc"
  });

  // Daten abrufen - IMMER alle Produkte anzeigen ohne supplierId Filter
  const { data: products, isLoading, error } = useQuery({
    queryKey: ['/api/products', { page: currentPage, limit }],
    queryFn: () => getProducts({ 
      offset: (currentPage - 1) * limit,
      limit
      // Kein supplierId-Filter, damit immer ALLE Produkte angezeigt werden
    }),
  });
  
  // Alle Vendon-Produkte abrufen
  const { 
    data: vendonProducts, 
    isLoading: isLoadingVendonProducts,
    error: vendonProductsError
  } = useQuery({
    queryKey: ['/api/vendon/products'],
    queryFn: () => getAllVendonProducts() // Ruft alle verfügbaren Produkte ab
  });
  
  // Logging in einem Effekt statt in den Query-Optionen
  useEffect(() => {
    if (vendonProducts) {
      console.log('Vendon Produkte erfolgreich geladen:', vendonProducts);
    }
  }, [vendonProducts]);
  
  useEffect(() => {
    if (vendonProductsError) {
      console.error('Fehler beim Laden der Vendon-Produkte:', vendonProductsError);
    }
  }, [vendonProductsError]);

  // Category Filter
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Debug: Das Format der API-Antwort untersuchen
  useEffect(() => {
    if (vendonProducts) {
      console.log('Vendon-Produkte Struktur prüfen:', vendonProducts);
      if (Array.isArray(vendonProducts)) {
        console.log('Vendon-Produkte sind ein Array mit', vendonProducts.length, 'Einträgen');
      } else if (vendonProducts.result && Array.isArray(vendonProducts.result)) {
        console.log('Vendon-Produkte haben result-Eigenschaft mit', vendonProducts.result.length, 'Einträgen');
      } else {
        console.log('Vendon-Produkte haben unerwartetes Format:', typeof vendonProducts);
      }
    }
  }, [vendonProducts]);

  // Verarbeite die Produkte abhängig vom API-Antwortformat
  const processedVendonProducts = useMemo(() => {
    if (!vendonProducts) return [];
    
    // Wenn die Antwort direkt ein Array ist
    if (Array.isArray(vendonProducts)) {
      return vendonProducts.map((p: any) => ({
        ...p,
        // Sicherstellen, dass die Kategorie immer gesetzt ist
        category: p.category || 'Unkategorisiert',
      }));
    }
    
    // Wenn die Antwort ein Objekt mit einer 'result'-Eigenschaft ist
    if (vendonProducts.result && Array.isArray(vendonProducts.result)) {
      return vendonProducts.result.map((p: any) => ({
        id: p.id,
        vendonId: p.vendonId || p.id?.toString(),
        productName: p.productName || p.name,
        description: p.description,
        category: p.category || 'Unkategorisiert',
        price: p.price || 0,
        vat: p.vat,
        status: p.status,
        sku: p.sku || p.article,
        barcode: p.barcode,
        inStock: p.inStock || 0,
        amountCritical: p.amountCritical || 5
      }));
    }
    
    // Fallback für unerwartete Formate
    return [];
  }, [vendonProducts]);

  // Kategorien und Lieferanten sammeln aus verarbeiteten Vendon-Produkten
  const categories: string[] = useMemo(() => {
    return processedVendonProducts.length > 0
      ? Array.from(new Set(processedVendonProducts.map((product: any) => 
          product.category || 'Unkategorisiert'))) as string[]
      : [];
  }, [processedVendonProducts]);
    
  const suppliers = useMemo(() => {
    return processedVendonProducts.length > 0
      ? Array.from(new Set(processedVendonProducts.filter((p: any) => p.supplier)
          .map((p: any) => p.supplier as string)))
      : [];
  }, [processedVendonProducts]);

  // Verwende alle regulären Produkte aus der Datenbank und ergänze mit Vendon-Produkten wenn vorhanden
  const regularProducts = useMemo(() => {
    // Stelle sicher, dass products ein gültiges Objekt ist
    if (!products || !products.data) return [];
    return Array.isArray(products.data) ? products.data : [];
  }, [products]);

  // Kombiniere die regulären Produkte mit Vendon-Produkten ohne Duplikate
  const combinedProducts = useMemo(() => {
    // Zuerst reguläre Produkte verwenden (von der /api/products Endpunkt)
    const productsMap = new Map<string, any>();
    
    // Füge reguläre Produkte hinzu
    regularProducts.forEach(product => {
      const productId = product.vendonId || product.id?.toString();
      if (productId && !productsMap.has(productId)) {
        productsMap.set(productId, product);
      }
    });
    
    // Füge Vendon-Produkte hinzu (falls vorhanden)
    processedVendonProducts.forEach(product => {
      const productId = product.vendonId || product.id?.toString();
      if (productId && !productsMap.has(productId)) {
        productsMap.set(productId, product);
      }
    });
    
    // Debug-Ausgabe hinzufügen
    console.log(`Produkte in Datenbank: ${regularProducts.length}, Vendon-Produkte: ${processedVendonProducts.length}, Kombiniert: ${productsMap.size}`);
    
    return Array.from(productsMap.values()) as Product[];
  }, [regularProducts, processedVendonProducts]);
  
  // Count-Anzeige für alle Produkte
  const totalProductCount = combinedProducts?.length || 0;

  // Filter- und Suchfunktionen
  const filteredProducts = combinedProducts
    ? (combinedProducts as Product[]).filter((product: Product) => {
        // Sicherstellen, dass product und seine Eigenschaften definiert sind
        if (!product || !product.productName) return false;
        
        // Suchterm-Filter
        const matchesSearch = product.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
        
        // Kategorie-Filter
        const matchesCategory = !categoryFilter || product.category === categoryFilter || 
                              (categoryFilter === 'Unkategorisiert' && !product.category);
        
        // Filter für Lieferanten
        const matchesSupplier = filters.suppliers.length === 0 || 
                               (product.supplier && filters.suppliers.includes(product.supplier));
        
        // Filter für ausgewählte Kategorien
        const matchesSelectedCategories = filters.categories.length === 0 || 
                                        (product.category && filters.categories.includes(product.category));
        
        // Bestand-Filter
        // Überprüfe nur, wenn der Filter aktiviert ist und Bestandsdaten verfügbar sind
        const hasStock = !filters.onlyInStock || 
                        (typeof product.inStock === 'number' && product.inStock > 0);
        
        // Kritischer Bestand
        // Überprüfe nur, wenn der Filter aktiviert ist und Bestandsdaten verfügbar sind
        const hasLowStock = !filters.onlyLowStock || 
                           (typeof product.inStock === 'number' && 
                           ((typeof product.amountCritical === 'number' && 
                             product.inStock <= product.amountCritical && 
                             product.inStock > 0) || 
                            // Falls amountCritical nicht definiert ist, zeige das Produkt trotzdem
                            (product.amountCritical === undefined && product.inStock > 0)));
        
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
              matchesSupplier && 
              matchesSelectedCategories && 
              hasStock && 
              hasLowStock && 
              priceInRange &&
              matchesAgeVerification;
      }).sort((a: Product, b: Product) => {
        let comparison = 0;
        
        // Sortierung basierend auf dem ausgewählten Kriterium
        switch (filters.sortBy) {
          default:
          case "name":
            comparison = a.productName.localeCompare(b.productName);
            break;
          case "price":
            const priceA = a.price || 0;
            const priceB = b.price || 0;
            comparison = priceA - priceB;
            break;
          case "stock":
            const stockA = typeof a.inStock === 'number' ? a.inStock : -1;
            const stockB = typeof b.inStock === 'number' ? b.inStock : -1;
            comparison = stockA - stockB;
            break;
          case "sales":
            const salesA = a.salesCount || 0;
            const salesB = b.salesCount || 0;
            comparison = salesA - salesB;
            break;
        }
        
        // Sortierrichtung anwenden
        return filters.sortDirection === "asc" ? comparison : -comparison;
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
              <div className="flex items-center">
                {(() => {
                  let stockStatusClass = "bg-gray-300";
                  
                  if (typeof product.inStock === 'number') {
                    if (product.inStock <= 0) {
                      stockStatusClass = "bg-red-500";
                    } else if (product.amountCritical && product.inStock <= product.amountCritical) {
                      stockStatusClass = "bg-amber-500";
                    } else {
                      stockStatusClass = "bg-green-500";
                    }
                  }
                  
                  return <div className={`w-4 h-4 rounded-full ${stockStatusClass}`} />;
                })()}
              </div>
            </div>
          </div>
          
          {/* Kategorie oder andere Attribute */}
          <div className="flex flex-wrap gap-1 mb-4">
            {product.category && (
              <Badge variant="secondary" className="text-xs">
                {product.category}
              </Badge>
            )}
          </div>
          
          {/* Verkaufsstatistik, wenn verfügbar */}
          {product.salesCount !== undefined && (
            <div className="text-right mb-2">
              <p className="text-xs text-gray-500">Verkäufe</p>
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
        </CardContent>
      </Card>
    );
  };

  // Product List Item Component
  const ProductListItem = ({ product }: { product: Product }) => {
    // Extrahiere Tags, wenn vorhanden
    const tags = product.tags ? JSON.parse(product.tags) : [];
    const isAlcohol = tags.includes('alcohol') || product.requiresAgeVerification;
    
    return (
      <div 
        className="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b"
        onClick={() => setLocation(`/produkte/${product.id}`)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-medium text-gray-900 leading-tight">{product.productName}</h3>
                {isAlcohol && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                    18+
                  </Badge>
                )}
              </div>
              
              <div className="space-y-1">
                {product.category && (
                  <p className="text-sm text-gray-600">
                    Kategorie: {product.category}
                  </p>
                )}
                
                <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                  {product.sku && (
                    <span className="flex items-center">
                      <Tag className="h-3 w-3 mr-1" />
                      {product.sku}
                    </span>
                  )}
                  {product.supplier && (
                    <span>Lieferant: {product.supplier}</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="text-right ml-4">
              <p className="text-lg font-semibold text-gray-900">
                {product.price?.toFixed(2) || '–'} €
              </p>
              <p className="text-xs text-gray-500">Preis</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Aktive Filter generieren
  const activeFilters = [];
  
  if (filters.onlyInStock) activeFilters.push("Nur auf Lager");
  if (filters.onlyLowStock) activeFilters.push("Kritischer Bestand");
  if (filters.suppliers.length > 0) activeFilters.push(`Lieferant: ${filters.suppliers.join(', ')}`);
  if (filters.categories.length > 0) activeFilters.push(`Kategorien: ${filters.categories.join(', ')}`);
  if (filters.requiresAgeVerification === true) activeFilters.push("Nur 18+ Produkte");
  if (filters.requiresAgeVerification === false) activeFilters.push("Keine 18+ Produkte");
  if (filters.priceRange[0] > 0 || filters.priceRange[1] < 100) {
    activeFilters.push(`Preis: ${filters.priceRange[0]}€ - ${filters.priceRange[1]}€`);
  }
  if (filters.sortBy !== "name" || filters.sortDirection !== "asc") {
    const sortText = `Sortierung: ${
      filters.sortBy === "name" ? "Name" : 
      filters.sortBy === "price" ? "Preis" : 
      filters.sortBy === "stock" ? "Bestand" : "Verkäufe"
    } (${filters.sortDirection === "asc" ? "aufsteigend" : "absteigend"})`;
    activeFilters.push(sortText);
  }
  
  // Filter löschen
  const clearFilter = (filter: string) => {
    // Hier können Logik hinzugefügt werden, um spezifische Filter zu entfernen
    if (filter.startsWith("Nur auf Lager")) {
      setFilters({...filters, onlyInStock: false});
    } else if (filter.startsWith("Kritischer Bestand")) {
      setFilters({...filters, onlyLowStock: false});
    } else if (filter.startsWith("Lieferant:")) {
      setFilters({...filters, suppliers: []});
    } else if (filter.startsWith("Kategorien:")) {
      setFilters({...filters, categories: []});
    } else if (filter.startsWith("Nur 18+ Produkte") || filter.startsWith("Keine 18+ Produkte")) {
      setFilters({...filters, requiresAgeVerification: null});
    } else if (filter.startsWith("Preis:")) {
      setFilters({...filters, priceRange: [0, 100]});
    } else if (filter.startsWith("Sortierung:")) {
      setFilters({...filters, sortBy: "name", sortDirection: "asc"});
    }
  };

  // Callback für erfolgreichen Import
  const handleSuccessfulImport = () => {
    // Daten nach dem Import neu laden
    queryClient.invalidateQueries({ queryKey: ['/api/products'] });
  };
  
  // Abrufen des aktuellen Synchronisierungsstatus beim Laden
  useEffect(() => {
    const fetchSyncStatus = async () => {
      try {
        const status = await getProductSyncStatus();
        setSyncStatus(status);
      } catch (error) {
        console.error('Fehler beim Abrufen des Synchronisierungsstatus', error);
      }
    };
    
    fetchSyncStatus();
  }, []);

  return (
    <div className="space-y-6">
      {/* Suchleiste und Export/Import-Buttons */}
      <div className="w-full mb-6 flex justify-between">
        <div className="relative flex-1 mr-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            placeholder="Nach Produkten suchen..."
            className="pl-8 h-9 w-full"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          {/* Synchronisierungs-Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSyncProducts}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5"
                >
                  {isSyncing ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                      <span>Synchronisiere...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span>Vendon Sync</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Synchronisiere Produkte mit der Vendon API</p>
                {syncStatus?.lastSync && (
                  <p className="text-xs text-gray-500">
                    Letzte Synchronisierung: {formatDateTime(syncStatus.lastSync, 'datetime')}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Export/Import Buttons */}
          <ExportImportButtons 
            type="products" 
            label="Produkte" 
            onSuccessfulImport={handleSuccessfulImport}
          />
        </div>
      </div>
      
      {/* Aktive Filter anzeigen */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {activeFilters.map((filter, index) => (
            <div 
              key={index} 
              className="text-xs py-1 px-2 bg-gray-100 rounded-md flex items-center gap-1.5"
            >
              {filter}
              <button 
                onClick={() => clearFilter(filter)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Filter Dialog */}
      <FilterDialog 
        isOpen={isFilterDialogOpen} 
        onOpenChange={setIsFilterDialogOpen}
        onApplyFilters={setFilters}
        categories={categories}
        initialFilters={filters}
      />

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
          {(filteredProducts as Product[]).map((product: Product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {!isLoading && !error && viewMode === "list" && (
        <div className="border rounded-md divide-y">
          {(filteredProducts as Product[]).map((product: Product) => (
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
                categories: [],
                requiresAgeVerification: null,
                sortBy: "name",
                sortDirection: "asc"
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