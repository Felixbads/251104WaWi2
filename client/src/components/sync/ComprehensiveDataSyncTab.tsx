/**
 * Comprehensive Data Sync Tab Component
 * 
 * Provides a user interface for synchronizing weather and holiday data
 * for all German federal states since 2022
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Cloud, Calendar, Database, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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

interface SyncStatus {
  latestSyncs: any[];
  coverage: {
    holidays: { count: number; dateRange: any };
    calendar: { count: number };
    weather: { count: number; dateRange: any };
  };
}

export function ComprehensiveDataSyncTab() {
  const [selectedStates, setSelectedStates] = useState<string[]>(['SN']);
  const [startYear, setStartYear] = useState(2022);
  const [endYear, setEndYear] = useState(new Date().getFullYear() + 1);
  const [includeWeather, setIncludeWeather] = useState(true);
  const [includeHolidays, setIncludeHolidays] = useState(true);
  const [allStates, setAllStates] = useState(false);

  // Fetch sync status
  const { data: syncStatus, refetch: refetchStatus } = useQuery<SyncStatus>({
    queryKey: ['/api/comprehensive-data/status'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Comprehensive sync mutation
  const comprehensiveSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/comprehensive-data/sync', {
        method: 'POST',
        body: JSON.stringify({
          startYear,
          endYear,
          includeWeather,
          includeHolidays,
          states: allStates ? undefined : selectedStates
        })
      });
    },
    onSuccess: () => {
      refetchStatus();
    }
  });

  // Quick sync for all states
  const allStatesSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/comprehensive-data/sync-all-states', {
        method: 'POST',
        body: JSON.stringify({
          startYear: 2022,
          endYear: new Date().getFullYear() + 1
        })
      });
    },
    onSuccess: () => {
      refetchStatus();
    }
  });

  // Holiday-only sync
  const holidaySyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/comprehensive-data/sync-holidays', {
        method: 'POST',
        body: JSON.stringify({
          startYear,
          endYear,
          states: allStates ? undefined : selectedStates
        })
      });
    },
    onSuccess: () => {
      refetchStatus();
    }
  });

  // Weather-only sync
  const weatherSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/comprehensive-data/sync-weather', {
        method: 'POST',
        body: JSON.stringify({
          startYear,
          endYear,
          states: allStates ? undefined : selectedStates
        })
      });
    },
    onSuccess: () => {
      refetchStatus();
    }
  });

  const handleStateToggle = (stateCode: string) => {
    if (selectedStates.includes(stateCode)) {
      setSelectedStates(selectedStates.filter(s => s !== stateCode));
    } else {
      setSelectedStates([...selectedStates, stateCode]);
    }
  };

  const handleSelectAll = () => {
    setSelectedStates(GERMAN_STATES.map(s => s.code));
  };

  const handleSelectNone = () => {
    setSelectedStates([]);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('de-DE').format(num);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Abgeschlossen</Badge>;
      case 'running':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Läuft</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Fehler</Badge>;
      default:
        return <Badge variant="outline">Unbekannt</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Datenabdeckung - Übersicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          {syncStatus ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Calendar className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Kalenderdaten</h3>
                <p className="text-2xl font-bold text-blue-600">
                  {formatNumber(syncStatus.coverage.calendar.count)}
                </p>
                <p className="text-sm text-blue-700">Kalendertage</p>
              </div>
              
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Calendar className="h-8 w-8 mx-auto mb-2 text-green-600" />
                <h3 className="font-semibold text-green-900">Feiertage</h3>
                <p className="text-2xl font-bold text-green-600">
                  {formatNumber(syncStatus.coverage.holidays.count)}
                </p>
                <p className="text-sm text-green-700">Feiertags-Einträge</p>
              </div>
              
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <Cloud className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                <h3 className="font-semibold text-orange-900">Wetterdaten</h3>
                <p className="text-2xl font-bold text-orange-600">
                  {formatNumber(syncStatus.coverage.weather.count)}
                </p>
                <p className="text-sm text-orange-700">Wetter-Datenpunkte</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Lade Statusdaten...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Sync History */}
      {syncStatus?.latestSyncs && syncStatus.latestSyncs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Letzte Synchronisierungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncStatus.latestSyncs.slice(0, 5).map((sync: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-medium">{sync.syncType}</span>
                    <p className="text-sm text-gray-600">
                      {new Date(sync.createdAt).toLocaleString('de-DE')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(sync.syncStatus)}
                    {sync.itemsSaved > 0 && (
                      <span className="text-sm text-gray-600">
                        {formatNumber(sync.itemsSaved)} Einträge
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Schnellaktionen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Empfehlung für neue Installationen</AlertTitle>
            <AlertDescription>
              Für eine vollständige Datengrundlage empfehlen wir den Import aller 
              Bundesländer seit 2022. Dies kann einige Minuten dauern.
            </AlertDescription>
          </Alert>
          
          <Button
            onClick={() => allStatesSyncMutation.mutate()}
            disabled={allStatesSyncMutation.isPending}
            className="w-full"
            size="lg"
          >
            {allStatesSyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importiere alle Bundesländer...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Alle Bundesländer seit 2022 importieren
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Custom Sync Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Benutzerdefinierte Synchronisierung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Year Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Startjahr</label>
              <Select value={startYear.toString()} onValueChange={(value) => setStartYear(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => 2020 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Endjahr</label>
              <Select value={endYear.toString()} onValueChange={(value) => setEndYear(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => 2020 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data Type Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium">Datentypen</label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="holidays"
                checked={includeHolidays}
                onCheckedChange={setIncludeHolidays}
              />
              <label htmlFor="holidays" className="text-sm">
                Feiertage und Schulferien
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="weather"
                checked={includeWeather}
                onCheckedChange={setIncludeWeather}
              />
              <label htmlFor="weather" className="text-sm">
                Wetterdaten (erfordert OpenWeather API-Key)
              </label>
            </div>
          </div>

          {/* State Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">Bundesländer</label>
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  Alle auswählen
                </Button>
                <Button variant="outline" size="sm" onClick={handleSelectNone}>
                  Keine auswählen
                </Button>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox
                id="all-states"
                checked={allStates}
                onCheckedChange={setAllStates}
              />
              <label htmlFor="all-states" className="text-sm font-medium">
                Alle 16 Bundesländer
              </label>
            </div>
            
            {!allStates && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {GERMAN_STATES.map(state => (
                  <div key={state.code} className="flex items-center space-x-2">
                    <Checkbox
                      id={state.code}
                      checked={selectedStates.includes(state.code)}
                      onCheckedChange={() => handleStateToggle(state.code)}
                    />
                    <label htmlFor={state.code} className="text-sm">
                      {state.code}
                    </label>
                  </div>
                ))}
              </div>
            )}
            
            <p className="text-sm text-gray-600">
              {allStates ? 'Alle 16 Bundesländer' : `${selectedStates.length} Bundesländer ausgewählt`}
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="space-y-3">
          <Button
            onClick={() => comprehensiveSyncMutation.mutate()}
            disabled={comprehensiveSyncMutation.isPending || (!includeWeather && !includeHolidays)}
            className="w-full"
          >
            {comprehensiveSyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Synchronisierung läuft...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Benutzerdefinierte Synchronisierung starten
              </>
            )}
          </Button>
          
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => holidaySyncMutation.mutate()}
              disabled={holidaySyncMutation.isPending}
            >
              {holidaySyncMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              Nur Feiertage
            </Button>
            
            <Button
              variant="outline"
              onClick={() => weatherSyncMutation.mutate()}
              disabled={weatherSyncMutation.isPending}
            >
              {weatherSyncMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4 mr-2" />
              )}
              Nur Wetter
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Results Display */}
      {(comprehensiveSyncMutation.data || comprehensiveSyncMutation.error) && (
        <Card>
          <CardHeader>
            <CardTitle>Synchronisierungsergebnis</CardTitle>
          </CardHeader>
          <CardContent>
            {comprehensiveSyncMutation.error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Fehler bei der Synchronisierung</AlertTitle>
                <AlertDescription>
                  {comprehensiveSyncMutation.error instanceof Error 
                    ? comprehensiveSyncMutation.error.message 
                    : 'Ein unbekannter Fehler ist aufgetreten'}
                </AlertDescription>
              </Alert>
            ) : comprehensiveSyncMutation.data?.success ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Synchronisierung erfolgreich</AlertTitle>
                <AlertDescription>
                  {comprehensiveSyncMutation.data.message}
                  {comprehensiveSyncMutation.data.data && (
                    <div className="mt-2 space-y-1">
                      {comprehensiveSyncMutation.data.data.calendar && (
                        <div>Kalendertage: {comprehensiveSyncMutation.data.data.calendar.synced} synchronisiert</div>
                      )}
                      {comprehensiveSyncMutation.data.data.holidays && (
                        <div>Feiertage: {comprehensiveSyncMutation.data.data.holidays.synced} synchronisiert</div>
                      )}
                      {comprehensiveSyncMutation.data.data.weather && (
                        <div>Wetterdaten: {comprehensiveSyncMutation.data.data.weather.synced} synchronisiert</div>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Synchronisierung fehlgeschlagen</AlertTitle>
                <AlertDescription>
                  {comprehensiveSyncMutation.data?.message || 'Unbekannter Fehler'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}