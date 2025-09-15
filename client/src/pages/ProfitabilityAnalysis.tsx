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

interface SummaryData {
  totalRevenueNet: number;
  totalRevenueGross: number;
  totalDepositRevenue: number;
  totalPurchaseCost: number;
  totalOperatingCosts: number;
  totalNetProfit: number;
  profitMarginPercent: number;
  roiPercent: number;
  totalTransactions: number;
  totalQuantity: number;
}

interface LocationCost {
  id: number;
  locationName: string;
  costType: string;
  costName: string;
  amountNet: number;
  amountGross: number;
  vatRate: number;
  billingCycle: string;
  validFrom: string;
  validTo?: string;
  category: string;
  description?: string;
}

export default function ProfitabilityAnalysis() {
  // State für Filter
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupBy, setGroupBy] = useState<'machine' | 'product' | 'location' | 'total'>('product');
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [activeTab, setActiveTab] = useState('details');

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

  // Quick period setter
  const setQuickPeriod = (days: number) => {
    setStartDate(format(subDays(new Date(), days), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

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

  // Query für Standortkosten
  const { data: locationCosts, isLoading: isLoadingCosts } = useQuery({
    queryKey: ['/api/profitability/location-costs'],
    queryFn: async () => {
      const response = await fetch('/api/profitability/location-costs');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result.data as LocationCost[];
    },
  });

  // Mutation für neue Standortkosten
  const addLocationCostMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/profitability/location-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profitability/location-costs'] });
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

  // Berechne Zusammenfassung
  const summaryData: SummaryData | null = profitabilityData ? (() => {
    const totalRevenue = profitabilityData.reduce((sum, item) => sum + item.revenueNet, 0);
    const totalProfit = profitabilityData.reduce((sum, item) => sum + item.netProfit, 0);
    const totalCosts = profitabilityData.reduce((sum, item) => sum + item.purchaseCostNet + item.operatingCostsNet, 0);
    
    return {
      totalRevenueNet: totalRevenue,
      totalRevenueGross: profitabilityData.reduce((sum, item) => sum + item.revenueGross, 0),
      totalDepositRevenue: profitabilityData.reduce((sum, item) => sum + item.depositRevenue, 0),
      totalPurchaseCost: profitabilityData.reduce((sum, item) => sum + item.purchaseCostNet, 0),
      totalOperatingCosts: profitabilityData.reduce((sum, item) => sum + item.operatingCostsNet, 0),
      totalNetProfit: totalProfit,
      profitMarginPercent: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      roiPercent: totalCosts > 0 ? (totalProfit / totalCosts) * 100 : 0,
      totalTransactions: profitabilityData.reduce((sum, item) => sum + item.transactionCount, 0),
      totalQuantity: profitabilityData.reduce((sum, item) => sum + item.quantitySold, 0),
    };
  })() : null;

  // Hilfsfunktionen
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(percent / 100);
  };

  const handleAddLocationCost = () => {
    addLocationCostMutation.mutate({
      ...newCost,
      amountNet: parseFloat(newCost.amountNet),
      amountGross: parseFloat(newCost.amountGross),
      vatRate: parseFloat(newCost.vatRate),
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
                  <SelectItem value="machine">Nach Automat</SelectItem>
                  <SelectItem value="product">Nach Produkt</SelectItem>
                  <SelectItem value="location">Nach Standort</SelectItem>
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

      {/* Tabs für Wirtschaftlichkeitsauswertung */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="location-costs">Standortkosten</TabsTrigger>
        </TabsList>

        {/* Übersicht Tab */}
        <TabsContent value="overview" className="space-y-4">
          {summaryData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Netto-Umsatz</CardTitle>
                  <Euro className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summaryData.totalRevenueNet)}</div>
                  <p className="text-xs text-muted-foreground">
                    Brutto: {formatCurrency(summaryData.totalRevenueGross)}
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
                    {formatCurrency(summaryData.totalPurchaseCost + summaryData.totalOperatingCosts)}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
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

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Detailauswertung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auswahl zwischen Automat und Produkt-Ansicht */}
              <div className="flex gap-4 mb-4">
                <Button 
                  variant={groupBy === 'machine' ? 'default' : 'outline'}
                  onClick={() => setGroupBy('machine')}
                >
                  Nach Automaten
                </Button>
                <Button 
                  variant={groupBy === 'product' ? 'default' : 'outline'}
                  onClick={() => setGroupBy('product')}
                >
                  Nach Produkten
                </Button>
              </div>

              {isLoadingData ? (
                <div className="text-center py-8">Lade Auswertungsdaten...</div>
              ) : (
                <>
                  {/* Detailtabelle */}
                  {profitabilityData && profitabilityData.length > 0 ? (
                    <div className="rounded-md border">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="h-12 px-4 text-left align-middle font-medium">
                              {groupBy === 'machine' ? 'Automat' : 'Produkt'}
                            </th>
                            <th className="h-12 px-4 text-right align-middle font-medium">
                              Umsatz Brutto
                            </th>
                            <th className="h-12 px-4 text-right align-middle font-medium">
                              Umsatz Netto
                            </th>
                            <th className="h-12 px-4 text-right align-middle font-medium">
                              Pfand
                            </th>
                            <th className="h-12 px-4 text-right align-middle font-medium">
                              Einkaufskosten
                            </th>
                            <th className="h-12 px-4 text-right align-middle font-medium">
                              Standortkosten
                            </th>
                            <th className="h-12 px-4 text-right align-middle font-medium">
                              Nettoergebnis
                            </th>
                            <th className="h-12 px-4 text-right align-middle font-medium">
                              Marge %
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitabilityData.map((item, index) => (
                            <tr key={index} className="border-b">
                              <td className="h-12 px-4 align-middle">
                                <div className="font-medium">
                                  {groupBy === 'machine' ? item.machineName : item.productName}
                                </div>
                                {groupBy === 'machine' && item.locationName && (
                                  <div className="text-sm text-muted-foreground">{item.locationName}</div>
                                )}
                              </td>
                              <td className="h-12 px-4 text-right align-middle">
                                {formatCurrency(item.revenueGross)}
                              </td>
                              <td className="h-12 px-4 text-right align-middle">
                                {formatCurrency(item.revenueNet)}
                              </td>
                              <td className="h-12 px-4 text-right align-middle">
                                {formatCurrency(item.depositRevenue)}
                              </td>
                              <td className="h-12 px-4 text-right align-middle text-red-600">
                                {formatCurrency(item.purchaseCostNet)}
                              </td>
                              <td className="h-12 px-4 text-right align-middle text-red-600">
                                {formatCurrency(item.operatingCostsNet)}
                              </td>
                              <td className={`h-12 px-4 text-right align-middle font-medium ${
                                item.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatCurrency(item.netProfit)}
                              </td>
                              <td className={`h-12 px-4 text-right align-middle ${
                                item.profitMarginPercent >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatPercent(item.profitMarginPercent)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Keine Daten für den gewählten Zeitraum verfügbar
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Standortkosten Tab */}
        <TabsContent value="location-costs" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Standortkosten verwalten</CardTitle>
              <Button onClick={() => setShowAddCostForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Neue Kosten hinzufügen
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingCosts ? (
                <div className="text-center py-8">Lade Standortkosten...</div>
              ) : (
                <div className="space-y-4">
                  {locationCosts && locationCosts.length > 0 ? (
                    <div className="rounded-md border">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="h-12 px-4 text-left align-middle font-medium">Standort</th>
                            <th className="h-12 px-4 text-left align-middle font-medium">Kostenart</th>
                            <th className="h-12 px-4 text-left align-middle font-medium">Bezeichnung</th>
                            <th className="h-12 px-4 text-right align-middle font-medium">Betrag (Netto)</th>
                            <th className="h-12 px-4 text-right align-middle font-medium">Betrag (Brutto)</th>
                            <th className="h-12 px-4 text-center align-middle font-medium">Abrechnungszyklus</th>
                            <th className="h-12 px-4 text-center align-middle font-medium">Gültig ab</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locationCosts.map((cost) => (
                            <tr key={cost.id} className="border-b">
                              <td className="h-12 px-4 align-middle">{cost.locationName}</td>
                              <td className="h-12 px-4 align-middle">
                                <Badge variant="outline">{cost.costType}</Badge>
                              </td>
                              <td className="h-12 px-4 align-middle">{cost.costName}</td>
                              <td className="h-12 px-4 text-right align-middle">
                                {formatCurrency(cost.amountNet)}
                              </td>
                              <td className="h-12 px-4 text-right align-middle">
                                {formatCurrency(cost.amountGross)}
                              </td>
                              <td className="h-12 px-4 text-center align-middle">
                                <Badge>{cost.billingCycle}</Badge>
                              </td>
                              <td className="h-12 px-4 text-center align-middle">
                                {format(new Date(cost.validFrom), 'dd.MM.yyyy', { locale: de })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Noch keine Standortkosten erfasst
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formular für neue Standortkosten */}
          {showAddCostForm && (
            <Card>
              <CardHeader>
                <CardTitle>Neue Standortkosten hinzufügen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="locationName">Standort</Label>
                    <Input
                      placeholder="Standortname"
                      value={newCost.locationName}
                      onChange={(e) => setNewCost({...newCost, locationName: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="costType">Kostenart</Label>
                    <Select value={newCost.costType} onValueChange={(value) => setNewCost({...newCost, costType: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Kostenart wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rent">Miete</SelectItem>
                        <SelectItem value="utilities">Nebenkosten</SelectItem>
                        <SelectItem value="maintenance">Wartung</SelectItem>
                        <SelectItem value="insurance">Versicherung</SelectItem>
                        <SelectItem value="other">Sonstige</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="costName">Bezeichnung</Label>
                  <Input
                    placeholder="z.B. Standplatzmiete, Stromkosten, etc."
                    value={newCost.costName}
                    onChange={(e) => setNewCost({...newCost, costName: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="amountNet">Betrag (Netto)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newCost.amountNet}
                      onChange={(e) => setNewCost({...newCost, amountNet: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="amountGross">Betrag (Brutto)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newCost.amountGross}
                      onChange={(e) => setNewCost({...newCost, amountGross: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vatRate">MwSt. %</Label>
                    <Input
                      type="number"
                      value={newCost.vatRate}
                      onChange={(e) => setNewCost({...newCost, vatRate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="billingCycle">Abrechnungszyklus</Label>
                    <Select value={newCost.billingCycle} onValueChange={(value) => setNewCost({...newCost, billingCycle: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Täglich</SelectItem>
                        <SelectItem value="weekly">Wöchentlich</SelectItem>
                        <SelectItem value="monthly">Monatlich</SelectItem>
                        <SelectItem value="quarterly">Quartalsweise</SelectItem>
                        <SelectItem value="yearly">Jährlich</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="validFrom">Gültig ab</Label>
                    <Input
                      type="date"
                      value={newCost.validFrom}
                      onChange={(e) => setNewCost({...newCost, validFrom: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Beschreibung (optional)</Label>
                  <Input
                    placeholder="Zusätzliche Informationen"
                    value={newCost.description}
                    onChange={(e) => setNewCost({...newCost, description: e.target.value})}
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleAddLocationCost}
                    disabled={addLocationCostMutation.isPending}
                  >
                    {addLocationCostMutation.isPending ? 'Speichere...' : 'Speichern'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAddCostForm(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}