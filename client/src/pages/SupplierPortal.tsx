/**
 * Lieferantenportal - Sichere Zugangsseite für Lieferanten
 * 
 * Features:
 * - PIN-Verifizierung
 * - Lieferanten-Stammdaten
 * - Produktübersicht
 * - Bestellhistorie
 * - Kommentarsystem für Änderungswünsche
 */

import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Shield, Building2, Package, ShoppingCart, MessageSquare, Clock, MapPin, Phone, Mail, Globe, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface SupplierData {
  id: number;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  shortDescription?: string;
  description?: string;
  photos?: string[];
  paymentTerms?: string;
  deliveryTerms?: string;
  minimumOrderValue?: number;
  deliveryDays?: string;
  taxId?: string;
}

interface ProductData {
  id: number;
  productName: string;
  description?: string;
  shortDescription?: string;
  category?: string;
  sku?: string;
  supplierSku?: string;
  articleSupplier?: string;
  packageSize?: string;
  packageQuantity?: number;
  baseUnitName?: string;
  shelfLifeDays?: number;
  minOrderQuantity?: number;
  vat?: number;
  ingredients?: string;
  allergens?: string;
  nutritionalInfo?: string;
  photos?: string[];
  barcode?: string;
  status?: string;
}

interface OrderData {
  id: number;
  orderNumber: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  totalAmount?: number;
  locationName?: string;
  deliveryLocation?: string;
  notes?: string;
  priority?: string;
  items: OrderItemData[];
}

interface OrderItemData {
  id: number;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
  quantityDelivered?: number;
  sku?: string;
  supplierSku?: string;
}

interface PendingOrderData {
  id: number;
  orderNumber: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  confirmedDeliveryDate?: string;
  confirmedDeliveryTime?: string;
  supplierComments?: string;
  deliveryConfirmationStatus?: string;
  totalAmount?: number;
  currency?: string;
  notes?: string;
  priority?: string;
  locationName?: string;
  deliveryLocation?: string;
  deliveryAddress?: string;
  items: OrderItemData[];
}

