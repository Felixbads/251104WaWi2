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
  ArrowDown, 
  Check,
  LoaderCircle,
} from "lucide-react";

// Definieren der Warenentnahme-Formularvalidierungen
const withdrawalSchema = z.object({
  warehouseId: z.string().min(1, { message: "Bitte Lager wählen" }),
  productId: z.string().min(1, { message: "Bitte Produkt wählen" }),
  quantity: z.number().min(1, { message: "Menge muss größer als 0 sein" }),
  notes: z.string().optional(),
  reason: z.string().min(1, { message: "Bitte Grund für die Entnahme angeben" }),
});

type WithdrawalFormValues = z.infer<typeof withdrawalSchema>;

// Gründe für die Warenentnahme
const withdrawalReasons = [
  { id: "damaged", label: "Beschädigte Ware" },
  { id: "expired", label: "Abgelaufene Ware" },
  { id: "internal_use", label: "Interne Verwendung" },
  { id: "stock_correction", label: "Bestandskorrektur" },
  { id: "other", label: "Sonstiges" },
];

export default function WarehouseWithdrawal() {
  const { toast } = useToast();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  
  // Abrufen aller Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest<any[]>('/api/warehouses'),
  });

  // Produkte im ausgewählten Lager abrufen
  const { data: warehouseProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/warehouses', selectedWarehouse, 'inventory'],
    queryFn: () => selectedWarehouse 
      ? apiRequest<any[]>(`/api/warehouses/${selectedWarehouse}/inventory`) 
      : Promise.resolve([]),
    enabled: !!selectedWarehouse,
  });

  const form = useForm<WithdrawalFormValues>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      warehouseId: "",
      productId: "",
      quantity: 1,
      notes: "",
      reason: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  const handleWarehouseChange = (value: string) => {
    setSelectedWarehouse(value);
    form.setValue("warehouseId", value);
    
    // Produkt zurücksetzen, wenn sich das Lager ändert
    form.setValue("productId", "");
  };

  const onSubmit = async (values: WithdrawalFormValues) => {
    try {
      const withdrawalData = {
        productId: parseInt(values.productId),
        quantity: values.quantity,
        movementType: "OUT",
        sourceWarehouseId: parseInt(values.warehouseId),
        notes: `Grund: ${withdrawalReasons.find(r => r.id === values.reason)?.label || values.reason}${values.notes ? ` - ${values.notes}` : ''}`,
      };

      await apiRequest('/api/inventory-movements', {
        method: 'POST',
        data: withdrawalData,
      });

      toast({
        title: "Entnahme erfolgreich",
        description: "Die Warenentnahme wurde erfolgreich durchgeführt.",
      });

      // Zurücksetzen des Formulars
      form.reset();
      
      // Cache invalidieren, damit die neuesten Daten geladen werden
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-movements'] });
      
      if (selectedWarehouse) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/warehouses', selectedWarehouse, 'inventory'] 
        });
      }
    } catch (error) {
      console.error("Fehler bei der Entnahme:", error);
      toast({
        title: "Fehler bei der Entnahme",
        description: "Bei der Warenentnahme ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Warenentnahme aus dem Lager</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lager</FormLabel>
                      <Select
                        disabled={warehousesLoading || isSubmitting}
                        onValueChange={(value) => handleWarehouseChange(value)}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Lager auswählen" />
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
                        Das Lager, aus dem Produkte entnommen werden
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
                        disabled={!selectedWarehouse || productsLoading || isSubmitting}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Produkt auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouseProducts?.map((product) => (
                            <SelectItem key={product.id} value={product.productId.toString()}>
                              {product.productName} ({product.quantity} verfügbar)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Das zu entnehmende Produkt
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
                        Anzahl der zu entnehmenden Einheiten
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grund für die Entnahme</FormLabel>
                      <Select
                        disabled={isSubmitting}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Grund wählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {withdrawalReasons.map((reason) => (
                            <SelectItem key={reason.id} value={reason.id}>
                              {reason.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Warum wird das Produkt aus dem Lager entnommen?
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
                          placeholder="Zusätzliche Informationen zur Entnahme"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Optionale Informationen zur Warenentnahme
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
              <ArrowDown className="w-8 h-8 text-gray-500" />
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
                    Entnahme wird durchgeführt...
                  </>
                ) : (
                  "Warenentnahme durchführen"
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}