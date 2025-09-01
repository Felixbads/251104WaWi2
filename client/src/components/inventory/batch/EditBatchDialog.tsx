import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Schema für die Validierung der Batch-Bearbeitungs-Daten
const editBatchSchema = z.object({
  currentQuantity: z.string().min(1, { message: 'Bitte geben Sie eine Menge an' })
    .refine((val) => !isNaN(parseInt(val)), { message: 'Menge muss eine Zahl sein' })
    .refine((val) => parseInt(val) >= 0, { message: 'Menge darf nicht negativ sein' }),
  batchNumber: z.string().min(1, { message: 'Bitte geben Sie eine Chargennummer an' }),
  expiryDate: z.date({ required_error: 'Bitte wählen Sie ein Mindesthaltbarkeitsdatum aus' }),
  receivedDate: z.date({ required_error: 'Bitte wählen Sie ein Eingangsdatum aus' }),
  notes: z.string().optional(),
});

type EditBatchFormData = z.infer<typeof editBatchSchema>;

interface ProductBatch {
  id: number;
  batchNumber: string;
  productId: number;
  warehouseId: number;
  initialQuantity?: number;
  currentQuantity: number;
  expiryDate: string | null;
  receivedDate?: string | null;
  notes?: string | null;
}

type EditBatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: ProductBatch | null;
  onSuccess?: () => void;
  onDelete?: () => void;
};

