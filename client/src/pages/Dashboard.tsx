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
  Calculator,
  Clock,
  Trophy,
  Sun,
  CloudRain,
  CloudSnow,
  Wind,
  MapPin,
  Activity,
  Euro,
  ChevronRight,
  Minus,
  Calendar as CalendarIcon,
  School,
  Gift,
  Database
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CriticalMHDTile, MHDRecommendationsStatusTile, MHDQuickActionsTile } from "@/components/MHDRecommendationTiles";
import { VendonSyncStatusCard } from "@/components/dashboard/VendonSyncStatusCard";
import { CriticalLocationsCard } from "@/components/dashboard/CriticalLocationsCard";
import { 
  getTransactions, 
  getMachines, 
  getSyncStatus, 
  getOpenOrders,
  getDashboardRuecklaufer,
  getDashboardCriticalLocations
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

// Dashboard Analytics Interfaces
interface RuecklauferProduct {
  productName: string;
  totalRemoved: number;
  removalEvents: number;
  avgCostPrice: number;
  totalCostValue: number;
}

interface RuecklauferLocation {
  locationName: string;
  machineId: number;
  totalRemoved: number;
  uniqueProducts: number;
  totalCostValue: number;
}

interface CriticalLocation {
  locationName: string;
  machineId: number;
  alcoholProductCount?: number;
  totalSales?: number;
}

interface ExpiringProduct {
  productName: string;
  shelfLifeDays: number;
  locationName: string;
  currentStock: number;
  expiryStatus: string;
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

  // Essential data queries - Get all today's transactions
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
    queryFn: () => getTransactions(1000), // Get more transactions for accurate daily totals
  });

  // PROBLEM 4 BEHOBEN: Überflüssiger useQuery für removed-products entfernt
  // TopRemovedProductsTile holt seine eigenen Daten direkt ab

  const { data: machines, isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });

  const { data: openOrders, isLoading: isLoadingOpenOrders } = useQuery({
    queryKey: ['/api/orders/dashboard/open'],
    queryFn: () => getOpenOrders(),
    refetchInterval: 60000
  });

  // Rückläufer-Analyse Daten
  const { data: ruecklauferData, isLoading: isLoadingRuecklaufer } = useQuery({
    queryKey: ['/api/dashboard/ruecklaufer'],
    queryFn: () => getDashboardRuecklaufer(),
    refetchInterval: 300000 // 5 Minuten
  });

  // Kritische Standorte Daten
  const { data: criticalLocationsData, isLoading: isLoadingCriticalLocations } = useQuery({
    queryKey: ['/api/dashboard/critical-locations'],
    queryFn: () => getDashboardCriticalLocations(),
    refetchInterval: 300000 // 5 Minuten
  });

  const { data: locationStatus, isLoading: isLoadingLocationStatus } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: async () => {
      const response = await fetch('/api/location-status', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch location status');
      return response.json();
    },
    refetchInterval: 30000
  });

  const { data: weatherForecast, isLoading: isLoadingWeather } = useQuery({
    queryKey: ["/api/weather/forecast"],
    staleTime: 30 * 60 * 1000
  });

  // Deutsche Schulferien-Daten (Phase 2 Dashboard-Erweiterung)
  const { data: germanSchoolHolidays, isLoading: isLoadingHolidays } = useQuery({
    queryKey: ["/api/german-holidays/current-school-holidays"],
    staleTime: 60 * 60 * 1000, // 1 hour cache
    refetchInterval: 3600000, // 1 hour refresh
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

  // Calculate enhanced daily metrics - KORRIGIERT
  const todayData = React.useMemo(() => {
    if (!transactions) return { 
      transactions: 0, 
      revenue: 0, 
      netAmount: 0, 
      netProfit: 0, 
      units: 0,
      avgPrice: 0,
      displayDate: 'Heute'
    };
    
    const today = new Date();
    let todayTxs = transactions.filter(tx => {
      const txDate = new Date(tx.datetime);
      return txDate.toDateString() === today.toDateString();
    });
    
    // Fallback: Wenn keine heutigen Transaktionen, zeige gestrige
    let displayDate = 'Heute';
    if (todayTxs.length === 0) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      todayTxs = transactions.filter(tx => {
        const txDate = new Date(tx.datetime);
        return txDate.toDateString() === yesterday.toDateString();
      });
      displayDate = 'Gestern (Aktuelle Daten ausstehend)';
    }
    
    const revenue = todayTxs.reduce((sum, tx) => sum + (tx.price || 0), 0);
    const units = todayTxs.reduce((sum, tx) => sum + (tx.quantity || 1), 0);
    
    // Netto-Umsatz (ohne MwSt)
    const netAmount = todayTxs.reduce((sum, tx) => {
      return sum + (tx.priceWoVat || (tx.price || 0) * 0.85);
    }, 0);
    
    // ECHTES Netto-Ergebnis nach Abzug der Einkaufskosten
    const netProfit = todayTxs.reduce((sum, tx) => {
      return sum + (tx.netResult || 0); // netResult wird vom Backend berechnet
    }, 0);
    
    const avgPrice = todayTxs.length > 0 ? revenue / todayTxs.length : 0;
    
    return {
      transactions: todayTxs.length,
      revenue,
      netAmount, // Netto-Umsatz (ohne MwSt)
      netProfit, // Netto-Ergebnis nach Einkaufskosten
      units,
      avgPrice,
      displayDate
    };
  }, [transactions]);


  // PROBLEM 4 BEHOBEN: weeklyRemovedData entfernt, da TopRemovedProductsTile eigene Daten holt

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
        {/* Enhanced Key Metrics Row - Mobile First */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Enhanced Revenue Card - Heutige Performance */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 sm:col-span-2 lg:col-span-1">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600">Performance</p>
                    <p className="text-xs text-blue-500">{todayData.displayDate}</p>
                  </div>
                  <Euro className="h-6 w-6 text-blue-500" />
                </div>
                <div className="space-y-3">
                  {/* Hauptumsatz und Transaktionszahl */}
                  <div>
                    <p className="text-2xl font-bold text-blue-900">{formatCurrency(todayData.revenue)}</p>
                    <p className="text-sm text-blue-600">{todayData.transactions} Transaktionen</p>
                  </div>
                  
                  {/* Detaillierte Kennzahlen Grid */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-blue-200">
                    <div>
                      <p className="text-xs text-blue-600">Netto-Umsatz</p>
                      <p className="text-sm font-semibold text-blue-800">{formatCurrency(todayData.netAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">Ergebnis nach EK</p>
                      <p className={`text-sm font-semibold ${todayData.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(todayData.netProfit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">Anzahl Verkäufe</p>
                      <p className="text-sm font-semibold text-blue-800">{todayData.units}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">Ø Verkaufspreis</p>
                      <p className="text-sm font-semibold text-blue-800">{formatCurrency(todayData.avgPrice)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Rückläufer-Analyse with Real Data */}
          <Card 
            className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 cursor-pointer hover:shadow-md transition-all duration-200"
            onClick={() => setLocation('/ruecklaufer')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-purple-600">Rückläufer-Analyse</p>
                  <p className="text-xs text-purple-600 mt-1">Top 5 Entnahmen (7 Tage)</p>
                </div>
                <div className="flex items-center">
                  <Minus className="h-6 w-6 text-purple-500" />
                  <ChevronRight className="h-4 w-4 text-purple-400 ml-1" />
                </div>
              </div>
              
              {isLoadingRuecklaufer ? (
                <div className="flex justify-center py-4">
                  <RefreshCw className="h-4 w-4 animate-spin text-purple-500" />
                </div>
              ) : ruecklauferData?.success && ruecklauferData.data ? (
                <div className="space-y-2">
                  {/* Top Product by Cost Value */}
                  {ruecklauferData.data.topProducts.length > 0 && (
                    <div className="bg-purple-200/50 rounded-lg p-3">
                      <p className="text-xs font-medium text-purple-700 mb-1">Höchste Verluste</p>
                      <p className="text-sm font-bold text-purple-900 truncate">
                        {ruecklauferData.data.topProducts[0].productName}
                      </p>
                      <p className="text-xs text-purple-600">
                        {formatCurrency(ruecklauferData.data.topProducts[0].totalCostValue)} 
                        ({ruecklauferData.data.topProducts[0].totalRemoved} entfernt)
                      </p>
                    </div>
                  )}
                  
                  {/* Top Location by Cost Value */}
                  {ruecklauferData.data.topLocations.length > 0 && (
                    <div className="bg-purple-200/50 rounded-lg p-3">
                      <p className="text-xs font-medium text-purple-700 mb-1">Kritischster Standort</p>
                      <p className="text-sm font-bold text-purple-900 truncate">
                        {ruecklauferData.data.topLocations[0].locationName}
                      </p>
                      <p className="text-xs text-purple-600">
                        {formatCurrency(ruecklauferData.data.topLocations[0].totalCostValue)} Verlust
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-purple-600">Keine Daten verfügbar</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enhanced Critical Locations with Real Data */}
          <Card 
            className="bg-gradient-to-br from-red-50 to-red-100 border-red-200 cursor-pointer hover:shadow-md transition-all duration-200"
            onClick={() => setLocation('/standort-status')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-red-600">Kritische Standorte</p>
                  <p className="text-xs text-red-600 mt-1">Bedürfen Aufmerksamkeit</p>
                </div>
                <div className="flex items-center">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                  <ChevronRight className="h-4 w-4 text-red-400 ml-1" />
                </div>
              </div>
              
              {isLoadingCriticalLocations ? (
                <div className="flex justify-center py-4">
                  <RefreshCw className="h-4 w-4 animate-spin text-red-500" />
                </div>
              ) : criticalLocationsData?.success && criticalLocationsData.data ? (
                <div className="space-y-2">
                  {/* Total Critical Issues Count */}
                  <div className="text-center mb-2">
                    <p className="text-2xl font-bold text-red-900">
                      {(criticalLocationsData.data.locationsWithoutAlcoholSales.length + 
                        criticalLocationsData.data.locationsWithoutCardPayments.length + 
                        criticalLocationsData.data.expiringProducts.length)}
                    </p>
                  </div>
                  
                  {/* Issues Breakdown */}
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div className="bg-red-200/50 rounded p-2 text-center">
                      <p className="font-semibold text-red-800">
                        {criticalLocationsData.data.locationsWithoutAlcoholSales.length}
                      </p>
                      <p className="text-red-600">Kein Alkohol</p>
                    </div>
                    <div className="bg-red-200/50 rounded p-2 text-center">
                      <p className="font-semibold text-red-800">
                        {criticalLocationsData.data.locationsWithoutCardPayments.length}
                      </p>
                      <p className="text-red-600">Nur Bar</p>
                    </div>
                    <div className="bg-red-200/50 rounded p-2 text-center">
                      <p className="font-semibold text-red-800">
                        {criticalLocationsData.data.expiringProducts.length}
                      </p>
                      <p className="text-red-600">MHD bald</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-red-600">Keine kritischen Standorte</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Full width on mobile, 2/3 on desktop */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Enhanced Incoming Goods Tile - ANKLICKBAR */}
            <Card 
              className="cursor-pointer hover:shadow-md transition-all duration-200"
              onClick={() => setLocation('/bestellungen/workflow?step=overview')}
            >
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Truck className="h-5 w-5 mr-2 text-orange-500" />
                  Wareneingang
                  <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
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
                      <div 
                        key={index} 
                        className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border hover:bg-orange-100 cursor-pointer transition-colors"
                        onClick={() => {
                          // Navigation zur Bestellungsdetailansicht
                          setLocation(`/bestellungen/workflow?step=viewOrder&orderId=${(order as any).id}`);
                        }}
                        title={`Klicken um Bestellungsdetails für ${(order as any).orderNumber} anzuzeigen`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-sm">{(order as any).supplierName || 'Unbekannter Lieferant'}</p>
                            <p className="text-sm font-bold text-orange-900">{formatCurrency((order as any).totalAmountNet || (order as any).totalAmount || (order as any).totalValue || 0)}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-600">
                              <CalendarIcon className="h-3 w-3 inline mr-1" />
                              {(order as any).orderDate ? new Date((order as any).orderDate).toLocaleDateString('de-DE') : 'Kein Datum'}
                            </p>
                            <Badge variant={(order as any).isOverdue ? "destructive" : (order as any).status === 'sent' ? "default" : "secondary"} className="text-xs">
                              {(order as any).status === 'sent' ? 'Wareneingang' : ((order as any).isOverdue ? 'Verspätet' : 'Offen')}
                            </Badge>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-orange-500 ml-2" />
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      className="w-full mt-3"
                      onClick={() => setLocation('/bestellungen/workflow?step=overview')}
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
                      <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border hover:bg-red-100 cursor-pointer transition-colors"
                           onClick={() => setLocation(`/standort-status`)}
                           title={`Klicken um zur Standortübersicht zu gelangen`}>
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2 text-red-500" />
                          <div>
                            <p className="font-medium text-sm">{location.machineName}</p>
                            <p className="text-xs text-gray-600">
                              {location.location || location.locationName || 'Standort unbekannt'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {location.alerts?.length || 0} Fehler, {location.warnings?.length || 0} Warnungen
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Badge variant="destructive" className="text-xs mr-2">
                            Kritisch
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-red-500" />
                        </div>
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

            {/* Critical Inventory - ANKLICKBAR */}
            <Card 
              className="cursor-pointer hover:shadow-md transition-all duration-200"
              onClick={() => setLocation('/critical-inventory')}
            >
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Package className="h-5 w-5 mr-2 text-yellow-500" />
                  Kritische Bestände
                  <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
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

            {/* MHD Critical Products Tile */}
            <CriticalMHDTile />

            {/* MHD Recommendations Status Tile */}
            <MHDRecommendationsStatusTile />

            {/* MHD Quick Actions Tile */}
            <MHDQuickActionsTile />
            
            {/* Vendon Sync Status Card */}
            <VendonSyncStatusCard />
            
            {/* Critical Locations Card */}
            <CriticalLocationsCard />
          </div>

          {/* Right Column - Sidebar on desktop */}
          <div className="space-y-6">
            
            {/* Enhanced Weather, Holiday & Sales Forecast Tile - ANKLICKBAR */}
            <Card 
              className="cursor-pointer hover:shadow-md transition-all duration-200"
              onClick={() => setLocation('/enhanced-forecast')}
            >
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Sun className="h-5 w-5 mr-2 text-blue-500" />
                  Wetter, Ferien & Verkaufsprognose
                  <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
                </CardTitle>
                <CardDescription>7-Tage-Einfluss auf Verkäufe</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingWeather ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : weatherForecast && Array.isArray(weatherForecast) && weatherForecast.length > 0 ? (
                  <div className="space-y-4">
                    {/* Today's Detailed Weather */}
                    <div className="bg-blue-50 p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-lg">{Math.round((weatherForecast[0] as any)?.temperature?.max || 0)}°C</p>
                          <p className="text-sm text-gray-600">{(weatherForecast[0] as any)?.description || 'Heute'}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {(weatherForecast[0] as any)?.temperature?.max > 25 ? 
                            <Sun className="h-6 w-6 text-yellow-500" /> :
                            (weatherForecast[0] as any)?.description?.toLowerCase().includes('regen') ?
                            <CloudRain className="h-6 w-6 text-blue-500" /> :
                            (weatherForecast[0] as any)?.description?.toLowerCase().includes('schnee') ?
                            <CloudSnow className="h-6 w-6 text-blue-300" /> :
                            <Cloud className="h-6 w-6 text-gray-500" />
                          }
                          <Wind className="h-5 w-5 text-gray-400" />
                        </div>
                      </div>
                      {(weatherForecast[0] as any)?.isHoliday && (
                        <div className="flex items-center mb-2">
                          <Gift className="h-4 w-4 mr-1 text-red-500" />
                          <span className="text-sm text-red-600 font-medium">Feiertag</span>
                        </div>
                      )}
                      {(weatherForecast[0] as any)?.isVacation && (
                        <div className="flex items-center mb-2">
                          <School className="h-4 w-4 mr-1 text-orange-500" />
                          <span className="text-sm text-orange-600 font-medium">Schulferien</span>
                        </div>
                      )}
                      {(weatherForecast[0] as any)?.salesImpact !== undefined && (
                        <div className="mt-2">
                          <p className={`text-sm font-medium ${
                            ((weatherForecast[0] as any).salesImpact || 0) > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {((weatherForecast[0] as any).salesImpact || 0) > 0 ? '+' : ''}
                            {((weatherForecast[0] as any).salesImpact || 0).toFixed(1)}% Verkaufseinfluss erwartet
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* 7-Day Extended Forecast */}
                    <div>
                      <h4 className="font-medium text-sm mb-3">7-Tage Prognose</h4>
                      <div className="grid grid-cols-7 gap-1">
                        {weatherForecast.slice(1, 8).map((day: any, index: number) => (
                          <div key={index} className="text-center p-2 bg-gray-50 rounded text-xs">
                            <p className="text-gray-600 mb-1">
                              {new Date(day.date).toLocaleDateString('de-DE', { weekday: 'short' })}
                            </p>
                            <div className="mb-1">
                              {day.temperature?.max > 25 ? 
                                <Sun className="h-4 w-4 mx-auto text-yellow-500" /> :
                                day.description?.toLowerCase().includes('regen') ?
                                <CloudRain className="h-4 w-4 mx-auto text-blue-500" /> :
                                day.description?.toLowerCase().includes('schnee') ?
                                <CloudSnow className="h-4 w-4 mx-auto text-blue-300" /> :
                                <Cloud className="h-4 w-4 mx-auto text-gray-500" />
                              }
                            </div>
                            <p className="font-medium">{Math.round(day.temperature?.max || 0)}°</p>
                            <div className="mt-1 space-y-1">
                              {day.isHoliday && <Gift className="h-3 w-3 mx-auto text-red-500" />}
                              {day.isVacation && <School className="h-3 w-3 mx-auto text-orange-500" />}
                            </div>
                            {day.salesImpact && (
                              <p className={`text-xs mt-1 ${
                                day.salesImpact > 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {day.salesImpact > 0 ? '+' : ''}{day.salesImpact}%
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Summary */}
                    <div className="bg-amber-50 p-3 rounded border">
                      <h5 className="font-medium text-sm text-amber-800 mb-1">Wochenzusammenfassung</h5>
                      <p className="text-xs text-amber-700">
                        Erwarteter Verkaufseinfluss: {weatherForecast.slice(0, 7).reduce((sum: number, day: any) => sum + (day.salesImpact || 0), 0) > 0 ? '+' : ''}
                        {(weatherForecast.slice(0, 7).reduce((sum: number, day: any) => sum + (day.salesImpact || 0), 0) / 7).toFixed(1)}% • 
                        {weatherForecast.slice(0, 7).filter((day: any) => day.isHoliday).length} Feiertage • 
                        {germanSchoolHolidays?.data?.summary?.totalActiveStates || 0} Bundesländer mit Ferien
                      </p>
                    </div>
                    
                    {/* Deutsche Schulferien Detail (nur anzeigen wenn Ferien aktiv) */}
                    {!isLoadingHolidays && germanSchoolHolidays?.success && germanSchoolHolidays?.data?.summary?.hasActiveHolidays && (
                      <div className="bg-orange-50 p-3 rounded border border-orange-200">
                        <h5 className="font-medium text-sm text-orange-800 mb-2 flex items-center">
                          <School className="h-4 w-4 mr-1" />
                          Aktuelle Sommerferien (🇩🇪)
                        </h5>
                        <div className="space-y-1">
                          {germanSchoolHolidays.data.activeHolidays.slice(0, 3).map((holiday: any, index: number) => (
                            <p key={index} className="text-xs text-orange-700">
                              <span className="font-medium">{holiday.stateName}:</span> bis {new Date(holiday.endDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                              {holiday.daysRemaining <= 3 && (
                                <span className="text-red-600 font-medium"> (noch {holiday.daysRemaining} Tage)</span>
                              )}
                            </p>
                          ))}
                          {germanSchoolHolidays.data.activeHolidays.length > 3 && (
                            <p className="text-xs text-orange-600 italic">
                              ...und {germanSchoolHolidays.data.activeHolidays.length - 3} weitere Bundesländer
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-orange-600 mt-1 font-medium">
                          {germanSchoolHolidays.data.formatted.activeStatesText}
                        </p>
                      </div>
                    )}
                    
                    {/* Ferien beendet oder keine Ferien */}
                    {!isLoadingHolidays && germanSchoolHolidays?.success && !germanSchoolHolidays?.data?.summary?.hasActiveHolidays && (
                      <div className="bg-blue-50 p-3 rounded border border-blue-200">
                        <h5 className="font-medium text-sm text-blue-800 mb-1 flex items-center">
                          <School className="h-4 w-4 mr-1" />
                          Deutsche Schulferien
                        </h5>
                        <p className="text-xs text-blue-700">
                          {germanSchoolHolidays.data.formatted.summary}
                        </p>
                        {germanSchoolHolidays.data.recentlyEnded.length > 0 && (
                          <p className="text-xs text-blue-600 mt-1">
                            Zuletzt beendet: {germanSchoolHolidays.data.recentlyEnded[0].stateName}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Cloud className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Wetterdaten nicht verfügbar</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deckungsbeitrags Index Overview Tile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Calculator className="h-5 w-5 mr-2 text-purple-500" />
                  Deckungsbeitrags-Index
                </CardTitle>
                <CardDescription>Top 5 und schlechteste 5 Produkte</CardDescription>
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

            {/* PROBLEM 4 BEHOBEN: Statische Rückläufer-Karte */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Minus className="h-5 w-5 mr-2 text-purple-500" />
                  Rückläufer-Analyse
                </CardTitle>
                <CardDescription>Vollständige Analyse der entfernten Produkte</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setLocation('/ruecklaufer')}
                  >
                    Rückläufer-Analyse öffnen
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
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
            <CardDescription>
              {transactions ? (
                <span>Die letzten 50 von {transactions.length.toLocaleString('de-DE')} geladenen Transaktionen</span>
              ) : (
                <span>Die letzten Verkäufe</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTransactions ? (
              <div className="flex justify-center py-4">
                <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.slice(0, 50).map((tx, index) => (
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