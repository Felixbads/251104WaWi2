import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// Lucide Icons
import { 
  Search, Plus, Trash2, RefreshCw, 
  CircleAlert, Warehouse, MonitorSmartphone,
  Save, X, CheckCircle2
} from 'lucide-react';

// UI-Komponenten
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Interface für die Zuordnungen
interface WarehouseMachineAssignment {
  id: number;
  warehouseId: number;
  warehouseName: string;
  machineId: number;
  machineName: string;
  machineType: string;
  location: string;
  isDefault: boolean;
  createdAt: string;
}

interface Machine {
  id: number;
  name: string;
  type: string;
  location: string;
}

interface Warehouse {
  id: number;
  name: string;
}

export default function WarehouseMachineAssignments() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  const [isDefault, setIsDefault] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Zuordnungen laden
  const { data: assignments, isLoading, error } = useQuery({
    queryKey: ['/api/warehouse-machine-assignments'],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });
  
  // Verfügbare Lager laden
  const { data: warehousesData = { data: [] }, isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  // Verfügbare Automaten laden
  const { data: machinesData = { data: [] }, isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  // Mutation zum Hinzufügen einer Zuordnung
  const addAssignmentMutation = useMutation({
    mutationFn: (newAssignment: any) => {
      return fetch('/api/warehouse-machine-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAssignment),
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse-machine-assignments'] });
      toast({
        title: "Zuordnung erstellt",
        description: "Die Zuordnung wurde erfolgreich erstellt.",
      });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen der Zuordnung: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation zum Löschen einer Zuordnung
  const deleteAssignmentMutation = useMutation({
    mutationFn: (id: number) => {
      return fetch(`/api/warehouse-machine-assignments/${id}`, {
        method: 'DELETE',
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse-machine-assignments'] });
      toast({
        title: "Zuordnung gelöscht",
        description: "Die Zuordnung wurde erfolgreich gelöscht.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Löschen der Zuordnung: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Formular zurücksetzen
  const resetForm = () => {
    setSelectedWarehouse('');
    setSelectedMachine('');
    setIsDefault(false);
  };

  // Zuordnung hinzufügen
  const handleAddAssignment = () => {
    if (!selectedWarehouse || !selectedMachine) {
      toast({
        title: "Unvollständige Daten",
        description: "Bitte wählen Sie ein Lager und einen Automaten aus.",
        variant: "destructive",
      });
      return;
    }

    addAssignmentMutation.mutate({
      warehouseId: parseInt(selectedWarehouse),
      machineId: parseInt(selectedMachine),
      isDefault,
    });
  };

  // Zuordnung löschen
  const handleDeleteAssignment = (id: number) => {
    if (confirm("Möchten Sie diese Zuordnung wirklich löschen?")) {
      deleteAssignmentMutation.mutate(id);
    }
  };

  // Nach Lager oder Automat filtern
  const filteredAssignments = Array.isArray(assignments) 
    ? assignments.filter((assignment: WarehouseMachineAssignment) => {
        if (searchTerm === '') return true;
        
        const searchLower = searchTerm.toLowerCase();
        return (
          assignment.warehouseName.toLowerCase().includes(searchLower) ||
          assignment.machineName.toLowerCase().includes(searchLower) ||
          assignment.location.toLowerCase().includes(searchLower)
        );
      })
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <CardTitle>Lager-Automaten Zuordnungen</CardTitle>
              <CardDescription>
                Verwalten Sie, welche Automaten aus welchen Lagern befüllt werden
              </CardDescription>
            </div>
            <Button onClick={() => setIsDialogOpen(true)} className="self-start flex items-center gap-2">
              <Plus className="h-4 w-4" /> Zuordnung erstellen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Suchleiste */}
          <div className="mb-4 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Nach Lager oder Automat suchen..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Zuordnungstabelle */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <CircleAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Fehler beim Laden der Zuordnungen</p>
              <Button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/warehouse-machine-assignments'] })}
                variant="outline"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Erneut versuchen
              </Button>
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="text-center py-8">
              <div className="flex justify-center items-center mb-4">
                <Warehouse className="h-10 w-10 text-gray-300" />
                <div className="mx-2 text-gray-300 text-2xl">→</div>
                <MonitorSmartphone className="h-10 w-10 text-gray-300" />
              </div>
              <p className="text-gray-500 mb-4">
                {searchTerm 
                  ? `Keine Zuordnungen gefunden für "${searchTerm}"` 
                  : 'Keine Zuordnungen vorhanden'}
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Neue Zuordnung erstellen
              </Button>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lager</TableHead>
                    <TableHead>Automat</TableHead>
                    <TableHead>Standort</TableHead>
                    <TableHead className="text-center">Standard</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map((assignment: WarehouseMachineAssignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <div className="font-medium">{assignment.warehouseName}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{assignment.machineName}</div>
                        <div className="text-xs text-muted-foreground">
                          {assignment.machineType}
                        </div>
                      </TableCell>
                      <TableCell>{assignment.location}</TableCell>
                      <TableCell className="text-center">
                        {assignment.isDefault ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteAssignment(assignment.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog zum Hinzufügen einer neuen Zuordnung */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Lager-Automaten Zuordnung</DialogTitle>
            <DialogDescription>
              Weisen Sie einem Automaten ein Lager zu, aus dem der Automat befüllt wird.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Lager</label>
              <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Lager auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingWarehouses ? (
                    <div className="p-2">Lädt Lager...</div>
                  ) : (
                    (warehousesData.data || []).map((warehouse: Warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                        {warehouse.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Automat</label>
              <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Automat auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingMachines ? (
                    <div className="p-2">Lädt Automaten...</div>
                  ) : (
                    (machinesData.data || []).map((machine: Machine) => (
                      <SelectItem key={machine.id} value={machine.id.toString()}>
                        {machine.name} ({machine.location})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="isDefault" className="text-sm font-medium cursor-pointer">
                Als Standard-Lager für diesen Automaten festlegen
              </label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleAddAssignment}
              disabled={!selectedWarehouse || !selectedMachine || addAssignmentMutation.isPending}
            >
              {addAssignmentMutation.isPending ? (
                <>Wird gespeichert...</>
              ) : (
                <>Zuordnung speichern</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}