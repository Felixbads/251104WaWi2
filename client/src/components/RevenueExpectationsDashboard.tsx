import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Calendar, Euro, Package, Target } from 'lucide-react';
import { format, isWeekend, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface RevenueExpectation {
  forecast_date: string;
  expected_revenue: string;
  expected_units: number;
  avg_confidence: string;
  product_count: string;
  is_holiday: boolean;
  holiday_name: string | null;
}

export function RevenueExpectationsDashboard() {
  const { data: revenueData, isLoading, error } = useQuery<RevenueExpectation[]>({
    queryKey: ['/api/forecast/revenue-expectations'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-0 pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="h-64 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !revenueData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Fehler beim Laden der Umsatzerwartungen</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Die Umsatzprognosen konnten nicht geladen werden.</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate summary statistics - with safe division by zero protection
  const totalRevenue = revenueData.reduce((sum, day) => sum + parseFloat(day.expected_revenue), 0);
  const totalUnits = revenueData.reduce((sum, day) => sum + day.expected_units, 0);
  const avgDailyRevenue = revenueData.length > 0 ? totalRevenue / revenueData.length : 0;
  const avgConfidence = revenueData.length > 0 
    ? revenueData.reduce((sum, day) => sum + parseFloat(day.avg_confidence), 0) / revenueData.length 
    : 0;

  // Find peak days - with safe fallback for empty arrays
  const peakRevenueDay = revenueData.length > 0 
    ? revenueData.reduce((max, day) => 
        parseFloat(day.expected_revenue) > parseFloat(max.expected_revenue) ? day : max
      )
    : { expected_revenue: "0", forecast_date: new Date().toISOString().split('T')[0] };
  
  const weekendDays = revenueData.filter(day => isWeekend(parseISO(day.forecast_date)));
  const weekdays = revenueData.filter(day => !isWeekend(parseISO(day.forecast_date)));
  
  const avgWeekendRevenue = weekendDays.length > 0 
    ? weekendDays.reduce((sum, day) => sum + parseFloat(day.expected_revenue), 0) / weekendDays.length 
    : 0;
  const avgWeekdayRevenue = weekdays.length > 0
    ? weekdays.reduce((sum, day) => sum + parseFloat(day.expected_revenue), 0) / weekdays.length
    : 0;

  // Prepare chart data
  const chartData = revenueData.map(day => ({
    date: format(parseISO(day.forecast_date), 'dd.MM', { locale: de }),
    fullDate: day.forecast_date,
    revenue: parseFloat(day.expected_revenue),
    units: day.expected_units,
    confidence: parseFloat(day.avg_confidence) * 100,
    isWeekend: isWeekend(parseISO(day.forecast_date)),
    isHoliday: day.is_holiday,
    holidayName: day.holiday_name,
    dayName: format(parseISO(day.forecast_date), 'EEEE', { locale: de })
  }));

  const formatCurrency = (value: number) => `€${value.toFixed(2)}`;
  const formatConfidence = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">14-Tage Umsatzerwartung</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              Ø {formatCurrency(avgDailyRevenue)} pro Tag
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verkaufsmengen</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalUnits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Ø {Math.round(totalUnits / revenueData.length)} Stück pro Tag
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prognosegenauigkeit</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{formatConfidence(avgConfidence)}</div>
            <p className="text-xs text-muted-foreground">
              Durchschnittliche Verlässlichkeit
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spitzentag</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(parseFloat(peakRevenueDay.expected_revenue))}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(peakRevenueDay.forecast_date), 'dd.MM.yyyy', { locale: de })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Tägliche Umsatzprognosen für die nächsten 14 Tage</CardTitle>
          <CardDescription>
            Erwartete Umsätze basierend auf KI-Prognosemodellen mit Wetter- und Feiertagsberücksichtigung
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tickFormatter={(value) => `€${value}`}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  name === 'revenue' ? formatCurrency(value) : value,
                  name === 'revenue' ? 'Umsatzerwartung' : 'Verkaufsmenge'
                ]}
                labelFormatter={(label: string, payload: any) => {
                  if (payload && payload[0]) {
                    const data = payload[0].payload;
                    return `${data.dayName}, ${format(parseISO(data.fullDate), 'dd.MM.yyyy', { locale: de })}`;
                  }
                  return label;
                }}
                contentStyle={{ backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#10b981" 
                strokeWidth={3}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Units and Confidence Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Verkaufsmengen Prognose</CardTitle>
            <CardDescription>Erwartete Stückzahlen pro Tag</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip 
                  formatter={(value: number) => [value, 'Stück']}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      const data = payload[0].payload;
                      return `${data.dayName}, ${format(parseISO(data.fullDate), 'dd.MM.yyyy', { locale: de })}`;
                    }
                    return label;
                  }}
                />
                <Bar 
                  dataKey="units" 
                  fill="#3b82f6"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wochenend- vs. Werktag-Vergleich</CardTitle>
            <CardDescription>Durchschnittliche Umsätze nach Tagestyp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-900">Werktage</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-600">
                    {formatCurrency(avgWeekdayRevenue)}
                  </div>
                  <div className="text-xs text-blue-500">Ø pro Tag</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-orange-600" />
                  <span className="font-medium text-orange-900">Wochenende</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-orange-600">
                    {formatCurrency(avgWeekendRevenue)}
                  </div>
                  <div className="text-xs text-orange-500">Ø pro Tag</div>
                </div>
              </div>

              {avgWeekendRevenue > avgWeekdayRevenue ? (
                <div className="flex items-center space-x-2 text-green-600 bg-green-50 p-2 rounded">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Wochenenden sind {formatCurrency(avgWeekendRevenue - avgWeekdayRevenue)} stärker
                  </span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-blue-600 bg-blue-50 p-2 rounded">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Werktage sind {formatCurrency(avgWeekdayRevenue - avgWeekendRevenue)} stärker
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detaillierte Tagesaufschlüsselung</CardTitle>
          <CardDescription>
            Vollständige 14-Tage Umsatzprognose mit allen Details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-4 py-2 text-left">Datum</th>
                  <th className="border border-gray-200 px-4 py-2 text-left">Tag</th>
                  <th className="border border-gray-200 px-4 py-2 text-right">Umsatz</th>
                  <th className="border border-gray-200 px-4 py-2 text-right">Stück</th>
                  <th className="border border-gray-200 px-4 py-2 text-right">Ø Preis</th>
                  <th className="border border-gray-200 px-4 py-2 text-center">Vertrauen</th>
                  <th className="border border-gray-200 px-4 py-2 text-center">Besonderheiten</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((day, index) => (
                  <tr key={index} className={day.isWeekend ? "bg-blue-25" : ""}>
                    <td className="border border-gray-200 px-4 py-2">
                      {format(parseISO(day.fullDate), 'dd.MM.yyyy', { locale: de })}
                    </td>
                    <td className="border border-gray-200 px-4 py-2 font-medium">
                      {day.dayName}
                    </td>
                    <td className="border border-gray-200 px-4 py-2 text-right font-bold text-green-600">
                      {formatCurrency(day.revenue)}
                    </td>
                    <td className="border border-gray-200 px-4 py-2 text-right">
                      {day.units.toLocaleString()}
                    </td>
                    <td className="border border-gray-200 px-4 py-2 text-right">
                      {formatCurrency(day.revenue / day.units)}
                    </td>
                    <td className="border border-gray-200 px-4 py-2 text-center">
                      <Badge variant={day.confidence >= 80 ? "default" : day.confidence >= 70 ? "secondary" : "destructive"}>
                        {day.confidence.toFixed(0)}%
                      </Badge>
                    </td>
                    <td className="border border-gray-200 px-4 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        {day.isWeekend && (
                          <Badge variant="outline" className="text-xs">WE</Badge>
                        )}
                        {day.isHoliday && (
                          <Badge variant="destructive" className="text-xs" title={day.holidayName || 'Feiertag'}>
                            🎉
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}