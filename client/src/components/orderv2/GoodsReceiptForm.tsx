import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, addDays, subDays, isAfter, isBefore } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { 
  CheckSquare, 
  AlertTriangle, 
  Package, 
  CalendarCheck, 
  Loader2,
  Save,
  Mail,
  Camera,
  X,
  Plus,
  Minus,
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  Eye,
  CalendarIcon,
  Warehouse,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  RefreshCw,
  Info
} from 'lucide-react';

import {
  getPackageTypeName,
  calculatePackageInfo,
  formatPackageDisplayFromString,
  formatPackageDisplay,
  formatTotalQuantity,
  calculateDualFieldTotal,
  splitTotalToPackageFields,
  getPackageSizeFromPurchaseConditions,
  formatPackageInfoFromPurchaseConditions
} from '../../../../shared/package-utils';
import type { PurchaseCondition } from '../../../../shared/schema';

import { goodsReceiptDataSchema, insertGoodsReceiptDataSchema, type GoodsReceiptData, type InsertGoodsReceiptData } from '../../../../shared/schema';

// Enhanced type for package-focused component with legacy compatibility
type EnhancedPackageGoodsReceiptFormValues = InsertGoodsReceiptData & {
  // Additional fields for package management
  receiptNote?: string;
  documents?: File[];
};

// Create form schema that combines shared schema with package-specific extensions
const enhancedPackageGoodsReceiptSchema = insertGoodsReceiptDataSchema.extend({
  receiptNote: z.string().optional(),
  documents: z.array(z.any()).optional(),
});

interface OrderItem {
  id: number;
  name?: string;
  productName?: string; // API kann auch productName statt name zurückgeben
  orderedQuantity: number;
  receivedQuantity?: number;
  price?: number;
  unitPrice?: number; // API kann auch unitPrice statt price zurückgeben
  damaged?: boolean;
  comment?: string;
  expiryDate?: string; // MHD für die Batch-Erstellung
  packageSize?: string; // Gebindegröße aus der Datenbank
  productId?: number; // Product ID für Package-Info
  // Package-spezifische Felder
  receivedPackageCount?: number; // Anzahl erhaltener Gebinde
  receivedTotalQuantity?: number; // Gesamtanzahl Einzelstücke
  // Enhanced fields
  qualityStatus?: 'good' | 'damaged' | 'partial' | 'rejected';
  damageDescription?: string;
  warehouseId?: number;
}

interface GoodsReceiptFormProps {
  order: any; // Make the type more flexible to accommodate different API structures
  orderId?: number; // Enhanced: explicit order ID
  onSubmit?: (receivedItems: OrderItem[], receiptNote: string, documents: File[]) => void;
  onSaveComplete?: (receivedItems: OrderItem[]) => void;
  isSubmitting: boolean;
  // Enhanced props
  enableEnhancedFeatures?: boolean; // Toggle für erweiterte Features
  defaultWarehouseId?: number; // Standard-Lager
}

