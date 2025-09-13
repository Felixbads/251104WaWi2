import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, addDays, subDays, isAfter, isBefore } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// UI-Komponenten
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Icons
import {
  CalendarIcon,
  CheckCircle2,
  X,
  AlertTriangle,
  Info,
  Calendar as CalendarIcon2,
  PackageCheck,
  Package,
  Warehouse,
  Camera,
  Upload,
  ExternalLink,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Loader2,
  Save,
  RefreshCw,
} from 'lucide-react';

import { goodsReceiptDataSchema, insertGoodsReceiptDataSchema, type GoodsReceiptData, type InsertGoodsReceiptData } from '@shared/schema';

// Use shared schema for consistency
type EnhancedGoodsReceiptFormValues = InsertGoodsReceiptData;

interface GoodsReceiptFormProps {
  orderId?: number; // Bestellungs-ID (optional)
  order?: any; // Bestellungsdaten (optional)
  onSubmit: (data: any) => void;
  onBack: () => void;
  isSubmitting?: boolean;
  // Enhanced props
  enableEnhancedFeatures?: boolean; // Toggle für erweiterte Features
  defaultWarehouseId?: number; // Standard-Lager
}

export function GoodsReceiptForm({ 
  orderId, 
  order, 
  onSubmit: submitHandler, 
  onBack, 
  isSubmitting = false,
  enableEnhancedFeatures = true,
  defaultWarehouseId
}: GoodsReceiptFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  
  // Laden der verfügbaren Lager für diese Bestellung (Enhanced Feature)
  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery({
    queryKey: [`/api/goods-receipt/${orderId}/warehouses`],
    enabled: enableEnhancedFeatures && !!orderId,
    staleTime: 60 * 1000, // 1 minute
  });

  // Laden der Bestellpositionen
  useEffect(() => {
    if (orderId && (!order || !order.items || order.items.length === 0)) {
      // Enhanced API endpoint verwenden wenn verfügbar
      const endpoint = enableEnhancedFeatures 
        ? `/api/goods-receipt/${orderId}/enhanced-details`
        : `/api/order-items-direct/${orderId}`;
        
      fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        console.log("Bestellpositionen geladen:", data);
        
        // Handle enhanced response format
        const items = enableEnhancedFeatures 
          ? (data.data?.items || data.items || [])
          : (Array.isArray(data) ? data : (data?.data || []));
          
        setOrderItems(items);
      })
      .catch(error => {
        console.error("Fehler beim Laden der Bestellpositionen:", error);
        toast({
          title: "Fehler beim Laden",
          description: "Bestellpositionen konnten nicht geladen werden: " + error.message,
          variant: "destructive"
        });
      });
    } else if (order?.items || order?.orderItems) {
      setOrderItems(order.items || order.orderItems || []);
    }
  }, [orderId, order, toast, enableEnhancedFeatures]);
  
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

  // Intelligente MHD-Defaults basierend auf Produkttypen
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

  // Enhanced Batch-Nummer Generation mit Produkt-Info
  function generateEnhancedBatchNumber(productId: number, productName: string): string {
    const today = new Date();
    const dateStr = format(today, 'yyyyMMdd');
    const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    // Produktkürzel für bessere Identifikation
    const productCode = productName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    
    return `${productCode}${dateStr}-${productId}-${randomPart}`;
  }

  // Quality Status Helper
  const getQualityStatusBadge = (status: string) => {
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

  // Function to compute default values deterministically
  const computeDefaultValues = (): EnhancedGoodsReceiptFormValues => {
    // Deterministic warehouse selection: prefer defaultWarehouseId, then first loaded warehouse, then fallback
    const selectedWarehouseId = defaultWarehouseId || 
                                (warehouses.length > 0 ? warehouses[0].id : null) || 
                                (order?.warehouseId) || 
                                1;
    
    const availableItems = orderItems.length > 0 ? orderItems : (order?.items || order?.orderItems || []);
    
    return {
      deliveryDate: new Date(), // Today as Date object
      warehouseId: selectedWarehouseId,
      orderId: orderId || order?.id || 0,
      deliveryNoteNumber: '',
      notes: '',
      items: availableItems.map((item: any) => ({
        orderItemId: item.id,
        productId: item.productId || item.product_id,
        productName: item.productName || item.product_name || item.name,
        quantityOrdered: item.quantity || item.orderedQuantity,
        quantityReceived: item.quantity || item.orderedQuantity, // Standard: Vollständige Lieferung
        unit: item.unit || 'stk',
        qualityStatus: 'good' as const,
        damageDescription: '',
        batchNumber: generateEnhancedBatchNumber(item.productId || item.product_id, item.productName || item.product_name || item.name),
        supplierBatchNumber: '',
        expiryDate: calculateIntelligentExpiryDate(item.productName || item.product_name || item.name), // Return Date object
        warehouseId: undefined, // Nutzt globale Auswahl
        locationInWarehouse: '',
        notes: '',
      })),
    };
  };

  // Form hook with shared schema
  const form = useForm<EnhancedGoodsReceiptFormValues>({
    resolver: zodResolver(insertGoodsReceiptDataSchema),
    defaultValues: computeDefaultValues(),
  });
  
  // Fix Form State Synchronization Bug: Reset form when async data loads
  useEffect(() => {
    const newDefaults = computeDefaultValues();
    console.log('[GoodsReceiptForm] Resetting form with new defaults:', newDefaults);
    form.reset(newDefaults);
  }, [orderItems, warehouses, defaultWarehouseId, order]);

  // Field array für Bestellpositionen
  const { fields, replace } = useFieldArray({
    name: 'items',
    control: form.control,
  });
  
  // Update field array when orderItems change
  useEffect(() => {
    const newDefaults = computeDefaultValues();
    if (newDefaults.items.length > 0) {
      replace(newDefaults.items);
    }
  }, [orderItems, replace]);

  // Real-time Validation (Enhanced Feature)
  const validateFormData = async (data: EnhancedGoodsReceiptFormValues) => {
    if (!enableEnhancedFeatures || !orderId) return;
    
    setIsValidating(true);
    try {
      const response = await apiRequest(`/api/goods-receipt/${orderId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          deliveryDate: ensureDateString(data.deliveryDate),
          warehouseId: data.warehouseId,
          items: data.items.map(item => ({
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
          notes: data.notes,
          deliveryNoteNumber: data.deliveryNoteNumber,
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
    } catch (error) {
      console.error('Validierungsfehler:', error);
      setValidationErrors(['Validierung fehlgeschlagen']);
    } finally {
      setIsValidating(false);
    }
  };

  // Enhanced Submit-Handler
  async function onSubmit(data: EnhancedGoodsReceiptFormValues) {
    // Basis-Validierungen
    const hasReceivedItems = data.items.some(item => item.quantityReceived > 0);
    
    if (!hasReceivedItems) {
      form.setError('root', { 
        type: 'manual',
        message: 'Mindestens ein Artikel muss eine Eingangsmenge größer als 0 haben' 
      });
      return;
    }

    // Enhanced MHD-Validierung with safe date handling
    const expiredItems = data.items.filter(item => {
      if (item.quantityReceived <= 0 || !item.expiryDate) return false;
      const expiryDateObj = normalizeDate(item.expiryDate);
      return expiryDateObj && isBefore(expiryDateObj, new Date());
    });

    if (expiredItems.length > 0) {
      form.setError('root', {
        type: 'manual',
        message: 'Abgelaufene Produkte können nicht ins Lager aufgenommen werden. Bitte korrigieren Sie die MHD-Daten oder reduzieren Sie die Menge auf 0.'
      });
      
      toast({
        title: "Fehler: Abgelaufene Produkte",
        description: `${expiredItems.length} Artikel haben ein MHD in der Vergangenheit.`,
        variant: "destructive"
      });
      return;
    }

    // Enhanced Quality Control Validation
    const damagedItemsWithoutDescription = data.items.filter(item => 
      item.quantityReceived > 0 && 
      (item.qualityStatus === 'damaged' || item.qualityStatus === 'rejected') && 
      !item.damageDescription?.trim()
    );

    if (damagedItemsWithoutDescription.length > 0) {
      form.setError('root', {
        type: 'manual',
        message: 'Beschädigte oder abgelehnte Artikel benötigen eine Schadensbeschreibung.'
      });
      return;
    }

    // Enhanced API Call wenn verfügbar
    if (enableEnhancedFeatures) {
      // Konvertiere zu Enhanced API Format with safe date handling
      const enhancedData = {
        orderId: orderId!,
        deliveryDate: ensureDateString(data.deliveryDate),
        warehouseId: data.warehouseId,
        items: data.items.map(item => ({
          orderItemId: item.orderItemId,
          productId: item.productId,
          productName: item.productName,
          quantityOrdered: item.quantityOrdered,
          quantityReceived: item.quantityReceived,
          qualityStatus: item.qualityStatus,
          expiryDate: ensureDateString(item.expiryDate),
          batchNumber: item.batchNumber,
          supplierBatchNumber: item.supplierBatchNumber,
          warehouseId: item.warehouseId || data.warehouseId,
          locationInWarehouse: item.locationInWarehouse,
          damageDescription: item.damageDescription,
          notes: item.notes,
        })),
        notes: data.notes,
        deliveryNoteNumber: data.deliveryNoteNumber,
      };
      
      submitHandler(enhancedData);
    } else {
      // Legacy Format für Rückwärtskompatibilität
      const legacyData = {
        deliveryNoteNumber: data.deliveryNoteNumber,
        receiptDate: data.deliveryDate,
        notes: data.notes,
        isComplete: data.isComplete,
        items: data.items.map(item => ({
          orderItemId: item.orderItemId,
          productId: item.productId,
          productName: item.productName,
          orderedQuantity: item.quantityOrdered,
          receivedQuantity: item.quantityReceived,
          unit: item.unit,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          supplierBatchNumber: item.supplierBatchNumber,
          locationInWarehouse: item.locationInWarehouse,
          notes: item.notes,
          qualityCheck: item.qualityStatus === 'good',
          qualityIssue: item.qualityStatus !== 'good' ? item.damageDescription : '',
        })),
      };
      
      submitHandler(legacyData);
    }
  }

  // Vollständigkeitsprüfung (Enhanced)
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name?.includes('items') || name === 'isComplete') {
        const items = form.getValues('items');
        const allComplete = items.every(item => 
          item.quantityReceived === item.quantityOrdered && item.qualityStatus !== 'rejected'
        );
        
        if (allComplete !== form.getValues('isComplete')) {
          form.setValue('isComplete', allComplete);
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form]);

  // Real-time validation trigger (Enhanced Feature)
  useEffect(() => {
    if (!enableEnhancedFeatures) return;
    
    const subscription = form.watch(async (value) => {
      // Debounce validation
      const timeoutId = setTimeout(() => {
        if (value.deliveryDate && value.warehouseId && value.items?.length > 0) {
          validateFormData(value as EnhancedGoodsReceiptFormValues);
        }
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    });
    
    return () => subscription.unsubscribe();
  }, [form, enableEnhancedFeatures, orderId]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Enhanced Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Wareneingang erfassen</h2>
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
          
          {orderId && (
            <p className="text-sm text-muted-foreground mt-1">
              Bestellung #{orderId}
            </p>
          )}
        </div>

        {/* Validation Feedback (Enhanced) */}
        {enableEnhancedFeatures && (validationErrors.length > 0 || validationWarnings.length > 0) && (
          <div className="space-y-2 mb-6">
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

        {/* Allgemeine Wareneingangsinformationen (Enhanced) */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Lieferdatum (Enhanced - Required) */}
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

            {/* Lagerauswahl (Enhanced - Required) */}
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
                      {warehouses.map((warehouse: any) => (
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
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Lieferscheinnummer */}
            <FormField
              control={form.control}
              name="deliveryNoteNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lieferscheinnummer</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="LS-12345" 
                      {...field} 
                      value={field.value || ''} 
                      data-testid="input-delivery-note-number"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Vollständigkeit */}
          <FormField
            control={form.control}
            name="isComplete"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-complete-delivery"
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Vollständige Lieferung</FormLabel>
                  <FormDescription>
                    Die Bestellung ist vollständig und in gutem Zustand geliefert
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {/* Notizen */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notizen zum Wareneingang</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Zusätzliche Informationen zum Wareneingang..."
                    className="resize-none"
                    rows={2}
                    {...field}
                    data-testid="textarea-notes"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator className="my-6" />

        {/* Positionsliste (Enhanced) */}
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Gelieferte Artikel ({fields.length})</h3>
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <Card key={field.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {form.getValues(`items.${index}.productName`)}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Bestellt: {form.getValues(`items.${index}.quantityOrdered`)} {form.getValues(`items.${index}.unit`)}
                      </p>
                    </div>
                    {getQualityStatusBadge(form.getValues(`items.${index}.qualityStatus`))}
                  </div>
                </CardHeader>
                
                <CardContent className="pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Empfangene Menge */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantityReceived`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Eingegangene Menge</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              step="1"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid={`input-quantity-received-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Enhanced Quality Status */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.qualityStatus`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qualitätsstatus</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid={`select-quality-status-${index}`}>
                                <SelectValue placeholder="Status auswählen" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="good">
                                <div className="flex items-center">
                                  <ShieldCheck className="h-4 w-4 mr-2 text-green-600" />
                                  Gut
                                </div>
                              </SelectItem>
                              <SelectItem value="damaged">
                                <div className="flex items-center">
                                  <ShieldAlert className="h-4 w-4 mr-2 text-yellow-600" />
                                  Beschädigt
                                </div>
                              </SelectItem>
                              <SelectItem value="partial">
                                <div className="flex items-center">
                                  <Shield className="h-4 w-4 mr-2 text-blue-600" />
                                  Teilweise
                                </div>
                              </SelectItem>
                              <SelectItem value="rejected">
                                <div className="flex items-center">
                                  <ShieldX className="h-4 w-4 mr-2 text-red-600" />
                                  Abgelehnt
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Chargennummer */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.batchNumber`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chargennummer (intern)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ''} 
                              data-testid={`input-batch-number-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Lieferanten-Chargennummer */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.supplierBatchNumber`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lieferanten-Chargennummer</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ''} 
                              data-testid={`input-supplier-batch-number-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Enhanced MHD mit intelligentem Default */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.expiryDate`}
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Mindesthaltbarkeitsdatum (MHD)</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={field.value && isBefore(field.value, new Date()) ? "destructive" : "outline"}
                                  className="w-full pl-3 text-left font-normal"
                                  data-testid={`button-expiry-date-${index}`}
                                >
                                  {field.value ? (
                                    <>
                                      {isBefore(field.value, new Date()) && (
                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                      )}
                                      {format(field.value, 'PPP', { locale: de })}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">MHD wählen</span>
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
                                  
                                  // Enhanced MHD feedback
                                  if (date && isBefore(date, new Date())) {
                                    toast({
                                      title: "Achtung: Abgelaufenes Produkt",
                                      description: "Das MHD liegt in der Vergangenheit. Abgelaufene Produkte dürfen nicht ins Lager aufgenommen werden.",
                                      variant: "destructive"
                                    });
                                  } else if (date && isBefore(date, addDays(new Date(), 7))) {
                                    toast({
                                      title: "Kurzes MHD",
                                      description: "Das Produkt läuft in weniger als 7 Tagen ab.",
                                      variant: "default"
                                    });
                                  }
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          {field.value && isBefore(field.value, new Date()) && (
                            <div className="mt-2 text-destructive text-sm flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              Produkt ist abgelaufen! Nicht für Wareneingang geeignet.
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Lagerort */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.locationInWarehouse`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lagerort</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="z.B. Regal A3, Kühlhaus 2" 
                              {...field} 
                              value={field.value || ''} 
                              data-testid={`input-location-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Enhanced Damage Description (conditionally shown) */}
                  {form.getValues(`items.${index}.qualityStatus`) === 'damaged' || 
                   form.getValues(`items.${index}.qualityStatus`) === 'rejected' ? (
                    <div className="mt-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.damageDescription`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="required">Schadensbeschreibung *</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Beschreiben Sie den Schaden oder Grund für Ablehnung..."
                                className="resize-none"
                                rows={2}
                                {...field}
                                value={field.value || ''}
                                data-testid={`textarea-damage-description-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : null}

                  {/* Notizen pro Position */}
                  <FormField
                    control={form.control}
                    name={`items.${index}.notes`}
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Notizen zum Artikel</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Spezifische Notizen zu diesem Artikel..."
                            className="resize-none"
                            rows={1}
                            {...field}
                            value={field.value || ''}
                            data-testid={`textarea-item-notes-${index}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Formularfehler */}
        {form.formState.errors.root && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mt-6" data-testid="alert-form-errors">
            <p>{form.formState.errors.root.message}</p>
          </div>
        )}

        {/* Enhanced Aktionsbuttons */}
        <div className="flex justify-between items-center mt-8">
          <Button variant="outline" type="button" onClick={onBack} data-testid="button-cancel">
            <X className="mr-2 h-4 w-4" /> Abbrechen
          </Button>
          
          <div className="flex gap-2">
            {enableEnhancedFeatures && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => validateFormData(form.getValues())}
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
              type="submit" 
              disabled={isSubmitting}
              data-testid="button-submit"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="mr-2 h-4 w-4" />
              )}
              Wareneingang bestätigen
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}