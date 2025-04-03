import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSuppliers, createProduct } from "@/lib/api";

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
  PackageCheck
} from "lucide-react";

// Validierungsschema für ein neues Produkt
const productSchema = z.object({
  productName: z.string().min(1, "Der Name des Produkts ist erforderlich"),
  description: z.string().optional(),
  category: z.string().optional(),
  price: z.coerce.number().min(0, "Der Preis muss positiv sein").optional(),
  vat: z.coerce.number().min(0, "Der Mehrwertsteuersatz muss positiv sein").optional(),
  costPrice: z.coerce.number().min(0, "Der Einkaufspreis muss positiv sein").optional(),
  requiresAgeVerification: z.boolean().optional(),
  packageSize: z.string().optional(),
  shelfLifeDays: z.coerce.number().min(0, "Die Haltbarkeit muss eine positive Zahl sein").optional(),
  supplierId: z.number().optional(),
  supplier: z.string().optional(),
  articleSupplier: z.string().optional(), 
  minOrderQuantity: z.coerce.number().min(0, "Die Mindestbestellmenge muss positiv sein").optional(),
  status: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional()
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function NewProduct() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Holen der Lieferanten für die Auswahlliste
  const { data: suppliersData, isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ['/api/suppliers'],
    queryFn: () => getSuppliers({ limit: 100 }),
    staleTime: 1000 * 60 * 15, // 15 Minuten
  });

  // Formular Setup mit zod-Validierung
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      productName: "",
      description: "",
      category: "",
      price: undefined,
      vat: 19, // Standardwert für MwSt
      costPrice: undefined,
      requiresAgeVerification: false,
      packageSize: "",
      shelfLifeDays: undefined,
      supplierId: undefined,
      supplier: "",
      articleSupplier: "",
      minOrderQuantity: undefined,
      status: "active",
      sku: "",
      barcode: ""
    }
  });

  // Mutation zum Erstellen eines neuen Produkts
  const createProductMutation = useMutation({
    mutationFn: (productData: ProductFormValues) => createProduct(productData),
    onSuccess: (newProduct) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Produkt erstellt",
        description: `Das Produkt "${newProduct.productName}" wurde erfolgreich erstellt.`,
      });
      setLocation(`/produkte/${newProduct.id}`);
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Erstellen des Produkts",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    }
  });

  // Handler für die Formularübermittlung
  const onSubmit = (data: ProductFormValues) => {
    createProductMutation.mutate(data);
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
        <h1 className="text-2xl font-bold">Neues Produkt anlegen</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Produktdetails</CardTitle>
              <CardDescription>
                Geben Sie die grundlegenden Informationen für das neue Produkt ein.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Produktname */}
              <FormField
                control={form.control}
                name="productName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Produktname *</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Knusperflocken (Zetti)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Beschreibung */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Produktbeschreibung eingeben..." 
                        className="resize-none" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Kategorie */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategorie</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Süßwaren, Getränke" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select 
                      value={field.value} 
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Status auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="inactive">Inaktiv</SelectItem>
                        <SelectItem value="discontinued">Eingestellt</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Preis und MwSt */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verkaufspreis (€)</FormLabel>
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
                
                <FormField
                  control={form.control}
                  name="vat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mehrwertsteuersatz (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type="number" 
                            placeholder="19" 
                            step="1" 
                            min="0"
                            {...field}
                            value={field.value === undefined ? '' : field.value}
                            onChange={(e) => {
                              const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                              field.onChange(value);
                            }}
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <Percent className="h-4 w-4 text-gray-400" />
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* EAN/Barcode und SKU */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>EAN/Barcode</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. 4012345678901" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Artikelnummer (SKU)</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. PRD-1234" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Altersverifikation */}
              <FormField
                control={form.control}
                name="requiresAgeVerification"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                        Altersverifikation erforderlich (18+)
                      </FormLabel>
                      <FormDescription>
                        Aktivieren Sie diese Option für Produkte, die eine Altersverifikation erfordern.
                      </FormDescription>
                    </div>
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
                Geben Sie Informationen zum Lieferanten und Einkauf ein.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lieferant */}
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferant</FormLabel>
                    <Select 
                      value={field.value?.toString()} 
                      onValueChange={(value) => {
                        const supplierId = value === "none" ? undefined : parseInt(value);
                        form.setValue("supplierId", supplierId);
                        
                        // Setze auch den Lieferantennamen entsprechend
                        if (suppliersData?.data && Array.isArray(suppliersData.data)) {
                          const selectedSupplier = suppliersData.data.find(s => s.id.toString() === value);
                          form.setValue("supplier", selectedSupplier?.name || "");
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Lieferant auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Kein Lieferant</SelectItem>
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

              {/* Verpackungsgröße */}
              <FormField
                control={form.control}
                name="packageSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verpackungsgröße</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. 24 x 0,33l" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Mindestbestellmenge und Haltbarkeit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="minOrderQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mindestbestellmenge</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="1" 
                          min="0" 
                          step="1"
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="shelfLifeDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Haltbarkeit (Tage)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="30" 
                          min="0" 
                          step="1"
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Aktionen */}
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
              disabled={createProductMutation.isPending}
            >
              {createProductMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Wird gespeichert...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Produkt speichern
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}