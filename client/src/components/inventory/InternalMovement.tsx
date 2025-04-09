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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  ArrowRightLeft,
  Warehouse,
  Truck,
  ShoppingCart,
  RotateCcw,
  Search,
  Info,
  Loader2,
  ChevronsUpDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

// Schema für die interne Umlagerung
const internalMovementSchema = z.object({
  sourceLocation: z.string().min(1, "Quelllagerplatz ist erforderlich"),
  destinationLocation: z.string().min(1, "Ziellagerplatz ist erforderlich"),
  productId: z.number().min(1, "Produkt ist erforderlich"),
  quantity: z.number().min(1, "Menge muss mindestens 1 sein"),
  notes: z.string().optional(),
});

type InternalMovementFormValues = z.infer<typeof internalMovementSchema>;

interface InternalMovementProps {
  warehouseId: number;
  onSuccess?: () => void;
}

export default function InternalMovement({ warehouseId, onSuccess }: InternalMovementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [locations, setLocations] = useState<{id: string, name: string}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form definition
  const form = useForm<InternalMovementFormValues>({
    resolver: zodResolver(internalMovementSchema),
    defaultValues: {
      sourceLocation: '',
      destinationLocation: '',
      productId: 0,
      quantity: 1,
      notes: '',
    },
  });

  // Lagerplätze beim Laden abrufen
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        // Verwenden der neuen API-Route für Lagerplätze
        const response = await fetch(`/api/warehouse-locations/${warehouseId}`);
        
        if (response.ok) {
          const data = await response.json();
          // Transformieren der Daten in das erwartete Format
          const formattedLocations = data.map(loc => ({
            id: loc.name,
            name: loc.name
          }));
          
          setLocations(formattedLocations);
          
          // Wenn wir Lagerplätze haben, setzen wir den ersten als Standard
          if (formattedLocations.length > 0) {
            form.setValue('sourceLocation', formattedLocations[0].id);
            // Wenn mehr als ein Lagerplatz vorhanden ist, setzen wir den zweiten als Ziel
            // sonst den ersten
            const destinationIndex = formattedLocations.length > 1 ? 1 : 0;
            form.setValue('destinationLocation', formattedLocations[destinationIndex].id);
          }
        } else {
          console.error('Fehler beim Laden der Lagerplätze:', await response.text());
          
          // Standard-Lagerplätze für den Fall, dass keine vorhanden sind
          const standardLocations = [
            { id: 'Hauptlager', name: 'Hauptlager' },
            { id: 'Verkaufsbereich', name: 'Verkaufsbereich' }
          ];
          setLocations(standardLocations);
          
          if (standardLocations.length > 0) {
            form.setValue('sourceLocation', standardLocations[0].id);
            form.setValue('destinationLocation', standardLocations[1].id);
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden der Lagerplätze:', error);
        toast({
          title: "Fehler",
          description: "Lagerplätze konnten nicht geladen werden. Standard-Lagerplätze werden verwendet.",
          variant: "destructive",
        });
        
        // Fallback: Erstelle Dummy-Lagerplätze bei Fehlern
        const dummyLocations = [
          { id: 'regal_a', name: 'Regal A' },
          { id: 'regal_b', name: 'Regal B' },
          { id: 'kuehlraum', name: 'Kühlraum' },
          { id: 'eingang', name: 'Eingangsbereich' },
          { id: 'theke', name: 'Theke' },
        ];
        setLocations(dummyLocations);
        
        if (dummyLocations.length > 0) {
          form.setValue('sourceLocation', dummyLocations[0].id);
          form.setValue('destinationLocation', dummyLocations[1].id);
        }
      }
    };

    fetchLocations();
  }, [warehouseId, form]);

  // Produkte nach Eingabe suchen
  const searchProducts = async () => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/warehouses/${warehouseId}/inventory/search?query=${encodeURIComponent(searchTerm)}`);
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      } else {
        console.error('Fehler bei der Produktsuche:', await response.text());
        setSearchResults([]);
        toast({
          title: "Suchfehler",
          description: "Produkte konnten nicht durchsucht werden.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Fehler bei der Produktsuche:', error);
      setSearchResults([]);
      toast({
        title: "Suchfehler",
        description: "Verbindungsproblem bei der Produktsuche.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Produkt auswählen
  const selectProduct = (product: any) => {
    setSelectedProduct(product);
    form.setValue('productId', product.productId);
    setSearchTerm(product.productName);
    setSearchResults([]);
    
    // Setze die Menge auf einen sinnvollen Default-Wert (z.B. 1 oder max. 10% des Bestands)
    const maxQuantity = product.quantity || 0;
    const defaultQuantity = Math.max(1, Math.min(10, Math.floor(maxQuantity * 0.1)));
    form.setValue('quantity', defaultQuantity);
  };

  // Formular abschicken
  const onSubmit = async (data: InternalMovementFormValues) => {
    if (!selectedProduct) {
      toast({
        title: "Produktauswahl fehlt",
        description: "Bitte wählen Sie ein Produkt aus der Liste aus.",
        variant: "destructive",
      });
      return;
    }

    if (data.sourceLocation === data.destinationLocation) {
      toast({
        title: "Identische Lagerplätze",
        description: "Quell- und Ziellagerplatz dürfen nicht identisch sein.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const movement = {
        warehouseId,
        productId: data.productId,
        quantity: data.quantity,
        sourceLocation: data.sourceLocation,
        destinationLocation: data.destinationLocation,
        movementType: 'INTERNAL',
        notes: data.notes || `Interne Umlagerung von ${locations.find(l => l.id === data.sourceLocation)?.name || data.sourceLocation} nach ${locations.find(l => l.id === data.destinationLocation)?.name || data.destinationLocation}`,
      };

      const response = await apiRequest('/api/warehouses/movements/internal', {
        method: 'POST',
        data: movement,
      });

      toast({
        title: "Umlagerung erfolgreich",
        description: `${data.quantity} × ${selectedProduct.productName} erfolgreich umgelagert.`,
      });

      // Formular zurücksetzen
      form.reset({
        sourceLocation: data.sourceLocation,
        destinationLocation: data.destinationLocation,
        productId: 0,
        quantity: 1,
        notes: '',
      });
      
      setSelectedProduct(null);
      setSearchTerm('');

      // Cache invalidieren
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId, 'movements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId, 'inventory'] });
      
      // Callback aufrufen, wenn vorhanden
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Fehler bei der Umlagerung:', error);
      toast({
        title: "Umlagerung fehlgeschlagen",
        description: error.message || "Die Warenbewegung konnte nicht durchgeführt werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
          Interne Umlagerung
        </CardTitle>
        <CardDescription>
          Produkte innerhalb des Lagers zwischen verschiedenen Lagerplätzen umlagern
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Produkt-Auswahl */}
            <div className="space-y-4">
              <Label htmlFor="productSearch">Produkt</Label>
              <div className="flex gap-2">
                <Input
                  id="productSearch"
                  placeholder="Produktname eingeben..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchProducts();
                    }
                  }}
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  onClick={searchProducts}
                  variant="outline"
                  disabled={isSearching || searchTerm.length < 2}
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* Suchergebnisse */}
              {searchResults.length > 0 && (
                <div className="border rounded-md">
                  <ScrollArea className="h-40">
                    <div className="p-1">
                      {searchResults.map((product) => (
                        <div
                          key={product.productId}
                          className="flex items-center justify-between p-2 hover:bg-accent rounded-sm cursor-pointer"
                          onClick={() => selectProduct(product)}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{product.productName}</div>
                            <div className="text-xs text-muted-foreground">
                              Bestand: {product.quantity} · {product.nextExpiryDate && `MHD: ${format(new Date(product.nextExpiryDate), 'dd.MM.yyyy', { locale: de })}`}
                            </div>
                          </div>
                          <Badge variant="outline">{product.productId}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Ausgewähltes Produkt */}
              {selectedProduct && (
                <div className="p-3 border rounded-md bg-muted/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{selectedProduct.productName}</h4>
                      <p className="text-sm text-muted-foreground">ID: {selectedProduct.productId}</p>
                    </div>
                    <Badge variant={selectedProduct.quantity > 0 ? "default" : "destructive"}>
                      Bestand: {selectedProduct.quantity}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Quelllagerplatz */}
              <FormField
                control={form.control}
                name="sourceLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quelllagerplatz</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Lagerplatz auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.map(location => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Der aktuelle Lagerplatz des Produkts
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Ziellagerplatz */}
              <FormField
                control={form.control}
                name="destinationLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ziellagerplatz</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Lagerplatz auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.map(location => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Der neue Lagerplatz für das Produkt
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                      min={1}
                      max={selectedProduct?.quantity || 9999}
                    />
                  </FormControl>
                  <FormDescription>
                    {selectedProduct && `Verfügbar: ${selectedProduct.quantity} Einheiten`}
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
                  <FormLabel>Notizen (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Gründe für die Umlagerung oder sonstige Notizen"
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit-Button */}
            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={isSubmitting || !selectedProduct}
                className="w-full md:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird umgelagert...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Produkt umlagern
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col items-start">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5" />
          <p>
            Die interne Umlagerung verändert nicht die Gesamtbestandsmenge im Lager, 
            sondern dokumentiert nur die Verschiebung zwischen verschiedenen Lagerplätzen.
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}