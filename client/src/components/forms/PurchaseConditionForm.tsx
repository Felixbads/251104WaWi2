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
  FormDescription,
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
  taxRate: z.coerce.number().min(0, "Der Steuersatz muss positiv sein").default(19),
  grossPrice: z.number().optional(),
  packagingUnit: z.string().optional(),
  packagingQuantity: z.coerce.number().min(1, "Die Gebindegröße muss mindestens 1 sein").default(1),
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
  // Produkte für diesen Lieferanten laden
  const { data: productsResponse, isLoading: isProductsLoading } = useQuery({
    queryKey: ['/api/products', { supplierId }],
    enabled: !!supplierId,
    queryFn: async () => {
      return await getProducts({ supplierId });
    }
  });
  
  // Extrahiere die Products-Daten aus der Response
  const products = productsResponse?.data || [];

  // Produkt-Details für den ausgewählten Produkttyp
  const [selectedProductDetails, setSelectedProductDetails] = React.useState<any>(null);
  
  // Form mit Standardwerten
  const form = useForm<PurchaseConditionFormValues>({
    resolver: zodResolver(purchaseConditionFormSchema),
    defaultValues: {
      productId: initialData?.productId || 0,
      unitPrice: initialData?.unitPrice || 0,
      taxRate: 19, // Standard-Mehrwertsteuersatz
      grossPrice: initialData?.unitPrice ? initialData.unitPrice * 1.19 : 0, // Brutto = Netto * (1 + MwSt/100)
      packagingUnit: '', // z.B. "Flasche", "Kasten", "Palette"
      packagingQuantity: 1, // z.B. 6 Flaschen pro Einheit
      minQuantity: initialData?.minQuantity || 0,
      validFrom: initialData?.validFrom ? new Date(initialData.validFrom) : undefined,
      validTo: initialData?.validTo ? new Date(initialData.validTo) : undefined,
      notes: initialData?.notes || '',
    },
  });
  
  // Beobachte Änderungen am Nettopreis oder Steuersatz und berechne Bruttopreis
  React.useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'unitPrice' || name === 'taxRate') {
        const unitPrice = form.getValues('unitPrice') || 0;
        const taxRate = form.getValues('taxRate') || 19;
        const grossPrice = unitPrice * (1 + taxRate / 100);
        form.setValue('grossPrice', +grossPrice.toFixed(2));
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);
  
  // Wenn ein Produkt ausgewählt wird, lade dessen Details
  React.useEffect(() => {
    const productId = form.getValues('productId');
    if (productId) {
      const product = products.find((p: any) => p.id === productId);
      if (product) {
        setSelectedProductDetails(product);
        
        // Wenn das Produkt einen MwSt-Satz hat, verwende diesen
        if (product.vat) {
          form.setValue('taxRate', product.vat);
          
          // Bruttopreis neu berechnen
          const unitPrice = form.getValues('unitPrice') || 0;
          const taxRate = product.vat || 19;
          const grossPrice = unitPrice * (1 + taxRate / 100);
          form.setValue('grossPrice', +grossPrice.toFixed(2));
        }
      }
    }
  }, [form.getValues('productId'), products]);

  const handleSubmit = (values: PurchaseConditionFormValues) => {
    // Validierung der Pflichtfelder
    if (!values.productId) {
      form.setError("productId", {
        type: "manual",
        message: "Bitte wählen Sie ein Produkt aus.",
      });
      return;
    }
    
    if (!values.unitPrice && values.unitPrice !== 0) {
      form.setError("unitPrice", {
        type: "manual",
        message: "Bitte geben Sie einen Einheitspreis an.",
      });
      return;
    }
    
    // Explizit Date-Objekte erstellen für korrekte Serialisierung zum Server
    // Wenn kein Datum ausgewählt ist, verwenden wir das aktuelle Datum (ab sofort gültig)
    const dateValidFrom = values.validFrom ? new Date(values.validFrom) : new Date();
    const dateValidTo = values.validTo ? new Date(values.validTo) : null;
    
    // Zuerst die Daten für die Konsole formatieren und ausgeben (zum Debugging)
    console.log("Erstelle Einkaufsbedingung mit Daten:", {
      ...values,
      productId: typeof values.productId === 'string' ? parseInt(values.productId) : values.productId,
      unitPrice: typeof values.unitPrice === 'string' ? parseFloat(values.unitPrice) : values.unitPrice,
      supplierId,
      id: initialData?.id,
      validFrom: dateValidFrom.toISOString(),
      validTo: dateValidTo ? dateValidTo.toISOString() : undefined,
      taxRate: values.taxRate || 19,
      packagingUnit: values.packagingUnit || '',
      packagingQuantity: values.packagingQuantity || 1,
      minQuantity: typeof values.minQuantity === 'string' ? parseInt(values.minQuantity as string) : values.minQuantity,
      isPreferred: false
    });
    
    // Formatierte Daten für die API mit ISO-String-Format für Datumswerte
    const formData = {
      ...values,
      productId: typeof values.productId === 'string' ? parseInt(values.productId) : values.productId,
      unitPrice: typeof values.unitPrice === 'string' ? parseFloat(values.unitPrice) : values.unitPrice,
      supplierId,
      id: initialData?.id,
      validFrom: dateValidFrom.toISOString(),  // ISO-String-Format für den Server
      validTo: dateValidTo ? dateValidTo.toISOString() : undefined,  // ISO-String-Format oder undefined
      taxRate: values.taxRate || 19,
      packagingUnit: values.packagingUnit || '',
      packagingQuantity: values.packagingQuantity || 1,
      minQuantity: typeof values.minQuantity === 'string' ? parseInt(values.minQuantity as string) : values.minQuantity,
      isPreferred: false
    };
    
    onSubmit(formData);
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

        {/* Netto-Preis */}
        <FormField
          control={form.control}
          name="unitPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Netto-Preis (€) *</FormLabel>
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
        
        {/* Mehrwertsteuersatz */}
        <FormField
          control={form.control}
          name="taxRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mehrwertsteuersatz (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.1"
                  disabled={isLoading}
                  placeholder="19"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Brutto-Preis (berechnet) */}
        <FormField
          control={form.control}
          name="grossPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brutto-Preis (€)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  disabled={true}
                  placeholder="0.00"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Berechnet aus Nettopreis und Mehrwertsteuersatz
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Gebindegröße */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="packagingQuantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gebindegröße</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    disabled={isLoading}
                    placeholder="1"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 1)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="packagingUnit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gebindeeinheit</FormLabel>
                <Select
                  disabled={isLoading}
                  onValueChange={field.onChange}
                  value={field.value}
                  defaultValue=""
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Einheit wählen" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Stück">Stück</SelectItem>
                    <SelectItem value="Flasche">Flasche</SelectItem>
                    <SelectItem value="Kasten">Kasten</SelectItem>
                    <SelectItem value="Karton">Karton</SelectItem>
                    <SelectItem value="Palette">Palette</SelectItem>
                    <SelectItem value="Kiste">Kiste</SelectItem>
                    <SelectItem value="Einheit">Einheit</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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