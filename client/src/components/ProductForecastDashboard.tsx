import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Package, Calendar, BarChart3 } from 'lucide-react';

interface ProductForecast {
  id: number;
  name: string;
  model_type: string;
  accuracy: number;
  status: string;
  forecast_count: number;
  total_predicted_sales: number;
  avg_confidence: number;
  created_at: string;
}

interface WeeklyForecast {
  product_name: string;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
  total_4weeks: number;
  confidence: number;
}

export default function ProductForecastDashboard() {
  const { data: models, isLoading: modelsLoading } = useQuery({
    queryKey: ['/api/forecast/models'],
    refetchInterval: 30000, // Update every 30 seconds
  });

  const { data: weeklyForecasts, isLoading: forecastsLoading } = useQuery({
    queryKey: ['/api/forecast/weekly-summary'],
    refetchInterval: 30000,
  });

  if (modelsLoading || forecastsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const productModels = models?.filter((model: ProductForecast) => 
    model.model_type === 'weekly_prophet' || model.model_type === 'prophet_product'
  ) || [];

  const totalPredictedSales = productModels.reduce((sum: number, model: ProductForecast) => 
    sum + (model.total_predicted_sales || 0), 0
  );

  const avgAccuracy = productModels.length > 0 
    ? productModels.reduce((sum: number, model: ProductForecast) => sum + (model.accuracy || 0), 0) / productModels.length 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produktmodelle</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productModels.length}</div>
            <p className="text-xs text-muted-foreground">
              Aktive Prognosemodelle
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">4-Wochen-Prognose</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(totalPredictedSales)}</div>
            <p className="text-xs text-muted-foreground">
              Prognostizierte Verkäufe
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Durchschn. Genauigkeit</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(avgAccuracy * 100).toFixed(1)}%</div>
            <Progress value={avgAccuracy * 100} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prognose-Zeitraum</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
            <p className="text-xs text-muted-foreground">
              Wochen voraus
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Products Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {productModels.slice(0, 12).map((model: ProductForecast) => {
          const productName = model.name.replace('Wochenprognose: ', '').replace('Produktprognose: ', '');
          const accuracy = (model.accuracy || 0) * 100;
          
          return (
            <Card key={model.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-medium leading-tight">
                    {productName.length > 40 ? `${productName.substring(0, 40)}...` : productName}
                  </CardTitle>
                  <Badge variant={model.status === 'ready' ? 'default' : 'secondary'}>
                    {model.status}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {model.forecast_count || 0} Tagesprognosen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">4-Wochen Total:</span>
                  <span className="font-semibold">{Math.round(model.total_predicted_sales || 0)} Verkäufe</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Genauigkeit:</span>
                  <span className="font-semibold">{accuracy.toFixed(1)}%</span>
                </div>
                
                <Progress value={accuracy} className="h-2" />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Konfidenz:</span>
                  <span className="font-semibold">{((model.avg_confidence || 0) * 100).toFixed(0)}%</span>
                </div>

                <div className="text-xs text-muted-foreground">
                  Erstellt: {new Date(model.created_at).toLocaleDateString('de-DE')}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Weekly Breakdown */}
      {weeklyForecasts && weeklyForecasts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wochenweise Aufschlüsselung</CardTitle>
            <CardDescription>
              Prognostizierte Verkäufe für die nächsten 4 Wochen nach Produkten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Produkt</th>
                    <th className="text-right py-2 px-2">Woche 1</th>
                    <th className="text-right py-2 px-2">Woche 2</th>
                    <th className="text-right py-2 px-2">Woche 3</th>
                    <th className="text-right py-2 px-2">Woche 4</th>
                    <th className="text-right py-2 pl-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyForecasts.slice(0, 10).map((forecast: WeeklyForecast, index: number) => (
                    <tr key={index} className="border-b border-gray-50">
                      <td className="py-2 pr-4 font-medium">
                        {forecast.product_name.length > 30 
                          ? `${forecast.product_name.substring(0, 30)}...` 
                          : forecast.product_name}
                      </td>
                      <td className="text-right py-2 px-2">{forecast.week1}</td>
                      <td className="text-right py-2 px-2">{forecast.week2}</td>
                      <td className="text-right py-2 px-2">{forecast.week3}</td>
                      <td className="text-right py-2 px-2">{forecast.week4}</td>
                      <td className="text-right py-2 pl-4 font-semibold">{forecast.total_4weeks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}