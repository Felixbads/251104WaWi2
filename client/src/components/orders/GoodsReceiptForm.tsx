import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

// UI-Komponenten
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
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

// Icons
import {
  CalendarIcon,
  CheckCircle2,
  X,
  AlertTriangle,
  Info,
  Calendar as CalendarIcon2,
  PackageCheck,
  Package,
} from 'lucide-react';

// Validierungsschema für Wareneingang
const goodsReceiptSchema = z.object({
  deliveryNoteNumber: z.string().optional(),
  receiptDate: z.date({
    required_error: 'Bitte geben Sie das Datum des Wareneingangs an',
  }),
  notes: z.string().optional(),
  isComplete: z.boolean().default(false),
  items: z.array(
    z.object({
      orderItemId: z.number(),
      productId: z.number(),
      productName: z.string(),
      orderedQuantity: z.number(),
      receivedQuantity: z.number().min(0, 'Menge muss mindestens 0 sein'),
      unit: z.string(),
      batchNumber: z.string().optional(),
      expiryDate: z.date().optional(),
      supplierBatchNumber: z.string().optional(),
      manufacturingDate: z.date().optional(),
      locationInWarehouse: z.string().optional(),
      notes: z.string().optional(),
      qualityCheck: z.boolean().default(true),
      qualityIssue: z.string().optional(),
    })
  ),
});

type GoodsReceiptFormValues = z.infer<typeof goodsReceiptSchema>;

interface GoodsReceiptFormProps {
  orderId?: number; // Bestellungs-ID (optional)
  order?: any; // Bestellungsdaten (optional)
  onSubmit: (data: any) => void;
  onBack: () => void;
  isSubmitting?: boolean;
}

