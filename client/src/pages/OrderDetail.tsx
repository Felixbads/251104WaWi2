import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

// Icons
import {
  ArrowLeft,
  Truck,
  Calendar,
  FileText,
  Building2,
  Package,
  CheckCircle2,
  ClipboardCheck,
  Send,
  Loader2,
  Clock,
  XCircle,
  Download,
  QrCode,
  ShoppingBag,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

// Mocked order data for demo
const mockOrderData = {
  id: 1,
  orderNumber: "B-2025-001",
  createdAt: "2025-03-25T10:30:00Z",
  updatedAt: "2025-03-28T14:45:00Z",
  status: "pending", // "draft", "pending", "shipped", "delivered", "completed", "cancelled"
  supplierId: 1,
  supplierName: "Milchhof Fiedler",
  warehouseId: 1,
  warehouseName: "Hauptlager Dresden",
  expectedDeliveryDate: "2025-04-05T00:00:00Z",
  actualDeliveryDate: null,
  priority: "normal", // "normal", "high", "urgent"
  notes: "Bitte vor 12 Uhr liefern, danach ist das Lager nur eingeschränkt besetzt.",
  totalAmount: 452.80,
  trackingCode: null,
  orderItems: [
    {
      id: 1,
      productId: 12,
      productName: "Wehlener Pudding vers. Sorten",
      sku: "WEH-PUD-001",
      supplierSku: "F-PUD-01",
      quantity: 24,
      unit: "stk",
      unitPrice: 1.25,
      totalPrice: 30.00,
      receivedQuantity: null,
      notes: ""
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
      totalPrice: 67.50,
      receivedQuantity: null,
      notes: "Gemischte Sorten"
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
      totalPrice: 114.00,
      receivedQuantity: null,
      notes: ""
    },
    {
      id: 4,
      productId: 21,
      productName: "Wehlner Quark 500g",
      sku: "WEH-QUK-004",
      supplierSku: "F-QUK-04",
      quantity: 48,
      unit: "stk",
      unitPrice: 1.85,
      totalPrice: 88.80,
      receivedQuantity: null,
      notes: ""
    },
    {
      id: 5,
      productId: 24,
      productName: "Wehlner Joghurt natur",
      sku: "WEH-JOG-005",
      supplierSku: "F-JOG-05",
      quantity: 60,
      unit: "stk",
      unitPrice: 0.75,
      totalPrice: 45.00,
      receivedQuantity: null,
      notes: ""
    },
    {
      id: 6,
      productId: 27,
      productName: "Wehl'ner Felsbrocken min. 150g",
      sku: "WEH-KAS-006",
      supplierSku: "F-KAS-06",
      quantity: 12,
      unit: "stk",
      unitPrice: 5.25,
      totalPrice: 63.00,
      receivedQuantity: null,
      notes: ""
    },
    {
      id: 7,
      productId: 30,
      productName: "Bio-Butter 250g",
      sku: "WEH-BUT-007",
      supplierSku: "F-BUT-07",
      quantity: 30,
      unit: "stk",
      unitPrice: 1.45,
      totalPrice: 43.50,
      receivedQuantity: null,
      notes: ""
    }
  ],
  statusHistory: [
    {
      id: 1,
      status: "draft",
      timestamp: "2025-03-25T10:30:00Z",
      note: "Bestellung erstellt"
    },
    {
      id: 2,
      status: "pending",
      timestamp: "2025-03-25T10:45:00Z",
      note: "Bestellung beim Lieferanten eingereicht"
    }
  ]
};

// Formatierung des Status
const formatStatus = (status: string) => {
  switch (status) {
    case "draft":
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">Entwurf</Badge>;
    case "pending":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">In Bearbeitung</Badge>;
    case "shipped":
      return <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">Versandt</Badge>;
    case "delivered":
      return <Badge variant="outline" className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300">Geliefert</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">Abgeschlossen</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">Storniert</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

// Formatierung der Priorität
const formatPriority = (priority: string) => {
  switch (priority) {
    case "normal":
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">Normal</Badge>;
    case "high":
      return <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Hoch</Badge>;
    case "urgent":
      return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-300">Dringend</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

// Formatierung des Datums
const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return format(date, "dd.MM.yyyy", { locale: de });
};

// Formatierung der Uhrzeit
const formatTime = (dateString: string | null) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return format(date, "HH:mm", { locale: de });
};

// Formatierung von Währungen
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Tabs State
  const [activeTab, setActiveTab] = useState("overview");
  
  // Dialog States
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showTrackingDialog, setShowTrackingDialog] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  
  // QR Code Dialog
  const [showQrDialog, setShowQrDialog] = useState(false);
  
  // Form States
  const [trackingCode, setTrackingCode] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  
  // Lade Bestelldetails
  const { data: order, isLoading, error } = useQuery({
    queryKey: [`/api/orders/${id}`],
    staleTime: 1000 * 60, // 1 Minute
    // Mock data instead of actual API fetch
    queryFn: () => Promise.resolve(mockOrderData)
  });
  
  // Mutations für Bestellstatus-Updates
  const updateOrderMutation = useMutation({
    mutationFn: async (updateData: any) => {
      // In tatsächlicher Implementierung:
      // return apiRequest(`/api/orders/${id}`, 'PATCH', updateData);
      
      // Mock für Demo-Zwecke
      return Promise.resolve({ success: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    }
  });
  
  // Zurück zur Bestellungsübersicht
  const handleBack = () => {
    navigate('/bestellungen');
  };
  
  // Bestellung absenden
  const handleSendOrder = () => {
    updateOrderMutation.mutate(
      { 
        status: "pending", 
        statusHistory: [
          ...order.statusHistory,
          {
            status: "pending",
            timestamp: new Date().toISOString(),
            note: sendNote || "Bestellung beim Lieferanten eingereicht"
          }
        ]
      },
      {
        onSuccess: () => {
          setShowSendDialog(false);
          toast({
            title: "Bestellung versendet",
            description: "Die Bestellung wurde erfolgreich an den Lieferanten übermittelt."
          });
        },
        onError: (error) => {
          toast({
            title: "Fehler beim Versenden",
            description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
            variant: "destructive"
          });
        }
      }
    );
  };
  
  // Tracking-Code hinzufügen
  const handleAddTracking = () => {
    updateOrderMutation.mutate(
      { 
        status: "shipped", 
        trackingCode,
        statusHistory: [
          ...order.statusHistory,
          {
            status: "shipped",
            timestamp: new Date().toISOString(),
            note: `Tracking-Code hinzugefügt: ${trackingCode}`
          }
        ]
      },
      {
        onSuccess: () => {
          setShowTrackingDialog(false);
          toast({
            title: "Tracking-Code hinzugefügt",
            description: "Der Tracking-Code wurde erfolgreich gespeichert."
          });
        },
        onError: (error) => {
          toast({
            title: "Fehler beim Speichern",
            description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
            variant: "destructive"
          });
        }
      }
    );
  };
  
  // Bestellung als geliefert markieren
  const handleMarkAsDelivered = () => {
    updateOrderMutation.mutate(
      { 
        status: "delivered", 
        actualDeliveryDate: new Date().toISOString(),
        statusHistory: [
          ...order.statusHistory,
          {
            status: "delivered",
            timestamp: new Date().toISOString(),
            note: "Bestellung wurde geliefert"
          }
        ]
      },
      {
        onSuccess: () => {
          setShowReceiveDialog(true);
          toast({
            title: "Bestellung als geliefert markiert",
            description: "Bitte überprüfen Sie die Lieferung und erfassen Sie den Wareneingang."
          });
        }
      }
    );
  };
  
  // Bestellung abschließen
  const handleCompleteOrder = () => {
    updateOrderMutation.mutate(
      { 
        status: "completed",
        statusHistory: [
          ...order.statusHistory,
          {
            status: "completed",
            timestamp: new Date().toISOString(),
            note: "Bestellung abgeschlossen"
          }
        ]
      },
      {
        onSuccess: () => {
          toast({
            title: "Bestellung abgeschlossen",
            description: "Die Bestellung wurde erfolgreich abgeschlossen."
          });
        }
      }
    );
  };
  
  // Bestellung stornieren
  const handleCancelOrder = () => {
    updateOrderMutation.mutate(
      { 
        status: "cancelled",
        statusHistory: [
          ...order.statusHistory,
          {
            status: "cancelled",
            timestamp: new Date().toISOString(),
            note: cancelReason || "Bestellung storniert"
          }
        ]
      },
      {
        onSuccess: () => {
          setShowCancelDialog(false);
          toast({
            title: "Bestellung storniert",
            description: "Die Bestellung wurde erfolgreich storniert."
          });
        }
      }
    );
  };
  
  // QR-Code für Lieferantenportal generieren
  const handleGenerateQrCode = () => {
    setShowQrDialog(true);
  };
  
  // Ladeansicht
  if (isLoading) {
    return (
      <div className="container py-6 flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Bestelldetails werden geladen...</p>
      </div>
    );
  }
  
  // Fehlerbehandlung
  if (error || !order) {
    return (
      <div className="container py-6">
        <Button variant="outline" className="mb-4" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zur Übersicht
        </Button>
        
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <CardTitle>Fehler beim Laden</CardTitle>
            </div>
            <CardDescription className="text-red-600">
              Die Bestelldetails konnten nicht geladen werden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten."}
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Erneut versuchen
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Funktionen basierend auf dem Status
  const canSend = order.status === "draft";
  const canAddTracking = order.status === "pending";
  const canMarkAsDelivered = order.status === "shipped" || order.status === "pending";
  const canComplete = order.status === "delivered";
  const canCancel = ["draft", "pending", "shipped"].includes(order.status);
  
  // Bestellübersicht
  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Bestellung #{order.orderNumber}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {formatDate(order.createdAt)}
              {formatStatus(order.status)}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
          {canSend && (
            <Button onClick={() => setShowSendDialog(true)} className="gap-1.5">
              <Send className="h-4 w-4" />
              An Lieferant senden
            </Button>
          )}
          
          {canAddTracking && (
            <Button variant="outline" onClick={() => setShowTrackingDialog(true)} className="gap-1.5">
              <Truck className="h-4 w-4" />
              Tracking-Code
            </Button>
          )}
          
          {canMarkAsDelivered && (
            <Button variant="outline" onClick={handleMarkAsDelivered} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Als geliefert markieren
            </Button>
          )}
          
          {canComplete && (
            <Button variant="outline" onClick={handleCompleteOrder} className="gap-1.5">
              <ClipboardCheck className="h-4 w-4" />
              Abschließen
            </Button>
          )}
          
          {canCancel && (
            <Button 
              variant="ghost" 
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowCancelDialog(true)}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Stornieren
            </Button>
          )}
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span>Übersicht</span>
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="h-4 w-4" />
            <span>Positionen</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="h-4 w-4" />
            <span>Verlauf</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span>Dokumente</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Übersicht Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Bestelldetails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Bestellnummer</h3>
                    <p className="font-medium">{order.orderNumber}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                    <div>{formatStatus(order.status)}</div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Erstellt am</h3>
                    <p>{formatDate(order.createdAt)} {formatTime(order.createdAt)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Letzte Aktualisierung</h3>
                    <p>{formatDate(order.updatedAt)} {formatTime(order.updatedAt)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Liefertermin (erwartet)</h3>
                    <p>{formatDate(order.expectedDeliveryDate)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Liefertermin (tatsächlich)</h3>
                    <p>{order.actualDeliveryDate ? formatDate(order.actualDeliveryDate) : "-"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Priorität</h3>
                    <div>{formatPriority(order.priority)}</div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Tracking-Code</h3>
                    <p>{order.trackingCode || "-"}</p>
                  </div>
                </div>
                
                {order.notes && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Anmerkungen</h3>
                      <p className="text-sm whitespace-pre-line">{order.notes}</p>
                    </div>
                  </>
                )}
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Bestellübersicht</h3>
                  <div className="bg-muted/50 p-3 rounded-md">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm">Anzahl Positionen:</span>
                      <span className="font-medium">{order.orderItems.length}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm">Gesamtmenge:</span>
                      <span className="font-medium">
                        {order.orderItems.reduce((sum, item) => sum + item.quantity, 0)} Stück
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Gesamtbetrag:</span>
                      <span className="font-medium">{formatCurrency(order.totalAmount)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-3 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateQrCode}
                    className="gap-1.5"
                  >
                    <QrCode className="h-4 w-4" />
                    QR Code für Lieferantenportal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1.5"
                  >
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      <Download className="h-4 w-4" />
                      Bestellformular (PDF)
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    <span>Lieferant</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium text-lg">{order.supplierName}</h3>
                      <Button
                        variant="link"
                        className="px-0 h-auto text-sm"
                        asChild
                      >
                        <a 
                          href={`/lieferanten/${order.supplierId}`}
                          className="flex items-center"
                        >
                          Details anzeigen
                          <ExternalLink className="h-3.5 w-3.5 ml-1" />
                        </a>
                      </Button>
                    </div>
                    
                    <div className="text-sm">
                      <div className="flex justify-between mt-2 gap-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          asChild
                        >
                          <a href="#" onClick={(e) => e.preventDefault()}>
                            Kontaktieren
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
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
                      <h3 className="font-medium text-lg">{order.warehouseName}</h3>
                      <Button
                        variant="link"
                        className="px-0 h-auto text-sm"
                        asChild
                      >
                        <a 
                          href={`/lager/${order.warehouseId}`}
                          className="flex items-center"
                        >
                          Details anzeigen
                          <ExternalLink className="h-3.5 w-3.5 ml-1" />
                        </a>
                      </Button>
                    </div>
                    
                    <div className="text-sm">
                      <p>Hauptstraße 123</p>
                      <p>01307 Dresden</p>
                      <p>Deutschland</p>
                      
                      <div className="mt-2">
                        <p className="text-muted-foreground">Öffnungszeiten:</p>
                        <p>Mo-Fr: 08:00 - 16:00 Uhr</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        {/* Positionen Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <CardTitle>Bestellpositionen</CardTitle>
              <CardDescription>
                {order.orderItems.length} {order.orderItems.length === 1 ? "Position" : "Positionen"} mit insgesamt {formatCurrency(order.totalAmount)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Produkt</TableHead>
                    <TableHead>Menge</TableHead>
                    <TableHead>Einzelpreis</TableHead>
                    <TableHead>Gesamtpreis</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.orderItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.productName}
                        {item.sku && (
                          <div className="text-xs text-muted-foreground">
                            SKU: {item.sku}{item.supplierSku ? ` | Lieferanten-Nr: ${item.supplierSku}` : ''}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-xs italic mt-1">{item.notes}</div>
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
                      <TableCell>
                        {item.receivedQuantity !== null ? (
                          <Badge variant="outline" className="bg-green-100 text-green-800">
                            {item.receivedQuantity} erhalten
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                            Ausstehend
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">
                      Gesamtsumme:
                    </TableCell>
                    <TableCell className="font-bold">
                      {formatCurrency(order.totalAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Verlauf Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Verlauf</CardTitle>
              <CardDescription>
                Chronologischer Verlauf der Bestellung
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute top-0 bottom-0 left-7 w-px bg-muted-foreground/20"></div>
                <ol className="space-y-8">
                  {[...order.statusHistory].reverse().map((entry, index) => (
                    <li key={entry.id} className="relative pl-14">
                      <div className="absolute left-0 flex h-14 w-14 items-center justify-center rounded-full border bg-card">
                        {entry.status === "draft" && <FileText className="h-6 w-6 text-blue-500" />}
                        {entry.status === "pending" && <Send className="h-6 w-6 text-yellow-500" />}
                        {entry.status === "shipped" && <Truck className="h-6 w-6 text-purple-500" />}
                        {entry.status === "delivered" && <ShoppingBag className="h-6 w-6 text-cyan-500" />}
                        {entry.status === "completed" && <CheckCircle2 className="h-6 w-6 text-green-500" />}
                        {entry.status === "cancelled" && <XCircle className="h-6 w-6 text-red-500" />}
                      </div>
                      <div>
                        <time className="block text-sm text-muted-foreground">
                          {formatDate(entry.timestamp)} {formatTime(entry.timestamp)}
                        </time>
                        <h3 className="font-medium">
                          {entry.status === "draft" && "Bestellung erstellt"}
                          {entry.status === "pending" && "Bestellung eingereicht"}
                          {entry.status === "shipped" && "Bestellung versandt"}
                          {entry.status === "delivered" && "Bestellung geliefert"}
                          {entry.status === "completed" && "Bestellung abgeschlossen"}
                          {entry.status === "cancelled" && "Bestellung storniert"}
                        </h3>
                        {entry.note && <p className="text-sm text-muted-foreground mt-1">{entry.note}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Dokumente Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Dokumente</CardTitle>
              <CardDescription>
                Alle zugehörigen Dokumente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">Coming Soon</h3>
                <p className="text-muted-foreground">
                  Dokumentenverwaltung wird in einem zukünftigen Update implementiert.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Dialoge */}
      {/* Senden Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bestellung an Lieferanten senden</DialogTitle>
            <DialogDescription>
              Die Bestellung #{order.orderNumber} wird an {order.supplierName} gesendet.
              Der Lieferant wird per E-Mail benachrichtigt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="send-note">Hinweis an den Lieferanten (optional)</Label>
              <Textarea
                id="send-note"
                placeholder="Hinweise zur Bestellung..."
                value={sendNote}
                onChange={(e) => setSendNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowSendDialog(false)}
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleSendOrder}
              disabled={updateOrderMutation.isPending}
            >
              {updateOrderMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Bestellung senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Tracking Dialog */}
      <Dialog open={showTrackingDialog} onOpenChange={setShowTrackingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tracking-Code hinzufügen</DialogTitle>
            <DialogDescription>
              Fügen Sie einen Tracking-Code hinzu, um die Lieferung zu verfolgen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tracking-code">Tracking-Code</Label>
              <Input
                id="tracking-code"
                placeholder="z.B. DHL12345678"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowTrackingDialog(false)}
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleAddTracking}
              disabled={!trackingCode || updateOrderMutation.isPending}
            >
              {updateOrderMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Wareneingang Dialog */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Wareneingang erfassen</DialogTitle>
            <DialogDescription>
              Überprüfen Sie die erhaltenen Waren und erfassen Sie den Wareneingang.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Produkt</TableHead>
                  <TableHead>Bestellt</TableHead>
                  <TableHead>Erhalten</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.orderItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.productName}
                      {item.sku && <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>}
                    </TableCell>
                    <TableCell>
                      {item.quantity} {item.unit}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        defaultValue={item.quantity}
                        className="w-20"
                        min="0"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        OK
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <div className="space-y-2">
              <Label htmlFor="receive-note">Anmerkungen zum Wareneingang (optional)</Label>
              <Textarea
                id="receive-note"
                placeholder="Anmerkungen zum Wareneingang..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowReceiveDialog(false)}
            >
              Später erledigen
            </Button>
            <Button onClick={handleCompleteOrder}>
              Wareneingang bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Stornieren Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bestellung stornieren</DialogTitle>
            <DialogDescription>
              Möchten Sie die Bestellung #{order.orderNumber} wirklich stornieren?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Grund für Stornierung</Label>
              <Textarea
                id="cancel-reason"
                placeholder="Grund für die Stornierung..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
            >
              Abbrechen
            </Button>
            <Button 
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={updateOrderMutation.isPending}
            >
              {updateOrderMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Bestellung stornieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR-Code für Lieferantenportal</DialogTitle>
            <DialogDescription>
              Der Lieferant kann diesen QR-Code scannen, um direkt zur Bestellung im Lieferantenportal zu gelangen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-4">
            <div className="bg-white p-4 rounded-md">
              <QrCode className="h-48 w-48 text-black" />
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="sm:w-auto w-full" asChild>
              <a href="#" download="qr-code.png" onClick={(e) => e.preventDefault()}>
                <Download className="h-4 w-4 mr-2" />
                Herunterladen
              </a>
            </Button>
            <Button className="sm:w-auto w-full" onClick={() => setShowQrDialog(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}