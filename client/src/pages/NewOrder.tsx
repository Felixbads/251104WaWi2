import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { apiRequest } from "@/lib/queryClient";
import { getPurchaseConditionsByProduct } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// UI Komponenten
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";

// Icons
import {
  Warehouse,
  Clipboard,
  Copy,
  BarChart4,
  Truck,
  CalendarDays,
  PackageOpen,
  Building2,
  ChevronRight,
  ChevronDown,
  Calendar,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  FileEdit,
  Loader2,
  Search,
  Filter,
  AlertCircle,
  Check,
  X,
  ShoppingCart,
  ShoppingBag,
  Mountain,
  Coffee,
  Utensils,
  MapPin,
  Info,
  Send,
  Clock
} from "lucide-react";

// Schema für Lagerwahl
const warehouseSelectSchema = z.object({
  warehouseId: z.number({
    required_error: "Bitte wählen Sie ein Lager aus"
  })
});

// Schema für Bestelloptionen
const orderOptionSchema = z.enum(["new", "copy", "forecast"]);

// Schema für neue Bestellung
const newOrderSchema = z.object({
  supplierId: z.number({
    required_error: "Bitte wählen Sie einen Lieferanten aus"
  }),
  expectedDeliveryDate: z.date().optional(),
  notes: z.string().optional(),
  priority: z.string().default("normal")
});

// Schema für Bestellposition
const orderItemSchema = z.object({
  productId: z.number({
    required_error: "Bitte wählen Sie ein Produkt aus"
  }).nullable(), // Erlaubt null-Wert
  quantity: z.number({
    required_error: "Bitte geben Sie eine Menge an"
  }).min(1, {
    message: "Die Menge muss mindestens 1 sein"
  }),
  unitPrice: z.number({
    required_error: "Bitte geben Sie einen Einzelpreis an"
  }).min(0, {
    message: "Der Preis kann nicht negativ sein"
  }),
  notes: z.string().optional(),
  targetMachineId: z.number().optional()
});

type OrderMode = z.infer<typeof orderOptionSchema>;
type WarehouseSelectValues = z.infer<typeof warehouseSelectSchema>;
type NewOrderValues = z.infer<typeof newOrderSchema>;
type OrderItemValues = z.infer<typeof orderItemSchema>;

// Hilffunktion zum Formatieren von Währungsbeträgen
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

// Hilffunktion zum Formatieren von Datumsangaben
const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = parseISO(dateString);
  return isValid(date) ? format(date, "dd.MM.yyyy", { locale: de }) : "-";
};

