import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { CartItem } from "./InventoryCartContext";
import { ScrollArea } from "@/components/ui/scroll-area";

interface InventoryCartProps {
  cartItems: CartItem[];
  onRemove: (id: number) => void;
  onUpdateQuantity: (id: number, quantity: number) => void;
  onClearCart: () => void;
  footer?: React.ReactNode;
}

export default function InventoryCart({
  cartItems,
  onRemove,
  onUpdateQuantity,
  onClearCart,
  footer
}: InventoryCartProps) {
  // Handler für die Aktualisierung der Menge mit Validierung
  const handleQuantityChange = (id: number, value: string) => {
    const quantity = parseInt(value);
    if (!isNaN(quantity) && quantity > 0) {
      onUpdateQuantity(id, quantity);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {cartItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Der Warenkorb ist leer. Fügen Sie Produkte hinzu, um fortzufahren.
        </div>
      ) : (
        <>
          <div className="flex justify-between mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onClearCart}
            >
              Warenkorb leeren
            </Button>
          </div>
          
          <ScrollArea className="pr-4 max-h-[400px]">
            <div className="space-y-4">
              {cartItems.map(item => (
                <div 
                  key={item.id} 
                  className="border rounded-md p-3 relative"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium pr-8">{item.productName}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={() => onRemove(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center mt-2">
                    <div className="w-24">
                      <Input
                        type="number"
                        min={1}
                        max={item.maxQuantity}
                        value={item.quantity}
                        onChange={e => handleQuantityChange(item.id, e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="text-sm text-muted-foreground ml-2">
                      von max. {item.maxQuantity} verfügbar
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
      
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}