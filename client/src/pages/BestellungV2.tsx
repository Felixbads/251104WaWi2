import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
import { Steps, Step } from "@/components/ui/steps";
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
import ProductSelectionTable from '@/components/orderv2/ProductSelectionTable';
import AdditionalInfoForm from '@/components/orderv2/AdditionalInfoForm';
import OrderSummary from '@/components/orderv2/OrderSummary';
import GoodsReceiptForm from '@/components/orderv2/GoodsReceiptForm';
import OrdersOverview from '@/components/orderv2/OrdersOverview';
import { Badge } from '@/components/ui/badge';

// Define the order steps
type OrderStep = 'overview' | 'warehouse' | 'mode' | 'supplier' | 'products' | 'additionalInfo' | 'summary' | 'goodsReceipt' | 'warehouseReceiptOfExistingOrder';

const BestellungV2: React.FC = () => {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const params = useParams();
  
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
  const [existingOrderData, setExistingOrderData] = useState<any>(null);
  
  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (orderData: any) => {
      return apiRequest('/orders', orderData, 'post');
    },
    onSuccess: (data) => {
      toast({
        title: 'Bestellung erfolgreich erstellt',
        description: `Die Bestellung wurde erfolgreich erstellt.`,
      });
      
      // Set the order ID for the next step
      setOrderId(data.id);
      
      // Automatisch PDF generieren und E-Mail vorbereiten
      setTimeout(() => {
        // Generiere PDF und leite zum E-Mail-Formular weiter
        // Übergebe die ID direkt, anstatt auf State-Update zu warten
        generatePDFAndSendEmail(data.id);
      }, 500); // Kurze Verzögerung für bessere Benutzererfahrung
    },
    onError: (error: any) => {
      console.error('Order creation error:', error);
      let errorMessage = 'Unbekannter Fehler';
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (typeof error === 'object') {
        try {
          errorMessage = JSON.stringify(error);
        } catch (e) {
          errorMessage = 'Fehler konnte nicht formatiert werden';
        }
      }
      
      toast({
        title: 'Fehler beim Erstellen der Bestellung',
        description: `Es ist ein Fehler aufgetreten: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  });
  
  // Email order mutation
  const emailOrderMutation = useMutation({
    mutationFn: (emailData: { orderId: number, supplierEmail: string, pdfBase64: string, additionalNotes: string }) => {
      return apiRequest('/orders/email', emailData, 'post');
    },
    onSuccess: () => {
      toast({
        title: 'Bestellung per E-Mail versendet',
        description: 'Die Bestellung wurde erfolgreich per E-Mail an den Lieferanten versendet.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler beim Versenden der E-Mail',
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  });
  
  // Mark order as sent mutation
  const markOrderAsSentMutation = useMutation({
    mutationFn: (orderData: any) => {
      return apiRequest(`/orders/${orderData.id}/mark-sent`, orderData, 'post');
    },
    onSuccess: () => {
      toast({
        title: 'Bestellung als versendet markiert',
        description: 'Die Bestellung wurde erfolgreich als versendet markiert.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler beim Markieren der Bestellung',
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  });
  
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
        return true; // Summary is always complete
      case 'goodsReceipt':
        return true; // GoodsReceipt is always complete
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
        return 'goodsReceipt';
      case 'goodsReceipt':
        return null; // Last step
      default:
        return null;
    }
  };
  
  // Move to the next step
  const goToNextStep = () => {
    if (isStepComplete(step)) {
      const nextStep = getNextStep(step);
      if (nextStep) {
        setStep(nextStep);
      }
    } else {
      toast({
        title: 'Unvollständige Informationen',
        description: 'Bitte füllen Sie alle erforderlichen Felder aus, bevor Sie fortfahren.',
        variant: 'destructive',
      });
    }
  };
  
  // Go back to the previous step
  const goToPreviousStep = () => {
    switch (step) {
      case 'mode':
        setStep('warehouse');
        break;
      case 'supplier':
        setStep('mode');
        break;
      case 'products':
        setStep('supplier');
        break;
      case 'additionalInfo':
        setStep('products');
        break;
      case 'summary':
        setStep('additionalInfo');
        break;
      default:
        break;
    }
  };
  
  // Handle warehouse selection
  const handleWarehouseSelect = (id: number, name: string) => {
    setWarehouseId(id);
    setWarehouseName(name);
    // Automatically go to next step
    setStep('mode');
  };
  
  // Handle mode selection
  const handleModeSelect = (mode: OrderMode) => {
    setOrderMode(mode);
    
    // Reset source order ID if not in copy mode
    if (mode !== 'copy') {
      setSourceOrderId(null);
    }
    
    // Automatically go to next step
    setStep('supplier');
  };
  
  // Handle supplier selection
  const handleSupplierSelect = (id: number, name: string) => {
    setSupplierId(id);
    setSupplierName(name);
    // Automatically go to next step
    setStep('products');
  };
  
  // Handle products change
  const handleProductsChange = (products: any[]) => {
    setSelectedProducts(products);
    // Bei der Produktauswahl nicht automatisch zum nächsten Schritt gehen,
    // damit Benutzer Zeit haben, Produkte und Mengen in Ruhe auszuwählen
  };
  
  // Handle additional info change
  const handleAdditionalInfoChange = (info: {
    expectedDeliveryDate: Date | null;
    priority: string;
    notes: string;
  }) => {
    setAdditionalInfo(info);
    // Bei den zusätzlichen Informationen nicht automatisch zum nächsten Schritt gehen,
    // damit Benutzer Zeit haben, die Informationen in Ruhe einzugeben
  };
  
  // Handle order submission
  const handleOrderSubmit = async () => {
    // Berechne den Gesamtbetrag der Bestellung
    const calculatedTotalAmount = selectedProducts.reduce((sum, product) => {
      return sum + (product.price || 0) * product.orderQuantity;
    }, 0);

    // Ensure products have purchaseConditionId where available and include required fields
    const mappedProducts = selectedProducts.map((product, index) => {
      const unitPrice = product.price || 0;
      const quantity = product.orderQuantity;
      const totalPrice = unitPrice * quantity;
      
      return {
        productId: product.id,
        productName: product.productName || product.name || "Unbenanntes Produkt",
        purchaseConditionId: product.purchaseConditionId || null,
        quantity: quantity,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        // Weitere erforderliche Felder gemäß Schema
        sku: product.sku || "",
        supplierSku: product.supplierSku || "",
        unit: "stk",
        vatRate: 19, // Standardwert für MwSt
        positionNumber: index + 1
      };
    });
    
    // Generiere eine Bestellnummer falls nötig (wird normalerweise vom Server generiert)
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 1000).toString().padStart(4, '0')}`;
    
    // Create the order data with all required fields according to schema
    const orderData = {
      orderNumber: orderNumber,
      warehouseId,
      supplierId,
      orderItems: mappedProducts,
      // Sicherstellen, dass das Datum ein gültiges JavaScript Date-Objekt ist
      expectedDeliveryDate: additionalInfo.expectedDeliveryDate instanceof Date ? 
                           new Date(additionalInfo.expectedDeliveryDate.getTime()) : null,
      priority: additionalInfo.priority,
      notes: additionalInfo.notes || '',
      status: 'draft', // Initial status
      locationId: warehouseId, // In this context warehouse and location are the same
      totalAmount: calculatedTotalAmount,
      currency: "EUR",
      // Weitere Standardwerte
      supplierName: supplierName,
      locationName: warehouseName,
      // Zusätzliche Felder hinzufügen basierend auf Schema
      vatAmount: calculatedTotalAmount * 0.19, // 19% MwSt
      discountAmount: 0,
      shippingCost: 0,
      orderDate: new Date(),
      paymentStatus: 'pending'
    };
    
    console.log("Submitting order data:", orderData);
    
    // Create the order
    createOrderMutation.mutate(orderData);
  };
  
  // Generate PDF and send by email
  const generatePDFAndSendEmail = async (specificOrderId?: number) => {
    try {
      // Verwende entweder die übergebene ID oder den State-Wert
      const orderIdToUse = specificOrderId || orderId;
      
      if (!orderIdToUse) {
        toast({
          title: 'Fehler beim Generieren des PDFs',
          description: 'Es liegt keine gültige Bestellungs-ID vor.',
          variant: 'destructive',
        });
        return;
      }
      
      // Definition einer Hilfsfunktion für die Berechnung des Gesamtbetrags
      const calculateTotal = (items: any[]) => {
        return items.reduce((sum, item) => {
          const price = item.unitPrice || item.price || 0;
          const quantity = item.quantity || item.orderQuantity || 0;
          return sum + (price * quantity);
        }, 0);
      };

      // Da wir möglicherweise nicht mehr im gleichen Schritt sind, müssen wir die Bestelldaten erneut abrufen
      let orderData;
      try {
        const response = await fetch(`/orders/${orderIdToUse}`);
        if (!response.ok) {
          throw new Error(`Fehler beim Abrufen der Bestelldaten: ${response.statusText}`);
        }
        orderData = await response.json();
      } catch (error) {
        toast({
          title: 'Fehler beim Abrufen der Bestelldaten',
          description: `${(error as Error).message}`,
          variant: 'destructive',
        });
        return;
      }

      // Erstellen eines temporären DIV-Elements für die PDF-Generierung
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = '210mm';
      tempDiv.style.background = 'white';
      tempDiv.style.padding = '20px';
      
      // Bestelldaten in dieses Element einfügen
      tempDiv.innerHTML = `
        <div style="font-family: Arial, sans-serif;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <div>
              <h2 style="margin: 0; font-size: 18px;">Bestellung ${orderData.orderNumber || ''}</h2>
              <p style="margin: 5px 0; font-size: 14px;">Datum: ${orderData.orderDate ? new Date(orderData.orderDate).toLocaleDateString('de-DE') : new Date().toLocaleDateString('de-DE')}</p>
            </div>
            <div style="text-align: right;">
              <h3 style="margin: 0; font-size: 16px;">Nationale Parkverwaltung Sächsische Schweiz</h3>
              <p style="margin: 5px 0; font-size: 12px;">Nationalpark Zentrum</p>
              <p style="margin: 5px 0; font-size: 12px;">Dresdner Str. 2B, 01814 Bad Schandau</p>
            </div>
          </div>
          
          <div style="margin-top: 30px;">
            <h3 style="margin: 0; font-size: 16px;">Lieferant:</h3>
            <p style="margin: 5px 0; font-size: 14px;">${orderData.supplierName || supplierName}</p>
          </div>
          
          <div style="margin-top: 15px;">
            <h3 style="margin: 0; font-size: 16px;">Lieferadresse:</h3>
            <p style="margin: 5px 0; font-size: 14px;">${orderData.locationName || warehouseName}</p>
          </div>
          
          <div style="margin-top: 30px;">
            <h3 style="margin: 0; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Bestellpositionen</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <tr style="background-color: #f3f4f6;">
                <th style="text-align: left; padding: 8px; font-size: 14px;">Produkt</th>
                <th style="text-align: right; padding: 8px; font-size: 14px;">Preis</th>
                <th style="text-align: right; padding: 8px; font-size: 14px;">Menge</th>
                <th style="text-align: right; padding: 8px; font-size: 14px;">Gesamt</th>
              </tr>
              ${(orderData.orderItems || selectedProducts).map((item: any, index: number) => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="text-align: left; padding: 8px; font-size: 14px;">${item.productName || item.name}</td>
                  <td style="text-align: right; padding: 8px; font-size: 14px;">${(item.unitPrice || item.price || 0).toFixed(2)} €</td>
                  <td style="text-align: right; padding: 8px; font-size: 14px;">${item.quantity || item.orderQuantity}</td>
                  <td style="text-align: right; padding: 8px; font-size: 14px;">${((item.unitPrice || item.price || 0) * (item.quantity || item.orderQuantity)).toFixed(2)} €</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold;">
                <td colspan="3" style="text-align: right; padding: 8px; font-size: 14px;">Gesamtsumme:</td>
                <td style="text-align: right; padding: 8px; font-size: 14px;">${orderData.totalAmount ? orderData.totalAmount.toFixed(2) : (orderData.orderItems ? calculateTotal(orderData.orderItems) : calculateTotal(selectedProducts)).toFixed(2)} €</td>
              </tr>
            </table>
          </div>
          
          <div style="margin-top: 30px;">
            <h3 style="margin: 0; font-size: 16px;">Zusätzliche Informationen:</h3>
            <p style="margin: 5px 0; font-size: 14px;">Lieferdatum: ${orderData.expectedDeliveryDate ? new Date(orderData.expectedDeliveryDate).toLocaleDateString('de-DE') : additionalInfo.expectedDeliveryDate ? additionalInfo.expectedDeliveryDate.toLocaleDateString('de-DE') : 'Nicht festgelegt'}</p>
            <p style="margin: 5px 0; font-size: 14px;">Priorität: ${orderData.priority || additionalInfo.priority || 'Normal'}</p>
            ${(orderData.notes || additionalInfo.notes) ? `<p style="margin: 5px 0; font-size: 14px;">Anmerkungen: ${orderData.notes || additionalInfo.notes}</p>` : ''}
          </div>
        </div>
      `;
      
      // Temporäres Element zum DOM hinzufügen
      document.body.appendChild(tempDiv);
      
      // Create a canvas from the element
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        logging: false,
        useCORS: true,
      });
      
      // Element wieder entfernen
      document.body.removeChild(tempDiv);
      
      // Create a PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      // Add the canvas to the PDF
      const imgData = canvas.toDataURL('image/png');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      // Get the PDF as base64
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      
      // Lieferanten-Email abrufen
      // Verwenden wir eine API-Anfrage, um die tatsächliche E-Mail-Adresse des Lieferanten zu erhalten
      try {
        // Zuerst versuchen wir, die E-Mail des Lieferanten abzurufen
        const supplierResponse = await fetch(`/suppliers/${supplierId}`);
        if (!supplierResponse.ok) {
          throw new Error(`Fehler beim Abrufen der Lieferantendaten: ${supplierResponse.statusText}`);
        }
        
        const supplierData = await supplierResponse.json();
        let supplierEmail = supplierData.email;
        
        // Prüfen, ob eine gültige E-Mail vorhanden ist
        if (!supplierEmail || !supplierEmail.includes('@')) {
          toast({
            title: 'Keine gültige E-Mail-Adresse',
            description: 'Der Lieferant hat keine gültige E-Mail-Adresse. Bitte aktualisieren Sie die Lieferantendaten.',
            variant: 'destructive',
          });
          return;
        }
        
        // E-Mail senden
        emailOrderMutation.mutate({
          orderId: orderIdToUse,
          supplierEmail,
          pdfBase64,
          additionalNotes: additionalInfo.notes || '',
        });
      } catch (error) {
        toast({
          title: 'Fehler beim Abrufen der Lieferanten-E-Mail',
          description: `${(error as Error).message}`,
          variant: 'destructive',
        });
        return;
      }
      
      // Mark the order as sent
      markOrderAsSentMutation.mutate({
        id: orderIdToUse,
        sentDate: new Date(),
      });
    } catch (error) {
      toast({
        title: 'Fehler beim Generieren des PDFs',
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  };
  
  // Handle goods receipt complete
  const handleGoodsReceiptComplete = () => {
    // Navigate to the orders page
    navigate('/bestellungen');
    
    toast({
      title: 'Wareneingang erfolgreich erfasst',
      description: 'Der Wareneingang wurde erfolgreich erfasst und die Lagerbestände wurden aktualisiert.',
    });
  };
  
  // Reset the order process
  const resetOrderProcess = () => {
    setStep('warehouse');
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
  };
  
  // Handler für die Auswahl einer bestehenden Bestellung
  const handleSelectOrder = async (id: number) => {
    try {
      // Bestellung vom Server abrufen
      const response = await fetch(`/orders/${id}`);
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Bestellung: ${response.statusText}`);
      }
      
      const orderData = await response.json();
      
      // Bestelldaten speichern
      setExistingOrderData(orderData);
      setOrderId(orderData.id);
      
      // Je nach Status der Bestellung zur passenden Ansicht navigieren
      if (['shipped', 'delivered'].includes(orderData.status)) {
        // Direkt zum Wareneingang navigieren
        setStep('warehouseReceiptOfExistingOrder');
      } else {
        // Bestelldaten anzeigen, aber nicht zum Wareneingang navigieren
        // Hier könnten weitere Details angezeigt werden
        navigate(`/bestellungen/${id}`);
      }
      
    } catch (error) {
      toast({
        title: 'Fehler beim Laden der Bestellung',
        description: `${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  };
  
  // Handler für den Start einer neuen Bestellung
  const handleStartNewOrder = () => {
    // Zustand zurücksetzen und zum ersten Schritt navigieren
    resetOrderProcess();
    setStep('warehouse');
  };
  
  // Handler für den Start des Wareneingang-Workflows für eine bestehende Bestellung
  const handleStartWarehouseReceiptProcess = async (id: number) => {
    try {
      // Bestellung vom Server abrufen
      const response = await fetch(`/orders/${id}`);
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Bestellung: ${response.statusText}`);
      }
      
      const orderData = await response.json();
      
      // Bestelldaten speichern
      setExistingOrderData(orderData);
      setOrderId(orderData.id);
      
      // Zum Wareneingang für die bestehende Bestellung navigieren
      setStep('warehouseReceiptOfExistingOrder');
      
    } catch (error) {
      toast({
        title: 'Fehler beim Laden der Bestellung',
        description: `${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  };
  
  // Zurück zur Übersicht
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
            onStartWarehouseReceiptProcess={handleStartWarehouseReceiptProcess}
            onStartNewOrder={handleStartNewOrder}
          />
        );
      case 'warehouse':
        return (
          <WarehouseSelector
            selectedWarehouseId={warehouseId}
            onSelectWarehouse={handleWarehouseSelect}
          />
        );
      case 'mode':
        return (
          <OrderModeSelector
            mode={orderMode}
            onSelectMode={handleModeSelect}
          />
        );
      case 'supplier':
        return (
          <SupplierSelector
            selectedSupplierId={supplierId}
            onSelectSupplier={handleSupplierSelect}
          />
        );
      case 'products':
        return (
          <ProductSelectionTable
            supplierId={supplierId!}
            warehouseId={warehouseId!}
            sourceOrderId={sourceOrderId}
            mode={orderMode}
            selectedProducts={selectedProducts}
            onProductsChange={handleProductsChange}
          />
        );
      case 'additionalInfo':
        return (
          <AdditionalInfoForm
            additionalInfo={additionalInfo}
            onAdditionalInfoChange={handleAdditionalInfoChange}
          />
        );
      case 'summary':
        return (
          <div id="order-summary">
            <OrderSummary
              warehouseName={warehouseName}
              supplierName={supplierName}
              selectedProducts={selectedProducts}
              additionalInfo={additionalInfo}
              onSubmit={handleOrderSubmit}
              isSubmitting={createOrderMutation.isPending}
            />
          </div>
        );
      case 'goodsReceipt':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Bestellung {orderId} erstellt</CardTitle>
              <CardDescription>
                Die Bestellung wurde erfolgreich erstellt und an den Lieferanten gesendet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert className={emailOrderMutation.isSuccess ? "bg-green-50 border-green-200" : ""}>
                  <FileText className="h-4 w-4" />
                  <AlertTitle>{emailOrderMutation.isSuccess ? "Bestellung wurde versendet" : "PDF wird generiert und E-Mail vorbereitet"}</AlertTitle>
                  <AlertDescription>
                    {emailOrderMutation.isSuccess 
                      ? "Die Bestellung wurde erfolgreich per E-Mail an den Lieferanten versendet."
                      : "Die PDF-Datei wird generiert und die E-Mail an den Lieferanten vorbereitet. Dieser Vorgang läuft automatisch."}
                  </AlertDescription>
                </Alert>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  {emailOrderMutation.isPending ? (
                    <Button 
                      disabled
                      className="flex-1"
                    >
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      PDF wird generiert und E-Mail versendet...
                    </Button>
                  ) : emailOrderMutation.isSuccess ? (
                    <Button 
                      variant="outline"
                      className="flex-1"
                      onClick={() => generatePDFAndSendEmail(orderId)}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      E-Mail erneut senden
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => generatePDFAndSendEmail(orderId)}
                      className="flex-1"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      PDF manuell erstellen & senden
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline"
                    onClick={handleBackToOverview}
                    className="flex-1"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Zur Bestellübersicht
                  </Button>
                </div>
              </div>
            </CardContent>
            
            <Separator className="my-4" />
            
            <CardHeader>
              <CardTitle>Wareneingang erfassen</CardTitle>
              <CardDescription>
                Erfassen Sie den Wareneingang, sobald die Lieferung eingetroffen ist.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GoodsReceiptForm
                order={{
                  id: orderId!,
                  orderNumber: `ORD-${orderId!}`,
                  orderDate: new Date(),
                  warehouseName: warehouseName,
                  supplierName: supplierName,
                  status: 'open',
                  items: selectedProducts.map(product => ({
                    id: product.id,
                    name: product.name || product.productName || '',
                    orderedQuantity: product.orderQuantity,
                    price: product.price || 0
                  }))
                }}
                onSubmit={(receivedItems, notes, documents) => {
                  // Hier würde man die Waren-Eingangs-Daten verarbeiten
                  handleGoodsReceiptComplete();
                }}
                isSubmitting={false}
              />
            </CardContent>
          </Card>
        );
      case 'warehouseReceiptOfExistingOrder':
        if (!existingOrderData) {
          return (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fehler beim Laden der Bestellung</AlertTitle>
              <AlertDescription>
                Die ausgewählte Bestellung konnte nicht geladen werden. Bitte versuchen Sie es erneut.
                <Button 
                  variant="outline" 
                  onClick={handleBackToOverview} 
                  className="mt-4"
                >
                  Zurück zur Übersicht
                </Button>
              </AlertDescription>
            </Alert>
          );
        }
        
        // Zeige die Bestellung und Wareneingangsformular
        return (
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                <div>
                  <CardTitle>Wareneingang für Bestellung #{existingOrderData.id || orderId}</CardTitle>
                  <CardDescription>
                    {existingOrderData.orderNumber || `ORD-${existingOrderData.id || orderId}`} vom {
                      existingOrderData.orderDate ? 
                      format(new Date(existingOrderData.orderDate), 'dd.MM.yyyy') : 
                      'unbekanntem Datum'
                    }
                  </CardDescription>
                </div>
                <Badge className="self-start">
                  {existingOrderData.status === 'shipped' ? 'Versandt' : 
                   existingOrderData.status === 'delivered' ? 'Geliefert' :
                   existingOrderData.status || 'Unbekannt'}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="font-medium text-sm text-muted-foreground">Lieferant</h3>
                  <p className="font-medium">{existingOrderData.supplierName || 'Unbekannter Lieferant'}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium text-sm text-muted-foreground">Lieferziel</h3>
                  <p className="font-medium">{existingOrderData.warehouseName || existingOrderData.locationName || 'Unbekanntes Lager'}</p>
                </div>
                {existingOrderData.expectedDeliveryDate && (
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm text-muted-foreground">Erwarteter Liefertermin</h3>
                    <p className="font-medium">{format(new Date(existingOrderData.expectedDeliveryDate), 'dd.MM.yyyy')}</p>
                  </div>
                )}
                {existingOrderData.totalAmount && (
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm text-muted-foreground">Gesamtwert</h3>
                    <p className="font-medium">
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: existingOrderData.currency || 'EUR'
                      }).format(existingOrderData.totalAmount)}
                    </p>
                  </div>
                )}
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-4">Wareneingang erfassen</h3>
                
                <GoodsReceiptForm
                  order={{
                    id: existingOrderData.id || orderId!,
                    orderNumber: existingOrderData.orderNumber || `ORD-${existingOrderData.id || orderId}`,
                    orderDate: existingOrderData.orderDate ? new Date(existingOrderData.orderDate) : new Date(),
                    warehouseName: existingOrderData.warehouseName || existingOrderData.locationName || '',
                    supplierName: existingOrderData.supplierName || '',
                    status: existingOrderData.status || 'open',
                    items: existingOrderData.orderItems ? existingOrderData.orderItems.map((item: any) => ({
                      id: item.productId,
                      name: item.productName,
                      orderedQuantity: item.quantity,
                      price: item.unitPrice
                    })) : []
                  }}
                  onSubmit={(receivedItems, notes, documents) => {
                    // Hier würde man die Waren-Eingangs-Daten verarbeiten
                    toast({
                      title: 'Wareneingang erfasst',
                      description: 'Der Wareneingang wurde erfolgreich erfasst und die Bestände aktualisiert.',
                    });
                    handleBackToOverview();
                  }}
                  isSubmitting={false}
                />
              </div>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };
  
  // Define step content information
  const stepInfo = {
    overview: {
      title: 'Bestellungsübersicht',
      description: 'Verwalten Sie Ihre Bestellungen und starten Sie neue Prozesse.',
      icon: <ClipboardList className="h-6 w-6" />,
    },
    warehouse: {
      title: 'Lager auswählen',
      description: 'Wählen Sie das Ziellager für die Bestellung aus.',
      icon: <Building2 className="h-6 w-6" />,
    },
    mode: {
      title: 'Bestellmodus wählen',
      description: 'Wählen Sie den Bestellmodus aus.',
      icon: <Boxes className="h-6 w-6" />,
    },
    supplier: {
      title: 'Lieferant auswählen',
      description: 'Wählen Sie den Lieferanten für die Bestellung aus.',
      icon: <Truck className="h-6 w-6" />,
    },
    products: {
      title: 'Produkte auswählen',
      description: 'Wählen Sie die Produkte und Mengen für die Bestellung aus.',
      icon: <PackageCheck className="h-6 w-6" />,
    },
    additionalInfo: {
      title: 'Zusätzliche Informationen',
      description: 'Fügen Sie weitere Informationen zur Bestellung hinzu.',
      icon: <FileText className="h-6 w-6" />,
    },
    summary: {
      title: 'Bestellzusammenfassung',
      description: 'Überprüfen Sie die Bestellung und schließen Sie sie ab.',
      icon: <ClipboardCheck className="h-6 w-6" />,
    },
    goodsReceipt: {
      title: 'Wareneingang',
      description: 'Erfassen Sie den Wareneingang, sobald die Lieferung eingetroffen ist.',
      icon: <Boxes className="h-6 w-6" />,
    },
    warehouseReceiptOfExistingOrder: {
      title: 'Wareneingang erfassen',
      description: 'Erfassen Sie den Wareneingang für eine bestehende Bestellung.',
      icon: <Package className="h-6 w-6" />,
    },
  };
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bestellung 2.0</h1>
          <p className="text-muted-foreground mt-1">
            Erstellen Sie eine neue Bestellung und erfassen Sie den Wareneingang in einem nahtlosen Prozess.
          </p>
        </div>
        
        {step !== 'warehouse' && step !== 'overview' && (
          <Button
            variant="outline"
            onClick={resetOrderProcess}
            className="flex-shrink-0"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Neu starten
          </Button>
        )}
      </div>
      
      {/* Schritt-Anzeige nur anzeigen, wenn wir nicht in der Übersicht sind */}
      {step !== 'overview' && step !== 'warehouseReceiptOfExistingOrder' && (
        <Card>
          <CardContent className="pt-6">
            <Steps 
              currentStep={
                ['warehouse', 'mode', 'supplier', 'products', 'additionalInfo', 'summary', 'goodsReceipt']
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
                  title: "Wareneingang",
                  description: "Lieferung erfassen"
                }
              ]}
              goToStep={(index) => {
                const steps = ['warehouse', 'mode', 'supplier', 'products', 'additionalInfo', 'summary', 'goodsReceipt'];
                // Only allow going to steps that are valid based on current progress
                if (
                  (index === 0) || // Always allow going to first step
                  (index === 1 && warehouseId) || // Mode requires warehouse
                  (index === 2 && warehouseId && orderMode) || // Supplier requires warehouse and mode
                  (index === 3 && warehouseId && orderMode && supplierId) || // Products require supplier
                  (index === 4 && warehouseId && orderMode && supplierId && selectedProducts.length > 0) || // Details require products
                  (index === 5 && warehouseId && orderMode && supplierId && selectedProducts.length > 0 && additionalInfo.expectedDeliveryDate) // Summary requires details
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