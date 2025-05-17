import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { orderKeys, supplierKeys, warehouseKeys, productKeys } from '@/lib/queryKeys';
import { orderPDFTemplate, formatDate, calculateTotalPrice, formatPrice } from '@/components/orders/PDFTemplate';
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
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
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
      
      // Generiere PDF, nachdem die Bestellung erstellt wurde
      generateOrderPDF(data);
      
      // Gehe zum nächsten Schritt (summary)
      setStep('summary');
      
      // Invalidiere den Cache für Bestellungslisten mit der zentralen Query-Key Struktur
      queryClient.invalidateQueries({queryKey: orderKeys.lists()});
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
  
  // Fetch order data if orderId exists
  const { 
    data: order,
    isLoading: isLoadingOrder,
    isError: isErrorOrder,
    error: orderError
  } = useQuery({
    queryKey: orderKeys.detail(orderId || 0),
    enabled: !!orderId,
    queryFn: () => apiRequest(`/api/orders/${orderId}`),
  });
  
  // Initialize from URL params if any
  useEffect(() => {
    const orderId = params?.orderId ? parseInt(params.orderId) : null;
    if (orderId) {
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
      
      // Generiere PDF für existierende Bestellung nur wenn die vollständigen Daten vorliegen
      if (order.items && Array.isArray(order.items) && step === 'warehouseReceiptOfExistingOrder') {
        try {
          generateOrderPDF(order);
        } catch (error) {
          console.error('Fehler beim Generieren des PDFs:', error);
          toast({
            title: 'PDF-Erstellung fehlgeschlagen',
            description: 'Die PDF-Vorschau konnte nicht erstellt werden. Vollständige Bestelldaten werden nachgeladen.',
            variant: 'destructive',
          });
        }
      }
    }
  }, [order, step]);
  
  // Function to generate PDF from order data
  const generateOrderPDF = async (orderData: any) => {
    try {
      const pdfContent = orderPDFTemplate(orderData);
      
      // Erstelle ein div-Element mit dem PDF-Inhalt
      const element = document.createElement('div');
      element.innerHTML = pdfContent;
      element.style.width = '210mm'; // A4 Breite
      element.style.padding = '10mm';
      element.style.visibility = 'hidden';
      document.body.appendChild(element);
      
      // Rendere das Element zu einem Canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Höhere Qualität
        useCORS: true,
        logging: false
      });
      
      // Erstelle ein PDF aus dem Canvas
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 Breite in mm
      const imgHeight = canvas.height * imgWidth / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
      // Speichere das PDF als Blob
      const blob = pdf.output('blob');
      setPdfBlob(blob);
      
      // Entferne das temporäre Element
      document.body.removeChild(element);
    } catch (error) {
      console.error('Fehler beim Generieren des PDFs:', error);
      toast({
        title: 'Fehler beim Generieren des PDFs',
        description: 'Die PDF-Vorschau konnte nicht erstellt werden.',
        variant: 'destructive',
      });
    }
  };
  
  // Define step information
  const stepInfo: {[key in OrderStep]: {title: string, description: string}} = {
    overview: {
      title: 'Bestellungsübersicht',
      description: 'Alle Bestellungen im Überblick'
    },
    warehouse: {
      title: 'Lager auswählen',
      description: 'Wählen Sie das Ziellager für diese Bestellung'
    },
    mode: {
      title: 'Bestellungsart',
      description: 'Neue Bestellung, Kopie oder Prognose'
    },
    supplier: {
      title: 'Lieferant',
      description: 'Wählen Sie den Lieferanten für diese Bestellung'
    },
    products: {
      title: 'Produkte',
      description: 'Wählen Sie die zu bestellenden Produkte'
    },
    additionalInfo: {
      title: 'Zusätzliche Informationen',
      description: 'Liefertermin und Anmerkungen'
    },
    summary: {
      title: 'Zusammenfassung',
      description: 'Bestellübersicht und Abschluss'
    },
    sendOrder: {
      title: 'Bestellung versenden',
      description: 'Versand der Bestellung an den Lieferanten'
    },
    goodsReceipt: {
      title: 'Wareneingang',
      description: 'Dokumentation des Wareneingangs'
    },
    warehouseReceiptOfExistingOrder: {
      title: 'Wareneingang',
      description: 'Wareneingang für bestehende Bestellung'
    }
  };
  
  // Find or select order handler
  const handleSelectOrder = (orderId: number) => {
    // Nur die ID setzen und den Schritt ändern
    setOrderId(orderId);
    // PDF wird generiert, nachdem die vollständigen Bestelldaten geladen wurden
    setStep('warehouseReceiptOfExistingOrder');
    // PDF wird in useEffect generiert, wenn order geladen ist
  };
  
  // Go back to overview
  const handleBackToOverview = () => {
    setStep('overview');
  };
  
  // Get step content
  const getStepContent = () => {
    switch (step) {
      case 'overview':
        return (
          <OrdersOverview
            onSelectOrder={handleSelectOrder}
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
              setOrderId(null);
              setOrderNumber('');
              setExistingOrderData(null);
              setPdfBlob(null);
              
              // Starte mit der Lagerauswahl
              setStep('warehouse');
            }}
          />
        );
        
      case 'warehouse':
        return (
          <WarehouseSelector
            onSelectWarehouse={(id, name) => {
              setWarehouseId(id);
              setWarehouseName(name);
            }}
            selectedWarehouseId={warehouseId}
          />
        );
        
      case 'mode':
        return (
          <OrderModeSelector
            selectedMode={orderMode}
            onSelectMode={handleModeSelect}
          />
        );
        
      case 'supplier':
        return (
          <SupplierSelector
            onSelectSupplier={(id, name) => {
              setSupplierId(id);
              setSupplierName(name);
            }}
            selectedSupplierId={supplierId}
          />
        );
        
      case 'products':
        return (
          <ProductSelectionTable
            supplierId={supplierId}
            warehouseId={warehouseId}
            selectedProducts={selectedProducts}
            onChange={setSelectedProducts}
            sourceOrderId={sourceOrderId}
            orderMode={orderMode}
          />
        );
        
      case 'additionalInfo':
        return (
          <AdditionalInfoForm
            additionalInfo={additionalInfo}
            onChange={setAdditionalInfo}
          />
        );
        
      case 'summary':
        return (
          <OrderSummary
            warehouseName={warehouseName}
            supplierName={supplierName}
            selectedProducts={selectedProducts}
            additionalInfo={additionalInfo}
            orderData={existingOrderData}
            pdfBlob={pdfBlob}
            onCreateOrder={() => {
              const orderData = {
                warehouseId,
                supplierId,
                products: selectedProducts.map(p => ({
                  productId: p.id,
                  quantity: p.quantity,
                  price: p.price || 0
                })),
                expectedDeliveryDate: additionalInfo.expectedDeliveryDate ? formatDate(additionalInfo.expectedDeliveryDate) : null,
                priority: additionalInfo.priority,
                notes: additionalInfo.notes,
                orderMode,
                sourceOrderId,
              };
              
              createOrderMutation.mutate(orderData);
            }}
            isCreatingOrder={createOrderMutation.isPending}
            onSendOrderEmail={() => setStep('sendOrder')}
            orderId={orderId}
          />
        );
        
      case 'sendOrder':
        return (
          <OrderEmailPage
            orderId={orderId}
            orderNumber={orderNumber}
            supplierName={supplierName}
            supplierEmail={existingOrderData?.supplierEmail || ''}
            pdfBlob={pdfBlob}
            onBack={() => setStep('summary')}
            onNext={() => {
              // Nach dem E-Mail-Versand zur Wareneingangsseite wechseln
              setStep('goodsReceipt');
            }}
          />
        );
        
      case 'goodsReceipt':
        return (
          <GoodsReceiptForm
            orderId={orderId}
            orderData={existingOrderData}
            onSaveComplete={() => {
              toast({
                title: 'Wareneingang gespeichert',
                description: 'Der Wareneingang wurde erfolgreich dokumentiert.',
              });
              
              // Invalidiere den Cache für Bestellungen mit zentralisierten Keys
              queryClient.invalidateQueries({queryKey: orderKeys.lists()});
              queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId || 0)});
              
              // Zurück zur Übersicht
              setStep('overview');
            }}
          />
        );
        
      case 'warehouseReceiptOfExistingOrder':
        // Warten auf Bestellungsdaten
        if (isLoadingOrder) {
          return (
            <Card>
              <CardContent className="py-10">
                <div className="text-center">
                  <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-4" />
                  <h3 className="text-lg font-medium mb-2">Bestelldaten werden geladen...</h3>
                  <p className="text-muted-foreground">
                    Bitte warten Sie, während die Bestellungsdaten geladen werden.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        }
        
        // Zeige Fehlermeldung bei Ladefehlern
        if (isErrorOrder) {
          return (
            <Card>
              <CardContent className="py-10">
                <div className="text-center">
                  <AlertTriangle className="h-10 w-10 mx-auto text-destructive mb-4" />
                  <h3 className="text-lg font-medium mb-2">Fehler beim Laden der Bestellung</h3>
                  <p className="text-muted-foreground mb-4">
                    Die Bestelldaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
                  </p>
                  <Button onClick={() => window.location.reload()}>Neu laden</Button>
                </div>
              </CardContent>
            </Card>
          );
        }
        
        console.log("Rendering GoodsReceiptForm with order data:", order);
        return (
          <GoodsReceiptForm
            order={order}
            onSubmit={(receivedItems, receiptNote, documents) => {
              // Hier die Logik zum Speichern der empfangenen Artikel implementieren
              console.log("Empfangene Artikel:", receivedItems);
              console.log("Notiz:", receiptNote);
              console.log("Dokumente:", documents);
              
              // API-Aufruf zum Speichern des Wareneingangs hier implementieren
              // z.B. apiRequest(`/api/orders/${orderId}/receipt`, 'POST', { items: receivedItems, note: receiptNote })
              
              toast({
                title: 'Wareneingang gespeichert',
                description: 'Der Wareneingang wurde erfolgreich dokumentiert.',
              });
              
              // Invalidiere den Cache für Bestellungen mit zentralisierten Keys
              queryClient.invalidateQueries({queryKey: orderKeys.lists()});
              queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId || 0)});
              
              // Zurück zur Übersicht
              setStep('overview');
            }}
            isSubmitting={false}
          />
        );
        
      default:
        return <div>Unbekannter Schritt</div>;
    }
  };
  
  // Check if the step is complete
  const isStepComplete = (currentStep: OrderStep): boolean => {
    switch (currentStep) {
      case 'warehouse':
        return warehouseId !== null;
      case 'mode':
        return orderMode !== null;
      case 'supplier':
        return supplierId !== null;
      case 'products':
        return selectedProducts.length > 0;
      case 'additionalInfo':
        return additionalInfo.expectedDeliveryDate !== null;
      case 'summary':
        return true;
      case 'sendOrder':
        return true;
      case 'goodsReceipt':
        return true;
      case 'warehouseReceiptOfExistingOrder':
        return true;
      case 'overview':
        return true;
      default:
        return false;
    }
  };
  
  // Get the next step
  const getNextStep = (currentStep: OrderStep): OrderStep | null => {
    switch (currentStep) {
      case 'warehouse':
        return 'mode';
      case 'mode':
        return 'supplier';
      case 'supplier':
        return 'products';
      case 'products':
        return 'additionalInfo';
      case 'additionalInfo':
        return 'summary';
      case 'summary':
        return 'sendOrder';
      case 'sendOrder':
        return 'goodsReceipt';
      default:
        return null;
    }
  };
  
  // Move to the next step
  const goToNextStep = () => {
    const nextStep = getNextStep(step);
    if (nextStep) {
      setStep(nextStep);
    }
  };
  
  // Get the previous step
  const getPreviousStep = (currentStep: OrderStep): OrderStep | null => {
    switch (currentStep) {
      case 'mode':
        return 'warehouse';
      case 'supplier':
        return 'mode';
      case 'products':
        return 'supplier';
      case 'additionalInfo':
        return 'products';
      case 'summary':
        return 'additionalInfo';
      case 'sendOrder':
        return 'summary';
      case 'goodsReceipt':
        return 'sendOrder';
      default:
        return null;
    }
  };
  
  // Move to the previous step
  const goToPreviousStep = () => {
    const prevStep = getPreviousStep(step);
    if (prevStep) {
      setStep(prevStep);
    }
  };
  
  // Handle order mode selection
  const handleModeSelect = (mode: OrderMode) => {
    setOrderMode(mode);
    
    // Wenn "Kopie" ausgewählt ist, eine existierende Bestellung kopieren
    if (mode === 'copy') {
      // Hier könnte später eine Bestellungsauswahl erfolgen
      setSourceOrderId(null); // Vorerst keine Quellbestellung
    } else {
      setSourceOrderId(null);
    }
  };
  
  // Render the component
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Bestellungen</h1>
        
        {step !== 'overview' && (
          <Button 
            variant="outline" 
            onClick={handleBackToOverview}
          >
            Zurück zur Übersicht
          </Button>
        )}
      </div>
      
      {/* Schritt-Anzeige nur anzeigen, wenn wir nicht in der Übersicht sind */}
      {step !== 'overview' && step !== 'warehouseReceiptOfExistingOrder' && (
        <Card>
          <CardContent className="pt-6">
            <Steps 
              currentStep={
                ['warehouse', 'mode', 'supplier', 'products', 'additionalInfo', 'summary', 'sendOrder', 'goodsReceipt']
                .indexOf(step)
              }
              steps={[
                {
                  title: "Lager",
                  description: warehouseName || "Ziellager auswählen"
                },
                {
                  title: "Modus",
                  description: orderMode === 'new' ? "Neue Bestellung" : orderMode === 'copy' ? "Kopie" : "Prognose"
                },
                {
                  title: "Lieferant",
                  description: supplierName || "Lieferant auswählen"
                },
                {
                  title: "Produkte",
                  description: `${selectedProducts.length} Produkte ausgewählt`
                },
                {
                  title: "Details",
                  description: additionalInfo.expectedDeliveryDate ? format(additionalInfo.expectedDeliveryDate, 'dd.MM.yyyy') : "Lieferdetails"
                },
                {
                  title: "Abschluss",
                  description: "Bestellung abschließen"
                },
                {
                  title: "E-Mail",
                  description: "Bestellung versenden"
                },
                {
                  title: "Wareneingang",
                  description: "Wareneingang erfassen"
                }
              ]}
              goToStep={(index) => {
                const steps = ['warehouse', 'mode', 'supplier', 'products', 'additionalInfo', 'summary', 'sendOrder', 'goodsReceipt'];
                // Only allow going to steps that are valid based on current progress
                if (
                  (index === 0) || // Always allow going to first step
                  (index === 1 && warehouseId) || // Mode requires warehouse
                  (index === 2 && warehouseId && orderMode) || // Supplier requires warehouse and mode
                  (index === 3 && warehouseId && orderMode && supplierId) || // Products require supplier
                  (index === 4 && warehouseId && orderMode && supplierId && selectedProducts.length > 0) || // Details require products
                  (index === 5 && warehouseId && orderMode && supplierId && selectedProducts.length > 0 && additionalInfo.expectedDeliveryDate) || // Summary requires details
                  (index === 6 && orderId) || // SendOrder requires an orderId
                  (index === 7 && orderId && order?.sentAt) // GoodsReceipt requires a sent order
                ) {
                  setStep(steps[index] as OrderStep);
                }
              }}
              allowStepClick={true}
            />
          </CardContent>
        </Card>
      )}
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{stepInfo[step]?.title || 'Bestellungen'}</CardTitle>
          <CardDescription>{stepInfo[step]?.description || 'Verwalten Sie Ihre Bestellungen'}</CardDescription>
        </CardHeader>
        <CardContent>
          {getStepContent()}
        </CardContent>
        <CardFooter className="flex justify-between">
          {/* In der Übersicht keine Navigation anzeigen */}
          {step !== 'overview' && step !== 'warehouseReceiptOfExistingOrder' && (
            <>
              {step !== 'warehouse' && step !== 'goodsReceipt' && (
                <Button
                  variant="outline"
                  onClick={goToPreviousStep}
                >
                  Zurück
                </Button>
              )}
              {step === 'warehouse' && (
                <div></div>
              )}
              
              {step !== 'summary' && step !== 'goodsReceipt' && (
                <Button
                  onClick={goToNextStep}
                  disabled={!isStepComplete(step)}
                >
                  Weiter
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </>
          )}
          
          {/* In der Übersicht Zurück-Button zur vorherigen Seite */}
          {(step === 'overview' || step === 'warehouseReceiptOfExistingOrder') && (
            <div className="w-full flex justify-end">
              {step === 'warehouseReceiptOfExistingOrder' && (
                <Button 
                  variant="outline" 
                  onClick={handleBackToOverview}
                >
                  Zurück zur Übersicht
                </Button>
              )}
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default BestellungV2;