import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, CloudRain, Gift, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Forecast() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("models");
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  
  // Initialisiere die Datumsfelder mit sinnvollen Standardwerten
  const defaultStartDate = new Date();
  defaultStartDate.setMonth(defaultStartDate.getMonth() - 3); // 3 Monate zurück
  
  const defaultEndDate = new Date(); // Heute
  
  const [startDate, setStartDate] = useState<Date | null>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date | null>(defaultEndDate);

  // Fetch forecast models
  const { data: models, isLoading: isLoadingModels } = useQuery({
    queryKey: ["/api/forecast/models"],
    retry: 1,
    queryFn: () => apiRequest("get", "/api/forecast/models")
  });

  // Fetch data coverage information
  const { data: dataCoverage, isLoading: isLoadingCoverage } = useQuery({
    queryKey: ["/api/data-coverage"],
    retry: 1,
    queryFn: () => apiRequest("get", "/api/data-coverage")
  });

  // Sync weather data
  const syncWeatherMutation = useMutation({
    mutationFn: (data: { startDate: string, endDate: string }) => {
      return apiRequest("post", "/api/weather/sync", {
        body: data
      });
    },
    onSuccess: () => {
      toast({
        title: "Wetterdaten synchronisiert",
        description: "Die Wetterdaten wurden erfolgreich synchronisiert",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/data-coverage"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler bei der Synchronisierung der Wetterdaten: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Sync holiday data
  const syncHolidaysMutation = useMutation({
    mutationFn: (data: { year: number, states?: string[] }) => {
      return apiRequest("post", "/api/holidays/sync", {
        body: data
      });
    },
    onSuccess: () => {
      toast({
        title: "Feiertage synchronisiert",
        description: "Die Feiertage wurden erfolgreich synchronisiert",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/data-coverage"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler bei der Synchronisierung der Feiertage: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Create forecast model
  const createModelMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest("post", "/api/forecast/models", {
        body: data
      });
    },
    onSuccess: () => {
      toast({
        title: "Modell erstellt",
        description: "Das Prognosemodell wurde erfolgreich erstellt",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/models"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen des Modells: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Train forecast model
  const trainModelMutation = useMutation({
    mutationFn: (data: { modelId: number, startDate: string, endDate: string }) => {
      return apiRequest("post", `/api/forecast/models/${data.modelId}/train`, {
        body: { 
          startDate: data.startDate, 
          endDate: data.endDate 
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Training gestartet",
        description: "Das Training des Modells wurde gestartet",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/models"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Trainieren des Modells: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Create forecast
  const createForecastMutation = useMutation({
    mutationFn: (data: { modelId: number, startDate: string, endDate: string }) => {
      console.log("Sende Prognoseerstellungsdaten:", data);
      return apiRequest("post", "/api/forecast/create", {
        body: data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Prognose erstellt",
        description: "Die Prognose wurde erfolgreich erstellt",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/forecast/data"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen der Prognose: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Fetch forecast data
  const { data: forecasts, isLoading: isLoadingForecasts } = useQuery({
    queryKey: ["/api/forecast/data", startDate, endDate, selectedModelId],
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate.toISOString().split("T")[0]);
      if (endDate) params.append("endDate", endDate.toISOString().split("T")[0]);
      if (selectedModelId) params.append("modelId", selectedModelId.toString());
      
      return apiRequest("get", `/api/forecast/data?${params.toString()}`);
    }
  });

  // Handlers
  const handleSyncWeather = () => {
    if (!startDate || !endDate) {
      toast({
        title: "Datum fehlt",
        description: "Bitte Start- und Enddatum angeben",
        variant: "destructive",
      });
      return;
    }
    
    syncWeatherMutation.mutate({
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0]
    });
  };

  const handleSyncHolidays = () => {
    const currentYear = new Date().getFullYear();
    syncHolidaysMutation.mutate({ year: currentYear });
  };

  const handleCreateForecast = () => {
    if (!selectedModelId || !startDate || !endDate) {
      toast({
        title: "Daten unvollständig",
        description: "Bitte wählen Sie ein Modell aus und geben Sie Start- und Enddatum an",
        variant: "destructive",
      });
      return;
    }
    
    createForecastMutation.mutate({
      modelId: selectedModelId,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0]
    });
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('de-DE', options);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prognosen & Daten</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Prognosemodelle und synchronisieren Sie externe Daten
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <TabsTrigger value="models" className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            <span>Prognosemodelle</span>
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <CloudRain className="h-4 w-4" />
            <span>Wetter- & Feiertage</span>
          </TabsTrigger>
          <TabsTrigger value="forecast" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Prognosen erstellen</span>
          </TabsTrigger>
        </TabsList>

        {/* Models Tab */}
        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Prognosemodelle</CardTitle>
              <CardDescription>
                Erstellen und trainieren Sie Modelle für Verkaufsprognosen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingModels ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : models && models.length > 0 ? (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Erstellt</TableHead>
                        <TableHead>Zuletzt trainiert</TableHead>
                        <TableHead>Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {models.map((model: any) => (
                        <TableRow key={model.id}>
                          <TableCell>
                            <div className="font-medium">{model.name}</div>
                            <div className="text-sm text-muted-foreground">{model.description}</div>
                          </TableCell>
                          <TableCell>{model.model_type}</TableCell>
                          <TableCell>
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                              ${model.status === 'ready' ? 'bg-green-100 text-green-800' : 
                                model.status === 'training' ? 'bg-blue-100 text-blue-800' :
                                model.status === 'error' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                              {model.status}
                            </div>
                          </TableCell>
                          <TableCell>{model.created_at ? formatDate(model.created_at) : '-'}</TableCell>
                          <TableCell>{model.last_trained_at ? formatDate(model.last_trained_at) : 'Nie'}</TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedModelId(model.id);
                                setActiveTab("forecast");
                              }}
                            >
                              Verwenden
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Prognosemodelle vorhanden
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full md:w-auto"
                onClick={() => {
                  // Beispielmodell erstellen
                  createModelMutation.mutate({
                    name: `Verkaufsprognose ${new Date().toLocaleDateString('de-DE')}`,
                    description: "Automatisch erstelltes Regressionsmodell",
                    modelType: "regression",
                    usesWeatherData: true,
                    usesHolidayData: true,
                    configuration: JSON.stringify({
                      features: ["day_of_week", "temperature", "is_holiday", "precipitation"]
                    })
                  });
                }}
              >
                {createModelMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird erstellt...
                  </>
                ) : (
                  "Neues Modell erstellen"
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Weather Data Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CloudRain className="h-5 w-5" />
                  Wetterdaten
                </CardTitle>
                <CardDescription>
                  Synchronisieren Sie historische Wetterdaten für Prognosen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weatherStartDate">Startdatum</Label>
                      <DatePicker 
                        id="weatherStartDate"
                        date={startDate} 
                        setDate={setStartDate} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weatherEndDate">Enddatum</Label>
                      <DatePicker 
                        id="weatherEndDate"
                        date={endDate} 
                        setDate={setEndDate}
                      />
                    </div>
                  </div>

                  {isLoadingCoverage ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : dataCoverage?.weather ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Datenabdeckung:</span>
                        <span className="text-sm font-medium">{dataCoverage.weather.coverage}%</span>
                      </div>
                      <Progress value={dataCoverage.weather.coverage} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        Daten verfügbar von {dataCoverage.weather.firstDate} bis {dataCoverage.weather.lastDate}
                      </p>
                    </div>
                  ) : (
                    <Alert>
                      <AlertTitle>Keine Wetterdaten verfügbar</AlertTitle>
                      <AlertDescription>
                        Bitte synchronisieren Sie Wetterdaten, um sie in Prognosemodellen zu verwenden.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  onClick={handleSyncWeather}
                  disabled={syncWeatherMutation.isPending || !startDate || !endDate}
                >
                  {syncWeatherMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird synchronisiert...
                    </>
                  ) : (
                    "Wetterdaten synchronisieren"
                  )}
                </Button>
              </CardFooter>
            </Card>

            {/* Holiday Data Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Feiertage & Ferien
                </CardTitle>
                <CardDescription>
                  Synchronisieren Sie Feiertage und Schulferien für Prognosemodelle
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="holidayYear">Jahr</Label>
                      <Select defaultValue={(new Date().getFullYear()).toString()}>
                        <SelectTrigger id="holidayYear">
                          <SelectValue placeholder="Jahr auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 5 }, (_, i) => {
                            const year = new Date().getFullYear() - 2 + i;
                            return (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="holidayState">Bundesland</Label>
                      <Select defaultValue="SN">
                        <SelectTrigger id="holidayState">
                          <SelectValue placeholder="Bundesland auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SN">Sachsen</SelectItem>
                          <SelectItem value="BY">Bayern</SelectItem>
                          <SelectItem value="BE">Berlin</SelectItem>
                          <SelectItem value="BB">Brandenburg</SelectItem>
                          <SelectItem value="HB">Bremen</SelectItem>
                          <SelectItem value="HH">Hamburg</SelectItem>
                          <SelectItem value="HE">Hessen</SelectItem>
                          <SelectItem value="MV">Mecklenburg-Vorpommern</SelectItem>
                          <SelectItem value="NI">Niedersachsen</SelectItem>
                          <SelectItem value="NW">Nordrhein-Westfalen</SelectItem>
                          <SelectItem value="RP">Rheinland-Pfalz</SelectItem>
                          <SelectItem value="SL">Saarland</SelectItem>
                          <SelectItem value="ST">Sachsen-Anhalt</SelectItem>
                          <SelectItem value="SH">Schleswig-Holstein</SelectItem>
                          <SelectItem value="TH">Thüringen</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {isLoadingCoverage ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : dataCoverage?.holidays ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Datenabdeckung:</span>
                        <span className="text-sm font-medium">{dataCoverage.holidays.coverage}%</span>
                      </div>
                      <Progress value={dataCoverage.holidays.coverage} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        Daten verfügbar für Jahre: {dataCoverage.holidays.availableYears.join(", ")}
                      </p>
                    </div>
                  ) : (
                    <Alert>
                      <AlertTitle>Keine Feiertagsdaten verfügbar</AlertTitle>
                      <AlertDescription>
                        Bitte synchronisieren Sie Feiertage, um sie in Prognosemodellen zu verwenden.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  onClick={handleSyncHolidays}
                  disabled={syncHolidaysMutation.isPending}
                >
                  {syncHolidaysMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird synchronisiert...
                    </>
                  ) : (
                    "Feiertage synchronisieren"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Prognose erstellen</CardTitle>
              <CardDescription>
                Erstellen Sie eine Verkaufsprognose basierend auf historischen Daten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forecastModel">Prognosemodell</Label>
                    <Select 
                      value={selectedModelId ? selectedModelId.toString() : undefined}
                      onValueChange={(value) => setSelectedModelId(parseInt(value))}
                    >
                      <SelectTrigger id="forecastModel">
                        <SelectValue placeholder="Modell auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingModels ? (
                          <div className="flex justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : models && models.length > 0 ? (
                          models.map((model: any) => (
                            <SelectItem 
                              key={model.id} 
                              value={model.id.toString()}
                              disabled={model.status !== 'ready'}
                            >
                              {model.name} {model.status !== 'ready' && `(${model.status})`}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="" disabled>
                            Keine Modelle verfügbar
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="forecastStartDate">Von</Label>
                      <DatePicker 
                        id="forecastStartDate"
                        date={startDate} 
                        setDate={setStartDate} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="forecastEndDate">Bis</Label>
                      <DatePicker 
                        id="forecastEndDate"
                        date={endDate} 
                        setDate={setEndDate}
                      />
                    </div>
                  </div>

                  {selectedModelId && (
                    <div className="pt-4">
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => {
                          if (!selectedModelId || !startDate || !endDate) return;
                          
                          trainModelMutation.mutate({
                            modelId: selectedModelId,
                            startDate: startDate.toISOString().split("T")[0],
                            endDate: endDate.toISOString().split("T")[0]
                          });
                        }}
                        disabled={trainModelMutation.isPending || !selectedModelId || !startDate || !endDate}
                      >
                        {trainModelMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Training läuft...
                          </>
                        ) : (
                          "Modell mit diesem Zeitraum trainieren"
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-2">Prognoseergebnisse</h3>
                  {isLoadingForecasts ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : forecasts && forecasts.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Standort</TableHead>
                          <TableHead>Maschine</TableHead>
                          <TableHead>Prognose (Transaktionen)</TableHead>
                          <TableHead>Ist-Wert</TableHead>
                          <TableHead>Abweichung</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forecasts.map((forecast: any) => (
                          <TableRow key={forecast.id}>
                            <TableCell>{new Date(forecast.date).toLocaleDateString('de-DE')}</TableCell>
                            <TableCell>{forecast.location_name || 'Alle'}</TableCell>
                            <TableCell>{forecast.machine_name || 'Alle'}</TableCell>
                            <TableCell className="font-medium">{forecast.predicted_quantity.toFixed(2)}</TableCell>
                            <TableCell>
                              {forecast.actual_quantity !== null 
                                ? forecast.actual_quantity 
                                : <span className="text-muted-foreground">n/a</span>}
                            </TableCell>
                            <TableCell>
                              {forecast.actual_quantity !== null ? (
                                <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                  ${Math.abs(forecast.actual_quantity - forecast.predicted_quantity) / forecast.predicted_quantity <= 0.1
                                    ? 'bg-green-100 text-green-800' 
                                    : Math.abs(forecast.actual_quantity - forecast.predicted_quantity) / forecast.predicted_quantity <= 0.25
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                  {(((forecast.actual_quantity - forecast.predicted_quantity) / forecast.predicted_quantity) * 100).toFixed(1)}%
                                </div>
                              ) : (
                                <span className="text-muted-foreground">n/a</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      {startDate && endDate 
                        ? "Keine Prognosen für diesen Zeitraum" 
                        : "Bitte wählen Sie ein Datum aus"}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full"
                onClick={handleCreateForecast}
                disabled={
                  createForecastMutation.isPending || 
                  !selectedModelId || 
                  !startDate || 
                  !endDate
                }
              >
                {createForecastMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird erstellt...
                  </>
                ) : (
                  "Prognose erstellen"
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}