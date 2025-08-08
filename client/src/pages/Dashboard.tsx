import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Package, 
  AlertTriangle, 
  Calendar, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  Truck,
  Cloud,
  RefreshCw,
  Database,
  Clock,
  Coffee,
  Trophy,
  Sun,
  CloudRain,
  MapPin,
  Activity,
  Euro,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  getTransactions, 
  getMachines, 
  getSyncStatus, 
  getOpenOrders
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Interfaces for types
interface DBIProduct {
  id: number;
  product_vendon_id: string;
  produkt_name: string;
  deckungsbeitragsindex: number | null;
  monatsumsatz_netto: number;
  wert_entnahmen: number;
  gesamtmarge: number;
  delta_ergebnis_minus_entnahmen: number;
  anzahl_automaten_gelistet: number;
  dbi_vorperiode: number | null;
  dbi_delta_abs: number | null;
  dbi_delta_rel: number | null;
}

interface DBIResponse {
  success: boolean;
  data: {
    products: DBIProduct[];
    summary: {
      topProduct: DBIProduct | null;
      totalProducts: number;
      dateRange: {
        current: { startDate: string; endDate: string };
        previous: { startDate: string; endDate: string };
      };
    };
  };
}

// Utility functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (value: number | null, decimals: number = 2): string => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Login />;
  }

  // Essential data queries
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
    queryFn: () => getTransactions(100),
  });

  const { data: machines, isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });

  const { data: openOrders, isLoading: isLoadingOpenOrders } = useQuery({
    queryKey: ['/api/orders/dashboard/open'],
    queryFn: () => getOpenOrders(),
    refetchInterval: 60000
  });

  const { data: locationStatus, isLoading: isLoadingLocationStatus } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: async () => {
      const response = await fetch('/api/location-status');
      if (!response.ok) throw new Error('Failed to fetch location status');
      return response.json();
    },
    refetchInterval: 30000
  });

  const { data: weatherForecast, isLoading: isLoadingWeather } = useQuery({
    queryKey: ["/api/weather/forecast"],
    staleTime: 30 * 60 * 1000
  });

  const { data: dbIndexData, isLoading: isLoadingDBIndex } = useQuery<DBIResponse>({
    queryKey: ['db-index-data'],
    queryFn: async () => {
      const response = await fetch('/api/db-index');
      if (!response.ok) throw new Error('Failed to fetch DB-Index data');
      return response.json();
    },
    staleTime: 10 * 60 * 1000 // 10 minutes cache
  });

  const { data: criticalInventory, isLoading: isLoadingCriticalInventory } = useQuery({
    queryKey: ['/api/critical-inventory/dashboard-summary'],
    queryFn: async () => {
      const response = await fetch('/api/critical-inventory/dashboard-summary');
      if (!response.ok) throw new Error('Failed to load critical inventory');
      return response.json();
    },
    refetchInterval: 300000
  });

  // Calculate metrics
  const todayTransactions = transactions?.filter(tx => {
    const txDate = new Date(tx.datetime);
    const today = new Date();
    return txDate.toDateString() === today.toDateString();
  }).length || 0;

  const todayRevenue = transactions?.filter(tx => {
    const txDate = new Date(tx.datetime);
    const today = new Date();
    return txDate.toDateString() === today.toDateString();
  }).reduce((sum, tx) => sum + (tx.price || 0), 0) || 0;

  const activeMachines = machines?.filter(m => m.status === "active").length || 0;
  const criticalMachines = locationStatus?.filter((l: any) => l.alerts?.length > 0 || l.warnings?.length > 0).length || 0;

  // Get top and worst products by DB Index
  const topDBIProducts = React.useMemo(() => {
    if (!dbIndexData?.data?.products) return [];
    return dbIndexData.data.products
      .filter(p => p.deckungsbeitragsindex !== null)
      .sort((a, b) => (b.deckungsbeitragsindex || 0) - (a.deckungsbeitragsindex || 0))
      .slice(0, 10);
  }, [dbIndexData]);

  const worstDBIProducts = React.useMemo(() => {
    if (!dbIndexData?.data?.products) return [];
    return dbIndexData.data.products
      .filter(p => p.deckungsbeitragsindex !== null)
      .sort((a, b) => (a.deckungsbeitragsindex || 0) - (b.deckungsbeitragsindex || 0))
      .slice(0, 10);
  }, [dbIndexData]);

  const handleRefresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
    queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
    queryClient.invalidateQueries({ queryKey: ['/api/location-status'] });
    queryClient.invalidateQueries({ queryKey: ['db-index-data'] });
    toast({
      title: "Dashboard aktualisiert",
      description: "Alle Daten werden neu geladen."
    });
  }, [queryClient, toast]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-first Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">Betriebsübersicht und Kennzahlen</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {/* Key Metrics Row - Mobile First */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Today's Revenue */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Tagesumsatz</p>
                  <p className="text-2xl font-bold text-blue-900">{formatCurrency(todayRevenue)}</p>
                  <p className="text-xs text-blue-600 mt-1">{todayTransactions} Transaktionen</p>
                </div>
                <Euro className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          {/* Active Machines */}
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600">Aktive Automaten</p>
                  <p className="text-2xl font-bold text-green-900">{activeMachines}</p>
                  <p className="text-xs text-green-600 mt-1">von {machines?.length || 0} total</p>
                </div>
                <Coffee className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          {/* Open Orders */}
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-600">Offene Bestellungen</p>
                  <p className="text-2xl font-bold text-orange-900">{openOrders?.length || 0}</p>
                  <p className="text-xs text-orange-600 mt-1">Warenlieferungen</p>
                </div>
                <Truck className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          {/* Critical Issues */}
          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-600">Kritische Standorte</p>
                  <p className="text-2xl font-bold text-red-900">{criticalMachines}</p>
                  <p className="text-xs text-red-600 mt-1">Benötigen Aufmerksamkeit</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Full width on mobile, 2/3 on desktop */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Incoming Goods Tile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Truck className="h-5 w-5 mr-2 text-orange-500" />
                  Wareneingang
                </CardTitle>
                <CardDescription>Anstehende und verspätete Lieferungen</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingOpenOrders ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : openOrders && openOrders.length > 0 ? (
                  <div className="space-y-3">
                    {openOrders.slice(0, 5).map((order, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border">
                        <div>
                          <p className="font-medium text-sm">{order.orderNumber}</p>
                          <p className="text-xs text-gray-600">{order.supplierName}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={(order as any).isOverdue ? "destructive" : "secondary"} className="text-xs">
                            {(order as any).isOverdue ? 'Verspätet' : 'Offen'}
                          </Badge>
                          <p className="text-xs text-gray-600 mt-1">{formatCurrency((order as any).totalValue || 0)}</p>
                        </div>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      className="w-full mt-3"
                      onClick={() => setLocation('/orders-overview')}
                    >
                      Alle Bestellungen anzeigen
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Keine offenen Bestellungen</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Machine Anomalies Tile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Activity className="h-5 w-5 mr-2 text-red-500" />
                  Maschinen-Anomalien
                </CardTitle>
                <CardDescription>Automaten mit Warnungen und Fehlern</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLocationStatus ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : locationStatus && locationStatus.length > 0 ? (
                  <div className="space-y-3">
                    {locationStatus
                      .filter((location: any) => location.alerts?.length > 0 || location.warnings?.length > 0)
                      .slice(0, 5)
                      .map((location: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border">
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2 text-red-500" />
                          <div>
                            <p className="font-medium text-sm">{location.machineName}</p>
                            <p className="text-xs text-gray-600">
                              {location.alerts?.length || 0} Fehler, {location.warnings?.length || 0} Warnungen
                            </p>
                          </div>
                        </div>
                        <Badge variant="destructive" className="text-xs">
                          Kritisch
                        </Badge>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      className="w-full mt-3"
                      onClick={() => setLocation('/machines')}
                    >
                      Alle Automaten anzeigen
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Alle Automaten funktionieren einwandfrei</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Critical Inventory */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Package className="h-5 w-5 mr-2 text-yellow-500" />
                  Kritische Bestände
                </CardTitle>
                <CardDescription>Artikel unter Mindestbestand</CardDescription>
              </CardHeader>
              <CardContent>
                {criticalInventory ? (
                  criticalInventory.totalCriticalItems > 0 ? (
                    <div className="space-y-4">
                      <div className="bg-yellow-50 p-4 rounded-lg border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-2xl font-bold text-yellow-900">{criticalInventory.totalCriticalItems}</p>
                            <p className="text-sm text-yellow-700">Artikel unter Mindestbestand</p>
                          </div>
                          <AlertTriangle className="h-8 w-8 text-yellow-500" />
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => setLocation('/critical-inventory')}
                      >
                        Details anzeigen
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Alle Bestände ausreichend</p>
                    </div>
                  )
                ) : (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Sidebar on desktop */}
          <div className="space-y-6">
            
            {/* Weather Overview Tile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Cloud className="h-5 w-5 mr-2 text-blue-500" />
                  Wetter & Prognose
                </CardTitle>
                <CardDescription>Einfluss auf Verkäufe</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingWeather ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : weatherForecast && Array.isArray(weatherForecast) && weatherForecast.length > 0 ? (
                  <div className="space-y-3">
                    {/* Today's Weather */}
                    <div className="bg-blue-50 p-4 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{Math.round((weatherForecast[0] as any)?.temperature?.max || 0)}°C</p>
                          <p className="text-sm text-gray-600">{(weatherForecast[0] as any)?.description || 'Heute'}</p>
                        </div>
                        <div className="text-right">
                          {(weatherForecast[0] as any)?.temperature?.max > 25 ? 
                            <Sun className="h-6 w-6 text-yellow-500" /> :
                            (weatherForecast[0] as any)?.description?.toLowerCase().includes('regen') ?
                            <CloudRain className="h-6 w-6 text-blue-500" /> :
                            <Cloud className="h-6 w-6 text-gray-500" />
                          }
                        </div>
                      </div>
                      {(weatherForecast[0] as any)?.salesImpact !== undefined && (
                        <div className="mt-2">
                          <p className={`text-sm font-medium ${
                            ((weatherForecast[0] as any).salesImpact || 0) > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {((weatherForecast[0] as any).salesImpact || 0) > 0 ? '+' : ''}
                            {((weatherForecast[0] as any).salesImpact || 0).toFixed(1)}% Verkaufseinfluss
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* 3-Day Preview */}
                    <div className="grid grid-cols-3 gap-2">
                      {weatherForecast.slice(1, 4).map((day: any, index: number) => (
                        <div key={index} className="text-center p-2 bg-gray-50 rounded">
                          <p className="text-xs text-gray-600">
                            {new Date(day.date).toLocaleDateString('de-DE', { weekday: 'short' })}
                          </p>
                          <p className="font-medium">{Math.round(day.temperature?.max || 0)}°</p>
                          {day.isHoliday && <span className="text-xs text-red-600">🎉</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Cloud className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Wetterdaten nicht verfügbar</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* DB Index Overview Tile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Database className="h-5 w-5 mr-2 text-purple-500" />
                  DB Index Übersicht
                </CardTitle>
                <CardDescription>Top/Flop Produkte nach Deckungsbeitrag</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingDBIndex ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : dbIndexData?.data ? (
                  <div className="space-y-4">
                    {/* Top Product Summary */}
                    {dbIndexData.data.summary.topProduct && (
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-700">Bestes Produkt</p>
                            <p className="font-bold text-green-900 truncate" title={dbIndexData.data.summary.topProduct.produkt_name}>
                              {dbIndexData.data.summary.topProduct.produkt_name.substring(0, 25)}...
                            </p>
                            <p className="text-xs text-green-600">
                              DBI: {formatNumber(dbIndexData.data.summary.topProduct.deckungsbeitragsindex, 2)}
                            </p>
                          </div>
                          <TrendingUp className="h-6 w-6 text-green-500" />
                        </div>
                      </div>
                    )}
                    
                    {/* Top 5 Products */}
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center">
                        <Trophy className="h-4 w-4 mr-1 text-yellow-500" />
                        Top 5 Produkte
                      </h4>
                      <div className="space-y-2">
                        {topDBIProducts.slice(0, 5).map((product, index) => (
                          <div key={product.id} className="flex items-center justify-between text-sm p-2 bg-green-50 rounded border">
                            <div className="flex items-center">
                              <Badge variant="secondary" className="text-xs mr-2">#{index + 1}</Badge>
                              <span className="truncate" title={product.produkt_name}>
                                {product.produkt_name.substring(0, 20)}...
                              </span>
                            </div>
                            <span className="font-medium text-green-700">
                              {formatNumber(product.deckungsbeitragsindex, 2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Worst 3 Products */}
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center">
                        <TrendingDown className="h-4 w-4 mr-1 text-red-500" />
                        Schlechteste 3
                      </h4>
                      <div className="space-y-2">
                        {worstDBIProducts.slice(0, 3).map((product, index) => (
                          <div key={product.id} className="flex items-center justify-between text-sm p-2 bg-red-50 rounded border">
                            <div className="flex items-center">
                              <Badge variant="destructive" className="text-xs mr-2">#{index + 1}</Badge>
                              <span className="truncate" title={product.produkt_name}>
                                {product.produkt_name.substring(0, 20)}...
                              </span>
                            </div>
                            <span className="font-medium text-red-700">
                              {formatNumber(product.deckungsbeitragsindex, 2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setLocation('/db-index')}
                    >
                      Vollständige Analyse anzeigen
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>DB Index Daten nicht verfügbar</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Transactions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Clock className="h-5 w-5 mr-2 text-gray-600" />
              Aktuelle Transaktionen
            </CardTitle>
            <CardDescription>Die letzten 10 Verkäufe</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTransactions ? (
              <div className="flex justify-center py-4">
                <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.slice(0, 10).map((tx, index) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                    <div className="flex-1">
                      <p className="font-medium text-sm truncate" title={tx.productName}>
                        {tx.productName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {tx.machineName} • {new Date(tx.datetime).toLocaleString('de-DE')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm">{formatCurrency(tx.price || 0)}</p>
                      <p className="text-xs text-gray-600">{tx.quantity || 1}x</p>
                    </div>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  className="w-full mt-3"
                  onClick={() => setLocation('/transactions')}
                >
                  Alle Transaktionen anzeigen
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Keine aktuellen Transaktionen</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}