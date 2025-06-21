import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

// UI-Komponenten
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Icons
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Edit,
  Download,
  MoreVertical,
  Mail,
  Truck,
  Package,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ClipboardList,
  ExternalLink,
  RefreshCcw,
  ArrowUpDown,
  ChevronDown,
  CalendarDays,
  Loader2,
  PackageCheck,
} from "lucide-react";

// API und Formulare
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getOrders, getOrder, getSuppliers, getProducts, getLocations, updateOrder } from "@/lib/api";
import ReceiveOrderDialog from "@/components/orders/ReceiveOrderDialog";

// Demo-Daten für Bestellungen
// Diese würden normalerweise aus der API kommen
const orderStatusMap = {
  open: { label: "Offen", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  ordered: { label: "Bestellt", color: "bg-blue-100 text-blue-800 border-blue-300" },
  partial: { label: "Teilgeliefert", color: "bg-purple-100 text-purple-800 border-purple-300" },
  delivered: { label: "Geliefert", color: "bg-green-100 text-green-800 border-green-300" },
  canceled: { label: "Storniert", color: "bg-red-100 text-red-800 border-red-300" }
};

const paymentStatusMap = {
  pending: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-800" },
  partial: { label: "Teilbezahlt", color: "bg-purple-100 text-purple-800" },
  paid: { label: "Bezahlt", color: "bg-green-100 text-green-800" },
  overdue: { label: "Überfällig", color: "bg-red-100 text-red-800" }
};

const priorityMap = {
  low: { label: "Niedrig", color: "bg-gray-100 text-gray-800" },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-800" },
  high: { label: "Hoch", color: "bg-orange-100 text-orange-800" },
  urgent: { label: "Dringend", color: "bg-red-100 text-red-800" }
};

// Temporäre Beispieldaten für UI-Entwicklung
const demoOrders = [
  {
    id: 1,
    orderNumber: "ORD-2025-03-15-0001",
    supplierId: 1,
    supplierName: "Milchhof Fiedler",
    locationId: 1,
    locationName: "Hauptlager Bad Schandau",
    status: "open",
    orderDate: "2025-03-15T10:30:00",
    expectedDeliveryDate: "2025-03-20T09:00:00",
    actualDeliveryDate: null,
    totalAmount: 1250.75,
    currency: "EUR",
    vatAmount: 199.75,
    paymentStatus: "pending",
    priority: "normal",
    notes: "Bitte Lieferung zur Laderampe",
    createdByName: "Administrator",
    itemCount: 12
  },
  {
    id: 2,
    orderNumber: "ORD-2025-03-10-0002",
    supplierId: 2,
    supplierName: "Privatbrauerei Schwerter",
    locationId: 1,
    locationName: "Hauptlager Bad Schandau",
    status: "ordered",
    orderDate: "2025-03-10T14:15:00",
    expectedDeliveryDate: "2025-03-17T10:00:00",
    actualDeliveryDate: null,
    totalAmount: 875.20,
    currency: "EUR",
    vatAmount: 139.75,
    paymentStatus: "pending",
    priority: "normal",
    notes: "",
    createdByName: "Administrator",
    itemCount: 8
  },
  {
    id: 3,
    orderNumber: "ORD-2025-03-05-0003",
    supplierId: 3,
    supplierName: "Zetti Knusperflocken GmbH",
    locationId: 2,
    locationName: "Lager Königstein",
    status: "delivered",
    orderDate: "2025-03-05T09:45:00",
    expectedDeliveryDate: "2025-03-10T13:00:00",
    actualDeliveryDate: "2025-03-09T11:30:00",
    totalAmount: 520.50,
    currency: "EUR",
    vatAmount: 83.16,
    paymentStatus: "paid",
    priority: "low",
    notes: "Früherer Liefertermin gewünscht",
    createdByName: "Administrator",
    itemCount: 5
  },
  {
    id: 4,
    orderNumber: "ORD-2025-03-01-0004",
    supplierId: 4,
    supplierName: "Landfleischerei Struppen",
    locationId: 1,
    locationName: "Hauptlager Bad Schandau",
    status: "partial",
    orderDate: "2025-03-01T16:00:00",
    expectedDeliveryDate: "2025-03-08T09:00:00",
    actualDeliveryDate: "2025-03-08T10:15:00",
    totalAmount: 1120.40,
    currency: "EUR",
    vatAmount: 179.01,
    paymentStatus: "partial",
    priority: "high",
    notes: "Teillieferung erfolgt am 08.03., Rest kommt nächste Woche",
    createdByName: "Administrator",
    itemCount: 14
  },
  {
    id: 5,
    orderNumber: "ORD-2025-02-25-0005",
    supplierId: 5,
    supplierName: "Oppacher Mineralquellen",
    locationId: 3,
    locationName: "Lager Pirna",
    status: "canceled",
    orderDate: "2025-02-25T11:20:00",
    expectedDeliveryDate: "2025-03-02T14:00:00",
    actualDeliveryDate: null,
    totalAmount: 680.30,
    currency: "EUR",
    vatAmount: 108.70,
    paymentStatus: "pending",
    priority: "normal",
    notes: "Storniert wegen Lieferschwierigkeiten",
    createdByName: "Administrator",
    itemCount: 7
  }
];

// Detail-Beispieldaten für eine Bestellung
const demoOrderDetail = {
  id: 1,
  orderNumber: "ORD-2025-03-15-0001",
  supplierId: 1,
  supplierName: "Milchhof Fiedler",
  locationId: 1,
  locationName: "Hauptlager Bad Schandau",
  status: "open",
  orderDate: "2025-03-15T10:30:00",
  expectedDeliveryDate: "2025-03-20T09:00:00",
  actualDeliveryDate: null,
  totalAmount: 1250.75,
  currency: "EUR",
  vatAmount: 199.75,
  discountAmount: 50.00,
  shippingCost: 15.00,
  paymentTerms: "Zahlung innerhalb von 30 Tagen",
  paymentStatus: "pending",
  paymentDate: null,
  paymentMethod: "Überweisung",
  createdById: 1,
  createdByName: "Administrator",
  lastModifiedById: 1,
  lastModifiedByName: "Administrator",
  notes: "Bitte Lieferung zur Laderampe",
  internalNotes: "Kunde hat besondere Lieferkonditionen",
  documents: JSON.stringify([
    { type: "order", filename: "bestellung_1.pdf", url: "#" },
    { type: "confirmation", filename: "auftragsbestaetigung_1.pdf", url: "#" }
  ]),
  createdAt: "2025-03-15T10:30:00",
  updatedAt: "2025-03-15T10:45:00",
  isAutoGenerated: false,
  forecastId: null,
  priority: "normal",
  // Zusätzlich Lieferantendetails
  supplier: {
    id: 1,
    name: "Milchhof Fiedler",
    contactPerson: "Herr Fiedler",
    phone: "+49 123456789",
    email: "kontakt@milchhof-fiedler.de",
    address: "Dorfstraße 12, 01829 Stadt Wehlen",
    paymentTerms: "Zahlung innerhalb von 30 Tagen",
    deliveryTerms: "Lieferung frei Haus",
    minimumOrderValue: 100.00,
    deliveryDays: JSON.stringify(["monday", "wednesday", "friday"])
  },
  // Bestellpositionen
  orderItems: [
    {
      id: 1,
      orderId: 1,
      productId: 101,
      productName: "Wehlner Milch 0,5l",
      sku: "MF-M-05",
      supplierSku: "M-05",
      quantity: 100,
      unit: "stk",
      quantityDelivered: 0,
      unitPrice: 0.95,
      totalPrice: 95.00,
      vatRate: 7,
      vatAmount: 6.65,
      discount: 0,
      discountAmount: 0,
      positionNumber: 1,
      status: "pending",
      notes: "",
      targetMachineId: 201,
      targetMachineName: "Bad Schandau, Nationalparkbahnhof"
    },
    {
      id: 2,
      orderId: 1,
      productId: 102,
      productName: "Wehlner Kakao Milch 0,5l",
      sku: "MF-KM-05",
      supplierSku: "KM-05",
      quantity: 50,
      unit: "stk",
      quantityDelivered: 0,
      unitPrice: 1.20,
      totalPrice: 60.00,
      vatRate: 7,
      vatAmount: 4.20,
      discount: 0,
      discountAmount: 0,
      positionNumber: 2,
      status: "pending",
      notes: "",
      targetMachineId: 201,
      targetMachineName: "Bad Schandau, Nationalparkbahnhof"
    },
    {
      id: 3,
      orderId: 1,
      productId: 103,
      productName: "Wehlner Trinkjoghurt 0,5l",
      sku: "MF-TJ-05",
      supplierSku: "TJ-05",
      quantity: 40,
      unit: "stk",
      quantityDelivered: 0,
      unitPrice: 1.45,
      totalPrice: 58.00,
      vatRate: 7,
      vatAmount: 4.06,
      discount: 0,
      discountAmount: 0,
      positionNumber: 3,
      status: "pending",
      notes: "",
      targetMachineId: 202,
      targetMachineName: "Schmilka, Alte Feuerwehr"
    },
    {
      id: 4,
      orderId: 1,
      productId: 104,
      productName: "Wehl'ner Wehlrad min. 150g",
      sku: "MF-KS-WR",
      supplierSku: "KS-WR",
      quantity: 60,
      unit: "stk",
      quantityDelivered: 0,
      unitPrice: 4.50,
      totalPrice: 270.00,
      vatRate: 7,
      vatAmount: 18.90,
      discount: 0,
      discountAmount: 0,
      positionNumber: 4,
      status: "pending",
      notes: "",
      targetMachineId: 203,
      targetMachineName: "Königstein, Reißiger Platz"
    },
    {
      id: 5,
      orderId: 1,
      productId: 105,
      productName: "Wehl'ner Kohlberg min. 150g",
      sku: "MF-KS-KB",
      supplierSku: "KS-KB",
      quantity: 40,
      unit: "stk",
      quantityDelivered: 0,
      unitPrice: 5.00,
      totalPrice: 200.00,
      vatRate: 7,
      vatAmount: 14.00,
      discount: 0,
      discountAmount: 0,
      positionNumber: 5,
      status: "pending",
      notes: "",
      targetMachineId: 203,
      targetMachineName: "Königstein, Reißiger Platz"
    }
  ],
  // Status-Historie
  statusHistory: [
    {
      date: "2025-03-15T10:30:00",
      status: "created",
      user: "Administrator",
      note: "Bestellung erstellt"
    },
    {
      date: "2025-03-15T10:45:00",
      status: "open",
      user: "Administrator",
      note: "Bestellung zur Freigabe"
    }
  ]
};

// Schema für die Bestellungen-Seite (Filter)
const filterSchema = z.object({
  status: z.string().optional(),
  supplier: z.string().optional(),
  location: z.string().optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  paymentStatus: z.string().optional(),
  priority: z.string().optional(),
  search: z.string().optional()
});

type FilterValues = z.infer<typeof filterSchema>;

// Schema für neue Bestellung
const newOrderSchema = z.object({
  supplierId: z.number({
    required_error: "Bitte wählen Sie einen Lieferanten aus"
  }),
  locationId: z.number({
    required_error: "Bitte wählen Sie einen Standort aus"
  }),
  expectedDeliveryDate: z.date().optional(),
  notes: z.string().optional(),
  priority: z.string().default("normal")
});

type NewOrderValues = z.infer<typeof newOrderSchema>;

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

type OrderItemValues = z.infer<typeof orderItemSchema>;

// Funktion zum Formatieren von Datumsangaben
const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  try {
    const date = parseISO(dateString);
    return isValid(date) ? format(date, "dd.MM.yyyy HH:mm", { locale: de }) : "-";
  } catch (error) {
    console.error("Fehler beim Formatieren des Datums:", dateString, error);
    return "-";
  }
};