// Schritt 1: Auswahl des Lagers
function WarehouseSelectionForm({
  onWarehouseSelected
}: {
  onWarehouseSelected: (warehouseId: number) => void
}) {
  const { toast } = useToast();
  
  // Abfrage der Lager
  const { data: warehouses, isLoading, error } = useQuery<any[]>({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Form-Hook
  const form = useForm<WarehouseSelectValues>({
    resolver: zodResolver(warehouseSelectSchema),
    defaultValues: {
      warehouseId: undefined
    }
  });
  
  // Form-Submit
  const onSubmit = (values: WarehouseSelectValues) => {
    onWarehouseSelected(values.warehouseId);
  };
  
  // Ladevorgang
  if (isLoading) {
    return (
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            <span>Lager für Bestellung auswählen</span>
          </CardTitle>
          <CardDescription>
            Wählen Sie das Ziellager aus, in das die Bestellung geliefert werden soll.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  // Fehlerzustand
  if (error) {
    return (
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Fehler beim Laden der Lager</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Es ist ein Fehler beim Laden der Lagerdaten aufgetreten. Bitte versuchen Sie es später erneut.
          </p>
          <p className="text-sm text-destructive mt-2">
            {(error as Error)?.message || 'Unbekannter Fehler'}
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Erneut versuchen
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  // Keine Lager vorhanden
  if (!warehouses || warehouses.length === 0) {
    return (
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            <span>Lager für Bestellung auswählen</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Lager vorhanden</h3>
          <p className="text-muted-foreground mb-4">
            Sie müssen zuerst ein Lager anlegen, bevor Sie eine Bestellung erstellen können.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button asChild>
            <Link to="/lager">Lager anlegen</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  // Nur aktive Lager anzeigen
  const activeWarehouses = warehouses.filter((wh: any) => wh.isActive);
  
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Warehouse className="h-5 w-5" />
          <span>Lager für Bestellung auswählen</span>
        </CardTitle>
        <CardDescription>
          Wählen Sie das Ziellager aus, in das die Bestellung geliefert werden soll.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ziellager</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Wählen Sie ein Lager aus" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeWarehouses.map((warehouse: any) => (
                        <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                          {warehouse.name}
                          {warehouse.city && ` (${warehouse.city})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    In dieses Lager wird die Bestellung geliefert.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {activeWarehouses.map((warehouse: any) => (
                <Card 
                  key={warehouse.id}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${form.watch('warehouseId') === warehouse.id ? 'border-primary' : ''}`}
                  onClick={() => form.setValue('warehouseId', warehouse.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex justify-between">
                      {warehouse.name}
                      {form.watch('warehouseId') === warehouse.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </CardTitle>
                    {warehouse.city && (
                      <CardDescription className="text-xs">
                        {warehouse.address && `${warehouse.address}, `}
                        {warehouse.postalCode && `${warehouse.postalCode} `}
                        {warehouse.city}
                      </CardDescription>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
            
            <div className="flex justify-between pt-4">
              <Button variant="outline" asChild>
                <Link to="/bestellungen">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Zurück
                </Link>
              </Button>
              <Button type="submit" disabled={!form.watch('warehouseId')}>
                Weiter zu Bestellmodus
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// Schritt 2: Auswahl des Bestellmodus
function OrderModeSelection({
  warehouseId,
  onModeSelected,
  onBack
}: {
  warehouseId: number,
  onModeSelected: (mode: OrderMode) => void,
  onBack: () => void
}) {
  // Warehouse-Daten abfragen
  const { data: warehouse, isLoading } = useQuery<{id: number, name: string}>({
    queryKey: [`/api/warehouses/${warehouseId}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Warehouse-Name extrahieren
  const warehouseName = warehouse?.name || '';

  // Bestellmodi mit Metadaten
  const orderModes = [
    {
      id: "new",
      title: "Neue Bestellung erstellen",
      description: "Erstellen Sie eine komplett neue Bestellung mit individuellen Produkten und Mengen.",
      icon: <Clipboard className="h-8 w-8" />,
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
    },
    {
      id: "copy",
      title: "Bestellung kopieren",
      description: "Erstellen Sie eine neue Bestellung basierend auf einer vorherigen Bestellung.",
      icon: <Copy className="h-8 w-8" />,
      color: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
    },
    {
      id: "forecast",
      title: "Prognosebasierte Bestellung",
      description: "Erstellen Sie eine Bestellung basierend auf einer automatischen Verkaufsprognose.",
      icon: <BarChart4 className="h-8 w-8" />,
      color: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
    }
  ];

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <span>Bestellmodus wählen</span>
        </CardTitle>
        <CardDescription>
          Wählen Sie, wie Sie Ihre Bestellung für{' '}
          {isLoading 
            ? <span className="inline-block w-24 h-4 bg-muted animate-pulse rounded"></span> 
            : <strong>{warehouse?.name || ''}</strong>
          } erstellen möchten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {orderModes.map(mode => (
          <Card 
            key={mode.id}
            className="cursor-pointer transition-all hover:border-primary hover:bg-accent/50"
            onClick={() => onModeSelected(mode.id as OrderMode)}
          >
            <div className="flex p-4 items-start">
              <div className={`rounded-full p-3 mr-4 ${mode.color}`}>
                {mode.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-lg">{mode.title}</h3>
                <p className="text-muted-foreground text-sm">{mode.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground self-center" />
            </div>
          </Card>
        ))}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zur Lagerauswahl
        </Button>
      </CardFooter>
    </Card>
  );
}

// Schritt 3A: Neue Bestellung erstellen
function NewOrderForm({
  warehouseId,
  onBack
}: {
  warehouseId: number,
  onBack: () => void
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  
  // Verwende sessionStorage, um Bestellpositionen zu speichern
  // Bestellpositionen werden als Array verwaltet
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  // Bestellpositionen aus dem SessionStorage laden
  useEffect(() => {
    const savedOrderItems = sessionStorage.getItem('orderItems');
    if (savedOrderItems) {
      try {
        const parsedItems = JSON.parse(savedOrderItems);
        if (Array.isArray(parsedItems) && parsedItems.length > 0) {
          setOrderItems(parsedItems);
        }
      } catch (e) {
        console.error("Fehler beim Laden der gespeicherten Bestellpositionen:", e);
        sessionStorage.removeItem('orderItems');
      }
    }
  }, []);
  
  // Warehouse-Daten abfragen
  const { data: warehouse, isLoading: isWarehouseLoading } = useQuery<{id: number, name: string}>({
    queryKey: [`/api/warehouses/${warehouseId}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Lieferanten abfragen
  const { data: suppliers, isLoading: isSuppliersLoading } = useQuery<{data: any[], meta: any}>({
    queryKey: ['/api/suppliers'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Form für Bestelldetails
  const orderForm = useForm<NewOrderValues>({
    resolver: zodResolver(newOrderSchema),
    defaultValues: {
      supplierId: undefined,
      expectedDeliveryDate: undefined,
      notes: '',
      priority: 'normal'
    }
  });
  
  // State für den ausgewählten Lieferanten
  const [currentSupplierId, setCurrentSupplierId] = useState<number | undefined>(undefined);
  
  // Produkte abfragen mit Lieferantenfilter
  const { data: products, isLoading: isProductsLoading } = useQuery<{data: any[], meta: any}>({
    queryKey: ['/api/products', { supplierId: currentSupplierId }],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!currentSupplierId, // Abfrage erst ausführen, wenn ein Lieferant ausgewählt wurde
  });
  
  // Maschinen abfragen
  const { data: machines, isLoading: isMachinesLoading } = useQuery<{data: any[], meta: any}>({
    queryKey: ['/api/machines'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Form für Bestellposition
  const itemForm = useForm<OrderItemValues>({
    resolver: zodResolver(orderItemSchema),
    defaultValues: {
      productId: undefined,
      quantity: 1,
      unitPrice: 0,
      notes: '',
      targetMachineId: undefined
    }
  });
  
  // Beobachtet Änderungen am ausgewählten Lieferanten
  useEffect(() => {
    // Den aktuellen Lieferanten-Wert aus dem Formular abrufen
    const supplierId = orderForm.watch('supplierId');
    // State aktualisieren, wenn sich der Lieferant ändert
    setCurrentSupplierId(supplierId);
    
    // Produktauswahl zurücksetzen, wenn der Lieferant geändert wird
    if (itemForm.getValues('productId')) {
      itemForm.setValue('productId', null);  // null statt undefined verwenden
      setSelectedProduct(null);
    }
  }, [orderForm.watch('supplierId')]);

  // Abfrage der Bestellbedingungen (Purchase Conditions) für ein Produkt
  const [purchaseConditions, setPurchaseConditions] = useState<any[]>([]);

  // Wenn ein Produkt ausgewählt wird, Preis und andere Details aktualisieren
  useEffect(() => {
    const productId = itemForm.watch('productId');
    
    if (!productId || !products || !products.data) {
      // Keine Aktion, wenn keine Daten vorhanden sind
      return;
    }
    
    // Produkt in den Produktdaten suchen
    const product = products.data.find((p: any) => p.id === productId);
    
    if (!product) {
      console.warn(`Produkt mit ID ${productId} nicht gefunden`);
      return;
    }
    
    // Produkt für die Anzeige setzen
    setSelectedProduct(product);
    
    // Preiskonditionen für dieses Produkt abfragen
    const fetchPurchaseConditions = async () => {
      try {
        console.log(`Lade Preiskonditionen für Produkt ${productId} und Lieferant ${currentSupplierId}`);
        const conditions = await getPurchaseConditionsByProduct(productId);
        
        if (!conditions || conditions.length === 0) {
          console.log("Keine Preiskonditionen gefunden, verwende Standardpreis");
          // Standardpreis aus dem Produkt verwenden
          itemForm.setValue('unitPrice', product.purchasePrice || 0);
          return;
        }
        
        setPurchaseConditions(conditions);
        
        // Bevorzugte oder erste gültige Bedingung suchen
        const currentDate = new Date();
        const validConditions = conditions.filter((condition: any) => {
          if (!condition) return false;
          
          const validFrom = condition.validFrom ? new Date(condition.validFrom) : null;
          const validTo = condition.validTo ? new Date(condition.validTo) : null;
          
          // Prüfe Gültigkeitsdatum
          const isValidDate = (!validFrom || validFrom <= currentDate) && 
                             (!validTo || validTo >= currentDate);
                           
          // Prüfe, ob der Lieferant übereinstimmt (falls einer ausgewählt ist)
          const isMatchingSupplier = currentSupplierId 
            ? condition.supplierId === currentSupplierId 
            : true;
          
          return isValidDate && isMatchingSupplier;
        });
        
        console.log(`${validConditions.length} gültige Preiskonditionen gefunden`);
        
        // Bevorzugte Bedingung finden oder erste gültige verwenden
        const preferredCondition = validConditions.find((c: any) => c.isPreferred) || validConditions[0];
        
        if (preferredCondition) {
          console.log(`Verwende Preiskondition: ${JSON.stringify(preferredCondition)}`);
          
          // Formular mit Werten aus der Bedingung aktualisieren
          itemForm.setValue('unitPrice', preferredCondition.unitPrice);
          
          // Wenn Mindestmenge definiert ist, diese als Standard setzen
          if (preferredCondition.minQuantity && preferredCondition.minQuantity > 0) {
            itemForm.setValue('quantity', preferredCondition.minQuantity);
          }
          
          // Statt Toast-Nachricht, den Preis direkt im Formular anzeigen
          // Keine UI-Meldung, die den Prozess unterbricht
        } else {
          // Wenn keine passende Bedingung gefunden wurde, Standardpreis verwenden
          console.log("Keine bevorzugte Preiskondition gefunden, verwende Standardpreis");
          const currentPrice = itemForm.watch('unitPrice');
          if (currentPrice === 0 || !currentPrice) {
            itemForm.setValue('unitPrice', product.purchasePrice || 0);
          }
        }
      } catch (error) {
        console.error("Fehler beim Laden der Einkaufsbedingungen:", error);
        // Fehlermeldung anzeigen
        toast({
          title: "Fehler beim Laden der Einkaufsbedingungen",
          description: "Der Standardpreis wird verwendet.",
          variant: "destructive"
        });
        
        // Nur den Standard-Preis aus dem Produkt setzen
        const currentPrice = itemForm.watch('unitPrice');
        if (currentPrice === 0 || !currentPrice) {
          itemForm.setValue('unitPrice', product.purchasePrice || 0);
        }
      }
    };
    
    // Preiskonditionen laden
    fetchPurchaseConditions();
  }, [itemForm.watch('productId'), products, currentSupplierId]);
  
  // Bestellposition hinzufügen
  const addOrderItem = (data: OrderItemValues) => {
    if (selectedProduct) {
      // Neues Item erstellen mit allen relevanten Daten
      const newItem = {
        ...data,
        id: Date.now(), // Temporäre ID für die UI
        productName: selectedProduct.name || selectedProduct.productName,
        sku: selectedProduct.sku,
        supplierSku: selectedProduct.supplierSku,
        unit: selectedProduct.unit || 'stk',
        totalPrice: data.quantity * data.unitPrice,
        taxRate: selectedProduct.taxRate || 19, // Standard-Mehrwertsteuer falls nicht definiert
        // Bei Bedarf weitere Felder
      };
      
      // Neue Bestellposition zum Array hinzufügen - zunächst zu einer lokalen Variable
      // um sicherzustellen, dass der Zustand korrekt aktualisiert wird
      const updatedItems = [...orderItems, newItem];
      
      // Zustand aktualisieren
      setOrderItems(updatedItems);
      
      // Speichern im SessionStorage für Persistenz
      try {
        sessionStorage.setItem('orderItems', JSON.stringify(updatedItems));
      } catch (e) {
        console.error("Fehler beim Speichern der Bestellpositionen:", e);
      }
      
      // Form zurücksetzen
      itemForm.reset({
        productId: undefined,
        quantity: 1,
        unitPrice: 0,
        notes: '',
        targetMachineId: undefined
      });
      
      // Ausgewähltes Produkt zurücksetzen
      setSelectedProduct(null);
      
      // Erfolgsmeldung anzeigen, aber NICHT zur Hauptansicht zurückkehren
      toast({
        title: "Position hinzugefügt",
        description: `${newItem.productName} (${newItem.quantity} ${newItem.unit}) wurde zur Bestellung hinzugefügt.`,
      });
      
      // Dialog verzögert schließen, um sicherzustellen, dass alle Zustandsänderungen
      // zuerst abgeschlossen sind
      setTimeout(() => {
        setShowAddItem(false);
      }, 50);
    }
  };
  
  // Bestellposition entfernen
  const removeOrderItem = (itemId: number) => {
    // Aktualisiere den Zustand mit den verbleibenden Positionen
    const updatedItems = orderItems.filter(item => item.id !== itemId);
    setOrderItems(updatedItems);
    
    // Speichern im SessionStorage oder leeren wenn keine Items mehr vorhanden sind
    try {
      if (updatedItems.length > 0) {
        sessionStorage.setItem('orderItems', JSON.stringify(updatedItems));
      } else {
        sessionStorage.removeItem('orderItems');
      }
    } catch (e) {
      console.error("Fehler beim Aktualisieren der Bestellpositionen:", e);
    }
    
    toast({
      title: "Position entfernt",
      description: "Die Position wurde aus der Bestellung entfernt.",
    });
  };
  
  // Hilfsfunktion zum Erstellen des Bestellobjekts
  const createOrderObject = (status: 'draft' | 'submitted') => {
    const formValues = orderForm.getValues();
    
    return {
      ...formValues,
      expectedDeliveryDate: formValues.expectedDeliveryDate ? format(formValues.expectedDeliveryDate, 'yyyy-MM-dd') : null,
      warehouseId,
      status: status,
      totalAmount: orderItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0),
      orderItems: orderItems.map((item, index) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        notes: item.notes || '',
        positionNumber: index + 1,
        targetMachineId: item.targetMachineId,
        // Weitere benötigte Felder
      }))
    };
  };
  
  // Bestellung als Entwurf speichern
  const saveAsDraft = async () => {
    try {
      // Mindestens ein Produkt oder Lieferant sollte vorhanden sein
      const formValues = orderForm.getValues();
      
      if (!formValues.supplierId && orderItems.length === 0) {
        toast({
          title: "Unvollständige Bestellung",
          description: "Bitte wählen Sie mindestens einen Lieferanten oder fügen Sie Produkte hinzu.",
          variant: "destructive"
        });
        return;
      }
      
      // Bestellungsdaten zusammenstellen mit Status 'draft'
      const order = createOrderObject('draft');
      
      // In echter Implementierung: API-Aufruf zum Speichern des Entwurfs
      toast({
        title: "Entwurf wird gespeichert",
        description: "Ihre Bestellung wird als Entwurf gespeichert...",
      });
      
      // Simulierter API-Aufruf
      setTimeout(() => {
        toast({
          title: "Entwurf gespeichert",
          description: "Ihre Bestellung wurde als Entwurf gespeichert.",
        });
        
        // Zustand zurücksetzen - WICHTIG: das muss vor der Navigation passieren!
        sessionStorage.removeItem('orderStep');
        sessionStorage.removeItem('orderWarehouseId');
        sessionStorage.removeItem('orderMode');
        
        // Bei Abschluss des gesamten Prozesses wollen wir zur Übersicht navigieren
        // Aber NUR wenn es ein echter Abschluss ist (speichern/absenden)
        setLocation('/bestellungen');
      }, 1000);
      
    } catch (error) {
      console.error("Fehler beim Speichern des Entwurfs:", error);
      toast({
        title: "Fehler beim Speichern",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive"
      });
    }
  };
  
  // Bestellung speichern und absenden
  const submitOrder = async () => {
    try {
      // Formular validieren
      const orderData = await orderForm.trigger();
      
      if (!orderData) {
        return; // Validierungsfehler verhindern das Absenden
      }
      
      if (orderItems.length === 0) {
        toast({
          title: "Keine Positionen",
          description: "Bitte fügen Sie mindestens eine Position zur Bestellung hinzu.",
          variant: "destructive"
        });
        return;
      }
      
      // Bestellungsdaten zusammenstellen mit Status 'submitted'
      const order = createOrderObject('submitted');
      
      // In echter Implementierung: API-Aufruf zum Speichern der Bestellung
      toast({
        title: "Bestellung wird gespeichert",
        description: "Ihre Bestellung wird verarbeitet...",
      });
      
      // Simulierter API-Aufruf
      setTimeout(() => {
        toast({
          title: "Bestellung erstellt",
          description: "Ihre Bestellung wurde erfolgreich angelegt.",
        });
        
        // Zustand zurücksetzen BEVOR wir navigieren
        // Dies ist wichtig, damit bei der nächsten Bestellung wieder mit Schritt 1 begonnen wird
        sessionStorage.removeItem('orderStep');
        sessionStorage.removeItem('orderWarehouseId');
        sessionStorage.removeItem('orderMode');
        
        // Nur den lokalen orderItems-Zustand zurücksetzen
        setOrderItems([]);
        
        // Bei Abschluss des gesamten Prozesses wollen wir zur Übersicht navigieren
        // aber NUR wenn es ein echter Abschluss ist (speichern/absenden)
        setLocation('/bestellungen');
      }, 1500);
      
    } catch (error) {
      console.error("Fehler beim Speichern der Bestellung:", error);
      toast({
        title: "Fehler beim Speichern",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive"
      });
    }
  };
  
  // Berechnung der Gesamtsumme
  const totalAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
  
  return (
    <Card className="container mx-auto mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Neue Bestellung erstellen</CardTitle>
            <CardDescription>
              Für: {isWarehouseLoading ? 
                <span className="inline-block w-24 h-4 bg-muted animate-pulse rounded"></span> : 
                warehouse?.name
              }
            </CardDescription>
          </div>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <Form {...orderForm}>
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            {/* Basisinformationen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={orderForm.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferant*</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Lieferant auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers?.data ? suppliers.data.map((supplier: any) => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.name}
                          </SelectItem>
                        )) : null}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={orderForm.control}
                name="expectedDeliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gewünschter Liefertermin</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <DatePicker
                          selected={field.value}
                          onChange={(date) => field.onChange(date)}
                          dateFormat="dd.MM.yyyy"
                          locale={de}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          placeholderText="TT.MM.JJJJ"
                          isClearable
                        />
                      </FormControl>
                      <CalendarDays className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                    <FormDescription>
                      Optional. Leer lassen für schnellstmögliche Lieferung.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={orderForm.control}
              name="priority"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Priorität</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="normal" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                            Normal
                          </Badge>
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="high" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                            Hoch
                          </Badge>
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="urgent" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-300">
                            Dringend
                          </Badge>
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={orderForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anmerkungen</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Anmerkungen zur Bestellung..." 
                      className="resize-y min-h-[100px]" 
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Zusätzliche Informationen oder Anweisungen für den Lieferanten.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        
        <Separator />
        
        {/* Bestellpositionen */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Bestellpositionen</h3>
            <Button 
              variant="outline" 
              onClick={() => setShowAddItem(true)}
              disabled={isSuppliersLoading || isProductsLoading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Position hinzufügen
            </Button>
          </div>
          
          {orderItems.length === 0 ? (
            <div className="text-center p-8 border rounded-lg">
              <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium">Keine Positionen hinzugefügt</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Fügen Sie Produkte zu Ihrer Bestellung hinzu, um fortzufahren.
              </p>
              <Button 
                variant="outline" 
                onClick={() => setShowAddItem(true)}
                disabled={isSuppliersLoading || isProductsLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Position hinzufügen
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Produkt</TableHead>
                    <TableHead>Menge</TableHead>
                    <TableHead>Einzelpreis</TableHead>
                    <TableHead>Gesamtpreis</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.productName}
                        {item.sku && <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>}
                      </TableCell>
                      <TableCell>
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(item.totalPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeOrderItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">
                      Zwischensumme (netto):
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(totalAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">
                      Mehrwertsteuer:
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(totalAmount * 0.19)} (19%)
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">
                      Gesamtsumme (brutto):
                    </TableCell>
                    <TableCell className="font-bold">
                      {formatCurrency(totalAmount * 1.19)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        
        {/* Dialog zum Hinzufügen einer Position */}
        <Dialog 
          open={showAddItem} 
          onOpenChange={(open) => {
            // Nur den Dialog schließen, aber nicht zur Lagerauswahl zurückkehren
            setShowAddItem(open);
          }}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Position hinzufügen</DialogTitle>
              <DialogDescription>
                Wählen Sie ein Produkt und geben Sie die gewünschte Menge an.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...itemForm}>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  // Prevent dialog from closing automatically by stopping event propagation
                  e.stopPropagation();
                  itemForm.handleSubmit(addOrderItem)();
                }} 
                className="space-y-4">
                <FormField
                  control={itemForm.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Produkt*</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Produkt wählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                          {products?.data ? products.data
                            .filter((product: any) => {
                              // Wenn kein Lieferant ausgewählt ist, alle Produkte anzeigen
                              if (!currentSupplierId) return true;
                              // Sonst nur Produkte anzeigen, die dem ausgewählten Lieferanten zugeordnet sind
                              return product.supplierId === currentSupplierId;
                            })
                            .map((product: any) => (
                              <SelectItem key={product.id} value={product.id.toString()}>
                                {product.productName || product.name}
                                {product.sku ? ` (${product.sku})` : ''}
                              </SelectItem>
                            ))
                          : null}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={itemForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Menge*</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min="1"
                            step="1"
                            onChange={e => {
                              const value = parseInt(e.target.value);
                              field.onChange(isNaN(value) ? 0 : value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={itemForm.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Einzelpreis (€)*</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min="0"
                            step="0.01"
                            onChange={e => {
                              const value = parseFloat(e.target.value);
                              field.onChange(isNaN(value) ? 0 : value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={itemForm.control}
                  name="targetMachineId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zielmaschine (optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : parseInt(value))}
                        defaultValue={field.value?.toString() || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Keine spezifische Maschine" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Keine spezifische Maschine</SelectItem>
                          {machines?.data ? machines.data.map((machine: any) => (
                            <SelectItem key={machine.id} value={machine.id.toString()}>
                              {machine.name || machine.serialNumber || `Maschine ${machine.id}`}
                              {machine.location ? ` (${machine.location})` : ''}
                            </SelectItem>
                          )) : null}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Optional. Wenn das Produkt für eine bestimmte Maschine bestimmt ist.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={itemForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anmerkungen (optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Anmerkungen zu diesem Produkt..."
                          className="resize-y" 
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Produktdetails anzeigen wenn ein Produkt ausgewählt wurde */}
                {selectedProduct && (
                  <div className="bg-muted/50 p-3 rounded-md text-sm">
                    <h4 className="font-medium mb-1">Produktdetails</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Kategorie:</span>{' '}
                        {selectedProduct.category || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Einheit:</span>{' '}
                        {selectedProduct.unit || 'stk'}
                      </div>
                      {selectedProduct.sku && (
                        <div>
                          <span className="text-muted-foreground">SKU:</span>{' '}
                          {selectedProduct.sku}
                        </div>
                      )}
                      {selectedProduct.supplierSku && (
                        <div>
                          <span className="text-muted-foreground">Lieferanten-Nr.:</span>{' '}
                          {selectedProduct.supplierSku}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => {
                    // Dialog nur schließen, nicht zur Lagerauswahl zurückkehren
                    setShowAddItem(false);
                  }}>
                    Abbrechen
                  </Button>
                  <Button type="submit">
                    Position hinzufügen
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
          <Button 
            variant="secondary" 
            onClick={saveAsDraft}
          >
            <Save className="mr-2 h-4 w-4" />
            Als Entwurf speichern
          </Button>
        </div>
        
        <Button 
          type="button"
          disabled={orderItems.length === 0 || !orderForm.getValues('supplierId')}
          onClick={submitOrder}
        >
          <Send className="mr-2 h-4 w-4" />
          Bestellung absenden
        </Button>
      </CardFooter>
    </Card>
  );
}

// Schritt 3B: Bestellung kopieren
function CopyOrderForm({ warehouseId, onBack }: { warehouseId: number, onBack: () => void }) {
  // Implementierung für "Bestellung kopieren" Schritt
  // ...
  
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Bestellung kopieren</CardTitle>
        <CardDescription>
          Wählen Sie eine Bestellung aus, die als Vorlage dienen soll.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4">
          Diese Funktion ist noch in Entwicklung.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
      </CardFooter>
    </Card>
  );
}

// Schritt 3C: Prognosebasierte Bestellung
function ForecastOrderForm({ warehouseId, onBack }: { warehouseId: number, onBack: () => void }) {
  const { toast } = useToast();
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [forecastPeriod, setForecastPeriod] = useState("7"); // Standard: 7 Tage
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(new Date(Date.now() + 86400000 * 2)); // Standard: in 2 Tagen
  const [showForecastDetails, setShowForecastDetails] = useState(false);
  const [isForecastGenerated, setIsForecastGenerated] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [isProcessingForecast, setIsProcessingForecast] = useState(false);

  // Holen Sie Lieferanten
  const { data: suppliersData, isLoading: isSuppliersLoading } = useQuery({
    queryKey: ["/api/suppliers"],
    retry: 1
  });
  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];
  
  // Holen Sie Prognosemodelle
  const { data: modelsData, isLoading: isModelsLoading } = useQuery({
    queryKey: ["/api/forecast/models"],
    retry: 1
  });
  const models = Array.isArray(modelsData) ? modelsData : [];
  
  // Holen Sie Produkte für das Lager
  const { data: products, isLoading: isProductsLoading } = useQuery({
    queryKey: ["/api/products", { warehouseId }],
    queryFn: () => apiRequest(`/api/products?warehouseId=${warehouseId}`, null, "GET"),
    retry: 1,
    enabled: !!warehouseId
  });
  
  // Holen Sie Maschinen für das Lager
  const { data: machines, isLoading: isMachinesLoading } = useQuery({
    queryKey: ["/api/machines", { warehouseId }],
    queryFn: () => apiRequest(`/api/machines?locationId=${warehouseId}`, null, "GET"),
    retry: 1,
    enabled: !!warehouseId
  });
  
  // Laden Sie Prognosen basierend auf Modell und Zeitraum
  const { data: forecasts, isLoading: isLoadingForecasts, refetch: refetchForecasts } = useQuery({
    queryKey: ["/api/forecast/demand", selectedModelId, forecastPeriod],
    queryFn: async () => {
      if (!selectedModelId) return [];
      
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + parseInt(forecastPeriod));
      
      return apiRequest(`/api/forecast/demand?modelId=${selectedModelId}&startDate=${today.toISOString().split("T")[0]}&endDate=${endDate.toISOString().split("T")[0]}`, null, "GET");
    },
    enabled: !!selectedModelId && !!forecastPeriod,
    retry: 1
  });
  
  // Bestellung erstellen Mutation
  const createOrderMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest("/api/orders", data, "POST");
    },
    onSuccess: (response) => {
      const data = response as any;
      toast({
        title: "Bestellung erstellt",
        description: `Bestellung #${data?.id || 'Neue'} wurde erfolgreich erstellt.`,
      });
      
      // Zurück zur Übersicht oder Details anzeigen
      if (data?.id) {
        window.location.href = `/orders/${data.id}`;
      } else {
        window.location.href = '/bestellungen';
      }
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen der Bestellung: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Prognose generieren
  const handleGenerateForecast = async () => {
    if (!selectedModelId) {
      toast({
        title: "Kein Modell ausgewählt",
        description: "Bitte wählen Sie ein Prognosemodell aus.",
        variant: "destructive",
      });
      return;
    }
    
    setIsProcessingForecast(true);
    
    try {
      const result = await refetchForecasts();
      setIsForecastGenerated(true);
      
      const forecastData = result.data;
      
      if (forecastData && Array.isArray(forecastData) && forecastData.length > 0) {
        // Sortieren Sie Produkte nach Prognose (höchster Bedarf zuerst)
        const productMap = new Map();
        
        forecastData.forEach((forecast: any) => {
          const productId = forecast.product_id;
          if (!productId) return;
          
          // Wenn das Produkt bereits in der Map ist, addieren Sie die Prognosen
          if (productMap.has(productId)) {
            const existing = productMap.get(productId);
            existing.quantity += Math.ceil(forecast.predicted_quantity);
          } else {
            // Finden Sie das Produktobjekt
            const productList = Array.isArray(products) ? products : (products?.data || []);
            const product = productList.find((p: any) => p.id === productId);
            if (product) {
              productMap.set(productId, {
                product,
                quantity: Math.ceil(forecast.predicted_quantity)
              });
            }
          }
        });
        
        // Konvertieren Sie die Map in ein Array und wenden Sie Filter an
        const suggestedProducts = Array.from(productMap.values())
          .filter(item => item.quantity > 0) // Nur Produkte mit positivem Bedarf
          .sort((a, b) => b.quantity - a.quantity); // Absteigend nach Menge sortieren
        
        // Setzen Sie die ausgewählten Produkte
        setSelectedProducts(suggestedProducts.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          notes: "",
          machineId: null
        })));
        
        setShowForecastDetails(true);
      } else {
        toast({
          title: "Keine Prognosen verfügbar",
          description: "Für den ausgewählten Zeitraum und das ausgewählte Modell sind keine Prognosen verfügbar.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Fehler bei der Prognosegenerierung",
        description: "Es gab ein Problem beim Abrufen der Prognosedaten. Bitte versuchen Sie es später noch einmal.",
        variant: "destructive",
      });
      console.error("Fehler bei der Prognosegenerierung:", error);
    } finally {
      setIsProcessingForecast(false);
    }
  };
  
  // Bestellung erstellen
  const handleCreateOrder = () => {
    if (!selectedSupplierId || !deliveryDate || selectedProducts.length === 0) {
      toast({
        title: "Unvollständige Daten",
        description: "Bitte wählen Sie einen Lieferanten aus und stellen Sie sicher, dass mindestens ein Produkt hinzugefügt wurde.",
        variant: "destructive",
      });
      return;
    }
    
    createOrderMutation.mutate({
      supplierId: selectedSupplierId,
      warehouseId,
      expectedDeliveryDate: deliveryDate,
      notes: notes,
      priority: "normal",
      items: selectedProducts.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || "",
        machineId: item.machineId
      })),
      orderMode: "forecast",
      forecastModel: selectedModelId,
      forecastPeriod: parseInt(forecastPeriod)
    });
  };
  
  // Produkt aus der Bestellung entfernen
  const removeProduct = (index: number) => {
    setSelectedProducts(prev => prev.filter((_, i) => i !== index));
  };
  
  // Produktmenge aktualisieren
  const updateProductQuantity = (index: number, quantity: number) => {
    setSelectedProducts(prev => prev.map((item, i) => 
      i === index ? { ...item, quantity } : item
    ));
  };
  
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Prognosebasierte Bestellung</CardTitle>
        <CardDescription>
          Erstellen Sie eine Bestellung basierend auf automatischen Verkaufsprognosen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Schritt 1: Grundlegende Bestellungsdaten */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplier">Lieferant</Label>
                <Select
                  value={selectedSupplierId?.toString() || ""}
                  onValueChange={(value) => setSelectedSupplierId(parseInt(value))}
                >
                  <SelectTrigger id="supplier">
                    <SelectValue placeholder="Lieferant auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuppliersLoading ? (
                      <div className="flex justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : suppliers?.length > 0 ? (
                      suppliers.map((supplier: any) => (
                        <SelectItem key={supplier.id} value={supplier.id.toString()}>
                          {supplier.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>
                        Keine Lieferanten verfügbar
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="deliveryDate">Lieferdatum</Label>
                <div className="relative">
                  <DatePicker
                    selected={deliveryDate}
                    onChange={setDeliveryDate}
                    locale={de}
                    dateFormat="dd.MM.yyyy"
                    placeholderText="Lieferdatum auswählen"
                    className="w-full rounded-md border border-input p-2"
                    minDate={new Date()}
                  />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="forecastModel">Prognosemodell</Label>
                <Select
                  value={selectedModelId?.toString() || ""}
                  onValueChange={(value) => setSelectedModelId(parseInt(value))}
                >
                  <SelectTrigger id="forecastModel">
                    <SelectValue placeholder="Modell auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {isModelsLoading ? (
                      <div className="flex justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : models?.length > 0 ? (
                      models
                        .filter((model: any) => model.status === 'ready')
                        .map((model: any) => (
                          <SelectItem key={model.id} value={model.id.toString()}>
                            {model.name} ({(model.accuracy * 100).toFixed(1)}% Genauigkeit)
                          </SelectItem>
                        ))
                    ) : (
                      <SelectItem value="" disabled>
                        Keine Modelle verfügbar
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="forecastPeriod">Prognosezeitraum</Label>
                <Select
                  value={forecastPeriod}
                  onValueChange={setForecastPeriod}
                >
                  <SelectTrigger id="forecastPeriod">
                    <SelectValue placeholder="Zeitraum auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Tage</SelectItem>
                    <SelectItem value="7">7 Tage</SelectItem>
                    <SelectItem value="14">14 Tage</SelectItem>
                    <SelectItem value="30">30 Tage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button 
              type="button" 
              variant="secondary" 
              onClick={handleGenerateForecast}
              disabled={!selectedModelId || isLoadingForecasts}
              className="w-full"
            >
              {isLoadingForecasts ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Prognose wird generiert...
                </>
              ) : (
                'Prognosebasierte Bestellung generieren'
              )}
            </Button>
          </div>
          
          {/* Schritt 2: Prognostizierte Produkte */}
          {isForecastGenerated && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Vorgeschlagene Produkte</h3>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowForecastDetails(!showForecastDetails)}
                >
                  {showForecastDetails ? 'Details ausblenden' : 'Details anzeigen'}
                </Button>
              </div>
              
              {selectedProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Produkte basierend auf der Prognose vorgeschlagen.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="w-[100px] text-right">Menge</TableHead>
                        <TableHead className="w-[80px] text-center">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((item, index) => {
                        const product = products?.find((p: any) => p.id === item.productId);
                        
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="font-medium">{product?.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {product?.sku || product?.categoryName || ''}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateProductQuantity(index, parseInt(e.target.value))}
                                min={1}
                                className="w-20 text-right"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeProduct(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  
                  {showForecastDetails && forecasts && forecasts.length > 0 && (
                    <div className="bg-muted/50 p-3 rounded-md space-y-2">
                      <h4 className="font-medium">Prognosedetails</h4>
                      <p className="text-sm text-muted-foreground">
                        Die Vorhersage basiert auf historischen Verkaufsdaten, Wetterbedingungen und Feiertagen.
                      </p>
                      <div className="text-sm">
                        <div><span className="font-medium">Zeitraum:</span> {forecastPeriod} Tage</div>
                        <div>
                          <span className="font-medium">Genauigkeit:</span>{' '}
                          {models.find((m: any) => m.id === selectedModelId)?.accuracy 
                            ? `${(models.find((m: any) => m.id === selectedModelId)?.accuracy * 100).toFixed(1)}%` 
                            : 'Unbekannt'}
                        </div>
                        <div><span className="font-medium">Produkte:</span> {selectedProducts.length}</div>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes">Anmerkungen zur Bestellung (optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anmerkungen oder besondere Hinweise zur Bestellung..."
                      className="resize-y min-h-[80px]"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
        
        {isForecastGenerated && selectedProducts.length > 0 && (
          <Button 
            onClick={handleCreateOrder}
            disabled={createOrderMutation.isPending || !selectedSupplierId || selectedProducts.length === 0}
          >
            {createOrderMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird erstellt...
              </>
            ) : (
              'Bestellung erstellen'
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// Hauptkomponente: Neue Bestellung
export default function NewOrder() {
  // PERSISTENTEN ZUSTAND für kritische Werte mit session storage verwenden
  // Bei Neuladen der Seite oder beim Navigieren innerhalb der Anwendung bleiben so die Werte erhalten
  const getInitialStep = () => {
    const savedStep = sessionStorage.getItem('orderStep');
    return savedStep ? parseInt(savedStep) : 1;
  };
  
  const getInitialWarehouseId = () => {
    const savedId = sessionStorage.getItem('orderWarehouseId');
    return savedId ? parseInt(savedId) : null;
  };
  
  const getInitialOrderMode = () => {
    const savedMode = sessionStorage.getItem('orderMode');
    return savedMode as OrderMode | null;
  };
  
  // Zustand mit persistenten Initialwerten
  const [step, setStepInternal] = useState(getInitialStep);
  const [warehouseId, setWarehouseIdInternal] = useState<number | null>(getInitialWarehouseId);
  const [orderMode, setOrderModeInternal] = useState<OrderMode | null>(getInitialOrderMode);
  
  // Wrapper-Funktionen die sowohl den State als auch sessionStorage aktualisieren
  const setStep = (newStep: number) => {
    setStepInternal(newStep);
    sessionStorage.setItem('orderStep', newStep.toString());
  };
  
  const setWarehouseId = (newId: number | null) => {
    setWarehouseIdInternal(newId);
    if (newId) {
      sessionStorage.setItem('orderWarehouseId', newId.toString());
    } else {
      sessionStorage.removeItem('orderWarehouseId');
    }
  };
  
  const setOrderMode = (newMode: OrderMode | null) => {
    setOrderModeInternal(newMode);
    if (newMode) {
      sessionStorage.setItem('orderMode', newMode);
    } else {
      sessionStorage.removeItem('orderMode');
    }
  };
  
  // Zustände werden automatisch beim unmounting gelöscht, wenn die komplette Bestellung abgeschlossen ist
  // oder wenn man explizit zurück zur Liste navigiert
  useEffect(() => {
    return () => {
      // Nur bei echter Navigation weg von der Komponente (nicht bei internem re-render)
      // Der Cleanup wird nur ausgeführt, wenn die gesamte Komponente unmounted wird
      console.log("Component cleanup disabled to prevent state reset issues");
    };
  }, []);
  
  // Diese useEffects wurden entfernt, da wir kein localStorage mehr verwenden
  
  // Schritt 1: Lager auswählen
  const handleWarehouseSelected = (id: number) => {
    setWarehouseId(id);
    setStep(2);
  };
  
  // Schritt 2: Bestellmodus auswählen
  const handleModeSelected = (mode: OrderMode) => {
    setOrderMode(mode);
    setStep(3);
  };
  
  // Zurück zu Schritt 1
  const backToWarehouseSelection = () => {
    setStep(1);
  };
  
  // Zurück zu Schritt 2
  const backToModeSelection = () => {
    setStep(2);
  };
  
  // Je nach Schritt den entsprechenden Inhalt anzeigen
  return (
    <div className="space-y-6">
      {/* Funktionsleiste */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => history.back()} className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={step === 2 ? backToWarehouseSelection : backToModeSelection}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
          )}
        </div>
      </div>
      
      {step === 1 && (
        <WarehouseSelectionForm onWarehouseSelected={handleWarehouseSelected} />
      )}
      
      {step === 2 && warehouseId && (
        <OrderModeSelection 
          warehouseId={warehouseId}
          onModeSelected={handleModeSelected} 
          onBack={backToWarehouseSelection}
        />
      )}
      
      {step === 3 && warehouseId && orderMode === "new" && (
        <NewOrderForm warehouseId={warehouseId} onBack={backToModeSelection} />
      )}
      
      {step === 3 && warehouseId && orderMode === "copy" && (
        <CopyOrderForm warehouseId={warehouseId} onBack={backToModeSelection} />
      )}
      
      {step === 3 && warehouseId && orderMode === "forecast" && (
        <ForecastOrderForm warehouseId={warehouseId} onBack={backToModeSelection} />
      )}
    </div>
  );
}