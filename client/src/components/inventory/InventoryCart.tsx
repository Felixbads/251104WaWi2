import React from 'react';
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  AlertTriangle 
} from 'lucide-react';
import { useInventoryCart, CartItem } from './InventoryCartContext';

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface InventoryCartProps {
  title?: string;
  description?: string;
  onSubmit?: () => void;
  submitLabel?: string;
  isLoading?: boolean;
  maxStock?: Record<string, number>; // Optional mapping of productId to max available stock
}

export default function InventoryCart({ 
  title = "Warenkorb",
  description = "Ihre ausgewählten Produkte", 
  onSubmit,
  submitLabel = "Übernehmen",
  isLoading = false,
  maxStock
}: InventoryCartProps) {
  const { items, updateItem, removeItem, clearCart } = useInventoryCart();

  // Check if any item exceeds its max stock
  const hasStockErrors = maxStock && items.some(
    item => maxStock[item.productId] !== undefined && item.quantity > maxStock[item.productId]
  );

  const handleQuantityChange = (productId: string, quantity: number) => {
    // Ensure quantity is at least 1
    updateItem(productId, Math.max(1, quantity));
  };

  if (items.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mb-3 opacity-20" />
            <p>Keine Produkte im Warenkorb</p>
            <p className="text-sm mt-1">Wählen Sie Produkte aus der Tabelle aus</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {title}
            <Badge variant="outline" className="ml-2">
              {items.length} {items.length === 1 ? 'Produkt' : 'Produkte'}
            </Badge>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearCart}
            className="h-8 px-2 text-muted-foreground"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Leeren
          </Button>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasStockErrors && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-700 dark:text-amber-400 text-sm flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Lagerbestand nicht ausreichend</p>
              <p className="text-xs mt-1">Einige Produkte übersteigen den verfügbaren Lagerbestand.</p>
            </div>
          </div>
        )}
        
        <ul className="space-y-3">
          {items.map((item) => {
            const stockExceeded = maxStock && 
              maxStock[item.productId] !== undefined && 
              item.quantity > maxStock[item.productId];
              
            return (
              <li key={item.productId} className={cn(
                "flex flex-wrap md:flex-nowrap items-center gap-3 p-3 border rounded-md",
                stockExceeded ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" : "border-gray-200 dark:border-gray-800"
              )}>
                <div className="flex-grow min-w-[180px]">
                  <h4 className="font-medium">{item.productName}</h4>
                  {item.sku && (
                    <span className="text-xs text-muted-foreground">
                      SKU: {item.sku}
                    </span>
                  )}
                  {stockExceeded && maxStock && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                      Verfügbar: {maxStock[item.productId]} Stück
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value) || 1)}
                    className="w-16 h-8 text-center"
                    min="1"
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.productId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter>
        <div className="w-full flex justify-end">
          <Button 
            type="button" 
            disabled={items.length === 0 || isLoading || hasStockErrors}
            onClick={onSubmit}
          >
            {isLoading ? "Wird verarbeitet..." : submitLabel}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}