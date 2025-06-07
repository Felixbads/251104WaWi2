import { useState, useEffect } from "react";
import { ArrowDown, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface TopRemovedProduct {
  productName: string;
  totalRemoved: string;
  removalsCount: string;
  lastRemoved: string;
}

export default function TopRemovedProductsTileStandalone() {
  const [topRemovedProducts, setTopRemovedProducts] = useState<TopRemovedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Nicht authentifiziert');
          setIsLoading(false);
          return;
        }

        const response = await fetch('/api/removed-products/top?days=7', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setTopRemovedProducts(data);
        setError(null);
      } catch (err) {
        console.error('Fehler beim Laden der entfernten Produkte:', err);
        setError('Fehler beim Laden der Daten');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowDown className="h-5 w-5 text-red-500" />
            Häufigste Entnahmen
          </CardTitle>
          <CardDescription>Letzte 7 Tage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Daten nicht verfügbar</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowDown className="h-5 w-5 text-red-500" />
            Häufigste Entnahmen
          </CardTitle>
          <CardDescription>Letzte 7 Tage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalRemovedAll = topRemovedProducts.reduce((sum, product) => sum + parseInt(product.totalRemoved), 0);
  const topProducts = topRemovedProducts.slice(0, 5);

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowDown className="h-5 w-5 text-red-500" />
          Häufigste Entnahmen
        </CardTitle>
        <CardDescription>Letzte 7 Tage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold text-red-600">
          {totalRemovedAll} Entnahmen
        </div>
        
        {topProducts.length > 0 ? (
          <div className="space-y-2">
            {topProducts.map((product, index) => (
              <div key={index} className="flex items-start justify-between py-1 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      #{index + 1}
                    </Badge>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {product.productName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{product.totalRemoved} entfernt</span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(product.lastRemoved), { 
                          addSuffix: true, 
                          locale: de 
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            <p className="text-sm">Keine Entnahmen in den letzten 7 Tagen</p>
          </div>
        )}

        {topRemovedProducts.length > 5 && (
          <div className="text-xs text-gray-500 pt-2 border-t">
            +{topRemovedProducts.length - 5} weitere Produkte
          </div>
        )}
      </CardContent>
    </Card>
  );
}