import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Package, 
  AlertCircle, 
  Calendar, 
  TrendingUp, 
  ShoppingBag, 
  CreditCard,
  BarChart3,
  Truck,
  Cloud,
  RefreshCw,
  Database,
  Clock,
  ArrowUpRight,
  AlertTriangle,
  Coffee,
  Trophy
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";




import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  getTransactions, 
  getMachines, 
  getEvents, 
  getSyncStatus, 
  getOpenOrders, 
  formatDateTime, 
  getForecastModels, 
  getDashboardForecasts,
  initializeDefaultForecastModel,
  getDatabaseStatistics,
  getRefills,
  getDashboardWeatherData,
  getDashboardHolidayData
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell,
  XAxis,
  YAxis
} from "recharts";
import TransactionsTable from "@/components/tables/TransactionsTable";
import TopRemovedProductsTile from "@/components/TopRemovedProductsTile";

// Utility-Funktion für Transaktionsnormalisierung
const normalizeTx = (tx: any) => ({
  productName: tx.productName || tx.product_name || '',
  machineName: tx.machineName || tx.machine_name || '',
  price: tx.price || 0,
  quantity: tx.quantity || 1,
  datetime: tx.datetime,
  machineId: tx.machineId || tx.machine_id,
  productId: tx.productId || tx.product_id
});

// Utility-Funktion für Zeitraumberechnung
const getStartDate = (timeRange: string) => {
  const now = new Date();
  switch (timeRange) {
    case 'today':
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return today;
    case 'last7':
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return sevenDaysAgo;
    case 'thisMonth':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'lastMonth':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case 'thisYear':
      return new Date(now.getFullYear(), 0, 1);
    default:
      const defaultSevenDaysAgo = new Date(now);
      defaultSevenDaysAgo.setDate(defaultSevenDaysAgo.getDate() - 7);
      return defaultSevenDaysAgo;
  }
};

