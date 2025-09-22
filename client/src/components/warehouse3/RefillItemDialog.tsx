import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, AlertTriangle, Check, Loader2, Plus, Minus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Product {
  id: number;
  productName: string;
  sku?: string;
  unit?: string;
}

interface RefillItem {
  productId: number;
  quantity: number;
  productName?: string;
  stockBefore?: number;
  stockAfter?: number;
  movements?: Array<{
    source: string;
    quantity: number;
    batchId?: number;
    expiryDate?: string;
  }>;
}

interface StockInfo {
  id: number;
  quantity: number; // Normal-Bestand
  batches?: Array<{
    id: number;
    currentQuantity: number;
    expiryDate: string;
    batchNumber: string;
  }>;
}

interface RefillItemDialogProps {
  warehouseId: number;
  refillId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RefillItemDialog({ 
  warehouseId, 
  refillId, 
  open, 
  onOpenChange, 
  onSuccess 
}: RefillItemDialogProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lade verfügbare Produkte
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/products'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade Lagerbestand für ausgewähltes Produkt
  const { data: stockInfo, isLoading: isLoadingStock } = useQuery<StockInfo>({
    queryKey: [`/api/warehouse3/warehouses/${warehouseId}/inventory/${selectedProductId}`],
    enabled: !!selectedProductId && open,
    staleTime: 1000 * 30, // 30 Sekunden
  });

  const selectedProduct = products.find(p => p.id.toString() === selectedProductId);
  const availableStock = stockInfo?.quantity || 0;
  const batchStock = stockInfo?.batches?.reduce((sum, batch) => sum + (batch.currentQuantity || 0), 0) || 0;
  const totalStock = availableStock + batchStock;

  // Mutation für Refill-Item hinzufügen
  const addItemMutation = useMutation({
    mutationFn: async (data: { productId: number; quantity: number }) => {
      return apiRequest(`/api/warehouse3/warehouses/${warehouseId}/refills/${refillId}/items`, data, 'POST');
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Erfolgreich hinzugefügt",
        description: `${quantity}x ${selectedProduct?.productName} wurde zur Auffüllung hinzugefügt.`,
      });
      
      // UMFASSENDE Cache-Invalidation für Auto-Refresh
      Promise.all([
        // 1. Refill-Daten aktualisieren
        queryClient.invalidateQueries({
          queryKey: [`/api/warehouse3/warehouses/${warehouseId}/refills/${refillId}`]
        }),
        // 2. Warehouse-Inventory aktualisieren
        queryClient.invalidateQueries({
          queryKey: [`/api/warehouse3/warehouses/${warehouseId}/inventory`]
        }),
        // 3. Spezifisches Produkt-Inventory
        queryClient.invalidateQueries({
          queryKey: [`/api/warehouse3/warehouses/${warehouseId}/inventory/${data.productId}`]
        }),
        // 4. Batch-Daten aktualisieren
        queryClient.invalidateQueries({
          queryKey: [`/api/warehouse3/batches`]
        }),
        // 5. Stock-Ratios für Maschinenbestand
        queryClient.invalidateQueries({
          queryKey: [`/api/machines`]
        }),
        // 6. Warehouse-Übersicht für Dashboard
        queryClient.invalidateQueries({
          queryKey: [`/api/warehouse3/warehouses`]
        })
      ]);
      
      // Dialog schließen und zurücksetzen
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Fehler beim Hinzufügen",
        description: error?.message || "Unbekannter Fehler beim Hinzufügen des Produkts.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedProductId('');
    setQuantity(1);
    setIsSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!selectedProductId || quantity <= 0) {
      toast({
        title: "Eingabe unvollständig",
        description: "Bitte wählen Sie ein Produkt und geben Sie eine gültige Menge ein.",
        variant: "destructive",
      });
      return;
    }

    if (quantity > totalStock) {
      toast({
        title: "Nicht genügend Bestand",
        description: `Nur ${totalStock} Stück verfügbar (${availableStock} Normal + ${batchStock} Batches).`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    addItemMutation.mutate({
      productId: parseInt(selectedProductId),
      quantity
    });
  };

  const adjustQuantity = (delta: number) => {
    const newQuantity = Math.max(1, quantity + delta);
    const maxQuantity = Math.min(totalStock, 999);
    setQuantity(Math.min(newQuantity, maxQuantity));
  };

  // Form zurücksetzen beim Öffnen
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="refill-item-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produkt zur Auffüllung hinzufügen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Produkt auswählen */}
          <div className="space-y-2">
            <Label htmlFor="product-select">Produkt</Label>
            {isLoadingProducts ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select 
                value={selectedProductId} 
                onValueChange={setSelectedProductId}
                data-testid="product-select"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Produkt auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      <div className="flex items-center justify-between w-full">
                        <span>{product.productName}</span>
                        {product.sku && (
                          <Badge variant="outline" className="ml-2">
                            {product.sku}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Bestandsinfo anzeigen */}
          {selectedProductId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Verfügbarer Bestand</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoadingStock ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Normal-Bestand:</span>
                      <span className="font-mono">{availableStock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Batch-Bestand:</span>
                      <span className="font-mono">{batchStock}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Gesamt verfügbar:</span>
                      <span className="font-mono">{totalStock}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Menge eingeben */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Menge</Label>
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => adjustQuantity(-1)}
                disabled={quantity <= 1}
                data-testid="quantity-decrease"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="quantity"
                type="number"
                min="1"
                max={totalStock}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-center"
                data-testid="quantity-input"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => adjustQuantity(1)}
                disabled={quantity >= totalStock}
                data-testid="quantity-increase"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {selectedProductId && selectedProduct?.unit && (
              <p className="text-sm text-muted-foreground">
                Einheit: {selectedProduct.unit}
              </p>
            )}
          </div>

          {/* Warnung bei zu wenig Bestand */}
          {selectedProductId && quantity > totalStock && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Nicht genügend Bestand verfügbar. Maximum: {totalStock} Stück.
              </AlertDescription>
            </Alert>
          )}

          {/* FIFO-Info */}
          {selectedProductId && batchStock > 0 && (
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription>
                🔄 FIFO-System aktiv: Älteste Chargen werden automatisch ausgewählt.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            data-testid="cancel-button"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedProductId || quantity <= 0 || quantity > totalStock || isSubmitting}
            data-testid="add-button"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Hinzufügen...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Hinzufügen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}