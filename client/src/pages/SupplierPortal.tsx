import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// UI Komponenten
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

// Icons
import {
  ArrowLeft,
  Boxes,
  Building2,
  CalendarIcon,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  FileCheck,
  Mail,
  Info,
  Loader2,
  LucideIcon,
  Package,
  Search,
  Truck,
  User,
  Calendar as CalendarIcon2
} from "lucide-react";

// Mock data for demo
const mockOrders = [
  {
    id: 1,
    orderNumber: "B-2025-001",
    customerName: "Nationale Parkverwaltung Sächsische Schweiz",
    status: "received", // new, received, processed, shipped, completed, rejected
    createdAt: "2025-03-25T10:30:00Z",
    updatedAt: "2025-03-27T14:15:00Z",
    dueDate: "2025-04-05T00:00:00Z",
    totalItems: 7,
    totalAmount: 452.80,
    shippingAddress: {
      name: "Hauptlager Dresden",
      street: "Hauptstraße 123",
      postalCode: "01307",
      city: "Dresden",
      country: "Deutschland"
    },
    notes: "Bitte vor 12 Uhr liefern, danach ist das Lager nur eingeschränkt besetzt.",
    items: [
      {
        id: 1,
        productId: 12,
        productName: "Wehlener Pudding vers. Sorten",
        sku: "WEH-PUD-001",
        supplierSku: "F-PUD-01",
        quantity: 24,
        unit: "stk",
        unitPrice: 1.25,
        totalPrice: 30.00
      },
      {
        id: 2,
        productId: 15,
        productName: "Wehl'ner Wehlrad min. 150g ver. Sorten",
        sku: "WEH-KAS-002",
        supplierSku: "F-KAS-02",
        quantity: 15,
        unit: "stk",
        unitPrice: 4.50,
        totalPrice: 67.50
      },
      {
        id: 3,
        productId: 18,
        productName: "Wehlner Milch 0,5l",
        sku: "WEH-MIL-003",
        supplierSku: "F-MIL-03",
        quantity: 120,
        unit: "stk",
        unitPrice: 0.95,
        totalPrice: 114.00
      }
    ]
  },
  {
    id: 2,
    orderNumber: "B-2025-002",
    customerName: "Nationale Parkverwaltung Sächsische Schweiz",
    status: "new",
    createdAt: "2025-03-30T11:45:00Z",
    updatedAt: "2025-03-30T11:45:00Z",
    dueDate: "2025-04-10T00:00:00Z",
    totalItems: 3,
    totalAmount: 230.50,
    shippingAddress: {
      name: "Lager Bad Schandau",
      street: "Elbstraße 5",
      postalCode: "01814",
      city: "Bad Schandau",
      country: "Deutschland"
    },
    notes: "",
    items: [
      {
        id: 1,
        productId: 25,
        productName: "Dresdner Kaffee Premium (1kg)",
        sku: "DRS-KAF-001",
        supplierSku: "K-DRS-001",
        quantity: 5,
        unit: "kg",
        unitPrice: 24.90,
        totalPrice: 124.50
      },
      {
        id: 2,
        productId: 26,
        productName: "Bio Tee Sächsische Kräuter",
        sku: "DRS-TEE-002",
        supplierSku: "T-BIO-002",
        quantity: 30,
        unit: "pkg",
        unitPrice: 3.55,
        totalPrice: 106.50
      }
    ]
  }
];

