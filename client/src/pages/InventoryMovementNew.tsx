import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon, Plus, ArrowLeftRight, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Schema für das Formular
const movementSchema = z.object({
  warehouseId: z.string().min(1, { message: 'Bitte wählen Sie ein Lager aus' }),
  productId: z.string().min(1, { message: 'Bitte wählen Sie ein Produkt aus' }),
  quantity: z.number().min(0.01, { message: 'Die Menge muss größer als 0 sein' }),
  type: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUST'], {
    required_error: "Bitte wählen Sie einen Bewegungstyp aus",
  }),
  destinationWarehouseId: z.string().optional(),
  date: z.date(),
  notes: z.string().optional(),
  reason: z.string().optional(),
});

type MovementFormValues = z.infer<typeof movementSchema>;

export default function InventoryMovementNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Warenlager und Produkte laden
  const { data: warehouses = [] } = useQuery({ 
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5 // 5 Minuten
  });
  
  const { data: products = [] } = useQuery({ 
    queryKey: ['/api/products'],
    staleTime: 1000 * 60 * 5 // 5 Minuten
  });
  
  // Form mit Standardwerten initialisieren
  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      warehouseId: '',
      productId: '',
      quantity: 1,
      type: 'IN',
      destinationWarehouseId: '',
      date: new Date(),
      notes: '',
      reason: '',
    }
  });
  
  // Aktueller Bewegungstyp
  const movementType = form.watch('type');
  const warehouseId = form.watch('warehouseId');
  
  // Zeigt Ziel-Lager Auswahl nur bei Transfer an
  const showDestinationWarehouse = movementType === 'TRANSFER';
  
  // Effekt zur Validierung des Ziel-Lagers, wenn der Typ TRANSFER ist
  useEffect(() => {
    if (movementType === 'TRANSFER') {
      form.register('destinationWarehouseId', { 
        required: 'Bitte wählen Sie ein Ziellager aus' 
      });
    } else {
      form.unregister('destinationWarehouseId');
    }
  }, [movementType, form]);
  
  // Mutation zum Erstellen einer neuen Warenbewegung
  const createMovementMutation = useMutation({
    mutationFn: async (data: MovementFormValues) => {
      // API-Anfrage für die neue Warenbewegung
      const payload = {
        sourceWarehouseId: data.type === 'OUT' || data.type === 'TRANSFER' ? parseInt(data.warehouseId) : null,
        destinationWarehouseId: data.type === 'IN' || data.type === 'TRANSFER' ? 
          (data.type === 'TRANSFER' ? parseInt(data.destinationWarehouseId || '') : parseInt(data.warehouseId)) : null,
        productId: parseInt(data.productId),
        quantity: data.type === 'OUT' ? -Math.abs(data.quantity) : Math.abs(data.quantity),
        movementType: data.type,
        performedAt: data.date.toISOString(),
        notes: data.notes || '',
        reason: data.reason || '',
      };
      
      return await apiRequest('/api/inventory-movements', {
        method: 'POST',
        data: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      toast({
        title: "Warenbewegung erstellt",
        description: "Die neue Warenbewegung wurde erfolgreich angelegt.",
      });
      
      // Zurück zur Übersicht
      setLocation('/inventory');
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Erstellen der Warenbewegung",
        description: error.message || "Es ist ein unbekannter Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  });
  
  // Formular absenden
  function onSubmit(values: MovementFormValues) {
    // Wenn der Typ TRANSFER ist, muss das Ziellager unterschiedlich vom Quelllager sein
    if (values.type === 'TRANSFER' && values.warehouseId === values.destinationWarehouseId) {
      form.setError('destinationWarehouseId', {
        type: 'manual',
        message: 'Quell- und Ziellager dürfen nicht identisch sein'
      });
      return;
    }
    
    createMovementMutation.mutate(values);
  }
  
  // Typen für Bewegungen
  const movementTypes = [
    { value: 'IN', label: 'Eingang (Lagereingang)' },
    { value: 'OUT', label: 'Ausgang (Entnahme)' },
    { value: 'TRANSFER', label: 'Umlagerung (Transfer)' },
    { value: 'ADJUST', label: 'Anpassung (Bestandskorrektur)' },
  ];
  
  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setLocation('/inventory')}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück zur Übersicht
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Neue Warenbewegung erstellen
          </CardTitle>
          <CardDescription>
            Erfassen Sie eine neue Lagerbewegung wie Wareneingang, Entnahme, Umlagerung oder Bestandskorrektur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bewegungstyp */}
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bewegungstyp</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Bewegungstyp auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {movementTypes.map(type => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormDescription>
                        Wählen Sie die Art der Warenbewegung aus
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Datum der Bewegung */}
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Datum</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className="w-full pl-3 text-left font-normal"
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
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Datum, an dem die Warenbewegung durchgeführt wurde
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lager (Quelle oder Ziel) */}
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {movementType === 'IN' 
                          ? 'Ziellager' 
                          : movementType === 'OUT' || movementType === 'TRANSFER'
                            ? 'Quelllager'
                            : 'Lager'}
                      </FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Lager auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((warehouse: any) => (
                              <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                                {warehouse.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormDescription>
                        {movementType === 'IN' 
                          ? 'Wählen Sie das Lager aus, in das die Ware eingelagert wird' 
                          : movementType === 'OUT'
                            ? 'Wählen Sie das Lager aus, aus dem die Ware entnommen wird'
                            : movementType === 'TRANSFER'
                              ? 'Wählen Sie das Lager aus, aus dem die Ware umgelagert wird'
                              : 'Wählen Sie das Lager aus, dessen Bestand angepasst wird'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Ziellager (nur bei Umlagerung) */}
                {showDestinationWarehouse && (
                  <FormField
                    control={form.control}
                    name="destinationWarehouseId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ziellager</FormLabel>
                        <FormControl>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                            disabled={!warehouseId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Ziellager auswählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {warehouses
                                .filter((w: any) => w.id.toString() !== warehouseId)
                                .map((warehouse: any) => (
                                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                                    {warehouse.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription>
                          Wählen Sie das Lager aus, in das die Ware umgelagert wird
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Produkt */}
                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Produkt</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Produkt auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((product: any) => (
                              <SelectItem key={product.id} value={product.id.toString()}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormDescription>
                        Wählen Sie das Produkt aus, das bewegt wird
                      </FormDescription>
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
                        <Input 
                          type="number" 
                          min="0.01" 
                          step="0.01"
                          placeholder="Menge eingeben" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Geben Sie die Menge ein, die bewegt wird
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Grund */}
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grund</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Grund für die Warenbewegung" 
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Geben Sie optional einen Grund für die Warenbewegung an
                      </FormDescription>
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
                      <FormLabel>Notizen</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Weitere Informationen zur Warenbewegung" 
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Fügen Sie optional weitere Notizen hinzu
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-end space-x-4">
                <Button 
                  variant="outline" 
                  type="button"
                  onClick={() => setLocation('/inventory')}
                >
                  Abbrechen
                </Button>
                <Button 
                  type="submit"
                  disabled={createMovementMutation.isPending}
                >
                  {createMovementMutation.isPending && (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  <Plus className="mr-2 h-4 w-4" />
                  Warenbewegung erstellen
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}