import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { updateOrderStatus } from '@/lib/api';
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
      
      // Sicherstellen, dass selectedProducts zur Bestellung hinzugefügt wurden
      // Dann PDF generieren und zur Email-Seite wechseln
      
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
      
      // Setze auf State, damit es für spätere PDF-Generierung verfügbar ist
      setExistingOrderData(orderWithProducts);
      
      // Warte kurz, bevor PDF generiert wird
      setTimeout(() => {
        // Generiere PDF mit dem Order-Objekt, das die Produkte enthält
        generateOrderPDF(orderWithProducts);
        
        // Aggressives Cache-Invalidieren, um sicherzustellen, dass alle Listen aktualisiert werden
        queryClient.invalidateQueries(); // Invalidiert den gesamten Cache
        
        console.log("Bestellung erstellt, leite zur E-Mail-Seite weiter...");
        
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
  
  // Email sending mutation
  const sendOrderMutation = useMutation({
    mutationFn: () => apiRequest(`/api/orders/${orderId}/send`, {}, 'post'),
    onSuccess: () => {
      toast({
        title: 'Bestellung versendet',
        description: 'Die Bestellung wurde erfolgreich per E-Mail versendet.'
      });
      
      // Invalidiere den Cache für die aktuelle Bestellung und die Listenansicht
      queryClient.invalidateQueries({queryKey: orderKeys.detail(Number(orderId))});
      queryClient.invalidateQueries({queryKey: orderKeys.lists()});
      
      // Aktualisiere lokale Daten
      if (existingOrderData) {
        setExistingOrderData({
          ...existingOrderData,
          sentAt: new Date().toISOString(),
        });
      }
    },
    onError: (err) => {
      toast({
        title: 'Fehler beim Versand',
        description: `Es ist ein Fehler aufgetreten: ${(err as Error).message}`,
        variant: 'destructive'
      });
      console.error(err);
    }
  });
  
  // Fetch order data if orderId exists and we're in the relevant step
  // PROBLEM 1 & 2 GELÖST: Konsistente Query-Keys und korrekte Step-Bedingung
  const { 
    data: order,
    isLoading: isLoadingOrder,
    isError: isErrorOrder,
    error: orderError
  } = useQuery({
    queryKey: orderKeys.detail(orderId || 0),
    // Nur aktivieren, wenn orderId gesetzt ist UND wir NICHT im Overview-Step sind
    enabled: !!orderId && step !== 'overview', 
    queryFn: () => {
      console.log("Starte Order-Detail-Query für ID:", orderId, "im Schritt:", step);
      return apiRequest(`/api/orders/${orderId}`, null, 'get');
    },
    // Wiederholungsversuche deaktivieren, um unerwünschte Nebeneffekte zu vermeiden
    retry: false,
    // Stale-Zeit erhöhen, um zu vermeiden, dass stale Daten zu schnell als "veraltet" markiert werden
    staleTime: 30000, // 30 Sekunden
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
    }
  }, [order]);
  
  // Verbesserte useEffect für PDF-Generierung mit besserem Timing
  useEffect(() => {
    // Nur ausführen wenn wir im richtigen Schritt sind UND existingOrderData vorhanden ist
    if ((step === 'sendOrder' || step === 'warehouseReceiptOfExistingOrder') && existingOrderData && orderId) {
      console.log("PDF-Generierung vorbereiten. Prüfe Bestellungsdetails:", existingOrderData);
      
      // Prüfen, ob bereits Bestellpositionen in irgendeinem bekannten Format vorhanden sind
      const hasItems = !!(
        (Array.isArray(existingOrderData.items) && existingOrderData.items.length > 0) ||
        (Array.isArray(existingOrderData.orderItems) && existingOrderData.orderItems.length > 0) ||
        (Array.isArray(existingOrderData.selectedProducts) && existingOrderData.selectedProducts.length > 0) ||
        (existingOrderData.data && Array.isArray(existingOrderData.data.items) && existingOrderData.data.items.length > 0)
      );
      
      if (hasItems) {
        // Items sind bereits vorhanden, PDF direkt generieren mit kurzer Verzögerung
        console.log("Bestellpositionen bereits vorhanden, generiere PDF direkt");
        setTimeout(() => {
          generateOrderPDF(existingOrderData);
        }, 800);
      } else {
        // Nachladen der Items mit verbesserter Fehlerbehandlung und Retry-Logik
        console.log("Bestellpositionen fehlen, lade nach für Bestellung ID:", orderId);
        
        // Toast-Nachricht für den Benutzer, dass die Bestellpositionen geladen werden
        toast({
          title: 'Bestellpositionen werden geladen',
          description: 'Die Bestellpositionen werden für die PDF-Erstellung geladen...',
        });
        
        // Verwenden Sie eine rekursive Funktion für bessere Fehlerbehandlung und Retries
        const loadOrderItems = async (retryCount = 0, maxRetries = 3) => {
          try {
            console.log(`Lade Bestellpositionen (Versuch ${retryCount + 1}/${maxRetries})...`);
            
            // API-Anfrage mit verbesserter Fehlerbehandlung
            const response = await apiRequest(`/api/orders/${orderId}/items`);
            console.log("API-Antwort für Bestellpositionen:", response);
            
            // Verschiedene mögliche Antwortformate prüfen
            let items = [];
            if (Array.isArray(response)) {
              items = response;
            } else if (response && typeof response === 'object') {
              // Prüfen verschiedener möglicher Property-Namen in der Antwort
              items = response.items || response.orderItems || response.data || [];
              
              // Falls items in einem data-Objekt verschachtelt sind
              if (response.data && Array.isArray(response.data.items)) {
                items = response.data.items;
              }
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
              
              // State aktualisieren und PDF generieren
              setExistingOrderData(updatedOrderData);
              
              // Cache invalidieren
              queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId)});
              
              // Nach kurzer Verzögerung PDF generieren
              setTimeout(() => {
                generateOrderPDF(updatedOrderData);
              }, 800);
              
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
                generateOrderPDF(fallbackOrderData);
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
                title: 'Keine Produkte gefunden',
                description: 'Es konnten keine Produktdaten für die PDF-Erstellung gefunden werden.',
                variant: 'destructive',
              });
            }
          }
        };
        
        // Starte den Ladevorgang
        loadOrderItems();
      }
    }
  }, [step, existingOrderData, orderId, selectedProducts, queryClient]);
  
  // Function to generate PDF from order data
  const generateOrderPDF = async (orderData: any) => {
    try {
      // Detailliertes Logging, um die exakte Datenstruktur zu sehen
      console.log("PDF-Generierung gestartet mit Daten:", JSON.stringify(orderData, null, 2));
      
      // Sicherstellen, dass Bestelldaten vollständig sind
      if (!orderData || typeof orderData !== 'object') {
        console.error('Keine gültigen Bestelldaten für PDF-Generierung:', orderData);
        toast({
          title: 'Fehler bei der PDF-Erstellung',
          description: 'Die Bestelldaten sind unvollständig oder fehlerhaft.',
          variant: 'destructive'
        });
        return;
      }
      
      // Verbesserte Extraktion von Bestellpositionen mit allen möglichen Property-Namen
      let items: any[] = [];
      
      // Umfassende Prüfung aller möglichen Feldnamen und Strukturen nach Empfehlung
      const raw = orderData;
      items = 
        (Array.isArray(raw.items) && raw.items.length > 0 ? raw.items : null) || 
        (Array.isArray(raw.orderItems) && raw.orderItems.length > 0 ? raw.orderItems : null) || 
        (raw.data?.items && Array.isArray(raw.data.items) && raw.data.items.length > 0 ? raw.data.items : null) ||
        (raw.data?.orderItems && Array.isArray(raw.data.orderItems) && raw.data.orderItems.length > 0 ? raw.data.orderItems : null) || 
        (Array.isArray(raw.products) && raw.products.length > 0 ? raw.products : null) || 
        (Array.isArray(raw.selectedProducts) && raw.selectedProducts.length > 0 ? raw.selectedProducts : null) || 
        (Array.isArray(raw.lineItems) && raw.lineItems.length > 0 ? raw.lineItems : null) ||
        (raw.data && Array.isArray(raw.data) && raw.data.length > 0 ? raw.data : []);
      
      console.log("Extrahierte Items für PDF:", items.length > 0 ? items : "Keine Items gefunden");
      
      // Wenn keine Items gefunden wurden, lade sie aus der API oder verwende Fallbacks
      if (items.length === 0) {
        console.log('Keine Produktdaten für PDF-Generierung vorhanden, versuche Alternativen...');
        
        // FALLBACK 1: Verwende selectedProducts aus dem aktuellen Schritt, falls verfügbar
        if (Array.isArray(selectedProducts) && selectedProducts.length > 0) {
          console.log("Verwende aktuelle selectedProducts als Fallback:", selectedProducts);
          items = selectedProducts.map(product => ({
            productId: product.id,
            productName: product.name,
            quantity: product.orderQuantity || 1,
            unitPrice: product.price || 0,
            totalPrice: (product.price || 0) * (product.orderQuantity || 1),
            unit: product.unit || 'Stk.'
          }));
        }
        // FALLBACK 2: Nur wenn wir eine Bestellungs-ID haben und FALLBACK 1 keine Daten geliefert hat
        else if (orderData.id) {
          try {
            // Maximal 3 Versuche mit längeren Wartezeiten
            let retryCount = 0;
            const maxRetries = 3;
            
            while (items.length === 0 && retryCount < maxRetries) {
              // Längere Wartezeit zwischen Versuchen
              if (retryCount > 0) {
                // Exponentielles Backoff für Wartezeiten: 1s, 2s, 4s...
                const waitTime = Math.pow(2, retryCount) * 1000;
                console.log(`Fehler beim Laden, warte ${waitTime}ms vor nächstem Versuch...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              }
              
              console.log(`Lade Bestellpositionen (Versuch ${retryCount + 1}/${maxRetries})...`);
              
              try {
                // Verwende POST statt GET für mehr Flexibilität
                const response = await apiRequest(`/api/orders/${orderData.id}/items`, {
                  method: 'POST',
                  body: JSON.stringify({ orderId: orderData.id })
                });
                
                console.log("API-Antwort für Bestellpositionen:", response);
                
                if (response && Array.isArray(response) && response.length > 0) {
                  items = response;
                  console.log(`Items aus API nachgeladen (${items.length} Positionen)`);
                  
                  // Cache invalidieren für diese Order
                  queryClient.invalidateQueries({queryKey: orderKeys.detail(orderData.id)});
                  
                  // Lokale Daten aktualisieren
                  const updatedOrderData = {
                    ...orderData,
                    items: items,
                    orderItems: items // Beide Properties setzen für maximale Kompatibilität
                  };
                  
                  // Setze State mit den neuen Daten
                  setExistingOrderData(updatedOrderData);
                  
                  break;
                }
              } catch (apiError) {
                console.error(`API-Fehler (Versuch ${retryCount + 1}/${maxRetries}):`, apiError);
              }
              
              retryCount++;
            }
          } catch (err) {
            console.error("Fehler beim Nachladen der Items:", err);
          }
        }
        
        // FALLBACK 3: Wenn immer noch keine Items, erstelle Platzhalter-Item damit die PDF-Generierung nicht fehlschlägt
        if (items.length === 0) {
          console.warn("Auch nach allen Fallbacks keine Produkte für PDF gefunden - erstelle Platzhalter");
          
          toast({
            title: 'Keine Produkte gefunden',
            description: 'Es konnten keine Produktdaten für die PDF-Erstellung gefunden werden. PDF wird mit Platzhalter erstellt.',
            variant: 'destructive'
          });
          
          // Erstelle einen Dummy-Eintrag als letzten Fallback, damit die PDF nicht völlig fehlschlägt
          items = [{
            positionNumber: 1,
            productId: '-',
            productName: "Keine Produktdaten verfügbar",
            quantity: 0,
            unitPrice: 0,
            totalPrice: 0,
            unit: "-",
            price: 0
          }];
        }
      }
      
      // Normalisierte Bestelldaten erstellen und fehlende Werte ergänzen
      const formattedItems = items.map((item: any, index: number) => ({
        ...item,
        positionNumber: index + 1,
        unit: item.unit || 'Stk.',
        price: item.price || 0,
        quantity: item.quantity || 1,
        totalPrice: calculateTotalPrice(item.price || 0, item.quantity || 1)
      }));
      
      const totalAmount = formattedItems.reduce((sum: number, item: any) => 
        sum + (item.totalPrice || 0), 0);
      const vatAmount = parseFloat((totalAmount * 0.19).toFixed(2));
      const totalWithTax = parseFloat((totalAmount + vatAmount).toFixed(2));
      
      const normalizedOrderData = {
        ...orderData,
        items: formattedItems,
        orderDate: formatDate(orderData.orderDate || new Date()),
        expectedDeliveryDate: formatDate(orderData.expectedDeliveryDate),
        warehouseName: orderData.warehouseName || 'Hauptlager',
        priority: orderData.priority || 'Normal',
        notes: orderData.notes || '',
        supplierName: orderData.supplierName || 'Unbekannter Lieferant',
        supplierAddress: orderData.supplierAddress || '',
        supplierEmail: orderData.supplierEmail || '',
        totalAmount: formatPrice(totalAmount),
        vatAmount: formatPrice(vatAmount),
        totalWithTax: formatPrice(totalWithTax)
      };
      
      console.log("Normalisierte Daten für PDF:", normalizedOrderData);
      
      // HTML-Template in einen String mit ersetzten Variablen umwandeln
      let htmlContent = orderPDFTemplate;
      
      // Fix für das Logo - absoluten Pfad verwenden
      htmlContent = htmlContent.replace(
        'src="/images/Proviantomat_Logo_rot.png"',
        'src="https://www.elbsandstein-proviant.de/images/Proviantomat_Logo_rot.png"'
      );
      
      // Einfache Handlebars-ähnliche Template-Verarbeitung
      // Ersetze {{variable}} mit den tatsächlichen Werten
      Object.entries(normalizedOrderData).forEach(([key, value]) => {
        if (key !== 'items') {
          const regex = new RegExp(`{{${key}}}`, 'g');
          htmlContent = htmlContent.replace(regex, String(value || ''));
        }
      });
      
      // Verarbeite die Items-Liste
      let itemsHtml = '';
      formattedItems.forEach((item: any) => {
        itemsHtml += `
          <tr>
            <td>${item.positionNumber}</td>
            <td>${item.productId || ''}</td>
            <td>${item.productName || ''}</td>
            <td style="text-align:right">${item.quantity}</td>
            <td>${item.unit}</td>
            <td style="text-align:right">${formatPrice(item.price)} €</td>
            <td style="text-align:right">${formatPrice(item.totalPrice)} €</td>
          </tr>`;
      });
      
      // Ersetze den {{#each items}} Block mit dem generierten HTML
      htmlContent = htmlContent.replace(/{{#each items}}[\s\S]*?{{\/each}}/g, itemsHtml);
      
      // Ersetze bedingte Blöcke
      if (normalizedOrderData.notes) {
        htmlContent = htmlContent.replace(
          /{{#if notes}}[\s\S]*?{{\/if}}/g, 
          `<tr><th>Notizen</th><td colspan="3">${normalizedOrderData.notes}</td></tr>`
        );
      } else {
        htmlContent = htmlContent.replace(/{{#if notes}}[\s\S]*?{{\/if}}/g, '');
      }
      
      if (normalizedOrderData.supplierEmail) {
        htmlContent = htmlContent.replace(
          /{{#if supplierEmail}}{{supplierEmail}}{{\/if}}/g,
          normalizedOrderData.supplierEmail
        );
      } else {
        htmlContent = htmlContent.replace(/{{#if supplierEmail}}{{supplierEmail}}{{\/if}}/g, '');
      }
      
      // Debug-Ausgabe des HTML-Inhalts zur Prüfung
      console.log("Generierter HTML-Inhalt:", htmlContent.substring(0, 500) + "... (gekürzt)");
      
      // Erstelle ein div-Element mit dem PDF-Inhalt
      const element = document.createElement('div');
      element.innerHTML = htmlContent;
      element.style.width = '210mm'; // A4 Breite
      element.style.padding = '10mm';
      element.style.backgroundColor = 'white';
      // Element sichtbar machen für Debugging
      document.body.appendChild(element);
      
      // Rendere das Element zu einem Canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Höhere Qualität
        useCORS: true,
        logging: true, // Logging aktivieren für Debugging
        backgroundColor: '#ffffff'
      });
      
      console.log("Canvas erstellt mit Größe:", canvas.width, "x", canvas.height);
      
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
      console.log("PDF-Blob erstellt:", blob);
      setPdfBlob(blob);
      
      // Element wieder ausblenden, aber nicht entfernen für Debugging
      element.style.display = 'none';
      toast({
        title: 'PDF erstellt',
        description: 'Die PDF-Vorschau wurde erfolgreich generiert.',
      });
    } catch (error) {
      console.error('Fehler beim Generieren des PDFs:', error);
      toast({
        title: 'Fehler beim Generieren des PDFs',
        description: 'Die PDF-Vorschau konnte nicht erstellt werden. Details in der Konsole.',
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
  
  // Find or select order handler - Statusabhängige Weiterleitung
  const handleSelectOrder = (orderId: number) => {
    console.log("Bestellung ausgewählt:", orderId);
    
    // State-Updates in einer Batch-Operation durchführen, um Race-Conditions zu vermeiden
    // Zuerst den Step zurücksetzen, um potenzielle fehlerhafte State-Kombinationen zu vermeiden
    setStep('overview');
    
    // Nach einem kurzen Timeout die Bestellungs-ID setzen
    // Dann abfragen, welche Weiterleitung sinnvoll ist (basierend auf dem Status)
    setTimeout(async () => {
      setOrderId(orderId);
      
      try {
        // Bestelldaten abrufen
        const response = await apiRequest(`/api/orders/${orderId}`, undefined, 'get');
        const orderData = response;
        
        setExistingOrderData(orderData);
        
        // Statusabhängige Weiterleitung
        if (!orderData.sentAt) {
          // Wenn die Bestellung noch nicht gesendet wurde -> E-Mail-Schritt
          console.log("Bestellung ist noch ein Entwurf, leite zum E-Mail-Schritt weiter");
          setStep('sendOrder');
        } else {
          // Wenn die Bestellung bereits gesendet wurde -> Wareneingang
          console.log("Bestellung wurde bereits versendet, leite zum Wareneingang weiter");
          setStep('warehouseReceiptOfExistingOrder');
        }
      } catch (error) {
        console.error("Fehler beim Laden der Bestelldaten:", error);
        toast({
          title: "Fehler beim Laden der Bestellung",
          description: "Die Bestelldaten konnten nicht geladen werden.",
          variant: "destructive"
        });
        setStep('overview');
      }
    }, 50);
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
            mode={orderMode}
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
        // Prüfen, ob die Komponente überhaupt angezeigt werden soll
        return supplierId !== null && warehouseId !== null ? (
          <ProductSelectionTable
            supplierId={supplierId as number} 
            warehouseId={warehouseId as number}
            selectedProducts={selectedProducts}
            onProductsChange={setSelectedProducts}
            sourceOrderId={sourceOrderId}
            mode={orderMode}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p>Bitte wählen Sie zuerst einen Lieferanten und ein Lager aus.</p>
            </CardContent>
          </Card>
        );
        
      case 'additionalInfo':
        return (
          <AdditionalInfoForm
            additionalInfo={additionalInfo}
            onAdditionalInfoChange={setAdditionalInfo}
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
              // Vollständige Produktinformationen für die Bestellpositionen hinzufügen
              const orderData = {
                locationId: warehouseId, // Server erwartet locationId statt warehouseId
                supplierId,
                supplierName,
                // orderItems statt products verwenden, damit der Server die Daten korrekt verarbeitet
                orderItems: selectedProducts.map(p => ({
                  productId: p.id,
                  productName: p.name || p.productName || `Produkt ${p.id}`,
                  quantity: p.orderQuantity || p.quantity || 0,
                  unitPrice: p.price || 0,
                  totalPrice: (p.price || 0) * (p.orderQuantity || p.quantity || 0),
                  unit: p.unit || 'Stk.',
                  vatRate: 19
                })),
                expectedDeliveryDate: additionalInfo.expectedDeliveryDate ? additionalInfo.expectedDeliveryDate.toISOString() : null,
                priority: additionalInfo.priority,
                notes: additionalInfo.notes,
                orderMode,
                sourceOrderId,
              };
              
              console.log("Sende Bestellung mit Positionsdaten:", JSON.stringify(orderData));
              
              // Zuerst die Bestellung ohne PDF erstellen
              createOrderMutation.mutate(orderData, {
                onSuccess: async (data) => {
                  console.log("Bestellung erfolgreich erstellt mit Antwort:", JSON.stringify(data));
                  setExistingOrderData(data);
                  
                  try {
                    // Manuell die Bestellpositionen erstellen, falls sie in der Antwort nicht enthalten sind
                    if (!data.orderItems || data.orderItems.length === 0) {
                      console.log("Bestellpositionen manuell erstellen, da keine in der Antwort enthalten sind");
                      
                      // Bestellpositionen separat speichern
                      for (let i = 0; i < orderData.orderItems.length; i++) {
                        const item = orderData.orderItems[i];
                        
                        // Alle erforderlichen Felder für eine Bestellposition angeben
                        const orderItem = {
                          orderId: data.id,
                          productId: item.productId,
                          productName: item.productName,
                          quantity: item.quantity,
                          unitPrice: item.unitPrice,
                          totalPrice: item.totalPrice,
                          unit: item.unit,
                          vatRate: item.vatRate,
                          positionNumber: i + 1,
                          status: 'pending'
                        };
                        
                        console.log(`Speichere Bestellposition ${i+1}:`, JSON.stringify(orderItem));
                        await apiRequest('/api/order-items', orderItem, 'post');
                      }
                      
                      // Warte kurz, um sicherzustellen, dass alle Positionen gespeichert wurden
                      setTimeout(async () => {
                        // Vollständige Bestelldaten mit Positionen neu laden
                        const fullOrderData = await apiRequest(`/api/orders/${data.id}`, null, 'get');
                        console.log("Vollständige Bestelldaten nach manueller Erstellung der Positionen:", JSON.stringify(fullOrderData));
                        setExistingOrderData(fullOrderData);
                        generateOrderPDF(fullOrderData);
                        setStep('sendOrder');
                      }, 1000);
                    } else {
                      // Bestellpositionen sind bereits in der Antwort enthalten
                      console.log(`Bestellung enthält bereits ${data.orderItems.length} Positionen`);
                      generateOrderPDF(data);
                      setStep('sendOrder');
                    }
                  } catch (error) {
                    console.error("Fehler bei der manuellen Erstellung der Bestellpositionen:", error);
                    generateOrderPDF(data);
                    setStep('sendOrder');
                  }
                }
              });
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
            order={existingOrderData}
            isSubmitting={false}
            onSaveComplete={async (receivedItems) => {
              // Bestimme den neuen Status basierend auf den empfangenen Artikeln
              let newStatus = 'delivered';
              
              // Wenn einige Artikel fehlen oder beschädigt sind, setze auf 'partial'
              const isPartial = receivedItems.some(item => 
                item.receivedQuantity !== item.orderedQuantity || item.damaged
              );
              
              if (isPartial) {
                newStatus = 'partial';
              }
              
              try {
                // Aktualisiere den Bestellstatus in der API
                if (orderId) {
                  await updateOrderStatus(orderId, newStatus, 
                    `Wareneingang am ${new Date().toLocaleDateString('de-DE')} erfasst.`);
                }
                
                toast({
                  title: 'Wareneingang gespeichert',
                  description: 'Der Wareneingang wurde erfolgreich dokumentiert und der Status aktualisiert.',
                });
                
                // Invalidiere den Cache für Bestellungen mit zentralisierten Keys
                queryClient.invalidateQueries({queryKey: orderKeys.lists()});
                queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId || 0)});
                
                // Zurück zur Übersicht
                setStep('overview');
              } catch (error) {
                console.error('Fehler beim Aktualisieren des Bestellstatus:', error);
                toast({
                  title: 'Warnung',
                  description: 'Der Wareneingang wurde gespeichert, aber der Status konnte nicht aktualisiert werden.',
                  variant: 'destructive'
                });
                
                // Trotzdem zur Übersicht zurückkehren
                setStep('overview');
              }
            }}
          />
        );
        
      case 'warehouseReceiptOfExistingOrder':
        // PROBLEM #3 GELÖST: Error-Guard NUR im richtigen Kontext (Detail-Schritt) platzieren
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
                  <div className="flex justify-center gap-2">
                    <Button 
                      onClick={() => {
                        // PROBLEM #4 GELÖST: Korrekte Cache-Invalidierung mit konsistenten Keys
                        queryClient.invalidateQueries({queryKey: orderKeys.detail(orderId || 0)});
                        queryClient.invalidateQueries({queryKey: orderKeys.lists()});
                      }}
                      variant="outline"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Cache leeren
                    </Button>
                    <Button onClick={() => window.location.reload()}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Neu laden
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }
        
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