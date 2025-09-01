import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isBefore, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CircleAlert, ClockIcon, AlertTriangle, History, Package, InfoIcon, ArrowUpDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import BatchMovementsList from './BatchMovementsList';

type BatchDetailDialogProps = {
  batchId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function BatchDetailDialog({ 
  batchId,
  open, 
  onOpenChange
}: BatchDetailDialogProps) {
  const [activeTab, setActiveTab] = useState('details');
  
  // Hilfsfunktion zum sicheren Formatieren des Ablaufdatums
  const formatExpiryDate = (dateString?: string) => {
    if (!dateString) return 'Unbekannt';
    
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy', { locale: de });
    } catch (error) {
      console.error("Fehler beim Formatieren des Ablaufdatums:", error);
      return 'Ungültiges Datum';
    }
  };

  // Query für Batch-Details
  const { data: batch, isLoading, error } = useQuery<any>({
    queryKey: ['/api/product-batches', batchId],
    staleTime: 1000 * 30, // 30 Sekunden
    enabled: !!batchId && open,
  });

  // Status-Badge anzeigen, basierend auf Status und Ablaufdatum
  const getBatchStatusBadge = (batchData: any) => {
    if (!batchData) return null;
    
    const today = new Date();
    let expiryDate;
    try {
      // Prüfen, ob expiryDate existiert und ein gültiges Datum ist
      expiryDate = batchData.expiryDate ? parseISO(batchData.expiryDate) : null;
    } catch (error) {
      console.error("Fehler beim Parsen des Ablaufdatums:", error);
      expiryDate = null;
    }
    
    const thirtyDaysFromNow = addDays(today, 30);
    
    if (batchData.status === 'expired' || (expiryDate && isBefore(expiryDate, today))) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Abgelaufen
        </Badge>
      );
    } else if (batchData.status === 'consumed') {
      return (
        <Badge variant="outline" className="bg-slate-100 text-slate-800 hover:bg-slate-100 flex items-center gap-1">
          <History className="h-3 w-3" />
          Verbraucht
        </Badge>
      );
    } else if (batchData.status === 'quarantine') {
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Quarantäne
        </Badge>
      );
    } else if (expiryDate && isBefore(expiryDate, thirtyDaysFromNow)) {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 flex items-center gap-1">
          <ClockIcon className="h-3 w-3" />
          Läuft bald ab
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
          Aktiv
        </Badge>
      );
    }
  };

  // Handling für Dialog-Schließen
  const handleDialogClose = () => {
    onOpenChange(false);
    // Setze den aktiven Tab zurück, wenn der Dialog geschlossen wird
    setActiveTab('details');
  };

  // Render-Inhalt basierend auf Ladezustand und Daten
  const renderContent = () => {
    if (isLoading) {
      return <Skeleton className="h-[400px] w-full" />;
    }

    if (error) {
      return (
        <div className="rounded-md bg-destructive/15 p-4 text-center">
          <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
          <h3 className="font-medium text-destructive">Fehler beim Laden der Charge</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {(error as Error)?.message || 'Beim Abrufen der Charge ist ein Fehler aufgetreten.'}
          </p>
        </div>
      );
    }

    if (!batch) {
      return (
        <div className="text-center p-8">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Daten verfügbar</h3>
          <p className="text-muted-foreground">Die angeforderte Charge konnte nicht gefunden werden.</p>
        </div>
      );
    }

    return (
      <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="details" className="flex items-center">
            <InfoIcon className="mr-2 h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex items-center">
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Bewegungen
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Charge</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{batch?.batchNumber || 'N/A'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {batch?.supplierBatchNumber && `Lieferanten-Charge: ${batch.supplierBatchNumber}`}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {getBatchStatusBadge(batch)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Produkt</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold">{batch?.productName || 'Unbekanntes Produkt'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Lager</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold">{batch?.warehouseName || 'Unbekanntes Lager'}</div>
                {batch?.locationInWarehouse && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Lagerort: {batch.locationInWarehouse}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Menge</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{batch?.quantity || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">MHD</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold">
                  {formatExpiryDate(batch?.expiryDate)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Eingang</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold">
                  {formatExpiryDate(batch?.incomingDate)}
                </div>
              </CardContent>
            </Card>
          </div>

          {batch?.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Notizen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{batch.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="movements" className="pt-4">
          <h3 className="text-lg font-semibold mb-4">Bewegungen dieser Charge</h3>
          {batchId && <BatchMovementsList batchId={batchId} />}
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chargen-Details</DialogTitle>
          <DialogDescription>
            Detaillierte Informationen und Bewegungshistorie der Produktcharge.
          </DialogDescription>
        </DialogHeader>

        {renderContent()}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Schließen</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}