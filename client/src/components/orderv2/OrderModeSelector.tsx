import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  PlusCircle, 
  Copy, 
  LineChart, 
  ShoppingCart, 
  ArrowDownUp, 
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type OrderMode = 'new' | 'copy' | 'forecast';

type OrderModeSelectorProps = {
  mode: OrderMode;
  onSelectMode: (mode: OrderMode) => void;
  sourceOrderId?: number | null;
  onSourceOrderChange?: (id: number) => void;
};

const OrderModeSelector: React.FC<OrderModeSelectorProps> = ({
  mode,
  onSelectMode,
  sourceOrderId,
  onSourceOrderChange
}) => {
  // Fetch recent orders for copy option
  const { data: recentOrders, isLoading } = useQuery<any[]>({
    queryKey: ['/api/orders/recent'],
    enabled: mode === 'copy',
  });
  
  return (
    <div className="space-y-8">
      <RadioGroup
        value={mode}
        onValueChange={(value) => onSelectMode(value as OrderMode)}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div>
          <RadioGroupItem value="new" id="new" className="peer sr-only" />
          <Label
            htmlFor="new"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            <PlusCircle className="mb-3 h-6 w-6" />
            <div className="space-y-1 text-center">
              <h3 className="font-medium">Neue Bestellung</h3>
              <p className="text-sm text-muted-foreground">
                Eine komplett neue Bestellung erstellen
              </p>
            </div>
          </Label>
        </div>
        
        <div>
          <RadioGroupItem value="copy" id="copy" className="peer sr-only" />
          <Label
            htmlFor="copy"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            <Copy className="mb-3 h-6 w-6" />
            <div className="space-y-1 text-center">
              <h3 className="font-medium">Bestellung kopieren</h3>
              <p className="text-sm text-muted-foreground">
                Bestehende Bestellung als Vorlage nutzen
              </p>
            </div>
          </Label>
        </div>
        
        <div>
          <RadioGroupItem value="forecast" id="forecast" className="peer sr-only" />
          <Label
            htmlFor="forecast"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            <LineChart className="mb-3 h-6 w-6" />
            <div className="space-y-1 text-center">
              <h3 className="font-medium">Bedarfsprognose</h3>
              <p className="text-sm text-muted-foreground">
                Mit Hilfe von Prognosen bestellen
              </p>
            </div>
          </Label>
        </div>
      </RadioGroup>
      
      {mode === 'copy' && (
        <Card>
          <CardHeader>
            <CardTitle>Quell-Bestellung auswählen</CardTitle>
            <CardDescription>
              Wählen Sie eine bestehende Bestellung als Vorlage
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span>Bestellungen werden geladen...</span>
              </div>
            ) : !recentOrders || recentOrders.length === 0 ? (
              <Alert>
                <ArrowDownUp className="h-4 w-4" />
                <AlertTitle>Keine Bestellungen gefunden</AlertTitle>
                <AlertDescription>
                  Es wurden keine bestehenden Bestellungen gefunden, die als Vorlage verwendet werden können.
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={sourceOrderId?.toString() || ""}
                onValueChange={(value) => onSourceOrderChange && onSourceOrderChange(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bestellung auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {recentOrders.map((order) => (
                    <SelectItem key={order.id} value={order.id.toString()}>
                      {order.orderNumber} - {order.supplierName} ({new Date(order.createdAt).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}
      
      {mode === 'forecast' && (
        <Card>
          <CardHeader>
            <CardTitle>Bedarfsprognose-Bestellung</CardTitle>
            <CardDescription>
              Automatische Vorschläge basierend auf Verbrauch und Prognosen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="bg-primary/10 p-2 rounded-full">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="text-sm font-medium">Intelligente Mengenvorschläge</h4>
                <p className="text-sm text-muted-foreground">
                  Das System analysiert historische Daten und aktuelle Bestände, um optimale Bestellmengen vorzuschlagen.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="bg-primary/10 p-2 rounded-full">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="text-sm font-medium">Anpassbare Vorschläge</h4>
                <p className="text-sm text-muted-foreground">
                  Sie können alle vorgeschlagenen Mengen nach Bedarf anpassen oder übernehmen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OrderModeSelector;