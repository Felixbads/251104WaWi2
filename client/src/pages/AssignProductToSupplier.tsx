import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSuppliers, updateProduct, getAllVendonProducts } from "@/lib/api";

// UI Komponenten
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  Save, 
  CircleDollarSign, 
  Truck, 
  Tag, 
  Percent, 
  AlertTriangle, 
  PackageCheck,
  Search
} from "lucide-react";

// Validierungsschema für Produkt-Lieferanten-Zuordnung
const productSupplierSchema = z.object({
  vendonProductId: z.string().min(1, "Bitte wählen Sie ein Vendon-Produkt aus"),
  productName: z.string().min(1, "Der Name des Produkts ist erforderlich"),
  supplierId: z.number().min(1, "Bitte wählen Sie einen Lieferanten aus"),
  supplierName: z.string().optional(),
  costPrice: z.coerce.number().min(0, "Der Einkaufspreis muss positiv sein").optional(),
  articleSupplier: z.string().optional(), 
  minOrderQuantity: z.coerce.number().min(0, "Die Mindestbestellmenge muss positiv sein").optional(),
  packageSize: z.string().optional(),
  shelfLifeDays: z.coerce.number().min(0, "Die Haltbarkeit muss eine positive Zahl sein").optional()
});

type ProductSupplierFormValues = z.infer<typeof productSupplierSchema>;

interface VendonProduct {
  id: string;
  name: string;
  price?: number;
  category?: string;
  description?: string;
}

