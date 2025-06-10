/**
 * Holiday Analysis Dashboard
 * 
 * Comprehensive dashboard for analyzing and synchronizing holiday data
 * across all German federal states
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  Download, 
  RefreshCw, 
  BarChart3, 
  MapPin, 
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  School,
  Users
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

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

interface HolidayAnalysis {
  year: number;
  overview: {
    total_days: number;
    public_holiday_days: number;
    school_holiday_days: number;
    weekend_days: number;
    work_days: number;
  };
  stateStats: Array<{
    state: string;
    public_holidays: number;
    school_holidays: number;
  }>;
}

export default function HolidayAnalysisDashboard() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const queryClient = useQueryClient();

  // Fetch holiday analysis data
  const { data: analysisData, isLoading: isAnalysisLoading, error: analysisError } = useQuery<HolidayAnalysis>({
    queryKey: ['holiday-analysis', selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/holidays/analysis/${selectedYear}`);
      if (!response.ok) {
        throw new Error('Failed to fetch holiday analysis');
      }
      const result = await response.json();
      return result.data;
    },
    retry: 1
  });

  // Fetch comprehensive holiday data for current year to show current status
  const { data: comprehensiveData } = useQuery({
    queryKey: ['holidays-comprehensive', selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/holidays/comprehensive/${selectedYear}`);
      if (!response.ok) {
        throw new Error('Failed to fetch comprehensive holidays');
      }
      return response.json();
    },
    retry: 1
  });

  // Get current holiday status for each state
  const getCurrentHolidayStatus = () => {
    if (!comprehensiveData) return {};
    
    const today = new Date().toISOString().split('T')[0];
    const todayData = comprehensiveData.find((day: any) => day.date === today);
    
    return todayData?.states || {};
  };

  // Comprehensive sync mutation
  const syncMutation = useMutation({
    mutationFn: async (params: { year?: number; startYear?: number; endYear?: number }) => {
      setSyncStatus('syncing');
      return await apiRequest(`/api/holidays/sync-comprehensive`, {
        method: 'POST',
        body: JSON.stringify(params)
      });
    },
    onSuccess: (data) => {
      setSyncStatus('success');
      queryClient.invalidateQueries({ queryKey: ['holiday-analysis'] });
      console.log('Sync completed:', data);
    },
    onError: (error) => {
      setSyncStatus('error');
      console.error('Sync failed:', error);
    }
  });

  const handleSyncYear = () => {
    syncMutation.mutate({ year: selectedYear });
  };

  const handleSyncMultipleYears = () => {
    const startYear = selectedYear - 1;
    const endYear = selectedYear + 1;
    syncMutation.mutate({ startYear, endYear });
  };

  const getStateInfo = (stateCode: string) => {
    return GERMAN_STATES.find(s => s.code === stateCode);
  };

  const getCompletionColor = (publicHolidays: number, schoolHolidays: number) => {
    const total = publicHolidays + schoolHolidays;
    if (total === 0) return 'bg-red-500';
    if (total < 50) return 'bg-yellow-500';
    if (total < 100) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getStatusIcon = (publicHolidays: number, schoolHolidays: number) => {
    const total = publicHolidays + schoolHolidays;
    if (total === 0) return <XCircle className="h-4 w-4 text-red-500" />;
    if (total < 50) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Feiertage und Ferien Analyse</h1>
          <p className="text-gray-600 mt-2">
            Umfassende Analyse der Feiertage und Schulferien für alle deutschen Bundesländer
          </p>
        </div>
        
        <div className="flex gap-2">
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sync Status */}
      {syncStatus !== 'idle' && (
        <Alert>
          <RefreshCw className="h-4 w-4" />
          <AlertDescription>
            {syncStatus === 'syncing' && 'Synchronisierung läuft... Dies kann einige Minuten dauern.'}
            {syncStatus === 'success' && 'Synchronisierung erfolgreich abgeschlossen!'}
            {syncStatus === 'error' && 'Fehler bei der Synchronisierung. Bitte versuchen Sie es erneut.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Sync Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Daten-Synchronisierung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button 
              onClick={handleSyncYear}
              disabled={syncMutation.isPending}
              variant="default"
            >
              {syncMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              Jahr {selectedYear} synchronisieren
            </Button>
            
            <Button 
              onClick={handleSyncMultipleYears}
              disabled={syncMutation.isPending}
              variant="outline"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Mehrere Jahre ({selectedYear-1}-{selectedYear+1})
            </Button>
          </div>
          
          {syncMutation.isPending && (
            <div className="mt-4">
              <Progress value={undefined} className="w-full" />
              <p className="text-sm text-gray-600 mt-2">
                Lade Feiertage und Schulferien von externen APIs...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overview Statistics */}
      {analysisData && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Gesamte Tage</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analysisData.overview.total_days}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-red-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Feiertage</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analysisData.overview.public_holiday_days}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Schulferien</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analysisData.overview.school_holiday_days}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-gray-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Wochenenden</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analysisData.overview.weekend_days}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Arbeitstage</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analysisData.overview.work_days}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Current Holiday Status */}
      {comprehensiveData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Aktuelle Feiertage & Ferien (heute: {new Date().toLocaleDateString('de-DE')})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {GERMAN_STATES.map((state) => {
                const currentStatus = getCurrentHolidayStatus();
                const stateStatus = currentStatus[state.code];
                
                return (
                  <div key={state.code} className="text-center p-2 border rounded-lg">
                    <div className="text-xs font-medium mb-1">{state.code}</div>
                    <div className="flex flex-col gap-1">
                      {stateStatus?.isHoliday && (
                        <Badge variant="destructive" className="text-xs py-0">
                          <Calendar className="h-3 w-3 mr-1" />
                          Feiertag
                        </Badge>
                      )}
                      {stateStatus?.isSchoolHoliday && (
                        <Badge variant="default" className="text-xs py-0 bg-blue-500">
                          <School className="h-3 w-3 mr-1" />
                          Ferien
                        </Badge>
                      )}
                      {!stateStatus?.isHoliday && !stateStatus?.isSchoolHoliday && (
                        <Badge variant="outline" className="text-xs py-0">
                          <Users className="h-3 w-3 mr-1" />
                          Normal
                        </Badge>
                      )}
                    </div>
                    {stateStatus && (
                      <div className="text-xs text-gray-500 mt-1 truncate" title={stateStatus.name}>
                        {stateStatus.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* State-wise Analysis */}
      {analysisData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Bundesländer-Übersicht
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {analysisData.stateStats.map((stateStat) => {
                const stateInfo = getStateInfo(stateStat.state);
                const total = stateStat.public_holidays + stateStat.school_holidays;
                const currentStatus = getCurrentHolidayStatus();
                const stateStatus = currentStatus[stateStat.state];
                
                return (
                  <div key={stateStat.state} className={`border rounded-lg p-4 ${
                    stateStatus?.isHoliday || stateStatus?.isSchoolHoliday ? 'border-blue-300 bg-blue-50' : ''
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-sm">{stateInfo?.name || stateStat.state}</h3>
                      <div className="flex items-center gap-1">
                        {stateStatus?.isHoliday && (
                          <Badge variant="destructive" className="text-xs">
                            <Calendar className="h-3 w-3 mr-1" />
                            Heute
                          </Badge>
                        )}
                        {stateStatus?.isSchoolHoliday && (
                          <Badge variant="default" className="text-xs bg-blue-500">
                            <School className="h-3 w-3 mr-1" />
                            Ferien
                          </Badge>
                        )}
                        {getStatusIcon(stateStat.public_holidays, stateStat.school_holidays)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">Feiertage:</span>
                        <Badge variant="secondary" className="bg-red-100 text-red-800">
                          {stateStat.public_holidays}
                        </Badge>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">Schulferien:</span>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          {stateStat.school_holidays}
                        </Badge>
                      </div>
                      
                      {stateStatus && (
                        <div className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded">
                          <strong>Heute:</strong> {stateStatus.name}
                        </div>
                      )}
                      
                      <div className="pt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Vollständigkeit</span>
                          <span>{total > 0 ? 'Geladen' : 'Keine Daten'}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${getCompletionColor(stateStat.public_holidays, stateStat.school_holidays)}`}
                            style={{ width: total > 0 ? '100%' : '0%' }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isAnalysisLoading && (
        <Card>
          <CardContent className="p-12">
            <div className="flex justify-center items-center">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mr-4" />
              <span>Lade Feiertags-Analyse...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {analysisError && (
        <Alert>
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            Fehler beim Laden der Feiertags-Analyse. Möglicherweise sind noch keine Daten für {selectedYear} verfügbar. 
            Verwenden Sie die Synchronisierung um Daten zu laden.
          </AlertDescription>
        </Alert>
      )}

      {/* Data Quality Summary */}
      {analysisData && (
        <Card>
          <CardHeader>
            <CardTitle>Datenqualität Zusammenfassung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <h3 className="font-semibold text-green-800">Vollständig geladen</h3>
                <p className="text-sm text-green-600">
                  {analysisData.stateStats.filter(s => s.public_holidays + s.school_holidays > 0).length} Bundesländer
                </p>
              </div>
              
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
                <h3 className="font-semibold text-yellow-800">Teilweise geladen</h3>
                <p className="text-sm text-yellow-600">
                  {analysisData.stateStats.filter(s => {
                    const total = s.public_holidays + s.school_holidays;
                    return total > 0 && total < 50;
                  }).length} Bundesländer
                </p>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
                <h3 className="font-semibold text-red-800">Keine Daten</h3>
                <p className="text-sm text-red-600">
                  {analysisData.stateStats.filter(s => s.public_holidays + s.school_holidays === 0).length} Bundesländer
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}