import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Phone, Mail, Globe, MapPin, Building, Truck, 
  Calendar, Clock, Edit, Package, FileText, BarChart, AlertTriangle,
  RefreshCw, Download
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/layout/PageHeader";
import { TooltipProvider } from "@/components/ui/tooltip";

interface Supplier {
  id: number;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  status: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  minimumOrderValue?: number;
  deliveryDays?: string;
  taxId?: string;
  bankDetails?: string;
  productsCount?: number;
  openOrdersCount?: number;
}

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  
  // Lieferantendaten abfragen
  const { data: supplier, isLoading, error } = useQuery<Supplier>({
    queryKey: [`/api/suppliers/${id}`],
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Produkte des Lieferanten abfragen
  const { data: products, isLoading: isProductsLoading } = useQuery({
    queryKey: ['/api/products', { supplierId: parseInt(id) }],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id
  });
  
  // Bestellungen des Lieferanten abfragen
  const { data: orders, isLoading: isOrdersLoading } = useQuery({
    queryKey: ['/api/orders', { supplierId: parseInt(id) }],
    staleTime: 1000 * 60, // 1 Minute
    enabled: !!id
  });
  
  const handleBack = () => {
    navigate('/lieferanten');
  };
  
  const handleEdit = () => {
    // In späterer Implementierung: navigate(`/lieferanten/${id}/edit`);
    toast({
      title: "Info",
      description: "Bearbeiten-Funktion wird später implementiert."
    });
  };
  
  const handleCreateOrder = () => {
    navigate(`/bestellungen/neu?supplierId=${id}`);
  };
  
  if (isLoading) {
    return (
      <div className="container space-y-6">
        <PageHeader
          showRefresh={true}
          showDownload={true}
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
        />
        
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-1" />
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (error || !supplier) {
    return (
      <div className="container space-y-6">
        <PageHeader
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
        />
        
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <CardTitle>Fehler beim Laden</CardTitle>
            </div>
            <CardDescription className="text-red-600">
              Der Lieferant konnte nicht geladen werden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten."}
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Erneut versuchen
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Helper für den Status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Aktiv</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inaktiv</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  // Refreshing function für die Daten
  const handleRefresh = () => {
    window.location.reload();
  };

  // Export function 
  const handleExport = () => {
    toast({
      title: "Info",
      description: "Export-Funktion wird implementiert."
    });
  };

  return (
    <div className="container space-y-6">
      {/* Standardisierter PageHeader */}
      <PageHeader
        showRefresh={true}
        showDownload={true}
        additionalButtons={
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
              <Button onClick={handleCreateOrder}>
                <FileText className="h-4 w-4 mr-2" />
                Neue Bestellung
              </Button>
            </div>
          </TooltipProvider>
        }
        onRefresh={handleRefresh}
        onDownload={handleExport}
      />
      
      {/* Lieferanten Header */}
      <div>
        <h1 className="text-2xl font-bold">{supplier.name}</h1>
        <p className="text-muted-foreground">
          Lieferantendetails {getStatusBadge(supplier.status)}
        </p>
      </div>
      
      <Tabs defaultValue="info">
        <TabsList className="mb-4">
          <TabsTrigger value="info" className="gap-1.5">
            <Building className="h-4 w-4" />
            <span>Informationen</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-4 w-4" />
            <span>Produkte</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5">
            <Truck className="h-4 w-4" />
            <span>Bestellungen</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart className="h-4 w-4" />
            <span>Statistiken</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Informationen Tab */}
        <TabsContent value="info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Kontaktinformationen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Kontaktdaten</h3>
                  
                  {supplier.contactPerson && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">Ansprechpartner:</span>
                      <span>{supplier.contactPerson}</span>
                    </div>
                  )}
                  
                  <div className="space-y-1.5">
                    {supplier.phone && (
                      <div className="flex items-center">
                        <Phone className="h-4 w-4 text-muted-foreground mr-2" />
                        <a href={`tel:${supplier.phone}`} className="hover:underline">
                          {supplier.phone}
                        </a>
                      </div>
                    )}
                    
                    {supplier.email && (
                      <div className="flex items-center">
                        <Mail className="h-4 w-4 text-muted-foreground mr-2" />
                        <a href={`mailto:${supplier.email}`} className="hover:underline">
                          {supplier.email}
                        </a>
                      </div>
                    )}
                    
                    {supplier.website && (
                      <div className="flex items-center">
                        <Globe className="h-4 w-4 text-muted-foreground mr-2" />
                        <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {supplier.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Adresse</h3>
                  
                  <div className="pl-1">
                    {supplier.address && <p>{supplier.address}</p>}
                    {(supplier.postalCode || supplier.city) && (
                      <p>
                        {supplier.postalCode && `${supplier.postalCode} `}
                        {supplier.city}
                      </p>
                    )}
                    {supplier.country && <p>{supplier.country}</p>}
                    
                    {(supplier.address || supplier.city) && (
                      <a 
                        href={`https://maps.google.com/maps?q=${encodeURIComponent(
                          [
                            supplier.address,
                            supplier.postalCode,
                            supplier.city,
                            supplier.country
                          ].filter(Boolean).join(', ')
                        )}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-primary hover:underline mt-2"
                      >
                        <MapPin className="h-3.5 w-3.5 mr-1" />
                        Auf Google Maps anzeigen
                      </a>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Lieferbedingungen</h3>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {supplier.deliveryTerms && (
                      <div className="col-span-2">
                        <span className="font-medium">Lieferbedingungen:</span>
                        <p className="text-sm">{supplier.deliveryTerms}</p>
                      </div>
                    )}
                    
                    {supplier.deliveryDays && (
                      <div className="col-span-2">
                        <span className="font-medium">Liefertage:</span>
                        <p className="text-sm">{supplier.deliveryDays}</p>
                      </div>
                    )}
                    
                    {supplier.minimumOrderValue && (
                      <div>
                        <span className="font-medium">Mindestbestellwert:</span>
                        <p className="text-sm">{supplier.minimumOrderValue.toFixed(2)} €</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Zahlungsinformationen</h3>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {supplier.paymentTerms && (
                      <div className="col-span-2">
                        <span className="font-medium">Zahlungsbedingungen:</span>
                        <p className="text-sm">{supplier.paymentTerms}</p>
                      </div>
                    )}
                    
                    {supplier.bankDetails && (
                      <div className="col-span-2">
                        <span className="font-medium">Bankverbindung:</span>
                        <p className="text-sm">{supplier.bankDetails}</p>
                      </div>
                    )}
                    
                    {supplier.taxId && (
                      <div>
                        <span className="font-medium">Steuernummer/USt-ID:</span>
                        <p className="text-sm">{supplier.taxId}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {supplier.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Anmerkungen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line">{supplier.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Produkte Tab */}
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Produkte</CardTitle>
              <CardDescription>
                Alle Produkte dieses Lieferanten
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isProductsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center p-3 border rounded-md">
                      <div className="flex-grow">
                        <Skeleton className="h-5 w-40 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              ) : !products?.data || products.data.length === 0 ? (
                <div className="text-center p-6">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium mb-1">Keine Produkte gefunden</h3>
                  <p className="text-muted-foreground mb-4">
                    Für diesen Lieferanten sind noch keine Produkte erfasst.
                  </p>
                  <Button variant="outline" onClick={() => navigate('/produkte/neu')}>
                    Produkt hinzufügen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.data.map((product: any) => (
                    <div 
                      key={product.id} 
                      className="flex items-center p-3 border rounded-md hover:bg-accent cursor-pointer"
                      onClick={() => navigate(`/produkte/${product.id}`)}
                    >
                      <div className="flex-grow">
                        <h3 className="font-medium">{product.name}</h3>
                        <div className="text-sm text-muted-foreground">
                          {product.sku && <span className="mr-2">SKU: {product.sku}</span>}
                          {product.supplierSku && <span>Lieferanten-Nr.: {product.supplierSku}</span>}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {product.purchasePrice ? `${product.purchasePrice.toFixed(2)} €` : 'k.A.'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => navigate('/produkte?supplierId=' + id)}>
                Alle Produkte anzeigen
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Bestellungen Tab */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Bestellungen</CardTitle>
              <CardDescription>
                Alle Bestellungen bei diesem Lieferanten
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isOrdersLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <Skeleton className="h-5 w-40 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <div className="text-right">
                        <Skeleton className="h-6 w-16 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !orders?.data || orders.data.length === 0 ? (
                <div className="text-center p-6">
                  <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium mb-1">Keine Bestellungen gefunden</h3>
                  <p className="text-muted-foreground mb-4">
                    Bei diesem Lieferanten wurden noch keine Bestellungen aufgegeben.
                  </p>
                  <Button onClick={handleCreateOrder}>
                    Neue Bestellung erstellen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.data.map((order: any) => (
                    <div 
                      key={order.id} 
                      className="flex items-center justify-between p-3 border rounded-md hover:bg-accent cursor-pointer"
                      onClick={() => navigate(`/bestellungen/${order.id}`)}
                    >
                      <div>
                        <h3 className="font-medium">Bestellung #{order.orderNumber || order.id}</h3>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Calendar className="h-3.5 w-3.5 mr-1" />
                          {new Date(order.createdAt).toLocaleDateString('de-DE')}
                          
                          {order.itemCount && (
                            <span className="ml-3 flex items-center">
                              <Package className="h-3.5 w-3.5 mr-1" />
                              {order.itemCount} Positionen
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="font-medium">
                          {order.totalAmount ? `${order.totalAmount.toFixed(2)} €` : 'k.A.'}
                        </div>
                        <div className="text-sm">
                          {order.status === 'completed' ? (
                            <Badge variant="outline" className="bg-green-100 text-green-800">Abgeschlossen</Badge>
                          ) : order.status === 'pending' ? (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">In Bearbeitung</Badge>
                          ) : order.status === 'draft' ? (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800">Entwurf</Badge>
                          ) : (
                            <Badge variant="outline">{order.status}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => navigate('/bestellungen?supplierId=' + id)}>
                Alle Bestellungen anzeigen
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Statistiken Tab */}
        <TabsContent value="stats">
          <Card>
            <CardHeader>
              <CardTitle>Statistiken</CardTitle>
              <CardDescription>
                Statistische Daten zu diesem Lieferanten
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">Coming Soon</h3>
              <p className="text-muted-foreground">
                Die Statistiken für Lieferanten werden in einem zukünftigen Update implementiert.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}