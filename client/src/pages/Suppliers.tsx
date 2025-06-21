import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Package, Euro, ShoppingCart, Building2, BarChart3, TrendingUp } from 'lucide-react';

interface Supplier {
  id: number;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

interface SupplierAnalytics {
  supplierId: number;
  openOrders: number;
  annualRevenue: number;
  productCount: number;
  orderVolume: number;
  lastOrderDate?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
};

export default function Suppliers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [_, setLocation] = useLocation();

  // Fetch suppliers
  const suppliersQuery = useQuery({
    queryKey: ['/api/suppliers'],
  });

  // Fetch supplier analytics
  const analyticsQuery = useQuery({
    queryKey: ['/api/supplier-analytics/overview'],
  });

  // Combine suppliers with analytics data
  const suppliersWithData = useMemo(() => {
    if (!suppliersQuery.data?.data || !analyticsQuery.data?.data) return [];
    
    const suppliers = suppliersQuery.data.data;
    const analytics = analyticsQuery.data.data;
    
    return suppliers.map((supplier: Supplier) => {
      const supplierAnalytics = analytics.find((a: SupplierAnalytics) => a.supplierId === supplier.id);
      return {
        ...supplier,
        analytics: supplierAnalytics || {
          openOrders: 0,
          annualRevenue: 0,
          productCount: 0,
          orderVolume: 0
        }
      };
    });
  }, [suppliersQuery.data, analyticsQuery.data]);

  // Filter suppliers based on search query
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery) return suppliersWithData;
    
    return suppliersWithData.filter((supplier: any) =>
      supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [suppliersWithData, searchQuery]);

  const handleSupplierClick = (supplierId: number) => {
    setLocation(`/lieferanten/${supplierId}`);
  };

  if (suppliersQuery.isLoading || analyticsQuery.isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Lieferanten</h1>
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Lieferant
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (suppliersQuery.error || analyticsQuery.error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-red-600">Fehler beim Laden der Lieferanten</p>
          <Button 
            onClick={() => {
              suppliersQuery.refetch();
              analyticsQuery.refetch();
            }}
            className="mt-4"
          >
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-6">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Lieferanten</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Verwalten Sie Ihre Lieferanten und deren Leistungsdaten
            </p>
          </div>
          <Button onClick={() => setLocation('/lieferanten/new')} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Neuer Lieferant</span>
            <span className="sm:hidden">Neu</span>
          </Button>
        </div>

        {/* Navigation Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
            <TabsTrigger value="overview" className="flex gap-1 sm:gap-2 items-center text-xs sm:text-sm">
              <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Übersicht</span>
              <span className="sm:hidden">Liste</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex gap-1 sm:gap-2 items-center text-xs sm:text-sm">
              <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 sm:mt-6">

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  suppliersWithData.reduce((sum: number, s: any) => 
                    sum + (s.analytics?.annualRevenue || 0), 0
                  )
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktive Lieferanten</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {suppliersWithData.filter((s: any) => s.status === 'active').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offene Bestellungen</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {suppliersWithData.reduce((sum: number, s: any) => 
                  sum + (s.analytics?.openOrders || 0), 0
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ø Produkte</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {suppliersWithData.length > 0 ? 
                  Math.round(
                    suppliersWithData.reduce((sum: number, s: any) => 
                      sum + (s.analytics?.productCount || 0), 0
                    ) / suppliersWithData.length
                  ) : 0
                }
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Lieferanten suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Suppliers List */}
        <div className="text-sm text-muted-foreground mb-4">
          {filteredSuppliers.length} von {suppliersWithData.length} Lieferanten
        </div>

        {filteredSuppliers.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Lieferanten gefunden</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery 
                ? 'Versuchen Sie andere Suchbegriffe.'
                : 'Erstellen Sie Ihren ersten Lieferanten, um loszulegen.'
              }
            </p>
            {!searchQuery && (
              <Button onClick={() => setLocation('/lieferanten/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Ersten Lieferanten erstellen
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map((supplier: any) => (
              <Card 
                key={supplier.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleSupplierClick(supplier.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{supplier.name}</CardTitle>
                      {supplier.contactPerson && (
                        <p className="text-sm text-muted-foreground">
                          {supplier.contactPerson}
                        </p>
                      )}
                    </div>
                    <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                      {supplier.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Offene Bestellungen</p>
                      <p className="font-semibold text-orange-600">
                        {supplier.analytics?.openOrders || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Produkte</p>
                      <p className="font-semibold text-blue-600">
                        {supplier.analytics?.productCount || 0}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Jahresumsatz (12 Monate)</p>
                      <p className="font-bold text-green-600">
                        {formatCurrency(supplier.analytics?.annualRevenue || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Bestellvolumen (12 Monate)</p>
                      <p className="font-bold text-indigo-600">
                        {formatCurrency(supplier.analytics?.orderVolume || 0)}
                      </p>
                    </div>
                  </div>

                  {supplier.analytics?.lastOrderDate && (
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Letzte Bestellung: {new Date(supplier.analytics.lastOrderDate).toLocaleDateString('de-DE')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-4 sm:mt-6">
            <div className="text-center py-12">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Analytics Dashboard</h3>
              <p className="text-muted-foreground mb-4">
                Erweiterte Lieferanten-Analytics werden hier angezeigt.
              </p>
              <Button onClick={() => setLocation('/lieferanten-analytics')} variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" />
                Zum Analytics Dashboard
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}