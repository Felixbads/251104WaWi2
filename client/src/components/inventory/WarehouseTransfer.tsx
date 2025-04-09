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
  Send
} from "lucide-react";

// Definieren der Transfer-Formularvalidierungen für ein einzelnes Produkt
const transferItemSchema = z.object({
  sourceWarehouseId: z.string().min(1, { message: "Bitte Quelllager wählen" }),
  destinationWarehouseId: z.string().min(1, { message: "Bitte Ziellager wählen" }),
  productId: z.string().min(1, { message: "Bitte Produkt wählen" }),
  quantity: z.number().min(1, { message: "Menge muss größer als 0 sein" }),
}).refine(data => data.sourceWarehouseId !== data.destinationWarehouseId, {
  message: "Quell- und Ziellager müssen unterschiedlich sein",
  path: ["destinationWarehouseId"],
});

// Gesamtschema mit optionalen Notizen
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

type TransferItemValues = z.infer<typeof transferItemSchema>;
type TransferFormValues = z.infer<typeof transferSchema>;

// Interface für ein Produkt im Warenkorb
interface CartItem {
  id: string;
  productId: number;
  productName: string;
  quantity: number;
  availableQuantity: number;
}

export default function WarehouseTransfer() {
  const { toast } = useToast();
  const [selectedSourceWarehouse, setSelectedSourceWarehouse] = useState<string>("");
  const [selectedDestinationWarehouse, setSelectedDestinationWarehouse] = useState<string>("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [isSubmittingCart, setIsSubmittingCart] = useState(false);
  
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

  // Wenn sich das Quelllager ändert, aktualisieren wir auch den Warenkorb und das Formular
  useEffect(() => {
    if (selectedSourceWarehouse !== form.getValues().sourceWarehouseId) {
      form.setValue("sourceWarehouseId", selectedSourceWarehouse);
      form.setValue("productId", "");
      setCartItems([]);
    }
  }, [selectedSourceWarehouse, form]);

  // Wenn sich das Ziellager ändert, aktualisieren wir das Formular
  useEffect(() => {
    if (selectedDestinationWarehouse !== form.getValues().destinationWarehouseId) {
      form.setValue("destinationWarehouseId", selectedDestinationWarehouse);
    }
  }, [selectedDestinationWarehouse, form]);

  const isSubmitting = form.formState.isSubmitting;

  const handleSourceWarehouseChange = (value: string) => {
    setSelectedSourceWarehouse(value);
    
    // Produkt zurücksetzen, wenn sich das Quelllager ändert
    form.setValue("productId", "");
    
    // Wenn das Ziellager gleich dem neuen Quelllager ist, dann Ziellager zurücksetzen
    if (selectedDestinationWarehouse === value) {
      setSelectedDestinationWarehouse("");
    }
  };

  const handleDestinationWarehouseChange = (value: string) => {
    setSelectedDestinationWarehouse(value);
  };

  const getAvailableDestinationWarehouses = () => {
    if (!warehouses) return [];
    return warehouses.filter(w => w.id.toString() !== selectedSourceWarehouse);
  };

  // Produkt zum Warenkorb hinzufügen
  const addToCart = (values: TransferFormValues) => {
    const selectedProduct = sourceWarehouseProducts?.find(p => p.productId.toString() === values.productId);
    
    if (!selectedProduct) {
      toast({
        title: "Fehler",
        description: "Produkt konnte nicht gefunden werden.",
        variant: "destructive",
      });
      return;
    }

    // Prüfen, ob das Produkt bereits im Warenkorb ist
    const existingItemIndex = cartItems.findIndex(item => item.productId === parseInt(values.productId));
    
    if (existingItemIndex >= 0) {
      // Vorhandenes Produkt aktualisieren
      const updatedItems = [...cartItems];
      const newQuantity = updatedItems[existingItemIndex].quantity + values.quantity;
      
      // Sicherstellen, dass die Menge nicht die verfügbare Menge übersteigt
      if (newQuantity > selectedProduct.quantity) {
        toast({
          title: "Fehler",
          description: `Es sind nur ${selectedProduct.quantity} Einheiten verfügbar.`,
          variant: "destructive",
        });
        return;
      }
      
      updatedItems[existingItemIndex].quantity = newQuantity;
      setCartItems(updatedItems);
    } else {
      // Neues Produkt hinzufügen
      if (values.quantity > selectedProduct.quantity) {
        toast({
          title: "Fehler",
          description: `Es sind nur ${selectedProduct.quantity} Einheiten verfügbar.`,
          variant: "destructive",
        });
        return;
      }
      
      const newItem: CartItem = {
        id: Date.now().toString(),
        productId: parseInt(values.productId),
        productName: selectedProduct.productName,
        quantity: values.quantity,
        availableQuantity: selectedProduct.quantity
      };
      
      setCartItems([...cartItems, newItem]);
    }
    
    // Zurücksetzen des Produkt- und Mengenfelds für die nächste Eingabe
    form.setValue("productId", "");
    form.setValue("quantity", 1);
    
    toast({
      title: "Produkt hinzugefügt",
      description: `${selectedProduct.productName} wurde zum Warenkorb hinzugefügt.`,
    });
  };

  // Produkt aus dem Warenkorb entfernen
  const removeFromCart = (itemId: string) => {
    setCartItems(cartItems.filter(item => item.id !== itemId));
  };

  // Gesamten Warenkorb übertragen
  const submitCart = async () => {
    if (cartItems.length === 0) {
      toast({
        title: "Fehler",
        description: "Der Warenkorb ist leer.",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedSourceWarehouse || !selectedDestinationWarehouse) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie Quell- und Ziellager aus.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsSubmittingCart(true);
      
      // API-Anfrage für Warentransfer mit mehreren Produkten
      const transferData = {
        sourceWarehouseId: parseInt(selectedSourceWarehouse),
        targetWarehouseId: parseInt(selectedDestinationWarehouse),
        items: cartItems.map(item => ({
          productId: item.productId,
          quantity: item.quantity
        })),
        notes: notes || null,
      };

      await apiRequest('/api/warehouse-movements/warehouses/transfer', {
        method: 'POST',
        data: transferData,
      });

      toast({
        title: "Transfer erfolgreich",
        description: `${cartItems.length} Produkte wurden erfolgreich transferiert.`,
      });

      // Zurücksetzen des Formulars und Warenkorbs
      setCartItems([]);
      setNotes("");
      
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
    } finally {
      setIsSubmittingCart(false);
    }
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form 
          onSubmit={form.handleSubmit(addToCart)} 
          className="space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Quelllager und Produkt</CardTitle>
                <CardDescription>
                  Fügen Sie Produkte zum Warenkorb hinzu
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="sourceWarehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quelllager</FormLabel>
                      <Select
                        disabled={warehousesLoading || isSubmitting || cartItems.length > 0}
                        onValueChange={handleSourceWarehouseChange}
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
                          {sourceWarehouseProducts && sourceWarehouseProducts.length > 0 ? (
                            sourceWarehouseProducts.map((product) => (
                              <SelectItem 
                                key={product.id} 
                                value={product.productId.toString()}
                                disabled={product.quantity <= 0}
                              >
                                {product.productName} ({product.quantity} verfügbar)
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="keine" disabled>
                              Keine Produkte verfügbar
                            </SelectItem>
                          )}
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
                          disabled={isSubmitting || !form.watch("productId")}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                          min="1"
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
              <CardFooter>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !form.watch("productId") || !form.watch("sourceWarehouseId")}
                  variant="outline"
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Zum Warenkorb hinzufügen
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ziellager und Details</CardTitle>
                <CardDescription>
                  Geben Sie das Ziellager und optionale Notizen an
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="destinationWarehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ziellager</FormLabel>
                      <Select
                        disabled={!selectedSourceWarehouse || warehousesLoading || isSubmitting || cartItems.length > 0}
                        onValueChange={handleDestinationWarehouseChange}
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

                <div>
                  <FormLabel>Notizen</FormLabel>
                  <Textarea
                    placeholder="Zusätzliche Informationen zum Transfer"
                    disabled={isSubmitting}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1"
                  />
                  <FormDescription className="mt-1">
                    Optionale Informationen zum Produkttransfer
                  </FormDescription>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </Form>

      {/* Warenkorb-Übersicht */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Warenkorb</span>
            <Badge variant="outline">{cartItems.length} Produkte</Badge>
          </CardTitle>
          <CardDescription>
            Zu übertragende Produkte von {
              warehouses?.find(w => w.id.toString() === selectedSourceWarehouse)?.name || "Quelllager"
            } nach {
              warehouses?.find(w => w.id.toString() === selectedDestinationWarehouse)?.name || "Ziellager"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cartItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Menge</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cartItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeFromCart(item.id)} 
                        title="Aus Warenkorb entfernen"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              Der Warenkorb ist leer. Bitte fügen Sie Produkte hinzu.
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button 
            variant="outline" 
            disabled={cartItems.length === 0}
            onClick={() => setCartItems([])}
          >
            Warenkorb leeren
          </Button>
          <Button 
            onClick={submitCart} 
            disabled={isSubmittingCart || cartItems.length === 0 || !selectedSourceWarehouse || !selectedDestinationWarehouse}
          >
            {isSubmittingCart ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Transfer wird durchgeführt...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Alle Produkte transferieren
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      <div className="flex justify-center my-6">
        <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full">
          <ArrowRight className="w-8 h-8 text-gray-500" />
        </div>
      </div>
    </div>
  );
}