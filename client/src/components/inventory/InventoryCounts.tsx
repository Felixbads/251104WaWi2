import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ClipboardCheck, Search, FilterX, 
  Plus, RefreshCw, Calendar, Loader2, AlertTriangle, Save
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCaption, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Komponente für die Inventur-Verwaltung
export default function InventoryCounts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  
  // Zustand für den Dialog zur Erstellung einer neuen Inventur
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [inventoryNotes, setInventoryNotes] = useState('');

  // Lade Inventurdaten
  const {
    data: counts = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/inventory-counts', { 
      warehouseId: warehouseFilter ? parseInt(warehouseFilter) : undefined,
      status: statusFilter || undefined,
    }],
    staleTime: 1000 * 60 * 2, // 2 Minuten
  });

  // Lade Lagerdaten für das Dropdown
  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });
  
  // Mutation für das Erstellen einer neuen Inventur
  const createInventoryCountMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWarehouse) {
        throw new Error('Bitte wählen Sie ein Lager aus');
      }
      
      // API-Aufruf für das Erstellen einer neuen Inventur im Status "in_progress"
      return await fetch(`/api/inventory-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId: parseInt(selectedWarehouse),
          notes: inventoryNotes,
          status: 'in_progress' // Status auf "in Bearbeitung" setzen
        }),
      }).then(res => {
        if (!res.ok) throw new Error('Fehler beim Starten der Inventur');
        return res.json();
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      toast({
        title: "Inventur gestartet",
        description: "Die Inventur wurde erfolgreich gestartet. Sie können nun die Artikel-Bestände überprüfen.",
      });
      // Dialog schließen und Formular zurücksetzen
      setIsDialogOpen(false);
      setSelectedWarehouse('');
      setInventoryNotes('');
      
      // Zur Lagerdetailseite mit der neu erstellten Inventur navigieren
      if (data && data.warehouseId && data.id) {
        window.location.href = `/inventory/warehouse/${data.warehouseId}?tab=inventory-count&inventoryId=${data.id}`;
      } else {
        // Inventurdaten neu laden
        refetch();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Starten der Inventur",
        description: error.message || "Die Inventur konnte nicht gestartet werden.",
        variant: "destructive"
      });
    }
  });
  
  // Suche und Filterung
  const filteredCounts = Array.isArray(counts) ? counts.filter(count => {
    const matchesSearch = !searchTerm || 
      (count.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       count.description?.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesStatus = !statusFilter || count.status === statusFilter;
    const matchesWarehouse = !warehouseFilter || count.warehouseId === parseInt(warehouseFilter);
    
    return matchesSearch && matchesStatus && matchesWarehouse;
  }) : [];

  // Lade-Animation
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Inventurdaten werden geladen...</p>
      </div>
    );
  }
  
  // Fehlerbehandlung
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <h3 className="text-lg font-medium text-destructive">Fehler beim Laden der Inventuren</h3>
        <p className="text-muted-foreground mt-1">
          {(error as any).message || 'Unbekannter Fehler'}
        </p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }
  
  return (
    <div>
      {/* Filter und Suchleiste */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Inventur suchen..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchTerm('')}
            >
              <FilterX className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        
        <div className="w-full md:w-52">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
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
        
        <div className="w-full md:w-52">
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Alle Lager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Lager</SelectItem>
              {warehouses.map((warehouse: any) => (
                <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Neue Inventur
          </Button>
        </div>
      </div>
      
      {/* Inventurtabelle */}
      {filteredCounts.length === 0 ? (
        <div className="rounded-md bg-muted/50 p-8 text-center">
          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="text-lg font-medium">Keine Inventuren gefunden</h3>
          <p className="text-muted-foreground mt-1 mb-4">
            Es wurden keine Inventuren für die aktuelle Filterauswahl gefunden.
          </p>
          <Button
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Neue Inventur starten
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableCaption>
              {filteredCounts.length} Inventuren
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Inventur</TableHead>
                <TableHead>Lager</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-center">Fortschritt</TableHead>
                <TableHead className="text-center">Abweichungen</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCounts.map((count: any) => {
                // Berechne Fortschritt in Prozent
                const totalItems = count.totalItems || 0;
                const countedItems = count.countedItems || 0;
                const progressPercentage = totalItems > 0 
                  ? Math.min(100, Math.max(0, (countedItems / totalItems) * 100))
                  : 0;
                
                // Abweichungen
                const withDifference = count.withDifference || 0;
                const differencePercentage = totalItems > 0 && countedItems > 0
                  ? Math.min(100, Math.max(0, (withDifference / countedItems) * 100))
                  : 0;
                
                // Funktion zum Weiterleiten zur Lagerdetailseite mit aktiver Inventur
                const navigateToInventory = () => {
                  if (count.warehouseId) {
                    window.location.href = `/inventory/warehouse/${count.warehouseId}?tab=inventory-count&inventoryId=${count.id}`;
                  }
                };
                
                return (
                  <TableRow 
                    key={count.id} 
                    className="cursor-pointer hover:bg-muted/50" 
                    onClick={navigateToInventory}
                  >
                    <TableCell className="font-medium">
                      <div>
                        <div>{count.name}</div>
                        {count.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {count.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {count.warehouseName}
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center">
                        <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                        {count.scheduledDate && format(parseISO(count.scheduledDate), 'dd.MM.yyyy')}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex flex-col items-center">
                        <span className="text-sm mb-1">
                          {countedItems} / {totalItems} ({Math.round(progressPercentage)}%)
                        </span>
                        <Progress
                          value={progressPercentage}
                          className="h-2 w-full"
                        />
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex flex-col items-center">
                        <span className="text-sm mb-1">
                          {withDifference} / {countedItems} ({Math.round(differencePercentage)}%)
                        </span>
                        <Progress
                          value={differencePercentage}
                          className={`h-2 w-full ${
                            differencePercentage > 30 
                              ? 'bg-red-200' 
                              : differencePercentage > 10 
                                ? 'bg-amber-200' 
                                : 'bg-emerald-200'
                          }`}
                        />
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-right">
                      {count.status === 'pending' && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                          Ausstehend
                        </Badge>
                      )}
                      
                      {count.status === 'in_progress' && (
                        <Badge variant="default" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                          In Bearbeitung
                        </Badge>
                      )}
                      
                      {count.status === 'completed' && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                          Abgeschlossen
                        </Badge>
                      )}
                      
                      {count.status === 'cancelled' && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                          Abgebrochen
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      
      {/* Dialog für neue Inventur */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neue Inventur starten</DialogTitle>
            <DialogDescription>
              Wählen Sie das Lager aus, in dem Sie eine neue Inventur durchführen möchten.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="warehouse">Lager auswählen</Label>
              <Select 
                value={selectedWarehouse} 
                onValueChange={setSelectedWarehouse}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bitte wählen Sie ein Lager aus" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse: any) => (
                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notizen (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Notizen zur Inventur hinzufügen..."
                value={inventoryNotes}
                onChange={(e) => setInventoryNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button 
              onClick={() => createInventoryCountMutation.mutate()}
              disabled={createInventoryCountMutation.isPending || !selectedWarehouse}
            >
              {createInventoryCountMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird erstellt...
                </>
              ) : (
                <>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Inventur starten
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}