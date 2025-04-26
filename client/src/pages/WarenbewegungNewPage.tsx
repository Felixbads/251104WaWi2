import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Warehouse as WarehouseIcon,
  AlertTriangle
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
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Custom components
import { InventoryCartProvider } from '@/components/inventory/InventoryCartContext';
import InventoryCart from '@/components/inventory/InventoryCart';
import InventoryProductsTable, { InventoryProduct } from '@/components/inventory/InventoryProductsTable';

// API functions (assuming these exist, we'll check and adapt as needed)
import { 
  getWarehouses, 
  getWarehouseInventory,
  createInventoryTransfer
} from '@/lib/api';

export default function WarenbewegungNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string | null>(null);
  const [targetWarehouseId, setTargetWarehouseId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  
  // Load warehouses
  const {
    data: warehouses,
    isLoading: isLoadingWarehouses,
    error: warehousesError
  } = useQuery({
    queryKey: ['/api/warehouses'],
    queryFn: getWarehouses
  });
  
  // Load source warehouse inventory
  const {
    data: sourceInventory,
    isLoading: isLoadingSourceInventory,
    error: sourceInventoryError,
    refetch: refetchSourceInventory
  } = useQuery({
    queryKey: ['/api/warehouses', sourceWarehouseId, 'inventory'],
    queryFn: () => sourceWarehouseId 
      ? getWarehouseInventory(sourceWarehouseId, { includeZeroStock: false })
      : Promise.reject('No source warehouse selected'),
    enabled: !!sourceWarehouseId
  });
  
  // Load target warehouse inventory (for reference)
  const {
    data: targetInventory,
    isLoading: isLoadingTargetInventory,
    error: targetInventoryError
  } = useQuery({
    queryKey: ['/api/warehouses', targetWarehouseId, 'inventory'],
    queryFn: () => targetWarehouseId 
      ? getWarehouseInventory(targetWarehouseId, { includeZeroStock: true })
      : Promise.reject('No target warehouse selected'),
    enabled: !!targetWarehouseId
  });
  
  // Create inventory transfer mutation
  const createTransferMutation = useMutation({
    mutationFn: (data: any) => createInventoryTransfer(data),
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Die Warenbewegung wurde erfolgreich durchgeführt.",
        variant: "success"
      });
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/warehouses'] });
      if (sourceWarehouseId) {
        queryClient.invalidateQueries({ queryKey: ['/api/warehouses', sourceWarehouseId] });
      }
      if (targetWarehouseId) {
        queryClient.invalidateQueries({ queryKey: ['/api/warehouses', targetWarehouseId] });
      }
      
      // Navigate back to the warehouse movement overview
      setLocation('/lager');
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Erstellen der Warenbewegung: ${error.message || 'Unbekannter Fehler'}`,
        variant: "destructive"
      });
    }
  });
  
  // Format products for table
  const formattedInventory: InventoryProduct[] = sourceInventory ? 
    sourceInventory.map(item => ({
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
    
  // Find warehouses that can be selected as target (exclude source warehouse)
  const availableTargetWarehouses = warehouses ? 
    warehouses.filter(w => w.id.toString() !== sourceWarehouseId)
    : [];
  
  // Effects
  // Reset target warehouse when source changes to prevent selecting the same warehouse
  useEffect(() => {
    if (sourceWarehouseId && targetWarehouseId && sourceWarehouseId === targetWarehouseId) {
      setTargetWarehouseId(null);
    }
  }, [sourceWarehouseId, targetWarehouseId]);
  
  // Handle submit
  const handleSubmitTransfer = (items: any[]) => {
    if (!sourceWarehouseId || !targetWarehouseId || items.length === 0) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie Quell- und Ziellager sowie mindestens ein Produkt aus.",
        variant: "destructive"
      });
      return;
    }
    
    // Format the data for the API
    const transferData = {
      sourceWarehouseId,
      targetWarehouseId,
      notes: notes || undefined,
      items: items.map(item => ({
        productId: item.productId,
        quantity: item.quantity
      }))
    };
    
    // Submit the transfer
    createTransferMutation.mutate(transferData);
  };
  
  // Get inventory quantity for a product
  const getInventoryQuantity = (productId: string): number => {
    if (!sourceInventory) return 0;
    const product = sourceInventory.find(p => p.productId.toString() === productId);
    return product ? product.quantity || 0 : 0;
  };
  
  // Build a map of product IDs to their available quantities
  const availableQuantities: Record<string, number> = {};
  if (sourceInventory) {
    sourceInventory.forEach(item => {
      availableQuantities[item.productId.toString()] = item.quantity || 0;
    });
  }
  
  return (
    <InventoryCartProvider>
      <div className="container py-6 space-y-6">
        {/* Header with back button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/lager')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            <h1 className="text-xl font-semibold">Neue Warenbewegung</h1>
          </div>
          
          <div className="flex items-center gap-2">
            {sourceWarehouseId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchSourceInventory()}
                disabled={isLoadingSourceInventory}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingSourceInventory ? 'animate-spin' : ''}`} />
                Aktualisieren
              </Button>
            )}
          </div>
        </div>
        
        {/* Warehouse Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WarehouseIcon className="h-5 w-5" />
              Lager auswählen
            </CardTitle>
            <CardDescription>
              Wählen Sie ein Quell- und Ziellager für die Warenbewegung
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1 space-y-2">
                <div className="font-medium text-sm">Quelllager</div>
                <Select
                  value={sourceWarehouseId || ""}
                  onValueChange={setSourceWarehouseId}
                  disabled={isLoadingWarehouses}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Quelllager auswählen" />
                  </SelectTrigger>
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
              </div>
              
              <div className="flex items-center justify-center">
                <div className="hidden sm:block">
                  <ArrowRightLeft className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="sm:hidden">
                  <Separator />
                </div>
              </div>
              
              <div className="flex-1 space-y-2">
                <div className="font-medium text-sm">Ziellager</div>
                <Select
                  value={targetWarehouseId || ""}
                  onValueChange={setTargetWarehouseId}
                  disabled={isLoadingWarehouses || !sourceWarehouseId || availableTargetWarehouses.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ziellager auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTargetWarehouses.map(warehouse => (
                      <SelectItem 
                        key={warehouse.id} 
                        value={warehouse.id.toString()}
                      >
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Show cart and products only when warehouses are selected */}
        {sourceWarehouseId && targetWarehouseId && (
          <>
            {/* Cart */}
            <InventoryCart 
              title="Warenkorb für Umlagerung"
              description="Produkte für die Umlagerung"
              submitLabel="Umlagerung durchführen"
              onSubmit={() => {
                const { items } = require('@/components/inventory/InventoryCartContext').useInventoryCart();
                handleSubmitTransfer(items);
              }}
              isLoading={createTransferMutation.isPending}
              maxStock={availableQuantities}
            />
            
            {/* Product selection */}
            <InventoryProductsTable
              products={formattedInventory}
              isLoading={isLoadingSourceInventory}
              error={sourceInventoryError}
              title="Produkte im Quelllager"
              description="Wählen Sie Produkte für die Umlagerung aus"
            />
          </>
        )}
        
        {/* Initial state - no warehouses selected */}
        {(!sourceWarehouseId || !targetWarehouseId) && (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingCart className="h-16 w-16 mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-medium">Bitte wählen Sie ein Quell- und Ziellager</h3>
              <p className="text-muted-foreground mt-1">
                Um Produkte umzulagern, müssen Sie zuerst ein Quell- und Ziellager auswählen.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </InventoryCartProvider>
  );
}