import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Warehouse, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

interface InventurStartenProps {
  onInventurGestartet: () => void;
}

export default function InventurStarten({ onInventurGestartet }: InventurStartenProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  // Interface für Warehouse
  interface Warehouse {
    id: number;
    name: string;
    location?: string;
    description?: string;
    archived?: boolean;
  }

  // Lade verfügbare Lager
  const { data: warehousesResponse, isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 5 * 60 * 1000, // 5 Minuten Cache
  });
  
  // Extract warehouses array from response
  const warehouses: Warehouse[] = warehousesResponse?.data || [];
  
  // Mutation zum Starten einer neuen Inventur
  const startInventurMutation = useMutation({
    mutationFn: async (data: { warehouseId: number, notes: string }) => {
      try {
        console.log('Starte Inventur mit Daten:', data); // Debug-Logging

        // Verwende den korrekten API-Endpunkt für inventory-counts
        const response = await fetch('/api/inventory-counts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            warehouseId: data.warehouseId
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Server response:', errorData);
          throw new Error(errorData.error || 'Fehler beim Starten der Inventur');
        }
        
        const result = await response.json();
        console.log('Inventur erfolgreich gestartet:', result); // Debug-Logging
        return result;
      } catch (error) {
        console.error('Fehler beim Starten der Inventur:', error);
        throw error; // Wichtig: Fehler weitergeben für die onError-Funktion
      }
    },
    onSuccess: (data) => {
      // Invalidiere Inventur-Liste, um die neue Inventur anzuzeigen
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      
      toast({
        title: "Inventur erfolgreich gestartet",
        description: `Die Inventur für das ausgewählte Lager wurde gestartet.`,
      });
      
      // Benachrichtige die übergeordnete Komponente
      onInventurGestartet();
    },
    onError: (error: any) => {
      console.error('Fehler beim Starten der Inventur:', error);
      toast({
        title: "Fehler beim Starten der Inventur",
        description: error.message || "Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    },
  });
  
  // Aktive (nicht archivierte) Lager filtern
  const activeWarehouses = warehouses.filter((warehouse: Warehouse) => !warehouse.archived);
  
  // Handler für das Starten einer Inventur
  const handleStartInventur = () => {
    if (!selectedWarehouse) {
      toast({
        title: "Lager auswählen",
        description: "Bitte wählen Sie ein Lager für die Inventur aus.",
        variant: "destructive",
      });
      return;
    }
    
    const warehouseIdNum = parseInt(selectedWarehouse);
    console.log(`Starte Inventur für Lager-ID: ${warehouseIdNum}, Name: ${
      activeWarehouses.find(w => w.id === warehouseIdNum)?.name || 'Unbekannt'
    }`);
    
    startInventurMutation.mutate({
      warehouseId: warehouseIdNum,
      notes: notes
    });
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Neue Inventur starten</CardTitle>
        <CardDescription>
          Erfassen Sie den aktuellen Lagerbestand eines Lagers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="warehouse">Lager auswählen</Label>
          
          {isLoadingWarehouses ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select 
              value={selectedWarehouse} 
              onValueChange={setSelectedWarehouse}
            >
              <SelectTrigger>
                <SelectValue placeholder="Bitte wählen Sie ein Lager" />
              </SelectTrigger>
              <SelectContent>
                {activeWarehouses.length === 0 ? (
                  <SelectItem value="" disabled>Keine Lager verfügbar</SelectItem>
                ) : (
                  activeWarehouses.map((warehouse: Warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                      <div className="flex items-center">
                        <Warehouse className="h-4 w-4 mr-2" />
                        {warehouse.name}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="notes">Notizen (optional)</Label>
          <Textarea 
            id="notes" 
            placeholder="Hinweise oder Kontext zu dieser Inventur..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <div className="text-sm text-muted-foreground">
          Dieses startet eine neue Inventurerfassung für das ausgewählte Lager.
        </div>
        
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              disabled={!selectedWarehouse || startInventurMutation.isPending}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Inventur starten
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Inventur starten?</AlertDialogTitle>
              <AlertDialogDescription>
                Sind Sie sicher, dass Sie eine neue Inventur für das ausgewählte Lager starten möchten? 
                Sie können die Inventur nach dem Start jederzeit fortführen oder abbrechen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleStartInventur}>
                Inventur starten
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}