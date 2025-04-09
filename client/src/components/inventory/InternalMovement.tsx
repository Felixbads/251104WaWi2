import { useState, useEffect } from "react";
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
  CardTitle,
  CardFooter,
  CardDescription 
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRight, 
  Check,
  LoaderCircle,
  Package,
  Plus,
  Trash2,
  Send,
  ArrowUpDown,
  PlusCircle,
  MinusCircle
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Definieren der Validierungsregeln für die interne Lagerbewegung
const internalMovementSchema = z.object({
  warehouseId: z.string().min(1, { message: "Bitte Lager wählen" }),
  productId: z.string().min(1, { message: "Bitte Produkt wählen" }),
  quantity: z.number().min(1, { message: "Menge muss größer als 0 sein" }),
  movementType: z.enum(["ADD", "REMOVE", "MOVE"], { 
    required_error: "Bitte Bewegungstyp wählen" 
  }),
  reason: z.string().min(1, { message: "Bitte Grund angeben" }),
  newLocation: z.string().optional(),
  notes: z.string().optional(),
});

type InternalMovementFormValues = z.infer<typeof internalMovementSchema>;

// Interface für Warehouse
interface Warehouse {
  id: number;
  name: string;
  description?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  is_active?: boolean;
}

// Interface für Inventory Item
interface InventoryItem {
  id: number;
  product_id: number;
  productId: number;
  productName: string;
  warehouseId: number;
  quantity: number;
  minimum_stock?: number;
  min_quantity?: number;
  minQuantity?: number;
  current_stock?: number;
  currentStock?: number;
  location?: string;
  status?: string;
  batch_count?: number;
  category?: string;
  sku?: string;
}

