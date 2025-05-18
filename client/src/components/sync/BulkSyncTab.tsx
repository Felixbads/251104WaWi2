import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { format, parse, parseISO, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar as CalendarIcon, Download, Upload, RefreshCw, AlertCircle, CheckCircle, Clock, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface BulkSyncProps {}

interface ExportFile {
  name: string;
  path: string;
  size: number;
  created: string;
  modified: string;
}

const BulkSyncTab: React.FC<BulkSyncProps> = () => {
  const queryClient = useQueryClient();
  
  // State für Datum und Export-Optionen
  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: new Date(new Date().setMonth(new Date().getMonth() - 3)),
    to: new Date()
  });
  
  const [batchSize, setBatchSize] = useState<number>(100);
  const [forceUpdate, setForceUpdate] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('export');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  
  // Query für Export-Dateien
  const exportFilesQuery = useQuery({
    queryKey: ['/api/bulk/export/status'],
    queryFn: async () => {
      const response = await axios.get('/api/bulk/export/status');
      return response.data;
    },
    refetchInterval: 10000 // Alle 10 Sekunden aktualisieren während des Exports
  });
  
  // Export-Mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!dateRange.from || !dateRange.to) {
        throw new Error('Bitte wählen Sie einen gültigen Datumsbereich');
      }
      
      const response = await axios.post('/api/bulk/export', {
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        batchSize
      });
      
      return response.data;
    },
    onSuccess: () => {
      // Aktualisiere die Liste der Export-Dateien
      queryClient.invalidateQueries({ queryKey: ['/api/bulk/export/status'] });
    }
  });
  
  // Import-Mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFilePath) {
        throw new Error('Bitte wählen Sie eine Datei zum Importieren');
      }
      
      const response = await axios.post('/api/bulk/import', {
        filePath: selectedFilePath,
        forceUpdate
      });
      
      return response.data;
    },
    onSuccess: () => {
      // Aktualisiere die Transaktiondaten
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/database/stats'] });
    }
  });
  
  // Wenn Dateien geladen sind, wähle automatisch die neueste aus
  useEffect(() => {
    if (exportFilesQuery.data?.files && exportFilesQuery.data.files.length > 0) {
      setSelectedFilePath(exportFilesQuery.data.files[0].path);
    }
  }, [exportFilesQuery.data]);
  
  // Formatiere Dateigröße benutzerfreundlich
  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    } else if (sizeInBytes < 1024 * 1024) {
      return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    } else {
      return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
  };
  
  // Formatiere Datum benutzerfreundlich
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return format(date, 'PPpp', { locale: de });
    } catch (error) {
      return dateString;
    }
  };
  
  // Extrahiere Datumsbereich aus Dateinamen
  const getDateRangeFromFilename = (filename: string): string => {
    try {
      const match = filename.match(/transactions_(.+?)_(.+?)\.json/);
      if (match) {
        const startDate = match[1].replace(/-/g, ':').replace(/_/g, 'T');
        const endDate = match[2].replace(/-/g, ':').replace(/_/g, 'T');
        
        return `${new Date(startDate).toLocaleDateString('de-DE')} bis ${new Date(endDate).toLocaleDateString('de-DE')}`;
      }
    } catch (error) {
      // Bei Fehler einfach den Original-Dateinamen zurückgeben
    }
    
    return filename;
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk-Synchronisation</CardTitle>
        <CardDescription>
          Zweistufige Synchronisation von Transaktionen: Erst Export, dann Import.
          Dieser Ansatz löst Probleme mit der Paginierung bei der Vendon-API.
        </CardDescription>
      </CardHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="export">1. Export</TabsTrigger>
          <TabsTrigger value="import">2. Import</TabsTrigger>
        </TabsList>
        
        <TabsContent value="export" className="space-y-4">
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="date-range">Zeitraum</Label>
                <div className="flex space-x-2">
                  <div className="space-y-1">
                    <Label htmlFor="start-date">Von</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={dateRange.from.toISOString().split('T')[0]}
                      onChange={(e) => setDateRange({
                        ...dateRange,
                        from: new Date(e.target.value)
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="end-date">Bis</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={dateRange.to.toISOString().split('T')[0]}
                      onChange={(e) => setDateRange({
                        ...dateRange,
                        to: new Date(e.target.value)
                      })}
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <Label htmlFor="batch-size">Batch-Größe</Label>
                <Input
                  id="batch-size"
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  min={10}
                  max={500}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Anzahl der Transaktionen pro API-Anfrage. Empfohlen: 100-200
                </p>
              </div>
            </div>
            
            <Button 
              className="w-full" 
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || !dateRange.from || !dateRange.to}
            >
              {exportMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Export läuft...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Transaktionen exportieren
                </>
              )}
            </Button>
            
            {exportMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Fehler</AlertTitle>
                <AlertDescription>
                  {exportMutation.error instanceof Error 
                    ? exportMutation.error.message 
                    : 'Ein Fehler ist aufgetreten'}
                </AlertDescription>
              </Alert>
            )}
            
            {exportMutation.isSuccess && (
              <Alert className="bg-green-50 text-green-800 border-green-200">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Export gestartet</AlertTitle>
                <AlertDescription>
                  Der Export wurde im Hintergrund gestartet. Die Datei wird unten angezeigt, sobald der Export abgeschlossen ist.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          
          <Separator />
          
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Verfügbare Export-Dateien</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => exportFilesQuery.refetch()}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Aktualisieren
                </Button>
              </div>
              
              {exportFilesQuery.isLoading ? (
                <div className="py-8 text-center">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground animate-pulse" />
                  <p className="text-sm text-muted-foreground">Lade Export-Dateien...</p>
                </div>
              ) : exportFilesQuery.isError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Fehler</AlertTitle>
                  <AlertDescription>
                    Fehler beim Laden der Export-Dateien
                  </AlertDescription>
                </Alert>
              ) : exportFilesQuery.data?.files?.length === 0 ? (
                <div className="py-8 text-center border rounded-md">
                  <p className="text-sm text-muted-foreground">Keine Export-Dateien vorhanden</p>
                  <p className="text-xs text-muted-foreground mt-1">Führen Sie einen Export durch, um Dateien zu erstellen</p>
                </div>
              ) : (
                <ScrollArea className="h-60 border rounded-md">
                  <div className="p-2 space-y-2">
                    {exportFilesQuery.data?.files?.map((file: ExportFile, index: number) => (
                      <div 
                        key={index}
                        className={cn(
                          "p-3 rounded-md cursor-pointer hover:bg-muted transition-colors",
                          selectedFilePath === file.path ? "bg-muted border-primary" : "border"
                        )}
                        onClick={() => setSelectedFilePath(file.path)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-sm truncate" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getDateRangeFromFilename(file.name)}
                            </p>
                          </div>
                          <p className="text-xs font-mono bg-muted px-2 py-1 rounded">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-2">
                          <span>Erstellt: {formatDate(file.created)}</span>
                          <span>Geändert: {formatDate(file.modified)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </TabsContent>
        
        <TabsContent value="import" className="space-y-4">
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="file-selection">Verfügbare Export-Dateien</Label>
                {exportFilesQuery.isLoading ? (
                  <div className="py-4 text-center">
                    <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground animate-pulse" />
                    <p className="text-sm text-muted-foreground">Lade Export-Dateien...</p>
                  </div>
                ) : exportFilesQuery.isError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Fehler</AlertTitle>
                    <AlertDescription>
                      Fehler beim Laden der Export-Dateien
                    </AlertDescription>
                  </Alert>
                ) : exportFilesQuery.data?.files?.length === 0 ? (
                  <div className="py-4 text-center border rounded-md">
                    <p className="text-sm text-muted-foreground">Keine Export-Dateien vorhanden</p>
                    <p className="text-xs text-muted-foreground mt-1">Wechseln Sie zum Export-Tab, um Daten zu exportieren</p>
                  </div>
                ) : (
                  <ScrollArea className="h-40 border rounded-md">
                    <div className="p-2 space-y-2">
                      {exportFilesQuery.data?.files?.map((file: ExportFile, index: number) => (
                        <div 
                          key={index}
                          className={cn(
                            "p-3 rounded-md cursor-pointer hover:bg-muted transition-colors",
                            selectedFilePath === file.path ? "bg-muted border-primary" : "border"
                          )}
                          onClick={() => setSelectedFilePath(file.path)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm truncate" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getDateRangeFromFilename(file.name)}
                              </p>
                            </div>
                            <p className="text-xs font-mono bg-muted px-2 py-1 rounded">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-2">
                            <span>Erstellt: {formatDate(file.created)}</span>
                            <span>Geändert: {formatDate(file.modified)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                
                {selectedFilePath && (
                  <div className="mt-2">
                    <Label htmlFor="selected-file">Ausgewählte Datei</Label>
                    <Input
                      id="selected-file"
                      value={selectedFilePath}
                      onChange={(e) => setSelectedFilePath(e.target.value)}
                      placeholder="Pfad zur JSON-Export-Datei"
                      disabled
                      className="mt-1"
                    />
                  </div>
                )}
                
                {!selectedFilePath && exportFilesQuery.data?.files?.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Bitte wählen Sie eine Export-Datei aus der Liste aus
                  </p>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="force-update"
                  checked={forceUpdate}
                  onCheckedChange={setForceUpdate}
                />
                <Label htmlFor="force-update">
                  Force Update (bereits existierende Transaktionen aktualisieren)
                </Label>
              </div>
            </div>
            
            <Button 
              className="w-full" 
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || !selectedFilePath}
            >
              {importMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Import läuft...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Transaktionen importieren
                </>
              )}
            </Button>
            
            {importMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Fehler</AlertTitle>
                <AlertDescription>
                  {importMutation.error instanceof Error 
                    ? importMutation.error.message 
                    : 'Ein Fehler ist aufgetreten'}
                </AlertDescription>
              </Alert>
            )}
            
            {importMutation.isSuccess && (
              <Alert className="bg-green-50 text-green-800 border-green-200">
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Import gestartet</AlertTitle>
                <AlertDescription>
                  Der Import wurde im Hintergrund gestartet. Sie können den Fortschritt in den Logs verfolgen.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          
          <Separator />
          
          <CardContent>
            <div className="space-y-4">
              <h3 className="font-medium">Import-Hinweise</h3>
              <div className="p-4 border rounded-md bg-blue-50 text-blue-800">
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>
                    Der Import-Prozess läuft asynchron im Hintergrund und kann je nach Datenmenge einige Zeit in Anspruch nehmen.
                  </li>
                  <li>
                    Mit der Option "Force Update" werden bereits existierende Transaktionen aktualisiert, ansonsten werden sie übersprungen.
                  </li>
                  <li>
                    Sie können den Fortschritt des Imports im Logs-Tab verfolgen.
                  </li>
                  <li>
                    Nach Abschluss des Imports sollten Sie auf dem Dashboard die aktualisierten Transaktionszahlen sehen.
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </TabsContent>
      </Tabs>
      
      <CardFooter className="flex flex-col items-start">
        <p className="text-xs text-muted-foreground">
          Die Bulk-Synchronisation ist eine zweistufige Lösung für die Begrenzung der Paginierung in der Vendon-API.
          Zuerst werden alle Transaktionen in eine JSON-Datei exportiert, und dann aus dieser Datei in die Datenbank importiert.
        </p>
      </CardFooter>
    </Card>
  );
};

export default BulkSyncTab;