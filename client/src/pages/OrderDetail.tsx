import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import ReceiveOrderDialog from "@/components/orders/ReceiveOrderDialog";
import OrderDetailActions from "@/components/orders/OrderDetailActions";
import ManualStatusChange from "@/components/orders/ManualStatusChange";
import EmailDialogFixed from "@/components/orderv2/EmailDialogFixed";
import OrderEmailPage from "@/components/orders/OrderEmailPage";
import SimpleEmailActionButton from "@/components/orders/SimpleEmailActionButton";
import DirectEmailSender from "@/components/orderv2/DirectEmailSender";
import { RawHttpEmailSender } from "@/components/orderv2/RawHttpEmailSender";
import { getOrder, updateOrder } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { orderKeys, warehouseKeys } from "@/lib/queryKeys";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


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
  Building2,
  Package,
  PackageCheck,
  CheckCircle2,
  ClipboardCheck,
  Send,
  Loader2,
  Clock,
  XCircle,
  QrCode,
  Download,
  Mail,
  ShoppingBag,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  MapPin,
  Printer,
  Eye,
  FileText, // FileText beibehalten für den Fall, dass es noch in anderen Komponenten genutzt wird
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

// Parser für die Statushistorie wird bereits als Methode in der Komponente definiert

// Formatierung des Status
const formatStatus = (status: string) => {
  switch (status) {
    case "draft":
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">Entwurf</Badge>;
    case "ordered":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">Bestellt</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">Teilweise geliefert</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">Abgeschlossen</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">Storniert</Badge>;
    
    // Alter Status für Kompatibilität mit früheren Bestellungen
    case "pending":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">Bestellt</Badge>;
    case "shipped":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">Bestellt</Badge>;
    case "delivered":
      return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">Abgeschlossen</Badge>;
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
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) {
      console.warn("Ungültiges Datum:", dateString);
      return "-";
    }
    return format(date, "dd.MM.yyyy", { locale: de });
  } catch (error) {
    console.error("Fehler beim Formatieren des Datums:", dateString, error);
    return "-";
  }
};

