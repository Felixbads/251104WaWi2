import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from "@/components/ui/form";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRight, 
  Check,
  LoaderCircle,
  Package 
} from "lucide-react";

// Definieren der Transfer-Formularvalidierungen
const transferSchema = z.object({
  sourceWarehouseId: z.string().min(1, { message: "Bitte Quelllager wählen" }),
  destinationWarehouseId: z.string().min(1, { message: "Bitte Ziellager wählen" }),
  productId: z.string().min(1, { message: "Bitte Produkt wählen" }),
  quantity: z.number().min(1, { message: "Menge muss größer als 0 sein" }),
  notes: z.string().optional(),
}).refine(data => data.sourceWarehouseId !== data.destinationWarehouseId, {
  message: "Quell- und Ziellager müssen unterschiedlich sein",
  path: ["destinationWarehouseId"],
});

type TransferFormValues = z.infer<typeof transferSchema>;

export default function WarehouseTransfer() {
  const { toast } = useToast();
  const [selectedSourceWarehouse, setSelectedSourceWarehouse] = useState<string>("");
  
  // Abrufen aller Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest<any[]>('/api/warehouses'),
  });

  // Produkte im ausgewählten Quelllager abrufen
  const { data: sourceWarehouseProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/warehouses', selectedSourceWarehouse, 'inventory'],
    queryFn: () => selectedSourceWarehouse 
      ? apiRequest<any[]>(`/api/warehouses/${selectedSourceWarehouse}/inventory`) 
      : Promise.resolve([]),
    enabled: !!selectedSourceWarehouse,
  });

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      sourceWarehouseId: "",
      destinationWarehouseId: "",
      productId: "",
      quantity: 1,
      notes: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const selectedDestinationWarehouse = form.watch("destinationWarehouseId");

  const handleSourceWarehouseChange = (value: string) => {
    setSelectedSourceWarehouse(value);
    form.setValue("sourceWarehouseId", value);
    
    // Produkt zurücksetzen, wenn sich das Quelllager ändert
    form.setValue("productId", "");
    
    // Wenn das Ziellager gleich dem neuen Quelllager ist, dann Ziellager zurücksetzen
    if (selectedDestinationWarehouse === value) {
      form.setValue("destinationWarehouseId", "");
    }
  };

  const getAvailableDestinationWarehouses = () => {
    if (!warehouses) return [];
    return warehouses.filter(w => w.id.toString() !== selectedSourceWarehouse);
  };

  const onSubmit = async (values: TransferFormValues) => {
    try {
      const transferData = {
        productId: parseInt(values.productId),
        quantity: values.quantity,
        movementType: "TRANSFER",
        sourceWarehouseId: parseInt(values.sourceWarehouseId),
        destinationWarehouseId: parseInt(values.destinationWarehouseId),
        notes: values.notes || null,
      };

      await apiRequest('/api/inventory-movements', {
        method: 'POST',
        data: transferData,
      });

      toast({
        title: "Transfer erfolgreich",
        description: "Der Produkttransfer wurde erfolgreich durchgeführt.",
      });

      // Zurücksetzen des Formulars
      form.reset();
      
      // Cache invalidieren, damit die neuesten Daten geladen werden
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
      
      if (selectedSourceWarehouse) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/warehouses', selectedSourceWarehouse, 'inventory'] 
        });
      }
      
      if (selectedDestinationWarehouse) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/warehouses', selectedDestinationWarehouse, 'inventory'] 
        });
      }
    } catch (error) {
      console.error("Fehler beim Transfer:", error);
      toast({
        title: "Fehler beim Transfer",
        description: "Beim Produkttransfer ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Quelllager und Produkt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="sourceWarehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quelllager</FormLabel>
                      <Select
                        disabled={warehousesLoading || isSubmitting}
                        onValueChange={(value) => handleSourceWarehouseChange(value)}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Quelllager auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses?.map((warehouse) => (
                            <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                              {warehouse.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Das Lager, aus dem Produkte transferiert werden
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Produkt</FormLabel>
                      <Select
                        disabled={!selectedSourceWarehouse || productsLoading || isSubmitting}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Produkt auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sourceWarehouseProducts?.map((product) => (
                            <SelectItem key={product.id} value={product.productId.toString()}>
                              {product.productName} ({product.quantity} verfügbar)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Das zu transferierende Produkt
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Menge</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          disabled={isSubmitting}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Anzahl der zu transferierenden Einheiten
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ziellager und Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="destinationWarehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ziellager</FormLabel>
                      <Select
                        disabled={!selectedSourceWarehouse || warehousesLoading || isSubmitting}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Ziellager auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getAvailableDestinationWarehouses().map((warehouse) => (
                            <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                              {warehouse.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Das Lager, in das Produkte transferiert werden
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
                      <FormLabel>Notizen</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Zusätzliche Informationen zum Transfer"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Optionale Informationen zum Produkttransfer
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center my-6">
            <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full">
              <ArrowRight className="w-8 h-8 text-gray-500" />
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:justify-between gap-4">
            <div className="flex items-center space-x-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              <span>Alle Felder mit * sind Pflichtfelder</span>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Transfer wird durchgeführt...
                  </>
                ) : (
                  "Produkttransfer durchführen"
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}