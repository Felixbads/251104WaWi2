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

export default function SupplierPortal() {
  const [match, params] = useRoute('/lieferant/:accessToken');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [supplierData, setSupplierData] = useState<SupplierData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
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

  const accessToken = params?.accessToken;

  useEffect(() => {
    // Prüfe, ob bereits ein Session-Token vorhanden ist
    const savedSessionToken = localStorage.getItem('supplier_session_token');
    if (savedSessionToken) {
      validateSession(savedSessionToken);
    }
  }, []);

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

  const validateSession = async (token: string) => {
    try {
      const response = await apiRequest('/api/supplier-portal/validate-session', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.success) {
        setSessionToken(token);
        setIsAuthenticated(true);
        await loadSupplierData(token);
      } else {
        localStorage.removeItem('supplier_session_token');
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Session-Validierung fehlgeschlagen:', error);
      localStorage.removeItem('supplier_session_token');
      setIsAuthenticated(false);
    }
  };

  const loadSupplierData = async (token: string) => {
    try {
      // Parallel laden von Lieferanten-, Produkt- und Bestelldaten
      const [supplierResponse, productsResponse, ordersResponse] = await Promise.all([
        apiRequest('/api/supplier-portal/supplier-data', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        apiRequest('/api/supplier-portal/products', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        apiRequest('/api/supplier-portal/orders', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (supplierResponse.success) {
        setSupplierData(supplierResponse.data);
      }

      if (productsResponse.success) {
        setProducts(productsResponse.data);
      }

      if (ordersResponse.success) {
        setOrders(ordersResponse.data);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden.",
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
    setPinCode('');
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <CardTitle>Lieferantenportal</CardTitle>
            <CardDescription>
              Bitte geben Sie Ihren 4-stelligen PIN-Code ein, um auf Ihre Daten zuzugreifen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pinCode">PIN-Code</Label>
                <Input
                  id="pinCode"
                  type="text"
                  maxLength={4}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  className="text-center text-lg tracking-widest"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || pinCode.length !== 4}>
                {isLoading ? "Wird überprüft..." : "Anmelden"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Lieferantenportal</h1>
                <p className="text-sm text-gray-500">{supplierData?.name}</p>
              </div>
            </div>
            <Button variant="outline" onClick={logout}>
              Abmelden
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="stammdaten" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="stammdaten" className="flex items-center space-x-2">
              <Building2 className="h-4 w-4" />
              <span>Stammdaten</span>
            </TabsTrigger>
            <TabsTrigger value="produkte" className="flex items-center space-x-2">
              <Package className="h-4 w-4" />
              <span>Produkte</span>
            </TabsTrigger>
            <TabsTrigger value="bestellungen" className="flex items-center space-x-2">
              <ShoppingCart className="h-4 w-4" />
              <span>Bestellungen</span>
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4" />
              <span>Änderungen</span>
            </TabsTrigger>
          </TabsList>

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
                  {supplierData && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Firmenname</Label>
                            <p className="text-base font-medium">{supplierData.name}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Ansprechpartner</Label>
                            <p className="text-base">{supplierData.contactPerson || 'Nicht angegeben'}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Kurzbeschreibung</Label>
                            <p className="text-base">{supplierData.shortDescription || 'Nicht angegeben'}</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Adresse</Label>
                            <p className="text-base">
                              {supplierData.address && (
                                <>
                                  {supplierData.address}<br />
                                  {supplierData.postalCode} {supplierData.city}<br />
                                  {supplierData.country}
                                </>
                              )}
                              {!supplierData.address && 'Nicht angegeben'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t">
                        <div className="flex items-center space-x-3">
                          <Phone className="h-5 w-5 text-gray-400" />
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Telefon</Label>
                            <p className="text-base">{supplierData.phone || 'Nicht angegeben'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Mail className="h-5 w-5 text-gray-400" />
                          <div>
                            <Label className="text-sm font-medium text-gray-500">E-Mail</Label>
                            <p className="text-base">{supplierData.email || 'Nicht angegeben'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Globe className="h-5 w-5 text-gray-400" />
                          <div>
                            <Label className="text-sm font-medium text-gray-500">Website</Label>
                            <p className="text-base">
                              {supplierData.website ? (
                                <a href={supplierData.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  {supplierData.website}
                                </a>
                              ) : (
                                'Nicht angegeben'
                              )}
                            </p>
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
                            <h3 className="font-medium text-lg">{order.order_number || order.orderNumber}</h3>
                            <p className="text-sm text-gray-600">
                              Bestellt am: {new Date(order.created_at || order.orderDate).toLocaleDateString('de-DE')}
                            </p>
                            {order.delivery_date && (
                              <p className="text-sm text-gray-600">
                                Lieferdatum: {new Date(order.delivery_date).toLocaleDateString('de-DE')}
                              </p>
                            )}
                            <p className="text-sm text-gray-600">
                              {order.delivery_type === 'pickup' ? '🚚 Abholung' : '📦 Lieferung'} - {order.warehouse_name || order.locationName}
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
                            {(order.total_amount || order.totalAmount) && (
                              <p className="text-sm font-medium mt-2">
                                {(order.total_amount || order.totalAmount).toFixed(2)} €
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {order.items && order.items.length > 0 && (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-2">Bestellpositionen:</h4>
                            <div className="space-y-2">
                              {order.items.map((item, index) => (
                                <div key={item.id || index} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                                  <div className="flex-1">
                                    <span className="font-medium">{item.product_name || item.productName}</span>
                                    {item.sku && <span className="text-gray-500 ml-2">({item.sku})</span>}
                                  </div>
                                  <div className="text-right">
                                    <span className="font-medium">{item.quantity} {item.unit || 'Stück'}</span>
                                    {(item.unit_price || item.unitPrice) && (
                                      <span className="text-gray-600 ml-2">à {(item.unit_price || item.unitPrice).toFixed(2)} €</span>
                                    )}
                                  </div>
                                </div>
                              ))}
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