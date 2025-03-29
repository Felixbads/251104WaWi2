import { useState } from "react";
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
import { CalendarIcon, Database, FileText, Package, AlertCircle, Clock, RefreshCw, Loader2 } from "lucide-react";
import { getSyncStatus, triggerSync, formatDateTime } from "@/lib/api";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { SyncStatus } from "@/lib/types";

export default function Synchronization() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncType, setSyncType] = useState<'machines' | 'transactions' | 'events' | 'refills' | 'all'>('all');
  const [batchSize, setBatchSize] = useState<number>(100);
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().setDate(new Date().getDate() - 7)) // 7 days ago
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Fetch sync status
  const { data: syncStatus, isLoading, error } = useQuery<SyncStatus>({
    queryKey: ['/api/sync/status'],
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => 
      triggerSync(syncType, {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        batchSize
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/logs'] });
      toast({
        title: "Synchronisierung gestartet",
        description: `Die ${getSyncTypeLabel(syncType)}-Synchronisierung wurde erfolgreich gestartet.`,
        variant: "success",
      });
    },
    onError: (error) => {
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
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Fehler</AlertTitle>
                  <AlertDescription>
                    {error instanceof Error ? error.message : "Fehler beim Laden des Synchronisierungsstatus."}
                  </AlertDescription>
                </Alert>
              ) : isLoading ? (
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
                  {/* Transactions Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-primary-600" />
                        Transaktionen
                      </h3>
                      <span className="text-xs font-medium text-primary-700 bg-primary-100 rounded-full py-0.5 px-2">
                        {syncStatus?.transactions?.count || 0} / {syncStatus?.transactions?.count || 0}
                      </span>
                    </div>
                    <Progress 
                      value={100} 
                      className="h-2 mb-2" 
                    />
                    <p className="text-xs text-gray-500">
                      {syncStatus?.transactions?.lastSync 
                        ? `Letzte Synchronisierung: ${formatDateTime(syncStatus.transactions.lastSync)}`
                        : "Noch keine Synchronisierung durchgeführt"}
                    </p>
                    {syncStatus?.transactions?.latest && (
                      <p className="text-xs text-gray-500 mt-1">
                        Letzte Transaktion: {formatDateTime(syncStatus.transactions.latest)}
                      </p>
                    )}
                  </Card>

                  {/* Machines Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <Package className="h-4 w-4 mr-2 text-green-600" />
                        Maschinen
                      </h3>
                      <span className="text-xs font-medium text-primary-700 bg-primary-100 rounded-full py-0.5 px-2">
                        {syncStatus?.machines?.count || 0} / {syncStatus?.machines?.count || 0}
                      </span>
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

                  {/* Refills Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <RefreshCw className="h-4 w-4 mr-2 text-blue-600" />
                        Nachfüllungen
                      </h3>
                      <span className="text-xs font-medium text-primary-700 bg-primary-100 rounded-full py-0.5 px-2">
                        {syncStatus?.refills?.count || 0} / {syncStatus?.refills?.count || 0}
                      </span>
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

                  {/* Events Status */}
                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-medium flex items-center">
                        <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
                        Ereignisse
                      </h3>
                      <span className="text-xs font-medium text-primary-700 bg-primary-100 rounded-full py-0.5 px-2">
                        {syncStatus?.events?.count || 0} / {syncStatus?.events?.count || 0}
                      </span>
                    </div>
                    <Progress 
                      value={getProgressPercentage(syncStatus?.events?.count || 0, syncStatus?.events?.count || 0)} 
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

                {/* Date Range */}
                <div className="space-y-2">
                  <Label>Datumsbereich</Label>
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
