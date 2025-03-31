import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getProduct, 
  getProductSalesTimeSeries, 
  getProductRefills, 
  getProductMachines, 
  updateProduct,
  getSuppliers,
  createSupplier,
  Supplier,
  Product
} from '@/lib/api';
import { 
  Loader2, ArrowLeft, Truck, Package, Tag, Info, Clipboard, Clock, 
  BarChart3, Calendar, ShoppingCart, Edit, Check, CheckCircle2, 
  XCircle, Building2, User, AlertTriangle, PackageOpen, BarChart4, 
  Settings, Store, FileText, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle, DialogTrigger 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>('details');
  const { toast } = useToast();
  const [salesTimePeriod, setSalesTimePeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({
    name: '',
    country: 'DE',
    status: 'active'
  });
  const [editMode, setEditMode] = useState(false);
  const [editedProduct, setEditedProduct] = useState<Partial<Product>>({});
  const queryClient = useQueryClient();

  // Hole Produktdaten
  const { data: product, isLoading, error } = useQuery({
    queryKey: [`/api/products/${id}`],
    queryFn: () => getProduct(id),
    staleTime: 1000 * 60, // 1 Minute
  });

  // Hole Produktverkäufe
  const { data: salesData, isLoading: isLoadingSales } = useQuery({
    queryKey: [`/api/products/${id}/sales`, salesTimePeriod],
    queryFn: () => getProductSalesTimeSeries(id, salesTimePeriod),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Hole Produktauffüllungen
  const { data: refillData, isLoading: isLoadingRefills } = useQuery({
    queryKey: [`/api/products/${id}/refills`],
    queryFn: () => getProductRefills(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Hole Automatenplatzierungen
  const { data: machineData, isLoading: isLoadingMachines } = useQuery({
    queryKey: [`/api/products/${id}/machines`],
    queryFn: () => getProductMachines(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Hole Lieferanten
  const { data: suppliersData } = useQuery({
    queryKey: ['/api/suppliers'],
    queryFn: () => getSuppliers({ limit: 100 }),
    enabled: activeTab === 'supplier',
    staleTime: 1000 * 60 * 15, // 15 Minuten
  });

  // Mutation zum Aktualisieren des Produkts
  const updateProductMutation = useMutation({
    mutationFn: (data: Partial<Product>) => updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${id}`] });
      toast({
        title: "Produkt aktualisiert",
        description: "Die Produktdaten wurden erfolgreich aktualisiert.",
      });
      setEditMode(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Aktualisieren",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    }
  });

  // Mutation zum Erstellen eines Lieferanten
  const createSupplierMutation = useMutation({
    mutationFn: (data: Partial<Supplier>) => {
      // Typumwandlung, um die API-Anforderungen zu erfüllen
      return createSupplier(data as Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>);
    },
    onSuccess: (newSupplier) => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
      
      // Aktualisiere das Produkt mit dem neuen Lieferanten
      if (product) {
        updateProductMutation.mutate({ 
          supplierId: newSupplier.id,
          supplier: newSupplier.name
        });
      }
      
      setShowAddSupplierDialog(false);
      setNewSupplier({
        name: '',
        country: 'DE',
        status: 'active'
      });
      
      toast({
        title: "Lieferant hinzugefügt",
        description: `Der Lieferant "${newSupplier.name}" wurde erfolgreich erstellt und dem Produkt zugewiesen.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Erstellen des Lieferanten",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    }
  });

  // Wenn sich das Produkt ändert, aktualisiere den Bearbeitungszustand
  useEffect(() => {
    if (product) {
      setEditedProduct({
        productName: product.productName,
        description: product.description,
        category: product.category,
        price: product.price,
        vat: product.vat,
        costPrice: product.costPrice,
        requiresAgeVerification: product.requiresAgeVerification,
        packageSize: product.packageSize,
        shelfLifeDays: product.shelfLifeDays,
        supplierId: product.supplierId,
        supplier: product.supplier,
        articleSupplier: product.articleSupplier,
        minOrderQuantity: product.minOrderQuantity
      });
    }
  }, [product]);

  // Funktion zum Speichern der bearbeiteten Produktdaten
  const handleSaveProduct = () => {
    updateProductMutation.mutate(editedProduct);
  };

  // Funktion zum Hinzufügen eines neuen Lieferanten
  const handleAddSupplier = () => {
    if (!newSupplier.name) {
      toast({
        title: "Name erforderlich",
        description: "Bitte geben Sie einen Namen für den Lieferanten ein.",
        variant: "destructive",
      });
      return;
    }
    
    createSupplierMutation.mutate(newSupplier);
  };

  // Berechne einige Statistiken
  const totalRefillsRemoved = Array.isArray(refillData) 
    ? refillData.reduce((total, refill) => total + (refill.removed || 0), 0) 
    : 0;
  const totalRefillsAdded = Array.isArray(refillData) 
    ? refillData.reduce((total, refill) => total + (refill.added || 0), 0) 
    : 0;
  const activeInMachines = Array.isArray(machineData) 
    ? machineData.filter(m => m.currentStock > 0).length 
    : 0;

  // Parst die Tags, wenn vorhanden
  const tags = product?.tags ? JSON.parse(product.tags) : [];
  const isAlcohol = tags.includes('alcohol') || product?.requiresAgeVerification;

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6">
      {/* Back button and header */}
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          className="mr-2" 
          onClick={() => setLocation('/produkte')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück
        </Button>
        <h1 className="text-2xl font-bold">Produktdetails</h1>
      </div>

      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Lade Produktdaten...</span>
        </div>
      )}

      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-800">Fehler beim Laden der Produktdaten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">
              {error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.'}
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => setLocation('/produkte')}>
              Zurück zur Produktübersicht
            </Button>
          </CardFooter>
        </Card>
      )}

      {product && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Linke Spalte: Produktdetails */}
          <div className="lg:col-span-2">
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{product.productName}</CardTitle>
                    {product.sku && (
                      <CardDescription className="flex items-center mt-1">
                        <Tag className="h-3 w-3 mr-1" />
                        {product.sku}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isAlcohol && (
                      <span><Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        18+
                      </Badge></span>
                    )}
                    {product.category && (
                      <span><Badge variant="secondary">
                        {product.category}
                      </Badge></span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid grid-cols-4 w-full mb-4">
                    <TabsTrigger value="details">
                      <Info className="h-4 w-4 mr-1" />
                      Details
                    </TabsTrigger>
                    <TabsTrigger value="inventory">
                      <Package className="h-4 w-4 mr-1" />
                      Bestand
                    </TabsTrigger>
                    <TabsTrigger value="sales">
                      <BarChart3 className="h-4 w-4 mr-1" />
                      Verkäufe
                    </TabsTrigger>
                    <TabsTrigger value="supplier">
                      <Truck className="h-4 w-4 mr-1" />
                      Lieferant
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="details">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                      {/* Preis */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Preis</h3>
                        <p className="text-lg font-semibold">{product.price?.toFixed(2) || '–'} €</p>
                        {product.vat && <p className="text-xs text-gray-500">zzgl. {product.vat}% MwSt.</p>}
                      </div>

                      {/* Kostpreis (falls vorhanden) */}
                      {product.costPrice && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Kostpreis</h3>
                          <p className="text-lg font-semibold">{product.costPrice.toFixed(2)} €</p>
                          {product.costPrice && product.price && (
                            <p className="text-xs text-gray-500">
                              Marge: {((product.price - product.costPrice) / product.price * 100).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      )}

                      {/* Lieferant */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Lieferant</h3>
                        <p className="font-medium">{product.supplier || '–'}</p>
                      </div>

                      {/* Produkt-ID */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Produkt-ID</h3>
                        <p className="font-medium">
                          {product.id}
                          {product.vendonId && (
                            <span className="text-xs text-gray-500 ml-2">
                              (Vendon: {product.vendonId})
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Kategorie */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Kategorie</h3>
                        <p className="font-medium">{product.category || '–'}</p>
                      </div>

                      {/* Beschreibung */}
                      {product.description && (
                        <div className="col-span-2">
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Beschreibung</h3>
                          <p className="font-medium whitespace-pre-line">{product.description}</p>
                        </div>
                      )}

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div className="col-span-2">
                          <h3 className="text-sm font-medium text-gray-500 mb-2">Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {tags.map((tag: string) => (
                              <span key={tag}>
                                <Badge variant="outline" className="bg-gray-50">
                                  {tag}
                                </Badge>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Artikel/Barcode */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Artikelnummer</h3>
                        <p className="font-medium">{product.article || '–'}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Barcode</h3>
                        <p className="font-medium">{product.barcode || '–'}</p>
                      </div>

                      {/* Pfand */}
                      {(product.depositPrice !== null && product.depositPrice !== undefined) && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Pfand</h3>
                          <p className="font-medium">{product.depositPrice.toFixed(2)} €</p>
                          {product.depositVat && <p className="text-xs text-gray-500">zzgl. {product.depositVat}% MwSt.</p>}
                        </div>
                      )}

                      {/* Typ */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Produkttyp</h3>
                        <p className="font-medium">{product.productType || 'Standard'}</p>
                      </div>

                      {/* Einheiten */}
                      {product.units && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 mb-1">Einheiten</h3>
                          <p className="font-medium">{product.units}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="inventory">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                      {/* Aktueller Bestand */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Aktueller Bestand</h3>
                        <p className="text-lg font-semibold">{typeof product.inStock === 'number' ? product.inStock : '–'}</p>
                      </div>

                      {/* Nachfüllgröße */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Standardnachfüllmenge</h3>
                        <p className="font-medium">{product.refillUnitSize || '–'}</p>
                      </div>

                      {/* Minimale Menge */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Mindestbestand</h3>
                        <p className="font-medium">{product.amountCritical || '–'}</p>
                      </div>

                      {/* Maximale Menge */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Maximalbestand</h3>
                        <p className="font-medium">{product.amountMax || '–'}</p>
                      </div>

                      {/* Lagerort */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Lagerort</h3>
                        <p className="font-medium">{product.warehouseLocation || '–'}</p>
                      </div>

                      {/* Kritisch */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
                        <div className="flex gap-2">
                          {product.critical && (
                            <span><Badge variant="destructive">Kritischer Bestand</Badge></span>
                          )}
                          {!product.critical && typeof product.inStock === 'number' && product.inStock > 0 && (
                            <span><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Auf Lager
                            </Badge></span>
                          )}
                          {!product.critical && typeof product.inStock === 'number' && product.inStock <= 0 && (
                            <span><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              Nicht auf Lager
                            </Badge></span>
                          )}
                        </div>
                      </div>

                      {/* Bestandsverlauf (visueller Hinweis) */}
                      <div className="col-span-2 mt-4">
                        <h3 className="text-sm font-medium text-gray-500 mb-3">Bestandsverlauf</h3>
                        <div className="bg-gray-50 border border-gray-100 rounded-md p-6 flex flex-col items-center justify-center">
                          <Clipboard className="h-12 w-12 text-gray-300 mb-3" />
                          <p className="text-sm text-gray-500 text-center">
                            Detaillierter Bestandsverlauf verfügbar unter
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="mt-3"
                            onClick={() => setLocation(`/lager?productId=${id}&view=history`)}
                          >
                            <Clipboard className="h-4 w-4 mr-2" />
                            Bestandsverlauf anzeigen
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="sales">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                      {/* Verkäufe Übersicht */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Verkäufe gesamt</h3>
                        <p className="text-lg font-semibold">{product.salesCount || '0'}</p>
                      </div>

                      {/* Letzter Verkauf */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Letzter Verkauf</h3>
                        <p className="font-medium">
                          {product.lastSale ? formatDateTime(product.lastSale, 'datetime') : '–'}
                        </p>
                      </div>

                      {/* Verkaufsdiagramm */}
                      <div className="col-span-2 mt-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-medium text-gray-500">Verkaufsentwicklung</h3>
                          <div className="flex gap-2">
                            <Button 
                              size="sm"
                              variant={salesTimePeriod === 'day' ? 'default' : 'outline'}
                              onClick={() => setSalesTimePeriod('day')}
                            >
                              Tag
                            </Button>
                            <Button 
                              size="sm"
                              variant={salesTimePeriod === 'week' ? 'default' : 'outline'}
                              onClick={() => setSalesTimePeriod('week')}
                            >
                              Woche
                            </Button>
                            <Button 
                              size="sm"
                              variant={salesTimePeriod === 'month' ? 'default' : 'outline'}
                              onClick={() => setSalesTimePeriod('month')}
                            >
                              Monat
                            </Button>
                            <Button 
                              size="sm"
                              variant={salesTimePeriod === 'year' ? 'default' : 'outline'}
                              onClick={() => setSalesTimePeriod('year')}
                            >
                              Jahr
                            </Button>
                          </div>
                        </div>
                        
                        {isLoadingSales ? (
                          <div className="h-80 flex items-center justify-center bg-gray-50 rounded-md border">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">Lade Verkaufsdaten...</span>
                          </div>
                        ) : salesData && salesData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={salesData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis 
                                dataKey="date" 
                                tickFormatter={(value) => {
                                  const date = new Date(value);
                                  if (salesTimePeriod === 'day') {
                                    return `${date.getHours()}:00`;
                                  } else if (salesTimePeriod === 'week') {
                                    return ['So','Mo','Di','Mi','Do','Fr','Sa'][date.getDay()];
                                  } else if (salesTimePeriod === 'month') {
                                    return date.getDate().toString();
                                  } else {
                                    return ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][date.getMonth()];
                                  }
                                }}
                              />
                              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                              <Tooltip 
                                formatter={(value: number, name: string) => {
                                  if (name === 'count') return [`${value} Stück`, 'Verkäufe'];
                                  if (name === 'revenue') return [`${value.toFixed(2)} €`, 'Umsatz'];
                                  return [value, name];
                                }}
                                labelFormatter={(label) => {
                                  const date = new Date(label);
                                  if (salesTimePeriod === 'day') {
                                    return `${date.getHours()}:00 Uhr, ${date.toLocaleDateString('de-DE')}`;
                                  } else if (salesTimePeriod === 'week') {
                                    return `${date.toLocaleDateString('de-DE')}`;
                                  } else if (salesTimePeriod === 'month') {
                                    return `${date.toLocaleDateString('de-DE')}`;
                                  } else {
                                    return `${['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][date.getMonth()]} ${date.getFullYear()}`;
                                  }
                                }}
                              />
                              <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="count" />
                              <Bar yAxisId="right" dataKey="revenue" fill="#82ca9d" name="revenue" />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-80 flex flex-col items-center justify-center bg-gray-50 rounded-md border">
                            <BarChart3 className="h-12 w-12 text-gray-300 mb-3" />
                            <p className="text-sm text-gray-500 text-center">
                              Keine Verkaufsdaten für diesen Zeitraum verfügbar
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Produktplatzierungen */}
                      <div className="col-span-2 mt-6">
                        <h3 className="text-sm font-medium text-gray-500 mb-3">Automaten mit diesem Produkt</h3>
                        
                        {isLoadingMachines ? (
                          <div className="h-40 flex items-center justify-center bg-gray-50 rounded-md border">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">Lade Automatendaten...</span>
                          </div>
                        ) : machineData && machineData.length > 0 ? (
                          <div className="border rounded-md">
                            <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 font-medium text-sm">
                              <div className="col-span-4">Automat</div>
                              <div className="col-span-3">Standort</div>
                              <div className="col-span-2 text-center">Aktueller Bestand</div>
                              <div className="col-span-3 text-right">Letzte Auffüllung</div>
                            </div>
                            <div className="divide-y">
                              {machineData.map((machine, index) => (
                                <div 
                                  key={machine.machineId} 
                                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-gray-50"
                                >
                                  <div className="col-span-4 font-medium">{machine.machineName}</div>
                                  <div className="col-span-3 text-gray-600">
                                    {/* Hier könnte ein Standort angezeigt werden, wenn verfügbar */}
                                  </div>
                                  <div className="col-span-2 text-center">
                                    {machine.currentStock > 0 ? (
                                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                        {machine.currentStock}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                        Leer
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="col-span-3 text-right text-gray-600">
                                    {machine.lastRefill ? formatDateTime(machine.lastRefill, 'date') : '–'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="h-40 flex flex-col items-center justify-center bg-gray-50 rounded-md border">
                            <Store className="h-12 w-12 text-gray-300 mb-3" />
                            <p className="text-sm text-gray-500 text-center">
                              Dieses Produkt ist aktuell keinem Automaten zugeordnet
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Refill-Statistiken */}
                      <div className="col-span-2 mt-6">
                        <h3 className="text-sm font-medium text-gray-500 mb-3">Auffüllungen und Entnahmen</h3>
                        
                        {isLoadingRefills ? (
                          <div className="h-40 flex items-center justify-center bg-gray-50 rounded-md border">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">Lade Auffülldaten...</span>
                          </div>
                        ) : refillData && refillData.length > 0 ? (
                          <div className="grid grid-cols-2 gap-4">
                            <Card>
                              <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-500">Hinzugefügt</p>
                                    <p className="text-2xl font-bold">{totalRefillsAdded}</p>
                                  </div>
                                  <div className="p-2 bg-green-50 text-green-600 rounded-full">
                                    <Plus className="h-6 w-6" />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                            
                            <Card>
                              <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-500">Entfernt</p>
                                    <p className="text-2xl font-bold">{totalRefillsRemoved}</p>
                                  </div>
                                  <div className="p-2 bg-red-50 text-red-600 rounded-full">
                                    <PackageOpen className="h-6 w-6" />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                            
                            <div className="col-span-2 mt-2">
                              <div className="border rounded-md overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 font-medium text-sm">
                                  <div className="col-span-4">Datum</div>
                                  <div className="col-span-4">Automat</div>
                                  <div className="col-span-2 text-center">+</div>
                                  <div className="col-span-2 text-center">-</div>
                                </div>
                                <div className="divide-y max-h-64 overflow-y-auto">
                                  {refillData.slice(0, 10).map((refill) => (
                                    <div key={refill.id} className="grid grid-cols-12 gap-2 px-4 py-2 text-sm hover:bg-gray-50">
                                      <div className="col-span-4">{formatDateTime(refill.datetime || refill.createdAt, 'date')}</div>
                                      <div className="col-span-4 truncate">{refill.refillId}</div>
                                      <div className="col-span-2 text-center text-green-600">{refill.added || 0}</div>
                                      <div className="col-span-2 text-center text-red-600">{refill.removed || 0}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {refillData.length > 10 && (
                                <div className="mt-2 text-center">
                                  <Button 
                                    variant="link" 
                                    size="sm"
                                    onClick={() => setLocation(`/refills?productId=${id}`)}
                                  >
                                    Alle {refillData.length} Auffüllungen anzeigen
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="h-40 flex flex-col items-center justify-center bg-gray-50 rounded-md border">
                            <PackageOpen className="h-12 w-12 text-gray-300 mb-3" />
                            <p className="text-sm text-gray-500 text-center">
                              Keine Auffüllungen für dieses Produkt gefunden
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="supplier">
                    <div className="grid grid-cols-1 gap-6">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Lieferantendaten</h3>
                        <div className="flex gap-2">
                          {!editMode ? (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setEditMode(true)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Bearbeiten
                            </Button>
                          ) : (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => setEditMode(false)}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Abbrechen
                              </Button>
                              <Button 
                                size="sm" 
                                variant="default" 
                                onClick={handleSaveProduct}
                                disabled={updateProductMutation.isPending}
                              >
                                {updateProductMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 mr-1" />
                                )}
                                Speichern
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {editMode ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-md bg-gray-50">
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="supplier">Lieferant</Label>
                              <div className="flex gap-2 mt-1">
                                <Select
                                  value={editedProduct.supplierId?.toString() || ""}
                                  onValueChange={(value) => {
                                    const selectedSupplier = suppliersData?.data.find(s => s.id.toString() === value);
                                    setEditedProduct({
                                      ...editedProduct,
                                      supplierId: value ? parseInt(value) : undefined,
                                      supplier: selectedSupplier?.name
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Lieferant auswählen" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">Kein Lieferant</SelectItem>
                                    {suppliersData?.data.map((supplier) => (
                                      <SelectItem key={supplier.id} value={supplier.id.toString()}>
                                        {supplier.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="shrink-0"
                                  onClick={() => setShowAddSupplierDialog(true)}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Neu
                                </Button>
                              </div>
                            </div>
                            
                            <div>
                              <Label htmlFor="articleSupplier">Artikelnummer des Lieferanten</Label>
                              <Input
                                id="articleSupplier"
                                value={editedProduct.articleSupplier || ''}
                                onChange={(e) => setEditedProduct({
                                  ...editedProduct,
                                  articleSupplier: e.target.value
                                })}
                                placeholder="z.B. AB-12345"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="minOrderQuantity">Mindestbestellmenge</Label>
                              <Input
                                id="minOrderQuantity"
                                type="number"
                                value={editedProduct.minOrderQuantity?.toString() || ''}
                                onChange={(e) => setEditedProduct({
                                  ...editedProduct,
                                  minOrderQuantity: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                placeholder="0"
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="packageSize">Gebindegröße</Label>
                              <Input
                                id="packageSize"
                                value={editedProduct.packageSize || ''}
                                onChange={(e) => setEditedProduct({
                                  ...editedProduct,
                                  packageSize: e.target.value
                                })}
                                placeholder="z.B. 6x0,5L oder 24x330ml"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="shelfLifeDays">MHD-Haltbarkeit (Tage)</Label>
                              <Input
                                id="shelfLifeDays"
                                type="number"
                                value={editedProduct.shelfLifeDays?.toString() || ''}
                                onChange={(e) => setEditedProduct({
                                  ...editedProduct,
                                  shelfLifeDays: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                placeholder="0"
                              />
                            </div>
                            
                            <div className="flex items-center space-x-2 pt-4">
                              <Checkbox 
                                id="requiresAgeVerification" 
                                checked={editedProduct.requiresAgeVerification}
                                onCheckedChange={(checked) => setEditedProduct({
                                  ...editedProduct,
                                  requiresAgeVerification: checked === true
                                })}
                              />
                              <Label htmlFor="requiresAgeVerification">Altersprüfung erforderlich (18+)</Label>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-md flex items-center">
                                <Building2 className="h-4 w-4 mr-2" />
                                Lieferant
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {product.supplierId ? (
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-500">Name</h4>
                                    <p className="font-medium">{product.supplier || '–'}</p>
                                  </div>
                                  {product.articleSupplier && (
                                    <div>
                                      <h4 className="text-sm font-medium text-gray-500">Artikelnummer</h4>
                                      <p>{product.articleSupplier}</p>
                                    </div>
                                  )}
                                  <div className="pt-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => product.supplierId && setLocation(`/lieferanten/${product.supplierId}`)}
                                    >
                                      <Truck className="h-4 w-4 mr-1" />
                                      Lieferantenprofil öffnen
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-6 text-center">
                                  <Building2 className="h-12 w-12 text-gray-300 mb-3" />
                                  <p className="text-sm text-gray-500 mb-3">
                                    Kein Lieferant zugewiesen
                                  </p>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => setEditMode(true)}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Lieferant hinzufügen
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                          
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-md flex items-center">
                                <PackageOpen className="h-4 w-4 mr-2" />
                                Bestelldaten
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="text-sm font-medium text-gray-500">Gebindegröße</h4>
                                  <p>{product.packageSize || '–'}</p>
                                </div>
                                <div>
                                  <h4 className="text-sm font-medium text-gray-500">Mindestbestellmenge</h4>
                                  <p>{product.minOrderQuantity || '–'}</p>
                                </div>
                                <div>
                                  <h4 className="text-sm font-medium text-gray-500">MHD-Haltbarkeit</h4>
                                  <p>{product.shelfLifeDays ? `${product.shelfLifeDays} Tage` : '–'}</p>
                                </div>
                                {product.requiresAgeVerification && (
                                  <div className="flex items-center pt-2">
                                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                                      Altersprüfung erforderlich (18+)
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                          
                          <div className="md:col-span-2">
                            <Card>
                              <CardHeader className="pb-2">
                                <div className="flex justify-between items-center">
                                  <CardTitle className="text-md flex items-center">
                                    <ShoppingCart className="h-4 w-4 mr-2" />
                                    Bestellungen
                                  </CardTitle>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="flex flex-col items-center justify-center py-6 text-center">
                                  <FileText className="h-12 w-12 text-gray-300 mb-3" />
                                  <p className="text-sm text-gray-500 mb-3">
                                    Verwalten Sie Bestellungen für dieses Produkt unter "Bestellungen"
                                  </p>
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setLocation(`/bestellungen?productId=${id}`)}
                                  >
                                    <ShoppingCart className="h-4 w-4 mr-1" />
                                    Bestellungen anzeigen
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Rechte Spalte: Aktionen und Zusatzinfos */}
          <div>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Aktionen</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Bestand anpassen",
                      description: `Weiterleitung zur Bestandsanpassung für "${product?.productName || `Produkt #${id}`}"`,
                    });
                    setLocation(`/lager?adjust=product&id=${id}`);
                  }}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Bestand anpassen
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Verkaufsstatistik",
                      description: `Weiterleitung zur Verkaufsstatistik für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/auswertungen?productId=${id}&view=sales`);
                  }}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Verkaufsstatistik
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Bestandsverlauf",
                      description: `Weiterleitung zum Bestandsverlauf für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/lager?productId=${id}&view=history`);
                  }}
                >
                  <Clipboard className="h-4 w-4 mr-2" />
                  Bestandsverlauf
                </Button>
                <Separator className="my-2" />
                <Button 
                  variant={product?.critical || (typeof product?.inStock === 'number' && product?.inStock <= 0) ? "default" : "outline"}
                  className={`w-full justify-start ${product?.critical || (typeof product?.inStock === 'number' && product?.inStock <= 0) ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-200 hover:text-amber-900" : ""}`}
                  onClick={() => {
                    toast({
                      title: "Bestellung anlegen",
                      description: `Weiterleitung zur Bestellungsseite mit "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/bestellungen/neu?productId=${id}`);
                  }}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Bestellung anlegen
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Nachfüllungen anzeigen",
                      description: `Weiterleitung zur Übersicht der Nachfüllungen für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/automaten?view=refills&productId=${id}`);
                  }}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Nachfüllungen anzeigen
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Verkäufe anzeigen",
                      description: `Weiterleitung zur Transaktionsübersicht für "${product?.productName || `Produkt #${id}`}"`,
                      variant: "default",
                    });
                    setLocation(`/transactions?productId=${id}`);
                  }}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Verkäufe anzeigen
                </Button>
              </CardContent>
            </Card>

            {product && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Zusammenfassung</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Produktname</h3>
                      <p className="font-medium">{product.productName}</p>
                    </div>
                    
                    <div className="flex justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Preis</h3>
                        <p className="font-medium">{product.price?.toFixed(2) || '–'} €</p>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Bestand</h3>
                        <p className="font-medium">
                          {typeof product.inStock === 'number' ? product.inStock : '–'}
                        </p>
                      </div>
                    </div>
                    
                    {product.supplier && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Lieferant</h3>
                        <p className="font-medium">{product.supplier}</p>
                      </div>
                    )}
                    
                    {product.category && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Kategorie</h3>
                        <p className="font-medium">{product.category}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Dialog zum Hinzufügen eines neuen Lieferanten */}
      <Dialog open={showAddSupplierDialog} onOpenChange={setShowAddSupplierDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neuen Lieferanten anlegen</DialogTitle>
            <DialogDescription>
              Lege einen neuen Lieferanten an, der diesem Produkt zugeordnet wird.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={newSupplier.name}
                onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                E-Mail
              </Label>
              <Input
                id="email"
                type="email"
                value={newSupplier.email || ''}
                onChange={(e) => setNewSupplier({...newSupplier, email: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">
                Telefon
              </Label>
              <Input
                id="phone"
                value={newSupplier.phone || ''}
                onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="contactPerson" className="text-right">
                Ansprechpartner
              </Label>
              <Input
                id="contactPerson"
                value={newSupplier.contactPerson || ''}
                onChange={(e) => setNewSupplier({...newSupplier, contactPerson: e.target.value})}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddSupplierDialog(false)}>
              Abbrechen
            </Button>
            <Button type="button" onClick={handleAddSupplier} disabled={createSupplierMutation.isPending}>
              {createSupplierMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gespeichert...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Speichern
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}