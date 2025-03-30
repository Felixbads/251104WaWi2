import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CircleAlert, Building2, PlusCircle, Edit, Trash } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';

// Schema für das Lager-Formular
const warehouseFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Der Name muss mindestens 2 Zeichen lang sein.'
  }),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  isActive: z.boolean().default(true),
  description: z.string().optional()
});

// Dialog-Komponente für das Lager-Formular
function WarehouseFormDialog({ warehouse = null, open, onOpenChange }: { warehouse?: any, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!warehouse;

  // Form-Hook initialisieren
  const form = useForm<z.infer<typeof warehouseFormSchema>>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: {
      name: warehouse?.name || '',
      address: warehouse?.address || '',
      city: warehouse?.city || '',
      postalCode: warehouse?.postalCode || '',
      isActive: warehouse?.isActive ?? true,
      description: warehouse?.description || ''
    }
  });

  // Mutation für das Erstellen/Aktualisieren eines Lagers
  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof warehouseFormSchema>) => {
      if (isEditing) {
        return await apiRequest(`/api/warehouses/${warehouse.id}`, {
          method: 'PUT',
          data: values
        });
      } else {
        return await apiRequest('/api/warehouses', {
          method: 'POST',
          data: values
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      toast({
        title: isEditing ? 'Lager aktualisiert' : 'Lager erstellt',
        description: isEditing 
          ? `Das Lager "${form.getValues().name}" wurde erfolgreich aktualisiert.` 
          : `Das Lager "${form.getValues().name}" wurde erfolgreich erstellt.`,
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Ein Fehler ist aufgetreten.',
        variant: 'destructive'
      });
    }
  });

  // Form-Submit-Handler
  const onSubmit = (values: z.infer<typeof warehouseFormSchema>) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Lager bearbeiten' : 'Neues Lager erstellen'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Bearbeiten Sie die Informationen des Lagers.' 
              : 'Erstellen Sie ein neues Lager für die Verwaltung Ihrer Bestände.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name*</FormLabel>
                  <FormControl>
                    <Input placeholder="Hauptlager" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adresse</FormLabel>
                    <FormControl>
                      <Input placeholder="Beispielstraße 123" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PLZ</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stadt</FormLabel>
                      <FormControl>
                        <Input placeholder="Dresden" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Beschreibung des Lagers..." 
                      {...field} 
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Aktiv</FormLabel>
                    <FormDescription>
                      Inaktive Lager werden im System nicht mehr für neue Buchungen verwendet.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending 
                  ? 'Wird gespeichert...' 
                  : isEditing ? 'Aktualisieren' : 'Erstellen'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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
      />
      
      {/* Dialog für Lager bearbeiten */}
      {selectedWarehouse && (
        <WarehouseFormDialog 
          warehouse={selectedWarehouse}
          open={isEditWarehouseDialogOpen} 
          onOpenChange={setIsEditWarehouseDialogOpen} 
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