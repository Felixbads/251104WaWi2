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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, MoveHorizontal } from "lucide-react";
import { useInventoryCart } from "@/components/inventory/InventoryCartContext";
import InventoryCart from "@/components/inventory/InventoryCart";
import InventoryProductsTable from "@/components/inventory/InventoryProductsTable";
import LoadingSpinner from "../components/LoadingSpinner";

// Definiere Warehouse und InventoryProduct Typen
interface Warehouse {
  id: number;
  name: string;
  location?: string;
  status?: string;
}

interface InventoryProduct {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  warehouseId: number;
  warehouseName?: string;
  status?: string;
}

export default function WarenbewegungNewPage() {
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>("");
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>("");
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

  // Hole alle Lager
  const { data: warehouses, isLoading: warehousesLoading } = useQuery({
    queryKey: ['/api/warehouses'],
    select: (data: Warehouse[]) => data.filter(w => w.status === 'active')
  });

  // Hole Produkte für das ausgewählte Quelllager
  const { data: sourceProducts, isLoading: sourceProductsLoading } = useQuery({
    queryKey: ['/api/warehouse-products', sourceWarehouseId, { includeZeroStock: false }],
    enabled: !!sourceWarehouseId,
    select: (data: any[]) => {
      return data
        .filter(item => item.quantity > 0) // Nur Produkte mit Bestand anzeigen
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

  // Hook für die Übertragung
  const transferMutation = useMutation({
    mutationFn: async (transferData: any) => {
      const response = await fetch('/api/inventory-transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transferData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Fehler bei der Übertragung');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Warenumlagerung erfolgreich erstellt",
        description: "Die Waren wurden erfolgreich umgelagert.",
      });
      
      // Leere den Warenkorb
      clearCart();
      
      // Aktualisiere die Produktliste
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse-products'] });
      
      // Zurücksetzen
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
  
  // Wird aufgerufen, wenn die Übertragung abgeschlossen werden soll
  const handleTransfer = () => {
    if (!sourceWarehouseId || !targetWarehouseId) {
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
    
    // Überprüfe, ob Quell- und Ziellager unterschiedlich sind
    if (sourceWarehouseId === targetWarehouseId) {
      toast({
        title: "Gleiche Lager ausgewählt",
        description: "Quell- und Ziellager müssen unterschiedlich sein.",
        variant: "destructive",
      });
      return;
    }
    
    // Erstelle Transferdaten
    const transferData = {
      sourceWarehouseId: parseInt(sourceWarehouseId),
      targetWarehouseId: parseInt(targetWarehouseId),
      status: "pending",
      notes: "Warenumlagung über Webschnittstelle",
      items: cartItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        reason: "Umlagerung"
      }))
    };
    
    // Führe die Übertragung durch
    transferMutation.mutate(transferData);
  };

  // Quelle oder Ziel geändert -> Ergebnisse zurücksetzen
  useEffect(() => {
    setShowResults(!!sourceWarehouseId);
  }, [sourceWarehouseId]);

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Linke Spalte */}
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
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                {/* Quelllager Auswahl */}
                <div className="w-full md:w-1/2">
                  <Label htmlFor="sourceWarehouse">Quelllager</Label>
                  <Select 
                    value={sourceWarehouseId}
                    onValueChange={value => setSourceWarehouseId(value)}
                  >
                    <SelectTrigger id="sourceWarehouse" className="w-full">
                      <SelectValue placeholder="Wählen Sie ein Quelllager aus" />
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
                            {warehouse.location ? ` (${warehouse.location})` : ''}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Ziellager Auswahl */}
                <div className="w-full md:w-1/2">
                  <Label htmlFor="targetWarehouse">Ziellager</Label>
                  <Select 
                    value={targetWarehouseId}
                    onValueChange={value => setTargetWarehouseId(value)}
                  >
                    <SelectTrigger id="targetWarehouse" className="w-full">
                      <SelectValue placeholder="Wählen Sie ein Ziellager aus" />
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
                            {warehouse.location ? ` (${warehouse.location})` : ''}
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
                    // Konvertiere das InventoryProduct zu einem CartItem
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
        
        {/* Rechte Spalte - Warenkorb */}
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
    </div>
  );
}