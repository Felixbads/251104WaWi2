import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, isAfter, isBefore } from "date-fns";
import { de } from "date-fns/locale";
import { getOrder, getWarehouses, processOrderReceipt, getProducts } from "@/lib/api";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

// Icons
import {
  ArrowLeft,
  Truck,
  Calendar,
  Package,
  Warehouse,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Upload,
  Edit2,
  Save,
  X,
  Plus,
  Loader2,
  AlertCircle,
  FileText,
  Building2,
  Clipboard,
  Eye
} from "lucide-react";

// Interfaces
interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  sku?: string;
  supplierSku?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  // Erweiterte Felder für Wareneingang
  receivedQuantity: number;
  qualityStatus: 'good' | 'damaged' | 'partial' | 'rejected';
  warehouseId?: number;
  mhd?: string; // Best-before date
  batchNumber?: string;
  supplierBatchNumber?: string;
  locationInWarehouse?: string;
  damageDescription?: string;
  requiresMhd?: boolean;
  photos?: string[];
}

interface Order {
  id: number;
  orderNumber: string;
  createdAt: string;
  expectedDeliveryDate?: string;
  supplierId: number;
  supplierName: string;
  status: string;
  warehouseId?: number;
  warehouseName?: string;
  orderItems: OrderItem[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// Hilfsfunktionen
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return format(date, "dd.MM.yyyy", { locale: de });
};

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return format(date, "dd.MM.yyyy HH:mm", { locale: de });
};

const generateBatchNumber = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `B${year}${month}${day}-${random}`;
};

const calculateDefaultMhd = (productName: string): string => {
  const now = new Date();
  // Intelligente Standard-MHD basierend auf Produkttyp
  if (productName.toLowerCase().includes('milch')) {
    return format(addDays(now, 7), 'yyyy-MM-dd');
  } else if (productName.toLowerCase().includes('joghurt') || productName.toLowerCase().includes('quark')) {
    return format(addDays(now, 14), 'yyyy-MM-dd');
  } else if (productName.toLowerCase().includes('käse') || productName.toLowerCase().includes('wehlrad')) {
    return format(addDays(now, 21), 'yyyy-MM-dd');
  } else {
    return format(addDays(now, 30), 'yyyy-MM-dd'); // Standard: 30 Tage
  }
};

const checkMhdRequirement = (productName: string): boolean => {
  // Produkte die MHD benötigen
  const mhdProducts = ['milch', 'joghurt', 'quark', 'käse', 'pudding', 'sahne', 'butter'];
  return mhdProducts.some(product => productName.toLowerCase().includes(product));
};

