import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  RefreshCw, Package, AlertTriangle, Calendar, Thermometer, 
  CircleAlert, CircleX, Loader2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

interface CriticalItem {
  id: number;
  productId: number;
  productName: string;
  warehouseId: number;
  warehouseName: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  nextExpiryDate?: string;
  criticality: 'low-stock' | 'expiring' | 'both';
}

export default function CriticalInventoryItems() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Lade kritische Lagerposten
  const { data: criticalItems = [], isLoading, error } = useQuery({
    queryKey: ['/api/inventory/critical-items'],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/inventory/critical-items'] });
    toast({
      title: "Aktualisierung",
      description: "Die Liste der kritischen Produkte wird aktualisiert."
    });
  };

  // Filtere die Daten basierend auf dem aktiven Tab
  const filteredItems = (criticalItems as CriticalItem[]).filter((item: CriticalItem) => {
    if (activeTab === "all") return true;
    if (activeTab === "low-stock" && ["low-stock", "both"].includes(item.criticality)) return true;
    if (activeTab === "expiring" && ["expiring", "both"].includes(item.criticality)) return true;
    return false;
  });

  const getStockPercentage = (current: number, min: number, max: number) => {
    if (max === 0) return 0;
    return Math.min(100, Math.max(0, (current / max) * 100));
  };

  const getDaysUntilExpiry = (expiryDate?: string) => {
    if (!expiryDate) return null;
    
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Kritische Produkte
            </CardTitle>
            <CardDescription>
              Produkte mit niedrigem Bestand oder nahem Ablaufdatum
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="all">Alle</TabsTrigger>
          <TabsTrigger value="low-stock" className="flex items-center gap-2">
            <Thermometer className="h-4 w-4" />
            <span>Zu niedriger Bestand</span>
          </TabsTrigger>
          <TabsTrigger value="expiring" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Ablaufend</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <CircleAlert className="h-10 w-10 text-red-500 mb-2" />
            <h3 className="text-lg font-medium mb-1">Fehler beim Laden der Daten</h3>
            <p className="text-muted-foreground mb-4">
              Es ist ein Problem beim Abrufen der kritischen Produkte aufgetreten.
            </p>
            <Button onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Erneut versuchen
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <Package className="h-10 w-10 text-muted-foreground mb-2" />
            <h3 className="text-lg font-medium mb-1">Keine kritischen Produkte</h3>
            <p className="text-muted-foreground">
              Aktuell gibt es keine kritischen Produkte im Lagerbestand.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item: CriticalItem) => {
              const stockPercentage = getStockPercentage(item.quantity, item.minQuantity, item.maxQuantity);
              const daysUntilExpiry = getDaysUntilExpiry(item.nextExpiryDate);
              const isExpiring = daysUntilExpiry !== null && daysUntilExpiry < 14;
              const isLowStock = item.quantity < item.minQuantity;
              
              return (
                <div key={item.id} className="border rounded-md p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-sm">{item.productName}</h4>
                      <p className="text-xs text-muted-foreground">
                        Lager: {item.warehouseName}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isLowStock && (
                        <Badge variant="outline" className="text-amber-500 border-amber-200 bg-amber-50">
                          <Thermometer className="h-3 w-3 mr-1" />
                          Niedriger Bestand
                        </Badge>
                      )}
                      
                      {isExpiring && (
                        <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50">
                          <Calendar className="h-3 w-3 mr-1" />
                          {daysUntilExpiry <= 0 ? 'Abgelaufen' : `Läuft in ${daysUntilExpiry} Tagen ab`}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex-1 mr-4">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{item.quantity}</span>
                        <span className="text-muted-foreground">{item.minQuantity}/{item.maxQuantity}</span>
                      </div>
                      <Progress value={stockPercentage} className="h-1.5" />
                    </div>
                    
                    {item.nextExpiryDate && (
                      <div className="text-xs">
                        <span className={isExpiring ? 'text-red-500 font-medium' : ''}>
                          MHD: {new Date(item.nextExpiryDate).toLocaleDateString('de-DE')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-center pt-0">
        {filteredItems.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filteredItems.length} kritische Produkte gefunden
          </p>
        )}
      </CardFooter>
    </Card>
  );
}