// Funktion zum Formatieren von Währungsbeträgen
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

// Bestellungs-Filter-Komponente
const OrderFilter = ({ filterForm, onResetFilter }: any) => {
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <Form {...filterForm}>
          <form className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Filter */}
              <FormField
                control={filterForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || "all"}
                      defaultValue="all"
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Alle Status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">Alle Status</SelectItem>
                        <SelectItem value="open">Offen</SelectItem>
                        <SelectItem value="ordered">Bestellt</SelectItem>
                        <SelectItem value="partial">Teilgeliefert</SelectItem>
                        <SelectItem value="delivered">Geliefert</SelectItem>
                        <SelectItem value="canceled">Storniert</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Lieferant Filter */}
              <FormField
                control={filterForm.control}
                name="supplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferant</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || "all"}
                      defaultValue="all"
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Alle Lieferanten" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">Alle Lieferanten</SelectItem>
                        <SelectItem value="1">Milchhof Fiedler</SelectItem>
                        <SelectItem value="2">Privatbrauerei Schwerter</SelectItem>
                        <SelectItem value="3">Zetti Knusperflocken GmbH</SelectItem>
                        <SelectItem value="4">Landfleischerei Struppen</SelectItem>
                        <SelectItem value="5">Oppacher Mineralquellen</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Von-Datum Filter */}
              <FormField
                control={filterForm.control}
                name="dateFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Von Datum</FormLabel>
                    <FormControl>
                      <DatePicker
                        selected={field.value}
                        onChange={(date) => field.onChange(date)}
                        dateFormat="dd.MM.yyyy"
                        className="w-full border rounded-md px-3 py-2"
                        locale={de}
                        placeholderText="Von Datum wählen"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Bis-Datum Filter */}
              <FormField
                control={filterForm.control}
                name="dateTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bis Datum</FormLabel>
                    <FormControl>
                      <DatePicker
                        selected={field.value}
                        onChange={(date) => field.onChange(date)}
                        dateFormat="dd.MM.yyyy"
                        className="w-full border rounded-md px-3 py-2"
                        locale={de}
                        placeholderText="Bis Datum wählen"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                <Button 
                  type="submit" 
                  size="sm"
                  variant="default"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filter anwenden
                </Button>
                <Button 
                  type="button" 
                  size="sm"
                  variant="outline"
                  onClick={onResetFilter}
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Zurücksetzen
                </Button>
              </div>
              
              <div className="flex items-center">
                <Search className="h-4 w-4 mr-2 text-gray-500" />
                <Input
                  placeholder="Suche nach Bestellnummer..."
                  className="max-w-sm"
                  value={filterForm.watch("search") || ""}
                  onChange={(e) => filterForm.setValue("search", e.target.value)}
                />
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

