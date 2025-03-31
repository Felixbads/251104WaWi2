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
  Calendar,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Loader2,
  Search,
  Filter,
  AlertCircle,
  Check,
  X
  // Hinweis: RefreshCcw wurde entfernt und durch Text-Icon ersetzt
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
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
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

  // Wenn ein Produkt ausgewählt wird, Preis und andere Details aktualisieren
  useEffect(() => {
    const productId = itemForm.watch('productId');
    if (productId && products) {
      const product = products.data.find((p: any) => p.id === productId);
      if (product) {
        setSelectedProduct(product);
        // Preis nur aktualisieren, wenn es noch nicht manuell angepasst wurde
        const currentPrice = itemForm.watch('unitPrice');
        if (currentPrice === 0 || !currentPrice) {
          itemForm.setValue('unitPrice', product.purchasePrice || 0);
        }
      }
    }
  }, [itemForm.watch('productId'), products]);
  
  // Bestellposition hinzufügen
  const addOrderItem = (data: OrderItemValues) => {
    if (selectedProduct) {
      const newItem = {
        ...data,
        id: Date.now(), // Temporäre ID für die UI
        productName: selectedProduct.name,
        sku: selectedProduct.sku,
        supplierSku: selectedProduct.supplierSku,
        unit: selectedProduct.unit || 'stk',
        totalPrice: data.quantity * data.unitPrice,
        // Bei Bedarf weitere Felder
      };
      
      setOrderItems([...orderItems, newItem]);
      setShowAddItem(false);
      
      // Form zurücksetzen
      itemForm.reset({
        productId: undefined,
        quantity: 1,
        unitPrice: 0,
        notes: '',
        targetMachineId: undefined
      });
      
      setSelectedProduct(null);
      
      toast({
        title: "Position hinzugefügt",
        description: `${newItem.productName} (${newItem.quantity} ${newItem.unit}) wurde zur Bestellung hinzugefügt.`,
      });
    }
  };
  
  // Bestellposition entfernen
  const removeOrderItem = (itemId: number) => {
    setOrderItems(orderItems.filter(item => item.id !== itemId));
    
    toast({
      title: "Position entfernt",
      description: "Die Position wurde aus der Bestellung entfernt.",
    });
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
      
      const formValues = orderForm.getValues();
      
      // Bestellungsdaten zusammenstellen
      const order = {
        ...formValues,
        expectedDeliveryDate: formValues.expectedDeliveryDate ? format(formValues.expectedDeliveryDate, 'yyyy-MM-dd') : null,
        warehouseId,
        status: 'draft', // Standardstatus für neue Bestellungen
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
        
        // Zur Bestellübersicht zurückkehren
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
          <form className="space-y-6">
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
                      Gesamtsumme:
                    </TableCell>
                    <TableCell className="font-bold">
                      {formatCurrency(totalAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        
        {/* Dialog zum Hinzufügen einer Position */}
        <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Position hinzufügen</DialogTitle>
              <DialogDescription>
                Wählen Sie ein Produkt und geben Sie die gewünschte Menge an.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...itemForm}>
              <form onSubmit={itemForm.handleSubmit(addOrderItem)} className="space-y-4">
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
                          {products?.data ? products.data.map((product: any) => (
                            <SelectItem key={product.id} value={product.id.toString()}>
                              {product.name}
                              {product.sku ? ` (${product.sku})` : ''}
                            </SelectItem>
                          )) : null}
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
                  <Button variant="outline" type="button" onClick={() => setShowAddItem(false)}>
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
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
        
        <Button 
          type="button"
          disabled={orderItems.length === 0}
          onClick={submitOrder}
        >
          <Save className="mr-2 h-4 w-4" />
          Bestellung speichern
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
  // Implementierung für "Prognosebasierte Bestellung" Schritt
  // ...
  
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Prognosebasierte Bestellung</CardTitle>
        <CardDescription>
          Erstellen Sie eine Bestellung basierend auf automatischen Verkaufsprognosen.
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

// Hauptkomponente: Neue Bestellung
export default function NewOrder() {
  const [step, setStep] = useState(1);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [orderMode, setOrderMode] = useState<OrderMode | null>(null);
  
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
    <div className="container mx-auto py-6 space-y-6">
      <div className="pb-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Neue Bestellung</h1>
        <p className="text-muted-foreground">
          Erstellen Sie eine neue Bestellung für Ihre Lager oder Maschinen.
        </p>
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