import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clipboard, CopyPlus, Boxes, LineChart, CheckCircle2, Clock, Package2 } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Export type for OrderMode
export type OrderMode = 'new' | 'copy' | 'forecast' | 'bulk';

interface OrderModeSelectorProps {
  mode: OrderMode;
  onSelectMode: (mode: OrderMode) => void;
  sourceOrderId?: number | null;
  onSourceOrderChange?: (id: number) => void;
}

const OrderModeSelector: React.FC<OrderModeSelectorProps> = ({
  mode,
  onSelectMode,
  sourceOrderId,
  onSourceOrderChange
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bestellmodus wählen</CardTitle>
        <CardDescription>
          Wählen Sie, wie Sie die Bestellung erstellen möchten.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Neue Bestellung */}
          <Card className={`cursor-pointer border-2 ${mode === 'new' ? 'border-primary' : 'border-border'}`}>
            <CardContent className="pt-6" onClick={() => onSelectMode('new')}>
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clipboard className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-center font-medium text-lg mb-2">Neue Bestellung</h3>
              <p className="text-center text-sm text-muted-foreground">
                Erstellen Sie eine neue Bestellung von Grund auf.
              </p>
              
              {mode === 'new' && (
                <div className="mt-4 flex justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Bestellung kopieren */}
          <Card className={`cursor-pointer border-2 ${mode === 'copy' ? 'border-primary' : 'border-border'}`}>
            <CardContent className="pt-6" onClick={() => onSelectMode('copy')}>
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <CopyPlus className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-center font-medium text-lg mb-2">Bestellung kopieren</h3>
              <p className="text-center text-sm text-muted-foreground">
                Kopieren Sie eine bestehende Bestellung als Vorlage.
              </p>
              
              {mode === 'copy' && (
                <div className="mt-4 flex justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Bestellung auf Basis von Prognose */}
          <Card className={`cursor-pointer border-2 ${mode === 'forecast' ? 'border-primary' : 'border-border'}`}>
            <CardContent className="pt-6" onClick={() => onSelectMode('forecast')}>
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <LineChart className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-center font-medium text-lg mb-2">Auf Basis von Prognose</h3>
              <p className="text-center text-sm text-muted-foreground">
                Erstellen Sie eine Bestellung auf Basis von Verbrauchsprognosen.
              </p>
              
              {mode === 'forecast' && (
                <div className="mt-4 flex justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Großbestellung für alle Lager */}
          <Card className={`cursor-pointer border-2 ${mode === 'bulk' ? 'border-primary' : 'border-border'}`}>
            <CardContent className="pt-6" onClick={() => onSelectMode('bulk')}>
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Boxes className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-center font-medium text-lg mb-2">Großbestellung</h3>
              <p className="text-center text-sm text-muted-foreground">
                Bestellung für alle Lager mit Bestandsübersicht und Prognosen.
              </p>
              
              {mode === 'bulk' && (
                <div className="mt-4 flex justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Bestellvorlagen */}
        {mode === 'copy' && (
          <div className="mt-6">
            <h3 className="font-medium text-lg mb-4">Bestellung als Vorlage auswählen</h3>
            <TemplateSelector 
              selectedOrderId={sourceOrderId}
              onSelectOrder={onSourceOrderChange}
            />
          </div>
        )}
        
        {/* Prognosemodelle */}
        {mode === 'forecast' && (
          <div className="mt-6">
            <h3 className="font-medium text-lg mb-4">Prognosemodell auswählen</h3>
            <ForecastModelSelector />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Template Selector Component
const TemplateSelector: React.FC<{
  selectedOrderId?: number | null;
  onSelectOrder?: (id: number) => void;
}> = ({ selectedOrderId, onSelectOrder }) => {
  const { data: recentOrders, isLoading } = useQuery({
    queryKey: ['/api/orders', { limit: 10, status: 'delivered' }],
    queryFn: async () => {
      const response = await fetch('/api/orders?limit=10&status=delivered');
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center space-x-3 p-3 border rounded-md">
            <Skeleton className="h-4 w-4" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!recentOrders || recentOrders.length === 0) {
    return (
      <div className="bg-muted p-4 rounded-md text-center">
        <Package2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-muted-foreground">Keine vorherigen Bestellungen gefunden</p>
        <p className="text-sm text-muted-foreground mt-1">
          Erstellen Sie zuerst eine Bestellung, um sie später als Vorlage zu verwenden.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recentOrders.map((order: any) => (
        <Card 
          key={order.id} 
          className={`cursor-pointer border-2 transition-colors ${
            selectedOrderId === order.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
          onClick={() => onSelectOrder?.(order.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium">{order.orderNumber}</h4>
                    <Badge variant="secondary">{order.supplierName}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(order.orderDate).toLocaleDateString('de-DE')} • 
                    {order.totalAmount ? ` €${order.totalAmount.toFixed(2)}` : ' Kein Preis'}
                  </p>
                  {order.locationName && (
                    <p className="text-xs text-muted-foreground">{order.locationName}</p>
                  )}
                </div>
              </div>
              {selectedOrderId === order.id && (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Forecast Model Selector Component
const ForecastModelSelector: React.FC = () => {
  const { data: forecastModels, isLoading } = useQuery({
    queryKey: ['/api/forecast/models'],
    queryFn: async () => {
      const response = await fetch('/api/forecast/models');
      if (!response.ok) throw new Error('Failed to fetch forecast models');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!forecastModels || forecastModels.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-muted p-4 rounded-md text-center">
          <LineChart className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Keine Prognosemodelle verfügbar</p>
          <p className="text-sm text-muted-foreground mt-1">
            Prognosemodelle werden automatisch basierend auf Ihren Verkaufsdaten erstellt.
          </p>
        </div>
        
        {/* Default forecast options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="cursor-pointer border-2 border-border hover:border-primary/50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">7-Tage Prognose</h4>
                  <p className="text-sm text-muted-foreground">
                    Basierend auf Verkaufstrends der letzten 4 Wochen
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer border-2 border-border hover:border-primary/50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <LineChart className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">14-Tage Prognose</h4>
                  <p className="text-sm text-muted-foreground">
                    Erweiterte Prognose mit Saisonalität
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {forecastModels.map((model: any) => (
        <Card key={model.id} className="cursor-pointer border-2 border-border hover:border-primary/50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <LineChart className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium">{model.name}</h4>
                <p className="text-sm text-muted-foreground">{model.description}</p>
                <div className="flex items-center space-x-2 mt-2">
                  <Badge variant="outline">{model.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Genauigkeit: {model.accuracy ? `${Math.round(model.accuracy * 100)}%` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default OrderModeSelector;