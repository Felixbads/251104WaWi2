import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ChartContainer, 
  LineChart, 
  BarChart, 
  HorizontalBarChart 
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { AlertTriangle, BarChart3, LineChart as LineChartIcon, ChevronDown, Clock, Download, Eye, FileText, HelpCircle, LifeBuoy, Percent, PieChart, Plus, RefreshCw, TrendingDown, TrendingUp, Calendar } from "lucide-react";
import { getMachineAnalytics, MachineAnalytics, MachineAnalyticsFull } from "@/lib/api";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Hilfsfunktion zum Formatieren von Währungen
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('de-DE', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }).format(amount);
};

// Hilfsfunktion zum Formatieren von Prozenten
const formatPercent = (value: number) => {
  return new Intl.NumberFormat('de-DE', { 
    style: 'percent', 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1 
  }).format(value / 100);
};

// Hilfsfunktion zum Formatieren von Datumswerten
const formatDate = (dateStr: string) => {
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return 'Ungültig';
    return format(date, 'dd.MM.yyyy', { locale: de });
  } catch (error) {
    return 'Ungültig';
  }
};

// Hilfsfunktion zum Umwandeln von Wochentagnummern in Namen
const getWeekdayName = (day: number) => {
  const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  return weekdays[day % 7]; // Um sicherzustellen, dass der Index immer gültig ist
};

interface MachineAnalysisProps {
  machineId: number;
}

