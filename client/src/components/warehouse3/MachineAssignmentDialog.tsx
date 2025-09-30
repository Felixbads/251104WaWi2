import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Search, MonitorSmartphone, MapPin, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MachineAssignmentDialogProps {
  warehouseId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MachineAssignmentDialog({ 
  warehouseId, 
  onClose, 
  onSuccess 
}: MachineAssignmentDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachines, setSelectedMachines] = useState<number[]>([]);

  // Abrufen der nicht zugeordneten Automaten (nur echte Vendon-Automaten!)
  const { data: unassignedMachines = [], isLoading, isError } = useQuery({
    queryKey: ['/api/machines/unassigned'],
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0, // Keine Zwischenspeicherung
  });

  // Type für die API-Antwort - nur echte Vendon-Automaten
  const machines = (unassignedMachines as any[]) || [];
  
  console.log('🔍 Unassigned machines loaded:', machines.length, machines);

  // Mutation für die Zuordnung von Automaten
  const assignMachinesMutation = useMutation({
    mutationFn: async (machineIds: number[]) => {
      // Sende parallele POST-Anfragen für jeden Automaten
      const assignmentPromises = machineIds.map(machineId =>
        apiRequest(
          '/api/machine-warehouse-assignments',
          {
            machineId,
            warehouseId,
            isPrimary: true
          },
          'POST'
        )
      );

      // Verwende allSettled für robustere Fehlerbehandlung
      const results = await Promise.allSettled(assignmentPromises);
      
      // Zähle Erfolge und Fehler
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      return { successful, failed, total: machineIds.length };
    },
    onSuccess: (data) => {
      // Invalidiere relevante Caches
      queryClient.invalidateQueries({ queryKey: ['/api/machines/unassigned'] });
      queryClient.invalidateQueries({ queryKey: ['/api/machine-warehouse-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse3/warehouses', warehouseId] });
      
      if (data.failed > 0) {
        toast({
          title: "Teilweise erfolgreich",
          description: `${data.successful} von ${data.total} Automat(en) zugewiesen. ${data.failed} fehlgeschlagen.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Automaten zugewiesen",
          description: `${data.successful} Automat(en) erfolgreich zugewiesen.`,
        });
      }
      onSuccess();
    },
    onError: (error: any) => {
      console.error("Fehler beim Zuweisen der Automaten:", error);
      toast({
        title: "Fehler",
        description: "Die Automatenzuordnung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Filtere Automaten basierend auf dem Suchbegriff
  const filteredMachines = machines.filter((machine: any) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      machine.machine_name?.toLowerCase().includes(searchLower) ||
      machine.location_name?.toLowerCase().includes(searchLower) ||
      machine.vendon_id?.toString().includes(searchLower)
    );
  });

  // Toggle-Funktion für Automat-Auswahl
  const toggleMachine = (machineId: number) => {
    setSelectedMachines(prev => 
      prev.includes(machineId)
        ? prev.filter(id => id !== machineId)
        : [...prev, machineId]
    );
  };

  // Alle auswählen/abwählen
  const toggleAll = () => {
    if (selectedMachines.length === filteredMachines.length) {
      setSelectedMachines([]);
    } else {
      setSelectedMachines(filteredMachines.map((machine: any) => machine.id));
    }
  };

  // Handler für die Zuweisung
  const handleAssign = () => {
    if (selectedMachines.length === 0) {
      toast({
        title: "Keine Auswahl",
        description: "Bitte wählen Sie mindestens einen Automaten aus.",
        variant: "destructive",
      });
      return;
    }

    assignMachinesMutation.mutate(selectedMachines);
  };

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Lade verfügbare Automaten...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-6">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Fehler beim Laden der Automaten</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Suchfeld */}
      <div className="space-y-2">
        <Label htmlFor="search">Automaten suchen</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            placeholder="Nach Name, Standort oder Vendon-ID suchen..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Anzahl verfügbarer Automaten */}
      <div className="text-sm text-muted-foreground">
        {filteredMachines.length} verfügbare Automat(en) {searchTerm && `(gefiltert von ${machines.length})`}
      </div>

      {filteredMachines.length === 0 ? (
        <div className="text-center py-8">
          <MonitorSmartphone className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm 
              ? "Keine Automaten entsprechen Ihren Suchkriterien"
              : "Alle Automaten sind bereits Lagern zugewiesen"
            }
          </p>
        </div>
      ) : (
        <>
          {/* Alle auswählen Checkbox */}
          <div className="flex items-center space-x-2 pb-2 border-b">
            <Checkbox
              id="select-all"
              checked={selectedMachines.length === filteredMachines.length}
              onCheckedChange={toggleAll}
            />
            <Label htmlFor="select-all" className="text-sm font-medium">
              Alle auswählen ({filteredMachines.length})
            </Label>
          </div>

          {/* Automaten-Tabelle */}
          <div className="max-h-96 overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Auswahl</TableHead>
                  <TableHead>Automat</TableHead>
                  <TableHead>Vendon ID</TableHead>
                  <TableHead>Standort</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMachines.map((machine: any) => (
                  <TableRow key={machine.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedMachines.includes(machine.id)}
                        onCheckedChange={() => toggleMachine(machine.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{machine.machine_name || "Unbekannt"}</div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{machine.vendon_id || "–"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{machine.location_name || "Unbekannt"}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Ausgewählte Automaten */}
          {selectedMachines.length > 0 && (
            <div className="bg-muted/50 p-3 rounded-md">
              <p className="text-sm font-medium">
                {selectedMachines.length} Automat(en) ausgewählt
              </p>
            </div>
          )}
        </>
      )}

      {/* Dialog Footer */}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <Button 
          onClick={handleAssign}
          disabled={selectedMachines.length === 0 || assignMachinesMutation.isPending}
        >
          {assignMachinesMutation.isPending 
            ? "Zuweisen..." 
            : `${selectedMachines.length} Automat(en) zuweisen`
          }
        </Button>
      </DialogFooter>
    </div>
  );
}