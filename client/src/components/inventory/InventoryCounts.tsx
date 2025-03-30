import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, ClipboardCheck, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

// Hilfs-Komponente für Status-Badge
const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          <PlayCircle className="mr-1 h-3 w-3" /> Ausstehend
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          <ClipboardCheck className="mr-1 h-3 w-3" /> In Bearbeitung
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Abgeschlossen
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100">
          <XCircle className="mr-1 h-3 w-3" /> Abgebrochen
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function InventoryCounts() {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Abfrage der Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Abfrage der Inventuren
  const { data: inventoryCounts, isLoading: countsLoading, error } = useQuery({
    queryKey: ['/api/inventory-counts', {
      warehouseId: selectedWarehouse !== 'all' ? parseInt(selectedWarehouse) : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined
    }],
    staleTime: 1000 * 30, // 30 Sekunden
  });

  // Rendering bei Ladevorgang
  if (warehousesLoading || countsLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[200px]" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Rendering bei Fehler
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-center">
        <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
        <h3 className="font-medium text-destructive">Fehler beim Laden der Inventuren</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error)?.message || 'Beim Abrufen der Inventuren ist ein Fehler aufgetreten.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter-Bereich */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-auto">
          <div className="space-y-2">
            <Label htmlFor="warehouse">Lager</Label>
            <Select 
              value={selectedWarehouse} 
              onValueChange={setSelectedWarehouse}
            >
              <SelectTrigger id="warehouse">
                <SelectValue placeholder="Alle Lager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lager</SelectItem>
                {warehouses?.map((warehouse: any) => (
                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={selectedStatus} 
              onValueChange={setSelectedStatus}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                <SelectItem value="completed">Abgeschlossen</SelectItem>
                <SelectItem value="cancelled">Abgebrochen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Button onClick={() => window.location.hash = 'new-count'}>
          <ClipboardCheck className="mr-2 h-4 w-4" />
          Neue Inventur
        </Button>
      </div>

      {/* Hauptinhalt */}
      {!inventoryCounts || inventoryCounts.length === 0 ? (
        <div className="text-center p-8 border rounded-lg">
          <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Inventuren gefunden</h3>
          <p className="text-muted-foreground mb-4">
            {selectedWarehouse !== 'all' || selectedStatus !== 'all'
              ? "Es wurden keine Inventuren gefunden, die den Filterkriterien entsprechen."
              : "Es wurden noch keine Inventuren durchgeführt."}
          </p>
          <Button onClick={() => window.location.hash = 'new-count'}>
            Erste Inventur starten
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Lager</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Artikel</TableHead>
                <TableHead className="text-right">Differenzen</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventoryCounts.map((count: any) => (
                <TableRow key={count.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(count.createdAt).toLocaleDateString('de-DE')}
                    {count.status === 'completed' && count.endDate && (
                      <span className="block text-xs text-muted-foreground">
                        Abgeschlossen: {new Date(count.endDate).toLocaleString('de-DE')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{count.warehouseName || "Unbekanntes Lager"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {count.description || "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={count.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {count.itemCount || "0"}
                  </TableCell>
                  <TableCell className="text-right">
                    {count.differenceCount || "0"}
                    {count.totalDifference ? (
                      <span className={`block text-xs ${count.totalDifference > 0 ? 'text-green-600' : count.totalDifference < 0 ? 'text-red-600' : ''}`}>
                        {count.totalDifference > 0 ? '+' : ''}{count.totalDifference} Stück
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {/* ToDo: Detailansicht implementieren */}}
                    >
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ToDo: Implementieren Sie die Dialoge für das Hinzufügen und Bearbeiten von Inventuren */}
    </div>
  );
}