export default function MachineAnalysis({ machineId }: MachineAnalysisProps) {
  // State für Filter- und Darstellungsoptionen
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined; }>({
    from: undefined,
    to: undefined,
  });
  const [showTop10Only, setShowTop10Only] = useState(true);
  const [analysisTab, setAnalysisTab] = useState('umsatz');
  
  // Abrufen der Analysedaten
  const { 
    data: analytics, 
    isLoading, 
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/machines', machineId, 'analytics', period, dateRange],
    queryFn: () => {
      // Für benutzerdefinierten Zeitraum die Datumsparameter hinzufügen
      if (period === 'custom' && dateRange.from && dateRange.to) {
        return getMachineAnalytics(
          machineId,
          period,
          dateRange.from.toISOString(),
          dateRange.to.toISOString()
        );
      }
      return getMachineAnalytics(machineId, period);
    },
    enabled: !!machineId
  });

  // Funktion zum Aktualisieren der Analysedaten
  const handleRefresh = () => {
    refetch();
  };

  // Exportfunktionen
  const exportAsPDF = async () => {
    const element = document.getElementById('analysis-content');
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        logging: false,
        useCORS: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = canvas.height * imgWidth / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`Automat-${machineId}-Analyse-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };
  
  // Exportiere Daten als CSV
  const exportAsCSV = () => {
    if (!analytics) return;
    
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      
      // Header der CSV-Datei je nach aktivem Tab
      if (analysisTab === 'umsatz') {
        csvContent += "Datum,Anzahl,Umsatz,Gewinn\n";
        
        // Daten hinzufügen
        analytics.revenueOverTime.forEach(item => {
          csvContent += `${formatDate(item.date)},${item.count},${item.revenue.toFixed(2)},${item.profit.toFixed(2)}\n`;
        });
      } else if (analysisTab === 'produkte') {
        csvContent += "Produkt,Anzahl Verkäufe,Umsatz,Durchschnittspreis\n";
        
        // Daten hinzufügen
        analytics.topProductsByRevenue.forEach(item => {
          csvContent += `"${item.productName}",${item.count},${item.revenue.toFixed(2)},${item.avgPrice.toFixed(2)}\n`;
        });
      } else if (analysisTab === 'marge') {
        csvContent += "Produkt,Anzahl Verkäufe,Umsatz,Gewinn,Marge pro Einheit\n";
        
        // Daten hinzufügen
        analytics.topProductsByProfit.forEach(item => {
          csvContent += `"${item.productName}",${item.count},${item.revenue.toFixed(2)},${item.profit.toFixed(2)},${item.marginPerUnit.toFixed(2)}\n`;
        });
      } else if (analysisTab === 'entnahmen') {
        csvContent += "Produkt,Anzahl Verkäufe,Manuelle Entnahmen,Entnahmequote (%)\n";
        
        // Daten hinzufügen
        analytics.removalQuotas.forEach(item => {
          csvContent += `"${item.productName}",${item.sales},${item.manualRemovals},${item.quota.toFixed(1)}\n`;
        });
      }
      
      // Erstellen und Trigger eines Download-Links
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Automat-${machineId}-${analysisTab}-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  // Rendering von Ladezustand oder Fehler
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Fehler beim Laden der Analysedaten</AlertTitle>
        <AlertDescription>
          Die Analysedaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
          {error instanceof Error && <p className="mt-2 text-sm">{error.message}</p>}
        </AlertDescription>
      </Alert>
    );
  }

  // Daten für die Umsatzentwicklung aufbereiten
  const revenueChartData = analytics.revenueOverTime.map(item => ({
    x: formatDate(item.date),
    y: item.revenue
  }));

  // Daten für die Produktanalyse aufbereiten
  const productRevenueChartData = analytics.topProductsByRevenue
    .slice(0, showTop10Only ? 10 : undefined)
    .map(item => ({
      x: item.productName,
      y: item.revenue
    }))
    .reverse(); // Umkehren für bessere Lesbarkeit in horizontalen Balkendiagrammen
  
  // Daten für die Margin-Analyse aufbereiten
  const productProfitChartData = analytics.topProductsByProfit
    .slice(0, showTop10Only ? 10 : undefined)
    .map(item => ({
      x: item.productName,
      y: item.profit
    }))
    .reverse();

  // Daten für die Uhrzeit-Verteilung aufbereiten
  const hourlyDistributionData = analytics.hourlyDistribution.map(item => ({
    x: `${item.hour}:00`,
    y: item.count
  }));

  // Daten für die Wochentag-Verteilung aufbereiten
  const weekdayDistributionData = analytics.weekdayDistribution
    .map(item => ({
      x: getWeekdayName(item.weekday),
      y: item.count
    }))
    .sort((a, b) => {
      // Sortiere Wochentage in korrekter Reihenfolge
      const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
      return days.indexOf(a.x) - days.indexOf(b.x);
    });

  return (
    <div className="space-y-6">
      {/* Filter- und Exportsteuerung */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
          <Select value={period} onValueChange={(value) => setPeriod(value as any)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Zeitraum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Heute</SelectItem>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Diesen Monat</SelectItem>
              <SelectItem value="year">Dieses Jahr</SelectItem>
              <SelectItem value="custom">Benutzerdefiniert</SelectItem>
            </SelectContent>
          </Select>

          {period === 'custom' && (
            <DatePickerWithRange 
              date={dateRange} 
              setDate={setDateRange} 
              locale={de}
              className="w-[260px]"
            />
          )}
          
          <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
        
        <div className="flex gap-2">
          <div className="flex items-center space-x-2">
            <Switch 
              id="top10-mode" 
              checked={showTop10Only} 
              onCheckedChange={setShowTop10Only}
            />
            <Label htmlFor="top10-mode" className="text-sm">Nur Top 10</Label>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Exportoptionen</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportAsPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Als PDF exportieren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAsCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Als CSV exportieren
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Zusammenfassung der Analysedaten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Transaktionen</CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-2xl font-bold">
              {analytics.summary.currentPeriod.transactions}
            </div>
            <div className="flex items-center mt-1">
              {analytics.summary.change.transactions > 0 ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{analytics.summary.change.transactions.toFixed(1)}%
                </Badge>
              ) : analytics.summary.change.transactions < 0 ? (
                <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-200">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {analytics.summary.change.transactions.toFixed(1)}%
                </Badge>
              ) : (
                <Badge variant="outline">Keine Änderung</Badge>
              )}
              <span className="text-sm text-gray-500 ml-2">vs. vorheriger Zeitraum</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Umsatz</CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.summary.currentPeriod.revenue)}
            </div>
            <div className="flex items-center mt-1">
              {analytics.summary.change.revenue > 0 ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{analytics.summary.change.revenue.toFixed(1)}%
                </Badge>
              ) : analytics.summary.change.revenue < 0 ? (
                <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-200">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {analytics.summary.change.revenue.toFixed(1)}%
                </Badge>
              ) : (
                <Badge variant="outline">Keine Änderung</Badge>
              )}
              <span className="text-sm text-gray-500 ml-2">vs. vorheriger Zeitraum</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Gewinn</CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.summary.currentPeriod.profit)}
            </div>
            <div className="flex items-center mt-1">
              {analytics.summary.change.profit > 0 ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{analytics.summary.change.profit.toFixed(1)}%
                </Badge>
              ) : analytics.summary.change.profit < 0 ? (
                <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-200">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {analytics.summary.change.profit.toFixed(1)}%
                </Badge>
              ) : (
                <Badge variant="outline">Keine Änderung</Badge>
              )}
              <span className="text-sm text-gray-500 ml-2">vs. vorheriger Zeitraum</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium">Analysezeitraum</CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <div className="text-md font-medium flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              {formatDate(analytics.machine.startDate)} bis {formatDate(analytics.machine.endDate)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Letzte Aktualisierung: {new Date(analytics.generatedAt).toLocaleTimeString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detaillierte Analysen */}
      <div id="analysis-content">
        <Tabs 
          value={analysisTab} 
          onValueChange={setAnalysisTab} 
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
            <TabsTrigger value="umsatz" className="flex items-center gap-2">
              <LineChartIcon className="h-4 w-4" />
              <span>Umsatzentwicklung</span>
            </TabsTrigger>
            <TabsTrigger value="produkte" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>Produktleistung</span>
            </TabsTrigger>
            <TabsTrigger value="marge" className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              <span>Margenanalyse</span>
            </TabsTrigger>
            <TabsTrigger value="entnahmen" className="flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              <span>Entnahmequoten</span>
            </TabsTrigger>
            <TabsTrigger value="zeitverteilung" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Zeitverteilung</span>
            </TabsTrigger>
          </TabsList>

          {/* Umsatzentwicklung */}
          <TabsContent value="umsatz" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Umsatzentwicklung</CardTitle>
                <CardDescription>
                  Umsatzverlauf über den gewählten Zeitraum
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ChartContainer>
                    <LineChart 
                      data={revenueChartData} 
                      xAxisKey="x" 
                      yAxisKey="y"
                      valueFormatter={(value) => formatCurrency(Number(value))}
                      showAnimation={true}
                      showLegend={false}
                      showXAxis={true}
                      showYAxis={true}
                      curveType="natural"
                    />
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Aktivitätszeiten</CardTitle>
                  <CardDescription>Verteilung nach Tageszeit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-60">
                    <ChartContainer>
                      <BarChart 
                        data={hourlyDistributionData}
                        xAxisKey="x"
                        yAxisKey="y"
                        showAnimation={true}
                        showLegend={false}
                        showXAxis={true}
                        showYAxis={true}
                        valueFormatter={(value) => `${value} Transaktionen`}
                      />
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Aktivitätstage</CardTitle>
                  <CardDescription>Verteilung nach Wochentagen</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-60">
                    <ChartContainer>
                      <BarChart 
                        data={weekdayDistributionData}
                        xAxisKey="x"
                        yAxisKey="y"
                        showAnimation={true}
                        showLegend={false}
                        showXAxis={true}
                        showYAxis={true}
                        valueFormatter={(value) => `${value} Transaktionen`}
                      />
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Produktleistung */}
          <TabsContent value="produkte" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Produkte nach Umsatz</CardTitle>
                <CardDescription>
                  Die umsatzstärksten Produkte im ausgewählten Zeitraum
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ChartContainer>
                    <HorizontalBarChart 
                      data={productRevenueChartData}
                      xAxisKey="y"
                      yAxisKey="x"
                      showAnimation={true}
                      showLegend={false}
                      showXAxis={true}
                      showYAxis={true}
                      valueFormatter={(value) => formatCurrency(Number(value))}
                      chartWidth={450}
                    />
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Produkte mit niedrigem Umsatz</CardTitle>
                <CardDescription>
                  Produkte mit dem geringsten Umsatz im ausgewählten Zeitraum
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Anzahl Verkäufe</TableHead>
                      <TableHead>Umsatz</TableHead>
                      <TableHead>Letzter Verkauf</TableHead>
                      <TableHead>Tage seit letztem Verkauf</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.worstProductsByRevenue
                      .slice(0, showTop10Only ? 10 : undefined)
                      .map((product, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{product.productName}</TableCell>
                          <TableCell>{product.count}</TableCell>
                          <TableCell>{formatCurrency(product.revenue)}</TableCell>
                          <TableCell>{formatDate(product.lastSale)}</TableCell>
                          <TableCell>
                            {product.daysSinceLastSale === null ? (
                              <span className="text-red-500">Unbekannt</span>
                            ) : (
                              <Badge
                                variant={product.daysSinceLastSale > 30 ? "destructive" : 
                                        product.daysSinceLastSale > 14 ? "secondary" : "default"}
                              >
                                {product.daysSinceLastSale} Tage
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Margenanalyse */}
          <TabsContent value="marge" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Produkte nach Marge</CardTitle>
                <CardDescription>
                  Die profitabelsten Produkte basierend auf Gewinnmarge
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ChartContainer>
                    <HorizontalBarChart 
                      data={productProfitChartData}
                      xAxisKey="y"
                      yAxisKey="x"
                      showAnimation={true}
                      showLegend={false}
                      showXAxis={true}
                      showYAxis={true}
                      valueFormatter={(value) => formatCurrency(Number(value))}
                      chartWidth={450}
                    />
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Margentabelle</CardTitle>
                <CardDescription>
                  Detaillierte Margenanalyse für alle Produkte
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Anzahl Verkäufe</TableHead>
                      <TableHead>Umsatz</TableHead>
                      <TableHead>Gewinn</TableHead>
                      <TableHead>Marge pro Einheit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.topProductsByProfit
                      .slice(0, showTop10Only ? 10 : undefined)
                      .map((product, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{product.productName}</TableCell>
                          <TableCell>{product.count}</TableCell>
                          <TableCell>{formatCurrency(product.revenue)}</TableCell>
                          <TableCell>{formatCurrency(product.profit)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={product.marginPerUnit < 0 ? "destructive" :
                                      product.marginPerUnit < 0.2 ? "secondary" : "default"}
                              className="font-mono"
                            >
                              {formatCurrency(product.marginPerUnit)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Produkte mit negativer Marge</CardTitle>
                <CardDescription>
                  Produkte, die Verluste verursachen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Anzahl Verkäufe</TableHead>
                      <TableHead>Umsatz</TableHead>
                      <TableHead>Gewinn/Verlust</TableHead>
                      <TableHead>Marge pro Einheit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.worstProductsByProfit
                      .filter(p => p.profit < 0)
                      .slice(0, showTop10Only ? 10 : undefined)
                      .map((product, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{product.productName}</TableCell>
                          <TableCell>{product.count}</TableCell>
                          <TableCell>{formatCurrency(product.revenue)}</TableCell>
                          <TableCell className="text-red-500">
                            {formatCurrency(product.profit)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="destructive"
                              className="font-mono"
                            >
                              {formatCurrency(product.marginPerUnit)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {analytics.worstProductsByProfit.filter(p => p.profit < 0).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                          Keine Produkte mit negativer Marge gefunden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Entnahmequotenanalyse */}
          <TabsContent value="entnahmen" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Entnahmequoten</CardTitle>
                <CardDescription>
                  Verhältnis von Verkäufen zu manuellen Entnahmen
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="ml-1">
                        <HelpCircle className="h-4 w-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <p>Die Entnahmequote zeigt, wie viel Prozent der Produktentnahmen auf reguläre Verkäufe entfallen (im Gegensatz zu manuellen Entnahmen, z.B. wegen Ablauf oder Beschädigung). Eine höhere Quote bedeutet bessere Effizienz.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Verkauft</TableHead>
                      <TableHead>Manuell entnommen</TableHead>
                      <TableHead>Entnahmequote</TableHead>
                      <TableHead>Visualisierung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.removalQuotas
                      .slice(0, showTop10Only ? 10 : undefined)
                      .sort((a, b) => b.quota - a.quota)
                      .map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell>{item.sales}</TableCell>
                          <TableCell>{item.manualRemovals}</TableCell>
                          <TableCell>
                            <Badge
                              variant={item.quota < 50 ? "destructive" : 
                                      item.quota < 80 ? "secondary" : "default"}
                            >
                              {item.quota}%
                            </Badge>
                          </TableCell>
                          <TableCell className="w-1/4">
                            <div className="flex items-center gap-2">
                              <Progress value={item.quota} className="h-2" />
                              <span className="text-xs font-medium">
                                {formatPercent(item.quota)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Out-of-Stock-Ereignisse</CardTitle>
                <CardDescription>
                  Aufzeichnungen über Produkte, die nicht auf Lager waren
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum/Zeit</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Ereignis</TableHead>
                      <TableHead>Dauer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.outOfStockEvents
                      .slice(0, showTop10Only ? 10 : undefined)
                      .map((event, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {new Date(event.eventDateTime).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium">{event.productName || 'Unbekannt'}</TableCell>
                          <TableCell className="max-w-md truncate">{event.description}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {event.duration} min
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {analytics.outOfStockEvents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-gray-500">
                          Keine Out-of-Stock-Ereignisse im Analysezeitraum
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Zeitverteilung */}
          <TabsContent value="zeitverteilung" className="mt-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tageszeit-Verteilung</CardTitle>
                  <CardDescription>Anzahl der Transaktionen nach Uhrzeit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ChartContainer>
                      <BarChart 
                        data={hourlyDistributionData}
                        xAxisKey="x"
                        yAxisKey="y"
                        showAnimation={true}
                        showLegend={false}
                        showXAxis={true}
                        showYAxis={true}
                        valueFormatter={(value) => `${value} Transaktionen`}
                      />
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Wochentag-Verteilung</CardTitle>
                  <CardDescription>Anzahl der Transaktionen nach Wochentag</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ChartContainer>
                      <BarChart 
                        data={weekdayDistributionData}
                        xAxisKey="x"
                        yAxisKey="y"
                        showAnimation={true}
                        showLegend={false}
                        showXAxis={true}
                        showYAxis={true}
                        valueFormatter={(value) => `${value} Transaktionen`}
                      />
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Umsatz nach Tageszeit</CardTitle>
                <CardDescription>Umsatzverteilung nach Stunden</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Uhrzeit</TableHead>
                      <TableHead>Anzahl Transaktionen</TableHead>
                      <TableHead>Umsatz</TableHead>
                      <TableHead>Durchschnitt pro Transaktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.hourlyDistribution
                      .sort((a, b) => a.hour - b.hour)
                      .map((hour, index) => {
                        const avgPerTransaction = hour.count > 0 ? hour.revenue / hour.count : 0;
                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{hour.hour}:00 - {hour.hour}:59</TableCell>
                            <TableCell>{hour.count}</TableCell>
                            <TableCell>{formatCurrency(hour.revenue)}</TableCell>
                            <TableCell>{formatCurrency(avgPerTransaction)}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Umsatz nach Wochentag</CardTitle>
                <CardDescription>Umsatzverteilung nach Wochentagen</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wochentag</TableHead>
                      <TableHead>Anzahl Transaktionen</TableHead>
                      <TableHead>Umsatz</TableHead>
                      <TableHead>Durchschnitt pro Transaktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.weekdayDistribution
                      .sort((a, b) => a.weekday - b.weekday)
                      .map((day, index) => {
                        const avgPerTransaction = day.count > 0 ? day.revenue / day.count : 0;
                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{getWeekdayName(day.weekday)}</TableCell>
                            <TableCell>{day.count}</TableCell>
                            <TableCell>{formatCurrency(day.revenue)}</TableCell>
                            <TableCell>{formatCurrency(avgPerTransaction)}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}