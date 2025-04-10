import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowRight,
  Trash,
  Package,
  Truck,
  ShoppingCart,
  RotateCcw,
  Search,
  Info,
  Loader2,
  ChevronsUpDown,
  AlertTriangle,
  ArrowRightLeft,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Schema für die Warenbewegungsform
const transferFormSchema = z.object({
  destinationType: z.enum(['WAREHOUSE', 'EXTERNAL']),
  destinationWarehouseId: z.number().optional(),
  externalDestination: z.string().optional(),
  notes: z.string().optional(),
});

// Schema für die Produkt-Transfer-Einträge
const productTransferSchema = z.object({
  productId: z.number(),
  quantity: z.number().min(0),
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

interface WarehouseTransferProps {
  warehouseId: number;
  onSuccess?: () => void;
}

export default function WarehouseTransfer({ warehouseId, onSuccess }: WarehouseTransferProps) {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productTransfers, setProductTransfers] = useState<{[key: number]: number}>({});
  const [hasAnyQuantity, setHasAnyQuantity] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [filter, setFilter] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form initialization
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      destinationType: 'WAREHOUSE',
      notes: '',
    },
  });

  // Fetch warehouses on component mount
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const response = await fetch('/api/warehouses');
        if (response.ok) {
          const data = await response.json();
          // Filter out the current warehouse
          const otherWarehouses = data.filter((w: any) => w.id !== warehouseId);
          setWarehouses(otherWarehouses);
          
          // Set default destination warehouse if available
          if (otherWarehouses.length > 0) {
            form.setValue('destinationWarehouseId', otherWarehouses[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch warehouses:', error);
        toast({
          title: 'Fehler',
          description: 'Lager konnten nicht geladen werden.',
          variant: 'destructive',
        });
      }
    };

    fetchWarehouses();
  }, [warehouseId, form]);

  // Fetch inventory with positive stock
  useEffect(() => {
    const fetchInventory = async () => {
      setInventoryLoading(true);
      try {
        const response = await fetch(`/api/warehouses/${warehouseId}/inventory?showZeroStock=false`);
        if (response.ok) {
          const data = await response.json();
          setInventory(data);
        }
      } catch (error) {
        console.error('Failed to fetch inventory:', error);
        toast({
          title: 'Fehler',
          description: 'Lagerbestand konnte nicht geladen werden.',
          variant: 'destructive',
        });
      } finally {
        setInventoryLoading(false);
      }
    };

    fetchInventory();
  }, [warehouseId]);

  // Check if any product has quantity set
  useEffect(() => {
    const anyQuantity = Object.values(productTransfers).some(qty => qty > 0);
    setHasAnyQuantity(anyQuantity);
  }, [productTransfers]);

  // Handle quantity change for a product
  const handleQuantityChange = (productId: number, quantity: number) => {
    setProductTransfers(prev => ({
      ...prev,
      [productId]: quantity
    }));
  };

  // Filter inventory items based on search term
  const filteredAndSortedInventory = inventory.filter(item => {
    return item.productName?.toLowerCase().includes(filter.toLowerCase());
  });

  // Form submission handler
  const onSubmit = async (data: TransferFormValues) => {
    // Validate that at least one product has a quantity
    if (!hasAnyQuantity) {
      toast({
        title: 'Keine Menge angegeben',
        description: 'Bitte geben Sie mindestens für ein Produkt eine Menge an.',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate destination based on type
    if (data.destinationType === 'WAREHOUSE' && !data.destinationWarehouseId) {
      toast({
        title: 'Kein Ziellager ausgewählt',
        description: 'Bitte wählen Sie ein Ziellager aus.',
        variant: 'destructive',
      });
      return;
    }
    
    if (data.destinationType === 'EXTERNAL' && !data.externalDestination) {
      toast({
        title: 'Kein externes Ziel angegeben',
        description: 'Bitte geben Sie ein externes Ziel an (z.B. "Vernichtet", "Entnommen").',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Prepare products for transfer
      const productsToTransfer = Object.entries(productTransfers)
        .filter(([_, qty]) => qty > 0)
        .map(([productId, quantity]) => ({
          productId: Number(productId),
          quantity: Number(quantity)
        }));
      
      // Create the movement data
      const movementData = {
        sourceWarehouseId: warehouseId,
        destinationType: data.destinationType,
        destinationWarehouseId: data.destinationType === 'WAREHOUSE' ? data.destinationWarehouseId : undefined,
        externalDestination: data.destinationType === 'EXTERNAL' ? data.externalDestination : undefined,
        notes: data.notes,
        products: productsToTransfer
      };
      
      // Submit the movement request
      const response = await apiRequest('/api/warehouse-movements/transfer', {
        method: 'POST',
        data: movementData,
      });
      
      toast({
        title: 'Warenbewegung erfolgreich',
        description: `${productsToTransfer.length} Produkte wurden erfolgreich ${data.destinationType === 'WAREHOUSE' ? 'transferiert' : 'ausgebucht'}.`,
      });
      
      // Reset the form
      setProductTransfers({});
      form.reset({
        destinationType: 'WAREHOUSE',
        destinationWarehouseId: warehouses.length > 0 ? warehouses[0].id : undefined,
        externalDestination: '',
        notes: '',
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId, 'inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId, 'movements'] });
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
      
    } catch (error: any) {
      console.error('Error submitting movement:', error);
      toast({
        title: 'Fehler bei der Warenbewegung',
        description: error.message || 'Die Warenbewegung konnte nicht durchgeführt werden.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {form.watch('destinationType') === 'WAREHOUSE' ? (
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Trash className="h-5 w-5 text-muted-foreground" />
          )}
          {form.watch('destinationType') === 'WAREHOUSE' ? 'Warentransfer zu anderem Lager' : 'Warenausgang (Entnahme)'}
        </CardTitle>
        <CardDescription>
          Produkte aus dem aktuellen Lager in ein anderes Lager transferieren oder ausbuchen
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Zieltyp: Lager oder Extern */}
            <FormField
              control={form.control}
              name="destinationType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zieltyp</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Zieltyp auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="WAREHOUSE">
                        <div className="flex items-center">
                          <Truck className="h-4 w-4 mr-2" />
                          <span>Transfer zu anderem Lager</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="EXTERNAL">
                        <div className="flex items-center">
                          <Trash className="h-4 w-4 mr-2" />
                          <span>Externes Ziel (Entnahme/Vernichtung)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Wählen Sie, ob die Produkte zu einem anderen Lager transferiert oder ausgebucht werden sollen.
                  </FormDescription>
                </FormItem>
              )}
            />

            {/* Wenn Lager ausgewählt ist */}
            {form.watch('destinationType') === 'WAREHOUSE' && (
              <FormField
                control={form.control}
                name="destinationWarehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ziellager</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(Number(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ziellager auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses.length === 0 ? (
                          <SelectItem value="" disabled>
                            Keine anderen Lager verfügbar
                          </SelectItem>
                        ) : (
                          warehouses.map((warehouse) => (
                            <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                              {warehouse.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Wählen Sie das Lager, in das die Produkte transferiert werden sollen.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Wenn Extern ausgewählt ist */}
            {form.watch('destinationType') === 'EXTERNAL' && (
              <FormField
                control={form.control}
                name="externalDestination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Externes Ziel</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Externes Ziel auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Vernichtet">Vernichtet</SelectItem>
                        <SelectItem value="Entnommen">Entnommen</SelectItem>
                        <SelectItem value="Beschädigt">Beschädigt</SelectItem>
                        <SelectItem value="Abgelaufen">Abgelaufen</SelectItem>
                        <SelectItem value="Gespendet">Gespendet</SelectItem>
                        <SelectItem value="Verkauft">Verkauft</SelectItem>
                        <SelectItem value="Probeentnahme">Probeentnahme</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Wählen Sie den Grund für die Ausbuchung der Produkte.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notizen */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optionale Notizen zur Warenbewegung"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Fügen Sie zusätzliche Informationen zu dieser Warenbewegung hinzu.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Produkte auswählen */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Produkte im Lager</h3>
                <div className="w-1/3">
                  <Input
                    placeholder="Produkte filtern..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              {inventoryLoading ? (
                <div className="flex justify-center items-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="ml-2">Lade Produkte...</span>
                </div>
              ) : filteredAndSortedInventory.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Keine Produkte gefunden</AlertTitle>
                  <AlertDescription>
                    Es wurden keine Produkte mit Bestand in diesem Lager gefunden.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produkt</TableHead>
                        <TableHead className="w-[150px]">Verfügbar</TableHead>
                        <TableHead className="w-[150px]">Menge</TableHead>
                        <TableHead className="w-[100px] text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedInventory.map((item: any) => (
                        <TableRow key={item.productId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{item.productName}</div>
                              <div className="text-xs text-muted-foreground">
                                ID: {item.productId} {item.nextExpiryDate && `• MHD: ${format(new Date(item.nextExpiryDate), 'dd.MM.yyyy', { locale: de })}`}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={Number(item.quantity) > 0 ? "outline" : "destructive"}>
                              {item.quantity} Stk.
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={productTransfers[item.productId] || 0}
                              onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value) || 0)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleQuantityChange(item.productId, Number(item.quantity))}
                              disabled={Number(item.quantity) <= 0}
                            >
                              Max
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Übersicht der ausgewählten Produkte */}
            {hasAnyQuantity && (
              <div className="border rounded-md p-4 bg-muted/30">
                <h3 className="font-medium mb-2">Zusammenfassung</h3>
                <ul className="space-y-1 mb-4">
                  {Object.entries(productTransfers).filter(([_, qty]) => qty > 0).map(([productId, quantity]) => {
                    const product = inventory.find(item => item.productId === Number(productId));
                    return (
                      <li key={productId} className="flex justify-between">
                        <span>{product?.productName}</span>
                        <span className="font-medium">{quantity} Stk.</span>
                      </li>
                    );
                  })}
                </ul>
                <Separator className="my-2" />
                <div className="flex justify-between font-medium">
                  <span>Insgesamt:</span>
                  <span>{Object.values(productTransfers).filter(qty => qty > 0).reduce((sum, qty) => sum + qty, 0)} Stk.</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting || !hasAnyQuantity}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verarbeite...
                </>
              ) : (
                <>
                  {form.watch('destinationType') === 'WAREHOUSE' ? (
                    <>
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Produkte transferieren
                    </>
                  ) : (
                    <>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Produkte ausbuchen
                    </>
                  )}
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}