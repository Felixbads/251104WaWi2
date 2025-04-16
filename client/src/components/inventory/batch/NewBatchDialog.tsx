import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiRequest } from '@/lib/queryClient';
import { Calendar } from '@/components/ui/calendar';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, CircleAlert, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Schema für die Validierung der Chargen-Daten
const batchSchema = z.object({
  warehouseId: z.string().min(1, { message: 'Bitte wählen Sie ein Lager aus' }),
  productId: z.string().min(1, { message: 'Bitte wählen Sie ein Produkt aus' }),
  quantity: z.string().min(1, { message: 'Bitte geben Sie eine Menge an' })
    .refine((val) => !isNaN(parseInt(val)), { message: 'Menge muss eine Zahl sein' })
    .refine((val) => parseInt(val) > 0, { message: 'Menge muss größer als 0 sein' }),
  batchNumber: z.string().min(1, { message: 'Bitte geben Sie eine Chargennummer an' }),
  expiryDate: z.date({ required_error: 'Bitte wählen Sie ein Mindesthaltbarkeitsdatum aus' }),
  incomingDate: z.date({ required_error: 'Bitte wählen Sie ein Eingangsdatum aus' }),
  supplierBatchNumber: z.string().optional(),
  locationInWarehouse: z.string().optional(),
  notes: z.string().optional(),
});

type BatchFormData = z.infer<typeof batchSchema>;

type NewBatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: any[];
  products: any[];
  onSuccess?: () => void;
};

export default function NewBatchDialog({ 
  open, 
  onOpenChange, 
  warehouses, 
  products,
  onSuccess 
}: NewBatchDialogProps) {
  const { toast } = useToast();
  const [showSuccessState, setShowSuccessState] = useState(false);

  // Form-Handler initialisieren
  const form = useForm<BatchFormData>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      warehouseId: warehouses.length === 1 ? warehouses[0]?.id?.toString() : '',
      productId: '',
      quantity: '',
      batchNumber: '',
      expiryDate: new Date(new Date().setMonth(new Date().getMonth() + 3)), // 3 Monate in der Zukunft als Standard-MHD
      incomingDate: new Date(), // Standardmäßig das heutige Datum
      supplierBatchNumber: '',
      locationInWarehouse: '',
      notes: '',
    },
  });

  // Mutation zum Erstellen einer neuen Charge
  const createBatchMutation = useMutation({
    mutationFn: async (data: BatchFormData) => {
      // Konvertiere String-IDs zu Zahlen und bereite die Daten für den API-Endpunkt vor
      const payload = {
        productId: parseInt(data.productId),
        warehouseId: parseInt(data.warehouseId),
        batchNumber: data.batchNumber,
        expiryDate: data.expiryDate ? format(data.expiryDate, "yyyy-MM-dd") : null,
        initialQuantity: parseInt(data.quantity),
        currentQuantity: parseInt(data.quantity),
        notes: data.notes || null
      };

      return apiRequest('/api/inventory-counts/product-batches', 'POST', payload);
    },
    onSuccess: (data) => {
      setShowSuccessState(true);
      setTimeout(() => {
        setShowSuccessState(false);
        onOpenChange(false);
        if (onSuccess) onSuccess();
        form.reset(); // Formular zurücksetzen
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler beim Erstellen der Charge',
        description: error.message || 'Bitte versuchen Sie es später erneut.',
        variant: 'destructive',
      });
    },
  });

  // Formular absenden
  const onSubmit = (data: BatchFormData) => {
    createBatchMutation.mutate(data);
  };

  // Formular zurücksetzen, wenn Dialog geschlossen wird
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        {!showSuccessState ? (
          <>
            <DialogHeader>
              <DialogTitle>Neue Charge anlegen</DialogTitle>
              <DialogDescription>
                Erfassen Sie hier die Daten für eine neue Produktcharge im Lager.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                {/* Lager-Auswahl */}
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lager</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Lager auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses.map((warehouse) => (
                            <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                              {warehouse.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Produkt-Auswahl */}
                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Produkt</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Produkt auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id.toString()}>
                              {product.productName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Menge */}
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Menge</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" placeholder="Artikelmenge" {...field} />
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
                    <FormItem className="flex flex-col">
                      <FormLabel>Mindesthaltbarkeitsdatum</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`w-full pl-3 text-left font-normal ${!field.value ? "text-muted-foreground" : ""}`}
                            >
                              {field.value ? (
                                format(field.value, "dd.MM.yyyy")
                              ) : (
                                <span>MHD auswählen</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              field.onChange(date);
                              console.log("Date selected:", date);
                            }}
                            // Für MHD sollten zukünftige Daten erlaubt sein, entferne die Einschränkung
                            disabled={false}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Eingangsdatum */}
                <FormField
                  control={form.control}
                  name="incomingDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Eingangsdatum</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`w-full pl-3 text-left font-normal ${!field.value ? "text-muted-foreground" : ""}`}
                            >
                              {field.value ? (
                                format(field.value, "dd.MM.yyyy")
                              ) : (
                                <span>Eingangsdatum auswählen</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              field.onChange(date);
                              console.log("Eingangsdatum selected:", date);
                            }}
                            // Für Eingangsdatum nur Daten bis heute erlauben
                            disabled={(date) => date > new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Charge des Lieferanten (optional) */}
                <FormField
                  control={form.control}
                  name="supplierBatchNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lieferanten-Chargennummer (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Charge des Lieferanten" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Lagerort im Lager (optional) */}
                <FormField
                  control={form.control}
                  name="locationInWarehouse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lagerort (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Regal A, Fach 3" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notizen (optional) */}
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

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => onOpenChange(false)}
                    disabled={createBatchMutation.isPending}
                  >
                    Abbrechen
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createBatchMutation.isPending}
                  >
                    {createBatchMutation.isPending ? 'Wird gespeichert...' : 'Charge anlegen'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-center">Charge erfolgreich angelegt!</h3>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}