export function GoodsReceiptForm({ orderId, order, onSubmit: submitHandler, onBack, isSubmitting = false }: GoodsReceiptFormProps) {
  const { toast } = useToast();
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
  // Laden der Bestellpositionen, falls diese nicht übergeben wurden
  useEffect(() => {
    if (orderId && (!order || !order.items || order.items.length === 0)) {
      // Direkten SQL-Endpunkt verwenden für höhere Zuverlässigkeit
      fetch(`/api/order-items-direct/${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        console.log("Bestellpositionen geladen:", data);
        if (Array.isArray(data)) {
          setOrderItems(data);
        } else if (data && Array.isArray(data.data)) {
          setOrderItems(data.data);
        } else {
          console.error("Unerwartetes Datenformat:", data);
          toast({
            title: "Fehler beim Laden",
            description: "Bestellpositionen konnten nicht geladen werden.",
            variant: "destructive"
          });
        }
      })
      .catch(error => {
        console.error("Fehler beim Laden der Bestellpositionen:", error);
        toast({
          title: "Fehler beim Laden",
          description: "Bestellpositionen konnten nicht geladen werden: " + error.message,
          variant: "destructive"
        });
      });
    } else if (order?.items || order?.orderItems) {
      setOrderItems(order.items || order.orderItems || []);
    }
  }, [orderId, order, toast]);
  
  // Standardwerte für das Formular
  const defaultValues: GoodsReceiptFormValues = {
    deliveryNoteNumber: '',
    receiptDate: new Date(),
    notes: '',
    isComplete: false,
    items: (orderItems.length > 0 ? orderItems : (order?.items || order?.orderItems || [])).map((item: any) => ({
      orderItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      orderedQuantity: item.quantity,
      receivedQuantity: item.quantity, // Standard: Vollständige Lieferung
      unit: item.unit || 'stk',
      batchNumber: generateBatchNumber(item.productId),
      expiryDate: addDays(new Date(), 30), // Standard: 30 Tage Haltbarkeit
      supplierBatchNumber: '',
      manufacturingDate: new Date(),
      locationInWarehouse: '',
      notes: '',
      qualityCheck: true,
      qualityIssue: '',
    })),
  };

  // Form hook
  const form = useForm<GoodsReceiptFormValues>({
    resolver: zodResolver(goodsReceiptSchema),
    defaultValues,
  });

  // Field array für Bestellpositionen
  const { fields } = useFieldArray({
    name: 'items',
    control: form.control,
  });

  // Batche Nummer generieren
  function generateBatchNumber(productId: number): string {
    const today = new Date();
    const dateStr = format(today, 'yyyyMMdd');
    const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `B${dateStr}-${productId}-${randomPart}`;
  }

  // Submit-Handler
  function onSubmit(data: GoodsReceiptFormValues) {
    // Prüfen, ob mindestens ein Produkt eine Menge > 0 hat
    const hasReceivedItems = data.items.some(item => item.receivedQuantity > 0);
    
    if (!hasReceivedItems) {
      form.setError('root', { 
        type: 'manual',
        message: 'Mindestens ein Artikel muss eine Eingangsmenge größer als 0 haben' 
      });
      return;
    }

    // Prüfen, ob es abgelaufene Produkte gibt (gemäß Audit-Anforderung)
    const expiredItems = data.items.filter(item => 
      item.receivedQuantity > 0 && 
      item.expiryDate && 
      new Date(item.expiryDate) < new Date()
    );

    if (expiredItems.length > 0) {
      // Fehler anzeigen für abgelaufene Produkte
      form.setError('root', {
        type: 'manual',
        message: 'Abgelaufene Produkte können nicht ins Lager aufgenommen werden. Bitte korrigieren Sie die MHD-Daten oder reduzieren Sie die Menge auf 0.'
      });
      
      // Zusätzlich eine Warnung anzeigen
      toast({
        title: "Fehler: Abgelaufene Produkte",
        description: `${expiredItems.length} Artikel haben ein MHD in der Vergangenheit und können nicht ins Lager aufgenommen werden.`,
        variant: "destructive"
      });
      
      return;
    }

    onComplete(data);
  }

  // Vollständigkeitsprüfung
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      // Prüfen, ob alle bestellten Artikel vollständig geliefert wurden
      if (name?.includes('items') || name === 'isComplete') {
        const items = form.getValues('items');
        const allComplete = items.every(item => 
          item.receivedQuantity === item.orderedQuantity
        );
        
        if (allComplete !== form.getValues('isComplete')) {
          form.setValue('isComplete', allComplete);
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form, form.watch]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Allgemeine Wareneingangsinformationen */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Lieferscheinnummer */}
            <FormField
              control={form.control}
              name="deliveryNoteNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lieferscheinnummer</FormLabel>
                  <FormControl>
                    <Input placeholder="LS-12345" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Eingangsdatum */}
            <FormField
              control={form.control}
              name="receiptDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Eingangsdatum</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="w-full pl-3 text-left font-normal"
                        >
                          {field.value ? (
                            format(field.value, 'PPP', { locale: de })
                          ) : (
                            <span className="text-muted-foreground">Datum wählen</span>
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
                        disabled={(date) => date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Vollständigkeit */}
            <FormField
              control={form.control}
              name="isComplete"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Vollständige Lieferung</FormLabel>
                    <FormDescription>
                      Die Bestellung ist vollständig geliefert
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* Notizen */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notizen zum Wareneingang</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Zusätzliche Informationen zum Wareneingang..."
                    className="resize-none"
                    rows={2}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator className="my-6" />

        {/* Positionsliste */}
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Gelieferte Artikel ({fields.length})</h3>
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <Card key={field.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="space-y-1">
                      <h4 className="font-medium">{form.getValues(`items.${index}.productName`)}</h4>
                      <p className="text-sm text-muted-foreground">
                        Bestellt: {form.getValues(`items.${index}.orderedQuantity`)} {form.getValues(`items.${index}.unit`)}
                      </p>
                    </div>
                    {form.getValues(`items.${index}.qualityCheck`) ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Qualität OK
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Qualitätsproblem
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {/* Empfangene Menge */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.receivedQuantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Eingegangene Menge</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              step="1"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Chargennummer */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.batchNumber`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chargennummer (intern)</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Lieferanten-Chargennummer */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.supplierBatchNumber`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lieferanten-Chargennummer</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Mindesthaltbarkeitsdatum */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.expiryDate`}
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Mindesthaltbarkeitsdatum (MHD)</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={field.value && new Date(field.value) < new Date() ? "destructive" : "outline"}
                                  className="w-full pl-3 text-left font-normal"
                                >
                                  {field.value ? (
                                    <>
                                      {new Date(field.value) < new Date() && (
                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                      )}
                                      {format(field.value, 'PPP', { locale: de })}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">MHD wählen</span>
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
                                  
                                  // Warnung bei Ablaufdatum in der Vergangenheit gemäß Audit-Anforderung
                                  if (date && date < new Date()) {
                                    toast({
                                      title: "Achtung: Abgelaufenes Produkt",
                                      description: "Das MHD liegt in der Vergangenheit. Abgelaufene Produkte dürfen nicht ins Lager aufgenommen werden.",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          {field.value && new Date(field.value) < new Date() && (
                            <div className="mt-2 text-destructive text-sm flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              Produkt ist abgelaufen! Nicht für Wareneingang geeignet.
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Herstellungsdatum */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.manufacturingDate`}
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Herstellungsdatum</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="w-full pl-3 text-left font-normal"
                                >
                                  {field.value ? (
                                    format(field.value, 'PPP', { locale: de })
                                  ) : (
                                    <span className="text-muted-foreground">Datum wählen</span>
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
                                disabled={(date) => date > new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Lagerort */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.locationInWarehouse`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lagerort</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="z.B. Regal A3, Kühlhaus 2" 
                              {...field} 
                              value={field.value || ''} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Qualitätskontrolle */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.qualityCheck`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Qualitätskontrolle bestanden</FormLabel>
                            <FormDescription>
                              Der Artikel entspricht den Qualitätsanforderungen
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    {/* Qualitätsproblem Beschreibung */}
                    {!form.getValues(`items.${index}.qualityCheck`) && (
                      <FormField
                        control={form.control}
                        name={`items.${index}.qualityIssue`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Beschreibung des Qualitätsproblems</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Beschreiben Sie das Problem..."
                                className="resize-none"
                                rows={2}
                                {...field}
                                value={field.value || ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Notizen pro Position */}
                  <FormField
                    control={form.control}
                    name={`items.${index}.notes`}
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Notizen zum Artikel</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Spezifische Notizen zu diesem Artikel..."
                            className="resize-none"
                            rows={1}
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Formularfehler */}
        {form.formState.errors.root && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mt-6">
            <p>{form.formState.errors.root.message}</p>
          </div>
        )}

        {/* Aktionsbuttons */}
        <div className="flex justify-end gap-2 mt-8">
          <Button variant="outline" type="button" onClick={onCancel}>
            <X className="mr-2 h-4 w-4" /> Abbrechen
          </Button>
          <Button type="submit">
            <PackageCheck className="mr-2 h-4 w-4" /> Wareneingang bestätigen
          </Button>
        </div>
      </form>
    </Form>
  );
}