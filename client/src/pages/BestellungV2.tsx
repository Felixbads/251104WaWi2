import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { updateOrderStatus } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { orderKeys, supplierKeys, warehouseKeys, productKeys } from '@/lib/queryKeys';
import { format } from 'date-fns';
import {
  ChevronRight,
  Building2,
  Truck,
  PackageCheck,
  FileText,
  ClipboardCheck,
  FileDown,
  Send,
  Boxes,
  ArrowRight,
  Mail,
  Save,
  Loader2,
  Check,
  RotateCcw,
  XCircle,
  AlertTriangle,
  ListFilter,
  ClipboardList,
  Package
} from 'lucide-react';
import { useLocation, useParams } from 'wouter';
import { Steps } from "@/components/ui/steps";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";


// Import custom components
import WarehouseSelector from '@/components/orderv2/WarehouseSelector';
import OrderModeSelector, { OrderMode } from '@/components/orderv2/OrderModeSelector';
import SupplierSelector from '@/components/orderv2/SupplierSelector';
import OrderEmailDialog from '@/components/orders/OrderEmailDialog';
import OrderEmailPage from '@/components/orders/OrderEmailPage';
import ProductSelectionTable from '@/components/orderv2/ProductSelectionTable';
import AdditionalInfoForm from '@/components/orderv2/AdditionalInfoForm';
import OrderSummary from '@/components/orderv2/OrderSummary';
import GoodsReceiptForm from '@/components/orderv2/GoodsReceiptForm';
import OrdersOverview from '@/components/orderv2/OrdersOverview';
import { Badge } from '@/components/ui/badge';

// Define the order steps
type OrderStep = 'overview' | 'warehouse' | 'mode' | 'supplier' | 'products' | 'additionalInfo' | 'summary' | 'sendOrder' | 'goodsReceipt' | 'warehouseReceiptOfExistingOrder';

