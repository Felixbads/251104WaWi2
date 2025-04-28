import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
  const [existingOrderData, setExistingOrderData] = useState<any>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState<boolean>(false);
  
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
      
      // Zur Wareneingang-Seite navigieren (goodsReceipt)
      setStep('goodsReceipt');
      
      // Cache invalidieren, damit die Bestellung in der Übersicht erscheint
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      
      // Automatisch PDF generieren und E-Mail vorbereiten, aber dem Benutzer die Kontrolle geben
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
  
  // Email order mutation - optimiert, um nur die Bestellungs-ID zu senden
  const emailOrderMutation = useMutation({
    mutationFn: (emailData: { orderId: number, supplierEmail: string, additionalNotes?: string }) => {
      // Nur die notwendigen Daten senden, PDF-Generierung erfolgt serverseitig
      return apiRequest(`/api/orders/${emailData.orderId}/email`, 
        { 
          supplierEmail: emailData.supplierEmail,
          additionalNotes: emailData.additionalNotes || ''
        }, 
        'post'
      );
    },
    onSuccess: () => {
      toast({
        title: 'Bestellung per E-Mail versendet',
        description: 'Die Bestellung wurde erfolgreich per E-Mail an den Lieferanten versendet.',
      });
      
      // Auch hier nach erfolgreicher E-Mail den Cache aktualisieren
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
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
      return apiRequest(`/api/orders/${orderData.id}/mark-sent`, orderData, 'post');
    },
    onSuccess: () => {
      toast({
        title: 'Bestellung als versendet markiert',
        description: 'Die Bestellung wurde erfolgreich als versendet markiert.',
      });
      
      // Aktualisiere den Status im Frontend
      if (existingOrderData) {
        setExistingOrderData({
          ...existingOrderData,
          status: 'shipped'
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Fehler beim Markieren der Bestellung',
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  });
  
  // Mark order as delivered mutation
  const markOrderAsDeliveredMutation = useMutation({
    mutationFn: (data: { 
      id: number, 
      receivedDate: Date,
      receivedItems: any[],
      notes?: string 
    }) => {
      return apiRequest(`/api/orders/${data.id}/mark-delivered`, data, 'post');
    },
    onSuccess: () => {
      toast({
        title: 'Wareneingang erfolgreich erfasst',
        description: 'Die Bestellung wurde als geliefert markiert und die Lagerbestände wurden aktualisiert.',
      });
      
      // Aktualisiere den Status im Frontend
      if (existingOrderData) {
        setExistingOrderData({
          ...existingOrderData,
          status: 'delivered'
        });
      }
      
      // Nach erfolgreicher Aktualisierung zur Übersicht navigieren
      navigate('/bestellungen');
    },
    onError: (error) => {
      toast({
        title: 'Fehler beim Erfassen des Wareneingangs',
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
        return 'sendOrder';
      case 'sendOrder':
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
  const generatePDFAndSendEmail = async (specificOrderId: number) => {
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
        const response = await fetch(`/api/orders/${orderIdToUse}`);
        if (!response.ok) {
          throw new Error(`Fehler beim Abrufen der Bestelldaten: ${response.statusText}`);
        }
        orderData = await response.json();
        
        // Bestelldaten für die Verwendung im Email-Dialog speichern
        setExistingOrderData(orderData);
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
      
      // Bestelldaten vorbereiten
      const orderItems = orderData.orderItems || selectedProducts;
      
      // Berechne Gesamtsumme, MwSt und Bruttobetrag
      const totalAmount = orderItems.reduce((sum: number, item: any) => {
        const price = item.unitPrice || item.price || 0;
        const quantity = item.quantity || item.orderQuantity || 0;
        return sum + (price * quantity);
      }, 0);
      
      const vatAmount = parseFloat((totalAmount * 0.19).toFixed(2));
      const totalWithTax = parseFloat((totalAmount + vatAmount).toFixed(2));
      
      // Handlebars-Template mit den Daten füllen (manuell, ohne Handlebars-Bibliothek)
      let htmlContent = orderPDFTemplate;
      
      // Ersetze die Template-Variablen durch die tatsächlichen Werte
      htmlContent = htmlContent
        .replace(/{{supplierName}}/g, orderData.supplierName || supplierName)
        .replace(/{{supplierAddress}}/g, orderData.supplierAddress || "Adresse nicht verfügbar")
        .replace(/{{supplierEmail}}/g, orderData.supplierEmail || "")
        .replace(/{{orderNumber}}/g, orderData.orderNumber || "")
        .replace(/{{orderDate}}/g, formatDate(orderData.orderDate || new Date()))
        .replace(/{{expectedDeliveryDate}}/g, formatDate(orderData.expectedDeliveryDate || additionalInfo.expectedDeliveryDate))
        .replace(/{{priority}}/g, orderData.priority || additionalInfo.priority || "Normal")
        .replace(/{{warehouseName}}/g, orderData.warehouseName || orderData.locationName || warehouseName || "")
        .replace(/{{notes}}/g, orderData.notes || additionalInfo.notes || "");
      
      // Ersetze die {{#if notes}} Bedingung
      if (!orderData.notes && !additionalInfo.notes) {
        htmlContent = htmlContent.replace(/{{#if notes}}[\s\S]*?{{\/if}}/g, '');
      }
      
      // Ersetze die {{#each items}} Schleife manuell
      let itemsHtml = '';
      orderItems.forEach((item: any, index: number) => {
        const price = item.unitPrice || item.price || 0;
        const quantity = item.quantity || item.orderQuantity || 0;
        const totalPrice = calculateTotalPrice(price, quantity);
        
        itemsHtml += `
          <tr>
            <td>${index + 1}</td>
            <td>${item.productId || ''}</td>
            <td>${item.productName || item.name || ''}</td>
            <td style="text-align:right">${quantity}</td>
            <td>Stk.</td>
            <td style="text-align:right">${formatPrice(price)} €</td>
            <td style="text-align:right">${formatPrice(totalPrice)} €</td>
          </tr>
        `;
      });
      
      // Ersetze den {{#each items}} Block
      htmlContent = htmlContent.replace(/{{#each items}}[\s\S]*?{{\/each}}/g, itemsHtml);
      
      // Füge die Gesamtsummen ein
      htmlContent = htmlContent
        .replace(/{{totalAmount}}/g, formatPrice(totalAmount))
        .replace(/{{vatAmount}}/g, formatPrice(vatAmount))
        .replace(/{{totalWithTax}}/g, formatPrice(totalWithTax));
      
      // Fertige HTML in das Element einfügen
      tempDiv.innerHTML = htmlContent;
      
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
      
      // Wir generieren kein Base64 mehr, das wird jetzt serverseitig gemacht
      // Stattdessen zeigen wir eine PDF-Vorschau an, damit der Benutzer vor dem Versand prüfen kann
      
      // PDF als Blob speichern, um es anzuzeigen
      const pdfBlob = pdf.output('blob');
      
      // PDF-Blob für die Vorschau speichern
      setPdfBlob(pdfBlob);
      
      // Lieferanten-Email abrufen
      try {
        // Die Lieferanten-ID für diese Bestellung ermitteln
        const supplierIdToUse = orderData.supplierId || supplierId;
        
        if (!supplierIdToUse) {
          throw new Error('Keine Lieferanten-ID gefunden');
        }
        
        // Zuerst versuchen wir, die E-Mail des Lieferanten abzurufen
        const supplierResponse = await fetch(`/api/suppliers/${supplierIdToUse}`);
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
        
        // Öffne den Dialog für die E-Mail-Bearbeitung und PDF-Vorschau
        setShowEmailDialog(true);
      } catch (error) {
        toast({
          title: 'Fehler beim Abrufen der Lieferanten-E-Mail',
          description: `${(error as Error).message}`,
          variant: 'destructive',
        });
        return;
      }
    } catch (error) {
      toast({
        title: 'Fehler beim Generieren des PDFs',
        description: `Es ist ein Fehler aufgetreten: ${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  };
  
  // Handler für das Absenden der E-Mail nach Bearbeitung im Dialog
  const handleSendEmail = (supplierEmail: string, additionalNotes: string) => {
    if (!orderId) {
      toast({
        title: 'Fehler beim Senden der E-Mail',
        description: 'Es konnte keine Bestellungs-ID gefunden werden.',
        variant: 'destructive',
      });
      return;
    }
    
    // E-Mail mit der Bestellung an den Lieferanten senden
    emailOrderMutation.mutate({
      orderId,
      supplierEmail,
      additionalNotes
    });
    
    // Dialog schließen
    setShowEmailDialog(false);
    
    // Bestellung als "gesendet" markieren
    markOrderAsSentMutation.mutate({
      id: orderId
    });
  };
  
  // Handle goods receipt complete
  const handleGoodsReceiptComplete = (receivedItems: any[], notes: string, documents: any[]) => {
    // Bestellung als "geliefert" markieren
    if (orderId) {
      markOrderAsDeliveredMutation.mutate({
        id: orderId,
        receivedDate: new Date(),
        receivedItems,
        notes,
      });
    } else {
      toast({
        title: 'Fehler beim Erfassen des Wareneingangs',
        description: 'Es konnte keine Bestellungs-ID gefunden werden.',
        variant: 'destructive',
      });
    }
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
      const response = await fetch(`/api/orders/${id}`);  // Hinzufügen von /api Präfix
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Bestellung: ${response.statusText}`);
      }
      
      const orderData = await response.json();
      
      // Detaillierte Fehlerbehandlung
      if (!orderData || typeof orderData !== 'object') {
        throw new Error('Die Bestelldaten haben ein unerwartetes Format.');
      }
      
      // Bestelldaten speichern
      setExistingOrderData(orderData);
      setOrderId(orderData.id);
      
      // Je nach Status der Bestellung zur passenden Ansicht navigieren
      if (['shipped', 'delivered'].includes(orderData.status)) {
        // Direkt zum Wareneingang navigieren
        setStep('warehouseReceiptOfExistingOrder');
      } else {
        // Zum goodsReceipt-Schritt wechseln, anstatt zu navigieren
        setStep('goodsReceipt');
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
  
  // Diese Funktion ist bereits weiter oben definiert und wird vom OrderEmailDialog verwendet
  
  // Handler für den Start des Wareneingang-Workflows für eine bestehende Bestellung
  const handleStartWarehouseReceiptProcess = async (id: number) => {
    try {
      // Bestellung vom Server abrufen
      const response = await fetch(`/api/orders/${id}`);
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
      sendOrder':
        return (
          <OrderEmailPage
            orderId={orderId}
            supplierEmail={existingOrderData?.supplierEmail || ""}
            orderNumber={existingOrderData?.orderNumber || ""}
            supplierName={existingOrderData?.supplierName || ""}
            pdfBlob={pdfBlob}
            onSendEmail={handleSendEmail}
            onBack={() => setStep('summary')}
            onNext={() => setStep('goodsReceipt')}
          />
        );
      case '      onSelectWarehouse={handleWarehouseSelect}
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
                      onClick={() => orderId ? generatePDFAndSendEmail(orderId) : undefined}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      E-Mail erneut senden
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => orderId ? generatePDFAndSendEmail(orderId) : undefined}
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
                  // Waren-Eingangs-Daten verarbeiten und Status aktualisieren
                  handleGoodsReceiptComplete(receivedItems, notes, documents);
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
                    // Waren-Eingangs-Daten verarbeiten und Status aktualisieren
                    handleGoodsReceiptComplete(receivedItems, notes, documents);
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
      description: 'Erfassen Sie den Wareneingang, sobald die LiesendOrder: {
      title: 'Bestellung versenden',
      description: 'Bestellung per E-Mail an den Lieferanten senden.',
      icon: <Mail className="h-6 w-6" />,
    },
    ferung eingetroffen ist.',
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
      {/* E-Mail-Dialog für das Senden von Bestellungen an Lieferanten */}
      <OrderEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        orderId={orderId || 0}
        supplierEmail={existingOrderData?.supplierEmail || ''}
        orderNumber={existingOrderData?.orderNumber || `ORD-${orderId}`}
        supplierName={existingOrderData?.supplierName || supplierName}
        pdfBlob={pdfBlob}
      />
      
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          {/* Heading and intro text removed as requested */}
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
               sendOrder', 'goodsReceipt']
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
                  description: "Bestellung versenderung erfassen"
                }
              ]}
              goToStep={(index) => {
                const steps = ['warehouse', 'mode', 'supplier', 'products', 'additionalInfo', 'summary', 'goodsReceipt'];
                // Only allow going to steps that are valid based on current progress
                sendOrder', 'goodsReceipt'];
                // Only allow going to steps that are valid based on current progress
                if (
                  (index === 0) || // Always allow going to first step
                  (index === 1 && warehouseId) || // Mode requires warehouse
                  (index === 2 && warehouseId && orderMode) || // Supplier requires warehouse and mode
                  (index === 3 && warehouseId && orderMode && supplierId) || // Products require supplier
                  (index === 4 && warehouseId && orderMode && supplierId && selectedProducts.length > 0) || // Details require products
                  (index === 5 && warehouseId && orderMode && supplierId && selectedProducts.length > 0 && additionalInfo.expectedDeliveryDate) || // Summary requires details
                  (index === 6 && orderId) // SendOrder requires an orderId      allowStepClick={true}
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