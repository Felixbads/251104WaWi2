import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
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
  Package,
  AlertCircle
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


// Import custom components
import WarehouseSelector from '@/components/orderv2/WarehouseSelector';
import OrderModeSelector, { OrderMode } from '@/components/orderv2/OrderModeSelector';
import SupplierSelector from '@/components/orderv2/SupplierSelector';
import EmailDialog from '@/components/orderv2/EmailDialog';
import ProductSelectionTable from '@/components/orderv2/ProductSelectionTable';
import AdditionalInfoForm from '@/components/orderv2/AdditionalInfoForm';
import OrderSummary from '@/components/orderv2/OrderSummary';
import GoodsReceiptForm from '@/components/orderv2/GoodsReceiptForm';
import OrdersOverview from '@/components/orderv2/OrdersOverview';
import SimpleOrdersOverview from '@/components/orderv2/SimpleOrdersOverview';
import OrderDetail from '@/components/orderv2/OrderDetail';
import ForecastOrderMode from '@/components/orderv2/ForecastOrderMode';
import BulkOrderMode from '@/components/orderv2/BulkOrderMode';
import { Badge } from '@/components/ui/badge';

// Define the order steps
type OrderStep = 'overview' | 'mode' | 'warehouse' | 'supplier' | 'products' | 'additionalInfo' | 'summary' | 'viewOrder' | 'orderDetail' | 'sendOrder' | 'goodsReceipt' | 'warehouseReceiptOfExistingOrder';

