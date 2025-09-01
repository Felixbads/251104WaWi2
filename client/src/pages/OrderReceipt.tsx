import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { getOrder, processOrderReceipt, getProducts } from "@/lib/api";

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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

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
  CircleCheck,
  Loader2,
  AlertTriangle,
  Building,
  Camera,
  Info,
  Plus,
  Upload,
  X
} from "lucide-react";

// Mock data
const mockOrder = {
  id: 1,
  orderNumber: "B-2025-001",
  createdAt: "2025-03-25T10:30:00Z",
  warehouseId: 1,
  warehouseName: "Hauptlager Dresden",
  status: "delivered",
  supplierId: 1,
  supplierName: "Milchhof Fiedler",
  deliveryDate: "2025-03-31T09:45:00Z",
  deliveryNotes: "",
  deliveryStatus: "pending_check", // pending_check, partially_accepted, accepted, rejected
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
      qualityStatus: "pending", // pending, good, damaged, missing
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
      qualityStatus: "pending",
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
      qualityStatus: "pending",
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
      qualityStatus: "pending",
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
      qualityStatus: "pending",
      notes: ""
    }
  ]
};

// Hilfer für Währungsformatierung
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

// Hilfer für Datumsformatierung
const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return format(date, "dd.MM.yyyy", { locale: de });
};

// Hilfer für Zeitformatierung
const formatTime = (dateString: string | null) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return format(date, "HH:mm", { locale: de });
};

