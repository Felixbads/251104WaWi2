import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CalendarIcon, AlertCircle, Clock, HistoryIcon } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { triggerHistoricalSync } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function HistoricalSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State für Optionen
  const [startDate, setStartDate] = useState<Date | undefined>(new Date(2022, 5, 1)); // 1. Juni 2022
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [batchSize, setBatchSize] = useState<number>(100);
  const [maxTransactions, setMaxTransactions] = useState<number>(10000);
  const [syncStep, setSyncStep] = useState<number>(30);
  const [forceUpdate, setForceUpdate] = useState<boolean>(false);
  
  // Kalender-Popover-States
  const [startDateOpen, setStartDateOpen] = useState<boolean>(false);
  const [endDateOpen, setEndDateOpen] = useState<boolean>(false);
  
  // Zustand für API-Response und Preview
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [syncProgress, setSyncProgress] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });
  
  // Mutation für historische Synchronisierung
  const historicalSyncMutation = useMutation({
    mutationFn: () => {
      // Setze den Status auf 'loading'
      setSyncProgress({
        status: 'loading',
        message: 'Historische Synchronisierung wird gestartet...'
      });
      
      // Erstelle die Optionen aus den Formularfeldern
      const options = {
        startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
        endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
        batchSize,
        maxTransactions,
        syncStep,
        forceUpdate
      };
      
      // Rufe die API-Funktion auf
      return triggerHistoricalSync(options);
    },
    onSuccess: (data) => {
      // Setze die API-Antwort und aktualisiere den Status
      setApiResponse(data);
      setSyncProgress({
        status: 'success',
        message: 'Historische Synchronisierung erfolgreich gestartet'
      });
      
      // Aktualisiere die Abfragen für Synchronisierungsstatus und -logs
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sync/logs'] });
      
      // Zeige eine Erfolgsmeldung
      toast({
        title: 'Historische Synchronisierung gestartet',
        description: `Die historische Synchronisierung wurde erfolgreich gestartet. Sync-Log-ID: ${data.syncLogId}`,
        variant: 'success',
      });
    },
    onError: (error) => {
      // Setze den Status auf 'error'
      setSyncProgress({
        status: 'error',
        message: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten'
      });
      
      // Zeige eine Fehlermeldung
      toast({
        title: 'Fehler bei der historischen Synchronisierung',
        description: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten',
        variant: 'destructive',
      });
    },
  });
  
  // Handler zum Starten der Synchronisierung
  const handleStartSync = () => {
    if (historicalSyncMutation.isPending) return;
    historicalSyncMutation.mutate();
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Linke Seite: Konfigurationsoptionen */}
        <Card>
          <CardHeader>
            <CardTitle>Historische Synchronisierung</CardTitle>
            <CardDescription>
              Hier können Sie eine historische Synchronisierung von Vendon-Transaktionen starten.
              Die Standardeinstellungen rufen alle Transaktionen seit dem 1. Juni 2022 ab.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Startdatum */}
            <div className="space-y-2">
              <Label htmlFor="startDate">Startdatum</Label>
              <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    id="startDate"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP', { locale: de }) : 'Startdatum auswählen'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      setStartDateOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Enddatum */}
            <div className="space-y-2">
              <Label htmlFor="endDate">Enddatum</Label>
              <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    id="endDate"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP', { locale: de }) : 'Enddatum auswählen'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      setEndDateOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Batch-Größe */}
            <div className="space-y-2">
              <Label htmlFor="batchSize">Batch-Größe (1-100)</Label>
              <Input
                id="batchSize"
                type="number"
                min={1}
                max={100}
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
              />
              <small className="text-gray-500">
                Anzahl der Transaktionen pro API-Anfrage. Maximum: 100
              </small>
            </div>
            
            {/* Maximale Transaktionen */}
            <div className="space-y-2">
              <Label htmlFor="maxTransactions">Maximale Transaktionen pro Zeitraum</Label>
              <Input
                id="maxTransactions"
                type="number"
                min={100}
                value={maxTransactions}
                onChange={(e) => setMaxTransactions(parseInt(e.target.value) || 10000)}
              />
              <small className="text-gray-500">
                Maximale Anzahl der Transaktionen, die pro Zeitraum abgerufen werden sollen.
              </small>
            </div>
            
            {/* Synchronisierungsschritt (Tage) */}
            <div className="space-y-2">
              <Label htmlFor="syncStep">Synchronisierungsschritt (Tage)</Label>
              <Input
                id="syncStep"
                type="number"
                min={1}
                max={365}
                value={syncStep}
                onChange={(e) => setSyncStep(parseInt(e.target.value) || 30)}
              />
              <small className="text-gray-500">
                Anzahl der Tage, die pro Synchronisierungsschritt verarbeitet werden.
              </small>
            </div>
            
            {/* Force Update Option */}
            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="forceUpdate"
                checked={forceUpdate}
                onCheckedChange={setForceUpdate}
              />
              <Label htmlFor="forceUpdate">
                Bestehende Transaktionen aktualisieren
              </Label>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleStartSync}
              disabled={historicalSyncMutation.isPending}
              className="w-full"
            >
              {historicalSyncMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gestartet...
                </>
              ) : (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Historische Synchronisierung starten
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
        
        {/* Rechte Seite: Status und Informationen */}
        <Card>
          <CardHeader>
            <CardTitle>Synchronisierungsstatus</CardTitle>
            <CardDescription>
              Hier sehen Sie den Status der historischen Synchronisierung und eventuelle Vorschauen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status-Anzeige */}
            {syncProgress.status === 'loading' && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Wird ausgeführt</AlertTitle>
                <AlertDescription>
                  {syncProgress.message || 'Die historische Synchronisierung wird ausgeführt...'}
                </AlertDescription>
              </Alert>
            )}
            
            {syncProgress.status === 'success' && (
              <Alert className="bg-green-50 border-green-200">
                <AlertTitle>Erfolgreich</AlertTitle>
                <AlertDescription>
                  {syncProgress.message || 'Die historische Synchronisierung wurde erfolgreich gestartet.'}
                </AlertDescription>
              </Alert>
            )}
            
            {syncProgress.status === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Fehler</AlertTitle>
                <AlertDescription>
                  {syncProgress.message || 'Bei der historischen Synchronisierung ist ein Fehler aufgetreten.'}
                </AlertDescription>
              </Alert>
            )}
            
            {/* API-Antwort */}
            {apiResponse && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">API-Antwort</h3>
                <div className="bg-gray-100 p-4 rounded-md overflow-auto max-h-[300px]">
                  <pre className="text-xs text-gray-800">
                    {JSON.stringify(apiResponse, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            
            {/* Informationen zur historischen Synchronisierung */}
            <div className="mt-6 bg-blue-50 p-4 rounded-md">
              <h3 className="text-lg font-medium text-blue-700 mb-2">Informationen</h3>
              <ul className="list-disc pl-5 text-sm text-blue-700 space-y-1">
                <li>
                  Die historische Synchronisierung erfolgt im Hintergrund und kann je nach Datenmenge einige Zeit in Anspruch nehmen.
                </li>
                <li>
                  Der Fortschritt und die Ergebnisse können in den Synchronisierungslogs eingesehen werden.
                </li>
                <li>
                  Die Synchronisierung wird schrittweise durchgeführt, um die API nicht zu überlasten.
                </li>
                <li>
                  Standardmäßig werden nur neue Transaktionen gespeichert. Mit der Option "Bestehende Transaktionen aktualisieren" werden auch bereits vorhandene Transaktionen aktualisiert.
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}