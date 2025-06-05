import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { 
  Database, 
  Calendar, 
  TrendingUp, 
  AlertCircle,
  RefreshCw,
  Activity
} from "lucide-react";

interface DataCoverageType {
  data_type: string;
  earliest_date: string | null;
  latest_date: string | null;
  data_points: number;
  data_quality: number | null;
  coverage_percentage: number | null;
}

interface MonthlyTransactionData {
  month: string;
  monthDate: string;
  transactionCount: string | number;
}

export default function DataAvailability() {
  const [retryAttempt, setRetryAttempt] = useState(0);

  // Datencoverage Query
  const { 
    data: dataCoverage, 
    isLoading: isLoadingCoverage, 
    isError: isErrorCoverage, 
    error: errorCoverage,
    refetch: refetchCoverage 
  } = useQuery({
    queryKey: ["/api/data-coverage", retryAttempt],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("Authentifizierung erforderlich");
      }

      const response = await fetch("/api/data-coverage", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Authentifizierung fehlgeschlagen");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<DataCoverageType[]>;
    },
    retry: 1,
    retryDelay: 1000,
  });

  // Monatliche Transaktionsdaten Query
  const { 
    data: monthlyData, 
    isLoading: isLoadingMonthly,
    isError: isErrorMonthly,
    error: errorMonthly,
    refetch: refetchMonthly 
  } = useQuery({
    queryKey: ["/api/data-coverage/monthly-transactions", retryAttempt],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("Authentifizierung erforderlich");
      }

      const startDate = new Date(2021, 11, 31); // 2021-12-31
      const endDate = new Date();

      const response = await fetch(`/api/data-coverage/monthly-transactions?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Authentifizierung fehlgeschlagen");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<MonthlyTransactionData[]>;
    },
    retry: 1,
    retryDelay: 1000,
  });

  const handleRetry = () => {
    setRetryAttempt(prev => prev + 1);
  };

  // Loading State
  if (isLoadingCoverage || isLoadingMonthly) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <Database className="h-8 w-8" />
          <h1 className="text-3xl font-bold">Datenverfügbarkeit</h1>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error State
  if (isErrorCoverage || isErrorMonthly) {
    const errorMessage = (errorCoverage as Error)?.message || (errorMonthly as Error)?.message || "Unbekannter Fehler";
    
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <Database className="h-8 w-8" />
          <h1 className="text-3xl font-bold">Datenverfügbarkeit</h1>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p><strong>Fehler beim Laden der Benutzerdaten</strong></p>
              <p>Es ist ein Fehler beim Abrufen der Benutzer aufgetreten. Bitte versuchen Sie es später erneut.</p>
              <p className="text-sm text-muted-foreground">Fehlerdetails: {errorMessage}</p>
              <Button onClick={handleRetry} variant="outline" size="sm" className="mt-2">
                <RefreshCw className="h-4 w-4 mr-2" />
                Erneut versuchen
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Datenverarbeitung
  const transactionData = dataCoverage?.find(d => d.data_type === "transaction");
  const weatherData = dataCoverage?.find(d => d.data_type === "weather");
  const holidayData = dataCoverage?.find(d => d.data_type === "holiday");

  // Monatliche Daten für Chart verarbeiten
  const chartData = monthlyData?.map(item => ({
    month: item.month,
    transactions: typeof item.transactionCount === 'string' ? parseInt(item.transactionCount) || 0 : item.transactionCount || 0,
    monthLabel: new Date(item.monthDate).toLocaleDateString('de-DE', { 
      year: 'numeric', 
      month: 'short' 
    })
  })).filter(item => item.transactions > 0) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Database className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Datenverfügbarkeit</h1>
      </div>

      {/* Übersichtskarten */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Transaktionsdaten */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaktionsdaten</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {transactionData?.data_points?.toLocaleString('de-DE') || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {transactionData?.earliest_date && transactionData?.latest_date ? (
                <>
                  {new Date(transactionData.earliest_date).toLocaleDateString('de-DE')} - {' '}
                  {new Date(transactionData.latest_date).toLocaleDateString('de-DE')}
                </>
              ) : (
                'Keine Daten verfügbar'
              )}
            </p>
            {transactionData?.coverage_percentage && (
              <div className="mt-2">
                <Progress value={transactionData.coverage_percentage} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {transactionData.coverage_percentage.toFixed(1)}% Abdeckung
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wetterdaten */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wetterdaten</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {weatherData?.data_points?.toLocaleString('de-DE') || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {weatherData?.earliest_date && weatherData?.latest_date ? (
                <>
                  {new Date(weatherData.earliest_date).toLocaleDateString('de-DE')} - {' '}
                  {new Date(weatherData.latest_date).toLocaleDateString('de-DE')}
                </>
              ) : (
                'Keine Daten verfügbar'
              )}
            </p>
            {weatherData?.coverage_percentage && (
              <div className="mt-2">
                <Progress value={weatherData.coverage_percentage} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {weatherData.coverage_percentage.toFixed(1)}% Abdeckung
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feiertagsdaten */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Feiertagsdaten</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {holidayData?.data_points?.toLocaleString('de-DE') || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {holidayData?.earliest_date && holidayData?.latest_date ? (
                <>
                  {new Date(holidayData.earliest_date).toLocaleDateString('de-DE')} - {' '}
                  {new Date(holidayData.latest_date).toLocaleDateString('de-DE')}
                </>
              ) : (
                'Keine Daten verfügbar'
              )}
            </p>
            {holidayData?.coverage_percentage && (
              <div className="mt-2">
                <Progress value={holidayData.coverage_percentage} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {holidayData.coverage_percentage.toFixed(1)}% Abdeckung
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monatlicher Transaktionsverlauf */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monatlicher Transaktionsverlauf</CardTitle>
            <CardDescription>
              Anzahl der Transaktionen pro Monat über den verfügbaren Zeitraum
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="monthLabel" 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value) => [value?.toLocaleString('de-DE'), 'Transaktionen']}
                    labelFormatter={(label) => `Monat: ${label}`}
                  />
                  <Bar 
                    dataKey="transactions" 
                    fill="#8884d8" 
                    name="Transaktionen"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Zusammenfassung */}
      <Card>
        <CardHeader>
          <CardTitle>Datenverfügbarkeit Zusammenfassung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-semibold mb-2">Verfügbare Datentypen:</h4>
              <ul className="space-y-1 text-sm">
                <li>✓ Transaktionsdaten ({transactionData?.data_points || 0} Einträge)</li>
                <li>✓ Wetterdaten ({weatherData?.data_points || 0} Einträge)</li>
                <li>✓ Feiertagsdaten ({holidayData?.data_points || 0} Einträge)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Zeitabdeckung:</h4>
              <div className="space-y-1 text-sm">
                {transactionData?.earliest_date && transactionData?.latest_date && (
                  <p>
                    Transaktionen: {new Date(transactionData.earliest_date).toLocaleDateString('de-DE')} bis{' '}
                    {new Date(transactionData.latest_date).toLocaleDateString('de-DE')}
                  </p>
                )}
                <p>Gesamtmonate mit Daten: {chartData.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}