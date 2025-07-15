import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Package, Search } from 'lucide-react';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const addItemSchema = z.object({
  productId: z.string().min(1, 'Produkt ist erforderlich'),
  countedQuantity: z.number().min(0, 'Gezählte Menge muss positiv sein'),
  unitCost: z.number().optional(),
  batchId: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  countingRemarks: z.string().optional(),
});

type AddItemForm = z.infer<typeof addItemSchema>;

interface Product {
  id: number;
  productName: string;
  sku: string;
  currentQuantity: number;
}

interface AddCountItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countId: number;
  warehouseId: number;
  onSuccess: () => void;
}

export function AddCountItemDialog({ 
  open, 
  onOpenChange, 
  countId, 
  warehouseId, 
  onSuccess 
}: AddCountItemDialogProps) {
  const { toast } = useToast();

  const form = useForm<AddItemForm>({
    resolver: zodResolver(addItemSchema),
    defaultValues: {
      productId: '',
      countedQuantity: 0,
      unitCost: undefined,
      batchId: '',
      expiryDate: '',
      notes: '',
      countingRemarks: '',
    },
  });

  // Lade verfügbare Produkte für das Lager
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: [`/api/retroactive-inventory/products/${warehouseId}`],
    queryFn: () => 
      fetch(`/api/retroactive-inventory/products/${warehouseId}`).then(res => res.json()),
    enabled: open && warehouseId > 0,
  });

  // Mutation zum Hinzufügen des Items
  const addItemMutation = useMutation({
    mutationFn: async (data: AddItemForm) => {
      const response = await fetch(`/api/retroactive-inventory/counts/${countId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          productId: parseInt(data.productId),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Hinzufügen des Artikels');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Artikel hinzugefügt',
        description: 'Der Artikel wurde erfolgreich zur Inventur hinzugefügt.',
      });
      form.reset();
      onOpenChange(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: AddItemForm) => {
    addItemMutation.mutate(data);
  };

  const selectedProductId = form.watch('productId');
  const selectedProduct = products.find(p => p.id.toString() === selectedProductId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Artikel zur Inventur hinzufügen
          </DialogTitle>
          <DialogDescription>
            Fügen Sie einen Artikel mit der gezählten Menge zur retroaktiven Inventur hinzu.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Produktauswahl */}
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Produkt
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Produkt auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id.toString()}>
                          <div className="flex flex-col">
                            <span className="font-medium">{product.productName}</span>
                            <span className="text-sm text-gray-500">
                              SKU: {product.sku || 'N/A'} • Aktuell: {product.currentQuantity} Stk
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProduct && (
                    <FormDescription>
                      Aktueller Systembestand: {selectedProduct.currentQuantity} Stück
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Gezählte Menge */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="countedQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gezählte Menge</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        step="1"
                        placeholder="0"
                        {...field} 
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Die tatsächlich gezählte Anzahl des Produkts
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stückkosten (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        {...field} 
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                      />
                    </FormControl>
                    <FormDescription>
                      Kosten pro Einheit in Euro
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Batch-Informationen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="batchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Charge/Batch-ID (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="z.B. LOT123456"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Chargen-Nummer falls verfügbar
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MHD (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Mindesthaltbarkeitsdatum
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notizen */}
            <FormField
              control={form.control}
              name="countingRemarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bemerkungen zur Zählung</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="z.B. Teilweise beschädigte Verpackung, schwer zugänglich, etc."
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Besonderheiten beim Zählvorgang
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zusätzliche Notizen</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Weitere Anmerkungen zu diesem Artikel (optional)"
                      className="min-h-[60px]"
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
                disabled={addItemMutation.isPending}
              >
                Abbrechen
              </Button>
              <Button 
                type="submit" 
                disabled={addItemMutation.isPending || !selectedProduct}
                className="flex items-center gap-2"
              >
                {addItemMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Hinzufügen...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    Artikel hinzufügen
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}