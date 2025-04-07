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
  
  // Lade verfügbare Lager
  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 5 * 60 * 1000, // 5 Minuten Cache
  });
  
  // Mutation zum Starten einer neuen Inventur
  const startInventurMutation = useMutation({
    mutationFn: async (data: { warehouseId: number, notes: string }) => {
      return await apiRequest('/api/inventory-counts', 'POST', data);
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
    onError: (error) => {
      console.error('Fehler beim Starten der Inventur:', error);
      toast({
        title: "Fehler beim Starten der Inventur",
        description: "Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    },
  });
  
  // Aktive (nicht archivierte) Lager filtern
  const activeWarehouses = warehouses.filter((warehouse: any) => !warehouse.archived);
  
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
    
    startInventurMutation.mutate({
      warehouseId: parseInt(selectedWarehouse),
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
                  activeWarehouses.map((warehouse: any) => (
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