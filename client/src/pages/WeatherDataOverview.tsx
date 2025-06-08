/**
 * Weather Data Overview Page
 * 
 * Provides graphical overview of weather data across all years
 * and detailed hourly access to weather values
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { CalendarIcon, Cloud, Thermometer, Droplets, Wind, Eye, Loader2, Download, Info } from 'lucide-react';
import { format, parse } from 'date-fns';
import { de } from 'date-fns/locale';

// German federal states
const GERMAN_STATES = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' }
];

interface WeatherData {
  id: number;
  state: string;
  date: string;
  hour: number;
  temperature: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  visibility: number;
  cloudCover: number;
  precipitation: number;
  conditions: string;
}

interface YearlyStats {
  year: number;
  state: string;
  dataPoints: number;
  avgTemperature: number;
  avgHumidity: number;
  totalPrecipitation: number;
  coverage: number;
}

export default function WeatherDataOverview() {
  const [selectedState, setSelectedState] = useState('SN');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'overview' | 'hourly'>('overview');

  // Fetch yearly weather statistics
  const { data: yearlyStats, isLoading: statsLoading } = useQuery<YearlyStats[]>({
    queryKey: ['/api/weather/yearly-stats', selectedState],
    enabled: viewMode === 'overview'
  });

  // Fetch daily weather coverage
  const { data: dailyCoverage, isLoading: coverageLoading } = useQuery({
    queryKey: ['/api/weather/daily-coverage', selectedState, selectedYear],
    enabled: viewMode === 'overview'
  });

  // Fetch hourly weather data for selected date
  const { data: hourlyData, isLoading: hourlyLoading } = useQuery<WeatherData[]>({
    queryKey: ['/api/weather/hourly', selectedState, selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null],
    enabled: viewMode === 'hourly' && !!selectedDate
  });

  // Fetch weather data overview - manual refresh only
  const { data: weatherOverview, isLoading: overviewLoading } = useQuery({
    queryKey: ['/api/weather/overview'],
    enabled: true,
    staleTime: 24 * 60 * 60 * 1000 // Consider data fresh for 24 hours
  });

  const formatTemperature = (temp: number) => `${temp.toFixed(1)}°C`;
  const formatPrecipitation = (precip: number) => `${precip.toFixed(1)}mm`;
  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  const getTemperatureColor = (temp: number) => {
    if (temp < 0) return '#1e40af'; // blue
    if (temp < 10) return '#0891b2'; // cyan
    if (temp < 20) return '#059669'; // green
    if (temp < 30) return '#d97706'; // orange
    return '#dc2626'; // red
  };

  const getConditionIcon = (conditions: string) => {
    const condition = conditions?.toLowerCase() || '';
    if (condition.includes('rain') || condition.includes('shower')) return '🌧️';
    if (condition.includes('snow')) return '❄️';
    if (condition.includes('cloud')) return '☁️';
    if (condition.includes('clear') || condition.includes('sunny')) return '☀️';
    if (condition.includes('fog') || condition.includes('mist')) return '🌫️';
    return '🌤️';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Wetterdaten Übersicht</h1>
          <p className="text-gray-600 mt-2">
            Grafische Darstellung und stündliche Zugriffe auf Wetterdaten aller Bundesländer
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={viewMode} onValueChange={(value: 'overview' | 'hourly') => setViewMode(value)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview">Jahresübersicht</SelectItem>
              <SelectItem value="hourly">Stündliche Daten</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedState} onValueChange={setSelectedState}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GERMAN_STATES.map(state => (
                <SelectItem key={state.code} value={state.code}>
                  {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Mode */}
      {viewMode === 'overview' && (
        <div className="space-y-6">
          {/* Weather Coverage Stats */}
          {weatherOverview && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Cloud className="h-8 w-8 text-blue-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Gesamt Datenpunkte</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {weatherOverview.overview?.total_data_points ? parseInt(weatherOverview.overview.total_data_points).toLocaleString('de-DE') : '0'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Thermometer className="h-8 w-8 text-red-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Durchschnittstemperatur</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {weatherOverview.overview?.overall_avg_temp ? formatTemperature(parseFloat(weatherOverview.overview.overall_avg_temp)) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Droplets className="h-8 w-8 text-green-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Niederschlag gesamt</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {weatherOverview.overview?.total_precipitation ? formatPrecipitation(parseFloat(weatherOverview.overview.total_precipitation)) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Wind className="h-8 w-8 text-purple-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Abgedeckte Jahre</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {weatherOverview.yearsCovered || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Yearly Temperature Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="h-5 w-5" />
                Jahrestemperaturen - {GERMAN_STATES.find(s => s.code === selectedState)?.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : yearlyStats && yearlyStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={yearlyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [formatTemperature(value), 'Durchschnittstemperatur']} />
                    <Line 
                      type="monotone" 
                      dataKey="avgTemperature" 
                      stroke="#dc2626" 
                      strokeWidth={2}
                      dot={{ fill: '#dc2626' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Keine Temperaturdaten für {GERMAN_STATES.find(s => s.code === selectedState)?.name} verfügbar
                </div>
              )}
            </CardContent>
          </Card>

          {/* Precipitation Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5" />
                Jährlicher Niederschlag - {GERMAN_STATES.find(s => s.code === selectedState)?.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : yearlyStats && yearlyStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={yearlyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [formatPrecipitation(value), 'Niederschlag']} />
                    <Bar dataKey="totalPrecipitation" fill="#0891b2" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Keine Niederschlagsdaten verfügbar
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Coverage Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Datenabdeckung {selectedYear} - {GERMAN_STATES.find(s => s.code === selectedState)?.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4 mb-4">
                <Label>Jahr:</Label>
                <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {coverageLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : dailyCoverage ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-12 gap-1">
                    {Array.from({ length: 12 }, (_, monthIndex) => (
                      <div key={monthIndex} className="text-center">
                        <p className="text-xs font-medium mb-2">
                          {format(new Date(2024, monthIndex), 'MMM', { locale: de })}
                        </p>
                        <div className="grid gap-1">
                          {Array.from({ length: new Date(selectedYear, monthIndex + 1, 0).getDate() }, (_, dayIndex) => {
                            const dayData = dailyCoverage.find((d: any) => {
                              const date = new Date(d.date);
                              return date.getMonth() === monthIndex && date.getDate() === dayIndex + 1;
                            });
                            const coverage = dayData ? dayData.coverage : 0;
                            
                            return (
                              <div
                                key={dayIndex}
                                className="w-3 h-3 rounded-sm"
                                style={{
                                  backgroundColor: coverage > 0.8 ? '#22c55e' : 
                                                 coverage > 0.5 ? '#eab308' : 
                                                 coverage > 0 ? '#f97316' : '#e5e7eb'
                                }}
                                title={`${dayIndex + 1}. ${format(new Date(2024, monthIndex), 'MMMM', { locale: de })} - ${formatPercentage(coverage * 100)} Abdeckung`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm">
                    <span>Abdeckung:</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-gray-200 rounded-sm"></div>
                      <span>0%</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                      <span>1-50%</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
                      <span>51-80%</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                      <span>81-100%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Keine Abdeckungsdaten für {selectedYear} verfügbar
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hourly Mode */}
      {viewMode === 'hourly' && (
        <div className="space-y-6">
          {/* Date Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Stündliche Wetterdaten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <Label>Datum auswählen:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'dd.MM.yyyy', { locale: de }) : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      locale={de}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                
                <Badge variant="outline">
                  {GERMAN_STATES.find(s => s.code === selectedState)?.name}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Hourly Data Display */}
          {selectedDate && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Stündliche Werte für {format(selectedDate, 'dd.MM.yyyy', { locale: de })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hourlyLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : hourlyData && hourlyData.length > 0 ? (
                  <div className="space-y-6">
                    {/* Hourly Temperature Chart */}
                    <div>
                      <h4 className="text-lg font-semibold mb-4">Temperaturverlauf</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={hourlyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="hour" 
                            tickFormatter={(hour) => `${hour}:00`}
                          />
                          <YAxis tickFormatter={(temp) => `${temp}°C`} />
                          <Tooltip 
                            labelFormatter={(hour) => `${hour}:00 Uhr`}
                            formatter={(value: number) => [formatTemperature(value), 'Temperatur']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="temperature" 
                            stroke="#dc2626" 
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Hourly Data Table */}
                    <div>
                      <h4 className="text-lg font-semibold mb-4">Detaillierte Stundenwerte</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zeit</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bedingungen</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Temperatur</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Luftfeuchtigkeit</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Niederschlag</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wind</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Luftdruck</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {hourlyData.map((data) => (
                              <tr key={data.hour} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {data.hour}:00
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  <div className="flex items-center">
                                    <span className="mr-2 text-lg">{getConditionIcon(data.conditions)}</span>
                                    {data.conditions || 'N/A'}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  <span style={{ color: getTemperatureColor(data.temperature) }}>
                                    {formatTemperature(data.temperature)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {formatPercentage(data.humidity)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {formatPrecipitation(data.precipitation)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {data.windSpeed.toFixed(1)} km/h
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {data.pressure.toFixed(0)} hPa
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Keine stündlichen Wetterdaten für den {format(selectedDate, 'dd.MM.yyyy', { locale: de })} in {GERMAN_STATES.find(s => s.code === selectedState)?.name} verfügbar.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}