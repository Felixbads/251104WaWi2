import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiRequest, queryClient } from '@/lib/queryClient';
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

// Schema für die Validierung der Chargen-Daten (ohne optionale Felder)
const batchSchema = z.object({
  warehouseId: z.string().min(1, { message: 'Bitte wählen Sie ein Lager aus' }),
  productId: z.string().min(1, { message: 'Bitte wählen Sie ein Produkt aus' }),
  quantity: z.string().min(1, { message: 'Bitte geben Sie eine Menge an' })
    .refine((val) => !isNaN(parseInt(val)), { message: 'Menge muss eine Zahl sein' })
    .refine((val) => parseInt(val) >= 0, { message: 'Menge darf nicht negativ sein' }), // Erlaubt 0 für Produkte wie Eier
  batchNumber: z.string().min(1, { message: 'Bitte geben Sie eine Chargennummer an' }),
  expiryDate: z.date({ required_error: 'Bitte wählen Sie ein Mindesthaltbarkeitsdatum aus' }),
  incomingDate: z.date({ required_error: 'Bitte wählen Sie ein Eingangsdatum aus' }),
  notes: z.string().optional(), // Nur Notizen bleiben optional
});

type BatchFormData = z.infer<typeof batchSchema>;

type NewBatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: any[];
  products: any[];
  initialQuantity?: number; // Neue Property für vorausgefüllte Menge
  onSuccess?: () => void;
};

// Funktion zum Generieren einer einzigartigen Chargennummer
function generateBatchNumber(): string {
  const now = new Date();
  const dateStr = format(now, 'yyyyMMdd');
  const timeStr = format(now, 'HHmmss');
  const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CHG-${dateStr}-${timeStr}-${randomStr}`;
}

export default function NewBatchDialog({ 
  open, 
  onOpenChange, 
  warehouses, 
  products,
  initialQuantity,
  onSuccess 
}: NewBatchDialogProps) {
  const { toast } = useToast();
  const [showSuccessState, setShowSuccessState] = useState(false);

  // Form-Handler initialisieren mit vorausgefüllten Werten
  const form = useForm<BatchFormData>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      warehouseId: warehouses.length >= 1 ? warehouses[0]?.id?.toString() : '',
      productId: products.length >= 1 ? products[0]?.id?.toString() : '',
      quantity: initialQuantity ? initialQuantity.toString() : '1',
      batchNumber: generateBatchNumber(), // Auto-generierte Chargennummer
      expiryDate: new Date(new Date().setMonth(new Date().getMonth() + 3)), // 3 Monate in der Zukunft als Standard-MHD
      incomingDate: new Date(), // Standardmäßig das heutige Datum
      notes: '',
    },
  });

  // Mutation zum Erstellen einer neuen Charge
  const createBatchMutation = useMutation({
    mutationFn: async (data: BatchFormData) => {
      console.log("Creating new batch with data:", data);
      
      // Konvertiere String-IDs zu Zahlen und bereite die Daten für den API-Endpunkt vor
      const quantity = parseInt(data.quantity);
      
      // Zusätzliche Validierung der Menge vor dem Senden
      if (isNaN(quantity) || quantity <= 0) {
        console.error("Invalid quantity value:", data.quantity);
        throw new Error("Die Menge muss eine positive Zahl sein");
      }
      
      const payload = {
        productId: parseInt(data.productId),
        warehouseId: parseInt(data.warehouseId),
        batchNumber: data.batchNumber,
        // Stelle sicher, dass die Datumsformate als ISO-Strings übergeben werden
        expiryDate: data.expiryDate ? data.expiryDate.toISOString().split('T')[0] : null,
        receivedDate: data.incomingDate ? data.incomingDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        initialQuantity: quantity,
        currentQuantity: quantity,
        // WICHTIG: Explizit das quantity-Feld setzen, da es in der Datenbank als NOT NULL definiert ist
        quantity: quantity,
        notes: data.notes || null
      };

      console.log("Sending payload to API:", payload);
      return apiRequest('/api/inventory-counts/product-batches', payload, 'POST');
    },
    onSuccess: (data) => {
      console.log("Charge erfolgreich erstellt:", data);
      
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
      <DialogContent className="sm:max-w-[525px] max-h-[90vh] overflow-y-auto">
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

                {/* Mindesthaltbarkeitsdatum (MHD) - responsive Datumseingabe */}
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
                            
                            console.log("MHD Input changed:", value, "Parsed date:", date);
                            field.onChange(date);
                          }}
                          min={typeof window !== 'undefined' && window.innerWidth <= 768 ? format(new Date(), "yyyy-MM-dd") : undefined}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Eingangsdatum - responsive Datumseingabe */}
                <FormField
                  control={form.control}
                  name="incomingDate"
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
                            
                            console.log("Eingangsdatum Input changed:", value, "Parsed date:", date);
                            field.onChange(date);
                          }}
                          max={typeof window !== 'undefined' && window.innerWidth <= 768 ? format(new Date(), "yyyy-MM-dd") : undefined}
                        />
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