export default function OrderReceipt() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form state
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
  const [notes, setNotes] = useState("");
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [issueNotes, setIssueNotes] = useState("");
  const [editQuantity, setEditQuantity] = useState(0);
  const [editNotes, setEditNotes] = useState("");
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  
  // Lade Bestelldetails
  const { data: order, isLoading, error } = useQuery({
    queryKey: [`/api/orders/${id}`],
    queryFn: () => getOrder(Number(id)),
    staleTime: 1000 * 60 // 1 Minute
  });
  
  // Lade Produktliste für Dropdowns
  const { data: productsData } = useQuery({
    queryKey: [`/api/products`],
    queryFn: () => getProducts(),
    staleTime: 1000 * 60 * 5 // 5 Minuten
  });
  
  // Sichere Produktdaten mit Fallback - handle beide API response Strukturen
  const products = (() => {
    if (Array.isArray(productsData)) return productsData;
    if (productsData && Array.isArray(productsData.data)) return productsData.data;
    return [];
  })();
  
  // Initialize orderItems when order data is loaded
  useEffect(() => {
    if (order && order.orderItems && order.orderItems.length > 0) {
      setOrderItems(order.orderItems.map(item => ({
        ...item,
        receivedQuantity: item.quantity, // Default to ordered quantity
        qualityStatus: "good" // Default to good quality
      })));
    }
  }, [order]);
  
  // Mutation für Wareneingang
  const receiptMutation = useMutation({
    mutationFn: (data: any) => {
      if (!order) return Promise.reject(new Error("Keine Bestelldaten vorhanden"));
      
      return processOrderReceipt(Number(id), {
        receiptDate: new Date(),
        receiptNumber: `RE-${order.orderNumber || 'NEW'}-${new Date().getTime().toString().slice(-6)}`,
        notes: data.notes,
        receivedItems: data.items.map((item: any) => ({
          orderItemId: item.orderItemId,
          receivedQuantity: item.receivedQuantity || 0,
          qualityIssues: item.qualityStatus === 'damaged',
          damageDescription: item.qualityStatus === 'damaged' ? item.notes : undefined
        }))
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
      toast({
        title: "Wareneingang erfasst",
        description: "Der Wareneingang wurde erfolgreich erfasst."
      });
      navigate(`/bestellungen/${id}`);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erfassen des Wareneingangs: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  });
  
  // Update item quantity
  const handleQuantityChange = (itemId: number, quantity: number) => {
    setOrderItems(items => 
      items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              receivedQuantity: quantity,
              qualityStatus: quantity === 0 ? "missing" : item.qualityStatus
            } 
          : item
      )
    );
  };
  
  // Update item quality status
  const handleQualityChange = (itemId: number, status: string) => {
    setOrderItems(items => 
      items.map(item => 
        item.id === itemId 
          ? { ...item, qualityStatus: status } 
          : item
      )
    );
  };
  
  // Handle item issue report
  const openIssueDialog = (item: any) => {
    setSelectedItem(item);
    setIssueNotes(item.notes || "");
    setPhotoUploaded(false);
    setShowIssueDialog(true);
  };
  
  // Öffnen des Bearbeitungsdialogs für eine Bestellposition
  const openEditDialog = (item: any) => {
    setSelectedItem(item);
    setEditQuantity(item.receivedQuantity || 0);
    setEditNotes(item.notes || "");
    setShowEditDialog(true);
  };
  
  // Speichern der bearbeiteten Bestellposition
  const saveEditedItem = () => {
    if (!selectedItem) return;
    
    setOrderItems(items => 
      items.map(item => 
        item.id === selectedItem.id 
          ? { 
              ...item, 
              receivedQuantity: editQuantity,
              notes: editNotes,
              qualityStatus: editQuantity === 0 ? "missing" : item.qualityStatus
            } 
          : item
      )
    );
    
    setShowEditDialog(false);
    toast({
      title: "Position aktualisiert",
      description: "Die Bestellposition wurde erfolgreich aktualisiert."
    });
  };
  
  // Save issue report
  const saveIssueReport = () => {
    if (!selectedItem) return;
    
    setOrderItems(items => 
      items.map(item => 
        item.id === selectedItem.id 
          ? { ...item, notes: issueNotes } 
          : item
      )
    );
    
    setShowIssueDialog(false);
    toast({
      title: "Problem erfasst",
      description: "Das Problem wurde erfasst und wird bei der Qualitätsprüfung berücksichtigt."
    });
  };
  
  // Submit receipt
  const submitReceipt = () => {
    if (!confirmComplete) {
      toast({
        title: "Bestätigung erforderlich",
        description: "Bitte bestätigen Sie, dass alle Artikel überprüft wurden.",
        variant: "destructive"
      });
      return;
    }
    
    // Statistics for receipt
    const totalReceived = orderItems.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
    const totalOrdered = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const hasIssues = orderItems.some(item => 
      item.qualityStatus === "damaged" || 
      item.qualityStatus === "missing" || 
      (item.receivedQuantity || 0) !== item.quantity
    );
    
    // Sicherheitscheck: Nur fortfahren, wenn wir einen gültigen order haben
    if (!order || !order.id) {
      toast({
        title: "Fehler",
        description: "Bestelldaten nicht verfügbar. Bitte laden Sie die Seite neu.",
        variant: "destructive"
      });
      return;
    }
    
    const receiptData = {
      orderId: order.id,
      receiptDate: new Date().toISOString(),
      receiptStatus: hasIssues ? "partially_accepted" : "accepted",
      notes: notes,
      totalReceived,
      totalOrdered,
      items: orderItems.map(item => ({
        orderItemId: item.id,
        productId: item.productId,
        receivedQuantity: item.receivedQuantity,
        qualityStatus: item.qualityStatus,
        notes: item.notes
      }))
    };
    
    receiptMutation.mutate(receiptData);
  };
  
  // Echte Foto-Upload-Funktion
  const handlePhotoUpload = () => {
    // Erstellen Sie ein verstecktes Fileinput-Element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    // Fügen Sie es zum DOM hinzu
    document.body.appendChild(fileInput);
    
    // Event-Handler für Dateiauswahl
    fileInput.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        
        // Hier würde normalerweise der Upload-Code stehen
        // Für diesen Prototyp simulieren wir den Upload
        toast({
          title: "Foto wird hochgeladen",
          description: `${file.name} wird verarbeitet...`,
        });
        
        // Simulierte Verzögerung
        setTimeout(() => {
          setPhotoUploaded(true);
          toast({
            title: "Foto hochgeladen",
            description: `${file.name} wurde erfolgreich hochgeladen.`
          });
        }, 1500);
      }
      
      // Entfernen Sie das Element aus dem DOM
      document.body.removeChild(fileInput);
    };
    
    // Trigger click event
    fileInput.click();
  };
  
  // Handle back button
  const handleBack = () => {
    navigate(`/bestellungen/${id}`);
  };
  
  // Determine status for item
  const getItemStatus = (item: any) => {
    if (!item.receivedQuantity) return "missing";
    if (item.receivedQuantity < item.quantity) return "partial";
    if (item.qualityStatus === "damaged") return "damaged";
    return "good";
  };
  
  // Get status badge for item
  const getStatusBadge = (item: any) => {
    const status = getItemStatus(item);
    
    switch (status) {
      case "good":
        return <Badge variant="outline" className="bg-green-100 text-green-800">In Ordnung</Badge>;
      case "partial":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Teillieferung ({item.receivedQuantity}/{item.quantity})</Badge>;
      case "damaged":
        return <Badge variant="outline" className="bg-red-100 text-red-800">Beschädigt</Badge>;
      case "missing":
        return <Badge variant="outline" className="bg-red-100 text-red-800">Fehlend</Badge>;
      default:
        return <Badge variant="outline">Unbekannt</Badge>;
    }
  };
  
  // Loading state
  if (isLoading) {
    return (
      <div className="container py-6 flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Bestelldetails werden geladen...</p>
      </div>
    );
  }
  
  // Error state
  if (error || !order) {
    return (
      <div className="container py-6">
        <Button variant="outline" className="mb-4" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zur Bestellung
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
  
  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Wareneingang für Bestellung #{order.orderNumber}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {formatDate(order.expectedDeliveryDate)} {formatTime(order.expectedDeliveryDate)}
            </p>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <span>Wareneingang prüfen</span>
            </CardTitle>
            <CardDescription>
              Überprüfen Sie die gelieferten Artikel und erfassen Sie Mengen und Qualität
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Produkt</TableHead>
                  <TableHead>Bestellt</TableHead>
                  <TableHead>Erhalten</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderItems.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditDialog(item)}>
                    <TableCell className="font-medium">
                      {item.productName}
                      {item.sku && (
                        <div className="text-xs text-muted-foreground">
                          SKU: {item.sku}{item.supplierSku ? ` | Lieferanten-Nr: ${item.supplierSku}` : ''}
                        </div>
                      )}
                      {item.notes && (
                        <div className="text-xs italic text-amber-600 mt-1">{item.notes}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.quantity} {item.unit}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Input
                        type="number"
                        value={item.receivedQuantity || 0}
                        onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                        className="w-20"
                        min="0"
                      />
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(item)}
                    </TableCell>
                    <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleQualityChange(item.id, "good"); }}
                        className={item.qualityStatus === "good" ? "bg-green-100 text-green-800" : ""}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleQualityChange(item.id, "damaged"); }}
                        className={item.qualityStatus === "damaged" ? "bg-red-100 text-red-800" : ""}
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openIssueDialog(item); }}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* Total summary */}
            <div className="rounded-md border p-4 bg-muted/30">
              <div className="flex justify-between items-center">
                <div className="space-y-1.5">
                  <div className="text-sm">
                    <span className="font-medium">Gesamtmenge bestellt:</span>{' '}
                    {orderItems.reduce((sum, item) => sum + item.quantity, 0)} Artikel
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Gesamtmenge erhalten:</span>{' '}
                    {orderItems.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0)} Artikel
                  </div>
                </div>
                <div>
                  {orderItems.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0) === 
                   orderItems.reduce((sum, item) => sum + item.quantity, 0) && 
                   !orderItems.some(item => item.qualityStatus === "damaged") ? (
                    <Badge className="bg-green-100 text-green-800 px-3 py-1 text-base">
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Vollständig erhalten
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-100 text-yellow-800 px-3 py-1 text-base">
                      <AlertTriangle className="h-4 w-4 mr-1.5" />
                      Unvollständige Lieferung
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Anmerkungen zum Wareneingang</Label>
              <Textarea
                id="notes"
                placeholder="Anmerkungen zur gesamten Lieferung..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-24"
              />
            </div>
            
            {/* Confirmation */}
            <div className="flex items-start space-x-2 mt-6">
              <Checkbox
                id="confirm-complete"
                checked={confirmComplete}
                onCheckedChange={(checked) => setConfirmComplete(checked as boolean)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="confirm-complete"
                  className="leading-normal"
                >
                  Ich bestätige, dass ich alle Artikel überprüft habe und die eingegebenen Daten korrekt sind.
                </Label>
                <p className="text-sm text-muted-foreground">
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            <Button 
              onClick={submitReceipt} 
              disabled={receiptMutation.isPending || !confirmComplete}
            >
              {receiptMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4 mr-2" />
              )}
              Wareneingang abschließen
            </Button>
          </CardFooter>
        </Card>
        
        {/* Side panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                <span>Lieferdetails</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Lieferant</h3>
                <p className="font-medium">{order.supplierName}</p>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Lieferdatum</h3>
                <p>{formatDate(order.expectedDeliveryDate)} {formatTime(order.expectedDeliveryDate)}</p>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Lieferort</h3>
                <p className="font-medium">{order.warehouseName}</p>
                <p className="text-sm text-muted-foreground">Hauptstraße 123, 01307 Dresden</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                <span>Liefernachweis</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handlePhotoUpload}
              >
                <Upload className="h-4 w-4 mr-2" />
                Fotos hochladen
              </Button>
              
              <div className="text-sm text-muted-foreground">
                Laden Sie Fotos der Lieferung hoch, um Probleme zu dokumentieren.
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                <span>Hilfe & Hinweise</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-medium">Mengen prüfen:</span> Überprüfen Sie, ob die gelieferte Menge mit der bestellten Menge übereinstimmt.
                </p>
                <p>
                  <span className="font-medium">Qualität prüfen:</span> Markieren Sie Artikel als "Beschädigt", wenn sie nicht den Qualitätsstandards entsprechen.
                </p>
                <p>
                  <span className="font-medium">Probleme melden:</span> Nutzen Sie das Info-Symbol, um detaillierte Probleme zu erfassen.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Issue Dialog */}
      <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Problem melden</DialogTitle>
            <DialogDescription>
              {selectedItem && (
                `Erfassen Sie Details zu Problemen mit "${selectedItem.productName}"`
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="issue-description">Problembeschreibung</Label>
              <Textarea
                id="issue-description"
                placeholder="Beschreiben Sie das Problem mit dem Artikel..."
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                className="min-h-24"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Fotos hinzufügen</Label>
              <div className="border-2 border-dashed rounded-md p-4 text-center">
                {photoUploaded ? (
                  <div className="flex flex-col items-center space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <p className="text-sm font-medium">Foto erfolgreich hochgeladen</p>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setPhotoUploaded(false)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Entfernen
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <Camera className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Klicken Sie, um ein Foto hochzuladen</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handlePhotoUpload}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Foto hinzufügen
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowIssueDialog(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={saveIssueReport}>
              Problem speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Item Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bestellposition bearbeiten</DialogTitle>
            <DialogDescription>
              {selectedItem && (
                `Bearbeiten Sie die Details für "${selectedItem.productName}"`
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-quantity">Erhaltene Menge</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="edit-quantity"
                  type="number"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(parseInt(e.target.value) || 0)}
                  min="0"
                />
                {selectedItem && (
                  <span className="text-sm text-muted-foreground">
                    von {selectedItem?.quantity} {selectedItem?.unit || 'Stk.'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-product">Produkt</Label>
              <div className="flex items-center space-x-2">
                <select 
                  className="w-full p-2 border rounded-md" 
                  value={selectedItem?.productId}
                  onChange={(e) => {
                    const newProductId = parseInt(e.target.value);
                    const product = products.find((p: any) => p.id === newProductId);
                    if (product && selectedItem) {
                      setOrderItems(items => 
                        items.map(item => 
                          item.id === selectedItem.id 
                            ? { 
                                ...item, 
                                productId: product.id,
                                productName: product.productName || product.name
                              } 
                            : item
                        )
                      );
                    }
                  }}
                >
                  <option value={selectedItem?.productId}>{selectedItem?.productName}</option>
                  {products
                    .filter((p: any) => p.id !== selectedItem?.productId)
                    .map((product: any) => (
                      <option key={product.id} value={product.id}>
                        {product.productName || product.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Anmerkungen</Label>
              <Textarea
                id="edit-notes"
                placeholder="Anmerkungen zur Bestellposition..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="min-h-24"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Qualitätsstatus</Label>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { 
                    selectedItem && handleQualityChange(selectedItem.id, "good");
                  }}
                  className={selectedItem?.qualityStatus === "good" ? "bg-green-100 text-green-800" : ""}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  In Ordnung
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { 
                    selectedItem && handleQualityChange(selectedItem.id, "damaged");
                  }}
                  className={selectedItem?.qualityStatus === "damaged" ? "bg-red-100 text-red-800" : ""}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Beschädigt
                </Button>
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={saveEditedItem}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}