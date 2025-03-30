import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const warehouseSchema = z.object({
  name: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein').max(100),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  isActive: z.boolean().default(true)
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

type WarehouseFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse: any | null;
  isNew: boolean;
};

export function WarehouseFormDialog({ open, onOpenChange, warehouse, isNew }: WarehouseFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Formular-Setup mit React Hook Form
  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
      city: '',
      postalCode: '',
      isActive: true
    }
  });

  // Formular auf Basis der übergebenen Warehouse-Daten zurücksetzen
  useEffect(() => {
    if (open) {
      if (isNew) {
        form.reset({
          name: '',
          description: '',
          address: '',
          city: '',
          postalCode: '',
          isActive: true
        });
      } else if (warehouse) {
        form.reset({
          name: warehouse.name,
          description: warehouse.description || '',
          address: warehouse.address || '',
          city: warehouse.city || '',
          postalCode: warehouse.postalCode || '',
          isActive: warehouse.isActive
        });
      }
    }
  }, [open, warehouse, isNew, form]);

  // Mutation für Speichern/Aktualisieren
  const mutation = useMutation({
    mutationFn: async (values: WarehouseFormValues) => {
      if (isNew) {
        return await apiRequest('/api/warehouses', {
          method: 'POST',
          data: values
        });
      } else {
        return await apiRequest(`/api/warehouses/${warehouse?.id}`, {
          method: 'PUT',
          data: values
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      toast({
        title: isNew ? 'Lager erstellt' : 'Lager aktualisiert',
        description: isNew 
          ? 'Das neue Lager wurde erfolgreich angelegt.' 
          : 'Die Lagerdaten wurden erfolgreich aktualisiert.',
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error?.message || 'Beim Speichern ist ein Fehler aufgetreten.',
        variant: 'destructive',
      });
    }
  });

  // Formular-Übermittlung
  const onSubmit = (values: WarehouseFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Neues Lager anlegen' : 'Lager bearbeiten'}</DialogTitle>
          <DialogDescription>
            {isNew 
              ? 'Geben Sie die Details für das neue Lager an.' 
              : 'Bearbeiten Sie die Informationen des Lagers.'}
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
                    <Input placeholder="Lager-Bezeichnung" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Optionale Beschreibung des Lagers"
                      value={field.value || ''} 
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stadt</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Stadt" 
                        value={field.value || ''} 
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Postleitzahl" 
                        value={field.value || ''} 
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Straße und Hausnummer" 
                      value={field.value || ''} 
                      onChange={field.onChange}
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
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Aktiv</FormLabel>
                    <FormDescription>
                      Bestimmt, ob dieses Lager aktiv und in Verwendung ist.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}