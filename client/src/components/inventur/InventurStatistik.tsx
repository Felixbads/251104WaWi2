import { useQuery } from '@tanstack/react-query';
import { Info, ArrowUpDown, TrendingUp, TrendingDown, Equal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function InventurStatistik() {
  // Lade verfügbare Inventurzahlen der letzten 6 Monate
  const { data: countData = [], isLoading: isLoadingCounts } = useQuery({
    queryKey: ['/api/inventory-counts/statistics/monthly'],
    staleTime: 30 * 60 * 1000, // 30 Minuten Cache
  });

  // Lade Bestandsänderungen nach Inventuren
  const { data: adjustmentData = [], isLoading: isLoadingAdjustments } = useQuery({
    queryKey: ['/api/inventory-counts/statistics/adjustments'],
    staleTime: 30 * 60 * 1000, // 30 Minuten Cache
  });

  // Berechne Gesamtstatistiken
  const totalCounts = countData.reduce((sum: number, month: any) => sum + month.count, 0);
  const totalPositions = countData.reduce((sum: number, month: any) => sum + month.positions, 0);
  
  // Berechne Durchschnitte der Inventuren
  const avgPositionsPerCount = totalCounts > 0 ? Math.round(totalPositions / totalCounts) : 0;
  
  // Berechne Anpassungsstatistiken
  const totalAdjustments = adjustmentData.reduce((sum: number, item: any) => sum + Math.abs(item.adjustment), 0);
  const totalPositiveAdjustments = adjustmentData.reduce((sum: number, item: any) => sum + (item.adjustment > 0 ? item.adjustment : 0), 0);
  const totalNegativeAdjustments = adjustmentData.reduce((sum: number, item: any) => sum + (item.adjustment < 0 ? Math.abs(item.adjustment) : 0), 0);
  
  // Berechne Prozent der Anpassungen
  const positiveAdjustmentPercent = totalAdjustments > 0 ? Math.round((totalPositiveAdjustments / totalAdjustments) * 100) : 0;
  const negativeAdjustmentPercent = totalAdjustments > 0 ? Math.round((totalNegativeAdjustments / totalAdjustments) * 100) : 0;
  
  // Bereite Daten für Charts vor
  const monthlyChartData = countData.map((month: any) => ({
    name: month.month,
    Inventuren: month.count,
    Positionen: month.positions,
  }));
  
  // Anpassungsstatistiken pro Warengruppe
  const productGroupsData = adjustmentData.map((item: any) => ({
    name: item.productCategory || 'Sonstige',
    Anpassungen: Math.abs(item.adjustment),
    Typ: item.adjustment > 0 ? 'Zunahme' : item.adjustment < 0 ? 'Abnahme' : 'Keine Änderung'
  }));
  
  return (
    <div className="space-y-6">
      {/* Statistik-Übersichtsbereich */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Durchgeführte Inventuren</CardTitle>
              <CardDescription>Letzte 6 Monate</CardDescription>
            </div>
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingCounts ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{totalCounts}</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Erstellte Inventurpositionen</CardTitle>
              <CardDescription>Insgesamt</CardDescription>
            </div>
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingCounts ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{totalPositions}</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">
                Durchschnitt Positionen
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger className="inline-flex">
                      <Info className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Durchschnittliche Anzahl an Produktpositionen pro Inventur
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>Pro Inventur</CardDescription>
            </div>
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingCounts ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{avgPositionsPerCount}</div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Anpassungs-Statistiken */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Bestandsanpassungen</CardTitle>
            <CardDescription>
              Verhältnis zwischen positiven und negativen Anpassungen
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {isLoadingAdjustments ? (
              <div className="w-full h-[250px] flex items-center justify-center">
                <Skeleton className="h-[200px] w-[300px]" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-4 w-4 rounded-full bg-green-400 mr-2"></div>
                    <div className="text-sm font-medium">Positive Anpassungen</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <div className="text-sm font-medium">{positiveAdjustmentPercent}% ({totalPositiveAdjustments})</div>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-green-400 h-2.5 rounded-full" 
                    style={{ width: `${positiveAdjustmentPercent}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-4 w-4 rounded-full bg-red-400 mr-2"></div>
                    <div className="text-sm font-medium">Negative Anpassungen</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <div className="text-sm font-medium">{negativeAdjustmentPercent}% ({totalNegativeAdjustments})</div>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-red-400 h-2.5 rounded-full" 
                    style={{ width: `${negativeAdjustmentPercent}%` }}
                  ></div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Häufige Anpassungen können auf Probleme im Warenmanagement hindeuten
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Inventuraktivität</CardTitle>
            <CardDescription>
              Anzahl der Inventuren und Positionen über die letzten 6 Monate
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCounts ? (
              <div className="w-full h-[250px] flex items-center justify-center">
                <Skeleton className="h-[200px] w-[300px]" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthlyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Inventuren" stroke="#8884d8" activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="Positionen" stroke="#82ca9d" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Anpassungswerte pro Produktkategorie */}
      <Card>
        <CardHeader>
          <CardTitle>Anpassungswerte nach Warengruppen</CardTitle>
          <CardDescription>
            Absolute Bestandsänderungen nach Inventuren pro Warengruppe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingAdjustments ? (
            <div className="w-full h-[300px] flex items-center justify-center">
              <Skeleton className="h-[250px] w-full" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={productGroupsData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Anpassungen" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Hohe Anpassungen in bestimmten Warengruppen können auf spezifische Probleme hinweisen
        </CardFooter>
      </Card>
    </div>
  );
}