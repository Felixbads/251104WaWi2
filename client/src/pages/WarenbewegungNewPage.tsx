import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, MoveHorizontal, PackageOpen, RefreshCw } from "lucide-react";
import { useInventoryCart } from "@/components/inventory/InventoryCartContext";
import InventoryCart from "@/components/inventory/InventoryCart";
import InventoryProductsTable from "@/components/inventory/InventoryProductsTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

// Types
interface Warehouse {
  id: number;
  name: string;
  address?: string;
  city?: string;
  isActive?: boolean;
  status?: string;
  description?: string;
}

interface PackageType {
  id: number;
  name: string;
  description?: string;
  is_active?: boolean;
}

interface InventoryProduct {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  warehouseId: number;
  warehouseName?: string;
  status?: string;
  packageTypeId?: number;
  packageTypeName?: string;
  unitsPerPackage?: number;
}

// Form schema for disposal
const disposalFormSchema = z.object({
  warehouseId: z.string().min(1, { message: "Lager ist erforderlich" }),
  reason: z.string().min(1, { message: "Grund ist erforderlich" }),
  description: z.string().optional(),
});

export default function WarenbewegungNewPage() {
  const [activeTab, setActiveTab] = useState<string>("umlagerung");
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>("");
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>("");
  const [disposalWarehouseId, setDisposalWarehouseId] = useState<string>("");
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();
  const { 
    cartItems, 
    addToCart, 
    removeFromCart, 
    updateQuantity, 
    clearCart, 
    cartTotal 
  } = useInventoryCart();

  // Form for disposal
  const disposalForm = useForm<z.infer<typeof disposalFormSchema>>({
    resolver: zodResolver(disposalFormSchema),
    defaultValues: {
      warehouseId: "",
      reason: "",
      description: "",
    },
  });

  // Sync the form warehouseId with our state
  useEffect(() => {
    if (disposalWarehouseId) {
      disposalForm.setValue("warehouseId", disposalWarehouseId);
    }
  }, [disposalWarehouseId]);

  // Update our state when form changes
  useEffect(() => {
    const subscription = disposalForm.watch((value) => {
      if (value.warehouseId) {
        setDisposalWarehouseId(value.warehouseId);
      }
    });
    return () => subscription.unsubscribe();
  }, [disposalForm.watch]);

  // Get all warehouses
  const { data: warehouses, isLoading: warehousesLoading, error: warehousesError } = useQuery({
    queryKey: ['/api/warehouses'],
    select: (data: any) => {
      // Handle both paginated and non-paginated responses
      const warehouseList = data?.data || data || [];
      // Filter by isActive (boolean) or status === 'active' (text), both are valid
      return warehouseList.filter((w: Warehouse) => 
        w.isActive === true || w.isActive === undefined && w.status === 'active'
      );
    }
  });

  // Get all package types
  const { data: packageTypes, isLoading: packageTypesLoading, error: packageTypesError } = useQuery({
    queryKey: ['/api/package-types'],
    select: (data: PackageType[]) => {
      // The API returns an array directly, not an object with packageTypes
      if (!Array.isArray(data)) {
        console.error('Package types response is not an array:', data);
        return [];
      }
      // Filter active package types (using is_active field from API)
      return data.filter(pt => pt.is_active !== false);
    }
  });

  // Get products for selected source warehouse (transfer)
  const { data: sourceProducts, isLoading: sourceProductsLoading } = useQuery({
    queryKey: ['/api/warehouse-products', { warehouseId: sourceWarehouseId, includeZeroStock: false }],
    queryFn: () => apiRequest(`/api/warehouse-products?warehouseId=${sourceWarehouseId}&includeZeroStock=false`, {}, "GET"),
    enabled: !!sourceWarehouseId,
    select: (data: any[]) => {
      return data
        .filter(item => item.quantity > 0) // Only show products with stock
        .map(item => ({
          id: Number(item.id),
          productId: Number(item.productId),
          productName: item.productName,
          quantity: Number(item.quantity),
          warehouseId: Number(item.warehouseId),
          warehouseName: item.warehouseName,
          status: item.status
        }));
    }
  });

  // Get products for selected warehouse (disposal)
  const { 
    data: disposalProducts, 
    isLoading: disposalProductsLoading,
    refetch: refetchDisposalProducts
  } = useQuery({
    queryKey: ['/api/warehouse-products', { warehouseId: disposalWarehouseId, includeZeroStock: false }],
    queryFn: () => apiRequest(`/api/warehouse-products?warehouseId=${disposalWarehouseId}&includeZeroStock=false`, {}, "GET"),
    enabled: !!disposalWarehouseId,
    select: (data: any[]) => {
      return data
        .filter(item => item.quantity > 0) // Only show products with stock
        .map(item => ({
          id: Number(item.id),
          productId: Number(item.productId),
          productName: item.productName,
          quantity: Number(item.quantity),
          warehouseId: Number(item.warehouseId),
          warehouseName: item.warehouseName,
          status: item.status
        }));
    }
  });

  // Get inventory movements for transaction history
  const { data: inventoryMovements, isLoading: movementsLoading } = useQuery({
    queryKey: ['/api/inventory-movements'],
    select: (data: any[]) => data.slice(0, 100) // Limit to 100 recent movements
  });

  // Mutation for transfer
  const transferMutation = useMutation({
    mutationFn: async (transferData: any) => {
      console.log("🚀 Sende Transfer-Request an API:", transferData);
      console.log("🔗 Request URL: /api/inventory-transfers");
      
      const response = await fetch('/api/inventory-transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transferData),
      });
      
      console.log("📡 Response Status:", response.status);
      console.log("📊 Response OK:", response.ok);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ API Error:", errorData);
        throw new Error(errorData.error || 'Fehler bei der Übertragung');
      }
      
      const result = await response.json();
      console.log("✅ API Success Response:", result);
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Warenumlagerung erfolgreich erstellt",
        description: "Die Waren wurden erfolgreich umgelagert.",
      });
      
      // Clear the cart
      clearCart();
      
      // Update product list
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse-products'] });
      
      // Reset
      setShowResults(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler bei der Warenumlagerung",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation for disposal
  const disposalMutation = useMutation({
    mutationFn: async (disposalData: any) => {
      const response = await fetch('/api/product-disposals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(disposalData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Fehler bei der Entnahme');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Warenentnahme erfolgreich durchgeführt",
        description: "Die Waren wurden erfolgreich entnommen.",
      });
      
      // Clear the cart
      clearCart();
      
      // Update product list
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-disposals'] });
      
      // Reset form
      disposalForm.reset({
        warehouseId: disposalWarehouseId,
        reason: "",
        description: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler bei der Warenentnahme",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Handle transfer submission
  const handleTransfer = () => {
    console.log("🔄 Transfer-Button geklickt!");
    console.log("Source Warehouse ID:", sourceWarehouseId);
    console.log("Target Warehouse ID:", targetWarehouseId);
    console.log("Cart Items:", cartItems);
    
    if (!sourceWarehouseId || !targetWarehouseId) {
      console.log("❌ Fehlende Warehouse-IDs");
      toast({
        title: "Fehlende Informationen",
        description: "Bitte wählen Sie ein Quell- und Ziellager aus.",
        variant: "destructive",
      });
      return;
    }
    
    if (cartItems.length === 0) {
      toast({
        title: "Warenkorb ist leer",
        description: "Bitte fügen Sie Produkte zum Warenkorb hinzu.",
        variant: "destructive",
      });
      return;
    }
    
    // Check if source and target are different
    if (sourceWarehouseId === targetWarehouseId) {
      toast({
        title: "Gleiche Lager ausgewählt",
        description: "Quell- und Ziellager müssen unterschiedlich sein.",
        variant: "destructive",
      });
      return;
    }
    
    // Create transfer data
    const transferData = {
      sourceWarehouseId: parseInt(sourceWarehouseId),
      targetWarehouseId: parseInt(targetWarehouseId),
      status: "pending",
      notes: "Warenumlagung über Webschnittstelle",
      autoExecute: true, // Führe Transfer sofort aus
      items: cartItems.map(item => ({
        productId: item.productId, // Number beibehalten, nicht zu String konvertieren
        productName: item.productName,
        quantity: item.quantity,
        reason: "Umlagerung"
      }))
    };
    
    // Execute the transfer
    transferMutation.mutate(transferData);
  };

  // Handle disposal submission
  const handleDisposal = () => {
    if (!disposalForm.formState.isValid) {
      disposalForm.trigger(); // Trigger validation to show errors
      return;
    }

    if (cartItems.length === 0) {
      toast({
        title: "Warenkorb ist leer",
        description: "Bitte fügen Sie Produkte zum Warenkorb hinzu.",
        variant: "destructive",
      });
      return;
    }

    const formValues = disposalForm.getValues();
    
    // Create disposal data
    const disposalData = {
      warehouseId: formValues.warehouseId,
      reason: formValues.reason,
      description: formValues.description || "",
      status: "completed",
      items: cartItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity
      }))
    };
    
    // Execute the disposal
    disposalMutation.mutate(disposalData);
  };

  // Update results when source warehouse changes
  useEffect(() => {
    setShowResults(!!sourceWarehouseId);
  }, [sourceWarehouseId]);

  // Handle tab change - Clear cart when switching tabs
  const handleTabChange = (value: string) => {
    if (value !== activeTab) {
      clearCart();
      setActiveTab(value);
    }
  };

  // Build a map of product IDs to their available quantities for the disposal view
  const availableQuantities: Record<string, number> = {};
  if (disposalProducts) {
    disposalProducts.forEach(item => {
      availableQuantities[item.productId.toString()] = item.quantity || 0;
    });
  }

  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="umlagerung" value={activeTab} onValueChange={handleTabChange}>
        <div className="mb-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="umlagerung">Warenumlagerung</TabsTrigger>
            <TabsTrigger value="entnahme">Warenentnahme</TabsTrigger>
            <TabsTrigger value="transaktionen">Umlagerungs-Transaktionen</TabsTrigger>
          </TabsList>
        </div>

        {/* Umlagerung Tab Content */}
        <TabsContent value="umlagerung">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Column */}
            <div className="w-full lg:w-2/3 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MoveHorizontal className="h-6 w-6" />
                    Warenumlagerung
                  </CardTitle>
                  <CardDescription>
                    Wählen Sie ein Quell- und Ziellager aus, um Produkte zwischen Lagern zu bewegen.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Error display for warehouses */}
                  {warehousesError && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Fehler beim Laden der Lager</AlertTitle>
                      <AlertDescription>
                        Die Lager konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* Warning if no warehouses available */}
                  {!warehousesLoading && !warehousesError && (!warehouses || warehouses.length === 0) && (
                    <Alert className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Keine Lager verfügbar</AlertTitle>
                      <AlertDescription>
                        Es wurden keine aktiven Lager gefunden. Bitte prüfen Sie die Lagerverwaltung.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-col md:flex-row gap-4 mb-6">
                    {/* Source Warehouse Selection */}
                    <div className="w-full md:w-1/2">
                      <Label htmlFor="sourceWarehouse">Quelllager</Label>
                      <Select 
                        value={sourceWarehouseId}
                        onValueChange={value => setSourceWarehouseId(value)}
                        disabled={warehousesLoading || !warehouses || warehouses.length === 0}
                      >
                        <SelectTrigger id="sourceWarehouse" className="w-full">
                          <SelectValue placeholder={warehousesLoading ? "Lade Lager..." : "Wählen Sie ein Quelllager aus"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Verfügbare Lager</SelectLabel>
                            {!warehousesLoading && warehouses && warehouses.map(warehouse => (
                              <SelectItem 
                                key={warehouse.id} 
                                value={warehouse.id.toString()}
                                disabled={targetWarehouseId === warehouse.id.toString()}
                              >
                                {warehouse.name}
                                {warehouse.city ? ` (${warehouse.city})` : ''}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Target Warehouse Selection */}
                    <div className="w-full md:w-1/2">
                      <Label htmlFor="targetWarehouse">Ziellager</Label>
                      <Select 
                        value={targetWarehouseId}
                        onValueChange={value => setTargetWarehouseId(value)}
                        disabled={warehousesLoading || !warehouses || warehouses.length === 0}
                      >
                        <SelectTrigger id="targetWarehouse" className="w-full">
                          <SelectValue placeholder={warehousesLoading ? "Lade Lager..." : "Wählen Sie ein Ziellager aus"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Verfügbare Lager</SelectLabel>
                            {!warehousesLoading && warehouses && warehouses.map(warehouse => (
                              <SelectItem 
                                key={warehouse.id} 
                                value={warehouse.id.toString()}
                                disabled={sourceWarehouseId === warehouse.id.toString()}
                              >
                                {warehouse.name}
                                {warehouse.city ? ` (${warehouse.city})` : ''}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {!showResults ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Information</AlertTitle>
                      <AlertDescription>
                        Bitte wählen Sie ein Quelllager aus, um verfügbare Produkte anzuzeigen.
                      </AlertDescription>
                    </Alert>
                  ) : sourceProductsLoading ? (
                    <div className="h-40 flex items-center justify-center">
                      <LoadingSpinner />
                    </div>
                  ) : sourceProducts && sourceProducts.length > 0 ? (
                    <InventoryProductsTable 
                      products={sourceProducts}
                      onAddToCart={(product, quantity) => {
                        // Convert the InventoryProduct to a CartItem
                        addToCart({
                          id: product.id,
                          productId: product.productId,
                          productName: product.productName,
                          quantity: quantity,
                          maxQuantity: product.quantity,
                          warehouseId: product.warehouseId
                        });
                      }}
                      warehouseId={parseInt(sourceWarehouseId)}
                      packageTypes={packageTypes}
                    />
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Keine Produkte verfügbar</AlertTitle>
                      <AlertDescription>
                        Im ausgewählten Lager sind keine Produkte mit Bestand vorhanden.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Right Column - Cart */}
            <div className="w-full lg:w-1/3">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Warenkorb</CardTitle>
                  <CardDescription>
                    Produkte zur Umlagerung ({cartItems.length} Positionen)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InventoryCart 
                    cartItems={cartItems}
                    onRemove={removeFromCart}
                    onUpdateQuantity={updateQuantity}
                    onClearCart={clearCart}
                    footer={
                      <div className="mt-4 flex flex-col gap-2">
                        <div className="flex justify-between font-medium">
                          <span>Gesamtanzahl:</span>
                          <span>{cartTotal} Einheiten</span>
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={handleTransfer}
                          disabled={
                            transferMutation.isPending || 
                            cartItems.length === 0 || 
                            !sourceWarehouseId || 
                            !targetWarehouseId ||
                            sourceWarehouseId === targetWarehouseId
                          }
                        >
                          {transferMutation.isPending ? (
                            <>Übertrage Waren...</>
                          ) : (
                            <>Umlagerung durchführen</>
                          )}
                        </Button>
                      </div>
                    }
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Entnahme Tab Content */}
        <TabsContent value="entnahme">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Column */}
            <div className="w-full lg:w-2/3 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PackageOpen className="h-6 w-6" />
                    Warenentnahme
                  </CardTitle>
                  <CardDescription>
                    Wählen Sie ein Lager und geben Sie einen Grund für die Entnahme an.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...disposalForm}>
                    <form className="space-y-4">
                      {/* Warehouse Selection */}
                      <FormField
                        control={disposalForm.control}
                        name="warehouseId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lager</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value);
                                setDisposalWarehouseId(value);
                              }}
                              defaultValue={field.value}
                              value={field.value}
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
                                    {warehouse.city ? ` (${warehouse.city})` : ''}
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
                        control={disposalForm.control}
                        name="reason"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Grund</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Grund für die Entnahme"
                                {...field}
                                disabled={disposalMutation.isPending}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Description */}
                      <FormField
                        control={disposalForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Beschreibung (optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Detaillierte Beschreibung der Entnahme"
                                {...field}
                                disabled={disposalMutation.isPending}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>

                  {disposalWarehouseId && (
                    <div className="mt-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium">Produkte im Lager</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refetchDisposalProducts()}
                          disabled={disposalProductsLoading}
                        >
                          <RefreshCw className={`mr-2 h-4 w-4 ${disposalProductsLoading ? 'animate-spin' : ''}`} />
                          Aktualisieren
                        </Button>
                      </div>

                      {disposalProductsLoading ? (
                        <div className="h-40 flex items-center justify-center">
                          <LoadingSpinner />
                        </div>
                      ) : disposalProducts && disposalProducts.length > 0 ? (
                        <InventoryProductsTable 
                          products={disposalProducts}
                          onAddToCart={(product, quantity) => {
                            // Convert the InventoryProduct to a CartItem
                            addToCart({
                              id: product.id,
                              productId: product.productId,
                              productName: product.productName,
                              quantity: quantity,
                              maxQuantity: product.quantity,
                              warehouseId: product.warehouseId
                            });
                          }}
                          warehouseId={parseInt(disposalWarehouseId)}
                          packageTypes={packageTypes}
                        />
                      ) : (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Keine Produkte verfügbar</AlertTitle>
                          <AlertDescription>
                            Im ausgewählten Lager sind keine Produkte mit Bestand vorhanden.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {!disposalWarehouseId && (
                    <Alert className="mt-6">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Information</AlertTitle>
                      <AlertDescription>
                        Bitte wählen Sie ein Lager aus, um verfügbare Produkte anzuzeigen.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Right Column - Cart */}
            <div className="w-full lg:w-1/3">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Warenkorb</CardTitle>
                  <CardDescription>
                    Produkte zur Entnahme ({cartItems.length} Positionen)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InventoryCart 
                    cartItems={cartItems}
                    onRemove={removeFromCart}
                    onUpdateQuantity={updateQuantity}
                    onClearCart={clearCart}
                    footer={
                      <div className="mt-4 flex flex-col gap-2">
                        <div className="flex justify-between font-medium">
                          <span>Gesamtanzahl:</span>
                          <span>{cartTotal} Einheiten</span>
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={handleDisposal}
                          disabled={
                            disposalMutation.isPending || 
                            cartItems.length === 0 || 
                            !disposalForm.formState.isValid
                          }
                        >
                          {disposalMutation.isPending ? (
                            <>Verarbeite Entnahme...</>
                          ) : (
                            <>Entnahme durchführen</>
                          )}
                        </Button>
                      </div>
                    }
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Umlagerungs-Transaktionen Tab Content */}
        <TabsContent value="transaktionen">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-6 w-6" />
                Umlagerungs-Transaktionen
              </CardTitle>
              <CardDescription>
                Chronologische Auflistung aller Warenbewegungen und -transfers zwischen Lagern.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {movementsLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : inventoryMovements && inventoryMovements.length > 0 ? (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Produkt</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Menge</TableHead>
                        <TableHead>Von Lager</TableHead>
                        <TableHead>Nach Lager/Automat</TableHead>
                        <TableHead>Beschreibung</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryMovements.map(movement => (
                        <TableRow key={movement.id}>
                          <TableCell>
                            {new Date(movement.createdAt).toLocaleDateString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{movement.productName}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {movement.displayType || movement.movementType || 'Bewegung'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono">{movement.quantity}</span>
                          </TableCell>
                          <TableCell>
                            {movement.sourceWarehouseId ? `Lager ${movement.sourceWarehouseId}` : '-'}
                          </TableCell>
                          <TableCell>
                            {movement.destinationWarehouseId 
                              ? `Lager ${movement.destinationWarehouseId}` 
                              : movement.machineId
                                ? `Automat ${movement.machineId}`
                                : '-'
                            }
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              {movement.displayDescription || movement.notes || 'Warenbewegung'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Keine Transaktionen</AlertTitle>
                  <AlertDescription>
                    Es wurden noch keine Umlagerungs-Transaktionen gefunden.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}