export default function OrderReceipt() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form state
  const [deliveryDate, setDeliveryDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [globalWarehouseId, setGlobalWarehouseId] = useState<number | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [notes, setNotes] = useState("");
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [deliveryPersonName, setDeliveryPersonName] = useState("");
  
  // Dialog state
  const [showItemEditDialog, setShowItemEditDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showQualityDialog, setShowQualityDialog] = useState(false);
  const [showMhdWarningDialog, setShowMhdWarningDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  
  // Form validation state
  const [isValidating, setIsValidating] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  
  // Photo upload state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  // Lade Bestelldetails
  const { data: order, isLoading: orderLoading, error: orderError } = useQuery({
    queryKey: [`/api/orders/${id}`],
    queryFn: () => getOrder(Number(id)),
    staleTime: 1000 * 60
  });
  
  // Lade Lager
  const { data: warehousesData } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: () => getWarehouses(),
    staleTime: 1000 * 60 * 5
  });
  
  const warehouses = Array.isArray(warehousesData) ? warehousesData : 
                    warehousesData?.data || [];
  
  // Lade Produkte für Dropdown-Ergänzungen
  const { data: productsData } = useQuery({
    queryKey: ['/api/products'],
    queryFn: () => getProducts(),
    staleTime: 1000 * 60 * 5
  });
  
  const products = Array.isArray(productsData) ? productsData : 
                  productsData?.data || [];
  
  // Initialize orderItems when order data is loaded
  useEffect(() => {
    if (order && order.orderItems && order.orderItems.length > 0) {
      const enhancedItems: OrderItem[] = order.orderItems.map(item => ({
        ...item,
        receivedQuantity: item.quantity, // Default zu bestellter Menge
        qualityStatus: 'good',
        warehouseId: order.warehouseId || undefined,
        requiresMhd: checkMhdRequirement(item.productName),
        mhd: checkMhdRequirement(item.productName) ? calculateDefaultMhd(item.productName) : undefined,
        batchNumber: checkMhdRequirement(item.productName) ? generateBatchNumber() : undefined,
        photos: []
      }));
      setOrderItems(enhancedItems);
      setGlobalWarehouseId(order.warehouseId || null);
    }
  }, [order]);
  
  // Real-time Validation
  useEffect(() => {
    validateForm();
  }, [deliveryDate, orderItems, globalWarehouseId]);
  
  const validateForm = async () => {
    if (!deliveryDate) {
      setCanSubmit(false);
      return;
    }
    
    const errors: ValidationError[] = [];
    
    // Lieferdatum-Validierung
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deliveryDateObj = new Date(deliveryDate);
    
    if (isAfter(deliveryDateObj, today)) {
      errors.push({
        field: 'deliveryDate',
        message: 'Lieferdatum kann nicht in der Zukunft liegen',
        severity: 'error'
      });
    }
    
    if (isBefore(deliveryDateObj, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))) {
      errors.push({
        field: 'deliveryDate',
        message: 'Lieferdatum ist älter als 30 Tage',
        severity: 'warning'
      });
    }
    
    // Verbesserte Lager-Validierung: Entweder global ODER alle Items haben Warehouse
    const itemsWithoutWarehouse = orderItems.filter(item => !item.warehouseId);
    if (!globalWarehouseId && itemsWithoutWarehouse.length > 0) {
      errors.push({
        field: 'warehouse',
        message: `Lager erforderlich für ${itemsWithoutWarehouse.length} Position(en): ${itemsWithoutWarehouse.map(item => item.productName).join(', ')}`,
        severity: 'error'
      });
    }
    
    // Item-spezifische Validierung
    orderItems.forEach((item, index) => {
      // MHD-Validierung
      if (item.requiresMhd && !item.mhd) {
        errors.push({
          field: `item_${index}_mhd`,
          message: `MHD erforderlich für ${item.productName}`,
          severity: 'error'
        });
      }
      
      if (item.mhd) {
        const mhdDate = new Date(item.mhd);
        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() + 3); // 3 Tage Warnung
        
        if (isBefore(mhdDate, today)) {
          errors.push({
            field: `item_${index}_mhd`,
            message: `MHD bereits abgelaufen für ${item.productName}`,
            severity: 'error'
          });
        } else if (isBefore(mhdDate, warningDate)) {
          errors.push({
            field: `item_${index}_mhd`,
            message: `MHD läuft bald ab für ${item.productName}`,
            severity: 'warning'
          });
        }
      }
      
      // Erweiterte Mengen-Validierung
      if (item.receivedQuantity < 0) {
        errors.push({
          field: `item_${index}_quantity`,
          message: `Ungültige Menge für ${item.productName}`,
          severity: 'error'
        });
      }
      
      // Neue Validierung: Erhaltene Menge darf bestellte Menge nicht überschreiten
      if (item.receivedQuantity > item.quantity) {
        errors.push({
          field: `item_${index}_quantity`,
          message: `Erhaltene Menge (${item.receivedQuantity}) überschreitet bestellte Menge (${item.quantity}) für ${item.productName}`,
          severity: 'warning'
        });
      }
      
      // Validierung: Integer-only für Stückzahlen
      if (!Number.isInteger(item.receivedQuantity)) {
        errors.push({
          field: `item_${index}_quantity`,
          message: `Menge muss eine ganze Zahl sein für ${item.productName}`,
          severity: 'error'
        });
      }
      
      // Qualitätsstatus-Validierung
      if (item.qualityStatus === 'damaged' && !item.damageDescription) {
        errors.push({
          field: `item_${index}_damage`,
          message: `Schadensbeschreibung erforderlich für ${item.productName}`,
          severity: 'error'
        });
      }
    });
    
    setValidationErrors(errors);
    setCanSubmit(errors.filter(e => e.severity === 'error').length === 0);
  };
  
  // Mutation für Wareneingang
  const receiptMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!order) throw new Error("Keine Bestelldaten vorhanden");
      
      // Sichere Warehouse-Payload-Erstellung ohne Non-Null-Assertion
      const basePayload: any = {
        orderId: order.id,
        deliveryDate,
        notes,
        deliveryNoteNumber,
        deliveryPersonName,
        status: 'processing' as const,
        items: orderItems.map(item => ({
          orderItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          quantityOrdered: item.quantity,
          quantityReceived: item.receivedQuantity,
          qualityStatus: item.qualityStatus,
          warehouseId: item.warehouseId || globalWarehouseId,
          expiryDate: item.mhd,
          batchNumber: item.batchNumber,
          supplierBatchNumber: item.supplierBatchNumber,
          locationInWarehouse: item.locationInWarehouse,
          damageDescription: item.damageDescription,
          notes: item.notes
        })),
        overallQuality: orderItems.every(item => item.qualityStatus === 'good') ? 'good' : 'acceptable',
        requiresFollowUp: orderItems.some(item => item.qualityStatus === 'damaged' || item.qualityStatus === 'rejected')
      };
      
      // Nur warehouseId hinzufügen wenn global warehouse definiert ist
      if (globalWarehouseId) {
        basePayload.warehouseId = globalWarehouseId;
      }
      
      // Zusätzliche Validierung vor API-Call
      const itemsWithoutWarehouse = orderItems.filter(item => !item.warehouseId && !globalWarehouseId);
      if (itemsWithoutWarehouse.length > 0) {
        throw new Error(`Lager fehlt für ${itemsWithoutWarehouse.length} Position(en)`);
      }
      
      return processOrderReceipt(order.id, basePayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
      toast({
        title: "Wareneingang erfasst",
        description: "Der Wareneingang wurde erfolgreich verarbeitet."
      });
      navigate(`/bestellungen/${id}`);
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Speichern",
        description: `${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        variant: "destructive"
      });
    }
  });
  
  // Item-Handler
  const updateItem = (itemId: number, updates: Partial<OrderItem>) => {
    setOrderItems(items => 
      items.map(item => 
        item.id === itemId ? { ...item, ...updates } : item
      )
    );
  };
  
  const openItemEditDialog = (item: OrderItem) => {
    setSelectedItem(item);
    setShowItemEditDialog(true);
  };
  
  const saveItemEdit = () => {
    if (!selectedItem) return;
    
    updateItem(selectedItem.id, selectedItem);
    setShowItemEditDialog(false);
    toast({
      title: "Position aktualisiert",
      description: `${selectedItem.productName} wurde erfolgreich aktualisiert.`
    });
  };
  
  // Bulk Edit Handler
  const openBulkEditDialog = () => {
    if (selectedItems.length === 0) {
      toast({
        title: "Keine Positionen ausgewählt",
        description: "Bitte wählen Sie mindestens eine Position aus.",
        variant: "destructive"
      });
      return;
    }
    setShowBulkEditDialog(true);
  };
  
  const applyBulkEdit = (warehouseId?: number, mhd?: string) => {
    selectedItems.forEach(itemId => {
      const updates: Partial<OrderItem> = {};
      if (warehouseId) updates.warehouseId = warehouseId;
      if (mhd) {
        updates.mhd = mhd;
        updates.batchNumber = generateBatchNumber();
      }
      updateItem(itemId, updates);
    });
    
    setShowBulkEditDialog(false);
    setSelectedItems([]);
    toast({
      title: "Bulk-Update angewendet",
      description: `${selectedItems.length} Positionen wurden aktualisiert.`
    });
  };
  
  // Photo Upload Handler - DISABLED until backend support
  const handlePhotoUpload = async (itemId: number) => {
    toast({
      title: "Foto-Upload nicht verfügbar",
      description: "Die Foto-Upload-Funktion wird in einer zukünftigen Version verfügbar sein.",
      variant: "destructive"
    });
    
    // TODO: Implement real photo upload when backend is ready
    // setIsUploadingPhoto(true);
    // 
    // const fileInput = document.createElement('input');
    // fileInput.type = 'file';
    // fileInput.accept = 'image/*';
    // fileInput.onchange = async (e) => {
    //   const target = e.target as HTMLInputElement;
    //   if (target.files && target.files.length > 0) {
    //     const file = target.files[0];
    //     
    //     try {
    //       // Real implementation: upload to server
    //       const formData = new FormData();
    //       formData.append('photo', file);
    //       formData.append('itemId', itemId.toString());
    //       
    //       const response = await fetch('/api/photos/upload', {
    //         method: 'POST',
    //         body: formData
    //       });
    //       
    //       if (!response.ok) throw new Error('Upload failed');
    //       
    //       const result = await response.json();
    //       
    //       updateItem(itemId, {
    //         photos: [...(orderItems.find(i => i.id === itemId)?.photos || []), result.photoUrl]
    //       });
    //       
    //       toast({
    //         title: "Foto hochgeladen",
    //         description: `Qualitätsfoto für ${orderItems.find(i => i.id === itemId)?.productName} wurde hinzugefügt.`
    //       });
    //     } catch (error) {
    //       toast({
    //         title: "Upload-Fehler",
    //         description: "Das Foto konnte nicht hochgeladen werden.",
    //         variant: "destructive"
    //       });
    //     } finally {
    //       setIsUploadingPhoto(false);
    //     }
    //   }
    // };
    // 
    // fileInput.click();
  };
  
  // Submit Handler
  const handleSubmit = async () => {
    if (!canSubmit) {
      toast({
        title: "Formular unvollständig",
        description: "Bitte beheben Sie alle Validierungsfehler vor dem Speichern.",
        variant: "destructive"
      });
      return;
    }
    
    // Check für MHD-Warnungen
    const criticalMhd = orderItems.filter(item => {
      if (!item.mhd) return false;
      const mhdDate = new Date(item.mhd);
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + 3);
      return isBefore(mhdDate, warningDate);
    });
    
    if (criticalMhd.length > 0 && !showMhdWarningDialog) {
      setShowMhdWarningDialog(true);
      return;
    }
    
    receiptMutation.mutate({});
  };
  
  // Status Badge Helper
  const getQualityBadge = (status: string) => {
    switch (status) {
      case 'good':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100" data-testid={`status-good`}>Gut</Badge>;
      case 'damaged':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100" data-testid={`status-damaged`}>Beschädigt</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100" data-testid={`status-partial`}>Teilweise</Badge>;
      case 'rejected':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100" data-testid={`status-rejected`}>Abgelehnt</Badge>;
      default:
        return <Badge variant="outline">Unbekannt</Badge>;
    }
  };
  
  // Loading state
  if (orderLoading) {
    return (
      <div className="container py-6 flex flex-col items-center justify-center min-h-[50vh]" data-testid="loading-state">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Bestelldetails werden geladen...</p>
      </div>
    );
  }
  
  // Error state
  if (orderError || !order) {
    return (
      <div className="container py-6" data-testid="error-state">
        <Button 
          variant="outline" 
          className="mb-4" 
          onClick={() => navigate(`/bestellungen/${id}`)}
          data-testid="button-back-error"
        >
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
              {orderError instanceof Error ? orderError.message : "Ein unbekannter Fehler ist aufgetreten."}
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
  
  // Calculate summary statistics
  const totalOrdered = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalReceived = orderItems.reduce((sum, item) => sum + item.receivedQuantity, 0);
  const totalValue = orderItems.reduce((sum, item) => sum + (item.receivedQuantity * item.unitPrice), 0);
  const completionPercentage = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  const hasErrors = validationErrors.filter(e => e.severity === 'error').length > 0;
  const hasWarnings = validationErrors.filter(e => e.severity === 'warning').length > 0;
  
  return (
    <div className="container py-6 space-y-6" data-testid="order-receipt-page">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => navigate(`/bestellungen/${id}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="page-title">
              Wareneingang für Bestellung #{order.orderNumber}
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {order.supplierName}
              {order.warehouseName && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <Warehouse className="h-4 w-4" />
                  {order.warehouseName}
                </>
              )}
            </p>
          </div>
        </div>
        
        {/* Status and Progress */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Fortschritt</div>
            <div className="flex items-center gap-2">
              <Progress value={completionPercentage} className="w-20" data-testid="progress-bar" />
              <span className="text-sm font-medium" data-testid="progress-percentage">{completionPercentage}%</span>
            </div>
          </div>
          {hasErrors && (
            <Badge variant="outline" className="bg-red-100 text-red-800" data-testid="badge-errors">
              <AlertCircle className="w-3 h-3 mr-1" />
              {validationErrors.filter(e => e.severity === 'error').length} Fehler
            </Badge>
          )}
          {hasWarnings && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800" data-testid="badge-warnings">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {validationErrors.filter(e => e.severity === 'warning').length} Warnungen
            </Badge>
          )}
        </div>
      </div>
      
      {/* Main Form */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column - Form Controls */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Wareneingang-Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Lieferdatum - MANDATORY */}
            <div className="space-y-2">
              <Label htmlFor="delivery-date" className="text-sm font-medium">
                Lieferdatum *
              </Label>
              <Input
                id="delivery-date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={validationErrors.some(e => e.field === 'deliveryDate' && e.severity === 'error') ? 'border-red-500' : ''}
                required
                data-testid="input-delivery-date"
              />
              {validationErrors.filter(e => e.field === 'deliveryDate').map((error, idx) => (
                <p key={idx} className={`text-xs ${error.severity === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
                  {error.message}
                </p>
              ))}
            </div>
            
            {/* Global Warehouse Selection */}
            <div className="space-y-2">
              <Label htmlFor="global-warehouse" className="text-sm font-medium">
                Globales Ziellager
              </Label>
              <Select 
                value={globalWarehouseId?.toString() || ""} 
                onValueChange={(value) => setGlobalWarehouseId(value ? Number(value) : null)}
              >
                <SelectTrigger data-testid="select-global-warehouse">
                  <SelectValue placeholder="Lager auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse: any) => (
                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Wird für alle Positionen ohne spezifisches Lager verwendet
              </p>
            </div>
            
            {/* Delivery Note Number */}
            <div className="space-y-2">
              <Label htmlFor="delivery-note" className="text-sm font-medium">
                Lieferschein-Nr.
              </Label>
              <Input
                id="delivery-note"
                value={deliveryNoteNumber}
                onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                placeholder="LS-2025-001"
                data-testid="input-delivery-note-number"
              />
            </div>
            
            {/* Delivery Person */}
            <div className="space-y-2">
              <Label htmlFor="delivery-person" className="text-sm font-medium">
                Auslieferer
              </Label>
              <Input
                id="delivery-person"
                value={deliveryPersonName}
                onChange={(e) => setDeliveryPersonName(e.target.value)}
                placeholder="Name des Auslieferers"
                data-testid="input-delivery-person"
              />
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-medium">
                Notizen
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Zusätzliche Bemerkungen zum Wareneingang..."
                rows={3}
                data-testid="textarea-notes"
              />
            </div>
          </CardContent>
        </Card>
        
        {/* Right Column - Items Table */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Artikel erfassen ({orderItems.length} Positionen)
                </CardTitle>
                <CardDescription>
                  Mengen, Qualität, MHD und Lagerorte für jeden Artikel erfassen
                </CardDescription>
              </div>
              
              {/* Bulk Actions */}
              <div className="flex items-center gap-2">
                {selectedItems.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openBulkEditDialog}
                    data-testid="button-bulk-edit"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Bulk-Edit ({selectedItems.length})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedItems.length === orderItems.length && orderItems.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedItems(orderItems.map(item => item.id));
                          } else {
                            setSelectedItems([]);
                          }
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Artikel</TableHead>
                    <TableHead>Bestellt</TableHead>
                    <TableHead>Erhalten</TableHead>
                    <TableHead>MHD</TableHead>
                    <TableHead>Lager</TableHead>
                    <TableHead>Qualität</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((item) => (
                    <TableRow key={item.id} className={selectedItems.includes(item.id) ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedItems([...selectedItems, item.id]);
                            } else {
                              setSelectedItems(selectedItems.filter(id => id !== item.id));
                            }
                          }}
                          data-testid={`checkbox-select-item-${item.id}`}
                        />
                      </TableCell>
                      
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.sku && `SKU: ${item.sku}`}
                          {item.supplierSku && ` | Lief.: ${item.supplierSku}`}
                        </div>
                        {item.notes && (
                          <div className="text-xs italic text-amber-600 mt-1">{item.notes}</div>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {item.quantity} {item.unit}
                        <div className="text-sm text-muted-foreground">
                          à {formatCurrency(item.unitPrice)}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Input
                          type="number"
                          value={item.receivedQuantity}
                          onChange={(e) => updateItem(item.id, { 
                            receivedQuantity: Number(e.target.value) || 0 
                          })}
                          className="w-20"
                          min="0"
                          data-testid={`input-received-quantity-${item.id}`}
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.unit}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        {item.requiresMhd ? (
                          <div className="space-y-1">
                            <Input
                              type="date"
                              value={item.mhd || ''}
                              onChange={(e) => updateItem(item.id, { mhd: e.target.value })}
                              className={`w-36 text-xs ${
                                validationErrors.some(e => e.field === `item_${item.id}_mhd` && e.severity === 'error') 
                                ? 'border-red-500' : ''
                              }`}
                              data-testid={`input-mhd-${item.id}`}
                            />
                            {item.mhd && (
                              <div className="text-xs text-muted-foreground">
                                {formatDate(item.mhd)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs">Nicht erforderlich</Badge>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        <Select 
                          value={item.warehouseId?.toString() || globalWarehouseId?.toString() || ""}
                          onValueChange={(value) => updateItem(item.id, { 
                            warehouseId: value ? Number(value) : undefined 
                          })}
                        >
                          <SelectTrigger className="w-32" data-testid={`select-warehouse-${item.id}`}>
                            <SelectValue placeholder="Lager" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((warehouse: any) => (
                              <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                                {warehouse.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getQualityBadge(item.qualityStatus)}
                          {/* Photo badges hidden until backend support is ready */}
                          {/* {item.photos && item.photos.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Camera className="w-3 h-3 mr-1" />
                              {item.photos.length}
                            </Badge>
                          )} */}
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openItemEditDialog(item)}
                            data-testid={`button-edit-item-${item.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {/* Photo upload button hidden until backend support is ready */}
                          {/* <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePhotoUpload(item.id)}
                            disabled={isUploadingPhoto}
                            data-testid={`button-photo-${item.id}`}
                          >
                            {isUploadingPhoto ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Camera className="h-4 w-4" />
                            )}
                          </Button> */}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Summary Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clipboard className="h-5 w-5" />
            Zusammenfassung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600" data-testid="summary-total-ordered">{totalOrdered}</div>
              <div className="text-sm text-muted-foreground">Bestellt</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600" data-testid="summary-total-received">{totalReceived}</div>
              <div className="text-sm text-muted-foreground">Erhalten</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600" data-testid="summary-total-value">{formatCurrency(totalValue)}</div>
              <div className="text-sm text-muted-foreground">Warenwert</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600" data-testid="summary-completion">{completionPercentage}%</div>
              <div className="text-sm text-muted-foreground">Vollständigkeit</div>
            </div>
          </div>
          
          {/* Validation Messages */}
          {validationErrors.length > 0 && (
            <div className="space-y-2 mb-4">
              {validationErrors.map((error, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center gap-2 text-sm p-2 rounded ${
                    error.severity === 'error' ? 'bg-red-50 text-red-700' :
                    error.severity === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-blue-50 text-blue-700'
                  }`}
                  data-testid={`validation-message-${idx}`}
                >
                  {error.severity === 'error' && <AlertCircle className="h-4 w-4" />}
                  {error.severity === 'warning' && <AlertTriangle className="h-4 w-4" />}
                  {error.severity === 'info' && <FileText className="h-4 w-4" />}
                  {error.message}
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Letztes Update: {formatDateTime(new Date().toISOString())}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => navigate(`/bestellungen/${id}`)}
                data-testid="button-cancel"
              >
                <X className="mr-2 h-4 w-4" />
                Abbrechen
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!canSubmit || receiptMutation.isPending || !deliveryDate}
                className="min-w-[120px]"
                data-testid="button-submit"
              >
                {receiptMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichere...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Wareneingang erfassen
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Item Edit Dialog */}
      <Dialog open={showItemEditDialog} onOpenChange={setShowItemEditDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-item-edit">
          <DialogHeader>
            <DialogTitle>
              Position bearbeiten: {selectedItem?.productName}
            </DialogTitle>
            <DialogDescription>
              Detaillierte Angaben für diese Position anpassen
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Erhaltene Menge</Label>
                <Input
                  type="number"
                  value={selectedItem.receivedQuantity}
                  onChange={(e) => setSelectedItem({
                    ...selectedItem,
                    receivedQuantity: Number(e.target.value) || 0
                  })}
                  min="0"
                  data-testid="input-edit-received-quantity"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Qualitätsstatus</Label>
                <Select
                  value={selectedItem.qualityStatus}
                  onValueChange={(value: any) => setSelectedItem({
                    ...selectedItem,
                    qualityStatus: value
                  })}
                >
                  <SelectTrigger data-testid="select-edit-quality-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Gut</SelectItem>
                    <SelectItem value="damaged">Beschädigt</SelectItem>
                    <SelectItem value="partial">Teilweise</SelectItem>
                    <SelectItem value="rejected">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {selectedItem.requiresMhd && (
                <div className="space-y-2">
                  <Label>Mindesthaltbarkeitsdatum</Label>
                  <Input
                    type="date"
                    value={selectedItem.mhd || ''}
                    onChange={(e) => setSelectedItem({
                      ...selectedItem,
                      mhd: e.target.value
                    })}
                    data-testid="input-edit-mhd"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Chargennummer</Label>
                <Input
                  value={selectedItem.batchNumber || ''}
                  onChange={(e) => setSelectedItem({
                    ...selectedItem,
                    batchNumber: e.target.value
                  })}
                  placeholder="Automatisch generiert"
                  data-testid="input-edit-batch-number"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Lagerplatz</Label>
                <Input
                  value={selectedItem.locationInWarehouse || ''}
                  onChange={(e) => setSelectedItem({
                    ...selectedItem,
                    locationInWarehouse: e.target.value
                  })}
                  placeholder="z.B. Regal A1, Fach 3"
                  data-testid="input-edit-location"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Lieferanten-Charge</Label>
                <Input
                  value={selectedItem.supplierBatchNumber || ''}
                  onChange={(e) => setSelectedItem({
                    ...selectedItem,
                    supplierBatchNumber: e.target.value
                  })}
                  placeholder="Charge des Lieferanten"
                  data-testid="input-edit-supplier-batch"
                />
              </div>
              
              {selectedItem.qualityStatus === 'damaged' && (
                <div className="col-span-2 space-y-2">
                  <Label>Schadensbeschreibung</Label>
                  <Textarea
                    value={selectedItem.damageDescription || ''}
                    onChange={(e) => setSelectedItem({
                      ...selectedItem,
                      damageDescription: e.target.value
                    })}
                    placeholder="Detaillierte Beschreibung des Schadens..."
                    rows={3}
                    data-testid="textarea-edit-damage-description"
                  />
                </div>
              )}
              
              <div className="col-span-2 space-y-2">
                <Label>Notizen</Label>
                <Textarea
                  value={selectedItem.notes || ''}
                  onChange={(e) => setSelectedItem({
                    ...selectedItem,
                    notes: e.target.value
                  })}
                  placeholder="Zusätzliche Notizen zu dieser Position..."
                  rows={2}
                  data-testid="textarea-edit-notes"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemEditDialog(false)} data-testid="button-cancel-edit">
              Abbrechen
            </Button>
            <Button onClick={saveItemEdit} data-testid="button-save-edit">
              <Save className="mr-2 h-4 w-4" />
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Bulk Edit Dialog */}
      <Dialog open={showBulkEditDialog} onOpenChange={setShowBulkEditDialog}>
        <DialogContent data-testid="dialog-bulk-edit">
          <DialogHeader>
            <DialogTitle>
              Bulk-Bearbeitung ({selectedItems.length} Positionen)
            </DialogTitle>
            <DialogDescription>
              Änderungen auf mehrere Positionen gleichzeitig anwenden
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lager für alle ausgewählten Positionen</Label>
              <Select onValueChange={(value) => applyBulkEdit(Number(value))}>
                <SelectTrigger data-testid="select-bulk-warehouse">
                  <SelectValue placeholder="Lager auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse: any) => (
                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>MHD für alle ausgewählten Positionen</Label>
              <Input
                type="date"
                onChange={(e) => applyBulkEdit(undefined, e.target.value)}
                data-testid="input-bulk-mhd"
              />
              <p className="text-xs text-muted-foreground">
                Nur für MHD-pflichtige Produkte relevant
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkEditDialog(false)}>
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* MHD Warning Dialog */}
      <AlertDialog open={showMhdWarningDialog} onOpenChange={setShowMhdWarningDialog}>
        <AlertDialogContent data-testid="dialog-mhd-warning">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              MHD-Warnung
            </AlertDialogTitle>
            <AlertDialogDescription>
              Einige Artikel haben kritische Mindesthaltbarkeitsdaten:
              <ul className="mt-2 space-y-1">
                {orderItems
                  .filter(item => {
                    if (!item.mhd) return false;
                    const mhdDate = new Date(item.mhd);
                    const warningDate = new Date();
                    warningDate.setDate(warningDate.getDate() + 3);
                    return isBefore(mhdDate, warningDate);
                  })
                  .map(item => (
                    <li key={item.id} className="text-sm">
                      <strong>{item.productName}</strong>: MHD {formatDate(item.mhd!)}
                    </li>
                  ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMhdWarningDialog(false);
                receiptMutation.mutate({});
              }}
              data-testid="button-confirm-mhd-warning"
            >
              Trotzdem fortfahren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}