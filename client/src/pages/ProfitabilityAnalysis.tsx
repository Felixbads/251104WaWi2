import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3, 
  PieChart, 
  Calculator,
  Plus,
  Settings,
  Euro,
  Calendar,
  MapPin,
  Package,
  Zap,
  Info
} from 'lucide-react';
import { format, subDays, subWeeks, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';

interface ProfitabilityData {
  period: string;
  periodDate: string;
  machineId?: number;
  machineName?: string;
  locationName?: string;
  productId?: number;
  productName?: string;
  revenueNet: number;
  revenueGross: number;
  depositRevenue: number;
  purchaseCostNet: number;
  operatingCostsNet: number;
  netProfit: number;
  profitMarginPercent: number;
  transactionCount: number;
  quantitySold: number;
  avgSalePrice: number;
}

interface ProfitabilitySummary {
  totalRevenueNet: number;
  totalPurchaseCost: number;
  totalOperatingCosts: number;
  totalCosts: number;
  totalNetProfit: number;
  roiPercent: number;
  profitMarginPercent: number;
  activeMachines: number;
  activeProducts: number;
  totalTransactions: number;
  avgTransactionValue: number;
}

interface LocationCost {
  id: number;
  locationId?: number;
  machineId?: number;
  locationName: string;
  machineName?: string;
  costType: string;
  costName: string;
  amountNet: number;
  amountGross: number;
  vatRate: number;
  currency: string;
  validFrom: string;
  validTo?: string;
  billingCycle: string;
  description?: string;
  category?: string;
  isActive: boolean;
  isAutoDeducted: boolean;
  supplier?: string;
  contractNumber?: string;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

export default function ProfitabilityAnalysis() {
  // State für Filter
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupBy, setGroupBy] = useState<'machine' | 'product' | 'location' | 'total'>('total');
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');

  // State für neue Standortkosten
  const [showAddCostForm, setShowAddCostForm] = useState(false);
  const [newCost, setNewCost] = useState({
    locationName: '',
    costType: '',
    costName: '',
    amountNet: '',
    amountGross: '',
    vatRate: '19',
    billingCycle: 'monthly',
    validFrom: format(new Date(), 'yyyy-MM-dd'),
    category: '',
    description: '',
  });

  const queryClient = useQueryClient();

  // Query für Hauptauswertung
  const { data: profitabilityData, isLoading: isLoadingData } = useQuery({
    queryKey: ['/api/profitability/overview', { period, startDate, endDate, groupBy, machineId: selectedMachine, productId: selectedProduct }],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        startDate,
        endDate,
        groupBy,
        ...(selectedMachine && { machineId: selectedMachine }),
        ...(selectedProduct && { productId: selectedProduct }),
      });
      
      const response = await fetch(`/api/profitability/overview?${params}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result.data as ProfitabilityData[];
    },
  });

  // Query für Zusammenfassung
  const { data: summaryData } = useQuery({
    queryKey: ['/api/profitability/summary', { period, startDate, endDate }],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        startDate,
        endDate,
      });
      
      const response = await fetch(`/api/profitability/summary?${params}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result.data as ProfitabilitySummary;
    },
  });

  // Query für Standortkosten
  const { data: locationCosts } = useQuery({
    queryKey: ['/api/profitability/costs'],
    queryFn: async () => {
      const response = await fetch('/api/profitability/costs');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result.data as LocationCost[];
    },
  });

  // Mutation für neue Standortkosten
  const addCostMutation = useMutation({
    mutationFn: async (costData: any) => {
      const response = await fetch('/api/profitability/costs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(costData),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profitability/costs'] });
      setShowAddCostForm(false);
      setNewCost({
        locationName: '',
        costType: '',
        costName: '',
        amountNet: '',
        amountGross: '',
        vatRate: '19',
        billingCycle: 'monthly',
        validFrom: format(new Date(), 'yyyy-MM-dd'),
        category: '',
        description: '',
      });
    },
  });

  // Schnellfilter-Funktionen
  const setQuickPeriod = (days: number) => {
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
    setStartDate(format(subDays(new Date(), days), 'yyyy-MM-dd'));
  };

  // Formatierung von Währungsbeträgen
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Formatierung von Prozenten
  const formatPercent = (percent: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(percent / 100);
  };

  // Handling für neuen Kosteneintrag
  const handleAddCost = () => {
    const amountNet = parseFloat(newCost.amountNet);
    const vatRate = parseFloat(newCost.vatRate);
    const amountGross = amountNet * (1 + vatRate / 100);

    addCostMutation.mutate({
      ...newCost,
      amountNet,
      amountGross,
      vatRate,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Wirtschaftlichkeitsauswertung</h1>
          <p className="text-muted-foreground">
            Berechnung: Netto Erlös - Einkaufspreis - Pfand - laufende Kosten = Nettogewinn
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuickPeriod(7)}
          >
            Letzte 7 Tage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuickPeriod(30)}
          >
            Letzte 30 Tage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuickPeriod(90)}
          >
            Letzte 90 Tage
          </Button>
        </div>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Filter & Einstellungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <Label htmlFor="period">Zeitraum</Label>
              <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Täglich</SelectItem>
                  <SelectItem value="week">Wöchentlich</SelectItem>
                  <SelectItem value="month">Monatlich</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="startDate">Von</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="endDate">Bis</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="groupBy">Gruppierung</Label>
              <Select value={groupBy} onValueChange={(value: any) => setGroupBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Gesamt</SelectItem>
                  <SelectItem value="machine">Je Automat</SelectItem>
                  <SelectItem value="product">Je Produkt</SelectItem>
                  <SelectItem value="location">Je Standort</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="machine">Automat (optional)</Label>
              <Input
                placeholder="Maschinen-ID"
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="product">Produkt (optional)</Label>
              <Input
                placeholder="Produkt-ID"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="details">Detailauswertung</TabsTrigger>
          <TabsTrigger value="costs">Standortkosten</TabsTrigger>
        </TabsList>

        {/* Übersicht Tab */}
        <TabsContent value="overview" className="space-y-6">
          {summaryData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Netto-Umsatz</CardTitle>
                  <Euro className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(summaryData.totalRevenueNet)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {summaryData.totalTransactions} Transaktionen
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Gesamtkosten</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(summaryData.totalCosts)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div>Einkauf: {formatCurrency(summaryData.totalPurchaseCost)}</div>
                    <div>Betrieb: {formatCurrency(summaryData.totalOperatingCosts)}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Nettogewinn</CardTitle>
                  {summaryData.totalNetProfit >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${summaryData.totalNetProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(summaryData.totalNetProfit)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Marge: {formatPercent(summaryData.profitMarginPercent)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">ROI</CardTitle>
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${summaryData.roiPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(summaryData.roiPercent)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Return on Investment
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Berechnungsgrundlage</AlertTitle>
            <AlertDescription>
              <strong>Nettogewinn = Netto-Verkaufserlös - Netto-Einkaufspreis - Pfand - laufende Kosten</strong>
              <br />
              Laufende Kosten werden anteilig auf den gewählten Zeitraum umgerechnet.
              Einkaufspreise stammen aus den Einkaufsbedingungen oder dem Kostenstamm der Produkte.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Detailauswertung Tab */}
        <TabsContent value="details" className="space-y-6">
          {isLoadingData ? (
            <div className="text-center py-8">Lade Auswertungsdaten...</div>
          ) : (
            <div className="space-y-4">
              {profitabilityData && profitabilityData.length > 0 ? (
                profitabilityData.map((item, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{item.period}</span>
                          {item.machineName && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <Zap className="h-4 w-4" />
                              <span>{item.machineName}</span>
                            </>
                          )}
                          {item.productName && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <Package className="h-4 w-4" />
                              <span>{item.productName}</span>
                            </>
                          )}
                          {item.locationName && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <MapPin className="h-4 w-4" />
                              <span>{item.locationName}</span>
                            </>
                          )}
                        </div>
                        <Badge variant={item.netProfit >= 0 ? "default" : "destructive"}>
                          {formatCurrency(item.netProfit)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-green-600">Umsatz (Netto)</div>
                          <div>{formatCurrency(item.revenueNet)}</div>
                        </div>
                        <div>
                          <div className="font-medium text-red-600">Einkaufskosten</div>
                          <div>{formatCurrency(item.purchaseCostNet)}</div>
                        </div>
                        <div>
                          <div className="font-medium text-red-600">Betriebskosten</div>
                          <div>{formatCurrency(item.operatingCostsNet)}</div>
                        </div>
                        <div>
                          <div className="font-medium">Menge verkauft</div>
                          <div>{item.quantitySold} Stück</div>
                        </div>
                        <div>
                          <div className="font-medium">Marge</div>
                          <div className={item.profitMarginPercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatPercent(item.profitMarginPercent)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-muted-foreground">Keine Daten für den gewählten Zeitraum gefunden.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Standortkosten Tab */}
        <TabsContent value="costs" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Laufende Standortkosten</h2>
            <Button onClick={() => setShowAddCostForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Kostenstelle hinzufügen
            </Button>
          </div>

          {/* Formular für neue Kosten */}
          {showAddCostForm && (
            <Card>
              <CardHeader>
                <CardTitle>Neue Kostenstelle hinzufügen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="locationName">Standortname *</Label>
                    <Input
                      value={newCost.locationName}
                      onChange={(e) => setNewCost({ ...newCost, locationName: e.target.value })}
                      placeholder="z.B. Bad Schandau Nationalparkbahnhof"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="costType">Kostenart *</Label>
                    <Select value={newCost.costType} onValueChange={(value) => setNewCost({ ...newCost, costType: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wählen Sie eine Kostenart" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strom">Strom</SelectItem>
                        <SelectItem value="miete">Miete</SelectItem>
                        <SelectItem value="telemetrie">Telemetrie</SelectItem>
                        <SelectItem value="kartenzahlung">Kartenzahlungsmodul</SelectItem>
                        <SelectItem value="wartung">Wartung</SelectItem>
                        <SelectItem value="versicherung">Versicherung</SelectItem>
                        <SelectItem value="sonstiges">Sonstiges</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="costName">Kostenbezeichnung *</Label>
                    <Input
                      value={newCost.costName}
                      onChange={(e) => setNewCost({ ...newCost, costName: e.target.value })}
                      placeholder="z.B. Stromkosten EnBW"
                    />
                  </div>

                  <div>
                    <Label htmlFor="amountNet">Netto-Betrag (EUR) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newCost.amountNet}
                      onChange={(e) => setNewCost({ ...newCost, amountNet: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="vatRate">MwSt-Satz (%)</Label>
                    <Input
                      type="number"
                      value={newCost.vatRate}
                      onChange={(e) => setNewCost({ ...newCost, vatRate: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="billingCycle">Abrechnungszyklus</Label>
                    <Select value={newCost.billingCycle} onValueChange={(value) => setNewCost({ ...newCost, billingCycle: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monatlich</SelectItem>
                        <SelectItem value="quarterly">Quartalsweise</SelectItem>
                        <SelectItem value="yearly">Jährlich</SelectItem>
                        <SelectItem value="one_time">Einmalig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="validFrom">Gültig ab</Label>
                    <Input
                      type="date"
                      value={newCost.validFrom}
                      onChange={(e) => setNewCost({ ...newCost, validFrom: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="category">Kategorie</Label>
                    <Select value={newCost.category} onValueChange={(value) => setNewCost({ ...newCost, category: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="energie">Energie</SelectItem>
                        <SelectItem value="infrastruktur">Infrastruktur</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="wartung">Wartung</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="description">Beschreibung</Label>
                    <Input
                      value={newCost.description}
                      onChange={(e) => setNewCost({ ...newCost, description: e.target.value })}
                      placeholder="Optionale Beschreibung"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleAddCost} disabled={addCostMutation.isPending}>
                    {addCostMutation.isPending ? 'Speichere...' : 'Kostenstelle speichern'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddCostForm(false)}>
                    Abbrechen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Liste der vorhandenen Kosten */}
          <div className="space-y-3">
            {locationCosts && locationCosts.length > 0 ? (
              locationCosts.map((cost) => (
                <Card key={cost.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-medium">{cost.costName}</div>
                          <div className="text-sm text-muted-foreground">
                            {cost.locationName} • {cost.costType}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {cost.billingCycle === 'monthly' ? 'Monatlich' : 
                           cost.billingCycle === 'yearly' ? 'Jährlich' :
                           cost.billingCycle === 'quarterly' ? 'Quartalsweise' : 'Einmalig'}
                        </Badge>
                        {cost.category && (
                          <Badge variant="secondary">{cost.category}</Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {formatCurrency(cost.amountNet)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          netto • {formatCurrency(cost.amountGross)} brutto
                        </div>
                      </div>
                    </div>
                    {cost.description && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {cost.description}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">Noch keine Standortkosten angelegt.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Fügen Sie laufende Kosten wie Strom, Miete oder Telemetrie hinzu.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}