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
  }),
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
  const { data: warehouses, isLoading, error } = useQuery({
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
  const { data: warehouse, isLoading } = useQuery({
    queryKey: [`/api/warehouses/${warehouseId}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Typensicherheit für warehouse gewährleisten
  const warehouseName = warehouse && typeof warehouse === 'object' && 'name' in warehouse 
    ? warehouse.name 
    : '';

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
            : <strong>{warehouse && typeof warehouse === 'object' ? warehouse.name : ''}</strong>
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
  const { data: warehouse, isLoading: isWarehouseLoading } = useQuery({
    queryKey: [`/api/warehouses/${warehouseId}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Lieferanten abfragen
  const { data: suppliers, isLoading: isSuppliersLoading } = useQuery({
    queryKey: ['/api/suppliers'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Produkte abfragen
  const { data: products, isLoading: isProductsLoading } = useQuery({
    queryKey: ['/api/products'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Maschinen abfragen
  const { data: machines, isLoading: isMachinesLoading } = useQuery({
    queryKey: ['/api/machines'],
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
  
  // Wenn ein Produkt ausgewählt wird, Preis und andere Details aktualisieren
  useEffect(() => {
    const productId = itemForm.watch('productId');
    if (productId && products) {
      const product = products.find((p: any) => p.id === productId);
      if (product) {
        setSelectedProduct(product);
        itemForm.setValue('unitPrice', product.costPrice || 0);
      }
    }
  }, [itemForm.watch('productId'), products]);
  
  // Mutation für das Erstellen einer Bestellung
  const createOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/orders', {
        method: 'POST',
        data
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: 'Bestellung erstellt',
        description: `Die Bestellung wurde erfolgreich erstellt.`,
      });
      
      // Zur Bestellungsübersicht navigieren
      setLocation('/bestellungen');
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Beim Erstellen der Bestellung ist ein Fehler aufgetreten.',
        variant: 'destructive',
      });
    }
  });
  
  // Bestellposition hinzufügen
  const addOrderItem = (item: OrderItemValues) => {
    // Produkt-Daten ergänzen
    const product = products?.find((p: any) => p.id === item.productId);
    const machine = item.targetMachineId ? machines?.find((m: any) => m.id === item.targetMachineId) : null;
    
    const newItem = {
      ...item,
      productName: product?.productName || 'Unbekanntes Produkt',
      sku: product?.sku || '-',
      totalPrice: item.quantity * item.unitPrice,
      targetMachineName: machine?.machineName || null
    };
    
    setOrderItems([...orderItems, newItem]);
    setShowAddItem(false);
    itemForm.reset({
      productId: undefined,
      quantity: 1,
      unitPrice: 0,
      notes: '',
      targetMachineId: undefined
    });
    setSelectedProduct(null);
  };
  
  // Bestellposition entfernen
  const removeOrderItem = (index: number) => {
    const updatedItems = [...orderItems];
    updatedItems.splice(index, 1);
    setOrderItems(updatedItems);
  };
  
  // Gesamtbetrag berechnen
  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };
  
  // Bestellung abschicken
  const submitOrder = (values: NewOrderValues) => {
    if (orderItems.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte fügen Sie mindestens ein Produkt zur Bestellung hinzu.',
        variant: 'destructive',
      });
      return;
    }
    
    const orderData = {
      ...values,
      warehouseId,
      items: orderItems,
      totalAmount: calculateTotal(),
      status: 'open',
      createdAt: new Date().toISOString()
    };
    
    createOrderMutation.mutate(orderData);
  };
  
  // Bildschirm für Ladezustand
  if (isWarehouseLoading || isSuppliersLoading || isProductsLoading || isMachinesLoading) {
    return (
      <Card className="w-full max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clipboard className="h-5 w-5" />
            <span>Neue Bestellung erstellen</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clipboard className="h-5 w-5" />
          <span>Neue Bestellung erstellen</span>
        </CardTitle>
        <CardDescription>
          Erstellen Sie eine neue Bestellung für {warehouse && typeof warehouse === 'object' ? warehouse.name : ''}
        </CardDescription>
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
                        {suppliers?.map((supplier: any) => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.name}
                          </SelectItem>
                        ))}
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
                    <FormLabel>Liefertermin</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DatePicker
                          selected={field.value}
                          onChange={(date) => field.onChange(date)}
                          dateFormat="dd.MM.yyyy"
                          locale={de}
                          placeholderText="TT.MM.JJJJ"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          customInput={
                            <Input />
                          }
                        />
                        <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5 pointer-events-none" />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Wann soll die Bestellung geliefert werden?
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
                <FormItem>
                  <FormLabel>Priorität</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-wrap gap-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="low" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                            Niedrig
                          </Badge>
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="normal" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-300">
                            Normal
                          </Badge>
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="high" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-300">
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
              onClick={() => setShowAddItem(true)} 
              variant="outline" 
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Produkt hinzufügen
            </Button>
          </div>
          
          {orderItems.length === 0 ? (
            <div className="text-center p-8 border rounded-lg">
              <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium">Keine Produkte in der Bestellung</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Fügen Sie Produkte hinzu, um die Bestellung zu erstellen.
              </p>
              <Button 
                onClick={() => setShowAddItem(true)} 
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                Produkt hinzufügen
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Einzelpreis</TableHead>
                    <TableHead className="text-right">Gesamtpreis</TableHead>
                    <TableHead className="text-right w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                          {item.targetMachineName && (
                            <p className="text-xs text-muted-foreground">
                              Zielmaschine: {item.targetMachineName}
                            </p>
                          )}
                          {item.notes && (
                            <p className="text-xs italic mt-1">{item.notes}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.totalPrice)}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeOrderItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-4 border-t bg-muted/50">
                <div className="flex justify-end items-center">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Gesamtbetrag</p>
                    <p className="text-lg font-bold">{formatCurrency(calculateTotal())}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
        <Button 
          onClick={orderForm.handleSubmit(submitOrder)}
          disabled={orderItems.length === 0 || !orderForm.formState.isValid || createOrderMutation.isPending}
        >
          {createOrderMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Bestellung erstellen
        </Button>
      </CardFooter>
      
      {/* Dialog zum Hinzufügen einer Bestellposition */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Produkt hinzufügen</DialogTitle>
            <DialogDescription>
              Fügen Sie ein Produkt zur Bestellung hinzu.
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
                          <SelectValue placeholder="Produkt auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(products) ? products.map((product: any) => (
                          <SelectItem key={product.id} value={product.id.toString()}>
                            {product.productName}
                          </SelectItem>
                        )) : (
                          <SelectItem value="no-products" disabled>Keine Produkte verfügbar</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Menge*</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="1" 
                          step="1"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
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
                          type="number" 
                          min="0" 
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
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
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Für welche Maschine ist das Produkt?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Keine spezifische Maschine</SelectItem>
                        {Array.isArray(machines) ? machines.map((machine: any) => (
                          <SelectItem key={machine.id} value={machine.id.toString()}>
                            {machine.machineName}
                          </SelectItem>
                        )) : (
                          <SelectItem value="no-machines" disabled>Keine Maschinen verfügbar</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Geben Sie an, für welche Maschine das Produkt bestimmt ist (optional).
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
                    <FormLabel>Anmerkungen</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Anmerkungen zu diesem Produkt..." 
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {selectedProduct && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium">Produktdetails:</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Artikelnummer:</p>
                      <p>{selectedProduct.sku || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lieferant:</p>
                      <p>{selectedProduct.supplierName || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <DialogFooter className="mt-4">
                <Button variant="outline" type="button" onClick={() => setShowAddItem(false)}>
                  Abbrechen
                </Button>
                <Button type="submit">
                  Hinzufügen
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Schritt 3B: Bestellung kopieren
function CopyOrderForm({
  warehouseId,
  onBack
}: {
  warehouseId: number,
  onBack: () => void
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
  // Warehouse-Daten abfragen
  const { data: warehouse, isLoading: isWarehouseLoading } = useQuery({
    queryKey: [`/api/warehouses/${warehouseId}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Bestehende Bestellungen abfragen
  const { data: orders, isLoading: isOrdersLoading } = useQuery({
    queryKey: ['/api/orders'],
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
  
  // Wenn eine Bestellung ausgewählt wird, Formular aktualisieren
  useEffect(() => {
    if (selectedOrder) {
      orderForm.setValue('supplierId', selectedOrder.supplierId);
      orderForm.setValue('priority', selectedOrder.priority || 'normal');
      orderForm.setValue('notes', selectedOrder.notes || '');
      
      // Bestellpositionen übernehmen
      if (selectedOrder.items && selectedOrder.items.length > 0) {
        setOrderItems(selectedOrder.items.map((item: any) => ({
          ...item,
          id: undefined, // ID entfernen, damit eine neue erstellt wird
          orderId: undefined // Bestellungs-ID entfernen, wird neu zugewiesen
        })));
      }
    }
  }, [selectedOrder]);
  
  // Mutation für das Erstellen einer Bestellung
  const createOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/orders', {
        method: 'POST',
        data
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: 'Bestellung erstellt',
        description: `Die Bestellung wurde erfolgreich kopiert und erstellt.`,
      });
      
      // Zur Bestellungsübersicht navigieren
      setLocation('/bestellungen');
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Beim Erstellen der Bestellung ist ein Fehler aufgetreten.',
        variant: 'destructive',
      });
    }
  });
  
  // Bestellposition entfernen
  const removeOrderItem = (index: number) => {
    const updatedItems = [...orderItems];
    updatedItems.splice(index, 1);
    setOrderItems(updatedItems);
  };
  
  // Bestellposition aktualisieren
  const updateOrderItem = (index: number, field: string, value: any) => {
    const updatedItems = [...orderItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
      totalPrice: field === 'quantity' || field === 'unitPrice' 
        ? (field === 'quantity' ? value : updatedItems[index].quantity) * 
          (field === 'unitPrice' ? value : updatedItems[index].unitPrice)
        : updatedItems[index].totalPrice
    };
    setOrderItems(updatedItems);
  };
  
  // Gesamtbetrag berechnen
  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };
  
  // Bestellung abschicken
  const submitOrder = (values: NewOrderValues) => {
    if (orderItems.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte fügen Sie mindestens ein Produkt zur Bestellung hinzu.',
        variant: 'destructive',
      });
      return;
    }
    
    const orderData = {
      ...values,
      warehouseId,
      items: orderItems,
      totalAmount: calculateTotal(),
      status: 'open',
      createdAt: new Date().toISOString(),
      copiedFromOrderId: selectedOrder?.id // Referenz zur Ursprungsbestellung
    };
    
    createOrderMutation.mutate(orderData);
  };
  
  // Bildschirm für Ladezustand
  if (isWarehouseLoading || isOrdersLoading) {
    return (
      <Card className="w-full max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            <span>Bestellung kopieren</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Copy className="h-5 w-5" />
          <span>Bestellung kopieren</span>
        </CardTitle>
        <CardDescription>
          Erstellen Sie eine neue Bestellung basierend auf einer bestehenden Bestellung für {warehouse && typeof warehouse === 'object' ? warehouse.name : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!selectedOrder ? (
          <>
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Bestehende Bestellung auswählen</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Wählen Sie eine bestehende Bestellung als Vorlage für Ihre neue Bestellung.
              </p>
              
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Suche nach Bestellnummer oder Lieferant..."
                  className="max-w-sm"
                />
                <Button variant="outline" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bestell-Nr.</TableHead>
                      <TableHead>Lieferant</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(orders) && orders.length > 0 ? orders.map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell>{order.orderNumber || `#${order.id}`}</TableCell>
                        <TableCell>{order.supplierName}</TableCell>
                        <TableCell>{formatDate(order.orderDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                            order.status === 'ordered' ? 'bg-blue-100 text-blue-800' :
                            order.status === 'open' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }>
                            {order.status === 'delivered' ? 'Geliefert' :
                             order.status === 'ordered' ? 'Bestellt' :
                             order.status === 'open' ? 'Offen' : order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                          >
                            Auswählen
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6">
                          <p className="text-muted-foreground">Keine Bestellungen gefunden</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-muted/50 p-4 rounded-lg mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Basierend auf Bestellung:</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedOrder(null);
                    setOrderItems([]);
                    orderForm.reset();
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Andere Bestellung wählen
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Bestellnummer</p>
                  <p className="font-medium">{selectedOrder.orderNumber || `#${selectedOrder.id}`}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lieferant</p>
                  <p>{selectedOrder.supplierName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Datum</p>
                  <p>{formatDate(selectedOrder.orderDate)}</p>
                </div>
              </div>
            </div>
            
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
                            <SelectItem 
                              value={selectedOrder.supplierId.toString()}
                            >
                              {selectedOrder.supplierName}
                            </SelectItem>
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
                        <FormLabel>Liefertermin</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <DatePicker
                              selected={field.value}
                              onChange={(date) => field.onChange(date)}
                              dateFormat="dd.MM.yyyy"
                              locale={de}
                              placeholderText="TT.MM.JJJJ"
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              customInput={
                                <Input />
                              }
                            />
                            <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5 pointer-events-none" />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Wann soll die Bestellung geliefert werden?
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
                    <FormItem>
                      <FormLabel>Priorität</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-wrap gap-4"
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="low" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                                Niedrig
                              </Badge>
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="normal" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-300">
                                Normal
                              </Badge>
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="high" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-300">
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
              </div>
              
              {orderItems.length === 0 ? (
                <div className="text-center p-8 border rounded-lg">
                  <PackageOpen className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">Keine Produkte in der Bestellung</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Die ausgewählte Bestellung enthält keine Produkte.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="text-right">Menge</TableHead>
                        <TableHead className="text-right">Einzelpreis</TableHead>
                        <TableHead className="text-right">Gesamtpreis</TableHead>
                        <TableHead className="text-right w-[70px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.productName}</p>
                              <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                              {item.targetMachineName && (
                                <p className="text-xs text-muted-foreground">
                                  Zielmaschine: {item.targetMachineName}
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-xs italic mt-1">{item.notes}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input 
                              type="number" 
                              min="1" 
                              value={item.quantity} 
                              onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value))}
                              className="w-20 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input 
                              type="number" 
                              min="0" 
                              step="0.01"
                              value={item.unitPrice} 
                              onChange={(e) => updateOrderItem(index, 'unitPrice', parseFloat(e.target.value))}
                              className="w-24 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.totalPrice)}</TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => removeOrderItem(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="p-4 border-t bg-muted/50">
                    <div className="flex justify-end items-center">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Gesamtbetrag</p>
                        <p className="text-lg font-bold">{formatCurrency(calculateTotal())}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
        {selectedOrder && (
          <Button 
            onClick={orderForm.handleSubmit(submitOrder)}
            disabled={orderItems.length === 0 || !orderForm.formState.isValid || createOrderMutation.isPending}
          >
            {createOrderMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Bestellung erstellen
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// Schritt 3C: Prognosebasierte Bestellung
function ForecastOrderForm({
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
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Warehouse-Daten abfragen
  const { data: warehouse, isLoading: isWarehouseLoading } = useQuery({
    queryKey: [`/api/warehouses/${warehouseId}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Lieferanten abfragen
  const { data: suppliers, isLoading: isSuppliersLoading } = useQuery({
    queryKey: ['/api/suppliers'],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Produkte abfragen
  const { data: products, isLoading: isProductsLoading } = useQuery({
    queryKey: ['/api/products'],
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
  
  // Prognose generieren
  const generateForecast = async () => {
    setIsGenerating(true);
    
    try {
      // Simulierte Prognoseberechnung (würde normalerweise vom Backend kommen)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Beispielhafte Prognosedaten
      const forecastItems = products
        ?.filter((product: any) => Math.random() > 0.7) // Nur einige Produkte in der Prognose
        .map((product: any) => {
          const quantity = Math.floor(Math.random() * 20) + 1;
          return {
            productId: product.id,
            productName: product.productName,
            sku: product.sku || '-',
            quantity,
            unitPrice: product.costPrice || (Math.random() * 10 + 1).toFixed(2),
            totalPrice: quantity * (product.costPrice || (Math.random() * 10 + 1)),
            forecastedDepletion: Math.floor(Math.random() * 30) + 1, // Tage bis zur Erschöpfung
            confidence: Math.floor(Math.random() * 40) + 60, // Konfidenz in %
          };
        }) || [];
      
      setOrderItems(forecastItems);
      
      // Wähle den Lieferanten mit den meisten Produkten
      if (forecastItems.length > 0 && products && suppliers) {
        const productCounts = forecastItems.reduce((acc: any, item: any) => {
          const product = products.find((p: any) => p.id === item.productId);
          if (product && product.supplierId) {
            acc[product.supplierId] = (acc[product.supplierId] || 0) + 1;
          }
          return acc;
        }, {});
        
        // Lieferant mit den meisten Produkten
        const suggestedSupplierId = Object.entries(productCounts)
          .sort((a: any, b: any) => b[1] - a[1])[0]?.[0];
        
        if (suggestedSupplierId) {
          orderForm.setValue('supplierId', parseInt(suggestedSupplierId));
        }
      }
      
      toast({
        title: 'Prognose generiert',
        description: `Es wurden ${forecastItems.length} Produkte zur Nachbestellung vorgeschlagen.`,
      });
    } catch (error) {
      toast({
        title: 'Fehler',
        description: 'Beim Generieren der Prognose ist ein Fehler aufgetreten.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Beim ersten Laden Prognose generieren
  useEffect(() => {
    if (!isWarehouseLoading && !isSuppliersLoading && !isProductsLoading) {
      setIsLoading(false);
      generateForecast();
    }
  }, [isWarehouseLoading, isSuppliersLoading, isProductsLoading]);
  
  // Bestellposition aktualisieren
  const updateOrderItem = (index: number, field: string, value: any) => {
    const updatedItems = [...orderItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
      totalPrice: field === 'quantity' || field === 'unitPrice' 
        ? (field === 'quantity' ? value : updatedItems[index].quantity) * 
          (field === 'unitPrice' ? value : updatedItems[index].unitPrice)
        : updatedItems[index].totalPrice
    };
    setOrderItems(updatedItems);
  };
  
  // Bestellposition entfernen
  const removeOrderItem = (index: number) => {
    const updatedItems = [...orderItems];
    updatedItems.splice(index, 1);
    setOrderItems(updatedItems);
  };
  
  // Gesamtbetrag berechnen
  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };
  
  // Mutation für das Erstellen einer Bestellung
  const createOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/orders', {
        method: 'POST',
        data
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: 'Bestellung erstellt',
        description: `Die prognosebasierte Bestellung wurde erfolgreich erstellt.`,
      });
      
      // Zur Bestellungsübersicht navigieren
      setLocation('/bestellungen');
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Beim Erstellen der Bestellung ist ein Fehler aufgetreten.',
        variant: 'destructive',
      });
    }
  });
  
  // Bestellung abschicken
  const submitOrder = (values: NewOrderValues) => {
    if (orderItems.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte fügen Sie mindestens ein Produkt zur Bestellung hinzu.',
        variant: 'destructive',
      });
      return;
    }
    
    const orderData = {
      ...values,
      warehouseId,
      items: orderItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
        targetMachineId: item.targetMachineId
      })),
      totalAmount: calculateTotal(),
      status: 'open',
      createdAt: new Date().toISOString(),
      forecastBased: true
    };
    
    createOrderMutation.mutate(orderData);
  };
  
  // Bildschirm für Ladezustand
  if (isLoading) {
    return (
      <Card className="w-full max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart4 className="h-5 w-5" />
            <span>Prognosebasierte Bestellung</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart4 className="h-5 w-5" />
          <span>Prognosebasierte Bestellung</span>
        </CardTitle>
        <CardDescription>
          Erstellen Sie eine Bestellung basierend auf Prognosen für {warehouse && typeof warehouse === 'object' ? warehouse.name : ''}
        </CardDescription>
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
                        {suppliers?.map((supplier: any) => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.name}
                          </SelectItem>
                        ))}
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
                    <FormLabel>Liefertermin</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DatePicker
                          selected={field.value}
                          onChange={(date) => field.onChange(date)}
                          dateFormat="dd.MM.yyyy"
                          locale={de}
                          placeholderText="TT.MM.JJJJ"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          customInput={
                            <Input />
                          }
                        />
                        <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5 pointer-events-none" />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Wann soll die Bestellung geliefert werden?
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
                <FormItem>
                  <FormLabel>Priorität</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-wrap gap-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="low" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                            Niedrig
                          </Badge>
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="normal" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-300">
                            Normal
                          </Badge>
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="high" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-300">
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
        
        {/* Bestellpositionen basierend auf Prognose */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Prognosebasierte Bestellpositionen</h3>
            <Button 
              variant="outline" 
              size="sm"
              onClick={generateForecast}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <span className="h-4 w-4 mr-2">↻</span>
              )}
              Prognose neu berechnen
            </Button>
          </div>
          
          {isGenerating ? (
            <div className="text-center p-8 border rounded-lg">
              <Loader2 className="h-10 w-10 mx-auto text-muted-foreground mb-4 animate-spin" />
              <p className="font-medium">Berechne Prognose...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Die KI-basierte Prognose wird basierend auf historischen Daten erstellt.
              </p>
            </div>
          ) : orderItems.length === 0 ? (
            <div className="text-center p-8 border rounded-lg">
              <BarChart4 className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium">Keine Prognosevorschläge verfügbar</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Es konnten keine Produkte für Nachbestellungen vorgeschlagen werden.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Prognose</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Einzelpreis</TableHead>
                    <TableHead className="text-right">Gesamtpreis</TableHead>
                    <TableHead className="text-right w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            item.confidence >= 80 ? 'bg-green-500' : 
                            item.confidence >= 60 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}></div>
                          <div>
                            <p className="text-xs">
                              Verbrauch in <span className="font-medium">{item.forecastedDepletion} Tagen</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Konfidenz: {item.confidence}%
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input 
                          type="number" 
                          min="1" 
                          value={item.quantity} 
                          onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value))}
                          className="w-20 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input 
                          type="number" 
                          min="0" 
                          step="0.01"
                          value={item.unitPrice} 
                          onChange={(e) => updateOrderItem(index, 'unitPrice', parseFloat(e.target.value))}
                          className="w-24 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.totalPrice)}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeOrderItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-4 border-t bg-muted/50">
                <div className="flex justify-end items-center">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Gesamtbetrag</p>
                    <p className="text-lg font-bold">{formatCurrency(calculateTotal())}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
        <Button 
          onClick={orderForm.handleSubmit(submitOrder)}
          disabled={orderItems.length === 0 || !orderForm.formState.isValid || createOrderMutation.isPending || isGenerating}
        >
          {createOrderMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Bestellung erstellen
        </Button>
      </CardFooter>
    </Card>
  );
}

// Hauptkomponente für den Bestellprozess
export default function NewOrder() {
  const [location, setLocation] = useLocation();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState<OrderMode | null>(null);
  
  // Zurück zur Lagerauswahl
  const goBackToWarehouseSelection = () => {
    setSelectedWarehouseId(null);
  };
  
  // Zurück zur Modusauswahl
  const goBackToModeSelection = () => {
    setSelectedMode(null);
  };
  
  // Den aktuellen Schritt anzeigen
  if (!selectedWarehouseId) {
    return (
      <WarehouseSelectionForm onWarehouseSelected={setSelectedWarehouseId} />
    );
  }
  
  if (!selectedMode) {
    return (
      <OrderModeSelection 
        warehouseId={selectedWarehouseId} 
        onModeSelected={setSelectedMode} 
        onBack={goBackToWarehouseSelection}
      />
    );
  }
  
  // Basierend auf dem ausgewählten Modus die entsprechende Komponente rendern
  switch (selectedMode) {
    case "new":
      return (
        <NewOrderForm 
          warehouseId={selectedWarehouseId} 
          onBack={goBackToModeSelection} 
        />
      );
    case "copy":
      return (
        <CopyOrderForm 
          warehouseId={selectedWarehouseId} 
          onBack={goBackToModeSelection} 
        />
      );
    case "forecast":
      return (
        <ForecastOrderForm 
          warehouseId={selectedWarehouseId} 
          onBack={goBackToModeSelection} 
        />
      );
    default:
      return null;
  }
}