// Format helpers 
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return format(date, "dd.MM.yyyy", { locale: de });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "new":
      return <Badge className="bg-blue-100 text-blue-800">Neu</Badge>;
    case "received":
      return <Badge className="bg-purple-100 text-purple-800">Eingegangen</Badge>;
    case "processed":
      return <Badge className="bg-yellow-100 text-yellow-800">In Bearbeitung</Badge>;
    case "shipped":
      return <Badge className="bg-cyan-100 text-cyan-800">Versandt</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800">Abgeschlossen</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800">Abgelehnt</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export default function SupplierPortal() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  
  // State
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingDate, setShippingDate] = useState<Date | undefined>(undefined);
  const [processingNote, setProcessingNote] = useState("");
  
  // Query for orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["supplierOrders"],
    queryFn: () => Promise.resolve(mockOrders),
    staleTime: 1000 * 60 // 1 minute
  });
  
  // Filter orders based on search and status
  const filteredOrders = orders ? orders.filter(order => {
    const matchesSearch = 
      searchTerm === "" || 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) : [];
  
  // Handle order click
  const handleOrderClick = (order: any) => {
    setSelectedOrder(order);
    setShowOrderDetail(true);
    
    // Initialize processing note and shipping information
    if (order.status === "received") {
      setProcessingNote(order.notes || "");
      setShippingDate(undefined);
      setTrackingNumber("");
    }
  };
  
  // Handle status update
  const handleUpdateStatus = (newStatus: string) => {
    if (!selectedOrder) return;
    
    // In a real implementation, make an API call to update the status
    toast({
      title: "Status aktualisiert",
      description: `Bestellung ${selectedOrder.orderNumber} wurde auf "${newStatus}" aktualisiert.`,
    });
    
    // Close the order detail view
    setShowOrderDetail(false);
  };
  
  // Handle shipping
  const handleShipOrder = () => {
    if (!selectedOrder) return;
    
    if (!shippingDate) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Versanddatum aus.",
        variant: "destructive"
      });
      return;
    }
    
    if (!trackingNumber) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine Tracking-Nummer ein.",
        variant: "destructive"
      });
      return;
    }
    
    // In a real implementation, make an API call to update the status and shipping info
    toast({
      title: "Bestellung versendet",
      description: `Bestellung ${selectedOrder.orderNumber} wurde als versendet markiert.`,
    });
    
    // Close the order detail view
    setShowOrderDetail(false);
  };
  
  // Handle processing
  const handleProcessOrder = () => {
    if (!selectedOrder) return;
    
    // In a real implementation, make an API call to update the status
    toast({
      title: "Bestellung in Bearbeitung",
      description: `Bestellung ${selectedOrder.orderNumber} wird bearbeitet.`,
    });
    
    // Close the order detail view
    setShowOrderDetail(false);
  };
  
  // Back to orders list
  const handleBackToList = () => {
    setShowOrderDetail(false);
    setSelectedOrder(null);
  };
  
  // Dashboard cards
  const dashboardCards = [
    {
      title: "Neue Bestellungen",
      icon: Mail,
      value: orders ? orders.filter(o => o.status === "new").length : 0,
      color: "bg-blue-100 text-blue-800",
      link: () => setStatusFilter("new")
    },
    {
      title: "In Bearbeitung",
      icon: ClipboardList,
      value: orders ? orders.filter(o => o.status === "processed").length : 0,
      color: "bg-yellow-100 text-yellow-800",
      link: () => setStatusFilter("processed")
    },
    {
      title: "Versandt",
      icon: Truck,
      value: orders ? orders.filter(o => o.status === "shipped").length : 0,
      color: "bg-cyan-100 text-cyan-800",
      link: () => setStatusFilter("shipped")
    },
    {
      title: "Abgeschlossen",
      icon: CheckCircle2,
      value: orders ? orders.filter(o => o.status === "completed").length : 0,
      color: "bg-green-100 text-green-800",
      link: () => setStatusFilter("completed")
    }
  ];
  
  // Render supplier portal
  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Lieferantenportal</h1>
          <p className="text-muted-foreground">
            Willkommen im Lieferantenportal der Nationalen Parkverwaltung Sächsische Schweiz
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-1.5">
            <CircleHelp className="h-4 w-4" />
            Hilfe
          </Button>
          <Button className="gap-1.5">
            <User className="h-4 w-4" />
            Mein Konto
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="mb-6">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <Boxes className="h-4 w-4" />
            <span>Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span>Bestellungen</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-4 w-4" />
            <span>Produkte</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Dashboard Tab */}
        <TabsContent value="dashboard">
          {/* Dashboard Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {dashboardCards.map((card, index) => (
              <Card key={index} className="relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${card.color.split(' ')[0]}`}></div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="flex justify-between items-center">
                    <p className="text-3xl font-bold">{card.value}</p>
                    <card.icon className={`h-8 w-8 ${card.color}`} />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    variant="ghost" 
                    className="text-sm p-0 h-auto" 
                    onClick={() => {
                      setActiveTab("orders");
                      card.link();
                    }}
                  >
                    Details anzeigen
                    <ExternalLink className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          
          {/* Recent Orders */}
          <Card>
            <CardHeader>
              <CardTitle>Neueste Bestellungen</CardTitle>
              <CardDescription>Die letzten Bestellungen, die eingegangen sind</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : orders && orders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bestellnummer</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead>Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.slice(0, 5).map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleOrderClick(order)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium mb-1">Keine Bestellungen vorhanden</h3>
                  <p className="text-muted-foreground">
                    Derzeit sind keine Bestellungen verfügbar.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline" 
                onClick={() => setActiveTab("orders")}
                className="w-full"
              >
                Alle Bestellungen anzeigen
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Orders Tab */}
        <TabsContent value="orders">
          {!showOrderDetail ? (
            <Card>
              <CardHeader>
                <CardTitle>Bestellungen</CardTitle>
                <CardDescription>Verwalten Sie Ihre Bestellungen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Search and Filters */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Bestellungen suchen..."
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <select
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">Alle Status</option>
                      <option value="new">Neu</option>
                      <option value="received">Eingegangen</option>
                      <option value="processed">In Bearbeitung</option>
                      <option value="shipped">Versandt</option>
                      <option value="completed">Abgeschlossen</option>
                      <option value="rejected">Abgelehnt</option>
                    </select>
                  </div>
                </div>
                
                {/* Orders List */}
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredOrders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bestellnummer</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Fällig</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Betrag</TableHead>
                        <TableHead>Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.orderNumber}</TableCell>
                          <TableCell>{order.customerName}</TableCell>
                          <TableCell>{formatDate(order.createdAt)}</TableCell>
                          <TableCell>{formatDate(order.dueDate)}</TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleOrderClick(order)}
                            >
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium mb-1">Keine Bestellungen gefunden</h3>
                    <p className="text-muted-foreground">
                      Für die aktuelle Suche wurden keine Bestellungen gefunden.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Order Detail Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={handleBackToList}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h1 className="text-2xl font-bold">Bestellung #{selectedOrder.orderNumber}</h1>
                    <p className="text-muted-foreground flex items-center gap-2">
                      <CalendarIcon2 className="h-4 w-4" />
                      {formatDate(selectedOrder.createdAt)}
                      {getStatusBadge(selectedOrder.status)}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {selectedOrder.status === "new" && (
                    <Button onClick={() => handleUpdateStatus("received")}>
                      <Check className="h-4 w-4 mr-2" />
                      Bestellung bestätigen
                    </Button>
                  )}
                  
                  {selectedOrder.status === "received" && (
                    <Button onClick={handleProcessOrder}>
                      <ClipboardList className="h-4 w-4 mr-2" />
                      In Bearbeitung nehmen
                    </Button>
                  )}
                  
                  {selectedOrder.status === "processed" && (
                    <Button onClick={() => setShowOrderDetail(true)}>
                      <Truck className="h-4 w-4 mr-2" />
                      Als versandt markieren
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Order Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Bestelldetails</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40%]">Produkt</TableHead>
                          <TableHead>Menge</TableHead>
                          <TableHead>Einzelpreis</TableHead>
                          <TableHead>Gesamtpreis</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.productName}
                              {item.supplierSku && (
                                <div className="text-xs text-muted-foreground">
                                  Lieferanten-Nr: {item.supplierSku}
                                </div>
                              )}
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
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={3} className="text-right font-medium">
                            Gesamtsumme:
                          </TableCell>
                          <TableCell className="font-bold">
                            {formatCurrency(selectedOrder.totalAmount)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    
                    {selectedOrder.notes && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Anmerkungen</h3>
                        <p className="text-sm whitespace-pre-line">{selectedOrder.notes}</p>
                      </div>
                    )}
                    
                    {/* Processing Form */}
                    {selectedOrder.status === "received" && (
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-medium">Bestellung bearbeiten</h3>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Bearbeitungshinweise</label>
                          <Textarea
                            value={processingNote}
                            onChange={(e) => setProcessingNote(e.target.value)}
                            placeholder="Interne Hinweise zur Bearbeitung..."
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={handleProcessOrder}>
                            <ClipboardList className="h-4 w-4 mr-2" />
                            In Bearbeitung nehmen
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {/* Shipping Form */}
                    {selectedOrder.status === "processed" && (
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-medium">Versandinformationen</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Tracking-Nummer</label>
                            <Input
                              value={trackingNumber}
                              onChange={(e) => setTrackingNumber(e.target.value)}
                              placeholder="z.B. DHL12345678"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Versanddatum</label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {shippingDate ? (
                                    format(shippingDate, "PPP", { locale: de })
                                  ) : (
                                    <span>Datum auswählen</span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={shippingDate}
                                  onSelect={setShippingDate}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={handleShipOrder}>
                            <Truck className="h-4 w-4 mr-2" />
                            Als versandt markieren
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        <span>Lieferadresse</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium text-lg">{selectedOrder.shippingAddress.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {selectedOrder.customerName}
                          </p>
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-1 text-sm">
                          <p>{selectedOrder.shippingAddress.street}</p>
                          <p>{selectedOrder.shippingAddress.postalCode} {selectedOrder.shippingAddress.city}</p>
                          <p>{selectedOrder.shippingAddress.country}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5" />
                        <span>Hilfe & Support</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        <p>
                          Bei Fragen zu dieser Bestellung wenden Sie sich bitte an:
                        </p>
                        <p className="font-medium">Einkaufsabteilung</p>
                        <p>einkauf@nationalpark-saechsische-schweiz.de</p>
                        <p>+49 (0) 35022 / 900-123</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
        
        {/* Products Tab */}
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Produkte</CardTitle>
              <CardDescription>
                Ihre Produktkatalog
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">Coming Soon</h3>
                <p className="text-muted-foreground">
                  Die Produktkatalogverwaltung wird in einem zukünftigen Update implementiert.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}