import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, Building2, PlusCircle, Edit, Trash } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { WarehouseFormDialog } from './WarehouseFormDialog';
import { z } from 'zod';



export default function WarehouseList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [isNewWarehouseDialogOpen, setIsNewWarehouseDialogOpen] = useState(false);
  const [isEditWarehouseDialogOpen, setIsEditWarehouseDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Abfrage der Lager
  const { data: warehouses, isLoading, error } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Mutation für das Löschen eines Lagers
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/warehouses/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      toast({
        title: 'Lager gelöscht',
        description: `Das Lager "${selectedWarehouse?.name}" wurde erfolgreich gelöscht.`,
      });
      setSelectedWarehouse(null);
      setIsDeleteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Löschen',
        description: error.message || 'Das Lager konnte nicht gelöscht werden.',
        variant: 'destructive'
      });
    }
  });

  // Lager-Bearbeiten-Handler
  const handleEditWarehouse = (warehouse: any) => {
    setSelectedWarehouse(warehouse);
    setIsEditWarehouseDialogOpen(true);
  };

  // Lager-Löschen-Handler
  const handleDeleteWarehouse = (warehouse: any) => {
    setSelectedWarehouse(warehouse);
    setIsDeleteDialogOpen(true);
  };

  // Rendering bei Ladevorgang
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-[200px] w-full" />
        ))}
      </div>
    );
  }

  // Rendering bei Fehler
  if (error) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-center">
        <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
        <h3 className="font-medium text-destructive">Fehler beim Laden der Lager</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(error as Error)?.message || 'Beim Abrufen der Lager ist ein Fehler aufgetreten.'}
        </p>
      </div>
    );
  }

  // Leeres Raster, wenn keine Lager vorhanden sind
  if (!warehouses || warehouses.length === 0) {
    return (
      <div className="text-center p-8 border rounded-lg">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Keine Lager vorhanden</h3>
        <p className="text-muted-foreground mb-4">
          Sie haben noch keine Lager angelegt. Erstellen Sie Ihr erstes Lager, um Ihre Bestände zu verwalten.
        </p>
        <Button onClick={() => setIsNewWarehouseDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Erstes Lager erstellen
        </Button>
        
        {/* Dialog für neues Lager */}
        <WarehouseFormDialog 
          open={isNewWarehouseDialogOpen} 
          onOpenChange={setIsNewWarehouseDialogOpen}
          warehouse={null}
          isNew={true}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsNewWarehouseDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Neues Lager
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map((warehouse: any) => (
          <Card key={warehouse.id} className={warehouse.isActive ? '' : 'opacity-60'}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{warehouse.name}</CardTitle>
                {!warehouse.isActive && (
                  <Badge variant="outline" className="bg-muted">Inaktiv</Badge>
                )}
              </div>
              {(warehouse.city || warehouse.address) && (
                <CardDescription>
                  {[warehouse.address, `${warehouse.postalCode || ''} ${warehouse.city || ''}`]
                    .filter(Boolean)
                    .join(', ')}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="pb-2">
              {warehouse.description ? (
                <p className="text-sm text-muted-foreground">{warehouse.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Keine Beschreibung vorhanden</p>
              )}
            </CardContent>
            <CardFooter className="pt-2">
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleEditWarehouse(warehouse)}
                >
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Bearbeiten
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDeleteWarehouse(warehouse)}
                >
                  <Trash className="h-3.5 w-3.5 mr-1" />
                  Löschen
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      {/* Dialog für neues Lager */}
      <WarehouseFormDialog 
        open={isNewWarehouseDialogOpen} 
        onOpenChange={setIsNewWarehouseDialogOpen}
        warehouse={null}
        isNew={true}
      />
      
      {/* Dialog für Lager bearbeiten */}
      {selectedWarehouse && (
        <WarehouseFormDialog 
          warehouse={selectedWarehouse}
          open={isEditWarehouseDialogOpen} 
          onOpenChange={setIsEditWarehouseDialogOpen} 
          isNew={false}
        />
      )}
      
      {/* Dialog für Lager löschen */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lager löschen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie das Lager "{selectedWarehouse?.name}" löschen möchten?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Abbrechen
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deleteMutation.mutate(selectedWarehouse?.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Wird gelöscht...' : 'Löschen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}