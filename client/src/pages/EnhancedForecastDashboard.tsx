import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  AlertTriangle, 
  CloudRain, 
  Calendar, 
  Package, 
  BarChart3, 
  Clock,
  Target,
  Activity,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ForecastExplanation {
  date: string;
  machineId: number;
  machineName: string;
  locationName: string;
  productName: string;
  baselineDemand: number;
  weatherAdjustment: number;
  holidayAdjustment: number;
  stockoutCompensation: number;
  finalForecast: number;
  explanation: string;
  confidence: number;
  factors: string[];
}

interface DashboardData {
  forecasts: ForecastExplanation[];
  summary: {
    totalMachines: number;
    averageConfidence: number;
    highDemandDays: number;
    warnings: string[];
  };
}

export default function EnhancedForecastDashboard() {
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);
  
  // Get dashboard data
  const { data: dashboardData, isLoading, error } = useQuery<{ data: DashboardData }>({
    queryKey: ['/api/enhanced-forecast/dashboard', selectedWarehouse],
    queryFn: () => {
      const params = selectedWarehouse ? `?warehouseId=${selectedWarehouse}` : '';
      return fetch(`/api/enhanced-forecast/dashboard${params}`).then(res => res.json());
    }
  });

  // Get machine-specific forecasts
  const { data: machineData } = useQuery({
    queryKey: ['/api/enhanced-forecast/machine', selectedMachine],
    queryFn: () => fetch(`/api/enhanced-forecast/machine/${selectedMachine}`).then(res => res.json()),
    enabled: !!selectedMachine
  });

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.8) return 'Hoch';
    if (confidence >= 0.6) return 'Mittel';
    return 'Niedrig';
  };

  const formatAdjustment = (value: number) => {
    if (value === 0) return null;
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Prognosen werden geladen...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Fehler beim Laden der Prognosedaten. Bitte versuchen Sie es erneut.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const summary = dashboardData?.data?.summary;
  const forecasts = dashboardData?.data?.forecasts || [];

  // Group forecasts by machine for better overview
  const forecastsByMachine = forecasts.reduce((acc, forecast) => {
    const key = `${forecast.machineId}-${forecast.productName}`;
    if (!acc[key]) {
      acc[key] = {
        machineId: forecast.machineId,
        machineName: forecast.machineName,
        locationName: forecast.locationName,
        productName: forecast.productName,
        forecasts: []
      };
    }
    acc[key].forecasts.push(forecast);
    return acc;
  }, {} as Record<string, any>);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Erweiterte Prognosen</h1>
          <p className="text-muted-foreground">
            KI-gestützte Verkaufsprognosen mit transparenten Erklärungen
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Überwachte Automaten</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalMachines || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Durchschnittliche Genauigkeit</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? Math.round(summary.averageConfidence * 100) : 0}%
            </div>
            <div className="flex items-center mt-2">
              <Progress 
                value={summary ? summary.averageConfidence * 100 : 0} 
                className="flex-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hochnachfrage-Tage</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.highDemandDays || 0}</div>
            <p className="text-xs text-muted-foreground">
              Nächste 7 Tage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnungen</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.warnings?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Aktive Warnmeldungen
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warnings Section */}
      {summary?.warnings && summary.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              {summary.warnings.map((warning, index) => (
                <div key={index}>• {warning}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value="overview" onValueChange={() => {}} defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="detailed">Detaillierte Prognosen</TabsTrigger>
          <TabsTrigger value="explanations">Prognoseerklärungen</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4">
            {Object.values(forecastsByMachine).map((machineGroup: any) => {
              const avgConfidence = machineGroup.forecasts.reduce((sum: number, f: any) => 
                sum + f.confidence, 0) / machineGroup.forecasts.length;
              const totalDemand = machineGroup.forecasts.reduce((sum: number, f: any) => 
                sum + f.finalForecast, 0);

              return (
                <Card key={`${machineGroup.machineId}-${machineGroup.productName}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          {machineGroup.machineName} - {machineGroup.productName}
                        </CardTitle>
                        <CardDescription>{machineGroup.locationName}</CardDescription>
                      </div>
                      <Badge 
                        className={`${getConfidenceColor(avgConfidence)} text-white`}
                      >
                        {getConfidenceText(avgConfidence)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <div className="text-2xl font-bold">{Math.round(totalDemand)}</div>
                        <div className="text-sm text-muted-foreground">
                          Prognostizierte Verkäufe (7 Tage)
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedMachine(machineGroup.machineId)}
                      >
                        Details ansehen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-4">
          {forecasts.length > 0 ? (
            <div className="grid gap-4">
              {forecasts.slice(0, 20).map((forecast, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">
                          {format(new Date(forecast.date), 'dd.MM.yyyy', { locale: de })} - 
                          {forecast.machineName}
                        </CardTitle>
                        <CardDescription>
                          {forecast.locationName} • {forecast.productName}
                        </CardDescription>
                      </div>
                      <Badge 
                        className={`${getConfidenceColor(forecast.confidence)} text-white`}
                      >
                        {Math.round(forecast.confidence * 100)}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-lg font-semibold">{Math.round(forecast.finalForecast)}</div>
                        <div className="text-sm text-muted-foreground">Prognose</div>
                      </div>
                      <div>
                        <div className="text-lg">{forecast.baselineDemand.toFixed(1)}</div>
                        <div className="text-sm text-muted-foreground">Basis</div>
                      </div>
                      <div>
                        <div className="text-lg text-blue-600">
                          {formatAdjustment(forecast.weatherAdjustment) || '—'}
                        </div>
                        <div className="text-sm text-muted-foreground">Wetter</div>
                      </div>
                      <div>
                        <div className="text-lg text-purple-600">
                          {formatAdjustment(forecast.holidayAdjustment) || '—'}
                        </div>
                        <div className="text-sm text-muted-foreground">Feiertag</div>
                      </div>
                    </div>

                    {forecast.factors.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {forecast.factors.map((factor, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {factor}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  Keine detaillierten Prognosen verfügbar
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="explanations" className="space-y-4">
          {forecasts.length > 0 ? (
            <div className="space-y-4">
              {forecasts.slice(0, 10).map((forecast, index) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Prognoseerklärung für {format(new Date(forecast.date), 'dd.MM.yyyy', { locale: de })}
                    </CardTitle>
                    <CardDescription>
                      {forecast.machineName} ({forecast.locationName}) - {forecast.productName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm leading-relaxed">{forecast.explanation}</p>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Basisnachfrage
                          </h4>
                          <div className="text-2xl font-bold">{forecast.baselineDemand.toFixed(1)}</div>
                          <div className="text-sm text-muted-foreground">
                            Durchschnittlicher Verkauf basierend auf historischen Daten
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <CloudRain className="h-4 w-4" />
                            Wettereinfluss
                          </h4>
                          <div className="text-2xl font-bold text-blue-600">
                            {formatAdjustment(forecast.weatherAdjustment) || '0'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Anpassung basierend auf Wetterbedingungen
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Feiertagseffekt
                          </h4>
                          <div className="text-2xl font-bold text-purple-600">
                            {formatAdjustment(forecast.holidayAdjustment) || '0'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Anpassung für Feiertage und Ferienzeiten
                          </div>
                        </div>
                      </div>

                      {forecast.stockoutCompensation > 0 && (
                        <>
                          <Separator />
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>Ausverkauf-Kompensation:</strong> +{forecast.stockoutCompensation.toFixed(1)} Stück
                              <br />
                              Empfohlene Erhöhung aufgrund häufiger Ausverkaufssituationen
                            </AlertDescription>
                          </Alert>
                        </>
                      )}

                      <div className="pt-4 border-t">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="text-lg font-semibold">Finale Prognose</div>
                            <div className="text-3xl font-bold text-green-600">
                              {Math.round(forecast.finalForecast)} Stück
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Genauigkeit</div>
                            <div className={`text-lg font-bold ${getConfidenceColor(forecast.confidence)} text-white px-3 py-1 rounded`}>
                              {Math.round(forecast.confidence * 100)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  Keine Prognoseerklärungen verfügbar
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}