const BestellungV2: React.FC = () => {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const params = useParams();
  const queryClient = useQueryClient();
  
  // State for the order process
  const [step, setStep] = useState<OrderStep>('overview'); // Starte mit der Übersicht
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState<string>('');
  const [orderMode, setOrderMode] = useState<OrderMode>('new');
  const [sourceOrderId, setSourceOrderId] = useState<number | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState<string>('');
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState<{
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
  }>({
    expectedDeliveryDate: null,
    priority: 'normal',
    notes: '',
  });
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [existingOrderData, setExistingOrderData] = useState<any>(null);
  const [showEmailDialog, setShowEmailDialog] = useState<boolean>(false);
  
  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (orderData: any) => {
      return apiRequest('/api/orders', orderData, 'post');
    },
    onSuccess: (data) => {
      toast({
        title: 'Bestellung erfolgreich erstellt',
        description: `Bestellungsnummer: ${data.orderNumber}`,
      });
      setOrderId(data.id);
      setOrderNumber(data.orderNumber);
      setExistingOrderData(data);
      
      // Sicherstellen, dass selectedProducts zur Bestellung hinzugefügt wurden
      
      console.log("Bestellung erstellt. ID:", data.id, "Nummer:", data.orderNumber);
      console.log("Selected Products für Bestellung:", selectedProducts);
      
      // Aktualisiere das Order-Objekt mit den selectedProducts
      const orderWithProducts = {
        ...data,
        items: selectedProducts.map(product => ({
          productId: product.id,
          productName: product.name,
          quantity: product.orderQuantity,
          price: product.price,
          unit: product.unit || 'Stk.'
        }))
      };
      
      // Setze auf State für spätere Verwendung
      setExistingOrderData(orderWithProducts);
      
      // Kurze Verzögerung vor der Weiterleitung
      setTimeout(() => {
        
        // Dann zur E-Mail-Versandseite wechseln
        setStep('sendOrder');
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Erstellen der Bestellung',
        description: error.message || 'Ein unbekannter Fehler ist aufgetreten',
        variant: 'destructive',
      });
    }
  });
  
  // Mark order as sent mutation
  const markOrderAsSentMutation = useMutation({
    mutationFn: (orderId: number) => {
      return apiRequest(`/api/orders/${orderId}/mark-sent`, {}, 'post');
    },
    onSuccess: (data) => {
      toast({
        title: 'Bestellung als gesendet markiert',
        description: 'Der Status der Bestellung wurde aktualisiert.',
      });
      
      // Invalidiere den Cache für Bestellungen mit strukturierten Query-Keys
      queryClient.invalidateQueries({queryKey: orderKeys.lists()});
      queryClient.invalidateQueries({queryKey: orderKeys.detail(Number(orderId))});
      
      // Aktualisiere die lokalen Daten
      if (existingOrderData) {
        setExistingOrderData({
          ...existingOrderData,
          sentAt: new Date().toISOString(),
        });
      }
      
      // Schließe den Dialog
      setShowEmailDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Markieren der Bestellung',
        description: error.message || 'Ein unbekannter Fehler ist aufgetreten',
        variant: 'destructive',
      });
    }
  });
  
  // Goods Receipt mutation
  const goodsReceiptMutation = useMutation({
    mutationFn: (goodsReceiptData: any) => {
      const { orderId, ...receiptData } = goodsReceiptData;
      return apiRequest(`/api/orders/${orderId}/receipt`, receiptData, 'post');
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Wareneingang erfolgreich gebucht',
        description: 'Der Wareneingang wurde erfolgreich gebucht.',
      });
      
      // Invalidiere den Cache für Bestellungen und zurück zur Übersicht
      queryClient.invalidateQueries({queryKey: orderKeys.lists()});
      queryClient.invalidateQueries({queryKey: orderKeys.detail(Number(variables.orderId))});
      
      setTimeout(() => {
        setStep('overview');
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Buchen des Wareneingangs',
        description: error.message || 'Ein unbekannter Fehler ist aufgetreten',
        variant: 'destructive',
      });
    }
  });
  
  // Fetch order data if editing an existing order
  const { data: order, isLoading: isLoadingOrder } = useQuery({
    queryKey: orderId ? orderKeys.detail(orderId) : ['no-order'],
    queryFn: () => {
      if (!orderId) return null;
      return apiRequest(`/api/orders/${orderId}`);
    },
    enabled: !!orderId,  // Only fetch if orderId is set
  });
  
  // Event handler für die Bearbeitung einer Bestellung aus der Übersicht
  const handleEditOrder = (editOrderId: number) => {
    setOrderId(editOrderId);
    setStep('sendOrder'); // Zum E-Mail-Versand-Schritt wechseln (kann angepasst werden)
  };
  
  // Event handler für Wareneingang einer Bestellung aus der Übersicht
  const handleReceiveOrder = (receiveOrderId: number) => {
    setOrderId(receiveOrderId);
    setStep('warehouseReceiptOfExistingOrder');
  };
  
  // Function to handle selecting an order from the overview
  const handleSelectOrder = (orderId: number) => {
    console.log("Bestellung ausgewählt:", orderId);
    
    // Set orderId and navigate to email page
    setOrderId(orderId);
    setStep('sendOrder');
  };
  
  // Email sending function
  const handleSendEmail = async (supplierEmail: string, additionalNotes: string) => {
    if (!orderId) {
      toast({
        title: 'Fehler',
        description: 'Keine Bestellungs-ID vorhanden',
        variant: 'destructive',
      });
      return;
    }
    
    markOrderAsSentMutation.mutate(orderId);
  };
  
  // Funktion zur E-Mail-Vorbereitung
  const prepareOrderEmail = (orderData: any) => {
    try {
      console.log("E-Mail-Vorbereitung für Bestellung:", orderData?.orderNumber || "Unbekannt");
      
      // Sicherstellen, dass Bestelldaten vollständig sind
      if (!orderData || typeof orderData !== 'object') {
        console.error('Keine gültigen Bestelldaten für E-Mail:', orderData);
        toast({
          title: 'Fehler bei der E-Mail-Vorbereitung',
          description: 'Die Bestelldaten sind unvollständig oder fehlerhaft.',
          variant: 'destructive'
        });
        return;
      }
      
      // Extrahiere Bestellpositionen (für Logging)
      let items: any[] = [];
      
      // Umfassende Prüfung aller möglichen Feldnamen und Strukturen
      const raw = orderData;
      items = 
        (Array.isArray(raw.items) && raw.items.length > 0 ? raw.items : null) || 
        (Array.isArray(raw.orderItems) && raw.orderItems.length > 0 ? raw.orderItems : null) || 
        (raw.data?.items && Array.isArray(raw.data.items) && raw.data.items.length > 0 ? raw.data.items : null) ||
        (raw.data?.orderItems && Array.isArray(raw.data.orderItems) && raw.data.orderItems.length > 0 ? raw.data.orderItems : null) || 
        (Array.isArray(raw.products) && raw.products.length > 0 ? raw.products : null) || 
        (Array.isArray(raw.selectedProducts) && raw.selectedProducts.length > 0 ? raw.selectedProducts : null) || 
        (Array.isArray(raw.lineItems) && raw.lineItems.length > 0 ? raw.lineItems : null) ||
        [];
      
      console.log(`E-Mail-Vorbereitung: Bestellung ${orderData.orderNumber || ""} enthält ${items.length} Positionen`);
      
      // Info-Toast anzeigen
      toast({
        title: 'E-Mail wird vorbereitet',
        description: 'Die Bestelldaten wurden geladen. Sie können jetzt die E-Mail senden.',
      });
      
    } catch (error) {
      console.error('Fehler bei der E-Mail-Vorbereitung:', error);
      toast({
        title: 'Fehler bei der E-Mail-Vorbereitung',
        description: 'Die E-Mail konnte nicht vorbereitet werden. Details in der Konsole.',
        variant: 'destructive',
      });
    }
  };
  
  // Überprüfe Parameter beim ersten Laden
  useEffect(() => {
    if (params && params.orderId) {
      const orderId = parseInt(params.orderId);
      setOrderId(orderId);
      setStep('warehouseReceiptOfExistingOrder');
    }
  }, [params]);
  
  // Update local state when order data is loaded
  useEffect(() => {
    if (order) {
      setExistingOrderData(order);
      setOrderNumber(order.orderNumber);
      setSupplierName(order.supplierName || '');
      setSupplierId(order.supplierId);
      setWarehouseId(order.warehouseId);
      setWarehouseName(order.warehouseName || '');
    }
  }, [order]);
  
  // useEffect für das Laden von Bestellpositionen
  useEffect(() => {
    // Nur ausführen wenn wir im richtigen Schritt sind UND existingOrderData vorhanden ist
    if ((step === 'sendOrder' || step === 'warehouseReceiptOfExistingOrder') && existingOrderData && orderId) {
      console.log("Prüfe Bestellungsdetails für E-Mail-Versand:", existingOrderData);
      
      // Prüfen, ob bereits Bestellpositionen in irgendeinem bekannten Format vorhanden sind
      const hasItems = !!(
        (Array.isArray(existingOrderData.items) && existingOrderData.items.length > 0) ||
        (Array.isArray(existingOrderData.orderItems) && existingOrderData.orderItems.length > 0) ||
        (Array.isArray(existingOrderData.selectedProducts) && existingOrderData.selectedProducts.length > 0) ||
        (existingOrderData.data && Array.isArray(existingOrderData.data.items) && existingOrderData.data.items.length > 0)
      );
      
      if (!hasItems) {
        console.log("Bestellung hat keine Items, lade sie über API...");
        
        // Rekursive Funktion zum Laden mit Retry-Logik
        const loadOrderItems = async (retryCount = 0, maxRetries = 3) => {
          try {
            console.log(`Versuche Bestellpositionen zu laden (Versuch ${retryCount + 1}/${maxRetries + 1})`);
            
            // API-Aufruf um alle Bestellpositionen zu laden
            const response = await apiRequest(`/api/orders/${orderId}/items`);
            
            // Prüfen ob Items zurückgegeben wurden
            let items = [];
            if (response && Array.isArray(response)) {
              items = response;
            } else if (response && response.data && Array.isArray(response.data)) {
              items = response.data;
            } else if (response && response.items && Array.isArray(response.items)) {
              items = response.items;
            } else if (response && response.data && response.data.items && Array.isArray(response.data.items)) {
              items = response.data.items;
            }
            
            if (Array.isArray(items) && items.length > 0) {
              console.log(`${items.length} Bestellpositionen erfolgreich geladen`);
              
              // Aktualisiere Bestelldaten mit geladenen Items
              const updatedOrderData = {
                ...existingOrderData,
                items: items,              // Standard-Eigenschaft
                orderItems: items,         // Alternative Eigenschaft
                products: items            // Weitere Alternative
              };
              
              // State aktualisieren
              setExistingOrderData(updatedOrderData);
              
              // Cache invalidieren
              queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId)});
              
              // E-Mail-Vorbereitung
              prepareOrderEmail(updatedOrderData);
              
              return; // Erfolgreicher Fall, Funktion beenden
            } else if (retryCount < maxRetries) {
              // Exponentielles Backoff für Wartezeiten
              const waitTime = Math.pow(2, retryCount) * 1000;
              console.log(`Keine Items gefunden, warte ${waitTime}ms vor nächstem Versuch...`);
              setTimeout(() => loadOrderItems(retryCount + 1, maxRetries), waitTime);
            } else {
              // Fallback: Wenn keine Items geladen werden konnten, selectedProducts verwenden
              console.log("Keine Items geladen nach mehreren Versuchen, verwende selectedProducts als Fallback");
              if (selectedProducts.length > 0) {
                const fallbackOrderData = {
                  ...existingOrderData,
                  items: selectedProducts,
                  orderItems: selectedProducts
                };
                setExistingOrderData(fallbackOrderData);
                
                // E-Mail-Vorbereitung
                prepareOrderEmail(fallbackOrderData);
              } else {
                throw new Error("Keine Bestellpositionen gefunden");
              }
            }
          } catch (error) {
            console.error("Fehler beim Laden der Bestellpositionen:", error);
            
            if (retryCount < maxRetries) {
              // Bei Fehler erneut versuchen mit Backoff
              const waitTime = Math.pow(2, retryCount) * 1000;
              console.log(`Fehler beim Laden, warte ${waitTime}ms vor nächstem Versuch...`);
              setTimeout(() => loadOrderItems(retryCount + 1, maxRetries), waitTime);
            } else {
              // Nach allen Versuchen Fehlermeldung anzeigen
              toast({
                title: 'Fehler beim Laden der Bestellpositionen',
                description: 'Die Bestellpositionen konnten nicht geladen werden.',
                variant: 'destructive',
              });
            }
          }
        };
        
        // Starte den Ladevorgang
        loadOrderItems();
      } else {
        console.log("Bestellung hat bereits Items:", hasItems);
        // E-Mail vorbereiten, da Items bereits vorhanden sind
        prepareOrderEmail(existingOrderData);
      }
    }
  }, [step, existingOrderData, orderId, queryClient, selectedProducts, toast]);
  
  // Render the appropriate step content
  const renderContent = () => {
    switch (step) {
      case 'overview':
        return (
          <OrdersOverview 
            onSelectOrder={handleSelectOrder}
            onStartWarehouseReceiptProcess={handleReceiveOrder}
            onCreateNew={() => {
              // Setze alle Werte zurück
              setWarehouseId(null);
              setWarehouseName('');
              setOrderMode('new');
              setSourceOrderId(null);
              setSupplierId(null);
              setSupplierName('');
              setSelectedProducts([]);
              setAdditionalInfo({
                expectedDeliveryDate: null,
                priority: 'normal',
                notes: '',
              });
              setExistingOrderData(null);
              setOrderId(null);
              setOrderNumber('');
              
              // Zur Lager-Auswahl wechseln
              setStep('warehouse');
            }}
          />
        );
      case 'warehouse':
        return (
          <>
            <div className="mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/bestellungen')}
                className="gap-2 text-muted-foreground"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Zurück zur Übersicht
              </Button>
            </div>
            <WarehouseSelector
              selectedWarehouseId={warehouseId}
              onSelectWarehouse={(id, name) => {
                setWarehouseId(id);
                setWarehouseName(name);
                setStep('mode');
              }}
            />
          </>
        );
      case 'mode':
        return (
          <>
            <div className="mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('warehouse')}
                className="gap-2 text-muted-foreground"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Zurück zur Lagerauswahl
              </Button>
            </div>
            <OrderModeSelector
              mode={orderMode}
              onSelectMode={(mode) => {
                setOrderMode(mode);
                setSourceOrderId(null);
                setStep('supplier');
              }}
              sourceOrderId={sourceOrderId}
              onSourceOrderChange={(id) => setSourceOrderId(id)}
            />
          </>
        );
      case 'supplier':
        return (
          <>
            <div className="mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('mode')}
                className="gap-2 text-muted-foreground"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Zurück zur Bestellmodus-Auswahl
              </Button>
            </div>
            <SupplierSelector
              selectedSupplierId={supplierId}
              onSelectSupplier={(id, name) => {
                setSupplierId(id);
                setSupplierName(name);
                setStep('products');
              }}
            />
          </>
        );
      case 'products':
        return (
          <ProductSelectionTable
            supplierId={supplierId}
            warehouseId={warehouseId}
            sourceOrderId={sourceOrderId}
            mode={orderMode}
            selectedProducts={selectedProducts}
            setSelectedProducts={setSelectedProducts}
            onNext={() => setStep('additionalInfo')}
            onBack={() => setStep('supplier')}
          />
        );
      case 'additionalInfo':
        return (
          <AdditionalInfoForm
            value={additionalInfo}
            onChange={setAdditionalInfo}
            onNext={() => setStep('summary')}
            onBack={() => setStep('products')}
          />
        );
      case 'summary':
        return (
          <OrderSummary
            warehouseName={warehouseName}
            supplierName={supplierName}
            products={selectedProducts}
            additionalInfo={additionalInfo}
            onBack={() => setStep('additionalInfo')}
            onSubmit={() => {
              console.log("Übermittle Bestellung mit folgenden Daten:");
              console.log("- Lager:", warehouseId, warehouseName);
              console.log("- Lieferant:", supplierId, supplierName);
              console.log("- Produktanzahl:", selectedProducts.length);
              console.log("- Zusatzinfos:", additionalInfo);
              
              if (!warehouseId || !supplierId) {
                toast({
                  title: 'Fehler',
                  description: 'Bitte wählen Sie ein Lager und einen Lieferanten aus.',
                  variant: 'destructive',
                });
                return;
              }
              
              if (selectedProducts.length === 0) {
                toast({
                  title: 'Keine Produkte ausgewählt',
                  description: 'Bitte wählen Sie mindestens ein Produkt aus.',
                  variant: 'destructive',
                });
                return;
              }
              
              // Bestellung erstellen
              createOrderMutation.mutate({
                warehouseId,
                supplierId,
                expectedDeliveryDate: additionalInfo?.expectedDeliveryDate || null,
                priority: additionalInfo?.priority || 'normal',
                notes: additionalInfo?.notes || '',
                items: selectedProducts.map(product => ({
                  productId: product.id,
                  quantity: product.orderQuantity,
                  price: product.price,
                  discountPercent: 0,
                  notes: product.orderNotes || ''
                }))
              });
            }}
            isSubmitting={createOrderMutation.isPending}
          />
        );
      case 'sendOrder':
        return (
          <>
            <div className="mb-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  // Wenn es eine neue Bestellung ist, gehen wir zurück zur Zusammenfassung
                  if (createOrderMutation.isPending || createOrderMutation.isSuccess) {
                    setStep('summary');
                  } else {
                    // Ansonsten zurück zur Übersicht
                    setStep('overview');
                  }
                }}
                size="sm"
              >
                <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                Zurück
              </Button>
            </div>
            
            <OrderEmailPage
              orderId={orderId}
              supplierEmail={existingOrderData?.supplierEmail || ''}
              orderNumber={orderNumber}
              supplierName={supplierName}
              onSendEmail={handleSendEmail}
              onBack={() => {
                if (orderMode === 'new') {
                  setStep('summary');
                } else {
                  setStep('overview');
                }
              }}
              onNext={() => setStep('overview')}
            />
          </>
        );
      case 'goodsReceipt':
        return (
          <GoodsReceiptForm
            orderId={orderId!}
            onSubmit={(receiptData) => {
              // Prüfen, ob alle Positionen geprüft wurden
              const allItemsChecked = receiptData.items.every(item => 
                item.quantityDelivered !== null && item.quantityDelivered !== undefined
              );
              
              if (!allItemsChecked) {
                toast({
                  title: 'Nicht alle Positionen geprüft',
                  description: 'Bitte prüfen Sie alle Positionen der Lieferung.',
                  variant: 'destructive',
                });
                return;
              }
              
              goodsReceiptMutation.mutate({
                orderId,
                ...receiptData
              });
            }}
            onBack={() => setStep('sendOrder')}
            isSubmitting={goodsReceiptMutation.isPending}
          />
        );
      case 'warehouseReceiptOfExistingOrder':
        if (isLoadingOrder) {
          return (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Bestellung wird geladen...</span>
            </div>
          );
        }
        
        if (!existingOrderData) {
          return (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fehler</AlertTitle>
              <AlertDescription>
                Die Bestellung konnte nicht geladen werden. Bitte versuchen Sie es erneut.
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setStep('overview')}
                    size="sm"
                  >
                    Zurück zur Übersicht
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          );
        }
        
        return (
          <>
            <div className="mb-4">
              <Button 
                variant="outline" 
                onClick={() => setStep('overview')}
                size="sm"
              >
                <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                Zurück zur Übersicht
              </Button>
            </div>
            
            <GoodsReceiptForm
              orderId={orderId!}
              onSubmit={(receiptData) => {
                // Prüfen, ob alle Positionen geprüft wurden
                const allItemsChecked = receiptData.items.every(item => 
                  item.quantityDelivered !== null && item.quantityDelivered !== undefined
                );
                
                if (!allItemsChecked) {
                  toast({
                    title: 'Nicht alle Positionen geprüft',
                    description: 'Bitte prüfen Sie alle Positionen der Lieferung.',
                    variant: 'destructive',
                  });
                  return;
                }
                
                goodsReceiptMutation.mutate({
                  orderId,
                  ...receiptData
                });
              }}
              onBack={() => setStep('overview')}
              isSubmitting={goodsReceiptMutation.isPending}
            />
          </>
        );
      default:
        return (
          <div>
            <h2>Unbekannter Schritt</h2>
            <Button onClick={() => setStep('overview')}>
              Zurück zur Übersicht
            </Button>
          </div>
        );
    }
  };

  // Bestimme den aktuellen Schritt für die Fortschrittsanzeige
  const getCurrentIndex = () => {
    switch (step) {
      case 'overview': return 0;
      case 'warehouse': return 1;
      case 'mode': return 2;
      case 'supplier': return 3;
      case 'products': return 4;
      case 'additionalInfo': return 5;
      case 'summary': return 6;
      case 'sendOrder': return 7;
      case 'goodsReceipt': return 8;
      case 'warehouseReceiptOfExistingOrder': return 8;
      default: return 0;
    }
  };
  
  // Bestimme Schritte basierend auf dem aktuellen Workflow
  const getSteps = () => {
    // Standard-Bestellworkflow
    if (step !== 'warehouseReceiptOfExistingOrder' && step !== 'overview') {
      return [
        { title: "Lager", icon: <Building2 className="h-4 w-4" /> },
        { title: "Art", icon: <Mail className="h-4 w-4" /> },
        { title: "Lieferant", icon: <Truck className="h-4 w-4" /> },
        { title: "Produkte", icon: <Package className="h-4 w-4" /> },
        { title: "Details", icon: <ClipboardList className="h-4 w-4" /> },
        { title: "Übersicht", icon: <ClipboardCheck className="h-4 w-4" /> },
        { title: "Versand", icon: <Send className="h-4 w-4" /> },
        { title: "Wareneingang", icon: <Boxes className="h-4 w-4" /> }
      ];
    }
    
    // Spezialfall: Direkter Wareneingang einer existierenden Bestellung
    if (step === 'warehouseReceiptOfExistingOrder') {
      return [
        { title: "Übersicht", icon: <ClipboardCheck className="h-4 w-4" /> },
        { title: "Wareneingang", icon: <Boxes className="h-4 w-4" /> }
      ];
    }
    
    // Übersichtsseite hat keine Steps
    return [];
  };
  
  const showSteps = step !== 'overview';
  const steps = getSteps();
  const currentIndex = getCurrentIndex();
  
  return (
    <div className="container py-6 mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">
          {step === 'overview' ? 'Bestellungen' : 'Neue Bestellung'}
          {orderId && step !== 'overview' && (
            <Badge variant="outline" className="ml-2">
              {orderNumber || `#${orderId}`}
            </Badge>
          )}
        </h1>
      </div>
      
      {showSteps && steps.length > 0 && (
        <div className="mb-8">
          <Steps
            steps={steps}
            currentIndex={step === 'warehouseReceiptOfExistingOrder' ? 1 : currentIndex}
            orientation="horizontal"
          />
        </div>
      )}
      
      {renderContent()}
      
      {showEmailDialog && (
        <OrderEmailDialog
          orderId={orderId}
          supplierEmail={existingOrderData?.supplierEmail || ''}
          orderNumber={orderNumber}
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          onSendEmail={handleSendEmail}
        />
      )}
    </div>
  );
};

export default BestellungV2;