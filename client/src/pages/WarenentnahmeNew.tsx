import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Plus, 
  Trash, 
  WarehouseIcon, 
  AlertTriangle,
  PackageSearch
} from 'lucide-react';
import { z } from 'zod';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getWarehouses, getWarehouseInventory, createProductDisposal, WarehouseProduct } from '@/lib/api';

// Schema definieren
const disposalItemSchema = z.object({
  productId: z.string().min(1, { message: "Produkt ist erforderlich" }),
  productName: z.string(),
  quantity: z.coerce.number().positive({ message: "Menge muss größer als 0 sein" }),
  reason: z.string().optional(),
});

const disposalSchema = z.object({
  warehouseId: z.string().min(1, { message: "Lager ist erforderlich" }),
  reason: z.string().min(1, { message: "Grund ist erforderlich" }),
  description: z.string().optional(),
  items: z.array(disposalItemSchema).min(1, { message: "Mindestens ein Produkt erforderlich" }),
});

type DisposalFormValues = z.infer<typeof disposalSchema>;

export default function WarenentnahmeNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [availableProducts, setAvailableProducts] = useState<WarehouseProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Lager abrufen
  const { 
    data: warehouses,
    isLoading: isLoadingWarehouses,
  } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: getWarehouses,
  });

  // Lagerbestand für das ausgewählte Lager abrufen
  const {
    data: inventory,
    isLoading: isLoadingInventory,
    isError: isErrorInventory,
  } = useQuery({
    queryKey: ['/api/warehouses', selectedWarehouseId, 'inventory'],
    queryFn: () => selectedWarehouseId ? getWarehouseInventory(selectedWarehouseId) : Promise.reject('Kein Lager ausgewählt'),
    enabled: !!selectedWarehouseId,
  });

  // Formulardefinition
  const form = useForm<DisposalFormValues>({
    resolver: zodResolver(disposalSchema),
    defaultValues: {
      warehouseId: '',
      reason: '',
      description: '',
      items: [{
        productId: '',
        productName: '',
        quantity: 1,
        reason: '',
      }],
    },
  });

  // FieldArray für Items
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Wenn sich das Lager ändert, setze das selectedWarehouseId
  useEffect(() => {
    const warehouseId = form.watch('warehouseId');
    if (warehouseId) {
      setSelectedWarehouseId(warehouseId);
    }
  }, [form.watch('warehouseId')]);

  // Wenn Inventar geladen wird, setze die verfügbaren Produkte
  useEffect(() => {
    if (inventory && Array.isArray(inventory)) {
      setAvailableProducts(inventory);
    }
  }, [inventory]);

  // Gefilterte Produkte für die Suche
  const filteredProducts = Array.isArray(availableProducts) 
    ? availableProducts.filter(product => 
        product.productName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  // Mutation zum Erstellen einer neuen Warenentnahme
  const createDisposalMutation = useMutation({
    mutationFn: (data: DisposalFormValues) => createProductDisposal(data),
    onSuccess: (response) => {
      toast({
        title: "Warenentnahme erstellt",
        description: "Die Warenentnahme wurde erfolgreich erstellt.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/product-disposals'] });
      setLocation(`/warenentnahme/${response.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen der Warenentnahme: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Formular absenden
  const onSubmit = (data: DisposalFormValues) => {
    // Produkte mit warehouseId-Referenz ergänzen
    createDisposalMutation.mutate(data);
  };

  // Produkt zum Formular hinzufügen
  const handleAddProduct = () => {
    append({
      productId: '',
      productName: '',
      quantity: 1,
      reason: '',
    });
  };

  // Produkt aus dem Dropdown auswählen
  const handleSelectProduct = (productId: string, index: number) => {
    const product = availableProducts.find(p => p.productId === productId);
    if (product) {
      form.setValue(`items.${index}.productId`, product.productId);
      form.setValue(`items.${index}.productName`, product.productName);
      setSearchTerm('');
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-5xl">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLocation('/warenentnahme')}>
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <h1 className="text-xl font-semibold ml-2">Neue Warenentnahme erstellen</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Warenentnahme für überlagerte Produkte</CardTitle>
          <CardDescription>
            Erfassen Sie hier Produkte, die aus dem Lager entnommen werden müssen (abgelaufen, beschädigt, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lager auswählen */}
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Lager*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={createDisposalMutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Lager auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingWarehouses ? (
                            <div className="p-2">
                              <Skeleton className="h-5 w-full" />
                              <Skeleton className="h-5 w-full mt-2" />
                            </div>
                          ) : warehouses && warehouses.length > 0 ? (
                            warehouses.map((warehouse) => (
                              <SelectItem key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-center text-sm text-gray-500">
                              Keine Lager verfügbar
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Wählen Sie das Lager, aus dem die Produkte entnommen werden.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Grund der Entnahme */}
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grund der Entnahme*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={createDisposalMutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Grund auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="expired">Überlagerte Produkte</SelectItem>
                          <SelectItem value="damaged">Beschädigte Produkte</SelectItem>
                          <SelectItem value="quality_issues">Qualitätsprobleme</SelectItem>
                          <SelectItem value="recall">Rückruf des Herstellers</SelectItem>
                          <SelectItem value="other">Sonstiger Grund</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Grund, warum die Produkte aus dem Lagerbestand entnommen werden.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Beschreibung */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Weitere Details zur Warenentnahme..."
                        {...field}
                        disabled={createDisposalMutation.isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      Optionale Beschreibung mit weiteren Details.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator className="my-4" />

              {/* Produktliste */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Produkte</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddProduct}
                    disabled={!selectedWarehouseId || createDisposalMutation.isPending}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Produkt hinzufügen
                  </Button>
                </div>

                {!selectedWarehouseId ? (
                  <div className="text-center py-8 border border-dashed rounded-lg">
                    <WarehouseIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Bitte wählen Sie zuerst ein Lager aus</p>
                  </div>
                ) : isLoadingInventory ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : isErrorInventory ? (
                  <div className="text-center py-8 border border-dashed rounded-lg">
                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-gray-500">Fehler beim Laden des Lagerbestands</p>
                  </div>
                ) : availableProducts.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-lg">
                    <PackageSearch className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Keine Produkte im Lager verfügbar</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {fields.map((item, index) => (
                      <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 border rounded-lg">
                        <div className="md:col-span-6">
                          <FormField
                            control={form.control}
                            name={`items.${index}.productId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Produkt*</FormLabel>
                                <div className="relative">
                                  <Controller
                                    control={form.control}
                                    name={`items.${index}.productId`}
                                    render={({ field: controllerField }) => (
                                      <>
                                        <Select
                                          onValueChange={(value) => {
                                            controllerField.onChange(value);
                                            handleSelectProduct(value, index);
                                          }}
                                          value={controllerField.value}
                                          disabled={createDisposalMutation.isPending}
                                        >
                                          <FormControl>
                                            <SelectTrigger>
                                              <SelectValue placeholder="Produkt auswählen" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <div className="py-2 px-3 sticky top-0 bg-white z-10">
                                              <Input
                                                placeholder="Produkt suchen..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="h-8"
                                              />
                                            </div>
                                            <div className="max-h-[200px] overflow-y-auto">
                                              {filteredProducts.length === 0 ? (
                                                <div className="py-2 px-3 text-center text-sm text-gray-500">
                                                  Keine Produkte gefunden
                                                </div>
                                              ) : (
                                                filteredProducts.map((product) => (
                                                  <SelectItem key={product.productId} value={product.productId}>
                                                    {product.productName} ({product.quantity} Stk.)
                                                  </SelectItem>
                                                ))
                                              )}
                                            </div>
                                          </SelectContent>
                                        </Select>
                                      </>
                                    )}
                                  />
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Menge*</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="1"
                                    {...field}
                                    disabled={createDisposalMutation.isPending}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="md:col-span-3">
                          <FormField
                            control={form.control}
                            name={`items.${index}.reason`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Spezifischer Grund</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="Optional"
                                    disabled={createDisposalMutation.isPending}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="md:col-span-1 flex items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            disabled={fields.length <= 1 || createDisposalMutation.isPending}
                            className="h-10 w-10 text-gray-500 hover:text-red-500"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              {/* Submit-Buttons */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation('/warenentnahme')}
                  disabled={createDisposalMutation.isPending}
                >
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  disabled={!selectedWarehouseId || createDisposalMutation.isPending}
                >
                  {createDisposalMutation.isPending ? "Wird gespeichert..." : "Warenentnahme speichern"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}