const BestellungV2: React.FC = () => {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const params = useParams();
  const queryClient = useQueryClient();
  
  // State for the order process
  const [step, setStep] = useState<OrderStep>('mode'); // Starte mit der Bestellmodus-Auswahl
  
  // URL-Parameter verarbeiten beim Laden der Komponente
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const stepParam = urlParams.get('step') as OrderStep;
    const orderIdParam = urlParams.get('orderId');
    
    if (stepParam && orderIdParam) {
      setStep(stepParam);
      setOrderId(parseInt(orderIdParam));
      
      // Wenn wir eine bestehende Bestellung laden, Daten abrufen
      if (stepParam === 'sendOrder' || stepParam === 'goodsReceipt') {
        loadExistingOrderData(parseInt(orderIdParam));
      }
    }
  }, []);
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
    deliveryType: string;
    deliveryAddress: string;
    pickupLocation: string;
  }>({
    expectedDeliveryDate: null,
    priority: 'normal',
    notes: '',
    deliveryType: '',
    deliveryAddress: '',
    pickupLocation: ''
  });
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [existingOrderData, setExistingOrderData] = useState<any>(null);
  const [showEmailDialog, setShowEmailDialog] = useState<boolean>(false);
  const [emailPrepInProgress, setEmailPrepInProgress] = useState<boolean>(false);
  const [emailSendSuccess, setEmailSendSuccess] = useState<boolean>(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState<boolean>(false);
  
  // Funktion zum Laden von bestehenden Bestellungsdaten
  const loadExistingOrderData = async (orderIdToLoad: number) => {
    try {
      console.log(`Lade bestehende Bestellungsdaten für Bestellung ${orderIdToLoad}`);
      
      const response = await fetch(`/api/orders-direct/${orderIdToLoad}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Fehler beim Laden der Bestellung: ${response.status}`);
      }
      
      const orderData = await response.json();
      console.log("Bestellungsdaten geladen:", orderData);
      
      if (orderData) {
        setOrderNumber(orderData.order_number || '');
        setExistingOrderData(orderData);
        setWarehouseId(orderData.warehouse_id);
        setSupplierId(orderData.supplier_id);
        setSupplierName(orderData.supplier_name || 'Unbekannt');
        setWarehouseName(orderData.location_name || 'Unbekannt');
        
        // Lade auch die Bestellpositionen
        await loadOrderItems(orderIdToLoad);
      }
    } catch (error) {
      console.error("Fehler beim Laden der Bestellungsdaten:", error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bestellungsdaten konnten nicht geladen werden."
      });
    }
  };
  
  // Rekursive Funktion zum Laden von Bestellpositionen mit Retry-Logik
  const loadOrderItems = async (orderIdToLoad: number, retryCount = 0, maxRetries = 3) => {
    try {
      console.log(`Versuche Bestellpositionen zu laden für Bestellung ${orderIdToLoad} (Versuch ${retryCount + 1}/${maxRetries + 1})`);
      
      // API-Aufruf um alle Bestellpositionen zu laden über direkten SQL-Endpunkt
      const response = await fetch(`/api/order-items-direct/${orderIdToLoad}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(res => {
        if (!res.ok) {
          throw new Error(`Fehler beim Laden der Bestellpositionen: ${res.status} ${res.statusText}`);
        }
        return res.json();
      });
      
      console.log("Antwort vom direkten SQL-Endpunkt für Bestellpositionen:", response);
      
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
          items: items
        };
        
        // Aktualisiere State
        setExistingOrderData(updatedOrderData);
        
        // Setze die Produkte für die Anzeige in der Komponente
        setSelectedProducts(items.map((item: any) => ({
          id: item.product_id,
          productId: item.product_id,
          name: item.product_name || item.productName,
          orderQuantity: item.quantity,
          price: item.unit_price || item.unitPrice || 0,
          unit: item.unit || 'Stk.'
        })));
        
        // Erfolg melden
        return true;
      } else {
        console.warn("Keine Bestellpositionen gefunden oder leeres Array zurückgegeben.");
        
        // Bei maximal Versuchen und immer noch keine Items - KEINE Toast-Nachricht mehr
        if (retryCount >= maxRetries) {
          console.log("Keine Bestellpositionen gefunden - das ist normal für neue Bestellungen");
          return false;
        }
        
        // Noch nicht maximale Versuche erreicht - warten und erneut versuchen
        const waitTime = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponentielles Backoff bis max 10 Sekunden
        console.log(`Warte ${waitTime}ms vor erneutem Versuch...`);
        
        setTimeout(() => loadOrderItems(orderIdToLoad, retryCount + 1, maxRetries), waitTime);
        return false;
      }
    } catch (error) {
      console.error("Fehler beim Laden der Bestellpositionen:", error);
      
      // Bei maximal Versuchen - KEINE störende Toast-Nachricht mehr
      if (retryCount >= maxRetries) {
        console.log("Fehler beim Laden der Bestellpositionen (wird stillschweigend ignoriert):", error);
        return false;
      }
      
      // Noch nicht maximale Versuche erreicht - warten und erneut versuchen
      const waitTime = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponentielles Backoff bis max 10 Sekunden
      console.log(`Warte ${waitTime}ms vor erneutem Versuch...`);
      
      setTimeout(() => loadOrderItems(orderIdToLoad, retryCount + 1, maxRetries), waitTime);
      return false;
    }
  };
  
  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      console.log("Sende Bestellung an direkten SQL-Endpunkt");
      
      // Transformiere die Daten für den direkten SQL-Endpunkt
      // Formatiere Lieferdatum im Format YYYY-MM-DD für den Server
      const formattedDate = orderData.expectedDeliveryDate
        ? format(new Date(orderData.expectedDeliveryDate), 'yyyy-MM-dd')  // YYYY-MM-DD Format mit date-fns
        : null;
        
      console.log("Formatiertes Lieferdatum:", formattedDate);
        
      const directOrderData = {
        warehouseId: orderData.warehouseId,
        supplierId: orderData.supplierId,
        // Nur hinzufügen, wenn es ein valides Datum im richtigen Format gibt
        ...(formattedDate && { expectedDeliveryDate: formattedDate }),
        notes: orderData.notes || '',
        deliveryType: orderData.deliveryType || '',
        deliveryAddress: orderData.deliveryAddress || '',
        pickupLocation: orderData.pickupLocation || '',
        status: 'draft',
        // Transformiere die ausgewählten Produkte ins richtige Format
        orderItems: Array.isArray(orderData.products) ? orderData.products.map((product: any) => ({
          productId: Number(product.id),
          quantity: Number(product.quantity),
          price: Number(product.price || 0),
          unit: 'stk',  // Immer ASCII ohne Sonderzeichen verwenden
          productName: product.name || 'Unbekanntes Produkt'
        })) : []
      };
      
      // Nutze den Token für die Authentifizierung
      const storedToken = localStorage.getItem('auth_token');
      
      try {
        console.log("Sende Bestellung an direkten SQL-Endpunkt:", directOrderData);
        
        // Verwende die funktionierende direkte API-Route
        const response = await fetch('/api/orders-direct', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {})
          },
          body: JSON.stringify(directOrderData)
        });
        
        // Prüfen ob die Antwort erfolgreich war
        if (!response.ok) {
          throw new Error(`API-Fehler: ${response.status} ${response.statusText}`);
        }
        
        // JSON-Antwort verarbeiten
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.message || 'Fehler beim Erstellen der Bestellung');
        }
        
        console.log("Bestellung erfolgreich über direkten SQL-Endpunkt erstellt:", data);
        return data;
      } catch (error) {
        console.error("Fehler bei Bestellung über direkten SQL-Endpunkt:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Debugging zur Analyse der empfangenen Daten
      console.log("Bestellungs-Antwort vom direkten SQL-Endpunkt:", data);
      
      // Immer die Bestellungsliste invalidieren, unabhängig vom Ergebnis
      queryClient.invalidateQueries({queryKey: orderKeys.lists()});
      
      // Verarbeitung der Antwort vom direkten SQL-Endpunkt
      if (data && data.success && data.order) {
        // Extrahiere die eigentlichen Bestelldaten
        const orderData = data.order;
        
        // Setze Order-ID und Nummer
        setOrderId(orderData.id);
        setOrderNumber(orderData.order_number || '');
        
        // Formatiere Daten für die Anwendung
        const formattedOrderData = {
          id: orderData.id,
          orderNumber: orderData.order_number,
          warehouseId: orderData.warehouse_id,
          supplierId: orderData.supplier_id,
          status: orderData.status,
          orderDate: orderData.order_date,
          expectedDeliveryDate: orderData.expected_delivery_date,
          notes: orderData.notes || '',
          warehouseName: warehouseName,
          supplierName: supplierName
        };
        
        setExistingOrderData(formattedOrderData);
        
        // Bestellungsdaten anreichern mit ausgewählten Produkten
        if (selectedProducts && selectedProducts.length > 0) {
          console.log("Füge ausgewählte Produkte zu Bestellungsdaten hinzu:", selectedProducts.length);
          const enrichedOrderData = {
            ...formattedOrderData,
            items: selectedProducts.map(product => ({
              productId: product.id,
              productName: product.name || product.productName,
              quantity: product.orderQuantity || 1,
              price: product.price || 0,
              unit: product.unit || 'Stk.'
            }))
          };
          setExistingOrderData(enrichedOrderData);
        }
        
        // Toast mit der tatsächlichen Bestellnummer anzeigen
        toast({
          title: 'Bestellung erfolgreich erstellt',
          description: `Bestellungsnummer: ${orderData.order_number || 'erstellt'}`,
        });
        
        // Zum E-Mail-Versand-Schritt wechseln
        setStep('sendOrder');
        
        // Entferne separaten Aufruf für Bestellpositionen, da sie jetzt direkt
        // in der Bestellung mitgegeben werden und nicht mehr separat gespeichert werden müssen
        console.log("Bestellpositionen sind bereits in der Bestellung enthalten und müssen nicht separat gespeichert werden.");
      } else if (data && data.order && data.order.id) {
        // Geschachteltes Format mit order-Objekt
        setOrderId(data.order.id);
        setOrderNumber(data.order.orderNumber || '');
        setExistingOrderData(data.order);
        
        // Bestellungsdaten anreichern mit ausgewählten Produkten
        if (selectedProducts && selectedProducts.length > 0) {
          console.log("Füge ausgewählte Produkte zu Bestellungsdaten hinzu:", selectedProducts.length);
          const enrichedOrderData = {
            ...data.order,
            items: selectedProducts.map(product => ({
              productId: product.id,
              productName: product.name || product.productName,
              quantity: product.orderQuantity || 1,
              price: product.price || 0,
              unit: product.unit || 'Stk.'
            }))
          };
          setExistingOrderData(enrichedOrderData);
        }
        
        // Toast mit der tatsächlichen Bestellnummer anzeigen
        toast({
          title: 'Bestellung erfolgreich erstellt',
          description: `Bestellungsnummer: ${data.order.orderNumber || 'erstellt'}`,
        });
        
        // Zum E-Mail-Versand-Schritt wechseln
        setStep('sendOrder');
        
        // Zusätzliche API-Anfrage um sicherzustellen, dass die Bestellungsdaten vollständig sind
        if (data.order.id) {
          console.log("Lade vollständige Bestellungsdaten für ID:", data.order.id);
          fetch(`/api/orders-direct/${data.order.id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          })
            .then(res => res.json())
            .then(orderData => {
              if (orderData && orderData.id) {
                console.log("Vollständige Bestellungsdaten geladen:", orderData);
                setExistingOrderData(orderData);
              }
            })
            .catch(err => {
              console.warn("Fehler beim Laden der vollständigen Bestellungsdaten:", err);
            });
        }
      } else if (data && data.success) {
        console.warn("Erfolgsmeldung, aber unvollständige Daten vom Server erhalten:", data);
        
        // Bei Erfolg ohne ID Bestellungsliste neu laden und zurück zur Übersicht
        toast({
          title: 'Bestellung erfolgreich erstellt',
          description: data.message || 'Die Bestellung wurde gespeichert.',
        });
        
        // Cache unbedingt invalidieren, damit neue Bestellungen angezeigt werden
        queryClient.invalidateQueries({queryKey: orderKeys.lists()});
        
        // Zur Übersicht zurückkehren
        setStep('overview');
      } else {
        console.warn("Unvollständige oder unbekannte Daten vom Server erhalten:", data);
        
        // Fallback-Toast mit einer allgemeinen Erfolgsmeldung
        toast({
          title: 'Bestellung möglicherweise erstellt',
          description: 'Die Bestellung wurde möglicherweise gespeichert. Bitte prüfen Sie die Übersicht.',
          variant: 'default'
        });
        
        // Cache unbedingt invalidieren, damit neue Bestellungen angezeigt werden
        queryClient.invalidateQueries({queryKey: orderKeys.lists()});
        queryClient.invalidateQueries({queryKey: ['/api/orders-direct']});
        
        // NICHT zur Übersicht zurückkehren - das war das Problem!
        // setStep('overview'); // ENTFERNT
      }
      
      // Sicherstellen, dass selectedProducts zur Bestellung hinzugefügt wurden
      console.log("Bestellung erstellt. ID:", data?.id, "Nummer:", data?.orderNumber);
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
      
      // Cache invalidieren für sofortige Anzeige
      queryClient.invalidateQueries({queryKey: orderKeys.lists()});
      queryClient.invalidateQueries({queryKey: ['/api/orders-direct']});
      
      // Direkt zur neuen Bestellung wechseln (E-Mail-Versand)
      setStep("sendOrder");
    },
    onError: (error: any) => {
      console.error('Bestellfehler:', error);
      // Keine automatische Weiterleitung zur Startseite
      // Stattdessen nur eine Fehlermeldung anzeigen
      toast({
        title: 'Bestellung konnte nicht erstellt werden',
        description: 'Bitte versuchen Sie es erneut oder wenden Sie sich an den Support.',
        variant: 'destructive',
      });
      // Den Schritt nicht zurücksetzen - Nutzer bleibt im aktuellen Schritt
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
      const { orderId, receiptData } = goodsReceiptData;
      
      console.log("Goods receipt mutation input:", goodsReceiptData);
      console.log("Receipt data:", receiptData);
      
      // Transform the data to match the backend API expectations
      const receivedItems = [];
      
      for (const item of receiptData) {
        if (item.receivedQuantity > 0) {
          receivedItems.push({
            productId: item.productId,
            receivedQuantity: item.receivedQuantity,
            expiryDate: item.expiryDate || null,
            batchNumber: item.batchNumber || null
          });
        }
      }
      
      const transformedData = {
        receivedItems: receivedItems
      };
      
      console.log("Transformed data for API:", transformedData);
      
      return apiRequest(`/api/orders/${orderId}/receipt`, transformedData, 'post');
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
  
  // Liste aller Bestellungen für die Übersicht laden - direkt aus der Datenbank
  const { data: ordersList, isLoading: isLoadingOrdersList } = useQuery({
    queryKey: ['/api/orders-direct'],
    queryFn: async () => {
      try {
        console.log("BestellungV2: Lade Bestellungen direkt aus der Datenbank...");
        
        // Direkten SQL-Endpunkt nutzen
        const response = await fetch('/api/orders-direct', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': localStorage.getItem('auth_token') ? `Bearer ${localStorage.getItem('auth_token')}` : ''
          }
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Abrufen der Bestellungen: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("BestellungV2: Bestellungsdaten direkt aus DB geladen:", data);
        
        return data;
      } catch (error) {
        console.error("BestellungV2: Fehler beim Laden der Bestellungen:", error);
        return [];
      }
    }
  });
  
  // Fetch order data if editing an existing order
  const { data: order, isLoading: isLoadingOrder } = useQuery({
    queryKey: orderId ? orderKeys.detail(orderId) : ['no-order'],
    queryFn: () => {
      if (!orderId) return null;
      return fetch(`/api/orders-direct/${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(res => res.json());
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
  
  // Status-abhängige Navigation für Bestellungen - DIREKTE NAVIGATION OHNE POP-UP
  const handleSelectOrder = async (orderId: number) => {
    console.log("Bestellung ausgewählt mit ID:", orderId);
    
    try {
      // Lade die Bestellungsdaten direkt aus der API
      const response = await fetch('/orders-data');
      const ordersData = await response.json();
      console.log("Geladene Bestellungen:", ordersData);
      
      const selectedOrder = ordersData.find((order: any) => order.id === orderId);
      
      if (selectedOrder) {
        console.log("Gefundene Bestellung:", selectedOrder.id, "Status:", selectedOrder.status);
        
        // Setze die Bestellungsdaten für die Navigation
        setOrderId(orderId);
        
        // Lade die vollständigen Bestelldaten inklusive Items
        const orderDetailResponse = await fetch(`/api/orders-direct/${orderId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (orderDetailResponse.ok) {
          const orderDetailData = await orderDetailResponse.json();
          console.log("Vollständige Bestelldaten geladen:", orderDetailData);
          setExistingOrderData(orderDetailData);
        } else {
          // Fallback auf die ursprünglichen Daten
          setExistingOrderData(selectedOrder);
        }
        
        // Lade auch die Bestellpositionen separat für maximale Kompatibilität
        await loadOrderItems(orderId);
        
        // DIREKTE NAVIGATION basierend auf Status
        if (selectedOrder.status === 'draft') {
          // Draft-Bestellungen direkt zum Versenden
          setStep('sendOrder');
        } 
        else if (selectedOrder.status === 'sent') {
          // Versendete Bestellungen direkt zum Wareneingang
          setStep('goodsReceipt');
        }
        else {
          // Alle anderen Status zur Detailansicht
          setStep('orderDetail');
        }
      } else {
        console.log("Bestellung nicht gefunden - ID:", orderId);
      }
    } catch (error) {
      console.error("Fehler beim Laden der Bestellung:", error);
    }
  };
  
  // Event handler für das Markieren einer Bestellung als versendet
  const handleMarkOrderAsSent = async () => {
    if (!orderId) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Keine Bestellung ausgewählt"
      });
      return;
    }
    
    try {
      await markOrderAsSentMutation.mutateAsync(orderId);
      toast({
        title: "Erfolg",
        description: "Bestellung wurde als versendet markiert"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bestellung konnte nicht als versendet markiert werden"
      });
    }
  };
  
  // Event handler für den E-Mail-Versand
  const handleSendEmail = async () => {
    setEmailPrepInProgress(true);
    
    try {
      setEmailPrepInProgress(false);
      toast({
        title: "E-Mail vorbereitet",
        description: "E-Mail wurde erfolgreich vorbereitet"
      });
    } catch (error) {
      setEmailPrepInProgress(false);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "E-Mail konnte nicht vorbereitet werden"
      });
    }
  };
  
  // Email sending function
  const handleEmailSend = async (supplierEmail: string, additionalNotes: string) => {
    if (!orderId) {
      toast({
        title: 'Fehler',
        description: 'Keine Bestellungs-ID vorhanden',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      // Die Bestellung als gesendet markieren
      markOrderAsSentMutation.mutate(orderId);
      
      toast({
        title: 'E-Mail gesendet',
        description: 'Die Bestellung wurde erfolgreich per E-Mail versendet.',
      });
      
      // Nach erfolgreichem Versand zur Erfolgsmeldung
      // aber keine automatische Weiterleitung mehr
      toast({
        title: 'E-Mail erfolgreich versendet',
        description: 'Sie können jetzt zurück zur Bestellübersicht gehen oder eine weitere E-Mail senden.',
        duration: 5000,
      });
    } catch (error) {
      console.error('Fehler beim Senden der E-Mail:', error);
      toast({
        title: 'Fehler beim Senden',
        description: `Die E-Mail konnte nicht gesendet werden: ${(error as Error).message}`,
        variant: 'destructive',
      });
    }
  };
  
  // Funktion zur E-Mail-Vorbereitung mit robusten Fehlerprüfungen
  const prepareOrderEmail = (orderData: any, showToast = false) => {
    try {
      console.log("E-Mail-Vorbereitung für Bestellung:", orderData?.orderNumber || "Unbekannt", "showToast:", showToast);
      
      // Status setzen, dass die E-Mail-Vorbereitung aktiv ist
      setEmailPrepInProgress(true);
      
      // Sicherstellen, dass Bestelldaten vollständig sind
      if (!orderData || typeof orderData !== 'object') {
        console.error('Keine gültigen Bestelldaten für E-Mail:', orderData);
        setEmailPrepInProgress(false);
        if (showToast) {
          toast({
            title: 'Fehler bei der E-Mail-Vorbereitung',
            description: 'Die Bestelldaten sind unvollständig oder fehlerhaft.',
            variant: 'destructive'
          });
        }
        return;
      }
      
      // Extrahiere Bestellpositionen (für Logging) mit umfassenden Sicherheitsprüfungen
      let items: any[] = [];
      
      // Umfassende Prüfung aller möglichen Feldnamen und Strukturen
      const raw = orderData;
      try {
        items = 
          (Array.isArray(raw.items) && raw.items.length > 0 ? raw.items : null) || 
          (Array.isArray(raw.orderItems) && raw.orderItems.length > 0 ? raw.orderItems : null) || 
          (raw.data?.items && Array.isArray(raw.data.items) && raw.data.items.length > 0 ? raw.data.items : null) ||
          (raw.data?.orderItems && Array.isArray(raw.data.orderItems) && raw.data.orderItems.length > 0 ? raw.data.orderItems : null) || 
          (Array.isArray(raw.products) && raw.products.length > 0 ? raw.products : null) || 
          (Array.isArray(raw.selectedProducts) && raw.selectedProducts.length > 0 ? raw.selectedProducts : null) || 
          (Array.isArray(raw.lineItems) && raw.lineItems.length > 0 ? raw.lineItems : null) ||
          [];
      } catch (err) {
        console.error("Fehler beim Extrahieren der Bestellpositionen:", err);
        items = [];
      }
      
      // Sicherstellen, dass items wirklich ein Array ist
      if (!Array.isArray(items)) {
        console.warn("Items ist kein Array, wird auf leeres Array gesetzt");
        items = [];
      }
      
      console.log(`E-Mail-Vorbereitung: Bestellung ${orderData.orderNumber || ""} enthält ${items.length} Positionen`);
      
      // Bestelldaten für E-Mail aktualisieren
      if (items.length > 0) {
        // Sicherstellen, dass existingOrderData ein Array von items hat
        setExistingOrderData(prev => ({
          ...prev,
          items: items
        }));
      }
      
      // E-Mail-Dialog anzeigen, aber nur, wenn dies explizit angefordert wurde
      if (step === 'sendOrder') {
        setShowEmailDialog(true);
      }
      
      // E-Mail-Vorbereitung ist abgeschlossen
      setEmailPrepInProgress(false);
      
      // Fix: Keine Toast-Nachricht mehr bei E-Mail-Vorbereitung
      // Das Toast verursacht die unerwünschten Redirects
      
    } catch (error) {
      console.error('Fehler bei der E-Mail-Vorbereitung:', error);
      // Fehlerfall: E-Mail-Vorbereitung zurücksetzen
      setEmailPrepInProgress(false);
      
      if (showToast) {
        toast({
          title: 'Fehler bei der E-Mail-Vorbereitung',
          description: 'Die E-Mail konnte nicht vorbereitet werden. Details in der Konsole.',
          variant: 'destructive',
        });
      }
    }
  };
  
  // Überprüfe Parameter beim ersten Laden und lade Bestellung wenn eine ID vorhanden ist
  useEffect(() => {
    if (params && params.orderId) {
      const orderId = parseInt(params.orderId);
      setOrderId(orderId);
      
      // Bestellung über den direkten SQL-Endpunkt laden
      console.log(`Lade bestehende Bestellung mit ID ${orderId} über direkten SQL-Endpunkt...`);
      
      // Wir ändern nicht automatisch den Schritt beim Laden einer Bestellung
      // Der Schritt sollte explizit durch Benutzerinteraktion gesetzt werden
      // Die alte Zeile hat das Problem verursacht: setStep('overview');
      console.log('Bestellung wird geladen, aktueller Schritt bleibt:', step);
      
      // Bestellung aus der Datenbank laden
      fetch(`/api/orders-direct/${orderId}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Bestellung konnte nicht geladen werden: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log("Bestellung erfolgreich geladen:", data);
          
          // Aktualisiere Bestelldaten
          setExistingOrderData(data);
          
          // Aktualisiere auch einzelne Felder für die Verwendung in verschiedenen Komponenten
          setOrderNumber(data.order_number || '');
          setSupplierName(data.supplier_name || '');
          setSupplierId(data.supplier_id);
          
          // Verwende warehouse_id mit Fallback auf location_id
          setWarehouseId(data.warehouseId || data.warehouse_id || data.location_id);
          
          // Verwende warehouseName mit Fallback auf warehouse_name oder location_name
          setWarehouseName(data.warehouseName || data.warehouse_name || data.location_name || 'Unbekanntes Lager');
          
          // Hole die Bestellpositionen (falls noch nicht vorhanden)
          if (!data.items || data.items.length === 0) {
            // Lade Bestellpositionen über die direkte API, mit richtigem Typ für orderId
            loadOrderItems(Number(orderId));
          } else {
            // Verwende die bereits geladenen Bestellpositionen
            setSelectedProducts(data.items.map((item: any) => ({
              id: item.product_id,
              productId: item.product_id,
              name: item.product_name || item.productName,
              orderQuantity: item.quantity,
              price: item.unit_price || item.unitPrice || 0,
              unit: item.unit || 'Stk.'
            })));
          }
          
          // Setze den Schritt auf "viewOrder" für bestehende Bestellung
          // Zeigt die Bestelldetails an, ohne automatisch zum Wareneingang zu gehen
          setStep('viewOrder');
          console.log('Bestellung geladen, Schritt auf viewOrder gesetzt');
        })
        .catch(error => {
          console.error("Fehler beim Laden der Bestellung:", error);
          toast({
            title: "Fehler beim Laden der Bestellung",
            description: `Die Bestellung mit ID ${orderId} konnte nicht geladen werden: ${error.message}`,
            variant: "destructive"
          });
          
          // Zur Übersicht zurückkehren bei Fehler
          setStep('overview');
        });
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
    if ((step === 'sendOrder' || step === 'viewOrder' || step === 'warehouseReceiptOfExistingOrder') && existingOrderData && orderId) {
      console.log("Prüfe Bestellungsdetails:", existingOrderData);
      
      // Prüfen, ob bereits Bestellpositionen in irgendeinem bekannten Format vorhanden sind
      const hasItems = !!(
        (Array.isArray(existingOrderData.items) && existingOrderData.items.length > 0) ||
        (Array.isArray(existingOrderData.orderItems) && existingOrderData.orderItems.length > 0) ||
        (Array.isArray(existingOrderData.selectedProducts) && existingOrderData.selectedProducts.length > 0) ||
        (existingOrderData.data && Array.isArray(existingOrderData.data.items) && existingOrderData.data.items.length > 0)
      );
      
      if (!hasItems) {
        console.log("Bestellung hat keine Items, lade sie über API...");
        
        // Verwende die globale loadOrderItems-Funktion
        if (orderId) {
          loadOrderItems(Number(orderId));
          return;
        }
        
        // Falls die folgende Funktion erreicht wird, ist etwas schiefgelaufen
        const loadLocalOrderItems = async (orderIdToLoad = orderId, retryCount = 0, maxRetries = 3) => {
          try {
            console.log(`Versuche Bestellpositionen zu laden für Bestellung ${orderIdToLoad} (Versuch ${retryCount + 1}/${maxRetries + 1})`);
            
            // API-Aufruf um alle Bestellpositionen zu laden über direkten SQL-Endpunkt
            const response = await fetch(`/api/order-items-direct/${orderIdToLoad}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            }).then(res => {
              if (!res.ok) {
                throw new Error(`Fehler beim Laden der Bestellpositionen: ${res.status} ${res.statusText}`);
              }
              return res.json();
            });
            
            console.log("Antwort vom direkten SQL-Endpunkt für Bestellpositionen:", response);
            
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
              
              // Fix 3: prepareOrderEmail NICHT automatisch im useEffect aufrufen
              // Die E-Mail-Vorbereitung erfolgt nur noch beim Button-Click
              
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
                
                // Fix 3: prepareOrderEmail NICHT automatisch im useEffect aufrufen
                // Die E-Mail-Vorbereitung erfolgt nur noch beim Button-Click
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
        // Fix 3: prepareOrderEmail NICHT automatisch im useEffect aufrufen
        // Die E-Mail-Vorbereitung erfolgt nur noch beim Button-Click
      }
    }
  }, [step, existingOrderData, orderId, queryClient, selectedProducts, toast]);
  
  // Render the appropriate step content
  const renderContent = () => {
    switch (step) {
      case 'overview':
        // If forecast mode is selected, show ForecastOrderMode
        if (orderMode === 'forecast') {
          return (
            <ForecastOrderMode
              onBack={() => {
                setOrderMode('new');
                setStep('overview');
              }}
              onOrderCreated={(orderId) => {
                setOrderId(orderId);
                setStep('viewOrder');
              }}
            />
          );
        }
        
        // If bulk mode is selected, show BulkOrderMode
        if (orderMode === 'bulk') {
          return (
            <BulkOrderMode
              onBack={() => {
                setOrderMode('new');
                setStep('overview');
              }}
              onOrderCreated={(orderId) => {
                setOrderId(orderId);
                setStep('viewOrder');
              }}
            />
          );
        }
        
        return (
          <SimpleOrdersOverview 
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
                deliveryType: '',
                deliveryAddress: '',
                pickupLocation: ''
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
                onClick={() => {
                  console.log('REDIRECT TRIGGERED HERE', { step, reason: 'onClick / zurück zur Übersicht Button' });
                  navigate('/bestellungen');
                }}
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
                // Forecast and bulk modes bypass warehouse-specific supplier selection
                if (mode === 'forecast' || mode === 'bulk') {
                  setStep('overview'); // Will render forecast or bulk mode
                } else {
                  setStep('supplier');
                }
              }}
              sourceOrderId={sourceOrderId}
              onSourceOrderChange={(id) => setSourceOrderId(id)}
            />
            />
          </>
        );
      case 'warehouse':
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
            <WarehouseSelector
              selectedWarehouseId={warehouseId}
              onSelectWarehouse={(id, name) => {
                setWarehouseId(id);
                setWarehouseName(name);
                setStep('supplier');
              }}
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
            additionalInfo={additionalInfo}
            onAdditionalInfoChange={setAdditionalInfo}
            onNext={() => setStep('summary')}
            onBack={() => setStep('products')}
          />
        );
      case 'summary':
        return (
          <OrderSummary
            warehouseName={warehouseName}
            supplierName={supplierName}
            selectedProducts={selectedProducts}
            additionalInfo={additionalInfo}
            onBack={() => setStep('additionalInfo')}
            onCreateOrder={() => {
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
              
              // Vorbereitung der Bestelldaten
              // Datumsformatierung für die API
              let formattedDeliveryDate = null;
              
              // Wenn kein Lieferdatum angegeben, setzen wir es auf 3 Tage in der Zukunft
              const defaultDate = new Date();
              defaultDate.setDate(defaultDate.getDate() + 3);
              
              // Verwende entweder das gewählte Datum oder das Standarddatum
              const dateToFormat = additionalInfo?.expectedDeliveryDate || defaultDate;
              
              try {
                // Einfaches String-Format "YYYY-MM-DD" für die API (ohne Zeit-Komponente)
                const year = dateToFormat.getFullYear();
                const month = String(dateToFormat.getMonth() + 1).padStart(2, '0');
                const day = String(dateToFormat.getDate()).padStart(2, '0');
                formattedDeliveryDate = `${year}-${month}-${day}`;
                console.log("Formatiertes Lieferdatum:", formattedDeliveryDate);
              } catch (e) {
                console.error("Fehler bei der Datumsformatierung:", e);
                // Fallback zum heutigen Datum im Format YYYY-MM-DD
                formattedDeliveryDate = new Date().toISOString().split('T')[0];
              }
              
              console.log("Vorbereitete Bestelldaten:", {
                warehouseId,
                supplierId,
                expectedDeliveryDate: formattedDeliveryDate,
                priority: additionalInfo?.priority || 'normal',
                notes: additionalInfo?.notes || ''
              });
              
              // Bestellung mit formatierten Daten erstellen
              console.log("Sende Bestellung an API mit Datum:", formattedDeliveryDate);
              
              // Prüfen, ob selectedProducts ein Array ist
              if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
                toast({
                  title: "Keine Produkte",
                  description: "Bitte wählen Sie mindestens ein Produkt aus.",
                  variant: "destructive",
                });
                return;
              }
              
              // Erstelle ein Payload-Objekt mit allen Feldern inklusive Lieferart
              const orderPayload: any = {
                warehouseId: Number(warehouseId),
                supplierId: Number(supplierId),
                priority: additionalInfo?.priority || 'normal',
                notes: additionalInfo?.notes || '',
                deliveryType: additionalInfo?.deliveryType || '',
                // Set addresses automatically based on delivery type
                deliveryAddress: additionalInfo?.deliveryType === 'delivery' ? warehouseName : '',
                pickupLocation: additionalInfo?.deliveryType === 'pickup' ? supplierName : '',
                orderDate: new Date().toISOString().split('T')[0], // Als String im Format "YYYY-MM-DD"
                items: selectedProducts.map(product => ({
                  productId: Number(product.id),
                  quantity: Number(product.orderQuantity || 0), // Fallback für fehlende Mengen
                  price: Number(product.price || 0), // Fallback für fehlende Preise
                  discountPercent: 0,
                  notes: product.orderNotes || ''
                }))
              };
              
              // Füge expectedDeliveryDate nur hinzu, wenn es tatsächlich einen gültigen Wert hat
              if (formattedDeliveryDate && typeof formattedDeliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(formattedDeliveryDate)) {
                orderPayload.expectedDeliveryDate = formattedDeliveryDate;
                console.log("Lieferdatum zur Bestellung hinzugefügt:", formattedDeliveryDate);
              } else {
                console.log("Kein Lieferdatum gesetzt oder ungültiges Format");
              }
              
              // Erweitere das Payload für den direkten SQL-Endpunkt
              const directSqlPayload = {
                ...orderPayload,
                warehouseName: warehouseName,
                supplierName: supplierName,
                // Produkte mit den richtigen Feldnamen für den direkten SQL-Endpunkt
                products: selectedProducts.map(product => ({
                  id: Number(product.id),
                  name: product.name || product.productName,
                  quantity: Number(product.orderQuantity || 0),
                  price: Number(product.price || 0),
                  unit: product.unit || 'Stück',
                  orderNotes: product.orderNotes || ''
                }))
              };
              
              console.log("Sende Bestellung an direkten SQL-Endpunkt", directSqlPayload);
              // Sende die Bestellung ab
              createOrderMutation.mutate(directSqlPayload);
            }}
            isSubmitting={createOrderMutation.isPending}
          />
        );
      case 'viewOrder':
        if (!existingOrderData) {
          return (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Fehler beim Laden</AlertTitle>
              <AlertDescription>
                Die Bestelldaten konnten nicht geladen werden.
              </AlertDescription>
            </Alert>
          );
        }
        
        return (
          <OrderDetail 
            orderId={orderId!}
            onBack={() => setStep('overview')}
            onEmailPrepare={() => {
              console.log('E-Mail-Button geklickt - starte E-Mail-Vorbereitung');
              setStep('sendOrder');
              prepareOrderEmail(existingOrderData, true);
            }}
          />
        );
        
      case 'orderDetail':
        return (
          <OrderDetail 
            orderId={orderId!}
            onBack={() => setStep('overview')}
            onEmailPrepare={() => {
              console.log('E-Mail-Button geklickt - starte E-Mail-Vorbereitung');
              setStep('sendOrder');
              prepareOrderEmail(existingOrderData, true);
            }}
          />
        );
        
      case 'sendOrder':
        return (
          <>
            <div className="mb-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  // Wenn es eine bestehende Bestellung ist, gehen wir zurück zur Bestellungsansicht
                  if (existingOrderData) {
                    setStep('viewOrder');
                  } 
                  // Wenn es eine neue Bestellung ist, gehen wir zurück zur Zusammenfassung
                  else if (createOrderMutation.isPending || createOrderMutation.isSuccess) {
                    setStep('summary');
                  } else {
                    // Fallback: zurück zur Übersicht
                    setStep('overview');
                  }
                }}
                size="sm"
              >
                <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
                Zurück
              </Button>
            </div>
            
            <EmailDialog
              open={true}
              onOpenChange={(open) => {
                if (!open) {
                  // When dialog is closed, navigate back
                  if (existingOrderData) {
                    setStep('viewOrder');
                  } else if (orderMode === 'new') {
                    setStep('summary');
                  } else {
                    setStep('overview');
                  }
                }
              }}
              orderId={orderId!}
              supplierEmail={existingOrderData?.supplier_email || existingOrderData?.supplierEmail || ''}
              orderNumber={orderNumber || existingOrderData?.order_number || ''}
              supplierName={supplierName || existingOrderData?.supplier_name || existingOrderData?.supplierName || 'Unbekannt'}
              onSendEmail={(success) => {
                if (success) {
                  console.log('E-Mail erfolgreich gesendet, navigiere zurück zur Übersicht');
                  setStep('overview');
                }
              }}
            />
          </>
        );
      case 'goodsReceipt':
        // Stelle sicher, dass das Order-Objekt die Items enthält
        const orderWithItems = {
          ...(order || existingOrderData),
          items: selectedProducts || (order && order.items) || (existingOrderData && existingOrderData.items) || [],
          orderItems: selectedProducts || (order && order.orderItems) || (existingOrderData && existingOrderData.orderItems) || []
        };
        
        console.log("GoodsReceiptForm order data:", orderWithItems);
        console.log("Order items:", orderWithItems.items);
        console.log("Order orderItems:", orderWithItems.orderItems);
        console.log("Selected products:", selectedProducts);
        
        return (
          <GoodsReceiptForm
            order={orderWithItems}
            onSubmit={(receiptData) => {
              // Prüfen, ob alle Positionen geprüft wurden
              const allItemsChecked = receiptData.every(item => 
                item.receivedQuantity !== null && item.receivedQuantity !== undefined
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
                orderId: orderId!,
                receiptData
              });
            }}
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
              order={order || existingOrderData}
              onSubmit={(receiptData) => {
                // Prüfen, ob alle Positionen geprüft wurden
                const allItemsChecked = receiptData.every(item => 
                  item.receivedQuantity !== null && item.receivedQuantity !== undefined
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
                  orderId: orderId!,
                  receiptData
                });
              }}
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
      {step !== 'overview' && (
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">
            Neue Bestellung
            {orderId && (
              <Badge variant="outline" className="ml-2">
                {orderNumber || `#${orderId}`}
              </Badge>
            )}
          </h1>
        </div>
      )}
      
      {step === 'overview' && (
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Bestellungen</h1>
        </div>
      )}
      
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
      
      {/* Dialog für E-Mail-Versand */}
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
      
      {/* Dialog für Bestelldetails */}
      {orderDetailsOpen && orderId && existingOrderData && (
        <Dialog open={orderDetailsOpen} onOpenChange={setOrderDetailsOpen}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>Bestellung {orderNumber || `#${orderId}`}</DialogTitle>
              <DialogDescription>
                Details zur ausgewählten Bestellung
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium">Lieferant</h3>
                  <p>{existingOrderData.supplierName || 'Nicht angegeben'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Lager</h3>
                  <p>{existingOrderData.warehouseName || 'Nicht angegeben'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Status</h3>
                  <p>
                    <Badge variant={existingOrderData.status === 'delivered' ? 'success' : 
                              (existingOrderData.status === 'draft' ? 'outline' : 'default')}>
                      {existingOrderData.status === 'draft' ? 'Entwurf' : 
                       existingOrderData.status === 'ordered' ? 'Bestellt' : 
                       existingOrderData.status === 'delivered' ? 'Geliefert' : 
                       existingOrderData.status}
                    </Badge>
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Bestelldatum</h3>
                  <p>{existingOrderData.orderDate ? new Date(existingOrderData.orderDate).toLocaleDateString('de-DE') : 'Nicht angegeben'}</p>
                </div>
              </div>
              
              <Separator className="my-2" />
              
              <div>
                <h3 className="text-sm font-medium mb-2">Bestellpositionen</h3>
                {Array.isArray(existingOrderData.items) && existingOrderData.items.length > 0 ? (
                  <div className="border rounded-md">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="p-2 text-left">Produkt</th>
                          <th className="p-2 text-right">Menge</th>
                          <th className="p-2 text-right">Preis</th>
                          <th className="p-2 text-right">Gesamt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {existingOrderData.items.map((item: any, index: number) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                            <td className="p-2">{item.productName}</td>
                            <td className="p-2 text-right">{item.quantity} {item.unit || 'Stk'}</td>
                            <td className="p-2 text-right">{(item.unitPrice || item.price)?.toFixed(2) || '0.00'} €</td>
                            <td className="p-2 text-right">{((item.unitPrice || item.price || 0) * item.quantity).toFixed(2)} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    Keine Bestellpositionen vorhanden
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => setOrderDetailsOpen(false)}
              >
                Schließen
              </Button>
              
              {existingOrderData.status === 'draft' && (
                <Button 
                  onClick={() => {
                    setOrderDetailsOpen(false);
                    
                    // WICHTIG: Zuerst den Schritt ändern, dann erst die E-Mail vorbereiten
                    setStep('sendOrder');
                    
                    // Kurze Verzögerung, um sicherzustellen, dass der Komponentenzustand aktualisiert wurde
                    setTimeout(() => {
                      // E-Mail-Vorbereitung explizit starten - MIT Toast, da explizite Benutzeraktion
                      prepareOrderEmail(existingOrderData, true);
                      console.log('E-Mail-Vorbereitung nach Step-Änderung gestartet (von Details-View)');
                    }, 50);
                  }}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  E-Mail senden
                </Button>
              )}
              
              {!existingOrderData.receivedAt && (
                <Button 
                  onClick={() => {
                    setOrderDetailsOpen(false);
                    handleReceiveOrder(orderId);
                  }}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Wareneingang
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default BestellungV2;