export default function SupplierPortal({ params: routeParams }: { params?: { accessToken: string } }) {
  const [match, params] = useRoute('/lieferant/:accessToken');
  
  // Use direct params if provided, otherwise use route params
  const finalParams = routeParams || params;
  const [pinCode, setPinCode] = useState('');
  const [activeTab, setActiveTab] = useState('stammdaten');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [supplierData, setSupplierData] = useState<SupplierData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderData[]>([]);
  const [confirmationData, setConfirmationData] = useState({
    orderId: null as number | null,
    confirmedDeliveryDate: '',
    confirmedDeliveryTime: '',
    supplierComments: ''
  });
  const [feedbackData, setFeedbackData] = useState({
    feedbackType: 'general' as 'supplier_data' | 'product_data' | 'order_data' | 'general',
    entityType: 'supplier' as 'supplier' | 'product' | 'order' | undefined,
    entityId: undefined as number | undefined,
    fieldName: '',
    currentValue: '',
    suggestedValue: '',
    comment: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    contactEmail: '',
    contactPhone: ''
  });

  const accessToken = finalParams?.accessToken;

  // Debug-Ausgabe für Routing
  console.log('SupplierPortal gerendert mit:', { 
    match, 
    params, 
    routeParams, 
    finalParams, 
    accessToken,
    location: window.location.pathname 
  });

  useEffect(() => {
    console.log('useEffect triggered with accessToken:', accessToken);
    if (!accessToken) {
      console.error('Kein Access-Token gefunden im URL-Parameter');
      setIsLoading(false);
      return;
    }

    console.log('Access-Token gefunden:', accessToken);
    // Authentifiziere direkt mit Access Token
    authenticateWithToken(accessToken);
  }, [accessToken]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!accessToken || !pinCode) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie Ihren 4-stelligen PIN-Code ein.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest('/api/supplier-portal/verify-pin', {
        method: 'POST',
        body: {
          accessToken,
          pinCode
        }
      });

      if (response.success) {
        setSessionToken(response.sessionToken);
        setIsAuthenticated(true);
        localStorage.setItem('supplier_session_token', response.sessionToken);
        
        // Lade Lieferantendaten
        await loadSupplierData(response.sessionToken);
        
        toast({
          title: "Erfolgreich angemeldet",
          description: "Willkommen in Ihrem Lieferantenportal!"
        });
      } else {
        toast({
          title: "Anmeldung fehlgeschlagen",
          description: response.error || "Ungültiger PIN-Code",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('PIN-Verifizierung fehlgeschlagen:', error);
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const authenticateWithToken = async (token: string) => {
    try {
      setIsLoading(true);
      console.log('Sending authentication request with token:', token);
      
      // Direct fetch instead of apiRequest to bypass potential issues
      const response = await fetch('/api/supplier-portal/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ accessToken: token })
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        const sessionToken = data.data.sessionToken;
        setSessionToken(sessionToken);
        setIsAuthenticated(true);
        localStorage.setItem('supplier_session_token', sessionToken);
        await loadSupplierData(sessionToken);
        
        toast({
          title: "Erfolgreich angemeldet",
          description: "Willkommen in Ihrem Lieferantenportal!"
        });
      } else {
        console.error('Authentifizierung fehlgeschlagen:', data.error);
        setIsAuthenticated(false);
        
        toast({
          title: "Authentifizierung fehlgeschlagen",
          description: data.error || "Unbekannter Fehler",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Authentifizierung fehlgeschlagen:', error);
      setIsAuthenticated(false);
      
      toast({
        title: "Verbindungsfehler",
        description: "Verbindung zum Portal fehlgeschlagen.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSupplierData = async (token: string) => {
    try {
      console.log('Loading supplier data with token:', token.substring(0, 10) + '...');
      
      // Parallel laden von Lieferanten-, Produkt- und Bestelldaten
      const [supplierResponse, productsResponse, ordersResponse] = await Promise.all([
        fetch('/api/supplier-portal/supplier-data', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(async res => {
          console.log('[SUPPLIER-DATA] Response status:', res.status);
          const text = await res.text();
          console.log('[SUPPLIER-DATA] Response text:', text);
          try {
            return JSON.parse(text);
          } catch (e) {
            console.error('[SUPPLIER-DATA] JSON parse error:', e);
            return { success: false, error: 'Invalid JSON response' };
          }
        }),
        fetch('/api/supplier-portal/products', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(async res => {
          console.log('[PRODUCTS] Response status:', res.status);
          const text = await res.text();
          console.log('[PRODUCTS] Response text:', text.substring(0, 200) + '...');
          try {
            return JSON.parse(text);
          } catch (e) {
            console.error('[PRODUCTS] JSON parse error:', e);
            return { success: false, error: 'Invalid JSON response' };
          }
        }),
        fetch('/api/supplier-portal/orders', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(async res => {
          console.log('[ORDERS] Response status:', res.status);
          const text = await res.text();
          console.log('[ORDERS] Response text:', text.substring(0, 200) + '...');
          try {
            return JSON.parse(text);
          } catch (e) {
            console.error('[ORDERS] JSON parse error:', e);
            return { success: false, error: 'Invalid JSON response' };
          }
        })
      ]);

      console.log('Supplier response:', supplierResponse);
      console.log('Products response:', productsResponse);
      console.log('Orders response:', ordersResponse);

      if (supplierResponse.success) {
        console.log('Setting supplier data:', supplierResponse.data);
        setSupplierData(supplierResponse.data);
      } else {
        console.error('Supplier data loading failed:', supplierResponse);
      }

      if (productsResponse.success) {
        console.log('Setting products:', productsResponse.data);
        setProducts(productsResponse.data);
      } else {
        console.error('Products loading failed:', productsResponse);
      }

      if (ordersResponse.success) {
        console.log('Setting orders:', ordersResponse.data);
        setOrders(ordersResponse.data);
      } else {
        console.error('Orders loading failed:', ordersResponse);
      }

      // Lade auch pending orders für Bestätigung
      await loadPendingOrders(token);

    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden.",
        variant: "destructive"
      });
    }
  };

  const loadPendingOrders = async (token: string) => {
    try {
      const response = await fetch('/api/supplier-portal/pending-orders', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      
      if (data.success) {
        setPendingOrders(data.data);
      } else {
        console.error('Pending orders loading failed:', data);
      }
    } catch (error) {
      console.error('Fehler beim Laden der zu bestätigenden Bestellungen:', error);
    }
  };

  const handleConfirmDelivery = async (orderId: number) => {
    if (!sessionToken || !confirmationData.confirmedDeliveryDate) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Lieferdatum aus.",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest('/api/supplier-portal/confirm-delivery', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}` },
        body: {
          orderId,
          confirmedDeliveryDate: confirmationData.confirmedDeliveryDate,
          confirmedDeliveryTime: confirmationData.confirmedDeliveryTime,
          supplierComments: confirmationData.supplierComments
        }
      });

      if (response.success) {
        toast({
          title: "Bestätigung erfolgreich",
          description: `Bestellung ${response.data.orderNumber} wurde bestätigt.`
        });

        // Reset confirmation form
        setConfirmationData({
          orderId: null,
          confirmedDeliveryDate: '',
          confirmedDeliveryTime: '',
          supplierComments: ''
        });

        // Reload pending orders
        await loadPendingOrders(sessionToken);
      } else {
        toast({
          title: "Fehler bei Bestätigung",
          description: response.error || "Bestätigung konnte nicht gespeichert werden.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Bestätigung fehlgeschlagen:', error);
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive"
      });
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sessionToken || !feedbackData.comment.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest('/api/supplier-portal/feedback', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}` },
        body: feedbackData
      });

      if (response.success) {
        toast({
          title: "Feedback übermittelt",
          description: "Ihr Feedback wurde erfolgreich übermittelt. Wir werden es zeitnah bearbeiten."
        });

        // Reset form
        setFeedbackData({
          feedbackType: 'general',
          entityType: undefined,
          entityId: undefined,
          fieldName: '',
          currentValue: '',
          suggestedValue: '',
          comment: '',
          priority: 'medium',
          contactEmail: '',
          contactPhone: ''
        });
      } else {
        toast({
          title: "Fehler",
          description: response.error || "Feedback konnte nicht übermittelt werden.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Feedback-Übermittlung fehlgeschlagen:', error);
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive"
      });
    }
  };

  const logout = () => {
    localStorage.removeItem('supplier_session_token');
    setIsAuthenticated(false);
    setSessionToken(null);
    setSupplierData(null);
    setProducts([]);
    setOrders([]);
  };

  if (!match) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Ungültiger Zugangslink</CardTitle>
            <CardDescription>
              Der von Ihnen verwendete Link ist ungültig oder abgelaufen.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <CardTitle>Lieferantenportal</CardTitle>
            <CardDescription>
              Portal wird geladen...
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Zugang verweigert</CardTitle>
            <CardDescription>
              Der Portal-Link ist ungültig oder abgelaufen. Bitte wenden Sie sich an unser Team für einen neuen Zugang.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header mit verbessertem Responsive Design */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 space-y-3 sm:space-y-0">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-blue-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">Lieferantenportal</h1>
                <p className="text-sm text-gray-500 truncate">
                  {supplierData?.name || 'Vollständige Datenübersicht und Verwaltung'}
                </p>
                <p className="text-xs text-gray-400">
                  Letzter Zugriff: {new Date().toLocaleDateString('de-DE', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={logout} className="self-start sm:self-center">
              Abmelden
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Verbesserte Navigation für Mobile */}
          <div className="bg-white rounded-lg shadow-sm p-1">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
              <TabsTrigger value="stammdaten" className="flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 px-2 py-2 text-xs sm:text-sm">
                <Building2 className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">Grunddaten</span>
                <span className="sm:hidden">Firma</span>
              </TabsTrigger>
              <TabsTrigger value="produkte" className="flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 px-2 py-2 text-xs sm:text-sm">
                <Package className="h-4 w-4 flex-shrink-0" />
                <span>Produkte</span>
              </TabsTrigger>
              <TabsTrigger value="bestellungen" className="flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 px-2 py-2 text-xs sm:text-sm">
                <ShoppingCart className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">Bestellungen</span>
                <span className="sm:hidden">Orders</span>
              </TabsTrigger>
              <TabsTrigger value="bestaetigung" className="flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 px-2 py-2 text-xs sm:text-sm">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">Bestätigung</span>
                <span className="sm:hidden">Status</span>
              </TabsTrigger>
              <TabsTrigger value="feedback" className="flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 px-2 py-2 text-xs sm:text-sm col-span-2 sm:col-span-1">
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">Änderungen</span>
                <span className="sm:hidden">Feedback</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="stammdaten">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Lieferanten-Stammdaten</CardTitle>
                  <CardDescription>
                    Hier sehen Sie Ihre aktuellen Stammdaten. Bei Änderungswünschen nutzen Sie bitte den "Änderungen" Tab.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {supplierData ? (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <Label className="text-sm font-medium text-blue-700">Firmenname</Label>
                            <p className="text-base font-semibold text-blue-900 mt-1">{supplierData.name}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Ansprechpartner</Label>
                            <p className="text-base mt-1">{supplierData.contactPerson || 'Nicht verfügbar'}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Kurzbeschreibung</Label>
                            <p className="text-base mt-1">{supplierData.shortDescription || 'Nicht verfügbar'}</p>
                          </div>
                          {supplierData.description && (
                            <div>
                              <Label className="text-sm font-medium text-gray-500">Detailbeschreibung</Label>
                              <p className="text-sm text-gray-600 mt-1">{supplierData.description}</p>
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Adresse</Label>
                            <div className="text-base mt-1">
                              {supplierData.address ? (
                                <div className="bg-gray-50 p-3 rounded-lg">
                                  <p>{supplierData.address}</p>
                                  <p>{supplierData.postalCode} {supplierData.city}</p>
                                  {supplierData.country && <p>{supplierData.country}</p>}
                                </div>
                              ) : (
                                <p className="text-gray-400 italic">Nicht verfügbar</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-6 border-t">
                        <div className="flex items-start space-x-3 p-3 rounded-lg border">
                          <Phone className="h-5 w-5 text-blue-500 mt-1 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <Label className="text-sm font-medium text-gray-500">Telefon</Label>
                            <p className="text-base mt-1 truncate">{supplierData.phone || 'Nicht verfügbar'}</p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 rounded-lg border">
                          <Mail className="h-5 w-5 text-green-500 mt-1 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <Label className="text-sm font-medium text-gray-500">E-Mail</Label>
                            <p className="text-base mt-1 truncate">{supplierData.email || 'Nicht verfügbar'}</p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 rounded-lg border">
                          <Globe className="h-5 w-5 text-purple-500 mt-1 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <Label className="text-sm font-medium text-gray-500">Website</Label>
                            <div className="text-base mt-1">
                              {supplierData.website ? (
                                <a href={supplierData.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">
                                  {supplierData.website}
                                </a>
                              ) : (
                                <span className="text-gray-400 italic">Nicht verfügbar</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {(supplierData.paymentTerms || supplierData.deliveryTerms || supplierData.minimumOrderValue) && (
                        <div className="pt-6 border-t">
                          <h3 className="text-lg font-medium mb-4">Geschäftsbedingungen</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {supplierData.paymentTerms && (
                              <div>
                                <Label className="text-sm font-medium text-gray-500">Zahlungsbedingungen</Label>
                                <p className="text-base">{supplierData.paymentTerms}</p>
                              </div>
                            )}
                            {supplierData.deliveryTerms && (
                              <div>
                                <Label className="text-sm font-medium text-gray-500">Lieferbedingungen</Label>
                                <p className="text-base">{supplierData.deliveryTerms}</p>
                              </div>
                            )}
                            {supplierData.minimumOrderValue && (
                              <div>
                                <Label className="text-sm font-medium text-gray-500">Mindestbestellwert</Label>
                                <p className="text-base">{supplierData.minimumOrderValue.toFixed(2)} €</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="max-w-md mx-auto">
                        <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Grunddaten werden geladen...</h3>
                        <p className="text-gray-500 mb-4">
                          Wir laden Ihre Lieferanten-Stammdaten. Dies dauert normalerweise nur wenige Sekunden.
                        </p>
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span className="text-sm text-gray-400">Daten werden abgerufen...</span>
                        </div>
                        {/* Debug-Info nur für Development */}
                        {import.meta.env.DEV && (
                          <details className="mt-4 text-left">
                            <summary className="text-xs text-gray-400 cursor-pointer">Debug-Info (nur Development)</summary>
                            <pre className="text-xs text-gray-400 mt-2 p-2 bg-gray-100 rounded overflow-auto">
                              {JSON.stringify({ supplierData, isAuthenticated, sessionToken: sessionToken?.substring(0, 10) + '...' }, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="produkte">
            <Card>
              <CardHeader>
                <CardTitle>Produktübersicht</CardTitle>
                <CardDescription>
                  Alle Ihre Produkte im System ({products.length} Artikel)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {products.map((product) => (
                    <div key={product.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-medium">{product.productName}</h3>
                          <p className="text-sm text-gray-600 mt-1">{product.shortDescription}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                            {product.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <Label className="text-gray-500">Systemnummer</Label>
                          <p className="font-mono">{product.id}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500">Eigene Referenz</Label>
                          <p className="font-mono">{product.supplierSku || product.articleSupplier || 'Nicht vergeben'}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500">Gebindegröße</Label>
                          <p>{product.packageSize || `${product.packageQuantity || 1} ${product.baseUnitName || 'Stück'}`}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500">MwSt</Label>
                          <p>{product.vat}%</p>
                        </div>
                      </div>

                      {(product.ingredients || product.allergens) && (
                        <div className="pt-3 border-t space-y-2">
                          {product.ingredients && (
                            <div>
                              <Label className="text-gray-500">Inhaltsstoffe</Label>
                              <p className="text-sm">{product.ingredients}</p>
                            </div>
                          )}
                          {product.allergens && (
                            <div>
                              <Label className="text-gray-500">Allergene</Label>
                              <p className="text-sm text-orange-600">{product.allergens}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {product.shelfLifeDays && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">MHD: {product.shelfLifeDays} Tage</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {products.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Noch keine Produkte im System erfasst.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bestellungen">
            <Card>
              <CardHeader>
                <CardTitle>Aktuelle Bestellungen</CardTitle>
                <CardDescription>
                  Versendete und gelieferte Bestellungen ({orders.length} Bestellungen)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Keine Bestellungen gefunden</p>
                    <p className="text-sm">Hier werden versendete und gelieferte Bestellungen angezeigt</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <div key={order.id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-lg">{order.orderNumber}</h3>
                            <p className="text-sm text-gray-600">
                              Bestellt am: {new Date(order.orderDate).toLocaleDateString('de-DE')}
                            </p>
                            {order.expectedDeliveryDate && (
                              <p className="text-sm text-gray-600">
                                Lieferdatum: {new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE')}
                              </p>
                            )}
                            <p className="text-sm text-gray-600">
                              📦 Lieferung - {order.locationName}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge 
                              variant={order.status === 'DELIVERED' || order.status === 'delivered' ? 'default' : 'secondary'}
                              className={order.status === 'DELIVERED' || order.status === 'delivered' ? 'bg-green-600' : 'bg-blue-600'}
                            >
                              {order.status === 'DELIVERED' || order.status === 'delivered' ? '✓ Geliefert' : 
                               order.status === 'SHIPPED' ? '📦 Versendet' :
                               order.status === 'delivered' ? 'Geliefert' : 
                               order.status === 'open' ? 'Offen' : 
                               order.status === 'ordered' ? 'Bestellt' : 
                               order.status}
                            </Badge>
                            {order.totalAmount && (
                              <p className="text-sm font-medium mt-2">
                                {order.totalAmount.toFixed(2)} €
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {order.items && order.items.length > 0 ? (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-3 flex items-center">
                              <Package className="h-4 w-4 mr-2 text-blue-500" />
                              Bestellpositionen ({order.items.length}):
                            </h4>
                            <div className="space-y-2">
                              {order.items.map((item, index) => (
                                <div key={item.id || index} className="flex justify-between items-center text-sm bg-gray-50 p-3 rounded-lg hover:bg-gray-100 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-gray-900 block truncate">{item.productName}</span>
                                    {item.sku && <span className="text-gray-500 text-xs">SKU: {item.sku}</span>}
                                  </div>
                                  <div className="text-right ml-4 flex-shrink-0">
                                    <span className="font-semibold text-blue-600">{item.quantity} {item.unit || 'Stück'}</span>
                                    {item.unitPrice && (
                                      <div className="text-gray-600 text-xs">à {item.unitPrice.toFixed(2)} €</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="border-t pt-4">
                            <div className="text-center py-4 text-gray-400">
                              <Package className="h-6 w-6 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">Keine Bestellpositionen verfügbar</p>
                            </div>
                          </div>
                        )}

                        {order.notes && (
                          <div className="pt-3 border-t">
                            <Label className="text-gray-500">Hinweise</Label>
                            <p className="text-sm">{order.notes}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bestaetigung">
            <Card>
              <CardHeader>
                <CardTitle>Bestellungen bestätigen</CardTitle>
                <CardDescription>
                  Hier können Sie Liefertermine bestätigen und Bestellungen bearbeiten ({pendingOrders.length} Bestellungen warten auf Bestätigung)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Keine offenen Bestellungen</p>
                    <p className="text-sm">Alle Bestellungen sind bereits bestätigt oder bearbeitet.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {pendingOrders.map((order) => (
                      <div key={order.id} className="border rounded-lg p-6 space-y-4 bg-blue-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-lg text-blue-900">{order.orderNumber}</h3>
                            <p className="text-sm text-gray-600">
                              Bestellt am: {new Date(order.orderDate).toLocaleDateString('de-DE')}
                            </p>
                            {order.expectedDeliveryDate && (
                              <p className="text-sm text-gray-600">
                                Gewünschtes Lieferdatum: {new Date(order.expectedDeliveryDate).toLocaleDateString('de-DE')}
                              </p>
                            )}
                            <p className="text-sm text-gray-600">
                              📍 Lieferort: {order.locationName}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              ⏳ Bestätigung ausstehend
                            </Badge>
                            {order.totalAmount && (
                              <p className="text-sm font-medium mt-2">
                                {order.totalAmount.toFixed(2)} €
                              </p>
                            )}
                          </div>
                        </div>

                        {order.items && order.items.length > 0 && (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-3">Bestellpositionen:</h4>
                            <div className="space-y-2">
                              {order.items.map((item) => (
                                <div key={item.id} className="flex justify-between items-center text-sm bg-white p-3 rounded border">
                                  <div className="flex-1">
                                    <span className="font-medium">{item.productName}</span>
                                    {item.sku && <span className="text-gray-500 ml-2">({item.sku})</span>}
                                  </div>
                                  <div className="flex items-center space-x-4">
                                    <span className="font-medium">{item.quantity} {item.unit || 'Stück'}</span>
                                    {item.unitPrice && (
                                      <span className="text-gray-600">à {item.unitPrice.toFixed(2)} €</span>
                                    )}
                                    {item.totalPrice && (
                                      <span className="font-medium text-blue-600">{item.totalPrice.toFixed(2)} €</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="border-t pt-4 bg-white rounded-lg p-4">
                          <h4 className="font-medium mb-4 text-blue-900">🚚 Lieferung bestätigen</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`delivery-date-${order.id}`}>Lieferdatum *</Label>
                              <Input
                                id={`delivery-date-${order.id}`}
                                type="date"
                                value={confirmationData.orderId === order.id ? confirmationData.confirmedDeliveryDate : ''}
                                onChange={(e) => setConfirmationData({
                                  orderId: order.id,
                                  confirmedDeliveryDate: e.target.value,
                                  confirmedDeliveryTime: confirmationData.orderId === order.id ? confirmationData.confirmedDeliveryTime : '',
                                  supplierComments: confirmationData.orderId === order.id ? confirmationData.supplierComments : ''
                                })}
                                min={new Date().toISOString().split('T')[0]}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`delivery-time-${order.id}`}>Lieferzeit (optional)</Label>
                              <Input
                                id={`delivery-time-${order.id}`}
                                type="time"
                                value={confirmationData.orderId === order.id ? confirmationData.confirmedDeliveryTime : ''}
                                onChange={(e) => setConfirmationData(prev => 
                                  prev.orderId === order.id 
                                    ? { ...prev, confirmedDeliveryTime: e.target.value }
                                    : { orderId: order.id, confirmedDeliveryDate: '', confirmedDeliveryTime: e.target.value, supplierComments: '' }
                                )}
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2 mt-4">
                            <Label htmlFor={`comments-${order.id}`}>Kommentare zur Lieferung (optional)</Label>
                            <Textarea
                              id={`comments-${order.id}`}
                              value={confirmationData.orderId === order.id ? confirmationData.supplierComments : ''}
                              onChange={(e) => setConfirmationData(prev => 
                                prev.orderId === order.id 
                                  ? { ...prev, supplierComments: e.target.value }
                                  : { orderId: order.id, confirmedDeliveryDate: '', confirmedDeliveryTime: '', supplierComments: e.target.value }
                              )}
                              placeholder="Weitere Hinweise zur Lieferung..."
                              rows={2}
                            />
                          </div>

                          <div className="flex justify-end mt-4">
                            <Button 
                              onClick={() => handleConfirmDelivery(order.id)}
                              disabled={confirmationData.orderId !== order.id || !confirmationData.confirmedDeliveryDate}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              ✓ Lieferung bestätigen
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>Änderungen und Rückmeldungen</CardTitle>
                <CardDescription>
                  Teilen Sie uns Korrekturen oder Anmerkungen zu Ihren Daten mit. Diese werden nicht automatisch übernommen, sondern per E-Mail an uns übermittelt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFeedbackSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="feedbackType">Art der Rückmeldung</Label>
                      <Select 
                        value={feedbackData.feedbackType} 
                        onValueChange={(value: any) => setFeedbackData(prev => ({ ...prev, feedbackType: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="supplier_data">Lieferanten-Stammdaten</SelectItem>
                          <SelectItem value="product_data">Produktdaten</SelectItem>
                          <SelectItem value="order_data">Bestellungen</SelectItem>
                          <SelectItem value="general">Allgemeine Anmerkung</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="priority">Priorität</Label>
                      <Select 
                        value={feedbackData.priority} 
                        onValueChange={(value: any) => setFeedbackData(prev => ({ ...prev, priority: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Niedrig</SelectItem>
                          <SelectItem value="medium">Mittel</SelectItem>
                          <SelectItem value="high">Hoch</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="currentValue">Aktueller Wert (optional)</Label>
                      <Input
                        id="currentValue"
                        value={feedbackData.currentValue}
                        onChange={(e) => setFeedbackData(prev => ({ ...prev, currentValue: e.target.value }))}
                        placeholder="Der aktuell gespeicherte Wert"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="suggestedValue">Vorgeschlagener Wert (optional)</Label>
                      <Input
                        id="suggestedValue"
                        value={feedbackData.suggestedValue}
                        onChange={(e) => setFeedbackData(prev => ({ ...prev, suggestedValue: e.target.value }))}
                        placeholder="Der neue, korrekte Wert"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="comment">Kommentar / Beschreibung *</Label>
                    <Textarea
                      id="comment"
                      value={feedbackData.comment}
                      onChange={(e) => setFeedbackData(prev => ({ ...prev, comment: e.target.value }))}
                      placeholder="Beschreiben Sie hier die gewünschten Änderungen oder Ihre Anmerkungen..."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">E-Mail für Rückfragen (optional)</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={feedbackData.contactEmail}
                        onChange={(e) => setFeedbackData(prev => ({ ...prev, contactEmail: e.target.value }))}
                        placeholder="ihre@email.de"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPhone">Telefon für Rückfragen (optional)</Label>
                      <Input
                        id="contactPhone"
                        type="tel"
                        value={feedbackData.contactPhone}
                        onChange={(e) => setFeedbackData(prev => ({ ...prev, contactPhone: e.target.value }))}
                        placeholder="+49 123 456789"
                      />
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div className="text-sm text-gray-600">
                      <p>Ihre Rückmeldung wird per E-Mail an unser Team übermittelt und zeitnah bearbeitet. 
                      Änderungen werden nicht automatisch im System übernommen, sondern nach Prüfung manuell eingepflegt.</p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={!feedbackData.comment.trim()}>
                      Feedback übermitteln
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}