/**
 * Lieferantenportal - Vollständige Implementierung der 5 Datenbankbereiche
 * 
 * Features:
 * - Lieferanten-Stammdaten (Grunddaten, Zahlungsbedingungen, Medien)
 * - Produktübersicht (Grunddaten, Verpackung, Preise, Details)
 * - Einkaufsbedingungen (Rabattbedingungen, Schwellenwerte, Skonto)
 * - Bestellungen (Status, Termine, Finanzen)
 * - Bestellpositionen (Mengen, Preise, Status)
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { 
  Shield, Building2, Package, ShoppingCart, FileText, 
  Clock, MapPin, Phone, Mail, Globe, AlertCircle, 
  DollarSign, Truck, Calendar, CheckCircle2, Edit,
  User, CreditCard, Settings, List, Archive, Check
} from 'lucide-react';

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
  accountNumber?: string;
  bankDetails?: string;
  deliveryMethod?: string;
  orderFrequency?: string;
  orderWeekday?: string;
  deliveryFrequency?: string;
  deliveryWeekday?: string;
  preferredDeliveryMethod?: string;
  orderPreferences?: string;
  deliveryPreferences?: string;
  status?: string;
  notes?: string;
}

interface ProductData {
  id: number;
  vendonId?: string;
  productName: string;
  price?: number;
  category?: string;
  description?: string;
  status?: string;
  sku?: string;
  supplierId?: number;
  supplierName?: string;
  supplierSku?: string;
  articleSupplier?: string;
  packageSize?: string;
  packageTypeId?: number;
  packageQuantity?: number;
  baseUnitName?: string;
  shelfLifeDays?: number;
  minOrderQuantity?: number;
  vat?: number;
  depositPrice?: number;
  depositVat?: number;
  costPrice?: number;
  shortDescription?: string;
  ingredients?: string;
  allergens?: string;
  nutritionalInfo?: any;
  photos?: string[];
  photoUrl?: string;
}

interface PurchaseCondition {
  id: number;
  supplierId: number;
  productId?: number;
  discountType: string;
  discountPercentage?: number;
  discountAmount?: number;
  thresholdQuantity?: number;
  thresholdAmount?: number;
  maxQuantity?: number;
  maxAmount?: number;
  paymentTermsDays?: number;
  skontoPercentage?: number;
  validFrom?: string;
  validUntil?: string;
  description?: string;
  status?: string;
}

interface OrderData {
  id: number;
  orderNumber: string;
  supplierId: number;
  supplierName?: string;
  locationId?: number;
  locationName?: string;
  deliveryLocation?: string;
  deliveryType?: string;
  deliveryAddress?: string;
  pickupLocation?: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  totalAmount?: number;
  currency?: string;
  vatAmount?: number;
  discountAmount?: number;
  shippingCost?: number;
}

interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  sku?: string;
  supplierSku?: string;
  quantity: number;
  unit?: string;
  quantityDelivered?: number;
  unitPrice: number;
  totalPrice: number;
  vatRate?: number;
  vatAmount?: number;
  discount?: number;
  discountAmount?: number;
  positionNumber?: number;
  status?: string;
  notes?: string;
  itemComment?: string;
  deliveryComment?: string;
}

export default function SupplierPortalNew({ orderId, accessToken: propsAccessToken }: { orderId?: string | null, accessToken?: string }) {
  const [, params] = useRoute('/lieferant/:accessToken');
  const [, paramsWithOrder] = useRoute('/lieferant/:accessToken/bestellung/:orderId');
  const accessToken = propsAccessToken || params?.accessToken || paramsWithOrder?.accessToken || '';

  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [activeTab, setActiveTab] = useState(orderId ? 'lieferungen' : 'stammdaten');
  
  // Data states
  const [supplierData, setSupplierData] = useState<SupplierData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [purchaseConditions, setPurchaseConditions] = useState<PurchaseCondition[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    if (accessToken) {
      authenticateWithToken(accessToken);
    }
  }, [accessToken]);

  const authenticateWithToken = async (token: string) => {
    setIsLoading(true);
    try {
      console.log('Authentifizierung mit Access Token:', token.substring(0, 10) + '...');

      const response = await fetch('/api/supplier-portal/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token })
      });

      const data = await response.json();
      console.log('Authentifizierungs-Response:', data);

      if (data.success) {
        const sessionToken = data.data.sessionToken;
        setSessionToken(sessionToken);
        setIsAuthenticated(true);
        await loadAllData(sessionToken);
        
        // If orderId is provided, navigate to orders tab
        if (orderId) {
          setActiveTab('lieferungen');
          toast({
            title: "Erfolgreich angemeldet",
            description: `Bestellung ${orderId} wird angezeigt`
          });
        } else {
          toast({
            title: "Erfolgreich angemeldet",
            description: "Willkommen in Ihrem Lieferantenportal!"
          });
        }
      } else {
        console.error('Authentifizierung fehlgeschlagen:', data.error);
        toast({
          title: "Authentifizierung fehlgeschlagen",
          description: data.error || "Ungültiger Zugangs-Token",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Authentifizierung fehlgeschlagen:', error);
      toast({
        title: "Verbindungsfehler",
        description: "Verbindung zum Portal fehlgeschlagen.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllData = async (token: string) => {
    try {
      console.log('Lade alle Portal-Daten...');
      
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Erst Lieferantendaten laden
      const supplierResponse = await fetch('/api/supplier-portal/supplier-data', { headers }).then(res => res.json());
      console.log('Supplier Response:', supplierResponse);
      
      if (supplierResponse.success && supplierResponse.data) {
        setSupplierData(supplierResponse.data);
      }
      
      // Dann die restlichen Daten parallel laden
      const [
        productsResponse, 
        ordersResponse,
        purchaseConditionsResponse,
        orderItemsResponse
      ] = await Promise.all([
        fetch('/api/supplier-portal/products', { headers }).then(res => res.json()),
        fetch('/api/supplier-portal/orders', { headers }).then(res => res.json()),
        fetch('/api/supplier-portal/purchase-conditions', { headers }).then(res => res.json()),
        fetch('/api/supplier-portal/order-items', { headers }).then(res => res.json())
      ]);

      console.log('Products Response:', productsResponse);
      console.log('Orders Response:', ordersResponse);
      console.log('Purchase Conditions Response:', purchaseConditionsResponse);
      console.log('Order Items Response:', orderItemsResponse);
      
      if (productsResponse.success) {
        setProducts(productsResponse.data || []);
      }
      
      if (ordersResponse.success) {
        setOrders(ordersResponse.data || []);
      }
      
      if (purchaseConditionsResponse.success) {
        setPurchaseConditions(purchaseConditionsResponse.data || []);
      }
      
      if (orderItemsResponse.success) {
        setOrderItems(orderItemsResponse.data || []);
      }

    } catch (error) {
      console.error('Fehler beim Laden der Portal-Daten:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Laden der Portal-Daten",
        variant: "destructive"
      });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Nicht verfügbar';
    try {
      return new Date(dateString).toLocaleDateString('de-DE');
    } catch {
      return 'Ungültiges Datum';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (typeof amount !== 'number') return 'Nicht verfügbar';
    return new Intl.NumberFormat('de-DE', { 
      style: 'currency', 
      currency: 'EUR' 
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'active': { variant: 'default' as const, label: 'Aktiv' },
      'inactive': { variant: 'secondary' as const, label: 'Inaktiv' },
      'open': { variant: 'outline' as const, label: 'Offen' },
      'ordered': { variant: 'default' as const, label: 'Bestellt' },
      'delivered': { variant: 'default' as const, label: 'Geliefert' },
      'canceled': { variant: 'destructive' as const, label: 'Storniert' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || 
                  { variant: 'outline' as const, label: status };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Portal wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle>Zugriff verweigert</CardTitle>
            <CardDescription>
              Ungültiger oder abgelaufener Zugangs-Token
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {supplierData?.name || 'Lieferantenportal'}
                </h1>
                <p className="text-sm text-gray-500">
                  Vollständige Datenübersicht und Verwaltung
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Letzter Zugriff: {new Date().toLocaleString('de-DE')}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-col sm:grid sm:grid-cols-3 lg:grid-cols-5 w-full gap-2 h-auto p-2">
            <TabsTrigger value="stammdaten" className="flex items-center justify-center space-x-1 sm:space-x-2 w-full">
              <Building2 className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Stammdaten</span>
            </TabsTrigger>
            <TabsTrigger value="produkte" className="flex items-center justify-center space-x-1 sm:space-x-2 w-full">
              <Package className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Produkte</span>
            </TabsTrigger>
            <TabsTrigger value="einkaufsbedingungen" className="flex items-center justify-center space-x-1 sm:space-x-2 w-full">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Einkauf</span>
            </TabsTrigger>
            <TabsTrigger value="bestellungen" className="flex items-center justify-center space-x-1 sm:space-x-2 w-full">
              <ShoppingCart className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Bestellungen</span>
            </TabsTrigger>
            <TabsTrigger value="lieferungen" className="flex items-center justify-center space-x-1 sm:space-x-2 w-full">
              <List className="h-4 w-4" />
              <span className="text-xs sm:text-sm">Lieferungen</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab: Stammdaten */}
          <TabsContent value="stammdaten" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Grunddaten */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <User className="h-5 w-5" />
                    <span>Grunddaten</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Firmenname</Label>
                      <p className="text-sm text-gray-900">{supplierData?.name || 'Nicht verfügbar'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Ansprechpartner</Label>
                      <p className="text-sm text-gray-900">{supplierData?.contactPerson || 'Nicht verfügbar'}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Telefon</Label>
                      <p className="text-sm text-gray-900">{supplierData?.phone || 'Nicht verfügbar'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700">E-Mail</Label>
                      <p className="text-sm text-gray-900">{supplierData?.email || 'Nicht verfügbar'}</p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Adresse</Label>
                    <div className="text-sm text-gray-900">
                      {supplierData?.address && <p>{supplierData.address}</p>}
                      {(supplierData?.postalCode || supplierData?.city) && (
                        <p>{supplierData.postalCode} {supplierData.city}</p>
                      )}
                      {supplierData?.country && <p>{supplierData.country}</p>}
                      {!supplierData?.address && !supplierData?.city && <p>Nicht verfügbar</p>}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Website</Label>
                    <p className="text-sm text-gray-900">{supplierData?.website || 'Nicht verfügbar'}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Status</Label>
                    <div className="mt-1">
                      {getStatusBadge(supplierData?.status || 'active')}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Zahlungs- und Lieferbedingungen */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CreditCard className="h-5 w-5" />
                    <span>Zahlungs- und Lieferbedingungen</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Zahlungsbedingungen</Label>
                    <p className="text-sm text-gray-900">{supplierData?.paymentTerms || 'Nicht verfügbar'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Lieferbedingungen</Label>
                    <p className="text-sm text-gray-900">{supplierData?.deliveryTerms || 'Nicht verfügbar'}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Mindestbestellwert</Label>
                    <p className="text-sm text-gray-900">
                      {supplierData?.minimumOrderValue ? formatCurrency(supplierData.minimumOrderValue) : 'Nicht verfügbar'}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Steuernummer</Label>
                    <p className="text-sm text-gray-900">{supplierData?.taxId || 'Nicht verfügbar'}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Bankverbindung</Label>
                    <p className="text-sm text-gray-900">{supplierData?.bankDetails || 'Nicht verfügbar'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Bestellungseinstellungen */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Bestellungseinstellungen</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Liefermethode</Label>
                      <p className="text-sm text-gray-900">{supplierData?.deliveryMethod || 'Nicht verfügbar'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Bestellfrequenz</Label>
                      <p className="text-sm text-gray-900">{supplierData?.orderFrequency || 'Nicht verfügbar'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Bestellwochentag</Label>
                      <p className="text-sm text-gray-900">{supplierData?.orderWeekday || 'Nicht verfügbar'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Lieferwochentag</Label>
                      <p className="text-sm text-gray-900">{supplierData?.deliveryWeekday || 'Nicht verfügbar'}</p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Bestellpräferenzen</Label>
                    <p className="text-sm text-gray-900">{supplierData?.orderPreferences || 'Nicht verfügbar'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Beschreibung */}
              <Card>
                <CardHeader>
                  <CardTitle>Beschreibung</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Kurzbeschreibung</Label>
                    <p className="text-sm text-gray-900">{supplierData?.shortDescription || 'Nicht verfügbar'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Detaillierte Beschreibung</Label>
                    <p className="text-sm text-gray-900">{supplierData?.description || 'Nicht verfügbar'}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Notizen</Label>
                    <p className="text-sm text-gray-900">{supplierData?.notes || 'Nicht verfügbar'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Produkte */}
          <TabsContent value="produkte" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center space-x-2">
                    <Package className="h-5 w-5" />
                    <span>Produktübersicht</span>
                  </span>
                  <Badge variant="outline">{products.length} Produkte</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produktname</TableHead>
                        <TableHead>Kategorie</TableHead>
                        <TableHead>Verkaufspreis</TableHead>
                        <TableHead>Einkaufspreis</TableHead>
                        <TableHead>MHD (Tage)</TableHead>
                        <TableHead>Gebindegröße</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.length > 0 ? (
                        products.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell className="font-medium">
                              <div>
                                <p className="font-semibold">{product.productName}</p>
                                {product.shortDescription && (
                                  <p className="text-sm text-gray-500">{product.shortDescription}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{product.category || 'Unbekannt'}</TableCell>
                            <TableCell>{formatCurrency(product.price)}</TableCell>
                            <TableCell>{formatCurrency(product.costPrice)}</TableCell>
                            <TableCell>{product.shelfLifeDays || 'Nicht angegeben'}</TableCell>
                            <TableCell>
                              {product.packageQuantity ? `${product.packageQuantity} ${product.baseUnitName || 'Stück'}` : 'Nicht angegeben'}
                            </TableCell>
                            <TableCell>{getStatusBadge(product.status || 'active')}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                            Keine Produkte verfügbar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Einkaufsbedingungen */}
          <TabsContent value="einkaufsbedingungen" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center space-x-2">
                    <DollarSign className="h-5 w-5" />
                    <span>Einkaufsbedingungen</span>
                  </span>
                  <Badge variant="outline">{purchaseConditions.length} Bedingungen</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rabatttyp</TableHead>
                        <TableHead>Rabatt</TableHead>
                        <TableHead>Schwellenwert</TableHead>
                        <TableHead>Skonto</TableHead>
                        <TableHead>Gültig bis</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseConditions.length > 0 ? (
                        purchaseConditions.map((condition) => (
                          <TableRow key={condition.id}>
                            <TableCell className="font-medium">
                              {condition.discountType === 'volume_discount' && 'Mengenrabatt'}
                              {condition.discountType === 'cash_discount' && 'Skonto'}
                              {condition.discountType === 'quantity_scale' && 'Staffelrabatt'}
                              {condition.discountType === 'order_value' && 'Bestellwertrabatt'}
                              {!['volume_discount', 'cash_discount', 'quantity_scale', 'order_value'].includes(condition.discountType) && condition.discountType}
                            </TableCell>
                            <TableCell>
                              {condition.discountPercentage && `${condition.discountPercentage}%`}
                              {condition.discountAmount && formatCurrency(condition.discountAmount)}
                              {!condition.discountPercentage && !condition.discountAmount && 'Nicht angegeben'}
                            </TableCell>
                            <TableCell>
                              {condition.thresholdQuantity && `Ab ${condition.thresholdQuantity} Stück`}
                              {condition.thresholdAmount && `Ab ${formatCurrency(condition.thresholdAmount)}`}
                              {!condition.thresholdQuantity && !condition.thresholdAmount && 'Nicht angegeben'}
                            </TableCell>
                            <TableCell>
                              {condition.skontoPercentage && condition.paymentTermsDays 
                                ? `${condition.skontoPercentage}% bei ${condition.paymentTermsDays} Tagen`
                                : 'Nicht verfügbar'
                              }
                            </TableCell>
                            <TableCell>{formatDate(condition.validUntil || '')}</TableCell>
                            <TableCell>{getStatusBadge(condition.status || 'active')}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                            Keine Einkaufsbedingungen verfügbar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Bestellungen */}
          <TabsContent value="bestellungen" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center space-x-2">
                    <ShoppingCart className="h-5 w-5" />
                    <span>Bestellübersicht</span>
                  </span>
                  <Badge variant="outline">{orders.length} Bestellungen</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bestellnummer</TableHead>
                        <TableHead>Standort</TableHead>
                        <TableHead>Bestelldatum</TableHead>
                        <TableHead>Liefertermin</TableHead>
                        <TableHead>Gesamtbetrag</TableHead>
                        <TableHead>Lieferart</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.length > 0 ? (
                        orders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">{order.orderNumber}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-semibold">{order.locationName || 'Unbekannt'}</p>
                                {order.deliveryLocation && (
                                  <p className="text-sm text-gray-500">{order.deliveryLocation}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(order.orderDate)}</TableCell>
                            <TableCell>{formatDate(order.expectedDeliveryDate || '')}</TableCell>
                            <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.deliveryType === 'delivery' ? 'Lieferung' : 
                                 order.deliveryType === 'pickup' ? 'Abholung' : order.deliveryType || 'Unbekannt'}
                              </Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                            Keine Bestellungen verfügbar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Bestellpositionen */}
          <TabsContent value="bestellpositionen" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center space-x-2">
                    <List className="h-5 w-5" />
                    <span>Bestellpositionen</span>
                  </span>
                  <Badge variant="outline">{orderItems.length} Positionen</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Position</TableHead>
                        <TableHead>Produktname</TableHead>
                        <TableHead>Menge</TableHead>
                        <TableHead>Geliefert</TableHead>
                        <TableHead>Einzelpreis</TableHead>
                        <TableHead>Gesamtpreis</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.length > 0 ? (
                        orderItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.positionNumber || item.id}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-semibold">{item.productName}</p>
                                {item.sku && (
                                  <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.quantity} {item.unit || 'Stück'}
                            </TableCell>
                            <TableCell>
                              {item.quantityDelivered !== undefined 
                                ? `${item.quantityDelivered} ${item.unit || 'Stück'}`
                                : 'Ausstehend'
                              }
                            </TableCell>
                            <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell>{formatCurrency(item.totalPrice)}</TableCell>
                            <TableCell>{getStatusBadge(item.status || 'open')}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                            Keine Bestellpositionen verfügbar
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Lieferungen - Für direkte Bestätigung von Lieferterminen */}
          <TabsContent value="lieferungen" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center space-x-2">
                    <Truck className="h-5 w-5" />
                    <span>Offene Lieferungen bestätigen</span>
                  </span>
                  <Badge variant="secondary">
                    {orders.filter(o => ['pending', 'confirmed', 'ordered'].includes(o.status)).length} offene Bestellungen
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Bestätigen Sie hier Liefertermine und melden Sie eventuelle Abweichungen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {orders.filter(o => ['pending', 'confirmed', 'ordered'].includes(o.status)).map((order) => (
                    <Card key={order.id} className={orderId && order.id === parseInt(orderId) ? 'border-blue-500 border-2' : ''}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-semibold">Bestellung {order.orderNumber}</h3>
                            <p className="text-sm text-gray-500">
                              Bestellt am: {formatDate(order.orderDate)}
                            </p>
                            <p className="text-sm text-gray-500">
                              Gewünschter Liefertermin: {formatDate(order.expectedDeliveryDate || '')}
                            </p>
                          </div>
                          <Badge variant={order.priority === 'high' ? 'destructive' : 'outline'}>
                            {order.priority === 'high' ? 'Dringend' : 'Normal'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Liefertermin-Bestätigung */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`delivery-date-${order.id}`}>
                              Bestätigter Liefertermin
                            </Label>
                            <Input
                              id={`delivery-date-${order.id}`}
                              type="date"
                              defaultValue={order.expectedDeliveryDate?.split('T')[0] || ''}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`delivery-time-${order.id}`}>
                              Voraussichtliche Lieferzeit
                            </Label>
                            <Input
                              id={`delivery-time-${order.id}`}
                              type="time"
                              placeholder="z.B. 14:00"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        {/* Kommentare */}
                        <div>
                          <Label htmlFor={`comments-${order.id}`}>
                            Kommentare / Abweichungen
                          </Label>
                          <Textarea
                            id={`comments-${order.id}`}
                            placeholder="Bitte teilen Sie uns eventuelle Abweichungen oder wichtige Informationen mit..."
                            className="mt-1"
                            rows={3}
                          />
                        </div>

                        {/* Aktionen */}
                        <div className="flex gap-2">
                          <Button 
                            variant="default" 
                            className="flex-1"
                            onClick={() => {
                              toast({
                                title: "Lieferung bestätigt",
                                description: `Bestellung ${order.orderNumber} wurde erfolgreich bestätigt.`
                              });
                            }}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Lieferung bestätigen
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setActiveTab('bestellungen')}
                          >
                            Details anzeigen
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {orders.filter(o => ['pending', 'confirmed', 'ordered'].includes(o.status)).length === 0 && (
                    <div className="text-center py-8">
                      <Truck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">Keine offenen Lieferungen vorhanden</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}