export default function InternalMovement() {
  const { toast } = useToast();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  
  // Abrufen aller Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest('/api/warehouses'),
  });

  // Produkte im ausgewählten Lager abrufen
  const { data: warehouseProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/inventory/warehouse', selectedWarehouse],
    queryFn: () => selectedWarehouse 
      ? apiRequest(`/api/inventory/warehouse/${selectedWarehouse}`) 
      : Promise.resolve([]),
    enabled: !!selectedWarehouse,
  });

  const form = useForm<InternalMovementFormValues>({
    resolver: zodResolver(internalMovementSchema),
    defaultValues: {
      warehouseId: "",
      productId: "",
      quantity: 1,
      movementType: "ADD",
      reason: "",
      newLocation: "",
      notes: "",
    },
  });

  // Wenn sich das Lager ändert, aktualisieren wir das Formular
  useEffect(() => {
    if (selectedWarehouse !== form.getValues().warehouseId) {
      form.setValue("warehouseId", selectedWarehouse);
      form.setValue("productId", "");
    }
  }, [selectedWarehouse, form]);

  const isSubmitting = form.formState.isSubmitting;

  const handleWarehouseChange = (value: string) => {
    setSelectedWarehouse(value);
    form.setValue("productId", "");
  };

  // Details zu einem ausgewählten Produkt abrufen
  const getSelectedProduct = () => {
    const productId = form.getValues().productId;
    if (!productId || !warehouseProducts) return null;
    
    return warehouseProducts.find((p: InventoryItem) => 
      p.productId.toString() === productId || p.product_id?.toString() === productId
    );
  };

  // Formular absenden
  const onSubmit = async (values: InternalMovementFormValues) => {
    try {
      // Bestimme API-Endpunkt und passende Datenstruktur basierend auf der Bewegungsart
      let endpoint = '/api/inventory/movements';
      let payload: any = {
        quantity: values.quantity,
        movementType: values.movementType === "ADD" ? "IN" : (values.movementType === "REMOVE" ? "OUT" : "TRANSFER"),
        reason: values.reason,
        notes: values.notes,
      };
      
      // Produktdetails
      const product = getSelectedProduct();
      if (!product) {
        toast({
          title: "Fehler",
          description: "Produkt konnte nicht gefunden werden.",
          variant: "destructive",
        });
        return;
      }
      
      // Grundlegende Daten
      payload.productId = parseInt(values.productId);
      
      switch (values.movementType) {
        case "ADD":
          // Wareneingang in das Lager
          payload.destinationType = "warehouse";
          payload.destinationId = parseInt(values.warehouseId);
          payload.sourceType = "manual";
          payload.sourceId = null;
          break;
          
        case "REMOVE":
          // Warenausgang aus dem Lager
          payload.sourceType = "warehouse";
          payload.sourceId = parseInt(values.warehouseId);
          payload.destinationType = "manual";
          payload.destinationId = null;
          break;
          
        case "MOVE":
          // Umlagerung innerhalb des Lagers (nur Positionsänderung)
          payload.sourceType = "warehouse";
          payload.sourceId = parseInt(values.warehouseId);
          payload.destinationType = "warehouse";
          payload.destinationId = parseInt(values.warehouseId);
          
          // Bei Umlagerung, aktualisiere auch die Lagerposition
          if (values.newLocation) {
            // Zusätzlichen API-Aufruf machen, um die Lagerposition zu aktualisieren
            await apiRequest(`/api/inventory/warehouse/${values.warehouseId}/product/${values.productId}/location`, {
              method: 'PATCH',
              body: JSON.stringify({ location: values.newLocation }),
            });
          }
          break;
      }
      
      // Anfrage zum Erstellen der Warenbewegung senden
      const response = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      // Inventardaten aktualisieren
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/warehouse', selectedWarehouse] });
      
      // Erfolgsmeldung anzeigen
      toast({
        title: "Warenbewegung erfolgreich",
        description: `${values.quantity} Einheiten von ${product.productName} wurden 
          ${values.movementType === "ADD" ? "dem Lager hinzugefügt" : 
           values.movementType === "REMOVE" ? "aus dem Lager entnommen" : 
           "im Lager umgelagert"}.`,
      });
      
      // Formular zurücksetzen, aber Lager beibehalten
      form.reset({
        warehouseId: selectedWarehouse,
        productId: "",
        quantity: 1,
        movementType: form.getValues().movementType,
        reason: "",
        newLocation: "",
        notes: "",
      });
    } catch (error) {
      console.error("Fehler bei der Warenbewegung:", error);
      toast({
        title: "Fehler",
        description: "Die Warenbewegung konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lagerauswahl */}
          <FormField
            control={form.control}
            name="warehouseId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lager</FormLabel>
                <Select
                  disabled={isSubmitting}
                  onValueChange={(value) => {
                    field.onChange(value);
                    handleWarehouseChange(value);
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Lager auswählen" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {warehouses?.map((warehouse: Warehouse) => (
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
          
          {/* Produktauswahl */}
          <FormField
            control={form.control}
            name="productId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Produkt</FormLabel>
                <Select
                  disabled={isSubmitting || !selectedWarehouse}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Produkt auswählen" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {warehouseProducts?.map((product: InventoryItem) => (
                      <SelectItem 
                        key={product.productId} 
                        value={product.productId ? product.productId.toString() : product.product_id.toString()}
                      >
                        {product.productName} ({product.quantity || 0} verfügbar)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        {/* Bewegungsart */}
        <FormField
          control={form.control}
          name="movementType"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Art der Bewegung</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ADD" id="add" />
                    <FormLabel htmlFor="add" className="flex items-center font-normal cursor-pointer">
                      <PlusCircle className="h-4 w-4 mr-2 text-green-500" />
                      Bestand erhöhen (Wareneingang)
                    </FormLabel>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="REMOVE" id="remove" />
                    <FormLabel htmlFor="remove" className="flex items-center font-normal cursor-pointer">
                      <MinusCircle className="h-4 w-4 mr-2 text-red-500" />
                      Bestand verringern (Warenentnahme)
                    </FormLabel>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="MOVE" id="move" />
                    <FormLabel htmlFor="move" className="flex items-center font-normal cursor-pointer">
                      <ArrowUpDown className="h-4 w-4 mr-2 text-blue-500" />
                      Lagerplatz ändern (Umlagerung)
                    </FormLabel>
                  </div>
                </RadioGroup>
              </FormControl>
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
                  min={1}
                  disabled={isSubmitting}
                  placeholder="Menge eingeben"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Neuer Lagerplatz (nur bei Typ "MOVE") */}
        {form.watch("movementType") === "MOVE" && (
          <FormField
            control={form.control}
            name="newLocation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Neuer Lagerplatz</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    disabled={isSubmitting}
                    placeholder="z.B. Regal A, Fach 3"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Geben Sie die neue Position im Lager an
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        {/* Grund der Bewegung */}
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Grund</FormLabel>
              <Select
                disabled={isSubmitting}
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Grund der Bewegung wählen" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="restock">Nachschub / Wareneingang</SelectItem>
                  <SelectItem value="correction">Inventurkorrektur</SelectItem>
                  <SelectItem value="damaged">Beschädigte Ware</SelectItem>
                  <SelectItem value="expired">Abgelaufene Ware</SelectItem>
                  <SelectItem value="reorganization">Lagerreorganisation</SelectItem>
                  <SelectItem value="consumption">Interne Verwendung</SelectItem>
                  <SelectItem value="other">Sonstiger Grund</SelectItem>
                </SelectContent>
              </Select>
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
              <FormLabel>Notizen (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Zusätzliche Informationen zur Warenbewegung"
                  disabled={isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Absenden-Button */}
        <Button 
          type="submit"
          disabled={isSubmitting}
          className="w-full md:w-auto"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Wird verarbeitet...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Warenbewegung registrieren
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}