import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Warehouse as WarehouseIcon,
  AlertTriangle,
  PackageOpen
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Custom components
import { InventoryCartProvider } from '@/components/inventory/InventoryCartContext';
import InventoryCart from '@/components/inventory/InventoryCart';
import InventoryProductsTable, { InventoryProduct } from '@/components/inventory/InventoryProductsTable';

// API functions
import {
  getWarehouses,
  getWarehouseInventory,
  createProductDisposal
} from '@/lib/api';

// Form schema
const formSchema = z.object({
  warehouseId: z.string().min(1, { message: "Lager ist erforderlich" }),
  reason: z.string().min(1, { message: "Grund ist erforderlich" }),
  description: z.string().optional(),
});

export default function WarenentnahmeNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form definition
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      warehouseId: "",
      reason: "",
      description: "",
    },
  });

  // Load warehouses
  const {
    data: warehouses,
    isLoading: isLoadingWarehouses,
    error: warehousesError
  } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: getWarehouses
  });

  // Get current warehouse ID from form
  const warehouseId = form.watch('warehouseId');

  // Load warehouse inventory
  const {
    data: inventory,
    isLoading: isLoadingInventory,
    error: inventoryError,
    refetch: refetchInventory
  } = useQuery({
    queryKey: ['/api/warehouses', warehouseId, 'inventory'],
    queryFn: () => warehouseId
      ? getWarehouseInventory(warehouseId, { includeZeroStock: false })
      : Promise.reject('No warehouse selected'),
    enabled: !!warehouseId
  });

  // Create product disposal mutation
  const createDisposalMutation = useMutation({
    mutationFn: (data: any) => createProductDisposal(data),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Die Warenentnahme wurde erfolgreich durchgeführt.",
        variant: "success"
      });

      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      if (warehouseId) {
        queryClient.invalidateQueries({ queryKey: ['/api/warehouses', warehouseId] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/product-disposals'] });

      // Navigate back to the warehouse disposal overview
      setLocation('/warenentnahme');
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen der Warenentnahme: ${error.message || 'Unbekannter Fehler'}`,
        variant: "destructive"
      });
    }
  });

  // Format products for table
  const formattedInventory: InventoryProduct[] = inventory ?
    inventory.map(item => ({
      id: item.id,
      productId: item.productId.toString(),
      productName: item.productName || "Unbekanntes Produkt",
      quantity: item.quantity || 0,
      sku: item.sku,
      category: item.category,
      minQuantity: item.minQuantity || 0,
      price: item.price,
      warehouseId: item.warehouseId,
      warehouseName: item.warehouseName
    }))
    : [];

  // Handle submit
  const handleSubmitDisposal = (formValues: z.infer<typeof formSchema>, items: any[]) => {
    if (!formValues.warehouseId || items.length === 0) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Lager und mindestens ein Produkt aus.",
        variant: "destructive"
      });
      return;
    }

    // Format the data for the API
    const disposalData = {
      warehouseId: formValues.warehouseId,
      reason: formValues.reason,
      description: formValues.description,
      items: items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity
      }))
    };

    // Submit the disposal
    createDisposalMutation.mutate(disposalData);
  };

  // Build a map of product IDs to their available quantities
  const availableQuantities: Record<string, number> = {};
  if (inventory) {
    inventory.forEach(item => {
      availableQuantities[item.productId.toString()] = item.quantity || 0;
    });
  }

  return (
    <InventoryCartProvider>
      <div className="container py-6 space-y-6">
        {/* Header with back button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/warenentnahme')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            <h1 className="text-xl font-semibold">Neue Warenentnahme</h1>
          </div>

          <div className="flex items-center gap-2">
            {warehouseId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchInventory()}
                disabled={isLoadingInventory}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingInventory ? 'animate-spin' : ''}`} />
                Aktualisieren
              </Button>
            )}
          </div>
        </div>

        {/* Form */}
        <Form {...form}>
          <form>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageOpen className="h-5 w-5" />
                  Warenentnahme konfigurieren
                </CardTitle>
                <CardDescription>
                  Wählen Sie ein Lager und geben Sie einen Grund für die Entnahme an
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Warehouse selection */}
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lager</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isLoadingWarehouses || createDisposalMutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Lager auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses?.map(warehouse => (
                            <SelectItem
                              key={warehouse.id}
                              value={warehouse.id.toString()}
                            >
                              {warehouse.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Reason */}
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grund</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Grund für die Entnahme"
                          {...field}
                          disabled={createDisposalMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beschreibung (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Detaillierte Beschreibung der Entnahme"
                          {...field}
                          disabled={createDisposalMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </form>
        </Form>

        {/* Show cart and products only when warehouse is selected */}
        {warehouseId && (
          <>
            {/* Cart */}
            <InventoryCart
              title="Warenkorb für Entnahme"
              description="Produkte für die Entnahme"
              submitLabel="Entnahme durchführen"
              onSubmit={() => {
                if (form.formState.isValid) {
                  const formValues = form.getValues();
                  const { items } = require('@/components/inventory/InventoryCartContext').useInventoryCart();
                  handleSubmitDisposal(formValues, items);
                } else {
                  form.trigger(); // Trigger validation to show errors
                }
              }}
              isLoading={createDisposalMutation.isPending}
              maxStock={availableQuantities}
            />

            {/* Product selection */}
            <InventoryProductsTable
              products={formattedInventory}
              isLoading={isLoadingInventory}
              error={inventoryError}
              title="Produkte im Lager"
              description="Wählen Sie Produkte für die Entnahme aus"
            />
          </>
        )}

        {/* Initial state - no warehouse selected */}
        {!warehouseId && (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <PackageOpen className="h-16 w-16 mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-medium">Bitte wählen Sie ein Lager</h3>
              <p className="text-muted-foreground mt-1">
                Um Produkte zu entnehmen, müssen Sie zuerst ein Lager auswählen.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </InventoryCartProvider>
  );
}