// Hauptkomponente für die Bestellungen-Seite
export default function Orders() {
  // Aktuelle Route und Navigation
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Status-Verwaltung
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isGoodsReceiptOpen, setIsGoodsReceiptOpen] = useState(false);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("items");
  
  // Filter-Formular
  const filterForm = useForm<FilterValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      status: 'all'  // 'all' umfasst auch 'draft'-Bestellungen
    }
  });
  
  // Formular für neue Bestellung
  const newOrderForm = useForm<NewOrderValues>({
    resolver: zodResolver(newOrderSchema),
    defaultValues: {
      priority: "normal"
    }
  });
  
  // Formular für Bestellposition
  const orderItemForm = useForm<OrderItemValues>({
    resolver: zodResolver(orderItemSchema),
    defaultValues: {
      quantity: 1
    }
  });
  
  // Daten abrufen
  const { data: apiOrdersResponse, isLoading: apiOrdersLoading } = useQuery({
    queryKey: ['/api/orders', filterForm.watch()],
    queryFn: () => {
      const filters = filterForm.getValues();
      return getOrders({
        status: filters.status === 'all' ? undefined : filters.status,
        supplier: filters.supplier === 'all' ? undefined : filters.supplier,
        location: filters.location === 'all' ? undefined : filters.location,
        dateFrom: filters.dateFrom ? format(filters.dateFrom, 'yyyy-MM-dd') : undefined,
        dateTo: filters.dateTo ? format(filters.dateTo, 'yyyy-MM-dd') : undefined,
        paymentStatus: filters.paymentStatus === 'all' ? undefined : filters.paymentStatus,
        priority: filters.priority === 'all' ? undefined : filters.priority,
        search: filters.search || undefined
      });
    }
  });
  
  const { data: apiSelectedOrder, isLoading: apiOrderDetailLoading } = useQuery({
    queryKey: ['/api/orders', selectedOrderId],
    queryFn: () => selectedOrderId ? getOrder(selectedOrderId) : Promise.reject('No order ID'),
    enabled: !!selectedOrderId
  });
  
  // Daten aus der API oder Fallback auf Demo-Daten
  const orders = apiOrdersResponse?.data || demoOrders;
  const ordersLoading = apiOrdersLoading;
  const selectedOrder = apiSelectedOrder || (selectedOrderId ? demoOrderDetail : null);
  const orderDetailLoading = apiOrderDetailLoading;
  
  // Filter zurücksetzen
  const resetFilter = () => {
    filterForm.reset();
  };
  
  // Bestellung öffnen
  const openOrderDetail = (orderId: number) => {
    setSelectedOrderId(orderId);
    setIsDetailOpen(true);
  };
  
  // Neue Bestellung erstellen (simuliert)
  const createNewOrder = (data: NewOrderValues) => {
    console.log("Neue Bestellung erstellen:", data);
    
    // Demo-Toast anzeigen
    toast({
      title: "Bestellung erstellt",
      description: `Bestellung für ${data.supplierId} wurde erstellt und kann nun bearbeitet werden.`,
    });
    
    // Dialog schließen und ggf. zur Detailseite navigieren
    setIsNewOrderOpen(false);
    // In echter Implementierung: Neue Bestellung erstellen und zur Detailseite navigieren
  };
  
  // Status-Badge für Bestellungen
  const OrderStatusBadge = ({ status }: { status: string }) => {
    const statusConfig = orderStatusMap[status as keyof typeof orderStatusMap] || { label: status, color: "bg-gray-100 text-gray-800" };
    
    return (
      <Badge variant="outline" className={`font-medium ${statusConfig.color}`}>
        {statusConfig.label}
      </Badge>
    );
  };
  
  // Bestellung exportieren (simuliert)
  const exportOrder = (format: string) => {
    toast({
      title: `Export als ${format.toUpperCase()}`,
      description: "Die Bestellung wird exportiert...",
    });
  };
  
  // Render
  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6 space-y-6">
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full mb-6 flex justify-between">
        {/* Linke Seite: Suchfeld */}
        <div className="relative flex-1 mr-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={filterForm.getValues("search") || ""}
            placeholder="Nach Bestellungen suchen..."
            className="pl-8 h-9 w-full"
            onChange={(e) => filterForm.setValue("search", e.target.value)}
          />
        </div>
        
        {/* Rechte Seite: Aktionen */}
        <div className="flex items-center gap-2">
          <Button asChild variant="default">
            <Link to="/bestellungen/neu-v2">
              <Plus className="h-4 w-4 mr-2" />
              Neue Bestellung
            </Link>
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportieren
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportOrder("csv")}>
                Als CSV exportieren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportOrder("excel")}>
                Als Excel exportieren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportOrder("pdf")}>
                Als PDF exportieren
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Filter-Sektion */}
      <OrderFilter 
        filterForm={filterForm} 
        onResetFilter={resetFilter} 
      />
      
      {/* Vereinfachte Bestellungs-Tabelle */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Bestellnummer</TableHead>
              <TableHead>Lieferant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Liefertermin</TableHead>
              <TableHead>Priorität / Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Bestellungen werden geladen...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : orders && orders.length > 0 ? (
              orders.map((order) => {
                // Navigation basierend auf dem Status der Bestellung
                const handleRowClick = () => {
                  if (order.status === 'draft') {
                    // Bei Entwurf direkt zur Bestellübersicht
                    setLocation(`/bestellungen/${order.id}`);
                  } else if (order.status === 'sent' || order.status === 'partially_received') {
                    // Bei "gesendet" direkt zum Wareneingang
                    setLocation(`/bestellungen/${order.id}/wareneingang`);
                  } else {
                    // Für alle anderen Zustände zur normalen Detailseite
                    setLocation(`/bestellungen/${order.id}`);
                  }
                };
                
                return (
                  <TableRow 
                    key={order.id} 
                    onClick={handleRowClick}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>{order.supplierName}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      {order.orderDate && isValid(parseISO(order.orderDate)) 
                        ? format(parseISO(order.orderDate), 'dd.MM.yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {order.expectedDeliveryDate && isValid(parseISO(order.expectedDeliveryDate)) 
                        ? format(parseISO(order.expectedDeliveryDate), 'dd.MM.yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={order.priority === 'high' || order.priority === 'urgent' ? 'destructive' : 'outline'} 
                          className={order.priority === 'normal' ? 'bg-blue-100 text-blue-800 border-blue-300' : ''}
                        >
                          {priorityMap[order.priority as keyof typeof priorityMap]?.label || order.priority}
                        </Badge>
                        <CopyOrderButton 
                          orderId={order.id} 
                          orderNumber={order.orderNumber}
                          size="sm"
                          variant="ghost"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <PackageOpen className="h-8 w-8 text-muted-foreground" />
                    <span>Keine Bestellungen gefunden</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLocation('/bestellungen/neu')}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Neue Bestellung
                    </Button>
                  </div>
                </TableCell>
              </TableRow>

                  </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <p className="text-muted-foreground">Keine Bestellungen gefunden.</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <Link to="/bestellungen/neu-v2">
                      <Plus className="h-4 w-4 mr-2" />
                      Erste Bestellung anlegen
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      
      {/* Dialog: Bestellungsdetails */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
      
      {/* Dialog: Wareneingang erfassen */}
      <ReceiveOrderDialog 
        open={isGoodsReceiptOpen} 
        onOpenChange={setIsGoodsReceiptOpen}
        order={selectedOrderForReceipt}
        onComplete={(updatedOrder) => {
          // In der echten Implementierung würde hier die API aktualisiert
          toast({
            title: "Wareneingang erfasst",
            description: `Der Wareneingang für Bestellung ${updatedOrder.orderNumber} wurde erfolgreich erfasst.`,
          });
          
          // Bestellungen neu laden
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          
          // Dialog schließen
          setIsGoodsReceiptOpen(false);
          setSelectedOrderForReceipt(null);
        }}
      />
        {selectedOrder && (
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl">
                  Bestellung {selectedOrder.orderNumber}
                </DialogTitle>
                <OrderStatusBadge status={selectedOrder.status} />
              </div>
              <DialogDescription>
                {formatDate(selectedOrder.orderDate)} | {selectedOrder.supplierName} | {selectedOrder.locationName}
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-1">
                <span className="text-muted-foreground text-sm">Liefertermin</span>
                <p className="font-medium flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                  {formatDate(selectedOrder.expectedDeliveryDate) || "Nicht festgelegt"}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground text-sm">Zahlungsstatus</span>
                <p className="font-medium">
                  <Badge variant="secondary" className={`font-medium ${paymentStatusMap[selectedOrder.paymentStatus as keyof typeof paymentStatusMap]?.color}`}>
                    {paymentStatusMap[selectedOrder.paymentStatus as keyof typeof paymentStatusMap]?.label || selectedOrder.paymentStatus}
                  </Badge>
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground text-sm">Priorität</span>
                <p className="font-medium">
                  <Badge variant="secondary" className={`font-medium ${priorityMap[selectedOrder.priority as keyof typeof priorityMap]?.color}`}>
                    {priorityMap[selectedOrder.priority as keyof typeof priorityMap]?.label || selectedOrder.priority}
                  </Badge>
                </p>
              </div>
            </div>
            
            <Tabs defaultValue="items" value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
              <TabsList>
                <TabsTrigger value="items">
                  <Package className="h-4 w-4 mr-2" />
                  Bestellpositionen
                </TabsTrigger>
                <TabsTrigger value="supplier">
                  <Truck className="h-4 w-4 mr-2" />
                  Lieferant
                </TabsTrigger>
                <TabsTrigger value="documents">
                  <Mail className="h-4 w-4 mr-2" />
                  Dokumente
                </TabsTrigger>
                <TabsTrigger value="history">
                  <Clock className="h-4 w-4 mr-2" />
                  Historie
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="items" className="flex-1 overflow-hidden">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">Pos.</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="text-right">Menge</TableHead>
                        <TableHead className="text-right">Einzelpreis</TableHead>
                        <TableHead className="text-right">Gesamt</TableHead>
                        <TableHead>Ziel</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.positionNumber}</TableCell>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.totalPrice)}</TableCell>
                          <TableCell>{item.targetMachineName || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`font-medium ${
                              item.status === "pending" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
                              item.status === "delivered" ? "bg-green-100 text-green-800 border-green-300" :
                              item.status === "partial" ? "bg-purple-100 text-purple-800 border-purple-300" :
                              "bg-gray-100 text-gray-800 border-gray-300"
                            }`}>
                              {item.status === "pending" ? "Ausstehend" :
                               item.status === "delivered" ? "Geliefert" :
                               item.status === "partial" ? "Teilgeliefert" :
                               item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                
                <div className="mt-4 p-4 bg-gray-50 rounded-md">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Notizen</p>
                      <p>{selectedOrder.notes || "Keine Notizen"}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Zwischensumme:</span>
                        <span>{formatCurrency(selectedOrder.totalAmount - selectedOrder.vatAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>MwSt:</span>
                        <span>{formatCurrency(selectedOrder.vatAmount)}</span>
                      </div>
                      {selectedOrder.discountAmount > 0 && (
                        <div className="flex justify-between">
                          <span>Rabatt:</span>
                          <span>-{formatCurrency(selectedOrder.discountAmount)}</span>
                        </div>
                      )}
                      {selectedOrder.shippingCost > 0 && (
                        <div className="flex justify-between">
                          <span>Versandkosten:</span>
                          <span>{formatCurrency(selectedOrder.shippingCost)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Gesamtbetrag:</span>
                        <span>{formatCurrency(selectedOrder.totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="supplier" className="flex-1 overflow-hidden">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-lg font-medium mb-2">Lieferanteninformationen</h3>
                        <Card>
                          <CardContent className="p-4">
                            <dl className="space-y-2">
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Name:</dt>
                                <dd className="col-span-2 font-medium">{selectedOrder.supplier.name}</dd>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Ansprechpartner:</dt>
                                <dd className="col-span-2">{selectedOrder.supplier.contactPerson || "-"}</dd>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Telefon:</dt>
                                <dd className="col-span-2">{selectedOrder.supplier.phone || "-"}</dd>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">E-Mail:</dt>
                                <dd className="col-span-2">{selectedOrder.supplier.email || "-"}</dd>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Adresse:</dt>
                                <dd className="col-span-2">{selectedOrder.supplier.address || "-"}</dd>
                              </div>
                            </dl>
                          </CardContent>
                        </Card>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-medium mb-2">Konditionen</h3>
                        <Card>
                          <CardContent className="p-4">
                            <dl className="space-y-2">
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Zahlungsbedingungen:</dt>
                                <dd className="col-span-2">{selectedOrder.supplier.paymentTerms || "-"}</dd>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Lieferbedingungen:</dt>
                                <dd className="col-span-2">{selectedOrder.supplier.deliveryTerms || "-"}</dd>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Mindestbestellwert:</dt>
                                <dd className="col-span-2">
                                  {selectedOrder.supplier.minimumOrderValue 
                                    ? formatCurrency(selectedOrder.supplier.minimumOrderValue) 
                                    : "-"}
                                </dd>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <dt className="text-muted-foreground">Liefertage:</dt>
                                <dd className="col-span-2">
                                  {selectedOrder.supplier.deliveryDays 
                                    ? JSON.parse(selectedOrder.supplier.deliveryDays)
                                      .map((day: string) => {
                                        const days: Record<string, string> = {
                                          monday: "Montag",
                                          tuesday: "Dienstag",
                                          wednesday: "Mittwoch",
                                          thursday: "Donnerstag",
                                          friday: "Freitag",
                                          saturday: "Samstag",
                                          sunday: "Sonntag"
                                        };
                                        return days[day] || day;
                                      })
                                      .join(", ")
                                    : "-"}
                                </dd>
                              </div>
                            </dl>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-medium mb-2">Bestellinformationen</h3>
                      <Card>
                        <CardContent className="p-4">
                          <dl className="space-y-2">
                            <div className="grid grid-cols-3 gap-1">
                              <dt className="text-muted-foreground">Zahlungsbedingungen:</dt>
                              <dd className="col-span-2">{selectedOrder.paymentTerms || "-"}</dd>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              <dt className="text-muted-foreground">Zahlungsart:</dt>
                              <dd className="col-span-2">{selectedOrder.paymentMethod || "-"}</dd>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              <dt className="text-muted-foreground">Interne Notizen:</dt>
                              <dd className="col-span-2">{selectedOrder.internalNotes || "-"}</dd>
                            </div>
                          </dl>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="documents" className="flex-1 overflow-hidden">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Dokumente</h3>
                    {selectedOrder.documents ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {JSON.parse(selectedOrder.documents).map((doc: any, index: number) => (
                          <Card key={index}>
                            <CardContent className="p-4 flex justify-between items-center">
                              <div className="flex items-center">
                                <Mail className="h-5 w-5 mr-2 text-blue-500" />
                                <div>
                                  <p className="font-medium">{doc.filename}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {doc.type === "order" ? "Bestellung" : 
                                     doc.type === "confirmation" ? "Auftragsbestätigung" : 
                                     doc.type === "delivery" ? "Lieferschein" : 
                                     doc.type === "invoice" ? "Rechnung" : 
                                     doc.type}
                                  </p>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" asChild>
                                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </a>
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Keine Dokumente vorhanden.</p>
                      </div>
                    )}
                    
                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-2">Dokument hochladen</h3>
                      <Card>
                        <CardContent className="p-4">
                          <div className="mb-4">
                            <Label htmlFor="document-type">Dokumenttyp</Label>
                            <Select defaultValue="order">
                              <SelectTrigger id="document-type">
                                <SelectValue placeholder="Dokumenttyp auswählen" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="order">Bestellung</SelectItem>
                                <SelectItem value="confirmation">Auftragsbestätigung</SelectItem>
                                <SelectItem value="delivery">Lieferschein</SelectItem>
                                <SelectItem value="invoice">Rechnung</SelectItem>
                                <SelectItem value="other">Sonstiges</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="mb-4">
                            <Label htmlFor="file-upload">Datei</Label>
                            <Input id="file-upload" type="file" />
                          </div>
                          
                          <Button type="button">
                            Dokument hochladen
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="history" className="flex-1 overflow-hidden">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Status-Historie</h3>
                    <div className="relative border-l-2 border-gray-200 ml-4 pl-6 space-y-6">
                      {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 ? (
                        selectedOrder.statusHistory.map((event, index) => (
                          <div key={index} className="relative">
                            <div className="absolute -left-10 mt-1 w-4 h-4 rounded-full bg-primary"></div>
                            <div className="mb-1 flex items-center justify-between">
                              <span className="font-medium">{event.status === "created" ? "Erstellt" : 
                                               event.status === "open" ? "Offen" : 
                                               event.status === "ordered" ? "Bestellt" : 
                                               event.status === "partial" ? "Teilgeliefert" : 
                                               event.status === "delivered" ? "Geliefert" : 
                                               event.status === "canceled" ? "Storniert" : 
                                               event.status}
                              </span>
                              <span className="text-sm text-muted-foreground">{formatDate(event.date)}</span>
                            </div>
                            <p className="text-sm">
                              {event.user && <span className="font-medium">{event.user}</span>}: {event.note}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          Keine Status-Historie verfügbar
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-2">Status aktualisieren</h3>
                      <Card>
                        <CardContent className="p-4">
                          <div className="mb-4">
                            <Label htmlFor="status-update">Neuer Status</Label>
                            <Select defaultValue="open">
                              <SelectTrigger id="status-update">
                                <SelectValue placeholder="Status auswählen" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Offen</SelectItem>
                                <SelectItem value="ordered">Bestellt</SelectItem>
                                <SelectItem value="partial">Teilgeliefert</SelectItem>
                                <SelectItem value="delivered">Geliefert</SelectItem>
                                <SelectItem value="canceled">Storniert</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="mb-4">
                            <Label htmlFor="status-note">Anmerkung</Label>
                            <Textarea id="status-note" rows={3} placeholder="Notiz zur Statusänderung hinzufügen..." />
                          </div>
                          
                          <Button type="button">
                            Status aktualisieren
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            
            <DialogFooter className="flex justify-between items-center pt-4 border-t">
              <div className="flex items-center gap-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bestellung herunterladen</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bestellung bearbeiten</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bestellung stornieren</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Schließen
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      
      {/* Dialog: Neue Bestellung */}
      <Dialog open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Neue Bestellung anlegen</DialogTitle>
            <DialogDescription>
              Erstellen Sie eine neue Bestellung. Nach dem Anlegen können Sie Positionen hinzufügen.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...newOrderForm}>
            <form onSubmit={newOrderForm.handleSubmit(createNewOrder)} className="space-y-4">
              <FormField
                control={newOrderForm.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferant</FormLabel>
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
                        <SelectItem value="1">Milchhof Fiedler</SelectItem>
                        <SelectItem value="2">Privatbrauerei Schwerter</SelectItem>
                        <SelectItem value="3">Zetti Knusperflocken GmbH</SelectItem>
                        <SelectItem value="4">Landfleischerei Struppen</SelectItem>
                        <SelectItem value="5">Oppacher Mineralquellen</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={newOrderForm.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferstandort</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Standort auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">Hauptlager Bad Schandau</SelectItem>
                        <SelectItem value="2">Lager Königstein</SelectItem>
                        <SelectItem value="3">Lager Pirna</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={newOrderForm.control}
                name="expectedDeliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gewünschter Liefertermin</FormLabel>
                    <FormControl>
                      <DatePicker
                        selected={field.value}
                        onChange={(date) => field.onChange(date)}
                        dateFormat="dd.MM.yyyy"
                        className="w-full border rounded-md px-3 py-2"
                        locale={de}
                        placeholderText="Liefertermin wählen"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={newOrderForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priorität</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value || "normal"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Priorität wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Niedrig</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Hoch</SelectItem>
                        <SelectItem value="urgent">Dringend</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={newOrderForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notizen</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ''} 
                        placeholder="Hinweise zur Bestellung..."
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsNewOrderOpen(false)}>
                  Abbrechen
                </Button>
                <Button type="submit">Bestellung anlegen</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}