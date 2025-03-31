import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Database, FileText, Package, AlertCircle, Clock, RefreshCw, Loader2, LayoutDashboard } from "lucide-react";
import { getSyncStatus, triggerSync, formatDateTime, getDatabaseStats, DatabaseStats, SyncStatus } from "@/lib/api";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
// Direkt API-Typen verwenden
// import { SyncStatus } from "@/lib/types";

export default function Synchronization() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncType, setSyncType] = useState<'machines' | 'transactions' | 'events' | 'refills' | 'products' | 'all'>('all');
  const [batchSize, setBatchSize] = useState<number>(100);
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().setDate(new Date().getDate() - 7)) // 7 days ago
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isHistoricalSync, setIsHistoricalSync] = useState<boolean>(false);
  const [datePreset, setDatePreset] = useState<string>("last7days");

  // Fetch sync status
  const { data: syncStatus, isLoading: isLoadingSyncStatus, error: syncError } = useQuery<SyncStatus>({
    queryKey: ['/api/sync/status'],
    refetchInterval: 10000, // Refetch every 10 seconds
  });
  
  // Fetch database statistics
  const { data: dbStats, isLoading: isLoadingDbStats, error: dbError } = useQuery<DatabaseStats>({
    queryKey: ['/api/database/stats'],
    refetchInterval: 60000, // Refetch every minute
  });

  // Status für die API-Anfrage und Fortschritt
  const [apiRequest, setApiRequest] = useState<string>("");
  const [syncProgress, setSyncProgress] = useState<{
    total: number;
    processed: number;
    status: 'idle' | 'loading' | 'success' | 'error';
  }>({
    total: 0,
    processed: 0,
    status: 'idle'
  });
  
  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => {
      const options: any = {};
      
      // Für Transaktionen, setze Zeiträume und Batch-Size
      if (syncType === 'transactions' || syncType === 'events' || syncType === 'refills') {
        if (startDate) options.startDate = startDate;
        if (endDate) options.endDate = endDate;
        options.batchSize = batchSize;
        
        // Generiere API-Request für Anzeige
        const timestampFrom = Math.floor(startDate!.getTime() / 1000);
        const timestampTo = Math.floor(endDate!.getTime() / 1000);
        
        // Formattierte Zeitstempel für Anzeige
        const formattedStart = format(startDate!, "dd.MM.yyyy HH:mm", { locale: de });
        const formattedEnd = format(endDate!, "dd.MM.yyyy HH:mm", { locale: de });
        
        // Pfad
        let apiPath = '';
        if (syncType === 'transactions') {
          apiPath = '/stats/vends';
        } else if (syncType === 'events') {
          apiPath = '/events';
        } else if (syncType === 'refills') {
          apiPath = '/servicing';
        }
        
        const requestPreview = 
`GET ${apiPath}
Parameter: {
  "from_timestamp": ${timestampFrom},
  "to_timestamp": ${timestampTo},
  "offset": 0,
  "limit": ${batchSize}
}

Zeitraum: ${formattedStart} - ${formattedEnd}`;

        setApiRequest(requestPreview);
        
        // Setze initialen Fortschritt
        setSyncProgress({
          total: 0,
          processed: 0,
          status: 'loading'
        });
      } else {
        setApiRequest("");
        setSyncProgress({ total: 0, processed: 0, status: 'idle' });
      }
      
      // Historische Synchronisierung
      if (isHistoricalSync && syncType === 'transactions') {
        options.startDate = new Date(2023, 0, 1); // 1. Januar 2023
        options.maxDays = 3000; // Großer Wert, um alle Tage zu laden
      }
      
      return triggerSync(syncType, options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/logs'] });
      
      let message = `Die ${getSyncTypeLabel(syncType)}-Synchronisierung wurde erfolgreich gestartet.`;
      if (isHistoricalSync && syncType === 'transactions') {
        message = 'Die historische Transaktions-Synchronisierung seit Januar 2023 wurde gestartet.';
      }
      
      // Setze Fortschritt auf Erfolg
      setSyncProgress(prev => ({
        ...prev,
        status: 'success'
      }));
      
      toast({
        title: "Synchronisierung gestartet",
        description: message,
        variant: "success",
      });
    },
    onError: (error) => {
      setSyncProgress(prev => ({
        ...prev,
        status: 'error'
      }));
      
      toast({
        title: "Synchronisierungsfehler",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    },
  });

  // Function to get label for sync type
  const getSyncTypeLabel = (type: string): string => {
    switch (type) {
      case 'machines': return 'Maschinen';
      case 'transactions': return 'Transaktionen';
      case 'events': return 'Ereignisse';
      case 'refills': return 'Nachfüllungen';
      case 'products': return 'Produkte';
      case 'all': return 'Vollständige';
      default: return type;
    }
  };

  // Function to get icon for sync type
  const getSyncTypeIcon = (type: string) => {
    switch (type) {
      case 'machines': return <Package className="h-5 w-5 mr-2" />;
      case 'transactions': return <FileText className="h-5 w-5 mr-2" />;
      case 'events': return <AlertCircle className="h-5 w-5 mr-2" />;
      case 'refills': return <RefreshCw className="h-5 w-5 mr-2" />;
      case 'products': return <Package className="h-5 w-5 mr-2" />;
      case 'all': return <Database className="h-5 w-5 mr-2" />;
      default: return <Clock className="h-5 w-5 mr-2" />;
    }
  };

  // Handle sync button click
  const handleSyncClick = () => {
    if (syncMutation.isPending) return;
    syncMutation.mutate();
  };

  // Calculate progress percentages
  const getProgressPercentage = (found: number, total: number) => {
    if (total === 0) return 100;
    return Math.min(100, Math.round((found / total) * 100));
  };
  
  // WebSocket für Live-Updates
  useEffect(() => {
    // WebSocket Verbindung einrichten
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/sync-progress`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log("WebSocket-Verbindung für Sync-Progress hergestellt");
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Sync-Progress Update erhalten:", data);
        
        if (data.type === 'sync_progress' && data.syncType) {
          // Nur Updates für den aktuell gewählten Sync-Typ berücksichtigen
          if (data.syncType === syncType) {
            setSyncProgress({
              total: data.total || 0,
              processed: data.processed || 0,
              status: 'loading'
            });
          }
        } else if (data.type === 'sync_complete') {
          // Synchronisierung abgeschlossen
          setSyncProgress(prev => ({
            ...prev,
            status: 'success'
          }));
          
          // Daten aktualisieren
          queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
          queryClient.invalidateQueries({ queryKey: ['/api/database/stats'] });
        }
      } catch (error) {
        console.error("Fehler beim Verarbeiten der WebSocket-Nachricht:", error);
      }
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket-Fehler:", error);
    };
    
    ws.onclose = (event) => {
      console.log("WebSocket-Verbindung geschlossen:", event.code, event.reason);
    };
    
    // Aufräumen beim Entladen der Komponente
    return () => {
      ws.close();
    };
  }, [syncType, queryClient]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datensynchronisierung</CardTitle>
          <CardDescription>
            Konfigurieren und starten Sie die Synchronisierung mit dem Vendon-System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="status" className="space-y-4">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="config">Konfiguration</TabsTrigger>
            </TabsList>

            {/* Status Tab */}
            <TabsContent value="status" className="space-y-4">
              {syncError || dbError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Fehler</AlertTitle>
                  <AlertDescription>
                    {(syncError || dbError) instanceof Error 
                      ? (syncError || dbError).message 
                      : "Fehler beim Laden der Daten."}
                  </AlertDescription>
                </Alert>
              ) : isLoadingSyncStatus || isLoadingDbStats ? (
                <>
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p>Lade Synchronisierungsstatus...</p>
                  </div>
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="p-4">
                      <div className="flex justify-between mb-2">
                        <div className="w-1/3 h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="w-1/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded mb-2"></div>
                      <div className="w-1/2 h-3 bg-gray-200 rounded animate-pulse"></div>
                    </Card>
                  ))}
                </>
              ) : (
                <>
                  {/* Dashboard Overview */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-sm font-medium flex items-center">
                        <LayoutDashboard className="h-4 w-4 mr-2 text-primary-600" />
                        Übersicht Datensätze
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Transaktionen</span>
                        <span className="text-sm font-medium">{syncStatus?.transactions?.count?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Maschinen</span>
                        <span className="text-sm font-medium">{syncStatus?.machines?.count?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Nachfüllungen</span>
                        <span className="text-sm font-medium">{syncStatus?.refills?.count?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Nachfülldetails</span>
                        <span className="text-sm font-medium">{syncStatus?.refillDetails?.count?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Ereignisse</span>
                        <span className="text-sm font-medium">{syncStatus?.events?.count?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Produkte</span>
                        <span className="text-sm font-medium">{syncStatus?.products?.count?.toLocaleString() || 0}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <p className="text-xs text-gray-500">Letzte Aktualisierung: {new Date().toLocaleString('de-DE')}</p>
                      <Badge variant="outline" className="text-xs">
                        Gesamt: {(
                          (syncStatus?.transactions?.count || 0) +
                          (syncStatus?.machines?.count || 0) +
                          (syncStatus?.refills?.count || 0) +
                          (syncStatus?.refillDetails?.count || 0) +
                          (syncStatus?.events?.count || 0) +
                          (syncStatus?.products?.count || 0)
                        ).toLocaleString()} Datensätze
                      </Badge>
                    </div>
                  </Card>

                  {/* Transactions Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-primary-600" />
                        Transaktionen
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {syncStatus?.transactions?.count?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <Progress 
                      value={100} 
                      className="h-2 mb-2" 
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <p className="text-xs text-gray-500">
                        {syncStatus?.transactions?.lastSync 
                          ? `Letzte Synchronisierung: ${formatDateTime(syncStatus.transactions.lastSync)}`
                          : "Noch keine Synchronisierung durchgeführt"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {syncStatus?.transactions?.latest 
                          ? `Letzte Transaktion: ${formatDateTime(syncStatus.transactions.latest)}`
                          : "Keine Transaktionen vorhanden"}
                      </p>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      Ziel: 130.000+ Transaktionen seit Januar 2023
                    </p>
                  </Card>

                  {/* Current Sync Progress */}
                  {syncProgress.status === 'loading' && (
                    <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-medium flex items-center">
                          <Loader2 className="h-4 w-4 mr-2 text-blue-600 animate-spin" />
                          Synchronisierung läuft
                        </h3>
                        <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                          {syncType === 'transactions' ? 'Transaktionen' : 
                           syncType === 'events' ? 'Ereignisse' : 
                           syncType === 'refills' ? 'Nachfüllungen' : 
                           getSyncTypeLabel(syncType)}
                        </Badge>
                      </div>
                      <Progress 
                        value={syncProgress.total ? (syncProgress.processed / syncProgress.total) * 100 : 0} 
                        className="h-2 mb-2" 
                      />
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Verarbeitet: <span className="font-medium">{syncProgress.processed.toLocaleString()}</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Gefunden: <span className="font-medium">{syncProgress.total.toLocaleString()}</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Fortschritt: <span className="font-medium">
                            {syncProgress.total ? 
                              `${Math.round((syncProgress.processed / syncProgress.total) * 100)}%` : 
                              "Warte auf Daten..."}
                          </span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Status: <span className="font-medium">Aktiv</span>
                        </p>
                      </div>
                    </Card>
                  )}

                {/* Historical Sync Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <Clock className="h-4 w-4 mr-2 text-amber-600" />
                        Historische Synchronisierung
                      </h3>
                      <Badge 
                        variant={syncStatus?.historicalSync?.inProgress ? "default" : "outline"} 
                        className="text-xs"
                      >
                        {syncStatus?.historicalSync?.inProgress ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                    <Progress 
                      value={syncStatus?.historicalSync?.progress || 0} 
                      className="h-2 mb-2" 
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <p className="text-xs text-gray-500">
                        Aktuell: {syncStatus?.historicalSync?.currentDate || "Nicht aktiv"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Zieldatum: {syncStatus?.historicalSync?.targetDate || "01.01.2023"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Fortschritt: {syncStatus?.historicalSync?.progress ? `${syncStatus.historicalSync.progress}%` : "0%"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Laufzeit: {syncStatus?.historicalSync?.processingTimeMin ? `${syncStatus.historicalSync.processingTimeMin} Min.` : "0 Min."}
                      </p>
                    </div>
                    {syncStatus?.historicalSync?.completedMonths && syncStatus.historicalSync.completedMonths.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-600">
                          {syncStatus.historicalSync.completedMonths.length} Monate vervollständigt
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {syncStatus.historicalSync.completedMonths.slice(0, 10).map((month, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {month}
                            </Badge>
                          ))}
                          {syncStatus.historicalSync.completedMonths.length > 10 && (
                            <Badge variant="outline" className="text-xs">
                              +{syncStatus.historicalSync.completedMonths.length - 10} weitere
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* Machines Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <Package className="h-4 w-4 mr-2 text-green-600" />
                        Maschinen
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {syncStatus?.machines?.count?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <Progress 
                      value={100} 
                      className="h-2 mb-2" 
                    />
                    <p className="text-xs text-gray-500">
                      {syncStatus?.machines?.lastSync 
                        ? `Letzte Synchronisierung: ${formatDateTime(syncStatus.machines.lastSync)}`
                        : "Noch keine Synchronisierung durchgeführt"}
                    </p>
                  </Card>

                  {/* Products Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <Package className="h-4 w-4 mr-2 text-indigo-600" />
                        Produkte
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {syncStatus?.products?.count?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <Progress 
                      value={syncStatus?.products?.count ? 100 : 0} 
                      className="h-2 mb-2" 
                    />
                    <p className="text-xs text-gray-500">
                      {syncStatus?.products?.lastSync 
                        ? `Letzte Synchronisierung: ${formatDateTime(syncStatus.products.lastSync)}`
                        : "Noch keine Synchronisierung durchgeführt"}
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      Ziel: 130+ Produkte
                    </p>
                  </Card>

                  {/* Refills Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <RefreshCw className="h-4 w-4 mr-2 text-blue-600" />
                        Nachfüllungen
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {syncStatus?.refills?.count?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <Progress 
                      value={100} 
                      className="h-2 mb-2" 
                    />
                    <p className="text-xs text-gray-500">
                      {syncStatus?.refills?.lastSync 
                        ? `Letzte Synchronisierung: ${formatDateTime(syncStatus.refills.lastSync)}`
                        : "Noch keine Synchronisierung durchgeführt"}
                    </p>
                  </Card>

                  {/* Refill Details Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <RefreshCw className="h-4 w-4 mr-2 text-cyan-600" />
                        Nachfülldetails
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {syncStatus?.refillDetails?.count?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <Progress 
                      value={100} 
                      className="h-2 mb-2" 
                    />
                    <p className="text-xs text-gray-500">
                      {syncStatus?.refillDetails?.lastSync 
                        ? `Letzte Synchronisierung: ${formatDateTime(syncStatus.refillDetails.lastSync)}`
                        : "Noch keine Synchronisierung durchgeführt"}
                    </p>
                  </Card>

                  {/* Events Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
                        Ereignisse
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {syncStatus?.events?.count?.toLocaleString() || 0}
                      </Badge>
                    </div>
                    <Progress 
                      value={100} 
                      className="h-2 mb-2" 
                    />
                    <p className="text-xs text-gray-500">
                      {syncStatus?.events?.lastSync 
                        ? `Letzte Synchronisierung: ${formatDateTime(syncStatus.events.lastSync)}`
                        : "Noch keine Synchronisierung durchgeführt"}
                    </p>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Configuration Tab */}
            <TabsContent value="config">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sync Type Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="syncType">Synchronisierungstyp</Label>
                    <Select 
                      value={syncType} 
                      onValueChange={(value) => setSyncType(value as any)}
                    >
                      <SelectTrigger id="syncType">
                        <SelectValue placeholder="Synchronisierungstyp auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Vollständige Synchronisierung</SelectItem>
                        <SelectItem value="transactions">Nur Transaktionen</SelectItem>
                        <SelectItem value="machines">Nur Maschinen</SelectItem>
                        <SelectItem value="products">Nur Produkte</SelectItem>
                        <SelectItem value="events">Nur Ereignisse</SelectItem>
                        <SelectItem value="refills">Nur Nachfüllungen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Batch Size */}
                  <div className="space-y-2">
                    <Label htmlFor="batchSize">Batchgröße</Label>
                    <Select 
                      value={String(batchSize)} 
                      onValueChange={(value) => setBatchSize(parseInt(value))}
                    >
                      <SelectTrigger id="batchSize">
                        <SelectValue placeholder="Batchgröße auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50 Einträge pro Batch</SelectItem>
                        <SelectItem value="100">100 Einträge pro Batch</SelectItem>
                        <SelectItem value="250">250 Einträge pro Batch</SelectItem>
                        <SelectItem value="500">500 Einträge pro Batch</SelectItem>
                        <SelectItem value="1000">1000 Einträge pro Batch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Date Presets */}
                <div className="space-y-2">
                  <Label>Zeitraum</Label>
                  <Select 
                    value={datePreset} 
                    onValueChange={(value) => {
                      setDatePreset(value);
                      
                      const now = new Date();
                      let start = new Date();
                      let end = new Date();
                      
                      switch(value) {
                        case 'today':
                          // Heutiger Tag
                          start = new Date(now.setHours(0, 0, 0, 0));
                          break;
                        case 'yesterday':
                          // Gestern
                          start = new Date(now);
                          start.setDate(start.getDate() - 1);
                          start.setHours(0, 0, 0, 0);
                          end = new Date(now);
                          end.setDate(end.getDate() - 1);
                          end.setHours(23, 59, 59, 999);
                          break;
                        case 'last7days':
                          // Letzte 7 Tage
                          start = new Date(now);
                          start.setDate(start.getDate() - 7);
                          break;
                        case 'thisMonth':
                          // Aktueller Monat
                          start = new Date(now.getFullYear(), now.getMonth(), 1);
                          break;
                        case 'lastMonth':
                          // Letzter Monat
                          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                          end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                          break;
                        case 'thisYear':
                          // Aktuelles Jahr
                          start = new Date(now.getFullYear(), 0, 1);
                          break;
                        case 'allTime':
                          // Seit 01.01.2023
                          start = new Date(2023, 0, 1);
                          break;
                        case 'custom':
                          // Benutzerdefiniert - Kalender öffnen
                          setIsCalendarOpen(true);
                          return;
                      }
                      
                      setStartDate(start);
                      setEndDate(end);
                    }}
                  >
                    <SelectTrigger id="datePreset">
                      <SelectValue placeholder="Zeitraum auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Heute</SelectItem>
                      <SelectItem value="yesterday">Gestern</SelectItem>
                      <SelectItem value="last7days">Letzte 7 Tage</SelectItem>
                      <SelectItem value="thisMonth">Aktueller Monat</SelectItem>
                      <SelectItem value="lastMonth">Letzter Monat</SelectItem>
                      <SelectItem value="thisYear">Aktuelles Jahr</SelectItem>
                      <SelectItem value="allTime">Seit 01.01.2023</SelectItem>
                      <SelectItem value="custom">Benutzerdefiniert...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                {datePreset === 'custom' && (
                  <div className="space-y-2">
                    <Label>Benutzerdefinierter Datumsbereich</Label>
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate && endDate ? (
                            `${format(startDate, "dd.MM.yyyy", { locale: de })} - ${format(endDate, "dd.MM.yyyy", { locale: de })}`
                          ) : (
                            "Datumsbereich auswählen"
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="flex flex-col sm:flex-row gap-4 p-3">
                          <div className="space-y-2">
                            <Label htmlFor="startDate">Startdatum</Label>
                            <Calendar
                              mode="single"
                              selected={startDate}
                              onSelect={setStartDate}
                              initialFocus
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="endDate">Enddatum</Label>
                            <Calendar
                              mode="single"
                              selected={endDate}
                              onSelect={setEndDate}
                              initialFocus
                            />
                          </div>
                        </div>
                        <div className="border-t border-gray-200 p-3 flex justify-end">
                          <Button onClick={() => setIsCalendarOpen(false)}>Anwenden</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                
                {/* Historical Sync Option */}
                {syncType === 'transactions' && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="historicalSync" 
                        checked={isHistoricalSync}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            // Wenn historische Synchronisierung aktiviert wird, setze Startdatum auf 01.01.2023
                            setStartDate(new Date(2023, 0, 1));
                            setDatePreset('allTime');
                          }
                          setIsHistoricalSync(!!checked);
                        }}
                      />
                      <Label htmlFor="historicalSync" className="font-medium">
                        Historische Transaktionen (ab 01.01.2023)
                      </Label>
                    </div>
                    <p className="text-xs text-gray-500 pl-6">
                      Bei Aktivierung werden alle Transaktionen seit Januar 2023 synchronisiert.
                      Dies kann je nach Datenmenge einige Zeit in Anspruch nehmen.
                    </p>
                  </div>
                )}

                {/* API Request Preview */}
                {apiRequest && syncType !== 'all' && (
                  <div className="space-y-2 pt-2">
                    <Label>API-Anfrage Vorschau</Label>
                    <Card className="bg-gray-50 dark:bg-gray-900 border rounded-md">
                      <CardContent className="p-4">
                        <pre className="text-xs overflow-auto whitespace-pre-wrap">
                          {apiRequest}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Info text */}
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Hinweis</AlertTitle>
                  <AlertDescription>
                    Die Synchronisierung kann je nach Datenmenge einige Zeit in Anspruch nehmen. Der Fortschritt kann über den Status-Tab verfolgt werden.
                  </AlertDescription>
                </Alert>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button 
            onClick={handleSyncClick} 
            disabled={syncMutation.isPending}
            className="flex items-center"
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Synchronisierung läuft...
              </>
            ) : (
              <>
                {getSyncTypeIcon(syncType)}
                {getSyncTypeLabel(syncType)} Synchronisierung starten
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