export default function EditBatchDialog({ 
  open, 
  onOpenChange, 
  batch,
  onSuccess,
  onDelete
}: EditBatchDialogProps) {
  const { toast } = useToast();
  const [showSuccessState, setShowSuccessState] = useState(false);

  // Form-Handler initialisieren mit vorausgefüllten Werten aus dem bestehenden Batch
  const form = useForm<EditBatchFormData>({
    resolver: zodResolver(editBatchSchema),
    defaultValues: {
      currentQuantity: batch?.currentQuantity?.toString() || '1',
      batchNumber: batch?.batchNumber || '',
      expiryDate: batch?.expiryDate ? new Date(batch.expiryDate) : new Date(),
      receivedDate: batch?.receivedDate ? new Date(batch.receivedDate) : new Date(),
      notes: batch?.notes || '',
    },
  });

  // Reset form when batch changes
  useEffect(() => {
    if (batch && open) {
      form.reset({
        currentQuantity: batch.currentQuantity?.toString() || '1',
        batchNumber: batch.batchNumber || '',
        expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : new Date(),
        receivedDate: batch.receivedDate ? new Date(batch.receivedDate) : new Date(),
        notes: batch.notes || '',
      });
    }
  }, [batch, open, form]);

  // Mutation zum Aktualisieren einer Charge
  const updateBatchMutation = useMutation({
    mutationFn: async (data: EditBatchFormData) => {
      if (!batch) throw new Error('Keine Charge ausgewählt');
      
      console.log("Updating batch with data:", data);
      
      const quantity = parseInt(data.currentQuantity);
      
      if (isNaN(quantity) || quantity < 0) {
        throw new Error("Die Menge muss eine nicht-negative Zahl sein");
      }
      
      const payload = {
        batchNumber: data.batchNumber,
        expiryDate: data.expiryDate ? data.expiryDate.toISOString().split('T')[0] : null,
        receivedDate: data.receivedDate ? data.receivedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        currentQuantity: quantity,
        notes: data.notes || null
      };

      console.log("Sending update payload to API:", payload);
      return apiRequest(`/api/inventory-counts/product-batches/${batch.id}`, payload, 'PATCH');
    },
    onSuccess: (data) => {
      console.log("Charge erfolgreich aktualisiert:", data);
      
      // Spezifische Cache-Invalidierung für Batch-Listen
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' && 
                 (queryKey.includes('/api/inventory-count-batches/') || 
                  queryKey.includes('/api/inventory-counts/') ||
                  queryKey.includes('/api/product-batches'));
        }
      });
      
      // Direkter Callback für sofortige UI-Aktualisierung
      if (onSuccess) {
        onSuccess();
      }
      
      setShowSuccessState(true);
      setTimeout(() => {
        setShowSuccessState(false);
        onOpenChange(false);
        form.reset();
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Aktualisieren der Charge',
        description: error.message || 'Bitte versuchen Sie es später erneut.',
        variant: 'destructive',
      });
    },
  });

  // Mutation zum Löschen einer Charge
  const deleteBatchMutation = useMutation({
    mutationFn: async () => {
      if (!batch) throw new Error('Keine Charge ausgewählt');
      
      console.log("Deleting batch:", batch.id);
      return apiRequest(`/api/inventory-counts/product-batches/${batch.id}`, {}, 'DELETE');
    },
    onSuccess: () => {
      console.log("Charge erfolgreich gelöscht");
      
      // Invalidiere den Cache
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' && 
                 (queryKey.includes('/api/inventory-count-batches/') || 
                  queryKey.includes('/api/inventory-counts/'));
        }
      });
      
      toast({
        title: 'Charge gelöscht',
        description: 'Die Charge wurde erfolgreich entfernt.',
      });
      
      onOpenChange(false);
      if (onDelete) onDelete();
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Löschen der Charge',
        description: error.message || 'Bitte versuchen Sie es später erneut.',
        variant: 'destructive',
      });
    },
  });

  // Formular absenden
  const onSubmit = (data: EditBatchFormData) => {
    updateBatchMutation.mutate(data);
  };

  // Charge löschen
  const handleDelete = () => {
    if (confirm('Möchten Sie diese Charge wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      deleteBatchMutation.mutate();
    }
  };

  // Formular zurücksetzen, wenn Dialog geschlossen wird
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  if (!batch) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        {!showSuccessState ? (
          <>
            <DialogHeader>
              <DialogTitle>Charge bearbeiten</DialogTitle>
              <DialogDescription>
                Bearbeiten Sie hier die Daten der Charge {batch.batchNumber}.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                {/* Aktuelle Menge */}
                <FormField
                  control={form.control}
                  name="currentQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aktuelle Menge</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" placeholder="Aktuelle Menge" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Chargennummer */}
                <FormField
                  control={form.control}
                  name="batchNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chargennummer</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. B12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Mindesthaltbarkeitsdatum (MHD) */}
                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mindesthaltbarkeitsdatum (MHD)</FormLabel>
                      <FormControl>
                        <Input 
                          type={typeof window !== 'undefined' && window.innerWidth <= 768 ? "date" : "text"}
                          placeholder={typeof window !== 'undefined' && window.innerWidth > 768 ? "YYYY-MM-DD" : undefined}
                          value={field.value ? format(field.value, "yyyy-MM-dd") : ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            let date: Date | undefined;
                            
                            if (value) {
                              // Versuche verschiedene Datumsformate zu parsen
                              if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                date = new Date(value);
                              } else if (value.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                                const [day, month, year] = value.split('.');
                                date = new Date(`${year}-${month}-${day}`);
                              }
                            }
                            
                            field.onChange(date);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Eingangsdatum */}
                <FormField
                  control={form.control}
                  name="receivedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Eingangsdatum</FormLabel>
                      <FormControl>
                        <Input 
                          type={typeof window !== 'undefined' && window.innerWidth <= 768 ? "date" : "text"}
                          placeholder={typeof window !== 'undefined' && window.innerWidth > 768 ? "YYYY-MM-DD" : undefined}
                          value={field.value ? format(field.value, "yyyy-MM-dd") : ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            let date: Date | undefined;
                            
                            if (value) {
                              // Versuche verschiedene Datumsformate zu parsen
                              if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                date = new Date(value);
                              } else if (value.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                                const [day, month, year] = value.split('.');
                                date = new Date(`${year}-${month}-${day}`);
                              }
                            }
                            
                            field.onChange(date);
                          }}
                          max={format(new Date(), "yyyy-MM-dd")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notizen */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notizen (optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Zusätzliche Informationen zur Charge" 
                          className="resize-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2">
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleDelete}
                    disabled={updateBatchMutation.isPending || deleteBatchMutation.isPending}
                    className="mr-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Löschen
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => onOpenChange(false)}
                    disabled={updateBatchMutation.isPending || deleteBatchMutation.isPending}
                  >
                    Abbrechen
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateBatchMutation.isPending || deleteBatchMutation.isPending}
                  >
                    {updateBatchMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-center">Charge erfolgreich aktualisiert!</h3>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}