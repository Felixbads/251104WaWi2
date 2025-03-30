import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, Package, Truck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function MachineAssignments() {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedMachine, setSelectedMachine] = useState<string>('all');

  // Abfrage der Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Abfrage der Automaten
  const { data: machines, isLoading: machinesLoading } = useQuery({
    queryKey: ['/api/machines'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Abfrage der Zuordnungen
  const { data: assignments, isLoading: assignmentsLoading, error } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments', {
      warehouseId: selectedWarehouse !== 'all' ? parseInt(selectedWarehouse) : undefined,
      machineId: selectedMachine !== 'all' ? parseInt(selectedMachine) : undefined
    }],
    staleTime: 1000 * 30, // 30 Sekunden
  });

  // Rendering bei Ladevorgang
  if (warehousesLoading || machinesLoading || assignmentsLoading) {
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
        <h3 className="font-medium text-destructive">Fehler beim Laden der Zuordnungen</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error)?.message || 'Beim Abrufen der Zuordnungen ist ein Fehler aufgetreten.'}
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
            <Label htmlFor="machine">Automat</Label>
            <Select 
              value={selectedMachine} 
              onValueChange={setSelectedMachine}
            >
              <SelectTrigger id="machine">
                <SelectValue placeholder="Alle Automaten" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Automaten</SelectItem>
                {machines?.map((machine: any) => (
                  <SelectItem key={machine.id} value={machine.id.toString()}>
                    {machine.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Button onClick={() => window.location.hash = 'new-assignment'}>
          <Package className="mr-2 h-4 w-4" />
          Neue Zuordnung
        </Button>
      </div>

      {/* Hauptinhalt */}
      {!assignments || assignments.length === 0 ? (
        <div className="text-center p-8 border rounded-lg">
          <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Zuordnungen gefunden</h3>
          <p className="text-muted-foreground mb-4">
            {selectedWarehouse !== 'all' || selectedMachine !== 'all'
              ? "Es wurden keine Zuordnungen gefunden, die den Filterkriterien entsprechen."
              : "Es wurden noch keine Lager den Automaten zugeordnet."}
          </p>
          <Button onClick={() => window.location.hash = 'new-assignment'}>
            Erste Zuordnung erstellen
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automat</TableHead>
                <TableHead>Lager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notizen</TableHead>
                <TableHead className="text-right">Aktualisiert</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment: any) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">
                    {assignment.machineName || "Unbekannter Automat"}
                  </TableCell>
                  <TableCell>{assignment.warehouseName || "Unbekanntes Lager"}</TableCell>
                  <TableCell>
                    {assignment.isPrimary ? (
                      <Badge variant="default">Primär</Badge>
                    ) : (
                      <Badge variant="outline">Sekundär</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {assignment.notes || "-"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {assignment.updatedAt 
                      ? new Date(assignment.updatedAt).toLocaleDateString('de-DE')
                      : new Date(assignment.createdAt).toLocaleDateString('de-DE')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {/* ToDo: Bearbeiten-Dialog öffnen */}}
                    >
                      Bearbeiten
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ToDo: Implementieren Sie die Dialoge für das Hinzufügen und Bearbeiten von Zuordnungen */}
    </div>
  );
}