const getEndDate = (timeRange: string) => {
  const now = new Date();
  switch (timeRange) {
    case 'today':
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    case 'lastMonth':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    default:
      return now;
  }
};

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  
  // Zeitraum-State
  const [timeRange, setTimeRange] = React.useState<string>('last7');

  // Wenn nicht authentifiziert, zeigen wir stattdessen die Login-Komponente an
  if (!isAuthenticated) {
    return <Login />;
  }

  // Fetch data for metrics
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/transactions'],
    queryFn: () => getTransactions(500),
  });

  // Debug: Log transaction data structure
  React.useEffect(() => {
    if (transactions) {
      console.log('Dashboard transactions data:', {
        type: typeof transactions,
        isArray: Array.isArray(transactions),
        length: Array.isArray(transactions) ? transactions.length : 'not array',
        firstItem: Array.isArray(transactions) && transactions.length > 0 ? transactions[0] : null
      });
    }
  }, [transactions]);

  const { data: machines, isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });

  const { data: events, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['/api/events'],
    queryFn: () => getEvents(10),
  });

  const { data: syncStatus, isLoading: isLoadingSyncStatus } = useQuery({
    queryKey: ['/api/sync/status'],
    queryFn: () => getSyncStatus(),
    refetchInterval: 30000 // Alle 30 Sekunden aktualisieren
  });

  // Verschickte aber noch nicht gelieferte Bestellungen für die Dashboard-Ansicht
  const { data: openOrders, isLoading: isLoadingOpenOrders } = useQuery({
    queryKey: ['/api/orders/dashboard/open'],
    queryFn: () => getOpenOrders(),
    refetchInterval: 60000 // Jede Minute aktualisieren
  });

  // Kritische Automaten mit Warnungen oder Fehlern vom Standort-Status
  const { data: locationStatus, isLoading: isLoadingLocationStatus } = useQuery({
    queryKey: ['/api/location-status'],
    queryFn: async () => {
      const response = await fetch('/api/location-status');
      if (!response.ok) {
        throw new Error('Failed to fetch machine status data');
      }
      return response.json();
    },
    refetchInterval: 30000 // Alle 30 Sekunden aktualisieren für aktuelle Daten
  });

  // Prognosemodelle für das Dashboard
  const { data: forecastModels, isLoading: isLoadingForecastModels } = useQuery({
    queryKey: ['/api/forecast/models'],
    queryFn: () => getForecastModels(),
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });

  // Dashboard-Prognosen für die nächsten 14 Tage
  const { data: dashboardForecasts, isLoading: isLoadingDashboardForecasts } = useQuery({
    queryKey: ['/api/forecast/dashboard'],
    queryFn: () => getDashboardForecasts(),
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });



  // Refill-Daten für die letzten 30 Tage
  const { data: refillData, isLoading: isLoadingRefills } = useQuery({
    queryKey: ['/api/refills', new Date().toISOString().split('T')[0]], // Täglich neuer Cache-Key
    queryFn: () => getRefills({ 
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      limit: 100
    }),
    staleTime: 0, // Daten sofort als veraltet markieren
    gcTime: 0, // Keine Zwischenspeicherung
    refetchOnMount: 'always', // Immer neu laden beim Mount
    refetchOnWindowFocus: true, // Neu laden bei Fokus
  });

  // Wetter- und Feiertagsdaten für Dashboard
  const { data: weatherData, isLoading: isLoadingWeather } = useQuery({
    queryKey: ['/api/dashboard/weather'],
    queryFn: getDashboardWeatherData,
    refetchInterval: 300000, // Alle 5 Minuten
  });

  const { data: weatherForecast } = useQuery({
    queryKey: ["/api/weather/forecast"],
    staleTime: 30 * 60 * 1000 // 30 minutes
  });





  // Kritische Bestände für das Dashboard
  const { data: criticalInventory, isLoading: isLoadingCriticalInventory } = useQuery({
    queryKey: ['/api/critical-inventory/dashboard-summary'],
    queryFn: async () => {
      const response = await fetch('/api/critical-inventory/dashboard-summary');
      if (!response.ok) throw new Error('Fehler beim Laden der kritischen Bestände');
      return response.json();
    },
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });

  // CRITICAL FIX: Produktdaten für Preislookup abrufen
  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['/api/products'],
    queryFn: async () => {
      const response = await fetch('/api/products?limit=1000');
      if (!response.ok) throw new Error('Fehler beim Laden der Produktdaten');
      const data = await response.json();
      return Array.isArray(data) ? data : data.products || [];
    },
    staleTime: 600000 // 10 Minuten Cache für Produktdaten
  });

  // CRITICAL FIX: Produktpreis-Map aufbauen
  const productPriceMap = React.useMemo(() => {
    const map = new Map<string, number>();
    
    if (products && Array.isArray(products)) {
      products.forEach(product => {
        if (product.price && product.price > 0) {
          // Map sowohl nach productName als auch nach ID
          if (product.productName) {
            map.set(product.productName.trim(), product.price);
          }
          if (product.id) {
            map.set(product.id.toString(), product.price);
          }
          if (product.vendon_id) {
            map.set(product.vendon_id.toString(), product.price);
          }
        }
      });
    }
    
    console.log('Produktpreis-Map aufgebaut:', {
      productsCount: products?.length || 0,
      priceMapSize: map.size,
      sampleEntries: Array.from(map.entries()).slice(0, 3)
    });
    
    return map;
  }, [products]);

  // Berechne aktuelle Metriken aus realen Daten - UTC-basiert
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
  const thisWeekUTC = new Date(todayUTC.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonthUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Maschinen-Statistiken
  const activeMachines = machines?.filter(m => m.status === "active").length || 0;
  const totalMachines = machines?.length || 0;

  // Note: Products data and productPriceMap already defined above - no duplicate needed

  // Umsatz heute mit echten Produktpreisen
  const dailyRevenue = transactions?.reduce((sum, tx) => {
    const txDate = new Date(tx.datetime);
    if (txDate >= todayUTC && txDate < new Date(todayUTC.getTime() + 24 * 60 * 60 * 1000)) {
      // Try to get price from various sources
      let price = tx.price || 0;
      
      // If no price in transaction, lookup from product database
      if (price === 0 && tx.productName) {
        const productName = tx.productName;
        const productPrice = productPriceMap.get(productName?.trim());
        if (productPrice) {
          price = productPrice;
        }
      }
      
      // If still no price and we have product_id, try that
      if (price === 0 && (tx as any).productId) {
        const productPrice = productPriceMap.get((tx as any).productId.toString());
        if (productPrice) {
          price = productPrice;
        }
      }
      
      return sum + (price * (tx.quantity || 1));
    }
    return sum;
  }, 0) || 0;

  // Umsatz gestern (als Vergleich) mit echten Produktpreisen
  const yesterdayRevenue = transactions?.reduce((sum, tx) => {
    const txDate = new Date(tx.datetime);
    if (txDate >= yesterdayUTC && txDate < todayUTC) {
      // Try to get price from various sources
      let price = tx.price || 0;
      
      // If no price in transaction, lookup from product database
      if (price === 0 && tx.productName) {
        const productName = tx.productName;
        const productPrice = productPriceMap.get(productName?.trim());
        if (productPrice) {
          price = productPrice;
        }
      }
      
      // If still no price and we have product_id, try that
      if (price === 0 && (tx as any).productId) {
        const productPrice = productPriceMap.get((tx as any).productId.toString());
        if (productPrice) {
          price = productPrice;
        }
      }
      
      return sum + (price * (tx.quantity || 1));
    }
    return sum;
  }, 0) || 0;

  // Trend berechnen
  const revenueTrend = yesterdayRevenue > 0 
    ? ((dailyRevenue - yesterdayRevenue) / yesterdayRevenue * 100) 
    : 0;

  // Top Produkte mit flexiblem Zeitraum
  const topProducts = React.useMemo(() => {
    if (!transactions || !Array.isArray(transactions)) return {};
    
    const startDate = getStartDate(timeRange);
    const endDate = getEndDate(timeRange);
    
    return transactions
      .filter(tx => {
        const txDate = new Date(tx.datetime);
        return txDate >= startDate && txDate <= endDate;
      })
      .reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
        const normalized = normalizeTx(tx);
        
        // Überspringe Transaktionen ohne echten Produktnamen
        if (!normalized.productName || normalized.productName.trim() === '') {
          return acc;
        }
        
        const cleanProductName = normalized.productName.trim();
        if (!acc[cleanProductName]) {
          acc[cleanProductName] = { count: 0, revenue: 0 };
        }
        acc[cleanProductName].count += normalized.quantity;
        
        // Calculate revenue with product price lookup
        let price = normalized.price || 0;
        if (price === 0) {
          const productPrice = productPriceMap.get(cleanProductName) || productPriceMap.get(normalized.productId?.toString());
          if (productPrice) {
            price = productPrice;
          }
        }
        
        acc[cleanProductName].revenue += price * normalized.quantity;
        return acc;
      }, {});
  }, [transactions, timeRange, productPriceMap]);

  // CRITICAL FIX: Refill Removed Items für "Top 5 verkaufte Waren" Widget mit flexiblem Zeitraum
  const refillRemovedItems = React.useMemo(() => {
    if (!transactions || !Array.isArray(transactions)) return {};
    
    const startDate = getStartDate(timeRange);
    const endDate = getEndDate(timeRange);
    
    return transactions
      .filter(tx => {
        const txDate = new Date(tx.datetime);
        const normalized = normalizeTx(tx);
        return txDate >= startDate && txDate <= endDate && normalized.productName;
      })
      .reduce((acc: Record<string, number>, tx) => {
        const normalized = normalizeTx(tx);
        const productName = normalized.productName || 'Unbekanntes Produkt';
        acc[productName] = (acc[productName] || 0) + normalized.quantity;
        return acc;
      }, {});
  }, [transactions, timeRange]);

  // Debug Feldnamen und Revenue-Details
  React.useEffect(() => {
    console.log('Dashboard Debug Check:', {
      hasTopProducts: !!topProducts,
      keyCount: Object.keys(topProducts).length,
      priceMapSize: productPriceMap.size,
      refillRemovedItemsCount: Object.keys(refillRemovedItems).length,
      transactionsCount: transactions?.length || 0
    });
    
    // Debug erste Transaktion für Feldnamen
    if (transactions && transactions.length > 0) {
      const firstTx = transactions[0];
      console.log('Transaction field mapping:', {
        available_fields: Object.keys(firstTx),
        productName: firstTx.productName,
        machineName: firstTx.machineName,
        tx_price: firstTx.price
      });
    }
    
    if (Object.keys(topProducts).length > 0) {
      console.log('Top Products with revenue:', Object.entries(topProducts).slice(0, 3));
    }
  }, [topProducts, productPriceMap, transactions, refillRemovedItems]);

  // Debug Transactions und Datumsfilterung
  React.useEffect(() => {
    console.log('Transactions check:', {
      hasTransactions: !!transactions,
      isArray: Array.isArray(transactions),
      length: transactions?.length,
      isLoading: isLoadingTransactions,
      firstTransaction: transactions?.[0]
    });

    if (transactions && transactions.length > 0) {
      console.log('DATE FILTER DEBUG - UTC FIXED:', {
        currentTime: now.toISOString(),
        todayStartUTC: todayUTC.toISOString(),
        weekStartUTC: thisWeekUTC.toISOString(),
        monthStartUTC: thisMonthUTC.toISOString(),
        
        // Prüfe Transaktionsdaten
        newestTransaction: transactions[0]?.datetime,
        oldestInFirst10: transactions.slice(0, 10).map(tx => tx.datetime),
        
        // Filtere nach Zeiträumen mit UTC
        todayCount: transactions.filter(tx => {
          const txDate = new Date(tx.datetime);
          return txDate >= todayUTC && txDate < new Date(todayUTC.getTime() + 24 * 60 * 60 * 1000);
        }).length,
        weekCount: transactions.filter(tx => new Date(tx.datetime) >= thisWeekUTC).length,
        monthCount: transactions.filter(tx => new Date(tx.datetime) >= thisMonthUTC).length,
        
        // Zeige korrigierte Datums-Parsing
        sampleDateParsing: transactions.slice(0, 3).map(tx => {
          const txDate = new Date(tx.datetime);
          return {
            original: tx.datetime,
            parsed: txDate.toISOString(),
            isToday: txDate >= todayUTC && txDate < new Date(todayUTC.getTime() + 24 * 60 * 60 * 1000),
            isThisWeek: txDate >= thisWeekUTC,
            isThisMonth: txDate >= thisMonthUTC
          };
        })
      });
    }
  }, [transactions, isLoadingTransactions]);

  // Top Maschinen nach Transaktionen mit flexiblem Zeitraum
  const machineTransactions = React.useMemo(() => {
    if (!transactions || !Array.isArray(transactions)) return {};
    
    const startDate = getStartDate(timeRange);
    const endDate = getEndDate(timeRange);
    
    return transactions
      .filter(tx => {
        const txDate = new Date(tx.datetime);
        return txDate >= startDate && txDate <= endDate;
      })
      .reduce((acc: Record<string, {count: number, revenue: number}>, tx) => {
        const normalized = normalizeTx(tx);
        const machineName = normalized.machineName || 'Unbekannte Maschine';
        if (!acc[machineName]) {
          acc[machineName] = { count: 0, revenue: 0 };
        }
        acc[machineName].count += 1;
        
        // Calculate revenue with product price lookup
        let price = normalized.price || 0;
        if (price === 0) {
          const productPrice = productPriceMap.get(normalized.productName?.trim()) || productPriceMap.get(normalized.productId?.toString());
          if (productPrice) {
            price = productPrice;
          }
        }
        
        acc[machineName].revenue += price * normalized.quantity;
        return acc;
      }, {});
  }, [transactions, timeRange, productPriceMap]);

  // Zahlungsmethoden nach Standort mit flexiblem Zeitraum
  const locationPaymentMethods = React.useMemo(() => {
    if (!transactions || !Array.isArray(transactions)) return {};
    
    const startDate = getStartDate(timeRange);
    const endDate = getEndDate(timeRange);
    
    return transactions
      .filter(tx => {
        const txDate = new Date(tx.datetime);
        return txDate >= startDate && txDate <= endDate;
      })
      .reduce((acc: Record<string, {
        machineName: string,
        cash: number,
        cashless: number,
        total: number,
        cashlessPercentage: number
      }>, tx) => {
        const normalized = normalizeTx(tx);
        const machineKey = (normalized.machineId || 'unknown').toString();
        if (!acc[machineKey]) {
          acc[machineKey] = {
            machineName: normalized.machineName || 'Unbekannte Maschine',
            cash: 0,
            cashless: 0,
            total: 0,
            cashlessPercentage: 0
          };
        }

        acc[machineKey].total += 1;

        if (tx.paymentMethod === 'CASH') {
          acc[machineKey].cash += 1;
        } else if (tx.paymentMethod === 'CASHLESS') {
          acc[machineKey].cashless += 1;
        }

        // Prozentsatz berechnen
        acc[machineKey].cashlessPercentage = acc[machineKey].total > 0 ? (acc[machineKey].cashless / acc[machineKey].total) * 100 : 0;

        return acc;
      }, {});
  }, [transactions, timeRange]);

  // Entfernte Produkte aus der REST-API holen
  const { data: removedProductsData, isLoading: isLoadingRemovedProducts } = useQuery({
    queryKey: ['/api/removed-products'],
    queryFn: () => fetch('/api/removed-products').then(res => res.json()),
    refetchInterval: 300000 // Alle 5 Minuten aktualisieren
  });

  // Interfaces für Removed Products API-Antwort
  interface RemovedProductItem {
    name: string;
    count: number;
  }

  interface RemovedProductsData {
    analytics: {
      byProduct: RemovedProductItem[];
    };
  }

  // Note: refillRemovedItems already defined above - removing duplicate

  // Synchronisationsstatus
  const getLatestSyncTime = () => {
    if (!syncStatus) return null;

    const timestamps = [
      syncStatus.machines?.lastSync,
      syncStatus.products?.lastSync,
      syncStatus.transactions?.lastSync,
      syncStatus.refills?.lastSync,
      syncStatus.events?.lastSync
    ].filter(Boolean);

    if (timestamps.length === 0) return null;

    return new Date(Math.max(...timestamps));
  };

  const latestSyncTime = getLatestSyncTime();

  // Prüft, ob ein Synchronisierungsprozess läuft
  const isSyncRunning = syncStatus && (
    syncStatus.machines?.status === "running" ||
    syncStatus.products?.status === "running" ||
    syncStatus.transactions?.status === "running" ||
    syncStatus.refills?.status === "running" ||
    syncStatus.events?.status === "running"
  );

  // Aktualisieren der Daten
  const handleRefresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
    queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
    queryClient.invalidateQueries({ queryKey: ['/api/events'] });
    queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/statistics/database'] });

    toast({
      title: "Daten werden aktualisiert",
      description: "Die Dashboard-Daten werden neu geladen."
    });
  }, [queryClient, toast]);

  return (
    <div className="space-y-6">
      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Zeitraumauswahl */}
        <div className="flex-grow flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Heute</SelectItem>
                <SelectItem value="last7">Letzte 7 Tage</SelectItem>
                <SelectItem value="thisMonth">Dieser Monat</SelectItem>
                <SelectItem value="lastMonth">Letzter Monat</SelectItem>
                <SelectItem value="thisYear">Dieses Jahr</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isSyncRunning && (
            <div className="flex items-center text-amber-600 bg-amber-50 px-3 py-1 rounded-md h-9">
              <div className="animate-spin h-3 w-3 mr-2 border-2 border-amber-600 border-t-transparent rounded-full"></div>
              <span className="text-xs">Synchronisierung läuft...</span>
            </div>
          )}
        </div>

        {/* Rechte Seite: Aktionen */}
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="h-9"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Top-Level Metriken - 4 Kacheln */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Kachel 1: Aktuelle Verkäufe, Ertrag, Marge, Anzahl Transaktionen */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setLocation("/umsatz-ergebnis-uebersicht")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-green-500" />
              Tagesumsatz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Verkäufe heute */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Verkäufe heute</span>
                <span className="font-medium">{transactions?.filter((tx: any) => {
                  const today = new Date();
                  const txDate = new Date(tx.datetime);
                  return txDate.toDateString() === today.toDateString();
                }).length || 0}</span>
              </div>
              
              {/* Umsatz Brutto heute */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Umsatz Brutto</span>
                <span className="font-medium text-green-600">
                  {(() => {
                    const todayTransactions = transactions?.filter((tx: any) => {
                      const today = new Date();
                      const txDate = new Date(tx.datetime);
                      return txDate.toDateString() === today.toDateString();
                    }) || [];
                    
                    const todayBruttoRevenue = todayTransactions.reduce((sum: number, tx: any) => {
                      const productName = tx.productName;
                      const productPrice = productPriceMap.get(productName?.trim()) || tx.price || 0;
                      return sum + productPrice * (tx.quantity || 1);
                    }, 0);
                    
                    return todayBruttoRevenue.toFixed(2) + ' €';
                  })()}
                </span>
              </div>
              
              {/* Umsatz Netto ohne Pfand heute */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Umsatz Netto o. Pfand</span>
                <span className="font-medium text-blue-600">
                  {(() => {
                    const todayTransactions = transactions?.filter((tx: any) => {
                      const today = new Date();
                      const txDate = new Date(tx.datetime);
                      return txDate.toDateString() === today.toDateString();
                    }) || [];
                    
                    const todayBruttoRevenue = todayTransactions.reduce((sum: number, tx: any) => {
                      const productName = tx.productName;
                      const productPrice = productPriceMap.get(productName?.trim()) || tx.price || 0;
                      return sum + productPrice * (tx.quantity || 1);
                    }, 0);
                    
                    // Netto ohne Pfand: Brutto / 1.19 (ohne Pfandabzug für vereinfachte Darstellung)
                    const todayNettoRevenue = todayBruttoRevenue / 1.19;
                    return todayNettoRevenue.toFixed(2) + ' €';
                  })()}
                </span>
              </div>
              
              {/* Ergebnis netto heute - FEHLENDER PUNKT */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Ergebnis netto</span>
                <span className="font-medium text-emerald-600">
                  {(() => {
                    const todayTransactions = transactions?.filter((tx: any) => {
                      const today = new Date();
                      const txDate = new Date(tx.datetime);
                      return txDate.toDateString() === today.toDateString();
                    }) || [];
                    
                    if (todayTransactions.length === 0) return "0.00 €";
                    
                    const todayBruttoRevenue = todayTransactions.reduce((sum: number, tx: any) => {
                      const productName = tx.productName;
                      const productPrice = productPriceMap.get(productName?.trim()) || tx.price || 0;
                      return sum + productPrice * (tx.quantity || 1);
                    }, 0);
                    
                    // Netto ohne Pfand berechnen
                    const todayNettoRevenue = todayBruttoRevenue / 1.19;
                    
                    // HINWEIS: Wird später durch echte Kostenberechnung ersetzt
                    const estimatedCosts = todayNettoRevenue * 0.4; // Reduziert von 60% auf 40%
                    const netResult = todayNettoRevenue - estimatedCosts;
                    
                    return netResult.toFixed(2) + ' €';
                  })()}
                </span>
              </div>
              
              {/* Ergebnis und Marge in Prozent */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Marge %</span>
                <span className="font-medium text-orange-600">
                  {(() => {
                    const todayTransactions = transactions?.filter((tx: any) => {
                      const today = new Date();
                      const txDate = new Date(tx.datetime);
                      return txDate.toDateString() === today.toDateString();
                    }) || [];
                    
                    const todayBruttoRevenue = todayTransactions.reduce((sum: number, tx: any) => {
                      const productName = tx.productName;
                      const productPrice = productPriceMap.get(productName?.trim()) || tx.price || 0;
                      return sum + productPrice * (tx.quantity || 1);
                    }, 0);
                    
                    const todayNettoRevenue = todayBruttoRevenue / 1.19;
                    const estimatedResult = todayNettoRevenue * 0.35; // 35% geschätztes Ergebnis
                    const marginPercent = todayBruttoRevenue > 0 ? (estimatedResult / todayBruttoRevenue) * 100 : 0;
                    
                    return marginPercent.toFixed(1) + '%';
                  })()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kachel 2: Verschickte aber noch nicht gelieferte Bestellungen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Truck className="h-5 w-5 mr-2 text-primary" />
              Offene Lieferungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              <div className="text-3xl font-bold">{openOrders?.length || 0}</div>
              {openOrders && openOrders.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {openOrders.slice(0, 3).map((order, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-2 rounded border hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        if (order.status === 'sent') {
                          setLocation(`/bestellungen/workflow?step=goodsReceipt&orderId=${order.id}`);
                        } else {
                          setLocation(`/bestellungen/${order.id}`);
                        }
                      }}
                    >
                      <div className="flex flex-col text-xs">
                        <span className="font-medium">{order.orderNumber}</span>
                        <span className="text-muted-foreground">{order.supplierName}</span>
                      </div>
                      <div className="text-xs text-right">
                        <div className="font-medium">
                          {order.expectedDeliveryDate ? 
                            formatDateTime(order.expectedDeliveryDate, 'date') : 'Offen'}
                        </div>
                        <div className="text-muted-foreground">
                          {order.totalAmount ? `${order.totalAmount.toFixed(2)} €` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  {openOrders.length > 3 && (
                    <div className="text-center pt-1">
                      <button 
                        onClick={() => setLocation("/bestellungen")}
                        className="text-xs text-primary hover:underline"
                      >
                        Alle {openOrders.length} Lieferungen anzeigen
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">Keine offenen Lieferungen</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Kachel 3: Kritische Automaten */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
              Kritische Automaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            {locationStatus && locationStatus.filter((m: any) => m.status === "warning" || m.status === "error").length > 0 ? (
              <div className="space-y-2 max-h-[120px] overflow-y-auto">
                {locationStatus.filter((m: any) => m.status === "warning" || m.status === "error").slice(0, 5).map((machine: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between rounded-md border p-2 cursor-pointer hover:bg-gray-50"
                    onClick={() => setLocation(`/automaten/${machine.id}`)}
                  >
                    <div className="font-medium truncate" title={machine.machineName}>
                      {machine.machineName}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className={machine.status === "error" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}>
                        {machine.status === "error" ? "Fehler" : "Warnung"}
                      </Badge>
                      {machine.warnings && machine.warnings.length > 0 && (
                        <span className="text-xs text-muted-foreground" title={machine.warnings.join(", ")}>
                          {machine.warnings[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {locationStatus.filter((m: any) => m.status === "warning" || m.status === "error").length > 5 && (
                  <div className="text-center pt-2">
                    <button 
                      onClick={() => setLocation("/standort-status")}
                      className="text-sm text-primary hover:underline"
                    >
                      Alle {locationStatus.filter((m: any) => m.status === "warning" || m.status === "error").length} kritischen Automaten anzeigen
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[120px]">
                <div className="text-lg font-medium text-green-600">Alle Automaten OK</div>
                <div className="text-sm text-muted-foreground">Keine Warnungen oder Fehler</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kachel 4: Kritische Bestände */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-orange-500" />
              Kritische Lagerbestände
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingCriticalInventory ? (
              <div className="flex items-center justify-center h-[120px]">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : criticalInventory && (criticalInventory.totalCritical > 0 || criticalInventory.totalCriticalItems > 0) ? (
              <div className="space-y-2">
                <div className="text-3xl font-bold text-orange-600">
                  {criticalInventory.totalCriticalItems || criticalInventory.totalCritical || 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  Produkte benötigen Nachbestellung
                </div>
                {criticalInventory.byWarehouse && criticalInventory.byWarehouse.length > 0 && (
                  <div className="space-y-1 max-h-[80px] overflow-y-auto">
                    {criticalInventory.byWarehouse.slice(0, 3).map((warehouse: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{warehouse.warehouseName}</span>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700">
                          {warehouse.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => setLocation("/kritische-bestaende")}
                  >
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    Details anzeigen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[120px]">
                <div className="text-lg font-medium text-green-600">Alle Bestände OK</div>
                <div className="text-sm text-muted-foreground">Keine kritischen Bestände</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Neues Wetter-Widget mit Ferien/Feiertag-Integration */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Cloud className="h-5 w-5 mr-2 text-blue-500" />
            Wetter & Saisonale Faktoren
          </CardTitle>
          <CardDescription>Wetterprognose mit Einfluss auf Verkaufsprognosen und Feiertage</CardDescription>
        </CardHeader>
        <CardContent>
          {weatherForecast && Array.isArray(weatherForecast) && weatherForecast.length > 0 ? (
            <div className="space-y-4">
              {/* Heute und morgen - Detailansicht */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {weatherForecast.slice(0, 2).map((day, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-cyan-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium">{index === 0 ? 'Heute' : 'Morgen'}</h4>
                        <p className="text-xs text-muted-foreground">
                          {new Date(day.date).toLocaleDateString('de-DE', { 
                            weekday: 'short', day: '2-digit', month: '2-digit' 
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{Math.round(day.temperature.max)}°</div>
                        <div className="text-sm text-muted-foreground">{Math.round(day.temperature.min)}°</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Wetter</span>
                        <span className="font-medium">{day.description}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span>Verkaufseinfluss</span>
                        <span className={`font-medium ${
                          day.salesImpact > 0 ? 'text-green-600' : 
                          day.salesImpact < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {day.salesImpact > 0 ? '+' : ''}{day.salesImpact || 0}%
                        </span>
                      </div>
                      
                      {day.isHoliday && (
                        <div className="flex items-center justify-between text-sm">
                          <span>Feiertag</span>
                          <Badge variant="secondary" className="text-xs">
                            {day.holidayName || 'Feiertag'}
                          </Badge>
                        </div>
                      )}
                      
                      {day.isVacation && (
                        <div className="flex items-center justify-between text-sm">
                          <span>Ferien</span>
                          <Badge variant="outline" className="text-xs text-orange-600">
                            Schulferien
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* 7-Tage Übersicht */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">7-Tage Wettertrend</h4>
                <div className="grid grid-cols-7 gap-2">
                  {weatherForecast.slice(0, 7).map((day, index) => (
                    <div key={index} className="text-center p-2 border rounded hover:bg-gray-50">
                      <div className="text-xs text-muted-foreground">
                        {new Date(day.date).toLocaleDateString('de-DE', { weekday: 'short' })}
                      </div>
                      <div className="font-medium">{Math.round(day.temperature.max)}°</div>
                      <div className="text-xs text-muted-foreground">{Math.round(day.temperature.min)}°</div>
                      <div className="text-xs mt-1">
                        {day.isHoliday && <span className="text-red-600">🎉</span>}
                        {day.isVacation && <span className="text-orange-600">🏖️</span>}
                      </div>
                      <div className={`text-xs font-medium mt-1 ${
                        (day.salesImpact || 0) > 0 ? 'text-green-600' : 
                        (day.salesImpact || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {(day.salesImpact || 0) !== 0 && (
                          <>{(day.salesImpact || 0) > 0 ? '+' : ''}{day.salesImpact || 0}%</>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Zusammenfassung der saisonalen Faktoren */}
              <div className="border rounded-lg p-4 bg-gradient-to-r from-amber-50 to-orange-50">
                <h4 className="font-medium mb-2">Saisonale Einflüsse diese Woche</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Durchschnittstemperatur</span>
                    <div className="font-medium">
                      {Math.round(weatherForecast.slice(0, 7).reduce((sum, day) => sum + day.temperature.max, 0) / 7)}°C
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Feiertage</span>
                    <div className="font-medium">
                      {weatherForecast.slice(0, 7).filter(day => day.isHoliday).length} Tage
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prognostizierter Verkaufseinfluss</span>
                    <div className={`font-medium ${
                      weatherForecast.slice(0, 7).reduce((sum, day) => sum + (day.salesImpact || 0), 0) > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {weatherForecast.slice(0, 7).reduce((sum, day) => sum + (day.salesImpact || 0), 0) > 0 ? '+' : ''}
                      {Math.round(weatherForecast.slice(0, 7).reduce((sum, day) => sum + (day.salesImpact || 0), 0) / 7)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              Wetterdaten werden geladen...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kostenanalyse - Verbessert: Echte Daten oder Fehlermeldung, Zeitraum einstellbar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Package className="h-5 w-5 mr-2 text-indigo-600" />
            Kostenanalyse
          </CardTitle>
          <CardDescription>Aufschlüsselung der Ausgaben - Zeitraum einstellbar</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            // Berechne echte Kostendaten aus Transaktionen
            const today = new Date();
            const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const monthlyTransactions = transactions?.filter(tx => new Date(tx.datetime) >= thisMonth) || [];
            
            let totalPurchaseCosts = 0;
            let totalRevenue = 0;
            
            // Berechne Einkaufskosten und Umsätze aus Transaktionen
            monthlyTransactions.forEach(tx => {
              const productName = tx.productName;
              const quantity = tx.quantity || 1;
              
              // Umsatz aus Produktpreis-Map
              const productPrice = productPriceMap.get(productName?.trim()) || tx.price || 0;
              totalRevenue += productPrice * quantity;
              
              // Geschätzte Einkaufskosten (60% des Verkaufspreises als Fallback)
              totalPurchaseCosts += productPrice * quantity * 0.6;
            });
            
            const operatingCosts = totalRevenue * 0.15; // Geschätzte Betriebskosten (15%)
            const totalCosts = totalPurchaseCosts + operatingCosts;
            const costRatio = totalRevenue > 0 ? (totalCosts / totalRevenue) * 100 : 0;
            
            return (
              <div className="space-y-3">
                {monthlyTransactions.length > 0 ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Einkaufskosten (netto)</div>
                      <div className="text-lg font-bold text-indigo-600">
                        €{totalPurchaseCosts.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Betriebskosten (geschätzt)</div>
                      <div className="text-lg font-bold">€{operatingCosts.toFixed(2)}</div>
                    </div>
                    <div className="border-t pt-2">
                      <div className="text-xs text-muted-foreground">Kostensatz vom Umsatz</div>
                      <div className="text-sm font-semibold">{costRatio.toFixed(1)}%</div>
                    </div>
                    <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                      Basis: {monthlyTransactions.length} Transaktionen diesen Monat
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                    <div className="font-medium text-amber-600">Keine Kostendaten verfügbar</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Keine Transaktionen für diesen Monat gefunden
                    </div>
                  </div>
                )}
                <div className="mt-3">
                  <Button variant="outline" size="sm" className="w-full">
                    <Calendar className="h-4 w-4 mr-2" />
                    Zeitraum anpassen
                  </Button>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Wetter und Prognosen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">


        {/* Verkaufsprognosen */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-primary" />
              Verkaufsprognosen
            </CardTitle>
            <CardDescription>Voraussichtliche Verkäufe der nächsten 14 Tage</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDashboardForecasts ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : dashboardForecasts && Array.isArray(dashboardForecasts) && dashboardForecasts.length > 0 ? (
              <div className="space-y-4">
                {/* Prognose-Visualisierung */}
                <div className="border rounded-md overflow-hidden p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-sm font-medium">14-Tage Prognose</h4>
                      <p className="text-xs text-muted-foreground">Voraussichtliche Verkäufe für die nächsten 14 Tage</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-1"
                      onClick={() => location.href = "/forecast-detail"}
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Detailanalyse</span>
                    </Button>
                  </div>
                  <div className="h-48 cursor-pointer" onClick={() => location.href = "/forecast-detail"}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Array.isArray(dashboardForecasts) ? dashboardForecasts.slice(0, 14) : []} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(date) => new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                          tick={{ fontSize: 11 }}
                          interval={1}
                        />
                        <YAxis hide />
                        <Tooltip
                          formatter={(value: number) => [Math.round(value) + ' Verkäufe', 'Prognose']}
                          labelFormatter={(date) => new Date(date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        />
                        <Bar dataKey="predictedQuantity" fill="#6366f1" radius={[2, 2, 0, 0]}>
                          {Array.isArray(dashboardForecasts) && dashboardForecasts.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.isHoliday ? '#f97316' : '#6366f1'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex gap-3 flex-wrap">
                    <div className="flex items-center text-sm">
                      <div className="w-3 h-3 rounded-full bg-indigo-500 mr-1.5"></div>
                      <span>Reguläre Tage</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <div className="w-3 h-3 rounded-full bg-orange-500 mr-1.5"></div>
                      <span>Feiertage</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-muted-foreground">
                  {!forecastModels || !Array.isArray(forecastModels) || forecastModels.length === 0
                    ? "Kein Prognosemodell vorhanden. Bitte initialisieren Sie ein Modell." 
                    : "Keine Prognosedaten verfügbar."}
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    try {
                      toast({
                        title: "Initialisiere Prognosemodell...",
                        description: "Das kann einige Minuten dauern.",
                      });
                      const result = await initializeDefaultForecastModel();
                      if (result.success) {
                        toast({
                          title: "Prognosemodell initialisiert",
                          description: "Die Prognosen werden in Kürze verfügbar sein.",
                        });
                        await queryClient.invalidateQueries({ queryKey: ['/api/forecast/dashboard'] });
                      } else {
                        toast({
                          title: "Hinweis",
                          description: result.message || "Die Initialisierung wurde gestartet.",
                        });
                      }
                    } catch (error) {
                      toast({
                        title: "Fehler",
                        description: "Fehler bei der Initialisierung des Prognosemodells.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Automatisch erstellen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>



      {/* Zahlungsmethoden nach Standort und Datenbankstatistiken nebeneinander */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Zahlungsmethoden nach Standort */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-primary" />
              Zahlungsmethoden nach Standort
            </CardTitle>
            <CardDescription>Standorte mit niedrigstem Anteil kontaktloser Zahlung</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(locationPaymentMethods).length > 0 ? (
              <div className="space-y-6">
                {/* Sortieren nach niedrigstem Anteil an kontaktlosen Zahlungen und Filterung */}
                {Object.values(locationPaymentMethods)
                  .filter(stats => stats.total >= 5) // nur Standorte mit mindestens 5 Transaktionen
                  .sort((a, b) => a.cashlessPercentage - b.cashlessPercentage)
                  .slice(0, 5)
                  .map((machine, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium truncate max-w-[70%]" title={machine.machineName}>
                          {machine.machineName}
                        </span>
                        <span className="font-medium">
                          {machine.cashlessPercentage.toFixed(1)}% kontaktlos
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div 
                          className="bg-blue-500 h-2.5 rounded-full" 
                          style={{ width: `${machine.cashlessPercentage}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>{machine.cash} bar / {machine.cashless} kontaktlos</span>
                        <span>{machine.total} trans. gesamt</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Keine Daten verfügbar oder nicht genügend Daten für eine Analyse
              </div>
            )}
          </CardContent>
        </Card>
      </div>







      {/* Aktive Automaten mit flexiblem Zeitraum */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Coffee className="h-5 w-5 mr-2 text-blue-500" />
            Aktive Automaten ({timeRange === 'today' ? 'Heute' : 
                              timeRange === 'last7' ? 'Letzte 7 Tage' : 
                              timeRange === 'thisMonth' ? 'Dieser Monat' : 
                              timeRange === 'lastMonth' ? 'Letzter Monat' : 
                              timeRange === 'thisYear' ? 'Dieses Jahr' : 'Zeitraum'})
          </CardTitle>
          <CardDescription>Automaten mit Produktentnahmen und Anzahl der verkauften Produkte</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTransactions ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : (() => {
            // Calculate machines with removals in selected time range
            const startDate = getStartDate(timeRange);
            const endDate = getEndDate(timeRange);
            
            const machineActivity = transactions
              ?.filter((tx: any) => {
                const txDate = new Date(tx.datetime);
                const normalized = normalizeTx(tx);
                return txDate >= startDate && txDate <= endDate && normalized.productName && normalized.machineName;
              })
              .reduce((acc: Record<string, { machineId: number; machineName: string; count: number; revenue: number; products: Set<string> }>, tx: any) => {
                const normalized = normalizeTx(tx);
                const key = normalized.machineName;
                if (!acc[key]) {
                  acc[key] = {
                    machineId: normalized.machineId,
                    machineName: normalized.machineName,
                    count: 0,
                    revenue: 0,
                    products: new Set()
                  };
                }
                acc[key].count += normalized.quantity;
                
                // CRITICAL FIX: Produktpreis aus Map für korrekte Umsätze
                const productPrice = productPriceMap.get(normalized.productName?.trim()) || normalized.price || 0;
                acc[key].revenue += productPrice * normalized.quantity;
                acc[key].products.add(normalized.productName);
                return acc;
              }, {}) || {};

            const activeMachines = Object.values(machineActivity)
              .sort((a, b) => b.count - a.count);

            return activeMachines.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="min-w-full bg-white border rounded-md">
                  {/* Header */}
                  <div className="grid grid-cols-5 border-b text-xs font-medium">
                    <div className="px-3 py-2">Automat</div>
                    <div className="px-3 py-2 text-right">Verkäufe</div>
                    <div className="px-3 py-2 text-right">Produktarten</div>
                    <div className="px-3 py-2 text-right">Umsatz</div>
                    <div className="px-3 py-2 text-right">Netto-Ergebnis</div>
                  </div>

                  {/* Content */}
                  <div className="max-h-[300px] overflow-y-auto">
                    {activeMachines.map((machine, index) => {
                      // Berechne Netto-Ergebnis (Umsatz minus geschätzte Kosten)
                      const estimatedCosts = machine.revenue * 0.6; // 60% Einkaufskosten
                      const netResult = machine.revenue - estimatedCosts;
                      
                      return (
                        <div 
                          key={index} 
                          className="grid grid-cols-5 text-xs border-b hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => {
                            // Navigate to machine detail view with machine ID
                            window.location.href = `/machines/${machine.machineId}`;
                          }}
                          title={`Klicken um Details zu ${machine.machineName} anzuzeigen`}
                        >
                          <div className="px-3 py-2 font-medium truncate">{machine.machineName}</div>
                          <div className="px-3 py-2 text-right">{machine.count}</div>
                          <div className="px-3 py-2 text-right">{machine.products.size}</div>
                          <div className="px-3 py-2 text-right">{machine.revenue.toFixed(2)} €</div>
                          <div className={`px-3 py-2 text-right font-medium ${netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {netResult >= 0 ? '+' : ''}{netResult.toFixed(2)} €
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Keine aktiven Automaten in den letzten 7 Tagen
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Neueste Transaktionen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Clock className="h-5 w-5 mr-2 text-primary" />
            Neueste Transaktionen
          </CardTitle>
          <CardDescription>Die letzten 10 Transaktionen im System</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTransactions ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : transactions && Array.isArray(transactions) && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium px-4 py-2">Datum & Zeit</th>
                    <th className="text-left font-medium px-4 py-2">Automat</th>
                    <th className="text-left font-medium px-4 py-2">Produkt</th>
                    <th className="text-right font-medium px-4 py-2">Preis</th>
                    <th className="text-right font-medium px-4 py-2">Netto-Ergebnis</th>
                    <th className="text-right font-medium px-4 py-2">Zahlungsart</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions
                    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
                    .slice(0, 10)
                    .map((tx, index) => (
                    <tr key={index} className="border-b hover:bg-muted/20">
                      <td className="px-4 py-2">{formatDateTime(tx.datetime)}</td>
                      <td className="px-4 py-2 truncate max-w-[160px]" title={tx.machineName}>
                        {tx.machineName || 'Unbekannt'}
                      </td>
                      <td className="px-4 py-2 truncate max-w-[180px]" title={tx.productName}>
                        {tx.productName || 'Unbekannt'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {(() => {
                          const productName = tx.productName;
                          const productPrice = productPriceMap.get(productName?.trim()) || tx.price || 0;
                          return productPrice.toFixed(2) + ' €';
                        })()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {(() => {
                          // Use calculated profit if available (currently not available in transaction data)
                          // Fallback to estimation since grossProfit field doesn't exist in the current data structure
                          
                          // Fallback to estimation if no calculated cost data
                          const productName = tx.productName;
                          const productPrice = productPriceMap.get(productName?.trim()) || tx.price || 0;
                          const estimatedCosts = productPrice * 0.6; // 60% Einkaufskosten
                          const netResult = productPrice - estimatedCosts;
                          return (
                            <span className={`font-medium ${netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {netResult >= 0 ? '+' : ''}{netResult.toFixed(2)} €*
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Badge variant={tx.paymentMethod === 'CASH' ? 'outline' : 'secondary'}>
                          {tx.paymentMethod === 'CASH' ? 'Bar' : 'Karte'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Keine Transaktionen verfügbar
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <Button 
              onClick={() => setLocation('/transactions')} 
              variant="outline" 
              size="sm"
              className="gap-1"
            >
              <ArrowUpRight className="h-4 w-4" />
              Alle Transaktionen anzeigen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Top 10 Produkte */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-gold-500" />
            Top 10 Produkte
          </CardTitle>
          <CardDescription>Meistverkaufte Produkte nach Anzahl und Umsatz</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(topProducts).length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-full bg-white border rounded-md">
                {/* Header */}
                <div className="grid grid-cols-4 border-b text-xs font-medium">
                  <div className="px-3 py-2">Produkt</div>
                  <div className="px-3 py-2 text-right">Verkäufe</div>
                  <div className="px-3 py-2 text-right">Umsatz</div>
                  <div className="px-3 py-2 text-right">Netto-Ergebnis</div>
                </div>
                {/* Content */}
                <div className="max-h-[300px] overflow-y-auto">
                  {Object.entries(topProducts)
                    .sort(([,a], [,b]) => b.count - a.count)
                    .slice(0, 10)
                    .map(([productName, stats], index) => {
                      const estimatedCosts = stats.revenue * 0.6; // 60% Einkaufskosten
                      const netResult = stats.revenue - estimatedCosts;
                      
                      return (
                        <div 
                          key={index} 
                          className="grid grid-cols-4 text-xs border-b hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => {
                            // Navigate to product search with this product name
                            setLocation(`/products?search=${encodeURIComponent(productName)}`);
                          }}
                          title={`Details zu ${productName} anzeigen`}
                        >
                          <div className="px-3 py-2 font-medium truncate" title={productName}>
                            {productName}
                          </div>
                          <div className="px-3 py-2 text-right">{stats.count}</div>
                          <div className="px-3 py-2 text-right">{stats.revenue.toFixed(2)} €</div>
                          <div className={`px-3 py-2 text-right font-medium ${netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {netResult >= 0 ? '+' : ''}{netResult.toFixed(2)} €
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              Keine Produktdaten verfügbar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top-Automaten nach Umsatz */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-blue-500" />
            Top-Automaten nach Umsatz ({timeRange === 'today' ? 'Heute' : 
                              timeRange === 'last7' ? 'Letzte 7 Tage' : 
                              timeRange === 'thisMonth' ? 'Dieser Monat' : 
                              timeRange === 'lastMonth' ? 'Letzter Monat' : 
                              timeRange === 'thisYear' ? 'Dieses Jahr' : 'Zeitraum'})
          </CardTitle>
          <CardDescription>Automaten mit höchstem Umsatz und bestem Netto-Ergebnis</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(machineTransactions).length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-full bg-white border rounded-md">
                {/* Header */}
                <div className="grid grid-cols-4 border-b text-xs font-medium">
                  <div className="px-3 py-2">Automat</div>
                  <div className="px-3 py-2 text-right">Verkäufe</div>
                  <div className="px-3 py-2 text-right">Umsatz</div>
                  <div className="px-3 py-2 text-right">Netto-Ergebnis</div>
                </div>
                {/* Content */}
                <div className="max-h-[300px] overflow-y-auto">
                  {Object.entries(machineTransactions)
                    .sort(([,a], [,b]) => b.revenue - a.revenue)
                    .slice(0, 10)
                    .map(([machineName, stats], index) => {
                      const estimatedCosts = stats.revenue * 0.6; // 60% Einkaufskosten
                      const netResult = stats.revenue - estimatedCosts;
                      
                      return (
                        <div 
                          key={index} 
                          className="grid grid-cols-4 text-xs border-b hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => {
                            // Navigate to machine detail (need to find machine ID)
                            setLocation(`/standort-status`);
                          }}
                          title={`Details zu ${machineName} anzeigen`}
                        >
                          <div className="px-3 py-2 font-medium truncate" title={machineName}>
                            {machineName}
                          </div>
                          <div className="px-3 py-2 text-right">{stats.count}</div>
                          <div className="px-3 py-2 text-right">{stats.revenue.toFixed(2)} €</div>
                          <div className={`px-3 py-2 text-right font-medium ${netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {netResult >= 0 ? '+' : ''}{netResult.toFixed(2)} €
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              Keine Automaten-Daten verfügbar
            </div>
          )}
        </CardContent>
      </Card>


    </div>
  );
}