export default function AssignProductToSupplier() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<VendonProduct[]>([]);
  const [selectedVendonProduct, setSelectedVendonProduct] = useState<VendonProduct | null>(null);

  // Holen der Lieferanten für die Auswahlliste
  const { data: suppliersData, isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ['/api/suppliers'],
    queryFn: () => getSuppliers({ limit: 100 }),
    staleTime: 1000 * 60 * 15, // 15 Minuten
  });

  // Holen der Vendon-Produkte
  const { data: vendonProducts, isLoading: isLoadingVendonProducts } = useQuery({
    queryKey: ['/api/vendon/api-products'],
    queryFn: () => getAllVendonProducts(),
    staleTime: 1000 * 60 * 15, // 15 Minuten
  });

  // Filtern der Produkte basierend auf dem Suchbegriff
  useEffect(() => {
    if (vendonProducts && Array.isArray(vendonProducts)) {
      if (searchTerm.trim() === "") {
        setFilteredProducts(vendonProducts);
      } else {
        const filtered = vendonProducts.filter(product => 
          product.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredProducts(filtered);
      }
    }
  }, [searchTerm, vendonProducts]);

  // Formular Setup mit zod-Validierung
  const form = useForm<ProductSupplierFormValues>({
    resolver: zodResolver(productSupplierSchema),
    defaultValues: {
      vendonProductId: "",
      productName: "",
      supplierId: undefined,
      supplierName: "",
      costPrice: undefined,
      articleSupplier: "",
      minOrderQuantity: undefined,
      packageSize: "",
      shelfLifeDays: undefined
    }
  });

  // Wenn ein Vendon-Produkt ausgewählt wird, aktualisiere das Formular
  useEffect(() => {
    if (selectedVendonProduct) {
      form.setValue("vendonProductId", selectedVendonProduct.id);
      form.setValue("productName", selectedVendonProduct.name);
    }
  }, [selectedVendonProduct, form]);

  // Mutation zum Aktualisieren eines Produkts
  const updateProductMutation = useMutation({
    mutationFn: (data: ProductSupplierFormValues) => {
      // Die ID des Produkts ist seine Vendon-ID, um es in der Datenbank zu finden oder neu zu erstellen
      return apiRequest('post', `/products/assign-supplier`, data);
    },
    onSuccess: (updatedProduct) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Produkt zugewiesen",
        description: `Das Produkt "${updatedProduct.productName}" wurde erfolgreich dem Lieferanten zugewiesen.`,
      });
      setLocation(`/produkte/${updatedProduct.id}`);
    },
    onError: (error) => {
      toast({
        title: "Fehler bei der Produktzuweisung",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    }
  });

  // Handler für die Formularübermittlung
  const onSubmit = (data: ProductSupplierFormValues) => {
    // Füge den Lieferantennamen hinzu, wenn nicht vorhanden
    if (!data.supplierName && suppliersData?.data) {
      const selectedSupplier = suppliersData.data.find(s => s.id === data.supplierId);
      if (selectedSupplier) {
        data.supplierName = selectedSupplier.name;
      }
    }
    
    updateProductMutation.mutate(data);
  };

  return (
    <div className="container max-w-5xl mx-auto py-6 px-4 md:px-6">
      {/* Navigationsleiste */}
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          className="mr-2" 
          onClick={() => setLocation('/produkte')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück
        </Button>
        <h1 className="text-2xl font-bold">Produkt einem Lieferanten zuweisen</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Vendon-Produkt auswählen */}
          <Card>
            <CardHeader>
              <CardTitle>Vendon-Produkt auswählen</CardTitle>
              <CardDescription>
                Wählen Sie ein Produkt aus der Vendon-API aus, das Sie einem Lieferanten zuweisen möchten.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Suchfeld */}
              <div className="relative">
                <Input
                  placeholder="Produktname suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Produkt-Liste */}
              <div className="border rounded-md h-64 overflow-y-auto">
                {isLoadingVendonProducts ? (
                  <div className="flex items-center justify-center h-full">
                    <p>Lade Produkte...</p>
                  </div>
                ) : filteredProducts && filteredProducts.length > 0 ? (
                  <div className="divide-y">
                    {filteredProducts.map((product) => (
                      <div 
                        key={product.id}
                        className={`p-3 cursor-pointer hover:bg-gray-100 ${selectedVendonProduct?.id === product.id ? 'bg-blue-50' : ''}`}
                        onClick={() => setSelectedVendonProduct(product)}
                      >
                        <p className="font-medium">{product.name}</p>
                        <div className="text-sm text-gray-500 flex justify-between">
                          <span>{product.category || 'Keine Kategorie'}</span>
                          <span>{product.price ? `${product.price.toFixed(2)} €` : 'Kein Preis'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Keine Produkte gefunden</p>
                  </div>
                )}
              </div>

              {/* Ausgewähltes Produkt */}
              <FormField
                control={form.control}
                name="vendonProductId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ausgewähltes Vendon-Produkt</FormLabel>
                    <FormControl>
                      <Input readOnly value={selectedVendonProduct?.name || 'Kein Produkt ausgewählt'} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Lieferanten-Details */}
          <Card>
            <CardHeader>
              <CardTitle>Lieferantendaten</CardTitle>
              <CardDescription>
                Ordnen Sie das ausgewählte Produkt einem Lieferanten zu und ergänzen Sie Bestellinformationen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lieferant */}
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferant *</FormLabel>
                    <Select 
                      value={field.value?.toString()} 
                      onValueChange={(value) => {
                        const supplierId = parseInt(value);
                        form.setValue("supplierId", supplierId);
                        
                        // Setze auch den Lieferantennamen entsprechend
                        if (suppliersData?.data && Array.isArray(suppliersData.data)) {
                          const selectedSupplier = suppliersData.data.find(s => s.id.toString() === value);
                          form.setValue("supplierName", selectedSupplier?.name || "");
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Lieferant auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliersData?.data && Array.isArray(suppliersData.data) ? 
                          suppliersData.data.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id.toString()}>
                              {supplier.name}
                            </SelectItem>
                          )) : null}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Lieferanten-Artikelnummer */}
              <FormField
                control={form.control}
                name="articleSupplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferanten-Artikelnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. SP-4567" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Einkaufspreis */}
              <FormField
                control={form.control}
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Einkaufspreis (€)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type="number" 
                          placeholder="0.00" 
                          step="0.01" 
                          min="0"
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                            field.onChange(value);
                          }}
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <CircleDollarSign className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Gebindegröße */}
              <FormField
                control={form.control}
                name="packageSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gebindegröße</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="z.B. 6x0,5L oder 24x330ml" 
                        {...field} 
                        value={field.value || ""} 
                      />
                    </FormControl>
                    <FormDescription>
                      Geben Sie die Größe pro Verpackungseinheit an.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Mindestbestellmenge */}
                <FormField
                  control={form.control}
                  name="minOrderQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mindestbestellmenge</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type="number" 
                            placeholder="0" 
                            step="1" 
                            min="0"
                            {...field}
                            value={field.value === undefined ? '' : field.value}
                            onChange={(e) => {
                              const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                              field.onChange(value);
                            }}
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <PackageCheck className="h-4 w-4 text-gray-400" />
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* MHD Haltbarkeit */}
                <FormField
                  control={form.control}
                  name="shelfLifeDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Haltbarkeit (in Tagen)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="z.B. 120" 
                          step="1" 
                          min="0"
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        MHD ab Lieferung in Tagen
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => setLocation('/produkte')}
            >
              Abbrechen
            </Button>
            <Button 
              type="submit" 
              disabled={updateProductMutation.isPending}
            >
              {updateProductMutation.isPending ? (
                <>Speichern...</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Produkt zuweisen
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}