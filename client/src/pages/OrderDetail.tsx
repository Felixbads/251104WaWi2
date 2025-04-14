import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { jsPDF } from "jspdf";
// @ts-ignore
import QRCode from "qrcode";
import ReceiveOrderDialog from "@/components/orders/ReceiveOrderDialog";
import OrderDetailActions from "@/components/orders/OrderDetailActions";
import ManualStatusChange from "@/components/orders/ManualStatusChange";
import html2canvas from "html2canvas";
import { getOrder, updateOrder } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  PackageCheck,
  CheckCircle2,
  ClipboardCheck,
  Send,
  Loader2,
  Clock,
  XCircle,
  Download,
  QrCode,
  Mail,
  ShoppingBag,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  MapPin,
  Printer,
  Eye,
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
    case "ordered":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">Bestellt</Badge>;
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
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  
  // Refs für PDF-Generierung
  const pdfContentRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  
  // PDF und QR Code States
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  
  // Form States
  const [sendNote, setSendNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  
  // Lade Bestelldetails
  const { data: order, isLoading, error } = useQuery({
    queryKey: [`/api/orders/${id}`],
    staleTime: 1000 * 60, // 1 Minute
    queryFn: () => getOrder(Number(id))
  });
  
  // States für Dokumente
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

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
      setDocuments(data);
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
    
    // Download-Link erstellen und klicken
    const link = document.createElement('a');
    link.href = doc.fileUrl;
    link.download = doc.title || `Dokument-${doc.id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download gestartet",
      description: "Das Dokument wird heruntergeladen."
    });
  };
  
  // Mutations für Bestellstatus-Updates
  const updateOrderMutation = useMutation({
    mutationFn: async (updateData: any) => {
      return updateOrder(Number(id), updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/dashboard/open'] });
    }
  });
  
  // Zurück zur Bestellungsübersicht
  const handleBack = () => {
    navigate('/bestellungen');
  };
  
  // Bestellung absenden
  const handleSendOrder = () => {
    if (!order) return;
    
    // Bestehende Statushistorie als Array verarbeiten
    const currentHistory = Array.isArray(order.statusHistory) 
      ? order.statusHistory 
      : (order.statusHistory ? JSON.parse(order.statusHistory as string) : []);
    
    // Neuen Status hinzufügen
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
    
    // Bestehende Statushistorie als Array verarbeiten
    const currentHistory = Array.isArray(order.statusHistory) 
      ? order.statusHistory 
      : (order.statusHistory ? JSON.parse(order.statusHistory as string) : []);
    
    // Neuen Status hinzufügen - direkt auf "completed" setzen im vereinfachten Workflow
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
    queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
  };
  
  // Bestellung stornieren
  const handleCancelOrder = () => {
    if (!order) return;
    
    // Bestehende Statushistorie als Array verarbeiten
    const currentHistory = Array.isArray(order.statusHistory) 
      ? order.statusHistory 
      : (order.statusHistory ? JSON.parse(order.statusHistory as string) : []);
    
    // Neuen Status hinzufügen
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
  
  // PDF generieren
  const generatePdf = async () => {
    if (!order) {
      toast({
        title: "Fehler beim Generieren des PDFs",
        description: "Die Bestelldaten sind nicht verfügbar",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Status setzen
      toast({
        title: "PDF wird generiert",
        description: "Bitte warten Sie einen Moment...",
      });
      
      // Manuell ein temporäres HTML-Element für die PDF-Generierung erstellen
      const tempDiv = document.createElement('div');
      tempDiv.style.width = '800px';
      tempDiv.style.padding = '20px';
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      
      // QR-Code generieren für das PDF
      const portalUrl = `${window.location.origin}/lieferantenportal/${order.supplierId}/bestellung/${order.id}`;
      const qrDataUrl = await QRCode.toDataURL(portalUrl, {
        width: 150,
        margin: 1,
      });
      
      // HTML-Inhalt für die Bestellung generieren
      tempDiv.innerHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 800px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px;">
            <div>
              <h1 style="margin: 0; font-size: 24px;">Bestellung ${order.orderNumber || `#${order.id}`}</h1>
              <p style="margin: 5px 0; font-size: 14px;">Datum: ${new Date(order.createdAt || new Date()).toLocaleDateString('de-DE')}</p>
            </div>
          </div>
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px;">
            <div style="width: 48%;">
              <h2 style="margin: 0 0 10px 0; font-size: 16px;">Lieferant</h2>
              <p style="margin: 0; font-weight: bold;">${order.supplierName}</p>
              ${order.supplier?.address ? `<p style="margin: 5px 0;">${order.supplier.address}</p>` : ''}
              ${order.supplier?.phone ? `<p style="margin: 5px 0;">Tel: ${order.supplier.phone}</p>` : ''}
              ${order.supplier?.email ? `<p style="margin: 5px 0;">E-Mail: ${order.supplier.email}</p>` : ''}
            </div>
            <div style="width: 48%;">
              <h2 style="margin: 0 0 10px 0; font-size: 16px;">Lieferadresse</h2>
              <p style="margin: 0; font-weight: bold;">${order.warehouseName || "Nationalpark Zentrum"}</p>
              <p style="margin: 5px 0;">Bad Schandau</p>
            </div>
          </div>
          
          <div style="margin-bottom: 30px;">
            <h2 style="margin: 0 0 10px 0; font-size: 16px;">Bestellpositionen</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr style="background-color: #f3f4f6;">
                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Produkt</th>
                <th style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">Menge</th>
                <th style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">Einzelpreis</th>
                <th style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">Gesamt</th>
              </tr>
              ${(order.orderItems || []).map((item: any) => `
                <tr>
                  <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${item.productName || item.name}</td>
                  <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${item.quantity} ${item.unit || "Stk."}</td>
                  <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${item.unitPrice ? (item.unitPrice).toFixed(2) : "0.00"} €</td>
                  <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${item.totalPrice ? (item.totalPrice).toFixed(2) : (item.unitPrice * item.quantity).toFixed(2)} €</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold;">
                <td colspan="3" style="text-align: right; padding: 8px; font-size: 14px;">Gesamtsumme:</td>
                <td style="text-align: right; padding: 8px; font-size: 14px;">${order.totalAmount ? order.totalAmount.toFixed(2) : (order.orderItems || []).reduce((sum: number, item: any) => sum + (item.totalPrice || (item.unitPrice * item.quantity)), 0).toFixed(2)} €</td>
              </tr>
            </table>
          </div>
          
          <div style="margin-top: 30px;">
            <h3 style="margin: 0; font-size: 16px;">Zusätzliche Informationen:</h3>
            <p style="margin: 5px 0; font-size: 14px;">Lieferdatum: ${order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE') : 'Nicht festgelegt'}</p>
            <p style="margin: 5px 0; font-size: 14px;">Priorität: ${order.priority || 'Normal'}</p>
            ${order.notes ? `<p style="margin: 5px 0; font-size: 14px;">Anmerkungen: ${order.notes}</p>` : ''}
          </div>
        </div>
      `;
      
      // Element temporär zum DOM hinzufügen
      document.body.appendChild(tempDiv);
      
      // HTML in Canvas umwandeln
      const canvas = await html2canvas(tempDiv, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        allowTaint: true,
      });
      
      // Temporäres Element wieder entfernen
      document.body.removeChild(tempDiv);
      
      // PDF erstellen
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Berechnungen für die Bildanpassung
      const imgWidth = 190;
      const imgHeight = canvas.height * imgWidth / canvas.width;
      
      // Bild zum PDF hinzufügen
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      
      // QR-Code zum PDF hinzufügen, wenn wir einen haben
      pdf.addImage(qrDataUrl, 'PNG', 155, 10, 35, 35);
      
      // PDF als Blob speichern
      const blob = pdf.output('blob');
      setPdfBlob(blob);
      
      // PDF-Vorschau anzeigen
      setShowPdfDialog(true);
      
      // Status aktualisieren
      toast({
        title: "PDF erfolgreich generiert",
        description: "Sie können das PDF jetzt herunterladen oder per E-Mail versenden."
      });
    } catch (error) {
      toast({
        title: "Fehler beim Generieren des PDFs",
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };
  
  // PDF herunterladen
  const handleDownloadPdf = () => {
    if (!pdfBlob) return;
    
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bestellung_${order?.orderNumber || 'download'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // E-Mail mit PDF versenden
  const handlePrepareEmail = () => {
    if (!order) return;
    
    // E-Mail-Vorlage vorbereiten
    setEmailSubject(`Bestellung ${order.orderNumber} vom ${formatDate(order.createdAt)}`);
    setEmailAddress("lieferant@example.com"); // In der Praxis: order.supplierEmail
    setEmailText(`Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Bestellung ${order.orderNumber} vom ${formatDate(order.createdAt)}.

Bitte bestätigen Sie den Erhalt dieser Bestellung und informieren Sie uns über das voraussichtliche Lieferdatum.

Mit freundlichen Grüßen
Nationalpark Zentrum`);
    
    // Dialog öffnen
    setShowPdfDialog(false);
    setShowEmailDialog(true);
  };
  
  // E-Mail versenden
  const handleSendEmail = async () => {
    if (!order || !pdfBlob) return;
    
    try {
      // PDF in Base64 konvertieren
      const reader = new FileReader();
      
      // Als Promise umwandeln
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result?.toString().split(',')[1];
          if (base64) {
            resolve(base64);
          } else {
            reject(new Error("Fehler beim Konvertieren der PDF-Datei"));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(pdfBlob);
      });
      
      // Bestellungs-ID extrahieren
      const orderId = order.id;
      
      // Daten für API-Anfrage vorbereiten
      const emailData = {
        orderId: orderId,
        supplierEmail: emailAddress,
        pdfBase64: pdfBase64,
        additionalNotes: emailText
      };
      
      // Lädt-Status anzeigen
      toast({
        title: "E-Mail wird gesendet",
        description: "Bitte warten..."
      });
      
      // API-Anfrage senden
      const response = await fetch('/api/email/order-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Senden der E-Mail: ${response.statusText}`);
      }
      
      // Erfolgsmeldung anzeigen
      toast({
        title: "E-Mail versendet",
        description: `Die Bestellung wurde per E-Mail an ${emailAddress} gesendet.`
      });
      
      // Bestehende Statushistorie als Array verarbeiten
      const currentHistory = Array.isArray(order.statusHistory) 
        ? order.statusHistory 
        : (order.statusHistory ? JSON.parse(order.statusHistory as string) : []);
      
      // Neuen Status hinzufügen, wenn wir noch nicht im Status 'ordered' sind
      if (order.status !== 'ordered') {
        const newStatusEntry = {
          status: "ordered",
          timestamp: new Date().toISOString(),
          note: `Bestellung per E-Mail an ${emailAddress} gesendet`
        };
        
        // Bestellstatus aktualisieren
        await updateOrderMutation.mutateAsync({ 
          status: "ordered", 
          statusHistory: JSON.stringify([...currentHistory, newStatusEntry]) 
        });
      }
      
      // Dialog schließen
      setShowEmailDialog(false);
    } catch (error) {
      // Fehlermeldung anzeigen
      toast({
        title: "Fehler beim Senden der E-Mail",
        description: (error as Error).message,
        variant: "destructive"
      });
    }
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
          <Button variant="outline" size="sm" onClick={generatePdf} className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
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
          <Button variant="outline" size="sm" onClick={() => setShowEmailDialog(true)} className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">E-Mail</span>
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
      
      {/* Unsichtbares PDF-Template für die Generierung */}
      <div className="hidden">
        <div ref={pdfContentRef} className="p-8 bg-white" style={{ width: '210mm', height: '297mm' }}>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold">Bestellung #{order.orderNumber}</h1>
              <p className="text-sm">Erstellt am: {formatDate(order.createdAt)}</p>
            </div>
            <div className="text-right">
              <h2 className="font-bold">Nationale Parkverwaltung Sächsische Schweiz</h2>
              <p className="text-sm">Nationalpark Zentrum</p>
              <p className="text-sm">Dresdner Str. 2B, 01814 Bad Schandau</p>
              <p className="text-sm">info@nationalpark-saechsische-schweiz.de</p>
            </div>
          </div>
          
          <div className="mt-10">
            <h2 className="font-bold mb-1">Lieferant:</h2>
            <p>{order.supplierName}</p>
            <p>[Lieferantenadresse]</p>
            <p>Kundennummer: [Kundennummer]</p>
          </div>
          
          <div className="mt-6">
            <h2 className="font-bold mb-1">Lieferadresse:</h2>
            <p>{order.warehouseName}</p>
            <p>Hauptstraße 123, 01307 Dresden</p>
          </div>
          
          <div className="mt-8">
            <h3 className="font-bold border-b pb-2 mb-2">Bestellpositionen</h3>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Pos.</th>
                  <th className="py-2">Artikel</th>
                  <th className="py-2">Artikel-Nr.</th>
                  <th className="py-2 text-right">Menge</th>
                  <th className="py-2 text-right">Einzelpreis</th>
                  <th className="py-2 text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {order.orderItems.map((item: any, index: number) => (
                  <tr key={item.id} className="border-t">
                    <td className="py-2">{index + 1}</td>
                    <td className="py-2">{item.productName}</td>
                    <td className="py-2">{item.supplierSku || item.sku || "-"}</td>
                    <td className="py-2 text-right">{item.quantity} {item.unit}</td>
                    <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-2 text-right">{formatCurrency(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-bold">
                  <td colSpan={5} className="py-2 text-right">Gesamtsumme:</td>
                  <td className="py-2 text-right">{formatCurrency(order.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {order.notes && (
            <div className="mt-6">
              <h3 className="font-bold mb-1">Anmerkungen:</h3>
              <p>{order.notes}</p>
            </div>
          )}
          
          <div className="mt-8">
            <h3 className="font-bold mb-1">Lieferinformationen:</h3>
            <p>Gewünschter Liefertermin: {formatDate(order.expectedDeliveryDate)}</p>
            <p>Öffnungszeiten Wareneingang: Mo-Fr 08:00 - 16:00 Uhr</p>
          </div>
          
          <div className="mt-8 pt-4 border-t text-sm">
            <p>Bitte bestätigen Sie diese Bestellung über unser Lieferantenportal.</p>
            <p>Sie können den QR-Code scannen oder folgende URL besuchen:</p>
            <p>{window.location.origin}/lieferantenportal/{order.supplierId}/bestellung/{order.id}</p>
          </div>
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
                      <span className="font-medium">{order.orderItems.length}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm">Gesamtmenge:</span>
                      <span className="font-medium">
                        {order.orderItems.reduce((sum: number, item: any) => sum + item.quantity, 0)} Stück
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
                  pdfContentRef={pdfContentRef}
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
                  {(Array.isArray(order.statusHistory) ? [...order.statusHistory] : 
                  (order.statusHistory ? JSON.parse(order.statusHistory as string) : []))
                  .reverse().map((entry: any, index: number) => (
                    <li key={entry.id || index} className="relative pl-14">
                      <div className="absolute left-0 flex h-14 w-14 items-center justify-center rounded-full border bg-card">
                        {/* Vereinfachter Workflow hat nur 3 Status + Storniert */}
                        {entry.status === "draft" && <FileText className="h-6 w-6 text-blue-500" />}
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
                        <FileText className="h-5 w-5 text-primary" />
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
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-1">Keine Dokumente</h3>
                  <p className="text-muted-foreground">
                    Generieren Sie ein PDF-Dokument durch Klicken auf "PDF generieren"
                    in der Aktionsleiste.
                  </p>
                </div>
              )}
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
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Bestellformular (PDF)</DialogTitle>
            <DialogDescription>
              Bestellformular für {order?.supplierName} wurde erfolgreich erstellt.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-center py-4 border rounded-md">
            {pdfBlob ? (
              <iframe 
                src={URL.createObjectURL(pdfBlob)} 
                className="w-full h-[450px]" 
                title="PDF Vorschau"
              />
            ) : (
              <div className="flex items-center justify-center h-[450px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>
          
          <DialogFooter className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              onClick={handleDownloadPdf}
              disabled={!pdfBlob}
            >
              <Download className="h-4 w-4 mr-2" />
              Herunterladen
            </Button>
            <Button 
              onClick={handlePrepareEmail}
              disabled={!pdfBlob}
            >
              <Send className="h-4 w-4 mr-2" />
              Per E-Mail versenden
            </Button>
            <Button 
              variant="secondary"
              onClick={() => setShowPdfDialog(false)}
            >
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* E-Mail Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bestellung per E-Mail versenden</DialogTitle>
            <DialogDescription>
              Versenden Sie die Bestellung per E-Mail an den Lieferanten.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email-to">Empfänger</Label>
                <Input 
                  id="email-to" 
                  value={emailAddress} 
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="lieferant@example.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email-subject">Betreff</Label>
                <Input 
                  id="email-subject" 
                  value={emailSubject} 
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email-text">Nachricht</Label>
                <Textarea 
                  id="email-text" 
                  value={emailText} 
                  onChange={(e) => setEmailText(e.target.value)}
                  className="min-h-[200px]"
                />
              </div>
              
              <div className="bg-muted p-3 rounded-md flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Bestellung_{order?.orderNumber}.pdf</p>
                  <p className="text-xs text-muted-foreground">PDF-Datei wird automatisch angehängt</p>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEmailDialog(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSendEmail}>
              <Send className="h-4 w-4 mr-2" />
              E-Mail senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Status Change Dialog */}
      <ManualStatusChange 
        order={order} 
        isOpen={showStatusChangeDialog} 
        onClose={() => setShowStatusChangeDialog(false)} 
      />
    </div>
  );
}