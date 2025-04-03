import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getProducts } from '@/lib/api';
import { DialogFooter } from '@/components/ui/dialog';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Schema für das Formular
const purchaseConditionFormSchema = z.object({
  productId: z.number({
    required_error: "Bitte wählen Sie ein Produkt aus",
  }),
  unitPrice: z.number({
    required_error: "Bitte geben Sie einen Preis ein",
  }).min(0, "Der Preis muss mindestens 0 sein"),
  minQuantity: z.number().optional(),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
  notes: z.string().optional(),
});

type PurchaseConditionFormValues = z.infer<typeof purchaseConditionFormSchema>;

interface PurchaseConditionFormProps {
  supplierId: number;
  initialData?: {
    id: number;
    productId: number;
    productName?: string;
    unitPrice: number;
    minQuantity?: number;
    validFrom?: string | Date;
    validTo?: string | Date;
    notes?: string;
  };
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function PurchaseConditionForm({
  supplierId,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: PurchaseConditionFormProps) {
  // Produkte laden
  const { data: productsResponse, isLoading: isProductsLoading } = useQuery({
    queryKey: ['/api/products'],
    enabled: true,
  });
  
  // Extrahiere die Products-Daten aus der Response
  const products = productsResponse?.data || [];

  // Form mit Standardwerten
  const form = useForm<PurchaseConditionFormValues>({
    resolver: zodResolver(purchaseConditionFormSchema),
    defaultValues: {
      productId: initialData?.productId || 0,
      unitPrice: initialData?.unitPrice || 0,
      minQuantity: initialData?.minQuantity || 0,
      validFrom: initialData?.validFrom ? new Date(initialData.validFrom) : undefined,
      validTo: initialData?.validTo ? new Date(initialData.validTo) : undefined,
      notes: initialData?.notes || '',
    },
  });

  const handleSubmit = (values: PurchaseConditionFormValues) => {
    onSubmit({
      ...values,
      supplierId,
      id: initialData?.id,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Produkt */}
        <FormField
          control={form.control}
          name="productId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Produkt *</FormLabel>
              <Select
                disabled={isLoading}
                onValueChange={(value) => field.onChange(parseInt(value))}
                value={field.value ? String(field.value) : undefined}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Produkt auswählen" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isProductsLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span>Produkte werden geladen...</span>
                    </div>
                  ) : (
                    products.map((product: any) => (
                      <SelectItem key={product.id} value={String(product.id)}>
                        {product.productName || 'Unbekanntes Produkt'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Preis */}
        <FormField
          control={form.control}
          name="unitPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preis (€) *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  disabled={isLoading}
                  placeholder="0.00"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Mindestmenge */}
        <FormField
          control={form.control}
          name="minQuantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mindestbestellmenge</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  disabled={isLoading}
                  placeholder="Optional"
                  {...field}
                  onChange={(e) => 
                    field.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Gültig von */}
        <FormField
          control={form.control}
          name="validFrom"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Gültig von</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={isLoading}
                    >
                      {field.value ? (
                        format(field.value, "PPP", { locale: de })
                      ) : (
                        <span>Datum auswählen</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={isLoading}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Gültig bis */}
        <FormField
          control={form.control}
          name="validTo"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Gültig bis</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={isLoading}
                    >
                      {field.value ? (
                        format(field.value, "PPP", { locale: de })
                      ) : (
                        <span>Datum auswählen</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={isLoading}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Hinweise */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hinweise</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Optionale Hinweise zur Einkaufsbedingung"
                  className="resize-none"
                  disabled={isLoading}
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
            onClick={onCancel}
            disabled={isLoading}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Speichern...
              </>
            ) : (
              <>Speichern</>
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}