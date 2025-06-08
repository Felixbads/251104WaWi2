import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ComposedChart, Area, AreaChart } from 'recharts';
import { CalendarDays, Thermometer, Sun, CloudRain } from 'lucide-react';

interface WeatherData {
  date: string;
  hour: number;
  temp: number;
  temp_min: number | null;
  temp_max: number | null;
  precipitation: number | null;
  sunshine?: number;
  humidity: string | number;
  pressure: string | number;
  source: string;
}

interface DailyWeatherData {
  date: string;
  record_count: string;
  avg_temp: string;
  min_temp: string;
  max_temp: string;
  total_precipitation: string | null;
  avg_humidity: string | null;
  avg_pressure: string | null;
}

export default function WeatherVisualization() {
  const { data: dailyStats, isLoading } = useQuery<DailyWeatherData[]>({
    queryKey: ['/api/weather/daily-aggregated'],
  });

  // Use the pre-aggregated daily data directly
  const processedData = dailyStats ? 
    dailyStats.map(record => ({
      date: record.date,
      avgTemp: parseFloat(record.avg_temp),
      minTemp: parseFloat(record.min_temp),
      maxTemp: parseFloat(record.max_temp),
      totalPrecipitation: parseFloat(record.total_precipitation || '0'),
      avgHumidity: record.avg_humidity ? parseFloat(record.avg_humidity) : 0,
      avgPressure: record.avg_pressure ? parseFloat(record.avg_pressure) : 0,
      sunshineHours: 0, // Will be calculated from actual data
      recordCount: parseInt(record.record_count)
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  : [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit',
      year: dateStr.includes('2025') ? '2-digit' : undefined
    });
  };

  const formatTooltipDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      weekday: 'short',
      day: '2-digit', 
      month: 'short',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <CalendarDays className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Bad Schandau Wetterdaten</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalDays = processedData.length;
  const totalRecords = processedData.reduce((sum, day) => sum + day.recordCount, 0);
  const avgTemp = totalDays > 0 ? +(processedData.reduce((sum, day) => sum + day.avgTemp, 0) / totalDays).toFixed(1) : 0;
  const totalPrecipitation = +processedData.reduce((sum, day) => sum + day.totalPrecipitation, 0).toFixed(1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <CalendarDays className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Bad Schandau Wetterdaten</h1>
        <span className="text-sm text-muted-foreground ml-auto">
          Wetterstation Sächsische Schweiz
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Tage erfasst</p>
                <p className="text-2xl font-bold">{totalDays}</p>
                <p className="text-xs text-muted-foreground">{totalRecords} Stundenwerte</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Thermometer className="h-4 w-4 text-blue-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Ø Temperatur</p>
                <p className="text-2xl font-bold">{avgTemp}°C</p>
                <p className="text-xs text-muted-foreground">Authentische Daten</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <CloudRain className="h-4 w-4 text-blue-500" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Niederschlag</p>
                <p className="text-2xl font-bold">{totalPrecipitation}mm</p>
                <p className="text-xs text-muted-foreground">Gesamt gemessen</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Sun className="h-4 w-4 text-yellow-500" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Datenzeitraum</p>
                <p className="text-2xl font-bold">2022-2025</p>
                <p className="text-xs text-muted-foreground">Mehrjährig</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Temperature Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-blue-600" />
            Temperaturverlauf Bad Schandau
          </CardTitle>
          <CardDescription>
            Tagesdurchschnitt, Minimum und Maximum über den gesamten Zeitraum
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                interval="preserveStartEnd"
              />
              <YAxis 
                label={{ value: 'Temperatur (°C)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                labelFormatter={formatTooltipDate}
                formatter={(value: number, name: string) => [
                  `${value}°C`,
                  name === 'avgTemp' ? 'Durchschnitt' :
                  name === 'minTemp' ? 'Minimum' :
                  name === 'maxTemp' ? 'Maximum' : name
                ]}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="maxTemp"
                stackId="1"
                stroke="#ef4444"
                fill="#fecaca"
                name="Maximum"
              />
              <Area
                type="monotone"
                dataKey="minTemp"
                stackId="1"
                stroke="#3b82f6"
                fill="#bfdbfe"
                name="Minimum"
              />
              <Line
                type="monotone"
                dataKey="avgTemp"
                stroke="#059669"
                strokeWidth={2}
                name="Durchschnitt"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Precipitation Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudRain className="h-5 w-5 text-blue-500" />
            Niederschlagsmenge Bad Schandau
          </CardTitle>
          <CardDescription>
            Tägliche Niederschlagssumme in Millimetern
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                interval="preserveStartEnd"
              />
              <YAxis 
                label={{ value: 'Niederschlag (mm)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                labelFormatter={formatTooltipDate}
                formatter={(value: number) => [`${value}mm`, 'Niederschlag']}
              />
              <Bar 
                dataKey="totalPrecipitation" 
                fill="#3b82f6" 
                name="Niederschlag"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Humidity and Pressure Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Luftfeuchtigkeit und Luftdruck</CardTitle>
          <CardDescription>
            Zusätzliche Wetterkennwerte für Bad Schandau
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                interval="preserveStartEnd"
              />
              <YAxis 
                yAxisId="humidity"
                orientation="left"
                label={{ value: 'Luftfeuchtigkeit (%)', angle: -90, position: 'insideLeft' }}
              />
              <YAxis 
                yAxisId="pressure"
                orientation="right"
                label={{ value: 'Luftdruck (hPa)', angle: 90, position: 'insideRight' }}
              />
              <Tooltip 
                labelFormatter={formatTooltipDate}
                formatter={(value: number, name: string) => [
                  name === 'avgHumidity' ? `${value}%` : `${value}hPa`,
                  name === 'avgHumidity' ? 'Luftfeuchtigkeit' : 'Luftdruck'
                ]}
              />
              <Legend />
              <Line
                yAxisId="humidity"
                type="monotone"
                dataKey="avgHumidity"
                stroke="#06b6d4"
                strokeWidth={2}
                name="Luftfeuchtigkeit"
                dot={false}
              />
              <Line
                yAxisId="pressure"
                type="monotone"
                dataKey="avgPressure"
                stroke="#8b5cf6"
                strokeWidth={2}
                name="Luftdruck"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Data Sources Info */}
      <Card>
        <CardHeader>
          <CardTitle>Datenquellen Bad Schandau</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Authentische Datenquellen:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• OpenWeather API - Wetterstation Bad Schandau</li>
                <li>• Excel-Import meteorologischer Daten</li>
                <li>• Stündliche Messungen seit 2022</li>
                <li>• Temperatur, Niederschlag, Luftdruck, Humidity</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Datenqualität:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• {totalRecords} authentische Messwerte</li>
                <li>• {totalDays} Tage abgedeckt</li>
                <li>• Mehrjährige Zeitreihe 2022-2025</li>
                <li>• Für Verkaufsanalyse optimiert</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}