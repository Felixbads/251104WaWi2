import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Copy, LineChart, Search, Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderMode = 'new' | 'copy' | 'forecast';

type OrderModeSelectorProps = {
  selectedMode: OrderMode;
  onSelectMode: (mode: OrderMode) => void;
  onSourceOrderSelect: (orderId: number | null) => void;
};

interface Order {
  id: number;
  orderNumber: string;
  supplierName: string;
  locationName: string;
  status: string;
  orderDate: string;
  totalAmount: number;
}

const OrderModeSelector: React.FC<OrderModeSelectorProps> = ({
  selectedMode,
  onSelectMode,
  onSourceOrderSelect
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  
  // Fetch previous orders for 'copy' mode
  const { data: previousOrders, isLoading: isLoadingOrders, error: ordersError } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
    enabled: selectedMode === 'copy', // Only fetch when in copy mode
  });
  
  // Filter orders based on search query
  const filteredOrders = previousOrders?.filter(order => 
    order.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.supplierName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.locationName?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Handler for mode selection
  const handleModeSelect = (mode: OrderMode) => {
    onSelectMode(mode);
    
    // If switching away from copy mode, clear selected order
    if (mode !== 'copy') {
      setSelectedOrderId(null);
      onSourceOrderSelect(null);
    }
  };
  
  // Handler for order selection in copy mode
  const handleOrderSelect = (orderId: number) => {
    setSelectedOrderId(orderId);
    onSourceOrderSelect(orderId);
  };
  
  // Format date string
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  };
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };
  
  // Mode descriptions
  const modeDescriptions = {
    new: "Erstellen Sie eine komplett neue Bestellung manuell. Sie wählen alle Produkte und Mengen selbst aus.",
    copy: "Verwenden Sie eine bestehende Bestellung als Vorlage. Alle Produkte und Mengen werden übernommen und können angepasst werden.",
    forecast: "Erstellen Sie eine bedarfsgerechte Bestellung basierend auf aktuellen Lagerbeständen und Verkaufsprognosen."
  };
  
  return (
    <div className="space-y-6">
      <RadioGroup 
        value={selectedMode} 
        onValueChange={value => handleModeSelect(value as OrderMode)}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {/* New Order Mode */}
        <div className="relative">
          <RadioGroupItem 
            value="new" 
            id="new" 
            className="peer sr-only" 
          />
          <Label 
            htmlFor="new" 
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
          >
            <ShoppingCart className="mb-3 h-6 w-6 text-primary" />
            <span className="font-medium">Neue Bestellung</span>
          </Label>
        </div>
        
        {/* Copy Order Mode */}
        <div className="relative">
          <RadioGroupItem 
            value="copy" 
            id="copy" 
            className="peer sr-only" 
          />
          <Label 
            htmlFor="copy" 
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
          >
            <Copy className="mb-3 h-6 w-6 text-primary" />
            <span className="font-medium">Bestellung kopieren</span>
          </Label>
        </div>
        
        {/* Forecast-based Order Mode */}
        <div className="relative">
          <RadioGroupItem 
            value="forecast" 
            id="forecast" 
            className="peer sr-only" 
          />
          <Label 
            htmlFor="forecast" 
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
          >
            <LineChart className="mb-3 h-6 w-6 text-primary" />
            <span className="font-medium">Prognosebasiert</span>
          </Label>
        </div>
      </RadioGroup>
      
      {/* Mode Description */}
      <div className="p-4 bg-muted rounded-lg border">
        <p>{modeDescriptions[selectedMode]}</p>
      </div>
      
      {/* Order Selection for Copy Mode */}
      {selectedMode === 'copy' && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium text-lg mb-4">Bestellung als Vorlage auswählen</h3>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Bestellungen durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {isLoadingOrders ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2">Bestellungen werden geladen...</span>
              </div>
            ) : ordersError ? (
              <div className="text-center text-destructive py-8">
                Fehler beim Laden der Bestellungen. Bitte versuchen Sie es später erneut.
              </div>
            ) : filteredOrders?.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Keine Bestellungen gefunden. Bitte versuchen Sie eine andere Suche.
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bestell-Nr.</TableHead>
                      <TableHead>Lieferant</TableHead>
                      <TableHead>Lager</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders?.map(order => (
                      <TableRow 
                        key={order.id}
                        className={selectedOrderId === order.id ? 'bg-primary/10' : ''}
                      >
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>{order.supplierName}</TableCell>
                        <TableCell>{order.locationName}</TableCell>
                        <TableCell>{formatDate(order.orderDate)}</TableCell>
                        <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              order.status === 'completed' ? 'default' : 
                              order.status === 'open' ? 'outline' : 
                              order.status === 'cancelled' ? 'destructive' : 
                              'secondary'
                            }
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`cursor-pointer ${selectedOrderId === order.id ? 'bg-primary text-primary-foreground' : ''}`}
                            onClick={() => handleOrderSelect(order.id)}
                          >
                            {selectedOrderId === order.id ? 'Ausgewählt' : 'Auswählen'}
                            <ChevronRight className="ml-1 h-3 w-3" />
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Forecast Mode Info */}
      {selectedMode === 'forecast' && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium text-lg mb-4">Prognosebasierte Bestellung</h3>
            
            <p className="text-muted-foreground mb-2">
              Bei dieser Bestellmethode werden folgende Faktoren berücksichtigt:
            </p>
            
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>Aktueller Lagerbestand jedes Produkts</li>
              <li>Definierte Mindestbestandsmengen</li>
              <li>Historische Verkaufsdaten</li>
              <li>Prognostizierter Verbrauch für die kommenden Tage</li>
              <li>Saisonale Faktoren und Trends</li>
            </ul>
            
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800">
              <p className="text-sm">
                Die berechneten Bestellmengen werden im nächsten Schritt angezeigt und können bei Bedarf manuell angepasst werden.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OrderModeSelector;