import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, Package, Truck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function MachineAssignments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Filterzustände
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  
  // Zustand für den Zuordnungsdialog
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [newAssignMachine, setNewAssignMachine] = useState<number | null>(null);
  const [newAssignWarehouse, setNewAssignWarehouse] = useState<number | null>(null);
  const [assignNotes, setAssignNotes] = useState('');
  
  // Mutation für das Löschen einer Zuordnung
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return apiRequest(`/api/machine-warehouse-assignments/${assignmentId}`, undefined, 'DELETE');
    },
    onSuccess: () => {
      // Invalidieren des Caches
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      
      toast({
        title: "Zuordnung entfernt",
        description: "Die Zuordnung wurde erfolgreich entfernt",
      });
    },
    onError: (error) => {
      console.error("Fehler beim Löschen der Zuordnung:", error);
      
      toast({
        title: "Fehler",
        description: `Die Zuordnung konnte nicht entfernt werden: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    },
  });
  
  // Funktion zum Löschen einer Zuordnung
  const handleDeleteAssignment = async (assignmentId: number) => {
    if (!confirm('Möchten Sie diese Zuordnung wirklich entfernen?')) {
      return;
    }
    
    console.log(`Lösche Zuordnung mit ID ${assignmentId}`);
    
    try {
      // Mutation auslösen
      deleteAssignmentMutation.mutate(assignmentId);
    } catch (error) {
      console.error("Fehler beim Entfernen der Zuordnung:", error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Beim Entfernen der Zuordnung ist ein Fehler aufgetreten.',
        variant: 'destructive'
      });
    }
  };
  
  // Abfrage der Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Abfrage der Automaten mit Deduplizierung
  const { data: machinesRaw, isLoading: machinesLoading } = useQuery({
    queryKey: ['/api/machines'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Dedupliziere Automaten nach ID (nur eindeutige Maschinen)
  const machines = machinesRaw ? Array.from(
    new Map(machinesRaw.map((machine: any) => [machine.id, machine])).values()
  ) : [];

  // Abfrage der Zuordnungen
  const { data: assignments, isLoading: assignmentsLoading, error } = useQuery({
    queryKey: ['/api/machine-warehouse-assignments', {
      warehouseId: selectedWarehouse !== 'all' ? parseInt(selectedWarehouse) : undefined,
      machineId: selectedMachine !== 'all' ? parseInt(selectedMachine) : undefined
    }],
    staleTime: 1000 * 30, // 30 Sekunden
  });
  
  // Abfrage der Maschinenprodukte für den aktuell ausgewählten Automaten
  const { data: machineProducts = [], isLoading: machineProductsLoading } = useQuery({
    queryKey: ['/api/machines', newAssignMachine, 'products'],
    enabled: !!newAssignMachine,
    queryFn: async () => {
      if (!newAssignMachine) return [];
      // Hier ist ein GET-Request, wir verwenden die korrekte Reihenfolge der Parameter
      const response = await apiRequest(`/api/machines/${newAssignMachine}/products`, undefined, 'GET');
      return Array.isArray(response) ? response : [];
    },
    staleTime: 1000 * 60, // 1 Minute
  });
  
  // Mutation für das Hinzufügen von Produkten zum Inventar eines Lagers
  const addInventoryItemsMutation = useMutation({
    mutationFn: async ({ warehouseId, products }: { warehouseId: number, products: any[] }) => {
      const promises = products.map(product => 
        apiRequest('/api/inventory', {
          warehouseId,
          productName: product.productName,
          quantity: 0, // Startmenge ist 0
          minQuantity: 5, // Standardwert für Mindestbestand
          notes: `Automatisch hinzugefügt bei Maschinenzuordnung am ${new Date().toLocaleDateString()}`
        }, 'POST')
      );
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast({
        title: 'Produkte hinzugefügt',
        description: 'Die Produkte aus dem Automaten wurden dem Lagerbestand hinzugefügt (Menge: 0).',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Hinzufügen der Produkte',
        description: error.message || 'Die Produkte aus dem Automaten konnten nicht zum Lagerbestand hinzugefügt werden.',
        variant: 'destructive'
      });
    }
  });
  
  // Mutation für das Erstellen einer neuen Zuordnung
  const createAssignmentMutation = useMutation({
    mutationFn: async (assignmentData: {
      machineId: number;
      warehouseId: number;
      isPrimary: boolean;
      notes?: string;
    }) => {
      try {
        console.log("Sende Zuordnungsdaten an API:", assignmentData);
        const result = await apiRequest('/api/machine-warehouse-assignments', assignmentData, 'POST');
        console.log("API-Antwort erhalten:", result);
        return result;
      } catch (error) {
        console.error("Fehler bei API-Anfrage:", error);
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      console.log("Erfolgreich erstellt:", data);
      
      // Alle relevanten Anfragen ungültig machen
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      
      // Auch die gefilterte Anfrage ungültig machen
      if (selectedWarehouse !== 'all') {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/machine-warehouse-assignments', { warehouseId: parseInt(selectedWarehouse) }] 
        });
      }
      
      // Die Inventarliste für das betroffene Lager aktualisieren
      queryClient.invalidateQueries({ 
        queryKey: ['/api/inventory', { warehouseId: variables.warehouseId }] 
      });
      
      // Erfolgsbenachrichtigung anzeigen
      toast({
        title: 'Zuordnung erstellt',
        description: 'Die Maschine wurde erfolgreich dem Lager zugeordnet'
      });
      
      // Dialog schließen und Zustand zurücksetzen
      setIsCreatingAssignment(false);
      closeAndResetDialog();
    },
    onError: (error) => {
      console.error("Fehler bei der Zuordnung:", error);
      setIsCreatingAssignment(false);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      });
    }
  });
  
  // Status und Handler für Zuordnungserstellung
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  
  // Hilfsfunktion zum Schließen und Zurücksetzen des Dialogs
  const closeAndResetDialog = () => {
    setIsAssignDialogOpen(false);
    setNewAssignMachine(null);
    setNewAssignWarehouse(null);
    setAssignNotes('');
  };
  
  // Handler für das Erstellen einer neuen Zuordnung
  const handleCreateAssignment = async () => {
    if (!newAssignMachine || !newAssignWarehouse) {
      toast({
        title: 'Eingaben unvollständig',
        description: 'Bitte wählen Sie sowohl einen Automaten als auch ein Lager aus.',
        variant: 'destructive'
      });
      return;
    }
    
    setIsCreatingAssignment(true); // Status auf "wird gespeichert" setzen
    
    // Zuordnungsdaten zusammenstellen
    const assignmentData = {
      machineId: newAssignMachine,
      warehouseId: newAssignWarehouse,
      isPrimary: true, // Setze als primäres Lager
      notes: assignNotes || undefined // Nur senden wenn nicht leer
    };
    
    console.log("Sende Zuordnungsdaten:", JSON.stringify(assignmentData));
    
    try {
      // Mutation auslösen
      await createAssignmentMutation.mutateAsync(assignmentData);
      
      // Erfolgsfall wird durch onSuccess im useMutation-Hook bereits behandelt
    } catch (error) {
      // Fehlerfall: Dialog trotzdem schließen, damit er nicht hängt
      console.error("Fehler beim Erstellen der Zuordnung:", error);
      setIsCreatingAssignment(false);
      closeAndResetDialog();
      
      toast({
        title: 'Fehler',
        description: 'Die Zuordnung konnte nicht erstellt werden. Es ist ein Fehler aufgetreten.',
        variant: 'destructive'
      });
    }
  };

  // Debug: Daten in der Konsole anzeigen, wenn sie sich ändern
  useEffect(() => {
    if (assignments) {
      console.log("Aktuelle Zuordnungen:", assignments);
    }
    if (machines) {
      console.log("Verfügbare Maschinen:", machines);
    }
    if (warehouses) {
      console.log("Verfügbare Lager:", warehouses);
    }
    
    // Debug: Query Parameters ausgeben
    console.log("Query params für Zuordnungen:", {
      warehouseId: selectedWarehouse !== 'all' ? parseInt(selectedWarehouse) : undefined,
      machineId: selectedMachine !== 'all' ? parseInt(selectedMachine) : undefined
    });
  }, [assignments, machines, warehouses, selectedWarehouse, selectedMachine]);

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
                {Array.isArray(warehouses) ? warehouses.map((warehouse: any) => (
                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                    {warehouse.name}
                  </SelectItem>
                )) : null}
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
                <SelectItem key="all" value="all">Alle Automaten</SelectItem>
                {Array.isArray(machines) ? machines.map((machine: any) => (
                  <SelectItem key={machine.id} value={machine.id.toString() || 'unknown'}>
                    {machine.machineName || machine.name || 'Unbekannter Automat'}
                  </SelectItem>
                )) : null}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Package className="mr-2 h-4 w-4" />
              Neue Zuordnung
            </Button>
          </DialogTrigger>
          
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neue Automaten-Lager-Zuordnung</DialogTitle>
              <DialogDescription>
                Ordnen Sie einen Automaten einem Lager zu. Die Zuordnung bestimmt, aus welchem Lager Produkte für den Automaten entnommen werden.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="assign-machine">Automat</Label>
                <Select
                  value={newAssignMachine?.toString() || ''}
                  onValueChange={(value) => setNewAssignMachine(parseInt(value))}
                >
                  <SelectTrigger id="assign-machine">
                    <SelectValue placeholder="Automat auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(machines) ? machines
                      .filter((machine: any) => {
                        if (newAssignWarehouse === null) return true;
                        // Nur Automaten anzeigen, die noch nicht diesem Lager zugeordnet sind
                        return !Array.isArray(assignments) || !assignments.some(
                          (assignment: any) => 
                            assignment.machineId === machine.id && 
                            assignment.warehouseId === newAssignWarehouse
                        );
                      })
                      .map((machine: any) => (
                        <SelectItem key={machine.id} value={machine.id.toString() || 'unknown'}>
                          {machine.machineName || machine.name || 'Unbekannter Automat'}
                        </SelectItem>
                      ))
                     : null}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="assign-warehouse">Lager</Label>
                <Select
                  value={newAssignWarehouse?.toString() || ''}
                  onValueChange={(value) => setNewAssignWarehouse(parseInt(value))}
                >
                  <SelectTrigger id="assign-warehouse">
                    <SelectValue placeholder="Lager auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(warehouses) ? warehouses
                      .filter((warehouse: any) => warehouse.isActive)
                      .map((warehouse: any) => (
                        <SelectItem key={warehouse.id} value={warehouse.id.toString() || 'unknown'}>
                          {warehouse.name || 'Unbekanntes Lager'}
                        </SelectItem>
                      ))
                     : null}
                  </SelectContent>
                </Select>
              </div>
              

              
              <div className="space-y-2">
                <Label htmlFor="notes">Notizen (optional)</Label>
                <Input
                  id="notes"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Notizen zur Zuordnung"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={closeAndResetDialog}>
                Abbrechen
              </Button>
              <Button 
                onClick={handleCreateAssignment}
                disabled={isCreatingAssignment || !newAssignMachine || !newAssignWarehouse}
              >
                {isCreatingAssignment ? 'Wird gespeichert...' : 'Zuordnung erstellen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Hauptinhalt */}
      {!assignments || (Array.isArray(assignments) && assignments.length === 0) ? (
        <div className="text-center p-8 border rounded-lg">
          <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Zuordnungen gefunden</h3>
          <p className="text-muted-foreground mb-4">
            {selectedWarehouse !== 'all' || selectedMachine !== 'all'
              ? "Es wurden keine Zuordnungen gefunden, die den Filterkriterien entsprechen."
              : "Es wurden noch keine Lager den Automaten zugeordnet."}
          </p>
          <Button onClick={() => setIsAssignDialogOpen(true)}>
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
                <TableHead>Notizen</TableHead>
                <TableHead className="text-right">Aktualisiert</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(assignments) && assignments.map((assignment: any) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">
                    {assignment.machineName || "Unbekannter Automat"}
                  </TableCell>
                  <TableCell>{assignment.warehouseName || "Unbekanntes Lager"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {assignment.notes || "-"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {assignment.updatedAt 
                      ? new Date(assignment.updatedAt).toLocaleDateString('de-DE')
                      : new Date(assignment.createdAt).toLocaleDateString('de-DE')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          toast({
                            title: "Hinweis",
                            description: "Das Bearbeiten vorhandener Zuordnungen ist derzeit nicht verfügbar. Bitte löschen Sie die Zuordnung und erstellen Sie eine neue.",
                          });
                        }}
                      >
                        Bearbeiten
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDeleteAssignment(assignment.id)}
                      >
                        Entfernen
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}