// Formatierung der Uhrzeit
const formatTime = (dateString: string | null) => {
  if (!dateString) return "";
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) {
      console.warn("Ungültige Zeit:", dateString);
      return "";
    }
    return format(date, "HH:mm", { locale: de });
  } catch (error) {
    console.error("Fehler beim Formatieren der Zeit:", dateString, error);
    return "";
  }
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
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showDirectEmailSender, setShowDirectEmailSender] = useState(false);
  
  // Form States
  const [sendNote, setSendNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  
  // QR Code and PDF States
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  
  // Refs
  const qrCodeRef = useRef<HTMLDivElement>(null);
  
  // Lade Bestelldetails
  const { data: order, isLoading, error } = useQuery({
    queryKey: orderKeys.detail(Number(id)),
    staleTime: 1000 * 60, // 1 Minute
    queryFn: () => getOrder(Number(id))
  });
  
  // States für Dokumente
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  
  // Dokumente im Dokumenten-Tab laden
  useEffect(() => {
    // Dokumente nur laden, wenn der Tab aktiv ist und eine Order-ID vorhanden ist
    if (activeTab === "documents" && order?.id) {
      fetchDocuments(order.id);
    }
  }, [activeTab, order?.id]);

  // Dokumente laden
  const fetchDocuments = async (orderId: number) => {
    if (!orderId) return;
    
    setIsLoadingDocuments(true);
    try {
      const response = await fetch(`/api/documents?referenceId=${orderId}&type=order`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Dokumente: ${response.statusText}`);
      }
      
      const data = await response.json();
      // Überprüfen, ob die Daten in einem gültigen Format vorliegen
      if (Array.isArray(data)) {
        setDocuments(data);
      } else {
        console.error("Unerwartetes Datenformat:", data);
        setDocuments([]); // Leeres Array im Fehlerfall setzen
      }
    } catch (error) {
      console.error("Fehler beim Laden der Dokumente:", error);
      toast({
        title: "Fehler beim Laden der Dokumente",
        description: `${(error as Error).message}`,
        variant: "destructive"
      });
      setDocuments([]);
    } finally {
      setIsLoadingDocuments(false);
    }
  };
  
  // Dokument anzeigen
  const handleViewDocument = (doc: any) => {
    if (!doc || !doc.fileUrl) {
      toast({
        title: "Dokument nicht verfügbar",
        description: "Der Link zum Dokument ist nicht verfügbar.",
        variant: "destructive"
      });
      return;
    }
    
    // Neues Fenster öffnen, um das Dokument anzuzeigen
    window.open(doc.fileUrl, '_blank');
  };
  
  // Dokument herunterladen
  const handleDownloadDocument = (doc: any) => {
    if (!doc || !doc.fileUrl) {
      toast({
        title: "Dokument nicht verfügbar",
        description: "Der Link zum Dokument ist nicht verfügbar.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Download über direktes Öffnen im neuen Tab
      // Dies umgeht den URL-Pattern-Fehler bei der Download-Methode
      window.open(doc.fileUrl, '_blank');
      
      toast({
        title: "Download gestartet",
        description: "Das Dokument wurde in einem neuen Tab geöffnet. Speichern Sie es dort mit Strg+S."
      });
    } catch (error) {
      console.error("Fehler beim Herunterladen des Dokuments:", error);
      toast({
        title: "Fehler beim Herunterladen",
        description: `${(error as Error).message || "Beim Herunterladen ist ein Fehler aufgetreten."}`,
        variant: "destructive"
      });
    }
  };
  
  // Mutations für Bestellstatus-Updates
  const updateOrderMutation = useMutation({
    mutationFn: async (updateData: any) => {
      return updateOrder(Number(id), updateData);
    },
    onSuccess: () => {
      // Invalidiere die Detailansicht der Bestellung
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(Number(id)) });
      // Invalidiere alle Bestellungslisten
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      // Invalidiere die Dashboard-Anzeige für offene Bestellungen
      queryClient.invalidateQueries({ queryKey: orderKeys.open() });
    }
  });
  
  // Zurück zur Bestellungsübersicht
  const handleBack = () => {
    navigate('/bestellungen');
  };
  
  // Hilfsfunktion, um die Statushistorie zu verarbeiten
  const parseStatusHistory = (statusHistory: any): any[] => {
    if (!statusHistory) return [];
    
    try {
      if (Array.isArray(statusHistory)) {
        return statusHistory;
      } else if (typeof statusHistory === 'string') {
        return JSON.parse(statusHistory);
      }
    } catch (error) {
      console.error("Fehler beim Parsen der Statushistorie:", error);
    }
    
    return [];
  };
  
  // Bestellung absenden
  const handleSendOrder = () => {
    if (!order) return;
    
    // Bestehende Statushistorie als Array verarbeiten
    // Bestehende Statushistorie konsistent verarbeiten
    const currentHistory = parseStatusHistory(order.statusHistory);
    const newStatusEntry = {
      status: "ordered",
      timestamp: new Date().toISOString(),
      note: sendNote || "Bestellung beim Lieferanten eingereicht"
    };
    
    updateOrderMutation.mutate(
      { 
        status: "ordered", 
        statusHistory: JSON.stringify([...currentHistory, newStatusEntry])
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
  
  // Diese Funktion wurde im vereinfachten Workflow entfernt
  
  // Im vereinfachten Workflow: Bestellung direkt abschließen nach Wareneingang
  const handleMarkAsDelivered = () => {
    if (!order) return;
    
    // Bestehende Statushistorie konsistent verarbeiten
    const currentHistory = parseStatusHistory(order.statusHistory);
    const newStatusEntry = {
      status: "completed",
      timestamp: new Date().toISOString(),
      note: "Bestellung wurde geliefert und abgeschlossen"
    };
    
    // Im vereinfachten Workflow direkt den Dialog zur Wareneingangserfassung öffnen
    setShowReceiveDialog(true);
    
    updateOrderMutation.mutate(
      { 
        status: "completed", 
        actualDeliveryDate: new Date().toISOString(),
        statusHistory: JSON.stringify([...currentHistory, newStatusEntry])
      },
      {
        onSuccess: () => {
          toast({
            title: "Bestellung abgeschlossen",
            description: "Bitte erfassen Sie den Wareneingang."
          });
        }
      }
    );
  };
  
  // Wareneingang verarbeiten
  // Wareneingang-Dialog schließen und Daten aktualisieren
  const handleProcessReceipt = (updatedOrder: any) => {
    // Dialog schließen
    setShowReceiveDialog(false);
    
    // Cache invalidieren - die Daten werden automatisch neu geladen
    queryClient.invalidateQueries({ queryKey: orderKeys.detail(Number(id)) });
    
    // Bei Wareneingang müssen wir auch den Lagerbestand aktualisieren
    if (updatedOrder?.warehouseId) {
      queryClient.invalidateQueries({ 
        queryKey: warehouseKeys.inventory(updatedOrder.warehouseId) 
      });
    }
  };
  
  // Bestellung stornieren
  const handleCancelOrder = () => {
    if (!order) return;
    
    // Bestehende Statushistorie konsistent verarbeiten
    const currentHistory = parseStatusHistory(order.statusHistory);
    const newStatusEntry = {
      status: "cancelled",
      timestamp: new Date().toISOString(),
      note: cancelReason || "Bestellung storniert"
    };
    
    updateOrderMutation.mutate(
      { 
        status: "cancelled",
        statusHistory: JSON.stringify([...currentHistory, newStatusEntry])
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
  const handleGenerateQrCode = async () => {
    if (!order) return;
    
    try {
      // Lieferantenportal URL generieren
      const portalUrl = `${window.location.origin}/lieferantenportal/${order.supplierId}/bestellung/${order.id}`;
      
      // QR-Code als DataURL generieren
      const qrDataUrl = await QRCode.toDataURL(portalUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000',
          light: '#fff'
        }
      });
      
      setQrCodeUrl(qrDataUrl);
      setShowQrDialog(true);
    } catch (error) {
      toast({
        title: "Fehler beim Generieren des QR-Codes",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };
  
  // E-Mail an Lieferanten senden
  const sendOrderEmail = () => {
    if (!order) {
      toast({
        title: "Fehler beim Öffnen des E-Mail-Formulars",
        description: "Die Bestelldaten sind nicht verfügbar",
        variant: "destructive"
      });
      return;
    }
    
    // E-Mail-Dialog öffnen
    setShowEmailDialog(true);
    
    toast({
      title: "E-Mail-Formular geöffnet",
      description: "Bitte geben Sie die E-Mail-Details ein und senden Sie die Bestellung ab.",
    });
  };
  
  // Funktion zum PDF-Download wurde entfernt
  
  /**
   * Öffnet den E-Mail-Dialog zum Versenden der Bestellung
   * Die E-Mail-Vorlagen werden von der OrderEmailDialog-Komponente geladen
   */
  const handleSendEmail = async () => {
    // Öffnet den E-Mail-Dialog direkt
    setShowEmailDialog(true);
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
  
  // Funktionen basierend auf dem vereinfachten Status-Workflow
  const canSend = order.status === "draft";
  const canReceiveGoods = order.status === "ordered"; // Direkt nach "Bestellt" kann Wareneingang erfasst werden
  const canCancel = ["draft", "ordered"].includes(order.status);
  
  // Bestellübersicht
  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 md:px-6 space-y-6">
      {/* Header mit Funktionsleiste */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={handleBack} className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
          <h1 className="text-2xl font-bold">Bestellung {order.orderNumber}</h1>
          <div className="ml-2">{formatStatus(order.status)}</div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <SimpleEmailActionButton order={order} variant="outline" size="sm" />
          <Button variant="outline" size="sm" onClick={() => setShowQrDialog(true)} className="gap-2">
            <QrCode className="h-4 w-4" />
            <span className="hidden sm:inline">QR-Code</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowStatusChangeDialog(true)} 
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Status ändern</span>
            <span className="sm:hidden">Status</span>
          </Button>
        </div>
      </div>
      
      {/* Aktionen (vereinfachter Workflow) */}
      <div className="flex flex-wrap gap-2 mb-6">
        {canSend && (
          <Button onClick={() => setShowSendDialog(true)} className="gap-1.5">
            <Send className="h-4 w-4" />
            An Lieferant senden
          </Button>
        )}
        
        {canReceiveGoods && (
          <Button variant="outline" onClick={() => setShowReceiveDialog(true)} className="gap-1.5">
            <PackageCheck className="h-4 w-4" />
            Wareneingang erfassen
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
      
      {/* Verstecktes Element für QR-Code-Rendering */}
      <div className="hidden">
        <div ref={qrCodeRef}></div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
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
            <Mail className="h-4 w-4" />
            <span>Dokumente</span>
          </TabsTrigger>
          <TabsTrigger value="email-test" className="gap-1.5">
            <Send className="h-4 w-4" />
            <span>E-Mail Test</span>
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
                  {/* Tracking-Code im vereinfachten Workflow entfernt */}
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
                      <span className="font-medium">{order.orderItems?.length || 0}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm">Gesamtmenge:</span>
                      <span className="font-medium">
                        {order.orderItems?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0} Stück
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Gesamtbetrag:</span>
                      <span className="font-medium">{formatCurrency(order.totalAmount)}</span>
                    </div>
                  </div>
                </div>
                
                {/* Dokumenten-Aktionen */}
                <OrderDetailActions 
                  order={order}
                />
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
                          href={`/warehouses/${order.warehouseId}`}
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
                  {order.orderItems.map((item: any) => (
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
                  {parseStatusHistory(order.statusHistory).reverse().map((entry: any, index: number) => (
                    <li key={entry.id || index} className="relative pl-14">
                      <div className="absolute left-0 flex h-14 w-14 items-center justify-center rounded-full border bg-card">
                        {/* Vereinfachter Workflow hat nur 3 Status + Storniert */}
                        {entry.status === "draft" && <Mail className="h-6 w-6 text-blue-500" />}
                        {entry.status === "ordered" && <Send className="h-6 w-6 text-yellow-500" />}
                        {entry.status === "completed" && <CheckCircle2 className="h-6 w-6 text-green-500" />}
                        {entry.status === "cancelled" && <XCircle className="h-6 w-6 text-red-500" />}
                        {/* Legacy-Status für Abwärtskompatibilität */}
                        {entry.status === "pending" && <Send className="h-6 w-6 text-yellow-500" />}
                        {entry.status === "shipped" && <Send className="h-6 w-6 text-yellow-500" />}
                        {entry.status === "delivered" && <CheckCircle2 className="h-6 w-6 text-green-500" />}
                      </div>
                      <div>
                        <time className="block text-sm text-muted-foreground">
                          {formatDate(entry.timestamp)} {formatTime(entry.timestamp)}
                        </time>
                        <h3 className="font-medium">
                          {/* Vereinfachter Workflow hat nur 3 Status + Storniert */}
                          {entry.status === "draft" && "Bestellung erstellt"}
                          {entry.status === "ordered" && "Bestellung an Lieferanten gesendet"}
                          {entry.status === "completed" && "Bestellung abgeschlossen"}
                          {entry.status === "cancelled" && "Bestellung storniert"}
                          {/* Legacy-Status für Abwärtskompatibilität */}
                          {entry.status === "pending" && "Bestellung an Lieferanten gesendet"}
                          {entry.status === "shipped" && "Bestellung unterwegs"}
                          {entry.status === "delivered" && "Bestellung geliefert"}
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
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Dokumente</CardTitle>
                <CardDescription>
                  Alle zugehörigen Dokumente
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => fetchDocuments(order.id)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingDocuments ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : documents && documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-3 rounded-md border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium text-sm">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(doc.createdAt).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleViewDocument(doc)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDownloadDocument(doc)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-1">Keine Dokumente</h3>
                  <p className="text-muted-foreground">
                    Senden Sie eine E-Mail durch Klicken auf "E-Mail senden"
                    in der Aktionsleiste.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* E-Mail Test Tab */}
        <TabsContent value="email-test">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>E-Mail Test - Bypass-Modus</CardTitle>
                <CardDescription>
                  Alternative E-Mail-Versendung für Tests und Debugging ohne Formvalidierung
                </CardDescription>
              </CardHeader>
              <CardContent>
                {order && (
                  <DirectEmailSender
                    orderId={Number(id)}
                    orderNumber={order.orderNumber || ""}
                    supplierEmail={order.supplier?.email || "test@proviantomat.de"}
                    onSuccess={() => {
                      toast({
                        title: "E-Mail Test erfolgreich",
                        description: "Die E-Mail wurde erfolgreich im Bypass-Modus verarbeitet.",
                      });
                      queryClient.invalidateQueries({ queryKey: orderKeys.detail(Number(id)) });
                    }}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Raw HTTP E-Mail Sender</CardTitle>
                <CardDescription>
                  Vollständig rohe HTTP-Anfrage ohne jegliche Validierung oder Bibliotheken
                </CardDescription>
              </CardHeader>
              <CardContent>
                {order && (
                  <RawHttpEmailSender
                    orderId={Number(id)}
                    orderNumber={order.orderNumber || ""}
                    supplierEmail={order.supplier?.email || "test@proviantomat.de"}
                    onSuccess={() => {
                      toast({
                        title: "Raw HTTP E-Mail erfolgreich",
                        description: "Die rohe HTTP-Anfrage wurde erfolgreich verarbeitet.",
                      });
                      queryClient.invalidateQueries({ queryKey: orderKeys.detail(Number(id)) });
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
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
      
      {/* Tracking Dialog - im vereinfachten Workflow entfernt */}
      
      {/* Wareneingangs-Dialog mit detaillierten Optionen */}
      <ReceiveOrderDialog
        order={order}
        open={showReceiveDialog}
        onOpenChange={setShowReceiveDialog}
        onSuccess={handleProcessReceipt}
      />
      
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
            <div className="bg-white p-4 rounded-md" ref={qrCodeRef}>
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              ) : (
                <QrCode className="h-48 w-48 text-black" />
              )}
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            {qrCodeUrl && (
              <Button variant="outline" className="sm:w-auto w-full" asChild>
                <a href={qrCodeUrl} download={`qr-portal-${order?.orderNumber || 'download'}.png`}>
                  <Download className="h-4 w-4 mr-2" />
                  Herunterladen
                </a>
              </Button>
            )}
            <Button className="sm:w-auto w-full" onClick={() => setShowQrDialog(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* PDF Dialog */}
      {/* E-Mail Dialog */}
      {order && (
        <EmailDialogFixed
          isOpen={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          orderId={Number(id)}
          orderNumber={order.orderNumber || ""}
          supplierName={order.supplierName || ""}
          supplierEmail={order.supplier?.email || ""}
          onSendEmail={(success) => {
            if (success) {
              queryClient.invalidateQueries({ queryKey: orderKeys.detail(Number(id)) });
            }
          }}
        />
      )}

      {/* Manual Status Change Dialog */}
      <ManualStatusChange 
        order={order} 
        isOpen={showStatusChangeDialog} 
        onClose={() => setShowStatusChangeDialog(false)} 
      />
    </div>
  );
}