import React, { useState } from 'react';
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
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
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
import { useQuery } from '@tanstack/react-query';
import type { PurchaseCondition } from '../../../../shared/schema';

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
}

interface GoodsReceiptFormProps {
  order: any; // Make the type more flexible to accommodate different API structures
  onSubmit?: (receivedItems: OrderItem[], receiptNote: string, documents: File[]) => void;
  onSaveComplete?: (receivedItems: OrderItem[]) => void;
  isSubmitting: boolean;
}

const GoodsReceiptForm: React.FC<GoodsReceiptFormProps> = ({
  order,
  onSubmit,
  onSaveComplete,
  isSubmitting
}) => {
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

  console.log('[GoodsReceiptForm] Order data:', order);
  console.log('[GoodsReceiptForm] OrderItems found:', orderItems);
  
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
  
  // Purchase Conditions für alle Produkte laden
  const productIds: number[] = Array.from(new Set(orderItems.map((item: any) => item.product_id || item.productId).filter(Boolean))) as number[];
  
  const { data: purchaseConditionsData = {} } = useQuery<Record<number, any[]>>({
    queryKey: [`/api/products/purchase-conditions-batch`, productIds],
    queryFn: async () => {
      console.log('[GoodsReceiptForm] Lade Purchase Conditions für Products:', productIds);
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

  const [receivedItems, setReceivedItems] = useState<OrderItem[]>(
    orderItems.map((item: any) => {
      const orderedQuantity = item.orderQuantity || item.orderedQuantity || item.quantity || 0;
      
      return {
        ...item,
        // Wichtig: orderItemId für die API-Übertragung (aus der Datenbank-ID)
        id: item.id || item.orderItemId || item.productId,
        orderItemId: item.id || item.orderItemId,
        productId: item.product_id || item.productId,
        // Stellen sicher, dass der Name vorhanden ist (entweder name oder productName)
        name: item.name || item.product_name || item.productName || 'Artikel ohne Namen',
        productName: item.name || item.product_name || item.productName || 'Artikel ohne Namen',
        // Bestellte Menge
        orderedQuantity,
        receivedQuantity: orderedQuantity, // Standardmäßig die volle bestellte Menge
        price: item.price || item.unit_price || item.unitPrice || 0,
        unitPrice: item.price || item.unit_price || item.unitPrice || 0,
        unit: item.unit || 'Stk.',
        damaged: false,
        comment: '',
        expiryDate: '', // Leeres Feld für MHD hinzufügen
        // packageSize ist obsolet - verwende jetzt purchase_conditions über getProductPackageQuantity()
        // Package-spezifische Initialisierung - erhaltene Menge entspricht zunächst der bestellten
        receivedPackageCount: orderedQuantity > 0 ? splitTotalToPackageFields(orderedQuantity, getProductPackageQuantity(item.product_id || item.productId)).packageCount : 0,
        receivedTotalQuantity: orderedQuantity
      };
    })
  );
  
  const [receiptNote, setReceiptNote] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  
  // Package-based quantity states for goods receipt - no longer needed as we store directly in receivedItems
  // const [receivedPackageCounts, setReceivedPackageCounts] = useState<Record<number, number>>({});
  // const [receivedTotalQuantities, setReceivedTotalQuantities] = useState<Record<number, number>>({});
  
  // Calculate total received vs ordered
  const totalOrdered = orderItems.reduce((sum: number, item: any) => sum + (item.orderedQuantity || item.orderQuantity || item.quantity || 0), 0);
  const totalReceived = receivedItems.reduce((sum: number, item) => sum + (item.receivedQuantity || 0), 0);
  const isComplete = totalReceived === totalOrdered;
  const hasDiscrepancies = receivedItems.some(item => 
    item.receivedQuantity !== item.orderedQuantity || item.damaged
  );
  
  // Handle input change
  const handleQuantityChange = (id: number, receivedQuantity: number) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, receivedQuantity } : item
      )
    );
  };
  
  // Handle damaged state change
  const handleDamagedChange = (id: number, damaged: boolean) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, damaged } : item
      )
    );
  };
  
  // Handle comment change
  const handleCommentChange = (id: number, comment: string) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, comment } : item
      )
    );
  };
  
  // Handler für MHD-Änderung
  const handleExpiryDateChange = (id: number, expiryDate: string) => {
    setReceivedItems(items =>
      items.map(item =>
        item.id === id ? { ...item, expiryDate } : item
      )
    );
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
  };
  
  // Cleanup preview URLs on unmount
  React.useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [previewUrls]);

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
          alert(`Fehler bei Datei "${file.name}": ${validation.error}`);
        }
      });
      
      if (validFiles.length > 0) {
        setDocuments(prev => [...prev, ...validFiles]);
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
        alert(`Fehler bei Datei "${file.name}": ${validation.error}`);
      }
    });
    
    if (validFiles.length > 0) {
      setDocuments(prev => [...prev, ...validFiles]);
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
    setDocuments(docs => docs.filter((_, i) => i !== index));
  };
  
  // Handle submit
  const handleSubmit = () => {
    console.log('[GoodsReceiptForm] Submitting received items:', receivedItems);
    
    if (onSubmit) {
      onSubmit(receivedItems, receiptNote, documents);
    }
    
    if (onSaveComplete) {
      onSaveComplete(receivedItems);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wareneingang erfassen</CardTitle>
        <CardDescription>
          Erfassen Sie den Wareneingang für Bestellung {order.orderNumber}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <Badge variant={isComplete ? "success" : "outline"} className="flex items-center gap-1">
            {isComplete ? <CheckSquare className="h-3 w-3" /> : null}
            {isComplete ? "Vollständig" : "Unvollständig"}
          </Badge>
          
          {hasDiscrepancies && (
            <Badge variant="warning" className="flex items-center gap-1">
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
            onChange={(e) => setReceiptNote(e.target.value)}
            rows={3}
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
                >
                  <FileText className="h-4 w-4" />
                  PDF/Dokument wählen
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  className="gap-2"
                >
                  <ImageIcon className="h-4 w-4" />
                  Foto auswählen
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCameraCapture}
                  className="gap-2"
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
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDocument(index)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
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
                <TableHead className="hidden md:table-cell">Anmerkung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivedItems.map((item) => {
                const isDifferent = item.receivedQuantity !== item.orderedQuantity;
                
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
                  <TableRow key={item.id} className={item.damaged ? 'bg-destructive/10' : isDifferent ? 'bg-amber-50' : ''}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id={`damaged-${item.id}`}
                          checked={item.damaged}
                          onCheckedChange={(checked) => handleDamagedChange(item.id, !!checked)}
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
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={currentPackageCount}
                          onChange={(e) => handleReceivedPackageCountChange(item.id, e.target.value)}
                          className="w-12 h-6 text-center px-1 text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleReceivedPackageCountChange(item.id, String(currentPackageCount + 1))}
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
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleReceivedTotalQuantityChange(item.id, String((currentTotalQuantity || 0) + 1))}
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
                        className="w-32 h-8 text-xs"
                        placeholder="TT.MM.JJJJ"
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Input
                        type="text"
                        placeholder="Anmerkung"
                        value={item.comment || ''}
                        onChange={(e) => handleCommentChange(item.id, e.target.value)}
                        className="text-xs"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
              />
            </div>
          ))}
        </div>
        
        {/* Warning for discrepancies */}
        {hasDiscrepancies && (
          <Alert variant="destructive" className="bg-amber-50 border-amber-300 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Achtung</AlertTitle>
            <AlertDescription>
              Es gibt Abweichungen zwischen der bestellten und der erhaltenen Ware. 
              Bitte stellen Sie sicher, dass alle Anmerkungen erfasst sind.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3">
        <Button 
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wareneingang wird erfasst...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Wareneingang bestätigen
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default GoodsReceiptForm;