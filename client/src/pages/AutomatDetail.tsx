import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { 
  ArrowLeft, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  MapPin,
  Calendar,
  User,
  Package,
  TrendingUp,
  BarChart3,
  Clock,
  Euro,
  AlertCircle,
  Trash2,
  Edit,
  Plus,
  Download,
  Filter
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// Types based on the specification
interface MachineData {
  id: number;
  machineName: string;
  vendonId: string;
  serialNumber?: string;
  machineType?: string;
  installationDate?: string;
  location?: string;
  address?: string;
  status: 'active' | 'inactive' | 'error';
}

interface TransactionData {
  id: number;
  datetime: string;
  productName: string;
  quantity: number;
  price: number;
  paymentMethod: 'CASH' | 'CASHLESS';
}

interface RefillData {
  id: number;
  datetime: string;
  status: 'completed' | 'in_progress';
  operator: string;
  notes: string;
}

interface KPIData {
  transactionCount: number;
  totalRevenue: number;
  refillCount: number;
  avgPrice: number;
}

interface SalesTimeSeries {
  date: string;
  count: number;
  revenue: number;
}

interface ProductPerformance {
  productName: string;
  count: number;
  revenue: number;
}

interface RemovedProduct {
  id: number;
  datetime: string;
  productName: string;
  removedQuantity: number;
  operator?: string;
  position?: string;
}

interface MachineCost {
  id: number;
  costType: string;
  amount: number;
  frequency: 'monthly' | 'yearly' | 'quarterly' | 'weekly' | 'once';
  description: string;
  validFrom: string;
}

interface MachineStock {
  id: number;
  productName: string;
  currentQuantity: number;
  maxQuantity: number;
  lastRefill?: string;
  status: 'good' | 'warning' | 'critical';
}

interface MHDEntry {
  id: number;
  productName: string;
  expiryDate: string;
  quantity: number;
  status: 'good' | 'attention' | 'warning' | 'expired';
}

export default function AutomatDetail() {
  const [match, params] = useRoute("/automaten/:id");
  const [activeTab, setActiveTab] = useState("allgemein");
  const [editingMHD, setEditingMHD] = useState<number | null>(null);
  const [removedProductsFilter, setRemovedProductsFilter] = useState("30"); // days
  const { toast } = useToast();

  const machineId = params?.id;

  // Fetch machine basic data
  const { data: machine, isLoading: machineLoading, error: machineError, refetch: refetchMachine } = useQuery<MachineData>({
    queryKey: [`/api/machines/${machineId}`],
    enabled: !!machineId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch transactions
  const { data: transactions, isLoading: transactionsLoading } = useQuery<TransactionData[]>({
    queryKey: [`/api/machines/${machineId}/transactions`],
    enabled: !!machineId && (activeTab === 'transaktionen' || activeTab === 'allgemein' || activeTab === 'analysen' || activeTab === 'auswertung'),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch refills
  const { data: refills, isLoading: refillsLoading } = useQuery<RefillData[]>({
    queryKey: [`/api/machines/${machineId}/refills`],
    enabled: !!machineId && activeTab === 'auffullungen',
    staleTime: 5 * 60 * 1000,
  });

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<{
    kpis: KPIData;
    salesTimeSeries: SalesTimeSeries[];
    eventCounts: { eventType: string; count: number }[];
    productPerformance: ProductPerformance[];
    hourlyDistribution: { hour: number; count: number }[];
    weeklyRevenue: { week: string; revenue: number }[];
    monthlyRevenue: { month: string; revenue: number }[];
  }>({
    queryKey: [`/api/machines/${machineId}/analytics`],
    enabled: !!machineId && (activeTab === 'analysen' || activeTab === 'auswertung'),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch removed products - API returns object with items array
  const { data: removedProductsResponse, isLoading: removedProductsLoading } = useQuery<{
    items: RemovedProduct[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    queryKey: [`/api/machines/${machineId}/removed-products?filter=${removedProductsFilter}`],
    enabled: !!machineId && activeTab === 'entnommene-produkte',
    staleTime: 5 * 60 * 1000,
  });

  // Extract items array for frontend compatibility
  const removedProducts = removedProductsResponse?.items || [];

  // Fetch machine costs
  const { data: machineCosts, isLoading: costsLoading, refetch: refetchCosts } = useQuery<MachineCost[]>({
    queryKey: [`/api/machines/${machineId}/costs`],
    enabled: !!machineId && activeTab === 'kosten',
    staleTime: 5 * 60 * 1000,
  });

  // Fetch current stock (Warenbestand)
  const { data: machineStock, isLoading: stockLoading } = useQuery<MachineStock[]>({
    queryKey: [`/api/machines/${machineId}/stock`],
    enabled: !!machineId && activeTab === 'warenbestand',
    staleTime: 2 * 60 * 1000,
  });

  // Fetch MHD entries
  const { data: mhdEntries, isLoading: mhdLoading, refetch: refetchMHD } = useQuery<MHDEntry[]>({
    queryKey: [`/api/machines/${machineId}/mhd`],
    enabled: !!machineId && activeTab === 'mhd',
    staleTime: 5 * 60 * 1000,
  });

  // Mutations for costs
  const addCostMutation = useMutation({
    mutationFn: async (newCost: Omit<MachineCost, 'id' | 'validFrom'>) => {
      const response = await fetch(`/api/machines/${machineId}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCost),
      });
      if (!response.ok) throw new Error('Fehler beim Hinzufügen der Kosten');
      return response.json();
    },
    onSuccess: () => {
      refetchCosts();
      toast({ title: "Kosten hinzugefügt", description: "Die Kosten wurden erfolgreich hinzugefügt." });
    },
  });

  const deleteCostMutation = useMutation({
    mutationFn: async (costId: number) => {
      const response = await fetch(`/api/machines/${machineId}/costs/${costId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Fehler beim Löschen der Kosten');
    },
    onSuccess: () => {
      refetchCosts();
      toast({ title: "Kosten gelöscht", description: "Die Kosten wurden erfolgreich gelöscht." });
    },
  });

  // Format functions
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Unbekannt';
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch (error) {
      console.warn('Invalid date string:', dateString);
      return 'Ungültiges Datum';
    }
  };

  const formatDateOnly = (dateString?: string | null) => {
    if (!dateString) return 'Unbekannt';
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy', { locale: de });
    } catch (error) {
      console.warn('Invalid date string:', dateString);
      return 'Ungültiges Datum';
    }
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      active: { color: 'bg-green-500', text: 'Aktiv', icon: CheckCircle },
      inactive: { color: 'bg-yellow-500', text: 'Inaktiv', icon: AlertTriangle },
      error: { color: 'bg-red-500', text: 'Fehler', icon: XCircle },
    };
    
    const { color, text, icon: Icon } = config[status as keyof typeof config] || config.inactive;
    
    return (
      <Badge className={`${color} text-white`}>
        <Icon className="h-3 w-3 mr-1" />
        {text}
      </Badge>
    );
  };

  // Loading state
  if (machineLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (machineError || !machine) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Automat nicht gefunden</h2>
          <p className="text-muted-foreground mb-4">
            Der Automat mit der ID {machineId} konnte nicht geladen werden.
          </p>
          <Button onClick={() => window.history.back()} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </div>
      </div>
    );
  }

  const handleRefreshAll = () => {
    refetchMachine();
    queryClient.invalidateQueries({ queryKey: [`/api/machines/${machineId}`] });
    toast({ title: "Daten aktualisiert", description: "Alle Daten wurden neu geladen." });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-optimized Header */}
      <div className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button 
              onClick={() => window.history.back()}
              variant="ghost"
              size="sm"
              className="p-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold truncate max-w-[200px] sm:max-w-none sm:text-2xl">{machine.machineName}</h1>
              <StatusBadge status={machine.status} />
            </div>
          </div>
          <Button onClick={handleRefreshAll} variant="ghost" size="sm" className="p-2">
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile-optimized Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="sticky top-[73px] z-40 bg-background border-b">
          <div className="overflow-x-auto tab-scroll">
            <TabsList className="inline-flex h-12 items-center justify-start rounded-none bg-transparent p-0 gap-0 min-w-max">
              <TabsTrigger 
                value="allgemein" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Allgemein
              </TabsTrigger>
              <TabsTrigger 
                value="transaktionen"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Transaktionen
              </TabsTrigger>
              <TabsTrigger 
                value="analysen"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Analysen
              </TabsTrigger>
              <TabsTrigger 
                value="auswertung"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Auswertung
              </TabsTrigger>
              <TabsTrigger 
                value="auffullungen"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[100px] h-12"
              >
                Auffüllungen
              </TabsTrigger>
              <TabsTrigger 
                value="mhd"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[80px] h-12"
              >
                MHD
              </TabsTrigger>
              <TabsTrigger 
                value="entnommene-produkte"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[140px] h-12"
              >
                Entfernte Produkte
              </TabsTrigger>
              <TabsTrigger 
                value="kosten"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[80px] h-12"
              >
                Kosten
              </TabsTrigger>
              <TabsTrigger 
                value="wirtschaftlichkeit"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[140px] h-12"
              >
                Wirtschaftlichkeit
              </TabsTrigger>
              <TabsTrigger 
                value="warenbestand"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[120px] h-12"
              >
                Warenbestand
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Content with proper mobile spacing */}
        <div className="px-4 py-6">
        
        {/* Allgemein Tab */}
        <TabsContent value="allgemein" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Stammdaten Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Stammdaten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Name des Automaten</Label>
                  <p className="font-medium">{machine.machineName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Vendon ID</Label>
                  <p className="font-medium">{machine.vendonId}</p>
                </div>
                {machine.serialNumber && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Seriennummer</Label>
                    <p className="font-medium">{machine.serialNumber}</p>
                  </div>
                )}
                {machine.machineType && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Typ</Label>
                    <p className="font-medium">{machine.machineType}</p>
                  </div>
                )}
                {machine.installationDate && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Installationsdatum</Label>
                    <p className="font-medium">{formatDateOnly(machine.installationDate)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Standort Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Standortinformationen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {machine.location && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Standortname</Label>
                    <p className="font-medium">{machine.location}</p>
                  </div>
                )}
                {machine.address && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Adresse</Label>
                    <p className="font-medium">{machine.address}</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-full">
                  <MapPin className="h-4 w-4 mr-2" />
                  Auf Karte anzeigen
                </Button>
              </CardContent>
            </Card>

            {/* KPI Overview (if analytics loaded) */}
            {analytics && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Leistungskennzahlen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Verkäufe heute</Label>
                    <p className="text-2xl font-bold">{analytics?.kpis?.transactionCount || 0}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Umsatz heute</Label>
                    <p className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.totalRevenue || 0)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Durchschnittspreis</Label>
                    <p className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.avgPrice || 0)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Umsatzentwicklung Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Umsatzentwicklung (letzte 30 Tage)</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : analytics?.salesTimeSeries?.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics?.salesTimeSeries || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE')}
                      formatter={(value, name) => [
                        name === 'revenue' ? formatCurrency(Number(value)) : value,
                        name === 'revenue' ? 'Umsatz' : 'Verkäufe'
                      ]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#8884d8" name="Verkäufe" strokeWidth={2} />
                    <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Umsatz" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                  Keine Umsatzdaten für den gewählten Zeitraum
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transaktionen Tab */}
        <TabsContent value="transaktionen" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Transaktionshistorie</h2>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportieren
            </Button>
          </div>

          {transactionsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead>Preis</TableHead>
                      <TableHead>Zahlungsart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions?.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{formatDate(transaction.datetime)}</TableCell>
                        <TableCell>{transaction.productName}</TableCell>
                        <TableCell>{transaction.quantity}x</TableCell>
                        <TableCell>{formatCurrency(transaction.price)}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.paymentMethod === 'CASH' ? 'secondary' : 'default'}>
                            {transaction.paymentMethod === 'CASH' ? 'Bar' : 'Cashless'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine Transaktionen gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analysen Tab */}
        <TabsContent value="analysen" className="space-y-6">
          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Verkäufe</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.kpis?.transactionCount || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Umsatz</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.totalRevenue || 0)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Auffüllungen</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.kpis?.refillCount || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Durchschnittspreis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(analytics?.kpis?.avgPrice || 0)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Sales Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Verkaufstrend</CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics?.salesTimeSeries?.length ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={analytics.salesTimeSeries}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#8884d8" name="Verkäufe" />
                        <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Umsatz" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                      Keine Verkaufstrend-Daten verfügbar
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Event Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle>Ereignis-Analyse</CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.eventCounts?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analytics.eventCounts}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ eventType, count }) => `${eventType}: ${count}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {analytics.eventCounts.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={["#8884d8","#82ca9d","#ffc658","#ff7300","#00ff00"][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                      Keine Ereignis-Daten verfügbar
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              Keine Analyse-Daten verfügbar
            </div>
          )}
        </TabsContent>

        {/* Auswertung Tab */}
        <TabsContent value="auswertung" className="space-y-6">
          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Weekly Revenue */}
                <Card>
                  <CardHeader>
                    <CardTitle>Wöchentlicher Ertrag</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.weeklyRevenue?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={analytics.weeklyRevenue}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" />
                          <YAxis />
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          <Bar dataKey="revenue" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine wöchentlichen Ertragsdaten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Monthly Revenue */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monatlicher Ertrag</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.monthlyRevenue?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={analytics.monthlyRevenue}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                          <Line type="monotone" dataKey="revenue" stroke="#82ca9d" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine monatlichen Ertragsdaten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Hourly Sales Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Verkaufszeiten</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.hourlyDistribution?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={analytics.hourlyDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#ffc658" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine Verkaufszeitdaten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Top Products */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Verkaufte Produkte</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.productPerformance?.length > 0 ? (
                      <div className="space-y-3">
                        {analytics.productPerformance.slice(0, 5).map((product, index) => (
                          <div key={product.productName} className="flex items-center justify-between p-2 bg-muted rounded">
                            <div className="flex items-center space-x-3">
                              <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                              <span className="font-medium">{product.productName}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">{product.count}x</div>
                              <div className="text-sm text-muted-foreground">{formatCurrency(product.revenue)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                        Keine Produktperformance-Daten verfügbar
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              Keine Auswertungsdaten verfügbar
            </div>
          )}
        </TabsContent>

        {/* Auffüllungen Tab */}
        <TabsContent value="auffullungen" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Auffüllungshistorie</h2>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportieren
            </Button>
          </div>

          {refillsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum & Zeit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Notizen</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refills?.map((refill) => (
                      <TableRow key={refill.id}>
                        <TableCell>{formatDate(refill.datetime)}</TableCell>
                        <TableCell>
                          <Badge variant={refill.status === 'completed' ? 'default' : 'secondary'}>
                            {refill.status === 'completed' ? 'Abgeschlossen' : 'In Bearbeitung'}
                          </Badge>
                        </TableCell>
                        <TableCell>{refill.operator}</TableCell>
                        <TableCell>{refill.notes}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine Auffüllungen gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* MHD Tab */}
        <TabsContent value="mhd" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Mindesthaltbarkeitsdaten</h2>
          </div>

          {mhdLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>MHD</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mhdEntries?.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.productName}</TableCell>
                        <TableCell>{formatDateOnly(entry.expiryDate)}</TableCell>
                        <TableCell>{entry.quantity}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              entry.status === 'expired' ? 'destructive' :
                              entry.status === 'warning' ? 'secondary' :
                              entry.status === 'attention' ? 'outline' : 'default'
                            }
                          >
                            {entry.status === 'expired' ? 'Abgelaufen' :
                             entry.status === 'warning' ? 'Warnung' :
                             entry.status === 'attention' ? 'Aufmerksamkeit' : 'Gut'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingMHD(entry.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine MHD-Einträge gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Entfernte Produkte Tab */}
        <TabsContent value="entnommene-produkte" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Entnommene Produkte</h2>
            <div className="flex items-center space-x-2">
              <Select value={removedProductsFilter} onValueChange={setRemovedProductsFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Tage</SelectItem>
                  <SelectItem value="30">30 Tage</SelectItem>
                  <SelectItem value="90">90 Tage</SelectItem>
                  <SelectItem value="365">1 Jahr</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportieren
              </Button>
            </div>
          </div>

          {removedProductsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Entfernte Anzahl</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Position</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {removedProducts?.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>{formatDate(product.datetime)}</TableCell>
                        <TableCell>{product.productName}</TableCell>
                        <TableCell>{product.removedQuantity}</TableCell>
                        <TableCell>{product.operator || '-'}</TableCell>
                        <TableCell>{product.position || '-'}</TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Keine entnommenen Produkte gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Kosten Tab */}
        <TabsContent value="kosten" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Laufende Kosten</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Kosten hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neue Kosten hinzufügen</DialogTitle>
                  <DialogDescription>
                    Fügen Sie neue laufende Kosten für diesen Automaten hinzu.
                  </DialogDescription>
                </DialogHeader>
                {/* Cost form would go here */}
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="costType" className="text-right">Kostenart</Label>
                    <Input id="costType" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="amount" className="text-right">Betrag</Label>
                    <Input id="amount" type="number" className="col-span-3" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Hinzufügen</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {costsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kostenart</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead>Häufigkeit</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Gültig ab</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machineCosts?.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell>{cost.costType}</TableCell>
                        <TableCell>{formatCurrency(cost.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {cost.frequency === 'monthly' ? 'Monatlich' :
                             cost.frequency === 'yearly' ? 'Jährlich' :
                             cost.frequency === 'quarterly' ? 'Quartalsweise' :
                             cost.frequency === 'weekly' ? 'Wöchentlich' : 'Einmalig'}
                          </Badge>
                        </TableCell>
                        <TableCell>{cost.description}</TableCell>
                        <TableCell>{formatDateOnly(cost.validFrom)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => deleteCostMutation.mutate(cost.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Keine Kosten definiert
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Wirtschaftlichkeit Tab */}
        <TabsContent value="wirtschaftlichkeit" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Rentabilitätsanalyse</h2>
            <div className="flex items-center space-x-2">
              <Input type="date" className="w-40" placeholder="Von" />
              <Input type="date" className="w-40" placeholder="Bis" />
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filtern
              </Button>
            </div>
          </div>

          {/* Profitability Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monatsumsatz</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">€1,245.80</div>
                <p className="text-xs text-muted-foreground">+12% vs. Vormonat</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monatliche Kosten</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">€892.50</div>
                <p className="text-xs text-muted-foreground">-5% vs. Vormonat</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Netto-Gewinn</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">€353.30</div>
                <p className="text-xs text-muted-foreground">+28% vs. Vormonat</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Gewinnmarge</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">28.4%</div>
                <p className="text-xs text-muted-foreground">+4.2% vs. Vormonat</p>
              </CardContent>
            </Card>
          </div>

          {/* Profitability Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Rentabilitätstrend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-muted rounded flex items-center justify-center text-muted-foreground">
                  Rentabilitätsdiagramm wird implementiert
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Break-Even-Analyse</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Täglicher Break-Even</span>
                    <span className="text-sm font-bold">€29.75</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '73%' }}></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">73% erreicht (€21.70 heute)</p>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Monatlicher Break-Even</span>
                    <span className="text-sm font-bold">€892.50</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '139%' }}></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">139% erreicht (€1,245.80 aktuell)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Warenbestand Tab */}
        <TabsContent value="warenbestand" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Aktueller Warenbestand</h2>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Bestand synchronisieren
            </Button>
          </div>

          {stockLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Bestand</TableHead>
                      <TableHead>Max. Kapazität</TableHead>
                      <TableHead>Füllstand</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Letzte Auffüllung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machineStock?.map((stock) => (
                      <TableRow key={stock.id}>
                        <TableCell>{stock.productName}</TableCell>
                        <TableCell>{stock.currentQuantity}</TableCell>
                        <TableCell>{stock.maxQuantity}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  stock.status === 'good' ? 'bg-green-500' :
                                  stock.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${(stock.currentQuantity / stock.maxQuantity) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm">
                              {Math.round((stock.currentQuantity / stock.maxQuantity) * 100)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              stock.status === 'critical' ? 'destructive' :
                              stock.status === 'warning' ? 'secondary' : 'default'
                            }
                          >
                            {stock.status === 'critical' ? 'Kritisch' :
                             stock.status === 'warning' ? 'Niedrig' : 'Gut'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {stock.lastRefill ? formatDate(stock.lastRefill) : '-'}
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Keine Bestandsdaten verfügbar
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        </div> {/* Close content wrapper */}
      </Tabs>
    </div>
  );
}