import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format, subDays, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Loader2, FileText, Info, AlertCircle, Download, Database } from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import axios from 'axios';

export default function BulkSyncTab() {
  const { toast } = useToast();
  
  // State für Datum und Batch-Größe
  const [startDate, setStartDate] = useState<Date | undefined>(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [batchSize, setBatchSize] = useState<string>("100");
  const [forceUpdate, setForceUpdate] = useState<boolean>(false);
  
  // Status des Export/Import-Prozesses
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported' | 'error'>('idle');
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'imported' | 'error'>('idle');
  
  // API für Bulk-Export
  const exportMutation = useMutation({
    mutationFn: async () => {
      setExportStatus('exporting');
      try {
        const response = await axios.post('/api/bulk/export', {
          startDate,
          endDate,
          batchSize: parseInt(batchSize)
        });
        return response.data;
      } catch (error) {
        setExportStatus('error');
        throw error;
      }
    },
    onSuccess: () => {
      setExportStatus('exported');
      toast({
        title: 'Export gestartet',
        description: 'Der Export wurde im Hintergrund gestartet. Sie können den Fortschritt in den Logs verfolgen.',
        variant: 'default'
      });
      
      // Nach 2 Sekunden den Dateistatus aktualisieren
      setTimeout(() => {
        exportFilesQuery.refetch();
      }, 2000);
    },
    onError: (error) => {
      setExportStatus('error');
      toast({
        title: 'Export fehlgeschlagen',
        description: `Fehler beim Starten des Exports: ${error.message}`,
        variant: 'destructive'
      });
    }
  });
  
  // Query für exportierte Dateien
  const exportFilesQuery = useQuery({
    queryKey: ['/api/bulk/export/status'],
    queryFn: async () => {
      const response = await axios.get('/api/bulk/export/status');
      return response.data;
    },
    refetchInterval: exportStatus === 'exporting' ? 5000 : false
  });
  
  // API für Bulk-Import
  const importMutation = useMutation({
    mutationFn: async (filePath: string) => {
      setImportStatus('importing');
      try {
        const response = await axios.post('/api/bulk/import', {
          filePath,
          forceUpdate
        });
        return response.data;
      } catch (error) {
        setImportStatus('error');
        throw error;
      }
    },
    onSuccess: () => {
      setImportStatus('imported');
      toast({
        title: 'Import gestartet',
        description: 'Der Import wurde im Hintergrund gestartet. Sie können den Fortschritt in den Logs verfolgen.',
        variant: 'default'
      });
    },
    onError: (error) => {
      setImportStatus('error');
      toast({
        title: 'Import fehlgeschlagen',
        description: `Fehler beim Starten des Imports: ${error.message}`,
        variant: 'destructive'
      });
    }
  });
  
  // Handler für Export-Button
  const handleExport = () => {
    if (!startDate || !endDate) {
      toast({
        title: 'Eingabe fehlt',
        description: 'Bitte geben Sie ein Start- und Enddatum an.',
        variant: 'destructive'
      });
      return;
    }
    
    exportMutation.mutate();
  };
  
  // Handler für Import-Button
  const handleImport = (filePath: string) => {
    importMutation.mutate(filePath);
  };
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bulk-Transaktions-Synchronisierung</CardTitle>
          <CardDescription>
            Exportieren und importieren Sie Transaktionen im Bulk-Modus für große Zeiträume
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Startdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    id="startDate"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? (
                      format(startDate, 'P', { locale: de })
                    ) : (
                      <span>Startdatum wählen</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">Enddatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    id="endDate"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? (
                      format(endDate, 'P', { locale: de })
                    ) : (
                      <span>Enddatum wählen</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="batchSize">Batch-Größe</Label>
              <Select 
                value={batchSize} 
                onValueChange={setBatchSize}
              >
                <SelectTrigger id="batchSize">
                  <SelectValue placeholder="Batch-Größe auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 Transaktionen</SelectItem>
                  <SelectItem value="100">100 Transaktionen</SelectItem>
                  <SelectItem value="200">200 Transaktionen</SelectItem>
                  <SelectItem value="500">500 Transaktionen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="forceUpdate" className="flex items-center space-x-2">
              <span>Force Update</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="h-4 w-4 p-0 ml-1">
                    <Info className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-2 text-xs">
                  Aktivieren Sie diese Option, um bestehende Transaktionen beim Import zu aktualisieren. Ansonsten werden nur neue Transaktionen importiert.
                </PopoverContent>
              </Popover>
            </Label>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="forceUpdate"
                checked={forceUpdate}
                onChange={(e) => setForceUpdate(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="forceUpdate" className="text-sm text-gray-700 dark:text-gray-300">
                {forceUpdate ? "Aktiviert (bestehende Datensätze werden überschrieben)" : "Deaktiviert (nur neue Datensätze werden hinzugefügt)"}
              </label>
            </div>
          </div>
          
          <div className="pt-4">
            <Button 
              onClick={handleExport}
              disabled={exportMutation.isPending || !startDate || !endDate}
              className="flex items-center"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Export wird gestartet...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" />
                  Transaktionen exportieren
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Exportierte Dateien */}
      <Card>
        <CardHeader>
          <CardTitle>Exportierte Dateien</CardTitle>
          <CardDescription>
            Liste der exportierten Transaktionsdateien, die für den Import verfügbar sind
          </CardDescription>
        </CardHeader>
        <CardContent>
          {exportFilesQuery.isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Lade Dateien...</span>
            </div>
          ) : exportFilesQuery.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Fehler</AlertTitle>
              <AlertDescription>
                Die Dateien konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
              </AlertDescription>
            </Alert>
          ) : exportFilesQuery.data?.files?.length === 0 ? (
            <div className="text-center p-4 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p>Keine exportierten Dateien vorhanden</p>
              <p className="text-sm mt-1">Starten Sie einen Export, um Dateien zu erstellen</p>
            </div>
          ) : (
            <div className="space-y-4">
              {exportFilesQuery.data?.files?.map((file: any) => (
                <div 
                  key={file.name} 
                  className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex-1 mb-3 md:mb-0">
                    <h4 className="font-medium">{file.name}</h4>
                    <div className="text-sm text-gray-500 mt-1">
                      <p>Größe: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      <p>Erstellt: {new Date(file.created).toLocaleString('de-DE')}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleImport(file.path)}
                    disabled={importMutation.isPending}
                    variant="outline"
                    className="w-full md:w-auto"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="mr-2 h-4 w-4" />
                    )}
                    In Datenbank importieren
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Alert className="bg-gray-50 dark:bg-gray-800 mt-4">
        <Info className="h-4 w-4" />
        <AlertTitle>Hinweis zur Bulk-Synchronisierung</AlertTitle>
        <AlertDescription>
          <p className="text-sm mt-1">
            Der Bulk-Export-Prozess lädt alle Transaktionen aus dem gewählten Zeitraum und speichert sie in einer JSON-Datei. Diese Datei können Sie dann in die Datenbank importieren. 
            Dies ist besonders nützlich für große Zeiträume, bei denen die normale Synchronisierung zeitlich scheitern würde.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}