const GoodsReceiptForm: React.FC<GoodsReceiptFormProps> = ({
  order,
  orderId,
  onSubmit,
  onSaveComplete,
  isSubmitting,
  enableEnhancedFeatures = true,
  defaultWarehouseId
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  // Defensive programming to handle potentially undefined or malformed order data
  if (!order) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Bestelldaten verfügbar</h3>
            <p className="text-muted-foreground mb-4">
              Die Bestelldaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
            </p>
            <Button onClick={() => window.location.reload()}>Neu laden</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Sicherstellen, dass wir die richtigen Bestellungsposten haben (entweder items oder orderItems)
  // API gibt tatsächlich orderItems zurück, nicht items
  const orderItems = (order.orderItems && Array.isArray(order.orderItems)) ? 
                    order.orderItems : 
                    (order.items && Array.isArray(order.items)) ? 
                    order.items : [];

  console.log('[Enhanced GoodsReceiptForm] Order data:', order);
  console.log('[Enhanced GoodsReceiptForm] OrderItems found:', orderItems);
  
  // If no items found, show error state
  if (orderItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Bestellpositionen verfügbar</h3>
            <p className="text-muted-foreground mb-4">
              Die Bestellpositionen konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
            </p>
            <Button onClick={() => window.location.reload()}>Neu laden</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Enhanced: Laden der verfügbaren Lager für diese Bestellung
  const effectiveOrderId = orderId || order.id || order.orderId;
  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery({
    queryKey: [`/api/goods-receipt/${effectiveOrderId}/warehouses`],
    enabled: enableEnhancedFeatures && !!effectiveOrderId,
    staleTime: 60 * 1000, // 1 minute
  });
  
  // Purchase Conditions für alle Produkte laden
  const productIds: number[] = Array.from(new Set(orderItems.map((item: any) => item.product_id || item.productId).filter(Boolean))) as number[];
  
  const { data: purchaseConditionsData = {} } = useQuery<Record<number, any[]>>({
    queryKey: [`/api/products/purchase-conditions-batch`, productIds],
    queryFn: async () => {
      console.log('[Enhanced GoodsReceiptForm] Lade Purchase Conditions für Products:', productIds);
      const conditions: Record<number, PurchaseCondition[]> = {};
      
      const promises = productIds.map(async (productId) => {
        try {
          const response = await fetch(`/api/products/${productId}/purchase-conditions`);
          if (response.ok) {
            const data = await response.json();
            conditions[productId] = data;
          } else {
            console.warn(`Purchase conditions nicht verfügbar für Produkt ${productId}`);
            conditions[productId] = [];
          }
        } catch (error) {
          console.warn(`Fehler beim Laden der Einkaufsbedingungen für Produkt ${productId}:`, error);
          conditions[productId] = [];
        }
      });
      
      await Promise.all(promises);
      return conditions;
    },
    staleTime: 60 * 1000,
    enabled: productIds.length > 0
  });

  // Lokale Hilfsfunktionen - verwenden geladene purchase_conditions
  const getProductPackageQuantity = (productId: number): number => {
    if (!productId) return 1;
    const conditions = purchaseConditionsData[productId] || [];
    return getPackageSizeFromPurchaseConditions(conditions as any[]);
  };

  const getProductPackageType = (productId: number): string => {
    if (!productId) return "Einzelartikel";
    const conditions = purchaseConditionsData[productId] || [];
    return formatPackageInfoFromPurchaseConditions(conditions as any[]);
  };

  // Safe Date Utility Functions
  const normalizeDate = (date: Date | string | null | undefined): Date | null => {
    if (!date) return null;
    return date instanceof Date ? date : new Date(date);
  };
  
  const ensureDateString = (date: Date | string | null | undefined): string => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    return format(date, 'yyyy-MM-dd');
  };

  // Enhanced: Intelligente MHD-Defaults basierend auf Produkttypen
  const calculateIntelligentExpiryDate = (productName: string): Date => {
    const now = new Date();
    let daysToAdd = 30; // Standard: 30 Tage

    const lowerName = productName.toLowerCase();
    
    // Produktspezifische MHD-Berechnung (Enhanced Algorithm)
    if (lowerName.includes('milch') || lowerName.includes('joghurt') || lowerName.includes('molkerei')) {
      daysToAdd = 7; // Milchprodukte: 1 Woche
    } else if (lowerName.includes('brot') || lowerName.includes('gebäck') || lowerName.includes('backware')) {
      daysToAdd = 3; // Backwaren: 3 Tage  
    } else if (lowerName.includes('obst') || lowerName.includes('gemüse') || lowerName.includes('frisch')) {
      daysToAdd = 5; // Frische Produkte: 5 Tage
    } else if (lowerName.includes('fleisch') || lowerName.includes('wurst') || lowerName.includes('schinken')) {
      daysToAdd = 7; // Fleischprodukte: 1 Woche
    } else if (lowerName.includes('käse') || lowerName.includes('cheese')) {
      daysToAdd = 21; // Käse: 3 Wochen
    } else if (lowerName.includes('konserve') || lowerName.includes('dose') || lowerName.includes('haltbar')) {
      daysToAdd = 365; // Konserven: 1 Jahr
    } else if (lowerName.includes('tiefkühl') || lowerName.includes('gefroren')) {
      daysToAdd = 90; // Tiefkühlprodukte: 3 Monate
    } else if (lowerName.includes('getränk') || lowerName.includes('saft') || lowerName.includes('wasser')) {
      daysToAdd = 180; // Getränke: 6 Monate
    }

    return addDays(now, daysToAdd);
  };

  // Enhanced: Quality Status Helper
  const getQualityStatusBadge = (status: string, damaged?: boolean) => {
    // Legacy compatibility
    if (damaged && !status) {
      status = 'damaged';
    }
    
    switch (status) {
      case 'good':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700" data-testid="badge-quality-good">
            <ShieldCheck className="h-3 w-3 mr-1" /> Gut
          </Badge>
        );
      case 'damaged':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700" data-testid="badge-quality-damaged">
            <ShieldAlert className="h-3 w-3 mr-1" /> Beschädigt
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700" data-testid="badge-quality-partial">
            <Shield className="h-3 w-3 mr-1" /> Teilweise
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700" data-testid="badge-quality-rejected">
            <ShieldX className="h-3 w-3 mr-1" /> Abgelehnt
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" data-testid="badge-quality-unknown">
            <Shield className="h-3 w-3 mr-1" /> Unbekannt
          </Badge>
        );
    }
  };

  // Function to compute default values deterministically for package component
  const computePackageDefaultValues = (): EnhancedPackageGoodsReceiptFormValues => {
    // Deterministic warehouse selection: prefer defaultWarehouseId, then first loaded warehouse, then fallback
    const selectedWarehouseId = defaultWarehouseId || 
                                (warehouses.length > 0 ? warehouses[0].id : null) || 
                                (order?.warehouseId) || 
                                1;
    
    return {
      deliveryDate: new Date(), // Return Date object
      warehouseId: selectedWarehouseId,
      orderId: effectiveOrderId || 0,
      deliveryNoteNumber: '',
      notes: '',
      receiptNote: '',
      items: orderItems.map((item: any) => {
        const orderedQuantity = item.orderQuantity || item.orderedQuantity || item.quantity || 0;
        const productName = item.name || item.product_name || item.productName || 'Artikel ohne Namen';
        
        return {
          orderItemId: item.id || item.orderItemId,
          productId: item.product_id || item.productId,
          productName: productName,
          quantityOrdered: orderedQuantity,
          quantityReceived: orderedQuantity,
          unit: item.unit || 'Stk.',
          qualityStatus: 'good' as const,
          damageDescription: '',
          batchNumber: '',
          supplierBatchNumber: '',
          expiryDate: enableEnhancedFeatures ? calculateIntelligentExpiryDate(productName) : new Date(), // Return Date object
          warehouseId: undefined,
          locationInWarehouse: '',
          notes: '',
        };
      }),
      documents: [],
    };
  };
  
  // Legacy state for compatibility with existing UI logic
  const [receivedItems, setReceivedItems] = useState<OrderItem[]>(
    orderItems.map((item: any) => {
      const orderedQuantity = item.orderQuantity || item.orderedQuantity || item.quantity || 0;
      const productName = item.name || item.product_name || item.productName || 'Artikel ohne Namen';
      
      return {
        ...item,
        // Wichtig: orderItemId für die API-Übertragung (aus der Datenbank-ID)
        id: item.id || item.orderItemId || item.productId,
        orderItemId: item.id || item.orderItemId,
        productId: item.product_id || item.productId,
        // Stellen sicher, dass der Name vorhanden ist (entweder name oder productName)
        name: productName,
        productName: productName,
        // Bestellte Menge
        orderedQuantity,
        receivedQuantity: orderedQuantity, // Standardmäßig die volle bestellte Menge
        price: item.price || item.unit_price || item.unitPrice || 0,
        unitPrice: item.price || item.unit_price || item.unitPrice || 0,
        unit: item.unit || 'Stk.',
        damaged: false,
        comment: '',
        // Enhanced: Quality Status
        qualityStatus: 'good' as const,
        damageDescription: '',
        // Enhanced: Intelligentes MHD - return Date object instead of string for consistency
        expiryDate: enableEnhancedFeatures ? format(calculateIntelligentExpiryDate(productName), 'yyyy-MM-dd') : '', 
        // Package-spezifische Initialisierung - erhaltene Menge entspricht zunächst der bestellten
        receivedPackageCount: orderedQuantity > 0 ? splitTotalToPackageFields(orderedQuantity, getProductPackageQuantity(item.product_id || item.productId)).packageCount : 0,
        receivedTotalQuantity: orderedQuantity,
        // Enhanced: Warehouse override
        warehouseId: undefined, // Uses global selection by default
      };
    })
  );
  
  const [receiptNote, setReceiptNote] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // Enhanced: Form with shared schema validation
  const form = useForm<EnhancedPackageGoodsReceiptFormValues>({
    resolver: zodResolver(enhancedPackageGoodsReceiptSchema),
    defaultValues: computePackageDefaultValues(),
  });
  
  // Fix Form State Synchronization Bug: Reset form when async data loads
  useEffect(() => {
    const newDefaults = computePackageDefaultValues();
    console.log('[Package GoodsReceiptForm] Resetting form with new defaults:', newDefaults);
    form.reset(newDefaults);
  }, [orderItems, warehouses, defaultWarehouseId, order, effectiveOrderId]);
  
  // Sync receivedItems state with form when orderItems change
  useEffect(() => {
    if (orderItems.length > 0) {
      const newItems = orderItems.map((item: any) => {
        const orderedQuantity = item.orderQuantity || item.orderedQuantity || item.quantity || 0;
        const productName = item.name || item.product_name || item.productName || 'Artikel ohne Namen';
        
        return {
          ...item,
          id: item.id || item.orderItemId || item.productId,
          orderItemId: item.id || item.orderItemId,
          productId: item.product_id || item.productId,
          name: productName,
          productName: productName,
          orderedQuantity,
          receivedQuantity: orderedQuantity,
          price: item.price || item.unit_price || item.unitPrice || 0,
          unitPrice: item.price || item.unit_price || item.unitPrice || 0,
          unit: item.unit || 'Stk.',
          damaged: false,
          comment: '',
          qualityStatus: 'good' as const,
          damageDescription: '',
          expiryDate: enableEnhancedFeatures ? format(calculateIntelligentExpiryDate(productName), 'yyyy-MM-dd') : '',
          receivedPackageCount: orderedQuantity > 0 ? splitTotalToPackageFields(orderedQuantity, getProductPackageQuantity(item.product_id || item.productId)).packageCount : 0,
          receivedTotalQuantity: orderedQuantity,
          warehouseId: undefined,
        };
      });
      setReceivedItems(newItems);
    }
  }, [orderItems, enableEnhancedFeatures]);

  // Calculate total received vs ordered
  const totalOrdered = orderItems.reduce((sum: number, item: any) => sum + (item.orderedQuantity || item.orderQuantity || item.quantity || 0), 0);
  const totalReceived = receivedItems.reduce((sum: number, item) => sum + (item.receivedQuantity || 0), 0);
  const isComplete = totalReceived === totalOrdered && receivedItems.every(item => item.qualityStatus !== 'rejected');
  const hasDiscrepancies = receivedItems.some(item => 
    item.receivedQuantity !== item.orderedQuantity || item.damaged || item.qualityStatus !== 'good'
  );
  
  // Enhanced: Real-time Validation (now properly integrated)
  const validateFormData = async () => {
    if (!enableEnhancedFeatures || !effectiveOrderId) return;
    
    setIsValidating(true);
    try {
      const formData = form.getValues();
      const response = await apiRequest(`/api/goods-receipt/${effectiveOrderId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: effectiveOrderId,
          deliveryDate: ensureDateString(formData.deliveryDate),
          warehouseId: formData.warehouseId,
          items: formData.items.map(item => ({
            orderItemId: item.orderItemId,
            productId: item.productId,
            productName: item.productName,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: item.quantityReceived,
            qualityStatus: item.qualityStatus,
            expiryDate: ensureDateString(item.expiryDate),
            batchNumber: item.batchNumber,
            supplierBatchNumber: item.supplierBatchNumber,
            warehouseId: item.warehouseId,
            locationInWarehouse: item.locationInWarehouse,
            damageDescription: item.damageDescription,
            notes: item.notes,
          })),
          notes: formData.notes,
          deliveryNoteNumber: formData.deliveryNoteNumber,
        })
      });

      const result = await response.json();
      setValidationErrors(result.errors || []);
      setValidationWarnings(result.warnings || []);
      
      if (result.errors?.length > 0) {
        toast({
          title: "Validierungsfehler",
          description: `${result.errors.length} Fehler gefunden`,
          variant: "destructive"
        });
      }
      
      if (result.warnings?.length > 0) {
        toast({
          title: "Validierungswarnungen",
          description: `${result.warnings.length} Warnungen gefunden`,
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Validierungsfehler:', error);
      setValidationErrors(['Validierung fehlgeschlagen: ' + (error as Error).message]);
      toast({
        title: "Validierungsfehler",
        description: "Validierung fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };
  
  // Trigger validation on form changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (enableEnhancedFeatures && effectiveOrderId) {
        validateFormData();
      }
    }, 1000); // 1 second debounce
    
    return () => clearTimeout(timer);
  }, [form.watch(), effectiveOrderId, enableEnhancedFeatures]);

  // Handle input change (Enhanced with quality status sync)
  const handleQuantityChange = (id: number, receivedQuantity: number) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, receivedQuantity } : item
      )
    );
    
    // Update form
    const updatedItems = form.getValues('items').map(item => 
      item.id === id ? { ...item, receivedQuantity } : item
    );
    form.setValue('items', updatedItems);
  };
  
  // Enhanced: Handle quality status change (replaces damaged state)
  const handleQualityStatusChange = (id: number, qualityStatus: 'good' | 'damaged' | 'partial' | 'rejected') => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { 
          ...item, 
          qualityStatus,
          damaged: qualityStatus === 'damaged' || qualityStatus === 'rejected' // Legacy compatibility
        } : item
      )
    );
    
    // Update form
    const updatedItems = form.getValues('items').map(item => 
      item.id === id ? { ...item, qualityStatus } : item
    );
    form.setValue('items', updatedItems);
  };

  // Handle damaged state change (Legacy compatibility)
  const handleDamagedChange = (id: number, damaged: boolean) => {
    const qualityStatus = damaged ? 'damaged' : 'good';
    handleQualityStatusChange(id, qualityStatus);
  };

  // Enhanced: Handle damage description change
  const handleDamageDescriptionChange = (id: number, damageDescription: string) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, damageDescription } : item
      )
    );
    
    // Update form
    const updatedItems = form.getValues('items').map(item => 
      item.id === id ? { ...item, damageDescription } : item
    );
    form.setValue('items', updatedItems);
  };
  
  // Handle comment change
  const handleCommentChange = (id: number, comment: string) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, comment } : item
      )
    );
  };
  
  // Handler für MHD-Änderung (Enhanced with validation)
  const handleExpiryDateChange = (id: number, expiryDate: string) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, expiryDate } : item
      )
    );
    
    // Enhanced MHD validation feedback
    if (expiryDate && isBefore(new Date(expiryDate), new Date())) {
      toast({
        title: "Achtung: Abgelaufenes Produkt",
        description: "Das MHD liegt in der Vergangenheit. Abgelaufene Produkte dürfen nicht ins Lager aufgenommen werden.",
        variant: "destructive"
      });
    } else if (expiryDate && isBefore(new Date(expiryDate), addDays(new Date(), 7))) {
      toast({
        title: "Kurzes MHD",
        description: "Das Produkt läuft in weniger als 7 Tagen ab.",
        variant: "default"
      });
    }
  };
  
  // Handler: Anzahl Gebinde ändern (automatisch Gesamtanzahl berechnen)
  const handleReceivedPackageCountChange = (itemId: number, value: string) => {
    const packageCount = Math.max(0, parseInt(value) || 0);
    const item = receivedItems.find(i => i.id === itemId);
    if (!item) return;
    
    // Parse package size to get package quantity
    const packageQuantity = getProductPackageQuantity(item.productId || 0);
    const individualCount = item.receivedTotalQuantity ? 
      splitTotalToPackageFields(item.receivedTotalQuantity, packageQuantity).individualCount : 0;
    const totalQuantity = calculateDualFieldTotal(packageCount, individualCount, packageQuantity);
    
    // Update receivedItems
    setReceivedItems(items =>
      items.map(item =>
        item.id === itemId ? { 
          ...item, 
          receivedQuantity: totalQuantity,
          receivedPackageCount: packageCount,
          receivedTotalQuantity: totalQuantity
        } : item
      )
    );
    
    // Update form
    const updatedItems = form.getValues('items').map(item => 
      item.id === itemId ? { 
        ...item, 
        receivedQuantity: totalQuantity,
        receivedPackageCount: packageCount,
        receivedTotalQuantity: totalQuantity
      } : item
    );
    form.setValue('items', updatedItems);
  };
  
  // Handler: Gesamtanzahl ändern (automatisch Gebinde-Anzahl berechnen)
  const handleReceivedTotalQuantityChange = (itemId: number, value: string) => {
    const totalQuantity = Math.max(0, parseInt(value) || 0);
    const item = receivedItems.find(i => i.id === itemId);
    if (!item) return;
    
    // Parse package size to get package quantity
    const packageQuantity = getProductPackageQuantity(item.productId || 0);
    const { packageCount, individualCount } = splitTotalToPackageFields(totalQuantity, packageQuantity);
    
    // Update receivedItems
    setReceivedItems(items =>
      items.map(item =>
        item.id === itemId ? { 
          ...item, 
          receivedQuantity: totalQuantity,
          receivedPackageCount: packageCount,
          receivedTotalQuantity: totalQuantity
        } : item
      )
    );
    
    // Update form
    const updatedItems = form.getValues('items').map(item => 
      item.id === itemId ? { 
        ...item, 
        receivedQuantity: totalQuantity,
        receivedPackageCount: packageCount,
        receivedTotalQuantity: totalQuantity
      } : item
    );
    form.setValue('items', updatedItems);
  };
  
  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [previewUrls]);

  // Enhanced: Real-time validation trigger
  useEffect(() => {
    if (!enableEnhancedFeatures) return;
    
    const subscription = form.watch(async (value) => {
      // Debounce validation
      const timeoutId = setTimeout(() => {
        if (value.deliveryDate && value.warehouseId && value.items?.length > 0) {
          validateFormData();
        }
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    });
    
    return () => subscription.unsubscribe();
  }, [form, enableEnhancedFeatures, effectiveOrderId]);

  // File validation function
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    
    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Nur PDF, JPEG und PNG Dateien sind erlaubt' };
    }
    
    if (file.size > maxSize) {
      return { valid: false, error: 'Datei ist zu groß (max. 10MB)' };
    }
    
    return { valid: true };
  };

  // Handle document upload with validation
  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const validFiles: File[] = [];
      
      newFiles.forEach(file => {
        const validation = validateFile(file);
        if (validation.valid) {
          validFiles.push(file);
          
          // Create preview URL for images
          if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrls(prev => ({ ...prev, [file.name]: url }));
          }
        } else {
          toast({
            title: "Datei-Fehler",
            description: `Fehler bei Datei "${file.name}": ${validation.error}`,
            variant: "destructive"
          });
        }
      });
      
      if (validFiles.length > 0) {
        setDocuments(prev => [...prev, ...validFiles]);
        
        // Update form
        form.setValue('documents', [...documents, ...validFiles]);
      }
    }
    
    // Reset input
    e.target.value = '';
  };

  // Handle drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    const validFiles: File[] = [];
    
    files.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
        
        // Create preview URL for images
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          setPreviewUrls(prev => ({ ...prev, [file.name]: url }));
        }
      } else {
        toast({
          title: "Datei-Fehler",
          description: `Fehler bei Datei "${file.name}": ${validation.error}`,
          variant: "destructive"
        });
      }
    });
    
    if (validFiles.length > 0) {
      setDocuments(prev => [...prev, ...validFiles]);
      form.setValue('documents', [...documents, ...validFiles]);
    }
  };

  // Mobile camera capture
  const handleCameraCapture = () => {
    const input = document.getElementById('camera-capture') as HTMLInputElement;
    if (input) {
      input.click();
    }
  };
  
  // Remove document
  const removeDocument = (index: number) => {
    const newDocuments = documents.filter((_, i) => i !== index);
    setDocuments(newDocuments);
    form.setValue('documents', newDocuments);
  };
  
  // Enhanced: Handle submit with validation
  const handleSubmit = () => {
    console.log('[Enhanced GoodsReceiptForm] Submitting received items:', receivedItems);
    
    // Enhanced validation
    const hasReceivedItems = receivedItems.some(item => item.receivedQuantity > 0);
    
    if (!hasReceivedItems) {
      toast({
        title: "Fehler",
        description: "Mindestens ein Artikel muss eine Eingangsmenge größer als 0 haben",
        variant: "destructive"
      });
      return;
    }

    // Enhanced MHD validation
    const expiredItems = receivedItems.filter(item => 
      item.receivedQuantity > 0 && 
      item.expiryDate && 
      isBefore(new Date(item.expiryDate), new Date())
    );

    if (expiredItems.length > 0) {
      toast({
        title: "Fehler: Abgelaufene Produkte",
        description: `${expiredItems.length} Artikel haben ein MHD in der Vergangenheit.`,
        variant: "destructive"
      });
      return;
    }

    // Enhanced Quality Control Validation
    const damagedItemsWithoutDescription = receivedItems.filter(item => 
      item.receivedQuantity > 0 && 
      (item.qualityStatus === 'damaged' || item.qualityStatus === 'rejected' || item.damaged) && 
      !item.damageDescription?.trim()
    );

    if (damagedItemsWithoutDescription.length > 0) {
      toast({
        title: "Fehler",
        description: "Beschädigte oder abgelehnte Artikel benötigen eine Schadensbeschreibung.",
        variant: "destructive"
      });
      return;
    }

    // Enhanced data for API submission
    if (enableEnhancedFeatures && onSubmit) {
      const enhancedData = receivedItems.map(item => ({
        ...item,
        // Convert quality status for compatibility
        damaged: item.qualityStatus === 'damaged' || item.qualityStatus === 'rejected',
        qualityCheck: item.qualityStatus === 'good',
        qualityIssue: item.qualityStatus !== 'good' ? item.damageDescription : '',
      }));
      
      onSubmit(enhancedData, receiptNote, documents);
    } else if (onSubmit) {
      onSubmit(receivedItems, receiptNote, documents);
    }
    
    if (onSaveComplete) {
      onSaveComplete(receivedItems);
    }
  };
  
  return (
    <Form {...form}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Wareneingang erfassen</CardTitle>
              <CardDescription>
                Erfassen Sie den Wareneingang für Bestellung {order.orderNumber}.
              </CardDescription>
            </div>
            {enableEnhancedFeatures && (
              <div className="flex items-center gap-2">
                {isValidating && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Validiere...
                  </div>
                )}
                <Badge variant="secondary" data-testid="badge-enhanced-mode">
                  <Shield className="h-3 w-3 mr-1" />
                  Erweiterte Features
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Enhanced: Validation Feedback */}
          {enableEnhancedFeatures && (validationErrors.length > 0 || validationWarnings.length > 0) && (
            <div className="space-y-2">
              {validationErrors.length > 0 && (
                <Alert variant="destructive" data-testid="alert-validation-errors">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Validierungsfehler:</strong>
                    <ul className="list-disc ml-4 mt-1">
                      {validationErrors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              
              {validationWarnings.length > 0 && (
                <Alert data-testid="alert-validation-warnings">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Hinweise:</strong>
                    <ul className="list-disc ml-4 mt-1">
                      {validationWarnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Enhanced: Delivery Date and Warehouse Selection */}
          {enableEnhancedFeatures && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
              <FormField
                control={form.control}
                name="deliveryDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="required">Lieferdatum *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full pl-3 text-left font-normal"
                            data-testid="button-delivery-date"
                          >
                            {field.value ? (
                              format(normalizeDate(field.value) || new Date(), 'PPP', { locale: de })
                            ) : (
                              <span className="text-muted-foreground">Lieferdatum wählen</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            
                            // Enhanced validation feedback
                            if (date && isAfter(date, new Date())) {
                              toast({
                                title: "Ungültiges Datum",
                                description: "Lieferdatum darf nicht in der Zukunft liegen.",
                                variant: "destructive"
                              });
                            } else if (date && isBefore(date, subDays(new Date(), 30))) {
                              toast({
                                title: "Altes Lieferdatum",
                                description: "Das Lieferdatum liegt mehr als 30 Tage zurück.",
                                variant: "default"
                              });
                            }
                          }}
                          disabled={(date) => date > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="required">Lager *</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      value={field.value?.toString()}
                      disabled={isLoadingWarehouses}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-warehouse">
                          <SelectValue placeholder="Lager auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(warehouses) && warehouses.map((warehouse: any) => (
                          <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                            <div className="flex items-center">
                              <Warehouse className="h-4 w-4 mr-2" />
                              {warehouse.name || `Lager ${warehouse.id}`}
                              {warehouse.location && (
                                <span className="text-sm text-muted-foreground ml-2">
                                  ({warehouse.location})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                        {/* Fallback for legacy warehouses */}
                        {(!Array.isArray(warehouses) || warehouses.length === 0) && order.warehouseName && (
                          <SelectItem value={order.warehouseId?.toString() || "1"}>
                            <div className="flex items-center">
                              <Warehouse className="h-4 w-4 mr-2" />
                              {order.warehouseName}
                            </div>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Order info summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="text-muted-foreground">Bestellnummer:</div>
              <div className="font-medium">{order.orderNumber}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">Bestelldatum:</div>
              <div className="font-medium">
                {order.orderDate && !isNaN(new Date(order.orderDate).getTime()) 
                  ? format(new Date(order.orderDate), 'PPP', { locale: de })
                  : order.created_at && !isNaN(new Date(order.created_at).getTime())
                  ? format(new Date(order.created_at), 'PPP', { locale: de })
                  : 'Datum nicht verfügbar'
                }
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">Lager:</div>
              <div className="font-medium">{order.warehouseName}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">Lieferant:</div>
              <div className="font-medium">{order.supplierName}</div>
            </div>
          </div>
          
          {/* Status indicators */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={isComplete ? "default" : "outline"} className="flex items-center gap-1">
              {isComplete ? <CheckSquare className="h-3 w-3" /> : null}
              {isComplete ? "Vollständig" : "Unvollständig"}
            </Badge>
            
            {hasDiscrepancies && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Abweichungen
              </Badge>
            )}
            
            <Badge variant="outline" className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {totalReceived} von {totalOrdered} Artikeln
            </Badge>
            
            <Badge variant="outline" className="flex items-center gap-1">
              <CalendarCheck className="h-3 w-3" />
              Eingang: {format(new Date(), 'PPP', { locale: de })}
            </Badge>
          </div>
          
          {/* Receipt note */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Anmerkungen zum Wareneingang</label>
            <Textarea 
              placeholder="Fügen Sie hier allgemeine Hinweise zum Wareneingang hinzu" 
              value={receiptNote}
              onChange={(e) => {
                setReceiptNote(e.target.value);
                form.setValue('receiptNote', e.target.value);
              }}
              rows={3}
              data-testid="textarea-receipt-note"
            />
          </div>
          
          {/* Document upload */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Lieferscheine und Dokumente</label>
              <Badge variant="outline" className="text-xs">
                {documents.length} {documents.length === 1 ? 'Datei' : 'Dateien'}
              </Badge>
            </div>
            
            {/* Upload Area - Drag & Drop */}
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="space-y-3">
                <div className="mx-auto w-12 h-12 text-gray-400">
                  <Upload className="w-full h-full" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Lieferscheine hier ablegen oder Dateien auswählen
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    PDF, JPEG, PNG • Max. 10MB • Mehrere Dateien möglich
                  </p>
                </div>
                
                {/* Upload Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => document.getElementById('document-upload')?.click()}
                    className="gap-2"
                    data-testid="button-upload-document"
                  >
                    <FileText className="h-4 w-4" />
                    PDF/Dokument wählen
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => document.getElementById('photo-upload')?.click()}
                    className="gap-2"
                    data-testid="button-upload-photo"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Foto auswählen
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleCameraCapture}
                    className="gap-2"
                    data-testid="button-camera-capture"
                  >
                    <Camera className="h-4 w-4" />
                    Kamera
                  </Button>
                </div>
              </div>
            </div>
            
            {/* File Inputs */}
            <input 
              id="document-upload" 
              type="file" 
              multiple 
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleDocumentUpload} 
              className="hidden" 
            />
            <input 
              id="photo-upload" 
              type="file" 
              multiple 
              accept="image/*"
              onChange={handleDocumentUpload} 
              className="hidden" 
            />
            <input 
              id="camera-capture" 
              type="file" 
              accept="image/*"
              capture="environment"
              onChange={handleDocumentUpload} 
              className="hidden" 
            />
            
            {/* Uploaded Documents Preview */}
            {documents.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Hochgeladene Dokumente ({documents.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {documents.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {file.type === 'application/pdf' ? (
                            <FileText className="h-5 w-5 text-red-500 flex-shrink-0" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024 / 1024).toFixed(1)} MB
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {file.type.startsWith('image/') && previewUrls[file.name] && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const win = window.open();
                                if (win) {
                                  win.document.write(`<img src="${previewUrls[file.name]}" style="max-width:100%;max-height:100vh;" />`);
                                }
                              }}
                              className="h-8 w-8 p-0"
                              data-testid={`button-preview-${index}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDocument(index)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            data-testid={`button-remove-document-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Image Preview */}
                      {file.type.startsWith('image/') && previewUrls[file.name] && (
                        <div className="mt-2">
                          <img 
                            src={previewUrls[file.name]} 
                            alt={`Preview of ${file.name}`}
                            className="w-full h-20 object-cover rounded border"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Products table */}
          <div>
            <div className="text-sm font-medium mb-2">Artikel:</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Artikel</TableHead>
                  <TableHead className="text-center">Gebinde</TableHead>
                  <TableHead className="text-center">Bestellt (Gebinde)</TableHead>
                  <TableHead className="text-center">Bestellt (Gesamt)</TableHead>
                  <TableHead className="text-center">Erhalten (Gebinde)</TableHead>
                  <TableHead className="text-center">Erhalten (Gesamt)</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Preis</TableHead>
                  <TableHead className="text-center">MHD</TableHead>
                  {enableEnhancedFeatures && <TableHead className="text-center">Qualität</TableHead>}
                  <TableHead className="hidden md:table-cell">Anmerkung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivedItems.map((item) => {
                  const isDifferent = item.receivedQuantity !== item.orderedQuantity;
                  const hasQualityIssues = item.qualityStatus !== 'good' || item.damaged;
                  
                  // Calculate package info for this item - aus purchase_conditions
                  const packageQuantity = getProductPackageQuantity(item.productId || 0);
                  const packageTypeName = getProductPackageType(item.productId || 0);
                  
                  // Bestellte Package-Info (ursprünglich bestellte Gebinde)
                  const orderedPackageInfo = calculatePackageInfo({
                    id: item.productId || 0,
                    name: item.name || '',
                    packageQuantity: packageQuantity,
                    packageTypeName: packageTypeName,
                    baseUnitName: "Stück",
                    orderQuantity: item.orderedQuantity
                  });
                  
                  // Erhaltene Package-Info (tatsächlich erhaltene Gebinde)
                  const receivedPackageInfo = calculatePackageInfo({
                    id: item.productId || 0,
                    name: item.name || '',
                    packageQuantity: packageQuantity,
                    packageTypeName: packageTypeName,
                    baseUnitName: "Stück",
                    orderQuantity: item.receivedTotalQuantity || item.receivedQuantity || 0
                  });
                  
                  const packageDisplay = formatPackageDisplay(orderedPackageInfo);
                  const currentPackageCount = item.receivedPackageCount ?? receivedPackageInfo.packageCount;
                  const currentTotalQuantity = item.receivedTotalQuantity ?? item.receivedQuantity ?? 0;
                  
                  return (
                    <TableRow 
                      key={item.id} 
                      className={
                        hasQualityIssues ? 'bg-destructive/10' : 
                        isDifferent ? 'bg-amber-50' : ''
                      }
                    >
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id={`damaged-${item.id}`}
                            checked={item.damaged || item.qualityStatus === 'damaged' || item.qualityStatus === 'rejected'}
                            onCheckedChange={(checked) => handleDamagedChange(item.id, !!checked)}
                            data-testid={`checkbox-damaged-${item.id}`}
                          />
                          <label 
                            htmlFor={`damaged-${item.id}`}
                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Beschädigt
                          </label>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{item.name || item.productName || 'Unbekannter Artikel'}</TableCell>
                      
                      {/* Gebinde-Info anzeigen */}
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {packageDisplay}
                      </TableCell>
                      
                      {/* Bestellt (Gebinde) */}
                      <TableCell className="text-center text-sm font-medium">
                        {orderedPackageInfo.packageCount}
                      </TableCell>
                      
                      {/* Bestellt (Gesamt) */}
                      <TableCell className="text-center text-sm">
                        {item.orderedQuantity}
                      </TableCell>
                      
                      {/* Erhalten (Gebinde) - mit +/- Buttons */}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleReceivedPackageCountChange(item.id, String(Math.max(0, currentPackageCount - 1)))}
                            disabled={currentPackageCount <= 0}
                            data-testid={`button-decrease-package-${item.id}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="0"
                            value={currentPackageCount}
                            onChange={(e) => handleReceivedPackageCountChange(item.id, e.target.value)}
                            className="w-12 h-6 text-center px-1 text-xs"
                            data-testid={`input-package-count-${item.id}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleReceivedPackageCountChange(item.id, String(currentPackageCount + 1))}
                            data-testid={`button-increase-package-${item.id}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      
                      {/* Erhalten (Gesamt) - mit +/- Buttons */}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleReceivedTotalQuantityChange(item.id, String(Math.max(0, (currentTotalQuantity || 0) - 1)))}
                            disabled={(currentTotalQuantity || 0) <= 0}
                            data-testid={`button-decrease-total-${item.id}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="0"
                            value={currentTotalQuantity || 0}
                            onChange={(e) => handleReceivedTotalQuantityChange(item.id, e.target.value)}
                            className={`w-14 h-6 text-center px-1 text-xs ${
                              (currentTotalQuantity || 0) !== item.orderedQuantity ? "border-amber-500" : ""
                            }`}
                            data-testid={`input-total-quantity-${item.id}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleReceivedTotalQuantityChange(item.id, String((currentTotalQuantity || 0) + 1))}
                            data-testid={`button-increase-total-${item.id}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-right hidden md:table-cell">{(item.price || item.unitPrice || 0).toFixed(2)} €</TableCell>

                      <TableCell>
                        <Input
                          type="date"
                          value={item.expiryDate || ''}
                          onChange={(e) => handleExpiryDateChange(item.id, e.target.value)}
                          className={`w-32 h-8 text-xs ${
                            item.expiryDate && isBefore(new Date(item.expiryDate), new Date()) ? 
                            "border-red-500 bg-red-50" : ""
                          }`}
                          placeholder="TT.MM.JJJJ"
                          data-testid={`input-expiry-date-${item.id}`}
                        />
                        {item.expiryDate && isBefore(new Date(item.expiryDate), new Date()) && (
                          <div className="text-xs text-red-600 mt-1">Abgelaufen!</div>
                        )}
                      </TableCell>

                      {/* Enhanced: Quality Status Column */}
                      {enableEnhancedFeatures && (
                        <TableCell className="text-center">
                          <Select 
                            onValueChange={(value: 'good' | 'damaged' | 'partial' | 'rejected') => handleQualityStatusChange(item.id, value)}
                            value={item.qualityStatus || 'good'}
                          >
                            <SelectTrigger className="w-24 h-8 text-xs" data-testid={`select-quality-${item.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="good">
                                <div className="flex items-center">
                                  <ShieldCheck className="h-3 w-3 mr-1 text-green-600" />
                                  Gut
                                </div>
                              </SelectItem>
                              <SelectItem value="damaged">
                                <div className="flex items-center">
                                  <ShieldAlert className="h-3 w-3 mr-1 text-yellow-600" />
                                  Beschädigt
                                </div>
                              </SelectItem>
                              <SelectItem value="partial">
                                <div className="flex items-center">
                                  <Shield className="h-3 w-3 mr-1 text-blue-600" />
                                  Teilweise
                                </div>
                              </SelectItem>
                              <SelectItem value="rejected">
                                <div className="flex items-center">
                                  <ShieldX className="h-3 w-3 mr-1 text-red-600" />
                                  Abgelehnt
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}

                      <TableCell className="hidden md:table-cell">
                        <Input
                          type="text"
                          placeholder="Anmerkung"
                          value={item.comment || ''}
                          onChange={(e) => handleCommentChange(item.id, e.target.value)}
                          className="text-xs"
                          data-testid={`input-comment-${item.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Enhanced: Damage Description for Items with Quality Issues */}
            {enableEnhancedFeatures && receivedItems.some(item => 
              item.qualityStatus === 'damaged' || item.qualityStatus === 'rejected' || item.damaged
            ) && (
              <div className="mt-4 space-y-3">
                <div className="text-sm font-medium">Schadensbeschreibungen:</div>
                {receivedItems
                  .filter(item => item.qualityStatus === 'damaged' || item.qualityStatus === 'rejected' || item.damaged)
                  .map((item) => (
                    <div key={`damage-${item.id}`} className="p-3 border rounded-lg bg-yellow-50">
                      <div className="text-sm font-medium mb-2 flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-yellow-600" />
                        {item.name} - Schadensbeschreibung
                      </div>
                      <Textarea
                        placeholder="Beschreiben Sie den Schaden oder Grund für Ablehnung..."
                        value={item.damageDescription || ''}
                        onChange={(e) => handleDamageDescriptionChange(item.id, e.target.value)}
                        className="text-sm resize-none"
                        rows={2}
                        data-testid={`textarea-damage-description-${item.id}`}
                      />
                    </div>
                  ))
                }
              </div>
            )}
          </div>
          
          {/* Mobile comments for items */}
          <div className="block md:hidden">
            <div className="text-sm font-medium mb-2">Anmerkungen zu einzelnen Artikeln:</div>
            {receivedItems.map((item) => (
              <div key={`comment-${item.id}`} className="mb-2">
                <div className="text-xs font-medium mb-1">{item.name}:</div>
                <Input
                  type="text"
                  placeholder="Anmerkung"
                  value={item.comment || ''}
                  onChange={(e) => handleCommentChange(item.id, e.target.value)}
                  className="text-xs"
                  data-testid={`input-mobile-comment-${item.id}`}
                />
              </div>
            ))}
          </div>
          
          {/* Warning for discrepancies */}
          {hasDiscrepancies && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Abweichungen festgestellt</AlertTitle>
              <AlertDescription>
                Es wurden Abweichungen von der ursprünglichen Bestellung festgestellt. 
                Bitte überprüfen Sie die Mengen und Qualitätsangaben vor der Bestätigung.
              </AlertDescription>
            </Alert>
          )}
          
        </CardContent>

        {/* Enhanced Actions */}
        <CardFooter className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {isComplete ? (
              <span className="text-green-600 font-medium">✓ Wareneingang vollständig</span>
            ) : (
              <span>Wareneingang unvollständig</span>
            )}
          </div>
          
          <div className="flex gap-2">
            {enableEnhancedFeatures && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={validateFormData}
                disabled={isValidating}
                data-testid="button-validate"
              >
                {isValidating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Validieren
              </Button>
            )}
            
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className="flex items-center gap-2"
              data-testid="button-submit-goods-receipt"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird gespeichert...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Wareneingang bestätigen
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </Form>
  );
};

export default GoodsReceiptForm;